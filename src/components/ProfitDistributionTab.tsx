import { useEffect, useState, useMemo } from "react";
import { callTauri } from "../api/tauri";
import type { ProfitDistributionSummary, ProfitDistributionDetail, PartnerProfitShareInput } from "../types";
import { cleanAndNormalizeNumbers } from "../utils/numberInput";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import {
  PriceDisplay,
  PriceInput,
  ActionButton,
} from "./ui";
import { GoldFxButton } from "./ui/GoldFxButton";
import {
  History,
} from "lucide-react";

interface ProfitDistributionTabProps {
  onRefreshAllData: () => Promise<void>;
  onDistributeChange?: (onDistribute: { action: () => void } | null) => void;
}

const DISTRIBUTION_TABS = [
  { id: "distribute", label: "الأرباح" },
  { id: "history", label: "الأرباح السابقة" },
];

interface PartnerSharesUSD {
  paid: string;
  reinvested: string;
  manualSplit: boolean;
}

interface PartnerSharesIQD {
  paid: string;
  reinvested: string;
  manualSplit: boolean;
}

interface PartnerSharesState {
  usd: PartnerSharesUSD;
  iqd: PartnerSharesIQD;
}

interface AdjustedPartnerInfo {
  partner_name: string;
  ratio_usd: number;
  ratio_iqd: number;
  share_usd: number;
  share_iqd: number;
}

const getAdjustedPartners = (
  partners: { partner_name: string; capital_usd: number; capital_iqd: number; drawings_usd: number; drawings_iqd: number; }[],
  totalCapitalUSD: number,
  totalCapitalIQD: number,
  undistributedUSD: number,
  undistributedIQD: number
): AdjustedPartnerInfo[] => {
  if (!partners || partners.length === 0) return [];

  let sumRatioUSD = 0;
  let sumRatioIQD = 0;
  let sumShareUSD = 0;
  let sumShareIQD = 0;

  const list: AdjustedPartnerInfo[] = [];

  partners.forEach((p, index) => {
    const isLast = index === partners.length - 1;

    // USD Ratio & Share
    let ratioUSD = 0;
    let shareUSD = 0;
    if (totalCapitalUSD > 0) {
      if (isLast) {
        ratioUSD = Math.max(0, 100 - sumRatioUSD);
        shareUSD = Math.max(0, undistributedUSD - sumShareUSD);
      } else {
        const exactRatio = (p.capital_usd / totalCapitalUSD) * 100;
        ratioUSD = Number(exactRatio.toFixed(2));
        sumRatioUSD += ratioUSD;

        shareUSD = Number((exactRatio / 100 * undistributedUSD).toFixed(2));
        sumShareUSD += shareUSD;
      }
    }

    // IQD Ratio & Share
    let ratioIQD = 0;
    let shareIQD = 0;
    if (totalCapitalIQD > 0) {
      if (isLast) {
        ratioIQD = Math.max(0, 100 - sumRatioIQD);
        shareIQD = Math.max(0, undistributedIQD - sumShareIQD);
      } else {
        const exactRatio = (p.capital_iqd / totalCapitalIQD) * 100;
        ratioIQD = Number(exactRatio.toFixed(2));
        sumRatioIQD += ratioIQD;

        shareIQD = Math.round(exactRatio / 100 * undistributedIQD);
        sumShareIQD += shareIQD;
      }
    }

    list.push({
      partner_name: p.partner_name,
      ratio_usd: Number(ratioUSD.toFixed(2)),
      ratio_iqd: Number(ratioIQD.toFixed(2)),
      share_usd: Number(shareUSD.toFixed(2)),
      share_iqd: Math.round(shareIQD),
    });
  });

  return list;
};

export function ProfitDistributionTab({ onRefreshAllData, onDistributeChange }: ProfitDistributionTabProps) {
  const [summary, setSummary] = useState<ProfitDistributionSummary | null>(null);
  const [history, setHistory] = useState<ProfitDistributionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"distribute" | "history">("distribute");
  const [page, setPage] = useState(0);
  const [showDistributeModal, setShowDistributeModal] = useState(false);

  useEffect(() => {
    setPage(0);
  }, [activeSubTab]);

  const [sharesInput, setSharesInput] = useState<Record<string, PartnerSharesState>>({});

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumData, histData] = await Promise.all([
        callTauri<ProfitDistributionSummary>("get_profit_distribution_summary"),
        callTauri<ProfitDistributionDetail[]>("get_profit_distributions"),
      ]);
      setSummary(sumData);
      setHistory(histData);

      if (sumData && sumData.partners) {
        const initialShares: typeof sharesInput = {};
        sumData.partners.forEach(p => {
          initialShares[p.partner_name] = {
            usd: { paid: "", reinvested: "", manualSplit: false },
            iqd: { paid: "", reinvested: "", manualSplit: false },
          };
        });
        setSharesInput(initialShares);
      }

    } catch (err: any) {
      setError(err.toString() || "فشل تحميل بيانات توزيع الأرباح");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    onDistributeChange?.({      action: () => {
        setShowDistributeModal(true);
      },
    });
    return () => {
      onDistributeChange?.(null);
    };
  }, [onDistributeChange]);

  const totalCapitalUSD = summary?.partners?.reduce((sum, p) => sum + p.capital_usd, 0) || 0;
  const totalCapitalIQD = summary?.partners?.reduce((sum, p) => sum + p.capital_iqd, 0) || 0;

  useEffect(() => {
    if (!summary || !summary.partners) return;
    const adjusted = getAdjustedPartners(
      summary.partners,
      totalCapitalUSD,
      totalCapitalIQD,
      summary.undistributed_usd || 0,
      summary.undistributed_iqd || 0
    );

    setSharesInput(prev => {
      const next = { ...prev };
      adjusted.forEach(p => {
        const partnerInfo = summary.partners.find(x => x.partner_name === p.partner_name);
        if (!partnerInfo) return;

        const drawingsUSD = partnerInfo.drawings_usd;
        const deductedUSD = Math.min(drawingsUSD, p.share_usd);
        const netUSD = Math.max(0, p.share_usd - deductedUSD);
        const defaultReinvestedUSD = p.share_usd - netUSD; // equals deductedUSD (drawings)

        const drawingsIQD = partnerInfo.drawings_iqd;
        const deductedIQD = Math.min(drawingsIQD, p.share_iqd);
        const netIQD = Math.max(0, p.share_iqd - deductedIQD);
        const defaultReinvestedIQD = p.share_iqd - netIQD; // equals deductedIQD (drawings)

        const prevUSD = prev[p.partner_name]?.usd;
        const prevIQD = prev[p.partner_name]?.iqd;

        next[p.partner_name] = {
          usd: {
            paid: prevUSD?.manualSplit ? prevUSD.paid : netUSD.toFixed(2),
            reinvested: prevUSD?.manualSplit ? prevUSD.reinvested : defaultReinvestedUSD.toFixed(2),
            manualSplit: prevUSD?.manualSplit || false,
          },
          iqd: {
            paid: prevIQD?.manualSplit ? prevIQD.paid : netIQD.toFixed(0),
            reinvested: prevIQD?.manualSplit ? prevIQD.reinvested : defaultReinvestedIQD.toFixed(0),
            manualSplit: prevIQD?.manualSplit || false,
          },
        };
      });
      return next;
    });
  }, [summary, totalCapitalUSD, totalCapitalIQD]);

  const handlePaidChange = (partnerName: string, curr: "usd" | "iqd", val: string) => {
    const cleanVal = cleanAndNormalizeNumbers(val);
    let paidNum = Number(cleanVal) || 0;

    const partner = summary?.partners?.find(p => p.partner_name === partnerName);
    if (!partner || !summary) return;

    const adjusted = getAdjustedPartners(
      summary.partners,
      totalCapitalUSD,
      totalCapitalIQD,
      summary.undistributed_usd || 0,
      summary.undistributed_iqd || 0
    );
    const adjPartner = adjusted.find(p => p.partner_name === partnerName);
    if (!adjPartner) return;
    const shareValue = curr === "usd" ? adjPartner.share_usd : adjPartner.share_iqd;

    if (paidNum > shareValue) {
      paidNum = shareValue;
      val = shareValue.toFixed(curr === "usd" ? 2 : 0);
    }

    // Reinvestment is everything that is not paid out in cash (which includes the drawings deduction)
    const reinvestedNum = Math.max(0, shareValue - paidNum);

    setSharesInput(prev => ({
      ...prev,
      [partnerName]: {
        ...prev[partnerName],
        [curr]: {
          ...prev[partnerName]?.[curr],
          paid: val,
          reinvested: reinvestedNum.toFixed(curr === "usd" ? 2 : 0),
          manualSplit: true,
        },
      }
    }));
  };

  const handleDistribute = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const undistributedUSD = summary?.undistributed_usd || 0;
    const undistributedIQD = summary?.undistributed_iqd || 0;

    if (undistributedUSD <= 0 && undistributedIQD <= 0) {
      alert("لا توجد أرباح غير موزعة متاحة للتوزيع");
      return;
    }

    try {


      if (undistributedUSD > 0) {
        const sharesUSD: PartnerProfitShareInput[] = [];
        for (const partner of summary?.partners || []) {
          const shareData = sharesInput[partner.partner_name];
          const drawings = partner.drawings_usd;
          const paid = Number(cleanAndNormalizeNumbers(shareData?.usd?.paid)) || 0;
          const totalReinvested = Number(cleanAndNormalizeNumbers(shareData?.usd?.reinvested)) || 0;

          // Split the total reinvested column into drawings deduction and additional reinvestment
          const drawingsDeducted = Math.min(drawings, totalReinvested);
          const reinvested = Math.max(0, totalReinvested - drawingsDeducted);

          const actualProfitShare = Number((drawingsDeducted + paid + reinvested).toFixed(2));

          sharesUSD.push({
            partner_name: partner.partner_name,
            profit_share: actualProfitShare,
            drawings_deducted: Number(drawingsDeducted.toFixed(2)),
            amount_reinvested: Number(reinvested.toFixed(2)),
            amount_paid: paid,
          });
        }

        await callTauri("distribute_profits", {
          totalProfit: undistributedUSD,
          currency: "USD",
          notes: notes.trim() || null,
          shares: sharesUSD,
          paymentType: "قاصه",
        });
      }

      if (undistributedIQD > 0) {
        const sharesIQD: PartnerProfitShareInput[] = [];
        for (const partner of summary?.partners || []) {
          const shareData = sharesInput[partner.partner_name];
          const drawings = partner.drawings_iqd;
          const paid = Number(cleanAndNormalizeNumbers(shareData?.iqd?.paid)) || 0;
          const totalReinvested = Number(cleanAndNormalizeNumbers(shareData?.iqd?.reinvested)) || 0;

          // Split the total reinvested column into drawings deduction and additional reinvestment
          const drawingsDeducted = Math.min(drawings, totalReinvested);
          const reinvested = Math.max(0, totalReinvested - drawingsDeducted);

          const actualProfitShare = Math.round(drawingsDeducted + paid + reinvested);

          sharesIQD.push({
            partner_name: partner.partner_name,
            profit_share: actualProfitShare,
            drawings_deducted: Math.round(drawingsDeducted),
            amount_reinvested: Math.round(reinvested),
            amount_paid: paid,
          });
        }

        await callTauri("distribute_profits", {
          totalProfit: undistributedIQD,
          currency: "IQD",
          notes: notes.trim() || null,
          shares: sharesIQD,
          paymentType: "قاصه",
        });
      }

      alert("تمت عملية توزيع الأرباح بنجاح!");
      setNotes("");
      setShowDistributeModal(false);
      await loadData();
      await onRefreshAllData();
    } catch (err: any) {
      alert("فشل توزيع الأرباح: " + err.toString());
    }
  };

  const handleDeleteDistribution = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من إلغاء عملية التوزيع هذه؟ سيتم عكس قيود الحسابات.")) {
      return;
    }

    try {
      await callTauri("delete_profit_distribution", { id });
      alert("تم إلغاء عملية التوزيع وعكس القيود بنجاح.");
      await loadData();
      await onRefreshAllData();
    } catch (err: any) {
      alert("فشل إلغاء التوزيع: " + err.toString());
    }
  };

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageHistory = useMemo(() => {
    return history.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [history, currentPage]);

  if (loading && !summary) {
    return <div className="loading-state"><div className="spinner" />جاري تحميل الحسابات وتفاصيل الأرباح...</div>;
  }

  const undistributedUSD = summary?.undistributed_usd || 0;
  const undistributedIQD = summary?.undistributed_iqd || 0;

  return (
    <div className="dashboard">
      {/* ── شريط الأدوات الموحد في الأعلى ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          <div className="cars-tabs financial-tabs">
            {DISTRIBUTION_TABS.map((tab) => {
              const isActive = activeSubTab === tab.id;
              const btnClass = tab.id === "distribute" ? "top-btn-one" : "top-btn-two";
              const activeClass = tab.id === "distribute" ? "top-btn-one--active" : "top-btn-two--active";
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`${btnClass} ${isActive ? activeClass : ""}`.trim()}
                  onClick={() => setActiveSubTab(tab.id as "distribute" | "history")}
                >
                  {tab.label}
                </button>
              );
            })}
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

        {/* ── نافذة إعداد توزيع الأرباح المنبثقة ── */}
        {showDistributeModal && (
          <div className="fx-confirm-overlay" role="presentation" onClick={() => setShowDistributeModal(false)}>
            <div
              className="fx-confirm-dialog"
              role="dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="fx-confirm-title">تأكيد توزيع الأرباح</div>
              <div className="fx-confirm-message">
                هل أنت متأكد من توزيع الأرباح غير الموزعة على الشركاء؟ سيتم صرف الأرباح نقداً وفقاً لنسب المساهمة المحتسبة.
              </div>
              <div className="fx-confirm-actions">
                <GoldFxButton
                  type="button"
                  variant="green"
                  style={{ flex: 1, margin: 0 }}
                  onClick={() => {
                    setShowDistributeModal(false);
                    void handleDistribute(new Event("submit") as any);
                  }}
                >
                  <span className="gold-fx-btn__label">تأكيد التوزيع</span>
                </GoldFxButton>
                <GoldFxButton
                  type="button"
                  variant="gray"
                  style={{ flex: 1, margin: 0, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)" }}
                  onClick={() => setShowDistributeModal(false)}
                >
                  <span className="gold-fx-btn__label">إلغاء</span>
                </GoldFxButton>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "distribute" ? (
          <>
            {/* ── جدول حصص الشركاء ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div className="table-card-container">
                <div className="table-wrapper" style={{ overflowX: "auto" }}>
                    <table className="data-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ verticalAlign: "middle", width: "160px" }}>اسم الشريك</th>
                        <th rowSpan={2} style={{ verticalAlign: "middle", width: "180px", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>نسبة الشراكة ٪</th>
                        <th rowSpan={2} style={{ verticalAlign: "middle", width: "200px", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>السحوبات</th>
                        <th colSpan={2} style={{ textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                          <span style={{ color: "#10b981", fontWeight: "bold" }}>USD</span>
                        </th>
                        <th colSpan={2} style={{ textAlign: "center" }}>
                          <span style={{ color: "#f59e0b", fontWeight: "bold" }}>IQD</span>
                        </th>
                      </tr>
                      <tr>
                        <th style={{ width: "220px", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>صرف نقدي</th>
                        <th style={{ width: "220px", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>إعادة استثمار</th>
                        <th style={{ width: "220px", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>صرف نقدي</th>
                        <th style={{ width: "220px" }}>إعادة استثمار</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const adjustedList = getAdjustedPartners(
                          summary?.partners || [],
                          totalCapitalUSD,
                          totalCapitalIQD,
                          undistributedUSD,
                          undistributedIQD
                        );

                        return summary?.partners?.map((partner) => {
                          const shareData = sharesInput[partner.partner_name];
                          const adj = adjustedList.find(p => p.partner_name === partner.partner_name);

                          const ratioUSD = adj ? adj.ratio_usd : 0;
                          const shareUSD = adj ? adj.share_usd : 0;
                          const drawingsUSD = partner.drawings_usd;
                          const netUSD = Math.max(0, shareUSD - Math.min(drawingsUSD, shareUSD));

                          const ratioIQD = adj ? adj.ratio_iqd : 0;
                          const shareIQD = adj ? adj.share_iqd : 0;
                          const drawingsIQD = partner.drawings_iqd;
                          const netIQD = Math.max(0, shareIQD - Math.min(drawingsIQD, shareIQD));

                          return (
                            <tr key={partner.partner_name}>
                              <td className="font-bold">
                                <span>{partner.partner_name}</span>
                              </td>
                              <td style={{ borderLeft: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
                                <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
                                  <span style={{ color: "#10b981", fontSize: "var(--fs-sm)", fontWeight: "bold" }}>{ratioUSD.toFixed(2)}%</span>
                                  <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
                                  <span style={{ color: "#f59e0b", fontSize: "var(--fs-sm)", fontWeight: "bold" }}>{ratioIQD.toFixed(2)}%</span>
                                </div>
                              </td>
                              <td style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center", justifyContent: "center" }}>
                                  {drawingsUSD > 0 && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      <span style={{ color: "#10b981", fontSize: "var(--fs-sm)", fontWeight: "bold", direction: "ltr" }}>
                                        <PriceDisplay amount={drawingsUSD} currency="USD" noColor />
                                      </span>
                                    </div>
                                  )}
                                  {drawingsIQD > 0 && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      <span style={{ color: "#f59e0b", fontSize: "var(--fs-sm)", fontWeight: "bold", direction: "ltr" }}>
                                        <PriceDisplay amount={drawingsIQD} currency="IQD" noColor />
                                      </span>
                                    </div>
                                  )}
                                  {drawingsUSD <= 0 && drawingsIQD <= 0 && (
                                    <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
                                  )}
                                </div>
                              </td>
                              <td style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                                <PriceInput
                                  value={shareData?.usd?.paid || ""}
                                  onChange={(val) => handlePaidChange(partner.partner_name, "usd", val)}
                                  disabled={netUSD <= 0}
                                />
                              </td>
                              <td style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                                <PriceInput
                                  value={shareData?.usd?.reinvested || ""}
                                  onChange={() => { }}
                                  disabled={netUSD <= 0}
                                />
                              </td>
                              <td style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                                <PriceInput
                                  value={shareData?.iqd?.paid || ""}
                                  onChange={(val) => handlePaidChange(partner.partner_name, "iqd", val)}
                                  disabled={netIQD <= 0}
                                />
                              </td>
                              <td>
                                <PriceInput
                                  value={shareData?.iqd?.reinvested || ""}
                                  onChange={() => { }}
                                  disabled={netIQD <= 0}
                                />
                              </td>
                            </tr>
                          );
                        })
                      })()}
                      {(!summary?.partners || summary.partners.length === 0) && (
                        <tr>
                          <td colSpan={7} className="empty-cell">لا يوجد شركاء مسجلين بنوع 'شريك'</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* 4. Distribution History Log */
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 8px" }}>
              <History className="text-gold" size={20} />
            </div>

            {totalPages >= 1 && (
              <div className="table-page-dots" aria-label="تنقل بين الصفحات">
                {Array.from({ length: totalPages }, (_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                    onClick={() => setPage(idx)}
                    aria-label={`الصفحة ${idx + 1}`}
                  />
                ))}
              </div>
            )}

            <section
              className="table-card-container"
              onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
              onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
              tabIndex={0}
            >
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "60px" }}>رقم</th>
                      <th>التاريخ والوقت</th>
                      <th>إجمالي الأرباح</th>
                      <th>العملة</th>
                      <th style={{ textAlign: "right" }}>المستفيدون وتوزيع الحصص</th>
                      <th>البيان والملاحظات</th>
                      <th style={{ width: "120px" }}>العمليات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageHistory.map((record) => (
                      <tr key={record.distribution.id}>
                        <td className="font-bold">{record.distribution.id}</td>
                        <td>{record.distribution.date} {record.distribution.time}</td>
                        <td className="font-bold">
                          <PriceDisplay amount={record.distribution.total_profit} currency={record.distribution.currency} />
                        </td>
                        <td>{record.distribution.currency}</td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "var(--fs-sm)", justifyContent: "flex-start" }}>
                            {record.shares.map(s => (
                              <div key={s.id} className="badge-item" style={{
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(255, 255, 255, 0.06)",
                                borderRadius: "8px",
                                padding: "6px 12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "2px",
                                minWidth: "160px",
                                textAlign: "right"
                              }}>
                                <span className="text-gold font-bold" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "2px", marginBottom: "2px" }}>
                                  {s.partner_name}
                                </span>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                  <span className="text-muted">الحصة:</span>
                                  <span className="font-bold"><PriceDisplay amount={s.profit_share} currency={record.distribution.currency} noColor /></span>
                                </div>
                                {s.drawings_deducted > 0 && (
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                    <span className="text-red">خصم مسحوبات:</span>
                                    <span className="text-red font-bold"><PriceDisplay amount={s.drawings_deducted} currency={record.distribution.currency} noColor /></span>
                                  </div>
                                )}
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                  <span className="text-green">صرف نقدي:</span>
                                  <span className="text-green font-bold"><PriceDisplay amount={s.amount_paid} currency={record.distribution.currency} noColor /></span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                  <span className="text-blue">إعادة استثمار:</span>
                                  <span className="text-blue font-bold"><PriceDisplay amount={s.amount_reinvested} currency={record.distribution.currency} noColor /></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {record.distribution.notes || "—"}
                        </td>
                        <td>
                          <ActionButton
                            type="button"
                            variant="danger"
                            style={{ padding: "4px 12px", fontSize: "14px", height: "32px", minWidth: "auto" }}
                            onClick={() => handleDeleteDistribution(record.distribution.id)}
                          >
                            إلغاء وعكس
                          </ActionButton>
                        </td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={7} className="empty-cell">لا توجد عمليات توزيع سابقة في النظام</td>
                      </tr>
                    )}
                    {Array.from({ length: Math.max(0, PAGE_SIZE - pageHistory.length) }).map((_, i) => (
                      <tr key={`empty-${i}`} style={{ pointerEvents: "none" }} className="opacity-25">
                        <td className="cell-num">&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
