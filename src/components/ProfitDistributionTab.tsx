import { useCallback, useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { ProfitDistributionSummary } from "../types";
import { PriceDisplay } from "./ui";

interface ProfitDistributionTabProps {
  onRefreshAllData: () => Promise<void>;
  onDistributeChange?: (onDistribute: { action: () => void } | null) => void;
}

export function ProfitDistributionTab({ onRefreshAllData, onDistributeChange }: ProfitDistributionTabProps) {
  const [summary, setSummary] = useState<ProfitDistributionSummary | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sumData = await callTauri<ProfitDistributionSummary>("get_profit_distribution_summary", {
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setSummary(sumData);
      await onRefreshAllData();
    } catch (err: any) {
      setError(err.toString() || "فشل تحميل بيانات توزيع الأرباح");
    } finally {
      setLoading(false);
    }
  }, [onRefreshAllData, startDate, endDate]);

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

  const partners = summary?.partners || [];

  // Calculate totals for summary cards
  const totalProfitUSD = partners.reduce((sum, p) => sum + p.profit_usd, 0);
  const totalProfitIQD = partners.reduce((sum, p) => sum + p.profit_iqd, 0);

  return (
    <div className="dashboard">
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          <div className="cars-tabs financial-tabs">
            <button
              type="button"
              className="top-btn-one top-btn-one--active"
            >
              عرض الأرباح والسحوبات للشركاء
            </button>
          </div>
        </div>
        
        {/* Date Filter Toolbar */}
        <div className="unified-toolbar__center" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="date-filter-group" style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.05)", padding: "4px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ color: "#d4af37", fontSize: "14px", fontWeight: "bold" }}>من:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="form-input"
              style={{ background: "transparent", border: "none", color: "#fff", fontSize: "14px", outline: "none", cursor: "pointer" }}
            />
            <span style={{ color: "#d4af37", fontSize: "14px", fontWeight: "bold", marginLeft: "10px" }}>إلى:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="form-input"
              style={{ background: "transparent", border: "none", color: "#fff", fontSize: "14px", outline: "none", cursor: "pointer" }}
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => { setStartDate(""); setEndDate(""); }}
                style={{ background: "rgba(255, 68, 68, 0.2)", border: "none", color: "#ff4444", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", cursor: "pointer", marginLeft: "8px" }}
              >
                تفريغ
              </button>
            )}
          </div>
        </div>

        <div className="unified-toolbar__left">
          <div className="currency-card currency-card--usd">
            <div className="usd-glow-ring" />
            <PriceDisplay amount={totalProfitUSD} currency="USD" />
          </div>
          <div className="currency-card currency-card--iqd">
            <span className="iqd-star">★</span>
            <PriceDisplay amount={totalProfitIQD} currency="IQD" />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "25px", padding: "0 24px 24px", overflowY: "auto", flex: 1 }}>
        {error && <div className="alert alert--error">{error}</div>}

        {/* بطاقات ملخص الأرباح غير الموزعة */}
        <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
          <div className="dashboard-card" style={{ background: "linear-gradient(135deg, rgba(216, 168, 90, 0.15) 0%, rgba(216, 168, 90, 0.02) 100%)", border: "1px solid rgba(216, 168, 90, 0.2)", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>الأرباح غير الموزعة (IQD)</span>
            <span className="dashboard-card__val font-bold" style={{ fontSize: "var(--fs-xl)", color: "#d8a85a", display: "flex", alignItems: "center", gap: "8px" }}>
              <PriceDisplay amount={summary?.undistributed_iqd ?? 0} currency="IQD" />
            </span>
          </div>
          <div className="dashboard-card" style={{ background: "linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.02) 100%)", border: "1px solid rgba(34, 197, 94, 0.2)", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>الأرباح غير الموزعة (USD)</span>
            <span className="dashboard-card__val font-bold" style={{ fontSize: "var(--fs-xl)", color: "#22c55e", display: "flex", alignItems: "center", gap: "8px" }}>
              <PriceDisplay amount={summary?.undistributed_usd ?? 0} currency="USD" />
            </span>
          </div>
        </div>

        <div className="table-card-container" tabIndex={0}>
          {loading ? (
            <div className="loading-state" style={{ padding: "40px" }}>
              <div className="spinner" />
              جاري تحميل وتحديث أرقام الأرباح...
            </div>
          ) : (
            <div className="table-wrapper" style={{ overflowX: "auto" }}>
              <table className="data-table profit-distribution-table">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: "60px" }}>ت</th>
                    <th rowSpan={2} style={{ width: "220px" }}>اسم الشريك</th>
                    <th colSpan={3} style={{ background: "rgba(212, 175, 55, 0.05)", borderBottom: "2px solid #d4af37", color: "#d4af37" }}>
                      معاملات الدينار العراقي (IQD)
                    </th>
                    <th colSpan={3} style={{ background: "rgba(0, 170, 255, 0.05)", borderBottom: "2px solid #00aaff", color: "#00aaff" }}>
                      معاملات الدولار الأمريكي (USD)
                    </th>
                  </tr>
                  <tr>
                    <th style={{ background: "rgba(212, 175, 55, 0.02)" }}>الأرباح</th>
                    <th style={{ background: "rgba(212, 175, 55, 0.02)" }}>السحوبات الشخصية</th>
                    <th style={{ background: "rgba(212, 175, 55, 0.04)", fontWeight: "bold" }}>الصافي</th>
                    
                    <th style={{ background: "rgba(0, 170, 255, 0.02)" }}>الأرباح</th>
                    <th style={{ background: "rgba(0, 170, 255, 0.02)" }}>السحوبات الشخصية</th>
                    <th style={{ background: "rgba(0, 170, 255, 0.04)", fontWeight: "bold" }}>الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner, idx) => {
                    const netIQD = partner.profit_iqd - partner.drawings_iqd;
                    const netUSD = partner.profit_usd - partner.drawings_usd;
                    return (
                      <tr key={partner.partner_name}>
                        <td className="font-bold">{idx + 1}</td>
                        <td className="font-bold" style={{ color: "#d4af37" }}>{partner.partner_name}</td>
                        
                        {/* IQD columns */}
                        <td>
                          <PriceDisplay amount={partner.profit_iqd} currency="IQD" noColor />
                        </td>
                        <td style={{ color: "#ff4444" }}>
                          <PriceDisplay amount={partner.drawings_iqd} currency="IQD" noColor />
                        </td>
                        <td className="font-bold" style={{ color: netIQD >= 0 ? "#00c851" : "#ff4444" }}>
                          <PriceDisplay amount={netIQD} currency="IQD" noColor />
                        </td>

                        {/* USD columns */}
                        <td>
                          <PriceDisplay amount={partner.profit_usd} currency="USD" noColor />
                        </td>
                        <td style={{ color: "#ff4444" }}>
                          <PriceDisplay amount={partner.drawings_usd} currency="USD" noColor />
                        </td>
                        <td className="font-bold" style={{ color: netUSD >= 0 ? "#00c851" : "#ff4444" }}>
                          <PriceDisplay amount={netUSD} currency="USD" noColor />
                        </td>
                      </tr>
                    );
                  })}
                  {partners.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty-cell">لا توجد بيانات أرباح متوفرة للشركاء</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
