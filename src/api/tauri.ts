import { invoke } from "@tauri-apps/api/core";
import type { Car, CarFormState, CashRegisterEntry, ExpenseEntry, CarExpenseRecord, Partner, PartnerTransaction, CarPartner } from "../types";

const isTauri = () =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || import.meta.env.TAURI_ENV_PLATFORM != null);

// Obfuscate / encrypt localStorage mock data in web simulation environment
if (typeof window !== "undefined" && !isTauri()) {
  const originalGetItem = localStorage.getItem.bind(localStorage);
  const originalSetItem = localStorage.setItem.bind(localStorage);

  const encodeUnicodeBase64 = (str: string): string => {
    return btoa(unescape(encodeURIComponent(str)));
  };

  const decodeUnicodeBase64 = (str: string): string => {
    return decodeURIComponent(escape(atob(str)));
  };

  localStorage.getItem = (key: string) => {
    const val = originalGetItem(key);
    if (!val) return null;
    if (key.startsWith("mock_")) {
      try {
        return decodeUnicodeBase64(val);
      } catch {
        return val; // fallback for existing plain JSON data
      }
    }
    return val;
  };

  localStorage.setItem = (key: string, value: string) => {
    if (key.startsWith("mock_")) {
      originalSetItem(key, encodeUnicodeBase64(value));
    } else {
      originalSetItem(key, value);
    }
  };
}

if (typeof window !== "undefined" && !isTauri()) {
  try {
    const mockPStr = localStorage.getItem("mock_partners");
    if (mockPStr) {
      let mockP: any[] = JSON.parse(mockPStr);
      const cleaned = mockP.filter(p => !(p.kind === "شريك" && p.partner_name !== "أمير" && p.partner_name !== "منتصر"));
      if (!cleaned.some(p => p.partner_name === "أمير" && p.kind === "شريك")) {
        cleaned.push({ partner_name: "أمير", phone: "07808425228", total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: "شريك" });
      }
      if (!cleaned.some(p => p.partner_name === "منتصر" && p.kind === "شريك")) {
        cleaned.push({ partner_name: "منتصر", phone: "07812541714", total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: "شريك" });
      }
      localStorage.setItem("mock_partners", JSON.stringify(cleaned));
    } else {
      localStorage.setItem("mock_partners", JSON.stringify([
        { partner_name: "أمير", phone: "07808425228", total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: "شريك" },
        { partner_name: "منتصر", phone: "07812541714", total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: "شريك" }
      ]));
    }
  } catch (e) {
    console.error("Error sanitizing mock partners storage:", e);
  }
}

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

function isCustomerDebit(tx: PartnerTransaction): boolean {
  return !tx.type_.startsWith("تحويل") &&
    !tx.type_.startsWith("واصل") &&
    (tx.type_.startsWith("باقي") || tx.type_.startsWith("سحب"));
}

function calculateCustomerRemaining(txns: PartnerTransaction[], currency?: "IQD" | "USD"): number {
  const scoped = txns.filter((tx) =>
    (!currency || (tx.currency || "IQD") === currency) &&
    !tx.type_.startsWith("تحويل")
  );
  return scoped
    .filter((tx) => isCustomerDebit(tx))
    .reduce((sum, tx) => sum + tx.amount, 0);
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

  partners[pIdx].total_amount = kind === "زبون" ? txns.filter(tx => isCustomerDebit(tx)).reduce((sum, tx) => sum + tx.amount, 0) : txns.reduce((total, tx) => {
      if (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة")) return total + tx.amount;
      if (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) return total - tx.amount;
    return total;
  }, 0);
  localStorage.setItem("mock_partners", JSON.stringify(partners));
}

async function mockInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const key = mockStorageKey(command);

  if (command === "export_database_to_excel") {
    return "تصدير تجريبي - يعمل إنشاء ملف Excel داخل تطبيق Tauri" as unknown as T;
  }

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
    // Clean up car expenses
    const carExpenses: CarExpenseRecord[] = JSON.parse(localStorage.getItem("mock_car_expenses") ?? "[]");
    localStorage.setItem("mock_car_expenses", JSON.stringify(carExpenses.filter((e) => e.car_number !== target)));
    return undefined as T;
  }

  if (command === "sell_car_with_accounting") {
    const carNumber = String(args.carNumber ?? args.car_number ?? "").trim();
    const buyerName = String(args.buyerName ?? args.buyer_name ?? "").trim();
    const sellingPrice = Number(args.sellingPrice ?? args.selling_price) || 0;
    const saleCurrency = String(args.saleCurrency ?? args.sale_currency ?? "IQD");
    const saleDate = String(args.saleDate ?? args.sale_date ?? "");
    const paymentType = String(args.paymentType ?? args.payment_type ?? "كاش");
    const amountPaid = Number(args.amountPaid ?? args.amount_paid) || 0;
    const amountRemaining = Number(args.amountRemaining ?? args.amount_remaining) || 0;
    const installmentMonths = Number(args.installmentMonths ?? args.installment_months) || 1;

    // Update car sale fields
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const carIdx = existing.findIndex((c) => c.car_number === carNumber);
    if (carIdx >= 0) {
      existing[carIdx] = {
        ...existing[carIdx],
        status: "مبيوعة",
        selling_price: sellingPrice,
        sale_currency: saleCurrency,
        payment_type: paymentType as Car["payment_type"],
        amount_paid: amountPaid,
        amount_remaining: amountRemaining,
        installment_months: installmentMonths,
        buyer_name: buyerName,
        buyer_phone: String(args.buyerPhone ?? args.buyer_phone ?? ""),
        sale_date: saleDate,
        sale_time: new Date().toTimeString().slice(0, 5),
        delivery_date: String(args.deliveryDate ?? args.delivery_date ?? "") || null,
        first_payment_date: String(args.firstPaymentDate ?? args.first_payment_date ?? "") || null,
      };
      localStorage.setItem(key, JSON.stringify(existing));
    }

    // Create customer account if not exists
    const partnersKey = "mock_partners";
    const partners: Partner[] = JSON.parse(localStorage.getItem(partnersKey) ?? "[]");
    if (!partners.some(p => p.partner_name === buyerName && p.kind === "زبون")) {
      partners.push({
        partner_name: buyerName,
        phone: String(args.buyerPhone ?? args.buyer_phone ?? ""),
        total_amount: amountRemaining,
        iqd_balance: amountRemaining,
        usd_balance: 0,
        total_withdrawals: 0,
        kind: "زبون",
      });
      localStorage.setItem(partnersKey, JSON.stringify(partners));
    }

    return undefined as T;
  }

  if (command === "get_partners") {
    const raw = localStorage.getItem(key);
    const partners: Partner[] = raw ? JSON.parse(raw) : [];

    // Recalculate on-the-fly to be perfectly in sync with Rust backend
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    for (const p of partners) {
      const txns = allTx.filter((t) => t.partner_name === p.partner_name && t.kind === p.kind);
      p.total_amount = p.kind === "زبون" ? calculateCustomerRemaining(txns) : txns.reduce((total, tx) => {
          if (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة")) return total + tx.amount;
          if (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) return total - tx.amount;
        return total;
      }, 0);
    }
    return partners as unknown as T;
  }

  if (command === "add_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    if (kind === "شريك") {
      throw new Error("لا يمكن إنشاء حساب شريك جديد");
    }
    const existingIdx = existing.findIndex((p) => p.partner_name === name && p.kind === kind);
    if (existingIdx >= 0) {
      existing[existingIdx] = { ...existing[existingIdx], phone: String(args.phone ?? "").trim(), kind };
    } else {
      existing.push({
        partner_name: name,
        phone: String(args.phone ?? "").trim(),
        total_amount: 0,
        iqd_balance: 0,
        usd_balance: 0,
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
    if (oldKind === "شريك") {
      if (oldName !== name) throw new Error("لا يمكن تغيير اسم شريك");
      if (oldKind !== kind) throw new Error("لا يمكن تغيير نوع شريك");
    }
    if (kind === "شريك" && oldKind !== "شريك") {
      throw new Error("لا يمكن تغيير نوع الحساب إلى شريك");
    }
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
    if (kind === "شريك") {
      throw new Error("لا يمكن حذف حساب شريك");
    }
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
    return allTx
      .filter((tx) => tx.partner_name === partnerName && tx.kind === kind)
      .map((tx) => ({
        ...tx,
        affects_qasa: tx.affects_qasa ?? 1,
        affects_partner_cash: tx.affects_partner_cash ?? 1,
        affects_profit: tx.affects_profit ?? 0,
      })) as T;
  }

  if (command === "add_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const type = String(args.type ?? args.type_ ?? "");
    const notes = args.notes ? String(args.notes) : null;
    const isFinancierRepayment =
      kind === "ممول" && type.startsWith("سحب");
    const paymentType = isFinancierRepayment
      ? "قاصه"
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
      const commissionAmount = parseCommissionAmount(newTx.amount, newTx.notes);
      if (commissionAmount > 0) {
        await mockInvoke("add_expense", {
          description: "عمولة تسديد تمويل",
          amount: commissionAmount,
          date: newTx.date,
          notes: `عمولة تسديد الممول ${partnerName} (رقم الحركة: ${newTx.id})`,
          currency: newTx.currency || "IQD",
        });
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

    const commissionAmount = Number(args.commission_amount ?? args.commissionAmount) || 0;

    await mockInvoke("add_partner_transaction", {
      partnerName: financierName,
      kind: financierKind,
      type: "سحب",
      amount,
      date,
      notes: args.notes ? String(args.notes) : null,
      currency,
      paymentType: "قاصه",
      skipAutoFinancierDistribution: true,
    });

    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const newTx = allTx[allTx.length - 1];
    const txId = newTx ? newTx.id : 0;

    if (commissionAmount > 0) {
      const commissionCurrency = (args.commission_currency ?? args.commissionCurrency ?? "IQD") as string;
      await mockInvoke("add_expense", {
        description: "عمولة تسديد تمويل",
        amount: commissionAmount,
        date,
        notes: `عمولة تسديد الممول ${financierName} (رقم الحركة: ${txId})`,
        currency: commissionCurrency,
      });
    }

    return undefined as T;
  }

  if (command === "update_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.id);
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const type_ = String(args.type ?? args.type_ ?? "");
    const amount = Number(args.amount) || 0;
    const date = String(args.date ?? "");
    const notes = args.notes ? String(args.notes) : null;
    const currency = (args.currency as string) || null;

    const isFinancierRepayment =
      kind === "ممول" && type_.startsWith("سحب");

    const paymentType = isFinancierRepayment
      ? "قاصه"
      : ((args.payment_type ?? args.paymentType ?? "قاصه") as string);

    const next = allTx.map((tx) =>
      tx.id === id
        ? {
          ...tx,
          type_: type_,
          amount: amount,
          date: date,
          notes: notes,
          currency: currency || tx.currency || null,
          paymentType: paymentType,
          payment_type: paymentType,
        }
        : tx,
    );
    localStorage.setItem("mock_partner_transactions", JSON.stringify(next));
    recalculateMockPartnerTotal(partnerName, kind);

    if (isFinancierRepayment) {
      const commissionAmount = parseCommissionAmount(amount, notes);
      const targetTag = `(رقم الحركة: ${id})`;
      const expKey = "mock_expenses";
      const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem(expKey) ?? "[]");
      const existingExp = expenses.find((e) => e.notes?.includes(targetTag));

      if (commissionAmount > 0) {
        const expenseNotes = `عمولة تسديد الممول ${partnerName} ${targetTag}`;
        if (existingExp) {
          existingExp.amount = commissionAmount;
          existingExp.date = date;
          existingExp.notes = expenseNotes;
          existingExp.currency = currency || "IQD";
          localStorage.setItem(expKey, JSON.stringify(expenses));
        } else {
          await mockInvoke("add_expense", {
            description: "عمولة تسديد تمويل",
            amount: commissionAmount,
            date,
            notes: expenseNotes,
            currency: currency || "IQD",
          });
        }
      } else {
        if (existingExp) {
          const updatedExps = expenses.filter((e) => e.id !== existingExp.id);
          localStorage.setItem(expKey, JSON.stringify(updatedExps));
        }
      }
    } else {
      const targetTag = `(رقم الحركة: ${id})`;
      const expKey = "mock_expenses";
      const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem(expKey) ?? "[]");
      const filteredExpenses = expenses.filter((e) => !e.notes?.includes(targetTag));
      localStorage.setItem(expKey, JSON.stringify(filteredExpenses));
    }

    return undefined as T;
  }

  if (command === "delete_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.id);
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();

    // Delete any linked commission expense
    const targetTag = `(رقم الحركة: ${id})`;
    const expKey = "mock_expenses";
    const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem(expKey) ?? "[]");
    const filteredExpenses = expenses.filter((e) => !e.notes?.includes(targetTag));
    localStorage.setItem(expKey, JSON.stringify(filteredExpenses));

    localStorage.setItem(
      "mock_partner_transactions",
      JSON.stringify(allTx.filter((tx) => !(tx.id === id))),
    );
    recalculateMockPartnerTotal(partnerName, kind);
    return undefined as T;
  }

  if (command === "get_cash_register_entries") {
    const filterType = args.payment_type ? String(args.payment_type).trim() : null;

    if (filterType === "الكاش") {
      const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
      const entries: CashRegisterEntry[] = [];
      for (const tx of allTx) {
        if (tx.kind !== "شريك") continue;
        if (tx.type_.includes("تحويل")) continue;
        const affectsPartnerCash = tx.affects_partner_cash ?? 1;
        if (affectsPartnerCash !== 1) continue;

        const isDeposit = tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة") || tx.type_.startsWith("استلام") || tx.type_.startsWith("إستلام") || tx.type_.startsWith("إعادة استثمار") || tx.type_.startsWith("تسوية") || tx.type_.startsWith("تسديد");
        const isWithdrawal = tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي");
        let amount = 0;
        if (isDeposit) {
          amount = tx.amount;
        } else if (isWithdrawal) {
          amount = -tx.amount;
        }

        entries.push({
          id: 0,
          date: tx.date,
          time: tx.time ?? "00:00",
          type_: (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? "ايداع شريك" : "سحب شريك",
          amount,
          description: tx.partner_name,
          notes: tx.notes || null,
          balance: 0,
          currency: tx.currency || "IQD",
        });
      }

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

    const isMumuol = filterType === "ممول";
    const allCars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
    let cars = isMumuol ? [] : (filterType
      ? (filterType === "قاصه" || filterType === "قاصة"
        ? allCars.filter((c) => c.purchase_payment_type === "قاصه" || c.purchase_payment_type === "قاصة" || !c.purchase_payment_type)
        : allCars.filter((c) => c.purchase_payment_type === filterType))
      : allCars);

    if (filterType !== null) {
      cars = cars.filter((c) => c.purchase_type !== "دين");
    }

    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const entries: CashRegisterEntry[] = [];

    // شراء السيارات - معالجة جميع طرق الدفع
    for (const c of cars) {
      if (c.purchase_date && c.purchase_price > 0) {
        const purchaseType = c.purchase_type || "كاش";
        let type_: string;
        let amount: number;
        let description: string;

        if (purchaseType === "دين" || purchaseType === "تمويل") {
          type_ = "شراء بالتمويل";
          amount = c.purchase_price;
          description = `${c.car_name} - ${c.car_number} (تمويل - الممول: ${(c.financer_name || "").trim()})`;
        } else if (purchaseType === "شركة") {
          type_ = "شراء عن طريق شركة";
          amount = c.purchase_price;
          description = `${c.car_name} - ${c.car_number} (شركة: ${(c.financer_name || "").trim()})`;
        } else {
          type_ = "شراء سيارة";
          amount = -c.purchase_price;
          description = `${c.car_name} - ${c.car_number}`;
        }

        entries.push({
          id: 0,
          date: c.purchase_date,
          time: c.purchase_time || "00:00",
          type_,
          amount,
          description,
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

    const includeOthers = filterType === null || filterType === "قاصه" || filterType === "قاصة" || isMumuol;

    if (includeOthers) {
      // معاملات الشركاء والمستثمرين (بدون ديون العملاء غير المدفوعة)
      for (const tx of allTx) {
        if (isMumuol) {
          if (tx.kind !== "ممول") continue;
        } else {
          if (tx.type_.startsWith("سحب شراء سيارة") || tx.type_.startsWith("ايداع بيع سيارة") || tx.type_.startsWith("سحب مصروف") || tx.type_.startsWith("ايداع ارباح وكالة")) {
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
            if (filterType) {
              const isQasaFilter = filterType === "قاصه" || filterType === "قاصة";
              if (isQasaFilter && (tx.affects_qasa ?? 1) !== 1) continue;
              if (!isQasaFilter && (tx.affects_partner_cash ?? 1) !== 1) continue;
            }
            type_ = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? "ايداع شريك" : "سحب شريك";
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : -tx.amount;
            break;
          case "مستثمر":
            type_ = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? "ايداع مستثمر" : "سحب مستثمر";
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : -tx.amount;
            break;
          case "ممول":
            if (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) {
              if (isMumuol) {
                type_ = "ايداع ممول";
                amount = tx.amount;
              } else {
                type_ = "";
                amount = 0;
              }
            } else {
              type_ = "تسديد تمويل";
              amount = -tx.amount;
            }
            break;
          case "زبون":
            if (tx.type_.startsWith("مقدمة بيع سيارة") || tx.type_.startsWith("مقدمة سيارة")) {
              type_ = "مقدمة بيع سيارة";
              amount = tx.amount;
            } else if (tx.type_.startsWith("تسديد قسط سيارة")) {
              type_ = "تسديد قسط سيارة";
              amount = tx.amount;
            } else if (
              tx.type_.startsWith("تحويل الى القاصة") ||
              tx.type_.startsWith("تحويل قسط الى القاصة") ||
              tx.type_.startsWith("تحويل باقي قسط الى القاصة")
            ) {
              type_ = "تحويل الى القاصة";
              amount = -tx.amount;
            } else {
              continue;
            }
            break;
          default:
            type_ = `${tx.kind} ${tx.type_}`;
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : -tx.amount;
        }
        if (!type_) continue;
        entries.push({
          id: 0, date: tx.date, time: tx.time ?? "00:00", type_, amount,
          description: tx.partner_name,
          notes: tx.notes, balance: 0,
          currency: tx.currency || "IQD",
        });
      }

      // أرباح الوكالات وحركاتها المباشرة في القاصة
      if (!isMumuol) {
        const agencies: any[] = JSON.parse(localStorage.getItem("mock_default") ?? "[]");
        for (const a of agencies) {
          const desc = `أرباح وكالة ${a.old_agent_name} ← ${a.new_agent_name}`;
          if (a.amount_iqd > 0) {
            entries.push({
              id: 0, date: a.date, time: a.time ?? "00:00", type_: "أرباح وكالة",
              amount: a.amount_iqd,
              description: desc,
              notes: null, balance: 0,
              currency: "IQD",
            });
          }
          if (a.amount_usd > 0) {
            entries.push({
              id: 0, date: a.date, time: a.time ?? "00:00", type_: "أرباح وكالة",
              amount: a.amount_usd,
              description: desc,
              notes: null, balance: 0,
              currency: "USD",
            });
          }
        }
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

  if (command === "update_expense") {
    const existing: ExpenseEntry[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const id = Number(args.id);
    const updated = existing.map((e) => {
      if (e.id === id) {
        return {
          ...e,
          description: String(args.description ?? ""),
          amount: Number(args.amount) || 0,
          date: String(args.date ?? ""),
          notes: args.notes ? String(args.notes) : null,
          currency: (args.currency as string) || null,
        };
      }
      return e;
    });
    localStorage.setItem(key, JSON.stringify(updated));
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
    const paymentType = args.payment_type ? String(args.payment_type).trim() : null;
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");
    const cars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");

    let cashIqd = 0;
    let cashUsd = 0;

    if (paymentType === "الكاش") {
      // cash = sum of all شريك partner balances (deposits - withdrawals)
      for (const tx of allTx) {
        if (tx.kind !== "شريك") continue;
        const isUsd = tx.currency === "USD";
        const isDeposit = tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة") || tx.type_.startsWith("استلام") || tx.type_.startsWith("إستلام") || tx.type_.startsWith("إعادة استثمار") || tx.type_.startsWith("تسوية") || tx.type_.startsWith("تسديد");
        const isWithdrawal = tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي");
        if (tx.type_.includes("تحويل")) continue;
        if (isDeposit) {
          if (isUsd) cashUsd += tx.amount;
          else cashIqd += tx.amount;
        } else if (isWithdrawal) {
          if (isUsd) cashUsd -= tx.amount;
          else cashIqd -= tx.amount;
        }
      }
    } else {
      // Calculate cash balance from the physical cash register (simulate get_cash_register_entries for the given paymentType)
      // Start with partner/investor/borrower transactions that go to this cash register
      for (const tx of allTx) {
        const txPaymentType = tx.paymentType || tx.payment_type || "قاصه";
        const matchesType = !paymentType || 
          ((paymentType === "قاصه" || paymentType === "قاصة") 
            ? (txPaymentType === "قاصه" || txPaymentType === "قاصة") 
            : txPaymentType === paymentType);

        if (!matchesType) continue;
        if (tx.type_.startsWith("سحب شراء سيارة") || tx.type_.startsWith("ايداع بيع سيارة") || tx.type_.startsWith("سحب مصروف") || tx.type_.startsWith("ايداع ارباح وكالة")) {
          continue;
        }

        const isUsd = tx.currency === "USD";
        let amount = 0;
        let valid = false;

        switch (tx.kind) {
          case "شريك":
          case "مستثمر":
            valid = true;
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : -tx.amount;
            break;
          case "ممول":
            valid = true;
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : -tx.amount;
            break;
          case "زبون":
            if (tx.type_.startsWith("مقدمة بيع سيارة") || tx.type_.startsWith("مقدمة سيارة") || tx.type_.startsWith("تسديد قسط سيارة")) {
              valid = true;
              amount = tx.amount;
            } else if (tx.type_.startsWith("تحويل الى القاصة") || tx.type_.startsWith("تحويل قسط الى القاصة") || tx.type_.startsWith("تحويل باقي قسط الى القاصة")) {
              valid = true;
              amount = -tx.amount;
            }
            break;
        }

        if (valid) {
          if (isUsd) cashUsd += amount;
          else cashIqd += amount;
        }
      }

      // Add cash car sales and deduct cash car purchases
      for (const c of cars) {
        const carPaymentType = String(c.purchase_payment_type || "قاصه");
        const matchesPurchaseType = !paymentType || 
          ((paymentType === "قاصه" || paymentType === "قاصة") 
            ? (carPaymentType === "قاصه" || carPaymentType === "قاصة") 
            : carPaymentType === paymentType);

        if (matchesPurchaseType && c.purchase_date && c.purchase_price > 0 && c.purchase_type !== "دين" && c.purchase_type !== "تمويل" && c.purchase_type !== "شركة") {
          const isUsd = c.currency === "USD";
          if (isUsd) cashUsd -= c.purchase_price;
          else cashIqd -= c.purchase_price;
        }

        const salePaymentType = String(c.sale_payment_type || c.payment_type || "قاصه");
        const matchesSaleType = !paymentType || 
          ((paymentType === "قاصه" || paymentType === "قاصة") 
            ? (salePaymentType === "قاصه" || salePaymentType === "قاصة") 
            : salePaymentType === paymentType);

        if (matchesSaleType && c.status === "مبيوعة" && c.payment_type === "كاش" && c.sale_date) {
          const isUsd = c.sale_currency === "USD";
          if (isUsd) cashUsd += c.selling_price;
          else cashIqd += c.selling_price;
        }
      }

      // Add agency profits
      const agencies: any[] = JSON.parse(localStorage.getItem("mock_default") ?? "[]");
      for (const a of agencies) {
        if (a.amount_iqd > 0) {
          cashIqd += a.amount_iqd;
        }
        if (a.amount_usd > 0) {
          cashUsd += a.amount_usd;
        }
      }

      // Deduct expenses
      const mockExpenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");
      for (const e of mockExpenses) {
        const isUsd = e.currency === "USD";
        if (isUsd) cashUsd -= e.amount;
        else cashIqd -= e.amount;
      }
    }

    // Inventory Value
    const carExpensesList: CarExpenseRecord[] = JSON.parse(localStorage.getItem("mock_car_expenses") ?? "[]");
    const inventoryValueIqd = cars
      .filter((c) => c.status === "متوفرة")
      .reduce((sum, c) => {
        const carExpenses = carExpensesList.filter((e) => e.car_number === c.car_number);
        const expensesSum = carExpenses.reduce((s, e) => s + e.amount, 0);
        return sum + c.purchase_price + expensesSum;
      }, 0);
    let inventoryValueUsd = 0;

    const totalInvestmentsIqd = partners
      .filter((p) => p.kind === "مستثمر" && p.total_amount > 0)
      .reduce((sum, p) => sum + p.total_amount, 0);
    const totalInvestmentsUsd = 0;

    const totalPartnerCapitalIqd = partners
      .filter((p) => p.kind === "شريك")
      .reduce((sum, p) => sum + p.total_amount, 0);
    const totalPartnerCapitalUsd = 0;

    const totalDebtorsIqd = 0;
    const totalDebtorsUsd = 0;


    const totalExpensesIqd = expenses.reduce((sum, e) => {
      if (e.currency === "USD") return sum;
      return sum + e.amount;
    }, 0);
    const totalExpensesUsd = expenses.reduce((sum, e) => {
      if (e.currency !== "USD") return sum;
      return sum + e.amount;
    }, 0);

    const netCapitalIqd = partners
      .filter((p) => p.kind === "شريك")
      .reduce((sum, p) => sum + (p.iqd_balance ?? 0), 0);
    const netCapitalUsd = partners
      .filter((p) => p.kind === "شريك")
      .reduce((sum, p) => sum + (p.usd_balance ?? 0), 0);

    const qasaIqd = cashIqd + totalInvestmentsIqd;
    const qasaUsd = cashUsd + totalInvestmentsUsd;
    return {
      cash_iqd: cashIqd,
      cash_usd: cashUsd,
      qasa_iqd: qasaIqd,
      qasa_usd: qasaUsd,
      inventory_value_iqd: inventoryValueIqd,
      inventory_value_usd: inventoryValueUsd,
      total_investments_iqd: totalInvestmentsIqd,
      total_investments_usd: totalInvestmentsUsd,
      total_partner_capital_iqd: totalPartnerCapitalIqd,
      total_partner_capital_usd: totalPartnerCapitalUsd,
      total_debtors_iqd: totalDebtorsIqd,
      total_debtors_usd: totalDebtorsUsd,
      total_expenses_iqd: totalExpensesIqd,
      total_expenses_usd: totalExpensesUsd,
      net_capital_iqd: netCapitalIqd,
      net_capital_usd: netCapitalUsd,
      monthly_profits_iqd: 0,
      monthly_profits_usd: 0,
    } as T;
  }

  if (command === "get_partners_totals") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const kind = String(args.kind ?? "شريك").trim();
    let iqd_total = 0;
    let usd_total = 0;
    const partnerTx = allTx.filter((tx) => {
      if (kind === "partners-financial") {
        return tx.kind === "شريك" || tx.kind === "مستثمر" || tx.kind === "ممول" || tx.kind === "زبون" || tx.kind === "شركة";
      }
      if (kind === "customers-only") {
        return tx.kind === "مستثمر" || tx.kind === "ممول" || tx.kind === "زبون" || tx.kind === "شركة";
      }
      if (kind === "partners-only") {
        return tx.kind === "شريك";
      }
      return tx.kind === kind;
    });
    const customerTx = partnerTx.filter((tx) => tx.kind === "زبون");
    if (customerTx.length > 0) {
      iqd_total += calculateCustomerRemaining(customerTx, "IQD");
      usd_total += calculateCustomerRemaining(customerTx, "USD");
    }
    for (const tx of partnerTx) {
      const isUsd = tx.currency === "USD";
      let amount = 0;
      if (tx.kind === "زبون") {
        continue;
      } else {
        amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : tx.type_.startsWith("سحب") ? -tx.amount : 0;
      }
      if (isUsd) usd_total += amount;
      else iqd_total += amount;
    }
    return [iqd_total, usd_total] as unknown as T;
  }

  if (command === "get_unified_accounts") {
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const filtered = partners.filter((p) => p.kind === "ممول" || p.kind === "شركة" || p.kind === "مستثمر" || p.kind === "زبون");

    return filtered.map((p) => {
      const txns = allTx.filter((tx) => tx.partner_name === p.partner_name && tx.kind === p.kind);
      let iqd_balance = 0;
      let usd_balance = 0;
      if (p.kind === "زبون") {
        return {
          partner_name: p.partner_name,
          phone: p.phone,
          iqd_balance: calculateCustomerRemaining(txns, "IQD"),
          usd_balance: calculateCustomerRemaining(txns, "USD"),
          kind: p.kind,
        };
      }
      for (const tx of txns) {
        const isUsd = tx.currency === "USD";
        let signed = 0;
        {
          if (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) {
            signed = tx.amount;
          } else if (tx.type_.startsWith("سحب")) {
            signed = -tx.amount;
          } else {
            continue;
          }
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
        kind: p.kind,
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
      old_agent_name: String(args.old_agent_name ?? args.oldAgentName ?? "").trim(),
      car_type: String(args.car_type ?? args.carType ?? "").trim(),
      car_number: String(args.car_number ?? args.carNumber ?? "").trim(),
      car_model: String(args.car_model ?? args.carModel ?? "").trim(),
      color: String(args.color ?? "").trim(),
      new_agent_name: String(args.new_agent_name ?? args.newAgentName ?? "").trim(),
      phone: String(args.phone ?? "").trim(),
      amount_usd: Number(args.amount_usd ?? args.amountUsd) || 0,
      amount_iqd: Number(args.amount_iqd ?? args.amountIqd) || 0,
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
    return item.id as unknown as T;
  }

  if (command === "update_agency") {
    const existing: any[] = JSON.parse(localStorage.getItem("mock_default") ?? "[]");
    const id = Number(args.id);
    const itemIdx = existing.findIndex((a: any) => a.id === id);
    if (itemIdx >= 0) {
      const oldItem = existing[itemIdx];

      const updatedItem = {
        ...oldItem,
        old_agent_name: String(args.old_agent_name ?? args.oldAgentName ?? "").trim(),
        car_type: String(args.car_type ?? args.carType ?? "").trim(),
        car_number: String(args.car_number ?? args.carNumber ?? "").trim(),
        car_model: String(args.car_model ?? args.carModel ?? "").trim(),
        color: String(args.color ?? "").trim(),
        new_agent_name: String(args.new_agent_name ?? args.newAgentName ?? "").trim(),
        phone: String(args.phone ?? "").trim(),
        amount_usd: Number(args.amount_usd ?? args.amountUsd) || 0,
        amount_iqd: Number(args.amount_iqd ?? args.amountIqd) || 0,
        notes: String(args.notes ?? "").trim(),
      };
      existing[itemIdx] = updatedItem;
      localStorage.setItem("mock_default", JSON.stringify(existing));
    }
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

  if (command === "get_backgrounds") {
    return ["/backgrounds/bg.jpg"] as unknown as T;
  }

  if (command === "rename_background") {
    console.log(`[وضع المتصفح] تم محاكاة إعادة تسمية الخلفية: ${args.filePath}`);
    return "/backgrounds/bg.jpg" as unknown as T;
  }

  if (command === "login") {
    const username = String(args.username ?? "").trim();
    const password = String(args.password ?? "").trim();
    // Mock: any username/password works (except blank)
    if (!username || !password) {
      return { success: false, user: null, error: "اسم المستخدم أو كلمة المرور فارغة" } as T;
    }
    return {
      success: true,
      user: { id: 1, username, display_name: "مدير النظام", profile_image: null },
      error: null,
    } as T;
  }

  if (command === "get_users") {
    return [
      { id: 1, username: "admin", display_name: "مدير النظام", profile_image: null },
      { id: 2, username: "user1", display_name: "مستخدم ١", profile_image: null },
    ] as T;
  }

  if (command === "add_user" || command === "update_user" || command === "change_password" || command === "delete_user") {
    console.log(`[وضع المتصفح] تم محاكاة: ${command}`, args);
    return undefined as T;
  }

  if (command === "settle_company_through_funder") {
    console.log(`[وضع المتصفح] تم محاكاة: ${command}`, args);
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

  const savedUser = localStorage.getItem("app_current_user");
  const adminName = savedUser ? (JSON.parse(savedUser).display_name || JSON.parse(savedUser).username) : null;

  return {
    num: form.num.trim(),
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
    carPartners: null,
    adminName,
  };
}

const E2E_BRIDGE_URL = "http://127.0.0.1:3899/__e2e/invoke";

const isE2E = () =>
  typeof import.meta !== "undefined" &&
  (import.meta as any).env?.VITE_E2E === "1";

async function e2eInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(E2E_BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result as T;
}

export async function callTauri<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (isTauri()) {
    return invoke<T>(command, args);
  }

  if (isE2E()) {
    return e2eInvoke<T>(command, args);
  }

  console.warn(`[وضع المتصفح] استدعاء: ${command}`, args);
  return mockInvoke<T>(command, args);
}
