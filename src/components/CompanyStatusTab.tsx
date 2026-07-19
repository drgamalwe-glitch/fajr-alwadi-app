import { useCallback, useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { FinancialSummary, TabId, UnifiedAccount, Partner, CompanyStatus, CompanyStatusPartner } from "../types";
import { PriceDisplay } from "./ui";
import { compareMoney, moneyAbs, type MoneyValue } from "../utils/money";

const normalizePartnerName = (name: string) =>
  name
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");

const PARTNER_IMAGE_PATHS = [
  "/partners/amir.jpg",
  "/partners/muntasir.jpg",
];

/**
 * FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-3):
 * This component is now a PURE RENDERER. All accounting formulas
 * (receivables sum, liabilities sum, company value, 50/50 partner split,
 * partner capital) are precomputed by the backend's `get_company_status`
 * command and delivered as the `CompanyStatus` snapshot.
 *
 * The previous frontend code used `moneyAdd`/`moneySub`/`moneyDiv` to
 * re-implement those formulas in TypeScript, which violated §6.1 (single
 * source of truth).
 *
 * The component still accepts `summary`, `unifiedAccounts`, and `partners`
 * as props for backwards compatibility (the parent Dashboard still loads
 * them), but the displayed values come from `companyStatus`.
 */
export function CompanyStatusTab({
  summary,
  unifiedAccounts: _unifiedAccounts,
  partners,
  sessionToken,
  onNavigateToTab,
  onNavigateToPartner,
}: {
  summary: FinancialSummary | null;
  unifiedAccounts: UnifiedAccount[];
  partners: Partner[];
  sessionToken?: string | null;
  onNavigateToTab?: (tab: TabId, subTab?: string) => void;
  onNavigateToPartner?: (target: string | { name: string; kind?: string | null; action?: "deposit" | "withdraw" | "settle_installment"; transactionId?: number | null }) => void;
}) {
  const [companyStatus, setCompanyStatus] = useState<CompanyStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCompanyStatus = useCallback(async () => {
    setLoadError(null);
    try {
      const status = await callTauri<CompanyStatus>("get_company_status", {
        sessionToken: sessionToken ?? null,
      });
      setCompanyStatus(status);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadCompanyStatus();
  }, [loadCompanyStatus]);

  const sharikPartners = partners.filter((p) => p.kind === "شريك");
  const partner1 = sharikPartners[0] ?? null;
  const partner2 = sharikPartners[1] ?? null;

  const getPartnerImage = (partnerName: string) => {
    const idx = sharikPartners.findIndex((p) => p.partner_name === partnerName);
    return idx >= 0 && idx < PARTNER_IMAGE_PATHS.length ? PARTNER_IMAGE_PATHS[idx] : undefined;
  };
  if (!summary || !companyStatus) {
    return (
      <div className="wadhisharikah-container">
        <div style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "18px", textAlign: "center", padding: "40px" }}>
          {loadError ? `فشل تحميل وضع الشركة: ${loadError}` : "جاري تحميل بيانات وضع الشركة..."}
        </div>
      </div>
    );
  }

  // FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-3):
  // All values below come from the backend's `CompanyStatus` snapshot —
  // no moneyAdd/moneySub/moneyDiv/moneySum formulas here.
  const companyValueIqd = companyStatus.company_value_iqd;
  const companyValueUsd = companyStatus.company_value_usd;
  const isCompanyValueIqdNegative = compareMoney(companyValueIqd, 0) < 0;
  const isCompanyValueUsdNegative = compareMoney(companyValueUsd, 0) < 0;

  // Pull receivables/liabilities from the backend snapshot (precomputed).
  const receivablesIqd = companyStatus.receivables_iqd;
  const receivablesUsd = companyStatus.receivables_usd;
  const liabilitiesIqd = companyStatus.liabilities_iqd;

  // FORENSIC FIX (re-audit 2026-07-11, PHASE-0-BUILD-BLOCKER):
  // `netCashIqd`/`netCashUsd` were never declared in this scope — the previous
  // refactor (FRONT-LOGIC-3) removed the local `moneySub` formulas but left
  // the JSX references dangling. Per the §3 single-source-of-truth rule,
  // cash balances come from the backend snapshot's `cash_iqd` / `cash_usd`
  // fields (already precomputed by `get_company_status`).
  const netCashIqd: MoneyValue = companyStatus.cash_iqd;
  const netCashUsd: MoneyValue = companyStatus.cash_usd;
  const liabilitiesUsd = companyStatus.liabilities_usd;

  // Look up the per-partner precomputed capital from the backend snapshot.
  const findPartnerCapital = (name: string | null): CompanyStatusPartner | null => {
    if (!name) return null;
    const normalized = normalizePartnerName(name);
    return (
      companyStatus.partners.find((p) => normalizePartnerName(p.partner_name) === normalized) ??
      companyStatus.partners.find((p) => normalizePartnerName(p.partner_name).includes(normalized)) ??
      null
    );
  };
  const p1Capital = findPartnerCapital(partner1?.partner_name ?? null);
  const p2Capital = findPartnerCapital(partner2?.partner_name ?? null);
  const p1CapitalIqd: MoneyValue = p1Capital?.capital_iqd ?? 0;
  const p1CapitalUsd: MoneyValue = p1Capital?.capital_usd ?? 0;
  const p2CapitalIqd: MoneyValue = p2Capital?.capital_iqd ?? 0;
  const p2CapitalUsd: MoneyValue = p2Capital?.capital_usd ?? 0;

  const renderPartnerCard = (partner: Partner | null, capitalIqd: MoneyValue, capitalUsd: MoneyValue, colorClass: string) => {
    if (!partner) return null;
    const imgSrc = getPartnerImage(partner.partner_name);
    return (
      <div
        className={`partner-capital-card ${colorClass}`}
        data-testid={`partner-card-${partner.partner_name}`}
        style={{ cursor: "pointer" }}
        role="button"
        tabIndex={0}
        onClick={() => onNavigateToPartner?.(partner.partner_name)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigateToPartner?.(partner.partner_name); }}
      >
        <div className="partner-capital-card__header">
          <div className="partner-capital-card__icon">
            {imgSrc ? (
              <img src={imgSrc} alt={partner.partner_name} className="partner-capital-card__img" />
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>
          <div className="partner-capital-card__identity">
            <div className="partner-capital-card__name">{partner.partner_name}</div>
          </div>
        </div>
        <div className="partner-capital-card__values">
          <div className="partner-capital-card__value">
            <PriceDisplay amount={capitalIqd} currency="IQD" compact noColor />
          </div>
          <div className="partner-capital-card__sub-value">
            <PriceDisplay amount={capitalUsd} currency="USD" compact noColor />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="wadhisharikah-container">
      <div className="dashboard">
        <div className="company-status-top">
          {renderPartnerCard(partner1, p1CapitalIqd, p1CapitalUsd, "partner-card--right")}

          <div className="company-value-center">
            <div className="company-value" data-testid="company-value">
              <h2>قيمة الشركة</h2>
              <div
                className={`value ${isCompanyValueIqdNegative ? "company-value__amount--negative" : ""}`}
                data-testid="company-value-iqd"
              >
                {isCompanyValueIqdNegative && <span className="company-value__negative-label">-</span>}
                <span><PriceDisplay amount={moneyAbs(companyValueIqd)} currency="IQD" noColor /></span>
              </div>
              <div className="currency">دينار عراقي</div>
              {compareMoney(companyValueUsd, 0) !== 0 && (
                <>
                  <div className={`value-usd ${isCompanyValueUsdNegative ? "company-value__amount--negative" : ""}`}>
                    {isCompanyValueUsdNegative && <span className="company-value__negative-label">-</span>}
                    <span><PriceDisplay amount={moneyAbs(companyValueUsd)} currency="USD" noColor /></span>
                  </div>
                  <div className="currency-usd">دولار أمريكي</div>
                </>
              )}
            </div>
          </div>

          {renderPartnerCard(partner2, p2CapitalIqd, p2CapitalUsd, "partner-card--left")}
        </div>

        <div className="line"></div>

        <div className="company-status-cards">
          <div
            className="card cash-tall"
            data-testid="card-cash"
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onClick={() => onNavigateToTab?.("financial-accounts", "الكاش")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onNavigateToTab?.("financial-accounts", "الكاش");
              }
            }}
          >
            <div className="card-labels">
              <div className="label">الكاش</div>
            </div>
            <div className="card-values">
              <div className="number"><PriceDisplay amount={netCashIqd} currency="IQD" compact noColor /></div>
              {compareMoney(netCashUsd, 0) !== 0 && (
                <div className="card-sub-val"><PriceDisplay amount={netCashUsd} currency="USD" compact noColor /></div>
              )}
            </div>
          </div>

          <div
            className="card cars"
            data-testid="card-inventory"
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onClick={() => onNavigateToTab?.("cars", "available")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onNavigateToTab?.("cars", "available");
              }
            }}
          >
            <div className="card-labels">
              <div className="label">قيمة السيارات</div>
            </div>
            <div className="card-values">
              <div className="number"><PriceDisplay amount={summary.inventory_value_iqd} currency="IQD" compact noColor /></div>
              {compareMoney(summary.inventory_value_usd, 0) !== 0 && (
                <div className="card-sub-val"><PriceDisplay amount={summary.inventory_value_usd} currency="USD" compact noColor /></div>
              )}
            </div>
          </div>
          <div
            className="card payable"
            data-testid="card-receivables"
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onClick={() => onNavigateToTab?.("partners-financial", "receivables")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onNavigateToTab?.("partners-financial", "receivables");
              }
            }}
          >
            <div className="card-labels">
              <div className="label">نطلب</div>
            </div>
            <div className="card-values">
              <div className="number"><PriceDisplay amount={receivablesIqd} currency="IQD" compact noColor /></div>
              {compareMoney(receivablesUsd, 0) !== 0 && (
                <div className="card-sub-val"><PriceDisplay amount={receivablesUsd} currency="USD" compact noColor /></div>
              )}
            </div>
          </div>
          <div
            className="card receivable"
            data-testid="card-liabilities"
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onClick={() => onNavigateToTab?.("partners-financial", "liabilities")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onNavigateToTab?.("partners-financial", "liabilities");
              }
            }}
          >
            <div className="card-labels">
              <div className="label">مطلوبين</div>
            </div>
            <div className="card-values">
              <div className="number"><PriceDisplay amount={liabilitiesIqd} currency="IQD" compact noColor /></div>
              {compareMoney(liabilitiesUsd, 0) !== 0 && (
                <div className="card-sub-val"><PriceDisplay amount={liabilitiesUsd} currency="USD" compact noColor /></div>
              )}
            </div>
          </div>
          <div
            className="card qasa-bottom"
            data-testid="card-qasa-bottom"
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onClick={() => onNavigateToTab?.("financial-accounts", "قاصه")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onNavigateToTab?.("financial-accounts", "قاصه");
              }
            }}
          >
            <div className="card-labels">
              <div className="label">القاصة</div>
            </div>
            <div className="card-values">
              <div className="number"><PriceDisplay amount={summary.qasa_iqd} currency="IQD" compact noColor /></div>
              {compareMoney(summary.qasa_usd, 0) !== 0 && (
                <div className="card-sub-val"><PriceDisplay amount={summary.qasa_usd} currency="USD" compact noColor /></div>
              )}
            </div>
          </div>

          <div
            className="card expenses"
            data-testid="card-expenses"
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onClick={() => onNavigateToTab?.("expenses")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onNavigateToTab?.("expenses");
              }
            }}
          >
            <div className="card-labels">
              <div className="label">المصروفات</div>
            </div>
            <div className="card-values">
              <div className="number"><PriceDisplay amount={summary.total_expenses_iqd} currency="IQD" compact noColor /></div>
              {compareMoney(summary.total_expenses_usd, 0) !== 0 && (
                <div className="card-sub-val"><PriceDisplay amount={summary.total_expenses_usd} currency="USD" compact noColor /></div>
              )}
            </div>
          </div>

          <div
            className="card profit-bottom"
            data-testid="card-profit-bottom"
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onClick={() => onNavigateToTab?.("profit-distribution")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onNavigateToTab?.("profit-distribution");
              }
            }}
          >
            <div className="card-labels">
              <div className="label">صافي الأرباح</div>
            </div>
            <div className="card-values">
              <div className="number"><PriceDisplay amount={summary.monthly_profits_iqd} currency="IQD" compact noColor /></div>
              {compareMoney(summary.monthly_profits_usd, 0) !== 0 && (
                <div className="card-sub-val"><PriceDisplay amount={summary.monthly_profits_usd} currency="USD" compact noColor /></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompanyStatusTab;
