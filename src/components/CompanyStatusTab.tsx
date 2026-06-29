import type { FinancialSummary, TabId, UnifiedAccount, Partner } from "../types";
import {
  compareMoney,
  formatMoney,
  moneyAbs,
  moneyAdd,
  moneyDiv,
  moneySub,
  toMoney,
  type MoneyValue,
} from "../utils/money";

const normalizePartnerName = (name: string) =>
  name
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");

const partnerImages: Record<string, string> = {
  "منتصر": "/partners/muntasir.jpg",
  "امير": "/partners/amir.jpg",
};

const getPartnerImage = (name: string) => {
  const normalized = normalizePartnerName(name);
  if (normalized.includes("امير")) return partnerImages["امير"];
  if (normalized.includes("منتصر")) return partnerImages["منتصر"];
  return undefined;
};

const ACCOUNT_LIST_KINDS = new Set(["مستثمر", "ممول", "زبون", "شركة"]);

export function CompanyStatusTab({
  summary,
  unifiedAccounts,
  partners,
  onNavigateToTab,
  onNavigateToPartner,
}: {
  summary: FinancialSummary | null;
  unifiedAccounts: UnifiedAccount[];
  partners: Partner[];
  onNavigateToTab?: (tab: TabId, subTab?: string) => void;
  onNavigateToPartner?: (target: string | { name: string; kind?: string | null; action?: "deposit" | "withdraw" | "settle_installment"; transactionId?: number | null }) => void;
}) {
  const sharikPartners = partners.filter((p) => p.kind === "شريك");
  const amirPartner = sharikPartners.find((p) => normalizePartnerName(p.partner_name).includes("امير"));
  const muntasirPartner = sharikPartners.find((p) => normalizePartnerName(p.partner_name).includes("منتصر"));
  const fallbackPartners = sharikPartners.filter((p) => p !== amirPartner && p !== muntasirPartner);
  const partner1 = amirPartner ?? fallbackPartners[0] ?? null;
  const partner2 = muntasirPartner ?? fallbackPartners.find((p) => p !== partner1) ?? null;
  if (!summary) {
    return (
      <div className="wadhisharikah-container">
        <div style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "18px", textAlign: "center", padding: "40px" }}>
          جاري تحميل بيانات وضع الشركة...
        </div>
      </div>
    );
  }

  let liabilitiesIqd = toMoney(0);
  let liabilitiesUsd = toMoney(0);
  let receivablesIqd = toMoney(0);
  let receivablesUsd = toMoney(0);

  unifiedAccounts.forEach((acc) => {
    if (!ACCOUNT_LIST_KINDS.has(acc.kind)) return;
    if (compareMoney(acc.iqd_balance, 0) > 0) {
      receivablesIqd = moneyAdd(receivablesIqd, acc.iqd_balance);
    } else if (compareMoney(acc.iqd_balance, 0) < 0) {
      liabilitiesIqd = moneyAdd(liabilitiesIqd, moneyAbs(acc.iqd_balance));
    }
    if (compareMoney(acc.usd_balance, 0) > 0) {
      receivablesUsd = moneyAdd(receivablesUsd, acc.usd_balance);
    } else if (compareMoney(acc.usd_balance, 0) < 0) {
      liabilitiesUsd = moneyAdd(liabilitiesUsd, moneyAbs(acc.usd_balance));
    }
  });

  // Phase 4: Use cash_iqd/cash_usd from summary (partner movements only)
  const netCashIqd = summary.cash_iqd;
  const netCashUsd = summary.cash_usd;

  // Fixed: Company Value follows Instructions.md with Decimal math: Cash + Available Inventory + Receivables - Liabilities.
  const companyValueIqd = moneySub(moneyAdd(netCashIqd, summary.inventory_value_iqd, receivablesIqd), liabilitiesIqd);
  const companyValueUsd = moneySub(moneyAdd(netCashUsd, summary.inventory_value_usd, receivablesUsd), liabilitiesUsd);
  const isCompanyValueIqdNegative = compareMoney(companyValueIqd, 0) < 0;
  const isCompanyValueUsdNegative = compareMoney(companyValueUsd, 0) < 0;

  const formatCompact = (value: MoneyValue): string => {
    const money = toMoney(value);
    const absVal = money.abs();
    if (absVal.greaterThanOrEqualTo(1_000_000_000)) {
      const formatted = money.div(1_000_000_000).toDecimalPlaces(1).toFixed(1);
      return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "B";
    }
    if (absVal.greaterThanOrEqualTo(1_000_000)) {
      const formatted = money.div(1_000_000).toDecimalPlaces(1).toFixed(1);
      return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "M";
    }
    if (absVal.greaterThanOrEqualTo(1_000)) {
      const formatted = money.div(1_000).toDecimalPlaces(1).toFixed(1);
      return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "K";
    }
    return formatMoney(money);
  };

  const sharedIqd = moneyDiv(
    moneySub(
      moneyAdd(summary.inventory_value_iqd, receivablesIqd),
      liabilitiesIqd
    ),
    2
  );
  const sharedUsd = moneyDiv(
    moneySub(
      moneyAdd(summary.inventory_value_usd, receivablesUsd),
      liabilitiesUsd
    ),
    2
  );

  const p1CapitalIqd = partner1 ? moneyAdd(partner1.iqd_balance ?? 0, sharedIqd) : toMoney(0);
  const p1CapitalUsd = partner1 ? moneyAdd(partner1.usd_balance ?? 0, sharedUsd) : toMoney(0);
  const p2CapitalIqd = partner2 ? moneyAdd(partner2.iqd_balance ?? 0, sharedIqd) : toMoney(0);
  const p2CapitalUsd = partner2 ? moneyAdd(partner2.usd_balance ?? 0, sharedUsd) : toMoney(0);

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
          <div className="partner-capital-card__value">{formatCompact(capitalIqd)} <span className="partner-capital-card__currency">IQ</span></div>
          <div className="partner-capital-card__sub-value">{formatCompact(capitalUsd)} <span className="partner-capital-card__currency">USD</span></div>
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
                <span>{formatMoney(companyValueIqd)}</span>
              </div>
              <div className="currency">دينار عراقي</div>
              {compareMoney(companyValueUsd, 0) !== 0 && (
                <>
                  <div className={`value-usd ${isCompanyValueUsdNegative ? "company-value__amount--negative" : ""}`}>
                    {isCompanyValueUsdNegative && <span className="company-value__negative-label">-</span>}
                    <span>{formatMoney(companyValueUsd, "USD")}</span>
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
              <div className="number">{formatCompact(netCashIqd)} <span className="card-currency-iq">IQ</span></div>
              {compareMoney(netCashUsd, 0) !== 0 && (
                <div className="card-sub-val">{formatCompact(netCashUsd)} <span className="card-currency-usd">USD</span></div>
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
              <div className="number">{formatCompact(summary.inventory_value_iqd)} <span className="card-currency-iq">IQ</span></div>
              {compareMoney(summary.inventory_value_usd, 0) !== 0 && (
                <div className="card-sub-val">{formatCompact(summary.inventory_value_usd)} <span className="card-currency-usd">USD</span></div>
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
              <div className="number">{formatCompact(receivablesIqd)} <span className="card-currency-iq">IQ</span></div>
              {compareMoney(receivablesUsd, 0) !== 0 && (
                <div className="card-sub-val">{formatCompact(receivablesUsd)} <span className="card-currency-usd">USD</span></div>
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
              <div className="number">{formatCompact(liabilitiesIqd)} <span className="card-currency-iq">IQ</span></div>
              {compareMoney(liabilitiesUsd, 0) !== 0 && (
                <div className="card-sub-val">{formatCompact(liabilitiesUsd)} <span className="card-currency-usd">USD</span></div>
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
              <div className="number">{formatCompact(summary.qasa_iqd)} <span className="card-currency-iq">IQ</span></div>
              {compareMoney(summary.qasa_usd, 0) !== 0 && (
                <div className="card-sub-val">{formatCompact(summary.qasa_usd)} <span className="card-currency-usd">USD</span></div>
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
              <div className="number">{formatCompact(summary.total_expenses_iqd)} <span className="card-currency-iq">IQ</span></div>
              {compareMoney(summary.total_expenses_usd, 0) !== 0 && (
                <div className="card-sub-val">{formatCompact(summary.total_expenses_usd)} <span className="card-currency-usd">USD</span></div>
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
              <div className="number">{formatCompact(summary.monthly_profits_iqd)} <span className="card-currency-iq">IQ</span></div>
              {compareMoney(summary.monthly_profits_usd, 0) !== 0 && (
                <div className="card-sub-val">{formatCompact(summary.monthly_profits_usd)} <span className="card-currency-usd">USD</span></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompanyStatusTab;
