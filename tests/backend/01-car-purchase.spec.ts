import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, getAmirTx, addCar,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary, type PartnerTx,
} from "./helpers";

describe("S01 — Cash car purchase", () => {
  beforeEach(resetDb);

  it("inventory=q10M, qasa=-10M, partnerCash=-10M, profit=0", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S01", chassis: "CH-S01", model: "Toyota", year: "2024",
      name: "سيارة S01", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    const s: FinancialSummary = await getSummary();

    expected["inventory"] = 10_000_000; actual["inventory"] = s.inventory_value_iqd;
    assertions.push(assertExact("inventory", 10_000_000, s.inventory_value_iqd));

    expected["qasa"] = -10_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", -10_000_000, s.qasa_iqd));

    expected["partnerCash"] = -10_000_000; actual["partnerCash"] = s.total_partner_capital_iqd;
    assertions.push(assertNear("partnerCash", -10_000_000, s.total_partner_capital_iqd));

    expected["profit"] = 0; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertExact("profit", 0, s.monthly_profits_iqd));

    // Verify no sale/profit rows
    const amirTx: PartnerTx[] = await getAmirTx();
    const saleRows = amirTx.filter((tx) => tx.source_type === "car_sale");
    expected["saleRows"] = 0; actual["saleRows"] = saleRows.length;
    assertions.push(assertExact("no sale rows", 0, saleRows.length));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S01", "شراء سيارة كاش", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
