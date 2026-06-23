import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, getProfitDist, addCar, sellCar, addExpense,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary, type ProfitDist,
} from "./helpers";

describe("S22 — General expense", () => {
  beforeEach(resetDb);

  it("rent 1M → qasa=-1M, profit=-1M", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addExpense({ description: "ايجار", amount: 1_000_000, date: "2024-02-01", currency: "IQD" });

    const s: FinancialSummary = await getSummary();

    expected["qasa"] = -1_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", -1_000_000, s.qasa_iqd));

    expected["partnerCash"] = -1_000_000; actual["partnerCash"] = s.total_partner_capital_iqd;
    assertions.push(assertNear("partnerCash", -1_000_000, s.total_partner_capital_iqd));

    expected["profit"] = -1_000_000; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit", -1_000_000, s.monthly_profits_iqd));

    expected["inventory"] = 0; actual["inventory"] = s.inventory_value_iqd;
    assertions.push(assertExact("inventory", 0, s.inventory_value_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S22", "مصروف عام", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S23 — General expense after car profit", () => {
  beforeEach(resetDb);

  it("sell 18M / expense 1M → net profit=7M", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S23", chassis: "CH-S23", model: "Toyota", year: "2024",
      name: "سيارة S23", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    await sellCar({
      carNumber: "CAR-S23", sellingPrice: 18_000_000, paymentType: "كاش",
      amountPaid: 18_000_000, amountRemaining: 0,
      buyerName: "زبون S23", buyerPhone: "07800000023",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    await addExpense({ description: "ايجار", amount: 1_000_000, date: "2024-02-01", currency: "IQD" });

    const s: FinancialSummary = await getSummary();

    expected["profit"] = 7_000_000; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit", 7_000_000, s.monthly_profits_iqd));

    expected["qasa"] = 7_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", 7_000_000, s.qasa_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S23", "مصروف عام بعد ربح سيارة", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
