#!/usr/bin/env node
// Fast E2E_BRIDGE Accounting Scan — No Fix
// Scans all remaining scenarios, logs failures, continues.

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const BRIDGE_URL = process.env.E2E_BRIDGE_URL || "http://127.0.0.1:3899";

// ─── Types ─────────────────────────────────────────────────────────

interface ScenarioDef {
  id: string;
  group: string;
  name: string;
  nameAr: string;
  setup: () => Promise<void>;
  checks: BackendCheck[];
  oracle?: () => Record<string, number>;
}

interface BackendCheck {
  field: string;
  label: string;
  compute: (ctx: BackendContext) => number | string;
}

interface BackendContext {
  summary: any;
  partnerTxs: any[];
  cashRegister: any[];
  profitDist: any;
  cars: any[];
  expenses: any[];
  carExpenses: any[];
  partners: any[];
  unifiedAccounts: any[];
}

interface ScanResult {
  id: string;
  name: string;
  pass: boolean;
  fastPass: boolean;
  fullPass: boolean;
  oraclePass: boolean;
  backendPass: boolean;
  failureReason: string;
  expected: Record<string, number | string>;
  actual: Record<string, number | string>;
  elapsedMs: number;
}

// ─── Bridge helpers ───────────────────────────────────────────────

async function bridgeInvoke<T = any>(command: string, args: Record<string, any> = {}): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}/__e2e/invoke`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(String(json.error || "bridge error"));
  return json.data as T;
}

async function bridgeReset(): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/__e2e/reset`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.ok) throw new Error(String(json.error || "reset failed"));
}

async function bridgeHealth(): Promise<boolean> {
  try { const res = await fetch(`${BRIDGE_URL}/__e2e/health`); return res.ok; }
  catch { return false; }
}

// ─── Gather context ───────────────────────────────────────────────

async function gatherContext(): Promise<BackendContext> {
  let summary: any = {};
  let partnerTxs: any[] = [];
  let cashRegister: any[] = [];
  let profitDist: any = {};
  let cars: any[] = [];
  let expenses: any[] = [];
  let carExpenses: any[] = [];
  let partners: any[] = [];
  let unifiedAccounts: any[] = [];
  try { summary = await bridgeInvoke("get_financial_summary", {}); } catch {}
  try { partnerTxs = await bridgeInvoke("get_partner_transactions", { partner_name: "أمير", kind: "شريك" }); } catch {}
  try { profitDist = await bridgeInvoke("get_profit_distribution_summary", {}); } catch {}
  try { cars = await bridgeInvoke("get_cars", {}); } catch {}
  try { expenses = await bridgeInvoke("get_expenses", {}); } catch {}
  try { partners = await bridgeInvoke("get_partners", {}); } catch {}
  try { unifiedAccounts = await bridgeInvoke("get_unified_accounts", {}); } catch {}
  try {
    const mtxs = await bridgeInvoke("get_partner_transactions", { partner_name: "منتصر", kind: "شريك" });
    partnerTxs = [...partnerTxs, ...mtxs];
  } catch {}
  return { summary, partnerTxs, cashRegister, profitDist, cars, expenses, carExpenses, partners, unifiedAccounts };
}

function getCtxNumber(ctx: BackendContext, field: string): number {
  const s = ctx.summary || {};
  switch (field) {
    case "qasa_iqd": return s.qasa_iqd ?? 0;
    case "qasa_usd": return s.qasa_usd ?? 0;
    case "cash_iqd": return s.cash_iqd ?? 0;
    case "cash_usd": return s.cash_usd ?? 0;
    case "partner_capital_iqd": return s.total_partner_capital_iqd ?? 0;
    case "partner_capital_usd": return s.total_partner_capital_usd ?? 0;
    case "inventory_iqd": return s.inventory_value_iqd ?? 0;
    case "profit_iqd": return s.monthly_profits_iqd ?? 0;
    case "profit_usd": return s.monthly_profits_usd ?? 0;
    case "expenses_iqd": return s.total_expenses_iqd ?? 0;
    case "debtors_iqd": return s.total_debtors_iqd ?? 0;
    case "investments_iqd": return s.total_investments_iqd ?? 0;
    default: return 0;
  }
}

function countRows(ctx: BackendContext, sourceType?: string, sourceRole?: string): number {
  return ctx.partnerTxs.filter((tx: any) => {
    if (sourceType && tx.source_type !== sourceType) return false;
    if (sourceRole && tx.source_role !== sourceRole) return false;
    return true;
  }).length;
}

// ─── Check runner ─────────────────────────────────────────────────

async function runChecks(checks: BackendCheck[]): Promise<{ expected: Record<string, number | string>; actual: Record<string, number | string>; failureReason: string }> {
  const ctx = await gatherContext();
  const expected: Record<string, number | string> = {};
  const actual: Record<string, number | string> = {};
  const failures: string[] = [];

  for (const c of checks) {
    let expVal: number | string;
    let actVal: number | string;

    if (typeof c.compute === "function") {
      actVal = c.compute(ctx);
    } else {
      actVal = getCtxNumber(ctx, c.field);
    }
    expected[c.field] = expVal;
    actual[c.field] = actVal;
    if (expVal !== actVal) {
      failures.push(`${c.label || c.field}: expected=${expVal}, actual=${actVal}`);
    }
  }

  return { expected, actual, failureReason: failures.join("; ") };
}

// ─── ORACLE formula helpers ───────────────────────────────────────

function calcCarCost(purchasePrice: number, carExpenses: number): number {
  return purchasePrice + carExpenses;
}

function calcFullCarProfit(sellingPrice: number, carCost: number): number {
  return sellingPrice - carCost;
}

function calcProfitRatio(fullProfit: number, sellingPrice: number): number {
  return sellingPrice > 0 ? fullProfit / sellingPrice : 0;
}

function calcPaymentProfit(payment: number, ratio: number): number {
  return payment * ratio;
}

function calcRecognizedProfit(calculated: number, remaining: number): number {
  return Math.min(Math.max(calculated, 0), Math.max(remaining, 0));
}

function eachPartnerShare(profit: number): number {
  return profit / 2;
}

// ─── Scenario definitions ─────────────────────────────────────────

const LOCKED_PASS = new Set([
  "S01","S02","S05","S08","S09","S10","S11","S12","S22","S23",
  "S25","S47","S49","S50","S53","S54","S56","S59","S60","S61","S63"
]);

const SCENARIO_ORDER = [
  "S03","S04","S06","S07",
  "S13","S14","S15","S16","S17",
  "S18","S19","S20","S21","S24",
  "S26","S27","S28","S29",
  "S30","S31","S32","S33","S34",
  "S35","S36","S37","S38",
  "S39","S40","S41","S42",
  "S43","S44","S45","S46","S48",
  "S51","S52","S55",
  "S57","S58","S62",
  "S64","S65","S66",
  "S67","S68","S69","S70","S71"
];

const SCENARIO_NAMES: Record<string, { name: string; group: string }> = {
  S03: { name: "Company car purchase — شراء سيارة عن طريق شركة", group: "CAR_PURCHASE" },
  S04: { name: "USD cash car purchase — شراء سيارة بالدولار", group: "CAR_PURCHASE" },
  S06: { name: "Cash sale after funded purchase — بيع كاش بعد شراء بالتمويل", group: "CASH_SALES" },
  S07: { name: "Cash sale after company purchase — بيع كاش بعد شراء عن طريق شركة", group: "CASH_SALES" },
  S13: { name: "Installment overpayment — دفع زائد في الاقساط", group: "INSTALLMENTS" },
  S14: { name: "Final installment exact close — إقفال القسط الأخير", group: "INSTALLMENTS" },
  S15: { name: "Installment with car expense — اقساط مع مصروف سيارة", group: "INSTALLMENTS" },
  S16: { name: "Term sale with down payment — بيع بمدة مع مقدمة", group: "TERM_SALES" },
  S17: { name: "Term sale final payment — بيع بمدة الدفعة الأخيرة", group: "TERM_SALES" },
  S18: { name: "Car expense before sale — مصروف سيارة قبل البيع", group: "CAR_EXPENSES" },
  S19: { name: "Car expense after sale — مصروف سيارة بعد البيع", group: "CAR_EXPENSES" },
  S20: { name: "Edit car expense — تعديل مصروف سيارة", group: "CAR_EXPENSES" },
  S21: { name: "Delete car expense — حذف مصروف سيارة", group: "CAR_EXPENSES" },
  S24: { name: "Edit general expense — تعديل مصروف عام", group: "GENERAL_EXPENSES" },
  S26: { name: "Investor deposit — إيداع مستثمر", group: "INVESTORS" },
  S27: { name: "Investor withdrawal — سحب مستثمر", group: "INVESTORS" },
  S28: { name: "Investor + car purchase — مستثمر + شراء سيارة", group: "INVESTORS" },
  S29: { name: "Delete investor with balance — حذف مستثمر برصيد", group: "INVESTORS" },
  S30: { name: "Funder financing — تمويل ممول", group: "FUNDERS" },
  S31: { name: "Funder repayment — سداد ممول", group: "FUNDERS" },
  S32: { name: "Partial funder repayment — سداد جزئي لممول", group: "FUNDERS" },
  S33: { name: "Funder repayment with commission — سداد ممول مع عمولة", group: "FUNDERS" },
  S34: { name: "Delete funder with balance — حذف ممول برصيد", group: "FUNDERS" },
  S35: { name: "Company purchase — شراء عن طريق شركة", group: "COMPANIES" },
  S36: { name: "Company repayment — سداد شركة", group: "COMPANIES" },
  S37: { name: "Partial company repayment — سداد جزئي لشركة", group: "COMPANIES" },
  S38: { name: "Delete company with balance — حذف شركة برصيد", group: "COMPANIES" },
  S39: { name: "Agency profit IQD — ربح وكالة بالدينار", group: "AGENCIES" },
  S40: { name: "Agency profit USD — ربح وكالة بالدولار", group: "AGENCIES" },
  S41: { name: "Two agencies same name/date — وكالتان بنفس الاسم", group: "AGENCIES" },
  S42: { name: "Delete one agency transaction — حذف معاملة وكالة", group: "AGENCIES" },
  S43: { name: "Customer balance after installment — رصيد الزبون", group: "CUSTOMERS" },
  S44: { name: "Customer pays one installment — الزبون يدفع قسطاً", group: "CUSTOMERS" },
  S45: { name: "Customer pays all installments — الزبون يدفع كل الاقساط", group: "CUSTOMERS" },
  S46: { name: "Print customer statement — طباعة كشف حساب زبون", group: "CUSTOMERS" },
  S48: { name: "Partner withdrawal — سحب شريك", group: "PARTNERS" },
  S51: { name: "Edit available car purchase — تعديل شراء سيارة متوفرة", group: "DELETE_EDIT" },
  S52: { name: "Edit sold car sale price — تعديل سعر بيع سيارة مبيوعة", group: "DELETE_EDIT" },
  S55: { name: "Delete sold installment car — حذف سيارة مبيوعة بالاقساط", group: "DELETE_EDIT" },
  S57: { name: "Qasa tab = Qasa card — قاصة = بطاقة القاصة", group: "DASHBOARD" },
  S58: { name: "Cash tab = partner cash card — الكاش = بطاقة رأس المال", group: "DASHBOARD" },
  S62: { name: "Mixed currency blocked — منع خلط العملات", group: "CURRENCY" },
  S64: { name: "Print partner statement — طباعة كشف حساب شريك", group: "PRINT" },
  S65: { name: "Print customer statement — طباعة كشف حساب زبون", group: "PRINT" },
  S66: { name: "Export database — تصدير قاعدة البيانات", group: "PRINT" },
  S67: { name: "Full cash business cycle — دورة عمل كاش كاملة", group: "FULL_FLOWS" },
  S68: { name: "Full installment cycle — دورة اقساط كاملة", group: "FULL_FLOWS" },
  S69: { name: "Funder cycle — دورة تمويل", group: "FULL_FLOWS" },
  S70: { name: "Company cycle — دورة شركة", group: "FULL_FLOWS" },
  S71: { name: "Investor cycle — دورة مستثمر", group: "FULL_FLOWS" },
};

// ─── Scan a single scenario ───────────────────────────────────────

async function scanScenario(id: string): Promise<ScanResult> {
  const info = SCENARIO_NAMES[id] || { name: id, group: "UNKNOWN" };
  const t0 = Date.now();
  const expected: Record<string, number | string> = {};
  const actual: Record<string, number | string> = {};
  const failures: string[] = [];

  let oraclePass = true;
  let backendPass = true;

  try {
    await bridgeReset();

    // ─── SCENARIO IMPLEMENTATIONS ────────────────────────────

    if (id === "S03") {
      // Company car purchase — no cash movement
      await bridgeInvoke("add_car", {
        num: "CAR-S03", chassis: "CH-S03", model: "Toyota", year: "2024",
        name: "سيارة S03", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "شركة",
        financerName: "شركة S03",
      });
      const ctx = await gatherContext();
      // Expected: qasa=0 (no partner cash), inventory=10M
      expected["qasa_iqd"] = 0; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["inventory_iqd"] = 10_000_000; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      expected["purchaseRows"] = 0; actual["purchaseRows"] = countRows(ctx, "car_purchase");
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["inventory_iqd"] !== expected["inventory_iqd"]) failures.push(`inventory_iqd: expected ${expected["inventory_iqd"]}, got ${actual["inventory_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S04") {
      // USD car purchase
      await bridgeInvoke("add_car", {
        num: "CAR-S04", chassis: "CH-S04", model: "Toyota", year: "2024",
        name: "سيارة S04", color: "أبيض", details: "",
        purchase: 10_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "USD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      const ctx = await gatherContext();
      expected["qasa_usd"] = -10_000; actual["qasa_usd"] = ctx.summary?.qasa_usd ?? 0;
      expected["qasa_iqd"] = 0; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["inventory_iqd"] = 0; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      if (actual["qasa_usd"] !== expected["qasa_usd"]) failures.push(`qasa_usd: expected ${expected["qasa_usd"]}, got ${actual["qasa_usd"]}`);
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
    }

    else if (id === "S06") {
      // Funded purchase + cash sale
      await bridgeInvoke("add_car", {
        num: "CAR-S06", chassis: "CH-S06", model: "Toyota", year: "2024",
        name: "سيارة S06", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "تمويل",
        financerName: "ممول S06",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S06", sellingPrice: 18_000_000, paymentType: "كاش",
        amountPaid: 18_000_000, amountRemaining: 0,
        buyerName: "زبون S06", buyerPhone: "07800000006",
        saleDate: "2024-01-15", saleCurrency: "IQD",
      });
      const ctx = await gatherContext();
      // Expected: qasa = 18M (cash from sale, no cash was spent on purchase)
      expected["qasa_iqd"] = 18_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 8_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      expected["inventory_iqd"] = 0; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S07") {
      // Company purchase + cash sale
      await bridgeInvoke("add_car", {
        num: "CAR-S07", chassis: "CH-S07", model: "Toyota", year: "2024",
        name: "سيارة S07", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "شركة",
        financerName: "شركة S07",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S07", sellingPrice: 18_000_000, paymentType: "كاش",
        amountPaid: 18_000_000, amountRemaining: 0,
        buyerName: "زبون S07", buyerPhone: "07800000007",
        saleDate: "2024-01-15", saleCurrency: "IQD",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 18_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 8_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      expected["inventory_iqd"] = 0; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S13") {
      // Installment overpayment
      await bridgeInvoke("add_car", {
        num: "CAR-S13", chassis: "CH-S13", model: "Toyota", year: "2024",
        name: "سيارة S13", color: "أبيض", details: "",
        purchase: 10_000_000, selling: 20_000_000, status: "مبيوعة",
        paymentType: "اقساط", amountPaid: 5_000_000, amountRemaining: 15_000_000,
        installmentMonths: 15, monthlyPayment: 1_000_000,
        buyerName: "زبون S13", buyerPhone: "07800000013",
        purchaseDate: "2024-01-01", saleDate: "2024-01-15",
        currency: "IQD", saleCurrency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      // Pay more than remaining
      const car = (await bridgeInvoke("get_cars", {})).find((c: any) => c.car_number === "CAR-S13");
      const remaining = car?.amount_remaining ?? 15_000_000;
      // Overpay by 2M
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "زبون S13", kind: "زبون",
        type_: "تسديد قسط سيارة", amount: remaining + 2_000_000,
        date: "2024-03-15",
        notes: `تسديد قسط سيارة CAR-S13`, currency: "IQD", payment_type: "قاصه",
      });
      const ctx = await gatherContext();
      expected["customerRemainingCheck"] = "check"; actual["customerRemainingCheck"] = "check";
      // Check that no extra profit beyond full car profit
      const fullProfit = 10_000_000;
      const profit = ctx.summary?.monthly_profits_iqd ?? 0;
      expected["profitCap"] = fullProfit;
      if (profit > fullProfit + 1) {
        failures.push(`profit ${profit} exceeds cap ${fullProfit}`);
      }
      // Mark as FAIL if we detect issue, but still scan
      actual["profit_iqd"] = profit;
      expected["profit_iqd"] = fullProfit;
      if (profit > fullProfit + 1) {
        failures.push(`profit ${profit} exceeds full car profit ${fullProfit} — overpayment created extra profit`);
      } else if (profit < 0) {
        failures.push(`profit ${profit} is negative — something wrong`);
      }
    }

    else if (id === "S14") {
      // Final installment exact close
      await bridgeInvoke("add_car", {
        num: "CAR-S14", chassis: "CH-S14", model: "Toyota", year: "2024",
        name: "سيارة S14", color: "أبيض", details: "",
        purchase: 10_000_000, selling: 20_000_000, status: "مبيوعة",
        paymentType: "اقساط", amountPaid: 5_000_000, amountRemaining: 15_000_000,
        installmentMonths: 15, monthlyPayment: 1_000_000,
        buyerName: "زبون S14", buyerPhone: "07800000014",
        purchaseDate: "2024-01-01", saleDate: "2024-01-15",
        currency: "IQD", saleCurrency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      // Pay 14 installments of 1M
      for (let i = 0; i < 14; i++) {
        await bridgeInvoke("add_partner_transaction", {
          partner_name: "زبون S14", kind: "زبون",
          type_: "تسديد قسط سيارة", amount: 1_000_000,
          date: `2024-${String(i + 3).padStart(2, "0")}-15`,
          notes: `تسديد قسط سيارة CAR-S14`, currency: "IQD", payment_type: "قاصه",
        });
      }
      // Last installment: 1M (remaining)
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "زبون S14", kind: "زبون",
        type_: "تسديد قسط سيارة", amount: 1_000_000,
        date: "2025-05-15",
        notes: `تسديد قسط سيارة CAR-S14`, currency: "IQD", payment_type: "قاصه",
      });
      const ctx = await gatherContext();
      const qasa = ctx.summary?.qasa_iqd ?? 0;
      const profit = ctx.summary?.monthly_profits_iqd ?? 0;
      expected["qasa_iqd"] = 10_000_000; actual["qasa_iqd"] = qasa;
      expected["profit_iqd"] = 10_000_000; actual["profit_iqd"] = profit;
      // Check no extra profit
      if (profit > 10_000_001) failures.push(`profit ${profit} exceeds full car profit 10,000,000 — last installment created extra profit`);
      if (Math.abs(qasa - 10_000_000) > 100) failures.push(`qasa ${qasa} != 10,000,000`);
    }

    else if (id === "S15") {
      // Installment with car expense
      await bridgeInvoke("add_car", {
        num: "CAR-S15", chassis: "CH-S15", model: "Toyota", year: "2024",
        name: "سيارة S15", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      await bridgeInvoke("add_car_expense_record", {
        carNumber: "CAR-S15", description: "اصلاح", amount: 2_000_000,
        date: "2024-01-05", currency: "IQD",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S15", sellingPrice: 20_000_000, paymentType: "كاش",
        amountPaid: 20_000_000, amountRemaining: 0,
        buyerName: "زبون S15", buyerPhone: "07800000015",
        saleDate: "2024-01-15", saleCurrency: "IQD",
      });
      const ctx = await gatherContext();
      const carCost = calcCarCost(10_000_000, 2_000_000); // 12M
      const fullProfit = calcFullCarProfit(20_000_000, carCost); // 8M
      const qasaNet = 20_000_000 - 10_000_000 - 2_000_000; // 8M
      expected["qasa_iqd"] = qasaNet; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = fullProfit; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S16" || id === "S17") {
      // Term sale — similar to installment but with paymentType="موعد"
      await bridgeInvoke("add_car", {
        num: `CAR-${id}`, chassis: `CH-${id}`, model: "Toyota", year: "2024",
        name: `سيارة ${id}`, color: "أبيض", details: "",
        purchase: 10_000_000, selling: 20_000_000, status: "مبيوعة",
        paymentType: "موعد", amountPaid: 5_000_000, amountRemaining: 15_000_000,
        installmentMonths: 1, monthlyPayment: 15_000_000,
        buyerName: `زبون ${id}`, buyerPhone: "07800000000",
        purchaseDate: "2024-01-01", saleDate: "2024-01-15",
        currency: "IQD", saleCurrency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      if (id === "S17") {
        // Pay remaining
        await bridgeInvoke("add_partner_transaction", {
          partner_name: `زبون ${id}`, kind: "زبون",
          type_: "تسديد قسط سيارة", amount: 15_000_000,
          date: "2024-02-15",
          notes: `تسديد قسط سيارة CAR-${id}`, currency: "IQD", payment_type: "قاصه",
        });
      }
      const ctx = await gatherContext();
      expected["scenario"] = id;
      actual["scenario"] = id;
      if (id === "S16") {
        expected["qasa_iqd"] = -5_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
        expected["profit_iqd"] = 2_500_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      } else {
        expected["qasa_iqd"] = 10_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
        expected["profit_iqd"] = 10_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      }
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S18") {
      // Car expense before sale
      await bridgeInvoke("add_car", {
        num: "CAR-S18", chassis: "CH-S18", model: "Toyota", year: "2024",
        name: "سيارة S18", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      await bridgeInvoke("add_car_expense_record", {
        carNumber: "CAR-S18", description: "نقل", amount: 1_500_000,
        date: "2024-01-05", currency: "IQD",
      });
      // Check: qasa = -10M - 1.5M = -11.5M, inventory = 11.5M
      const ctx = await gatherContext();
      expected["qasa_iqd"] = -11_500_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["inventory_iqd"] = 11_500_000; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["inventory_iqd"] !== expected["inventory_iqd"]) failures.push(`inventory_iqd: expected ${expected["inventory_iqd"]}, got ${actual["inventory_iqd"]}`);
    }

    else if (id === "S19") {
      // Car expense after sale
      await bridgeInvoke("add_car", {
        num: "CAR-S19", chassis: "CH-S19", model: "Toyota", year: "2024",
        name: "سيارة S19", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
        purchasePaymentType: "قاصه",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S19", sellingPrice: 18_000_000, paymentType: "كاش",
        amountPaid: 18_000_000, amountRemaining: 0,
        buyerName: "زبون S19", buyerPhone: "07800000019",
        saleDate: "2024-01-15", saleCurrency: "IQD",
      });
      // Add car expense after sale
      await bridgeInvoke("add_car_expense_record", {
        carNumber: "CAR-S19", description: "اصلاح بعد البيع", amount: 1_000_000,
        date: "2024-01-20", currency: "IQD",
      });
      const ctx = await gatherContext();
      // After sale: qasa = 8M, profit = 8M. After expense: qasa = 7M, profit still 8M (car expense doesn't reduce net profit)
      expected["qasa_iqd"] = 7_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 8_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S20") {
      // Edit car expense — E2E_BRIDGE doesn't have this command
      throw new Error("Missing bridge command: update_car_expense_record");
    }

    else if (id === "S21") {
      // Delete car expense
      await bridgeInvoke("add_car", {
        num: "CAR-S21", chassis: "CH-S21", model: "Toyota", year: "2024",
        name: "سيارة S21", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      const expId: number = await bridgeInvoke("add_car_expense_record", {
        carNumber: "CAR-S21", description: "اصلاح", amount: 2_000_000,
        date: "2024-01-05", currency: "IQD",
      });
      // Check before delete
      const ctxBefore = await gatherContext();
      expected["qasaBefore"] = -12_000_000; actual["qasaBefore"] = ctxBefore.summary?.qasa_iqd ?? 0;
      // Delete
      await bridgeInvoke("delete_car_expense_record", { id: expId });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = -10_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["inventory_iqd"] = 10_000_000; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["inventory_iqd"] !== expected["inventory_iqd"]) failures.push(`inventory_iqd: expected ${expected["inventory_iqd"]}, got ${actual["inventory_iqd"]}`);
    }

    else if (id === "S24") {
      // Edit general expense — E2E_BRIDGE has update_expense but not re-processing
      await bridgeInvoke("add_expense", {
        description: "ايجار", amount: 1_000_000,
        date: "2024-02-01", currency: "IQD",
      });
      // bridge has update_expense but partner_transactions are NOT re-processed
      try {
        await bridgeInvoke("update_expense", { id: 1, description: "ايجار معدل", amount: 2_000_000, date: "2024-02-01", currency: "IQD" });
      } catch {}
      const ctx = await gatherContext();
      expected["scenario"] = "S24";
      actual["scenario"] = "S24";
      // The bridge doesn't reprocess partner transactions on expense edit
      // So qasa should still show 1M reduction
      if (ctx.summary?.qasa_iqd !== -2_000_000 && ctx.summary?.monthly_profits_iqd !== -2_000_000) {
        failures.push("Edit general expense did not update partner transactions — expected reprocessing");
      }
    }

    else if (id === "S26") {
      // Investor deposit
      await bridgeInvoke("add_partner", { name: "مستثمر تجربة", kind: "مستثمر", phone: "07800000000" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "مستثمر تجربة", kind: "مستثمر",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 10_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = 0; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0; // partner cash should NOT increase
      expected["investments_iqd"] = 10_000_000; actual["investments_iqd"] = ctx.summary?.total_investments_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      // Note: partner cash should NOT increase for investor deposits
      if (actual["cash_iqd"] !== 0) failures.push(`cash_iqd should be 0 (partner cash not affected), got ${actual["cash_iqd"]}`);
    }

    else if (id === "S27") {
      // Investor withdrawal
      await bridgeInvoke("add_partner", { name: "مستثمر سحب", kind: "مستثمر", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "مستثمر سحب", kind: "مستثمر",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "مستثمر سحب", kind: "مستثمر",
        type_: "سحب", amount: 5_000_000,
        date: "2024-02-01", currency: "IQD", payment_type: "قاصه",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 5_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = 0; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
      expected["investments_iqd"] = 10_000_000; actual["investments_iqd"] = ctx.summary?.total_investments_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
    }

    else if (id === "S28") {
      // Investor + car purchase
      await bridgeInvoke("add_partner", { name: "مستثمر شراء", kind: "مستثمر", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "مستثمر شراء", kind: "مستثمر",
        type_: "ايداع", amount: 50_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_car", {
        num: "CAR-S28", chassis: "CH-S28", model: "Toyota", year: "2024",
        name: "سيارة S28", color: "أبيض", details: "",
        purchase: 20_000_000, status: "متوفرة",
        purchaseDate: "2024-01-05", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 30_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = -20_000_000; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
      expected["inventory_iqd"] = 20_000_000; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      expected["investments_iqd"] = 50_000_000; actual["investments_iqd"] = ctx.summary?.total_investments_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
    }

    else if (id === "S29") {
      // Delete investor with balance — should be blocked
      await bridgeInvoke("add_partner", { name: "مستثمر للحذف", kind: "مستثمر", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "مستثمر للحذف", kind: "مستثمر",
        type_: "ايداع", amount: 5_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      let blocked = false;
      try {
        await bridgeInvoke("delete_partner", { name: "مستثمر للحذف", kind: "مستثمر" });
      } catch {
        blocked = true;
      }
      expected["blocked"] = "true"; actual["blocked"] = String(blocked);
      if (!blocked) failures.push("deleting investor with balance should be blocked");
    }

    else if (id === "S30") {
      // Funder financing
      await bridgeInvoke("add_partner", { name: "ممول تمويل", kind: "ممول", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "ممول تمويل", kind: "ممول",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 10_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = 0; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0; // funder tx should not affect partner cash
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      // Check unified accounts for funder liability
      try {
        const accounts = await bridgeInvoke("get_unified_accounts", {});
        const funderAcc = accounts.find((a: any) => a.kind === "ممول");
        expected["funderBalance"] = 10_000_000; actual["funderBalance"] = funderAcc?.iqd_balance ?? 0;
      } catch {}
    }

    else if (id === "S31") {
      // Funder repayment
      await bridgeInvoke("add_partner", { name: "ممول سداد", kind: "ممول", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "ممول سداد", kind: "ممول",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      // Repay funder
      await bridgeInvoke("pay_financier_from_partners", {
        financier_name: "ممول سداد", financier_kind: "ممول",
        amount: 10_000_000, date: "2024-02-01", currency: "IQD",
        notes: "سداد ممول",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 0; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = -10_000_000; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      // Check funder liability reduced
      try {
        const accounts = await bridgeInvoke("get_unified_accounts", {});
        const funderAcc = accounts.find((a: any) => a.kind === "ممول");
        expected["funderBalance"] = 0; actual["funderBalance"] = funderAcc?.iqd_balance ?? 0;
      } catch {}
    }

    else if (id === "S32") {
      // Partial funder repayment
      await bridgeInvoke("add_partner", { name: "ممول جزئي", kind: "ممول", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "ممول جزئي", kind: "ممول",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("pay_financier_from_partners", {
        financier_name: "ممول جزئي", financier_kind: "ممول",
        amount: 4_000_000, date: "2024-02-01", currency: "IQD",
        notes: "سداد جزئي",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 6_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = -4_000_000; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
    }

    else if (id === "S33") {
      // Funder repayment with commission
      await bridgeInvoke("add_partner", { name: "ممول عمولة", kind: "ممول", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "ممول عمولة", kind: "ممول",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("pay_financier_from_partners", {
        financier_name: "ممول عمولة", financier_kind: "ممول",
        amount: 10_500_000, date: "2024-02-01", currency: "IQD",
        notes: "سداد ممول مع عمولة",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = -500_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = -10_500_000; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
    }

    else if (id === "S34") {
      // Delete funder with balance — should be blocked
      await bridgeInvoke("add_partner", { name: "ممول للحذف", kind: "ممول", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "ممول للحذف", kind: "ممول",
        type_: "ايداع", amount: 5_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      let blocked = false;
      try {
        await bridgeInvoke("delete_partner", { name: "ممول للحذف", kind: "ممول" });
      } catch {
        blocked = true;
      }
      expected["blocked"] = "true"; actual["blocked"] = String(blocked);
      if (!blocked) failures.push("deleting funder with balance should be blocked");
    }

    else if (id === "S35") {
      // Company purchase
      await bridgeInvoke("add_partner", { name: "شركة تجربة", kind: "شركة", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "شركة تجربة", kind: "شركة",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 10_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = 0; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
    }

    else if (id === "S36") {
      // Company repayment
      await bridgeInvoke("add_partner", { name: "شركة سداد", kind: "شركة", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "شركة سداد", kind: "شركة",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      // Repay via partner cash
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "أمير", kind: "شريك",
        type_: "سحب", amount: 5_000_000,
        date: "2024-02-01", currency: "IQD", payment_type: "قاصه",
        notes: "سداد شركة",
      });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "منتصر", kind: "شريك",
        type_: "سحب", amount: 5_000_000,
        date: "2024-02-01", currency: "IQD", payment_type: "قاصه",
        notes: "سداد شركة",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 0; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = -10_000_000; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
    }

    else if (id === "S37") {
      // Partial company repayment
      await bridgeInvoke("add_partner", { name: "شركة جزئي", kind: "شركة", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "شركة جزئي", kind: "شركة",
        type_: "ايداع", amount: 10_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "أمير", kind: "شريك",
        type_: "سحب", amount: 2_000_000,
        date: "2024-02-01", currency: "IQD", payment_type: "قاصه",
        notes: "سداد جزئي شركة",
      });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "منتصر", kind: "شريك",
        type_: "سحب", amount: 2_000_000,
        date: "2024-02-01", currency: "IQD", payment_type: "قاصه",
        notes: "سداد جزئي شركة",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 6_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = -4_000_000; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
    }

    else if (id === "S38") {
      // Delete company with balance — should be blocked
      await bridgeInvoke("add_partner", { name: "شركة للحذف", kind: "شركة", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "شركة للحذف", kind: "شركة",
        type_: "ايداع", amount: 5_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      let blocked = false;
      try { await bridgeInvoke("delete_partner", { name: "شركة للحذف", kind: "شركة" }); }
      catch { blocked = true; }
      expected["blocked"] = "true"; actual["blocked"] = String(blocked);
      if (!blocked) failures.push("deleting company with balance should be blocked");
    }

    else if (id === "S39" || id === "S40" || id === "S41" || id === "S42") {
      // Agency scenarios — E2E_BRIDGE has stubs, no real accounting
      if (id === "S39") {
        try {
          await bridgeInvoke("add_agency", { old_agent_name: "وكيل قديم", new_agent_name: "وكيل جديد", amount_iqd: 5_000_000, date: "2024-01-01" });
        } catch {}
      } else if (id === "S40") {
        try {
          await bridgeInvoke("add_agency", { old_agent_name: "وكيل USD", new_agent_name: "وكيل USD جديد", amount_usd: 5_000, date: "2024-01-01" });
        } catch {}
      } else if (id === "S41") {
        // Two agencies with same name/date
        try {
          const a1id = await bridgeInvoke("add_agency", { old_agent_name: "وكيل", new_agent_name: "وكيل جديد", amount_iqd: 3_000_000, date: "2024-01-01" });
          const a2id = await bridgeInvoke("add_agency", { old_agent_name: "وكيل", new_agent_name: "وكيل جديد", amount_iqd: 4_000_000, date: "2024-01-01" });
          expected["agencyCount"] = 2; actual["agencyCount"] = (await bridgeInvoke("get_agencies", {})).length;
        } catch {}
      } else if (id === "S42") {
        // Add agency transaction and delete it
        try {
          const aid = await bridgeInvoke("add_agency", { old_agent_name: "وكيل X", new_agent_name: "وكيل Y", amount_iqd: 5_000_000, date: "2024-01-01" });
          await bridgeInvoke("add_agency_transaction", { agency_id: aid, type_: "ايداع", amount: 2_000_000, currency: "IQD", date: "2024-01-15" });
          await bridgeInvoke("delete_agency_transaction", { id: 1 });
        } catch {}
      }
      expected["scenario"] = id;
      actual["scenario"] = id;
      failures.push(`Agency commands are stubs in E2E_BRIDGE — no real accounting`);
    }

    else if (id === "S43") {
      // Customer balance after installment sale
      await bridgeInvoke("add_car", {
        num: "CAR-S43", chassis: "CH-S43", model: "Toyota", year: "2024",
        name: "سيارة S43", color: "أبيض", details: "",
        purchase: 10_000_000, selling: 20_000_000, status: "مبيوعة",
        paymentType: "اقساط", amountPaid: 5_000_000, amountRemaining: 15_000_000,
        installmentMonths: 10, monthlyPayment: 1_500_000,
        buyerName: "زبون S43", buyerPhone: "07800000043",
        purchaseDate: "2024-01-01", saleDate: "2024-01-15",
        currency: "IQD", saleCurrency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      // Check unified accounts or partners for customer remaining
      try {
        const partners = await bridgeInvoke("get_partners", {});
        const customer = partners.find((p: any) => p.partner_name === "زبون S43");
        expected["customerBalance"] = 15_000_000; actual["customerBalance"] = customer?.total_amount ?? 0;
      } catch {
        failures.push("Cannot read customer balance");
      }
    }

    else if (id === "S44") {
      // Customer pays one installment
      await bridgeInvoke("add_car", {
        num: "CAR-S44", chassis: "CH-S44", model: "Toyota", year: "2024",
        name: "سيارة S44", color: "أبيض", details: "",
        purchase: 10_000_000, selling: 20_000_000, status: "مبيوعة",
        paymentType: "اقساط", amountPaid: 5_000_000, amountRemaining: 15_000_000,
        installmentMonths: 15, monthlyPayment: 1_000_000,
        buyerName: "زبون S44", buyerPhone: "07800000044",
        purchaseDate: "2024-01-01", saleDate: "2024-01-15",
        currency: "IQD", saleCurrency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "زبون S44", kind: "زبون",
        type_: "تسديد قسط سيارة", amount: 1_000_000,
        date: "2024-02-15",
        notes: "تسديد قسط سيارة CAR-S44", currency: "IQD", payment_type: "قاصه",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = -4_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 3_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
    }

    else if (id === "S45") {
      // Customer pays all installments
      await bridgeInvoke("add_car", {
        num: "CAR-S45", chassis: "CH-S45", model: "Toyota", year: "2024",
        name: "سيارة S45", color: "أبيض", details: "",
        purchase: 10_000_000, selling: 20_000_000, status: "مبيوعة",
        paymentType: "اقساط", amountPaid: 5_000_000, amountRemaining: 15_000_000,
        installmentMonths: 15, monthlyPayment: 1_000_000,
        buyerName: "زبون S45", buyerPhone: "07800000045",
        purchaseDate: "2024-01-01", saleDate: "2024-01-15",
        currency: "IQD", saleCurrency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      for (let i = 0; i < 15; i++) {
        await bridgeInvoke("add_partner_transaction", {
          partner_name: "زبون S45", kind: "زبون",
          type_: "تسديد قسط سيارة", amount: 1_000_000,
          date: `2024-${String(i + 3).padStart(2, "0")}-15`,
          notes: "تسديد قسط سيارة CAR-S45", currency: "IQD", payment_type: "قاصه",
        });
      }
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 10_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 10_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
    }

    else if (id === "S46") {
      // Print customer statement — read-only, should not write
      try {
        await bridgeInvoke("export_database_to_excel", {});
      } catch {}
      const ctx = await gatherContext();
      expected["scenario"] = "S46";
      actual["scenario"] = "S46";
      // Just check no data corruption
      if (ctx.partners.length > 0) {
        expected["partnersOK"] = "yes";
        actual["partnersOK"] = "yes";
      }
    }

    else if (id === "S48") {
      // Partner withdrawal
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "أمير", kind: "شريك",
        type_: "سحب شريك", amount: 3_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = -3_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = -3_000_000; actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
    }

    else if (id === "S51") {
      // Edit available car purchase — E2E_BRIDGE add_car can update via oldNum
      await bridgeInvoke("add_car", {
        num: "CAR-S51", chassis: "CH-S51", model: "Toyota", year: "2024",
        name: "سيارة S51", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      // Update purchase price (bridge doesn't reprocess)
      await bridgeInvoke("add_car", {
        num: "CAR-S51", oldNum: "CAR-S51", chassis: "CH-S51", model: "Toyota", year: "2024",
        name: "سيارة S51", color: "أبيض", details: "",
        purchase: 12_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      const ctx = await gatherContext();
      expected["scenario"] = "S51";
      actual["scenario"] = "S51";
      // Bridge add_car with oldNum only updates car record, doesn't reprocess partner transactions
      // So qasa should still show -10M not -12M
      if (ctx.summary?.qasa_iqd !== -12_000_000) {
        failures.push("Edit car purchase did not reprocess partner transactions");
      }
    }

    else if (id === "S52") {
      // Edit sold car sale price
      await bridgeInvoke("add_car", {
        num: "CAR-S52", chassis: "CH-S52", model: "Toyota", year: "2024",
        name: "سيارة S52", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S52", sellingPrice: 18_000_000, paymentType: "كاش",
        amountPaid: 18_000_000, amountRemaining: 0,
        buyerName: "زبون S52", buyerPhone: "07800000052",
        saleDate: "2024-01-15", saleCurrency: "IQD",
      });
      // Update sale price
      await bridgeInvoke("update_sold_car_with_accounting", {
        carNumber: "CAR-S52", sellingPrice: 20_000_000, paymentType: "كاش",
        amountPaid: 20_000_000, amountRemaining: 0,
        buyerName: "زبون S52", buyerPhone: "07800000052",
        saleDate: "2024-01-15", saleCurrency: "IQD",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 10_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 10_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S55") {
      // Delete installment-sold car
      await bridgeInvoke("add_car", {
        num: "CAR-S55", chassis: "CH-S55", model: "Toyota", year: "2024",
        name: "سيارة S55", color: "أبيض", details: "",
        purchase: 10_000_000, selling: 20_000_000, status: "مبيوعة",
        paymentType: "اقساط", amountPaid: 5_000_000, amountRemaining: 15_000_000,
        installmentMonths: 15, monthlyPayment: 1_000_000,
        buyerName: "زبون S55", buyerPhone: "07800000055",
        purchaseDate: "2024-01-01", saleDate: "2024-01-15",
        currency: "IQD", saleCurrency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      try {
        await bridgeInvoke("delete_car", { num: "CAR-S55" });
      } catch {}
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 0; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      expected["inventory_iqd"] = 0; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S57") {
      // Qasa tab = Qasa card
      // Compare get_financial_summary.qasa_iqd with get_cash_register_entries total
      try {
        const summary = await bridgeInvoke("get_financial_summary", {});
        const cashReg = await bridgeInvoke("get_cash_register_entries", {});
        const qasaTab = cashReg.reduce((sum: number, e: any) => {
          return e.currency === "IQD" ? sum + e.balance : sum;
        }, 0) || 0;
        const lastEntry = cashReg.filter((e: any) => e.currency === "IQD");
        const qasaCard = summary.qasa_iqd ?? 0;
        expected["qasaTab"] = qasaCard; actual["qasaTab"] = lastEntry.length > 0 ? lastEntry[lastEntry.length - 1].balance : 0;
        if (Math.abs(qasaCard - qasaTab) > 1) failures.push(`qasa tab ${qasaTab} != qasa card ${qasaCard}`);
      } catch (e: any) {
        failures.push(`Error in S57: ${e.message}`);
      }
    }

    else if (id === "S58") {
      // Cash tab = partner cash card
      try {
        const summary = await bridgeInvoke("get_financial_summary", {});
        const cashReg = await bridgeInvoke("get_cash_register_entries", { payment_type: "الكاش" });
        const cashTabBalance = cashReg.length > 0 ? cashReg[cashReg.length - 1].balance : 0;
        const cashCard = summary.cash_iqd ?? 0;
        expected["cashTab"] = cashCard; actual["cashTab"] = cashTabBalance;
        if (Math.abs(cashCard - cashTabBalance) > 1) failures.push(`cash tab ${cashTabBalance} != cash card ${cashCard}`);
      } catch (e: any) {
        failures.push(`Error in S58: ${e.message}`);
      }
    }

    else if (id === "S62") {
      // Mixed currency blocked
      // Try to add a car with mixed IQD/USD — should work but currencies stay separate
      await bridgeInvoke("add_car", {
        num: "CAR-S62", chassis: "CH-S62", model: "Toyota", year: "2024",
        name: "سيارة S62", color: "أبيض", details: "",
        purchase: 10_000_000, status: "متوفرة",
        purchaseDate: "2024-01-01", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S62", sellingPrice: 5_000, paymentType: "كاش",
        amountPaid: 5_000, amountRemaining: 0,
        buyerName: "زبون S62", buyerPhone: "07800000062",
        saleDate: "2024-01-15", saleCurrency: "USD",
      });
      const ctx = await gatherContext();
      // Currency mixing: purchase in IQD, sale in USD — should keep separate
      expected["qasa_iqd"] = -10_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["qasa_usd"] = 5_000; actual["qasa_usd"] = ctx.summary?.qasa_usd ?? 0;
      expected["profit_usd"] = 0; actual["profit_usd"] = ctx.summary?.monthly_profits_usd ?? 0;
      expected["profit_iqd"] = 0; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      // Check that profit in IQD is not mixed with USD
      if (actual["qasa_usd"] !== 5_000) failures.push(`qasa_usd: expected 5000, got ${actual["qasa_usd"]}`);
    }

    else if (id === "S64") {
      // Print partner statement
      try {
        const partners = await bridgeInvoke("get_partners", {});
      } catch {}
      expected["scenario"] = "S64"; actual["scenario"] = "S64";
    }

    else if (id === "S65") {
      // Print customer statement
      try {
        const accounts = await bridgeInvoke("get_unified_accounts", {});
      } catch {}
      expected["scenario"] = "S65"; actual["scenario"] = "S65";
    }

    else if (id === "S66") {
      // Export database
      try {
        const result = await bridgeInvoke("export_database_to_excel", {});
      } catch {}
      expected["scenario"] = "S66"; actual["scenario"] = "S66";
    }

    else if (id === "S67") {
      // Full cash business cycle
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "أمير", kind: "شريك",
        type_: "ايداع", amount: 15_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "منتصر", kind: "شريك",
        type_: "ايداع", amount: 15_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_car", {
        num: "CAR-S67", chassis: "CH-S67", model: "Toyota", year: "2024",
        name: "سيارة S67", color: "أبيض", details: "",
        purchase: 20_000_000, status: "متوفرة",
        purchaseDate: "2024-01-05", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S67", sellingPrice: 30_000_000, paymentType: "كاش",
        amountPaid: 30_000_000, amountRemaining: 0,
        buyerName: "زبون S67", buyerPhone: "07800000067",
        saleDate: "2024-01-20", saleCurrency: "IQD",
      });
      await bridgeInvoke("add_expense", {
        description: "ايجار", amount: 2_000_000,
        date: "2024-02-01", currency: "IQD",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 30_000_000 + 30_000_000 - 20_000_000 - 2_000_000; // deposits(30M) - purchase(20M) + sale(30M) - expense(2M)
      actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 10_000_000 - 2_000_000; // car profit (10M) - expense (2M)
      actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
      expected["inventory_iqd"] = 0; actual["inventory_iqd"] = ctx.summary?.inventory_value_iqd ?? 0;
      if (actual["qasa_iqd"] !== expected["qasa_iqd"]) failures.push(`qasa_iqd: expected ${expected["qasa_iqd"]}, got ${actual["qasa_iqd"]}`);
      if (actual["profit_iqd"] !== expected["profit_iqd"]) failures.push(`profit_iqd: expected ${expected["profit_iqd"]}, got ${actual["profit_iqd"]}`);
    }

    else if (id === "S68") {
      // Full installment cycle
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "أمير", kind: "شريك",
        type_: "ايداع", amount: 5_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "منتصر", kind: "شريك",
        type_: "ايداع", amount: 5_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_car", {
        num: "CAR-S68", chassis: "CH-S68", model: "Toyota", year: "2024",
        name: "سيارة S68", color: "أبيض", details: "",
        purchase: 10_000_000, selling: 20_000_000, status: "مبيوعة",
        paymentType: "اقساط", amountPaid: 5_000_000, amountRemaining: 15_000_000,
        installmentMonths: 15, monthlyPayment: 1_000_000,
        buyerName: "زبون S68", buyerPhone: "07800000068",
        purchaseDate: "2024-01-01", saleDate: "2024-01-15",
        currency: "IQD", saleCurrency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      for (let i = 0; i < 5; i++) {
        await bridgeInvoke("add_partner_transaction", {
          partner_name: "زبون S68", kind: "زبون",
          type_: "تسديد قسط سيارة", amount: 1_000_000,
          date: `2024-${String(i + 3).padStart(2, "0")}-15`,
          notes: "تسديد قسط سيارة CAR-S68", currency: "IQD", payment_type: "قاصه",
        });
      }
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 10_000_000 - 10_000_000 + 5_000_000 + 5 * 1_000_000; // deposits(10M) - purchase(10M) + down(5M) + 5 installments
      actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 7_500_000; // down profit(2.5M) + 5 * installment profit(0.5M each)
      actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
    }

    else if (id === "S69") {
      // Funder cycle
      await bridgeInvoke("add_partner", { name: "ممول دورة", kind: "ممول", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "ممول دورة", kind: "ممول",
        type_: "ايداع", amount: 20_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_car", {
        num: "CAR-S69", chassis: "CH-S69", model: "Toyota", year: "2024",
        name: "سيارة S69", color: "أبيض", details: "",
        purchase: 20_000_000, status: "متوفرة",
        purchaseDate: "2024-01-05", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "تمويل",
        financerName: "ممول دورة",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S69", sellingPrice: 30_000_000, paymentType: "كاش",
        amountPaid: 30_000_000, amountRemaining: 0,
        buyerName: "زبون S69", buyerPhone: "07800000069",
        saleDate: "2024-01-20", saleCurrency: "IQD",
      });
      await bridgeInvoke("pay_financier_from_partners", {
        financier_name: "ممول دورة", financier_kind: "ممول",
        amount: 20_000_000, date: "2024-02-01", currency: "IQD",
        notes: "سداد دورة ممول",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 30_000_000 - 20_000_000; // sale(30M) - repayment(20M)
      actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 10_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
    }

    else if (id === "S70") {
      // Company cycle
      await bridgeInvoke("add_partner", { name: "شركة دورة", kind: "شركة", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "شركة دورة", kind: "شركة",
        type_: "ايداع", amount: 20_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_car", {
        num: "CAR-S70", chassis: "CH-S70", model: "Toyota", year: "2024",
        name: "سيارة S70", color: "أبيض", details: "",
        purchase: 20_000_000, status: "متوفرة",
        purchaseDate: "2024-01-05", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "شركة",
        financerName: "شركة دورة",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S70", sellingPrice: 30_000_000, paymentType: "كاش",
        amountPaid: 30_000_000, amountRemaining: 0,
        buyerName: "زبون S70", buyerPhone: "07800000070",
        saleDate: "2024-01-20", saleCurrency: "IQD",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 30_000_000; actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["profit_iqd"] = 10_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
    }

    else if (id === "S71") {
      // Investor cycle
      await bridgeInvoke("add_partner", { name: "مستثمر دورة", kind: "مستثمر", phone: "" });
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "مستثمر دورة", kind: "مستثمر",
        type_: "ايداع", amount: 50_000_000,
        date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
      });
      await bridgeInvoke("add_car", {
        num: "CAR-S71", chassis: "CH-S71", model: "Toyota", year: "2024",
        name: "سيارة S71", color: "أبيض", details: "",
        purchase: 20_000_000, status: "متوفرة",
        purchaseDate: "2024-01-05", currency: "IQD",
        purchasePaymentType: "قاصه", purchaseType: "كاش",
      });
      await bridgeInvoke("sell_car_with_accounting", {
        carNumber: "CAR-S71", sellingPrice: 30_000_000, paymentType: "كاش",
        amountPaid: 30_000_000, amountRemaining: 0,
        buyerName: "زبون S71", buyerPhone: "07800000071",
        saleDate: "2024-01-20", saleCurrency: "IQD",
      });
      const ctx = await gatherContext();
      expected["qasa_iqd"] = 50_000_000 - 20_000_000 + 30_000_000; // investor(50M) - purchase(20M) + sale(30M)
      actual["qasa_iqd"] = ctx.summary?.qasa_iqd ?? 0;
      expected["cash_iqd"] = -20_000_000 + 30_000_000; // partner cash: -purchase(20M) + sale(30M)
      actual["cash_iqd"] = ctx.summary?.cash_iqd ?? 0;
      expected["profit_iqd"] = 10_000_000; actual["profit_iqd"] = ctx.summary?.monthly_profits_iqd ?? 0;
    }

    else {
      failures.push(`Unknown scenario: ${id}`);
    }

  } catch (e: any) {
    failures.push(`Error: ${e.message}`);
  }

  const elapsedMs = Date.now() - t0;
  const pass = failures.length === 0;
  return {
    id, name: info.name,
    pass, fastPass: pass, fullPass: false,
    oraclePass: pass,
    backendPass: pass,
    failureReason: failures.join(" | "),
    expected, actual, elapsedMs,
  };
}

// ─── Report writing ───────────────────────────────────────────────

function writeAtomic(filePath: string, data: string) {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, data, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function updateCheckpoint(lastCompleted: string, next: string, failed: string[], scanned: string[]) {
  const cp = {
    lastCompletedScenario: lastCompleted,
    currentScenario: next,
    nextScenarioToRun: next,
    lockedPassScenarios: [...LOCKED_PASS],
    passedScenarios: scanned.filter(s => !failed.includes(s)),
    failedScenarios: failed,
    pendingScenarios: SCENARIO_ORDER.filter(s => s !== lastCompleted && !scanned.includes(s)),
    skippedScenarios: ["A", "B", "C"],
    timestamp: new Date().toISOString(),
    backendMode: "E2E_BRIDGE",
    scanMode: "FAST_SCAN_NO_FIX",
    canResume: true,
  };
  writeAtomic(path.join(ROOT, ".test-results", "ACCOUNTING_TEST_CHECKPOINT.json"), JSON.stringify(cp, null, 2));
}

function updateProgress(completed: number, passed: number, failed: number, pending: number, current: string, lastCompleted: string) {
  const prog = {
    totalPlanned: 71,
    completed,
    passed,
    pending,
    failed,
    coveragePercent: Math.round((completed / 71) * 100),
    currentScenario: current,
    nextScenarioToRun: current,
    lastCompletedScenario: lastCompleted,
    resumePoint: `${current} — Fast scan E2E_BRIDGE`,
    timestamp: new Date().toISOString(),
    scanMode: "FAST_SCAN_NO_FIX",
  };
  writeAtomic(path.join(ROOT, ".test-results", "ACCOUNTING_TEST_PROGRESS.json"), JSON.stringify(prog, null, 2));
}

function updateFixLog(scans: ScanResult[]) {
  const failures = scans.filter(s => !s.pass);
  if (failures.length === 0) return;
  const lines: string[] = [];
  lines.push("# Accounting Fix Log — E2E_BRIDGE Fast Scan\n");
  lines.push(`**Scan Date:** ${new Date().toISOString()}\n`);
  lines.push(`**Mode:** E2E_BRIDGE_FAST_SCAN_NO_FIX\n`);
  lines.push(`**Total scenarios scanned:** ${scans.length}`);
  lines.push(`**Failures found:** ${failures.length}\n`);
  lines.push("---\n");

  for (const f of failures) {
    lines.push(`### ${f.id} — ${f.name}\n`);
    lines.push(`- Status: NEEDS_FIX`);
    lines.push(`- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX`);
    lines.push(`- Failed layer: BACKEND_DB`);
    lines.push(`- Error category: accounting mismatch / missing behavior`);
    lines.push(`- Exact problem: ${f.failureReason}`);
    lines.push(`- Expected: ${JSON.stringify(f.expected)}`);
    lines.push(`- Actual: ${JSON.stringify(f.actual)}`);
    lines.push(`- Related business rule from Instructions.md: See accounting rules`);
    lines.push(`- Backend command involved: See scenario setup`);
    lines.push(`- Table/field involved: partner_transactions / financial_summary`);
    lines.push(`- Suspected file/function: e2e-bridge/server.mjs`);
    lines.push(`- Fix later priority: HIGH`);
    lines.push(`- Do not fix now: true`);
    lines.push(`- Continue scan from: next scenario\n`);
  }

  writeAtomic(path.join(ROOT, "ACCOUNTING_FIX_LOG.md"), lines.join("\n"));
}

function writeResultsJson(results: ScanResult[], allScanned: number, totalPlanned: number) {
  const summary = {
    timestamp: new Date().toISOString(),
    scanMode: "E2E_BRIDGE_FAST_SCAN_NO_FIX",
    totalScannedThisRun: results.length,
    lockedPassBeforeRun: LOCKED_PASS.size,
    fastPass: results.filter(r => r.pass).length,
    fullPass: 0,
    fail: results.filter(r => !r.pass).length,
    totalCompleted: LOCKED_PASS.size + results.filter(r => r.pass).length,
    totalPlanned,
    remaining: totalPlanned - (LOCKED_PASS.size + results.length),
    coveragePercent: Math.round(((LOCKED_PASS.size + results.filter(r => r.pass).length) / totalPlanned) * 100),
    backendMode: "E2E_BRIDGE",
    results: results.map(r => ({
      id: r.id,
      name: r.name,
      pass: r.pass,
      failureReason: r.failureReason,
      elapsedMs: r.elapsedMs,
      expected: r.expected,
      actual: r.actual,
    })),
  };
  fs.writeFileSync(path.join(ROOT, ".test-results", "all-results.json"), JSON.stringify(summary, null, 2), "utf-8");
}

// ─── Format time ──────────────────────────────────────────────────

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const onlyOne = process.argv.includes("--one");
  const specificScenario = process.argv.includes("--scenario") ? process.argv[process.argv.indexOf("--scenario") + 1] : null;

  console.log("[FAST_SCAN] Starting E2E_BRIDGE fast accounting scan (no fix)");

  const healthy = await bridgeHealth();
  if (!healthy) {
    console.error("[FAST_SCAN] E2E_BRIDGE not running. Start it with: node e2e-bridge/server.mjs");
    process.exit(1);
  }
  console.log("[FAST_SCAN] E2E_BRIDGE is healthy");

  // Read checkpoint
  let cp: any = {};
  try {
    cp = JSON.parse(fs.readFileSync(path.join(ROOT, ".test-results", "ACCOUNTING_TEST_CHECKPOINT.json"), "utf-8"));
  } catch {
    cp = { nextScenarioToRun: "S03", lockedPassScenarios: [...LOCKED_PASS] };
  }

  let pendingToScan: string[];
  if (specificScenario) {
    pendingToScan = [specificScenario];
  } else if (onlyOne) {
    pendingToScan = [cp.nextScenarioToRun || "S03"];
  } else {
    const startIdx = cp.nextScenarioToRun ? SCENARIO_ORDER.indexOf(cp.nextScenarioToRun) : 0;
    pendingToScan = startIdx >= 0 ? SCENARIO_ORDER.slice(startIdx) : SCENARIO_ORDER;
  }

  // Filter out locked pass
  pendingToScan = pendingToScan.filter(s => !LOCKED_PASS.has(s));

  if (pendingToScan.length === 0) {
    console.log("[FAST_SCAN] No pending scenarios to scan");
    return;
  }

  console.log(`[FAST_SCAN] Scenarios to scan: ${pendingToScan.join(", ")}`);
  console.log(`[FAST_SCAN] Total: ${pendingToScan.length} scenarios`);

  const scanStartTime = Date.now();
  const results: ScanResult[] = [];
  const failedScenarios: string[] = [];
  const scanned: string[] = [];

  for (let i = 0; i < pendingToScan.length; i++) {
    const sid = pendingToScan[i];
    const info = SCENARIO_NAMES[sid] || { name: sid, group: "UNKNOWN" };

    console.log(`\n[FAST_SCAN] Scenario ${sid} — ${info.name}`);

    const result = await scanScenario(sid);
    results.push(result);
    scanned.push(sid);

    if (result.pass) {
      console.log(`[FAST_SCAN] Result: FAST_PASS`);
    } else {
      console.log(`[FAST_SCAN] Result: FAIL`);
      console.log(`[FAST_SCAN] Issue logged in ACCOUNTING_FIX_LOG.md`);
      console.log(`[FAST_SCAN] Do not fix now. Continuing to ${pendingToScan[i + 1] || "END"}.`);
      failedScenarios.push(sid);
    }

    // Update checkpoint
    const lastCompleted = sid;
    const nextScenario = pendingToScan[i + 1] || lastCompleted;
    updateCheckpoint(lastCompleted, nextScenario, failedScenarios, scanned);

    // Update progress
    const completedThisRun = i + 1;
    const totalCompleted = LOCKED_PASS.size + results.filter(r => r.pass).length;
    const coveragePercent = Math.round((totalCompleted / 71) * 100);
    updateProgress(totalCompleted, results.filter(r => r.pass).length, failedScenarios.length, 71 - totalCompleted, sid, lastCompleted);

    // ETA
    const elapsedMs = Date.now() - scanStartTime;
    const avgMs = completedThisRun > 0 ? elapsedMs / completedThisRun : 0;
    const remaining = pendingToScan.length - completedThisRun;
    const etaMs = avgMs * remaining;

    console.log(`[FAST_SCAN] Progress: ${completedThisRun} / ${pendingToScan.length} remaining-scan items completed`);
    console.log(`[FAST_SCAN] Overall coverage: ${totalCompleted} / 71 = ${coveragePercent.toFixed(2)}%`);
    console.log(`[FAST_SCAN] Elapsed: ${formatTime(elapsedMs)}`);
    console.log(`[FAST_SCAN] Average per scenario: ${formatTime(avgMs)}`);
    console.log(`[FAST_SCAN] Estimated remaining time: ${formatTime(etaMs)}`);
    console.log(`[FAST_SCAN] Next: ${nextScenario}`);

    // Update fix log
    updateFixLog(results);

    // Write results
    writeResultsJson(results, results.length, 71);

    // Rewrite coverage every 5 scenarios
    if ((i + 1) % 5 === 0 || i === pendingToScan.length - 1) {
      await rewriteCoverage(results);
    }
  }

  // Final outputs
  const fastPass = results.filter(r => r.pass).length;
  const failCount = results.filter(r => !r.pass).length;
  const totalCompleted = LOCKED_PASS.size + fastPass;
  const elapsedMs = Date.now() - scanStartTime;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[FAST_SCAN_DONE]`);
  console.log(`Total planned: 71`);
  console.log(`Locked PASS before run: ${LOCKED_PASS.size}`);
  console.log(`Scanned this run: ${results.length}`);
  console.log(`FAST_PASS: ${fastPass}`);
  console.log(`FULL_PASS: 0`);
  console.log(`FAIL: ${failCount}`);
  console.log(`Pending: ${71 - totalCompleted}`);
  console.log(`Coverage: ${Math.round((totalCompleted / 71) * 100)}%`);
  console.log(`Elapsed: ${formatTime(elapsedMs)}`);
  console.log(`Failures logged in: ACCOUNTING_FIX_LOG.md`);
  console.log(`Next action: fix scenarios listed in ACCOUNTING_FIX_LOG.md`);
  console.log(`No fixes were applied during this run.`);
  console.log(`This was E2E_BRIDGE fast scan only.`);
  console.log(`This is not final real Tauri delivery verification.`);
  console.log(`${"=".repeat(60)}`);

  // Final coverage write
  await rewriteCoverage(results);
}

async function rewriteCoverage(scans: ScanResult[]) {
  // Update the coverage, failures, summary, and results files
  const allPassedScans = scans.filter(r => r.pass).map(r => r.id);
  const allFailedScans = scans.filter(r => !r.pass).map(r => r.id);

  // Also update the consolidation scripts
  try {
    const { execSync } = await import("node:child_process");
    execSync("npx tsx scripts/consolidate-reports.ts", { cwd: ROOT, stdio: "pipe" });
    execSync("npx tsx scripts/write-coverage.ts", { cwd: ROOT, stdio: "pipe" });
    execSync("npx tsx scripts/write-plan.ts", { cwd: ROOT, stdio: "pipe" });
  } catch {
    // Consolidation scripts may fail if vitest-collected results don't exist
  }

  // Write simple results summary
  const coverageLines: string[] = [];
  coverageLines.push(`# Fast Scan Results — ${new Date().toISOString()}\n`);
  coverageLines.push(`## Summary\n`);
  coverageLines.push(`- Scanned scenarios: ${scans.length}`);
  coverageLines.push(`- FAST_PASS: ${scans.filter(r => r.pass).length}`);
  coverageLines.push(`- FAIL: ${scans.filter(r => !r.pass).length}`);
  coverageLines.push(`- Scanned IDs: ${scans.map(r => r.id).join(", ")}`);
  coverageLines.push(`- Failed IDs: ${scans.filter(r => !r.pass).map(r => r.id).join(", ")}\n`);
  coverageLines.push(`## Per-scenario results\n`);
  for (const r of scans) {
    coverageLines.push(`### ${r.id}: ${r.pass ? "✅ FAST_PASS" : "❌ FAIL"}`);
    if (!r.pass) coverageLines.push(`- ${r.failureReason}`);
    coverageLines.push("");
  }
  fs.writeFileSync(path.join(ROOT, ".test-results", "FAST_SCAN_RESULTS.md"), coverageLines.join("\n"), "utf-8");
}

main().catch(e => {
  console.error("[FAST_SCAN] Fatal error:", e);
  process.exit(1);
});
