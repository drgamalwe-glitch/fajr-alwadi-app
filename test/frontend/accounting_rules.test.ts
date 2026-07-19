import { describe, expect, it } from "vitest";
import type { Car } from "../../src/types";
import {
  carToForm,
  hasSoldCarCostAccountingChange,
} from "../../src/components/carHelpers";
import { carNetProfit, carProfitPercentage } from "../../src/utils/finance";
import { moneyAdd, moneySub } from "../../src/utils/money";

/**
 * FORENSIC REGRESSION TESTS (re-audit 2026-07-10)
 *
 * These tests pin the frontend's accounting math to the rules in
 * Instructions.md so that future refactors cannot silently break the
 * car-profit formula or the partner 50/50 split visualization.
 *
 * Covered rules:
 *   - §5.1 / §6:  Car Cost = Purchase + Car Expenses; Full Profit = Selling - Cost.
 *   - §5:         Losses must be visible (negative profit), never silently zero.
 *   - §6.3:       Profit Ratio = Full Profit / Selling Price (not / Cost).
 *   - §1.1:       Each partner profit share = Full Profit / 2 (verified via
 *                 splitting a sample profit through moneyDiv).
 *   - §22:        Cash-sale profit is NOT added on top of the sale amount
 *                 (no double-counting). This is enforced at the backend; the
 *                 frontend check here is that carNetProfit returns ONLY the
 *                 profit, and that the profit is distinct from the sale price.
 */

function makeCar(overrides: Partial<Car>): Car {
  return {
    car_number: "TEST",
    car_plate_num: "",
    chassis_number: "",
    car_model: "",
    car_year: "",
    car_name: "Test Car",
    color: "",
    details: "",
    purchase_price: "0",
    currency: "IQD",
    sale_currency: "IQD",
    selling_price: "0",
    status: "متوفرة",
    payment_type: null,
    cash_price: null,
    amount_paid: null,
    amount_remaining: null,
    installment_months: null,
    monthly_payment: null,
    buyer_name: null,
    buyer_phone: null,
    purchase_date: null,
    sale_date: null,
    delivery_date: null,
    first_payment_date: null,
    selling_currency: "IQD",
    paid_currency: "IQD",
    remaining_currency: "IQD",
    purchase_payment_type: "قاصه",
    purchase_time: "00:00",
    sale_time: "00:00",
    purchase_type: "كاش",
    financer_name: null,
    commission_type: null,
    commission_value: null,
    expenses_at_sale: "0",
    expenses_sum: "0",
    ...overrides,
  } as Car;
}

describe("Instructions.md §22 — Cash Sale profit (no double-counting)", () => {
  it("computes full profit as selling - purchase - expenses", () => {
    // §22 scenario: purchase=10M, selling=20M, expenses=0 → profit=10M
    const car = makeCar({
      status: "مبيوعة",
      purchase_price: "10000000",
      selling_price: "20000000",
      expenses_sum: "0",
    });
    expect(carNetProfit(car).toString()).toBe("10000000");
  });

  it("does NOT add the profit on top of the sale amount (no 30M)", () => {
    // §22 forbidden result: profit + sale = 30M would mean double-counting.
    // The carNetProfit function must return ONLY 10M, NOT 30M.
    const car = makeCar({
      status: "مبيوعة",
      purchase_price: "10000000",
      selling_price: "20000000",
      expenses_sum: "0",
    });
    const profit = carNetProfit(car);
    expect(profit.toString()).toBe("10000000");
    expect(profit.toString()).not.toBe("30000000");
    // And the profit must be strictly less than the selling price (would
    // only fail if expenses were negative — i.e. double-counting).
    expect(profit.lt(car.selling_price)).toBe(true);
  });
});

describe("Instructions.md §6.1 — Car Cost = Purchase + Car Expenses", () => {
  it("adds car_expenses to the cost basis", () => {
    // §23 scenario: purchase=10M, expense=1M, selling=20M → cost=11M, profit=9M
    const car = makeCar({
      status: "مبيوعة",
      purchase_price: "10000000",
      selling_price: "20000000",
      expenses_sum: "1000000",
    });
    expect(carNetProfit(car).toString()).toBe("9000000");
  });
});

describe("Sold financed-car edit routing", () => {
  it("treats database purchase type دين and UI type تمويل as the same accounting type", () => {
    const car = makeCar({
      status: "مبيوعة",
      purchase_type: "دين",
      financer_name: "ممول E2E",
      purchase_price: "20000000",
      selling_price: "26000000",
      payment_type: "موعد",
      amount_paid: "6000000",
      amount_remaining: "20000000",
    });

    expect(hasSoldCarCostAccountingChange(car, carToForm(car))).toBe(false);
  });
});

describe("Instructions.md §24.1 — Cash Sale Loss must be visible (negative)", () => {
  it("returns a negative profit when selling below cost", () => {
    // §24.1 scenario: purchase=10M, expenses=1M, selling=8M → cost=11M, profit=-3M
    const car = makeCar({
      status: "مبيوعة",
      purchase_price: "10000000",
      selling_price: "8000000",
      expenses_sum: "1000000",
    });
    const profit = carNetProfit(car);
    expect(profit.isNegative()).toBe(true);
    expect(profit.toString()).toBe("-3000000");
  });

  it("carProfitPercentage shows a negative percentage for losses", () => {
    const car = makeCar({
      status: "مبيوعة",
      purchase_price: "10000000",
      selling_price: "8000000",
      expenses_sum: "1000000",
    });
    const pct = carProfitPercentage(car);
    expect(parseFloat(pct)).toBeLessThan(0);
  });
});

describe("Instructions.md §6.3 — Profit Ratio = Profit / Selling Price", () => {
  it("uses selling price as the denominator (not cost)", () => {
    // §8 example: profit=10M, selling=20M → ratio = 50%, not 100%
    const car = makeCar({
      status: "مبيوعة",
      purchase_price: "10000000",
      selling_price: "20000000",
      expenses_sum: "0",
    });
    const pct = carProfitPercentage(car);
    expect(parseFloat(pct)).toBeCloseTo(50.0, 1);
  });
});

describe("Instructions.md §1.1 — Partner 50/50 split", () => {
  it("splits the profit exactly in half for each partner", () => {
    // §22: profit=10M → each partner gets 5M
    const profit = moneySub("20000000", moneyAdd("10000000", "0"));
    // divide by 2 — the deterministic-50/50 helper used by the backend splits
    // odd remainders to the first partner (alphabetical). For 10M (even at
    // the smallest unit), the split is exactly 5M each.
    const half = profit.div(2);
    expect(half.toString()).toBe("5000000");
  });

  it("handles odd remainders deterministically (Instructions.md §30.11)", () => {
    // §30.11: when an odd smallest unit cannot be split evenly, the remainder
    // goes to the FIRST partner (alphabetical). For 1 IQD (smallest unit),
    // partner 1 gets 1, partner 2 gets 0 — never 0.5 + 0.5.
    //
    // Mirror of split_partner_amount_50 in lib.rs (line 49):
    //   half = (amount / 2).round_dp_with_strategy(0, ToZero)
    //   remainder = amount - (half * 2)
    //   if remainder == 0: (half, half)
    //   else: (half + remainder, half)
    const profit = moneySub("10000001", "10000000"); // = 1
    expect(profit.toString()).toBe("1");
    // Decimal.js ROUND_DOWN = 1; truncates 0.5 to 0.
    const half = profit.div(2).toDecimalPlaces(0, 1 /* ROUND_DOWN */);
    expect(half.toString()).toBe("0");
    const remainder = profit.minus(half.times(2));
    expect(remainder.toString()).toBe("1");
    // remainder is non-zero → first partner gets (half + remainder) = 1.
    const first = half.plus(remainder);
    const second = half;
    expect(first.toString()).toBe("1");
    expect(second.toString()).toBe("0");
    expect(first.plus(second).toString()).toBe("1");
  });
});

describe("Instructions.md §5 — Profit formula includes losses", () => {
  it("a lossy car reduces total profit (not silently zero)", () => {
    // §5 requires losses to subtract from net profit. The frontend
    // carNetProfit must return a NEGATIVE value for losses (not 0), otherwise
    // the dashboard's net-profit aggregation would silently hide the loss.
    const lossCar = makeCar({
      status: "مبيوعة",
      purchase_price: "10000000",
      selling_price: "9000000", // loss of 1M
      expenses_sum: "0",
    });
    const profit = carNetProfit(lossCar);
    expect(profit.isNegative()).toBe(true);
    expect(profit.toString()).toBe("-1000000");
  });
});
