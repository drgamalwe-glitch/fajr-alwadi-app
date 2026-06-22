import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, getProfitDist, addCar, sellCar, addExpense, addPartnerTx,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary, type ProfitDist,
} from "./helpers";

describe("S56 — Company status after mixed operations", () => {
  beforeEach(resetDb);

  it("deposits + purchase + sale + expense → correct qasa/inventory/profit", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    // Partner deposits 30M
    await addPartnerTx({
      partner_name: "أمير", kind: "شريك",
      type_: "ايداع شريك", amount: 15_000_000,
      date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
    });
    await addPartnerTx({
      partner_name: "منتصر", kind: "شريك",
      type_: "ايداع شريك", amount: 15_000_000,
      date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
    });

    // Buy car 10M
    await addCar({
      num: "CAR-S56", chassis: "CH-S56", model: "Toyota", year: "2024",
      name: "سيارة S56", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-05", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    // Sell car 18M
    await sellCar({
      carNumber: "CAR-S56", sellingPrice: 18_000_000, paymentType: "كاش",
      amountPaid: 18_000_000, amountRemaining: 0,
      buyerName: "زبون S56", buyerPhone: "07800000056",
      saleDate: "2024-01-10", saleCurrency: "IQD",
    });

    // General expense 500K
    await addExpense({ description: "مصاريف عامة", amount: 500_000, date: "2024-01-15", currency: "IQD" });

    const s: FinancialSummary = await getSummary();

    // Expected: deposits 30M - purchase 10M + sale 18M - expense 500K = 37.5M
    expected["qasa"] = 37_500_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", 37_500_000, s.qasa_iqd));

    expected["inventory"] = 0; actual["inventory"] = s.inventory_value_iqd;
    assertions.push(assertExact("inventory", 0, s.inventory_value_iqd));

    expected["profit"] = 7_500_000; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit", 7_500_000, s.monthly_profits_iqd));

    expected["partnerCash"] = 37_500_000; actual["partnerCash"] = s.total_partner_capital_iqd;
    assertions.push(assertNear("partnerCash", 37_500_000, s.total_partner_capital_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S56", "حالة الشركة بعد عمليات مختلطة", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S59 — Profit tab equals profit card", () => {
  beforeEach(resetDb);

  it("profit distribution total matches dashboard profit", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S59", chassis: "CH-S59", model: "Toyota", year: "2024",
      name: "سيارة S59", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    await sellCar({
      carNumber: "CAR-S59", sellingPrice: 20_000_000, paymentType: "كاش",
      amountPaid: 20_000_000, amountRemaining: 0,
      buyerName: "زبون S59", buyerPhone: "07800000059",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    const s: FinancialSummary = await getSummary();
    const pd: ProfitDist = await getProfitDist();
    const distTotal = pd.partners.reduce((sum, p) => sum + p.profit_iqd, 0);

    expected["dashboardProfit"] = 10_000_000; actual["dashboardProfit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("dashboard profit", 10_000_000, s.monthly_profits_iqd));

    expected["distributionTotal"] = 10_000_000; actual["distributionTotal"] = distTotal;
    assertions.push(assertNear("distribution total", 10_000_000, distTotal));

    // They must match each other
    assertions.push(assertNear("profit=distribution", s.monthly_profits_iqd, distTotal));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S59", "بطاقة الربح = توزيع الأرباح", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
