import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, addCar, sellCar, addExpense,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary,
} from "./helpers";

describe("S60 — IQD and USD separation", () => {
  beforeEach(resetDb);

  it("IQD car + USD car → separate qasa/cash/profit per currency", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    // IQD car
    await addCar({
      num: "CAR-S60-IQD", chassis: "CH-S60-IQD", model: "Toyota", year: "2024",
      name: "سيارة دينار", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });
    await sellCar({
      carNumber: "CAR-S60-IQD", sellingPrice: 18_000_000, paymentType: "كاش",
      amountPaid: 18_000_000, amountRemaining: 0,
      buyerName: "زبون IQD", buyerPhone: "07800000060",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    // USD car
    await addCar({
      num: "CAR-S60-USD", chassis: "CH-S60-USD", model: "Honda", year: "2024",
      name: "سيارة دولار", color: "أسود", details: "",
      purchase: 8_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "USD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });
    await sellCar({
      carNumber: "CAR-S60-USD", sellingPrice: 12_000, paymentType: "كاش",
      amountPaid: 12_000, amountRemaining: 0,
      buyerName: "زبون USD", buyerPhone: "07800000061",
      saleDate: "2024-01-15", saleCurrency: "USD",
    });

    const s: FinancialSummary = await getSummary();

    // IQD checks
    expected["qasaIqd"] = 8_000_000; actual["qasaIqd"] = s.qasa_iqd;
    assertions.push(assertNear("qasa IQD", 8_000_000, s.qasa_iqd));

    expected["profitIqd"] = 8_000_000; actual["profitIqd"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit IQD", 8_000_000, s.monthly_profits_iqd));

    // USD checks
    expected["qasaUsd"] = 4_000; actual["qasaUsd"] = s.qasa_usd;
    assertions.push(assertNear("qasa USD", 4_000, s.qasa_usd));

    expected["profitUsd"] = 4_000; actual["profitUsd"] = s.monthly_profits_usd;
    assertions.push(assertNear("profit USD", 4_000, s.monthly_profits_usd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S60", "فصل العملات — IQD و USD", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S61 — USD general expense", () => {
  beforeEach(resetDb);

  it("USD expense 500 → USD profit=-500, IQD unchanged", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addExpense({ description: "مصاريف دولار", amount: 500, date: "2024-02-01", currency: "USD" });

    const s: FinancialSummary = await getSummary();

    expected["profitUsd"] = -500; actual["profitUsd"] = s.monthly_profits_usd;
    assertions.push(assertNear("profit USD", -500, s.monthly_profits_usd));

    expected["profitIqd"] = 0; actual["profitIqd"] = s.monthly_profits_iqd;
    assertions.push(assertExact("profit IQD", 0, s.monthly_profits_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S61", "مصروف عام بالدولار", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
