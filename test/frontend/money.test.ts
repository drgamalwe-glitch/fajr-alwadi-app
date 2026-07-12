import { describe, expect, it } from "vitest";
import { moneyAdd, moneyDiv, moneySub, moneyToStorage, toMoney } from "../../src/utils/money";

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
});
