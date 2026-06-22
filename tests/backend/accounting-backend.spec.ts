import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  scenarioCashSaleOracle,
  scenarioInstallmentOracle,
  scenarioGeneralExpenseOracle,
  type ScenarioOracleResult,
} from "../accounting-oracle/oracle";
import { assertExact, assertNear, allPassed, type AssertionResult } from "../accounting-oracle/assertions";
import { bridgeInvoke, bridgeReset, bridgeHealth } from "../e2e-bridge/e2e-commands";
import { writeAllReports, type ScenarioResult } from "../accounting-oracle/result-writer";
import { appendResult, type LayerResult } from "../shared/result-collector";

const BACKEND_MODE = "E2E_BRIDGE" as const;
const DB_PATH = "e2e-bridge :memory:";
const allResults: ScenarioResult[] = [];

function startTimer() {
  return Date.now();
}

function elapsed(start: number) {
  return Date.now() - start;
}

type PartnerTx = {
  id: number;
  partner_name: string;
  kind: string;
  type_: string;
  amount: number;
  date: string;
  notes: string | null;
  currency: string | null;
  affects_qasa: number;
  affects_partner_cash: number;
  affects_profit: number;
  source_type: string | null;
  source_id: string | null;
  source_role: string | null;
};

type FinancialSummary = {
  cash_iqd: number;
  qasa_iqd: number;
  inventory_value_iqd: number;
  total_partner_capital_iqd: number;
  monthly_profits_iqd: number;
  total_expenses_iqd: number;
};

type ProfitDist = {
  undistributed_iqd: number;
  partners: { partner_name: string; profit_iqd: number; profit_usd: number; drawings_iqd: number; drawings_usd: number }[];
  expenses_iqd: number;
};

beforeAll(async () => {
  const healthy = await bridgeHealth();
  if (!healthy) {
    console.warn(
      "\n⚠️  E2E Bridge not running. Start it with:\n" +
      "   node e2e-bridge/server.mjs\n",
    );
  }
});

function buildResult(
  id: string,
  name: string,
  oracle: ScenarioOracleResult,
  expected: Record<string, number>,
  actual: Record<string, number>,
  assertions: AssertionResult[],
  elapsedMs: number,
  rows: Array<Record<string, unknown>> = [],
  failureReason = "",
): ScenarioResult {
  return {
    id,
    name,
    layer: "BACKEND_DB",
    backendMode: BACKEND_MODE,
    databasePath: DB_PATH,
    executionTimeMs: elapsedMs,
    expected,
    actual,
    pass: allPassed(assertions) && !failureReason,
    failureReason,
    rows,
    notes: "",
  };
}

describe("Scenario A — Cash Sale Backend Verification", () => {
  beforeEach(async () => {
    await bridgeReset();
  });

  it("cash sale: purchase then sell — qasa, cash, profit, partners match oracle", async () => {
    const t0 = startTimer();
    const oracle = scenarioCashSaleOracle();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: AssertionResult[] = [];
    let failureReason = "";

    // Step 1: Purchase car (available, not sold)
    await bridgeInvoke("add_car", {
      num: "TEST-A-001",
      chassis: "CHASSIS-A-001",
      model: "Test Car A",
      year: "2024",
      name: "سيارة اختبار أ",
      color: "أبيض",
      details: "",
      purchase: 10_000,
      status: "متوفرة",
      purchaseDate: "2024-01-01",
      currency: "IQD",
      purchasePaymentType: "قاصه",
      purchaseType: "كاش",
    });

    // Verify after purchase
    const afterPurchase: FinancialSummary = await bridgeInvoke("get_financial_summary", {});
    expected["purchaseInventory"] = 10_000;
    actual["purchaseInventory"] = afterPurchase.inventory_value_iqd;
    assertions.push(assertExact("inventory after purchase", 10_000, afterPurchase.inventory_value_iqd));

    expected["purchaseQasa"] = -10_000;
    actual["purchaseQasa"] = afterPurchase.qasa_iqd;
    assertions.push(assertNear("qasa after purchase", -10_000, afterPurchase.qasa_iqd));

    expected["purchaseProfit"] = 0;
    actual["purchaseProfit"] = afterPurchase.monthly_profits_iqd;
    assertions.push(assertExact("profit after purchase", 0, afterPurchase.monthly_profits_iqd));

    // Step 2: Sell car for cash
    await bridgeInvoke("sell_car_with_accounting", {
      carNumber: "TEST-A-001",
      sellingPrice: 20_000,
      paymentType: "كاش",
      amountPaid: 20_000,
      amountRemaining: 0,
      buyerName: "زبون كاش",
      buyerPhone: "07800000000",
      saleDate: "2024-01-15",
      saleCurrency: "IQD",
    });

    // Get partner transactions
    const amirTx: PartnerTx[] = await bridgeInvoke("get_partner_transactions", {
      partner_name: "أمير",
      kind: "شريك",
    });

    // Verify cash_movement and profit_recognition rows
    const amirCashRows = amirTx.filter(
      (tx) => tx.source_type === "car_sale" && tx.source_role === "cash_movement",
    );
    const amirProfitRows = amirTx.filter(
      (tx) => tx.source_type === "car_sale" && tx.source_role === "profit_recognition",
    );

    expected["amirCashMovementRows"] = 1;
    actual["amirCashMovementRows"] = amirCashRows.length;
    assertions.push(assertExact("amir cash_movement rows", 1, amirCashRows.length));

    expected["amirProfitRows"] = 1;
    actual["amirProfitRows"] = amirProfitRows.length;
    assertions.push(assertExact("amir profit_recognition rows", 1, amirProfitRows.length));

    // Verify flags
    if (amirCashRows.length > 0) {
      const row = amirCashRows[0];
      expected["cashAffectsQasa"] = 1;
      actual["cashAffectsQasa"] = row.affects_qasa;
      assertions.push(assertExact("cash affects_qasa", 1, row.affects_qasa));

      expected["cashAffectsPartnerCash"] = 1;
      actual["cashAffectsPartnerCash"] = row.affects_partner_cash;
      assertions.push(assertExact("cash affects_partner_cash", 1, row.affects_partner_cash));

      expected["cashAffectsProfit"] = 0;
      actual["cashAffectsProfit"] = row.affects_profit;
      assertions.push(assertExact("cash affects_profit", 0, row.affects_profit));

      expected["amirCashAmount"] = 10_000;
      actual["amirCashAmount"] = row.amount;
      assertions.push(assertNear("amir cash amount", 10_000, row.amount));
    }

    if (amirProfitRows.length > 0) {
      const row = amirProfitRows[0];
      expected["profitAffectsQasa"] = 0;
      actual["profitAffectsQasa"] = row.affects_qasa;
      assertions.push(assertExact("profit affects_qasa", 0, row.affects_qasa));

      expected["profitAffectsPartnerCash"] = 0;
      actual["profitAffectsPartnerCash"] = row.affects_partner_cash;
      assertions.push(assertExact("profit affects_partner_cash", 0, row.affects_partner_cash));

      expected["profitAffectsProfit"] = 1;
      actual["profitAffectsProfit"] = row.affects_profit;
      assertions.push(assertExact("profit affects_profit", 1, row.affects_profit));

      expected["amirProfitAmount"] = 5_000;
      actual["amirProfitAmount"] = row.amount;
      assertions.push(assertNear("amir profit amount", 5_000, row.amount));
    }

    // Verify profit distribution
    const profitDist: ProfitDist = await bridgeInvoke("get_profit_distribution_summary", {});
    const amirProfit = profitDist.partners.find((p) => p.partner_name === "أمير");
    const muntasirProfit = profitDist.partners.find((p) => p.partner_name === "منتصر");

    expected["amirProfitIqd"] = oracle.partner1Profit;
    actual["amirProfitIqd"] = amirProfit?.profit_iqd ?? 0;
    assertions.push(assertNear("أمير profit", oracle.partner1Profit, amirProfit?.profit_iqd ?? 0));

    expected["muntasirProfitIqd"] = oracle.partner2Profit;
    actual["muntasirProfitIqd"] = muntasirProfit?.profit_iqd ?? 0;
    assertions.push(assertNear("منتصر profit", oracle.partner2Profit, muntasirProfit?.profit_iqd ?? 0));

    // Verify no double counting in qasa
    const summary: FinancialSummary = await bridgeInvoke("get_financial_summary", {});
    expected["qasaIqd"] = 10_000; // net = sale (+20,000) - purchase (-10,000)
    actual["qasaIqd"] = summary.qasa_iqd;
    assertions.push(assertNear("qasa net", 10_000, summary.qasa_iqd));

    // Inventory should be 0
    expected["inventory"] = 0;
    actual["inventory"] = summary.inventory_value_iqd;
    assertions.push(assertExact("inventory", 0, summary.inventory_value_iqd));

    if (!allPassed(assertions)) {
      failureReason = assertions
        .filter((a) => !a.pass)
        .map((a) => `${a.field}: expected ${a.expected}, got ${a.actual}`)
        .join("; ");
    }

    const result = buildResult("A", "بيع سيارة كاش (شراء ثم بيع)", oracle, expected, actual, assertions, elapsed(t0), oracle.rows, failureReason);
    allResults.push(result);
    expect(allPassed(assertions)).toBe(true);
  });
});

describe("Scenario B — Installment Sale Backend Verification", () => {
  beforeEach(async () => {
    await bridgeReset();
  });

  it("installment: down payment + 1 installment matches oracle", async () => {
    const t0 = startTimer();
    const { afterDownPayment, afterOneInstallment } = scenarioInstallmentOracle();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: AssertionResult[] = [];
    let failureReason = "";

    const carNum = "TEST-B-001";
    const sellingPrice = 20_000_000;
    const downPayment = 5_000_000;
    const monthlyPayment = 1_000_000;
    const remaining = sellingPrice - downPayment;

    // Add car and sell with installments
    await bridgeInvoke("add_car", {
      num: carNum,
      chassis: "CHASSIS-B-001",
      model: "Test Car B",
      year: "2024",
      name: "سيارة اختبار ب",
      color: "أزرق",
      details: "",
      purchase: 10_000_000,
      selling: sellingPrice,
      status: "مبيوعة",
      paymentType: "اقساط",
      amountPaid: downPayment,
      amountRemaining: remaining,
      installmentMonths: 15,
      monthlyPayment: monthlyPayment,
      buyerName: "زبون اقساط",
      buyerPhone: "07800000001",
      purchaseDate: "2024-01-01",
      saleDate: "2024-01-15",
      firstPaymentDate: "2024-02-15",
      currency: "IQD",
      saleCurrency: "IQD",
      purchasePaymentType: "قاصه",
      purchaseType: "كاش",
    });

    // Get partner transactions for verification
    const amirTx: PartnerTx[] = await bridgeInvoke("get_partner_transactions", {
      partner_name: "أمير",
      kind: "شريك",
    });

    const amirCashRows = amirTx.filter(
      (tx) => tx.source_type === "car_sale" && tx.source_role === "cash_movement",
    );
    const amirProfitRows = amirTx.filter(
      (tx) => tx.source_type === "car_sale" && tx.source_role === "profit_recognition",
    );

    // Verify down payment profit
    const expectedDpProfit = afterDownPayment.partner1Profit;
    if (amirProfitRows.length > 0) {
      expected["amirDownPaymentProfit"] = expectedDpProfit;
      actual["amirDownPaymentProfit"] = amirProfitRows[0].amount;
      assertions.push(assertNear("amir down payment profit", expectedDpProfit, amirProfitRows[0].amount));
    }

    // Now pay one installment
    await bridgeInvoke("add_partner_transaction", {
      partner_name: "زبون اقساط",
      kind: "زبون",
      type_: "تسديد قسط سيارة",
      amount: monthlyPayment,
      date: "2024-02-15",
      notes: `تسديد قسط سيارة ${carNum}`,
      currency: "IQD",
      payment_type: "قاصه",
    });

    // Re-fetch transactions after installment payment
    const amirTxAfter: PartnerTx[] = await bridgeInvoke("get_partner_transactions", {
      partner_name: "أمير",
      kind: "شريك",
    });

    const amirInstallmentProfitRows = amirTxAfter.filter(
      (tx) => tx.source_type === "customer_installment" && tx.source_role === "profit_recognition",
    );
    const amirInstallmentCashRows = amirTxAfter.filter(
      (tx) => tx.source_type === "customer_installment" && tx.source_role === "cash_movement",
    );

    // Verify installment created profit_recognition row
    expected["amirInstallmentProfitRows"] = 1;
    actual["amirInstallmentProfitRows"] = amirInstallmentProfitRows.length;
    assertions.push(assertExact("amir installment profit rows", 1, amirInstallmentProfitRows.length));

    // Verify installment created cash_movement row
    expected["amirInstallmentCashRows"] = 1;
    actual["amirInstallmentCashRows"] = amirInstallmentCashRows.length;
    assertions.push(assertExact("amir installment cash rows", 1, amirInstallmentCashRows.length));

    // Verify installment profit amount = 500,000 (1,000,000 * 50%)
    const expectedInstProfit = afterOneInstallment.partner1Profit - afterDownPayment.partner1Profit;
    if (amirInstallmentProfitRows.length > 0) {
      expected["amirInstallmentProfit"] = expectedInstProfit;
      actual["amirInstallmentProfit"] = amirInstallmentProfitRows[0].amount;
      assertions.push(assertNear("amir installment profit", expectedInstProfit, amirInstallmentProfitRows[0].amount));
    }

    // Verify installment cash amount = 500,000 (1,000,000 / 2)
    if (amirInstallmentCashRows.length > 0) {
      expected["amirInstallmentCash"] = monthlyPayment / 2;
      actual["amirInstallmentCash"] = amirInstallmentCashRows[0].amount;
      assertions.push(assertNear("amir installment cash", monthlyPayment / 2, amirInstallmentCashRows[0].amount));
    }

    // Verify total recognized profit after installment = 3,000,000
    const profitDistAfter: ProfitDist = await bridgeInvoke("get_profit_distribution_summary", {});
    const totalProfitAfter = profitDistAfter.partners.reduce((sum, p) => sum + p.profit_iqd, 0);
    expected["totalProfitAfterInstallment"] = afterOneInstallment.profitTotal;
    actual["totalProfitAfterInstallment"] = totalProfitAfter;
    assertions.push(assertNear("total profit after installment", afterOneInstallment.profitTotal, totalProfitAfter));

    // Verify flags for down payment rows
    for (const row of amirProfitRows) {
      if (row.affects_qasa !== 0) {
        failureReason += `DP Profit row has affects_qasa=${row.affects_qasa}; `;
      }
      if (row.affects_partner_cash !== 0) {
        failureReason += `DP Profit row has affects_partner_cash=${row.affects_partner_cash}; `;
      }
      if (row.affects_profit !== 1) {
        failureReason += `DP Profit row has affects_profit=${row.affects_profit}; `;
      }
    }

    for (const row of amirCashRows) {
      if (row.affects_qasa !== 1) {
        failureReason += `DP Cash row has affects_qasa=${row.affects_qasa}; `;
      }
      if (row.affects_profit !== 0) {
        failureReason += `DP Cash row has affects_profit=${row.affects_profit}; `;
      }
    }

    // Verify flags for installment rows
    for (const row of amirInstallmentProfitRows) {
      if (row.affects_qasa !== 0) {
        failureReason += `Inst Profit row has affects_qasa=${row.affects_qasa}; `;
      }
      if (row.affects_partner_cash !== 0) {
        failureReason += `Inst Profit row has affects_partner_cash=${row.affects_partner_cash}; `;
      }
      if (row.affects_profit !== 1) {
        failureReason += `Inst Profit row has affects_profit=${row.affects_profit}; `;
      }
    }

    for (const row of amirInstallmentCashRows) {
      if (row.affects_qasa !== 1) {
        failureReason += `Inst Cash row has affects_qasa=${row.affects_qasa}; `;
      }
      if (row.affects_profit !== 0) {
        failureReason += `Inst Cash row has affects_profit=${row.affects_profit}; `;
      }
    }

    // Verify total profit does not exceed cap
    if (totalProfitAfter > 10_000_000) {
      failureReason += `Total profit ${totalProfitAfter} exceeds cap 10,000,000; `;
    }

    if (!allPassed(assertions) && !failureReason) {
      failureReason = assertions
        .filter((a) => !a.pass)
        .map((a) => `${a.field}: expected ${a.expected}, got ${a.actual}`)
        .join("; ");
    }

    const result = buildResult("B", afterDownPayment.label, afterDownPayment, expected, actual, assertions, elapsed(t0), afterDownPayment.rows, failureReason);
    allResults.push(result);
    expect(failureReason).toBe("");
    expect(allPassed(assertions)).toBe(true);
  });
});

describe("Scenario C — General Expense Backend Verification", () => {
  beforeEach(async () => {
    await bridgeReset();
  });

  it("general expense: reduces partner cash, reduces net profit", async () => {
    const t0 = startTimer();
    const oracle = scenarioGeneralExpenseOracle();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: AssertionResult[] = [];
    let failureReason = "";

    // Add general expense
    await bridgeInvoke("add_expense", {
      description: "ايجار",
      amount: 1_000_000,
      date: "2024-02-01",
      currency: "IQD",
    });

    // Verify expense recorded
    const expenses = await bridgeInvoke<any[]>("get_expenses", {});
    expected["expenseCount"] = 1;
    actual["expenseCount"] = expenses.length;
    assertions.push(assertExact("expense count", 1, expenses.length));

    // Verify financial summary
    const summary: FinancialSummary = await bridgeInvoke("get_financial_summary", {});

    expected["totalExpenses"] = 1_000_000;
    actual["totalExpenses"] = summary.total_expenses_iqd;
    assertions.push(assertNear("total expenses", 1_000_000, summary.total_expenses_iqd));

    // Net profit = -expenses (no income)
    expected["netProfit"] = -1_000_000;
    actual["netProfit"] = summary.monthly_profits_iqd;
    assertions.push(assertNear("net profit", -1_000_000, summary.monthly_profits_iqd));

    // Inventory should be 0
    expected["inventory"] = 0;
    actual["inventory"] = summary.inventory_value_iqd;
    assertions.push(assertExact("inventory", 0, summary.inventory_value_iqd));

    if (!allPassed(assertions)) {
      failureReason = assertions
        .filter((a) => !a.pass)
        .map((a) => `${a.field}: expected ${a.expected}, got ${a.actual}`)
        .join("; ");
    }

    const result = buildResult("C", oracle.label, oracle, expected, actual, assertions, elapsed(t0), oracle.rows, failureReason);
    allResults.push(result);
    expect(allPassed(assertions)).toBe(true);
  });
});

describe("Read-only Safety — Backend", () => {
  beforeEach(async () => {
    await bridgeReset();
  });

  it("read-only functions do not write to database", async () => {
    const beforePartners = await bridgeInvoke<any[]>("get_partners", {});
    const beforePartnerCount = beforePartners.length;

    // Call all read-only functions multiple times
    await bridgeInvoke("get_financial_summary", {});
    await bridgeInvoke("get_financial_summary", {});
    await bridgeInvoke("get_partner_transactions", { partner_name: "أمير", kind: "شريك" });
    await bridgeInvoke("get_partner_transactions", { partner_name: "أمير", kind: "شريك" });
    await bridgeInvoke("get_profit_distribution_summary", {});
    await bridgeInvoke("get_profit_distribution_summary", {});
    await bridgeInvoke("get_partners_totals", { kind: "شريك" });
    await bridgeInvoke("get_partners_totals", { kind: "شريك" });
    await bridgeInvoke("get_unified_accounts", {});
    await bridgeInvoke("get_unified_accounts", {});
    await bridgeInvoke("get_cars", {});
    await bridgeInvoke("get_cars", {});
    await bridgeInvoke("get_cash_register_entries", {});
    await bridgeInvoke("get_cash_register_entries", {});

    // Verify no extra rows were created
    const afterPartners = await bridgeInvoke<any[]>("get_partners", {});
    expect(afterPartners.length).toBe(beforePartnerCount);

    const afterCars = await bridgeInvoke<any[]>("get_cars", {});
    expect(afterCars.length).toBe(0);

    const afterExpenses = await bridgeInvoke<any[]>("get_expenses", {});
    expect(afterExpenses.length).toBe(0);
  });
});

describe("Report Generation", () => {
  it("writes reports after all scenarios", () => {
    writeAllReports(allResults);
    expect(allResults.length).toBeGreaterThan(0);

    // Write to shared collector for consolidation
    for (const r of allResults) {
      appendResult({
        scenarioId: r.id,
        scenarioName: r.name,
        layer: r.layer,
        backendMode: r.backendMode,
        executionTimeMs: r.executionTimeMs,
        pass: r.pass,
        failureReason: r.failureReason,
        expected: r.expected as Record<string, number | string>,
        actual: r.actual as Record<string, number | string>,
        rows: r.rows,
      });
    }
  });
});
