import { useCallback, useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { ProfitDistributionSummary } from "../types";
import { PriceDisplay } from "./ui";

import type { MoneyValue } from "../utils/money";

interface ProfitDistributionTabProps {
  onDistributeChange?: (onDistribute: { action: () => void } | null) => void;
  fromDate: string;
  toDate: string;
  hideToolbar?: boolean;
  onSummaryLoaded?: (usd: MoneyValue, iqd: MoneyValue) => void;
}

export function ProfitDistributionTab({
  onDistributeChange,
  fromDate,
  toDate,
  hideToolbar,
  onSummaryLoaded,
}: ProfitDistributionTabProps) {
  const [summary, setSummary] = useState<ProfitDistributionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sumData = await callTauri<ProfitDistributionSummary>("get_profit_distribution_summary", {
        startDate: fromDate || null,
        endDate: toDate || null,
      });
      setSummary(sumData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err) || "فشل تحميل بيانات توزيع الأرباح");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Clean up any distribution action on sidebar
  useEffect(() => {
    onDistributeChange?.(null);
    return () => {
      onDistributeChange?.(null);
    };
  }, [onDistributeChange]);

  // FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-2):
  // Total profit values are now precomputed by the backend
  // (ProfitDistributionSummary.total_profit_iqd / total_profit_usd).
  // The frontend is a pure renderer — no moneySub/moneySum accounting here.
  useEffect(() => {
    if (onSummaryLoaded && summary) {
      onSummaryLoaded(summary.total_profit_usd, summary.total_profit_iqd);
    }
  }, [summary, onSummaryLoaded]);

  const partners = summary?.partners || [];
  const totalProfitUSD = summary?.total_profit_usd ?? 0;
  const totalProfitIQD = summary?.total_profit_iqd ?? 0;

  return (
    <div className="dashboard">
      {!hideToolbar && (
        <div className="cars-page__toolbar unified-toolbar">
          <div className="unified-toolbar__right">
            <div className="cars-tabs financial-tabs">
              <button
                type="button"
                className="top-btn-one top-btn-one--active"
              >
                الأرباح والسحوبات
              </button>
            </div>
          </div>
          
          <div className="unified-toolbar__center"></div>

          <div className="unified-toolbar__left">
            <div className="currency-card currency-card--usd">
              <div className="usd-glow-ring" />
              <PriceDisplay amount={totalProfitUSD} currency="USD" />
            </div>
            <div className="currency-card currency-card--iqd">
              <PriceDisplay amount={totalProfitIQD} currency="IQD" />
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert alert--error" style={{ margin: "0 24px 12px" }}>{error}</div>}

      <section className="table-card-container" tabIndex={0}>
        {loading ? (
          <div className="loading-state" style={{ padding: "40px" }}>
            <div className="spinner" />
            جاري تحميل وتحديث أرقام الأرباح...
          </div>
        ) : (
          <div className="table-wrapper" style={{ flex: 1, minHeight: 0 }}>
            <table className="data-table profit-distribution-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: "60px" }}>ت</th>
                  <th rowSpan={2} style={{ width: "220px" }}>اسم الشريك</th>
                  <th colSpan={2} className="profit-currency-head profit-currency-head--iqd">
                    معاملات الدينار العراقي (IQD)
                  </th>
                  <th colSpan={2} className="profit-currency-head profit-currency-head--usd">
                    معاملات الدولار الأمريكي (USD)
                  </th>
                </tr>
                <tr>
                  <th className="profit-subhead profit-subhead--iqd">السحوبات الشخصية</th>
                  <th className="profit-subhead profit-subhead--iqd profit-subhead--net">صافي الارباح</th>

                  <th className="profit-subhead profit-subhead--usd">السحوبات الشخصية</th>
                  <th className="profit-subhead profit-subhead--usd profit-subhead--net">صافي الارباح</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner, idx) => {
                  // FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-2):
                  // All values are precomputed by the backend.
                  const netIQD = partner.net_iqd;
                  const netUSD = partner.net_usd;
                  return (
                    <tr key={partner.partner_name}>
                      <td className="font-bold">{idx + 1}</td>
                      <td className="font-bold" style={{ color: "#d4af37" }}>{partner.partner_name}</td>
                      
                      {/* IQD columns */}
                      <td className="profit-money profit-money--drawings">
                        <PriceDisplay amount={partner.drawings_iqd} currency="IQD" noColor />
                      </td>
                      <td className="font-bold profit-money profit-money--net">
                        <PriceDisplay amount={netIQD} currency="IQD" noColor />
                      </td>

                      {/* USD columns */}
                      <td className="profit-money profit-money--drawings">
                        <PriceDisplay amount={partner.drawings_usd} currency="USD" noColor />
                      </td>
                      <td className="font-bold profit-money profit-money--net">
                        <PriceDisplay amount={netUSD} currency="USD" noColor />
                      </td>
                    </tr>
                  );
                })}
                {partners.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-cell">لا توجد بيانات أرباح متوفرة للشركاء</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
