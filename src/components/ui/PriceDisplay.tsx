import { formatNumber } from "../../utils/finance";

interface PriceDisplayProps {
  amount: number;
  currency?: string | null;
}

export function PriceDisplay({ amount, currency }: PriceDisplayProps) {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = formatNumber(abs);
  const numColor = isNegative ? "#f43f5e" : currency === "USD" ? "#10b981" : "#d8a85a";
  const symColor = numColor;
  const sign = isNegative ? "- " : "";

  if (currency === "USD") {
    return (
      <span style={{ color: numColor }} dir="ltr">
        {sign}{formatted} <span style={{ color: symColor }}>$</span>
      </span>
    );
  }

  return (
    <span style={{ color: numColor }} dir="ltr">
      {sign}{formatted} <span style={{ color: symColor }}>د.ع</span>
    </span>
  );
}
