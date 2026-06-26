import { formatMoney, isMoneyNegative, moneyAbs, type MoneyValue } from "../../utils/money";

interface PriceDisplayProps {
  amount: MoneyValue;
  currency?: string | null;
  noColor?: boolean;
}

export function PriceDisplay({ amount, currency, noColor }: PriceDisplayProps) {
  // Fixed: display accepts Rust Decimal strings directly and formats without float math.
  const isNegative = isMoneyNegative(amount);
  const abs = moneyAbs(amount);
  const formatted = formatMoney(abs, currency);
  const numColor = noColor ? "inherit" : isNegative ? "#f43f5e" : currency === "USD" ? "var(--usd-text-color, #10b981)" : "var(--iq-text-color, #d8a85a)";
  const symColor = numColor;
  const sign = isNegative ? "- " : "";

  if (currency === "USD") {
    return (
      <span style={{ color: numColor }} dir="ltr">
        {sign}{formatted} <span style={{ color: symColor }}>USD</span>
      </span>
    );
  }

  return (
    <span style={{ color: numColor }} dir="ltr">
      {sign}{formatted} <span style={{ color: symColor }}>IQ</span>
    </span>
  );
}
