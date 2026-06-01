import { useEffect, useState } from "react";
import type { Car, Partner, CashRegisterEntry } from "../types";
import { callTauri } from "../api/tauri";
import { computeDashboardStats } from "../utils/finance";
import { PriceDisplay } from "@/components/ui";

interface DashboardProps {
  cars: Car[];
  partners?: Partner[];
}

export function Dashboard({ cars, partners = [] }: DashboardProps) {
  const stats = computeDashboardStats(cars, partners);
  const [entries, setEntries] = useState<CashRegisterEntry[]>([]);

  useEffect(() => {
    void callTauri<CashRegisterEntry[]>("get_cash_register_entries")
      .then((data) => setEntries(data ?? []))
      .catch(() => setEntries([]));
  }, []);

  const iqdBalance = entries.length > 0
    ? entries.filter(e => e.currency !== "USD").reduce((sum, e) => sum + e.amount, 0)
    : 0;
  const usdBalance = entries.length > 0
    ? entries.filter(e => e.currency === "USD").reduce((sum, e) => sum + e.amount, 0)
    : 0;

  const availableCarsCount = cars.filter((c) => c.status === "متوفرة").length;
  const partnersCount = partners.filter((p) => p.kind === "شريك").length;
  const investorsCount = partners.filter((p) => p.kind === "مستثمر").length;

  const netIqd = Math.round(iqdBalance + stats.iqdInventory - stats.investorsTotal);
  const netUsd = Math.round(usdBalance + stats.usdInventory);

  const expensesIqd = entries
    .filter(e => e.type_ === "مصروف" && e.currency !== "USD")
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const expensesUsd = entries
    .filter(e => e.type_ === "مصروف" && e.currency === "USD")
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const debtCars = cars.filter(c => c.status === "مبيوعة" && (c.payment_type === "موعد" || c.payment_type === "اقساط"));
  const debtIqd = debtCars
    .filter(c => c.sale_currency !== "USD")
    .reduce((sum, c) => sum + (c.amount_remaining ?? 0), 0);
  const debtUsd = debtCars
    .filter(c => c.sale_currency === "USD")
    .reduce((sum, c) => sum + (c.amount_remaining ?? 0), 0);

  function StatCard({ title, iqdValue, usdValue, wide }: { title: string; iqdValue: number; usdValue: number; wide?: boolean }) {
    const boxStyle = wide ? { padding: "0.75rem 1.5rem", minWidth: "200px" } : { padding: "0.75rem 1rem", minWidth: "0" };
    return (
      <article className="stat-card" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0",
        padding: "1.5rem 2rem",
        position: "relative",
      }}>
        <h3 className="stat-label" style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "0.5px", marginBottom: 0 }}>{title}</h3>
        <svg viewBox="0 0 100 36" style={{ width: "180px", height: "36px", margin: "4px 0 6px 0" }}>
          <path d="M 50 0 L 50 12 Q 50 17, 25 17 L 18 34 M 50 12 Q 50 17, 75 17 L 82 34"
                stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="18" cy="34" r="2" fill="rgba(216,168,90,0.5)" />
          <circle cx="82" cy="34" r="2" fill="rgba(16,185,129,0.5)" />
        </svg>
        <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
          <div style={{
            flex: "1 1 0",
            background: "linear-gradient(135deg, rgba(216,168,90,0.18), rgba(216,168,90,0.08))",
            borderRadius: "12px",
            ...boxStyle,
            direction: "ltr",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "1.3rem",
            color: "#d8a85a",
            border: "1px solid rgba(216,168,90,0.2)",
            boxShadow: "0 0 15px rgba(216,168,90,0.08)",
          }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 400, color: "rgba(216,168,90,0.6)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
            <PriceDisplay amount={iqdValue} />
          </div>
          <div style={{
            flex: "1 1 0",
            background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))",
            borderRadius: "12px",
            ...boxStyle,
            direction: "ltr",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "1.3rem",
            color: "#10b981",
            border: "1px solid rgba(16,185,129,0.2)",
            boxShadow: "0 0 15px rgba(16,185,129,0.08)",
          }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 400, color: "rgba(16,185,129,0.6)", marginBottom: "4px", direction: "rtl" }}>الدولار الامريكي</div>
            <PriceDisplay amount={usdValue} currency="USD" />
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="dashboard">
      <div className="page-intro">
        <h2 className="page-intro__title">لوحة المعلومات</h2>
        <p className="page-intro__desc">نظرة سريعة على المعرض والوضع المالي</p>
      </div>

      <div className="dash-section">
        <div className="dash-section__title">الملخص المالي</div>
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <StatCard title="رصيد القاصة الحالي" iqdValue={iqdBalance} usdValue={usdBalance} wide />
          <StatCard title="مبلغ السيارات المعروضة" iqdValue={stats.iqdInventory} usdValue={stats.usdInventory} />
          <StatCard title="مبلغ المستثمرين" iqdValue={stats.investorsTotal} usdValue={0} />
          <StatCard title="صافي للشركاء" iqdValue={netIqd} usdValue={netUsd} />
          <StatCard title="المصروفات" iqdValue={expensesIqd} usdValue={expensesUsd} />
          <StatCard title="ديون العملاء" iqdValue={debtIqd} usdValue={debtUsd} />
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
