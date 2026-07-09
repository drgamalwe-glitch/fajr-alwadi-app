import { invoke } from "@tauri-apps/api/core";
import type { Agency, AgencyTransaction, Car, CarFormState, CashRegisterEntry, ExpenseEntry, CarExpenseRecord, Partner, PartnerTransaction, CarPartner } from "../types";
import { compareMoney, moneyAdd, moneyDiv, moneyMul, moneyNeg, moneySub, moneySum, moneyToStorage, toMoney, type MoneyInput, type MoneyValue } from "../utils/money";
import { normalizePhoneNumber } from "../utils/numberInput";

const isTauri = () =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || import.meta.env.TAURI_ENV_PLATFORM != null);

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// WARNING: When adding a new Tauri command that accepts a money argument, add the arg key here.
// Otherwise the value will be sent as a JS number and lose precision.
const MONEY_ARG_KEYS = new Set([
  "amount",
  "actualPaidAmount",
  "actual_paid_amount",
  "amountIqd",
  "amount_iqd",
  "amountPaid",
  "amount_paid",
  "amountRemaining",
  "amount_remaining",
  "amountUsd",
  "amount_usd",
  "cashPrice",
  "cash_price",
  "commissionAmount",
  "commission_amount",
  "commissionValue",
  "commission_value",
  "credit",
  "debit",
  "monthlyPayment",
  "monthly_payment",
  "purchase",
  "purchasePrice",
  "purchase_price",
  "selling",
  "sellingPrice",
  "selling_price",
  // Additional money-like keys used across the codebase
  "cost",
  "cost_price",
  "profit",
  "balance",
  "capital",
  "cash",
  "value",
]);

// Pattern used by the dev-mode runtime check in serializeTauriMoneyArgs to catch money-like
// arg keys that were forgotten in MONEY_ARG_KEYS.
const MONEY_ARG_KEY_PATTERN = /amount|price|payment|cost|profit|balance|capital|commission|monthly|cash|value/i;
const NON_MONEY_ARG_KEYS = new Set([
  "paymentType",
  "payment_type",
  "purchasePaymentType",
  "purchase_payment_type",
  "salePaymentType",
  "sale_payment_type",
]);

const PHONE_ARG_KEYS = new Set(["phone", "buyerPhone", "buyer_phone"]);

function serializeTauriMoneyArgs(value: unknown, key?: string, depth = 0): unknown {
  // Recursion guard: avoid stack overflow on deeply-nested (or cyclic) objects.
  if (depth > 10) return value;
  if (key && PHONE_ARG_KEYS.has(key) && typeof value === "string") {
    return normalizePhoneNumber(value);
  }
  if (key && MONEY_ARG_KEYS.has(key)) {
    return value === null || value === undefined ? value : moneyToStorage(value as MoneyInput);
  }
  // Dev-mode runtime check: warn about money-like keys missing from MONEY_ARG_KEYS.
  if (
    import.meta.env &&
    !import.meta.env.PROD &&
    key &&
    !MONEY_ARG_KEYS.has(key) &&
    !NON_MONEY_ARG_KEYS.has(key) &&
    MONEY_ARG_KEY_PATTERN.test(key) &&
    (typeof value === "string" || typeof value === "number")
  ) {
    console.warn(
      `[serializeTauriMoneyArgs] Arg "${key}" looks like a money field but is not in MONEY_ARG_KEYS. ` +
      `Add it to MONEY_ARG_KEYS to ensure money precision is preserved across the Tauri IPC boundary.`,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeTauriMoneyArgs(item, undefined, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        serializeTauriMoneyArgs(childValue, childKey, depth + 1),
      ]),
    );
  }
  return value;
}

// Obfuscate localStorage mock data (base64 encoding — NOT encryption, for dev mode only)
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
      const mockP = parseJsonArray<Partner>(mockPStr);
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

function parseCommissionAmount(amount: MoneyInput, notes: string | null | undefined): MoneyValue {
  if (!notes) return toMoney(0);
  const parts = notes.split("عمولة:");
  if (parts.length > 1) {
    if (parts[1].includes("%")) {
      const percentPart = parts[1].split("%")[0];
      const pct = toMoney(percentPart.trim());
      if (pct.isPositive()) return moneyDiv(moneyMul(amount, pct), 100);
    } else {
      const commissionVal = toMoney(parts[1].trim());
      if (commissionVal.isPositive()) return commissionVal;
    }
  }
  return toMoney(0);
}

function normalizeVehicleKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s/g, "");
}

function resolveMockCarNumber(existing: Car[], requestedPlate: string, oldNum?: string | null): string {
  const plate = requestedPlate.trim();
  const oldKey = (oldNum ?? "").trim();
  if (oldKey) {
    const oldCar = existing.find((car) => car.car_number === oldKey);
    const oldPlate = oldCar?.car_plate_num || oldCar?.car_number || "";
    if (oldCar && normalizeVehicleKey(oldPlate) === normalizeVehicleKey(plate)) {
      return oldCar.car_number;
    }
  }

  if (!existing.some((car) => car.car_number === plate)) {
    return plate;
  }

  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${plate}#${suffix}`;
    if (!existing.some((car) => car.car_number === candidate)) {
      return candidate;
    }
  }

  return `${plate}#${Date.now()}`;
}

function isCustomerDebit(tx: PartnerTransaction): boolean {
  return !tx.type_.startsWith("تحويل") &&
    !tx.type_.startsWith("واصل") &&
    (tx.type_.startsWith("باقي") || tx.type_.startsWith("سحب"));
}

function isCustomerManualPayment(tx: PartnerTransaction): boolean {
  if (
    !["ايداع", "إيداع", "مقدمة", "استلام", "إستلام", "تسديد", "واصل", "واصل قسط"].includes(tx.type_) &&
    !tx.type_.startsWith("تسديد قسط سيارة")
  ) {
    return false;
  }
  if (tx.source_type === "customer_installment_schedule" || tx.source_type === "customer_sale_payment") {
    return false;
  }
  if (tx.related_source_type === "customer_payment_event") {
    return false;
  }
  return true;
}

function calculateCustomerRemaining(txns: PartnerTransaction[], currency?: "IQD" | "USD"): MoneyValue {
  const scoped = txns.filter((tx) =>
    (!currency || (tx.currency || "IQD") === currency) &&
    (tx.is_reversed ?? 0) === 0 &&
    !tx.type_.startsWith("تحويل")
  );
  return moneySub(
    moneySum(scoped.filter((tx) => isCustomerDebit(tx)), (tx) => tx.amount),
    moneySum(scoped.filter((tx) => isCustomerManualPayment(tx)), (tx) => tx.amount),
  );
}

function mapMockCar(args: any): Car {
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
    purchase_price: toMoney(args.purchase),
    selling_price: toMoney(args.selling),
    status,
    payment_type: status === "مبيوعة" ? paymentType ?? "كاش" : undefined,
    cash_price: status === "مبيوعة" && (paymentType === "كاش" || paymentType === "موعد") ? toMoney(args.cash_price ?? args.cashPrice ?? args.amountPaid ?? args.amount_paid) : toMoney(0),
    amount_paid: status === "مبيوعة" ? toMoney(args.amount_paid ?? args.amountPaid) : toMoney(0),
    amount_remaining: toMoney(args.amount_remaining ?? args.amountRemaining),
    installment_months: Number(args.installment_months ?? args.installmentMonths) || 0,
    monthly_payment: toMoney(args.monthly_payment ?? args.monthlyPayment),
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
    commission_value: toMoney(args.commission_value ?? args.commissionValue),
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

  if (kind === "زبون" || kind === "وكالة") {
    partners[pIdx].iqd_balance = calculateCustomerRemaining(txns, "IQD");
    partners[pIdx].usd_balance = calculateCustomerRemaining(txns, "USD");
    partners[pIdx].total_amount = calculateCustomerRemaining(txns);
  } else {
    partners[pIdx].total_amount = txns.reduce((total, tx) => {
      if (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة")) return moneyAdd(total, tx.amount);
      if (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) return moneySub(total, tx.amount);
      return total;
    }, toMoney(0));
  }
  localStorage.setItem("mock_partners", JSON.stringify(partners));
}

function normalizeMockAgencyPaymentStatus(value: unknown): Agency["payment_status"] {
  return value === "غير واصل" ? "غير واصل" : "واصل";
}

function normalizeMockAgency(agency: Agency): Agency {
  return {
    ...agency,
    payment_status: normalizeMockAgencyPaymentStatus(agency.payment_status),
  };
}

function syncMockAgencyReceivable(agency: Agency) {
  const txKey = "mock_partner_transactions";
  const allTx = parseJsonArray<PartnerTransaction>(localStorage.getItem(txKey));
  const sourceId = String(agency.id);
  const affectedCustomers = new Set(
    allTx
      .filter((tx) => (tx.kind === "زبون" || tx.kind === "وكالة") && tx.source_type === "agency" && tx.source_id === sourceId)
      .map((tx) => tx.partner_name),
  );
  const nextTx = allTx.filter((tx) => !(tx.source_type === "agency" && tx.source_id === sourceId));

  if (normalizeMockAgencyPaymentStatus(agency.payment_status) === "غير واصل") {
    const customerName = agency.new_agent_name.trim();
    if (customerName) {
      const partnersKey = "mock_partners";
      const partners = parseJsonArray<Partner>(localStorage.getItem(partnersKey));
      const phone = String(agency.phone ?? "").trim();
      const existingIdx = partners.findIndex((p) => p.partner_name === customerName && p.kind === "وكالة");
      if (existingIdx >= 0) {
        if (phone) partners[existingIdx] = { ...partners[existingIdx], phone };
      } else {
        partners.push({
          partner_name: customerName,
          phone,
          total_amount: 0,
          iqd_balance: 0,
          usd_balance: 0,
          total_withdrawals: 0,
          kind: "وكالة",
        });
      }
      localStorage.setItem(partnersKey, JSON.stringify(partners));

      const makeTx = (amount: MoneyValue, currency: "IQD" | "USD", offset: number): PartnerTransaction => ({
        id: Date.now() + offset,
        partner_name: customerName,
        kind: "وكالة",
        type_: "باقي وكالة",
        amount,
        date: agency.date,
        time: agency.time || new Date().toTimeString().slice(0, 5),
        notes: agency.notes ? `غير واصل وكالة - ${agency.notes}` : "غير واصل وكالة",
        currency,
        paymentType: "قاصه",
        payment_type: "قاصه",
        source_type: "agency",
        source_id: sourceId,
        source_role: "agency_receivable",
        affects_qasa: 0,
        affects_partner_cash: 0,
        affects_profit: 0,
        related_source_type: "agency",
        related_source_id: sourceId,
      });

      if (compareMoney(agency.amount_iqd, 0) > 0) nextTx.push(makeTx(agency.amount_iqd, "IQD", 1));
      if (compareMoney(agency.amount_usd, 0) > 0) nextTx.push(makeTx(agency.amount_usd, "USD", 2));
      affectedCustomers.add(customerName);
    }
  }

  localStorage.setItem(txKey, JSON.stringify(nextTx));
  for (const name of affectedCustomers) {
    recalculateMockPartnerTotal(name, "زبون");
    recalculateMockPartnerTotal(name, "وكالة");
  }
}

// ============================================================================
// MOCK LAYER (development / preview only)
// ----------------------------------------------------------------------------
// NOTE: Mock layer uses `as unknown as T` for brevity. In production, replace
// with proper runtime validation (e.g., zod schemas).
// ============================================================================

// Audit fix #30: shared mock profit calculation (Instructions.md §5 formula):
// cash car sale profits (INCLUDING losses) + installment payment profits +
// agency profits − general expenses, all within [startDate, endDate].
function computeMockProfitTotals(startDate: string, endDate: string): {
  profitIqd: MoneyValue;
  profitUsd: MoneyValue;
  expensesIqd: MoneyValue;
  expensesUsd: MoneyValue;
} {
  const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
  const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");
  const cars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
  const carExpensesList: CarExpenseRecord[] = JSON.parse(localStorage.getItem("mock_car_expenses") ?? "[]");

  let profitIqd: MoneyValue = toMoney(0);
  let profitUsd: MoneyValue = toMoney(0);

  for (const c of cars) {
    if (c.status === "مبيوعة" && (c.payment_type || "كاش") === "كاش" && c.sale_date) {
      if (c.sale_date >= startDate && c.sale_date <= endDate) {
        const carExpenses = carExpensesList.filter((e) => e.car_number === c.car_number);
        const expensesSum = moneySum(carExpenses, (e) => e.amount);
        const totalCost = moneyAdd(c.purchase_price, expensesSum);
        const carProfit = moneySub(c.selling_price, totalCost);
        // Losses must reduce net profit too (Instructions.md §24.1).
        if (compareMoney(carProfit, 0) !== 0) {
          if (c.sale_currency === "USD") {
            profitUsd = moneyAdd(profitUsd, carProfit);
          } else {
            profitIqd = moneyAdd(profitIqd, carProfit);
          }
        }
      }
    }
  }

  for (const tx of allTx) {
    if (tx.kind === "زبون" && (tx.source_role === "cash_movement" || (tx.type_ || "").includes("تسديد") || (tx.type_ || "").includes("واصل"))) {
      if (tx.date >= startDate && tx.date <= endDate) {
        const carNumber = tx.related_source_id || (tx.notes ? tx.notes.match(/#بيع_سيارة_([^\s]+)/)?.[1] : null);
        if (carNumber) {
          const c = cars.find((car) => car.car_number === carNumber);
          if (c && c.payment_type === "اقساط") {
            const carExpenses = carExpensesList.filter((e) => e.car_number === c.car_number);
            const expensesSum = moneySum(carExpenses, (e) => e.amount);
            const totalCost = moneyAdd(c.purchase_price, expensesSum);
            const fullProfit = moneySub(c.selling_price, totalCost);
            if (compareMoney(fullProfit, 0) !== 0 && compareMoney(c.selling_price, 0) > 0) {
              const profitRatio = moneyDiv(fullProfit, c.selling_price);
              const paymentProfit = moneyMul(tx.amount, profitRatio);
              if (c.sale_currency === "USD") {
                profitUsd = moneyAdd(profitUsd, paymentProfit);
              } else {
                profitIqd = moneyAdd(profitIqd, paymentProfit);
              }
            }
          }
        }
      }
    }
  }

  const agencies = parseJsonArray<Agency>(localStorage.getItem("mock_default"));
  for (const a of agencies) {
    if (a.date >= startDate && a.date <= endDate) {
      if (compareMoney(a.amount_iqd, 0) > 0) {
        profitIqd = moneyAdd(profitIqd, a.amount_iqd);
      }
      if (compareMoney(a.amount_usd, 0) > 0) {
        profitUsd = moneyAdd(profitUsd, a.amount_usd);
      }
    }
  }

  let expensesIqd: MoneyValue = toMoney(0);
  let expensesUsd: MoneyValue = toMoney(0);
  for (const e of expenses) {
    if (!e.car_number && e.date >= startDate && e.date <= endDate) {
      if (e.currency === "USD") {
        expensesUsd = moneyAdd(expensesUsd, e.amount);
      } else {
        expensesIqd = moneyAdd(expensesIqd, e.amount);
      }
    }
  }

  return { profitIqd, profitUsd, expensesIqd, expensesUsd };
}

async function mockInvoke<T>(
  command: string,
  args: any = {},
): Promise<T> {
  // Production guard: the mock layer MUST never be reachable from a production
  // build. If you see this error in prod, it means isTauri() / isE2E() failed
  // to detect the runtime correctly and the fallback was triggered.
  if (import.meta.env.PROD) {
    throw new Error("Mock layer disabled in production build");
  }
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
      car.expenses_sum = moneySum(carExpenses, (e) => e.amount);
    }
    return cars as unknown as T;
  }

  if (command === "add_car") {
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const plateNum = String(args.num ?? "").trim();
    const oldNum = String(args.oldNum ?? args.old_num ?? "").trim();
    const carNumber = resolveMockCarNumber(existing, plateNum, oldNum);
    const oldCar = existing.find((c) => c.car_number === carNumber);

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hh}:${mm}`;

    const purchase_time = args.purchase_time ?? args.purchaseTime ?? oldCar?.purchase_time ?? (args.purchase_date || args.purchaseDate ? currentTime : null);
    const sale_time = args.sale_time ?? args.saleTime ?? oldCar?.sale_time ?? (args.sale_date || args.saleDate ? currentTime : null);

    const item = {
      ...mapMockCar({ ...args, num: carNumber }),
      car_number: carNumber,
      car_plate_num: plateNum,
      purchase_time: purchase_time ? String(purchase_time) : null,
      sale_time: sale_time ? String(sale_time) : null,
    };
    const next = existing.filter((c) => c.car_number !== item.car_number && (!oldNum || c.car_number !== oldNum));
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
    const sellingPrice = toMoney(args.sellingPrice ?? args.selling_price);
    const saleCurrency = String(args.saleCurrency ?? args.sale_currency ?? "IQD");
    const saleDate = String(args.saleDate ?? args.sale_date ?? "");
    const paymentType = String(args.paymentType ?? args.payment_type ?? "كاش");
    const amountPaid = toMoney(args.amountPaid ?? args.amount_paid);
    const amountRemaining = toMoney(args.amountRemaining ?? args.amount_remaining);
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
      if (p.kind === "زبون" || p.kind === "وكالة") {
        p.iqd_balance = calculateCustomerRemaining(txns, "IQD");
        p.usd_balance = calculateCustomerRemaining(txns, "USD");
        p.total_amount = calculateCustomerRemaining(txns);
        continue;
      }
      p.total_amount = txns.reduce((total, tx) => {
        if (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة")) return moneyAdd(total, tx.amount);
        if (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) return moneySub(total, tx.amount);
        return total;
      }, toMoney(0));
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
      .filter((tx) => tx.partner_name === partnerName && tx.kind === kind && (tx.source_role ?? '') !== 'profit_recognition')
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
      if (compareMoney(commissionAmount, 0) > 0) {
        await mockInvoke("add_expense", {
          description: "عمولة تسديد تمويل",
          amount: commissionAmount,
          date: newTx.date,
          notes: `عمولة تسديد الممول ${partnerName} (رقم الحركة: ${newTx.id})`,
          currency: newTx.currency || "IQD",
        });
      }
    }
    return newTx.id as unknown as T;
  }

  if (command === "pay_financier_from_partners") {
    const financierName = String(args.financier_name ?? args.financierName ?? "").trim();
    const financierKind = String(args.financier_kind ?? args.financierKind ?? "ممول").trim();
    const amount = toMoney(args.amount);
    const date = String(args.date ?? "");
    const currency = (args.currency as string) || "IQD";

    const commissionAmount = toMoney(args.commission_amount ?? args.commissionAmount);

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

    if (compareMoney(commissionAmount, 0) > 0) {
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
    const amount = toMoney(args.amount);
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

      if (compareMoney(commissionAmount, 0) > 0) {
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
        let amount: MoneyValue = 0;
        if (isDeposit) {
          amount = tx.amount;
        } else if (isWithdrawal) {
          amount = moneyNeg(tx.amount);
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

      let iqdRunning = toMoney(0);
      let usdRunning = toMoney(0);
      for (const e of entries) {
        const curr = e.currency === "USD" ? "USD" : "IQD";
        if (curr === "USD") {
          usdRunning = moneyAdd(usdRunning, e.amount);
          e.balance = usdRunning;
        } else {
          iqdRunning = moneyAdd(iqdRunning, e.amount);
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
      if (c.purchase_date && compareMoney(c.purchase_price, 0) > 0) {
        const purchaseType = c.purchase_type || "كاش";
        let type_: string;
        let amount: MoneyValue;
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
          amount = moneyNeg(c.purchase_price);
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
          if (tx.type_.startsWith("سحب شراء") || tx.type_.startsWith("ايداع بيع سيارة") || tx.type_.startsWith("سحب مصروف") || tx.type_.startsWith("ايداع ارباح وكالة")) {
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
        let amount: MoneyValue;
        switch (tx.kind) {
          case "شريك":
            if (filterType) {
              const isQasaFilter = filterType === "قاصه" || filterType === "قاصة";
              if (isQasaFilter && (tx.affects_qasa ?? 1) !== 1) continue;
              if (!isQasaFilter && (tx.affects_partner_cash ?? 1) !== 1) continue;
            }
            type_ = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? "ايداع شريك" : "سحب شريك";
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : moneyNeg(tx.amount);
            break;
          case "مستثمر":
            type_ = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? "ايداع مستثمر" : "سحب مستثمر";
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : moneyNeg(tx.amount);
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
              amount = moneyNeg(tx.amount);
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
              amount = moneyNeg(tx.amount);
            } else {
              continue;
            }
            break;
          default:
            type_ = `${tx.kind} ${tx.type_}`;
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : moneyNeg(tx.amount);
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
        const agencies = parseJsonArray<Agency>(localStorage.getItem("mock_default"));
        for (const a of agencies) {
          if (normalizeMockAgencyPaymentStatus(a.payment_status) !== "واصل") continue;
          const desc = `أرباح وكالة ${a.old_agent_name} ← ${a.new_agent_name}`;
          if (compareMoney(a.amount_iqd, 0) > 0) {
            entries.push({
              id: 0, date: a.date, time: a.time ?? "00:00", type_: "أرباح وكالة",
              amount: a.amount_iqd,
              description: desc,
              notes: null, balance: 0,
              currency: "IQD",
            });
          }
          if (compareMoney(a.amount_usd, 0) > 0) {
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
            amount: moneyNeg(e.amount),
            description: e.description,
            notes: e.notes, balance: 0,
            currency: e.currency || "IQD",
          });
        }
      }
    }

    // ترتيب حسب التاريخ ثم الوقت (من الأقدم للأحدث)
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    let iqdRunning = toMoney(0);
    let usdRunning = toMoney(0);
    for (const e of entries) {
      const curr = e.currency === "USD" ? "USD" : "IQD";
      if (curr === "USD") {
        usdRunning = moneyAdd(usdRunning, e.amount);
        e.balance = usdRunning;
      } else {
        iqdRunning = moneyAdd(iqdRunning, e.amount);
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
        amount: toMoney(args.amount),
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
        amount: toMoney(args.amount),
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
          amount: toMoney(args.amount),
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
      amount: toMoney(args.amount),
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

  if (command === "get_profit_distribution_summary") {
    const startDate = args.startDate ? String(args.startDate) : "1970-01-01";
    const endDate = args.endDate ? String(args.endDate) : "9999-12-31";

    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");

    const { profitIqd, profitUsd, expensesIqd, expensesUsd } = computeMockProfitTotals(startDate, endDate);

    const sharikPartners = partners.filter((p) => p.kind === "شريك");
    // Audit fix #11 (mock parity): divide by the actual partner count so the sum of
    // the shares always equals the total profit.
    const shareCount = Math.max(sharikPartners.length, 1);
    const partnersList = sharikPartners.map((p) => {
      let drawingsIqd = toMoney(0);
      let drawingsUsd = toMoney(0);
      const partnerTx = allTx.filter(
        (tx) =>
          tx.partner_name === p.partner_name &&
          tx.kind === "شريك" &&
          tx.type_ === "سحب شريك" &&
          tx.date >= startDate &&
          tx.date <= endDate
      );
      for (const tx of partnerTx) {
        if (tx.currency === "USD") {
          drawingsUsd = moneyAdd(drawingsUsd, tx.amount);
        } else {
          drawingsIqd = moneyAdd(drawingsIqd, tx.amount);
        }
      }

      return {
        partner_name: p.partner_name,
        profit_iqd: moneyDiv(profitIqd, shareCount),
        profit_usd: moneyDiv(profitUsd, shareCount),
        drawings_iqd: drawingsIqd,
        drawings_usd: drawingsUsd,
      };
    });

    const totalDrawingsIqd = moneySum(partnersList, (p) => p.drawings_iqd);
    const totalDrawingsUsd = moneySum(partnersList, (p) => p.drawings_usd);

    const undistributedIqd = moneySub(moneySub(profitIqd, totalDrawingsIqd), expensesIqd);
    const undistributedUsd = moneySub(moneySub(profitUsd, totalDrawingsUsd), expensesUsd);

    return {
      undistributed_iqd: undistributedIqd,
      undistributed_usd: undistributedUsd,
      partners: partnersList,
      expenses_iqd: expensesIqd,
      expenses_usd: expensesUsd,
    } as T;
  }

  if (command === "get_financial_summary") {
    const paymentType = args.payment_type ? String(args.payment_type).trim() : null;
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");
    const cars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");

    let cashIqd = toMoney(0);
    let cashUsd = toMoney(0);

    if (paymentType === "الكاش") {
      // cash = sum of all شريك partner balances (deposits - withdrawals)
      for (const tx of allTx) {
        if (tx.kind !== "شريك") continue;
        const isUsd = tx.currency === "USD";
        const isDeposit = tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة") || tx.type_.startsWith("استلام") || tx.type_.startsWith("إستلام") || tx.type_.startsWith("إعادة استثمار") || tx.type_.startsWith("تسوية") || tx.type_.startsWith("تسديد");
        const isWithdrawal = tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي");
        if (tx.type_.includes("تحويل")) continue;
        if (isDeposit) {
          if (isUsd) cashUsd = moneyAdd(cashUsd, tx.amount);
          else cashIqd = moneyAdd(cashIqd, tx.amount);
        } else if (isWithdrawal) {
          if (isUsd) cashUsd = moneySub(cashUsd, tx.amount);
          else cashIqd = moneySub(cashIqd, tx.amount);
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
        if (tx.type_.startsWith("سحب شراء") || tx.type_.startsWith("ايداع بيع سيارة") || tx.type_.startsWith("سحب مصروف") || tx.type_.startsWith("ايداع ارباح وكالة")) {
          continue;
        }

        const isUsd = tx.currency === "USD";
        let amount: MoneyValue = 0;
        let valid = false;

        switch (tx.kind) {
          case "شريك":
          case "مستثمر":
            valid = true;
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : moneyNeg(tx.amount);
            break;
          case "ممول":
            valid = true;
            amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : moneyNeg(tx.amount);
            break;
          case "زبون":
            if (tx.type_.startsWith("مقدمة بيع سيارة") || tx.type_.startsWith("مقدمة سيارة") || tx.type_.startsWith("تسديد قسط سيارة")) {
              valid = true;
              amount = tx.amount;
            } else if (tx.type_.startsWith("تحويل الى القاصة") || tx.type_.startsWith("تحويل قسط الى القاصة") || tx.type_.startsWith("تحويل باقي قسط الى القاصة")) {
              valid = true;
              amount = moneyNeg(tx.amount);
            }
            break;
        }

        if (valid) {
          if (isUsd) cashUsd = moneyAdd(cashUsd, amount);
          else cashIqd = moneyAdd(cashIqd, amount);
        }
      }

      // Add cash car sales and deduct cash car purchases
      for (const c of cars) {
        const carPaymentType = String(c.purchase_payment_type || "قاصه");
        const matchesPurchaseType = !paymentType ||
          ((paymentType === "قاصه" || paymentType === "قاصة")
            ? (carPaymentType === "قاصه" || carPaymentType === "قاصة")
            : carPaymentType === paymentType);

        if (matchesPurchaseType && c.purchase_date && compareMoney(c.purchase_price, 0) > 0 && c.purchase_type !== "دين" && c.purchase_type !== "تمويل" && c.purchase_type !== "شركة") {
          const isUsd = c.currency === "USD";
          if (isUsd) cashUsd = moneySub(cashUsd, c.purchase_price);
          else cashIqd = moneySub(cashIqd, c.purchase_price);
        }

        const salePaymentType = String(c.sale_payment_type || c.payment_type || "قاصه");
        const matchesSaleType = !paymentType ||
          ((paymentType === "قاصه" || paymentType === "قاصة")
            ? (salePaymentType === "قاصه" || salePaymentType === "قاصة")
            : salePaymentType === paymentType);

        if (matchesSaleType && c.status === "مبيوعة" && c.payment_type === "كاش" && c.sale_date) {
          const isUsd = c.sale_currency === "USD";
          if (isUsd) cashUsd = moneyAdd(cashUsd, c.selling_price);
          else cashIqd = moneyAdd(cashIqd, c.selling_price);
        }
      }

      // Add agency profits
      const agencies = parseJsonArray<Agency>(localStorage.getItem("mock_default"));
      for (const a of agencies) {
        if (normalizeMockAgencyPaymentStatus(a.payment_status) !== "واصل") continue;
        if (compareMoney(a.amount_iqd, 0) > 0) {
          cashIqd = moneyAdd(cashIqd, a.amount_iqd);
        }
        if (compareMoney(a.amount_usd, 0) > 0) {
          cashUsd = moneyAdd(cashUsd, a.amount_usd);
        }
      }

      // Deduct expenses
      const mockExpenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");
      for (const e of mockExpenses) {
        const isUsd = e.currency === "USD";
        if (isUsd) cashUsd = moneySub(cashUsd, e.amount);
        else cashIqd = moneySub(cashIqd, e.amount);
      }
    }

    // Inventory Value
    const carExpensesList: CarExpenseRecord[] = JSON.parse(localStorage.getItem("mock_car_expenses") ?? "[]");
    const inventoryValueIqd = moneySum(
      cars.filter((c) => c.status === "متوفرة" && c.currency !== "USD"),
      (c) => {
        const carExpenses = carExpensesList.filter((e) => e.car_number === c.car_number);
        const expensesSum = moneySum(carExpenses, (e) => e.amount);
        return moneyAdd(c.purchase_price, expensesSum);
      },
    );
    const inventoryValueUsd = moneySum(
      cars.filter((c) => c.status === "متوفرة" && c.currency === "USD"),
      (c) => {
        const carExpenses = carExpensesList.filter((e) => e.car_number === c.car_number);
        const expensesSum = moneySum(carExpenses, (e) => e.amount);
        return moneyAdd(c.purchase_price, expensesSum);
      },
    );

    const totalInvestmentsIqd = partners
      .filter((p) => p.kind === "مستثمر" && compareMoney(p.total_amount, 0) > 0)
      .reduce((sum, p) => moneyAdd(sum, p.total_amount), toMoney(0));
    const totalInvestmentsUsd = toMoney(0);

    const totalPartnerCapitalIqd = partners
      .filter((p) => p.kind === "شريك")
      .reduce((sum, p) => moneyAdd(sum, p.total_amount), toMoney(0));
    const totalPartnerCapitalUsd = toMoney(0);

    const totalDebtorsIqd = toMoney(0);
    const totalDebtorsUsd = toMoney(0);


    const totalExpensesIqd = moneySum(expenses.filter((e) => e.currency !== "USD"), (e) => e.amount);
    const totalExpensesUsd = moneySum(expenses.filter((e) => e.currency === "USD"), (e) => e.amount);

    const netCapitalIqd = partners
      .filter((p) => p.kind === "شريك")
      .reduce((sum, p) => moneyAdd(sum, p.iqd_balance ?? 0), toMoney(0));
    const netCapitalUsd = partners
      .filter((p) => p.kind === "شريك")
      .reduce((sum, p) => moneyAdd(sum, p.usd_balance ?? 0), toMoney(0));

    const qasaIqd = moneyAdd(cashIqd, totalInvestmentsIqd);
    const qasaUsd = moneyAdd(cashUsd, totalInvestmentsUsd);

    // Audit fix #30: monthly profits are computed (profit − general expenses since
    // the first day of the current month), mirroring the backend formula instead
    // of a hardcoded zero.
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthly = computeMockProfitTotals(monthStart, "9999-12-31");
    const monthlyProfitsIqd = moneySub(monthly.profitIqd, monthly.expensesIqd);
    const monthlyProfitsUsd = moneySub(monthly.profitUsd, monthly.expensesUsd);

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
      monthly_profits_iqd: monthlyProfitsIqd,
      monthly_profits_usd: monthlyProfitsUsd,
    } as T;
  }

  if (command === "get_partners_totals") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const kind = String(args.kind ?? "شريك").trim();
    let iqd_total = toMoney(0);
    let usd_total = toMoney(0);
    const partnerTx = allTx.filter((tx) => {
      if (kind === "partners-financial") {
        return tx.kind === "شريك" || tx.kind === "مستثمر" || tx.kind === "ممول" || tx.kind === "زبون" || tx.kind === "وكالة" || tx.kind === "شركة";
      }
      if (kind === "customers-only") {
        return tx.kind === "مستثمر" || tx.kind === "ممول" || tx.kind === "زبون" || tx.kind === "وكالة" || tx.kind === "شركة";
      }
      if (kind === "partners-only") {
        return tx.kind === "شريك";
      }
      return tx.kind === kind;
    });
    const customerTx = partnerTx.filter((tx) => tx.kind === "زبون" || tx.kind === "وكالة");
    if (customerTx.length > 0) {
      iqd_total = moneyAdd(iqd_total, calculateCustomerRemaining(customerTx, "IQD"));
      usd_total = moneyAdd(usd_total, calculateCustomerRemaining(customerTx, "USD"));
    }
    for (const tx of partnerTx) {
      if (tx.kind === "زبون" || tx.kind === "وكالة") continue;
      // Skip profit recognition rows — they don't affect cash
      if ((tx.source_role ?? '') === 'profit_recognition') continue;
      if ((tx.affects_profit ?? 0) === 1 && (tx.affects_partner_cash ?? 1) === 0) continue;
      if ((tx.affects_partner_cash ?? 1) === 0) continue;
      const isUsd = tx.currency === "USD";
      let amount: MoneyValue = 0;
      if (tx.kind === "شريك") {
        // For partners: deposits add, withdrawals subtract
        if (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة")
          || tx.type_.startsWith("استلام") || tx.type_.startsWith("إستلام") || tx.type_.startsWith("تسديد")
          || tx.type_.startsWith("إعادة استثمار") || tx.type_.startsWith("تسوية") || tx.type_.startsWith("دفعة")) {
          amount = tx.amount;
        } else if (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) {
          amount = moneyNeg(tx.amount);
        }
      } else {
        amount = (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) ? tx.amount : tx.type_.startsWith("سحب") ? moneyNeg(tx.amount) : 0;
      }
      if (isUsd) usd_total = moneyAdd(usd_total, amount);
      else iqd_total = moneyAdd(iqd_total, amount);
    }
    return [iqd_total, usd_total] as unknown as T;
  }

  if (command === "get_unified_accounts") {
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const filtered = partners.filter((p) => p.kind === "ممول" || p.kind === "شركة" || p.kind === "مستثمر" || p.kind === "زبون" || p.kind === "وكالة");

    return filtered.map((p) => {
      const txns = allTx.filter((tx) => tx.partner_name === p.partner_name && tx.kind === p.kind);
      let iqd_balance = toMoney(0);
      let usd_balance = toMoney(0);
      if (p.kind === "زبون" || p.kind === "وكالة") {
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
        let signed: MoneyValue = 0;
        {
          if (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) {
            signed = tx.amount;
          } else if (tx.type_.startsWith("سحب")) {
            signed = moneyNeg(tx.amount);
          } else {
            continue;
          }
        }
        if (isUsd) {
          usd_balance = moneyAdd(usd_balance, signed);
        } else {
          iqd_balance = moneyAdd(iqd_balance, signed);
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
    return parseJsonArray<Agency>(raw).map(normalizeMockAgency) as T;
  }

  if (command === "add_agency") {
    const existing = parseJsonArray<Agency>(localStorage.getItem(key));
    const creationToken = String(args.creation_token ?? args.creationToken ?? "").trim();
    if (creationToken) {
      const existingByToken = existing.find((agency) =>
        (agency as Agency & { creation_token?: string }).creation_token === creationToken
      );
      if (existingByToken) return existingByToken.id as unknown as T;
    }
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
      amount_usd: toMoney(args.amount_usd ?? args.amountUsd),
      amount_iqd: toMoney(args.amount_iqd ?? args.amountIqd),
      notes: String(args.notes ?? "").trim(),
      payment_status: normalizeMockAgencyPaymentStatus(args.payment_status ?? args.paymentStatus),
      date: `${y}-${m}-${d}`,
      time: `${hh}:${mm}`,
      creation_token: creationToken || undefined,
    };
    const idx = existing.findIndex((a) => a.id === item.id);
    if (idx >= 0) {
      existing[idx] = item;
    } else {
      existing.push(item);
    }
    localStorage.setItem(key, JSON.stringify(existing));
    syncMockAgencyReceivable(item);
    return item.id as unknown as T;
  }

  if (command === "update_agency") {
    const existing = parseJsonArray<Agency>(localStorage.getItem("mock_default"));
    const id = Number(args.id);
    const itemIdx = existing.findIndex((a) => a.id === id);
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
        amount_usd: toMoney(args.amount_usd ?? args.amountUsd),
        amount_iqd: toMoney(args.amount_iqd ?? args.amountIqd),
        notes: String(args.notes ?? "").trim(),
        payment_status: normalizeMockAgencyPaymentStatus(args.payment_status ?? args.paymentStatus),
      };
      existing[itemIdx] = updatedItem;
      localStorage.setItem("mock_default", JSON.stringify(existing));
      syncMockAgencyReceivable(updatedItem);
    }
    return undefined as T;
  }

  if (command === "set_agency_receivable_status") {
    const transactionId = Number(args.transaction_id ?? args.transactionId);
    const paid = Boolean(args.paid);
    const allTx = parseJsonArray<PartnerTransaction>(localStorage.getItem("mock_partner_transactions"));
    const tx = allTx.find((item) =>
      item.id === transactionId &&
      item.kind === "وكالة" &&
      item.source_type === "agency" &&
      item.source_role === "agency_receivable"
    );
    if (!tx) {
      throw new Error("تعذر العثور على مديونية الوكالة المرتبطة بهذه الحركة");
    }
    const agencyId = Number(tx.source_id);
    const existing = parseJsonArray<Agency>(localStorage.getItem("mock_default")).map(normalizeMockAgency);
    const itemIdx = existing.findIndex((agency) => agency.id === agencyId);
    if (itemIdx < 0) {
      throw new Error("تعذر العثور على الوكالة المرتبطة بهذه الحركة");
    }
    const updatedItem: Agency = {
      ...existing[itemIdx],
      payment_status: paid ? "واصل" : "غير واصل",
    };
    existing[itemIdx] = updatedItem;
    localStorage.setItem("mock_default", JSON.stringify(existing));
    syncMockAgencyReceivable(updatedItem);
    return undefined as T;
  }

  if (command === "delete_agency") {
    const existing = parseJsonArray<Agency>(localStorage.getItem(key));
    const targetId = Number(args.id) || 0;
    const removed = existing.find((a) => a.id === targetId);
    const next = existing.filter((a) => a.id !== targetId);
    localStorage.setItem(key, JSON.stringify(next));
    const txKey = "mock_agency_transactions";
    const allTx = parseJsonArray<AgencyTransaction>(localStorage.getItem(txKey));
    localStorage.setItem(txKey, JSON.stringify(allTx.filter((t) => t.agency_id !== targetId)));
    if (removed) {
      syncMockAgencyReceivable({ ...removed, payment_status: "واصل" });
    }
    return undefined as T;
  }

  if (command === "get_agency_transactions") {
    const agencyId = Number(args.agency_id) || 0;
    const raw = localStorage.getItem(key);
    const all = parseJsonArray<AgencyTransaction>(raw);
    return all.filter((t) => t.agency_id === agencyId) as T;
  }

  if (command === "add_agency_transaction") {
    const allTx = parseJsonArray<AgencyTransaction>(localStorage.getItem(key));
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    allTx.push({
      id: Date.now(),
      agency_id: Number(args.agency_id) || 0,
      date: String(args.date ?? ""),
      time: String(args.time ?? `${hh}:${mm}`),
      type_: String(args.type_ ?? "ايداع"),
      amount: toMoney(args.amount),
      currency: String(args.currency ?? "IQD"),
      notes: args.notes ? String(args.notes) : null,
    });
    localStorage.setItem(key, JSON.stringify(allTx));
    return undefined as T;
  }

  if (command === "delete_agency_transaction") {
    const allTx = parseJsonArray<AgencyTransaction>(localStorage.getItem(key));
    const targetId = Number(args.id) || 0;
    localStorage.setItem(key, JSON.stringify(allTx.filter((t) => t.id !== targetId)));
    return undefined as T;
  }

  if (command === "get_backgrounds") {
    return [
      "/backgrounds/bg.jpg",
      "/backgrounds/bg1.jpg",
      "/backgrounds/bg2.jpg",
      "/backgrounds/b22g.jpg"
    ] as unknown as T;
  }

  if (command === "get_selected_background") {
    return (localStorage.getItem("app_selected_background") || "/backgrounds/bg.jpg") as unknown as T;
  }

  if (command === "set_selected_background") {
    const background = String(args.background ?? "/backgrounds/bg.jpg");
    localStorage.setItem("app_selected_background", background);
    return background as unknown as T;
  }

  if (command === "rename_background") {
    return "/backgrounds/bg.jpg" as unknown as T;
  }

  if (command === "login") {
    // MOCK ONLY — never use in production. Real auth handled by Rust backend.
    const username = String(args.username ?? "").trim();
    const password = String(args.password ?? "").trim();
    // Mock: any username/password works (except blank)
    if (!username || !password) {
      return { success: false, user: null, error: "اسم المستخدم أو كلمة المرور فارغة" } as T;
    }
    // Bug AU3: Mock also issues a fake session token so the frontend code path
    // exercises the session-token plumbing even in dev mode.
    const mockSessionToken = Array.from({ length: 64 }, () =>
      "0123456789abcdef"[Math.floor(Math.random() * 16)],
    ).join("");
    return {
      success: true,
      user: { id: 1, username, display_name: "مدير النظام", profile_image: null },
      error: null,
      password_change_required: false,
      session_token: mockSessionToken,
    } as T;
  }

  if (command === "logout") {
    // Bug AU3: Mock logout — no-op in dev mode.
    return undefined as T;
  }

  if (command === "get_users") {
    return [
      { id: 1, username: "admin", display_name: "مدير النظام", profile_image: null },
      { id: 2, username: "user1", display_name: "مستخدم ١", profile_image: null },
    ] as T;
  }

  if (command === "add_user" || command === "update_user" || command === "change_password" || command === "delete_user") {
    return undefined as T;
  }

  if (command === "settle_company_through_funder") {
    return undefined as T;
  }

  if (command === "update_customer_sale_down_payment") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.transactionId ?? args.transaction_id);
    const amount = toMoney(args.amount);
    const date = String(args.date ?? "");
    const notes = args.notes ? String(args.notes) : null;
    const currency = (args.currency as string) || "IQD";
    const paymentType = ((args.payment_type ?? args.paymentType ?? "قاصه") as string);

    const tx = allTx.find((item) => item.id === id);
    if (!tx) throw new Error("هذه الحركة ليست مقدمة بيع سيارة قابلة للتعديل");
    const carNumber = (tx.related_source_id || tx.source_id?.split(":")[0] || "").trim();

    const nextTx = allTx.map((item) =>
      item.id === id
        ? {
          ...item,
          amount,
          date,
          notes,
          currency,
          paymentType,
          payment_type: paymentType,
          type_: "مقدمة بيع سيارة",
        }
        : item,
    );

    if (carNumber) {
      const cars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
      const car = cars.find((item) => item.car_number === carNumber);
      if (car) {
        const schedule = nextTx.filter(
          (item) =>
            item.source_type === "customer_installment_schedule" &&
            item.source_role === "installment_schedule" &&
            item.related_source_id === carNumber,
        );
        const paid = schedule.filter((item) => item.type_.startsWith("واصل"));
        const unpaid = schedule.filter((item) => !item.type_.startsWith("واصل"));
        const paidTotal = moneySum(paid, (item) => item.actual_paid_amount ?? item.amount);
        const remainingForUnpaid = Math.max(0, Number(car.selling_price || 0) - Number(amount) - Number(paidTotal));
        const base = unpaid.length > 0 ? Math.floor(remainingForUnpaid / unpaid.length) : 0;
        const last = unpaid.length > 0 ? remainingForUnpaid - base * (unpaid.length - 1) : 0;

        let unpaidIndex = 0;
        for (const item of nextTx) {
          if (
            item.source_type === "customer_installment_schedule" &&
            item.source_role === "installment_schedule" &&
            item.related_source_id === carNumber &&
            !item.type_.startsWith("واصل")
          ) {
            const nextAmount = unpaidIndex === unpaid.length - 1 ? last : base;
            item.amount = nextAmount;
            item.original_amount = nextAmount;
            item.current_amount = nextAmount;
            unpaidIndex += 1;
          }
        }

        car.amount_paid = moneyAdd(amount, paidTotal);
        car.amount_remaining = Math.max(0, Number(car.selling_price || 0) - Number(car.amount_paid || 0));
        localStorage.setItem("mock_cars", JSON.stringify(cars));
      }
    }

    localStorage.setItem("mock_partner_transactions", JSON.stringify(nextTx));
    recalculateMockPartnerTotal(String(args.customerName ?? args.customer_name ?? tx.partner_name), "زبون");
    return undefined as T;
  }

  // ====================================================================
  // F1: 7 Tauri commands that previously had no mock handlers.
  // These are simplified dev-mode stubs that operate on localStorage mock
  // data — they do NOT replicate the full Rust accounting logic. They exist
  // so the frontend can be exercised in browser/preview mode without a
  // backend. Real accounting happens in the Rust commands (see lib.rs).
  // ====================================================================

  if (command === "save_and_sell_car_with_accounting") {
    // Insert the car as sold in one shot. Mirrors save_and_sell_car_with_accounting
    // in lib.rs (which is atomic — insert car + record purchase + sell it).
    const existing: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
    const plateNum = String(args.num ?? "").trim();
    const carNumber = resolveMockCarNumber(existing, plateNum);
    const item = {
      ...mapMockCar({ ...args, num: carNumber }),
      car_number: carNumber,
      car_plate_num: plateNum,
      status: "مبيوعة" as const,
      sale_time: new Date().toTimeString().slice(0, 5),
    };
    const next = existing.filter((c) => c.car_number !== item.car_number);
    next.push(item);
    localStorage.setItem("mock_cars", JSON.stringify(next));

    // Create customer account if not present (same as sell_car_with_accounting).
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const buyerName = String(args.buyer_name ?? args.buyerName ?? "").trim();
    const amountRemaining = toMoney(args.amount_remaining ?? args.amountRemaining);
    if (buyerName && !partners.some(p => p.partner_name === buyerName && p.kind === "زبون")) {
      partners.push({
        partner_name: buyerName,
        phone: String(args.buyer_phone ?? args.buyerPhone ?? ""),
        total_amount: amountRemaining,
        iqd_balance: amountRemaining,
        usd_balance: 0,
        total_withdrawals: 0,
        kind: "زبون",
      });
      localStorage.setItem("mock_partners", JSON.stringify(partners));
    }
    return undefined as T;
  }

  if (command === "update_sold_car_with_accounting") {
    // Edit the financial/sale fields of an existing sold car.
    const carNumber = String(args.car_number ?? args.carNumber ?? "").trim();
    const existing: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
    const idx = existing.findIndex((c) => c.car_number === carNumber);
    if (idx >= 0) {
      existing[idx] = {
        ...existing[idx],
        buyer_name: String(args.buyer_name ?? args.buyerName ?? existing[idx].buyer_name ?? ""),
        buyer_phone: String(args.buyer_phone ?? args.buyerPhone ?? existing[idx].buyer_phone ?? ""),
        selling_price: toMoney(args.selling_price ?? args.sellingPrice ?? existing[idx].selling_price),
        sale_currency: (args.sale_currency ?? args.saleCurrency ?? existing[idx].sale_currency ?? "IQD") as Car["sale_currency"],
        sale_date: String(args.sale_date ?? args.saleDate ?? existing[idx].sale_date ?? ""),
        payment_type: (args.payment_type ?? args.paymentType ?? existing[idx].payment_type ?? "كاش") as Car["payment_type"],
        amount_paid: toMoney(args.amount_paid ?? args.amountPaid ?? existing[idx].amount_paid),
        amount_remaining: toMoney(args.amount_remaining ?? args.amountRemaining ?? existing[idx].amount_remaining),
        installment_months: Number(args.installment_months ?? args.installmentMonths ?? existing[idx].installment_months ?? 0) || 0,
        first_payment_date: (args.first_payment_date ?? args.firstPaymentDate ?? existing[idx].first_payment_date ?? null) as string | null,
        delivery_date: (args.delivery_date ?? args.deliveryDate ?? existing[idx].delivery_date ?? null) as string | null,
        monthly_payment: toMoney(args.monthly_payment ?? args.monthlyPayment ?? existing[idx].monthly_payment),
      };
      localStorage.setItem("mock_cars", JSON.stringify(existing));
    }
    return undefined as T;
  }

  if (command === "pay_customer_installment") {
    // Mark a single installment row as paid in mock_partner_transactions.
    const installmentId = Number(args.installment_id ?? args.installmentId);
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const nextTx = allTx.map((tx) =>
      tx.id === installmentId
        ? {
          ...tx,
          type_: tx.type_.replace(/^باقي/, "واصل"),
          actual_paid_amount: toMoney(args.actual_paid_amount ?? args.actualPaidAmount ?? tx.amount),
          date: String(args.date ?? tx.date ?? ""),
          notes: args.notes != null ? String(args.notes) : tx.notes,
          currency: (args.currency as string) || tx.currency || "IQD",
          paymentType: ((args.payment_type ?? args.paymentType ?? tx.paymentType ?? "قاصه") as string),
          payment_type: ((args.payment_type ?? args.paymentType ?? tx.payment_type ?? "قاصه") as string),
        }
        : tx,
    );
    localStorage.setItem("mock_partner_transactions", JSON.stringify(nextTx));
    const tx = allTx.find((t) => t.id === installmentId);
    if (tx) {
      recalculateMockPartnerTotal(
        String(args.customer_name ?? args.customerName ?? tx.partner_name),
        "زبون",
      );
    }
    return undefined as T;
  }

  if (command === "reverse_customer_installment_payment") {
    // Revert a paid installment back to unpaid ("باقي").
    const installmentId = Number(args.installment_id ?? args.installmentId);
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const nextTx = allTx.map((tx) =>
      tx.id === installmentId
        ? {
          ...tx,
          type_: tx.type_.replace(/^واصل/, "باقي"),
          actual_paid_amount: toMoney(0),
        }
        : tx,
    );
    localStorage.setItem("mock_partner_transactions", JSON.stringify(nextTx));
    const tx = allTx.find((t) => t.id === installmentId);
    if (tx) recalculateMockPartnerTotal(tx.partner_name, "زبون");
    return undefined as T;
  }

  if (command === "set_customer_installment_status") {
    // Backward-compatible wrapper: paid=true → pay; paid=false → reverse.
    const paid = Boolean(args.paid);
    const installmentId = Number(args.installment_id ?? args.installmentId);
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const nextTx = allTx.map((tx) => {
      if (tx.id !== installmentId) return tx;
      if (paid) {
        return {
          ...tx,
          type_: tx.type_.replace(/^باقي/, "واصل"),
          actual_paid_amount: toMoney(args.amount ?? tx.amount),
          date: String(args.date ?? tx.date ?? ""),
          currency: (args.currency as string) || tx.currency || "IQD",
          paymentType: ((args.payment_type ?? args.paymentType ?? tx.paymentType ?? "قاصه") as string),
          payment_type: ((args.payment_type ?? args.paymentType ?? tx.payment_type ?? "قاصه") as string),
        };
      }
      return {
        ...tx,
        type_: tx.type_.replace(/^واصل/, "باقي"),
        actual_paid_amount: toMoney(0),
      };
    });
    localStorage.setItem("mock_partner_transactions", JSON.stringify(nextTx));
    const tx = allTx.find((t) => t.id === installmentId);
    if (tx) recalculateMockPartnerTotal(String(args.partner_name ?? tx.partner_name), "زبون");
    return undefined as T;
  }

  if (command === "preview_installment_payment_redistribution") {
    // Return a stub preview matching InstallmentPaymentPreview (types.ts).
    const installmentId = Number(args.installment_id ?? args.installmentId);
    const actualPaid = toMoney(args.actual_paid_amount ?? args.actualPaidAmount ?? 0);
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const target = allTx.find((t) => t.id === installmentId);
    const currentAmount = toMoney(target?.amount ?? 0);
    const difference = moneySub(actualPaid, currentAmount);
    const direction = difference.isPositive() ? "forward" : difference.isNegative() ? "backward" : "none";
    return {
      installment_id: installmentId,
      current_amount: currentAmount,
      actual_paid_amount: actualPaid,
      difference_amount: difference,
      affected_count: target ? 1 : 0,
      redistribution_direction: direction,
      preview_installments: target
        ? [{
            installment_id: installmentId,
            due_date: target.date ?? "",
            old_amount: currentAmount,
            new_amount: actualPaid,
            currency: target.currency ?? "IQD",
            status: "preview",
          }]
        : [],
    } as unknown as T;
  }

  if (command === "open_whatsapp") {
    // No-op in dev mode: just log to console. Real implementation opens the
    // whatsapp:// URL via the OS handler (see lib.rs::open_whatsapp).
    const phone = String(args.phone ?? "");
    const text = String(args.text ?? "");
    // eslint-disable-next-line no-console
    console.info(`[mock open_whatsapp] phone=${phone} text=${text}`);
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
  // Pass raw form strings for money fields — serializeTauriMoneyArgs + moneyToStorage
  // (via toMoney, which strips commas) will normalize them at the IPC boundary so we
  // never lose precision by going through JS Number() coercion.
  const remaining = form.amountRemaining;
  const paid = form.amountPaid;
  // Use Decimal division to avoid JS floating-point errors on money.
  // moneyDiv returns a Decimal; moneyToStorage serializes it for IPC.
  const monthlyPayment = moneyDiv(form.amountRemaining, months);

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
    purchase: form.purchase,
    selling: form.selling,
    status: form.status,
    paymentType: isSold ? form.paymentType : null,
    cashPrice: isSold && (form.paymentType === "كاش" || form.paymentType === "موعد") ? paid : null,
    amountPaid: isSold ? paid : null,
    amountRemaining: isDeferred ? remaining : null,
    installmentMonths: isInstallment ? months : null,
    monthlyPayment: isInstallment ? monthlyPayment : null,
    buyerName: isSold ? form.buyerName.trim() || null : null,
    buyerPhone: isSold ? normalizePhoneNumber(form.phone) || null : null,
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
  import.meta.env?.VITE_E2E === "1";

// E2E bridge is for Playwright tests only. Requires VITE_E2E=1 build flag and a
// running bridge server on port 3899. Never available in production builds.
async function e2eInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  // Production guard: the E2E bridge MUST never be reachable from a production
  // build, even if VITE_E2E was somehow set.
  if (import.meta.env.PROD) {
    throw new Error("E2E bridge disabled in production");
  }
  const res = await fetch(E2E_BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return (json.data ?? json.result) as T;
}

export async function callTauri<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const serializedArgs = serializeTauriMoneyArgs(args) as Record<string, unknown>;

  if (isTauri()) {
    return invoke<T>(command, serializedArgs);
  }

  if (isE2E()) {
    return e2eInvoke<T>(command, serializedArgs);
  }

  return mockInvoke<T>(command, serializedArgs);
}
