import { PriceDisplay } from "../ui";

interface ProfitCardProps {
  profitIqd: number;
  profitUsd: number;
  monthName: string;
}

export function ProfitCard({ profitIqd, profitUsd, monthName }: ProfitCardProps) {
  const isLoss = profitIqd < 0 || profitUsd < 0;

  return (
    <div className="profit-wrap">
      <div className={`profit-card ${isLoss ? "profit-card--loss" : ""}`}>
        <div className="profit-noise" />

      <div className="profit-glass-reflection" />

      <div className="profit-content">
        <div className="profit-header">
          <div className="profit-title">
            أرباح {monthName}
          </div>
        </div>

        <div className="profit-values-frame">
          <div className="profit-iqd">
            <PriceDisplay amount={Math.abs(profitIqd)} noColor />
          </div>

          <div className="profit-divider-line" />

          <div className="profit-usd">
            <PriceDisplay amount={profitUsd} currency="USD" noColor />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
