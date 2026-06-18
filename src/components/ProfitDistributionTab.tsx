import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { ProfitDistributionSummary, ProfitDistributionDetail } from "../types";
import { PriceDisplay } from "./ui";

interface ProfitDistributionTabProps {
  onRefreshAllData: () => Promise<void>;
  onDistributeChange?: (onDistribute: { action: () => void } | null) => void;
}

export function ProfitDistributionTab({ onRefreshAllData, onDistributeChange }: ProfitDistributionTabProps) {
  const [summary, setSummary] = useState<ProfitDistributionSummary | null>(null);
  const [history, setHistory] = useState<ProfitDistributionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      await callTauri("sync_monthly_profit_distributions");
      const [sumData, histData] = await Promise.all([
        callTauri<ProfitDistributionSummary>("get_profit_distribution_summary"),
        callTauri<ProfitDistributionDetail[]>("get_profit_distributions"),
      ]);
      setSummary(sumData);
      setHistory(histData);
      await onRefreshAllData();
    } catch (err: any) {
      setError(err.toString() || "فشل تحميل بيانات توزيع الأرباح");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    onDistributeChange?.(null);
    return () => {
      onDistributeChange?.(null);
    };
  }, [onDistributeChange]);

  const undistributedUSD = summary?.undistributed_usd || 0;
  const undistributedIQD = summary?.undistributed_iqd || 0;

  const monthlyGroups = useMemo(() => {
    const groups = new Map<string, {
      date: string;
      partners: Map<string, {
        partnerName: string;
        drawingsIQD: number;
        drawingsUSD: number;
        profitIQD: number;
        profitUSD: number;
      }>;
    }>();

    for (const record of history) {
      const date = record.distribution.date;
      const currency = record.distribution.currency === "USD" ? "USD" : "IQD";
      if (!groups.has(date)) {
        groups.set(date, { date, partners: new Map() });
      }
      const group = groups.get(date)!;

      for (const share of record.shares) {
        if (!group.partners.has(share.partner_name)) {
          group.partners.set(share.partner_name, {
            partnerName: share.partner_name,
            drawingsIQD: 0,
            drawingsUSD: 0,
            profitIQD: 0,
            profitUSD: 0,
          });
        }
        const partner = group.partners.get(share.partner_name)!;
        if (currency === "USD") {
          partner.drawingsUSD += share.drawings_deducted;
          partner.profitUSD += share.profit_share;
        } else {
          partner.drawingsIQD += share.drawings_deducted;
          partner.profitIQD += share.profit_share;
        }
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((group) => ({
        date: group.date,
        partners: Array.from(group.partners.values()).sort((a, b) => a.partnerName.localeCompare(b.partnerName, "ar")),
      }));
  }, [history]);

  if (loading && !summary) {
    return <div className="loading-state"><div className="spinner" />جاري تحميل الحسابات وتفاصيل الأرباح...</div>;
  }

  return (
    <div className="dashboard">
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          <div className="cars-tabs financial-tabs">
            <button
              type="button"
              className="top-btn-one top-btn-one--active"
            >
              الأرباح
            </button>
          </div>
        </div>
        <div className="unified-toolbar__center"></div>
        <div className="unified-toolbar__left">
          <div className="currency-card currency-card--usd">
            <div className="usd-glow-ring" />
            <PriceDisplay amount={undistributedUSD} currency="USD" />
          </div>
          <div className="currency-card currency-card--iqd">
            <span className="iqd-star">★</span>
            <PriceDisplay amount={undistributedIQD} currency="IQD" />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "25px", padding: "0 24px 24px", overflowY: "auto", flex: 1 }}>
        {error && <div className="alert alert--error">{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div className="table-card-container">
            <div className="table-wrapper" style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: "50px" }}>ت</th>
                    <th rowSpan={2} style={{ width: "130px" }}>التاريخ</th>
                    <th rowSpan={2} style={{ width: "160px" }}>اسم الشريك</th>
                    <th colSpan={2} style={{ width: "260px" }}>السحوبات</th>
                    <th colSpan={2} style={{ width: "260px" }}>الأرباح</th>
                    <th colSpan={2} style={{ width: "260px" }}>الصافي</th>
                  </tr>
                  <tr>
                    <th>IQD</th>
                    <th>USD</th>
                    <th>IQD</th>
                    <th>USD</th>
                    <th>IQD</th>
                    <th>USD</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyGroups.map((record, groupIdx) => {
                    const partners = record.partners;
                    return partners.map((partner, partnerIdx) => {
                      const netIQD = Math.max(0, partner.profitIQD - partner.drawingsIQD);
                      const netUSD = Math.max(0, partner.profitUSD - partner.drawingsUSD);
                      return (
                        <tr key={`${record.date}-${partner.partnerName}`}>
                          {partnerIdx === 0 && (
                            <>
                              <td className="font-bold" rowSpan={partners.length}>{groupIdx + 1}</td>
                              <td rowSpan={partners.length}>{record.date}</td>
                            </>
                          )}
                          <td className="font-bold">{partner.partnerName}</td>
                          <td>
                            <span style={{ color: partner.drawingsIQD > 0 ? "#ef4444" : "rgba(255,255,255,0.3)" }}>
                              <PriceDisplay amount={partner.drawingsIQD} currency="IQD" noColor />
                            </span>
                          </td>
                          <td>
                            <span style={{ color: partner.drawingsUSD > 0 ? "#ef4444" : "rgba(255,255,255,0.3)" }}>
                              <PriceDisplay amount={partner.drawingsUSD} currency="USD" noColor />
                            </span>
                          </td>
                          <td>
                            <span className="text-green font-bold">
                              <PriceDisplay amount={partner.profitIQD} currency="IQD" noColor />
                            </span>
                          </td>
                          <td>
                            <span className="text-green font-bold">
                              <PriceDisplay amount={partner.profitUSD} currency="USD" noColor />
                            </span>
                          </td>
                          <td>
                            <span className="text-gold font-bold">
                              <PriceDisplay amount={netIQD} currency="IQD" noColor />
                            </span>
                          </td>
                          <td>
                            <span className="text-gold font-bold">
                              <PriceDisplay amount={netUSD} currency="USD" noColor />
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })}
                  {monthlyGroups.length === 0 && (
                    <tr>
                      <td colSpan={9} className="empty-cell">لا توجد أرباح شهرية محفوظة في النظام</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
