import type { ScenarioOracleResult, OracleRow } from "./oracle";
import { calcCarCost, calcFullCarProfit, calcProfitRatio, calcPaymentProfit, calcRecognizedPaymentProfit, calcEachPartnerProfitShare } from "./oracle";

export interface TestScenario {
  id: string;
  group: string;
  name: string;
  nameAr: string;
  description: string;
  oracle: ScenarioOracleResult;
  backendChecks: BackendCheck[];
  uiChecks: UiCheckDef[];
}

export interface BackendCheck {
  field: string;
  label: string;
  compute: (ctx: BackendContext) => number;
}

export interface BackendContext {
  summary: Record<string, number>;
  partnerTxs: any[];
  cars: any[];
  expenses: any[];
  profitDist: any;
  amirTxs: any[];
  muntasirTxs: any[];
}

export interface UiCheckDef {
  tab: string;
  element: string;
  compute: (ctx: BackendContext) => number;
}

function cashRow(amount: number, desc: string): OracleRow {
  return { sourceType: "car_sale", sourceRole: "cash_movement", affectsQasa: true, affectsPartnerCash: true, affectsProfit: false, amount, description: desc };
}

function profitRow(amount: number, desc: string): OracleRow {
  return { sourceType: "car_sale", sourceRole: "profit_recognition", affectsQasa: false, affectsPartnerCash: false, affectsProfit: true, amount, description: desc };
}

function expenseRow(amount: number): OracleRow {
  return { sourceType: "expense", sourceRole: "cash_movement", affectsQasa: true, affectsPartnerCash: true, affectsProfit: false, amount: -amount, description: "General expense" };
}

function purchaseRow(amount: number, desc: string): OracleRow {
  return { sourceType: "car_purchase", sourceRole: "cash_payment", affectsQasa: true, affectsPartnerCash: true, affectsProfit: false, amount: -amount, description: desc };
}

// ─── S02: Funded car purchase ──────────────────────────────────────
function s02(): TestScenario {
  const purchase = 10_000_000;
  return {
    id: "S02", group: "CAR_PURCHASE", name: "Funded car purchase", nameAr: "شراء سيارة بالتمويل",
    description: "Purchase 10,000,000 IQD via funder financing. Status: متوفرة. No partner cash movement.",
    oracle: {
      label: "S02: Funded car purchase",
      qasa: 0, partnerCash: 0, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: purchase, receivables: 0, liabilities: purchase, generalExpenses: 0,
      carCost: purchase, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "inventory", label: "قيمة المخزون", compute: (c) => c.summary.inventory_value_iqd },
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { field: "partnerCash", label: "رأس مال الشركاء", compute: (c) => c.summary.total_partner_capital_iqd },
      { field: "profit", label: "الربح", compute: (c) => c.summary.monthly_profits_iqd },
    ],
    uiChecks: [
      { tab: "لوحة التحكم", element: "قيمة المخزون", compute: (c) => c.summary.inventory_value_iqd },
      { tab: "لوحة التحكم", element: "القاصة", compute: (c) => c.summary.qasa_iqd },
    ],
  };
}

// ─── S01: Cash car purchase ────────────────────────────────────────
function s01(): TestScenario {
  const purchase = 10_000_000;
  return {
    id: "S01", group: "CAR_PURCHASE", name: "Cash car purchase", nameAr: "شراء سيارة كاش",
    description: "Purchase 10,000,000 IQD cash. Status: متوفرة.",
    oracle: {
      label: "S01: Cash car purchase",
      qasa: -purchase, partnerCash: -purchase, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: purchase, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: purchase, carProfit: 0, customerRemaining: 0,
      rows: [purchaseRow(purchase, "Cash car purchase")],
    },
    backendChecks: [
      { field: "inventory", label: "قيمة المخزون", compute: (c) => c.summary.inventory_value_iqd },
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { field: "partnerCash", label: "رأس مال الشركاء", compute: (c) => c.summary.total_partner_capital_iqd },
      { field: "profit", label: "الربح", compute: (c) => c.summary.monthly_profits_iqd },
    ],
    uiChecks: [
      { tab: "لوحة التحكم", element: "قيمة المخزون", compute: (c) => c.summary.inventory_value_iqd },
      { tab: "لوحة التحكم", element: "القاصة", compute: (c) => c.summary.qasa_iqd },
    ],
  };
}

// ─── S05: Cash sale after cash purchase ────────────────────────────
function s05(): TestScenario {
  const purchase = 10_000_000;
  const selling = 16_000_000;
  const carCost = calcCarCost({ purchasePrice: purchase, carExpenses: 0 });
  const fullProfit = calcFullCarProfit(selling, carCost);
  const eachPartner = calcEachPartnerProfitShare(fullProfit);
  return {
    id: "S05", group: "CASH_SALES", name: "Cash sale after cash purchase", nameAr: "بيع كاش بعد شراء كاش",
    description: "Purchase 10M / Sell 16M cash.",
    oracle: {
      label: "S05: Cash sale after cash purchase",
      qasa: selling - purchase, partnerCash: selling - purchase, profitTotal: fullProfit,
      partner1Profit: eachPartner, partner2Profit: eachPartner,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost, carProfit: fullProfit, customerRemaining: 0,
      rows: [cashRow(selling, "Cash sale"), profitRow(fullProfit, "Profit recognition")],
    },
    backendChecks: [
      { field: "inventory", label: "قيمة المخزون", compute: (c) => c.summary.inventory_value_iqd },
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { field: "partnerCash", label: "رأس مال الشركاء", compute: (c) => c.summary.total_partner_capital_iqd },
      { field: "profit", label: "الربح", compute: (c) => c.summary.monthly_profits_iqd },
      { field: "amirProfit", label: "ربح أمير", compute: (c) => c.profitDist?.partners?.find((p: any) => p.partner_name === "أمير")?.profit_iqd ?? 0 },
      { field: "muntasirProfit", label: "ربح منتصر", compute: (c) => c.profitDist?.partners?.find((p: any) => p.partner_name === "منتصر")?.profit_iqd ?? 0 },
    ],
    uiChecks: [
      { tab: "لوحة التحكم", element: "قيمة المخزون", compute: (c) => c.summary.inventory_value_iqd },
      { tab: "لوحة التحكم", element: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { tab: "لوحة التحكم", element: "الربح", compute: (c) => c.summary.monthly_profits_iqd },
    ],
  };
}

// ─── S08: Cash sale with car expense ──────────────────────────────
function s08(): TestScenario {
  const purchase = 10_000_000;
  const carExpense = 2_000_000;
  const selling = 18_000_000;
  const carCost = calcCarCost({ purchasePrice: purchase, carExpenses: carExpense });
  const fullProfit = calcFullCarProfit(selling, carCost);
  const eachPartner = calcEachPartnerProfitShare(fullProfit);
  const qasaNet = selling - purchase - carExpense;
  return {
    id: "S08", group: "CASH_SALES", name: "Cash sale with car expense", nameAr: "بيع كاش مع مصروف سيارة",
    description: "Purchase 10M / Car expense 2M / Sell 18M.",
    oracle: {
      label: "S08: Cash sale with car expense",
      qasa: qasaNet, partnerCash: qasaNet, profitTotal: fullProfit,
      partner1Profit: eachPartner, partner2Profit: eachPartner,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost, carProfit: fullProfit, customerRemaining: 0,
      rows: [cashRow(selling, "Cash sale"), profitRow(fullProfit, "Profit recognition")],
    },
    backendChecks: [
      { field: "inventory", label: "قيمة المخزون", compute: (c) => c.summary.inventory_value_iqd },
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { field: "profit", label: "الربح", compute: (c) => c.summary.monthly_profits_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S09: Cash sale at loss ────────────────────────────────────────
function s09(): TestScenario {
  const purchase = 20_000_000;
  const selling = 17_000_000;
  const loss = selling - purchase;
  return {
    id: "S09", group: "CASH_SALES", name: "Cash sale at loss", nameAr: "بيع كاش بخسارة",
    description: "Purchase 20M / Sell 17M. Loss = -3M.",
    oracle: {
      label: "S09: Cash sale at loss",
      qasa: loss, partnerCash: loss, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: purchase, carProfit: loss, customerRemaining: 0,
      rows: [cashRow(selling, "Cash sale at loss")],
    },
    backendChecks: [
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { field: "profit", label: "الربح", compute: (c) => c.summary.monthly_profits_iqd },
      { field: "inventory", label: "قيمة المخزون", compute: (c) => c.summary.inventory_value_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S10: Installment sale after down payment ─────────────────────
function s10(): TestScenario {
  const purchase = 10_000_000;
  const selling = 20_000_000;
  const downPayment = 5_000_000;
  const carCost = calcCarCost({ purchasePrice: purchase, carExpenses: 0 });
  const fullProfit = calcFullCarProfit(selling, carCost);
  const ratio = calcProfitRatio(fullProfit, selling);
  const dpProfit = calcPaymentProfit(downPayment, ratio);
  const recognizedDp = calcRecognizedPaymentProfit(dpProfit, fullProfit);
  const eachPartner = calcEachPartnerProfitShare(recognizedDp);
  const remaining = selling - downPayment;
  const qasaNet = -purchase + downPayment;
  return {
    id: "S10", group: "INSTALLMENTS", name: "Installment sale - after down payment", nameAr: "بيع بالاقساط — بعد المقدمة",
    description: "Purchase 10M / Sell 20M / Down payment 5M.",
    oracle: {
      label: "S10: Installment - after down payment",
      qasa: qasaNet, partnerCash: qasaNet, profitTotal: recognizedDp,
      partner1Profit: eachPartner, partner2Profit: eachPartner,
      inventory: 0, receivables: remaining, liabilities: 0, generalExpenses: 0,
      carCost, carProfit: fullProfit, customerRemaining: remaining,
      rows: [
        { sourceType: "customer_payment", sourceRole: "cash_movement", affectsQasa: true, affectsPartnerCash: true, affectsProfit: false, amount: downPayment, description: "Down payment cash" },
        { sourceType: "customer_payment", sourceRole: "profit_recognition", affectsQasa: false, affectsPartnerCash: false, affectsProfit: true, amount: recognizedDp, description: "Down payment profit" },
      ],
    },
    backendChecks: [
      { field: "profit", label: "الربح المعترف به", compute: (c) => c.summary.monthly_profits_iqd },
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S11: Installment sale after one installment ──────────────────
function s11(): TestScenario {
  const purchase = 10_000_000;
  const selling = 20_000_000;
  const downPayment = 5_000_000;
  const monthly = 1_000_000;
  const carCost = calcCarCost({ purchasePrice: purchase, carExpenses: 0 });
  const fullProfit = calcFullCarProfit(selling, carCost);
  const ratio = calcProfitRatio(fullProfit, selling);
  const dpProfit = calcRecognizedPaymentProfit(calcPaymentProfit(downPayment, ratio), fullProfit);
  const instProfit = calcRecognizedPaymentProfit(calcPaymentProfit(monthly, ratio), fullProfit - dpProfit);
  const totalProfit = dpProfit + instProfit;
  const eachPartner = calcEachPartnerProfitShare(totalProfit);
  const qasaNet = -purchase + downPayment + monthly;
  return {
    id: "S11", group: "INSTALLMENTS", name: "Installment sale - after one installment", nameAr: "بيع بالاقساط — بعد قسط واحد",
    description: "Continue S10. Pay 1 installment of 1M.",
    oracle: {
      label: "S11: Installment - after one installment",
      qasa: qasaNet, partnerCash: qasaNet, profitTotal: totalProfit,
      partner1Profit: eachPartner, partner2Profit: eachPartner,
      inventory: 0, receivables: selling - downPayment - monthly, liabilities: 0, generalExpenses: 0,
      carCost, carProfit: fullProfit, customerRemaining: selling - downPayment - monthly,
      rows: [],
    },
    backendChecks: [
      { field: "profit", label: "الربح المعترف به", compute: (c) => c.summary.monthly_profits_iqd },
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S12: Installment sale after all installments ─────────────────
function s12(): TestScenario {
  const purchase = 10_000_000;
  const selling = 20_000_000;
  const fullProfit = selling - purchase;
  const eachPartner = fullProfit / 2;
  return {
    id: "S12", group: "INSTALLMENTS", name: "Installment sale - after all payments", nameAr: "بيع بالاقساط — بعد كل الدفعات",
    description: "Pay all 15 installments. Total profit = 10M.",
    oracle: {
      label: "S12: Installment - after all payments",
      qasa: selling - purchase, partnerCash: selling - purchase, profitTotal: fullProfit,
      partner1Profit: eachPartner, partner2Profit: eachPartner,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: purchase, carProfit: fullProfit, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "profit", label: "الربح المعترف به", compute: (c) => c.summary.monthly_profits_iqd },
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S22: General expense ──────────────────────────────────────────
function s22(): TestScenario {
  const expense = 1_000_000;
  return {
    id: "S22", group: "GENERAL_EXPENSES", name: "General expense", nameAr: "مصروف عام",
    description: "Rent 1,000,000 IQD.",
    oracle: {
      label: "S22: General expense",
      qasa: -expense, partnerCash: -expense, profitTotal: -expense,
      partner1Profit: -expense / 2, partner2Profit: -expense / 2,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: expense,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [expenseRow(expense)],
    },
    backendChecks: [
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { field: "partnerCash", label: "رأس مال الشركاء", compute: (c) => c.summary.total_partner_capital_iqd },
      { field: "profit", label: "صافي الربح", compute: (c) => c.summary.monthly_profits_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S23: General expense after car profit ─────────────────────────
function s23(): TestScenario {
  const purchase = 10_000_000;
  const selling = 18_000_000;
  const expense = 1_000_000;
  const grossProfit = selling - purchase;
  const netProfit = grossProfit - expense;
  return {
    id: "S23", group: "GENERAL_EXPENSES", name: "General expense after car profit", nameAr: "مصروف عام بعد ربح سيارة",
    description: "Purchase 10M / Sell 18M / Expense 1M.",
    oracle: {
      label: "S23: General expense after car profit",
      qasa: selling - purchase - expense, partnerCash: selling - purchase - expense, profitTotal: netProfit,
      partner1Profit: netProfit / 2, partner2Profit: netProfit / 2,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: expense,
      carCost: purchase, carProfit: grossProfit, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "profit", label: "صافي الربح", compute: (c) => c.summary.monthly_profits_iqd },
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S47: Partner deposits ─────────────────────────────────────────
function s47(): TestScenario {
  const deposit = 5_000_000;
  return {
    id: "S47", group: "PARTNERS", name: "Partner deposits", nameAr: "إيداع الشركاء",
    description: "أمير deposits 5M, منتصر deposits 5M.",
    oracle: {
      label: "S47: Partner deposits",
      qasa: deposit * 2, partnerCash: deposit * 2, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { field: "partnerCash", label: "رأس مال الشركاء", compute: (c) => c.summary.total_partner_capital_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S49: Attempt create third partner ─────────────────────────────
function s49(): TestScenario {
  return {
    id: "S49", group: "PARTNERS", name: "Block third partner creation", nameAr: "منع إنشاء شريك ثالث",
    description: "Attempt to create شريك ثالث — must be blocked.",
    oracle: {
      label: "S49: Block third partner",
      qasa: 0, partnerCash: 0, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [],
    uiChecks: [],
  };
}

// ─── S50: Attempt delete partner ───────────────────────────────────
function s50(): TestScenario {
  return {
    id: "S50", group: "PARTNERS", name: "Block partner deletion", nameAr: "منع حذف شريك",
    description: "Attempt to delete شريك — must be blocked.",
    oracle: {
      label: "S50: Block partner deletion",
      qasa: 0, partnerCash: 0, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [],
    uiChecks: [],
  };
}

// ─── S25: Delete general expense ────────────────────────────────────
function s25(): TestScenario {
  return {
    id: "S25", group: "GENERAL_EXPENSES", name: "Delete general expense", nameAr: "حذف مصروف عام",
    description: "Add rent 1M, then delete it. Qasa/profit return to 0.",
    oracle: {
      label: "S25: Delete general expense",
      qasa: 0, partnerCash: 0, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "qasaAfter", label: "القاصة بعد الحذف", compute: (c) => c.summary.qasa_iqd },
      { field: "expensesAfter", label: "المصروفات بعد الحذف", compute: (c) => c.summary.total_expenses_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S47: Partner deposits ─────────────────────────────────────────
// (already defined above)

// ─── S49: Block third partner creation ─────────────────────────────
// (already defined above)

// ─── S50: Block partner deletion ───────────────────────────────────
// (already defined above)

// ─── S53: Delete available car ─────────────────────────────────────
function s53(): TestScenario {
  return {
    id: "S53", group: "DELETE_EDIT", name: "Delete available car", nameAr: "حذف سيارة متوفرة",
    description: "Purchase 10M car, then delete it. Inventory/qasa return to 0.",
    oracle: {
      label: "S53: Delete available car",
      qasa: 0, partnerCash: 0, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "inventoryAfter", label: "المخزون بعد الحذف", compute: (c) => c.summary.inventory_value_iqd },
      { field: "qasaAfter", label: "القاصة بعد الحذف", compute: (c) => c.summary.qasa_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S54: Delete sold cash car ─────────────────────────────────────
function s54(): TestScenario {
  return {
    id: "S54", group: "DELETE_EDIT", name: "Delete sold cash car", nameAr: "حذف سيارة مبيوعة كاش",
    description: "Purchase 10M, sell 18M, then delete. Everything returns to 0.",
    oracle: {
      label: "S54: Delete sold cash car",
      qasa: 0, partnerCash: 0, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "qasaAfter", label: "القاصة بعد الحذف", compute: (c) => c.summary.qasa_iqd },
      { field: "profitAfter", label: "الربح بعد الحذف", compute: (c) => c.summary.monthly_profits_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S56: Company status mixed operations ──────────────────────────
function s56(): TestScenario {
  const deposits = 30_000_000;
  const purchase = 10_000_000;
  const selling = 18_000_000;
  const expense = 500_000;
  const qasaNet = deposits - purchase + selling - expense;
  const grossProfit = selling - purchase;
  const netProfit = grossProfit - expense;
  return {
    id: "S56", group: "DASHBOARD", name: "Company status mixed operations", nameAr: "حالة الشركة — عمليات مختلطة",
    description: "Deposits 30M + purchase 10M + sale 18M + expense 500K.",
    oracle: {
      label: "S56: Company status mixed ops",
      qasa: qasaNet, partnerCash: qasaNet, profitTotal: netProfit,
      partner1Profit: netProfit / 2, partner2Profit: netProfit / 2,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: expense,
      carCost: purchase, carProfit: grossProfit, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "qasa", label: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { field: "inventory", label: "المخزون", compute: (c) => c.summary.inventory_value_iqd },
      { field: "profit", label: "الربح", compute: (c) => c.summary.monthly_profits_iqd },
      { field: "partnerCash", label: "رأس مال الشركاء", compute: (c) => c.summary.total_partner_capital_iqd },
    ],
    uiChecks: [
      { tab: "لوحة التحكم", element: "القاصة", compute: (c) => c.summary.qasa_iqd },
      { tab: "لوحة التحكم", element: "الربح", compute: (c) => c.summary.monthly_profits_iqd },
    ],
  };
}

// ─── S59: Profit tab equals profit card ────────────────────────────
function s59(): TestScenario {
  const purchase = 10_000_000;
  const selling = 20_000_000;
  const profit = selling - purchase;
  return {
    id: "S59", group: "DASHBOARD", name: "Profit tab equals profit card", nameAr: "بطاقة الربح = توزيع الأرباح",
    description: "Purchase 10M / Sell 20M. Profit distribution = dashboard profit.",
    oracle: {
      label: "S59: Profit tab = profit card",
      qasa: selling - purchase, partnerCash: selling - purchase, profitTotal: profit,
      partner1Profit: profit / 2, partner2Profit: profit / 2,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: purchase, carProfit: profit, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "dashboardProfit", label: "ربح لوحة التحكم", compute: (c) => c.summary.monthly_profits_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S60: IQD/USD currency separation ──────────────────────────────
function s60(): TestScenario {
  const iqdPurchase = 10_000_000;
  const iqdSelling = 18_000_000;
  const usdPurchase = 8_000;
  const usdSelling = 12_000;
  return {
    id: "S60", group: "CURRENCY", name: "IQD/USD currency separation", nameAr: "فصل العملات — IQD و USD",
    description: "IQD car: 10M→18M. USD car: 8K→12K. Currencies stay separate.",
    oracle: {
      label: "S60: IQD/USD separation",
      qasa: iqdSelling - iqdPurchase, partnerCash: iqdSelling - iqdPurchase, profitTotal: iqdSelling - iqdPurchase,
      partner1Profit: (iqdSelling - iqdPurchase) / 2, partner2Profit: (iqdSelling - iqdPurchase) / 2,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: iqdPurchase, carProfit: iqdSelling - iqdPurchase, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "qasaIqd", label: "القاصة بالدينار", compute: (c) => c.summary.qasa_iqd },
      { field: "profitIqd", label: "الربح بالدينار", compute: (c) => c.summary.monthly_profits_iqd },
      { field: "qasaUsd", label: "القاصة بالدولار", compute: (c) => c.summary.qasa_usd },
      { field: "profitUsd", label: "الربح بالدولار", compute: (c) => c.summary.monthly_profits_usd },
    ],
    uiChecks: [],
  };
}

// ─── S61: USD general expense ──────────────────────────────────────
function s61(): TestScenario {
  return {
    id: "S61", group: "CURRENCY", name: "USD general expense", nameAr: "مصروف عام بالدولار",
    description: "USD expense 500 → USD profit=-500, IQD unchanged.",
    oracle: {
      label: "S61: USD general expense",
      qasa: 0, partnerCash: 0, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [
      { field: "profitUsd", label: "الربح بالدولار", compute: (c) => c.summary.monthly_profits_usd },
      { field: "profitIqd", label: "الربح بالدينار", compute: (c) => c.summary.monthly_profits_iqd },
    ],
    uiChecks: [],
  };
}

// ─── S63: Read-only safety ─────────────────────────────────────────
function s63(): TestScenario {
  return {
    id: "S63", group: "READ_ONLY", name: "Read-only functions do not write", nameAr: "الدوال القرائية لا تكتب",
    description: "Call all read-only functions 10 times. Verify no writes.",
    oracle: {
      label: "S63: Read-only safety",
      qasa: 0, partnerCash: 0, profitTotal: 0,
      partner1Profit: 0, partner2Profit: 0,
      inventory: 0, receivables: 0, liabilities: 0, generalExpenses: 0,
      carCost: 0, carProfit: 0, customerRemaining: 0,
      rows: [],
    },
    backendChecks: [],
    uiChecks: [],
  };
}

// ─── Registry ──────────────────────────────────────────────────────
export function getAllScenarios(): TestScenario[] {
  return [
    s01(), s02(), s05(), s08(), s09(),
    s10(), s11(), s12(),
    s22(), s23(), s25(),
    s47(), s49(), s50(),
    s53(), s54(),
    s56(), s59(),
    s60(), s61(),
    s63(),
  ];
}

export function getScenariosByGroup(group: string): TestScenario[] {
  return getAllScenarios().filter((s) => s.group === group);
}

export const SCENARIO_GROUPS = [
  "CAR_PURCHASE",
  "CASH_SALES",
  "INSTALLMENTS",
  "GENERAL_EXPENSES",
  "PARTNERS",
  "READ_ONLY",
];
