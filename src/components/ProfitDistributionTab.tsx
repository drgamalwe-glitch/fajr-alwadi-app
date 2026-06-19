import { useCallback, useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { ProfitDistributionSummary, ProfitDistributionDetail } from "../types";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import { PriceDisplay } from "./ui";

interface ProfitDistributionTabProps {
  onRefreshAllData: () => Promise<void>;
  onDistributeChange?: (onDistribute: { action: () => void } | null) => void;
}

type ProfitDistributionPartnerRow = {
  partnerName: string;
  drawingsIQD: number;
  drawingsUSD: number;
  profitIQD: number;
  profitUSD: number;
};

type ProfitDistributionGroup = {
  key: string;
  label: string;
  sortKey: string;
  partners: ProfitDistributionPartnerRow[];
};

export function ProfitDistributionTab({ onRefreshAllData, onDistributeChange }: ProfitDistributionTabProps) {
  const [summary, setSummary] = useState<ProfitDistributionSummary | null>(null);
  const [history, setHistory] = useState<ProfitDistributionDetail[]>([]);
  const [activeProfitPage, setActiveProfitPage] = useState("current");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumData, histData] = await Promise.all([
        callTauri<ProfitDistributionSummary>("get_profit_distribution_summary"),
        callTauri<ProfitDistributionDetail[]>("get_profit_distributions"),
      ]);
      setSummary(sumData);
      setHistory(histData);
      await onRefreshAllData();
      return { summary: sumData, history: histData };
    } catch (err: any) {
      setError(err.toString() || "فشل تحميل بيانات توزيع الأرباح");
      return null;
    } finally {
      setLoading(false);
    }
  }, [onRefreshAllData]);

  const handleResetProfits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const newTabKey = await callTauri<string>("reset_profit_distribution_period");
      await loadData();
      setActiveProfitPage(newTabKey || "current");
    } catch (err: any) {
      setError(err.toString() || "فشل تصفير الأرباح");
      setLoading(false);
    }
  }, [loadData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    onDistributeChange?.({ action: handleResetProfits });
    return () => {
      onDistributeChange?.(null);
    };
  }, [onDistributeChange, handleResetProfits]);

  const undistributedUSD = summary?.undistributed_usd || 0;
  const undistributedIQD = summary?.undistributed_iqd || 0;

  const currentGroup = useMemo<ProfitDistributionGroup>(() => {
    const partners = summary?.partners || [];
    const partnerCount = partners.length || 1;
    return {
      key: "current",
      label: "الأرباح الحالية",
      sortKey: "current",
      partners: partners.map((partner) => ({
        partnerName: partner.partner_name,
        drawingsIQD: partner.drawings_iqd,
        drawingsUSD: partner.drawings_usd,
        profitIQD: undistributedIQD / partnerCount,
        profitUSD: undistributedUSD / partnerCount,
      })),
    };
  }, [summary, undistributedIQD, undistributedUSD]);

  const monthlyGroups = useMemo<ProfitDistributionGroup[]>(() => {
    const groups = new Map<string, {
      key: string;
      label: string;
      sortKey: string;
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
      const time = record.distribution.time;
      const notes = record.distribution.notes || "";
      const isManualReset = notes.startsWith("manual-reset:");
      const key = isManualReset ? notes : date;
      const label = isManualReset ? `${date} ${time}` : date;
      const sortKey = `${date} ${time} ${record.distribution.id}`;
      const currency = record.distribution.currency === "USD" ? "USD" : "IQD";
      if (!groups.has(key)) {
        groups.set(key, { key, label, sortKey, partners: new Map() });
      }
      const group = groups.get(key)!;
      if (sortKey > group.sortKey) {
        group.sortKey = sortKey;
      }

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
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .map((group) => ({
        key: group.key,
        label: group.label,
        sortKey: group.sortKey,
        partners: Array.from(group.partners.values()).sort((a, b) => a.partnerName.localeCompare(b.partnerName, "ar")),
      }));
  }, [history]);

  const profitPages = useMemo(() => [currentGroup, ...monthlyGroups], [currentGroup, monthlyGroups]);

  useEffect(() => {
    if (!profitPages.some((page) => page.key === activeProfitPage)) {
      setActiveProfitPage("current");
    }
  }, [activeProfitPage, profitPages]);

  const selectedGroup = profitPages.find((page) => page.key === activeProfitPage) || currentGroup;
  const selectedPageIndex = Math.max(0, profitPages.findIndex((page) => page.key === selectedGroup.key));
  const setProfitPageByIndex = useCallback((pageIndex: number) => {
    const nextPage = profitPages[pageIndex];
    if (nextPage) {
      setActiveProfitPage(nextPage.key);
    }
  }, [profitPages]);

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
          {profitPages.length >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين صفحات الأرباح">
              {profitPages.map((page, idx) => (
                <button
                  key={page.key}
                  type="button"
                  className={`table-page-dot ${idx === selectedPageIndex ? "is-active" : ""}`}
                  onClick={() => setActiveProfitPage(page.key)}
                  aria-label={page.label}
                />
              ))}
            </div>
          )}

          <div
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, selectedPageIndex, profitPages.length, setProfitPageByIndex)}
            onKeyDown={(e) => handlePaginationKeyDown(e, selectedPageIndex, profitPages.length, setProfitPageByIndex)}
            tabIndex={0}
          >
            <div className="table-wrapper" style={{ overflowX: "auto" }}>
              <table className="data-table profit-distribution-table">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: "50px" }}>ت</th>
                    <th rowSpan={2} style={{ width: "130px" }}>التاريخ</th>
                    <th rowSpan={2} style={{ width: "160px" }}>اسم الشريك</th>
                    <th className="profit-col--drawings" colSpan={2} style={{ width: "260px" }}>السحوبات</th>
                    <th className="profit-col--profit" colSpan={2} style={{ width: "260px" }}>الأرباح</th>
                    <th className="profit-col--net" colSpan={2} style={{ width: "260px" }}>الصافي</th>
                  </tr>
                  <tr>
                    <th className="profit-col--drawings">IQD</th>
                    <th className="profit-col--drawings">USD</th>
                    <th className="profit-col--profit">IQD</th>
                    <th className="profit-col--profit">USD</th>
                    <th className="profit-col--net">IQD</th>
                    <th className="profit-col--net">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGroup.partners.map((partner, partnerIdx) => {
                    const partners = selectedGroup.partners;
                    const netIQD = Math.max(0, partner.profitIQD - partner.drawingsIQD);
                    const netUSD = Math.max(0, partner.profitUSD - partner.drawingsUSD);
                    return (
                      <tr key={`${selectedGroup.key}-${partner.partnerName}`}>
                        {partnerIdx === 0 && (
                          <>
                            <td className="font-bold" rowSpan={partners.length}>{selectedPageIndex + 1}</td>
                            <td rowSpan={partners.length}>{selectedGroup.label}</td>
                          </>
                        )}
                        <td className="font-bold">{partner.partnerName}</td>
                        <td className="profit-col--drawings">
                          <span>
                            <PriceDisplay amount={partner.drawingsIQD} currency="IQD" noColor />
                          </span>
                        </td>
                        <td className="profit-col--drawings">
                          <span>
                            <PriceDisplay amount={partner.drawingsUSD} currency="USD" noColor />
                          </span>
                        </td>
                        <td className="profit-col--profit">
                          <span className="font-bold">
                            <PriceDisplay amount={partner.profitIQD} currency="IQD" noColor />
                          </span>
                        </td>
                        <td className="profit-col--profit">
                          <span className="font-bold">
                            <PriceDisplay amount={partner.profitUSD} currency="USD" noColor />
                          </span>
                        </td>
                        <td className="profit-col--net">
                          <span className="font-bold">
                            <PriceDisplay amount={netIQD} currency="IQD" noColor />
                          </span>
                        </td>
                        <td className="profit-col--net">
                          <span className="font-bold">
                            <PriceDisplay amount={netUSD} currency="USD" noColor />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {selectedGroup.partners.length === 0 && (
                    <tr>
                      <td colSpan={9} className="empty-cell">لا توجد أرباح محفوظة في هذا التبويب</td>
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
