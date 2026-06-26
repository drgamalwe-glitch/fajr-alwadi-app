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
import { AgenciesTab } from "./components/AgenciesTab";
import { ProfitDistributionTab } from "./components/ProfitDistributionTab";
import { LoginScreen } from "./components/LoginScreen";
import { UsersTab } from "./components/UsersTab";
import type { Car, Partner, TabId, UserInfo } from "./types";
import { APP_VERSION } from "./version";
import { SECTION_TABS } from "./constants";

type PartnerOpenTarget = {
  name: string;
  kind?: string | null;
  action?: "deposit" | "withdraw" | "settle_installment";
  transactionId?: number | null;
};

type DashboardSubTab = "dashboard" | "company-status";
type PartnersFinancialSubTab = "customers" | "personal" | "receivables" | "liabilities";
type CarsSubTab = "available" | "sold";
type FinancialSubTab = "قاصه" | "الكاش";

const CARS_SUB_TABS = new Set<CarsSubTab>(["available", "sold"]);
const PARTNERS_FINANCIAL_SUB_TABS = new Set<PartnersFinancialSubTab>(["customers", "personal", "receivables", "liabilities"]);
const FINANCIAL_SUB_TABS = new Set<FinancialSubTab>(["قاصه", "الكاش"]);

/** Narrow an arbitrary string to a known sub-tab union, or return null. */
function narrowSubTab<T extends string>(value: string | undefined | null, allowed: ReadonlySet<T>): T | null {
  return value && allowed.has(value as T) ? (value as T) : null;
}

// Static array of background paths to optimize build size and prevent file duplication
const INITIAL_BG_PATHS = ["/backgrounds/bg.jpg"];



const DEFAULT_BG = "/backgrounds/bg.jpg";

// Ordered list of tabs — matches sidebar order top → bottom

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const [dashboardSubTab, setDashboardSubTab] = useState<DashboardSubTab | null>(null);
  const [partnersFinancialSubTab, setPartnersFinancialSubTab] = useState<PartnersFinancialSubTab | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [carsSubTab, setCarsSubTab] = useState<"available" | "sold" | null>(null);
  const [financialSubTab, setFinancialSubTab] = useState<"قاصه" | "الكاش">("قاصه");

  // List of available backgrounds state
  const [bgPaths, setBgPaths] = useState<string[]>(() => {
    const saved = localStorage.getItem("app_available_backgrounds");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse saved backgrounds", e);
      }
    }
    return INITIAL_BG_PATHS;
  });

  // Background selection state
  const [currentBg, setCurrentBg] = useState<string>(() => {
    const savedBg = localStorage.getItem("app_selected_background");

    // Determine available backgrounds at init
    let initialPaths = INITIAL_BG_PATHS;
    const savedPaths = localStorage.getItem("app_available_backgrounds");
    if (savedPaths) {
      try {
        const parsed = JSON.parse(savedPaths);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialPaths = parsed;
        }
      } catch { }
    }

    if (savedBg && initialPaths.includes(savedBg)) {
      return savedBg;
    }
    return initialPaths.includes(DEFAULT_BG) ? DEFAULT_BG : initialPaths[0] || DEFAULT_BG;
  });

  // Sync available backgrounds list to localStorage
  useEffect(() => {
    localStorage.setItem("app_available_backgrounds", JSON.stringify(bgPaths));
  }, [bgPaths]);

  // Warn before closing if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const [carFormTrigger, setCarFormTrigger] = useState<{ mode: "new" | "edit"; car?: Car } | null>(null);
  const [carsSearchOpen, setCarsSearchOpen] = useState(false);
  const [partnersSearchOpen, setPartnersSearchOpen] = useState(false);
  const [partnerActions, setPartnerActions] = useState<{ onDeposit: () => void; onWithdraw: () => void; depositLabel?: string; withdrawLabel?: string } | null>(null);
  const [carFormActions, setCarFormActions] = useState<{ onSave: () => void; onCancel: () => void } | null>(null);
  const [returnState, setReturnState] = useState<{ section: TabId; subTab?: string } | null>(null);

  const [addAccountAction, setAddAccountAction] = useState<{ action: () => void } | null>(null);
  const [addCarAction, setAddCarAction] = useState<{ action: () => void } | null>(null);
  const [addBatchCarAction, setAddBatchCarAction] = useState<{ action: () => void } | null>(null);
  const [addAgencyAction, setAddAgencyAction] = useState<{ action: () => void } | null>(null);
  const [addExpenseAction, setAddExpenseAction] = useState<{ action: () => void } | null>(null);
  const [addDistributeAction, setAddDistributeAction] = useState<{ action: () => void } | null>(null);
  const [agenciesSearchOpen, setAgenciesSearchOpen] = useState(false);
  const [pendingPartnerOpen, setPendingPartnerOpen] = useState<PartnerOpenTarget | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const pendingTabRef = useRef<TabId | null>(null);
  const tabCloseRequestRef = useRef<{ request: (afterClose?: () => void) => void } | null>(null);
  const dirtyRef = useRef(false);

  const handleLogin = useCallback((user: UserInfo) => {
    setCurrentUser(user);
    localStorage.setItem("app_current_user", JSON.stringify(user));
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem("app_current_user");
    setActiveTab("dashboard");
  }, []);

  // Navigate to a tab
  const navigateTo = useCallback((nextTab: TabId) => {
    setActiveTab(nextTab);
    setPartnerActions(null);
  }, []);

  const clearReturnState = useCallback(() => {
    setReturnState(prev => {
      if (!prev) return null;
      const rs = prev;
      navigateTo(rs.section);
      if (rs.section === "dashboard" && rs.subTab) {
        setDashboardSubTab(rs.subTab as DashboardSubTab);
      } else if (rs.section === "cars" && rs.subTab) {
        setCarsSubTab(narrowSubTab(rs.subTab, CARS_SUB_TABS));
      } else if (rs.section === "partners-financial" && rs.subTab) {
        setPartnersFinancialSubTab(rs.subTab as PartnersFinancialSubTab);
      }
      return null;
    });
  }, [navigateTo]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  // Manual tab click: check for unsaved changes before switching
  const handleTabChange = useCallback((nextTab: TabId) => {
    if (tabCloseRequestRef.current) {
      pendingTabRef.current = nextTab;
      tabCloseRequestRef.current.request(() => {
        const pending = pendingTabRef.current;
        pendingTabRef.current = null;
        if (pending) navigateTo(pending);
      });
      return;
    }
    navigateTo(nextTab);
  }, [navigateTo]);

  // Sidebar section click with sub-tab cycling
  const handleSidebarSectionClick = useCallback((section: TabId) => {
    const doNavigate = () => {
      const tabs = SECTION_TABS[section];
      if (!tabs || tabs.length <= 1) {
        navigateTo(section);
        return;
      }
      if (section !== activeTab) {
        navigateTo(section);
        if (section === "dashboard") setDashboardSubTab("dashboard");
        else if (section === "cars") setCarsSubTab("available");
        else if (section === "partners-financial") setPartnersFinancialSubTab("customers");
      } else {
        if (section === "dashboard") {
          setDashboardSubTab(prev => {
            const arr: DashboardSubTab[] = ["dashboard", "company-status"];
            const idx = arr.indexOf(prev ?? "dashboard");
            return arr[(idx + 1) % arr.length];
          });
        } else if (section === "cars") {
          setCarsSubTab(prev => {
            const arr: ("available" | "sold")[] = ["available", "sold"];
            const idx = arr.indexOf(prev ?? "available");
            return arr[(idx + 1) % arr.length];
          });
        } else if (section === "partners-financial") {
          setPartnersFinancialSubTab(prev => {
            const arr: PartnersFinancialSubTab[] = ["customers", "personal", "receivables", "liabilities"];
            const idx = arr.indexOf(prev ?? "customers");
            return arr[(idx + 1) % arr.length];
          });
        }
      }
    };
    if (tabCloseRequestRef.current) {
      pendingTabRef.current = section;
      tabCloseRequestRef.current.request(() => {
        const pending = pendingTabRef.current;
        pendingTabRef.current = null;
        if (pending) doNavigate();
      });
      return;
    }
    doNavigate();
  }, [activeTab, navigateTo]);

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

  // Update CSS property and persist background selection
  useEffect(() => {
    document.documentElement.style.setProperty("--background", `url('${currentBg}')`);
    localStorage.setItem("app_selected_background", currentBg);
  }, [currentBg]);

  // Load available backgrounds dynamically from Rust/Tauri on mount
  useEffect(() => {
    callTauri<string[]>("get_backgrounds")
      .then((paths) => {
        if (paths && paths.length > 0) {
          setBgPaths(paths);
          // Sync currentBg to be one of the loaded paths if current is invalid
          setCurrentBg((prev) => {
            if (paths.includes(prev)) return prev;
            return paths.includes(DEFAULT_BG) ? DEFAULT_BG : paths[0];
          });
        }
      })
      .catch((err) => {
        console.error("فشل جلب الخلفيات ديناميكياً من الرست، جاري استخدام الاحتياطية:", err);
      });
  }, []);



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

  const handleExportExcel = useCallback(async () => {
    if (exportingExcel) return;

    setExportingExcel(true);
    setExportMessage(null);
    try {
      const filePath = await callTauri<string>("export_database_to_excel");
      setExportMessage(`تم التصدير: ${filePath}`);
    } catch (err) {
      console.error("فشل تصدير Excel:", err);
      setExportMessage("تعذر تصدير ملف Excel. حاول مرة أخرى.");
    } finally {
      setExportingExcel(false);
    }
  }, [exportingExcel]);

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <>
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
          onSidebarSectionClick={handleSidebarSectionClick}
          onDeposit={partnerActions?.onDeposit}
          onWithdraw={partnerActions?.onWithdraw}
          depositLabel={partnerActions?.depositLabel}
          withdrawLabel={partnerActions?.withdrawLabel}
          onAddAccount={addAccountAction?.action}
          onAddCar={addCarAction?.action}
          onAddBatchCar={addBatchCarAction?.action}
          onAddAgency={addAgencyAction?.action}
          onAddExpense={addExpenseAction?.action}
          onAddDistribute={addDistributeAction?.action}
          onSaveCar={carFormActions?.onSave}
          onCancelCar={carFormActions?.onCancel}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
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
                    initialSubTab={dashboardSubTab}
                    onInitialSubTabSet={() => setDashboardSubTab(null)}
                    returnState={returnState}
                    onReturn={clearReturnState}
                    onOpenCarForm={(mode, car) => {
                      handleTabChange("cars");
                      setCarFormTrigger({ mode, car });
                    }}
                    onNavigateToPartner={(target) => {
                      setReturnState({ section: "dashboard", subTab: dashboardSubTab ?? "company-status" });
                      navigateTo("partners-financial");
                      setPendingPartnerOpen(typeof target === "string" ? { name: target } : target);
                    }}
                    onNavigateToTab={(tab, subTab) => {
                      if (tab === "partners-financial") {
                        setPartnersFinancialSubTab(narrowSubTab(subTab, PARTNERS_FINANCIAL_SUB_TABS));
                      } else if (tab === "cars") {
                        setCarsSubTab(narrowSubTab(subTab, CARS_SUB_TABS));
                      } else if (tab === "financial-accounts") {
                        setFinancialSubTab(narrowSubTab(subTab, FINANCIAL_SUB_TABS) ?? "قاصه");
                      }
                      handleTabChange(tab);
                    }}
                  />
                )}
                {activeTab === "cars" && (
                  <CarsTab
                    cars={cars}
                    partners={partners}
                    onRefresh={refreshData}
                    returnState={returnState}
                    onReturn={clearReturnState}
                    carFormTrigger={carFormTrigger}
                    onClearCarFormTrigger={() => setCarFormTrigger(null)}
                    searchOpen={carsSearchOpen}
                    onSearchClose={() => setCarsSearchOpen(false)}
                    onAddCarChange={setAddCarAction}
                    onAddBatchCarChange={setAddBatchCarAction}
                    onCarFormActionsChange={setCarFormActions}
                    onFormDirtyChange={(dirty) => { dirtyRef.current = dirty; }}
                    requestCloseRef={tabCloseRequestRef}
                    initialSubTab={carsSubTab}
                    onInitialSubTabSet={() => setCarsSubTab(null)}
                  />
                )}
                {activeTab === "partners-financial" && (
                  <PartnersTab
                    partners={partners}
                    onRefresh={refreshData}
                    kind="partners-financial"
                    partnersSearchOpen={partnersSearchOpen}
                    onPartnersSearchClose={() => setPartnersSearchOpen(false)}
                    onPartnerActionsChange={setPartnerActions}
                    onAddAccountChange={setAddAccountAction}
                    pendingPartnerOpen={pendingPartnerOpen}
                    onPendingPartnerOpened={() => setPendingPartnerOpen(null)}
                    requestCloseRef={tabCloseRequestRef}
                    onDirtyChange={handleDirtyChange}
                    initialSubTab={partnersFinancialSubTab}
                    onInitialSubTabSet={() => setPartnersFinancialSubTab(null)}
                    returnState={returnState}
                    onReturn={clearReturnState}
                  />
                )}
                {activeTab === "expenses" && (
                  <ExpensesTab
                    onAddExpenseChange={setAddExpenseAction}
                    requestCloseRef={tabCloseRequestRef}
                    onDirtyChange={handleDirtyChange}
                  />
                )}
                {activeTab === "financial-accounts" && <FinancialAccountsTab initialPaymentTab={financialSubTab} />}
                {activeTab === "agencies" && (
                  <AgenciesTab
                    onRefresh={refreshData}
                    agenciesSearchOpen={agenciesSearchOpen}
                    onAgenciesSearchClose={() => setAgenciesSearchOpen(false)}
                    onAddAgencyChange={setAddAgencyAction}
                    requestCloseRef={tabCloseRequestRef}
                    onDirtyChange={handleDirtyChange}
                  />
                )}
                {activeTab === "financial-transactions" && <FinancialTransactionsTab />}
                {activeTab === "profit-distribution" && (
                  <ProfitDistributionTab onRefreshAllData={refreshData} onDistributeChange={setAddDistributeAction} fromDate={fromDate} toDate={toDate} />
                )}
                {activeTab === "users" && (
                  <UsersTab onLogout={handleLogout} />
                )}
              </div>
            </main>
          )}
        </div>

        <footer className="app-footer">
          <div className="footer-dev">
            <button
              type="button"
              className="footer-export-btn"
              onClick={handleExportExcel}
              disabled={exportingExcel}
              title="تصدير قاعدة البيانات كاملة إلى ملف Excel"
            >
              {exportingExcel ? "جاري التصدير..." : "تصدير اكسل"}
            </button>
            <span className="footer-dev__label">شركة فجر الوادي | امير الزجراوي - منتصر الحيدري</span>
            {exportMessage && (
              <span className="footer-export-status" role="status">
                {exportMessage}
              </span>
            )}
          </div>

          <div className="footer-brand" dir="ltr">
            <span className="footer-brand__text">VERSION: {APP_VERSION} | DEVELOPED BY DHRUGHAM ALALAWI: 07806539291</span>
          </div>
        </footer>
      </div>
    </>
  );
}
