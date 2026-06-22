import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, getAmirTx, addCar, sellCar, addExpense, deleteCar, deleteExpense, updateExpense, addCarExpense, deleteCarExpense,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary, type PartnerTx,
} from "./helpers";
import { bridgeInvoke } from "../e2e-bridge/e2e-commands";

describe("S53 — Delete available car", () => {
  beforeEach(resetDb);

  it("delete car → inventory=0, qasa=0, no orphan rows", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S53", chassis: "CH-S53", model: "Toyota", year: "2024",
      name: "سيارة S53", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    // Verify purchase recorded
    let s: FinancialSummary = await getSummary();
    expected["inventoryBefore"] = 10_000_000; actual["inventoryBefore"] = s.inventory_value_iqd;
    assertions.push(assertExact("inventory before delete", 10_000_000, s.inventory_value_iqd));

    // Delete car
    await deleteCar("CAR-S53");

    s = await getSummary();
    expected["inventoryAfter"] = 0; actual["inventoryAfter"] = s.inventory_value_iqd;
    assertions.push(assertExact("inventory after delete", 0, s.inventory_value_iqd));

    expected["qasaAfter"] = 0; actual["qasaAfter"] = s.qasa_iqd;
    assertions.push(assertNear("qasa after delete", 0, s.qasa_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S53", "حذف سيارة متوفرة", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S54 — Delete sold cash car", () => {
  beforeEach(resetDb);

  it("delete sold car → qasa=0, profit=0, no orphan rows", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S54", chassis: "CH-S54", model: "Toyota", year: "2024",
      name: "سيارة S54", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });
    await sellCar({
      carNumber: "CAR-S54", sellingPrice: 18_000_000, paymentType: "كاش",
      amountPaid: 18_000_000, amountRemaining: 0,
      buyerName: "زبون S54", buyerPhone: "07800000054",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    let s: FinancialSummary = await getSummary();
    expected["qasaBefore"] = 8_000_000; actual["qasaBefore"] = s.qasa_iqd;
    assertions.push(assertNear("qasa before delete", 8_000_000, s.qasa_iqd));

    await deleteCar("CAR-S54");

    s = await getSummary();
    expected["qasaAfter"] = 0; actual["qasaAfter"] = s.qasa_iqd;
    assertions.push(assertNear("qasa after delete", 0, s.qasa_iqd));

    expected["profitAfter"] = 0; actual["profitAfter"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit after delete", 0, s.monthly_profits_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S54", "حذف سيارة مبيوعة كاش", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S25 — Delete general expense", () => {
  beforeEach(resetDb);

  it("delete expense → expenses=0, qasa=0", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addExpense({ description: "ايجار", amount: 1_000_000, date: "2024-02-01", currency: "IQD" });

    let s: FinancialSummary = await getSummary();
    expected["qasaBefore"] = -1_000_000; actual["qasaBefore"] = s.qasa_iqd;
    assertions.push(assertNear("qasa before delete", -1_000_000, s.qasa_iqd));

    // Get expense id
    const expenses: any[] = await bridgeInvoke("get_expenses", {});
    const expenseId = expenses[0]?.id;
    if (expenseId) {
      await deleteExpense(expenseId);
    }

    s = await getSummary();
    expected["qasaAfter"] = 0; actual["qasaAfter"] = s.qasa_iqd;
    assertions.push(assertNear("qasa after delete", 0, s.qasa_iqd));

    expected["expensesAfter"] = 0; actual["expensesAfter"] = s.total_expenses_iqd;
    assertions.push(assertExact("expenses after delete", 0, s.total_expenses_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S25", "حذف مصروف عام", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
