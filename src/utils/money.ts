import Decimal from "decimal.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -20,
  toExpPos: 40,
});

export type MoneyValue = Decimal.Value;
export type MoneyInput = MoneyValue | null | undefined;

const ZERO = new Decimal(0);

function normalizeMoneyText(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\ufeff]/g, "")
    .replace(/[٬،\s]/g, ",")
    .replace(/٫/g, ".")
    .replace(/,/g, "")
    .trim();
}

export function toMoney(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return ZERO;
  if (Decimal.isDecimal(value)) return value;
  const normalized = typeof value === "string" ? normalizeMoneyText(value) : value;
  try {
    return new Decimal(normalized);
  } catch {
    return ZERO;
  }
}

export function moneyAbs(value: MoneyInput): Decimal {
  return toMoney(value).abs();
}

export function moneyNeg(value: MoneyInput): Decimal {
  return toMoney(value).negated();
}

export function moneyAdd(...values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((sum, value) => sum.plus(toMoney(value)), ZERO);
}

export function moneySub(left: MoneyInput, right: MoneyInput): Decimal {
  return toMoney(left).minus(toMoney(right));
}

export function moneyMul(left: MoneyInput, right: MoneyInput): Decimal {
  return toMoney(left).times(toMoney(right));
}

// Audit note #23: division by zero intentionally returns 0 (total function for
// display math). Callers that need to distinguish "no divisor" must guard the
// divisor themselves (see carProfitPercentage).
export function moneyDiv(left: MoneyInput, right: MoneyInput): Decimal {
  const divisor = toMoney(right);
  return divisor.isZero() ? ZERO : toMoney(left).div(divisor);
}

export function moneySum<T>(items: readonly T[], selector: (item: T) => MoneyInput): Decimal {
  return items.reduce<Decimal>((sum, item) => sum.plus(toMoney(selector(item))), ZERO);
}

export function compareMoney(left: MoneyInput, right: MoneyInput): number {
  return toMoney(left).cmp(toMoney(right));
}

export function isMoneyNegative(value: MoneyInput): boolean {
  return toMoney(value).isNegative();
}

export function isMoneyPositive(value: MoneyInput): boolean {
  return toMoney(value).isPositive();
}

export function moneyToStorage(value: MoneyInput): string {
  const money = toMoney(value);
  if (money.isZero()) return "0";
  return money.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed();
}

// Audit fix #24: formatMoney is sign-preserving. Losses/negative balances must
// never be rendered as positive numbers. Callers that intentionally render the
// sign themselves (e.g. PriceDisplay) already pass an absolute value via moneyAbs.
export function formatMoney(value: MoneyInput, currency?: string | null): string {
  const places = currency === "USD" ? 2 : 0;
  const rounded = toMoney(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  return rounded.toNumber().toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}
