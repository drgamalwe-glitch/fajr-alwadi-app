import { useCallback, useEffect, useRef, useState } from "react";
import { callTauri } from "./api/tauri";
import { BrandLogo } from "./components/BrandLogo";
import { CarsTab } from "./components/CarsTab";
import { Dashboard } from "./components/Dashboard";
import { Header } from "./components/Header";
import { ExpensesTab } from "./components/ExpensesTab";
import { FinancialAccountsTab } from "./components/FinancialAccountsTab";
import { PartnersTab } from "./components/PartnersTab";
import { AgenciesTab } from "./components/AgenciesTab";
import { LoginScreen } from "./components/LoginScreen";
import type { Car, Partner, TabId, UserInfo } from "./types";
import { APP_VERSION } from "./version";

type PartnerOpenTarget = {
  name: string;
  kind?: string | null;
  action?: "deposit" | "withdraw" | "settle_installment";
  transactionId?: number | null;
};

type CarOpenTarget = {
  mode: "new" | "edit";
  car?: Car;
  initialPage?: 0 | 1;
};

type DashboardSubTab = "dashboard" | "company-status" | "users" | "settings";
type PartnersFinancialSubTab = "customers" | "personal" | "receivables" | "liabilities";
type CarsSubTab = "available" | "sold";
const CARS_SUB_TABS = new Set<CarsSubTab>(["available", "sold"]);

/** Narrow an arbitrary string to a known sub-tab union, or return null. */
function narrowSubTab<T extends string>(value: string | undefined | null, allowed: ReadonlySet<T>): T | null {
  return value && allowed.has(value as T) ? (value as T) : null;
}

const FIELD_NAV_KEYS = new Set(["ArrowRight", "ArrowLeft"]);
const FIELD_NAV_SELECTOR = [
  "input:not([type='hidden'])",
  "textarea",
  "select",
  "[contenteditable='true']",
].join(",");

function isFocusableField(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.matches("[disabled], [aria-disabled='true']")) return false;
  if (el.getAttribute("tabindex") === "-1") return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
}

function focusField(el: HTMLElement) {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    window.setTimeout(() => el.select(), 0);
  }
}

// Static array of background paths to optimize build size and prevent file duplication
const INITIAL_BG_PATHS = ["/backgrounds/bg.jpg"];



const DEFAULT_BG = "/backgrounds/bg.jpg";
const AVAILABLE_BACKGROUNDS_STORAGE_KEY = "app_available_backgrounds";
const SELECTED_BACKGROUND_STORAGE_KEY = "app_selected_background";

function normalizeBackgroundPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/g, "/");
  const pathPart = normalized.split(/[?#]/)[0]?.trim() ?? "";
  const filename = pathPart.split("/").filter(Boolean).pop();
  if (!filename || /[\\/]/.test(filename)) return null;
  if (!/\.(jpe?g|png|webp|gif|bmp)$/i.test(filename)) return null;
  if (filename.toLowerCase().includes("logo")) return null;
  return `/backgrounds/${filename}`;
}

function readSavedBackgroundPaths(): string[] {
  const saved = localStorage.getItem(AVAILABLE_BACKGROUNDS_STORAGE_KEY);
  if (!saved) return INITIAL_BG_PATHS;

  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      const paths = Array.from(
        new Set(parsed.map(normalizeBackgroundPath).filter((path): path is string => Boolean(path)))
      );
      if (paths.length > 0) return paths;
    }
  } catch (e) {
    console.error("Failed to parse saved backgrounds", e);
  }

  return INITIAL_BG_PATHS;
}

function pickAvailableBackground(preferred: string | null | undefined, available: string[]) {
  if (preferred && available.includes(preferred)) return preferred;
  if (available.includes(DEFAULT_BG)) return DEFAULT_BG;
  return available[0] || DEFAULT_BG;
}

// Ordered list of tabs — matches sidebar order top → bottom

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);

  const [dashboardSubTab, setDashboardSubTab] = useState<DashboardSubTab | null>(null);
  const [partnersFinancialSubTab, setPartnersFinancialSubTab] = useState<PartnersFinancialSubTab | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [carsSubTab, setCarsSubTab] = useState<"available" | "sold" | null>(null);
  const [financialSubTab, setFinancialSubTab] = useState<"قاصه" | "الكاش" | "transactions">("قاصه");

  // Synchronized sub-tab states to cycle from currently active sub-tab
  const [currentDashboardSubTab, setCurrentDashboardSubTab] = useState<DashboardSubTab>("dashboard");
  const [currentCarsSubTab, setCurrentCarsSubTab] = useState<"available" | "sold">("available");
  const [currentPartnersFinancialSubTab, setCurrentPartnersFinancialSubTab] = useState<PartnersFinancialSubTab>("customers");
  const [currentFinancialSubTab, setCurrentFinancialSubTab] = useState<"قاصه" | "الكاش" | "transactions">("قاصه");
  const [expensesSubTab, setExpensesSubTab] = useState<"expenses" | "profit">("expenses");
  const [currentExpensesSubTab, setCurrentExpensesSubTab] = useState<"expenses" | "profit">("expenses");
  const [backgroundPersistReady, setBackgroundPersistReady] = useState(false);

  // List of available backgrounds state
  const [bgPaths, setBgPaths] = useState<string[]>(readSavedBackgroundPaths);

  // Background selection state
  const [currentBg, setCurrentBg] = useState<string>(() => {
    const initialPaths = readSavedBackgroundPaths();
    const savedBg = normalizeBackgroundPath(localStorage.getItem(SELECTED_BACKGROUND_STORAGE_KEY));
    return pickAvailableBackground(savedBg, initialPaths);
  });

  // Sync available backgrounds list to localStorage
  useEffect(() => {
    localStorage.setItem(AVAILABLE_BACKGROUNDS_STORAGE_KEY, JSON.stringify(bgPaths));
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

  useEffect(() => {
    const handleFieldArrowNavigation = (event: KeyboardEvent) => {
      if (!FIELD_NAV_KEYS.has(event.key)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (!target || !target.matches(FIELD_NAV_SELECTOR)) return;
      if (target.closest("[data-arrow-nav-disabled='true']")) return;
      if (target instanceof HTMLInputElement && target.type === "search") return;
      if (target.closest(".search-popup, [role='search']")) return;

      const openCombobox = target.closest(".search-select")?.querySelector(".combobox-dropdown--open");
      if (openCombobox && (event.key === "ArrowUp" || event.key === "ArrowDown")) return;

      const root =
        target.closest("form") ||
        target.closest(".modal-dialog") ||
        target.closest(".mb-dialog") ||
        target.closest(".dashboard-panel") ||
        document.body;
      const fields = Array.from(root.querySelectorAll(FIELD_NAV_SELECTOR)).filter(isFocusableField);
      const currentIndex = fields.indexOf(target);
      if (currentIndex < 0 || fields.length < 2) return;

      const direction = event.key === "ArrowLeft" ? 1 : -1;
      const nextIndex = (currentIndex + direction + fields.length) % fields.length;
      event.preventDefault();
      event.stopPropagation();
      focusField(fields[nextIndex]);
    };

    document.addEventListener("keydown", handleFieldArrowNavigation, true);
    return () => document.removeEventListener("keydown", handleFieldArrowNavigation, true);
  }, []);

  const [carFormTrigger, setCarFormTrigger] = useState<CarOpenTarget | null>(null);
  const [carsSearchOpen, setCarsSearchOpen] = useState(false);
  const [partnersSearchOpen, setPartnersSearchOpen] = useState(false);
  const [partnerActions, setPartnerActions] = useState<{ onDeposit: () => void; onWithdraw: () => void; depositLabel?: string; withdrawLabel?: string } | null>(null);
  const [carFormActions, setCarFormActions] = useState<{ onSave: () => void; onCancel: () => void; disabled?: boolean } | null>(null);
  const [returnState, setReturnState] = useState<{ section: TabId; subTab?: string } | null>(null);
  // A5: mirror returnState in a ref so clearReturnState can read it without calling side effects inside a state updater.
  const returnStateRef = useRef<{ section: TabId; subTab?: string } | null>(null);
  useEffect(() => {
    returnStateRef.current = returnState;
  }, [returnState]);

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
  /** Bug AU3: Session token issued by the Rust backend on login. Passed to admin commands. */
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const pendingTabRef = useRef<TabId | null>(null);
  const tabCloseRequestRef = useRef<{ request: (afterClose?: () => void) => void } | null>(null);
  const dirtyRef = useRef(false);

  const handleLogin = useCallback((user: UserInfo, sessionToken?: string | null) => {
    setCurrentUser(user);
    if (sessionToken) {
      setSessionToken(sessionToken);
      // In-memory only — do NOT persist to localStorage (Bug A2/AU3).
    } else {
      setSessionToken(null);
    }
  }, []);

  const handleLogout = useCallback(() => {
    // Best-effort: notify backend to revoke the session token (fire-and-forget).
    if (sessionToken) {
      callTauri<void>("logout", { sessionToken }).catch(() => {
        // ignore — backend may be unavailable in dev/mock mode
      });
    }
    setSessionToken(null);
    setCurrentUser(null);
    setActiveTab("dashboard");
  }, [sessionToken]);

  const exitDeveloperMode = useCallback(() => {
    setIsDeveloperMode(false);
  }, []);

  // Navigation history variables
  const navigationHistoryRef = useRef<{ section: TabId; subTab: string | null }[]>([]);
  const isBackingRef = useRef<boolean>(false);

  const pushToHistory = useCallback((fromTab: TabId) => {
    let subTab: string | null = null;
    if (fromTab === "dashboard") subTab = currentDashboardSubTab;
    else if (fromTab === "cars") subTab = currentCarsSubTab;
    else if (fromTab === "partners-financial") subTab = currentPartnersFinancialSubTab;
    else if (fromTab === "financial-accounts") subTab = currentFinancialSubTab;

    const history = navigationHistoryRef.current;
    const last = history[history.length - 1];
    
    // Only push if it is different from the last entry in history
    if (!last || last.section !== fromTab || last.subTab !== subTab) {
      history.push({ section: fromTab, subTab });
    }
  }, [currentDashboardSubTab, currentCarsSubTab, currentPartnersFinancialSubTab, currentFinancialSubTab]);

  // Navigate to a tab
  const navigateTo = useCallback((nextTab: TabId) => {
    let targetTab = nextTab;
    if (nextTab === "users") {
      setDashboardSubTab("users");
      setCurrentDashboardSubTab("users");
      targetTab = "dashboard";
    } else if (nextTab === "financial-transactions") {
      setFinancialSubTab("transactions");
      setCurrentFinancialSubTab("transactions");
      targetTab = "financial-accounts";
    } else if (nextTab === "profit-distribution") {
      // Bug A9: reset filter/date-range when navigating to profit-distribution
      // so the user doesn't see stale filtered data from a previous view.
      setFromDate("");
      setToDate("");
      setExpensesSubTab("profit");
      setCurrentExpensesSubTab("profit");
      targetTab = "expenses";
    }

    setActiveTab(prevTab => {
      if (prevTab !== targetTab && !isBackingRef.current) {
        pushToHistory(prevTab);
      }
      return targetTab;
    });
    setPartnerActions(null);
  }, [pushToHistory]);
  const handleNavigateToPartner = useCallback((name: string, kind: string = "زبون") => {
    setPendingPartnerOpen({ name, kind });
    setCurrentPartnersFinancialSubTab("customers");
    setPartnersFinancialSubTab("customers");
    navigateTo("partners-financial");
  }, [navigateTo]);

  const handleNavigateToCar = useCallback((carNumber: string, status: "available" | "sold" = "sold", initialPage: 0 | 1 = 0) => {
    setCarsSubTab(status);
    setCurrentCarsSubTab(status);
    const car = cars.find((c) => c.car_number === carNumber);
    if (car) {
      setCarFormTrigger({ mode: "edit", car, initialPage });
    } else {
      // A7: surface missing car instead of silently navigating to an empty car form.
      alert("لم يتم العثور على السيارة. قد تكون محذوفة.");
    }
    navigateTo("cars");
  }, [cars, navigateTo]);
  const handleSmartBack = useCallback(() => {
    // A6: prevent re-entrant smart-back calls while a back navigation is in flight.
    if (isBackingRef.current) return;
    const history = navigationHistoryRef.current;
    if (history.length === 0) return;

    const prev = history.pop();
    if (prev) {
      isBackingRef.current = true;
      navigateTo(prev.section);

      // Restore the sub-tab
      if (prev.section === "dashboard" && prev.subTab) {
        setCurrentDashboardSubTab(prev.subTab as DashboardSubTab);
        setDashboardSubTab(prev.subTab as DashboardSubTab);
      } else if (prev.section === "cars" && prev.subTab) {
        setCurrentCarsSubTab(prev.subTab as "available" | "sold");
        setCarsSubTab(prev.subTab as "available" | "sold");
      } else if (prev.section === "partners-financial" && prev.subTab) {
        setCurrentPartnersFinancialSubTab(prev.subTab as PartnersFinancialSubTab);
        setPartnersFinancialSubTab(prev.subTab as PartnersFinancialSubTab);
      } else if (prev.section === "financial-accounts" && prev.subTab) {
        setCurrentFinancialSubTab(prev.subTab as "قاصه" | "الكاش");
        setFinancialSubTab(prev.subTab as "قاصه" | "الكاش");
      }
      // isBackingRef.current is reset by the useEffect that watches activeTab (see below) to avoid premature resets.
    }
  }, [navigateTo]);

  // A6: reset the backing flag once the navigation has settled on the new tab.
  useEffect(() => {
    isBackingRef.current = false;
  }, [activeTab]);

  const clearReturnState = useCallback(() => {
    // A5: read returnState via ref and call navigateTo OUTSIDE the state updater to avoid side effects during render.
    const rs = returnStateRef.current;
    setReturnState(null);
    if (!rs) return;
    navigateTo(rs.section);
    if (rs.section === "dashboard" && rs.subTab) {
      setDashboardSubTab(rs.subTab as DashboardSubTab);
    } else if (rs.section === "cars" && rs.subTab) {
      setCarsSubTab(narrowSubTab(rs.subTab, CARS_SUB_TABS));
    } else if (rs.section === "partners-financial" && rs.subTab) {
      setPartnersFinancialSubTab(rs.subTab as PartnersFinancialSubTab);
    }
  }, [navigateTo]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  // Reset all sub-tabs to their default first values and erase memory when navigating to a different section
  // Optionally supports excluding the target section and applying a specific sub-tab to it
  const resetAllSubTabsToDefault = useCallback((excludeSection?: TabId, targetSubTab?: string) => {
    if (excludeSection !== "dashboard") {
      setCurrentDashboardSubTab("dashboard");
      setDashboardSubTab("dashboard");
    } else if (targetSubTab) {
      setCurrentDashboardSubTab(targetSubTab as DashboardSubTab);
      setDashboardSubTab(targetSubTab as DashboardSubTab);
    }

    if (excludeSection !== "cars") {
      setCurrentCarsSubTab("available");
      setCarsSubTab("available");
    } else if (targetSubTab) {
      setCurrentCarsSubTab(targetSubTab as "available" | "sold");
      setCarsSubTab(targetSubTab as "available" | "sold");
    }

    if (excludeSection !== "partners-financial") {
      setCurrentPartnersFinancialSubTab("customers");
      setPartnersFinancialSubTab("customers");
    } else if (targetSubTab) {
      setCurrentPartnersFinancialSubTab(targetSubTab as PartnersFinancialSubTab);
      setPartnersFinancialSubTab(targetSubTab as PartnersFinancialSubTab);
    }

    if (excludeSection !== "financial-accounts") {
      setCurrentFinancialSubTab("قاصه");
      setFinancialSubTab("قاصه");
    } else if (targetSubTab) {
      setCurrentFinancialSubTab(targetSubTab as "قاصه" | "الكاش" | "transactions");
      setFinancialSubTab(targetSubTab as "قاصه" | "الكاش" | "transactions");
    }

    if (excludeSection !== "expenses") {
      setCurrentExpensesSubTab("expenses");
      setExpensesSubTab("expenses");
    } else if (targetSubTab) {
      setCurrentExpensesSubTab(targetSubTab as "expenses" | "profit");
      setExpensesSubTab(targetSubTab as "expenses" | "profit");
    }
  }, []);

  // Manual tab click: check for unsaved changes before switching
  const handleTabChange = useCallback((nextTab: TabId, targetSubTab?: string) => {
    const doChange = () => {
      if (nextTab !== activeTab) {
        resetAllSubTabsToDefault(nextTab, targetSubTab);
      }
      navigateTo(nextTab);
    };
    if (tabCloseRequestRef.current) {
      pendingTabRef.current = nextTab;
      tabCloseRequestRef.current.request(() => {
        const pending = pendingTabRef.current;
        pendingTabRef.current = null;
        if (pending) {
          if (pending !== activeTab) {
            resetAllSubTabsToDefault(pending, targetSubTab);
          }
          navigateTo(pending);
        }
      });
      return;
    }
    doChange();
  }, [activeTab, navigateTo, resetAllSubTabsToDefault]);

  // Sidebar section click with sub-tab cycling (left-click: forward, right-click: backward)
  const handleSidebarSectionClick = useCallback((section: TabId) => {
    const doNavigate = () => {
      if (section !== activeTab) {
        resetAllSubTabsToDefault();
        navigateTo(section);
      } else {
        if (section === "dashboard") {
          const arr: DashboardSubTab[] = ["dashboard", "company-status", "users", "settings"];
          const idx = arr.indexOf(currentDashboardSubTab);
          const nextVal = arr[(idx + 1) % arr.length];
          setCurrentDashboardSubTab(nextVal);
          setDashboardSubTab(nextVal);
        } else if (section === "cars") {
          const arr: ("available" | "sold")[] = ["available", "sold"];
          const idx = arr.indexOf(currentCarsSubTab);
          const nextVal = arr[(idx + 1) % arr.length];
          setCurrentCarsSubTab(nextVal);
          setCarsSubTab(nextVal);
        } else if (section === "partners-financial") {
          const arr: PartnersFinancialSubTab[] = ["customers", "personal", "receivables", "liabilities"];
          const idx = arr.indexOf(currentPartnersFinancialSubTab);
          const nextVal = arr[(idx + 1) % arr.length];
          setCurrentPartnersFinancialSubTab(nextVal);
          setPartnersFinancialSubTab(nextVal);
        } else if (section === "financial-accounts") {
          const arr: ("قاصه" | "الكاش" | "transactions")[] = ["قاصه", "الكاش", "transactions"];
          const idx = arr.indexOf(currentFinancialSubTab);
          const nextVal = arr[(idx + 1) % arr.length];
          setCurrentFinancialSubTab(nextVal);
          setFinancialSubTab(nextVal);
        } else if (section === "expenses") {
          const arr: ("expenses" | "profit")[] = ["expenses", "profit"];
          const idx = arr.indexOf(currentExpensesSubTab);
          const nextVal = arr[(idx + 1) % arr.length];
          setCurrentExpensesSubTab(nextVal);
          setExpensesSubTab(nextVal);
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
  }, [activeTab, navigateTo, resetAllSubTabsToDefault, currentDashboardSubTab, currentCarsSubTab, currentPartnersFinancialSubTab, currentFinancialSubTab, currentExpensesSubTab]);

  const handleSidebarSectionRightClick = useCallback((section: TabId) => {
    const doNavigate = () => {
      if (section !== activeTab) {
        resetAllSubTabsToDefault();
        navigateTo(section);
      } else {
        if (section === "dashboard") {
          const arr: DashboardSubTab[] = ["dashboard", "company-status", "users", "settings"];
          const idx = arr.indexOf(currentDashboardSubTab);
          const nextVal = arr[(idx - 1 + arr.length) % arr.length];
          setCurrentDashboardSubTab(nextVal);
          setDashboardSubTab(nextVal);
        } else if (section === "cars") {
          const arr: ("available" | "sold")[] = ["available", "sold"];
          const idx = arr.indexOf(currentCarsSubTab);
          const nextVal = arr[(idx - 1 + arr.length) % arr.length];
          setCurrentCarsSubTab(nextVal);
          setCarsSubTab(nextVal);
        } else if (section === "partners-financial") {
          const arr: PartnersFinancialSubTab[] = ["customers", "personal", "receivables", "liabilities"];
          const idx = arr.indexOf(currentPartnersFinancialSubTab);
          const nextVal = arr[(idx - 1 + arr.length) % arr.length];
          setCurrentPartnersFinancialSubTab(nextVal);
          setPartnersFinancialSubTab(nextVal);
        } else if (section === "financial-accounts") {
          const arr: ("قاصه" | "الكاش" | "transactions")[] = ["قاصه", "الكاش", "transactions"];
          const idx = arr.indexOf(currentFinancialSubTab);
          const nextVal = arr[(idx - 1 + arr.length) % arr.length];
          setCurrentFinancialSubTab(nextVal);
          setFinancialSubTab(nextVal);
        } else if (section === "expenses") {
          const arr: ("expenses" | "profit")[] = ["expenses", "profit"];
          const idx = arr.indexOf(currentExpensesSubTab);
          const nextVal = arr[(idx - 1 + arr.length) % arr.length];
          setCurrentExpensesSubTab(nextVal);
          setExpensesSubTab(nextVal);
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
  }, [activeTab, navigateTo, resetAllSubTabsToDefault, currentDashboardSubTab, currentCarsSubTab, currentPartnersFinancialSubTab, currentFinancialSubTab, currentExpensesSubTab]);

  const refreshData = useCallback(async () => {
    // A4: reset loading state and clear stale errors so retry button reflects in-progress load.
    setLoading(true);
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

      // A3: surface partial-load errors too (not just total failure) so users know some screens may be empty.
      if (carsResult.status === "rejected" || partnersResult.status === "rejected") {
        setError("تعذّر تحميل بعض البيانات. قد تكون بعض الشاشات فارغة.");
      }
    } catch {
      setError("تعذر تحميل البيانات من قاعدة البيانات المحلية.");
    } finally {
      setLoading(false);
    }
  }, []);

  // A10: ignore flag prevents state updates on unmounted/stale calls.
  useEffect(() => {
    let ignore = false;
    void refreshData().then(() => {
      if (ignore) return;
    });
    return () => { ignore = true; };
  }, [refreshData]);

  // Update CSS property and persist background selection
  useEffect(() => {
    document.documentElement.style.setProperty("--background", `url('${currentBg}')`);
    localStorage.setItem(SELECTED_BACKGROUND_STORAGE_KEY, currentBg);

    if (backgroundPersistReady) {
      callTauri<string>("set_selected_background", { background: currentBg }).catch((err) => {
        console.error("تعذر حفظ الخلفية المختارة في إعدادات التطبيق:", err);
      });
    }
  }, [currentBg, backgroundPersistReady]);

  // Load available backgrounds dynamically from Rust/Tauri on mount
  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      callTauri<string[]>("get_backgrounds"),
      callTauri<string | null>("get_selected_background"),
    ])
      .then(([pathsResult, selectedResult]) => {
        if (cancelled) return;

        const loadedPaths = pathsResult.status === "fulfilled"
          ? Array.from(
            new Set(
              (pathsResult.value ?? [])
                .map(normalizeBackgroundPath)
                .filter((path): path is string => Boolean(path))
            )
          )
          : [];

        if (pathsResult.status === "rejected") {
          console.error("فشل جلب الخلفيات ديناميكياً من الرست، جاري استخدام الاحتياطية:", pathsResult.reason);
        }

        const availablePaths = loadedPaths.length > 0 ? loadedPaths : readSavedBackgroundPaths();
        if (loadedPaths.length > 0) {
          setBgPaths(loadedPaths);
        }

        const persistedBackground = selectedResult.status === "fulfilled"
          ? normalizeBackgroundPath(selectedResult.value)
          : null;

        if (selectedResult.status === "rejected") {
          console.error("تعذر قراءة الخلفية المختارة من إعدادات التطبيق:", selectedResult.reason);
        }

        const localBackground = normalizeBackgroundPath(localStorage.getItem(SELECTED_BACKGROUND_STORAGE_KEY));
        setCurrentBg((prev) => pickAvailableBackground(persistedBackground ?? localBackground ?? prev, availablePaths));
      })
      .finally(() => {
        if (!cancelled) setBackgroundPersistReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Arrow keys navigation for backgrounds in Developer Mode
  useEffect(() => {
    if (!isDeveloperMode) return;

    const handleArrowNav = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;

      e.preventDefault();

      if (bgPaths.length === 0) return;

      setCurrentBg((prev) => {
        const index = bgPaths.indexOf(prev);
        if (index === -1) {
          return bgPaths[0];
        }

        let nextIndex;
        if (e.key === "ArrowRight") {
          nextIndex = (index + 1) % bgPaths.length;
        } else {
          nextIndex = (index - 1 + bgPaths.length) % bgPaths.length;
        }
        return bgPaths[nextIndex];
      });
    };

    window.addEventListener("keydown", handleArrowNav);
    return () => window.removeEventListener("keydown", handleArrowNav);
  }, [isDeveloperMode, bgPaths]);



  // فتح مربع البحث بـ Space أو Ctrl+F / Cmd+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isSearchShortcut =
        (e.code === "KeyF" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey);
      const isSpaceShortcut = e.code === "Space";

      if (!isSearchShortcut && !isSpaceShortcut) return;

      // Space: فقط عندما لا يكون التركيز في حقل نص
      if (isSpaceShortcut) {
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        const isEditable =
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          (document.activeElement as HTMLElement)?.isContentEditable;
        if (isEditable) return;
      }

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

  // Smart Escape back navigation
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      // Check if there are any overlays, modals, search inputs, or other Escape handlers active
      const isOverlayActive = !!(
        document.querySelector(".modal-overlay") ||
        document.querySelector(".fx-confirm-overlay") ||
        document.querySelector(".search-overlay") ||
        document.querySelector(".confirm-dialog-overlay") ||
        document.querySelector(".modal-dialog") ||
        document.querySelector(".fx-confirm-dialog") ||
        document.querySelector(".car-panel") ||
        document.querySelector(".add-sharik-modal") ||
        document.querySelector(".add-expense-modal")
      );

      const activeTag = (document.activeElement?.tagName ?? "").toLowerCase();
      const isEditable =
        activeTag === "input" ||
        activeTag === "textarea" ||
        activeTag === "select" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (isOverlayActive || isEditable) {
        return;
      }

      e.preventDefault();
      handleSmartBack();
    };

    window.addEventListener("keydown", handleEscapeKey);
    return () => window.removeEventListener("keydown", handleEscapeKey);
  }, [handleSmartBack]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--mx", `${event.clientX}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY}px`);
  };

  const handleExportExcel = useCallback(async () => {
    if (exportingExcel) return;

    setExportingExcel(true);
    setExportMessage(null);
    try {
      const filePath = await callTauri<string>("export_database_to_excel", { sessionToken });
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
      {isDeveloperMode && (
        <div className="developer-mode-banner">
          <span>وضع المطور نشط | الخلفية الحالية: {currentBg.split("/").pop()} (تصفح بالأسهم ➔ ➔)</span>
          <button onClick={exitDeveloperMode} className="developer-mode-exit-btn">
            حفظ الخلفية والخروج من وضع المطور
          </button>
        </div>
      )}
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
          onSidebarSectionRightClick={handleSidebarSectionRightClick}
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
          saveCarDisabled={carFormActions?.disabled}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          expensesSubTab={currentExpensesSubTab}
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
                className="origin-nano-weave"
              >
                {activeTab === "dashboard" && (
                  <Dashboard
                    cars={cars}
                    partners={partners}
                    onRefresh={refreshData}
                    initialSubTab={dashboardSubTab}
                    onInitialSubTabSet={() => setDashboardSubTab(null)}
                    onSubTabChange={setCurrentDashboardSubTab}
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
                      handleTabChange(tab, subTab);
                    }}
                    onLogout={handleLogout}
                    sessionToken={sessionToken}
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
                    onSubTabChange={setCurrentCarsSubTab}
                    onNavigateToPartner={handleNavigateToPartner}
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
                    onSubTabChange={setCurrentPartnersFinancialSubTab}
                    returnState={returnState}
                    onReturn={clearReturnState}
                    cars={cars}
                    onNavigateToCar={handleNavigateToCar}
                  />
                )}
                {activeTab === "expenses" && (
                  <ExpensesTab
                    onAddExpenseChange={setAddExpenseAction}
                    requestCloseRef={tabCloseRequestRef}
                    onDirtyChange={handleDirtyChange}
                    onDistributeChange={setAddDistributeAction}
                    fromDate={fromDate}
                    toDate={toDate}
                    initialSubTab={expensesSubTab}
                    onSubTabChange={setExpensesSubTab}
                  />
                )}
                {activeTab === "financial-accounts" && (
                  <FinancialAccountsTab 
                    initialPaymentTab={financialSubTab} 
                    onSubTabChange={setCurrentFinancialSubTab}
                  />
                )}
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
