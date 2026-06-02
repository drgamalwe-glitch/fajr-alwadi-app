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
import type { Car, Partner, TabId } from "./types";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [cars, setCars] = useState<Car[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debtorAlertCount, setDebtorAlertCount] = useState(0);

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

        // عد المديونيات المتأخرة والمستحقة اليوم
        const debtors = loadedPartners.filter((p) => p.kind === "مطلوب");
        let count = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await Promise.allSettled(
          debtors.map(async (debtor) => {
            const txs = await callTauri<{ type_: string; date: string }[]>(
              "get_partner_transactions",
              { partnerName: debtor.partner_name, kind: "مطلوب" },
            );
            for (const tx of (txs ?? [])) {
              if (tx.type_ !== "سحب") continue;
              const due = new Date(tx.date);
              due.setHours(0, 0, 0, 0);
              const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
              if (diff <= 0) count++;
            }
          }),
        );
        setDebtorAlertCount(count);
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
        onTabChange={setActiveTab}
        debtorAlertCount={debtorAlertCount}
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
            {activeTab === "dashboard" && <Dashboard cars={cars} partners={partners} />}
            {activeTab === "cars" && <CarsTab cars={cars} onRefresh={refreshData} />}
            {activeTab === "partners" && <PartnersTab partners={partners} onRefresh={refreshData} kind="شريك" />}
            {activeTab === "investors" && <PartnersTab partners={partners} onRefresh={refreshData} kind="مستثمر" />}
            {activeTab === "debtors" && <PartnersTab partners={partners} onRefresh={refreshData} kind="مطلوب" />}
            {activeTab === "expenses" && <ExpensesTab />}
            {activeTab === "financial-accounts" && <FinancialAccountsTab />}
            {activeTab === "financial-transactions" && <FinancialTransactionsTab />}
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
