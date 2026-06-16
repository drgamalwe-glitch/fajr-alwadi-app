import { PriceDisplay } from "../ui";

interface CapitalCardProps {
  capitalIqd: number;
  capitalUsd: number;
}

export function CapitalCard({ capitalIqd, capitalUsd }: CapitalCardProps) {
  return (
    <div className="capital-wrap">
      <div className="capital-card">
        <div className="capital-noise" />

      <div className="capital-glass-reflection" />

      <div className="capital-content">
        <div className="capital-header">
          <div className="capital-title">
            رأس المال
          </div>
        </div>

        <div className="capital-values-frame">
          <div className="capital-iqd">
            <PriceDisplay amount={capitalIqd} noColor />
          </div>

          <div className="capital-divider-line" />

          <div className="capital-usd">
            <PriceDisplay amount={capitalUsd} currency="USD" noColor />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
