import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, getProfitDist, getAmirTx, addCar, sellCar, addCarExpense,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary, type PartnerTx, type ProfitDist,
} from "./helpers";

describe("S05 — Cash sale after cash purchase", () => {
  beforeEach(resetDb);

  it("purchase 10M / sell 16M → qasa=6M, profit=6M, each partner=3M", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S05", chassis: "CH-S05", model: "Toyota", year: "2024",
      name: "سيارة S05", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    await sellCar({
      carNumber: "CAR-S05", sellingPrice: 16_000_000, paymentType: "كاش",
      amountPaid: 16_000_000, amountRemaining: 0,
      buyerName: "زبون S05", buyerPhone: "07800000005",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    const s: FinancialSummary = await getSummary();
    const pd: ProfitDist = await getProfitDist();
    const amirTx: PartnerTx[] = await getAmirTx();

    expected["inventory"] = 0; actual["inventory"] = s.inventory_value_iqd;
    assertions.push(assertExact("inventory", 0, s.inventory_value_iqd));

    expected["qasa"] = 6_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", 6_000_000, s.qasa_iqd));

    expected["partnerCash"] = 6_000_000; actual["partnerCash"] = s.total_partner_capital_iqd;
    assertions.push(assertNear("partnerCash", 6_000_000, s.total_partner_capital_iqd));

    expected["profit"] = 6_000_000; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit", 6_000_000, s.monthly_profits_iqd));

    const amirProfit = pd.partners.find((p) => p.partner_name === "أمير")?.profit_iqd ?? 0;
    const muntasirProfit = pd.partners.find((p) => p.partner_name === "منتصر")?.profit_iqd ?? 0;
    expected["amirProfit"] = 3_000_000; actual["amirProfit"] = amirProfit;
    assertions.push(assertNear("amirProfit", 3_000_000, amirProfit));
    expected["muntasirProfit"] = 3_000_000; actual["muntasirProfit"] = muntasirProfit;
    assertions.push(assertNear("muntasirProfit", 3_000_000, muntasirProfit));

    // Duplicate check
    const cashRows = amirTx.filter((tx) => tx.source_type === "car_sale" && tx.source_role === "cash_movement");
    const profitRows = amirTx.filter((tx) => tx.source_type === "car_sale" && tx.source_role === "profit_recognition");
    expected["cashRows"] = 1; actual["cashRows"] = cashRows.length;
    assertions.push(assertExact("cash rows", 1, cashRows.length));
    expected["profitRows"] = 1; actual["profitRows"] = profitRows.length;
    assertions.push(assertExact("profit rows", 1, profitRows.length));

    // Flag checks
    if (profitRows.length > 0) {
      assertions.push(assertExact("profit affects_qasa", 0, profitRows[0].affects_qasa));
      assertions.push(assertExact("profit affects_partner_cash", 0, profitRows[0].affects_partner_cash));
      assertions.push(assertExact("profit affects_profit", 1, profitRows[0].affects_profit));
    }
    if (cashRows.length > 0) {
      assertions.push(assertExact("cash affects_qasa", 1, cashRows[0].affects_qasa));
      assertions.push(assertExact("cash affects_partner_cash", 1, cashRows[0].affects_partner_cash));
      assertions.push(assertExact("cash affects_profit", 0, cashRows[0].affects_profit));
    }

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S05", "بيع كاش بعد شراء كاش", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S08 — Cash sale with car expense", () => {
  beforeEach(resetDb);

  it("purchase 10M / car expense 2M / sell 18M → profit=6M", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S08", chassis: "CH-S08", model: "Toyota", year: "2024",
      name: "سيارة S08", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    await addCarExpense({
      carNumber: "CAR-S08", description: "اصلاح", amount: 2_000_000,
      date: "2024-01-05", currency: "IQD",
    });

    await sellCar({
      carNumber: "CAR-S08", sellingPrice: 18_000_000, paymentType: "كاش",
      amountPaid: 18_000_000, amountRemaining: 0,
      buyerName: "زبون S08", buyerPhone: "07800000008",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    const s: FinancialSummary = await getSummary();

    expected["profit"] = 6_000_000; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit", 6_000_000, s.monthly_profits_iqd));

    expected["qasa"] = 6_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", 6_000_000, s.qasa_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S08", "بيع كاش مع مصروف سيارة", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S09 — Cash sale at loss", () => {
  beforeEach(resetDb);

  it("purchase 20M / sell 17M → qasa=-3M, no positive profit", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S09", chassis: "CH-S09", model: "Toyota", year: "2024",
      name: "سيارة S09", color: "أبيض", details: "",
      purchase: 20_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    await sellCar({
      carNumber: "CAR-S09", sellingPrice: 17_000_000, paymentType: "كاش",
      amountPaid: 17_000_000, amountRemaining: 0,
      buyerName: "زبون S09", buyerPhone: "07800000009",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    const s: FinancialSummary = await getSummary();

    expected["qasa"] = -3_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", -3_000_000, s.qasa_iqd));

    expected["profit"] = 0; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertExact("profit", 0, s.monthly_profits_iqd));

    expected["inventory"] = 0; actual["inventory"] = s.inventory_value_iqd;
    assertions.push(assertExact("inventory", 0, s.inventory_value_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S09", "بيع كاش بخسارة", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
