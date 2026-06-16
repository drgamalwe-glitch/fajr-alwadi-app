import { PriceDisplay } from "../ui";

interface InventoryCardProps {
  valueIqd: number;
  valueUsd: number;
  availableCarsCount: number;
}

export function InventoryCard({ valueIqd, valueUsd, availableCarsCount }: InventoryCardProps) {
  return (
    <div className="inventory-wrap">
      <div className="inventory-card">
        <div className="inventory-noise" />

      <div className="inventory-glass-reflection" />

      <div className="inventory-content">
        <div className="inventory-header">
          <div className="inventory-title">
            رصيد المعرض
          </div>
          <div className="inventory-count">
            {availableCarsCount} سيارة
          </div>
        </div>

        <div className="inventory-values-frame">
          <div className="inventory-iqd">
            <PriceDisplay amount={valueIqd} noColor />
          </div>

          <div className="inventory-divider-line" />

          <div className="inventory-usd">
            <PriceDisplay amount={valueUsd} currency="USD" noColor />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
