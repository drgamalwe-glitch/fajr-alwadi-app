import { useCallback, useEffect, useRef, useState } from "react";
import { callTauri } from "./api/tauri";
import { BrandLogo } from "./components/BrandLogo";
import { CarsTab } from "./components/CarsTab";
import { Dashboard } from "./components/Dashboard";
import { Header } from "./components/Header";
import { ExpensesTab } from "./components/ExpensesTab";
import { FinancialAccountsTab } from "./components/FinancialAccountsTab";
import { FinancialTransactionsTab } from "./components/FinancialTransactionsTab";
import { PartnersTab } from "./components/PartnersTab";
import type { Car, Partner, TabId } from "./types";
import "./App.css";

// Ordered list of tabs — matches sidebar order top → bottom
const TAB_IDS: TabId[] = [
  "dashboard",
  "cars",
  "partners-financial",
  "expenses",
  "financial-accounts",
  "financial-transactions",
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const [carFormTrigger, setCarFormTrigger] = useState<{ mode: "new" | "edit"; car?: Car } | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  // Keep a ref of activeTab so the scroll handler always sees the latest value
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Navigate to a tab
  const navigateTo = useCallback((nextTab: TabId) => {
    setActiveTab(nextTab);
  }, []);

  // Called from Header onWheel: deltaY > 0 = scroll down → go lower in sidebar
  const handleSidebarScroll = useCallback((deltaY: number) => {
    const currentIndex = TAB_IDS.indexOf(activeTabRef.current);
    if (deltaY > 0) {
      // Scroll down → next tab (lower in sidebar)
      if (currentIndex < TAB_IDS.length - 1) {
        navigateTo(TAB_IDS[currentIndex + 1]);
      }
    } else {
      // Scroll up → previous tab (higher in sidebar)
      if (currentIndex > 0) {
        navigateTo(TAB_IDS[currentIndex - 1]);
      }
    }
  }, [navigateTo]);

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
        onSidebarScroll={handleSidebarScroll}
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
                />
              )}
              {activeTab === "partners" && <PartnersTab partners={partners} onRefresh={refreshData} kind="شريك" />}
              {activeTab === "partners-financial" && <PartnersTab partners={partners} onRefresh={refreshData} kind="partners-financial" />}
              {activeTab === "debtors" && <PartnersTab partners={partners} onRefresh={refreshData} kind="مطلوب" />}
              {activeTab === "expenses" && <ExpensesTab />}
              {activeTab === "financial-accounts" && <FinancialAccountsTab />}
              {activeTab === "financial-transactions" && <FinancialTransactionsTab />}
            </div>
          </main>
        )}
      </div>

      <footer className="app-footer">
        <div className="footer-dev">
          <span className="footer-dev__label">تم تطوير البرنامج بواسطة :-</span>
          <span className="footer-dev__name">سيد ضرغام العلوي</span>
          <a href="tel:07806539291" className="footer-dev__phone" dir="ltr">07806539291</a>
        </div>
        <div className="footer-brand" dir="ltr">
          <span className="footer-brand__dot" aria-hidden>✦</span>
          <span className="footer-brand__text">FAJIR ALWADI CAR TRADING</span>
          <span className="footer-brand__year">2026</span>
        </div>
      </footer>
    </div>
  );
}
