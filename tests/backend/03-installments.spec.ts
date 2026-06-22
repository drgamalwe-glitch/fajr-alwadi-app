import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, getProfitDist, getAmirTx, addCar, addPartnerTx,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary, type PartnerTx, type ProfitDist,
} from "./helpers";

describe("S10 — Installment sale, after down payment", () => {
  beforeEach(resetDb);

  it("purchase 10M / sell 20M / down 5M → profit=2.5M, qasa=-5M", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S10", chassis: "CH-S10", model: "Toyota", year: "2024",
      name: "سيارة S10", color: "أبيض", details: "",
      purchase: 10_000_000, selling: 20_000_000,
      status: "مبيوعة", paymentType: "اقساط",
      amountPaid: 5_000_000, amountRemaining: 15_000_000,
      installmentMonths: 15, monthlyPayment: 1_000_000,
      buyerName: "زبون S10", buyerPhone: "07800000010",
      purchaseDate: "2024-01-01", saleDate: "2024-01-15",
      firstPaymentDate: "2024-02-15",
      currency: "IQD", saleCurrency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    const s: FinancialSummary = await getSummary();
    const pd: ProfitDist = await getProfitDist();

    expected["profit"] = 2_500_000; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit", 2_500_000, s.monthly_profits_iqd));

    expected["qasa"] = -5_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", -5_000_000, s.qasa_iqd));

    const amirProfit = pd.partners.find((p) => p.partner_name === "أمير")?.profit_iqd ?? 0;
    expected["amirProfit"] = 1_250_000; actual["amirProfit"] = amirProfit;
    assertions.push(assertNear("amirProfit", 1_250_000, amirProfit));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S10", "بيع بالاقساط — بعد المقدمة", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S11 — Installment sale, after one installment", () => {
  beforeEach(resetDb);

  it("down 5M + 1 installment → total profit=3M", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S11", chassis: "CH-S11", model: "Toyota", year: "2024",
      name: "سيارة S11", color: "أبيض", details: "",
      purchase: 10_000_000, selling: 20_000_000,
      status: "مبيوعة", paymentType: "اقساط",
      amountPaid: 5_000_000, amountRemaining: 15_000_000,
      installmentMonths: 15, monthlyPayment: 1_000_000,
      buyerName: "زبون S11", buyerPhone: "07800000011",
      purchaseDate: "2024-01-01", saleDate: "2024-01-15",
      firstPaymentDate: "2024-02-15",
      currency: "IQD", saleCurrency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    // Pay one installment
    await addPartnerTx({
      partner_name: "زبون S11", kind: "زبون",
      type_: "تسديد قسط سيارة", amount: 1_000_000,
      date: "2024-02-15", notes: "تسديد قسط سيارة CAR-S11",
      currency: "IQD", payment_type: "قاصه",
    });

    const s: FinancialSummary = await getSummary();
    const pd: ProfitDist = await getProfitDist();

    expected["profit"] = 3_000_000; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit", 3_000_000, s.monthly_profits_iqd));

    expected["qasa"] = -4_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", -4_000_000, s.qasa_iqd));

    const amirProfit = pd.partners.find((p) => p.partner_name === "أمير")?.profit_iqd ?? 0;
    expected["amirProfit"] = 1_500_000; actual["amirProfit"] = amirProfit;
    assertions.push(assertNear("amirProfit", 1_500_000, amirProfit));

    // Profit cap check — recognized profit must not exceed full car profit
    const totalProfit = pd.partners.reduce((sum, p) => sum + p.profit_iqd, 0);
    expected["totalProfit"] = 3_000_000; actual["totalProfit"] = totalProfit;
    assertions.push(assertNear("total profit", 3_000_000, totalProfit));
    if (totalProfit > 10_000_000) {
      assertions.push(assertNear("profit cap exceeded", 10_000_000, totalProfit));
    }

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S11", "بيع بالاقساط — بعد قسط واحد", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S12 — Installment sale, after all payments", () => {
  beforeEach(resetDb);

  it("all 15 installments → total profit=10M, remaining=0", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addCar({
      num: "CAR-S12", chassis: "CH-S12", model: "Toyota", year: "2024",
      name: "سيارة S12", color: "أبيض", details: "",
      purchase: 10_000_000, selling: 20_000_000,
      status: "مبيوعة", paymentType: "اقساط",
      amountPaid: 5_000_000, amountRemaining: 15_000_000,
      installmentMonths: 15, monthlyPayment: 1_000_000,
      buyerName: "زبون S12", buyerPhone: "07800000012",
      purchaseDate: "2024-01-01", saleDate: "2024-01-15",
      firstPaymentDate: "2024-02-15",
      currency: "IQD", saleCurrency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    // Pay all 15 installments
    for (let i = 0; i < 15; i++) {
      await addPartnerTx({
        partner_name: "زبون S12", kind: "زبون",
        type_: "تسديد قسط سيارة", amount: 1_000_000,
        date: `2024-${String(i + 2).padStart(2, "0")}-15`,
        notes: `تسديد قسط سيارة CAR-S12`,
        currency: "IQD", payment_type: "قاصه",
      });
    }

    const s: FinancialSummary = await getSummary();
    const pd: ProfitDist = await getProfitDist();

    expected["profit"] = 10_000_000; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertNear("profit", 10_000_000, s.monthly_profits_iqd));

    expected["qasa"] = 10_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", 10_000_000, s.qasa_iqd));

    const amirProfit = pd.partners.find((p) => p.partner_name === "أمير")?.profit_iqd ?? 0;
    const muntasirProfit = pd.partners.find((p) => p.partner_name === "منتصر")?.profit_iqd ?? 0;
    expected["amirProfit"] = 5_000_000; actual["amirProfit"] = amirProfit;
    assertions.push(assertNear("amirProfit", 5_000_000, amirProfit));
    expected["muntasirProfit"] = 5_000_000; actual["muntasirProfit"] = muntasirProfit;
    assertions.push(assertNear("muntasirProfit", 5_000_000, muntasirProfit));

    // No duplicate final profit
    const totalProfit = pd.partners.reduce((sum, p) => sum + p.profit_iqd, 0);
    expected["totalProfit"] = 10_000_000; actual["totalProfit"] = totalProfit;
    assertions.push(assertNear("totalProfit", 10_000_000, totalProfit));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S12", "بيع بالاقساط — بعد كل الدفعات", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
