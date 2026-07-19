import { describe, expect, it } from "vitest";
import { formatMoney, moneyAdd, moneyDiv, moneySub, moneyToStorage, toMoney } from "../../src/utils/money";
import { remainingSaleBalance, sumMoneyValues } from "../../src/components/carHelpers";
import { formatEnglishNumber, splitMoneyIntoInstallments } from "../../src/components/partnerHelpers";

describe("decimal money helpers", () => {
  it("does not inherit JavaScript floating point drift", () => {
    expect(moneyToStorage(moneyAdd("0.1", "0.2"))).toBe("0.3");
  });
  it("normalizes Arabic digits and separators", () => {
    expect(toMoney("١٬٢٣٤٫٥٠").toFixed(2)).toBe("1234.50");
  });
  it("keeps subtraction and division deterministic", () => {
    expect(moneySub("1000000", "500000").toFixed()).toBe("500000");
    expect(moneyDiv("1000000", "4").toFixed()).toBe("250000");
  });

  it("formats values beyond JavaScript safe-integer precision without rounding drift", () => {
    expect(formatMoney("9007199254740993.99", "USD")).toBe("9,007,199,254,740,993.99");
  });

  it("sums received payments and computes sale remainder using Decimal", () => {
    const received = sumMoneyValues(["9007199254740992.01", "0.02"]);
    expect(received).toBe("9007199254740992.03");
    expect(remainingSaleBalance("9007199254741000.03", "5", received)).toBe("3");
  });

  it("splits very large USD amounts without passing through Number", () => {
    const parts = splitMoneyIntoInstallments("9007199254740993.99", 3, "USD");
    expect(parts).toEqual([
      "3002399751580331.33",
      "3002399751580331.33",
      "3002399751580331.33",
    ]);
    expect(formatEnglishNumber("9007199254740993.99")).toBe("9,007,199,254,740,993.99");
  });
});
