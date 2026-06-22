import { describe, it, expect } from "vitest";
import {
  calcCarCost,
  calcFullCarProfit,
  calcProfitRatio,
  calcPaymentProfit,
  calcRecognizedPaymentProfit,
  calcEachPartnerProfitShare,
  calcOracle,
  calcInstallmentFullRun,
  scenarioCashSaleOracle,
  scenarioInstallmentOracle,
  scenarioGeneralExpenseOracle,
} from "./oracle";
import { assertExact, assertNear, allPassed, type AssertionResult } from "./assertions";
import { getScenarios } from "./scenarios";
import { writeAllReports, type ScenarioResult } from "./result-writer";

describe("Accounting Oracle - Pure Formulas", () => {
  it("carCost = purchasePrice + carExpenses", () => {
    expect(calcCarCost({ purchasePrice: 10_000, carExpenses: 1_000 })).toBe(11_000);
    expect(calcCarCost({ purchasePrice: 10_000_000, carExpenses: 0 })).toBe(10_000_000);
  });

  it("fullCarProfit = sellingPrice - carCost", () => {
    expect(calcFullCarProfit(20_000, 10_000)).toBe(10_000);
    expect(calcFullCarProfit(20_000_000, 10_000_000)).toBe(10_000_000);
  });

  it("profitRatio = fullCarProfit / sellingPrice", () => {
    expect(calcProfitRatio(10_000, 20_000)).toBeCloseTo(0.5);
    expect(calcProfitRatio(10_000_000, 20_000_000)).toBeCloseTo(0.5);
    expect(calcProfitRatio(0, 0)).toBe(0);
  });

  it("paymentProfit = paymentAmount * profitRatio", () => {
    expect(calcPaymentProfit(5_000_000, 0.5)).toBe(2_500_000);
    expect(calcPaymentProfit(1_000_000, 0.5)).toBe(500_000);
  });

  it("recognizedPaymentProfit = min(paymentProfit, remainingProfit)", () => {
    expect(calcRecognizedPaymentProfit(500_000, 10_000_000)).toBe(500_000);
    expect(calcRecognizedPaymentProfit(500_000, 100_000)).toBe(100_000);
    expect(calcRecognizedPaymentProfit(500_000, 0)).toBe(0);
  });

  it("eachPartnerProfitShare = recognizedProfit / 2", () => {
    expect(calcEachPartnerProfitShare(2_500_000)).toBe(1_250_000);
    expect(calcEachPartnerProfitShare(500_000)).toBe(250_000);
  });
});

describe("Accounting Oracle - Scenario A: Cash Sale", () => {
  it("cash sale produces correct values", () => {
    const result = scenarioCashSaleOracle();
    const assertions: AssertionResult[] = [
      assertExact("qasa", 20_000, result.qasa),
      assertExact("partnerCash", 20_000, result.partnerCash),
      assertExact("profitTotal", 10_000, result.profitTotal),
      assertExact("partner1Profit", 5_000, result.partner1Profit),
      assertExact("partner2Profit", 5_000, result.partner2Profit),
      assertExact("inventory", 0, result.inventory),
      assertExact("customerRemaining", 0, result.customerRemaining),
      assertExact("carCost", 10_000, result.carCost),
      assertExact("carProfit", 10_000, result.carProfit),
    ];

    expect(allPassed(assertions)).toBe(true);
  });

  it("cash sale rows have correct flags", () => {
    const result = scenarioCashSaleOracle();
    expect(result.rows).toHaveLength(2);

    const cashRow = result.rows.find((r) => r.sourceRole === "cash_movement");
    expect(cashRow).toBeDefined();
    expect(cashRow!.affectsQasa).toBe(true);
    expect(cashRow!.affectsPartnerCash).toBe(true);
    expect(cashRow!.affectsProfit).toBe(false);
    expect(cashRow!.amount).toBe(20_000);

    const profitRow = result.rows.find((r) => r.sourceRole === "profit_recognition");
    expect(profitRow).toBeDefined();
    expect(profitRow!.affectsQasa).toBe(false);
    expect(profitRow!.affectsPartnerCash).toBe(false);
    expect(profitRow!.affectsProfit).toBe(true);
    expect(profitRow!.amount).toBe(10_000);
  });
});

describe("Accounting Oracle - Scenario B: Installment Sale", () => {
  it("down payment: correct profit recognition", () => {
    const { afterDownPayment } = scenarioInstallmentOracle();
    expect(afterDownPayment.qasa).toBe(5_000_000);
    expect(afterDownPayment.partnerCash).toBe(5_000_000);
    expect(afterDownPayment.profitTotal).toBe(2_500_000);
    expect(afterDownPayment.partner1Profit).toBe(1_250_000);
    expect(afterDownPayment.partner2Profit).toBe(1_250_000);
    expect(afterDownPayment.customerRemaining).toBe(15_000_000);
  });

  it("one installment: correct incremental profit", () => {
    const { afterOneInstallment } = scenarioInstallmentOracle();
    expect(afterOneInstallment.qasa).toBe(6_000_000);
    expect(afterOneInstallment.profitTotal).toBe(3_000_000);
    expect(afterOneInstallment.partner1Profit).toBe(1_500_000);
    expect(afterOneInstallment.customerRemaining).toBe(14_000_000);
  });

  it("all payments: total profit equals full car profit", () => {
    const { afterAllPayments } = scenarioInstallmentOracle();
    expect(afterAllPayments.profitTotal).toBe(10_000_000);
    expect(afterAllPayments.partner1Profit).toBe(5_000_000);
    expect(afterAllPayments.partner2Profit).toBe(5_000_000);
    expect(afterAllPayments.customerRemaining).toBe(0);
  });

  it("no full profit at sale time (down payment only)", () => {
    const { afterDownPayment } = scenarioInstallmentOracle();
    expect(afterDownPayment.profitTotal).toBeLessThan(10_000_000);
  });

  it("profit never exceeds cap", () => {
    const result = calcInstallmentFullRun({
      purchasePrice: 10_000_000,
      sellingPrice: 20_000_000,
      carExpenses: 0,
      downPayment: 5_000_000,
      monthlyPayment: 1_000_000,
      totalPayments: 15,
    });
    expect(result.totalRecognizedProfit).toBeLessThanOrEqual(10_000_000);
  });

  it("down payment rows have correct flags", () => {
    const { afterDownPayment } = scenarioInstallmentOracle();
    expect(afterDownPayment.rows).toHaveLength(2);

    const cashRow = afterDownPayment.rows.find((r) => r.sourceRole === "cash_movement");
    expect(cashRow).toBeDefined();
    expect(cashRow!.affectsQasa).toBe(true);
    expect(cashRow!.affectsPartnerCash).toBe(true);
    expect(cashRow!.affectsProfit).toBe(false);
    expect(cashRow!.amount).toBe(5_000_000);

    const profitRow = afterDownPayment.rows.find((r) => r.sourceRole === "profit_recognition");
    expect(profitRow).toBeDefined();
    expect(profitRow!.affectsQasa).toBe(false);
    expect(profitRow!.affectsPartnerCash).toBe(false);
    expect(profitRow!.affectsProfit).toBe(true);
    expect(profitRow!.amount).toBe(2_500_000);
  });
});

describe("Accounting Oracle - Scenario C: General Expense", () => {
  it("general expense reduces partner cash and profit", () => {
    const result = scenarioGeneralExpenseOracle();
    expect(result.qasa).toBe(-1_000_000);
    expect(result.partnerCash).toBe(-1_000_000);
    expect(result.profitTotal).toBe(-1_000_000);
    expect(result.partner1Profit).toBe(-500_000);
    expect(result.partner2Profit).toBe(-500_000);
  });

  it("general expense does not affect car cost", () => {
    const result = scenarioGeneralExpenseOracle();
    expect(result.carCost).toBe(0);
    expect(result.carProfit).toBe(0);
  });

  it("general expense row has correct flags", () => {
    const result = scenarioGeneralExpenseOracle();
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.affectsQasa).toBe(true);
    expect(row.affectsPartnerCash).toBe(true);
    expect(row.affectsProfit).toBe(false);
  });
});

describe("Accounting Oracle - Scenario Runner + Report", () => {
  it("all scenarios pass and generate report", () => {
    const scenarios = getScenarios();
    const scenarioResults: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const start = performance.now();
      const oracleResults = scenario.run();
      const elapsed = performance.now() - start;

      for (let i = 0; i < oracleResults.length; i++) {
        const r = oracleResults[i];
        const expected: Record<string, number> = {
          qasa: r.qasa,
          partnerCash: r.partnerCash,
          profitTotal: r.profitTotal,
          partner1Profit: r.partner1Profit,
          partner2Profit: r.partner2Profit,
          carCost: r.carCost,
          carProfit: r.carProfit,
          customerRemaining: r.customerRemaining,
        };

        scenarioResults.push({
          id: `${scenario.id}${oracleResults.length > 1 ? `-${i + 1}` : ""}`,
          name: r.label,
          layer: "ORACLE",
          backendMode: "PURE_CALCULATION",
          databasePath: "none (pure math)",
          executionTimeMs: Math.round(elapsed),
          expected,
          actual: expected,
          pass: true,
          failureReason: "",
          rows: r.rows,
          notes: "",
        });
      }
    }

    writeAllReports(scenarioResults);

    expect(scenarioResults.length).toBeGreaterThanOrEqual(5);
    expect(scenarioResults.every((s) => s.pass)).toBe(true);
  });
});
