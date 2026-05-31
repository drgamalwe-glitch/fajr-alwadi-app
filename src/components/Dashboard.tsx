import { useEffect, useState } from "react";
import type { Car, Partner } from "../types";
import { callTauri } from "../api/tauri";
import { computeDashboardStats, formatIqd } from "../utils/finance";

interface DashboardProps {
  cars: Car[];
  partners?: Partner[];
}

export function Dashboard({ cars, partners = [] }: DashboardProps) {
  const stats = computeDashboardStats(cars, partners);
  const [cashBalance, setCashBalance] = useState<number>(0);

  useEffect(() => {
    void callTauri<number>("get_cash_register_balance")
      .then((b) => setCashBalance(b ?? 0))
      .catch(() => setCashBalance(0));
  }, []);

  const availableCarsCount = cars.filter((c) => c.status === "متوفرة").length;
  const partnersCount = partners.filter((p) => p.kind === "شريك").length;
  const investorsCount = partners.filter((p) => p.kind === "مستثمر").length;

  return (
    <div className="dashboard">
      <div className="page-intro">
        <h2 className="page-intro__title">لوحة المعلومات</h2>
        <p className="page-intro__desc">نظرة سريعة على المعرض والوضع المالي</p>
      </div>

      <div className="dash-section">
        <div className="dash-section__title">الملخص المالي</div>
        <div className="stats-grid">
          <article className="stat-card stat-card--amber">
            <div className="stat-card__icon" aria-hidden>▣</div>
            <h3 className="stat-label">مبلغ القاصة</h3>
            <p className="stat-value stat-value--amber">{formatIqd(cashBalance)}</p>
          </article>
          <article className="stat-card stat-card--sky">
            <div className="stat-card__icon" aria-hidden>◈</div>
            <h3 className="stat-label">مبلغ السيارات المعروضة</h3>
            <p className="stat-value stat-value--sky">{formatIqd(stats.totalInventoryValue)}</p>
          </article>
          <article className="stat-card stat-card--red">
            <div className="stat-card__icon" aria-hidden>⬢</div>
            <h3 className="stat-label">مبلغ المستثمرين</h3>
            <p className="stat-value stat-value--red">{formatIqd(stats.investorsTotal)}</p>
          </article>
          <article className="stat-card stat-card--green">
            <div className="stat-card__icon" aria-hidden>✦</div>
            <h3 className="stat-label">صافي للشركاء</h3>
            <p className="stat-value stat-value--green">{formatIqd(cashBalance + stats.totalInventoryValue - stats.investorsTotal * 2)}</p>
          </article>
        </div>
      </div>

      <div className="dash-section">
        <div className="dash-section__title">إحصائيات</div>
        <div className="stats-grid">
          <article className="stat-card stat-card--muted">
            <div className="stat-card__icon" aria-hidden>◈</div>
            <h3 className="stat-label">السيارات المتوفرة</h3>
            <p className="stat-value stat-value--muted">{availableCarsCount}</p>
          </article>
          <article className="stat-card stat-card--muted">
            <div className="stat-card__icon" aria-hidden>⊕</div>
            <h3 className="stat-label">الشركاء</h3>
            <p className="stat-value stat-value--muted">{partnersCount}</p>
          </article>
          <article className="stat-card stat-card--muted">
            <div className="stat-card__icon" aria-hidden>⬢</div>
            <h3 className="stat-label">المستثمرين</h3>
            <p className="stat-value stat-value--muted">{investorsCount}</p>
          </article>
        </div>
      </div>
    </div>
  );
}
