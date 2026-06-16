import { useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { FinancialSummary, UnifiedAccount } from "../types";

export function CompanyStatusTab() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sumData, accountsData] = await Promise.all([
        callTauri<FinancialSummary>("get_financial_summary"),
        callTauri<UnifiedAccount[]>("get_unified_accounts"),
      ]);
      setSummary(sumData || null);
      setUnifiedAccounts(accountsData || []);
      setError(null);
    } catch (err) {
      console.error("Failed to load company status:", err);
      setError("تعذر تحميل بيانات وضع الشركة من قاعدة البيانات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  if (loading) {
    return (
      <div className="wadhisharikah-container">
        <div style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "18px", textAlign: "center", padding: "40px" }}>
          جاري تحميل بيانات وضع الشركة...
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="wadhisharikah-container">
        <div style={{ color: "#ef4444", fontSize: "18px", textAlign: "center", padding: "40px" }}>
          {error || "حدث خطأ أثناء تحميل البيانات."}
        </div>
      </div>
    );
  }

  // 1. مطلوبين (Liabilities): جمع مبالغ كل الحسابات التي تكون بالموجب من النوع ممول + شركة + مستثمر
  // 2. نطلب (Receivables): جمع مبالغ كل الحسابات التي تكون بالسالب للحسابات ممول + شركة + مستثمر + (مقترض/مطلوب الباقي عليه فقط)
  let liabilitiesIqd = 0;
  let liabilitiesUsd = 0;
  let receivablesIqd = 0;
  let receivablesUsd = 0;

  unifiedAccounts.forEach((acc) => {
    if (acc.kind === "ممول" || acc.kind === "مستثمر" || acc.kind === "شركة") {
      // IQD balance
      if (acc.iqd_balance > 0) {
        liabilitiesIqd += acc.iqd_balance;
      } else if (acc.iqd_balance < 0) {
        receivablesIqd += Math.abs(acc.iqd_balance);
      }
      // USD balance
      if (acc.usd_balance > 0) {
        liabilitiesUsd += acc.usd_balance;
      } else if (acc.usd_balance < 0) {
        receivablesUsd += Math.abs(acc.usd_balance);
      }
    } else if (acc.kind === "مقترض" || acc.kind === "مطلوب") {
      // المقترض والمطلوب: الباقي عليه فقط (الرصيد المدين المتبقي وهو القيمة الموجبة)
      if (acc.iqd_balance > 0) {
        receivablesIqd += acc.iqd_balance;
      }
      if (acc.usd_balance > 0) {
        receivablesUsd += acc.usd_balance;
      }
    }
  });

  // قيمة الشركة = رأس المال + قيمة سيارات المisplay + نطلب - مطلوبين
  const companyValueIqd = (summary.total_partner_capital_iqd + summary.inventory_value_iqd + receivablesIqd) - liabilitiesIqd;
  const companyValueUsd = (summary.total_partner_capital_usd + summary.inventory_value_usd + receivablesUsd) - liabilitiesUsd;

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

  return (
    <div className="wadhisharikah-container">
      <div className="dashboard">
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
        </div>

        <div className="line"></div>

        <div className="stats">
          <div className="card capital">
            <div className="card-labels">
              <div className="label">رأس المال</div>
            </div>
            <div className="card-values">
              <div className="number">{formatCompact(summary.total_partner_capital_iqd)} <span className="card-currency-iq">IQ</span></div>
              {summary.total_partner_capital_usd !== 0 && (
                <div className="card-sub-val">{formatCompact(summary.total_partner_capital_usd)} <span className="card-currency-usd">USD</span></div>
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
