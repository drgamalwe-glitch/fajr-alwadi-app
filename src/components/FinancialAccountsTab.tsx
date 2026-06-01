import { useCallback, useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { CashRegisterEntry } from "../types";
import { CashRegisterTab } from "./CashRegisterTab";
import { PriceDisplay } from "@/components/ui";

type PaymentTab = "قاصه" | "ماستر" | "مصرف";

const PAYMENT_TABS: { id: PaymentTab; label: string }[] = [
  { id: "قاصه", label: "قاصه" },
  { id: "ماستر", label: "ماستر" },
  { id: "مصرف", label: "مصرف" },
];

const TAB_THEMES: Record<PaymentTab, {
  activeBg: string;
  activeColor: string;
  activeShadow: string;
}> = {
  قاصه: {
    activeBg: "linear-gradient(135deg, rgba(216,168,90,0.25), rgba(216,168,90,0.1))",
    activeColor: "#d8a85a",
    activeShadow: "0 0 20px rgba(216,168,90,0.15), inset 0 1px 0 rgba(216,168,90,0.15)",
  },
  ماستر: {
    activeBg: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(99,102,241,0.1))",
    activeColor: "#818cf8",
    activeShadow: "0 0 20px rgba(99,102,241,0.15), inset 0 1px 0 rgba(99,102,241,0.15)",
  },
  مصرف: {
    activeBg: "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.1))",
    activeColor: "#10b981",
    activeShadow: "0 0 20px rgba(16,185,129,0.15), inset 0 1px 0 rgba(16,185,129,0.15)",
  },
};

const BALANCE_THEME = {
  iqdColor: "#d8a85a",
  iqdBg: "linear-gradient(135deg, rgba(216,168,90,0.18), rgba(216,168,90,0.08))",
  iqdBorder: "1px solid rgba(216,168,90,0.2)",
  iqdShadow: "0 0 16px rgba(216,168,90,0.08)",
  iqdLabelColor: "rgba(216,168,90,0.55)",

  usdColor: "#10b981",
  usdBg: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))",
  usdBorder: "1px solid rgba(16,185,129,0.2)",
  usdShadow: "0 0 16px rgba(16,185,129,0.08)",
  usdLabelColor: "rgba(16,185,129,0.55)",
};

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

  const currentTheme = BALANCE_THEME;

  return (
    <div className="dashboard">
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
      }}>
        <h2 className="page-intro__title" style={{ margin: 0, fontSize: "1.5rem" }}>الحسابات المالية</h2>

        {loadingBalance ? (
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>جاري التحميل...</span>
        ) : (
          <>
            <div className="financial-tabs" style={{ display: "inline-flex" }}>
              {PAYMENT_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const theme = TAB_THEMES[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`financial-tab ${isActive ? "financial-tab--active-custom" : ""}`}
                    style={isActive ? {
                      background: theme.activeBg,
                      color: theme.activeColor,
                      boxShadow: theme.activeShadow,
                    } : {}}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
            }}>
              <div style={{
                background: currentTheme.iqdBg,
                borderRadius: "10px",
                padding: "0.5rem 1.2rem",
                direction: "ltr",
                textAlign: "center",
                minWidth: "150px",
                fontWeight: 800,
                fontSize: "1.1rem",
                color: currentTheme.iqdColor,
                border: currentTheme.iqdBorder,
                boxShadow: currentTheme.iqdShadow,
                transition: "all 0.25s ease",
              }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 400, color: currentTheme.iqdLabelColor, marginBottom: "1px", direction: "rtl", transition: "all 0.25s ease" }}>الدينار العراقي</div>
                <PriceDisplay amount={iqdBalance} />
              </div>
              <div style={{
                background: currentTheme.usdBg,
                borderRadius: "10px",
                padding: "0.5rem 1.2rem",
                direction: "ltr",
                textAlign: "center",
                minWidth: "150px",
                fontWeight: 800,
                fontSize: "1.1rem",
                color: currentTheme.usdColor,
                border: currentTheme.usdBorder,
                boxShadow: currentTheme.usdShadow,
                transition: "all 0.25s ease",
              }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 400, color: currentTheme.usdLabelColor, marginBottom: "1px", direction: "rtl", transition: "all 0.25s ease" }}>الدولار الامريكي</div>
                <PriceDisplay amount={usdBalance} currency="USD" />
              </div>
            </div>
          </>
        )}
      </div>

      {activeTab === "قاصه" && <CashRegisterTab paymentType="قاصه" />}
      {activeTab === "ماستر" && <CashRegisterTab paymentType="ماستر" />}
      {activeTab === "مصرف" && <CashRegisterTab paymentType="مصرف" />}
    </div>
  );
}
