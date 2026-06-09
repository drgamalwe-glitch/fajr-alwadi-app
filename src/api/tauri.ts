import { invoke } from "@tauri-apps/api/core";
import type { Car, CarFormState, CashRegisterEntry, ExpenseEntry, CarExpenseRecord, Partner, PartnerTransaction, CarPartner } from "../types";

const isTauri = () =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || import.meta.env.TAURI_ENV_PLATFORM != null);

function generateMockTxId(): number {
  return parseInt(crypto.randomUUID().replace(/-/g, "").slice(0, 12), 16);
}

function mockStorageKey(command: string): string {
  if (command.includes("car")) return "mock_cars";
  if (command.includes("partner")) return "mock_partners";
  if (command.includes("expense")) return "mock_expenses";
  return "mock_default";
}

function parseCommissionAmount(amount: number, notes: string | null | undefined): number {
  if (!notes) return 0;
  const parts = notes.split("عمولة:");
  if (parts.length > 1) {
    if (parts[1].includes("%")) {
      const percentPart = parts[1].split("%")[0];
      const pct = parseFloat(percentPart.trim());
      if (!isNaN(pct)) return (amount * pct) / 100;
    } else {
      const commissionVal = parseFloat(parts[1].trim());
      if (!isNaN(commissionVal)) return commissionVal;
    }
  }
  return 0;
}

function mapMockCar(args: Record<string, unknown>): Car {
  const status = (args.status as Car["status"]) ?? "متوفرة";
  const paymentType = (args.payment_type ?? args.paymentType) as Car["payment_type"] | undefined;
  const plateNum = String(args.num ?? "").trim();
  const province = String(args.province ?? "").trim();
  // المفتاح الأساسي = رقم اللوحة + المحافظة
  const carNumber = province ? `${plateNum} ${province}` : plateNum;
  return {
    car_number: carNumber,
    car_plate_num: plateNum,
    car_province: province,
    chassis_number: String(args.chassis ?? "") || null,
    car_model: String(args.model ?? ""),
    car_year: String(args.year ?? ""),
    car_name: String(args.name ?? ""),
    color: String(args.color ?? ""),
    details: String(args.details ?? ""),
    purchase_price: Number(args.purchase) || 0,
    selling_price: Number(args.selling) || 0,
    status,
    payment_type: status === "مبيوعة" ? paymentType ?? "كاش" : undefined,
    cash_price: status === "مبيوعة" && (paymentType === "كاش" || paymentType === "موعد") ? Number(args.cash_price ?? args.cashPrice ?? args.amountPaid ?? args.amount_paid) || 0 : 0,
    amount_paid: status === "مبيوعة" ? Number(args.amount_paid ?? args.amountPaid) || 0 : 0,
    amount_remaining: Number(args.amount_remaining ?? args.amountRemaining) || 0,
    installment_months: Number(args.installment_months ?? args.installmentMonths) || 0,
    monthly_payment: Number(args.monthly_payment ?? args.monthlyPayment) || 0,
    buyer_name: String(args.buyer_name ?? args.buyerName ?? "") || null,
    buyer_phone: String(args.buyer_phone ?? args.buyerPhone ?? args.phone ?? "") || null,
    purchase_date: String(args.purchase_date ?? args.purchaseDate ?? "") || null,
    sale_date: String(args.sale_date ?? args.saleDate ?? "") || null,
    delivery_date: String(args.delivery_date ?? args.deliveryDate ?? "") || null,
    first_payment_date: String(args.first_payment_date ?? args.firstPaymentDate ?? "") || null,
    currency: (args.currency as Car["currency"]) || null,
    sale_currency: ((args.sale_currency ?? args.saleCurrency) as Car["sale_currency"]) || null,
    purchase_payment_type: ((args.purchase_payment_type ?? args.purchasePaymentType) as string) || null,
    purchase_type: ((args.purchase_type ?? args.purchaseType) as string) === "دين" ? "تمويل" : (((args.purchase_type ?? args.purchaseType) as string) || "كاش"),
    financer_name: ((args.financer_name ?? args.financerName) as string) || null,
    commission_type: ((args.commission_type ?? args.commissionType) as string) || null,
    commission_value: Number(args.commission_value ?? args.commissionValue) || 0,
    car_partners: (args.car_partners ?? args.carPartners ?? null) as CarPartner[] | null,
    purchase_time: ((args.purchase_time ?? args.purchaseTime) as string) || null,
    sale_time: ((args.sale_time ?? args.saleTime) as string) || null,
  };
}

function recalculateMockPartnerTotal(partnerName: string, kind: string) {
  const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
  const txns = allTx.filter((tx) => tx.partner_name === partnerName && tx.kind === kind);
  const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
  const pIdx = partners.findIndex((p) => p.partner_name === partnerName && p.kind === kind);
  if (pIdx < 0) return;

  partners[pIdx].total_amount = txns.reduce((total, tx) => {
    if (kind === "مطلوب") {
      if (tx.notes?.includes("دفعة أولى") || tx.notes?.includes("قسط") || tx.notes?.includes("مؤجل")) {
        return total;
      }
      // سحب / سحب مصروف / سحب ارباح → يضيف للرصيد (أعطيناهم)
      if (tx.type_.startsWith("سحب")) return total + tx.amount;
      // ايداع / ايداع ارباح → يطرح من الرصيد (أخذنا منهم)
      if (tx.type_.startsWith("ايداع")) return total - tx.amount;
    } else {
      if (tx.type_.startsWith("ايداع")) return total + tx.amount;
      if (tx.type_.startsWith("سحب")) return total - tx.amount;
    }
    return total;
  }, 0);
  localStorage.setItem("mock_partners", JSON.stringify(partners));
}

async function mockInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const key = mockStorageKey(command);

  if (command === "get_cars") {
    const raw = localStorage.getItem(key);
    const cars: Car[] = raw ? JSON.parse(raw) : [];
    const allExpenses: CarExpenseRecord[] = JSON.parse(localStorage.getItem("mock_car_expenses") ?? "[]");
    // تراجع: السيارات القديمة بدون حقول العملة → افتراضي IQD
    for (const car of cars) {
      if (car.currency !== "USD" && car.currency !== "IQD") {
        car.currency = "IQD";
      }
      if (!car.sale_currency || (car.sale_currency !== "USD" && car.sale_currency !== "IQD")) {
        car.sale_currency = "IQD";
      }
      const carExpenses = allExpenses.filter((e) => e.car_number === car.car_number);
      car.expenses_sum = carExpenses.reduce((sum, e) => sum + e.amount, 0);
    }
    return cars as unknown as T;
  }

  if (command === "add_car") {
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const plateNum = String(args.num ?? "").trim();
    const province = String(args.province ?? "").trim();
    const carNumber = province ? `${plateNum} ${province}` : plateNum;
    const oldCar = existing.find((c) => c.car_number === carNumber);

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hh}:${mm}`;

    const purchase_time = args.purchase_time ?? args.purchaseTime ?? oldCar?.purchase_time ?? (args.purchase_date || args.purchaseDate ? currentTime : null);
    const sale_time = args.sale_time ?? args.saleTime ?? oldCar?.sale_time ?? (args.sale_date || args.saleDate ? currentTime : null);

    const item = {
      ...mapMockCar(args),
      purchase_time: purchase_time ? String(purchase_time) : null,
      sale_time: sale_time ? String(sale_time) : null,
    };
    const next = existing.filter((c) => c.car_number !== item.car_number);
    next.push(item);
    localStorage.setItem(key, JSON.stringify(next));
    return undefined as T;
  }

  if (command === "delete_car") {
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const target = String(args.num ?? "").trim();
    const next = existing.filter((c) => c.car_number.trim() !== target);
    localStorage.setItem(key, JSON.stringify(next));
    return undefined as T;
  }

  if (command === "get_partners") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const existingIdx = existing.findIndex((p) => p.partner_name === name && p.kind === kind);
    if (existingIdx >= 0) {
      existing[existingIdx] = { ...existing[existingIdx], phone: String(args.phone ?? "").trim(), kind };
    } else {
      existing.push({
        partner_name: name,
        phone: String(args.phone ?? "").trim(),
        total_amount: 0,
        total_withdrawals: 0,
        kind,
      });
    }
    localStorage.setItem(key, JSON.stringify(existing));
    return undefined as T;
  }

  if (command === "update_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const oldName = String(args.oldName ?? "").trim();
    const oldKind = String(args.oldKind ?? "شريك").trim();
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const idx = existing.findIndex((p) => p.partner_name === oldName && p.kind === oldKind);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], partner_name: name, phone: String(args.phone ?? "").trim(), kind };
      localStorage.setItem(key, JSON.stringify(existing));
      if (oldName !== name || oldKind !== kind) {
        const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
        localStorage.setItem(
          "mock_partner_transactions",
          JSON.stringify(
            allTx.map((tx) =>
              tx.partner_name === oldName && tx.kind === oldKind
                ? { ...tx, partner_name: name, kind }
                : tx,
            ),
          ),
        );
      }
    }
    return undefined as T;
  }

  if (command === "delete_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const next = existing.filter((p) => !(p.partner_name === name && p.kind === kind));
    localStorage.setItem(key, JSON.stringify(next));
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    localStorage.setItem(
      "mock_partner_transactions",
      JSON.stringify(allTx.filter((tx) => !(tx.partner_name === name && tx.kind === kind))),
    );
    return undefined as T;
  }

  if (command === "get_partner_transactions") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    return allTx.filter((tx) => tx.partner_name === partnerName && tx.kind === kind) as T;
  }

  if (command === "add_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const type = String(args.type ?? args.type_ ?? "");
    const notes = args.notes ? String(args.notes) : null;
    const isFinancierRepayment =
      (kind === "ممول" && type.startsWith("سحب")) ||
      (kind === "مطلوب" && type.startsWith("ايداع") && !!notes?.includes("ممول"));
    const paymentType = isFinancierRepayment
      ? "ممول"
      : ((args.payment_type ?? args.paymentType ?? "قاصه") as string);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const newTx: PartnerTransaction & { time?: string } = {
      id: generateMockTxId(),
      partner_name: partnerName,
      kind,
      type_: type,
      amount: Number(args.amount) || 0,
      date: String(args.date ?? ""),
      time: `${hh}:${mm}`,
      notes,
      currency: (args.currency as string) || null,
      paymentType,
      payment_type: paymentType,
    };
    allTx.push(newTx);
    localStorage.setItem("mock_partner_transactions", JSON.stringify(allTx));
    recalculateMockPartnerTotal(partnerName, kind);
    if (isFinancierRepayment && !args.skipAutoFinancierDistribution) {
      const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
      const sharePartners = partners.filter((p) => p.kind === "شريك");
      const commissionAmount = parseCommissionAmount(newTx.amount, newTx.notes);
      if (sharePartners.length > 0) {
        const partnerShare = newTx.amount / sharePartners.length;
        for (const partner of sharePartners) {
          await mockInvoke("add_partner_transaction", {
            partnerName: partner.partner_name,
            kind: "شريك",
            type: "سحب تسديد ممول",
            amount: partnerShare,
            date: newTx.date,
            notes: `حصة الشريك من تسديد الممول ${partnerName}`,
            currency: newTx.currency || "IQD",
            paymentType: "قاصه",
          });
        }
      }

      if (commissionAmount > 0) {
        const commissionShare = commissionAmount / sharePartners.length;
        for (const partner of sharePartners) {
          await mockInvoke("add_partner_transaction", {
            partnerName: partner.partner_name,
            kind: "شريك",
            type: "سحب عمولة",
            amount: commissionShare,
            date: newTx.date,
            notes: `حصة الشريك من عمولة تسديد الممول ${partnerName}`,
            currency: newTx.currency || "IQD",
            paymentType: "قاصه",
          });
        }
      }
    }
    return undefined as T;
  }

  if (command === "pay_financier_from_partners") {
    const financierName = String(args.financier_name ?? args.financierName ?? "").trim();
    const financierKind = String(args.financier_kind ?? args.financierKind ?? "ممول").trim();
    const amount = Number(args.amount) || 0;
    const date = String(args.date ?? "");
    const currency = (args.currency as string) || "IQD";
    const allPartners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const sharePartners = allPartners.filter((p) => p.kind === "شريك");

    const commissionAmount = Number(args.commission_amount ?? args.commissionAmount) || 0;

    await mockInvoke("add_partner_transaction", {
      partnerName: financierName,
      kind: financierKind,
      type: financierKind === "مطلوب" ? "ايداع" : "سحب",
      amount,
      date,
      notes: args.notes ? String(args.notes) : null,
      currency,
      paymentType: "ممول",
      skipAutoFinancierDistribution: true,
    });

    // Distribute the amount equally among partners
    if (sharePartners.length > 0) {
      const partnerShare = amount / sharePartners.length;
      for (const partner of sharePartners) {
        await mockInvoke("add_partner_transaction", {
          partnerName: partner.partner_name,
          kind: "شريك",
          type: "سحب تسديد ممول",
          amount: partnerShare,
          date,
          notes: `حصة الشريك من تسديد الممول ${financierName}`,
          currency,
          paymentType: "قاصه",
        });
      }
    }

    // Distribute commission as partner withdrawal only (no separate expense)
    if (commissionAmount > 0) {
      const commissionCurrency = (args.commission_currency ?? args.commissionCurrency ?? "IQD") as string;
      const commissionShare = commissionAmount / sharePartners.length;
      for (const partner of sharePartners) {
        await mockInvoke("add_partner_transaction", {
          partnerName: partner.partner_name,
          kind: "شريك",
          type: "سحب عمولة",
          amount: commissionShare,
          date,
          notes: `حصة الشريك من عمولة تسديد الممول ${financierName}`,
          currency: commissionCurrency,
          paymentType: "قاصه",
        });
      }
    }

    return undefined as T;
  }

  if (command === "update_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.id);
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const next = allTx.map((tx) =>
      tx.id === id
        ? {
            ...tx,
            type_: String(args.type ?? args.type_ ?? ""),
            amount: Number(args.amount) || 0,
            date: String(args.date ?? ""),
            notes: args.notes ? String(args.notes) : null,
            currency: (args.currency as string) || tx.currency || null,
            paymentType: (args.payment_type ?? args.paymentType ?? tx.paymentType ?? "قاصه") as string,
            payment_type: (args.payment_type ?? args.paymentType ?? tx.payment_type ?? "قاصه") as string,
          }
        : tx,
    );
    localStorage.setItem("mock_partner_transactions", JSON.stringify(next));
    recalculateMockPartnerTotal(partnerName, kind);
    return undefined as T;
  }

  if (command === "delete_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.id);
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    localStorage.setItem(
      "mock_partner_transactions",
      JSON.stringify(allTx.filter((tx) => !(tx.id === id))),
    );
    recalculateMockPartnerTotal(partnerName, kind);
    return undefined as T;
  }

  if (command === "get_cash_register_entries") {
    const filterType = args.payment_type ? String(args.payment_type) : null;
    const isMumuol = filterType === "ممول";
    const allCars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
    const cars = isMumuol ? [] : (filterType
      ? (filterType === "قاصه" || filterType === "قاصة"
        ? allCars.filter((c) => c.purchase_payment_type === "قاصه" || c.purchase_payment_type === "قاصة" || !c.purchase_payment_type)
        : allCars.filter((c) => c.purchase_payment_type === filterType))
      : allCars);
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const entries: CashRegisterEntry[] = [];

    // شراء السيارات
    for (const c of cars) {
      if (c.purchase_date && c.purchase_price > 0) {
        entries.push({
          id: 0,
          date: c.purchase_date,
          time: c.purchase_time || "00:00",
          type_: "شراء سيارة",
          amount: -c.purchase_price,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null,
          balance: 0,
          currency: c.currency || "IQD",
        });
      }
    }

    // بيع السيارات كاش
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "كاش" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: c.sale_time || "00:00", type_: "بيع سيارة",
          amount: c.selling_price,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
          currency: c.sale_currency || "IQD",
        });
      }
    }

    // بيع السيارات آجل
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "موعد" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: c.sale_time || "00:00", type_: "بيع سيارة",
          amount: c.amount_paid ?? 0,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
          currency: c.sale_currency || "IQD",
        });
      }
    }

    // مقدمات السيارات بالتقسيط
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "اقساط" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: c.sale_time || "00:00", type_: "بيع سيارة",
          amount: c.amount_paid ?? 0,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
          currency: c.sale_currency || "IQD",
        });
      }
    }

    const includeOthers = filterType === null || filterType === "قاصه" || filterType === "قاصة" || isMumuol;

    if (includeOthers) {
      // معاملات الشركاء والمستثمرين (بدون ديون العملاء غير المدفوعة)
      for (const tx of allTx) {
        if (isMumuol) {
          if (tx.kind !== "ممول") continue;
        } else {
          if (tx.kind === "مطلوب" && tx.type_.startsWith("سحب")) continue;
          if (tx.type_.startsWith("سحب شراء سيارة") || tx.type_.startsWith("ايداع بيع سيارة") || tx.type_.startsWith("سحب مصروف")) {
            continue;
          }
          if (filterType) {
            const isQasa = filterType === "قاصه" || filterType === "قاصة";
            const txPaymentType = tx.paymentType || tx.payment_type || "قاصه";
            const isTxQasa = txPaymentType === "قاصه" || txPaymentType === "قاصة";
            if (isQasa) {
              if (!isTxQasa) continue;
            } else {
              if (txPaymentType !== filterType) continue;
            }
          }
        }
        let type_: string;
        let amount: number;
        switch (tx.kind) {
          case "شريك":
            type_ = tx.type_.startsWith("ايداع") ? "ايداع شريك" : "سحب شريك";
            amount = tx.type_.startsWith("ايداع") ? tx.amount : -tx.amount;
            break;
          case "مستثمر":
            type_ = tx.type_.startsWith("ايداع") ? "ايداع مستثمر" : "سحب مستثمر";
            amount = tx.type_.startsWith("ايداع") ? tx.amount : -tx.amount;
            break;
          case "مطلوب":
            type_ = "تسديد دين";
            amount = tx.amount;
            break;
          case "ممول":
            if (tx.type_.startsWith("ايداع")) {
              if (isMumuol) {
                type_ = "ايداع ممول";
                amount = tx.amount;
              } else {
                type_ = "";
                amount = 0;
              }
            } else {
              type_ = "سحب ممول";
              if (isMumuol) {
                amount = -tx.amount;
              } else {
                const comm = parseCommissionAmount(tx.amount, tx.notes);
                amount = -(tx.amount + comm);
              }
            }
            break;
          case "مقترض":
            type_ = tx.type_.startsWith("ايداع") ? "ايداع مقترض" : "سحب مقترض";
            amount = tx.type_.startsWith("ايداع") ? tx.amount : -tx.amount;
            break;
          default:
            type_ = `${tx.kind} ${tx.type_}`;
            amount = tx.type_.startsWith("ايداع") ? tx.amount : -tx.amount;
        }
        if (!type_) continue;
        entries.push({
          id: 0, date: tx.date, time: tx.time ?? "00:00", type_, amount,
          description: tx.partner_name,
          notes: tx.notes, balance: 0,
          currency: tx.currency || "IQD",
        });
      }

      // المصروفات
      if (!isMumuol) {
        const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");
        for (const e of expenses) {
          entries.push({
            id: 0, date: e.date, time: e.time, type_: "مصروف",
            amount: -e.amount,
            description: e.description,
            notes: e.notes, balance: 0,
            currency: e.currency || "IQD",
          });
        }
      }
    }

    // ترتيب حسب التاريخ ثم الوقت (من الأقدم للأحدث)
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    let iqdRunning = 0;
    let usdRunning = 0;
    for (const e of entries) {
      const curr = e.currency === "USD" ? "USD" : "IQD";
      if (curr === "USD") {
        usdRunning += e.amount;
        e.balance = usdRunning;
      } else {
        iqdRunning += e.amount;
        e.balance = iqdRunning;
      }
    }

    entries.forEach((e, i) => { e.id = i + 1; });

    return entries as T;
  }

  if (command === "get_expenses") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_expense") {
    const carNumber = args.carNumber ?? args.car_number ?? null;
    if (carNumber) {
      // مصروف سيارة: يُسجل في car_expenses ويُحدّث سحب شراء السيارة
      const carKey = "mock_car_expenses";
      const existing: CarExpenseRecord[] = JSON.parse(localStorage.getItem(carKey) ?? "[]");
      const record: CarExpenseRecord = {
        id: generateMockTxId(),
        car_number: String(carNumber),
        description: String(args.description ?? ""),
        amount: Number(args.amount) || 0,
        date: String(args.date ?? ""),
        currency: (args.currency as string) || null,
      };
      existing.push(record);
      localStorage.setItem(carKey, JSON.stringify(existing));
    } else {
      // مصروف عام
      const existing: ExpenseEntry[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const newExpense: ExpenseEntry = {
        id: generateMockTxId(),
        description: String(args.description ?? ""),
        amount: Number(args.amount) || 0,
        date: String(args.date ?? ""),
        time: `${hh}:${mm}`,
        notes: args.notes ? String(args.notes) : null,
        currency: (args.currency as string) || null,
      };
      existing.push(newExpense);
      localStorage.setItem(key, JSON.stringify(existing));
    }
    return undefined as T;
  }

  if (command === "delete_expense") {
    const existing: ExpenseEntry[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const id = Number(args.id);
    localStorage.setItem(key, JSON.stringify(existing.filter((e) => e.id !== id)));
    return undefined as T;
  }

  if (command === "add_car_expense_record") {
    const carKey = "mock_car_expenses";
    const existing: CarExpenseRecord[] = JSON.parse(localStorage.getItem(carKey) ?? "[]");
    const carNumber = String(args.carNumber ?? args.car_number ?? "");
    const record: CarExpenseRecord = {
      id: generateMockTxId(),
      car_number: carNumber,
      description: String(args.description ?? ""),
      amount: Number(args.amount) || 0,
      date: String(args.date ?? ""),
      currency: (args.currency as string) || null,
    };
    existing.push(record);
    localStorage.setItem(carKey, JSON.stringify(existing));
    return record.id as T;
  }

  if (command === "get_car_expense_records") {
    const carKey = "mock_car_expenses";
    const carNumber = String(args.carNumber ?? args.car_number ?? "");
    const all: CarExpenseRecord[] = JSON.parse(localStorage.getItem(carKey) ?? "[]");
    return all.filter((r) => r.car_number === carNumber) as T;
  }

  if (command === "delete_car_expense_record") {
    const carKey = "mock_car_expenses";
    const existing: CarExpenseRecord[] = JSON.parse(localStorage.getItem(carKey) ?? "[]");
    const id = Number(args.id);
    localStorage.setItem(carKey, JSON.stringify(existing.filter((r) => r.id !== id)));
    return undefined as T;
  }

  if (command === "get_financial_summary") {
    const filterType = args.payment_type ? String(args.payment_type) : null;
    const cars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");

    const filteredCars = filterType
      ? cars.filter((c) => c.purchase_payment_type === filterType)
      : cars;

    let iqdBalance = 0;
    let usdBalance = 0;

    // شراء السيارات
    for (const c of filteredCars) {
      if (c.purchase_date && c.purchase_price > 0) {
        if (c.currency === "USD") usdBalance -= c.purchase_price;
        else iqdBalance -= c.purchase_price;
      }
    }

    // بيع السيارات
    for (const c of filteredCars) {
      if (c.status === "مبيوعة" && c.sale_date) {
        const amount = c.payment_type === "كاش" ? c.selling_price : (c.amount_paid ?? 0);
        const curr = c.sale_currency === "USD" ? "USD" : "IQD";
        if (curr === "USD") usdBalance += amount;
        else iqdBalance += amount;
      }
    }

    // معاملات الشركاء والمستثمرين
    for (const tx of allTx) {
      if (tx.kind === "مطلوب" && tx.type_.startsWith("سحب")) continue;
      if (tx.type_.startsWith("سحب شراء سيارة") || tx.type_.startsWith("ايداع بيع سيارة") || tx.type_.startsWith("سحب مصروف")) {
        continue;
      }
      let signed = 0;
      if ((tx.kind === "شريك" || tx.kind === "مستثمر" || tx.kind === "مقترض") && tx.type_.startsWith("ايداع")) signed = tx.amount;
      else if (tx.kind === "شريك" && tx.type_.startsWith("سحب")) signed = -tx.amount;
      else if (tx.kind === "مستثمر" && tx.type_.startsWith("سحب")) signed = -tx.amount;
      else if (tx.kind === "مقترض" && tx.type_.startsWith("سحب")) signed = -tx.amount;
      else if (tx.kind === "ممول" && tx.type_.startsWith("سحب")) {
        const comm = parseCommissionAmount(tx.amount, tx.notes);
        signed = -(tx.amount + comm);
      }
      else if (tx.kind === "مطلوب" && tx.type_.startsWith("ايداع")) signed = tx.amount;
      const curr = tx.currency === "USD" ? "USD" : "IQD";
      if (curr === "USD") usdBalance += signed;
      else iqdBalance += signed;
    }

    // المصروفات
    for (const e of expenses) {
      if (e.currency === "USD") usdBalance -= e.amount;
      else iqdBalance -= e.amount;
    }

    const inventoryValue = filteredCars
      .filter((c) => c.status === "متوفرة")
      .reduce((sum, c) => sum + c.purchase_price, 0);

    const totalInvestments = partners
      .filter((p) => p.kind === "مستثمر" && p.total_amount > 0)
      .reduce((sum, p) => sum + p.total_amount, 0);

    const totalPartnerCapital = partners
      .filter((p) => p.kind === "شريك")
      .reduce((sum, p) => sum + p.total_amount, 0);

    const totalDebtors = partners
      .filter((p) => p.kind === "مطلوب" && p.total_amount > 0)
      .reduce((sum, p) => sum + p.total_amount, 0);

    const totalBorrowers = partners
      .filter((p) => p.kind === "مقترض" && p.total_amount < 0)
      .reduce((sum, p) => sum + p.total_amount, 0);

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const netCapital = iqdBalance + inventoryValue + totalDebtors - totalInvestments - totalBorrowers;

    return {
      iqd_balance: iqdBalance,
      usd_balance: usdBalance,
      inventory_value: inventoryValue,
      total_investments: totalInvestments,
      total_partner_capital: totalPartnerCapital,
      total_debtors: totalDebtors,
      total_expenses: totalExpenses,
      net_capital: netCapital,
    } as T;
  }

  if (command === "get_partners_totals") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const kind = String(args.kind ?? "شريك").trim();
    let iqd_total = 0;
    let usd_total = 0;
    const partnerTx = allTx.filter((tx) => {
      if (kind === "partners-financial") {
        return tx.kind === "شريك" || tx.kind === "مستثمر" || tx.kind === "ممول" || tx.kind === "مقترض";
      }
      return tx.kind === kind;
    });
    for (const tx of partnerTx) {
      const isUsd = tx.currency === "USD";
      let amount = 0;
      if (tx.kind === "ممول") {
        amount = tx.type_.startsWith("ايداع") ? -tx.amount : tx.type_.startsWith("سحب") ? tx.amount : 0;
      } else if (tx.kind === "مطلب" || tx.kind === "مطلوب") {
        if (tx.notes?.includes("دفعة أولى") || tx.notes?.includes("قسط") || tx.notes?.includes("مؤجل")) {
          continue;
        }
        amount = tx.type_.startsWith("سحب") ? tx.amount : tx.type_.startsWith("ايداع") ? -tx.amount : 0;
      } else {
        amount = tx.type_.startsWith("ايداع") ? tx.amount : tx.type_.startsWith("سحب") ? -tx.amount : 0;
      }
      if (isUsd) usd_total += amount;
      else iqd_total += amount;
    }
    return [iqd_total, usd_total] as unknown as T;
  }

  if (command === "get_unified_accounts") {
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const debtors = partners.filter((p) => p.kind === "مطلوب");
    
    return debtors.map((p) => {
      const txns = allTx.filter((tx) => tx.partner_name === p.partner_name && tx.kind === "مطلوب");
      let iqd_balance = 0;
      let usd_balance = 0;
      for (const tx of txns) {
        const isUsd = tx.currency === "USD";
        let signed = 0;
        // سحب / سحب مصروف / سحب ارباح → يضيف للرصيد (أعطيناهم)
        if (tx.type_.startsWith("سحب")) {
          signed = tx.amount;
        // ايداع / ايداع ارباح → يطرح من الرصيد (أخذنا منهم) - مع استثناء حركات التقسيط
        } else if (tx.type_.startsWith("ايداع")) {
          if (tx.notes?.includes("دفعة أولى") || tx.notes?.includes("قسط") || tx.notes?.includes("مؤجل")) {
            continue;
          }
          signed = -tx.amount;
        }
        if (isUsd) {
          usd_balance += signed;
        } else {
          iqd_balance += signed;
        }
      }
      return {
        partner_name: p.partner_name,
        phone: p.phone,
        iqd_balance,
        usd_balance,
      };
    }) as unknown as T;
  }

  if (command === "get_agencies") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_agency") {
    const existing: any[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const item = {
      id: Date.now(),
      old_agent_name: String(args.old_agent_name ?? "").trim(),
      car_number: String(args.car_number ?? "").trim(),
      car_model: String(args.car_model ?? "").trim(),
      color: String(args.color ?? "").trim(),
      new_agent_name: String(args.new_agent_name ?? "").trim(),
      phone: String(args.phone ?? "").trim(),
      amount_usd: Number(args.amount_usd) || 0,
      amount_iqd: Number(args.amount_iqd) || 0,
      notes: String(args.notes ?? "").trim(),
      date: `${y}-${m}-${d}`,
      time: `${hh}:${mm}`,
    };
    const idx = existing.findIndex((a: any) => a.id === item.id);
    if (idx >= 0) {
      existing[idx] = item;
    } else {
      existing.push(item);
    }
    localStorage.setItem(key, JSON.stringify(existing));
    return undefined as T;
  }

  if (command === "delete_agency") {
    const existing: any[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const targetId = Number(args.id) || 0;
    const next = existing.filter((a: any) => a.id !== targetId);
    localStorage.setItem(key, JSON.stringify(next));
    const txKey = "mock_agency_transactions";
    const allTx: any[] = JSON.parse(localStorage.getItem(txKey) ?? "[]");
    localStorage.setItem(txKey, JSON.stringify(allTx.filter((t: any) => t.agency_id !== targetId)));
    return undefined as T;
  }

  if (command === "get_agency_transactions") {
    const agencyId = Number(args.agency_id) || 0;
    const raw = localStorage.getItem(key);
    const all: any[] = raw ? JSON.parse(raw) : [];
    return all.filter((t: any) => t.agency_id === agencyId) as T;
  }

  if (command === "add_agency_transaction") {
    const allTx: any[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    allTx.push({
      id: Date.now(),
      agency_id: Number(args.agency_id) || 0,
      date: String(args.date ?? ""),
      time: String(args.time ?? `${hh}:${mm}`),
      type_: String(args.type_ ?? "ايداع"),
      amount: Number(args.amount) || 0,
      currency: String(args.currency ?? "IQD"),
      notes: args.notes ? String(args.notes) : null,
    });
    localStorage.setItem(key, JSON.stringify(allTx));
    return undefined as T;
  }

  if (command === "delete_agency_transaction") {
    const allTx: any[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const targetId = Number(args.id) || 0;
    localStorage.setItem(key, JSON.stringify(allTx.filter((t: any) => t.id !== targetId)));
    return undefined as T;
  }

  throw new Error(`أمر غير معروف: ${command}`);
}

/** يبني حمولة add_car متوافقة مع أوامر Rust */
export function buildCarInvokeArgs(form: CarFormState) {
  const isSold = form.status === "مبيوعة";
  const isDelivery = isSold && form.paymentType === "موعد";
  const isInstallment = isSold && form.paymentType === "اقساط";
  const isDeferred = isSold && form.paymentType !== "كاش";
  const months = Math.max(1, Number(form.installmentMonths) || 1);
  const remaining = Number(form.amountRemaining) || 0;
  const paid = Number(form.amountPaid) || 0;

  return {
    num: form.num.trim(),
    province: form.province.trim(),
    chassis: form.chassis.trim(),
    model: form.model.trim(),
    year: form.year.trim(),
    name: form.name.trim(),
    color: form.color.trim(),
    details: form.details.trim(),
    purchase: Number(form.purchase) || 0,
    selling: Number(form.selling) || 0,
    status: form.status,
    paymentType: isSold ? form.paymentType : null,
    cashPrice: isSold && (form.paymentType === "كاش" || form.paymentType === "موعد") ? paid : null,
    amountPaid: isSold ? paid : null,
    amountRemaining: isDeferred ? remaining : null,
    installmentMonths: isInstallment ? months : null,
    monthlyPayment: isInstallment ? remaining / months : null,
    buyerName: isSold ? form.buyerName.trim() || null : null,
    buyerPhone: isSold ? form.phone.trim() || null : null,
    purchaseDate: form.purchaseDate || null,
    purchasePaymentType: form.purchasePaymentType,
    saleDate: isSold ? form.saleDate || null : null,
    deliveryDate: isDelivery ? form.deliveryDate || null : null,
    firstPaymentDate: isInstallment ? form.firstPaymentDate || null : null,
    currency: form.currency,
    saleCurrency: form.saleCurrency,
    oldNum: form.oldNum || null,
    purchaseType: form.purchaseType === "تمويل" ? "دين" : (form.purchaseType || "كاش"),
    financerName: form.purchaseType === "تمويل" || form.purchaseType === "شركة" ? form.financerName || null : null,
    commissionType: null,
    commissionValue: null,
    carPartners: form.purchaseType === "شراكه"
      ? (form.carPartners || []).map((p) => ({
          car_number: [form.num.trim(), form.province.trim()].filter(Boolean).join(" "),
          partner_name: p.partner_name.trim(),
          amount: Number(p.amount) || 0,
          currency: p.currency,
          kind: p.kind || "شريك",
        }))
      : null,
  };
}

export async function callTauri<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (isTauri()) {
    return invoke<T>(command, args);
  }

  console.warn(`[وضع المتصفح] استدعاء: ${command}`, args);
  return mockInvoke<T>(command, args);
}
