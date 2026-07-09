import { useEffect, useState } from "react";
import { formatMoney, isMoneyNegative, moneyAbs, type MoneyValue } from "../../utils/money";
import { useAmountPrivacy } from "../../utils/amountPrivacy";

interface PriceDisplayProps {
  amount: MoneyValue;
  currency?: string | null;
  noColor?: boolean;
  compact?: boolean;
}

const formatCompactMoney = (value: MoneyValue, currency?: string | null): string => {
  const money = moneyAbs(value);
  if (money.greaterThanOrEqualTo(1_000_000_000)) {
    const formatted = money.div(1_000_000_000).toDecimalPlaces(1).toFixed(1);
    return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "B";
  }
  if (money.greaterThanOrEqualTo(1_000_000)) {
    const formatted = money.div(1_000_000).toDecimalPlaces(1).toFixed(1);
    return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "M";
  }
  if (money.greaterThanOrEqualTo(1_000)) {
    const formatted = money.div(1_000).toDecimalPlaces(1).toFixed(1);
    return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "K";
  }
  return formatMoney(money, currency);
};

export function PriceDisplay({ amount, currency, noColor, compact }: PriceDisplayProps) {
  const [hideAmounts] = useAmountPrivacy();
  const [revealed, setRevealed] = useState(false);
  // Fixed: display accepts Rust Decimal strings directly and formats without float math.
  const isNegative = isMoneyNegative(amount);
  const abs = moneyAbs(amount);
  const formatted = compact ? formatCompactMoney(abs, currency) : formatMoney(abs, currency);
  const numColor = noColor ? "inherit" : isNegative ? "#f43f5e" : currency === "USD" ? "var(--usd-text-color, #10b981)" : "var(--iq-text-color, #d8a85a)";
  const symColor = numColor;
  const sign = isNegative ? "- " : "";
  const symbol = currency === "USD" ? "USD" : "IQ";

  useEffect(() => {
    setRevealed(false);
  }, [hideAmounts, amount, currency, compact]);

  if (hideAmounts && !revealed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setRevealed(true);
        }}
        title="اضغط لإظهار المبلغ"
        style={{
          color: numColor,
          direction: "ltr",
          font: "inherit",
          fontWeight: "inherit",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "999px",
          padding: "0.05rem 0.45rem",
          cursor: "pointer",
        }}
      >
        •••••• <span style={{ color: symColor }}>{symbol}</span>
      </button>
    );
  }

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
