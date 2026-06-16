import { PriceDisplay } from "../ui";

interface QasaCardProps {
  cashIqd: number;
  cashUsd: number;
}

export function QasaCard({ cashIqd, cashUsd }: QasaCardProps) {
  return (
    <div className="qasa-wrap">
      <div className="qasa-card">
        <div className="qasa-noise" />

        <div className="qasa-glass-reflection" />

        <div className="qasa-content">
          <div className="qasa-header">
            <div className="qasa-title">
              رصيد القاصة
            </div>
          </div>

          <div className="qasa-values-frame">
            <div className="qasa-iqd">
              <PriceDisplay amount={cashIqd} noColor />
            </div>

            <div className="qasa-divider-line" />

            <div className="qasa-usd">
              <PriceDisplay amount={cashUsd} currency="USD" noColor />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
