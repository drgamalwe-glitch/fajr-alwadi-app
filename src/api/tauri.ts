import { invoke } from "@tauri-apps/api/core";
import type { Car, CarFormState, CashRegisterEntry, ExpenseEntry, Partner, PartnerTransaction } from "../types";

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
      if (tx.type_ === "سحب") return total + tx.amount;
      if (tx.type_ === "ايداع") return total - tx.amount;
    } else {
      if (tx.type_ === "ايداع") return total + tx.amount;
      if (tx.type_ === "سحب") return total - tx.amount;
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
    // تراجع: السيارات القديمة بدون حقول العملة → افتراضي IQD
    for (const car of cars) {
      if (car.currency !== "USD" && car.currency !== "IQD") {
        car.currency = "IQD";
      }
      if (!car.sale_currency || (car.sale_currency !== "USD" && car.sale_currency !== "IQD")) {
        car.sale_currency = "IQD";
      }
    }
    return cars as unknown as T;
  }

  if (command === "add_car") {
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const item = mapMockCar(args);
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
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const newTx: PartnerTransaction & { time?: string } = {
      id: generateMockTxId(),
      partner_name: partnerName,
      kind,
      type_: String(args.type ?? args.type_ ?? ""),
      amount: Number(args.amount) || 0,
      date: String(args.date ?? ""),
      time: `${hh}:${mm}`,
      notes: args.notes ? String(args.notes) : null,
      currency: (args.currency as string) || null,
      paymentType: (args.payment_type ?? args.paymentType ?? "قاصه") as string,
      payment_type: (args.payment_type ?? args.paymentType ?? "قاصه") as string,
    };
    allTx.push(newTx);
    localStorage.setItem("mock_partner_transactions", JSON.stringify(allTx));
    recalculateMockPartnerTotal(partnerName, kind);
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
    const allCars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
    const cars = filterType
      ? (filterType === "قاصه" || filterType === "قاصة"
        ? allCars.filter((c) => c.purchase_payment_type === "قاصه" || c.purchase_payment_type === "قاصة" || !c.purchase_payment_type)
        : allCars.filter((c) => c.purchase_payment_type === filterType))
      : allCars;
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const entries: CashRegisterEntry[] = [];

    // شراء السيارات
    for (const c of cars) {
      if (c.purchase_date && c.purchase_price > 0) {
        entries.push({
          id: 0, date: c.purchase_date, time: "00:00", type_: "شراء سيارة",
          amount: -c.purchase_price,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
        });
      }
    }

    // بيع السيارات كاش
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "كاش" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: "00:00", type_: "بيع سيارة كاش",
          amount: c.selling_price,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
        });
      }
    }

    // بيع السيارات آجل
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "موعد" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: "00:00", type_: "بيع سيارة آجل",
          amount: c.amount_paid ?? 0,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
        });
      }
    }

    // مقدمات السيارات بالتقسيط
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "اقساط" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: "00:00", type_: "مقدمة سيارة اقساط",
          amount: c.amount_paid ?? 0,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
        });
      }
    }

    const includeOthers = filterType === null || filterType === "قاصه" || filterType === "قاصة";

    if (includeOthers) {
      // معاملات الشركاء والمستثمرين (بدون ديون العملاء غير المدفوعة)
      for (const tx of allTx) {
        if (tx.kind === "مطلوب" && tx.type_ === "سحب") continue;
        let type_: string;
        let amount: number;
        switch (tx.kind) {
          case "شريك":
            type_ = tx.type_ === "ايداع" ? "ايداع شريك" : "سحب شريك";
            amount = tx.type_ === "ايداع" ? tx.amount : -tx.amount;
            break;
          case "مستثمر":
            type_ = tx.type_ === "ايداع" ? "ايداع مستثمر" : "سحب مستثمر";
            amount = tx.type_ === "ايداع" ? tx.amount : -tx.amount;
            break;
          case "مطلوب":
            type_ = "تسديد دين";
            amount = tx.amount;
            break;
          default:
            type_ = `${tx.kind} ${tx.type_}`;
            amount = tx.type_ === "ايداع" ? tx.amount : -tx.amount;
        }
        entries.push({
          id: 0, date: tx.date, time: (tx as any).time ?? "00:00", type_, amount,
          description: tx.partner_name,
          notes: tx.notes, balance: 0,
        });
      }

      // المصروفات
      const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");
      for (const e of expenses) {
        entries.push({
          id: 0, date: e.date, time: e.time, type_: "مصروف",
          amount: -e.amount,
          description: e.description,
          notes: e.notes, balance: 0,
        });
      }
    }

    // ترتيب حسب التاريخ ثم الوقت (من الأقدم للأحدث)
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    let running = 0;
    for (const e of entries) { running += e.amount; e.balance = running; }
    entries.forEach((e, i) => { e.id = i + 1; });

    return entries as T;
  }

  if (command === "add_cash_register_entry") {
    const allEntries: CashRegisterEntry[] = JSON.parse(localStorage.getItem("mock_cash_register") ?? "[]");
    const newEntry: CashRegisterEntry = {
      id: generateMockTxId(),
      date: String(args.date ?? ""),
      time: String(args.time ?? ""),
      type_: String(args.type ?? args.type_ ?? ""),
      amount: Number(args.amount) || 0,
      description: String(args.description ?? ""),
      notes: args.notes ? String(args.notes) : null,
      balance: 0,
    };
    allEntries.push(newEntry);
    localStorage.setItem("mock_cash_register", JSON.stringify(allEntries));
    return undefined as T;
  }

  if (command === "delete_cash_register_entry") {
    const allEntries: CashRegisterEntry[] = JSON.parse(localStorage.getItem("mock_cash_register") ?? "[]");
    const id = Number(args.id);
    localStorage.setItem("mock_cash_register", JSON.stringify(allEntries.filter((e) => e.id !== id)));
    return undefined as T;
  }

  if (command === "get_cash_register_balance") {
    const entries: CashRegisterEntry[] = await mockInvoke("get_cash_register_entries", {});
    const balance = entries.length > 0 ? entries[entries.length - 1].balance : 0;
    return balance as T;
  }

  if (command === "get_expenses") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_expense") {
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
    return undefined as T;
  }

  if (command === "delete_expense") {
    const existing: ExpenseEntry[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const id = Number(args.id);
    localStorage.setItem(key, JSON.stringify(existing.filter((e) => e.id !== id)));
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
      if (tx.kind === "مطلوب" && tx.type_ === "سحب") continue;
      let signed = 0;
      if ((tx.kind === "شريك" || tx.kind === "مستثمر") && tx.type_ === "ايداع") signed = tx.amount;
      else if (tx.kind === "شريك" && tx.type_ === "سحب") signed = -tx.amount;
      else if (tx.kind === "مستثمر" && tx.type_ === "سحب") signed = -tx.amount;
      else if (tx.kind === "مطلوب" && tx.type_ === "ايداع") signed = tx.amount;
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

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const netCapital = iqdBalance + inventoryValue + totalDebtors - totalInvestments;

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

  if (command === "get_investors_totals") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const investorsTx = allTx.filter((tx) => tx.kind === "مستثمر");
    let iqd_total = 0;
    let usd_total = 0;
    for (const tx of investorsTx) {
      const isUsd = tx.currency === "USD";
      const amount = tx.type_ === "ايداع" ? tx.amount : tx.type_ === "سحب" ? -tx.amount : 0;
      if (isUsd) usd_total += amount;
      else iqd_total += amount;
    }
    return [iqd_total, usd_total] as unknown as T;
  }

  if (command === "get_partners_totals") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const kind = String(args.kind ?? "شريك").trim();
    const partnerTx = allTx.filter((tx) => tx.kind === kind);
    let iqd_total = 0;
    let usd_total = 0;
    for (const tx of partnerTx) {
      const isUsd = tx.currency === "USD";
      let amount = 0;
      if (kind === "مطلوب") {
        if (tx.notes?.includes("دفعة أولى") || tx.notes?.includes("قسط") || tx.notes?.includes("مؤجل")) {
          continue;
        }
        amount = tx.type_ === "سحب" ? tx.amount : tx.type_ === "ايداع" ? -tx.amount : 0;
      } else {
        amount = tx.type_ === "ايداع" ? tx.amount : tx.type_ === "سحب" ? -tx.amount : 0;
      }
      if (isUsd) usd_total += amount;
      else iqd_total += amount;
    }
    return [iqd_total, usd_total] as unknown as T;
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
    oldNum: (form as any).oldNum || (form as any).old_num || null,
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
