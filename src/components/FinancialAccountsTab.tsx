import { useCallback, useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { FinancialSummary } from "../types";
import { CashRegisterTab } from "./CashRegisterTab";
import { PriceDisplay } from "@/components/ui";

type PaymentTab = "قاصه" | "خارج القاصة" | "ماستر";

const PAYMENT_TABS: { id: PaymentTab; label: string }[] = [
  { id: "قاصه", label: "قاصه" },
  { id: "ماستر", label: "ماستر" },
];


export function FinancialAccountsTab() {
  const [activeTab, setActiveTab] = useState<PaymentTab>("قاصه");
  const [balance, setBalance] = useState<{ iqd: number; usd: number }>({ iqd: 0, usd: 0 });
  const [loadingBalance, setLoadingBalance] = useState(true);

  const loadBalance = useCallback(async (tab: PaymentTab) => {
    setLoadingBalance(true);
    try {
      const data = await callTauri<FinancialSummary>("get_financial_summary", {
        paymentType: tab,
      });
      setBalance({
        iqd: data?.cash_iqd || 0,
        usd: data?.cash_usd || 0,
      });
    } catch {
      setBalance({ iqd: 0, usd: 0 });
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  useEffect(() => {
    void loadBalance(activeTab);
  }, [activeTab, loadBalance]);

  const iqdBalance = balance.iqd;
  const usdBalance = balance.usd;


  return (
    <div className="dashboard financial-accounts-shell" data-active-tab={activeTab}>
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          {!loadingBalance && (
            <div className="financial-tabs">
              {PAYMENT_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const isQasaOrExternal = tab.id === "قاصه" || tab.id === "خارج القاصة";
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`${isQasaOrExternal ? "top-btn-one" : "top-btn-two"} ${isActive ? (isQasaOrExternal ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="unified-toolbar__center">
          {loadingBalance && (
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "var(--fs-sm)" }}>جاري التحميل...</span>
          )}
        </div>
        <div className="unified-toolbar__left">
          {!loadingBalance && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <div className="currency-card currency-card--usd">
                  <PriceDisplay amount={usdBalance} currency="USD" />
                </div>
                <div className="currency-card currency-card--iqd">
                  <PriceDisplay amount={iqdBalance} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeTab === "قاصه" && <CashRegisterTab paymentType="قاصه" />}
      {activeTab === "خارج القاصة" && <CashRegisterTab paymentType="خارج القاصة" />}
      {activeTab === "ماستر" && <CashRegisterTab paymentType="ماستر" />}
    </div>
  );
}
