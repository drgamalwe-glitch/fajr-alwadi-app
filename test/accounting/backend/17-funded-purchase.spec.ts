import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, getAmirTx, addCar,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary, type PartnerTx,
} from "./helpers";

describe("S02 — Funded car purchase", () => {
  beforeEach(resetDb);

  it("inventory=10M, qasa=0, partnerCash=0, profit=0", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S02", chassis: "CH-S02", model: "Toyota", year: "2024",
      name: "سيارة S02", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "تمويل",
      financerName: "ممول S02",
    });

    const s: FinancialSummary = await getSummary();

    expected["inventory"] = 10_000_000; actual["inventory"] = s.inventory_value_iqd;
    assertions.push(assertExact("inventory", 10_000_000, s.inventory_value_iqd));

    expected["qasa"] = 0; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertExact("qasa", 0, s.qasa_iqd));

    expected["partnerCash"] = 0; actual["partnerCash"] = s.total_partner_capital_iqd;
    assertions.push(assertExact("partnerCash", 0, s.total_partner_capital_iqd));

    expected["profit"] = 0; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertExact("profit", 0, s.monthly_profits_iqd));

    const amirTx: PartnerTx[] = await getAmirTx();
    const purchaseRows = amirTx.filter((tx) => tx.source_type === "car_purchase");
    expected["purchaseRows"] = 0; actual["purchaseRows"] = purchaseRows.length;
    assertions.push(assertExact("no purchase rows", 0, purchaseRows.length));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S02", "شراء سيارة بالتمويل", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
