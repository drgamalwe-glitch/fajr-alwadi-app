import { useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { FinancialSummary, UnifiedAccount, Partner, PartnerTransaction } from "../types";

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

const transactionSignedAmount = (tx: PartnerTransaction) => {
  const type = tx.type_ || "";
  if (type.startsWith("تحويل")) return 0;
  if (
    type.startsWith("ايداع") ||
    type.startsWith("إيداع") ||
    type.startsWith("مقدمة") ||
    type.startsWith("استلام") ||
    type.startsWith("إستلام") ||
    type.startsWith("إعادة استثمار") ||
    type.startsWith("تسوية") ||
    type.startsWith("تسديد")
  ) {
    return tx.amount;
  }
  if (type.startsWith("سحب") || type.startsWith("باقي")) {
    return -tx.amount;
  }
  return 0;
};

export function CompanyStatusTab({ summary, unifiedAccounts, partners }: { summary: FinancialSummary | null; unifiedAccounts: UnifiedAccount[]; partners: Partner[] }) {
  const sharikPartners = partners.filter((p) => p.kind === "شريك");
  const amirPartner = sharikPartners.find((p) => normalizePartnerName(p.partner_name).includes("امير"));
  const muntasirPartner = sharikPartners.find((p) => normalizePartnerName(p.partner_name).includes("منتصر"));
  const fallbackPartners = sharikPartners.filter((p) => p !== amirPartner && p !== muntasirPartner);
  const partner1 = amirPartner ?? fallbackPartners[0] ?? null;
  const partner2 = muntasirPartner ?? fallbackPartners.find((p) => p !== partner1) ?? null;
  const [partnerUsdBalances, setPartnerUsdBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    const selectedPartners = [partner1, partner2].filter(Boolean) as Partner[];
    if (selectedPartners.length === 0) {
      setPartnerUsdBalances({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      selectedPartners.map(async (partner) => {
        const transactions = await callTauri<PartnerTransaction[]>("get_partner_transactions", {
          partnerName: partner.partner_name,
          kind: partner.kind,
        });
        const usdBalance = (transactions ?? [])
          .filter((tx) => (tx.currency || "IQD") === "USD")
          .reduce((total, tx) => total + transactionSignedAmount(tx), 0);
        return [normalizePartnerName(partner.partner_name), usdBalance] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setPartnerUsdBalances(Object.fromEntries(entries));
      })
      .catch((err) => {
        console.error("Failed to load partner USD balances:", err);
        if (!cancelled) setPartnerUsdBalances({});
      });

    return () => {
      cancelled = true;
    };
  }, [partner1?.partner_name, partner1?.kind, partner2?.partner_name, partner2?.kind]);

  if (!summary) {
    return (
      <div className="wadhisharikah-container">
        <div style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "18px", textAlign: "center", padding: "40px" }}>
          جاري تحميل بيانات وضع الشركة...
        </div>
      </div>
    );
  }

  let liabilitiesIqd = 0;
  let liabilitiesUsd = 0;
  let receivablesIqd = 0;
  let receivablesUsd = 0;

  unifiedAccounts.forEach((acc) => {
    if (acc.kind === "ممول" || acc.kind === "مستثمر" || acc.kind === "شركة") {
      if (acc.iqd_balance > 0) {
        liabilitiesIqd += acc.iqd_balance;
      } else if (acc.iqd_balance < 0) {
        receivablesIqd += Math.abs(acc.iqd_balance);
      }
      if (acc.usd_balance > 0) {
        liabilitiesUsd += acc.usd_balance;
      } else if (acc.usd_balance < 0) {
        receivablesUsd += Math.abs(acc.usd_balance);
      }
    } else if (acc.kind === "مقترض" || acc.kind === "مطلوب") {
      if (acc.iqd_balance > 0) {
        receivablesIqd += acc.iqd_balance;
      }
      if (acc.usd_balance > 0) {
        receivablesUsd += acc.usd_balance;
      }
    }
  });

  const companyValueIqd = (summary.cash_iqd + summary.inventory_value_iqd + receivablesIqd) - liabilitiesIqd;
  const companyValueUsd = (summary.cash_usd + summary.inventory_value_usd + receivablesUsd) - liabilitiesUsd;

  const formatCompact = (value: number): string => {
    const absVal = Math.abs(value);
    if (absVal >= 1_000_000_000) {
      const formatted = (value / 1_000_000_000).toFixed(1);
      return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "B";
    }
    if (absVal >= 1_000_000) {
      const formatted = (value / 1_000_000).toFixed(1);
      return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "M";
    }
    if (absVal >= 1_000) {
      const formatted = (value / 1_000).toFixed(1);
      return (formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "K";
    }
    return value.toLocaleString("en-US");
  };

  const sharedIqd = (summary.inventory_value_iqd + receivablesIqd - liabilitiesIqd) / 2;
  const sharedUsd = (summary.inventory_value_usd + receivablesUsd - liabilitiesUsd) / 2;

  const p1CapitalIqd = partner1 ? partner1.total_amount + sharedIqd : 0;
  const p1CapitalUsd = partner1 ? (partnerUsdBalances[normalizePartnerName(partner1.partner_name)] ?? 0) + sharedUsd : 0;
  const p2CapitalIqd = partner2 ? partner2.total_amount + sharedIqd : 0;
  const p2CapitalUsd = partner2 ? (partnerUsdBalances[normalizePartnerName(partner2.partner_name)] ?? 0) + sharedUsd : 0;

  const renderPartnerCard = (partner: Partner | null, capitalIqd: number, capitalUsd: number, colorClass: string) => {
    if (!partner) return null;
    const imgSrc = getPartnerImage(partner.partner_name);
    return (
      <div className={`partner-capital-card ${colorClass}`}>
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
            <div className="company-value">
              <h2>قيمة الشركة</h2>
              <div className="value">{companyValueIqd.toLocaleString("en-US")}</div>
              <div className="currency">دينار عراقي</div>
              {companyValueUsd !== 0 && (
                <>
                  <div className="value-usd">
                    {companyValueUsd.toLocaleString("en-US")}
                  </div>
                  <div className="currency-usd">دولار أمريكي</div>
                </>
              )}
              <div className="company-value__chips" aria-label="تفاصيل قيمة الشركة">
                <span>الكاش: {formatCompact(summary.cash_iqd)} IQ</span>
                <span>السيارات: {formatCompact(summary.inventory_value_iqd)} IQ</span>
                <span>نطلب: {formatCompact(receivablesIqd)} IQ</span>
                <span>مطلوبين: {formatCompact(liabilitiesIqd)} IQ</span>
              </div>
            </div>
          </div>

          {renderPartnerCard(partner2, p2CapitalIqd, p2CapitalUsd, "partner-card--left")}
        </div>

        <div className="line"></div>

        <div className="stats">
          <div className="card capital">
            <div className="card-labels">
              <div className="label">الكاش</div>
            </div>
            <div className="card-values">
              <div className="number">{formatCompact(summary.cash_iqd)} <span className="card-currency-iq">IQ</span></div>
              {summary.cash_usd !== 0 && (
                <div className="card-sub-val">{formatCompact(summary.cash_usd)} <span className="card-currency-usd">USD</span></div>
              )}
            </div>
          </div>

          <div className="card cars">
            <div className="card-labels">
              <div className="label">قيمة السيارات</div>
            </div>
            <div className="card-values">
              <div className="number">{formatCompact(summary.inventory_value_iqd)} <span className="card-currency-iq">IQ</span></div>
              {summary.inventory_value_usd !== 0 && (
                <div className="card-sub-val">{formatCompact(summary.inventory_value_usd)} <span className="card-currency-usd">USD</span></div>
              )}
            </div>
          </div>
          <div className="card payable">
            <div className="card-labels">
              <div className="label">نطلب</div>
            </div>
            <div className="card-values">
              <div className="number">{formatCompact(receivablesIqd)} <span className="card-currency-iq">IQ</span></div>
              {receivablesUsd !== 0 && (
                <div className="card-sub-val">{formatCompact(receivablesUsd)} <span className="card-currency-usd">USD</span></div>
              )}
            </div>
          </div>
          <div className="card receivable">
            <div className="card-labels">
              <div className="label">مطلوبين</div>
            </div>
            <div className="card-values">
              <div className="number">{formatCompact(liabilitiesIqd)} <span className="card-currency-iq">IQ</span></div>
              {liabilitiesUsd !== 0 && (
                <div className="card-sub-val">{formatCompact(liabilitiesUsd)} <span className="card-currency-usd">USD</span></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompanyStatusTab;
