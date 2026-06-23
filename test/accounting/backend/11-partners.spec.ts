import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb, getSummary, getPartners, addPartnerTx, addPartner, deletePartner,
  buildResult, collectAssertions,
  assertExact, assertNear, appendResult,
  type FinancialSummary,
} from "./helpers";

describe("S47 — Partner deposits", () => {
  beforeEach(resetDb);

  it("أمير 5M + منتصر 5M → qasa=10M, partnerCash=10M", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    await addPartnerTx({
      partner_name: "أمير", kind: "شريك",
      type_: "ايداع شريك", amount: 5_000_000,
      date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
    });
    await addPartnerTx({
      partner_name: "منتصر", kind: "شريك",
      type_: "ايداع شريك", amount: 5_000_000,
      date: "2024-01-01", currency: "IQD", payment_type: "قاصه",
    });

    const s: FinancialSummary = await getSummary();

    expected["qasa"] = 10_000_000; actual["qasa"] = s.qasa_iqd;
    assertions.push(assertNear("qasa", 10_000_000, s.qasa_iqd));

    expected["partnerCash"] = 10_000_000; actual["partnerCash"] = s.total_partner_capital_iqd;
    assertions.push(assertNear("partnerCash", 10_000_000, s.total_partner_capital_iqd));

    expected["profit"] = 0; actual["profit"] = s.monthly_profits_iqd;
    assertions.push(assertExact("profit", 0, s.monthly_profits_iqd));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S47", "إيداع الشركاء", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S49 — Block third partner creation", () => {
  beforeEach(resetDb);

  it("creating شريك ثالث must be blocked", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    let errorThrown = false;
    try {
      await addPartner({ name: "شريك ثالث", kind: "شريك", phone: "07800000099" });
    } catch {
      errorThrown = true;
    }

    expected["blocked"] = 1; actual["blocked"] = errorThrown ? 1 : 0;
    assertions.push(assertExact("third partner blocked", 1, errorThrown ? 1 : 0));

    const partners = await getPartners();
    const shurakaCount = partners.filter((p: any) => p.kind === "شريك").length;
    expected["partnerCount"] = 2; actual["partnerCount"] = shurakaCount;
    assertions.push(assertExact("partner count", 2, shurakaCount));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S49", "منع إنشاء شريك ثالث", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});

describe("S50 — Block partner deletion", () => {
  beforeEach(resetDb);

  it("deleting شريك must be blocked", async () => {
    const t0 = Date.now();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    const assertions: import("../accounting-oracle/assertions").AssertionResult[] = [];

    let errorThrown = false;
    try {
      await deletePartner({ name: "أمير", kind: "شريك" });
    } catch {
      errorThrown = true;
    }

    expected["blocked"] = 1; actual["blocked"] = errorThrown ? 1 : 0;
    assertions.push(assertExact("partner deletion blocked", 1, errorThrown ? 1 : 0));

    const partners = await getPartners();
    const shurakaCount = partners.filter((p: any) => p.kind === "شريك").length;
    expected["partnerCount"] = 2; actual["partnerCount"] = shurakaCount;
    assertions.push(assertExact("partner count", 2, shurakaCount));

    const failureReason = collectAssertions(assertions);
    appendResult(buildResult("S50", "منع حذف شريك", expected, actual, assertions, Date.now() - t0, failureReason));
    expect(failureReason).toBe("");
  });
});
