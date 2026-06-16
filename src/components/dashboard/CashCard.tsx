import { Coins } from "lucide-react";
import { PriceDisplay } from "../ui";

interface CashCardProps {
  cashIqd: number;
  cashUsd: number;
}

export function CashCard({ cashIqd, cashUsd }: CashCardProps) {
  return (
    <article className="stat-card stat-card--safe card-entry-anim" style={{ animationDelay: "0s" }}>
      <div className="stat-card__pulse" />
      <div className="stat-card__header">
        <span className="stat-card__label">رصيد القاصة</span>
        <div className="stat-card__icon-wrapper">
          <Coins size={17} strokeWidth={2.3} />
        </div>
      </div>
      <div className="stat-card__content">
        <div className="stat-card__val-iqd">
          <PriceDisplay amount={cashIqd} />
        </div>
        <div className="stat-card__val-usd">
          <PriceDisplay amount={cashUsd} currency="USD" />
        </div>
      </div>
      <div className="stat-card__bar" />
    </article>
  );
}
