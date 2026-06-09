import { useCallback, useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { CashRegisterEntry } from "../types";
import { CashRegisterTab } from "./CashRegisterTab";
import { PriceDisplay } from "@/components/ui";
import "../styles/qasa.css";
import "../styles/cards.css";

type PaymentTab = "قاصه" | "ماستر";

const PAYMENT_TABS: { id: PaymentTab; label: string }[] = [
  { id: "قاصه", label: "قاصه" },
  { id: "ماستر", label: "ماستر" },
];


export function FinancialAccountsTab() {
  const [activeTab, setActiveTab] = useState<PaymentTab>("قاصه");
  const [entries, setEntries] = useState<CashRegisterEntry[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const loadBalance = useCallback(async (tab: PaymentTab) => {
    setLoadingBalance(true);
    try {
      const data = await callTauri<CashRegisterEntry[]>("get_cash_register_entries", {
        paymentType: tab,
      });
      setEntries(data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  useEffect(() => {
    void loadBalance(activeTab);
  }, [activeTab, loadBalance]);

  const iqdBalance = entries.length > 0
    ? entries.filter(e => e.currency !== "USD").reduce((sum, e) => sum + e.amount, 0)
    : 0;
  const usdBalance = entries.length > 0
    ? entries.filter(e => e.currency === "USD").reduce((sum, e) => sum + e.amount, 0)
    : 0;


  return (
    <div className="dashboard financial-accounts-shell" data-active-tab={activeTab}>
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          {!loadingBalance && (
            <div className="financial-tabs">
              {PAYMENT_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`${tab.id === "قاصه" ? "top-btn-one" : "top-btn-two"} ${isActive ? (tab.id === "قاصه" ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
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
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={usdBalance} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={iqdBalance} />
              </div>
            </div>
          )}
        </div>
      </div>

      {activeTab === "قاصه" && <CashRegisterTab paymentType="قاصه" />}
      {activeTab === "ماستر" && <CashRegisterTab paymentType="ماستر" />}
    </div>
  );
}
