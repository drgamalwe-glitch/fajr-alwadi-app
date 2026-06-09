import { useCallback, useEffect, useState } from "react";
import { callTauri } from "./api/tauri";
import { BrandLogo } from "./components/BrandLogo";
import { CarsTab } from "./components/CarsTab";
import { Dashboard } from "./components/Dashboard";
import { Header } from "./components/Header";
import { ExpensesTab } from "./components/ExpensesTab";
import { FinancialAccountsTab } from "./components/FinancialAccountsTab";
import { FinancialTransactionsTab } from "./components/FinancialTransactionsTab";
import { PartnersTab } from "./components/PartnersTab";
import { AgenciesTab } from "./components/AgenciesTab";
import { ActionButton } from "@/components/ui";
import type { Car, Partner, TabId } from "./types";
import "./styles/App.css";
import "./styles/buttons.css";
import "./styles/tables.css";
import "./styles/inputfieal.css";

// Ordered list of tabs — matches sidebar order top → bottom
const TAB_IDS: TabId[] = [
  "dashboard",
  "cars",
  "partners-financial",
  "agencies",
  "expenses",
  "financial-accounts",
  "financial-transactions",
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const [carFormTrigger, setCarFormTrigger] = useState<{ mode: "new" | "edit"; car?: Car } | null>(null);
  const [carsSearchOpen, setCarsSearchOpen] = useState(false);
  const [partnersSearchOpen, setPartnersSearchOpen] = useState(false);
  const [partnerActions, setPartnerActions] = useState<{ onDeposit: () => void; onWithdraw: () => void } | null>(null);
  const [agenciesSearchOpen, setAgenciesSearchOpen] = useState(false);
  const [cars, setCars] = useState<Car[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigate to a tab
  const navigateTo = useCallback((nextTab: TabId) => {
    setActiveTab(nextTab);
    setPartnerActions(null);
  }, []);

  // Manual tab click: decide direction by comparing indices
  const handleTabChange = useCallback((nextTab: TabId) => {
    navigateTo(nextTab);
  }, [navigateTo]);

  const refreshData = useCallback(async () => {
    setError(null);
    try {
      const [carsResult, partnersResult] = await Promise.allSettled([
        callTauri<Car[]>("get_cars"),
        callTauri<Partner[]>("get_partners"),
      ]);

      if (carsResult.status === "fulfilled") {
        setCars(carsResult.value ?? []);
      }

      if (partnersResult.status === "fulfilled") {
        const loadedPartners = partnersResult.value ?? [];
        setPartners(loadedPartners);


      }

      if (carsResult.status === "rejected" && partnersResult.status === "rejected") {
        setError("تعذر تحميل البيانات من قاعدة البيانات المحلية.");
      }
    } catch {
      setError("تعذر تحميل البيانات من قاعدة البيانات المحلية.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // فتح مربع البحث بـ Space عندما لا يكون التركيز في حقل نص
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      e.preventDefault();

      if (activeTab === "cars") {
        setCarsSearchOpen(true);
      } else if (activeTab === "partners-financial") {
        setPartnersSearchOpen(true);
      } else if (activeTab === "agencies") {
        setAgenciesSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--mx", `${event.clientX}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY}px`);
  };

  return (
    <div className="app" onPointerMove={handlePointerMove}>
      <div className="app-bg" aria-hidden>
        <div className="app-bg__mesh" />
        <div className="app-bg__orb app-bg__orb--1" />
        <div className="app-bg__orb app-bg__orb--2" />
        <div className="app-bg__orb app-bg__orb--3" />
        <div className="app-bg__reflection" />
      </div>

      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onCarsSearchToggle={() => setCarsSearchOpen((v) => !v)}
        onPartnersSearchToggle={() => setPartnersSearchOpen((v) => !v)}
        onAgenciesSearchToggle={() => setAgenciesSearchOpen((v) => !v)}
        onDeposit={partnerActions?.onDeposit}
        onWithdraw={partnerActions?.onWithdraw}
      />

      <div className="app-content">
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
            <button type="button" className="alert-retry" onClick={() => refreshData()}>
              إعادة المحاولة
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <BrandLogo size="lg" />
            <div className="spinner" aria-hidden />
            <p>جاري تحميل البيانات...</p>
          </div>
        ) : (
          <main className="app-main">
            <div
              key={activeTab}
              className="origin-nano-weave"
            >
              {activeTab === "dashboard" && (
                <Dashboard
                  cars={cars}
                  partners={partners}
                  onRefresh={refreshData}
                  onOpenCarForm={(mode, car) => {
                    handleTabChange("cars");
                    setCarFormTrigger({ mode, car });
                  }}
                />
              )}
              {activeTab === "cars" && (
                <CarsTab
                  cars={cars}
                  onRefresh={refreshData}
                  carFormTrigger={carFormTrigger}
                  onClearCarFormTrigger={() => setCarFormTrigger(null)}
                  searchOpen={carsSearchOpen}
                  onSearchClose={() => setCarsSearchOpen(false)}
                />
              )}
              {activeTab === "partners" && <PartnersTab partners={partners} onRefresh={refreshData} kind="شريك" />}
              {activeTab === "partners-financial" && (
                <PartnersTab
                  partners={partners}
                  onRefresh={refreshData}
                  kind="partners-financial"
                  partnersSearchOpen={partnersSearchOpen}
                  onPartnersSearchClose={() => setPartnersSearchOpen(false)}
                  onPartnerActionsChange={setPartnerActions}
                />
              )}
              {activeTab === "debtors" && <PartnersTab partners={partners} onRefresh={refreshData} kind="مطلوب" />}
              {activeTab === "expenses" && <ExpensesTab />}
              {activeTab === "financial-accounts" && <FinancialAccountsTab />}
              {activeTab === "agencies" && (
                <AgenciesTab
                  onRefresh={refreshData}
                  agenciesSearchOpen={agenciesSearchOpen}
                  onAgenciesSearchClose={() => setAgenciesSearchOpen(false)}
                />
              )}
              {activeTab === "financial-transactions" && <FinancialTransactionsTab />}
            </div>
          </main>
        )}
      </div>

      <footer className="app-footer">
        <div className="footer-dev">
          <span className="footer-dev__label">تم تطوير البرنامج بواسطة :-</span>
          <span className="footer-dev__name">سيد ضرغام العلوي</span>
        </div>
        <div className="footer-brand" dir="ltr">
          <span className="footer-brand__dot" aria-hidden>✦</span>
          <span className="footer-brand__text">FAJIR ALWADI CAR TRADING</span>
        </div>
      </footer>
    </div>
  );
}
