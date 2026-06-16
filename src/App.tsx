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
import type { Car, Partner, TabId } from "./types";

// Static array of background paths to optimize build size and prevent file duplication
const INITIAL_BG_PATHS = [
  "/backgrounds/Abstract_background_with_light_c…_202606140949.jpeg",
  "/backgrounds/Abstract_chromatic_field_crimson_202606140943.jpeg",
  "/backgrounds/Abstract_energy_flow_red_light_202606140943.jpeg",
  "/backgrounds/Cosmic_environment_red_luminous_…_202606140943.jpeg",
  "/backgrounds/Crimson_red_light_beams_dark_202606140941.jpeg",
  "/backgrounds/Crimson_red_light_trails_202606140947.jpeg",
  "/backgrounds/Fintech_background_with_gradients_202606140922.jpeg",
  "/backgrounds/Floating_translucent_color_fields_202606140950.jpeg",
  "/backgrounds/Futuristic_automotive_background…_202606140947.jpeg",
  "/backgrounds/Futuristic_nebula_composition_re…_202606140943.jpeg",
  "/backgrounds/Glassmorphism_background_crimson…_202606140917.jpeg",
  "/backgrounds/Light_layers_with_subtle_illumin…_202606140950.jpeg",
  "/backgrounds/Luxury_abstract_background_white…_202606140947.jpeg",
  "/backgrounds/Luxury_horizon_soft_light_gradients_202606140950.jpeg",
  "/backgrounds/Platinum_background_crimson_ener…_202606140947.jpeg",
  "/backgrounds/Red_energy_field_nebula_background_202606140941.jpeg",
  "/backgrounds/Red_luminous_streams_flowing_202606140941.jpeg",
  "/backgrounds/aaaf.jpg",
  "/backgrounds/bg.jpg",
  "/backgrounds/bsg.jpg",
  "/backgrounds/bwwg.jpg",
  "/backgrounds/sss.jpg",
  "/backgrounds/ww.jpg",
  "/backgrounds/صbg.jpg"
].sort();

/*
// Helper to extract a friendly readable name from the background file path
const getFriendlyBgName = (path: string) => {
  const base = path.split("/").pop() || "";
  const nameWithoutExt = base.substring(0, base.lastIndexOf(".")) || base;
  // Clean up typical generated filenames e.g. "Abstract_background_..._202606140949" -> "Abstract background ..."
  const cleaned = nameWithoutExt.replace(/_\d{8,14}$/, ""); // remove dates
  return cleaned.replace(/_/g, " ");
};
*/

const DEFAULT_BG = "/backgrounds/bg.jpg";

// Ordered list of tabs — matches sidebar order top → bottom

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

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
  /*
  // تم جمع وإيقاف كود نسخ اسم الخلفية وحالتها
  const [toastBgName, setToastBgName] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  const [copiedBg, setCopiedBg] = useState(false);

  const handleCopyBgName = useCallback(() => {
    const filename = currentBg.split("/").pop() || "";
    navigator.clipboard.writeText(filename)
      .then(() => {
        setCopiedBg(true);
        setTimeout(() => setCopiedBg(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy background name:", err);
      });
  }, [currentBg]);
  */

  // Sync available backgrounds list to localStorage
  useEffect(() => {
    localStorage.setItem("app_available_backgrounds", JSON.stringify(bgPaths));
  }, [bgPaths]);

  const [carFormTrigger, setCarFormTrigger] = useState<{ mode: "new" | "edit"; car?: Car } | null>(null);
  const [carsSearchOpen, setCarsSearchOpen] = useState(false);
  const [partnersSearchOpen, setPartnersSearchOpen] = useState(false);
  const [partnerActions, setPartnerActions] = useState<{ onDeposit: () => void; onWithdraw: () => void; depositLabel?: string; withdrawLabel?: string } | null>(null);
  const [carFormActions, setCarFormActions] = useState<{ onSave: () => void; onCancel: () => void } | null>(null);
  const [addAccountAction, setAddAccountAction] = useState<{ action: () => void } | null>(null);
  const [addCarAction, setAddCarAction] = useState<{ action: () => void } | null>(null);
  const [addAgencyAction, setAddAgencyAction] = useState<{ action: () => void } | null>(null);
  const [addExpenseAction, setAddExpenseAction] = useState<{ action: () => void } | null>(null);
  const [addDistributeAction, setAddDistributeAction] = useState<{ action: () => void } | null>(null);
  const [agenciesSearchOpen, setAgenciesSearchOpen] = useState(false);
  const [pendingPartnerOpen, setPendingPartnerOpen] = useState<string | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carFormDirty, setCarFormDirty] = useState(false);
  const pendingTabRef = useRef<TabId | null>(null);
  const carFormRequestCloseRef = useRef<{ request: (afterClose?: () => void) => void } | null>(null);

  // Navigate to a tab
  const navigateTo = useCallback((nextTab: TabId) => {
    setActiveTab(nextTab);
    setPartnerActions(null);
  }, []);

  // Manual tab click: decide direction by comparing indices
  const handleTabChange = useCallback((nextTab: TabId) => {
    if (activeTab === "cars" && carFormDirty) {
      pendingTabRef.current = nextTab;
      carFormRequestCloseRef.current?.request(() => {
        const pending = pendingTabRef.current;
        pendingTabRef.current = null;
        if (pending) navigateTo(pending);
      });
      return;
    }
    navigateTo(nextTab);
  }, [navigateTo, activeTab, carFormDirty]);

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
    document.documentElement.style.setProperty("--backkground", `url('${currentBg}')`);
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

  /*
  // =========================================================================
  // تم جمع كود التنقل بين الخلفيات (الأسهم) وكود الحذف بحرف (d / ي) في كود واحد وإيقاف تشغيله
  // =========================================================================
  useEffect(() => {
    const handleBgShortcuts = (e: KeyboardEvent) => {
      if (bgPaths.length === 0) return;

      const activeEl = document.activeElement as HTMLElement | null;
      let isEditable = false;
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        isEditable =
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          activeEl.isContentEditable;
      }

      if (isEditable) return;

      // 1. كود حذف الخلفية بواسطة حرف d أو ي
      if (e.key === "d" || e.key === "ي") {
        e.preventDefault();
        e.stopPropagation();

        const bgToDelete = currentBg;
        callTauri("delete_background", { filePath: bgToDelete })
          .then(() => {
            setBgPaths((prev) => {
              const idx = prev.indexOf(bgToDelete);
              const next = prev.filter((p) => p !== bgToDelete);
              if (next.length === 0) {
                setCurrentBg(DEFAULT_BG);
              } else {
                const newIdx = Math.min(idx, next.length - 1);
                setCurrentBg(next[newIdx]);
              }
              return next;
            });
          })
          .catch((err) => console.error("فشل حذف الخلفية:", err));
        return;
      }

      // 2. كود التنقل بين الخلفيات بواسطة الأسهم يمين ويسار
      const isArrow = e.code === "ArrowLeft" || e.code === "ArrowRight";
      if (isArrow) {
        e.preventDefault();
        e.stopPropagation();

        let currentIndex = bgPaths.indexOf(currentBg);
        if (currentIndex === -1) {
          currentIndex = 0;
        }

        let nextIndex = currentIndex;
        if (e.code === "ArrowRight") {
          nextIndex = (currentIndex + 1) % bgPaths.length;
        } else if (e.code === "ArrowLeft") {
          nextIndex = (currentIndex - 1 + bgPaths.length) % bgPaths.length;
        }

        const nextBg = bgPaths[nextIndex];
        setCurrentBg(nextBg);

        // إظهار إشعار تغيير الخلفية
        const friendlyName = getFriendlyBgName(nextBg);
        if (toastTimeoutRef.current) {
          clearTimeout(toastTimeoutRef.current);
        }
        setToastBgName(friendlyName);
        toastTimeoutRef.current = setTimeout(() => {
          setToastBgName(null);
        }, 3000);
      }
    };

    window.addEventListener("keydown", handleBgShortcuts, true);
    return () => {
      window.removeEventListener("keydown", handleBgShortcuts, true);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [currentBg, bgPaths]);
  */

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
          onCarsSearchToggle={() => setCarsSearchOpen((v) => !v)}
          onPartnersSearchToggle={() => setPartnersSearchOpen((v) => !v)}
          onAgenciesSearchToggle={() => setAgenciesSearchOpen((v) => !v)}
          onDeposit={partnerActions?.onDeposit}
          onWithdraw={partnerActions?.onWithdraw}
          depositLabel={partnerActions?.depositLabel}
          withdrawLabel={partnerActions?.withdrawLabel}
          onAddAccount={addAccountAction?.action}
          onAddCar={addCarAction?.action}
          onAddAgency={addAgencyAction?.action}
          onAddExpense={addExpenseAction?.action}
          onAddDistribute={addDistributeAction?.action}
          onSaveCar={carFormActions?.onSave}
          onCancelCar={carFormActions?.onCancel}
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
                    onNavigateToPartner={(partnerName) => {
                      navigateTo("partners-financial");
                      setPendingPartnerOpen(partnerName);
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
                    onAddCarChange={setAddCarAction}
                    onCarFormActionsChange={setCarFormActions}
                    onFormDirtyChange={setCarFormDirty}
                    requestCloseRef={carFormRequestCloseRef}
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
                    onAddAccountChange={setAddAccountAction}
                    pendingPartnerOpen={pendingPartnerOpen}
                    onPendingPartnerOpened={() => setPendingPartnerOpen(null)}
                  />
                )}
                {activeTab === "debtors" && <PartnersTab partners={partners} onRefresh={refreshData} kind="مطلوب" />}
                {activeTab === "expenses" && <ExpensesTab onAddExpenseChange={setAddExpenseAction} />}
                {activeTab === "financial-accounts" && <FinancialAccountsTab />}
                {activeTab === "agencies" && (
                  <AgenciesTab
                    onRefresh={refreshData}
                    agenciesSearchOpen={agenciesSearchOpen}
                    onAgenciesSearchClose={() => setAgenciesSearchOpen(false)}
                    onAddAgencyChange={setAddAgencyAction}
                  />
                )}
                {activeTab === "financial-transactions" && <FinancialTransactionsTab />}
                {activeTab === "profit-distribution" && (
                  <ProfitDistributionTab onRefreshAllData={refreshData} onDistributeChange={setAddDistributeAction} />
                )}
              </div>
            </main>
          )}
        </div>

        <footer className="app-footer">
          <div className="footer-dev">
            <span className="footer-dev__label">شركة فجر الوادي | امير الزجراوي - منتصر الحيدري</span>
          </div>

          {/* 
        تم إيقاف كود اسم الخلفية وزر النسخ في التذييل، وكذلك إشعار تغيير الخلفية
        currentBg && (
          <div 
            className={`footer-bg-info ${copiedBg ? "copied" : ""}`}
            onClick={handleCopyBgName}
            title="انقر لنسخ اسم الصورة بالكامل"
          >
            <span>🖼️</span>
            <span className="footer-bg-info__name">
              {currentBg.split("/").pop()}
            </span>
            <span className="footer-bg-info__action">
              {copiedBg ? "✓ تم النسخ" : "📋 نسخ"}
            </span>
          </div>
        )
        */}

          <div className="footer-brand" dir="ltr">
            <span className="footer-brand__text">VERSIOIN: 1.4 | DEVOLOPERD BY DHRUGHAM ALALAWI: 07806539291</span>
          </div>
        </footer>
      </div>

      {/*
      {toastBgName && (
        <div className="bg-change-toast" role="status" aria-live="polite">
          خلفية: {toastBgName}
        </div>
      )}
      */}
    </>
  );
}
