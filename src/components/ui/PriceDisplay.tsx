import { formatNumber } from "../../utils/finance";

interface PriceDisplayProps {
  amount: number;
  currency?: string | null;
  noColor?: boolean;
}

export function PriceDisplay({ amount, currency, noColor }: PriceDisplayProps) {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = formatNumber(abs);
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
