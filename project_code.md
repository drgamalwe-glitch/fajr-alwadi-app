# Project Source Export

Generated automatically from selected Tauri + React project files.

---

## File: `package.json`

```json
{
  "name": "fajir-alwadi",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@radix-ui/react-select": "^2.2.6",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "autoprefixer": "^10.5.0",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "framer-motion": "^12.40.0",
    "lucide-react": "^1.17.0",
    "motion": "^12.40.0",
    "postcss": "^8.5.15",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-number-format": "^5.4.5",
    "tailwind-merge": "^3.6.0",
    "tailwindcss": "^3.4.19"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@typescript-eslint/eslint-plugin": "^8.60.1",
    "@typescript-eslint/parser": "^8.60.1",
    "@vitejs/plugin-react": "^4.6.0",
    "eslint": "^10.4.1",
    "typescript": "~5.8.3",
    "vite": "^7.0.4"
  }
}

```

---

## File: `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@logo": resolve(__dirname, "logo.png"),
      "@": resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

```

---

## File: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}

```

---

## File: `src-tauri/Cargo.toml`

```toml
[package]
name = "fajir-alwadi"
version = "0.1.0"
description = "نظام إدارة الحسابات والسيارات لشركة فجر الوادي"
authors = ["Al-Syd"]
edition = "2021"

[lib]
name = "fajir_alwadi_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
open = "5"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "z"

```

---

## File: `src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Fajr Al-Wadi",
  "version": "1.0.2",
  "identifier": "com.fajralwadi.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "نظام فجر الوادي لإدارة المعرض",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 500,
        "resizable": true,
        "fullscreen": false,
        "maximized": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "wix": {
        "language": ["ar-SA", "en-US"]
      }
    }
  }
}

```

---

## File: `src/App.tsx`

```tsx
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

```

---

## File: `src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/colors.css";

/** تحويل الأرقام العربية/الشرقية إلى أرقام إنجليزية غربية */
function toWesternDigits(str: string): string {
  return str
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/** مصيدة عالمية: تحول أي رقم عربي يُكتب في أي حقل إلى رقم إنجليزي */
document.addEventListener(
  "input",
  (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target || !("value" in target)) return;
    const converted = toWesternDigits(target.value);
    if (converted !== target.value) {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      target.value = converted;
      // الحفاظ على موقع المؤشر بعد التحويل
      try {
        target.setSelectionRange(start, end);
      } catch { /* بعض العناصر لا تدعم setSelectionRange */ }
      // إطلاق حدث React الداخلي لمزامنة الحالة
      const nativeInput = Object.getOwnPropertyDescriptor(
        target.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        "value"
      );
      if (nativeInput?.set) {
        nativeInput.set.call(target, converted);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  },
  true // capture phase — قبل React
);

/** ضبط التكبير والتصغير التلقائي للشاشات المختلفة لتطابق دقة 1920x1080 */
function applyAutoZoom() {
  const baseWidth = 1920;
  const baseHeight = 1000; // الارتفاع النموذجي لمنطقة العرض (Viewport) في شاشات 1080p

  const width = window.innerWidth;
  const height = window.innerHeight;

  const scaleX = width / baseWidth;
  const scaleY = height / baseHeight;

  // حساب نسبة التكبير/التصغير بناءً على البعد الأكثر تقييداً
  let zoomFactor = Math.min(scaleX, scaleY);

  // إبقاء التكبير في حدود آمنة بين 0.50 و 1.25 لضمان تطابق أبعاد وارتفاعات التصميم بالكامل
  const finalZoom = Math.max(0.50, Math.min(1.25, zoomFactor));

  document.documentElement.style.zoom = String(finalZoom);
}

// تشغيل دالة الزوم تلقائياً عند تحميل الصفحة وتغيير حجم النافذة
if (typeof window !== "undefined") {
  window.addEventListener("resize", applyAutoZoom);
  window.addEventListener("load", applyAutoZoom);
  
  // تنفيذ فوري وعند فترات زمنية متتابعة لضمان التقاط أبعاد الشاشة بعد تكبير النافذة (Maximize)
  applyAutoZoom();
  setTimeout(applyAutoZoom, 50);
  setTimeout(applyAutoZoom, 150);
  setTimeout(applyAutoZoom, 300);
  setTimeout(applyAutoZoom, 600);
  setTimeout(applyAutoZoom, 1000);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

```

---

## File: `src/types.ts`

```ts
export type CarStatus = "متوفرة" | "مبيوعة";
export type PaymentType = "كاش" | "موعد" | "اقساط";

export interface CarPartner {
  car_number: string;
  partner_name: string;
  amount: number;
  currency: string;
  kind?: string | null;
}

export interface Car {
  car_number: string;
  car_plate_num: string;
  car_province: string;
  chassis_number?: string | null;
  car_model: string;
  car_year: string;
  car_name: string;
  color: string;
  details: string;
  purchase_price: number;
  selling_price: number;
  status: CarStatus;
  payment_type?: PaymentType | null;
  cash_price?: number | null;
  amount_paid?: number | null;
  amount_remaining?: number | null;
  installment_months?: number | null;
  monthly_payment?: number | null;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  purchase_date?: string | null;
  sale_date?: string | null;
  delivery_date?: string | null;
  first_payment_date?: string | null;
  purchase_time?: string | null;
  sale_time?: string | null;
  expenses_sum?: number | null;
  currency?: string | null;
  sale_currency?: string | null;
  purchase_payment_type?: string | null;
  sale_payment_type?: string | null;
  purchase_type?: string | null;
  financer_name?: string | null;
  commission_type?: string | null;
  commission_value?: number | null;
  car_partners?: CarPartner[] | null;
}

export interface Partner {
  partner_name: string;
  phone: string;
  total_amount: number;
  kind: string;
  total_withdrawals: number;
}

export interface UnifiedAccount {
  partner_name: string;
  phone: string | null;
  iqd_balance: number;
  usd_balance: number;
  kind: string;
}

export interface PartnerTransaction {
  id: number;
  partner_name: string;
  kind: string;
  type_: string;
  amount: number;
  date: string;
  notes: string | null;
  currency?: string | null;
  paymentType?: string | null;
  payment_type?: string | null;
  time?: string | null;
}

export interface ExpenseEntry {
  id: number;
  description: string;
  amount: number;
  date: string;
  time: string;
  notes: string | null;
  currency?: string | null;
  car_number?: string | null;
}

export interface CarExpenseRecord {
  id: number;
  car_number: string;
  description: string;
  amount: number;
  date: string;
  currency?: string | null;
}

export interface CashRegisterEntry {
  id: number;
  date: string;
  time: string;
  type_: string;
  amount: number;
  description: string;
  notes: string | null;
  balance: number;
  currency?: string | null;
}

export interface Agency {
  id: number;
  old_agent_name: string;
  car_number: string;
  car_model: string;
  color: string;
  new_agent_name: string;
  phone: string;
  amount_usd: number;
  amount_iqd: number;
  notes: string;
  date: string;
  time: string;
}

export interface AgencyTransaction {
  id: number;
  agency_id: number;
  date: string;
  time: string;
  type_: string;
  amount: number;
  currency?: string | null;
  notes: string | null;
}

export type TabId = "dashboard" | "cars" | "partners" | "partners-financial" | "debtors" | "cashregister" | "expenses" | "financial-accounts" | "financial-transactions" | "agencies";

export interface FinancialSummary {
  iqd_balance: number;
  usd_balance: number;
  inventory_value: number;
  total_investments: number;
  total_partner_capital: number;
  total_debtors: number;
  net_capital: number;
  total_expenses: number;
}

export interface CarFormState {
  num: string;
  province: string;
  chassis: string;
  model: string;
  year: string;
  name: string;
  color: string;
  details: string;
  purchase: string;
  selling: string;
  status: CarStatus;
  paymentType: PaymentType;
  amountPaid: string;
  amountRemaining: string;
  installmentMonths: string;
  buyerName: string;
  phone: string;
  purchaseDate: string;
  saleDate: string;
  deliveryDate: string;
  firstPaymentDate: string;
  currency: "IQD" | "USD";
  saleCurrency: "IQD" | "USD";
  purchasePaymentType: "قاصه" | "ماستر";
  salePaymentType: "قاصه" | "ماستر";
  purchaseType: "كاش" | "شراكه" | "تمويل" | "شركة";
  financerName: string;
  commissionType: "نسبة" | "مقطوع" | "لا يوجد";
  commissionValue: string;
  carPartners: { partner_name: string; amount: string; currency: "IQD" | "USD"; kind?: string }[];
  oldNum?: string;
}

```

---

## File: `src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />
/// <reference types="@tauri-apps/api/types" />

declare module "*.png" {
  const src: string;
  export default src;
}

```

---

## File: `src/constants.ts`

```ts
export const PAGE_SIZE = 13;

export const CAR_STATUS_OPTIONS = ["متوفرة", "مبيوعة"] as const;
export const PAYMENT_TYPE_OPTIONS = ["كاش", "موعد", "اقساط"] as const;
export const PURCHASE_TYPE_OPTIONS = ["كاش", "شراكه", "تمويل", "شركة"] as const;
export const COMMISSION_TYPE_OPTIONS = ["نسبة", "مقطوع", "لا يوجد"] as const;
export const CURRENCY_OPTIONS = ["IQD", "USD"] as const;
export const PAYMENT_ACCOUNT_OPTIONS = ["قاصه", "ماستر"] as const;

export const TRANSACTION_TYPES = ["ايداع", "سحب"] as const;

export const AGENCY_TABS = [
  { id: "list" as const, label: "الوكالات" },
  { id: "details" as const, label: "تفاصيل" },
] as const;

export const FINANCIAL_ACCOUNT_TABS = [
  { id: "قاصه" as const, label: "قاصه" },
  { id: "ماستر" as const, label: "ماستر" },
] as const;

```

---

## File: `src/utils/dateSegments.ts`

```ts
import { toEnglishDigits } from "./numberInput";

export const todayIsoDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const normalizeIsoDate = (value: string) => {
  const english = toEnglishDigits(value)
    .replace(/[\/.،,ـ_\s]+/g, "-")
    .replace(/[^\d-]/g, "");
  const compact = english.replace(/\D/g, "");
  if (!english.includes("-") && compact.length >= 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  const parts = english.split("-").filter(Boolean);
  if (parts.length >= 3) {
    const [year, month, day] = parts;
    return `${year.slice(0, 4).padStart(4, "0")}-${month.slice(0, 2).padStart(2, "0")}-${day.slice(0, 2).padStart(2, "0")}`;
  }
  return english;
};

export const getYear = (value: string) => (value.split("-")[0] || "");
export const getMonth = (value: string) => (value.split("-")[1] || "");
export const getDay = (value: string) => (value.split("-")[2] || "");

export const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

export const combineIsoDate = (year: string, month: string, day: string) =>
  `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

export const normalizeYearValue = (value: string, fallback = new Date().getFullYear()) => {
  const digits = toEnglishDigits(value).replace(/\D/g, "").slice(0, 4);
  const parsed = parseInt(digits, 10);
  return String(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
};

/** تغيير آخر رقمين فقط (مثلاً 2024 → 2025) */
export const bumpYearLastTwo = (
  year: number,
  delta: number,
  minYear = 2000,
  maxYear = 2026,
) => {
  const prefix = Math.floor(year / 100);
  let suffix = year % 100;
  suffix = (suffix + delta + 100) % 100;
  let next = prefix * 100 + suffix;
  if (next < minYear) next = minYear;
  if (next > maxYear) next = maxYear;
  return next;
};

export const selectYearLastTwoDigits = (input: HTMLInputElement) => {
  const len = input.value.length;
  input.setSelectionRange(Math.max(0, len - 2), len);
};

```

---

## File: `src/utils/keyboardLayout.ts`

```ts
import { toEnglishDigits } from "./numberInput";

const EN_TO_AR: Record<string, string> = {
  q: "ض",
  w: "ص",
  e: "ث",
  r: "ق",
  t: "ف",
  y: "غ",
  u: "ع",
  i: "ه",
  o: "خ",
  p: "ح",
  "[": "ج",
  "]": "د",
  a: "ش",
  s: "س",
  d: "ي",
  f: "ب",
  g: "ل",
  h: "ا",
  j: "ت",
  k: "ن",
  l: "م",
  ";": "ك",
  "'": "ط",
  z: "ئ",
  x: "ء",
  c: "ؤ",
  v: "ر",
  b: "لا",
  n: "ى",
  m: "ة",
  ",": "و",
  ".": "ز",
  "/": "ظ",
  "`": "ذ",
};

const AR_TO_EN = Object.fromEntries(
  Object.entries(EN_TO_AR).map(([en, ar]) => [ar, en]),
) as Record<string, string>;

export function englishKeyboardToArabic(value: string): string {
  return value.replace(/[A-Za-z[\];',./`]/g, (char) => {
    const lower = char.toLowerCase();
    return EN_TO_AR[lower] ?? char;
  });
}

export function arabicKeyboardToEnglish(value: string): string {
  return toEnglishDigits(value)
    .replace(/لا/g, "b")
    .replace(/[ضصثقفغعهخحجدشسيبلاتنمكطئءؤرىةوزظذ]/g, (char) => (
      AR_TO_EN[char] ?? char
    ));
}

export function toChassisText(value: string): string {
  return arabicKeyboardToEnglish(value).toUpperCase();
}

```

---

## File: `src/utils/pagination.ts`

```ts
import type { KeyboardEvent, WheelEvent } from "react";

export function changePageByDelta(currentPage: number, totalPages: number, delta: number) {
  if (totalPages <= 1) return currentPage;
  return Math.min(totalPages - 1, Math.max(0, currentPage + delta));
}

export function handlePaginationWheel(
  event: WheelEvent<HTMLElement>,
  currentPage: number,
  totalPages: number,
  setPage: (page: number) => void,
) {
  if (event.deltaY > 0) {
    event.preventDefault();
    setPage(changePageByDelta(currentPage, totalPages, 1));
  } else if (event.deltaY < 0) {
    event.preventDefault();
    setPage(changePageByDelta(currentPage, totalPages, -1));
  }
}

export function handlePaginationKeyDown(
  event: KeyboardEvent<HTMLElement>,
  currentPage: number,
  totalPages: number,
  setPage: (page: number) => void,
) {
  if (event.key === "ArrowRight" || event.key === "PageDown") {
    event.preventDefault();
    setPage(changePageByDelta(currentPage, totalPages, 1));
  } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    setPage(changePageByDelta(currentPage, totalPages, -1));
  } else if (event.key === "Home") {
    event.preventDefault();
    setPage(0);
  } else if (event.key === "End") {
    event.preventDefault();
    setPage(Math.max(0, totalPages - 1));
  }
}

```

---

## File: `src/utils/numberInput.ts`

```ts
/** تحويل الأرقام العربية/الهندية/الفارسية إلى أرقام إنجليزية */
export function cleanAndNormalizeNumbers(value: string): string {
  if (!value) return "";
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** alias */
export const normalizeNumbers = cleanAndNormalizeNumbers;

export function toEnglishDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\ufeff]/g, "");
}

/** تحويل نص بفواصل آلاف إلى رقم */
export function parseFormattedNumber(value: string): number {
  const english = toEnglishDigits(value)
    .replace(/[٬،\s]/g, ",")
    .replace(/٫/g, ".");
  const cleaned = english.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** عرض رقم بفاصل آلاف (1,234,567) */
export function formatThousands(value: number): string {
  if (value === 0) return "0";
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

/** تحويل الأرقام العربية (٠-٩) إلى إنجليزية (0-9) */
export function parseArabicNumbers(input: string | number): string {
  if (input === undefined || input === null) return "";
  return String(input)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** معالجة حقل رقمي — يبقي الأرقام والنقطة فقط */
export function handleNumericInput(value: string): string {
  const converted = parseArabicNumbers(value);
  return converted.replace(/[^0-9.]/g, "");
}

```

---

## File: `src/utils/carData.ts`

```ts
/** المحافظات العراقية الـ 19 */
export const IRAQ_PROVINCES = [
  "بغداد",
  "البصرة",
  "نينوى",
  "أربيل",
  "النجف",
  "كربلاء",
  "الأنبار",
  "ديالى",
  "صلاح الدين",
  "بابل",
  "واسط",
  "ذي قار",
  "ميسان",
  "المثنى",
  "القادسية",
  "كركوك",
  "السليمانية",
  "دهوك",
  "حلبجة",
] as const;

/** موديلات BYD */
export const BYD_MODELS = [
  "SEAL 5",
  "DESTROYER",
  "QIN PLUS",
  "SEAL 3",
  "K5",
] as const;

/** ألوان السيارات الشائعة */
export const CAR_COLORS = [
  "أبيض",
  "أسود",
  "رمادي",
  "فضي",
  "أزرق",
  "أزرق داكن",
  "أحمر",
  "بني",
  "بيج",
  "ذهبي",
  "أخضر",
  "برتقالي",
  "بنفسجي",
  "وردي",
  "أبيض لؤلؤي",
  "رمادي داكن",
] as const;

/** سنوات الصنع 2026 → 2000 */
export const CAR_YEARS: string[] = Array.from(
  { length: 2026 - 2000 + 1 },
  (_, i) => String(2026 - i),
);

```

---

## File: `src/utils/finance.ts`

```ts
import type { Car, Partner } from "../types";

export function carNetProfit(car: Car): number {
  if (car.status !== "مبيوعة") return 0;
  const totalCost = car.purchase_price + (car.expenses_sum || 0);
  return car.selling_price - totalCost;
}

export function carProfitPercentage(car: Car): string {
  const totalCost = car.purchase_price + (car.expenses_sum || 0);
  const profit = car.selling_price - totalCost;
  if (profit <= 0 || totalCost <= 0) return "0.0";
  return ((profit / totalCost) * 100).toFixed(1);
}

export function formatIqd(amount: number): string {
  const num = amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${num} IQ`;
}

/** الرقم فقط بدون وحدة */
export function formatNumber(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function computeDashboardStats(cars: Car[], partners: Partner[] = []) {
  const availableCars = cars.filter((c) => c.status === "متوفرة");
  const totalInventoryValue = availableCars.reduce((sum, c) => sum + c.purchase_price, 0);
  const iqdInventory = availableCars
    .filter((c) => c.currency !== "USD")
    .reduce((sum, c) => sum + c.purchase_price, 0);
  const usdInventory = availableCars
    .filter((c) => c.currency === "USD")
    .reduce((sum, c) => sum + c.purchase_price, 0);

  const partnersTotal = partners
    .filter((p) => p.kind === "شريك")
    .reduce((sum, p) => sum + p.total_amount, 0);

  const investorsTotal = partners
    .filter((p) => p.kind === "مستثمر")
    .reduce((sum, p) => sum + p.total_amount, 0);

  const netCapital = totalInventoryValue + partnersTotal - investorsTotal;

  return {
    totalInventoryValue,
    iqdInventory,
    usdInventory,
    partnersTotal,
    investorsTotal,
    netCapital,
  };
}

const arabicOnesMale = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];

function smallNumberToWords(n: number): string {
  if (n <= 0) return "";
  const small = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر"];
  if (n <= 12) return small[n] + " ";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let result = "";
  if (hundreds > 0) {
    if (hundreds === 1) result += "مئة";
    else if (hundreds === 2) result += "مئتان";
    else result += arabicOnesMale[hundreds] + " مئة";
    result += rest > 0 ? " و" : " ";
  }
  if (rest === 0) {
    // done
  } else if (rest <= 12) {
    result += small[rest] + " ";
  } else if (rest < 20) {
    result += arabicOnesMale[rest % 10] + " عشر ";
  } else {
    const tens = Math.floor(rest / 10);
    const units = rest % 10;
    const tensWords = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    if (units > 0) result += arabicOnesMale[units] + " و";
    result += tensWords[tens] + " ";
  }
  return result;
}

export function numberToArabicWords(num: number): string {
  if (num === 0) return "صفر";
  let result = "";
  const billions = Math.floor(num / 1_000_000_000);
  num %= 1_000_000_000;
  const millions = Math.floor(num / 1_000_000);
  num %= 1_000_000;
  const thousands = Math.floor(num / 1_000);
  num %= 1_000;
  const below = num;

  if (billions > 0) {
    if (billions === 1) result += "مليار ";
    else if (billions === 2) result += "ملياران ";
    else result += smallNumberToWords(billions) + "مليار ";
  }
  if (millions > 0) {
    if (millions === 1) result += "مليون ";
    else if (millions === 2) result += "مليونان ";
    else result += smallNumberToWords(millions) + (millions > 10 ? "مليون " : "ملايين ");
  }
  if (thousands > 0) {
    if (thousands === 1) result += "ألف ";
    else if (thousands === 2) result += "ألفان ";
    else result += smallNumberToWords(thousands) + (thousands > 10 ? "ألف " : "آلاف ");
  }
  if (below > 0) {
    result += smallNumberToWords(below);
  }

  return result.trim();
}

```

---

## File: `src/utils/installments.ts`

```ts
export interface InstallmentAlert {
  buyerName: string;
  phone: string;
  dueDate: string;
  monthlyPayment: number;
  status: "overdue" | "due_today" | "upcoming";
  daysDifference: number;
}


```

---

## File: `src/styles/partners.css`

```css
/* ==========================================================================
   👥 ملف أنماط حسابات العملاء والشركاء (Partners & Clients Stylesheet)
   ==========================================================================
   يحتوي هذا الملف على جميع الخصائص والمتغيرات الخاصة بتبويب حسابات العملاء.
   يمكنك تعديل أي قيمة من المتغيرات أدناه لتغيير المظهر فوراً.
   ========================================================================== */

/* ─── 🎨 ألوان أنواع الحسابات (Account Kind Colors) ─── */
/* غيّر أي لون أدناه وسيتغير تلقائياً في جميع جداول وقوائم التطبيق */
:root {
  --account-shareek: #D4AF37;
  --account-mostathmir: #00B8D9;
  --account-mumawil: #4169E1;
  --account-moqtarid: #FF8C00;
  --account-sharika: #8A2BE2;

  --partner-sharik-color: var(--account-shareek);
  --partner-mustathmir-color: var(--account-mostathmir);
  --partner-mumuol-color: var(--account-mumawil);
  --partner-moqtarid-color: var(--account-moqtarid);
  --partner-sharika-color: var(--account-sharika);

  --partner-sharik-bg: color-mix(in srgb, var(--account-shareek) 12%, transparent);
  --partner-mustathmir-bg: color-mix(in srgb, var(--account-mostathmir) 12%, transparent);
  --partner-mumuol-bg: color-mix(in srgb, var(--account-mumawil) 12%, transparent);
  --partner-moqtarid-bg: color-mix(in srgb, var(--account-moqtarid) 12%, transparent);
  --partner-sharika-bg: color-mix(in srgb, var(--account-sharika) 12%, transparent);

  --partner-sharik-hover: color-mix(in srgb, var(--account-shareek) 18%, transparent);
  --partner-mustathmir-hover: color-mix(in srgb, var(--account-mostathmir) 18%, transparent);
  --partner-mumuol-hover: color-mix(in srgb, var(--account-mumawil) 18%, transparent);
  --partner-moqtarid-hover: color-mix(in srgb, var(--account-moqtarid) 18%, transparent);
  --partner-sharika-hover: color-mix(in srgb, var(--account-sharika) 18%, transparent);

  --partner-row-border-width: 3px;
}

/* نقطة لونية في القوائم المنسدلة */
.combobox-option-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 6px;
  flex-shrink: 0;
}
.combobox-option-dot[data-kind="شريك"] { background: var(--partner-sharik-color); }
.combobox-option-dot[data-kind="مستثمر"] { background: var(--partner-mustathmir-color); }
.combobox-option-dot[data-kind="ممول"] { background: var(--partner-mumuol-color); }
.combobox-option-dot[data-kind="مقترض"] { background: var(--partner-moqtarid-color); }
.combobox-option-dot[data-kind="شركة"] { background: var(--partner-sharika-color); }
/* لون نص نوع الحساب في الجدول */
.badge--kind-شريك { color: var(--account-shareek) !important; }
.badge--kind-مستثمر { color: var(--account-mostathmir) !important; }
.badge--kind-ممول { color: var(--account-mumawil) !important; }
.badge--kind-مقترض { color: var(--account-moqtarid) !important; }
.badge--kind-شركة { color: var(--account-sharika) !important; }

/* لون خلفية رأس جدول المعاملات حسب نوع الحساب */
.partner-tx-wrapper thead tr[data-kind="شريك"] th { background: color-mix(in srgb, var(--account-shareek) 15%, transparent) !important; }
.partner-tx-wrapper thead tr[data-kind="مستثمر"] th { background: color-mix(in srgb, var(--account-mostathmir) 15%, transparent) !important; }
.partner-tx-wrapper thead tr[data-kind="ممول"] th { background: color-mix(in srgb, var(--account-mumawil) 15%, transparent) !important; }
.partner-tx-wrapper thead tr[data-kind="مقترض"] th { background: color-mix(in srgb, var(--account-moqtarid) 15%, transparent) !important; }
.partner-tx-wrapper thead tr[data-kind="شركة"] th { background: color-mix(in srgb, var(--account-sharika) 15%, transparent) !important; }

/* لون نص القائمة المنسدلة حسب نوع الحساب (قبل الفتح) */
.combobox-trigger[data-kind="شريك"] { color: var(--account-shareek) !important; }
.combobox-trigger[data-kind="مستثمر"] { color: var(--account-mostathmir) !important; }
.combobox-trigger[data-kind="ممول"] { color: var(--account-mumawil) !important; }
.combobox-trigger[data-kind="مقترض"] { color: var(--account-moqtarid) !important; }
.combobox-trigger[data-kind="شركة"] { color: var(--account-sharika) !important; }
/* صفوف الجدول حسب نوع الحساب */
.partner-row--شركة {
  background: var(--partner-sharika-bg) !important;
}
.partner-row--شركة td:first-child {
  border-right: var(--partner-row-border-width) solid var(--partner-sharika-color) !important;
}
.partner-row--شركة:hover {
  background: var(--partner-sharika-hover) !important;
}

.customers-page {
  /* ─── ⚙️ متغيرات حسابات العملاء (Client accounts CSS Variables) ─── */

  /* اللون عند المطالبة المالية (نطلبهم - لون أخضر مريح) */
  --color-they-owe: #86efac;

  /* اللون عند الالتزام المالي (يطلبونا - لون أحمر للتنبيه) */
  --color-we-owe: #fca5a5;

  /* تدرجات ألوان بطاقات الإحصائيات العلوية للديون */
  --they-owe-card-bg: linear-gradient(145deg, rgba(212,175,55,0.22), rgba(255,215,0,0.10));
  --we-owe-card-bg: linear-gradient(145deg, rgba(239,68,68,0.22), rgba(248,113,113,0.10));

  /* ألوان الحركات المالية داخل نافذة التفاصيل المنبثقة */
  --tx-deposit-row-bg: rgba(34, 197, 94, 0.04);
  --tx-withdraw-row-bg: rgba(239, 68, 68, 0.04);

  /* حجم الخط العام لتفاصيل ديون العملاء */
  --customers-font-size: var(--fs-sm);
}

/* ─── 📐 تنسيقات تبويب حسابات العملاء ─── */

/* بطاقات المديونية العلوية */
.customers-page .stat-card {
  border-radius: 12px !important;
  padding: 1.5rem 2rem !important;
  backdrop-filter: blur(12px) !important;
}

/* ألوان المديونية في أعمدة الجدول */
.customers-page .col-money.text-green {
  color: var(--color-they-owe) !important;
}

.customers-page .col-money.text-red {
  color: var(--color-we-owe) !important;
}

/* ─── 📐 تنسيقات نافذة التفاصيل والعمليات المنبثقة (Modal Dialog) ─── */

/* خلفية صفوف العمليات في نافذة التفاصيل */
.partner-tx-row--deposit {
  background: var(--tx-deposit-row-bg) !important;
}

.partner-tx-row--withdraw {
  background: var(--tx-withdraw-row-bg) !important;
}

/* شارات نوع الحساب (قاصة، ماستر، مصرف) داخل المودال */
.account-badge {
  padding: 2px 8px !important;
  border-radius: 6px !important;
  font-size: var(--fs-xs) !important;
  font-weight: var(--fw-bold) !important;
  display: inline-block !important;
}

.account-badge--qasa {
  background: rgba(216, 168, 90, 0.15) !important;
  color: #d8a85a !important;
  border: 1px solid rgba(216, 168, 90, 0.25) !important;
}

.account-badge--master {
  background: rgba(139, 92, 246, 0.15) !important;
  color: #a78bfa !important;
  border: 1px solid rgba(139, 92, 246, 0.25) !important;
}

.account-badge--bank {
  background: rgba(34, 197, 94, 0.15) !important;
  color: #86efac !important;
  border: 1px solid rgba(34, 197, 94, 0.25) !important;
}



```

---

## File: `src/styles/qasa.css`

```css
/* ==========================================================================
   💰 ملف أنماط القاصة (Qasa & Cash Register Stylesheet)
   ==========================================================================
   يحتوي هذا الملف على جميع الخصائص والمتغيرات الخاصة بتبويبات القاصة والماستر.
   يمكنك تعديل أي قيمة من المتغيرات أدناه لتغيير المظهر والخطوط والألوان فوراً.
   ========================================================================== */

.dashboard {
  /* ─── ⚙️ متغيرات القاصة (Qasa CSS Variables) ─── */

  /* حجم خط العناوين وتفاصيل المعاملات في جدول القاصة */
  --qasa-font-size: var(--fs-md);

  /* سمات أزرار تبويب القاصة والماستر (Active Tab Themes) */
  --qasa-tab-active-bg: linear-gradient(135deg, rgba(216, 168, 90, 0.25), rgba(216, 168, 90, 0.08));
  --qasa-tab-active-color: #d8a85a;
  --qasa-tab-active-shadow: 0 0 20px rgba(216, 168, 90, 0.15), inset 0 1px 0 rgba(216, 168, 90, 0.15);

  --master-tab-active-bg: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(34, 197, 94, 0.06));
  --master-tab-active-color: #86efac;
  --master-tab-active-shadow: 0 0 18px rgba(34, 197, 94, 0.18), inset 0 1px 0 rgba(134, 239, 172, 0.14);

  /* ألوان المبالغ والعملات */
  --qasa-usd-background: var(--red);
  --qasa-iqd-pos-color: #d8a85a;
  --qasa-iqd-neg-color: #f43f5e;

  /* لون حدود الخلايا والجدول */
  --qasa-border-color: rgba(255, 255, 255, 0.05);
}

/* ─── 📐 تنسيقات تبويب القاصة ─── */

/* تنسيق شريط التبويبات الفرعية في القاصة */


/* ─── 📊 تنسيقات جداول المعاملات المالية (Qasa Table Customizations) ─── */

/* حجم الخط ومحاذاة النصوص داخل جدول القاصة */
.data-table th,
.data-table td {
  font-size: var(--qasa-font-size) !important;
}

/* ألوان المبالغ حسب العملة ونوع العملية */
.qasa-amount-usd {
  color: var(--qasa-usd-color) !important;
}

.qasa-amount-iqd-pos {
  color: var(--qasa-iqd-pos-color) !important;
}

.qasa-amount-iqd-neg {
  color: var(--qasa-iqd-neg-color) !important;
}


```

---

## File: `src/styles/monsadilah.css`

```css
/* ============================================================
   🎯 القوائم المنسدلة — منسدلة (Dropdowns)
   
   🔧 قابلة للتعديل — غيّر القيم في :root
   ============================================================ */

:root {
  /* ─── حواف دائرية ─── */
  --cmb-radius-trigger: 10px;
  --cmb-radius-dropdown: 10px;

  /* ─── ألوان ذهبية ─── */
  --cmb-gold: #ffc40080;
  --cmb-gold-light: #f4d03f;
  --cmb-glow: rgba(212, 175, 55, 0.25);

  /* ─── ألوان حمراء (تدرج) ─── */
  --cmb-red: #7a0d0d;
  --cmb-red-light: #b91c1c;

  /* ─── ألوان الخلفية ─── */
  --cmb-bg-trigger: var(--text-input);
  --cmb-bg-dropdown: rgba(55, 55, 55, 0.939);
  --cmb-bg-hover: var(--cmb-bg-hover);
  --cmb-bg-active: rgba(255, 0, 0, 0);

  /* ─── حدود ─── */
  --cmb-border: 1px solid rgba(255, 255, 255, 0.235);

  /* ─── ظلال ─── */
  --cmb-shadow-trigger: 0 10px 30px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  --cmb-shadow-focus: 0 0 0 1px var(--cmb-glow), 0 0 25px rgba(212, 175, 55, 0.15), 0 15px 40px rgba(0, 0, 0, 0.55);
  --cmb-shadow-dropdown: 0 20px 60px rgba(0, 0, 0, 0.65), 0 0 30px rgba(212, 175, 55, 0.08);

  /* ─── طباعة ─── */
  --cmb-font-size: var(--font-size);
  --cmb-height: 58px;
  --cmb-color: #f5f5f5;
  --cmb-placeholder: #bdbdbd;

  /* ─── فراغ ─── */
  --cmb-gap: 8px;
  --cmb-padding-x: 18px;

  /* ─── القائمة ─── */
  --cmb-max-height: 320px;
}

/* ─── حاوية المنسدلة ─── */
.search-select {
  background: var(--backkground-secondary);
  border-radius: var(--all-radius);
}

/* ─── حقل الإدخال ─── */
.combobox-trigger {
  width: 100%;
  height: var(--cmb-height);
  padding: 0 var(--cmb-padding-x);
  border-radius: var(--cmb-radius-trigger);
  outline: none;
  text-align: center;
  color: var(--cmb-color);
  font-size: var(--cmb-font-size);
  background: var(--cmb-bg-trigger);
  border: var(--cmb-border);
  box-shadow: var(--cmb-shadow-trigger);
  transition: border-color 0.25s, box-shadow 0.25s, background 0.25s;
  caret-color: var(--cmb-gold);
}

.combobox-trigger::placeholder {
  color: var(--cmb-placeholder);
}

.combobox-trigger:focus {
  border-color: var(--input-focus-border, var(--cmb-gold));
  box-shadow: var(--input-focus-shadow, var(--cmb-shadow-focus));
}

.combobox-trigger--has-suffix {
  padding: 0 var(--cmb-padding-x) 0 calc(var(--cmb-padding-x) + 32px);
}

/* ─── لاحقة (نسبة مئوية) ─── */
.combobox-suffix {
  position: absolute;
  left: 36px;
  top: 50%;
  transform: translateY(-50%);
  font-size: var(--fs-xs);
  color: var(--cmb-gold);
  font-weight: var(--fw-bold);
  pointer-events: none;
  opacity: 0.85;
}

/* ─── سهم القائمة ─── */
.combobox-arrow {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--cmb-gold);
  opacity: 0.5;
  pointer-events: none;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s;
}

.combobox-arrow--open {
  transform: translateY(-50%) rotate(180deg);
  opacity: 0.85;
}

.combobox-trigger:focus ~ .combobox-arrow {
  opacity: 0.85;
}

/* ─── القائمة المنبثقة ─── */
.combobox-dropdown {
  position: absolute;
  background: var(--cmb-bg-dropdown);
  border: var(--cmb-border);
  border-radius: var(--cmb-radius-dropdown);
  box-shadow: var(--cmb-shadow-dropdown);
}

/* ─── المحتوى الداخلي القابل للتمرير ─── */
.combobox-dropdown-inner {
  max-height: var(--cmb-max-height);
  overflow-y: auto;
  padding: 4px;
}

.combobox-dropdown-inner::-webkit-scrollbar {
  width: 8px;
}

.combobox-dropdown-inner::-webkit-scrollbar-track {
  background: transparent;
}

.combobox-dropdown-inner::-webkit-scrollbar-thumb {
  background: var(--cmb-gold);
  border-radius: 20px;
}

/* ─── خيارات القائمة ─── */
.combobox-option {
  padding: 14px 18px;
  color: var(--cmb-color);
  cursor: pointer;
  border-right: 3px solid transparent;
  transition: all 0.18s ease;
  user-select: none;
}

.combobox-option:hover,
.combobox-option--highlighted {
  background: var(--cmb-bg-hover);
  border-right-color: var(--cmb-gold);
  padding-right: 24px;
}

.combobox-option--selected {
  background: var(--cmb-bg-active);
  color: white;
  border-right-color: var(--cmb-gold);
  box-shadow: inset 0 0 20px rgba(212, 175, 55, 0.12);
  padding-right: 24px;
}

/* ─── رسالة لا توجد نتائج ─── */
.combobox-no-result {
  padding: 16px;
  text-align: center;
  color: var(--cmb-placeholder);
  font-size: var(--fs-sm);
}

/* ─── زر المسح (إلغاء الاختيار) ─── */
.combobox-clear {
  padding: 14px 18px;
  color: var(--cmb-red-light);
  cursor: pointer;
  border-right: 3px solid transparent;
  transition: all 0.18s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  margin-bottom: 2px;
  user-select: none;
}

.combobox-clear:hover {
  background: rgba(185, 28, 28, 0.12);
  border-right-color: var(--cmb-red-light);
  padding-right: 24px;
}

/* ─── sublabel ─── */
.combobox-option-sub {
  font-size: var(--fs-xs);
  opacity: 0.45;
  font-weight: var(--fw-medium);
}

```

---

## File: `src/styles/cars.css`

```css
/* ============================================================
   🚗 نظام إدارة المعرض — فجر الوادي (Showroom System)
   ============================================================ */

/* #region 1. متغيرات الألوان (Color Variables) */
:root {
  /* ─── الألوان الأساسية (Core Colors) ─── */
  --car-accent: var(--gold);           /* اللون الأساسي للتوهج والعناوين */
  --car-accent-light: var(--gold-light);
  --car-bg-page: rgba(255, 0, 0, 0);             /* خلفية صفحة المعرض */
  --car-bg-card: var(--backkground-secondary); /* خلفية البطاقات والمربعات */
  --car-border: rgba(255, 255, 255, 0.08);  /* الحدود العامة */
  --car-border-light: rgba(255, 255, 255, 0.05);

  /* ─── حالات السيارة (Car Status Colors) ─── */
  --car-status-available-bg: rgba(208, 132, 9, 0.851);
  --car-status-available-text: #d8a85a;
  --car-status-sold-bg: rgba(239, 68, 68, 0.12);
  --car-status-sold-text: #fca5a5;

  /* ─── ألوان أزرار الدفع (Payment Type Colors) ─── */
  --car-btn-cash: #10b981;        /* كاش */
  --car-btn-delivery: #8b5cf6;    /* موعد تسليم */
  --car-btn-installment: #3b82f6; /* أقساط */
  
  /* ─── ألوان التفاعل (Interaction Colors) ─── */
  --car-row-hover: rgba(216, 168, 90, 0.05);
  --car-row-selected: rgba(216, 168, 90, 0.12);
  --car-btn-delete: #f43f5e;
  --car-bg-inactive: rgba(255, 255, 255, 0.03);
  --car-bg-inactive-hover: rgba(255, 255, 255, 0.07);
}
/* #endregion */

/* #region 2. الخطوط والأحجام (Typography & Sizing) */
:root {
  /* ─── أحجام النصوص (Font Sizes) ─── */
  --car-fs-title: var(--font-size);      /* عناوين الأقسام */
  --car-fs-label: var(--font-size);     /* تسميات الحقول */
  --car-fs-body: var(--font-size);      /* نصوص الجداول */
  --car-fs-button: var(--font-size);       /* نصوص الأزرار */
  --car-fs-plate: var(--font-size);      /* رقم اللوحة */
  
  /* ─── ألوان النصوص (Text Colors) ─── */
  --car-text-label: var(--font-lable-color);
  --car-text-primary: var(--font-color);
  
  /* ─── أوزان الخطوط (Font Weights) ─── */
  --car-fw-bold: 700;
  --car-fw-medium: 500;

  /* ─── المسافات بين المستطيلات (Gaps) ─── */
  --car-gap-x: 0.35rem;            /* المسافة الأفقية بين المربع والذي بجانبه */
  --car-gap-y: 2rem;             /* المسافة العمودية بين المربع والذي تحته */
}
/* #endregion */

/* #region 3. هيكل صفحة المعرض (Layout & Toolbar) */
.cars-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--car-bg-page);
  color: #fff;
}

.cars-tabs {
  display: flex !important;
  gap: 12px !important;
  margin-bottom: 0 !important;
}

/* شارة عدد السيارات في التبويب */
.cars-tab__count {
  font-size: 0.8em;
  opacity: 0.7;
  margin-right: 6px;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}
/* #endregion */

/* #region 4. تنسيقات الجداول (Showroom & Sold Tables) */
.cars-data-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 4px; /* مسافة بين الصفوف */
}

.cars-tr {
  transition: all 0.2s ease;
  cursor: pointer;
}

.cars-tr:hover {
  background: var(--car-row-hover) !important;
}

.cars-tr--selected {
  background: var(--car-row-selected) !important;
  box-shadow: inset 3px 0 0 var(--car-accent);
}

/* تنسيق رقم اللوحة والمحافظة */
.ct-plate {
  font-family: var(--title-font-family);
  font-weight: var(--car-fw-bold);
  font-size: var(--car-fs-plate);
  color: var(--car-accent-light);
}

.ct-province {
  margin-right: 8px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  font-size: 1.3rem;
  color: rgba(255, 255, 255, 0.5);
}

/* تنسيق الأسعار والأرباح */
.ct-price {
  font-weight: var(--car-fw-bold);
}

.ct-profit {
  font-weight: var(--car-fw-bold);
  color: #10b981;
}

.ct-profit-pct {
  font-size: 1.3rem;
  opacity: 0.8;
}
/* #endregion */

/* #region 5. نموذج إدخال السيارة (Car Form Panel) */
:root {
  /* ─── أبعاد ومسافات النموذج (Form Layout) ─── */
  --car-form-padding: 1.25rem;  /* الحشوة الداخلية للنموذج */
  
  /* ─── إعدادات الكونر (Containers Customization) ─── */
  /* يمكنك تخصيص كل كونر (مربع) بشكل مستقل من هنا */
  
  /* 1. كونر مواصفات المركبة (Specs) */
  --car-specs-bg: var(--backkground-secondary);
  --car-specs-radius: var(--all-radius);
  
  /* 2. كونر تفاصيل الشراء (Purchase) */
  --car-purchase-bg: var(--backkground-secondary);
  --car-purchase-radius: var(--all-radius);
  
  /* 3. كونر مصاريف السيارة (Expenses) */
  --car-expenses-bg: var(--backkground-secondary);
  --car-expenses-radius: var(--all-radius);
  
  /* 4. كونر نوع الدفع (Payment Type) */
  --car-payment-bg: var(--backkground-secondary);
  --car-payment-radius: var(--all-radius);
  
  /* 5. كونر تفاصيل البيع والعميل (Sale) */
  --car-sale-bg: var(--backkground-secondary);
  --car-sale-radius: var(--all-radius);
}

.car-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: var(--car-gap-x);
}

.car-form-card {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate));
  border: var(--hidod);
  color: var(--car-text-primary);
}

.modal-dialog--car label,
.modal-dialog--car .car-form-label,
.modal-dialog--car .app-input-label,
.car-form-card label,
.car-form-card .car-form-label,
.car-form-card .app-input-label,
.car-form-group-title {
  color: var(--font-lable-color) !important;
  font-size: var(--font-size) !important;
}

.modal-dialog--car .input,
.modal-dialog--car .combo-input,
.modal-dialog--car .unified-date-field,
.modal-dialog--car .year-scroll-field,
.modal-dialog--car .price-input input,
.modal-dialog--car .date-seg,
.modal-dialog--car .price-currency-select,
.modal-dialog--car select,
.modal-dialog--car input,
.modal-dialog--car .app-input-field,
.modal-dialog--car .app-input-field-sm,
.car-form-card .input,
.car-form-card .combo-input,
.car-form-card .unified-date-field,
.car-form-card .year-scroll-field,
.car-form-card .price-input input,
.car-form-card .date-seg,
.car-form-card .price-currency-select,
.car-form-card select,
.car-form-card input,
.car-form-card .app-input-field,
.car-form-card .app-input-field-sm,
.car-form-card button {
  font-size: var(--font-size) !important;
  color: var(--font-color) !important;
}

.car-form-card input::placeholder,
.car-form-card .textarea::placeholder,
.car-form-card .app-input-field::placeholder {
  color: var(--font-lable-color) !important;
  opacity: 0.7;
  font-size: var(--font-size) !important;
}

/* ربط كل كونر بمتغيراته الخاصة */
.car-form-card--specs    { background: var(--car-specs-bg);    border-radius: var(--car-specs-radius); }
.car-form-card--purchase { background: var(--car-purchase-bg); border-radius: var(--car-purchase-radius); }
.car-form-card--expenses { background: var(--car-expenses-bg); border-radius: var(--car-expenses-radius); }
.car-form-card--payment  { background: var(--car-payment-bg);  border-radius: var(--car-payment-radius); }
.car-form-card--sale     { background: var(--car-sale-bg);     border-radius: var(--car-sale-radius); }

/* ═══════════════════════════════════════════════════════════════
   📐 أبعاد مربعات الإدخال — غير height و width لكل مربع
   ═══════════════════════════════════════════════════════════════ */
/* ── مواصفات المركبة ── */

/* نوع السيارة */
.car-form-card .app-input-wrapper:has(#car-model) {
  height: 42px !important;
  width: 100% !important;
}

/* الموديل */
.car-form-card .app-input-wrapper:has(#car-year) {
  height: 42px !important;
  width: 100% !important;
}
.car-form-card .grid > div:has(#car-year) {
  max-width: 500px !important;
  min-width: 120px !important;
}

/* اللون */
.car-form-card .app-input-wrapper:has(#car-color) {
  height: 42px !important;
  width: 100% !important;
}

/* رقم اللوحة */
.car-form-card .app-input-wrapper:has(#car-num) {
  height: 42px !important;
  width: 100% !important;
}

/* رقم الشاصي */
.car-form-card .app-input-wrapper:has(#car-chassis) {
  height: 42px !important;
  width: 100% !important;
}

/* ── تفاصيل الشراء ── */

/* سعر الشراء */
.car-form-card .app-input-wrapper:has(#car-purchase) {
  height: 42px !important;
  width: 100% !important;
}

/* ── تفاصيل البيع ── */

/* سعر البيع */
.car-form-card .app-input-wrapper:has(#car-selling) {
  height: 42px !important;
  width: 100% !important;
}

/* اسم المشتري */
.car-form-card .app-input-wrapper:has(#buyer-name) {
  height: 42px !important;
  width: 100% !important;
}

/* رقم الهاتف */
.car-form-card .app-input-wrapper:has(#buyer-phone) {
  height: 42px !important;
  width: 100% !important;
}

/* المقدمة المستلمة */
.car-form-card .app-input-wrapper:has(#amount-paid) {
  height: 42px !important;
  width: 100% !important;
}

/* المتبقي */
.car-form-card .app-input-wrapper:has(#amount-remaining) {
  height: 42px !important;
  width: 100% !important;
}

/* موعد التسليم / تاريخ القسط الأول */
.car-form-card .app-input-wrapper:has(#first-payment-date) {
  height: 42px !important;
  width: 100% !important;
}

/* الأشهر (عدد الأقساط) */
.car-form-card .app-input-wrapper:has(#installment-months) {
  height: 42px !important;
  width: 100% !important;
}

.partner-form-panel {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 20px;
}

/* تنسيق حقول الإدخال عند الخطأ */
.input--error {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
}

/* عناوين المجموعات داخل النموذج */
.car-form-group-title {
  text-align: center;
  background: var(--red);
  font-size: var(--car-fs-title);
  font-weight: var(--car-fw-bold);
  color: #fff !important;
  margin: -12px -12px 12px -12px;
  padding: 10px 12px;
  border-radius: var(--all-radius) var(--all-radius) 0 0;
}

/* تخصيص أزرار أنواع الدفع */
.payment-type-btn {
  flex: 1;
  padding: 10px;
  border-radius: 10px;
  font-weight: var(--car-fw-bold);
  font-size: var(--font-size) !important;
  transition: all 0.2s;
  background: var(--car-bg-inactive);
  color: rgba(255, 255, 255, 0.4);
}

.payment-type-btn--active {
  color: #fff !important;
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.payment-type-btn--green.payment-type-btn--active { background: var(--car-btn-cash) !important; }
.payment-type-btn--purple.payment-type-btn--active { background: var(--account-mostathmir) !important; }
.payment-type-btn--blue.payment-type-btn--active { background: var(--account-mumawil) !important; }
.payment-type-btn--orange.payment-type-btn--active { background: var(--account-sharika) !important; }

.payment-type-btn--purple:hover:not(.payment-type-btn--active) { background: color-mix(in srgb, var(--account-mostathmir) 20%, transparent) !important; }
.payment-type-btn--blue:hover:not(.payment-type-btn--active) { background: color-mix(in srgb, var(--account-mumawil) 20%, transparent) !important; }
.payment-type-btn--orange:hover:not(.payment-type-btn--active) { background: color-mix(in srgb, var(--account-sharika) 20%, transparent) !important; }
/* #endregion */

/* #region 6. نافذة البحث (Search Popup) */
.cars-search-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 80px;
  animation: cars-fade-in 0.25s ease-out;
}

@keyframes cars-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.cars-search-popup {
  width: 650px;
  max-width: 90vw;
  background: #14161e;
  border: 1px solid var(--car-border);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 30px 60px rgba(0,0,0,0.5);
  animation: cars-slide-up 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes cars-slide-up {
  from { transform: translateY(20px) scale(0.95); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

.cars-search-popup__input {
  width: 100%;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: none;
  outline: none;
  color: #fff;
  font-size: 1.3rem;
}

.cars-search-popup__item--active {
  background: var(--car-row-hover);
}

.cars-search-popup__mark {
  background: var(--car-accent);
  color: #000;
  border-radius: 2px;
  padding: 0 2px;
}
/* #endregion */

/* #region 7. التوافقية (Responsive) */
@media (max-width: 1024px) {
  .cars-page .data-table th:nth-child(6),
  .cars-page .data-table td:nth-child(6) {
    display: none; /* إخفاء الشاصي في الشاشات الصغيرة */
  }
}
/* #endregion */

```

---

## File: `src/styles/transactions.css`

```css
/* ==========================================================================
   📜 ملف أنماط سجل المعاملات (Transactions Log Stylesheet)
   ==========================================================================
   يحتوي هذا الملف على جميع الخصائص والمتغيرات الخاصة بتبويب سجل المعاملات.
   يمكنك تعديل أي قيمة من المتغيرات أدناه لتغيير المظهر والخطوط والألوان فوراً.
   ========================================================================== */

.dashboard {
  /* ─── ⚙️ متغيرات سجل المعاملات (Transactions CSS Variables) ─── */

  /* حجم خط العناوين وتفاصيل المعاملات في جدول سجل المعاملات */
  --tx-font-size: var(--fs-sm);

  /* سمات وتنسيقات شارات مصادر الحركات المالية (Source Badges) */
  /* شارة القاصة */
  --tx-source-qasa-bg: rgba(216, 168, 90, 0.18);
  --tx-source-qasa-color: #d8a85a;
  --tx-source-qasa-border: 1px solid rgba(216, 168, 90, 0.25);

  /* شارة الماستر */
  --tx-source-master-bg: rgba(216, 168, 90, 0.18);
  --tx-source-master-color: #d8a85a;
  --tx-source-master-border: 1px solid rgba(216, 168, 90, 0.25);

  /* شارة المصرف */
  --tx-source-bank-bg: rgba(34, 197, 94, 0.18);
  --tx-source-bank-color: #86efac;
  --tx-source-bank-border: 1px solid rgba(34, 197, 94, 0.25);

  /* شارة المصادر الأخرى المجهولة */
  --tx-source-default-bg: rgba(255, 255, 255, 0.08);
  --tx-source-default-color: #aaa;
  --tx-source-default-border: 1px solid rgba(255, 255, 255, 0.1);

  /* ألوان المبالغ حسب العملة ونوع العملية */
  --tx-amount-usd-background: var(--red);
  --tx-amount-iqd-pos-color: #d8a85a;
  --tx-amount-iqd-neg-color: #f43f5e;
}

/* ─── 📊 تنسيقات سجل المعاملات (Transactions Table Customizations) ─── */

/* حجم الخط ومحاذاة الخلايا في جدول سجل المعاملات */
.data-table th, 
.data-table td {
  font-size: var(--tx-font-size) !important;
}

/* فئات شارات مصادر الحركة المالية */
.tx-badge {
  padding: 0.15rem 0.6rem;
  border-radius: 6px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  display: inline-block;
  white-space: nowrap;
}

.tx-badge-qasa {
  background: var(--tx-source-qasa-bg) !important;
  color: var(--tx-source-qasa-color) !important;
  border: var(--tx-source-qasa-border) !important;
}

.tx-badge-master {
  background: var(--tx-source-master-bg) !important;
  color: var(--tx-source-master-color) !important;
  border: var(--tx-source-master-border) !important;
}

.tx-badge-bank {
  background: var(--tx-source-bank-bg) !important;
  color: var(--tx-source-bank-color) !important;
  border: var(--tx-source-bank-border) !important;
}

.tx-badge-default {
  background: var(--tx-source-default-bg) !important;
  color: var(--tx-source-default-color) !important;
  border: var(--tx-source-default-border) !important;
}

/* ألوان المبالغ في جدول سجل المعاملات */
.tx-amount-usd {
  color: var(--tx-amount-usd-color) !important;
}

.tx-amount-iqd-pos {
  color: var(--tx-amount-iqd-pos-color) !important;
}

.tx-amount-iqd-neg {
  color: var(--tx-amount-iqd-neg-color) !important;
}

```

---

## File: `src/styles/dashboard.css`

```css
/* ==========================================================================
   📊 ملف أنماط لوحة التحكم (Dashboard Stylesheet)
   ==========================================================================
   يحتوي هذا الملف على جميع الخصائص والمتغيرات الخاصة بتبويب لوحة التحكم.
   يمكنك تعديل أي قيمة من المتغيرات أدناه لتغيير المظهر فوراً.
   ========================================================================== */

.dashboard {
  /* ─── ⚙️ متغيرات لوحة التحكم (Dashboard CSS Variables) ─── */
  
  /* مسافة التباعد بين كروت الإحصائيات والأقسام */
  --dashboard-gap: 1.3rem;

  /* لون رصيد القاصة بالدينار العراقي (ذهبي) */
  --qasa-gold-color: #ff40ff;

  /* لون رصيد الماستر كارد (بنفسجي مائل للذهبي) */
  --master-card-color: #8b5cf6;

  /* لون أرباح الشهر (أخضر) */
  --profit-color: var(--gold);

  /* لون خسارة الشهر (أحمر) */
  --loss-color: var(--red);

  /* لون مخزون المعرض (سماوي) */
  --inventory-color: #06b6d4;

  /* حجم خط الأرقام والمبالغ الكبيرة في الكروت */
  --stat-value-font-size: var(--fs-xl);
}

/* ─── 📐 تنسيق هيكل لوحة التحكم ─── */

/* كروت الإحصائيات (Stat Cards) */
.dashboard .stat-card,
.dashboard .quick-btn,
.dashboard .dashboard-panel {
  background: var(--backkground-secondary) !important;
  border: var(--hidod) !important;
  border-radius: var(--all-radius) !important;
  padding: 1.25rem !important;
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
}

/* كروت الإجراءات السريعة (Quick Actions Box) */
.dashboard .quick-actions-panel {
  background: var(--backkground-secondary) !important;
  border: var(--hidod) !important;
  border-radius: var(--all-radius) !important;
  padding: 1.1rem !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
}

/* قوائم التمرير السفلية (Scroll Lists) */
.dashboard .dashboard-scroll-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 0.55rem !important;
  flex: 1 !important;
  overflow-y: auto !important;
  min-height: 0 !important;
}
```

---

## File: `src/styles/colors.css`

```css
:root {

  /* MASTER COLORS */

  --red: #680000;
  --gold: #d7a800;
  --gray: #7a7a7a;
  --black: #0e0e0e;
  --white: #ffffff;

  --backkground: linear-gradient(rgba(0, 0, 0, 0.458)), url("/bg.jpg") center center / cover no-repeat;
  --backkground-secondary: rgba(148, 148, 148, 0.313);
  --backkground-secondary-blur: 40px;
  --backkground-secondary-saturate: 60%;
  --text-input: rgba(48, 48, 48, 0);
  --hidod: 1px solid rgba(255, 255, 255, 0.302);
  --jadawil-hidod: 1px solid rgba(255, 255, 255, 0.077);
  --all-radius: 10px;
  --font-color: #ffffff;    /* لون النص داخل المربعات */
  --font-size: 1.3rem;        /* حجم النص داخل المربعات */
  --font-lable-color: #ffffff8e;    /* لون نص التسميات (الليبل) */

  --card-one-bg: #643e3e5a;
  --card-two-bg: #4d000a;
  --smiles: #ffffff;
  --smiles-bg: #ffffff25;
  --usd-text-color: #00ff73; /* Same as smiles green for consistency */
  --iq-text-color: #d8a85a; /* Traditional gold for IQD */

  /* SEMANTIC TOKENS */

  --bg-primary: var(--backkground);
  --bg-secondary: var(--gray);

  --text-primary: var(--gold);
  --text-secondary: var(--gray);

  --border-color: var(--gray);

  --button-primary-bg: var(--red);
  --button-primary-text: var(--gold);

  --button-secondary-bg: var(--gray);
  --button-secondary-text: var(--gold);

  --card-bg: var(--black);

  --table-header-bg: var(--red);
  --table-header-text: var(--gold);

  --header-bg: var(--black);

  --hover-color: var(--gold);
  --active-color: var(--red);
}
```

---

## File: `src/styles/App.css`

```css
@import "./colors.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ============================================================
   فجر الوادي — Premium Glassmorphism Design System
   ============================================================ */

:root {
  /* ============================================================
     🎨 أدوات التحكم المركزية (الخطوط، الأحجام، الارتفاعات)
     ============================================================ */

  /* ═══════════════════════════════════════════════════════
     🖋 المِقْياس الرئيسي للخط — غيّر --font-family
     ═══════════════════════════════════════════════════════ */
  --font-family: "Tajawal";
  /* ⬅ غيّر هذه القيمة = يتغير نوع خط كل النصوص (عناوين، أزرار، خلايا، مدخلات، ...) */

  --font-mono: "Tajawal";
  /* ⬅ للأرقام والمبالغ المالية فقط */

  /* ═══════════════════════════════════════════════════════
     🏋 أوزان الخطوط — غيّر --fw-bold وسيتغير كل الخط العريض
     ═══════════════════════════════════════════════════════ */
  --fw-normal: 400;
  --fw-medium: 600;
  --fw-bold: 700;
  --fw-extrabold: 800;
  --fw-black: 900;

  /* ── العناوين والخطوط ── */
  --title-font-family: var(--font-family);
  --title-color: var(--navy);
  --title-color-primary: var(--text-primary);

  /* ═══════════════════════════════════════════════════════
     🎛 المِقْياس الرئيسي — غيّر --font-size في colors.css وسيتغير كل شيء
     ═══════════════════════════════════════════════════════ */
  /* القيمة تأتي من --font-size في colors.css */

  /* استثناءات — متغيرات مستقلة */
  --fs-title: var(--font-size);
  /* ⬅ عنوان "البرنامج الحسابي لشركة فجر الوادي" فقط */
  --fs-sidebar: var(--font-size);
  /* ⬅ القائمة الجانبية فقط */

  --fs-brand-title: clamp(var(--fs-lg), 2.4vw, var(--fs-xxl));
  --fs-brand-subtitle: var(--fs-sm);
  --fs-page-title: var(--fs-xl);
  --fs-panel-title: var(--fs-md);
  --fs-card-title: var(--fs-md);
  --fs-modal-title: var(--fs-lg);
  --fs-section-title: var(--fs-xs);

  /* ── حقول الإدخال والبحث والقوائم المنسدلة ── */
  --input-font-family: var(--font-family);
  --input-text-color: var(--text-primary);
  --input-bg: var(--text-input);
  --input-border-color: var(--hidod);
  --base-radius: var(--all-radius);
  /* 🔮 المتغير العام للتحكم في جميع الانحناءات (انحناء الزوايا، البطاقات، الأزرار، والمدخلات) */
  --input-border-radius: var(--base-radius);

  --input-height: 42px;
  /* الارتفاع العام الموحد لجميع مربعات وحقول البرنامج (نص، رقم، تاريخ، قائمة منسدلة) */
  --input-font-size: var(--fs-base);
  /* حجم الخط العام الموحد لجميع مربعات وحقول البرنامج — يتبع --fs-base */

  /* ── الحقول التي كانت صغيرة سابقاً (مثل نوع السيارة) تم توحيدها لتتبع الحجم العام أعلاه تلقائياً ── */
  --input-height-sm: var(--input-height);
  /* ارتفاع الحقول الصغيرة سابقاً - أصبح متطابقاً مع الحجم العام */
  --input-font-size-sm: var(--input-font-size);
  /* حجم خط الحقول الصغيرة سابقاً - أصبح متطابقاً مع الحجم العام */

  /* ── المسميات (العناوين) التي فوق الحقول ── */
  --label-font-size: var(--fs-sm);
  /* حجم خط المسميات التي فوق حقول الإدخال */
  --label-color: var(--text-muted);
  /* لون المسميات التي فوق حقول الإدخال */
  --label-font-weight: var(--fw-bold);
  /* سمك خط المسميات التي فوق حقول الإدخال */

  /* ── Radius ── */
  --r-xs: var(--base-radius);
  --r-sm: calc(var(--base-radius) * 1.5);
  --r-md: calc(var(--base-radius) * 2);
  --r-lg: calc(var(--base-radius) * 2.333);

  /* ── مقياس الأحجام — يتبع --font-size تلقائياً ── */
  --fs-xs: calc(var(--font-size) * 0.78);
  --fs-sm: calc(var(--font-size) * 0.88);
  --fs-base: var(--font-size);
  --fs-md: calc(var(--font-size) * 1.1);
  --fs-lg: calc(var(--font-size) * 1.29);
  --fs-xl: calc(var(--font-size) * 1.57);
  --fs-xxl: calc(var(--font-size) * 2.1);

  /* ════════════════════════════════════════════════════════════
     🚗  أحجام خطوط نظام السيارات
     ════════════════════════════════════════════════════════════ */
  --car-fs-title: var(--font-size);
  /* حجم عنوان القسم — مثلاً "📋 مواصفات المركبة" */
  --car-fs-label: var(--label-font-size);
  /* حجم تسمية الحقل — مثلاً "نوع السيارة" */
  --car-fs-body: var(--font-size);
  /* حجم النص العادي — مثل وصف المصروف */
  --car-fs-button: var(--font-size);
  /* حجم نص الأزرار */
  --car-fs-price: var(--font-size);
  /* حجم سعر المصروف في القائمة (13px) */
}

/* ============================================================
   🔗 فئات التحكم الموحدة بالمدخلات (Inputs)
   ============================================================ */
.app-input-wrapper {
  height: var(--input-height) !important;
  min-height: var(--input-height) !important;
  background-color: var(--input-bg) !important;
  border: var(--input-border-color) !important;
  border-radius: var(--input-border-radius) !important;
  box-sizing: border-box !important;
}

.app-input-wrapper-sm {
  height: var(--input-height-sm) !important;
  min-height: var(--input-height-sm) !important;
  background-color: var(--input-bg) !important;
  border: var(--input-border-color) !important;
  border-radius: var(--input-border-radius) !important;
  box-sizing: border-box !important;
}

.app-input-field {
  font-size: var(--input-font-size) !important;
  font-family: var(--input-font-family) !important;
  color: var(--input-text-color) !important;
}

.app-input-field-sm {
  font-size: var(--input-font-size-sm) !important;
  font-family: var(--input-font-family) !important;
  color: var(--input-text-color) !important;
}

/* ── Sidebar Nav ── */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

/* ── Sidebar Quick Actions ── */
.sidebar-quick-actions {
  margin-top: auto;
  padding: 20px 0 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center; /* تجميع الأزرار في المنتصف */
  gap: 12px;
}

.sidebar-action-btn {
  height: 44px !important;
  font-size: 0.95rem !important;
  width: 180px !important; /* عرض ثابت لضمان التوسط والجمالية */
  justify-content: center !important;
}

/* ── Reset ── */
*,
*::before,
*::after {
  box-sizing: border-box;
}

*:not(input):not(textarea):not(select) {
  -webkit-user-select: none;
  user-select: none;
}

html,
body,
#root {
  margin: 0;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

body {
  position: relative;
  font-family: var(--font-family);
  color: var(--text-primary);
  direction: rtl;
  -webkit-font-smoothing: antialiased;
  font-size: var(--fs-base);
  /* ← خط أكبر قليلاً */
  line-height: 1.65;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--backkground-img) center center / cover no-repeat fixed;
  filter: brightness(var(--backkground-brightness)) contrast(var(--backkground-contrast)) saturate(var(--backkground-saturate)) hue-rotate(var(--backkground-hue));
}

/* ── Numbers always LTR ── */
.num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  direction: ltr;
  unicode-bidi: embed;
}

/* ============================================================
   APP SHELL
   ============================================================ */
.app {
  position: relative;
  height: 100%;
  overflow: hidden;
  padding: 18px 22px 22px;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr auto;
  gap: 18px;
}

/* ── Page background ── */
.app-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(120% 120% at 0% 0%, rgba(134, 239, 172, 0.18) 0%, transparent 32%),
    radial-gradient(110% 110% at 100% 0%, rgba(56, 189, 248, 0.10) 0%, transparent 30%),
    linear-gradient(145deg, var(--bg-gradient-start) 0%, var(--bg-gradient-mid) 45%, var(--bg-gradient-end) 100%);
}

.app-bg__mesh {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(ellipse at 10% 10%, rgba(134, 239, 172, 0.12) 0%, transparent 52%),
    radial-gradient(ellipse at 90% 8%, rgba(250, 204, 21, 0.10) 0%, transparent 48%),
    radial-gradient(ellipse at 50% 90%, rgba(255, 255, 255, 0.10) 0%, transparent 55%);
}

.app-bg__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
}

.app-bg__orb--1 {
  width: 560px;
  height: 560px;
  top: -180px;
  right: -80px;
  background: var(--bg-orb-1);
  opacity: .55;
}

.app-bg__orb--2 {
  width: 420px;
  height: 420px;
  bottom: -80px;
  left: -80px;
  background: var(--bg-orb-2);
  opacity: .55;
}

.app-bg__orb--3 {
  width: 320px;
  height: 320px;
  top: 38%;
  left: 40%;
  background: var(--bg-orb-3);
  opacity: .60;
}

.app-bg__reflection {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: var(--red);
}

.app-main {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  animation: fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============================================================
   BRAND LOGO
   ============================================================ */
.brand-logo-img {
  display: block;
  object-fit: contain;
  flex-shrink: 0;
  transition: filter .4s ease, transform .35s ease;
}

/* Outline SVG logo — glow built into SVG */
.brand-logo-outline {
  filter: none;
}

.brand-logo-outline:hover {
  transform: scale(1.04);
  filter: brightness(1.15);
}

.brand-logo-img--sm {
  height: 50px;
  max-width: 135px;
}

.brand-logo-img--md {
  height: 66px;
  max-width: 175px;
}

.brand-logo-img--lg {
  height: 98px;
  max-width: 250px;
}

/* ============================================================
   HEADER
   ============================================================ */
.app-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-header {
  position: relative;
  border-radius: var(--r-lg);
  border: 1px solid rgba(255, 255, 255, 0.88);
  background: var(--red);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--shadow-lg), 0 0 0 1px rgba(26, 58, 92, 0.04);
  overflow: hidden;
}

/* خط ذهبي علوي */
.app-header::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--red);
}

.header-glow {
  position: absolute;
  top: -30%;
  right: -5%;
  width: 45%;
  height: 130%;
  background: radial-gradient(circle, rgba(201, 168, 76, 0.07) 0%, transparent 65%);
  pointer-events: none;
}

.header-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  padding: 20px 28px;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 1;
  min-width: 240px;
}

.header-brand__text {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.header-brand__badge {
  display: inline-flex;
  align-self: flex-start;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  color: var(--gold);
  background: var(--gold-pale);
  border: 1px solid rgba(201, 168, 76, 0.30);
  padding: 2px 11px;
  border-radius: 999px;
  letter-spacing: .03em;
}

.brand-title {
  margin: 0;
  font-size: var(--fs-brand-title);
  font-family: var(--title-font-family);
  font-weight: var(--fw-black);
  line-height: 1.2;
  background: var(--red);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-subtitle {
  margin: 0;
  font-size: var(--fs-brand-subtitle);
  font-family: var(--title-font-family);
  color: var(--text-muted);
  font-weight: var(--fw-medium);
}

/* ── Nav ── */
.header-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px;
  background: rgba(255, 255, 255, 0.68);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.90);
}

/* ============================================================
   PAGE INTRO
   ============================================================ */
.page-intro {
  margin-bottom: 22px;
}

.page-intro__title {
  margin: 0 0 5px;
  font-size: var(--fs-page-title);
  font-family: var(--title-font-family);
  font-weight: var(--fw-extrabold);
  color: var(--title-color-primary);
}

.page-intro__desc {
  margin: 0;
  font-size: var(--fs-base);
  color: var(--text-muted);
}

/* ============================================================
   STAT CARDS
   ============================================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
  gap: 15px;
}

.stat-card {
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: var(--r-lg);
  padding: 22px 18px;
  text-align: center;
  box-shadow: var(--shadow-md);
  transition: transform .25s ease, box-shadow .25s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.stat-card--sky {
  border-top: 3px solid #3b82f6;
}

.stat-card--green {
  border-top: 3px solid #10b981;
}

.stat-card--amber {
  border-top: 3px solid #f59e0b;
}

.stat-card--red {
  border-top: 3px solid #ef4444;
}

.stat-card--muted {
  border-top: 3px solid #94a3b8;
}

.stat-card__icon {
  font-size: var(--fs-xxl);
  margin-bottom: 10px;
  line-height: 1;
}

.stat-label {
  margin: 0 0 9px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  font-weight: var(--fw-bold);
}

.stat-value {
  margin: 0;
  font-size: var(--fs-xl);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.stat-value--sky {
  color: #1d4ed8;
}

.stat-value--green {
  color: #059669;
}

.stat-value--amber {
  color: #d97706;
}

.stat-value--red {
  color: #dc2626;
}

.stat-value--muted {
  color: #64748b;
}

/* ============================================================
   DASHBOARD PANEL
   ============================================================ */
.panel-card {
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: var(--r-lg);
  padding: 26px;
  box-shadow: var(--shadow-md);
}

.dashboard-panel {
  margin-top: 18px;
}

.panel-title {
  margin: 0 0 14px;
  font-size: var(--fs-panel-title);
  font-family: var(--title-font-family);
  font-weight: var(--fw-extrabold);
  color: var(--title-color);
}

.panel-text {
  margin: 0 0 20px;
  line-height: 1.85;
  color: var(--text-secondary);
  font-size: var(--fs-base);
}

.inline-code {
  background: rgba(26, 58, 92, 0.06);
  padding: 2px 8px;
  border-radius: var(--r-xs);
  font-size: var(--fs-sm);
  color: var(--navy);
  border: 1px solid rgba(26, 58, 92, 0.12);
  direction: ltr;
  unicode-bidi: embed;
}

/* ── Financial Summary — 3 cards side by side ── */
.financial-summary {
  /* wrapper only */
}

.fin-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.fin-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 7px;
  padding: 20px 16px 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  transition: box-shadow .2s, transform .2s;
}

.fin-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.fin-card--capital {
  background: var(--red);
  border-color: rgba(201, 168, 76, 0.38);
  border-top: 3px solid var(--gold);
}

.fin-card__icon {
  font-size: var(--fs-xl);
  line-height: 1;
}

.fin-card__label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  color: var(--text-muted);
  line-height: 1.35;
}

.fin-card__value {
  font-weight: var(--fw-extrabold);
  font-size: var(--fs-base);
  direction: ltr;
  unicode-bidi: embed;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.fin-card__value--lg {
  font-size: var(--fs-md);
}

/* إجمالي السجلات — عميل: 1 · سيارة: 2 */
.fin-card__records {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  direction: rtl;
}

.fin-record-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: var(--fs-base);
}

.fin-record-line__lbl {
  font-weight: var(--fw-bold);
  color: var(--text-secondary);
}

.fin-record-line__sep {
  color: var(--text-muted);
  font-weight: var(--fw-normal);
}

.fin-record-line__num {
  font-family: var(--font-mono);
  font-weight: var(--fw-extrabold);
  font-size: var(--fs-base);
  color: var(--navy);
  direction: ltr;
  unicode-bidi: embed;
}

@media (max-width: 640px) {
  .fin-cards {
    grid-template-columns: 1fr;
  }
}

/* ============================================================
   LAYOUT CARDS (side + main)
   ============================================================ */
.content-layout {
  display: flex;
  gap: 22px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.side-card,
.main-card {
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-md);
}

.side-card {
  flex: 1 1 320px;
  max-width: 100%;
  padding: 24px;
}

.main-card {
  flex: 3 1 560px;
  min-width: 0;
  padding: 24px;
}

.card-header {
  margin: 0 0 20px;
  font-size: var(--fs-card-title);
  font-family: var(--title-font-family);
  font-weight: var(--fw-extrabold);
  color: var(--title-color);
  border-bottom: 2px solid var(--border);
  padding-bottom: 12px;
}

.card-header--inline {
  margin: 0;
  border: none;
  padding: 0;
}

.card-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--border);
}

.toolbar-controls {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
}


/* ============================================================
   FORMS
   ============================================================ */
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.form-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

/* ============================================================
   LABEL
   ============================================================ */
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.form-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

/* سويج الحالة (متوفرة/مبيوعة) */
.toggle-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}

.toggle-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: relative;
  width: 52px;
  height: 28px;
  background: var(--green, #16a34a);
  border-radius: 28px;
  transition: background 0.25s;
  flex-shrink: 0;
}

.toggle-slider::before {
  content: "";
  position: absolute;
  width: 22px;
  height: 22px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.25s;
}

.toggle-switch input:checked+.toggle-slider {
  background: var(--red-600, #dc2626);
}

.toggle-switch input:checked+.toggle-slider::before {
  transform: translateX(24px);
}

.toggle-label {
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  color: var(--text-primary);
}

.label,
.cf-label,
.app-input-label {
  font-size: var(--label-font-size) !important;
  color: var(--label-color) !important;
  font-weight: var(--label-font-weight) !important;
  font-family: var(--input-font-family) !important;
}

.input,
.select {
  height: var(--input-height);
  padding: 0 14px;
}

.textarea {
  min-height: 88px;
  resize: vertical;
  padding: 11px 14px;
}

.input,
.select,
.textarea,
.combo-input {
  background: var(--input-bg);
  border: var(--input-border-color);
  border-radius: var(--input-border-radius);
  color: var(--input-text-color);
  font-size: var(--input-font-size);
  font-family: var(--input-font-family);
  outline: none;
  transition: border-color .2s, box-shadow .2s;
  width: 100%;
  box-sizing: border-box;
}

.select {
  background: var(--text-input);
  position: relative;
  z-index: 0;
}
.select::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--backkground-secondary);
  border-radius: inherit;
}

.input:disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}

.input--search {
  min-width: 215px;
  max-width: 295px;
}

.select--compact {
  width: auto;
  min-width: 130px;
}

.textarea {
  min-height: 88px;
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── 📊 الجداول والخطوط تم نقلها إلى ملف منفصل tables.css ── */

.cell-bold {
  font-weight: var(--fw-extrabold);
  color: var(--text-primary) !important;
}

.cell-num {
  direction: ltr;
  unicode-bidi: embed;
  text-align: left !important;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cell-sub {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-top: 2px;
  direction: ltr;
  unicode-bidi: embed;
}

.cell-profit {
  display: block;
  font-size: var(--fs-xs);
  margin-top: 2px;
}

.th-num {
  text-align: left !important;
  direction: ltr;
}

.empty-cell {
  text-align: center !important;
  padding: 48px !important;
  color: var(--text-muted) !important;
  font-size: var(--fs-base);
}

/* ── Selected row ── */
.cars-table-row--selected {
  background: rgba(26, 58, 92, 0.055) !important;
  outline: 2px solid var(--navy);
  outline-offset: -2px;
}

.cars-table-row--selected td {
  color: var(--text-primary) !important;
}

/* ============================================================
   BADGES
   ============================================================ */
.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--r-xs);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  border: 1px solid transparent;
}

.badge--available {
  background: var(--green-bg);
  color: var(--green);
  border-color: var(--green-bd);
}

.badge--sold {
  color: var(--red);
}

.badge--cash {
  background: var(--blue-bg);
  color: var(--blue);
  border-color: var(--blue-bd);
}

.badge--installment {
  background: var(--amber-bg);
  color: var(--amber);
  border-color: var(--amber-bd);
}

.badge--primary {
  background: var(--green-bg);
  color: var(--green);
  border-color: var(--green-bd);
}

.badge--info {
  background: var(--blue-bg);
  color: var(--blue);
  border-color: var(--blue-bd);
}

/* ============================================================
   UTILITIES
   ============================================================ */
.text-green {
  color: var(--green) !important;
}

.text-red {
  color: var(--red) !important;
}

.text-muted {
  color: var(--text-muted) !important;
}

/* ============================================================
   LOADING
   ============================================================ */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 100px 24px;
  color: var(--text-muted);
}

.loading-state .brand-logo-img--lg {
  animation: pulse-logo 2.5s ease-in-out infinite;
}

@keyframes pulse-logo {

  0%,
  100% {
    filter: drop-shadow(0 4px 14px rgba(15, 31, 51, 0.12));
    transform: scale(1);
  }

  50% {
    filter: drop-shadow(0 8px 28px rgba(201, 168, 76, 0.30));
    transform: scale(1.03);
  }
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.spinner {
  width: 42px;
  height: 42px;
  border: 3px solid rgba(26, 58, 92, 0.12);
  border-top-color: var(--navy);
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================
   ELASTIC SIDE SLIDE ANIMATION
   ============================================================ */
@keyframes sideElasticReveal {
  0% {
    transform: translateX(100%) scale(0.9) skewX(-10deg);
    opacity: 0;
    filter: blur(15px);
  }

  60% {
    transform: translateX(-5%) scale(1.02) skewX(2deg);
    opacity: 0.9;
    filter: blur(2px);
  }

  85% {
    transform: translateX(2%) scale(0.99) skewX(-1deg);
  }

  100% {
    transform: translateX(0) scale(1) skewX(0);
    opacity: 1;
    filter: blur(0px);
  }
}

@keyframes sideElasticExit {
  0% {
    transform: translateX(0) scale(1) skewX(0);
    opacity: 1;
    filter: blur(0px);
  }

  15% {
    transform: translateX(-2%) scale(0.99) skewX(1deg);
  }

  40% {
    transform: translateX(5%) scale(1.02) skewX(-2deg);
    opacity: 0.9;
    filter: blur(2px);
  }

  100% {
    transform: translateX(-100%) scale(0.9) skewX(10deg);
    opacity: 0;
    filter: blur(15px);
  }
}

/* ============================================================
   ALERT
   ============================================================ */
.alert {
  padding: 14px 18px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  font-size: var(--fs-base);
}

.alert--error {
  background: var(--red-bg);
  border: 1px solid var(--red-bd);
  color: #991b1b;
}

.alert-retry {
  background: transparent;
  border: 1px solid currentColor;
  color: inherit;
  padding: 7px 16px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-weight: var(--fw-bold);
}

/* ============================================================
   FOOTER
   ============================================================ */
.app-footer {
  grid-column: 1 / -1;
  margin-top: auto;
  padding: 10px 24px;
  border-radius: var(--r-lg);
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: var(--red);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.07);
  flex-wrap: wrap;
}

/* --- Brand side (left) --- */
.footer-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
  margin-right: auto;
}

.footer-brand__dot {
  font-size: var(--fs-xs);
  color: var(--smiles);
  animation: footer-dot-pulse 3s ease-in-out infinite;
}

@keyframes footer-dot-pulse {

  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.footer-brand__text {
  font-size: var(--fs-xs);
  font-weight: var(--fw-extrabold);
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
  text-transform: uppercase;
  direction: ltr;
}

.footer-brand__year {
  font-size: var(--fs-xs);
  font-weight: var(--fw-black);
  color: rgba(212, 175, 55, 0.85);
  background: rgba(212, 175, 55, 0.1);
  border: 1px solid rgba(212, 175, 55, 0.25);
  padding: 1px 8px;
  border-radius: 20px;
  letter-spacing: 0.05em;
  direction: ltr;
}

/* --- Developer side (right) --- */
.footer-dev {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.footer-dev__label {
  font-size: var(--fs-xs);
  color: rgba(255, 255, 255, 0.55);
  font-weight: var(--fw-medium);
}

.footer-dev__name {
  font-size: var(--fs-xs);
  font-weight: var(--fw-extrabold);
  color: rgba(255, 255, 255, 0.75);
  letter-spacing: 0.02em;
}

.footer-dev__phone {
  font-size: var(--fs-xs);
  font-weight: var(--fw-black);
  color: #f0d060;
  background: rgba(212, 175, 55, 0.12);
  border: 1px solid rgba(212, 175, 55, 0.3);
  padding: 2px 12px;
  border-radius: 20px;
  text-decoration: none;
  direction: ltr;
  letter-spacing: 0.05em;
  transition: all 0.2s ease;
  box-shadow: 0 0 12px rgba(212, 175, 55, 0.1);
}

.footer-dev__phone:hover {
  background: rgba(212, 175, 55, 0.22);
  border-color: rgba(212, 175, 55, 0.6);
  box-shadow: 0 0 20px rgba(212, 175, 55, 0.25);
  color: #ffe87a;
}

/* ============================================================
   CARS PAGE
   ============================================================ */
.cars-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.cars-page__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 18px;
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.88);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
}

.cars-page__toolbar-right,
.cars-page__toolbar-left {
  flex: 1;
}

.cars-page__toolbar-right {
  display: flex;
  justify-content: flex-start;
}

.cars-page__toolbar-left {
  display: flex;
  justify-content: flex-end;
}

.cars-page__toolbar-center {
  flex: 2;
  display: flex;
  justify-content: center;
}

@media (max-width: 600px) {
  .cars-page__toolbar {
    flex-direction: column;
    gap: 12px;
  }

  .cars-page__toolbar-right,
  .cars-page__toolbar-center,
  .cars-page__toolbar-left {
    flex: none;
    width: 100%;
    justify-content: center;
  }

  .cars-page__toolbar-left {
    display: none;
  }
}

.cars-page__toolbar-start {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.cars-page__title {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: var(--fw-extrabold);
  color: var(--text-primary);
}

.cars-page__count {
  font-size: var(--fs-base);
  color: var(--text-muted);
  background: var(--bg-subtle);
  padding: 3px 13px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-weight: var(--fw-bold);
}

/* ── Cars layout: table left, form right ── */
.cars-layout {
  display: grid;
  grid-template-columns: 1fr minmax(340px, 440px);
  gap: 22px;
  align-items: start;
}

.cars-list-panel {
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.88);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.cars-list-panel .table-wrapper {
  overflow-x: hidden;
}

.cars-empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
  font-size: var(--fs-base);
}

/* ── Detail panel ── */
.cars-detail-panel {
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.88);
  border-radius: var(--r-lg);
  min-height: 440px;
  box-shadow: var(--shadow-md);
  position: sticky;
  top: 22px;
}

.cars-detail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 64px 32px;
  gap: 14px;
  min-height: 440px;
}

.cars-detail-placeholder h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--fs-lg);
  font-weight: var(--fw-extrabold);
}

.cars-detail-placeholder p {
  margin: 0 0 14px;
  color: var(--text-muted);
  max-width: 320px;
  line-height: 1.7;
  font-size: var(--fs-base);
}

.placeholder-icon {
  font-size: var(--fs-xxl);
  opacity: 0.55;
}

/* ── Car form panel ── */
.car-form-panel {
  padding: 28px;
  position: relative;
}

/* ── Elegant Switch ── */
.elegant-switch {
  display: flex;
  align-items: center;
  gap: 6px;
}

.elegant-switch--vertical {
  flex-direction: column;
  gap: 6px;
}

.elegant-switch--horizontal {
  flex-direction: row;
  gap: 8px;
}

.elegant-switch__label-box {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  width: 100%;
}

.elegant-switch__label {
  position: absolute;
  font-size: var(--fs-md);
  font-weight: var(--fw-black);
  letter-spacing: .02em;
  white-space: nowrap;
}

.elegant-switch__side-label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  color: #94a3b8;
  transition: color .3s;
}

.elegant-switch__track {
  width: 90px;
  height: 44px;
  border-radius: 999px;
  padding: 4px;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid;
  transition: border-color .5s, box-shadow .5s;
  flex-shrink: 0;
}

.elegant-switch__track-bg {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  transition: background .5s;
}

.elegant-switch__knob {
  width: 36px;
  height: 36px;
  background: #fff;
  border-radius: 50%;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
  margin-inline-start: 0;
}

.elegant-switch--horizontal .elegant-switch__track {
  width: 64px;
  height: 32px;
  padding: 3px;
}

.elegant-switch--horizontal .elegant-switch__knob {
  width: 26px;
  height: 26px;
}

.elegant-switch--horizontal .elegant-switch__label {
  font-size: var(--fs-sm);
}

.elegant-switch--horizontal .elegant-switch__label-box {
  height: 24px;
}

.elegant-switch__track.elegant-switch__track--on .elegant-switch__knob {
  margin-inline-start: auto;
}

.elegant-switch__core {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.elegant-switch--horizontal .elegant-switch__core {
  width: 8px;
  height: 8px;
}

/* Compact ElegantSwitch for actions bar */
.car-form-panel__actions .elegant-switch,
.cf-footer__right .elegant-switch {
  gap: 0;
}

.car-form-panel__actions .elegant-switch__track,
.cf-footer__right .elegant-switch__track {
  width: 52px;
  height: 28px;
  padding: 2px;
}

.car-form-panel__actions .elegant-switch__knob,
.cf-footer__right .elegant-switch__knob {
  width: 24px;
  height: 24px;
}

.car-form-panel__actions .elegant-switch__core,
.cf-footer__right .elegant-switch__core {
  width: 7px;
  height: 7px;
}

/* Status label next to switch */

.car-form-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 24px;
  padding-bottom: 15px;
  border-bottom: 2px solid var(--border);
}

.car-form-panel__title {
  margin: 0;
  font-size: var(--fs-modal-title);
  font-family: var(--title-font-family);
  font-weight: var(--fw-extrabold);
  color: var(--title-color);
}

.car-form-panel__id {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  background: var(--bg-subtle);
  padding: 3px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  direction: ltr;
  unicode-bidi: embed;
}

.form-section {
  margin-bottom: 12px;
}

.form-section__title {
  margin: 0 0 13px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-extrabold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .05em;
}

.car-form-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
  padding-top: 20px;
  border-top: 2px solid var(--border);
}

/* ── Danger zone ── */
.car-form-panel__danger-zone {
  margin-top: 6px;
  padding: 6px 16px 10px;
  border-top: 1px solid rgba(192, 57, 43, 0.16);
  background: rgba(192, 57, 43, 0.03);
  border-radius: 0 0 var(--r-lg) var(--r-lg);
}

.danger-zone__hint {
  margin: 0 0 11px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

/* ── Payment sections ── */
.payment-section {
  background: var(--bg-subtle);
  padding: 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-light);
  margin-top: 6px;
}

.payment-info {
  margin-top: 13px;
  padding: 12px 14px;
  background: #fff;
  border-radius: var(--r-sm);
  border-right: 4px solid var(--navy);
  color: var(--text-primary);
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  direction: ltr;
  unicode-bidi: embed;
}

.installment-section {
  background: var(--bg-subtle);
  padding: 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-light);
  margin-top: 6px;
}

.payment-summary {
  padding: 12px 16px;
  background: var(--bg-subtle);
  border-radius: var(--r-sm);
  border: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-light);
  font-size: var(--fs-base);
}

.summary-item:last-child {
  border-bottom: none;
}

.summary-item.highlight {
  background: var(--red);
  padding: 14px;
  border-radius: var(--r-sm);
  margin-top: 8px;
  border: 1px solid rgba(30, 41, 59, 0.16);
}

.summary-item strong {
  color: var(--navy);
  font-size: var(--fs-base);
}

.summary-item.highlight strong {
  color: var(--navy-dark);
  font-size: var(--fs-md);
}

/* ============================================================
   MODAL
   ============================================================ */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 31, 51, 0.38);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-dialog {
  width: 100%;
  max-width: 430px;
  background:
    radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(34, 197, 94, 0.08), transparent 36%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.03)),
    rgba(13, 18, 16, 0.74) !important;
  border: 1px solid rgba(255, 255, 255, 0.13) !important;
  backdrop-filter: blur(24px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
  border-radius: var(--r-lg);
  padding: 26px;
  box-shadow:
    0 34px 120px rgba(0, 0, 0, 0.52),
    0 0 70px rgba(34, 197, 94, 0.10),
    inset 0 1px 1px rgba(255, 255, 255, 0.12) !important;
}

.modal-dialog__title {
  margin: 0 0 11px;
  font-size: var(--fs-modal-title);
  font-family: var(--title-font-family);
  font-weight: var(--fw-extrabold);
  color: var(--title-color-primary);
}

.modal-dialog__message {
  margin: 0 0 22px;
  line-height: 1.75;
  color: var(--text-secondary);
  font-size: var(--fs-base);
}

.modal-dialog__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ============================================================
   TOAST
   ============================================================ */
.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 14px 28px;
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  font-weight: var(--fw-bold);
  font-size: var(--fs-base);
  animation: toast-in .3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(14px);
  }

  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 1100px) {
  .cars-layout {
    grid-template-columns: 1fr;
  }

  .cars-detail-panel {
    position: static;
  }
}

@media (max-width: 768px) {
  .app {
    padding: 14px 16px 24px;
  }

  .header-inner {
    flex-direction: column;
    align-items: stretch;
    padding: 18px 20px;
  }

  .header-brand {
    flex-direction: column;
    text-align: center;
    min-width: unset;
  }

  .header-brand__badge {
    align-self: center;
  }

  .header-nav {
    justify-content: center;
  }

  .nav-btn {
    flex: 1;
    justify-content: center;
    min-width: 100px;
  }

  .input--search {
    max-width: 100%;
  }

  .brand-logo-img--lg {
    height: 74px;
    max-width: 185px;
  }

  .fin-cards {
    grid-template-columns: 1fr;
  }

  .car-form-panel__actions .btn--danger {
    margin-inline-start: 0;
    width: 100%;
  }
}

/* ============================================================
   TABLE COLUMN ALIGNMENT — explicit per-column classes
   كل عمود له محاذاة صريحة، th و td متطابقان تماماً
   ============================================================ */

/* ── أعمدة مشتركة ── */
.col-name {
  text-align: right !important;
}

.col-color {
  text-align: right !important;
}

.col-status {
  text-align: center !important;
}

.col-actions {
  text-align: center !important;
  white-space: nowrap;
}

/* ── رقم السيارة: LTR ── */
.col-carnum {
  text-align: right !important;
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── الهاتف: LTR ── */
.col-phone {
  text-align: left !important;
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.data-table th.col-phone {
  font-family: inherit;
}

/* ── الأسعار والأموال: LTR محاذاة يسار ── */
.col-price,
.col-money {
  text-align: left !important;
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.data-table th.col-price,
.data-table th.col-money {
  font-family: inherit;
}

.col-ratio {
  text-align: center !important;
  font-weight: var(--fw-bold);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.partners-data-table .col-name {
  width: 28%;
}

.partners-data-table .col-phone {
  width: 18%;
}

.partners-data-table .col-money {
  width: 20%;
}

.partners-data-table .col-ratio {
  width: 14%;
}

/* ── جدول ديون العملاء ── */
.partners-data-table--debtors .col-name {
  width: 18%;
}

.partners-data-table--debtors .col-phone {
  width: 14%;
}

.partners-data-table--debtors .col-money {
  width: 12%;
}

.col-due {
  text-align: center !important;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.col-delete {
  text-align: center !important;
  width: 90px;
}

/* ── إزالة القاعدة القديمة التي تسبب الزحف ── */
.data-table td:nth-child(3),
.data-table td:nth-child(4),
.data-table td:nth-child(5) {
  direction: unset;
  unicode-bidi: unset;
  text-align: unset;
  font-family: unset;
  font-variant-numeric: unset;
}

/* ── cell-sub داخل col-name يبقى LTR ── */
.col-name .cell-sub {
  direction: ltr;
  unicode-bidi: embed;
  text-align: left;
}

/* ── cell-profit داخل col-price ── */
.col-price .cell-profit {
  text-align: left;
  direction: ltr;
  unicode-bidi: embed;
}

/* ============================================================
   COMBOBOX / DATALIST & READONLY INPUT
   ============================================================ */

/* حقل الاسم الكامل — readonly، خلفية مميزة */
.input--auto {
  background: rgba(241, 245, 249, 0.90) !important;
  color: var(--navy) !important;
  font-weight: var(--fw-bold);
  cursor: default;
  border-color: rgba(203, 213, 225, 0.50) !important;
}

.input--auto:focus {
  box-shadow: none !important;
  border-color: rgba(203, 213, 225, 0.50) !important;
}

/* تلميح صغير بجانب التسمية */
.label-hint {
  font-size: var(--fs-xs);
  font-weight: var(--fw-normal);
  color: var(--text-muted);
  margin-right: 4px;
}

/* datalist — تحسين مظهر input المرتبط به */
input[list] {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23607d9a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: left 12px center;
  padding-left: 34px;
}

/* ============================================================
   CARS TABLE — أعمدة محددة بدقة
   ============================================================ */
.cars-data-table {
  table-layout: fixed;
  width: 100%;
  min-width: 100%;
}

/* ── عرض كل عمود ── */
.cars-data-table .ct-num {
  width: 10%;
}

.cars-data-table .ct-model {
  width: 14%;
}

.cars-data-table .ct-year {
  width: 7%;
}

.cars-data-table .ct-chassis {
  width: 16%;
}

.cars-data-table .ct-color {
  width: 7%;
}

.cars-data-table .ct-price {
  width: 10%;
}

.cars-data-table .ct-profit {
  width: 14%;
}

.cars-data-table .ct-delete {
  width: 5%;
}

/* ── محاذاة كل عمود — th و td متطابقان ── */
.ct-num {
  text-align: right !important;
}

.ct-model {
  text-align: right !important;
}

.ct-year {
  text-align: center !important;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.ct-chassis {
  text-align: left !important;
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.ct-color {
  text-align: right !important;
}

.ct-price {
  text-align: left !important;
  direction: rtl;
  unicode-bidi: embed;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ct-currency {
  display: inline-block;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  color: rgba(255, 255, 255, 0.35);
  margin-right: 3px;
}

.ct-profit {
  text-align: center !important;
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  font-size: var(--fs-sm);
}

.ct-profit-pct {
  text-align: center !important;
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  font-size: var(--fs-xs);
}

/* ── فاصل عمودي بين الأعمدة ── */
.cars-data-table th,
.cars-data-table td {
  border-left: var(--hidod);
}

.cars-data-table th:last-child,
.cars-data-table td:last-child {
  border-left: none;
}

/* ── رقم اللوحة + المحافظة ── */
.ct-plate {
  display: block;
  font-weight: var(--fw-extrabold);
  color: var(--navy);
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono);
}

.ct-province {
  display: block;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  font-weight: var(--fw-medium);
  margin-top: 1px;
}

/* ── نسبة الربح ── */
.ct-profit {
  font-size: var(--fs-xs);
  margin-top: 2px;
  direction: ltr;
  unicode-bidi: embed;
}

.ct-profit-pct {
  margin-top: 2px;
}

/* ── صف محدد ── */
.cars-tr {
  cursor: pointer;
  transition: background 0.15s ease;
}

.cars-tr:hover {
  background: rgba(26, 58, 92, 0.035);
}

.cars-tr--selected {
  background: rgba(26, 58, 92, 0.07) !important;
  outline: 2px solid var(--navy);
  outline-offset: -2px;
}

.cars-tr--selected td {
  color: var(--text-primary) !important;
}

/* ── تلميح النقر ── */
.cars-click-hint {
  margin: -10px 0 4px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-align: center;
}

/* ============================================================
   VIEW MODE BANNER
   ============================================================ */
.view-mode-banner {
  margin: 0 0 16px;
  padding: 10px 16px;
  background: rgba(26, 58, 92, 0.05);
  border: 1px solid rgba(26, 58, 92, 0.12);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  font-weight: var(--fw-medium);
  text-align: center;
}

/* ── رأس اللوحة مع زر التعديل ── */
.car-form-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ── حقول readonly في وضع العرض ── */
.car-form-panel input[readonly]:not(.input--auto),
.car-form-panel textarea[readonly] {
  background: rgba(241, 245, 249, 0.70);
  color: var(--text-primary);
  cursor: default;
  border-color: rgba(203, 213, 225, 0.40);
}

.car-form-panel input[readonly]:focus:not(.input--auto),
.car-form-panel textarea[readonly]:focus {
  box-shadow: none;
  border-color: rgba(203, 213, 225, 0.40);
}

/* ============================================================
   COMBOBOX
   ============================================================ */
.combo-wrap {
  position: relative;
  width: 100%;
}

.combo-input {
  width: 100%;
  padding-left: 32px;
  /* مساحة للسهم */
}

/* السهم */
.combo-arrow {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: var(--fs-xs);
  cursor: pointer;
  pointer-events: auto;
  line-height: 1;
  user-select: none;
  -webkit-user-select: none;
}

/* القائمة المنسدلة */
.combo-list {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 500;
  background: var(--card-bg);
  border: 1.5px solid var(--border);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-lg);
  max-height: 220px;
  overflow-y: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.combo-item {
  padding: 9px 14px;
  font-size: var(--fs-base);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s ease;
  border-bottom: 1px solid var(--border-light);
}

.combo-item:last-child {
  border-bottom: none;
}

.combo-item:hover {
  background: rgba(16, 185, 129, 0.12);
  color: var(--text-primary);
}

.combo-item--active {
  background: rgba(16, 185, 129, 0.20);
  color: var(--text-primary);
  font-weight: var(--fw-bold);
}

.combo-empty {
  padding: 10px 14px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-align: center;
}

/* إزالة السهم القديم من input[list] */
input[list] {
  background-image: none;
  padding-left: inherit;
}

/* ============================================================
   PREMIUM GLASSMORPHISM OVERRIDES
   Pure visual layer: preserves existing RTL layout and behavior.
   ============================================================ */

body {
  background:
    radial-gradient(circle at 82% -10%, rgba(34, 197, 94, 0.14) 0%, transparent 34%),
    radial-gradient(circle at 12% 8%, rgba(74, 222, 128, 0.16) 0%, transparent 32%),
    radial-gradient(circle at 18% 96%, rgba(132, 204, 22, 0.12) 0%, transparent 34%),
    linear-gradient(145deg, #041c12 0%, #0d3c25 45%, #18824f 100%);
  color: var(--text-primary);
}

.app-bg {
  background: var(--backkground) !important;
}

.app-bg__mesh {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    radial-gradient(ellipse at 50% 0%, rgba(63, 207, 255, 0.10) 0%, transparent 46%);
  background-size: 42px 42px, 42px 42px, auto;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.18));
}

.app-bg__orb {
  filter: blur(92px) saturate(160%);
  mix-blend-mode: screen;
}

.app-bg__orb--1 {
  background: rgba(45, 107, 255, 0.34);
  opacity: .70;
}

.app-bg__orb--2 {
  background: rgba(216, 168, 90, 0.20);
  opacity: .62;
}

.app-bg__orb--3 {
  background: rgba(106, 77, 255, 0.22);
  opacity: .58;
}

.app-bg__reflection {
  background: var(--red);
}

.app-header,
.panel-card,
.side-card,
.main-card,
.cars-page__toolbar,
.cars-list-panel,
.cars-detail-panel,
.app-footer,
.modal-dialog,
.toast {
  position: relative;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.105), rgba(255, 255, 255, 0.035)),
    rgba(16, 24, 39, 0.54);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: var(--shadow-md);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}

.app-header,
.panel-card,
.side-card,
.main-card,
.cars-page__toolbar,
.cars-list-panel,
.cars-detail-panel,
.app-footer {
  overflow: hidden;
}

.app-header::after,
.panel-card::before,
.side-card::before,
.main-card::before,
.cars-page__toolbar::before,
.cars-list-panel::before,
.cars-detail-panel::before,
.stat-card::before,
.fin-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(120deg, transparent 0%, rgba(255, 255, 255, 0.11) 42%, transparent 64%),
    radial-gradient(circle at 18% 0%, rgba(63, 207, 255, 0.09), transparent 34%);
  opacity: 0;
  transform: translateX(18%);
  transition: opacity .35s ease-in-out, transform .35s ease-in-out;
}

.app-header:hover::after,
.panel-card:hover::before,
.side-card:hover::before,
.main-card:hover::before,
.cars-page__toolbar:hover::before,
.cars-list-panel:hover::before,
.cars-detail-panel:hover::before,
.stat-card:hover::before,
.fin-card:hover::before {
  opacity: 1;
  transform: translateX(0);
}

.app-header {
  box-shadow: var(--shadow-lg);
}

.app-header::before {
  height: 1px;
  background: var(--red);
}

.header-glow {
  background:
    radial-gradient(circle, rgba(45, 107, 255, 0.24) 0%, transparent 62%),
    radial-gradient(circle at 65% 35%, rgba(216, 168, 90, 0.12) 0%, transparent 48%);
}

.brand-logo-img {
  filter:
    drop-shadow(0 10px 28px rgba(45, 107, 255, 0.26)) drop-shadow(0 0 18px rgba(216, 168, 90, 0.12));
}

.header-brand__badge,
.cars-page__count,
.car-form-panel__id {
  color: var(--gold-light);
  background: rgba(216, 168, 90, 0.12);
  border: 1px solid rgba(216, 168, 90, 0.28);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.10);
}

.brand-title {
  background: var(--red);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-subtitle,
.page-intro__desc,
.panel-text,
.app-footer__text span,
.cars-click-hint,
.danger-zone__hint,
.text-muted,
.cell-sub,
.ct-province,
.combo-empty {
  color: var(--text-muted) !important;
}

.page-intro__title,
.cars-page__title,
.panel-title,
.card-header,
.car-form-panel__title,
.cars-detail-placeholder h3,
.modal-dialog__title,
.cell-bold,
.ct-plate,
.app-footer__text strong {
  color: var(--text-primary) !important;
}

.header-nav {
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.10);
}

.nav-btn {
  color: var(--text-secondary);
  border-radius: 999px;
  transition: all .3s ease-in-out;
}

.nav-btn:hover {
  color: var(--text-primary);
  background: rgba(45, 107, 255, 0.16);
  border-color: rgba(63, 207, 255, 0.20);
  box-shadow: 0 0 34px rgba(45, 107, 255, 0.18);
  transform: translateY(-2px) scale(1.01);
}

.nav-btn--active,
.nav-btn--active:hover {
  color: var(--text-primary);
  background:
    radial-gradient(circle at 25% 0%, rgba(63, 207, 255, 0.35), transparent 42%),
    linear-gradient(135deg, #2d6bff 0%, #6a4dff 100%);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 12px 34px rgba(45, 107, 255, 0.32), inset 0 1px 1px rgba(255, 255, 255, 0.20);
}

.stat-card,
.fin-card {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(150deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.035)),
    rgba(16, 24, 39, 0.52);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  box-shadow: var(--shadow-sm);
  transition: all .3s ease-in-out;
}

.stat-card:hover,
.fin-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: var(--shadow-lg);
}

.cars-tr:hover {
  box-shadow: 0 0 0 1px #1a5c38;
}

.stat-card--sky,
.stat-card--green,
.stat-card--amber,
.stat-card--red,
.stat-card--muted,
.fin-card--capital {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-card--sky {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(63, 207, 255, 0.44);
}

.stat-card--green {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(85, 245, 170, 0.42);
}

.stat-card--amber {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(216, 168, 90, 0.48);
}

.stat-card--red {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(255, 59, 59, 0.42);
}

.stat-card--muted {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(170, 180, 200, 0.36);
}

.stat-label,
.fin-card__label,
.label,
.form-section__title,
.fin-record-line__lbl,
.modal-dialog__message,
.data-table th {
  color: var(--text-secondary) !important;
}

.stat-value--sky,
.ct-plate,
.fin-record-line__num {
  color: #3fcfff !important;
}

.stat-value--green,
.text-green {
  color: #55f5aa !important;
}

.stat-value--amber {
  color: #ffd27b !important;
}

.stat-value--red,
.text-red {
  color: #ff7a7a !important;
}

.stat-value--muted {
  color: #d7deeb !important;
}

.inline-code {
  color: #3fcfff;
  background: rgba(63, 207, 255, 0.10);
  border: 1px solid rgba(63, 207, 255, 0.20);
}

.input,
.select,
.textarea,
.input--auto,
.car-form-panel input[readonly]:not(.input--auto),
.car-form-panel textarea[readonly] {
  color: #ffffff !important;
  background: rgba(255, 255, 255, 0.03) !important;
  backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.10) !important;
  border-radius: 12px;
  transition: all .3s ease-in-out;
}

.input::placeholder,
.textarea::placeholder {
  color: rgba(255, 255, 255, 0.35) !important;
}

.input:disabled,
.select:disabled {
  color: rgba(255, 255, 255, 0.4) !important;
  background: rgba(255, 255, 255, 0.04) !important;
}

.btn {
  border-radius: 999px;
  color: var(--text-primary);
  transition: all .3s ease-in-out;
}

.btn:hover:not(:disabled),
.btn-icon:hover {
  transform: translateY(-3px) scale(1.02);
}

.btn--primary {
  background: var(--red);
  border: 1px solid rgba(34, 197, 94, 0.45) !important;
  color: #86efac !important;
  box-shadow: 0 8px 30px rgba(34, 197, 94, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.08) !important;
}

.btn--primary:hover:not(:disabled) {
  background: var(--red);
  border-color: rgba(34, 197, 94, 0.65) !important;
  color: #ffffff !important;
  box-shadow: 0 8px 30px rgba(34, 197, 94, 0.20) !important;
}

.btn--success {
  background: var(--red);
  border: 1px solid rgba(34, 197, 94, 0.45) !important;
  color: #86efac !important;
  box-shadow: 0 8px 30px rgba(34, 197, 94, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.08) !important;
}

.btn--success:hover:not(:disabled) {
  background: var(--red);
  border-color: rgba(34, 197, 94, 0.65) !important;
  color: #ffffff !important;
  box-shadow: 0 8px 30px rgba(34, 197, 94, 0.20) !important;
}

.btn--ghost,
.btn-icon,
.alert-retry {
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(216, 168, 90, 0.22) !important;
  color: rgba(216, 168, 90, 0.8) !important;
  border-radius: 8px;
}

.btn--ghost:hover,
.btn-icon:hover,
.alert-retry:hover {
  color: #fef9c3 !important;
  background: rgba(216, 168, 90, 0.08) !important;
  border-color: rgba(216, 168, 90, 0.45) !important;
}

.btn--danger,
.btn--danger-solid {
  background: var(--red);
  border: 1px solid rgba(239, 68, 68, 0.45) !important;
  color: #fca5a5 !important;
}

.btn--danger:hover:not(:disabled),
.btn--danger-solid:hover:not(:disabled) {
  background: var(--red);
  border-color: rgba(239, 68, 68, 0.65) !important;
  color: #ffffff !important;
}

/* ── 📊 الجداول والخطوط تم نقلها إلى ملف منفصل tables.css ── */

.cars-tr--selected,
.cars-table-row--selected {
  background: rgba(45, 107, 255, 0.18) !important;
  outline: 1px solid rgba(63, 207, 255, 0.62);
  box-shadow: inset 0 0 32px rgba(45, 107, 255, 0.14);
}

.badge {
  border-radius: 999px;
  color: var(--text-primary);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.12);
}

.badge--available {
  background: rgba(85, 245, 170, 0.14);
  color: #a8ffd4;
  border-color: rgba(85, 245, 170, 0.34);
}

.badge--sold,
.badge--installment {
  background: rgba(255, 59, 59, 0.13);
  color: #ffb3b3;
  border-color: rgba(255, 59, 59, 0.34);
}

.badge--cash {
  background: rgba(63, 207, 255, 0.13);
  color: #b8efff;
  border-color: rgba(63, 207, 255, 0.34);
}

.payment-section,
.installment-section,
.summary-item.highlight,
.payment-info,
.view-mode-banner,
.car-form-panel__danger-zone {
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08);
}

.payment-info {
  border-right: 4px solid rgba(63, 207, 255, 0.72);
}

.summary-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.summary-item strong,
.summary-item.highlight strong {
  color: var(--gold-light);
}

.summary-item__value {
  font-weight: var(--fw-extrabold);
  font-size: var(--fs-base);
  direction: ltr;
  unicode-bidi: embed;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.summary-item__value--total {
  color: #3fcfff;
}

.summary-item__value--paid {
  color: #55f5aa;
}

.summary-item__value--remaining {
  font-size: var(--fs-md);
  color: #ffd27b;
}

.modal-overlay {
  background: rgba(5, 8, 15, 0.68);
  backdrop-filter: blur(14px) saturate(160%);
}

.alert--error {
  color: #ffdede;
  background: rgba(255, 59, 59, 0.13);
  border: 1px solid rgba(255, 59, 59, 0.34);
  box-shadow: var(--shadow-sm);
  backdrop-filter: var(--glass-blur);
}

.spinner {
  border-color: rgba(255, 255, 255, 0.12);
  border-top-color: #3fcfff;
  box-shadow: 0 0 28px rgba(63, 207, 255, 0.30);
}

@keyframes pulse-logo {

  0%,
  100% {
    filter: drop-shadow(0 10px 28px rgba(45, 107, 255, 0.22));
    transform: scale(1);
  }

  50% {
    filter: drop-shadow(0 14px 42px rgba(216, 168, 90, 0.34));
    transform: scale(1.03);
  }
}

.combo-list {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.105), rgba(255, 255, 255, 0.035)),
    rgba(16, 24, 39, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: var(--shadow-lg);
  backdrop-filter: var(--glass-blur);
}

.combo-item {
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.065);
}

.combo-item:hover,
.combo-item--active {
  background: rgba(16, 185, 129, 0.15);
  color: var(--text-primary);
}

select option {
  color: var(--text-primary);
  background: #101827;
}

/* ============================================================
   REFINED EXECUTIVE THEME
   Slate-gray/green palette, clean background, mouse-reactive glow.
   ============================================================ */



.app {
  --mx: 50vw;
  --my: 25vh;
}

.app::before {
  content: none;
}

.app> :not(.app-bg) {
  position: relative;
  z-index: 1;
}

body {
  background:
    radial-gradient(circle at 14% 8%, var(--bg-orb-1) 0%, transparent 32%),
    radial-gradient(circle at 82% 0%, var(--bg-orb-2) 0%, transparent 28%),
    linear-gradient(145deg, var(--bg-gradient-start) 0%, var(--bg-gradient-mid) 48%, var(--bg-gradient-end) 100%);
}

.app-bg {
  background:
    radial-gradient(ellipse at 72% 8%, var(--bg-orb-1) 0%, transparent 44%),
    radial-gradient(ellipse at 16% 18%, var(--bg-orb-2) 0%, transparent 40%),
    radial-gradient(ellipse at 50% 108%, var(--bg-orb-3) 0%, transparent 44%),
    linear-gradient(155deg, var(--bg-gradient-start) 0%, var(--bg-gradient-mid) 52%, var(--bg-gradient-end) 100%);
}

.app-bg__mesh {
  background-image: none;
  background-size: auto;
  mask-image: none;
}

.app-bg__orb--1 {
  background: var(--bg-orb-1);
  opacity: .55;
}

.app-bg__orb--2 {
  background: var(--bg-orb-2);
  opacity: .50;
}

.app-bg__orb--3 {
  background: var(--bg-orb-3);
  opacity: .45;
}

.app-header,
.panel-card,
.side-card,
.main-card,
.cars-page__toolbar,
.cars-list-panel,
.cars-detail-panel,
.app-footer,
.modal-dialog,
.toast {
  background:
    radial-gradient(circle at var(--mx) var(--my), rgba(34, 197, 94, 0.07), transparent 36%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.025)),
    rgba(20, 26, 24, 0.60);
}

.app-header::after,
.panel-card::before,
.side-card::before,
.main-card::before,
.cars-page__toolbar::before,
.cars-list-panel::before,
.cars-detail-panel::before,
.stat-card::before,
.fin-card::before {
  background:
    radial-gradient(280px circle at 50% 0%, rgba(34, 197, 94, 0.12), transparent 58%),
    radial-gradient(260px circle at 85% 18%, rgba(216, 168, 90, 0.08), transparent 62%);
  transform: scale(0.96);
  transition: opacity .3s ease-in-out, transform .3s ease-in-out, filter .3s ease-in-out;
}

.app-header:hover::after,
.panel-card:hover::before,
.side-card:hover::before,
.main-card:hover::before,
.cars-page__toolbar:hover::before,
.cars-list-panel:hover::before,
.cars-detail-panel:hover::before,
.stat-card:hover::before,
.fin-card:hover::before {
  opacity: 1;
  transform: scale(1);
  filter: saturate(125%);
}

.header-inner {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) auto minmax(320px, 1fr);
  align-items: center;
  direction: ltr;
}

.header-brand__badge--side {
  grid-column: 1;
  justify-self: start;
  align-self: center;
  direction: rtl;
}

.header-brand {
  grid-column: 2;
  justify-self: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 0;
  text-align: center;
  direction: rtl;
}

.header-brand__text {
  align-items: center;
}

.header-brand__badge {
  align-self: center;
}

.header-nav {
  grid-column: 3;
  justify-self: end;
  direction: rtl;
  background: rgba(255, 255, 255, 0.045);
}

.brand-title {
  font-size: clamp(var(--fs-lg), 2.25vw, var(--fs-xxl));
  white-space: nowrap;
  background: var(--red);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-subtitle {
  color: rgba(221, 227, 236, 0.78) !important;
}

.brand-logo-img {
  filter:
    drop-shadow(0 12px 30px rgba(215, 25, 47, 0.24)) drop-shadow(0 0 16px rgba(216, 168, 90, 0.14));
}

.header-glow {
  right: 24%;
  width: 52%;
  background:
    radial-gradient(circle, rgba(215, 25, 47, 0.20) 0%, transparent 64%),
    radial-gradient(circle at 65% 35%, rgba(216, 168, 90, 0.12) 0%, transparent 50%);
}

.app-header::before {
  background: var(--red);
}

.nav-btn__icon,
.stat-card__icon,
.fin-card__icon,
.placeholder-icon {
  color: var(--smiles);
  text-shadow: 0 0 18px rgba(216, 168, 90, 0.24);
}

.nav-btn:hover {
  background: rgba(215, 25, 47, 0.15);
  border-color: rgba(255, 75, 95, 0.24);
  box-shadow: 0 0 34px rgba(215, 25, 47, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.12);
}

.nav-btn--active,
.nav-btn--active:hover,
.btn--primary {
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 224, 163, 0.28), transparent 46%),
    linear-gradient(135deg, var(--color-button) 0%, var(--navy-dark) 100%);
  box-shadow: 0 18px 42px rgba(34, 197, 94, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.18);
}

.btn--success {
  background: var(--red);
  box-shadow: 0 18px 40px rgba(216, 168, 90, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.18);
}

.stat-card:hover,
.fin-card:hover {
  transform: translateY(-5px) scale(1.018);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.32), 0 0 54px rgba(215, 25, 47, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.13);
}

.cars-tr:hover {
  box-shadow:
    0 0 0 1px #1a5c38,
    0 0 24px rgba(34, 197, 94, 0.15),
    0 0 60px rgba(34, 197, 94, 0.08),
    inset 0 0 20px rgba(34, 197, 94, 0.04);
}

.stat-value--sky,
.ct-plate,
.fin-record-line__num {
  color: #ffd1d7 !important;
}

.stat-card--sky {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(255, 75, 95, 0.42);
}

.stat-card--green {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(216, 168, 90, 0.46);
}

.stat-card--amber {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(255, 224, 163, 0.44);
}

.stat-card--red {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(255, 75, 95, 0.42);
}

.stat-card--muted {
  box-shadow: var(--shadow-sm), inset 0 2px 0 rgba(221, 227, 236, 0.28);
}

.data-table tbody tr:hover,
.cars-tr--selected,
.cars-table-row--selected {
  background: rgba(215, 25, 47, 0.13) !important;
}

.cars-tr--selected,
.cars-table-row--selected {
  outline: 1px solid rgba(255, 75, 95, 0.58);
  box-shadow: inset 0 0 32px rgba(215, 25, 47, 0.13);
}

.badge--available {
  background: #1b5e20;
  color: var(--text-primary);
  border-color: rgba(85, 245, 170, 0.34);
  box-shadow: 0 0 12px rgba(85, 245, 170, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.12);
}

.badge--sold,
.badge--installment {
  background: #b71c1c;
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: none;
}

.payment-info {
  border-right-color: rgba(255, 75, 95, 0.72);
}

.spinner {
  border-top-color: #ff4b5f;
  box-shadow: 0 0 28px rgba(215, 25, 47, 0.30);
}

.combo-item:hover,
.combo-item--active {
  background: rgba(16, 185, 129, 0.18);
}

@media (max-width: 980px) {
  .header-inner {
    display: flex;
    direction: rtl;
  }

  .header-brand,
  .header-nav {
    grid-column: auto;
    justify-self: auto;
  }
}

@media (max-width: 768px) {
  .brand-title {
    white-space: normal;
  }
}

/* ============================================================
   FINAL LUXURY REFINEMENT
   Slate-gray / green palette, polished modals.
   ============================================================ */

body {
  background:
    radial-gradient(circle at 18% 12%, rgba(34, 197, 94, 0.12) 0%, transparent 36%),
    radial-gradient(circle at 78% 0%, rgba(132, 204, 22, 0.10) 0%, transparent 34%),
    linear-gradient(145deg, #041c12 0%, #0d3c25 44%, #18824f 100%);
}

.app-bg {
  background:
    radial-gradient(ellipse at 72% 8%, rgba(34, 197, 94, 0.14) 0%, transparent 44%),
    radial-gradient(ellipse at 16% 18%, rgba(132, 204, 22, 0.10) 0%, transparent 40%),
    radial-gradient(ellipse at 50% 108%, rgba(74, 222, 128, 0.08) 0%, transparent 44%),
    linear-gradient(155deg, #041c12 0%, #0d3c25 52%, #18824f 100%);
}

.app::before {
  background:
    radial-gradient(520px circle at var(--mx) var(--my), rgba(34, 197, 94, 0.08), rgba(216, 168, 90, 0.05) 34%, transparent 68%);
}

.header-brand {
  width: min(620px, 100%);
  min-height: 112px;
  position: relative;
  isolation: isolate;
}

.header-brand .brand-logo-img--lg {
  position: absolute;
  inset: 50% auto auto 50%;
  z-index: 0;
  width: min(360px, 78vw);
  height: 150px;
  max-width: none;
  opacity: 0.42;
  transform: translate(-50%, -50%) scale(1.16);
  filter:
    drop-shadow(0 0 1.1px rgba(255, 255, 255, 0.98)) drop-shadow(0 0 20px rgba(34, 197, 94, 0.55)) drop-shadow(0 0 54px rgba(34, 197, 94, 0.28)) drop-shadow(0 0 72px rgba(216, 168, 90, 0.16));
}

.header-brand::before {
  content: "";
  position: absolute;
  inset: 4px 8%;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 48%, rgba(34, 197, 94, 0.22), transparent 44%),
    radial-gradient(ellipse at 50% 55%, rgba(216, 168, 90, 0.12), transparent 58%);
  filter: blur(10px);
}

.header-brand__text {
  position: relative;
  z-index: 2;
  padding: 16px 20px;
}

.brand-title {
  text-shadow:
    0 2px 14px rgba(0, 0, 0, 0.44),
    0 0 26px rgba(34, 197, 94, 0.20);
  color: var(--text-primary);
  background: none;
  -webkit-background-clip: text;
  -webkit-text-fill-color: var(--text-primary);
  background-clip: text;
}

.header-brand__badge {
  background: rgba(0, 0, 0, 0.24);
  color: rgba(255, 255, 255, 0.88);
  border-color: rgba(255, 255, 255, 0.10);
}

.app-footer .brand-logo-img--sm {
  position: relative;
  z-index: 1;
  height: 58px;
  max-width: 160px;
  filter:
    drop-shadow(0 0 0.8px rgba(255, 255, 255, 0.95)) drop-shadow(0 0 18px rgba(34, 197, 94, 0.45)) drop-shadow(0 0 38px rgba(34, 197, 94, 0.22));
}

.app-footer {
  position: relative;
}

.app-footer::before {
  content: "";
  position: absolute;
  inset: 8px 38%;
  background: radial-gradient(ellipse, rgba(34, 197, 94, 0.22), transparent 66%);
  filter: blur(12px);
  pointer-events: none;
}

.nav-btn__icon,
.stat-card__icon,
.fin-card__icon,
.placeholder-icon {
  color: var(--smiles);
  text-shadow: 0 0 18px rgba(216, 168, 90, 0.24);
}

.nav-btn--active,
.nav-btn--active:hover,
.btn--primary {
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.18), transparent 46%),
    linear-gradient(135deg, #1a5c38 0%, #0f3d25 100%);
  box-shadow: 0 18px 42px rgba(34, 197, 94, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.18);
}

.btn--success {
  background: var(--red);
}

.cars-page__toolbar,
.customers-toolbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  row-gap: 14px;
  align-items: center;
}

.cars-page__toolbar-start {
  grid-column: 2;
  justify-content: center;
  text-align: center;
}

.cars-page__title,
.customers-title {
  text-align: center;
}

.cars-page__title,
.customers-title,
.page-intro__title {
  color: #ffffff !important;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.18),
    0 8px 22px rgba(0, 0, 0, 0.42),
    0 0 28px rgba(34, 197, 94, 0.16);
}

.cars-page__count {
  color: var(--text-primary);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.035)),
    rgba(34, 197, 94, 0.16);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.14),
    0 0 24px rgba(34, 197, 94, 0.12);
}

.toolbar-controls {
  grid-column: 1 / -1;
  grid-row: 2;
  justify-content: center;
  direction: rtl;
  align-items: center;
  flex-wrap: nowrap;
}

.customers-toolbar .input--search {
  grid-column: 1;
  grid-row: 1;
  justify-self: end;
}

.input--search,
.toolbar-controls .select {
  min-height: 44px;
  text-align: right !important;
  direction: rtl;
}

.toolbar-controls .input--search {
  width: clamp(300px, 28vw, 460px);
  max-width: none;
}

.toolbar-controls .select,
.toolbar-controls .input--search {
  flex: 0 0 auto;
}

.toolbar-controls .select {
  min-width: 170px;
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, rgba(255, 255, 255, 0.82) 50%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.82) 50%, transparent 50%);
  background-position:
    left 18px center,
    left 12px center;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  padding-left: 34px;
}

.cars-layout {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  flex: 1;
  min-height: 0;
}

.cars-list-panel {
  width: 100%;
  margin-inline: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.cars-list-panel .table-wrapper {
  overflow-x: auto;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-bottom: 12px;
}

.customers-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.customers-main-card {
  width: 100%;
  margin-inline: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.th-sort-indicator {
  color: rgba(255, 255, 255, 0.60);
  font-size: var(--fs-xs);
  line-height: 1;
}

.data-table th,
.data-table td,
.ct-num,
.ct-model,
.ct-year,
.ct-chassis,
.ct-color,
.ct-price,
.col-name,
.col-phone,
.col-price,
.col-money,
.col-status,
.col-due,
.col-delete,
.col-actions,
.cell-num,
.th-num {
  text-align: center !important;
}

.ct-num,
.ct-chassis,
.col-phone,
.cell-num {
  direction: ltr;
  unicode-bidi: embed;
}

.ct-price,
.col-money {
  direction: rtl;
  unicode-bidi: embed;
}

.ct-province,
.col-name .cell-sub,
.col-price .cell-profit,
.ct-profit,
.ct-profit-pct {
  text-align: center !important;
}

.cars-tr,
.customers-tr {
  cursor: pointer;
}

.modal-overlay--soft {
  inset: 0;
  align-items: center;
  padding: 20px;
  animation: modal-fade .24s ease-out;
}

.modal-dialog--wide {
  width: 100%;
  max-width: 1240px;
  max-height: none;
  overflow: visible;
  display: flex;
  flex-direction: column;
  animation: modal-sweep .42s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-dialog--car.modal-dialog--wide,
.modal-dialog--partner.modal-dialog--wide {
  max-height: calc(100vh - 28px);
}

.modal-dialog--customer {
  max-width: min(560px, calc(100vw - 34px));
  animation: modal-rise .34s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-dialog--car,
.modal-dialog--customer {
  background: none;
  border-color: rgba(255, 255, 255, 0.13);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
}

.car-form-overlay {
  position: fixed;
  inset: 0;
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  padding: 20px;
}

.car-form-container {
  width: 100%;
  max-width: 1240px;
  max-height: calc(100vh - 28px);
  display: flex;
  flex-direction: column;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.13);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-radius: var(--r-lg, 16px);
  box-shadow: none;
  overflow: hidden;
}

/* ============================================================
   CURRENT UX POLISH
   Slate-gray / green controls, compact dashboard.
   ============================================================ */

.brand-title,
.app-footer__text strong {
  color: #ffffff !important;
  background: none !important;
  -webkit-text-fill-color: #ffffff !important;
  -webkit-text-stroke: 0 !important;
  text-shadow:
    0 8px 28px rgba(0, 0, 0, 0.44),
    0 0 26px rgba(255, 255, 255, 0.10),
    0 0 42px rgba(34, 197, 94, 0.25);
}

.brand-title {
  font-size: clamp(var(--fs-lg), 3.15vw, var(--fs-xxl));
}

.brand-kicker {
  font-size: clamp(var(--fs-xs), 1.15vw, var(--fs-sm));
  font-weight: var(--fw-black);
  color: rgba(255, 255, 255, 0.86);
  padding: 4px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.header-side-logo {
  height: 104px;
  max-width: 270px;
  filter:
    drop-shadow(0 0 1.4px rgba(255, 255, 255, 1)) drop-shadow(0 0 24px rgba(34, 197, 94, 0.55)) drop-shadow(0 0 54px rgba(34, 197, 94, 0.28));
}

.nav-btn--active,
.nav-btn--active:hover,
.btn--primary,
.btn--success {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.025)),
    rgba(26, 92, 56, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.11);
  box-shadow:
    0 18px 42px rgba(34, 197, 94, 0.20),
    inset 0 1px 1px rgba(255, 255, 255, 0.16);
}

.btn--success:hover:not(:disabled),
.btn--primary:hover:not(:disabled) {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.035)),
    rgba(34, 107, 65, 0.94);
}

.toolbar-combo {
  width: 170px;
  flex: 0 0 170px;
}

.cars-page__toolbar,
.toolbar-controls,
.toolbar-combo,
.toolbar-combo .combo-wrap {
  overflow: visible !important;
}

.cars-page__toolbar {
  position: relative;
  z-index: 120;
}

.cars-layout,
.cars-list-panel {
  position: relative;
  z-index: 1;
}

.toolbar-combo,
.toolbar-combo .combo-wrap {
  position: relative;
  z-index: 140;
}

.toolbar-combo .combo-list,
.toolbar-combo .combo-empty {
  position: absolute;
  z-index: 9999;
}

.toolbar-combo .combo-input {
  min-height: 44px;
}

.combo-list,
.combo-empty {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(71, 85, 105, 0.6);
  box-shadow:
    0 22px 70px rgba(0, 0, 0, 0.42);
}

.combo-item {
  color: rgba(255, 255, 255, 0.88);
  text-align: center;
}

.combo-item:hover,
.combo-item--active,
.combo-item--highlighted {
  color: var(--text-primary);
  background: rgba(16, 185, 129, 0.15);
}

/* Less rounded controls across the application. */
:root {
  --r-xs: 8px;
  --r-sm: 12px;
  --r-md: 16px;
  --r-lg: 20px;
}

.input,
.select,
.textarea,
.combo-input,
.combo-list,
.combo-empty,
.btn,
.btn-icon,
.badge,
.header-nav,
.nav-btn,
.cars-page__count,
.car-form-panel__id,
.toolbar-controls .select,
.payment-section,
.installment-section,
.summary-item.highlight,
.view-mode-banner,
.car-form-panel__danger-zone,
.payment-summary {
  border-radius: var(--all-radius) !important;
}

.app-header,
.app-footer {
  border-radius: 18px !important;
}

.combo-list {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.22) rgba(255, 255, 255, 0.05);
}

.combo-list::-webkit-scrollbar {
  width: 8px;
}

.combo-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 999px;
}

.combo-list::-webkit-scrollbar-thumb {
  background: var(--red);
  border-radius: 999px;
}

.combo-input,
.select {
  min-height: 44px;
}

.label-hint,
.input--auto {
  display: none !important;
}

.dashboard .page-intro {
  margin-bottom: 12px;
}

.dashboard .stats-grid {
  gap: 12px;
}

.dashboard .stat-card {
  padding: 16px 14px;
}

.dashboard .stat-card__icon {
  font-size: var(--fs-xl);
  margin-bottom: 6px;
}

.dashboard .stat-label {
  margin-bottom: 5px;
}

.dashboard .stat-value {
  font-size: var(--fs-lg);
}

.dashboard-panel {
  margin-top: 12px;
}

.dashboard-panel.panel-card {
  padding: 18px;
}

.dashboard-panel .panel-text {
  margin-bottom: 12px;
  line-height: 1.55;
}

.dashboard-panel .fin-card {
  padding: 14px 12px;
}

.app {
  gap: 18px;
  padding: 18px 22px 22px;
}

@keyframes modal-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes modal-rise {
  from {
    opacity: 0;
    transform: translateY(24px) scale(.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes modal-sweep {
  from {
    opacity: 0;
    transform: translateY(26px) scale(.985);
    clip-path: inset(0 48% 0 48% round 28px);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    clip-path: inset(0 0 0 0 round 28px);
  }
}

/* ══════════════════════════════════════════════
   CAR FORM PANEL — Compact, no inner scroll
   ══════════════════════════════════════════════ */
.modal-dialog--car {
  padding: 0;
  overflow: visible;
}

.modal-dialog--car .car-form-panel {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.cf-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 52px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  transition: background 0.35s ease;
}

.car-form-panel--avail {
  background: rgba(16, 185, 129, 0.08);
  border-radius: inherit;
}

.car-form-panel--sold {
  background: rgba(244, 63, 94, 0.10);
  border-radius: inherit;
}

.cf-header__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  text-align: center;
}

.cf-header__line {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: var(--fw-extrabold);
  color: rgba(255, 255, 255, 0.94);
  line-height: 1.35;
  letter-spacing: 0.02em;
}

.cf-close {
  position: absolute;
  top: 10px;
  inset-inline-end: 14px;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.88);
  font-size: var(--fs-lg);
  line-height: 1;
  cursor: pointer;
  transition: background .2s ease, border-color .2s ease;
}

.cf-close:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.22);
}

.cf-header__status {
  position: absolute;
  inset-inline-start: 14px;
  top: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.cf-header__status .elegant-switch {
  gap: 0;
}

.cf-header__status .elegant-switch__track {
  width: 52px;
  height: 28px;
  padding: 2px;
}

.cf-header__status .elegant-switch__knob {
  width: 24px;
  height: 24px;
}

.cf-header__status .elegant-switch__core {
  width: 7px;
  height: 7px;
}

.cf-header__status .cf-status-label {
  font-size: var(--fs-xs);
}

.modal-dialog--car .car-form {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: visible;
  padding: 8px 16px 10px;
}

/* Controls inside car modal — readable font, centered text */
.modal-dialog--car .input,
.modal-dialog--car .combo-input,
.modal-dialog--car .date-seg,
.modal-dialog--car .unified-date-field,
.modal-dialog--car .year-scroll-field,
.modal-dialog--car .textarea {
  min-height: 40px !important;
  padding: 6px 10px !important;
  font-size: var(--fs-base) !important;
  border-radius: 10px !important;
  text-align: center !important;
  border: 1px solid rgba(71, 85, 105, 0.6) !important;
}

.modal-dialog--car .combo-input {
  padding-inline: 28px !important;
}

.modal-dialog--car .combo-list .combo-item {
  text-align: center;
}

.modal-dialog--car .combo-arrow {
  width: 24px;
  font-size: var(--fs-xs);
}

.modal-dialog--car .cf-textarea {
  min-height: 52px !important;
  max-height: 64px;
  resize: none;
  line-height: 1.5;
  padding-block: 7px !important;
}

/* ── Validation ── */
.modal-dialog--car .form--submitted .input:invalid,
.modal-dialog--car .form--submitted .combo-input:invalid,
.modal-dialog--car .form--submitted .unified-date-field:invalid,
.modal-dialog--car .form--submitted .year-scroll-field:invalid,
.modal-dialog--car .form--submitted .input--error,
.modal-dialog--car .form--submitted .textarea:invalid,
.input--error {
  border-color: #f43f5e !important;
  box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.25), 0 20px 50px -15px rgba(244, 63, 94, 0.15) !important;
}

/* Validation wrappers for wrapped inputs (TextInput, NumberInput, PriceInput) */
.form--submitted div.border:has(> input.input--error),
.form--submitted div.border:has(> input:invalid),
.form--submitted div.border:has(> textarea.input--error),
.form--submitted div.border:has(> textarea:invalid),
div.border:has(> input.input--error),
div.border:has(> textarea.input--error) {
  border-color: #f43f5e !important;
  box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.25), 0 20px 50px -15px rgba(244, 63, 94, 0.15) !important;
}

/* Reset inner inputs inside wrappers to keep borders only on wrappers */
.form--submitted div.border:has(> input.input--error) input,
.form--submitted div.border:has(> input:invalid) input,
.form--submitted div.border:has(> textarea.input--error) textarea,
.form--submitted div.border:has(> textarea:invalid) textarea,
div.border:has(> input.input--error) input,
div.border:has(> textarea.input--error) textarea {
  border-color: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  background: transparent !important;
}

.cf-board {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

/* ── أقسام بإطار ولون مميز ── */
.cf-zone {
  width: 100%;
  max-width: 100%;
  padding: 14px 20px 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.08),
    0 12px 36px rgba(0, 0, 0, 0.18);
}

.cf-zone--vehicle {
  background: var(--red);
  border-color: var(--white);
}

/* شراء + بيع جنباً إلى جنب */
.cf-trade-split {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  flex-wrap: wrap;
}

.cf-trade-split .cf-zone {
  flex: 1 1 260px;
  max-width: 380px;
  min-width: 240px;
}

.cf-zone--purchase {
  background: var(--red);
  border-color: var(--white);
}

.cf-zone--sale {
  background: var(--red);
  border-color: var(--white);
}

.cf-zone--buyer {
  background: var(--red);
  border-color: var(--white);
}

.cf-zone--pay {
  border-color: var(--white);
}

.cf-zone--pay-cash {
  background: var(--red);
  border-color: var(--white);
}

.cf-zone--pay-promise {
  background: var(--red);
  border-color: var(--white);
}

.cf-zone--pay-installment {
  background: var(--red);
  border-color: var(--white);
}

.cf-zone--notes {
  background: var(--red);
  border-color: var(--white);
}

.cf-zone--muted {
  opacity: 0.22;
  pointer-events: none;
}

.cf-zone__title {
  margin: 0 0 14px;
  text-align: center;
  font-size: var(--fs-sm);
  font-weight: var(--fw-extrabold);
  color: rgba(255, 255, 255, 0.88);
  letter-spacing: 0.04em;
}

.cf-zone--vehicle .cf-zone__title {
  color: rgba(255, 210, 210, 0.95);
}

.cf-zone--purchase .cf-zone__title {
  color: rgba(255, 224, 163, 0.95);
}

.cf-zone--sale .cf-zone__title {
  color: rgba(186, 220, 255, 0.95);
}

.cf-zone--pay .cf-zone__title {
  color: rgba(180, 255, 220, 0.95);
}

.cf-zone--buyer .cf-zone__title {
  color: rgba(255, 232, 150, 0.95);
}

.cf-zone__body {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  width: 100%;
}

.cf-zone__body--notes {
  align-items: stretch;
}

.cf-zone__body--sale {
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.cf-zone__body--buyer {
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 14px;
  padding-top: 4px;
  flex-wrap: wrap;
}

.cf-zone__body--buyer .cf-field--buyer {
  width: min(100%, 220px);
  max-width: 220px;
}

.cf-zone__body--buyer .cf-field--phone {
  width: min(100%, 140px);
  max-width: 140px;
}

.cf-zone__body--sale .cf-field--buyer {
  width: min(100%, 298px);
  max-width: 298px;
}

.cf-zone__body .cf-board__row {
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
}

.cf-zone__body--notes .cf-field--notes {
  width: min(520px, 100%);
  margin-inline: auto;
}

.cf-board__row {
  display: grid;
  gap: 8px 10px;
  align-items: end;
  justify-content: center;
}

/* Vehicle: أعرض — الشاصي يستوعب 16 حرف/رقم */
.cf-board__row--vehicle {
  grid-template-columns:
    minmax(160px, 220px) 110px 105px 125px 165px minmax(300px, 380px);
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
}

.cf-field--model {
  max-width: 220px;
}

.cf-field--year {
  max-width: 110px;
}

.cf-field--color {
  max-width: 105px;
}

.cf-field--plate {
  max-width: 125px;
}

.cf-field--province {
  max-width: 165px;
}

.cf-field--chassis {
  min-width: 300px;
  max-width: 380px;
}

.modal-dialog--car .cf-field--chassis .input {
  font-family: "Consolas", "Courier New", "Arial", monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

/* صف داخل صندوق الشراء أو البيع */
.cf-board__row--deal {
  grid-template-columns: auto auto;
}

.cf-field--price {
  max-width: 200px;
}

.cf-field--date {
  max-width: 150px;
}

.cf-field--buyer {
  max-width: 298px;
}

.cf-board__row--pay {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 18px;
}

.cf-field--delivery {
  max-width: 150px;
}

.cf-field--delivery .unified-date-field,
.cf-field--date .unified-date-field {
  min-width: 0;
}

.cf-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.cf-field--notes {
  max-width: 100%;
}

.cf-field--price-sm {
  max-width: 118px;
}

.cf-field--months {
  max-width: 64px;
}

.cf-field--dim {
  opacity: 0.2;
  pointer-events: none;
}

.cf-label {
  width: 100%;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  color: rgba(255, 255, 255, 0.58);
  letter-spacing: 0.01em;
  white-space: nowrap;
  text-align: center;
}

.modal-dialog--car .cf-field .input,
.modal-dialog--car .cf-field .combo-wrap,
.modal-dialog--car .cf-field .unified-date-field {
  width: 100%;
}

.modal-dialog--car .unified-date-field,
.modal-dialog--car .cf-field .unified-date-field,
.unified-date-field {
  flex: 1 1 auto;
  width: 100%;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  font-size: var(--fs-lg) !important;
  font-weight: var(--fw-bold) !important;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  text-align: center;
  caret-color: rgba(216, 168, 90, 0.85);
}

.unified-date-field::selection {
  background: rgba(16, 185, 129, 0.38);
  color: #fff;
}

.cf-pay-segments {
  display: flex;
  align-items: center;
  gap: 4px;
  direction: rtl;
  flex: 1 1 100%;
  justify-content: center;
  margin-bottom: 4px;
}

.cf-pay-seg {
  all: unset;
  cursor: pointer;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(200, 200, 220, 0.06);
  border: 1px solid rgba(200, 200, 220, 0.12);
  color: rgba(200, 200, 220, 0.5);
  transition: all 0.2s;
  user-select: none;
  text-align: center;
  min-width: 48px;
}

.cf-pay-seg:hover {
  background: rgba(200, 200, 220, 0.12);
  color: rgba(200, 200, 220, 0.75);
}

.cf-pay-seg--active {
  color: #fff;
}

.cf-install-summary {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
  min-height: 40px;
  max-width: 128px;
  background: rgba(85, 245, 170, 0.06);
  border: 1px solid rgba(85, 245, 170, 0.15);
  border-radius: 8px;
  padding: 4px 6px;
}

.cf-install-summary--muted {
  opacity: 0.4;
  pointer-events: none;
}

.cf-install-amount {
  font-size: var(--fs-base);
  font-weight: var(--fw-extrabold);
  color: var(--green);
  text-align: center;
  line-height: 1.2;
  width: 100%;
}

.modal-dialog--car .cf-install-summary .cf-label {
  text-align: center;
}

/* Date segments — سنة بنفس عرض الموديل (110px) */
.date-segments {
  display: flex;
  align-items: center;
  gap: 1px;
  direction: ltr;
  max-width: 234px;
}

.date-segments--disabled {
  opacity: 0.38;
  pointer-events: none;
}

.date-seg {
  flex: 1;
  min-width: 0;
  text-align: center;
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono) !important;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  min-height: 40px !important;
  padding: 0 4px !important;
  font-size: var(--fs-base) !important;
  caret-color: rgba(216, 168, 90, 0.8);
}

.date-seg--year {
  flex: 0 0 110px;
  width: 110px;
  max-width: 110px;
  min-width: 110px;
}

.year-scroll-field-wrapper {
  width: 110px;
}

.modal-dialog--car .year-scroll-field,
.modal-dialog--car .cf-field .year-scroll-field,
.year-scroll-field {
  flex: 1 1 auto;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  font-size: var(--fs-lg) !important;
  font-weight: var(--fw-bold) !important;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  text-align: center;
  caret-color: rgba(216, 168, 90, 0.85);
}

.date-sep {
  flex-shrink: 0;
  width: 8px;
  text-align: center;
  color: rgba(255, 255, 255, 0.32);
  font-size: var(--fs-sm);
  pointer-events: none;
  user-select: none;
}

.date-seg:focus {
  border-color: var(--input-focus-border) !important;
  box-shadow: var(--input-focus-shadow) !important;
  outline: none !important;
}

/* Footer — single slim bar */
.cf-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0 2px;
  margin-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.cf-footer__left,
.cf-footer__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cf-footer__right {
  flex-wrap: nowrap;
}

.modal-dialog--car .btn--sm {
  min-height: 40px;
  padding: 6px 16px;
  font-size: var(--fs-base);
}

.cf-status-label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-extrabold);
  background: var(--red);
  white-space: nowrap;
}

.cf-status-label--sold {
  color: #f43f5e;
}

.modal-dialog--car .cf-footer__right .elegant-switch__track {
  width: 48px;
  height: 26px;
}

.modal-dialog--car .cf-footer__right .elegant-switch__knob {
  width: 22px;
  height: 22px;
}

@media (max-width: 1100px) {
  .cf-board__row--vehicle {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .cf-field--model,
  .cf-field--year,
  .cf-field--color,
  .cf-field--plate,
  .cf-field--province,
  .cf-field--chassis {
    max-width: none;
  }

  .cf-field--chassis {
    grid-column: 1 / -1;
    min-width: 0;
    max-width: none;
  }

  .cf-trade-split {
    flex-direction: column;
    align-items: center;
  }

  .cf-trade-split .cf-zone {
    max-width: 100%;
    width: 100%;
  }

  .cf-board__row--deal {
    grid-template-columns: auto auto;
  }

  .cf-field--price,
  .cf-field--date,
  .cf-field--buyer,
  .cf-field--phone {
    max-width: none;
  }

  .cf-board__row--pay {
    flex-wrap: wrap;
  }

  .cf-pay-segments {
    flex: 1 1 100%;
    justify-content: center;
  }

  .cf-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .cf-row:last-child {
    border-bottom: none;
  }

  .cf-row--split {
    display: flex;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .cf-row--split .cf-row__half {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .cf-row--split .cf-row__half .cf-row__value {
    flex: 1;
    min-width: 0;
  }

  .cf-row__label {
    font-size: var(--fs-sm);
    font-weight: var(--fw-bold);
    color: rgba(255, 255, 255, 0.58);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .cf-row__value {
    display: flex;
    align-items: center;
    min-height: 36px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 8px;
    padding: 2px 10px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .cf-row__value:focus-within {
    border-color: var(--input-focus-border);
    box-shadow: var(--input-focus-shadow);
  }

  .cf-row__value--price {
    border-color: rgba(216, 168, 90, 0.25);
    background: rgba(216, 168, 90, 0.06);
  }

  .cf-row__value--price:focus-within {
    border-color: var(--input-focus-border);
    box-shadow: 0 0 20px rgba(216, 168, 90, 0.12), 0 0 0 1px rgba(216, 168, 90, 0.20);
  }

  .cf-row__value .unified-date-field-wrapper,
  .cf-row__value .number-input-wrapper {
    border: none !important;
    background: transparent !important;
    backdrop-filter: none !important;
    padding: 0 !important;
    box-shadow: none !important;
  }

  .cf-row__value .unified-date-field {
    width: auto;
    min-width: 140px;
    max-width: 160px;
    min-height: 32px;
    height: 32px;
  }

  .cf-row__value input,
  .cf-row__value .combo-wrap {
    width: auto;
    min-width: 80px;
  }

  .cf-install-number {
    font-size: var(--fs-md);
    font-weight: var(--fw-extrabold);
    color: #d8a85a;
    text-align: center;
    line-height: 1.3;
  }

  .cf-install-summary {
    max-width: none;
  }
}

/* ============================================================
   TYPOGRAPHY + OUTLINED BRAND MARK FINAL PASS
   ============================================================ */

body,
button,
input,
select,
textarea,
.btn,
.btn-icon,
.input,
.select,
.textarea,
.combo-item,
.combo-empty,
.data-table,
.badge {
  font-family: var(--font-family) !important;
}

.input::placeholder,
.textarea::placeholder {
  font-family: inherit;
  color: rgba(255, 255, 255, 0.35) !important;
}

body {
  background: #111;
}

.app-bg {
  background: #1a1a1a;
}

.app-bg::before {
  background: none !important;
  display: none !important;
}

.app::before {
  background: none !important;
  display: none !important;
}

/* إطفاء كافة التوهجات الدائرية والخلفية تماماً */
.header-glow,
.sidebar-glow,
.input-glow,
.app-header::before,
.header-brand::before,
.app-bg__mesh,
.app-bg__orb,
.app-bg__orb--1,
.app-bg__orb--2,
.app-bg__orb--3,
.app-bg__reflection {
  background: none !important;
  display: none !important;
  opacity: 0 !important;
}

/* إيقاف تأثيرات التوهج حول الشعارات والنصوص */
.header-side-logo,
.brand-logo-img,
.brand-logo-outline {
  filter: none !important;
}

.brand-title,
.brand-kicker,
.app-footer__text strong,
.app-footer__text span {
  text-shadow: none !important;
  -webkit-text-stroke: none !important;
  color: #fff !important;
}

.header-side-logo {
  grid-column: 1;
  justify-self: start;
  height: 118px;
  max-width: 310px;
  opacity: .96;
  filter:
    drop-shadow(0 0 1.2px rgba(255, 255, 255, 1)) drop-shadow(0 0 20px rgba(34, 197, 94, 0.55)) drop-shadow(0 0 44px rgba(34, 197, 94, 0.28));
}

.header-brand {
  width: min(760px, 100%);
  min-height: 92px;
}

.header-brand .brand-logo-img--lg {
  display: none;
}

.header-brand::before {
  inset: 0 4%;
  background: none;
}

.header-brand__text {
  gap: 8px;
}

.brand-title,
.app-footer__text strong {
  color: transparent !important;
  background: none !important;
  -webkit-text-fill-color: transparent !important;
  -webkit-text-stroke: 1.15px rgba(255, 255, 255, 0.94);
  text-shadow:
    0 0 1px rgba(255, 255, 255, 0.28),
    0 0 24px rgba(255, 255, 255, 0.10),
    0 0 38px rgba(34, 197, 94, 0.20),
    0 12px 28px rgba(0, 0, 0, 0.42);
  letter-spacing: 0;
}

.brand-title {
  font-size: clamp(var(--fs-lg), 3vw, var(--fs-xxl));
  font-weight: var(--fw-black);
  line-height: 1.05;
}

.brand-kicker,
.app-footer__text span {
  margin: 0;
  color: rgba(255, 255, 255, 0.82);
  font-size: var(--fs-sm);
  font-weight: var(--fw-extrabold);
  text-shadow: 0 0 16px rgba(34, 197, 94, 0.20);
}

.app-footer {
  gap: 22px;
}

.app-footer__text strong {
  font-size: var(--fs-md);
  font-weight: var(--fw-black);
}

.app-footer__text span {
  color: rgba(221, 227, 236, .72);
}

.nav-btn--active,
.nav-btn--active:hover,
.btn--primary {
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.15), transparent 46%),
    linear-gradient(135deg, #1a5c38 0%, #0f3d25 100%);
  box-shadow: 0 18px 42px rgba(34, 197, 94, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.18);
}

.nav-btn:hover,
.combo-item:hover,
.combo-item--active {
  background: rgba(16, 185, 129, 0.18);
}

.data-table tbody tr:hover,
.cars-tr--selected,
.cars-table-row--selected {
  background: rgba(34, 197, 94, 0.08) !important;
}

.modal-dialog--customer {
  padding: 16px;
}

.modal-dialog--car,
.modal-dialog--customer {
  background:
    radial-gradient(circle at var(--mx) var(--my), rgba(34, 197, 94, 0.07), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.045)),
    rgba(13, 18, 16, 0.80);
  box-shadow:
    0 34px 120px rgba(0, 0, 0, 0.54),
    0 0 80px rgba(34, 197, 94, 0.10),
    inset 0 1px 1px rgba(255, 255, 255, 0.12);
}

.dashboard {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.dashboard-scroll-list {
  overflow-y: auto !important;
  overflow-x: hidden;
  min-height: 0;
}

.dashboard-scroll-list::-webkit-scrollbar {
  width: 6px;
}

.dashboard-scroll-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 999px;
}

.dashboard-scroll-list::-webkit-scrollbar-thumb {
  background: rgba(212, 175, 55, 0.4);
  border-radius: 999px;
}

.dashboard-scroll-list::-webkit-scrollbar-thumb:hover {
  background: rgba(212, 175, 55, 0.6);
}

.cash-register-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 20px 20px 10px 20px !important;
}

.cash-register-section .table-wrapper {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}

.car-dialog-panel__header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px 14px 0 0;
  flex-shrink: 0;
}

.car-dialog-panel__header-start {
  display: flex;
  align-items: center;
  gap: 14px;
}

.car-dialog-panel__icon {
  padding: 8px 12px;
  background: color-mix(in srgb, var(--smiles-bg), transparent 94%);
  border: 1px solid color-mix(in srgb, var(--smiles-bg), transparent 82%);
  color: var(--smiles);
  border-radius: 10px;
  font-size: var(--fs-lg);
  line-height: 1;
}

.car-dialog-panel__title {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: var(--fw-extrabold);
  color: var(--text-primary);
  line-height: 1.3;
}

.car-dialog-panel__desc {
  margin: 3px 0 0;
  font-size: var(--fs-xs);
  color: rgba(255, 255, 255, 0.48);
}

.car-dialog-panel__close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.48);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s, color 0.2s;
  flex-shrink: 0;
}

.car-dialog-panel__close:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.88);
}

.car-dialog-panel__body {
  padding: 0 24px 24px;
  overflow-y: auto;
  flex: 1;
}

.car-dialog-panel__body::-webkit-scrollbar {
  width: 6px;
}

.car-dialog-panel__body::-webkit-scrollbar-track {
  background: rgba(9, 11, 16, 0.4);
  border-radius: 999px;
}

.car-dialog-panel__body::-webkit-scrollbar-thumb {
  background: rgba(34, 197, 94, 0.6);
  border-radius: 999px;
}

.car-dialog-panel__body::-webkit-scrollbar-thumb:hover {
  background: rgba(193, 18, 36, 0.8);
}

/* ── Car Dashboard (two-page grid layout) ── */
.car-dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  position: relative;
  box-shadow:
    0 0 60px rgba(216, 168, 90, 0.04),
    0 0 120px rgba(216, 168, 90, 0.02),
    inset 0 0 80px rgba(216, 168, 90, 0.01);
}

.car-dashboard__tabs {
  display: flex;
  background: var(--bg-subtle);
  padding: 4px;
  border-radius: var(--r-xs);
  gap: 12px;
  width: 100%;
  max-width: 580px;
  align-self: center;
}

.car-dashboard__tab {
  flex: 1;
  padding: 7px 16px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: background 0.2s, color 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.car-dashboard__tab:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.car-dashboard__tab--car-active {
  background: var(--red);
  color: #fff;
  box-shadow: 0 4px 20px rgba(22, 163, 74, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.10);
}

.car-dashboard__tab--car-active:hover {
  background: var(--red);
  color: #fff;
}

.car-dashboard__tab--sale-active {
  background: var(--red);
  color: #fff;
  box-shadow: 0 4px 20px rgba(216, 168, 90, 0.25), 0 0 30px rgba(216, 168, 90, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.car-dashboard__tab--sale-active:hover {
  background: var(--red);
  color: #fff;
}

.car-dashboard__page {
  animation: modal-fade .2s ease-out;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.car-dashboard__grid {
  display: grid;
  gap: 16px;
  min-height: 410px;
}

.car-dashboard__grid--2col {
  grid-template-columns: 1fr 1fr;
}

.car-dashboard__grid--3col {
  grid-template-columns: 1fr 1fr 1fr;
}

.car-dashboard__grid--muted .car-dashboard__card {
  opacity: 0.6;
  pointer-events: none;
}

.car-dashboard__card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  padding: 20px;
}

.car-dashboard__card--car {
  background: var(--red);
  border-color: rgba(34, 197, 94, 0.15);
  box-shadow:
    0 0 30px rgba(34, 197, 94, 0.04),
    0 0 60px rgba(34, 197, 94, 0.02),
    inset 0 0 80px rgba(34, 197, 94, 0.02);
}

.car-dashboard__card--sale {
  background: var(--red);
  border-color: rgba(22, 163, 74, 0.15);
  box-shadow:
    0 0 30px rgba(22, 163, 74, 0.08),
    0 0 60px rgba(22, 163, 74, 0.04),
    inset 0 0 80px rgba(22, 163, 74, 0.03);
}

.car-dashboard__card--sale-red {
  background: var(--red);
  border-color: rgba(216, 168, 90, 0.18);
  box-shadow:
    0 0 30px rgba(216, 168, 90, 0.06),
    0 0 60px rgba(216, 168, 90, 0.03),
    0 0 100px rgba(216, 168, 90, 0.02),
    inset 0 0 80px rgba(216, 168, 90, 0.03);
}

.car-dashboard__card--expense-red {
  background: var(--red);
  border-color: rgba(239, 68, 68, 0.18) !important;
  box-shadow:
    0 0 30px rgba(239, 68, 68, 0.06),
    0 0 60px rgba(239, 68, 68, 0.03),
    inset 0 0 80px rgba(239, 68, 68, 0.03);
}

.car-dashboard__card--notes {
  background: rgba(148, 163, 184, 0.05);
  border-color: rgba(148, 163, 184, 0.12);
  box-shadow: 0 0 24px rgba(148, 163, 184, 0.05), inset 0 0 60px rgba(148, 163, 184, 0.03);
}

.car-dashboard__card--full {
  grid-column: 1 / -1;
}

.car-dashboard__card-title {
  margin: 0 0 16px;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.car-dashboard__card-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.car-dashboard__card-body .cf-row,
.car-dashboard__card-body .cf-row--split {
  grid-column: 1 / -1;
}

.car-dashboard__card-body--3col {
  grid-template-columns: 1fr 1fr 1fr;
}

.car-dashboard__card-body--2col {
  grid-template-columns: 1fr 1fr;
}

.car-dashboard__card-body--2col .cf-field--span2 {
  grid-column: 1 / -1;
}

.car-dashboard__card-body--single {
  display: flex;
  flex-direction: column;
}

.car-dashboard__card-body .cf-field {
  max-width: none;
  align-items: stretch;
}

.car-dashboard__card-body .cf-field--price {
  max-width: 200px;
}

.car-dashboard__card-body .cf-field--chassis {
  min-width: 0;
  grid-column: span 2;
}

.car-dashboard__card-body .cf-field--full {
  grid-column: 1 / -1;
}

.car-dashboard__card-body .cf-label {
  text-align: start;
}

.cf-price-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.cf-price-wrap .input {
  padding-right: 72px !important;
  width: 100%;
}

.cf-currency-group {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.20);
  border-radius: 5px;
  padding: 2px;
}

.cf-currency-opt {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  padding: 3px 7px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  font-family: inherit;
  color: rgba(255, 255, 255, 0.40);
  background: transparent;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, box-shadow 0.2s;
  min-width: 30px;
  line-height: 1.3;
  user-select: none;
}

.cf-currency-opt:hover {
  color: rgba(255, 255, 255, 0.70);
  background: rgba(255, 255, 255, 0.06);
}

.cf-currency-opt--active {
  color: #fff;
  background: var(--red);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.20);
}

.cf-currency-opt--active:hover {
  background: var(--red);
  color: #fff;
}

.cf-currency-opt:focus-visible {
  outline: none;
  box-shadow: var(--input-focus-shadow);
}

.car-dashboard__actions {
  display: flex;
  justify-content: flex-start;
  gap: 12px;
  padding-top: 10px;
  padding-bottom: 10px;
}

/* ── صفحات نموذج السيارة ── */
.car-form-page {
  animation-fill-mode: both;
  will-change: transform, opacity;
}

.car-form-page--up {
  animation: page-slide-up 0.42s cubic-bezier(0.32, 0.72, 0, 1) both;
}

.car-form-page--down {
  animation: page-slide-down 0.42s cubic-bezier(0.32, 0.72, 0, 1) both;
}

.car-dashboard__actions .btn {
  min-width: 0;
}

@media (max-width: 900px) {

  .car-dashboard__grid--2col,
  .car-dashboard__grid--3col {
    grid-template-columns: 1fr;
  }
}

.partner-form-panel {
  height: min(820px, calc(100vh - 158px));
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0;
}

.partner-form-panel .car-form-panel__header {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 0 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
}

.partner-identity-form {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(220px, 1.25fr) minmax(180px, .75fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
}

.partner-identity-form .car-form-panel__actions {
  grid-column: 1 / -1;
  padding-top: 2px;
}

.partner-form-panel {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: flex-start;
}

.partner-summary-sidebar {
  flex: 0 0 220px;
  min-width: 0;
  position: sticky;
  top: 0;
  direction: rtl;
  padding: 10px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.partner-summary-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.partner-summary-field__label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.5px;
}

.partner-summary-field__value {
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  color: #fff;
}

.partner-summary-field__value--total {
  color: var(--gold, #f59e0b);
}

.partner-summary-field__value--paid {
  background: var(--red);
}

.partner-summary-field__value--remaining {
  color: var(--danger, #dc3545);
}

.partner-summary-field__value--installment {
  color: #60a5fa;
}

.partner-sidebar-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.sidebar-form-actions {
  display: flex;
  gap: 6px;
  justify-content: stretch;
}

.sidebar-form-actions .btn {
  flex: 1;
}



.sidebar-dates .form-group {
  gap: 4px;
}

.partner-main-content {
  flex: 1;
  min-width: 0;
}

.partner-details {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.partner-tx-form {
  direction: rtl;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background:
    radial-gradient(220px circle at 50% 0%, rgba(97, 3, 11, 0.16), transparent 62%),
    rgba(255, 255, 255, 0.035);
  transition: border-color .2s ease, background .2s ease, box-shadow .2s ease;
}

.partner-tx-form--deposit {
  border-color: rgba(85, 245, 170, 0.22);
  background:
    radial-gradient(260px circle at 50% 0%, rgba(85, 245, 170, 0.14), transparent 62%),
    rgba(85, 245, 170, 0.045);
}

.partner-tx-form--withdraw {
  border-color: rgba(255, 107, 107, 0.24);
  background:
    radial-gradient(260px circle at 50% 0%, rgba(255, 107, 107, 0.16), transparent 62%),
    rgba(255, 107, 107, 0.050);
}

.partner-transactions-panel {
  direction: rtl;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
}

.partner-section-title {
  margin: 0;
  font-size: var(--fs-base);
  line-height: 1.35;
  font-weight: var(--fw-black);
  color: rgba(255, 255, 255, 0.92);
  text-align: center;
}

.identity-lock-input[readonly] {
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  caret-color: transparent;
  border-color: rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025)),
    rgba(255, 255, 255, 0.035);
}

.identity-lock-input:not([readonly]) {
  border-color: rgba(216, 168, 90, 0.48);
  box-shadow: 0 0 0 3px rgba(216, 168, 90, 0.10);
}

.partner-tx-details-row {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 12px;
}

.partner-notes-input {
  resize: vertical;
  min-height: 60px;
  padding: 10px 12px;
  font-family: inherit;
  line-height: 1.5;
}

.partner-date-time-row {
  display: grid;
  grid-template-columns: 1fr 130px;
  gap: 12px;
}

.partner-date-segments {
  display: flex;
  align-items: center;
  gap: 2px;
  direction: ltr;
}

.partner-date-seg {
  flex: 1;
  min-width: 0;
  text-align: center;
  direction: ltr;
  unicode-bidi: embed;
  font-family: var(--font-mono) !important;
  font-variant-numeric: tabular-nums;
  letter-spacing: .03em;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.035)),
    rgba(8, 9, 13, 0.70);
  border-color: rgba(255, 255, 255, 0.13);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08);
  transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
  padding: 0 4px;
  caret-color: rgba(216, 168, 90, 0.8);
  -webkit-user-select: text;
  user-select: text;
}

.partner-date-seg:focus {
  border-color: var(--input-focus-border);
  box-shadow: var(--input-focus-shadow);
  transform: translateY(-1px);
  outline: none;
}

.partner-date-sep {
  flex-shrink: 0;
  width: 10px;
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}

.btn--withdraw {
  color: var(--text-primary);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.03)),
    rgba(165, 32, 45, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 18px 42px rgba(165, 32, 45, 0.28),
    inset 0 1px 1px rgba(255, 255, 255, 0.16);
}

.btn--withdraw:hover:not(:disabled) {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)),
    rgba(192, 45, 58, 0.96);
}

.btn--amber {
  color: var(--text-primary);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.03)),
    rgba(184, 134, 11, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 18px 42px rgba(184, 134, 11, 0.28),
    inset 0 1px 1px rgba(255, 255, 255, 0.16);
}

.btn--amber:hover:not(:disabled) {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)),
    rgba(207, 157, 22, 0.96);
}

.partner-tx-wrapper {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.partner-tx-wrapper .data-table {
  table-layout: fixed;
  min-width: 720px;
}

.partner-tx-wrapper .data-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--table-header-bg, #4d000a) !important;
  border-bottom: var(--hidod) !important;
  color: #ffffff !important;
  font-weight: var(--fw-extrabold) !important;
  font-size: var(--table-header-font-size, 20px) !important;
  padding: var(--table-header-padding, 12px 14px) !important;
}

.partner-tx-wrapper .data-table .col-seq {
  width: 50px !important;
  min-width: 50px !important;
  max-width: 50px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-date {
  width: 200px !important;
  min-width: 200px !important;
  max-width: 200px !important;
  direction: ltr !important;
  unicode-bidi: embed !important;
  text-align: center !important;
  font-family: var(--font-mono) !important;
  font-variant-numeric: tabular-nums !important;
}

.partner-tx-wrapper .data-table .col-type {
  width: 200px !important;
  min-width: 250px !important;
  max-width: 200px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-account {
  width: 100px !important;
  min-width: 100px !important;
  max-width: 100px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-amount {
  width: 136px !important;
  min-width: 136px !important;
  max-width: 136px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-notes {
  width: auto !important;
}

.partner-tx-wrapper .data-table .col-actions {
  width: 40px !important;
  min-width: 40px !important;
  max-width: 40px !important;
  text-align: center !important;
}

.inline-confirm-label {
  font-size: var(--fs-xs);
  color: #ff7a7a;
  font-weight: var(--fw-medium);
  margin-left: 2px;
}

.inline-confirm-yes,
.inline-confirm-no {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--fs-sm);
  padding: 3px 5px;
  border-radius: 4px;
  line-height: 1;
  transition: all 0.15s ease;
}

.inline-confirm-yes {
  background: var(--red);
}

.inline-confirm-yes:hover {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.inline-confirm-no {
  color: #f87171;
}

.inline-confirm-no:hover {
  background: rgba(248, 113, 113, 0.2);
  color: #fca5a5;
}

/* ── شارة مكتمل ── */
.badge--complete {
  background: rgba(251, 191, 36, 0.15) !important;
  color: #fbbf24 !important;
  font-weight: var(--fw-bold);
  font-size: var(--fs-xs);
  padding: 2px 10px;
  border-radius: 10px;
  letter-spacing: 0.3px;
}

/* ── عداد الدفعة القادمة ── */
.countdown-badge {
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  background: var(--red);
  white-space: nowrap;
}

.countdown-badge--overdue {
  color: var(--red);
}

.countdown-badge--due-today {
  color: #f59e0b;
}

.countdown-badge--upcoming {
  background: var(--red);
}

.partner-tx-row {
  position: relative;
  cursor: pointer;
  transition: background .18s ease, transform .18s ease;
}

.partner-tx-row--deposit {
  background: rgba(16, 185, 129, 0.04) !important;
}

.partner-tx-row--deposit td:first-child {
  border-right: 4px solid #10b981 !important;
}

.partner-tx-row--deposit:hover {
  background: rgba(16, 185, 129, 0.08) !important;
  transform: translateY(-1px);
}

.partner-tx-row--withdraw {
  background: rgba(239, 68, 68, 0.04) !important;
}

.partner-tx-row--withdraw td:first-child {
  border-right: 4px solid #f43f5e !important;
}

.partner-tx-row--withdraw:hover {
  background: rgba(239, 68, 68, 0.08) !important;
  transform: translateY(-1px);
}

/* Transaction Type Badges */
.tx-type-withdraw {
  color: #d8a85a !important;
  /* Gold */
  font-weight: var(--fw-bold) !important;
  font-size: var(--fs-base);
}

.tx-type-deposit {
  color: #10b981 !important;
  /* Green */
  font-weight: var(--fw-bold) !important;
  font-size: var(--fs-base);
}

/* Editable Summary Sidebar Inputs & Save Button */
.partner-sidebar-input {
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: var(--all-radius) !important;
  padding: 8px 12px !important;
  color: #fff !important;
  font-size: var(--fs-base) !important;
  font-weight: var(--fw-bold) !important;
  width: 100% !important;
  box-sizing: border-box !important;
  transition: all 0.2s ease !important;
}


.partner-empty-state {
  flex: 1 1 auto;
  min-height: 230px;
  display: grid;
  place-items: center;
  margin: 0;
}



.partners-toolbar {
  position: relative !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  min-height: 78px;
  padding-inline: 180px;
  gap: 8px;
}

.partners-toolbar-cards {
  position: absolute !important;
  inset-inline-end: 10px !important;
  inset-inline-start: auto !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  display: flex;
  gap: 12px;
}

.partners-title {
  grid-column: 2;
  grid-row: 1;
  justify-self: center;
  margin: 0;
  font-size: clamp(var(--fs-lg), 2.1vw, var(--fs-xxl));
  line-height: 1.05;
  font-weight: var(--fw-black);
  color: rgba(255, 255, 255, 0.74);
  text-shadow:
    0 0 18px rgba(255, 255, 255, 0.18),
    0 0 38px rgba(216, 168, 90, 0.18),
    0 12px 34px rgba(0, 0, 0, 0.34);
  letter-spacing: 0;
  border: 0;
  padding: 0;
}

.customers-toolbar:has(.partners-title) {
  grid-template-columns: none;
}

@media (max-width: 900px) {
  .modal-dialog--partner {
    width: min(100%, calc(100vw - 24px));
    max-height: calc(100vh - 118px);
    padding: 16px;
  }

  .partner-form-panel {
    flex-direction: column;
  }

  .partner-summary-sidebar {
    flex: none;
    width: 100%;
    position: static;
  }

  .partner-tx-wrapper,
  .partner-empty-state {
    min-height: 240px;
  }

  .partners-toolbar {
    min-height: 120px;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    padding-inline: 20px !important;
    gap: 12px !important;
  }

  .partners-toolbar-buttons,
  .partners-toolbar-cards {
    position: static !important;
    transform: none !important;
    justify-content: center !important;
  }
}

@media (max-width: 620px) {
  .app-footer {
    flex-direction: column;
    align-items: center;
  }
}

/* ============================================================
   VERTICAL SIDEBAR
   ============================================================ */
.app-sidebar {
  position: relative;
  align-self: stretch;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 12px;
  margin-bottom: 0px;
  border-radius: var(--all-radius);
  border: var(--hidod);
  background: var(--backkground-secondary);
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate));
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate));
  box-shadow:
    var(--shadow-lg),
    inset 0 0 10px rgba(216, 168, 90, 0.04);
  overflow: hidden;
  z-index: 10;
}

.sidebar-glow {
  position: absolute;
  top: -20%;
  right: -10%;
  width: 60%;
  height: 100%;
  background:
    radial-gradient(circle, rgba(34, 197, 94, 0.07) 0%, transparent 64%),
    radial-gradient(circle at 65% 35%, rgba(216, 168, 90, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.sidebar-header {
  display: flex;
  justify-content: center;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  z-index: 1;
}

.sidebar-logo {
  height: 80px;
  max-width: 196px;
  width: 196px;
  filter: none;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
  z-index: 1;
}

.app-sidebar .nav-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  border-radius: var(--all-radius);
  padding: 10px 14px;
  font-size: var(--fs-sidebar);
  height: 52px;
  box-sizing: border-box;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.app-sidebar .nav-btn__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  font-size: 1.3rem;
  color: var(--smiles) !important;
}

.app-sidebar .nav-btn__label {
  flex: 1;
  text-align: right;
  letter-spacing: 0.02em;
  font-weight: var(--fw-bold);
}

.app-sidebar .nav-btn:hover {
  background: var(--red);
  border: 1px solid rgba(216, 168, 90, 0.40);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
  color: #fff;
}

.app-sidebar .nav-btn--active {
  background: var(--red);
  border: 1px solid rgba(216, 168, 90, 0.6) !important;
  box-shadow:
    0 0 24px rgba(216, 168, 90, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.10) !important;
  color: #ffffff !important;
  transform: none;
}

.app-sidebar .nav-btn--active:hover {
  background: var(--red);
  border: 1px solid rgba(216, 168, 90, 0.8) !important;
  box-shadow:
    0 0 32px rgba(216, 168, 90, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.15) !important;
  transform: translateY(-1px);
  color: #ffffff !important;
}

/* ============================================================
   APP CONTENT
   ============================================================ */
.app-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow: hidden;
  flex: 1;
}

.app-content .loading-state {
  flex: 1;
}

@media (max-width: 820px) {
  .app {
    grid-template-columns: 1fr;
    padding: 14px 16px 22px;
  }

  .app-sidebar {
    position: static;
    width: 100%;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid rgba(216, 168, 90, 0.12);
  }

  .app-sidebar::before,
  .app-sidebar::after {
    display: none !important;
  }

  .sidebar-header {
    padding: 0;
    border: none;
    flex-shrink: 0;
  }

  .sidebar-logo {
    height: 60px;
    max-width: 140px;
  }

  .sidebar-nav {
    flex-direction: row;
    flex: 1;
    gap: 3px;
  }

  .app-sidebar .nav-btn {
    padding: 8px 10px;
    font-size: var(--fs-sm);
    flex: 1;
    min-width: 0;
    height: auto;
  }

  .app-sidebar .nav-btn__label {
    font-size: var(--fs-xs);
    flex: 1;
    text-align: center;
  }
}

/* ══════════════════════════════════════════════
   SCROLLBAR — جدول ديون العملاء
   ══════════════════════════════════════════════ */
.partner-debtors-scroll {
  flex: 1;
  min-height: 0;
  max-height: none !important;
}

.partner-debtors-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.partner-debtors-scroll::-webkit-scrollbar-track {
  background: rgba(9, 11, 16, 0.6);
  border-radius: 999px;
}

.partner-debtors-scroll::-webkit-scrollbar-thumb {
  background: #1a5c38;
  border-radius: 999px;
}

.partner-debtors-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--gold);
}

/* ══════════════════════════════════════════════
   FADE IN ANIMATION — النوافذ المنبثقة
   ══════════════════════════════════════════════ */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-fade-in {
  animation: fadeIn 0.25s ease-out forwards;
}

/* ══════════════════════════════════════════════
   CAR FORM MODAL — Unified overlay structure
   ══════════════════════════════════════════════ */
.car-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 16px;
}

.car-modal {
  width: 100%;
  max-width: 1000px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at var(--mx) var(--my), rgba(97, 3, 11, 0.18), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.030)),
    rgba(10, 11, 16, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 14px;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.48),
    inset 0 1px 1px rgba(255, 255, 255, 0.10);
  transition: all 0.2s;
  animation: fadeIn 0.2s ease-out;
}

.car-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  border-radius: 14px 14px 0 0;
  flex-shrink: 0;
}

.car-modal__header-start {
  display: flex;
  align-items: center;
  gap: 10px;
}

.car-modal__icon {
  font-size: var(--fs-lg);
  line-height: 1;
  color: var(--smiles);
}

.car-modal__title {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: var(--fw-extrabold);
  color: rgba(255, 255, 255, 0.92);
}

.car-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition: background .15s, color .15s;
}

.car-modal__close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.88);
}

.car-modal__close svg {
  width: 18px;
  height: 18px;
}

.car-modal__body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.car-modal__body::-webkit-scrollbar {
  width: 6px;
}

.car-modal__body::-webkit-scrollbar-track {
  background: rgba(9, 11, 16, 0.4);
  border-radius: 999px;
}

.car-modal__body::-webkit-scrollbar-thumb {
  background: rgba(34, 197, 94, 0.6);
  border-radius: 999px;
}

.car-modal__body::-webkit-scrollbar-thumb:hover {
  background: rgba(193, 18, 36, 0.8);
}

.car-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 14px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  border-radius: 0 0 14px 14px;
  flex-shrink: 0;
}

.car-modal__footer .btn {
  min-height: 40px;
  padding: 8px 20px;
  font-size: var(--fs-base);
}

.btn--secondary-gray {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.btn--secondary-gray:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.20);
}

@media (max-height: 700px) {
  .car-modal {
    max-height: 98vh;
  }

  .car-modal__header {
    padding: 10px 18px;
  }

  .car-modal__title {
    font-size: var(--fs-base);
  }

  .car-modal__body {
    padding: 12px 16px;
  }

  .car-modal__footer {
    padding: 10px 18px;
  }
}

@media (max-width: 640px) {
  .car-overlay {
    padding: 8px;
    align-items: flex-start;
    padding-top: 20px;
  }

  .car-modal {
    max-height: calc(100vh - 28px);
    border-radius: 12px;
  }

  .car-modal__header {
    padding: 10px 14px;
  }

  .car-modal__body {
    padding: 10px 12px;
  }

  .car-modal__footer {
    padding: 10px 14px;
  }
}

.car-form-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.68);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  padding: 16px;
  overflow-y: auto;
}

.car-form-modal {
  width: 100%;
  max-width: 1260px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at var(--mx) var(--my), rgba(97, 3, 11, 0.18), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.045)),
    rgba(10, 11, 16, 0.80);
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 20px;
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    0 34px 120px rgba(0, 0, 0, 0.54),
    0 0 80px rgba(97, 3, 11, 0.20),
    inset 0 1px 1px rgba(255, 255, 255, 0.12);
  margin: auto;
  transition: all 0.3s;
  animation: modal-sweep .42s cubic-bezier(0.16, 1, 0.3, 1);
}

.car-form-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  min-height: 56px;
}

.car-form-modal__title {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: var(--fw-extrabold);
  color: rgba(255, 255, 255, 0.94);
  line-height: 1.3;
}

.car-form-modal__close {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.88);
  font-size: var(--fs-lg);
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .2s, border-color .2s;
  flex-shrink: 0;
}

.car-form-modal__close:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.22);
}

.car-form-modal__body {
  overflow-y: auto;
  flex: 1;
  padding: 16px 20px;
  min-height: 0;
}

.car-form-modal__body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.car-form-modal__body::-webkit-scrollbar-track {
  background: rgba(9, 11, 16, 0.4);
  border-radius: 999px;
}

.car-form-modal__body::-webkit-scrollbar-thumb {
  background: rgba(34, 197, 94, 0.6);
  border-radius: 999px;
}

.car-form-modal__body::-webkit-scrollbar-thumb:hover {
  background: rgba(193, 18, 36, 0.8);
}

.car-form-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.car-form-modal__footer .btn {
  min-height: 40px;
  padding: 8px 22px;
  font-size: var(--fs-base);
}

@media (max-height: 700px) {
  .car-form-modal {
    max-height: 98vh;
  }

  .car-form-modal__header {
    padding: 10px 18px;
    min-height: 44px;
  }

  .car-form-modal__title {
    font-size: var(--fs-base);
  }

  .car-form-modal__body {
    padding: 10px 14px;
  }

  .car-form-modal__footer {
    padding: 8px 18px;
  }
}

@media (max-width: 768px) {
  .car-form-overlay {
    padding: 8px;
    align-items: flex-start;
    padding-top: 12px;
  }

  .car-form-modal {
    max-height: calc(100vh - 16px);
    border-radius: 14px;
  }

  .car-form-modal__header {
    padding: 10px 14px;
  }

  .car-form-modal__body {
    padding: 8px 10px;
  }

  .car-form-modal__footer {
    padding: 8px 14px;
  }
}

/* Custom styling for expanded partner details dialog */
.modal-dialog--partner {
  max-width: min(1380px, calc(100vw - 32px)) !important;
}

.partner-tx-wrapper .data-table {
  table-layout: auto !important;
  /* Allow dynamic spacing but respect min-widths */
}

.partner-tx-wrapper .data-table .col-seq {
  width: 50px !important;
  min-width: 50px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-date {
  width: 200px !important;
  min-width: 200px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-time {
  width: 90px !important;
  min-width: 90px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-account {
  width: 110px !important;
  min-width: 110px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-amount {
  width: 140px !important;
  min-width: 200px !important;
  text-align: center !important;
}

.partner-tx-wrapper .data-table .col-notes {
  width: auto !important;
}

.partner-tx-wrapper .data-table .col-actions {
  width: 48px !important;
  min-width: 48px !important;
  text-align: center !important;
}

/* Account badge styling in transactions list */
.account-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  display: inline-block;
}

.account-badge--qasa {
  background: rgba(216, 168, 90, 0.15);
  color: #d8a85a;
  border: 1px solid rgba(216, 168, 90, 0.25);
}

.account-badge--master {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.account-badge--bank {
  background: rgba(16, 185, 129, 0.15);
  background: var(--red);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

/* سجل حركات الحساب */
@media (min-width: 901px) {
  .modal-dialog--partner {
    height: calc(100vh - 120px) !important;
    max-height: calc(85vh - 28px) !important;
    display: flex !important;
    flex-direction: column !important;
    border-radius: 20px !important;
    padding: 24px !important;
    box-shadow:
      0 34px 120px rgba(0, 0, 0, 0.6),
      0 0 100px rgba(34, 197, 94, 0.10),
      inset 0 1px 1px rgba(255, 255, 255, 0.15) !important;
  }

  .modal-dialog--partner .partner-form-panel {
    display: flex !important;
    flex-direction: row !important;
    gap: 24px !important;
    align-items: stretch !important;
    flex: 1 !important;
    min-height: 0 !important;
    height: 100% !important;
  }

  .modal-dialog--partner .partner-summary-sidebar {
    flex: 0 0 260px !important;
    position: relative !important;
    height: 100% !important;
    border-left: 1px solid rgba(255, 255, 255, 0.08) !important;
    padding-left: 20px !important;
    border-right: none !important;
    padding-right: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
    overflow-y: auto !important;
  }

  .modal-dialog--partner .partner-summary-field {
    display: flex !important;
    flex-direction: column !important;
    gap: 6px !important;
    padding: 14px 18px !important;
    border-radius: 12px !important;
    background: rgba(255, 255, 255, 0.02) !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.02) !important;
  }

  .modal-dialog--partner .partner-summary-field:hover {
    background: rgba(255, 255, 255, 0.04) !important;
    border-color: rgba(255, 255, 255, 0.10) !important;
    transform: translateY(-2px);
    box-shadow:
      0 4px 15px rgba(0, 0, 0, 0.2),
      inset 0 1px 2px rgba(255, 255, 255, 0.04) !important;
  }

  .modal-dialog--partner .partner-summary-field__label {
    font-size: var(--fs-sm) !important;
    font-weight: var(--fw-bold) !important;
    color: rgba(255, 255, 255, 0.45) !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4) !important;
  }

  .modal-dialog--partner .partner-summary-field__value {
    font-size: var(--fs-md) !important;
    font-weight: var(--fw-extrabold) !important;
    color: rgba(255, 255, 255, 0.95) !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2) !important;
  }

  .modal-dialog--partner .partner-summary-field__value--total {
    color: #38bdf8 !important;
    text-shadow: 0 0 10px rgba(56, 189, 248, 0.2) !important;
  }

  .modal-dialog--partner .partner-summary-field__value--paid {
    color: #34d399 !important;
    text-shadow: 0 0 10px rgba(52, 211, 153, 0.2) !important;
  }

  .modal-dialog--partner .partner-summary-field__value--remaining {
    color: #f87171 !important;
    text-shadow: 0 0 10px rgba(248, 113, 113, 0.2) !important;
  }

  .modal-dialog--partner .partner-summary-field__value--installment {
    color: #fbbf24 !important;
    text-shadow: 0 0 10px rgba(251, 191, 36, 0.2) !important;
  }

  .modal-dialog--partner .partner-main-content {
    flex: 1 !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    height: 100% !important;
  }

  .modal-dialog--partner .partner-transactions-panel {
    flex: 1 !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    margin-top: 12px !important;
    padding: 20px !important;
    border-radius: 16px !important;
    background: rgba(255, 255, 255, 0.015) !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
  }

  .modal-dialog--partner .partner-section-title {
    font-size: var(--fs-md) !important;
    font-weight: var(--fw-extrabold) !important;
    letter-spacing: 0.5px !important;
    color: rgba(255, 255, 255, 0.95) !important;
    margin-bottom: 12px !important;
  }

  .modal-dialog--partner .partner-tx-wrapper {
    flex: 1 !important;
    overflow-y: auto !important;
    margin-top: 10px !important;
    border-radius: 12px !important;
    border: 1px solid rgba(255, 255, 255, 0.04) !important;
    background: rgba(0, 0, 0, 0.2) !important;
  }


}

/* ── Slim Partner Dialog overrides ── */
.modal-dialog--slim {
  max-width: 450px !important;
  width: 100% !important;
  height: auto !important;
  max-height: 90vh !important;
  background:
    radial-gradient(circle at var(--mx) var(--my), rgba(34, 197, 94, 0.07), transparent 36%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.025)),
    rgba(20, 26, 24, 0.60) !important;
  border: 1px solid rgba(255, 255, 255, 0.13) !important;
  backdrop-filter: blur(24px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
  box-shadow:
    0 34px 120px rgba(0, 0, 0, 0.52),
    0 0 70px rgba(34, 197, 94, 0.10),
    inset 0 1px 1px rgba(255, 255, 255, 0.12) !important;
}

.partner-form-panel--slim {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0;
  height: auto !important;
}

.partner-form-panel--slim .partner-identity-form {
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
}

/* ============================================================
   DEBTS MODULE GOLD & GREEN THEMES (GLASSMORPHISM & ACCENTS)
   ============================================================ */

/* Gold theme (Payables / علينا) */
.modal-dialog--gold-theme {
  background:
    radial-gradient(circle at 10% 10%, rgba(216, 168, 90, 0.15), transparent 40%),
    radial-gradient(circle at 90% 90%, rgba(216, 168, 90, 0.08), transparent 45%),
    linear-gradient(135deg, rgba(20, 24, 33, 0.65), rgba(10, 12, 16, 0.85)) !important;
  border: 1px solid rgba(216, 168, 90, 0.25) !important;
  box-shadow:
    0 34px 120px rgba(0, 0, 0, 0.65),
    0 0 80px rgba(216, 168, 90, 0.14),
    inset 0 1px 2px rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(30px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(30px) saturate(180%) !important;
}

.modal-dialog--gold-theme .partner-transactions-panel {
  background: rgba(216, 168, 90, 0.015) !important;
  border: 1px solid rgba(216, 168, 90, 0.06) !important;
}

.modal-dialog--gold-theme .partner-summary-field {
  background: rgba(216, 168, 90, 0.02) !important;
  border: 1px solid rgba(216, 168, 90, 0.08) !important;
}

.modal-dialog--gold-theme .partner-summary-field:hover {
  background: rgba(216, 168, 90, 0.05) !important;
  border-color: rgba(216, 168, 90, 0.18) !important;
  box-shadow:
    0 4px 15px rgba(216, 168, 90, 0.05),
    inset 0 1px 2px rgba(255, 255, 255, 0.04) !important;
}

.modal-dialog--gold-theme .partner-summary-field__value--total {
  color: #d8a85a !important;
  text-shadow: 0 0 10px rgba(216, 168, 90, 0.3) !important;
}

/* Green theme (Receivables / لنا) */
.modal-dialog--green-theme {
  background:
    radial-gradient(circle at 10% 10%, rgba(34, 197, 94, 0.15), transparent 40%),
    radial-gradient(circle at 90% 90%, rgba(34, 197, 94, 0.08), transparent 45%),
    linear-gradient(135deg, rgba(20, 24, 33, 0.65), rgba(10, 12, 16, 0.85)) !important;
  border: 1px solid rgba(34, 197, 94, 0.25) !important;
  box-shadow:
    0 34px 120px rgba(0, 0, 0, 0.65),
    0 0 80px rgba(34, 197, 94, 0.14),
    inset 0 1px 2px rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(30px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(30px) saturate(180%) !important;
}

.modal-dialog--green-theme .partner-transactions-panel {
  background: rgba(34, 197, 94, 0.015) !important;
  border: 1px solid rgba(34, 197, 94, 0.06) !important;
}

.modal-dialog--green-theme .partner-summary-field {
  background: rgba(34, 197, 94, 0.02) !important;
  border: 1px solid rgba(34, 197, 94, 0.08) !important;
}

.modal-dialog--green-theme .partner-summary-field:hover {
  background: rgba(34, 197, 94, 0.05) !important;
  border-color: rgba(34, 197, 94, 0.18) !important;
  box-shadow:
    0 4px 15px rgba(34, 197, 94, 0.05),
    inset 0 1px 2px rgba(255, 255, 255, 0.04) !important;
}

.modal-dialog--green-theme .partner-summary-field__value--total {
  color: #22c55e !important;
  text-shadow: 0 0 10px rgba(34, 197, 94, 0.3) !important;
}

/* Accent visual theme effects for the main content card based on tab */
.main-card--us-theme {
  background:
    radial-gradient(circle at 50% 0%, rgba(34, 197, 94, 0.05), transparent 50%),
    rgba(20, 24, 33, 0.45) !important;
  border: 1px solid rgba(34, 197, 94, 0.18) !important;
  border-top: 3px solid #22c55e !important;
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.5),
    0 0 35px rgba(34, 197, 94, 0.04),
    inset 0 1px 1px rgba(255, 255, 255, 0.05) !important;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.main-card--them-theme {
  background:
    radial-gradient(circle at 50% 0%, rgba(216, 168, 90, 0.05), transparent 50%),
    rgba(20, 24, 33, 0.45) !important;
  border: 1px solid rgba(216, 168, 90, 0.18) !important;
  border-top: 3px solid #d8a85a !important;
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.5),
    0 0 35px rgba(216, 168, 90, 0.04),
    inset 0 1px 1px rgba(255, 255, 255, 0.05) !important;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* Fullscreen mode for car form pages */
.app.app--fullscreen {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  padding: 0;
  gap: 0;
  height: 100%;
  overflow: hidden;
}

.app.app--fullscreen .app-sidebar,
.app.app--fullscreen .app-footer {
  display: none !important;
}

.app.app--fullscreen .app-content {
  height: 100%;
  gap: 0;
}

/* ════════════════════════════════════════════════════════════
   SHOWROOM (المعرض) TAB TYPOGRAPHY UNIFICATION
   ════════════════════════════════════════════════════════════ */

/* Force all headers, cells, and their contents inside the cars table to use Cairo and 1.05rem */
.cars-data-table th,
.cars-data-table td,
.cars-data-table th *,
.cars-data-table td * {
  font-family: var(--font-family) !important;
  font-size: var(--fs-base) !important;
}



/* CSS Diagonal Corner Swipe Keyframes */
@keyframes sideDiagonalReveal {
  0% {
    clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%);
    transform: translateX(50px) scale(0.97);
    opacity: 0.5;
  }

  100% {
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
    transform: translateX(0) scale(1);
    opacity: 1;
  }
}

.animate-side-diagonal {
  animation: sideDiagonalReveal 0.85s cubic-bezier(0.76, 0, 0.24, 1) forwards;
}

/* ══════════════════════════════════════════════════════════════
   SPEED ZOOM — تأثير السرعة: يأتي صغيراً ويتمدد لحجمه الطبيعي
   ══════════════════════════════════════════════════════════════ */

/* التبويبة أعلى → يأتي من الأسفل صغيراً ويكبر */
@keyframes prismDispersion {
  0% {
    transform: translateY(20px) scale(0.91);
    filter: blur(5px);
    opacity: 0;
  }

  58% {
    transform: translateY(-2px) scale(1.008);
    filter: blur(0);
    opacity: 1;
  }

  100% {
    transform: translateY(0) scale(1);
    filter: none;
    opacity: 1;
  }
}

/* التبويبة أسفل → يأتي من الأعلى صغيراً ويكبر */
@keyframes prismDispersionDown {
  0% {
    transform: translateY(-20px) scale(0.91);
    filter: blur(5px);
    opacity: 0;
  }

  58% {
    transform: translateY(2px) scale(1.008);
    filter: blur(0);
    opacity: 1;
  }

  100% {
    transform: translateY(0) scale(1);
    filter: none;
    opacity: 1;
  }
}

/* الكونتينر الرئيسي — Nano-Weaving Grid Origin Animation */
.origin-nano-weave {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── انتقال بطريقة الصفحات: أسفل → أعلى (التاب التالي) ── */
@keyframes page-slide-up {
  0% {
    transform: translateY(100%);
    opacity: 0;
    filter: blur(4px);
  }

  60% {
    opacity: 1;
    filter: blur(0);
  }

  100% {
    transform: translateY(0);
    opacity: 1;
    filter: none;
  }
}

/* ── انتقال بطريقة الصفحات: أعلى → أسفل (التاب السابق) ── */
@keyframes page-slide-down {
  0% {
    transform: translateY(-100%);
    opacity: 0;
    filter: blur(4px);
  }

  60% {
    opacity: 1;
    filter: blur(0);
  }

  100% {
    transform: translateY(0);
    opacity: 1;
    filter: none;
  }
}

.origin-nano-weave--slide-up {
  animation: page-slide-up 0.48s cubic-bezier(0.32, 0.72, 0, 1) forwards;
}

.origin-nano-weave--slide-down {
  animation: page-slide-down 0.48s cubic-bezier(0.32, 0.72, 0, 1) forwards;
}

/* ============================================================
   تنسيقات الحسابات المالية والجهات الممولة والمقترضين (نسخة نظيفة)
   ============================================================ */

/* شارات الحسابات المالية (شريك، ممول، مقترض، مستثمر، شركة) - نص عادي */
.badge--kind-شريك,
.badge--kind-ممول,
.badge--kind-مقترض,
.badge--kind-مستثمر,
.badge--kind-شركة {
  background: none !important;
  color: inherit !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  display: inline !important;
  box-shadow: none !important;
}

/* صفوف جدول الحسابات المالية (شريط جانبي ملون وخلفيات شفافة ونظيفة) */
.partner-row--شريك {
  background: var(--partner-sharik-bg) !important;
}

.partner-row--شريك td:first-child {
  border-right: var(--partner-row-border-width) solid var(--partner-sharik-color) !important;
}

.partner-row--شريك:hover {
  background: var(--partner-sharik-hover) !important;
}

.partner-row--ممول {
  background: var(--partner-mumuol-bg) !important;
}

.partner-row--ممول td:first-child {
  border-right: var(--partner-row-border-width) solid var(--partner-mumuol-color) !important;
}

.partner-row--ممول:hover {
  background: var(--partner-mumuol-hover) !important;
}

.partner-row--مقترض {
  background: var(--partner-moqtarid-bg) !important;
}

.partner-row--مقترض td:first-child {
  border-right: var(--partner-row-border-width) solid var(--partner-moqtarid-color) !important;
}

.partner-row--مقترض:hover {
  background: var(--partner-moqtarid-hover) !important;
}

.partner-row--مستثمر {
  background: var(--partner-mustathmir-bg) !important;
}

.partner-row--مستثمر td:first-child {
  border-right: var(--partner-row-border-width) solid var(--partner-mustathmir-color) !important;
}

.partner-row--مستثمر:hover {
  background: var(--partner-mustathmir-hover) !important;
}

/* أزرار تحديد نوع الحساب النشطة في النموذج والشريط الجانبي (بدون إضاءات نيون متوهجة) */
.payment-type-btn--partner-شريك.payment-type-btn--active {
  background: var(--partner-sharik-color) !important;
  color: var(--gold) !important;
  font-weight: var(--fw-extrabold) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2) !important;
}

.payment-type-btn--partner-شريك:hover:not(.payment-type-btn--active) {
  background: rgba(16, 185, 129, 0.08) !important;
  color: var(--partner-sharik-color) !important;
  border-color: rgba(16, 185, 129, 0.25) !important;
}

.payment-type-btn--partner-ممول.payment-type-btn--active {
  background: var(--partner-mumuol-color) !important;
  color: #ffffff !important;
  font-weight: var(--fw-extrabold) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2) !important;
}

.payment-type-btn--partner-ممول:hover:not(.payment-type-btn--active) {
  background: rgba(59, 130, 246, 0.08) !important;
  color: var(--partner-mumuol-color) !important;
  border-color: rgba(59, 130, 246, 0.25) !important;
}

.payment-type-btn--partner-مقترض.payment-type-btn--active {
  background: var(--partner-moqtarid-color) !important;
  color: #ffffff !important;
  font-weight: var(--fw-extrabold) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2) !important;
}

.payment-type-btn--partner-مقترض:hover:not(.payment-type-btn--active) {
  background: rgba(245, 158, 11, 0.08) !important;
  color: var(--partner-moqtarid-color) !important;
  border-color: rgba(245, 158, 11, 0.25) !important;
}

.payment-type-btn--partner-مستثمر.payment-type-btn--active {
  background: var(--partner-mustathmir-color) !important;
  color: #ffffff !important;
  font-weight: var(--fw-extrabold) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2) !important;
}

.payment-type-btn--partner-مستثمر:hover:not(.payment-type-btn--active) {
  background: rgba(139, 92, 246, 0.08) !important;
  color: var(--partner-mustathmir-color) !important;
  border-color: rgba(139, 92, 246, 0.25) !important;
}

/* نوافذ تفاصيل الحسابات المالية (مظهر زجاجي شفاف ونظيف خالي من الإضاءات المتوهجة) */
.modal-dialog--kind-شريك {
  background:
    linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.01) 100%),
    var(--partner-sharik-dialog-bg) !important;
  border: 1px solid var(--partner-sharik-border) !important;
  backdrop-filter: var(--partner-dialog-blur) saturate(var(--partner-dialog-saturation)) !important;
  -webkit-backdrop-filter: var(--partner-dialog-blur) saturate(var(--partner-dialog-saturation)) !important;
  box-shadow: var(--partner-dialog-shadow) !important;
}

.modal-dialog--kind-ممول {
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.01) 100%),
    var(--partner-mumuol-dialog-bg) !important;
  border: 1px solid var(--partner-mumuol-border) !important;
  backdrop-filter: var(--partner-dialog-blur) saturate(var(--partner-dialog-saturation)) !important;
  -webkit-backdrop-filter: var(--partner-dialog-blur) saturate(var(--partner-dialog-saturation)) !important;
  box-shadow: var(--partner-dialog-shadow) !important;
}

.modal-dialog--kind-مقترض {
  background:
    linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.01) 100%),
    var(--partner-moqtarid-dialog-bg) !important;
  border: 1px solid var(--partner-moqtarid-border) !important;
  backdrop-filter: var(--partner-dialog-blur) saturate(var(--partner-dialog-saturation)) !important;
  -webkit-backdrop-filter: var(--partner-dialog-blur) saturate(var(--partner-dialog-saturation)) !important;
  box-shadow: var(--partner-dialog-shadow) !important;
}

.modal-dialog--kind-مستثمر {
  background:
    linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(139, 92, 246, 0.01) 100%),
    var(--partner-mustathmir-dialog-bg) !important;
  border: 1px solid var(--partner-mustathmir-border) !important;
  backdrop-filter: var(--partner-dialog-blur) saturate(var(--partner-dialog-saturation)) !important;
  -webkit-backdrop-filter: var(--partner-dialog-blur) saturate(var(--partner-dialog-saturation)) !important;
  box-shadow: var(--partner-dialog-shadow) !important;
}

/* ============================================================
   🔗 توحيد مسميات الحقول في جميع تبويبات البرنامج
   ============================================================ */
label,
.label,
.cf-label,
.app-input-label {
  font-size: var(--label-font-size) !important;
  color: var(--label-color) !important;
  font-weight: var(--label-font-weight) !important;
  font-family: var(--input-font-family) !important;
}

/* ============================================================
   ✅ تفعيل خاصية السكرول العمودي في جميع الجداول لتمكين التمدد
   ============================================================ */
.table-wrapper,
.partner-tx-wrapper,
.partner-debtors-scroll,
.table-container,
.modal-dialog--partner .partner-tx-wrapper {
  overflow-y: auto !important;
}
/* ============================================================
   تخصيص الشريط العلوي (Top Bar) والشرائط الموحدة
   إزالة أي تأثيرات أو ألوان ثانوية أو حركات
   ============================================================ */
.app-header,
.app-header:hover,
.cars-page__toolbar,
.cars-page__toolbar:hover,
.unified-toolbar,
.unified-toolbar:hover {
  background: var(--backkground-secondary) !important;
  box-shadow: none !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  transition: none !important;
  transform: none !important;
  border: var(--hidod) !important;
  border-radius: var(--all-radius) !important;
}

.app-header::before,
.app-header::after,
.app-header:hover::before,
.app-header:hover::after,
.cars-page__toolbar::before,
.cars-page__toolbar::after,
.cars-page__toolbar:hover::before,
.cars-page__toolbar:hover::after,
.unified-toolbar::before,
.unified-toolbar::after,
.unified-toolbar:hover::before,
.unified-toolbar:hover::after,
.header-glow {
  display: none !important;
  content: none !important;
  background: none !important;
}

/* ============================================================
   تخصيص الشريط السفلي (Bottom Bar)
   إزالة أي تأثيرات أو ألوان ثانوية أو حركات
   ============================================================ */
.app-footer,
.app-footer:hover {
  background: var(--backkground-secondary) !important;
  box-shadow: none !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  transition: none !important;
  transform: none !important;
  border: var(--hidod) !important;
  border-radius: var(--all-radius) !important;
}

.app-footer::before,
.app-footer::after,
.app-footer:hover::before,
.app-footer:hover::after {
  display: none !important;
  content: none !important;
  background: none !important;
}

/* ============================================================
   تخصيص الشريط الجانبي (Sidebar)
   إزالة أي تأثيرات أو ألوان ثانوية أو حركات لتوحيد اللون
   ============================================================ */
.app-sidebar,
.app-sidebar:hover {
  background: var(--backkground-secondary) !important;
  box-shadow: none !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  transition: none !important;
  transform: none !important;
  border: var(--hidod) !important;
  border-radius: var(--all-radius) !important;
}

.app-sidebar::before,
.app-sidebar::after,
.sidebar-glow {
  display: none !important;
  content: none !important;
  background: none !important;
}

/* ============================================================
   إيقاف جميع حركات المرور (Hover) للبطاقات بشكل نهائي
   ============================================================ */
.stat-card,
.stat-card:hover,
.fin-card,
.fin-card:hover {
  transform: none !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
  transition: none !important;
}

```

---

## File: `src/styles/DashboardCardsFix.css`

```css
/* ============================================================
   إصلاح نهائي وحاسم لبطاقات لوحة التحكم
   ============================================================ */

/* ============================================================
   إصلاح نهائي وحاسم لشفافية لوحة التحكم وتوحيد ألوان البطاقات
   ============================================================ */

/* فرض لون الخلفية المطلوب للوحة التحكم */
.app:has(.dashboard) .app-bg {
  background: var(--backkground) !important;
  background-color: var(--backkground) !important;
}

/* إخفاء طبقات الألوان المتداخلة (الأحمر والشبكة) عند تفعيل لوحة التحكم */
.app:has(.dashboard) .app-bg__reflection,
.app:has(.dashboard) .app-bg__mesh,
.app:has(.dashboard) .origin-nano-weave::before,
.app:has(.dashboard) .app-main::before,
.dashboard,
.origin-nano-weave,
.app-main,
.app-content {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* توحيد مظهر جميع البطاقات في لوحة التحكم بشكل كامل */
.dashboard .stat-card,
.dashboard .stat-card:hover,
.dashboard .quick-btn,
.dashboard .quick-btn:hover,
.dashboard .dashboard-panel,
.dashboard .stat-card::before,
.dashboard .stat-card::after,
.dashboard .quick-btn::before,
.dashboard .quick-btn::after {
  transform: none !important;
  transition: none !important;
  animation: none !important;
  box-shadow: none !important;
  background-image: none !important;
  background: var(--backkground-secondary) !important;
  border: var(--hidod) !important;
  border-radius: var(--all-radius) !important;
  opacity: 1 !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  filter: none !important;
  content: none !important;
  min-height: 160px !important;
  height: 100% !important;
}

/* محاذاة المحتوى داخل بطاقات الإحصائيات (للأعلى) */
.dashboard .stat-card {
  justify-content: flex-start !important;
  padding-top: 1.5rem !important;
}

/* محاذاة المحتوى داخل أزرار الإجراءات السريعة (توسيط) */
.dashboard .quick-btn {
  justify-content: center !important;
}



```

---

## File: `src/styles/expenses.css`

```css
/* ==========================================================================
   💸 ملف أنماط المصروفات (Expenses Stylesheet)
   ==========================================================================
   يحتوي هذا الملف على جميع الخصائص والمتغيرات الخاصة بتبويب المصروفات.
   يمكنك تعديل أي قيمة من المتغيرات أدناه لتغيير المظهر فوراً.
   ========================================================================== */

.dashboard {
  /* ─── ⚙️ متغيرات المصروفات (Expenses CSS Variables) ─── */

  /* حجم خط العناوين وتفاصيل المصروفات */
  --expenses-font-size: var(--fs-sm);

  /* لون الحدود والتأثير لبطاقات المصروفات بالدينار */
  --iqd-expense-border: rgba(216, 168, 90, 0.25);

  /* لون الحدود والتأثير لبطاقات المصروفات بالدولار */
  --usd-expense-border: rgba(16, 185, 129, 0.25);

  /* لون زر الحذف المباشر للمصروف */
  --expense-delete-hover-color: #f43f5d71;
}

/* ─── 📐 تنسيقات تبويب المصروفات ─── */

/* تلوين أزرار الحذف في جدول المصروفات */
.dashboard td button[title="حذف"] {
  color: rgba(255, 255, 255, 0.3) !important;
  transition: color 0.2s !important;
}

.dashboard td button[title="حذف"]:hover {
  color: var(--expense-delete-hover-color) !important;
}

/* ─── 📐 تنسيقات نافذة إضافة مصروف المنبثقة (Modal popup layout) ─── */

/* الهيكل الداخلي لحقول إدخال تفاصيل المصروف */
.cf-label {
  font-family: var(--title-font-family) !important;
  font-size: var(--fs-xs) !important;
  color: var(--text-muted) !important;
  font-weight: var(--fw-medium) !important;
  margin-bottom: 2px !important;
}

/* حجم الخط في جدول المصروفات */
.data-table th, 
.data-table td {
  font-size: var(--expenses-font-size) !important;
}

```

---

## File: `src/styles/inputfieal.css`

```css
:root {
  --input-focus-border: rgb(250, 33, 0);
  --input-focus-shadow:
    0 0 0 3px rgba(255, 0, 0, 0.122),
    0 20px 50px -15px rgba(216, 168, 90, 0.15);
  --input-focus-glow-color: rgba(216, 168, 90, 0.08);
  --input-focus-glow-opacity: 1;
  --input-focus-glow-scale: 1.1;
  --input-focus-transition: all 10s ease-in-out;
}

.input:focus,
.select:focus,
.textarea:focus,
.partner-sidebar-input:focus {
  border-color: var(--input-focus-border) !important;
  box-shadow: var(--input-focus-shadow) !important;
}

div.border:has(> input:focus),
div.border:has(> textarea:focus) {
  border-color: var(--input-focus-border) !important;
  box-shadow: var(--input-focus-shadow) !important;
}

.input-glow {
  pointer-events: none !important;
  transition: opacity 0.35s ease-out, transform 0.35s ease-out !important;
  transform: translate(-50%, -50%) scale(0.9) !important;
  opacity: 0 !important;
}

div.border:has(> input:focus) .input-glow,
div.border:has(> textarea:focus) .input-glow {
  opacity: var(--input-focus-glow-opacity) !important;
  transform: translate(-50%, -50%) scale(var(--input-focus-glow-scale)) !important;
}

.combobox-trigger:focus {
  border-color: var(--input-focus-border) !important;
  box-shadow: var(--input-focus-shadow) !important;
}

```

---

## File: `src/styles/buttons.css`

```css
/* ============================================================
   🔘 أزرار فجر الوادي — دليل شامل لجميع الأزرار في البرنامج
   ============================================================ */

/* #region 1. المتغيرات والأساسيات (Variables & Core) */
:root {
  /* ─── 📏 متغيرات الحجم الموحد (Shared Dimensions) ─── */
  --shared-height: 60px;
  --shared-width: 240px;

  /* ─── 🧭 متغيرات أزرار الشريط الجانبي (Sidebar) ─── */
  --sbtn-color: rgba(255, 255, 255, 0.65);
  --sbtn-bg: transparent;
  --sbtn-border: rgba(255, 255, 255, 0.08);
  --sbtn-hover-bg: rgba(255, 255, 255, 0.06);
  --sbtn-active-bg: var(--red);
  --sbtn-active-border: rgba(255, 255, 255, 0.4);

  /* ─── 🏆 متغيرات تبويبات النوع الأول (Top Button One) ─── */
  /* (حسابات العملاء، الوكالات، قاصه) */
  --t1-bg: rgba(255, 255, 255, 0.03);
  --t1-color: rgba(255, 255, 255, 0.7);
  --t1-border: rgba(255, 255, 255, 0.1);
  --t1-active-bg: var(--red);
  --t1-active-color: #fff;
  --t1-active-border: rgba(255, 255, 255, 0.3);

  /* ─── 💎 متغيرات تبويبات النوع الثاني (Top Button Two) ─── */
  /* (المباع، الحساب الشخصي، تفاصيل، ماستر) */
  --t2-bg: rgba(255, 255, 255, 0.03);
  --t2-color: rgba(255, 255, 255, 0.7);
  --t2-border: rgba(255, 255, 255, 0.1);
  --t2-active-bg: var(--red);
  --t2-active-color: #fff;
  --t2-active-border: rgba(255, 255, 255, 0.3);

  /* ─── 💰 متغيرات بطاقات العملة (Currency Cards) ─── */
  --iqd-card-bg: rgba(162, 107, 11, 0.501);
  --usd-card-bg: rgb(0, 132, 13);

  /* ─── 🛠 المتغيرات العامة (Global Button Variables) ─── */
  --btn-radius: var(--all-radius);
  --btn-font: var(--font-family);
  --btn-primary-bg: var(--red);
  --btn-success-bg: #10b981;
  --btn-danger-bg: #ef4444;

  /* ─── 💸 أزرار الإيداع والسحب (Deposit & Withdraw) ─── */
  --act-dewith-height: 44px;
  --act-deposit-bg: var(--red);
  --act-deposit-hover: #b01a1a;
  --act-deposit-color: #ffffff;
  --act-deposit-width: 140px;
  --act-deposit-height: var(--act-dewith-height);
  
  --act-withdraw-bg: rgba(255, 255, 255, 0.05);
  --act-withdraw-hover: rgba(255, 255, 255, 0.1);
  --act-withdraw-color: #ffffff;
  --act-withdraw-border: rgba(255, 255, 255, 0.12);
  --act-withdraw-width: 140px;
  --act-withdraw-height: var(--act-dewith-height);
}

/* ─── 📦 حاويات التبويبات العلوية (Tab Containers) ─── */
.cars-tabs, .financial-tabs {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 12px !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
/* #endregion */

/* #region 2. أزرار الشريط الجانبي (sidebar-btn) */
.sidebar-btn {
  position: relative;
  display: flex !important;
  align-items: center !important;
  gap: 20px !important;
  width: 100% !important;
  padding: 12px 18px !important;
  margin-bottom: 15px !important;
  border-radius: var(--all-radius) !important;
  cursor: pointer !important;
  font-family: var(--btn-font) !important;
  font-size: 1.3rem !important;
  font-weight: var(--fw-bold) !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  overflow: hidden !important;
  color: var(--sbtn-color) !important;
  background: var(--sbtn-bg) !important;
  border: 1px solid var(--sbtn-border) !important;
  box-shadow: none !important;
}

.sidebar-btn__icon {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  font-size: 1.1rem !important;
  border-radius: var(--all-radius) !important;
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  transition: inherit !important;
}

.sidebar-btn:hover {
  color: #fff !important;
  background: var(--sbtn-hover-bg) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
  transform: translateX(-4px) !important;
}

.sidebar-btn:hover .sidebar-btn__icon {
  color: var(--gold) !important;
  border-color: rgba(215, 168, 0, 0.3) !important;
  transform: scale(1.1) rotate(5deg) !important;
}

.sidebar-btn--active {
  color: #fff !important;
  background: var(--sbtn-active-bg) !important;
  border-color: var(--sbtn-active-border) !important;
}

.sidebar-btn:active { transform: scale(0.98) !important; }
/* #endregion */

/* #region 3. تبويبات النوع الأول (top-btn-one) */
.top-btn-one {
  width: var(--shared-width) !important;
  height: var(--shared-height) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: var(--all-radius) !important;
  cursor: pointer;
  font-family: var(--btn-font);
  font-weight: var(--fw-bold);
  text-align: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--t1-bg);
  color: var(--t1-color);
  border: 1px solid var(--t1-border);
  flex: none !important;
  white-space: nowrap !important;
}

.top-btn-one:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.top-btn-one--active {
  background: var(--t1-active-bg) !important;
  color: var(--t1-active-color) !important;
  border-color: var(--t1-active-border) !important;
}
/* #endregion */

/* #region 4. تبويبات النوع الثاني (top-btn-two) */
.top-btn-two {
  width: var(--shared-width) !important;
  height: var(--shared-height) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: var(--all-radius) !important;
  cursor: pointer;
  font-family: var(--btn-font);
  font-weight: var(--fw-bold);
  text-align: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--t2-bg);
  color: var(--t2-color);
  border: 1px solid var(--t2-border);
  flex: none !important;
  white-space: nowrap !important;
}

.top-btn-two:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.top-btn-two--active {
  background: var(--t2-active-bg) !important;
  color: var(--t2-active-color) !important;
  border-color: var(--t2-active-border) !important;
}
/* #endregion */

/* #region 5. بطاقات العملة (currency-card) */
.currency-card {
  width: var(--shared-width) !important;
  height: var(--shared-height) !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: var(--all-radius) !important;
  font-family: var(--btn-font) !important;
  font-weight: var(--fw-extrabold) !important;
  font-size: var(--fs-lg) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0) !important;
  transition: all 0.3s ease !important;
  text-align: center !important;
  cursor: default !important;
}

.currency-card--iqd { background: var(--iqd-card-bg) !important; }
.currency-card--usd { background: var(--usd-card-bg) !important; }

.currency-card:hover { transform: translateY(-2px); }
/* #endregion */

/* #region 6. الأزرار العامة والتفاعلية (Global & Action Buttons) */
.btn, .act-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: var(--all-radius);
  font-family: var(--btn-font);
  font-weight: var(--fw-bold);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.btn--primary, .act-btn--primary { background: var(--btn-primary-bg); color: #fff; }
.btn--success, .act-btn--success { background: var(--btn-success-bg); color: #fff; }
.btn--danger, .act-btn--danger { background: var(--btn-danger-bg); color: #fff; }
.btn--ghost, .act-btn--ghost { background: rgba(255,255,255,0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); }

.btn:hover, .act-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }

/* أزرار إضافية (Misc) */
.btn-new-car { min-width: 160px; height: 48px; }
.btn-settle-installment { padding: 4px 12px; background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.2); border-radius: 8px; font-size: 0.85em; }
.cars-tab__count { font-size: 0.8em; opacity: 0.7; margin-right: 4px; }
/* #endregion */

/* #region 7. أزرار الإيداع والسحب (Deposit & Withdraw Buttons) */

/* ─── زر الإيداع (Deposit Button) ─── */
.act-btn--success {
  background: var(--act-deposit-bg) !important;
  color: var(--act-deposit-color) !important;
  width: var(--act-deposit-width) !important;
  height: var(--act-deposit-height) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  box-shadow: 0 10px 25px rgba(220, 38, 38, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
  font-weight: var(--fw-bold) !important;
}

.act-btn--success:hover:not(:disabled) {
  background: var(--act-deposit-hover) !important;
  transform: translateY(-2px) scale(1.02) !important;
}

/* ─── زر السحب (Withdraw Button) ─── */
.act-btn--secondary {
  background: var(--act-withdraw-bg) !important;
  color: var(--act-withdraw-color) !important;
  width: var(--act-withdraw-width) !important;
  height: var(--act-withdraw-height) !important;
  border: 1px solid var(--act-withdraw-border) !important;
  backdrop-filter: blur(8px);
  font-weight: var(--fw-bold) !important;
}

.act-btn--secondary:hover:not(:disabled) {
  background: var(--act-withdraw-hover) !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
  transform: translateY(-2px) !important;
}

/* ─── الحاوية السفلية في نافذة الشريك (Partner Modal Actions) ─── */
.partner-modal-actions {
  display: flex !important;
  gap: 12px !important;
  direction: rtl;
  padding: 15px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 15px;
  justify-content: flex-start;
}

.partner-modal-actions .act-btn {
  margin: 0 !important;
}

/* ─── توافقية الشاشات (Responsive) ─── */
@media (max-width: 600px) {
  .partner-modal-actions {
    flex-wrap: wrap;
    gap: 10px !important;
  }
  .act-btn--success, .act-btn--secondary {
    width: 100% !important;
    max-width: none !important;
  }
}
/* #endregion */

```

---

## File: `src/styles/cards.css`

```css
/* تم نقل جميع تنسيقات البطاقات إلى ملف buttons.css لتوحيد التصميم */

```

---

## File: `src/styles/tables.css`

```css
/* ==========================================================================
   📊 ملف الأنماط الخاص بالجداول (Tables Stylesheet)
   ==========================================================================
   🎯 جميع متغيرات التحكم في مظهر الجدول موجودة أدناه.
   يمكنك تعديل أي قيمة من هذه المتغيرات لتطبيق التغيير فوراً على جميع الجداول.
   ========================================================================== */

:root {
  /* ─── لون النص (Text Color) ─── */
  --table-text-color: #ffffff;
  --table-header-text-color: #ffffff;
  --table-sorted-text-color: #d7a800;

  /* ─── حجم النص (Text Size) ─── */
  --table-header-font-size: 20px;
  --table-font-size: 20px;
  --table-number-font-size: 20px;

  /* ─── محاذاة النص (Text Alignment) ─── */
  --table-text-align: center;
  --table-number-text-align: center;

  /* ─── لون الحدود (Border Color) ─── */
  --table-border-color: var(--jadawil-hidod);
  --table-header-border-color: var(--jadawil-hidod);

  /* ─── لون خلفية الجدول (Background Color) ─── */
  --table-header-bg: var(--red);
  --table-cell-bg: var(--backkground-secondary);
  --table-row-hover-bg: rgba(255, 255, 255, 0.05);
  --table-sorted-header-bg: rgba(212, 175, 55, 0.15);
  --table-card-bg: #ffffff00;
  --table-card-border: var(--hidod);

  /* ─── هوامش العلامات الدالة على الصفحة (Pagination Dots) ─── */
  --table-dots-margin-top: -15px;

  /* ─── حجم صفوف الجدول (Row Padding) ─── */
  --table-header-padding: 12px 14px;
  --table-cell-padding: 10.2px 30px;
}

/* ==========================================================================
   تطبيق المتغيرات على عناصر الجدول
   ========================================================================== */

/* الهيكل العام للجدول */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--title-font-family) !important;
  text-align: var(--table-text-align) !important; /* محاذاة النص */
}

/* تنسيق صف العناوين العلوي */
.data-table th {
  background: var(--table-header-bg) !important;
  color: var(--table-header-text-color) !important;
  font-size: var(--table-header-font-size) !important;
  padding: var(--table-header-padding) !important;
  font-weight: var(--fw-extrabold);
  border-bottom: 1px solid var(--table-header-border-color);
}

/* تنسيق أزرار ونصوص صف العناوين العلوي */
.data-table th button,
.data-table th .th-sort-btn {
  font-size: var(--table-header-font-size) !important;
  font-family: var(--title-font-family) !important;
  color: inherit !important;
  text-align: inherit !important;
  display: block !important;
  width: 100% !important;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  cursor: pointer !important;
  outline: none !important;
}

.data-table th span {
  font-size: var(--table-header-font-size) !important;
  font-family: var(--title-font-family) !important;
  color: inherit !important;
  text-align: inherit !important;
  display: inline !important;
}

/* تنسيق خلايا البيانات */
.data-table td {
  color: var(--table-text-color) !important;
  font-size: var(--table-font-size) !important;
  padding: var(--table-cell-padding) !important;
  border-bottom: var(--table-border-color);
}

.data-table td button,
.data-table td span {
  font-size: var(--table-font-size) !important;
}

/* توحيد خطوط الخلايا الرقمية للترتيب المتناسق للأعمدة */
.cell-num,
.ct-num,
.ct-year,
.ct-chassis,
.ct-price,
.col-phone,
.col-price,
.col-money,
.col-ratio,
.th-sort-btn {
  font-size: var(--table-number-font-size) !important;
  font-family: var(--title-font-family) !important;
  font-variant-numeric: tabular-nums !important;
}

/* الخطوط العمودية الفاصلة بين الأعمدة (تظهر في RTL بشكل صحيح) */
.data-table th:not(:last-child),
.data-table td:not(:last-child) {
  border-left: var(--table-border-color) !important;
}

/* الخط الأفقي الفاصل بين الصفوف */
.data-table tbody tr {
  border-bottom: var(--table-border-color);
  transition: all 0.2s ease-in-out;
}

/* تأثير تمرير مؤشر الماوس على الأسطر */
.data-table tbody tr:hover {
  background: var(--table-row-hover-bg) !important;
}

/* العمود المفرز حالياً (تمييز رأس العمود المفروز بلون ذهبي وخلفية خفيفة) */
.data-table th.th--sorted {
  background: var(--table-sorted-header-bg) !important;
}

.data-table th.th--sorted,
.data-table th.th--sorted button,
.data-table th.th--sorted span {
  color: var(--table-sorted-text-color) !important;
  font-weight: var(--fw-black) !important;
}

/* ==========================================================================
   📐 محاذاة وأحجام الكروت الحاضنة للجداول (Unified Card Container Layout)
   ========================================================================== */

/* الحاوية الموحدة لجميع كروت الجداول لتتطابق أبعادها ومواقعها بالمليمتر في كافة التبويبات */
.table-card-container {
  background: var(--table-card-bg) !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  border: var(--table-card-border) !important;
  border-radius: var(--all-radius) !important;
  box-shadow: none !important;
  display: flex !important;
  flex-direction: column !important;
  flex: 1 !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin-bottom: 0 !important;
  overflow: hidden !important;
  position: relative !important;
  z-index: 1 !important;
  width: 100% !important;
}



/* ==========================================================================
   📐 شريط الأدوات الموحد في الجزء العلوي (Unified Top Toolbar Layout)
   ========================================================================== */

.unified-toolbar {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  flex-direction: row !important;
  gap: 1.25rem !important;
  padding: 12px 24px !important;
  min-height: 100px !important;
  /* ارتفاع موحد وثابت بالمليمتر لكافة التبويبات */
  max-height: 100px !important;
  box-sizing: border-box !important;
  margin-bottom: 1rem !important;
  flex-shrink: 0 !important;
  width: 100% !important;
}

.unified-toolbar__right,
.unified-toolbar__left {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  flex: 1 !important;
}

.unified-toolbar__right {
  justify-content: flex-start !important;
}

.unified-toolbar__left {
  justify-content: flex-end !important;
}

.unified-toolbar__center {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  flex: 1.5 !important;
}

.unified-toolbar__title {
  margin: 0 !important;
  font-size: var(--fs-md) !important;
  font-family: var(--title-font-family) !important;
  font-weight: var(--fw-extrabold) !important;
  color: var(--title-color-primary) !important;
  white-space: nowrap !important;
}

/* ============================================================
   أزرار التنقل بين صفحات الجدول (Pagination Dots)
   ============================================================ */
.table-page-dots {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  gap: 8px !important;
  margin-top: var(--table-dots-margin-top) !important;
  padding: 12px 0 !important;
  background: transparent !important;
}

.table-page-dot {
  width: 10px !important;
  height: 10px !important;
  border-radius: 50% !important;
  background: rgba(255, 255, 255, 0.2) !important;
  border: none !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  padding: 0 !important;
}

.table-page-dot:hover {
  background: rgba(255, 255, 255, 0.4) !important;
  transform: scale(1.2) !important;
}

.table-page-dot.is-active {
  background: var(--gold) !important;
  transform: scale(1.3) !important;
}
.table-wrapper,
.table-container {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

/* التخطيط الداخلي المنظم للجداول */
.data-table {
  width: 100% !important;
  border-collapse: collapse !important;
  background: var(--table-cell-bg) !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  text-align: var(--table-text-align);
}

/* الحدود الداخلية لتشكيل شبكة منظمة */
.data-table th,
.data-table td {
  border: var(--table-border-color) !important;
  padding: var(--table-cell-padding) !important;
  text-align: var(--table-text-align) !important; /* محاذاة النص */
}

/* محتوى عمود رقم السيارة يأخذ لون النص من المتغير */
.data-table td.ct-num,
.data-table td.ct-num .ct-plate {
  color: var(--table-text-color) !important;
}

/* محاذاة خاصة للأرقام لتكون في الوسط أو اليسار */
.data-table th.cell-num,
.data-table td.cell-num,
.data-table th.ct-num,
.data-table td.ct-num,
.data-table th.col-money,
.data-table td.col-money,
.data-table th.ct-price,
.data-table td.ct-price,
.data-table th.col-ratio,
.data-table td.col-ratio,
.data-table th.ct-profit,
.data-table td.ct-profit,
.data-table th.ct-profit-pct,
.data-table td.ct-profit-pct {
  text-align: var(--table-number-text-align) !important;
}

/* حدود صف الرأس */
.data-table th {
  background: var(--table-header-bg) !important;
  border-bottom: var(--table-card-border) !important;
  color: var(--table-header-text-color) !important;
  font-weight: var(--fw-bold) !important;
}

/* التمرير داخل الجدول */
.table-wrapper {
}

/* التأكد من عدم وجود خلفية شفافة مزدوجة */
.table-wrapper .data-table,
.table-container .data-table {
  background: var(--table-cell-bg) !important;
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
  border: none !important;
}
```

---

## File: `src/styles/agencies.css`

```css
/* ============================================================
   🏷️ ملف أنماط الوكالات (Agencies Stylesheet)
   ============================================================ */

.agencies-page {
  /* ─── 📐 عرض أعمدة الجدول ─── */
  --col-seq-width: 50px;
  --col-date-width: 140px;
  --col-old-agent-width: 18%;
  --col-car-num-width: 170px;
  --col-model-width: 100px;
  --col-new-agent-width: 18%;
  --col-phone-width: 150px;
  --col-money-width: 150px;
  --col-delete-width: 20px;

  /* ─── 🎨 ألوان متوافقة مع البرنامج العام ─── */
  --agency-details-bg: var(--backkground-secondary);
  --agency-details-opacity: 1;
  --agency-card-bg: rgba(255, 255, 255, 0.02);
  --agency-card-border: var(--hidod);
  --agency-accent-color: var(--gold);

  /* ─── 📏 أبعاد ونصوص التفاصيل ─── */
  --agency-rect-height: 48px;
  --agency-rect-label-width: 200px;
  --agency-details-max-width: 600px; /* التحكم بعرض حاوية التفاصيل في المنتصف */
  
  /* ─── ✍️ التحكم بالنصوص (يمكنك تغييرها من هنا) ─── */
  --agency-value-color: #ffffff;    /* لون النص داخل المربعات */
  --agency-value-fs: var(--font-size);        /* حجم النص داخل المربعات */
  --agency-label-fs: var(--font-size);        /* حجم نص التسميات (الليبل) */
  }

/* تطبيق عروض أعمدة الجدول */
.agencies-page table.agencies-table th.col-seq, .agencies-page table.agencies-table td.col-seq { width: var(--col-seq-width) !important; min-width: var(--col-seq-width) !important; max-width: var(--col-seq-width) !important; }
.agencies-page table.agencies-table th.col-date, .agencies-page table.agencies-table td.col-date { width: var(--col-date-width) !important; min-width: var(--col-date-width) !important; max-width: var(--col-date-width) !important; }
.agencies-page table.agencies-table th.col-old-agent, .agencies-page table.agencies-table td.col-old-agent { width: var(--col-old-agent-width) !important; min-width: var(--col-old-agent-width) !important; }
.agencies-page table.agencies-table th.col-car-num, .agencies-page table.agencies-table td.col-car-num { width: var(--col-car-num-width) !important; min-width: var(--col-car-num-width) !important; max-width: var(--col-car-num-width) !important; }
.agencies-page table.agencies-table th.col-model, .agencies-page table.agencies-table td.col-model { width: var(--col-model-width) !important; }
.agencies-page table.agencies-table th.col-new-agent, .agencies-page table.agencies-table td.col-new-agent { width: var(--col-new-agent-width) !important; min-width: var(--col-new-agent-width) !important; }
.agencies-page table.agencies-table th.col-phone, .agencies-page table.agencies-table td.col-phone { width: var(--col-phone-width) !important; min-width: var(--col-phone-width) !important; max-width: var(--col-phone-width) !important; }
.agencies-page table.agencies-table th.col-money, .agencies-page table.agencies-table td.col-money { width: var(--col-money-width) !important; min-width: var(--col-money-width) !important; }
.agencies-page table.agencies-table th.col-delete, .agencies-page table.agencies-table td.col-delete { width: var(--col-delete-width) !important; min-width: var(--col-delete-width) !important; max-width: var(--col-delete-width) !important; }

/* ─── 💎 الكونتر الموحد للتفاصيل ─── */
.agency-unified-details {
  background: var(--agency-details-bg) !important;
  border: var(--hidod);
  border-radius: var(--all-radius);
  backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate));
  -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate));
  padding: 30px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  height: auto;
  max-width: var(--agency-details-max-width);
  margin: 20px auto; /* التوسط في المنتصف */
  box-shadow: 0 10px 40px rgba(0,0,0,0.4);
}

.agency-details-grid {
  display: flex;
  flex-direction: column; /* جعل المربعات تحت بعضها */
  gap: 12px;
}

/* مستطيل المعلومة */
.info-rect {
  height: var(--agency-rect-height);
  background: var(--agency-card-bg);
  border: 1px solid var(--agency-card-border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.info-rect__label {
  width: var(--agency-rect-label-width);
  height: 100%;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  padding: 0 15px;
  color: var(--agency-accent-color);
  font-size: var(--agency-label-fs);
  font-weight: var(--fw-bold);
  border-left: 1px solid var(--agency-card-border);
  flex-shrink: 0;
}

/* تنسيق المدخلات داخل المستطيلات */
.info-rect__input {
  width: 100%;
  height: 100%;
  background: transparent !important;
  border: none !important;
  color: var(--agency-value-color) !important;
  padding: 0 15px !important;
  font-size: var(--agency-value-fs) !important;
  font-family: inherit !important;
  outline: none !important;
}

.info-rect__input:focus {
  background: rgba(216, 168, 90, 0.05) !important;
}

.agency-details-save-bar {
  display: flex;
  justify-content: center; /* توسيط زر الحفظ */
  margin-top: 15px;
}

```

---

## File: `src/components/ConfirmDialog.tsx`

```tsx
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="alertdialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title" className="modal-dialog__title">
          {title}
        </h3>
        <p id="confirm-message" className="modal-dialog__message">
          {message}
        </p>
        <div className="modal-dialog__actions">
          <button
            type="button"
            className={`btn ${danger ? "btn--danger-solid" : "btn--primary"}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "جاري التنفيذ..." : confirmLabel}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

```

---

## File: `src/components/SearchableCombobox.tsx`

```tsx
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface SearchableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string; subLabel?: string; kind?: string }[];
  placeholder?: string;
  onOpenChange?: (open: boolean) => void;
  clearOptionText?: string;
  onClear?: () => void;
  suffix?: string;
}

export function SearchableCombobox({
  value,
  onChange,
  options,
  placeholder = "",
  onOpenChange,
  clearOptionText,
  onClear,
  suffix,
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  // المراجع (Refs) لإدارة الإغلاق والتموضع
  const containerRef = useRef<HTMLDivElement>(null);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearch("");
      setHighlightedIndex(-1);
    }
    onOpenChange?.(open);
  };

  // تأثير (Effect) لإغلاق القائمة عند النقر خارج المكون
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleOpenChange(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value);
  const selectedLabel = selectedOption?.label || "";
  const selectedKind = selectedOption?.kind;
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  // التمرير التلقائي للعنصر المحدد بلوحة المفاتيح
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0) {
      const el = document.getElementById(`combobox-option-${highlightedIndex}`);
      if (el) {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        handleOpenChange(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : (prev === -1 ? filtered.length - 1 : 0)));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          onChange(filtered[highlightedIndex].value);
          handleOpenChange(false);
        } else if (filtered.length === 1) {
          // التحديد التلقائي إذا كان هناك خيار واحد فقط
          onChange(filtered[0].value);
          handleOpenChange(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        handleOpenChange(false);
        e.currentTarget.blur();
        break;
    }
  };

  const isFocusingRef = useRef(false);

  return (
    // الحاوية الرئيسية بـ position: relative لضمان انطلاق القائمة منها بدقة
    <div ref={containerRef} className="search-select" style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="text"
          dir="rtl"
          value={isOpen ? search : selectedLabel}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightedIndex(-1);
            if (!isOpen) handleOpenChange(true);
          }}
          onFocus={() => {
            isFocusingRef.current = true;
            handleOpenChange(true);
            setTimeout(() => { isFocusingRef.current = false; }, 150);
          }}
          onClick={() => {
            if (!isFocusingRef.current) {
              handleOpenChange(!isOpen);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={`combobox-trigger ${suffix ? "combobox-trigger--has-suffix" : ""}`}
          data-kind={selectedKind || ""}
        />
        {suffix && <span className="combobox-suffix">{suffix}</span>}
        <span className={`combobox-arrow ${isOpen ? "combobox-arrow--open" : ""}`}>▼</span>
      </div>

      {/* AnimatePresence تدير حركة خروج العنصر من الـ DOM بسلاسة */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            // تأثير انزلاق ناعم واحترافي من المربع (Smooth Slide Down)
            initial={{ opacity: 0, y: -15, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
            transition={{
              duration: 0.25,
              ease: [0.16, 1, 0.3, 1] // منحنى انسيابي Apple-like
            }}
            
            className="combobox-dropdown combobox-dropdown--open"
            style={{
              position: "absolute",
              top: "100%", // تظهر مباشرة تحت حقل الإدخال
              right: 0,    // تبدأ محاذاة القائمة من جهة اليمين (متوافق تماماً مع RTL)
              left: 0,     // تتمدد لتأخذ نفس عرض الحقل تماماً تلقائياً
              zIndex: 9999,
              marginTop: "4px",
              transformOrigin: "top center", // نقطة انطلاق الحركة من الأعلى
            }}
          >
            <div className="combobox-dropdown-inner">
              {clearOptionText && onClear && (
                <div
                  onClick={() => {
                    onClear();
                    handleOpenChange(false);
                  }}
                  className="combobox-clear"
                >
                  {clearOptionText}
                </div>
              )}
              {filtered.length === 0 ? (
                <div className="combobox-no-result">لا توجد نتائج مطابقة</div>
              ) : (
                filtered.map((opt, index) => (
                  <div
                    id={`combobox-option-${index}`}
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      handleOpenChange(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`combobox-option ${value === opt.value ? "combobox-option--selected" : ""} ${highlightedIndex === index ? "combobox-option--highlighted" : ""}`}
                  >
                    {opt.kind && <span className="combobox-option-dot" data-kind={opt.kind} />}
                    <span>{opt.label}</span>
                    {opt.subLabel && <span className="combobox-option-sub">{opt.subLabel}</span>}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

```

---

## File: `src/components/FinancialAccountsTab.tsx`

```tsx
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

```

---

## File: `src/components/Dashboard.tsx`

```tsx
import { useEffect, useState } from "react";
import type { Car, Partner, CashRegisterEntry, UnifiedAccount } from "../types";
import "../styles/colors.css";
import { callTauri } from "../api/tauri";
import {
  PriceDisplay,
  TextInput,
  PriceInput,
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
  StatCard,
} from "@/components/ui";

import { todayIsoDate } from "../utils/dateSegments";
import {
  Coins,
  CreditCard,
  TrendingUp,
  Car as CarIcon,
  Plus,
  Landmark,
  Calendar,
  CheckCircle2,
  PartyPopper,
  Phone,
} from "lucide-react";
import "../styles/dashboard.css";
import "../styles/DashboardCardsFix.css";

// ── نظام الألوان مُستمَد من colors.css ──────────────────
// --red:   #4d000a   (أحمر داكن — للتحذيرات / المصاريف / الأخطار)
// --gold:  #d7a800   (ذهبي     — التوكيد الرئيسي / العناصر المميزة)
// --gray:  #7a7a7a   (رمادي    — النصوص الثانوية / الحدود)
// --black: #0e0e0e   (أسود    — الخلفية الرئيسية)
// --white: #ffffff   (أبيض    — النص الأساسي)

interface DashboardProps {
  cars: Car[];
  partners: Partner[];
  onRefresh: () => Promise<void>;
  onOpenCarForm: (mode: "new" | "edit", car?: Car) => void;
}

interface InstallmentAlert {
  id: number;
  buyerName: string;
  phone: string;
  dueDate: string;
  amount: number;
  currency: string;
  status: "overdue" | "due_today" | "upcoming";
  daysDifference: number;
  notes: string;
  carInfo?: string;
  partnerKind?: string;
}

// ── مكون زر الإجراء السريع ────────────────────────────
function QuickBtn({
  icon: Icon,
  label,
  sublabel,
  onClick,
  variant = "gold",
}: {
  icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  label: string;
  sublabel?: string;
  onClick: () => void;
  variant?: "gold" | "red" | "gray";
}) {
  // ألوان الـ variant مشتقة من متغيرات colors.css
  const variantMap = {
    gold: {
      bg: "color-mix(in srgb, var(--smiles-bg), transparent 92%)",
      hover: "color-mix(in srgb, var(--smiles-bg), transparent 84%)",
      border: "color-mix(in srgb, var(--smiles-bg), transparent 65%)",
      icon: "var(--smiles)",
      iconBg: "color-mix(in srgb, var(--smiles-bg), transparent 88%)",
      shadow: "color-mix(in srgb, var(--smiles-bg), transparent 85%)"
    },
    red: {
      bg: "rgba(77,0,10,0.18)",
      hover: "rgba(77,0,10,0.32)",
      border: "transparent",
      icon: "var(--smiles)",
      iconBg: "color-mix(in srgb, var(--smiles-bg), transparent 80%)",
      shadow: "rgba(77,0,10,0.35)"
    },
    gray: {
      bg: "rgba(122,122,122,0.07)",
      hover: "rgba(122,122,122,0.14)",
      border: "rgba(122,122,122,0.3)",
      icon: "var(--smiles)",
      iconBg: "color-mix(in srgb, var(--smiles-bg), transparent 90%)",
      shadow: "rgba(122,122,122,0.15)"
    },
  };
  const v = variantMap[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      className="quick-btn"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.4rem",
        flex: 1,
        minWidth: "140px",
        cursor: "pointer",
        color: "var(--white)",
        fontFamily: "inherit",
        backdropFilter: "blur(10px)",
      } as React.CSSProperties}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "42px",
          height: "42px",
          borderRadius: "50%",
          background: v.iconBg,
          color: v.icon,
          marginBottom: "0.2rem",
          border: `1px solid ${v.border}`,
        }}
      >
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)", color: "var(--white)" }}>{label}</span>
      {sublabel && <span style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>{sublabel}</span>}
    </button>
  );
}

// ── مكون صف قسط ─────────────────────────────────────
function InstallmentRow({
  alert,
  onPay,
}: {
  alert: InstallmentAlert;
  onPay: (a: InstallmentAlert) => void;
}) {
  const isOverdue = alert.status === "overdue";
  const isToday   = alert.status === "due_today";

  // ألوان الحالة — مشتقة من متغيرات colors.css
  const borderColor = isOverdue ? "#c0001a" /* أحمر داكن مشتق من --red */ : isToday ? "var(--gold)" : "var(--gray)";
  const bgColor     = isOverdue ? "rgba(77,0,10,0.1)" : isToday ? "rgba(215,168,0,0.06)" : "rgba(122,122,122,0.05)";

  const currencyName = alert.currency === "USD" ? "دولار أمريكي" : "دينار عراقي";
  const waText = `السيد ${alert.buyerName} المحترم،\nنود تذكيركم بأن قسط السيارة المستحق بتاريخ ${alert.dueDate} والبالغ (${alert.amount.toLocaleString("en-US")}) ${currencyName} قد حان موعد سداده.\nنرجو التفضل بتسديد القسط في أقرب وقت ممكن.\nشاكرين لكم حسن تعاونكم، ونتطلع دائماً لخدمتكم.\nمع التقدير والاحترام،\nفجر الوادي لتجارة السيارات`;
  const cleanPhone = alert.phone.replace(/\D/g, "").replace(/^0+/, "");
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.9rem 1rem",
        background: bgColor,
        borderRadius: "10px",
        border: `1px solid ${borderColor}40`,
        borderRightWidth: "4px",
        borderRightColor: borderColor,
      }}
    >
      {/* مؤشر الحالة */}
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: borderColor,
          flexShrink: 0,
          boxShadow: isOverdue ? `0 0 8px ${borderColor}` : "none",
        }}
      />

      {/* معلومات المشتري */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-sm)", color: "var(--white)", marginBottom: "0.15rem" }}>
          {alert.buyerName}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <Calendar size={12} />
            {alert.dueDate}
          </span>
          {isOverdue && (
            <span style={{ color: "#e05070", fontWeight: "var(--fw-medium)" }}>
              متأخر {alert.daysDifference} يوم
            </span>
          )}
          {isToday && (
            <span style={{ color: "var(--smiles)", fontWeight: "var(--fw-medium)" }}>مستحق اليوم</span>
          )}
          {alert.carInfo && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <CarIcon size={12} />
              {alert.carInfo}
            </span>
          )}
        </div>
      </div>

      {/* المبلغ */}
      <div style={{ fontWeight: "var(--fw-extrabold)", fontSize: "var(--fs-base)", color: borderColor, flexShrink: 0 }}>
        {alert.amount.toLocaleString("en-US")} {alert.currency === "USD" ? "USD" : "IQ"}
      </div>

      {/* الأزرار */}
      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => onPay(alert)}
          style={{
            padding: "0.35rem 0.75rem",
            background: "linear-gradient(135deg, rgba(215,168,0,0.9), rgba(180,130,0,0.95))",
            border: "none",
            borderRadius: "8px",
            color: "var(--black)",
            fontSize: "var(--fs-xs)",
            fontWeight: "var(--fw-extrabold)",
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          تم التسديد ✓
        </button>
        {alert.phone && (
          <button
            type="button"
            onClick={async () => {
              const text = encodeURIComponent(waText);
              try {
                await callTauri("open_whatsapp", { phone: cleanPhone, text });
              } catch {
                window.open(waLink, "_blank");
              }
            }}
            style={{
              padding: "0.35rem 0.6rem",
              background: "linear-gradient(135deg, #25D366, #128C7E)",
              borderRadius: "8px",
              color: "var(--white)",
              fontSize: "var(--fs-xs)",
              fontWeight: "var(--fw-bold)",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 2.137.56 4.146 1.54 5.92L.06 23.94l6.02-1.48A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6c-1.96 0-3.82-.6-5.36-1.6l-.38-.24-4.06 1 .86-4.2-.24-.4C1.8 14.6 1.2 12.8 1.2 10.8 1.2 5.84 5.84 1.2 12 1.2s10.8 4.64 10.8 10.8-4.64 10.8-10.8 10.8zm5.92-6.84c-.32-.16-1.88-.92-2.16-1.04-.28-.12-.5-.16-.72.16-.22.32-.84 1.04-1.04 1.24-.2.2-.4.24-.72.08s-1.4-.52-2.68-1.64c-.98-.88-1.64-1.96-1.84-2.28-.2-.32-.02-.5.14-.66.14-.14.32-.36.48-.56.16-.2.22-.32.32-.56.1-.24.06-.44-.02-.6-.08-.16-.72-1.72-.98-2.36-.26-.64-.52-.56-.72-.56-.18 0-.4-.04-.62-.04s-.56.08-.86.4c-.3.32-1.14 1.12-1.14 2.72s1.18 3.16 1.34 3.4c.16.24 2.32 3.52 5.62 4.92.78.34 1.4.54 1.88.7.78.24 1.5.2 2.06.12.64-.08 1.88-.76 2.14-1.5.26-.74.26-1.38.18-1.5-.08-.12-.28-.2-.6-.36z" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── مكون صف دائن ─────────────────────────────────────
function CreditorRow({
  creditor,
  onPay,
}: {
  creditor: UnifiedAccount;
  onPay: (name: string) => void;
}) {
  const totalDebt = Math.abs(creditor.usd_balance);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.9rem 1rem",
        background: "rgba(77,0,10,0.1)",
        borderRadius: "10px",
        border: "1px solid rgba(180,0,20,0.2)",
        borderRightWidth: "4px",
        borderRightColor: "#c0001a",
      }}
    >
      <Landmark size={18} style={{ color: "var(--smiles)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-sm)", color: "var(--white)" }}>{creditor.partner_name}</div>
        {creditor.phone && (
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <Phone size={12} />
            <span>{creditor.phone}</span>
          </div>
        )}
      </div>
      <div style={{ textAlign: "left", flexShrink: 0 }}>
        {creditor.usd_balance < 0 && (
          <div style={{ fontWeight: "var(--fw-extrabold)", fontSize: "var(--fs-base)", color: "#e05070" }}>
            {totalDebt.toLocaleString("ar-IQ")} USD
          </div>
        )}
        {creditor.iqd_balance < 0 && (
          <div style={{ fontWeight: "var(--fw-medium)", fontSize: "var(--fs-sm)", color: "#c08090" }}>
            {Math.abs(creditor.iqd_balance).toLocaleString("ar-IQ")} IQ
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPay(creditor.partner_name)}
        style={{
          padding: "0.35rem 0.85rem",
          background: "linear-gradient(135deg, rgba(215,168,0,0.9), rgba(180,130,0,0.95))",
          border: "none",
          borderRadius: "8px",
          color: "var(--black)",
          fontSize: "var(--fs-xs)",
          fontWeight: "var(--fw-extrabold)",
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        تسديد
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ── المكون الرئيسي: لوحة التحكم ─────────────────────
// ════════════════════════════════════════════════════════
export function Dashboard({ cars, partners, onRefresh, onOpenCarForm }: DashboardProps) {

  const [safeEntries,     setSafeEntries]     = useState<CashRegisterEntry[]>([]);
  const [masterEntries,   setMasterEntries]   = useState<CashRegisterEntry[]>([]);
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [installments,    setInstallments]    = useState<InstallmentAlert[]>([]);
  const [loadingAction,   setLoadingAction]   = useState(false);

  const loadBalances = async () => {
    try {
      const [safe, master, unified] = await Promise.all([
        callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: "قاصه" }),
        callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: "ماستر" }),
        callTauri<UnifiedAccount[]>("get_unified_accounts"),
      ]);
      setSafeEntries(safe || []);
      setMasterEntries(master || []);
      setUnifiedAccounts(unified || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadInstallments = async () => {
    const debtors = partners.filter((p) => p.kind === "مطلوب" || p.kind === "مقترض");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alerts: InstallmentAlert[] = [];

    await Promise.allSettled(
      debtors.map(async (debtor) => {
        const txs = await callTauri<any[]>("get_partner_transactions", {
          partnerName: debtor.partner_name,
          kind: debtor.kind,
        });
        for (const tx of txs || []) {
          if (tx.type_ !== "سحب") continue;
          const cleanDate = (tx.date || "").replace(/\//g, "-").trim();
          const parts = cleanDate.split("-");
          let due = new Date();
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) due = new Date(y, m, d);
          }
          due.setHours(0, 0, 0, 0);
          const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

          if (diffDays <= 30) {
            const carInfo = tx.notes
              ? (tx.notes.match(/#بيع_سيارة_([^\s]+)/)?.[1] || "")
              : "";

            alerts.push({
              id: tx.id,
              buyerName: debtor.partner_name,
              phone: debtor.phone || "",
              dueDate: tx.date,
              amount: tx.amount,
              currency: tx.currency || "IQD",
              status: diffDays < 0 ? "overdue" : diffDays === 0 ? "due_today" : "upcoming",
              daysDifference: Math.abs(diffDays),
              notes: tx.notes || "",
              carInfo,
              partnerKind: debtor.kind,
            });
          }
        }
      })
    );
    setInstallments(alerts.sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
  };

  useEffect(() => { void loadBalances();    }, [partners]);
  useEffect(() => { void loadInstallments(); }, [partners]);

  // حسابات الأرصدة
  const computeIqdBalance = (list: CashRegisterEntry[]) =>
    list.filter((e) => e.currency !== "USD").reduce((s, e) => s + e.amount, 0);
  const computeUsdBalance = (list: CashRegisterEntry[]) =>
    list.filter((e) => e.currency === "USD").reduce((s, e)  => s + e.amount, 0);

  const safeIqd    = computeIqdBalance(safeEntries);
  const safeUsd    = computeUsdBalance(safeEntries);
  const masterIqd  = computeIqdBalance(masterEntries);
  const masterUsd  = computeUsdBalance(masterEntries);

  const inventoryValue = cars
    .filter((c) => c.status === "متوفرة")
    .reduce((s, c) => s + (c.purchase_price || 0), 0);

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const monthlyProfits  = cars.reduce((total, car) => {
    if (car.status === "مبيوعة" && car.sale_date?.startsWith(currentMonthStr)) {
      return total + ((car.selling_price || 0) - (car.purchase_price || 0));
    }
    return total;
  }, 0);

  const creditors = unifiedAccounts.filter((a) => a.iqd_balance < 0 || a.usd_balance < 0);
  const filteredInstallments = installments.filter(
    (a) => a.status === "overdue" || a.status === "due_today"
  );

  // ── نوافذ الإجراءات السريعة ──
  const [showQuickSale,    setShowQuickSale]    = useState(false);
  const [showQuickExpense, setShowQuickExpense] = useState(false);

  const [expenseDesc,     setExpenseDesc]     = useState("");
  const [expenseAmt,      setExpenseAmt]      = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<"IQD" | "USD">("IQD");
  const [expenseCar,      setExpenseCar]      = useState("");

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc.trim() || !Number(expenseAmt)) return;
    setLoadingAction(true);
    try {
      await callTauri("add_expense", {
        description: expenseDesc.trim(),
        amount: Number(expenseAmt) || 0,
        date: todayIsoDate(),
        notes: expenseCar ? `مصروف مرتبط بالسيارة ${expenseCar}` : null,
        currency: expenseCurrency,
        carNumber: expenseCar || null,
      });
      setShowQuickExpense(false);
      setExpenseDesc(""); setExpenseAmt(""); setExpenseCar("");
      await onRefresh(); await loadBalances();
    } catch (err) { console.error(err); }
    finally { setLoadingAction(false); }
  };

  // ── تسديد قسط ──
  const [showPayInstallmentModal, setShowPayInstallmentModal] = useState(false);
  const [selectedInstallment,     setSelectedInstallment]     = useState<InstallmentAlert | null>(null);
  const [payAmount,  setPayAmount]  = useState("");
  const [payMethod,  setPayMethod]  = useState<"قاصه" | "ماستر">("قاصه");

  const handleOpenPayInstallment = (alert: InstallmentAlert) => {
    setSelectedInstallment(alert);
    setPayAmount(String(alert.amount));
    setShowPayInstallmentModal(true);
  };

  const handlePayInstallment = async () => {
    if (!selectedInstallment || !Number(payAmount)) return;
    setLoadingAction(true);
    try {
      const partnerKind = selectedInstallment.partnerKind || "مطلوب";
      await callTauri("add_partner_transaction", {
        partnerName: selectedInstallment.buyerName,
        kind: partnerKind,
        type: "ايداع",
        amount: Number(payAmount),
        date: todayIsoDate(),
        notes: `تسديد قسط من لوحة التحكم - ${selectedInstallment.notes}`,
        currency: selectedInstallment.currency,
        paymentType: payMethod,
      });

      const paidNum = Number(payAmount);
      const dueNum  = selectedInstallment.amount;
      if (paidNum > dueNum) {
        const txs = await callTauri<any[]>("get_partner_transactions", {
          partnerName: selectedInstallment.buyerName,
          kind: partnerKind,
        });
        const futureInstallments = txs
          .filter((t) => t.type_ === "سحب" && t.id !== selectedInstallment.id)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (futureInstallments.length > 0) {
          const excess    = paidNum - dueNum;
          const distribute = excess / futureInstallments.length;
          for (const fut of futureInstallments) {
            const nextAmount = Math.max(0, fut.amount - distribute);
            await callTauri("update_partner_transaction", {
              id: fut.id,
              partnerName: selectedInstallment.buyerName,
              kind: partnerKind,
              type_: "سحب",
              amount: nextAmount,
              date: fut.date,
              notes: fut.notes,
              currency: fut.currency || "IQD",
              paymentType: fut.payment_type || "قاصه",
            });
          }
        }
      }

      await callTauri("delete_partner_transaction", {
        id: selectedInstallment.id,
        partnerName: selectedInstallment.buyerName,
        kind: partnerKind,
      });

      setShowPayInstallmentModal(false);
      setSelectedInstallment(null);
      setPayAmount("");
      await onRefresh(); await loadBalances(); await loadInstallments();
    } catch (err) { console.error(err); }
    finally { setLoadingAction(false); }
  };

  // ── تسديد الممولين ──
  const [showPayCreditorModal, setShowPayCreditorModal] = useState(false);
  const [selectedCreditor,     setSelectedCreditor]     = useState("");
  const [creditorAmount,       setCreditorAmount]       = useState("");
  const [creditorCurrency,     setCreditorCurrency]     = useState<"IQD" | "USD">("USD");
  const [courierName,          setCourierName]          = useState("");
  const [creditorCommission,   setCreditorCommission]   = useState("");
  const [commissionCurrency,   setCommissionCurrency]   = useState<"IQD" | "USD">("USD");

  const handleOpenPayCreditor = (name?: string) => {
    if (name) setSelectedCreditor(name);
    setShowPayCreditorModal(true);
  };

  const handlePayCreditor = async () => {
    // تنظيف الاسم والبيانات المحددة فوراً
    const cleanCreditorName = selectedCreditor.trim();
    if (!cleanCreditorName || !Number(creditorAmount)) return;
    
    setLoadingAction(true);
    try {
      const amountNum = Number(creditorAmount);
      const commissionNum = Number(creditorCommission) || 0;
      
      // العثور على الحساب الفعلي للممول المختار في النظام لمعرفة نوع حسابه الحقيقي بدقة (ممول أو مطلوب)
      const matchingPartner = partners.find(
        (p) => p.partner_name.trim() === cleanCreditorName && (p.kind === "ممول" || p.kind === "مطلوب")
      );
      const matchingAccount = unifiedAccounts.find((a) => a.partner_name.trim() === cleanCreditorName);
      const partnerKind = matchingPartner?.kind || matchingAccount?.kind || "ممول";

      // استدعاء السيرفر بالبيانات المظهرة النظيفة تماماً
      await callTauri("pay_financier_from_partners", {
        financierName: cleanCreditorName,
        financierKind: partnerKind, // نمرر نوع حساب الممول الأصلي (ممول) وليس حساب الشركة!
        amount: amountNum,
        date: todayIsoDate(),
        notes: `تسديد دين للممول ${cleanCreditorName}${courierName ? ` بيد ${courierName.trim()}` : ""}`,
        currency: creditorCurrency,
        commissionAmount: commissionNum,
        commissionCurrency: commissionCurrency,
        commissionNotes: courierName ? `تسديد دين بيد ${courierName.trim()}` : null,
      });

      setShowPayCreditorModal(false);
      setSelectedCreditor("");
      setCreditorAmount("");
      setCourierName("");
      setCreditorCommission("");
      
      // تحديث كامل للواجهة والقوائم
      await onRefresh();
      await loadBalances();
    } catch (err) {
      console.error("فشل تأكيد عملية تسديد الممول والتحويل المالي:", err);
    } finally {
      setLoadingAction(false);
    }
  };

  const monthName = new Date().toLocaleDateString("ar-IQ", { month: "long", year: "numeric" });

  // ── أنماط زر مشتركة (مُعاد استخدامها) ──
  const btnPrimary: React.CSSProperties = {
    flex: 1,
    padding: "0.8rem",
    background: "linear-gradient(135deg, var(--gold), #b08800)",
    border: "none",
    borderRadius: "10px",
    color: "var(--black)",
    fontWeight: "var(--fw-extrabold)",
    fontSize: "var(--fs-base)",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  };
  const btnSecondary: React.CSSProperties = {
    padding: "0.8rem 1.25rem",
    background: "rgba(122,122,122,0.08)",
    border: "1px solid rgba(122,122,122,0.2)",
    borderRadius: "10px",
    color: "var(--gray)",
    fontWeight: "var(--fw-medium)",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div
      className="dashboard"
      style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0, height: "100%" }}
    >

      {/* ── شريط الأدوات الموحد ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right" />
        <div
          className="unified-toolbar__center"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
        >
          <h2
            className="unified-toolbar__title"
            style={{
              fontSize: "var(--fs-title)",
              color: "var(--smiles)",
              letterSpacing: "0.02em",
            }}
          >
            البرنامج الحسابي لشركة فجر الوادي
          </h2>
          <span style={{ color: "var(--gray)", fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)" }}>
            بإدارة امير الزجراوي ومنتصر الحيدري
          </span>
        </div>
        <div className="unified-toolbar__left" />
      </div>

      {/* ═══════════════════════════════════════════════════
          بطاقات الملخص المالي
      ═══════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>

        <StatCard icon={Coins} label="رصيد القاصة النقدية">
          <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-extrabold)", color: "var(--smiles)" }}>
            <PriceDisplay amount={safeIqd} />
          </div>
          {safeUsd > 0 && (
            <div style={{ fontSize: "var(--fs-base)", color: "var(--gray)", marginTop: "0.2rem" }}>
              <PriceDisplay amount={safeUsd} currency="USD" />
            </div>
          )}
        </StatCard>

        <StatCard icon={CreditCard} label="رصيد حساب الماستر">
          <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-extrabold)", color: "var(--smiles)" }}>
            <PriceDisplay amount={masterIqd} />
          </div>
          {masterUsd > 0 && (
            <div style={{ fontSize: "var(--fs-base)", color: "var(--gray)", marginTop: "0.2rem" }}>
              <PriceDisplay amount={masterUsd} currency="USD" />
            </div>
          )}
        </StatCard>

        <StatCard icon={TrendingUp} label={`أرباح ${monthName}`}>
          <div
            style={{
              fontSize: "var(--fs-lg)",
              fontWeight: "var(--fw-extrabold)",
              color: monthlyProfits >= 0 ? "var(--smiles)" : "#e05070",
            }}
          >
            <PriceDisplay amount={Math.abs(monthlyProfits)} />
          </div>
          {monthlyProfits < 0 && (
            <div style={{ fontSize: "var(--fs-xs)", color: "#e05070", marginTop: "0.2rem" }}>خسارة</div>
          )}
        </StatCard>

        <StatCard icon={CarIcon} label="قيمة مخزون المعرض">
          <div style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-extrabold)", color: "var(--smiles)" }}>
            <PriceDisplay amount={inventoryValue} />
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)", marginTop: "0.2rem" }}>
            {cars.filter((c) => c.status === "متوفرة").length} سيارة
          </div>
        </StatCard>
      </div>

      {/* ═══════════════════════════════════════════════════
          شريط الإجراءات السريعة
      ═══════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>
        <QuickBtn
          icon={Plus}
          label="شراء سيارة"
          sublabel="تسجيل سيارة جديدة"
          onClick={() => onOpenCarForm("new")}
          variant="gold"
        />
        <QuickBtn
          icon={CarIcon}
          label="بيع سيارة"
          sublabel="إتمام عملية بيع"
          onClick={() => setShowQuickSale(true)}
          variant="gold"
        />
        <QuickBtn
          icon={Coins}
          label="تسجيل مصروف"
          sublabel="مصروف يومي أو خاص"
          onClick={() => setShowQuickExpense(true)}
          variant="red"
        />
        <QuickBtn
          icon={Landmark}
          label="سحب ممول"
          sublabel="سداد دين للجهة الممولة"
          onClick={() => handleOpenPayCreditor()}
          variant="gray"
        />
      </div>

      {/* ═══════════════════════════════════════════════════
          القسم السفلي: الأقساط + الديون
      ═══════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", flex: 1, minHeight: 0 }}>

        {/* ── الأقساط المستحقة ── */}
        <div
          className="dashboard-panel"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Calendar size={18} style={{ color: "var(--smiles)" }} />
              <span style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-base)", color: "var(--white)" }}>
                الأقساط والمستحقات
              </span>
              {filteredInstallments.length > 0 && (
                <span
                  style={{
                    background: "var(--red)",
                    border: "1px solid rgba(180,0,20,0.5)",
                    color: "var(--white)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: "var(--fw-extrabold)",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "20px",
                    animation: "pulse 2s infinite",
                  }}
                >
                  {filteredInstallments.length}
                </span>
              )}
            </div>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>
              {installments.length} إجمالي
            </span>
          </div>

          <div
            className="dashboard-scroll-list"
            style={{ display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1, overflowY: "auto", minHeight: 0 }}
          >
            {filteredInstallments.length > 0 ? (
              filteredInstallments.map((alert) => (
                <InstallmentRow key={alert.id} alert={alert} onPay={handleOpenPayInstallment} />
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
                <CheckCircle2 size={36} style={{ color: "var(--smiles)", margin: "0 auto 0.5rem auto", opacity: 0.6 }} />
                <div style={{ color: "var(--gray)", fontSize: "var(--fs-sm)" }}>لا توجد أقساط متأخرة أو مستحقة</div>
              </div>
            )}
          </div>
        </div>

        {/* ── الجهات الممولة ── */}
        <div
          className="dashboard-panel"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Landmark size={18} style={{ color: "var(--smiles)" }} />
              <span style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-base)", color: "var(--white)" }}>
                الجهات الممولة (الدائنون)
              </span>
              {creditors.length > 0 && (
                <span
                  style={{
                    background: "var(--red)",
                    border: "1px solid rgba(180,0,20,0.5)",
                    color: "var(--white)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: "var(--fw-extrabold)",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "20px",
                  }}
                >
                  {creditors.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleOpenPayCreditor()}
              style={{
                padding: "0.3rem 0.7rem",
                background: "rgba(215,168,0,0.08)",
                border: "1px solid rgba(215,168,0,0.25)",
                borderRadius: "8px",
                color: "var(--smiles)",
                fontSize: "var(--fs-xs)",
                fontWeight: "var(--fw-bold)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s",
              }}
            >
              + تسديد دفعة
            </button>
          </div>

          <div
            className="dashboard-scroll-list"
            style={{ display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1, overflowY: "auto", minHeight: 0 }}
          >
            {creditors.length > 0 ? (
              creditors.map((c) => (
                <CreditorRow key={`${c.partner_name}_${c.kind}`} creditor={c} onPay={handleOpenPayCreditor} />
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
                <PartyPopper size={36} style={{ color: "var(--smiles)", margin: "0 auto 0.5rem auto", opacity: 0.6 }} />
                <div style={{ color: "var(--gray)", fontSize: "var(--fs-sm)" }}>لا توجد مديونيات للممولين حالياً</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          نافذة اختيار سيارة للبيع
      ════════════════════════════════════════════════════ */}
      {showQuickSale && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setShowQuickSale(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "500px",
              background: "var(--black)",
              borderRadius: "20px",
              border: "1px solid rgba(215,168,0,0.25)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
              maxHeight: "80vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="modal-dialog__header"
              style={{
                background: "linear-gradient(135deg, rgba(215,168,0,0.1), rgba(215,168,0,0.03))",
                borderBottom: "1px solid rgba(215,168,0,0.15)",
                padding: "1.1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-extrabold)", color: "var(--smiles)", margin: 0 }}>
                🚗 بيع سيارة متوفرة
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickSale(false)}
                style={{
                  width: "32px", height: "32px",
                  borderRadius: "50%",
                  border: "1px solid rgba(122,122,122,0.2)",
                  background: "rgba(122,122,122,0.08)",
                  color: "var(--gray)",
                  fontSize: "var(--fs-md)",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div style={{ padding: "2rem", overflowY: "auto", flex: 1 }}>
                <div style={{ marginBottom: "1rem", fontSize: "var(--fs-sm)", color: "var(--gray)", fontWeight: "var(--fw-medium)" }}>
                  اختر السيارة المراد بيعها:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {cars.filter((c) => c.status === "متوفرة").length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "var(--gray)" }}>
                      لا توجد سيارات متوفرة للبيع
                    </div>
                  ) : (
                    cars
                      .filter((c) => c.status === "متوفرة")
                      .map((c) => (
                        <button
                          key={c.car_number}
                          type="button"
                          onClick={() => { setShowQuickSale(false); onOpenCarForm("edit", c); }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.85rem 1.1rem",
                            background: "rgba(215,168,0,0.04)",
                            border: "1px solid rgba(215,168,0,0.1)",
                            borderRadius: "10px",
                            cursor: "pointer",
                            color: "var(--white)",
                            fontFamily: "inherit",
                            textAlign: "right",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(215,168,0,0.1)";
                            e.currentTarget.style.borderColor = "rgba(215,168,0,0.35)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(215,168,0,0.04)";
                            e.currentTarget.style.borderColor = "rgba(215,168,0,0.1)";
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-base)", color: "var(--white)" }}>
                              {c.car_name} {c.car_model}
                            </div>
                            <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)", marginTop: "0.15rem" }}>
                              رقم اللوحة: {c.car_number} · سنة {c.car_year}
                            </div>
                          </div>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: "var(--fs-sm)", color: "var(--smiles)", fontWeight: "var(--fw-bold)" }}>
                              {(c.purchase_price || 0).toLocaleString("ar-IQ")} {c.currency === "USD" ? "USD" : "IQ"}
                            </div>
                            <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>سعر الشراء</div>
                          </div>
                        </button>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          نافذة تسجيل مصروف
      ════════════════════════════════════════════════════ */}
      {showQuickExpense && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setShowQuickExpense(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "460px",
              background: "var(--black)",
              borderRadius: "20px",
              border: "1px solid rgba(77,0,10,0.5)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
            }}
          >
            <div
              className="modal-dialog__header"
              style={{
                background: "linear-gradient(135deg, rgba(77,0,10,0.35), rgba(77,0,10,0.1))",
                borderBottom: "1px solid rgba(77,0,10,0.4)",
                padding: "1.1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: "var(--fs-base)", fontWeight: "var(--fw-extrabold)", color: "#e05070", margin: 0 }}>
                💸 تسجيل مصروف جديد
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickExpense(false)}
                style={{
                  width: "32px", height: "32px",
                  borderRadius: "50%",
                  border: "1px solid rgba(122,122,122,0.2)",
                  background: "rgba(122,122,122,0.08)",
                  color: "var(--gray)",
                  fontSize: "var(--fs-md)",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>
            <form
              onSubmit={handleExpenseSubmit}
              style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div className="form-group">
                <label className="label">بيان المصروف *</label>
                <TextInput
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  placeholder="وصف المصروف..."
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">المبلغ والعملة *</label>
                <PriceInput
                  value={expenseAmt}
                  onChange={setExpenseAmt}
                  currency={expenseCurrency}
                  onCurrencyChange={(cur) => setExpenseCurrency(cur as any)}
                />
              </div>
              <div className="form-group">
                <label className="label">ربط بسيارة (اختياري)</label>
                <SelectMenu
                  value={expenseCar}
                  onValueChange={(val) => setExpenseCar(val === " " ? "" : val)}
                >
                  <SelectMenuTrigger className="input flex items-center justify-between text-right">
                    <SelectMenuValue placeholder="-- بدون ربط --" />
                  </SelectMenuTrigger>
                  <SelectMenuContent className="z-[1100]">
                    <SelectMenuItem value=" " className="text-right justify-end">-- بدون ربط --</SelectMenuItem>
                    {cars.map((c) => (
                      <SelectMenuItem key={c.car_number} value={c.car_number} className="text-right justify-end">
                        {c.car_name} {c.car_model} ({c.car_number})
                      </SelectMenuItem>
                    ))}
                  </SelectMenuContent>
                </SelectMenu>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="submit"
                  disabled={loadingAction || !expenseDesc.trim() || !Number(expenseAmt)}
                  style={{
                    ...btnPrimary,
                    background: "linear-gradient(135deg, #c0001a, var(--red))",
                    color: "var(--white)",
                    opacity: loadingAction ? 0.6 : 1,
                  }}
                >
                  {loadingAction ? "جاري التسجيل..." : "✓ تسجيل المصروف"}
                </button>
                <button type="button" onClick={() => setShowQuickExpense(false)} style={btnSecondary}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          نافذة تسديد قسط
      ════════════════════════════════════════════════════ */}
      {showPayInstallmentModal && selectedInstallment && (
        <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={() => setShowPayInstallmentModal(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "480px",
              background: "var(--black)",
              borderRadius: "20px",
              border: "1px solid rgba(215,168,0,0.2)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.9)",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, rgba(215,168,0,0.08), rgba(215,168,0,0.02))",
                borderBottom: "1px solid rgba(215,168,0,0.12)",
                padding: "1.1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: "var(--fs-base)", fontWeight: "var(--fw-extrabold)", color: "var(--smiles)", margin: 0 }}>
                📅 تسديد قسط
              </h2>
              <button
                type="button"
                onClick={() => setShowPayInstallmentModal(false)}
                style={{
                  width: "30px", height: "30px",
                  borderRadius: "50%",
                  border: "1px solid rgba(122,122,122,0.2)",
                  background: "rgba(122,122,122,0.08)",
                  color: "var(--gray)",
                  fontSize: "var(--fs-base)",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {/* معلومات القسط */}
              <div
                style={{
                  background: "rgba(215,168,0,0.04)",
                  border: "1px solid rgba(215,168,0,0.12)",
                  borderRadius: "12px",
                  padding: "1rem",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>العميل</div>
                  <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-base)", color: "var(--white)" }}>
                    {selectedInstallment.buyerName}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>تاريخ الاستحقاق</div>
                  <div style={{ fontWeight: "var(--fw-medium)", fontSize: "var(--fs-sm)", color: "var(--smiles)" }}>
                    {selectedInstallment.dueDate}
                  </div>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>قيمة القسط المستحق</div>
                  <div style={{ fontWeight: "var(--fw-extrabold)", fontSize: "var(--fs-lg)", color: "var(--smiles)" }}>
                    {selectedInstallment.amount.toLocaleString("ar-IQ")}{" "}
                    {selectedInstallment.currency === "USD" ? "USD" : "IQ"}
                  </div>
                </div>
              </div>

              {/* حقل المبلغ */}
              <div className="form-group">
                <label className="label">المبلغ المسدد</label>
                <PriceInput
                  value={payAmount}
                  onChange={setPayAmount}
                  currency={selectedInstallment.currency as "IQD" | "USD"}
                  onCurrencyChange={() => {}}
                />
                {Number(payAmount) > selectedInstallment.amount && (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.6rem 0.75rem",
                      background: "rgba(215,168,0,0.07)",
                      border: "1px solid rgba(215,168,0,0.2)",
                      borderRadius: "8px",
                      fontSize: "var(--fs-xs)",
                      color: "var(--smiles)",
                    }}
                  >
                    ✨ الفائض{" "}
                    <strong>
                      {(Number(payAmount) - selectedInstallment.amount).toLocaleString("ar-IQ")}{" "}
                      {selectedInstallment.currency === "USD" ? "USD" : "IQ"}
                    </strong>{" "}
                    سيتم توزيعه على الأقساط القادمة تلقائياً
                  </div>
                )}
              </div>

              {/* طريقة التسديد */}
              <div className="form-group">
                <label className="label">يدخل إلى</label>
                <div className="payment-type-selector">
                  {(["قاصه", "ماستر"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : "master"} ${payMethod === opt ? "payment-type-btn--active" : ""}`}
                      onClick={() => setPayMethod(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  disabled={loadingAction || !Number(payAmount)}
                  onClick={handlePayInstallment}
                  style={{ ...btnPrimary, opacity: loadingAction || !Number(payAmount) ? 0.5 : 1 }}
                >
                  {loadingAction ? "جاري التسديد..." : "✓ تأكيد التسديد"}
                </button>
                <button type="button" onClick={() => setShowPayInstallmentModal(false)} style={btnSecondary}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          نافذة تسديد الممول
      ════════════════════════════════════════════════════ */}
      {showPayCreditorModal && (
        <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={() => setShowPayCreditorModal(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "500px",
              background: "var(--black)",
              borderRadius: "20px",
              border: "1px solid rgba(215,168,0,0.2)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.9)",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, rgba(215,168,0,0.1), rgba(215,168,0,0.03))",
                borderBottom: "1px solid rgba(215,168,0,0.12)",
                padding: "1.1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: "var(--fs-base)", fontWeight: "var(--fw-extrabold)", color: "var(--smiles)", margin: 0 }}>
                🏦 تسديد دفعة للجهة الممولة
              </h2>
              <button
                type="button"
                onClick={() => setShowPayCreditorModal(false)}
                style={{
                  width: "30px", height: "30px",
                  borderRadius: "50%",
                  border: "1px solid rgba(122,122,122,0.2)",
                  background: "rgba(122,122,122,0.08)",
                  color: "var(--gray)",
                  fontSize: "var(--fs-base)",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>

              {/* اختيار الدائن */}
              <div className="form-group">
                <label className="label">الجهة الممولة / الدائن *</label>
                {creditors.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                    {creditors.map((c) => (
                      <button
                        key={`${c.partner_name}_${c.kind}`}
                        type="button"
                        onClick={() => setSelectedCreditor(c.partner_name)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem 1rem",
                          background: selectedCreditor === c.partner_name
                            ? "rgba(215,168,0,0.1)"
                            : "rgba(215,168,0,0.03)",
                          border: `1px solid ${selectedCreditor === c.partner_name ? "rgba(215,168,0,0.4)" : "rgba(215,168,0,0.08)"}`,
                          borderRadius: "10px",
                          cursor: "pointer",
                          color: "var(--white)",
                          fontFamily: "inherit",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-sm)", color: "var(--white)" }}>
                            {c.partner_name}
                          </div>
                          {c.phone && (
                            <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>📞 {c.phone}</div>
                          )}
                        </div>
                        <div style={{ textAlign: "left" }}>
                          {c.usd_balance < 0 && (
                            <div style={{ fontWeight: "var(--fw-extrabold)", color: "#e05070", fontSize: "var(--fs-sm)" }}>
                              {Math.abs(c.usd_balance).toLocaleString("ar-IQ")} USD
                            </div>
                          )}
                          {c.iqd_balance < 0 && (
                            <div style={{ fontWeight: "var(--fw-medium)", color: "#c08090", fontSize: "var(--fs-sm)" }}>
                              {Math.abs(c.iqd_balance).toLocaleString("ar-IQ")} IQ
                            </div>
                          )}
                        </div>
                        {selectedCreditor === c.partner_name && (
                          <span style={{ color: "var(--smiles)", fontSize: "var(--fs-base)" }}>✓</span>
                        )}
                      </button>
                    ))}
                    <SelectMenu
                      value={selectedCreditor}
                      onValueChange={(val) => setSelectedCreditor(val === " " ? "" : val)}
                    >
                      <SelectMenuTrigger className="input flex items-center justify-between text-right" style={{ marginTop: "0.25rem", fontSize: "var(--fs-sm)" }}>
                        <SelectMenuValue placeholder="-- أو اختر من الكل --" />
                      </SelectMenuTrigger>
                      <SelectMenuContent className="z-[1100]">
                        <SelectMenuItem value=" " className="text-right justify-end">-- أو اختر من الكل --</SelectMenuItem>
                        {partners
                          .filter((p) => p.kind === "مطلوب" || p.kind === "ممول")
                          .map((p) => (
                            <SelectMenuItem key={`${p.partner_name}_${p.kind}`} value={p.partner_name} className="text-right justify-end">
                              {p.partner_name}
                            </SelectMenuItem>
                          ))}
                      </SelectMenuContent>
                    </SelectMenu>
                  </div>
                ) : (
                  <SelectMenu
                    value={selectedCreditor}
                    onValueChange={(val) => setSelectedCreditor(val === " " ? "" : val)}
                  >
                    <SelectMenuTrigger className="input flex items-center justify-between text-right">
                      <SelectMenuValue placeholder="-- اختر الجهة الممولة --" />
                    </SelectMenuTrigger>
                    <SelectMenuContent className="z-[1100]">
                      <SelectMenuItem value=" " className="text-right justify-end">-- اختر الجهة الممولة --</SelectMenuItem>
                      {partners
                        .filter((p) => p.kind === "مطلوب" || p.kind === "ممول")
                        .map((p) => (
                          <SelectMenuItem key={`${p.partner_name}_${p.kind}`} value={p.partner_name} className="text-right justify-end">
                            {p.partner_name}
                          </SelectMenuItem>
                        ))}
                    </SelectMenuContent>
                  </SelectMenu>
                )}
              </div>

              {/* المبلغ */}
              <div className="form-group">
                <label className="label">المبلغ المسدد *</label>
                <PriceInput
                  value={creditorAmount}
                  onChange={setCreditorAmount}
                  currency={creditorCurrency}
                  onCurrencyChange={(cur) => setCreditorCurrency(cur as any)}
                />
              </div>

              {/* بيد شخص */}
              <div className="form-group">
                <label className="label">بيد شخص (الناقل) — اختياري</label>
                <TextInput
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="اسم الشخص الذي سيحمل المبلغ..."
                />
              </div>

              {/* العمولة */}
              <div className="form-group">
                <label className="label">عمولة التحويل — اختياري</label>
                <PriceInput
                  value={creditorCommission}
                  onChange={setCreditorCommission}
                  currency={commissionCurrency}
                  onCurrencyChange={(cur) => setCommissionCurrency(cur as any)}
                />
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  disabled={loadingAction || !selectedCreditor || !Number(creditorAmount)}
                  onClick={handlePayCreditor}
                  style={{
                    ...btnPrimary,
                    opacity: loadingAction || !selectedCreditor || !Number(creditorAmount) ? 0.45 : 1,
                  }}
                >
                  {loadingAction ? "جاري التسديد..." : "✓ تأكيد التسديد"}
                </button>
                <button type="button" onClick={() => setShowPayCreditorModal(false)} style={btnSecondary}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

```

---

## File: `src/components/CarFormPanel.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import type { CarFormState, Partner, UnifiedAccount, CarExpenseRecord } from "../types";
import { callTauri } from "../api/tauri";
import "../styles/monsadilah.css";
import { SearchableCombobox } from "./SearchableCombobox";

import { arabicKeyboardToEnglish, englishKeyboardToArabic, toChassisText } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { todayIsoDate } from "../utils/dateSegments";
import { UnifiedDateField } from "./UnifiedDateField";
import { YearScrollField } from "./YearScrollField";
import {
  ActionButton,
  TextInput,
  NumberInput,
  PriceInput,
  type Currency,
} from "@/components/ui";

function toEn(v: string) { return toEnglishDigits(v); }

interface CarFormPanelProps {
  form: CarFormState;
  isEditing: boolean;
  saving: boolean;
  onChange: (patch: Partial<CarFormState>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose?: () => void;
  embedMode?: boolean;
}

export function CarFormPanel({
  form, isEditing, saving,
  onChange, onSubmit, onClose,
  embedMode = false,
}: CarFormPanelProps) {
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [carExpenses, setCarExpenses] = useState<CarExpenseRecord[]>([]);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmt, setExpenseAmt] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<"IQD" | "USD">("IQD");
  const [, setIsSelectOpen] = useState(false);
  // ── نظام الصفحتين: 0 = مواصفات السيارة، 1 = تفاصيل البيع ──
  const [formPage, setFormPage] = useState(0);

  useEffect(() => {
    callTauri<Partner[]>("get_partners")
      .then((res) => setAllPartners(res || []))
      .catch(console.error);
    callTauri<UnifiedAccount[]>("get_unified_accounts")
      .then((res) => setUnifiedAccounts(res || []))
      .catch(console.error);
  }, []);

  const loadCarExpenses = () => {
    if (!form.num) return;
    const carNumber = [form.num.trim(), form.province.trim()].filter(Boolean).join(" ");
    callTauri<CarExpenseRecord[]>("get_car_expense_records", { carNumber })
      .then((res) => {
        setCarExpenses(res || []);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadCarExpenses();
  }, [form.num, form.province]);

  const prevPage = useRef(formPage);
  useEffect(() => {
    if (prevPage.current === 0 && formPage === 1) {
      if (expenseDesc.trim() && Number(expenseAmt) > 0) {
        void handleAddExpense();
      }
    }
    prevPage.current = formPage;
  }, [formPage]);

  const handleAddExpense = async () => {
    if (!expenseDesc.trim() || !Number(expenseAmt) || !form.num) return;
    const carNumber = [form.num.trim(), form.province.trim()].filter(Boolean).join(" ");
    try {
      await callTauri("add_expense", {
        description: expenseDesc.trim(),
        amount: Number(expenseAmt) || 0,
        date: todayIsoDate(),
        notes: `مصروف مخصص للسيارة ${form.name || form.model || "سيارة"} رقم ${carNumber}`,
        currency: expenseCurrency,
        carNumber,
      });
      setExpenseDesc("");
      setExpenseAmt("");
      loadCarExpenses();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    try {
      await callTauri("delete_car_expense_record", { id });
      loadCarExpenses();
    } catch (err) {
      console.error(err);
    }
  };

  const hasSellingPrice = form.selling !== "" && Number(form.selling) > 0;
  const hasBuyerName = form.buyerName.trim() !== "";
  const isSold = hasSellingPrice && hasBuyerName;
  const installmentMonths = Number(form.installmentMonths) || 1;
  const amountRemaining = Number(form.amountRemaining) || 0;

  const monthly = form.paymentType === "اقساط" && installmentMonths > 0
    ? amountRemaining / installmentMonths : 0;
  const formRef = useRef<HTMLFormElement>(null);

  // Find "فجر الوادي" partner entry
  const fajrPartner = (form.carPartners || []).find(p => p.partner_name === "فجر الوادي");
  // Find the other partner entry (first one that isn't "فجر الوادي")
  const otherPartner = (form.carPartners || []).find(p => p.partner_name !== "فجر الوادي");

  const handleFajrAmountChange = (amount: string) => {
    const nextPartners = [...(form.carPartners || [])];
    const idx = nextPartners.findIndex(p => p.partner_name === "فجر الوادي");
    if (idx > -1) {
      nextPartners[idx] = { ...nextPartners[idx], amount };
    } else {
      nextPartners.push({ partner_name: "فجر الوادي", amount, currency: form.currency });
    }
    onChange({ carPartners: nextPartners });
  };

  const handleFajrCurrencyChange = (currency: "IQD" | "USD") => {
    const nextPartners = [...(form.carPartners || [])];
    const idx = nextPartners.findIndex(p => p.partner_name === "فجر الوادي");
    if (idx > -1) {
      nextPartners[idx] = { ...nextPartners[idx], currency };
    } else {
      nextPartners.push({ partner_name: "فجر الوادي", amount: "", currency });
    }
    onChange({ carPartners: nextPartners });
  };

  const handleOtherPartnerNameChange = (name: string) => {
    const nextPartners = (form.carPartners || []).filter(p => p.partner_name === "فجر الوادي");
    if (name && name !== "no_other_partner") {
      const existingOther = (form.carPartners || []).find(p => p.partner_name !== "فجر الوادي");
      const amount = existingOther ? existingOther.amount : "";
      const currency = existingOther ? existingOther.currency : form.currency;

      const found = allPartners.find(p => p.partner_name === name);
      const kind = found ? found.kind : "شريك";

      nextPartners.push({ partner_name: name, amount, currency, kind });
    }
    onChange({ carPartners: nextPartners });
  };

  const handleOtherPartnerAmountChange = (amount: string) => {
    const nextPartners = [...(form.carPartners || [])];
    const idx = nextPartners.findIndex(p => p.partner_name !== "فجر الوادي");
    if (idx > -1) {
      nextPartners[idx] = { ...nextPartners[idx], amount };
    } else {
      const existingOtherName = otherPartner ? otherPartner.partner_name : "";
      if (existingOtherName) {
        nextPartners.push({ partner_name: existingOtherName, amount, currency: form.currency });
      }
    }
    onChange({ carPartners: nextPartners });
  };

  const handleOtherPartnerCurrencyChange = (currency: "IQD" | "USD") => {
    const nextPartners = [...(form.carPartners || [])];
    const idx = nextPartners.findIndex(p => p.partner_name !== "فجر الوادي");
    if (idx > -1) {
      nextPartners[idx] = { ...nextPartners[idx], currency };
    } else {
      const existingOtherName = otherPartner ? otherPartner.partner_name : "";
      if (existingOtherName) {
        nextPartners.push({ partner_name: existingOtherName, amount: "", currency });
      }
    }
    onChange({ carPartners: nextPartners });
  };


  /* مزامنة حالة السيارة تلقائياً */
  useEffect(() => {
    const desiredStatus: "متوفرة" | "مبيوعة" = isSold ? "مبيوعة" : "متوفرة";
    if (form.status !== desiredStatus) {
      onChange({ status: desiredStatus });
      if (isSold && !form.saleDate) {
        onChange({ saleDate: todayIsoDate() });
      }
    }
  }, [isSold]);

  const prevAutoType = useRef(form.paymentType);

  useEffect(() => {
    const pt = form.paymentType;
    if (pt === prevAutoType.current) return;

    const patch: Partial<CarFormState> = {};
    const existingDate = form.deliveryDate || form.firstPaymentDate;
    if (pt === "موعد" && !form.deliveryDate) {
      patch.deliveryDate = existingDate || todayIsoDate();
    }
    if (pt === "اقساط" && !form.firstPaymentDate) {
      patch.firstPaymentDate = existingDate || todayIsoDate();
    }
    if (Object.keys(patch).length > 0) {
      onChange(patch);
    }
    prevAutoType.current = pt;
  }, [form.paymentType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formEl = formRef.current;
    if (!formEl) return;

    formEl.querySelectorAll(".input--error").forEach(el => el.classList.remove("input--error"));

    const checks: { id: string; valid: () => boolean }[] = [
      { id: "car-model", valid: () => !!form.model.trim() },
      { id: "car-year", valid: () => !!form.year.trim() },
      { id: "car-color", valid: () => !!form.color.trim() },
      { id: "car-num", valid: () => !!form.num.trim() },
      { id: "car-chassis", valid: () => !!form.chassis.trim() },
      { id: "car-purchase", valid: () => form.purchase !== "" && Number(form.purchase) > 0 },
    ];

    if (isSold) {
      checks.push(
        { id: "car-selling", valid: () => form.selling !== "" && Number(form.selling) > 0 },
        { id: "buyer-name", valid: () => !!form.buyerName.trim() },
      );
      if (form.paymentType !== "كاش") {
        checks.push(
          { id: "amount-paid", valid: () => form.amountPaid !== "" && Number(form.amountPaid) >= 0 },
          { id: "amount-remaining", valid: () => form.amountRemaining !== "" && Number(form.amountRemaining) >= 0 },
        );
      }
      if (form.paymentType === "اقساط") {
        checks.push(
          { id: "installment-months", valid: () => form.installmentMonths !== "" && Number(form.installmentMonths) > 0 },
          { id: "first-payment-date", valid: () => !!(form.firstPaymentDate || form.deliveryDate)?.trim() },
        );
      }
      if (form.paymentType === "موعد") {
        checks.push(
          { id: "first-payment-date", valid: () => !!(form.deliveryDate || form.firstPaymentDate)?.trim() },
        );
      }
    }

    for (const { id, valid } of checks) {
      try {
        if (!valid()) {
          const el = formEl.querySelector<HTMLElement>(`#${id}`);
          el?.classList.add("input--error");
          el?.focus();
          formEl.classList.add("form--submitted");
          return;
        }
      } catch (err) {
        console.error(`Validation error for #${id}:`, err);
        return;
      }
    }

    onSubmit(e);
  };

  const patchEnglishText = (key: "num" | "chassis", value: string) => {
    const next = key === "chassis" ? toChassisText(value) : toEn(value);
    onChange({ [key]: next } as Pick<CarFormState, typeof key>);
  };

  const formContent = (
    <form
      id="car-form"
      className="flex flex-col overflow-hidden relative bg-[var(--car-bg-page)] font-arabic"
      style={{
        ...(embedMode ? { flex: 1, minHeight: 0 } : { height: "100%", maxHeight: "100%" }),
      }}
      onSubmit={handleSubmit}
      ref={formRef}
      onInput={(e) => {
        const target = e.target as HTMLElement;
        target.classList.remove("input--error");
        const formEl = formRef.current;
        if (formEl && !formEl.querySelector(".input--error")) {
          formEl.classList.remove("form--submitted");
        }
      }}
      onChange={(e) => {
        const target = e.target as HTMLElement;
        target.classList.remove("input--error");
        const formEl = formRef.current;
        if (formEl && !formEl.querySelector(".input--error")) {
          formEl.classList.remove("form--submitted");
        }
      }}
    >
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        {/* ── حالة السيارة ── */}
        <div className="flex justify-center flex-shrink-0">
          <span
            className={`px-5 py-1.5 rounded-full text-sm font-bold tracking-wide transition-all duration-300 ${
              isSold
                ? "bg-red-500/15 text-red-400 border border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                : "bg-green-500/15 text-green-400 border border-green-500/30 shadow-[0_0_12px_rgba(34,197,94,0.15)]"
            }`}
          >
            {isSold ? "مبــــاع" : "متــــوفر"}
          </span>
        </div>

        {/* ── Tabs ── */}
        <div className="flex justify-center gap-8 border-b border-[var(--car-border)] flex-shrink-0">
          {[
            { page: 0, label: "🚗 مواصفات السيارة" },
            { page: 1, label: "💰 تفاصيل البيع" },
          ].map(({ page, label }) => (
            <button
              key={page}
              type="button"
              onClick={() => { setFormPage(page); }}
              className={`pb-2 text-[var(--car-fs-button)] font-bold transition-colors ${formPage === page
                  ? "text-[var(--car-accent)] border-b-2 border-[var(--car-accent)]"
                  : "text-[var(--car-text-muted)] border-b-2 border-transparent hover:text-gray-300"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Scrollable Content ── */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-0.5 car-dashboard__scrollable"
          data-inner-scroll="true"
        >
          {/* ─── Page 1: Car Specs + Purchase + Expenses ─── */}
          {formPage === 0 && (
            <div className="car-form-grid">
              {/* Column 1: Vehicle Specs */}
              <div className="car-form-card car-form-card--specs" id="specs-container">
                <h4 className="car-form-group-title">
                  مواصفات المركبة
                </h4>
                <div className="grid grid-cols-4" style={{ columnGap: "var(--car-gap-x)", rowGap: "var(--car-gap-y)" }}>
                  <div className="col-span-3 flex" style={{ gap: "var(--car-gap-x)" }}>
                    <div className="flex-[2_1_0%] min-w-0">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">نوع السيارة</label>
                      <TextInput
                        id="car-model"
                        inputSize="sm"
                        value={form.model}
                        onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish((e.target as HTMLInputElement).value).toUpperCase() })}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish(e.target.value).toUpperCase() })}
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish(e.target.value).toUpperCase() })}
                        placeholder="الموديل"
                        dir="ltr"
                        required
                        autoFocus={!isEditing}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">الموديل</label>
                      <YearScrollField
                        id="car-year"
                        value={form.year}
                        onChange={(year) => onChange({ year })}
                        required
                      />
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">اللون</label>
                    <TextInput
                      id="car-color"
                      inputSize="sm"
                      value={form.color}
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic((e.target as HTMLInputElement).value) })}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic(e.target.value) })}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic(e.target.value) })}
                      placeholder="لون"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">رقم اللوحة</label>
                    <TextInput
                      id="car-num"
                      inputSize="sm"
                      type="text"
                      inputMode="decimal"
                      value={form.num}
                      dir="ltr"
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ num: toEn((e.target as HTMLInputElement).value).replace(/\D/g, "") })}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ num: toEn(e.target.value).replace(/\D/g, "") })}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ num: toEn(e.target.value).replace(/\D/g, "") })}
                      onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
                      placeholder="12345"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">رقم الشاصي</label>
                    <TextInput
                      id="car-chassis"
                      inputSize="sm"
                      value={form.chassis}
                      dir="ltr"
                      onInput={(e: React.FormEvent<HTMLInputElement>) => patchEnglishText("chassis", (e.target as HTMLInputElement).value)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchEnglishText("chassis", e.target.value)}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchEnglishText("chassis", e.target.value)}
                      placeholder="VIN"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Column 2: Purchase Details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--car-gap-x)" }}>
                <div className="car-form-card car-form-card--purchase" id="purchase-container">
                  <h4 className="car-form-group-title">
                    تفاصيل الشراء
                  </h4>
                  <div className="grid grid-cols-2" style={{ columnGap: "var(--car-gap-x)", rowGap: "var(--car-gap-y)" }}>
                    <div>
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">سعر الشراء</label>
                      <PriceInput
                        id="car-purchase"
                        value={form.purchase}
                        onChange={(purchase) => onChange({ purchase })}
                        currency={form.currency as Currency}
                        onCurrencyChange={(currency) => onChange({ currency })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">اجمالي التكلفة</label>
                      {(() => {
                        const expensesTotal = carExpenses.reduce((s, e) => s + e.amount, 0);
                        const total = (Number(form.purchase) || 0) + expensesTotal;
                        return (
                          <div
                            style={{
                              height: "44px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 0.75rem",
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: "8px",
                              color: "#22c55e",
                              fontWeight: 700,
                              fontSize: "var(--fs-base)",
                              direction: "ltr",
                              opacity: 0.8,
                              justifyContent: "center",
                            }}
                          >
                            {total.toLocaleString("en-US")} {form.currency === "USD" ? "USD" : "IQ"}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="col-span-2">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">طريقة الشراء</label>
                      <div className="payment-type-selector" style={{ display: "flex", gap: "4px" }}>
                        {(["كاش", "شراكه", "تمويل", "شركة"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`payment-type-btn payment-type-btn--${opt === "كاش" ? "green" : opt === "شراكه" ? "purple" : opt === "تمويل" ? "blue" : "orange"} ${form.purchaseType === opt ? "payment-type-btn--active" : ""}`}
                            onClick={() => onChange({ purchaseType: opt })}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                {form.purchaseType && (
                  <div className="bg-[var(--car-bg-card)] rounded-xl p-3">
                    {form.purchaseType === "شراكه" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {(() => {
                          const totalPurchase = Number(form.purchase) || 0;
                          const amt = Number(fajrPartner?.amount) || 0;
                          const pct = totalPurchase > 0 ? ((amt / totalPurchase) * 100).toFixed(1) : "0";
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ flex: 1 }}>
                                <div className="input flex items-center justify-between text-right" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: "8px", height: "44px", padding: "0 0.75rem 0 2.2rem", color: "#fff", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-base)" }}>
                                  <span>فجر الوادي</span>
                                  <span style={{ fontSize: "var(--fs-xs)", color: "#a78bfa", fontWeight: "var(--fw-bold)" }}>
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <PriceInput
                                  value={fajrPartner?.amount || ""}
                                  onChange={handleFajrAmountChange}
                                  currency={(fajrPartner?.currency || form.currency) as "IQD" | "USD"}
                                  onCurrencyChange={handleFajrCurrencyChange}
                                  className="h-[44px]"
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {(() => {
                          const totalPurchase = Number(form.purchase) || 0;
                          const amt = Number(otherPartner?.amount) || 0;
                          const pct = totalPurchase > 0 ? ((amt / totalPurchase) * 100).toFixed(1) : "0";
                          const otherPartnerName = otherPartner?.partner_name || "";
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ flex: 1 }}>
                                {(() => {
                                  const opts = allPartners.filter((p) => {
                                    const k = (p.kind || "").trim().replace(/ة/g, "ه");
                                    return k === "مستثمر" && p.partner_name !== "فجر الوادي";
                                  }).map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }));
                                  return (
                                <SearchableCombobox
                                  value={otherPartnerName}
                                  onChange={handleOtherPartnerNameChange}
                                  onOpenChange={setIsSelectOpen}
                                  placeholder="اختر الشريك الآخر"
                                  options={opts}
                                  suffix={otherPartnerName ? `${pct}%` : "0%"}
                                  />
                                  );
                                })()}
                              </div>
                              <div style={{ flex: 1 }}>
                                <PriceInput
                                  value={otherPartner?.amount || ""}
                                  onChange={handleOtherPartnerAmountChange}
                                  currency={(otherPartner?.currency || form.currency) as "IQD" | "USD"}
                                  onCurrencyChange={handleOtherPartnerCurrencyChange}
                                  disabled={!otherPartnerName}
                                  className="h-[44px]"
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {Number(form.purchase) > 0 && (() => {
                          const totalContrib = (form.carPartners || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
                          const pct = (totalContrib / Number(form.purchase)) * 100;
                          return (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-xs)", marginBottom: "4px", opacity: 0.65 }}>
                                <span>إجمالي المساهمات</span>
                                <span>{Math.round(pct)}%</span>
                              </div>
                              <div style={{ height: "4px", background: "rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: pct >= 100 ? "linear-gradient(90deg,#22c55e,#16a34a)" : "linear-gradient(90deg,#8b5cf6,#a78bfa)", borderRadius: "10px", transition: "width 0.3s" }} />
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {form.purchaseType === "تمويل" && (
                      <SearchableCombobox
                        value={form.financerName}
                        onChange={(name) => onChange({ financerName: name })}
                        onOpenChange={setIsSelectOpen}
                        placeholder="اختر الممول"
                        options={allPartners.filter(p => (p.kind || "").trim().replace(/ة/g, "ه") === "ممول").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                       />
                    )}

                    {form.purchaseType === "شركة" && (
                      <SearchableCombobox
                        value={form.financerName}
                        onChange={(name) => onChange({ financerName: name })}
                        onOpenChange={setIsSelectOpen}
                        placeholder="اختر الشركة"
                        options={allPartners.filter((p) => (p.kind || "").trim().replace(/ة/g, "ه") === "شركه").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                      />
                    )}
                  </div>
                )}
                </div>
              </div>

              {/* Column 3: Expenses */}
              <div className="car-form-card car-form-card--expenses" id="expenses-container">
                <h4 className="car-form-group-title">
                  مصاريف السيارة الخاصة
                </h4>
                <div className="flex items-center" style={{ gap: "var(--car-gap-x)" }}>
                  <TextInput
                    inputSize="sm"
                    placeholder="وصف المصروف..."
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddExpense();
                      }
                    }}
                    containerClassName="flex-1"
                  />
                  <div className="w-40 shrink-0">
                    <PriceInput
                      value={expenseAmt}
                      onChange={setExpenseAmt}
                      currency={expenseCurrency}
                      onCurrencyChange={(cur) => setExpenseCurrency(cur as any)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddExpense();
                        }
                      }}
                      onBlur={() => {
                        if (expenseDesc.trim() && Number(expenseAmt) > 0) {
                          setTimeout(() => void handleAddExpense(), 150);
                        }
                      }}
                    />
                  </div>
                </div>
                {carExpenses.length > 0 ? (
                  <div className="max-h-[220px] overflow-y-auto">
                    <table className="w-full text-right" style={{ fontSize: "var(--car-fs-body)" }}>
                      <thead>
                        <tr className="border-b border-[var(--car-border)] text-[var(--car-text-muted)]">
                          <th className="pb-2 font-medium w-8"></th>
                          <th className="pb-2 font-medium text-center">التاريخ</th>
                          <th className="pb-2 font-medium text-center">نوع المصروف</th>
                          <th className="pb-2 font-medium text-center">السعر</th>
                        </tr>
                      </thead>
                      <tbody>
                        {carExpenses.map((exp) => (
                          <tr
                            key={exp.id}
                            className="group border-b border-[var(--car-border-light)] transition-colors hover:bg-[var(--car-bg-inactive-hover)]"
                          >
                            <td className="py-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="opacity-0 group-hover:opacity-100 text-[var(--car-btn-delete)] transition-opacity text-xs"
                                title="حذف المصروف"
                              >
                                ✕
                              </button>
                            </td>
                            <td className="py-1.5 text-center text-[var(--car-text-muted)]" style={{ fontSize: "var(--car-fs-body)" }}>
                              {exp.date}
                            </td>
                            <td className="py-1.5 text-center text-[var(--car-text-primary)] font-medium">
                              {exp.description}
                            </td>
                            <td className="py-1.5 text-center font-bold text-[var(--car-accent-light)] whitespace-nowrap">
                              {exp.amount.toLocaleString()} {exp.currency === "USD" ? "USD" : "IQ"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[var(--car-fs-body)] text-[var(--car-text-muted)] text-center py-3">لا توجد مصاريف مضافة</p>
                )}
              </div>
            </div>
          )}

          {/* ─── Page 2: Sale Details ─── */}
          {formPage === 1 && (
            <div className="car-form-card car-form-card--sale" id="sale-container" style={{ maxWidth: "820px", margin: "0 auto", width: "100%" }}>
              <h4 className="car-form-group-title">
                تفاصيل البيع والعميل
              </h4>
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-2">نوع الدفع</label>
              <div className="flex mb-4" style={{ gap: "var(--car-gap-x)" }}>
                {([
                  { label: "كاش", value: "كاش" as const, color: "emerald" },
                  { label: "موعد تسليم", value: "موعد" as const, color: "violet" },
                  { label: "اقساط", value: "اقساط" as const, color: "blue" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ paymentType: opt.value })}
                    className={`flex-1 h-10 rounded-lg text-[var(--car-fs-button)] font-bold transition-all ${form.paymentType === opt.value
                        ? opt.color === "emerald"
                          ? "bg-[var(--car-btn-cash)] text-white shadow-md"
                          : opt.color === "violet"
                            ? "bg-[var(--car-btn-delivery)] text-white shadow-md"
                            : "bg-[var(--car-btn-installment)] text-white shadow-md"
                        : "bg-[var(--car-bg-inactive)] text-[var(--car-text-label)] hover:bg-[var(--car-bg-inactive-hover)]"
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
                <div className="grid grid-cols-3" style={{ columnGap: "var(--car-gap-x)", rowGap: "var(--car-gap-y)" }}>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">سعر البيع</label>
                    <PriceInput
                      id="car-selling"
                      value={form.selling}
                      onChange={(selling) => onChange({ selling })}
                      currency={form.saleCurrency as Currency}
                      onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                      required={isSold}
                      tabIndex={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onChange({ amountPaid: form.selling });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">تاريخ البيع</label>
                    <UnifiedDateField
                      value={form.saleDate}
                      onChange={(saleDate) => onChange({ saleDate })}
                      tabIndex={3}
                    />
                  </div>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">اسم المشتري</label>
                    <TextInput
                      id="buyer-name"
                      inputSize="sm"
                      value={form.buyerName}
                      onChange={(e) => onChange({ buyerName: e.target.value })}
                      placeholder="الاسم"
                      required={isSold}
                      tabIndex={4}
                    />
                  </div>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">رقم الهاتف</label>
                    <TextInput
                      id="buyer-phone"
                      inputSize="sm"
                      value={form.phone}
                      autoComplete="new-password"
                      dir="ltr"
                      placeholder="07XX XXX XXXX"
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ phone: toEn((e.target as HTMLInputElement).value).replace(/[^\d+\s()-]/g, "") })}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ phone: toEn(e.target.value).replace(/[^\d+\s()-]/g, "") })}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ phone: toEn(e.target.value).replace(/[^\d+\s()-]/g, "") })}
                      tabIndex={5}
                    />
                  </div>

                  {/* Non-cash fields */}
                  {form.paymentType !== "كاش" && (
                    <>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">المقدمة المستلمة</label>
                        <PriceInput
                          id="amount-paid"
                          value={form.amountPaid}
                          onChange={(amountPaid) => onChange({ amountPaid })}
                          currency={form.saleCurrency as Currency}
                          onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                          required={isSold}
                          tabIndex={2}
                        />
                      </div>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">المتبقي</label>
                        <PriceInput
                          id="amount-remaining"
                          value={form.amountRemaining}
                          onChange={(amountRemaining) => onChange({ amountRemaining })}
                          currency={form.saleCurrency as Currency}
                          onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                          required={isSold}
                          disabled
                          tabIndex={6}
                        />
                      </div>
                    </>
                  )}

                  {/* Delivery date */}
                  {form.paymentType === "موعد" && (
                    <div className="col-span-3">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">موعد التسليم</label>
                      <UnifiedDateField
                        id="first-payment-date"
                        value={form.deliveryDate}
                        onChange={(v) => onChange({ deliveryDate: v })}
                        tabIndex={9}
                      />
                    </div>
                  )}

                  {/* Installment fields */}
                  {form.paymentType === "اقساط" && (
                    <>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">تاريخ القسط الأول</label>
                        <UnifiedDateField
                          id="first-payment-date"
                          value={form.firstPaymentDate}
                          onChange={(v) => onChange({ firstPaymentDate: v })}
                          tabIndex={9}
                        />
                      </div>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">الأشهر</label>
                        <NumberInput
                          id="installment-months"
                          value={form.installmentMonths}
                          min={1}
                          step={1}
                          onChange={(v) => onChange({ installmentMonths: String(Math.max(1, Number(v) || 1)) })}
                          required
                          tabIndex={8}
                          hideArrows
                        />
                      </div>
                      <div className="col-span-3 flex flex-col items-center gap-1 px-3 py-3 bg-[var(--car-bg-page)] rounded-lg mt-1">
                        <span className="text-[var(--car-fs-label)] text-[var(--car-text-label)]">القسط الشهري</span>
                        <span className="text-[var(--car-fs-button)] font-bold text-[var(--car-accent-light)] text-lg">
                          {monthly.toLocaleString("en-US")} {form.saleCurrency === "USD" ? "USD" : "IQ"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
          )}
        </div>
      </div>
    </form>
  );

  if (embedMode) {
    return formContent;
  }

  return (
    <div className="modal-overlay modal-overlay--soft" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog--car modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        <div className="car-dialog-panel" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div className="car-dialog-panel__body" style={{ padding: 0, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            {formContent}
          </div>
        </div>
      </div>
    </div>
  );
}

```

---

## File: `src/components/BrandLogo.tsx`

```tsx
/**
 * الشعار SVG بحدود خضراء مفرّغ الداخل — outline style
 */

type LogoSize = "sm" | "md" | "lg";

interface BrandLogoProps {
  size?: LogoSize;
  className?: string;
}

const sizeClass: Record<LogoSize, string> = {
  sm: "brand-logo-img--sm",
  md: "brand-logo-img--md",
  lg: "brand-logo-img--lg",
};

export function BrandLogo({ size = "md", className = "" }: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="شعار شركة فجر الوادي لتجارة السيارات"
      className={`brand-logo-img brand-logo-outline ${sizeClass[size]} ${className}`.trim()}
      draggable={false}
    />
  );
}

```

---

## File: `src/components/CarsTab.tsx`

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { buildCarInvokeArgs, callTauri } from "../api/tauri";
import type { Car, CarFormState, PartnerTransaction } from "../types";
import { carNetProfit, carProfitPercentage } from "../utils/finance";
import { cleanAndNormalizeNumbers } from "../utils/numberInput";
import { todayIsoDate } from "../utils/dateSegments";
import { CarFormPanel } from "./CarFormPanel";
import { ActionButton, PriceDisplay } from "@/components/ui";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import "../styles/cars.css";
import "../styles/cards.css";

interface CarsTabProps {
  cars: Car[];
  onRefresh: () => Promise<void>;
  carFormTrigger: { mode: "new" | "edit"; car?: Car } | null;
  onClearCarFormTrigger: () => void;
  searchOpen?: boolean;
  onSearchClose?: () => void;
}

/** وضع اللوحة الجانبية */
type PanelMode = "edit" | "new";
type CarSortKey =
  | "model"
  | "year"
  | "color"
  | "number"
  | "chassis"
  | "purchase"
  | "selling"
  | "profit";

const SORT_LABELS: Record<CarSortKey, string> = {
  model: "نوع السيارة",
  year: "الموديل",
  color: "اللون",
  number: "رقم السيارة",
  chassis: "رقم الشاصي",
  purchase: "اجمالي التكلفة",
  selling: "سعر البيع",
  profit: "الأرباح",
};

type CarsTabId = "available" | "sold";
const CARS_TABS: { id: CarsTabId; label: string }[] = [
  { id: "available", label: "المعروض" },
  { id: "sold", label: "المبــــــــــــــــــاع" },
];

const emptyForm = (): CarFormState => ({
  num: "", province: "", chassis: "",
  model: "", year: "", name: "",
  color: "", details: "",
  purchase: "", selling: "",
  status: "متوفرة", paymentType: "كاش",
  amountPaid: "", amountRemaining: "", installmentMonths: "1",
  buyerName: "", phone: "", purchaseDate: "", saleDate: "", deliveryDate: "", firstPaymentDate: "",
  currency: "IQD",
  saleCurrency: "IQD",
  purchasePaymentType: "قاصه",
  salePaymentType: "قاصه",
  purchaseType: "كاش",
  financerName: "",
  commissionType: "لا يوجد",
  commissionValue: "",
  carPartners: [],
});

function carToForm(car: Car): CarFormState {
  return {
    num: car.car_plate_num ?? car.car_number,
    province: car.car_province ?? "",
    chassis: car.chassis_number ?? "",
    model: car.car_model ?? "",
    year: car.car_year ?? "",
    name: car.car_name,
    color: car.color ?? "",
    details: car.details ?? "",
    purchase: String(car.purchase_price ?? 0),
    selling: String(car.selling_price ?? 0),
    status: car.status,
    paymentType: car.payment_type ?? "كاش",
    amountPaid: String(car.amount_paid ?? car.cash_price ?? 0),
    amountRemaining: String(car.amount_remaining ?? 0),
    installmentMonths: String(car.installment_months ?? 1),
    buyerName: car.buyer_name ?? "",
    phone: car.buyer_phone ?? "",
    purchaseDate: car.purchase_date ?? "",
    saleDate: car.sale_date ?? "",
    deliveryDate: car.delivery_date ?? "",
    firstPaymentDate: car.first_payment_date ?? "",
    currency: (car.currency as "IQD" | "USD") ?? "IQD",
    saleCurrency: (car.sale_currency as "IQD" | "USD") ?? "IQD",
    purchasePaymentType: (car.purchase_payment_type === "ماستر" ? "ماستر" : "قاصه"),
    salePaymentType: (car.sale_payment_type === "ماستر" ? "ماستر" : "قاصه"),
    purchaseType: car.purchase_type === "دين" ? "تمويل" : (car.purchase_type ?? "كاش"),
    financerName: car.financer_name ?? "",
    commissionType: car.commission_type ?? "لا يوجد",
    commissionValue: String(car.commission_value ?? 0),
    carPartners: (car.car_partners ?? []).map((p) => ({
      partner_name: p.partner_name,
      amount: String(p.amount),
      currency: (p.currency as "IQD" | "USD") ?? "IQD",
      kind: p.kind ?? "شريك",
    })),
  };
}

export function CarsTab({
  cars,
  onRefresh,
  carFormTrigger,
  onClearCarFormTrigger,
  searchOpen = false,
  onSearchClose,
}: CarsTabProps) {
  const [form, setForm] = useState<CarFormState>(emptyForm);
  const formRef = useRef<CarFormState>(emptyForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0);
  const [carsTab, setCarsTab] = useState<CarsTabId>("available");
  const [sortConfig, setSortConfig] = useState<{ key: CarSortKey; direction: "asc" | "desc" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [carToDelete, setCarToDelete] = useState<Car | null>(null);
  const [page, setPage] = useState(0);
  const lastAvailableClickRef = useRef(0);

  const availableCarsList = useMemo(() => cars.filter((c) => c.status === "متوفرة"), [cars]);
  const purchaseIqd = useMemo(() => availableCarsList.filter((c) => c.currency !== "USD").reduce((sum, c) => sum + c.purchase_price, 0), [availableCarsList]);
  const purchaseUsd = useMemo(() => availableCarsList.filter((c) => c.currency === "USD").reduce((sum, c) => sum + c.purchase_price, 0), [availableCarsList]);

  const replaceForm = (next: CarFormState) => {
    formRef.current = next;
    setForm(next);
  };

  const isEditing = panelMode === "edit";

  /* ── فلترة وترتيب ── */
  const filteredCars = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = cars.filter((car) => {
      const matchesStatus =
        carsTab === "available" ? car.status === "متوفرة"
        : car.status === "مبيوعة";
      const matchesSearch =
        !q ||
        car.car_number.toLowerCase().includes(q) ||
        car.car_name.toLowerCase().includes(q) ||
        (car.car_model ?? "").toLowerCase().includes(q) ||
        (car.car_year ?? "").includes(q) ||
        (car.chassis_number ?? "").toLowerCase().includes(q) ||
        (car.color ?? "").toLowerCase().includes(q) ||
        (car.car_province ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });

    if (sortConfig) {
      const sign = sortConfig.direction === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        if (sortConfig.key === "purchase") {
          const totalA = a.purchase_price + (a.expenses_sum || 0);
          const totalB = b.purchase_price + (b.expenses_sum || 0);
          return (totalA - totalB) * sign;
        }
        if (sortConfig.key === "selling") return (a.selling_price - b.selling_price) * sign;
        if (sortConfig.key === "profit") return (carNetProfit(a) - carNetProfit(b)) * sign;
        const av = sortConfig.key === "model" ? (a.car_model || a.car_name)
          : sortConfig.key === "year" ? (a.car_year ?? "")
          : sortConfig.key === "color" ? (a.color ?? "")
          : sortConfig.key === "number" ? (a.car_plate_num ?? a.car_number)
          : sortConfig.key === "chassis" ? (a.chassis_number ?? "")
          : "";
        const bv = sortConfig.key === "model" ? (b.car_model || b.car_name)
          : sortConfig.key === "year" ? (b.car_year ?? "")
          : sortConfig.key === "color" ? (b.color ?? "")
          : sortConfig.key === "number" ? (b.car_plate_num ?? b.car_number)
          : sortConfig.key === "chassis" ? (b.chassis_number ?? "")
          : "";
        return String(av).localeCompare(String(bv), "ar", { numeric: true }) * sign;
      });
    }
    return result;
  }, [cars, search, carsTab, sortConfig]);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(filteredCars.length / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [filteredCars.length, search, carsTab]);

  const totalPages = Math.max(1, Math.ceil(filteredCars.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => filteredCars.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filteredCars, currentPage]
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string) => setToast(msg);

  /* نقرة واحدة → تعديل مباشر */
  const handleSingleClick = (car: Car) => {
    setSelectedId(car.car_number);
    replaceForm(carToForm(car));
    setPanelMode("edit");
  };

  /* سيارة جديدة */
  const startNewCar = () => {
    setSelectedId(null);
    replaceForm({ ...emptyForm(), purchaseDate: todayIsoDate() });
    setPanelMode("new");
  };

  const closePanel = () => {
    setSelectedId(null);
    replaceForm(emptyForm());
    setPanelMode(null);
  };

  useEffect(() => {
    if (!carFormTrigger) return;
    if (carFormTrigger.mode === "new") {
      startNewCar();
    } else if (carFormTrigger.mode === "edit" && carFormTrigger.car) {
      handleSingleClick(carFormTrigger.car);
    }
    onClearCarFormTrigger();
  }, [carFormTrigger]);

  const patchForm = (patch: Partial<CarFormState>) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(patch)) {
      normalized[key] = typeof val === "string" ? cleanAndNormalizeNumbers(val) : val;
    }
    const next = { ...formRef.current, ...normalized } as CarFormState;
    if ("model" in patch || "year" in patch) {
      next.name = [next.model, next.year].filter(Boolean).join(" ");
    }
    if (next.paymentType === "كاش") {
      next.amountPaid = next.selling;
      next.amountRemaining = "0";
      next.installmentMonths = "1";
    } else {
      if ("selling" in patch || "amountPaid" in patch || "paymentType" in patch) {
        next.amountRemaining = String(Math.max(0, Number(next.selling) - Number(next.amountPaid)));
      }
    }
    formRef.current = next;
    setForm(next);
  };

  const toggleSort = (key: CarSortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const renderSortHeader = (key: CarSortKey) => (
    <button type="button" className="th-sort-btn" onClick={() => toggleSort(key)}>
      <span>{SORT_LABELS[key]}</span>
    </button>
  );

  /* ── الحفظ التلقائي ── */
  useEffect(() => {
    if (panelMode === null) return;
    
    // الغاء التايمر القديم
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    // التحقق من المتطلبات الأساسية قبل الحفظ التلقائي
    if (!form.num.trim() || !form.model.trim() || !Number(form.purchase)) {
      return;
    }

    const timer = setTimeout(() => {
      void handleAutoSave();
    }, 1000); // حفظ بعد ثانية واحدة من التوقف عن الكتابة

    setAutoSaveTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [form]);

  const handleAutoSave = async () => {
    // تحديد السيارة الأصلية قبل التعديل
    const originalCar = cars.find((c) => c.car_number === selectedId);
    const wasSold = originalCar?.status === "مبيوعة";
    const isSaleOnly = isEditing && wasSold;

    // 🔍 تحديد ما إذا كانت هذه عملية بيع جديدة — منع تكرار الأقساط
    const isNewSale = (() => {
      if (panelMode === "new") return form.status === "مبيوعة";
      return originalCar?.status === "متوفرة" && form.status === "مبيوعة";
    })();

    try {
      const carArgs = buildCarInvokeArgs(form);
      if (isSaleOnly && originalCar) {
        carArgs.purchaseDate = originalCar.purchase_date ?? carArgs.purchaseDate;
      }

      await callTauri("add_car", carArgs);

      if (isNewSale && !isSaleOnly && form.status === "مبيوعة" && form.paymentType !== "كاش") {
        await handleSaleAutomation(form);
      }

      await onRefresh();
      // تحديث selectedId في حال تغير رقم اللوحة (إذا كان مسموحاً)
      if (panelMode === "edit" && form.num !== selectedId) {
        setSelectedId(form.num);
      }
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  };

  const handleSaleAutomation = async (formData: CarFormState) => {
    // 1. تنظيف البيانات والأسماء تماماً من المسافات الخفية في حقل البيع والمعرض
    const buyerName = formData.buyerName.trim();
    const phone = formData.phone.trim();
    const carLabel = (formData.name || formData.model || "سيارة").trim();
    
    if (!buyerName) return;

    // 2. استخدام نوع الحساب الصحيح المتوافق مع الفلترة والتحويل
    const partnerKind = "مقترض"; 

    try {
      // استدعاء الحفظ بالاسم النظيف تماماً ليتطابق مع قيود قاعدة البيانات
      await callTauri("add_partner", { name: buyerName, phone, kind: partnerKind });
      
      const amountPaidNum = Number(formData.amountPaid);
      if (amountPaidNum > 0) {
        await callTauri("add_partner_transaction", {
          partnerName: buyerName,
          kind: partnerKind,
          type: "ايداع",
          amount: amountPaidNum,
          date: formData.saleDate || new Date().toISOString().slice(0, 10),
          notes: `دفعة أولى مستلمة - بيع ${carLabel}`,
          currency: formData.saleCurrency,
        });
      }

      const remaining = Number(formData.amountRemaining);
      if (remaining > 0) {
        const existingTxns = await callTauri<PartnerTransaction[]>(
          "get_partner_transactions",
          { partnerName: buyerName, kind: partnerKind },
        );
        
        const saleLabel = `- ${carLabel}`;
        const alreadyLinked = existingTxns?.some((tx) => tx.notes?.includes(saleLabel));
        
        if (!alreadyLinked) {
          if (formData.paymentType === "اقساط") {
            const months = Math.max(1, Number(formData.installmentMonths) || 1);
            const perMonth = Math.floor(remaining / months);
            const remainder = remaining - perMonth * months;
            const baseDate = formData.firstPaymentDate || formData.saleDate || new Date().toISOString().slice(0, 10);
            
            for (let i = 0; i < months; i++) {
              const d = new Date(baseDate);
              d.setMonth(d.getMonth() + i);
              const amount = i === months - 1 ? perMonth + remainder : perMonth;
              await callTauri("add_partner_transaction", {
                partnerName: buyerName,
                kind: partnerKind,
                type: "سحب",
                amount,
                date: d.toISOString().slice(0, 10),
                notes: `قسط ${i + 1}/${months}${saleLabel}`,
                currency: formData.saleCurrency,
              });
            }
          } else if (formData.paymentType === "موعد") {
            const dueDate = formData.deliveryDate || formData.saleDate || new Date().toISOString().slice(0, 10);
            await callTauri("add_partner_transaction", {
              partnerName: buyerName,
              kind: partnerKind,
              type: "سحب",
              amount: remaining,
              date: dueDate,
              notes: `موعد تسليم${saleLabel}`,
              currency: formData.saleCurrency,
            });
          }
        }
      }
    } catch (saveErr) {
      console.error("فشل إكمال أتمتة البيع والتسجيل التلقائي:", saveErr);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAutoSave();
    closePanel();
  };

  const handleClosePanel = () => {
    closePanel();
  };

  /* ── متابعة حالة البحث المنبثق ── */
  useEffect(() => {
    if (searchOpen) {
      // تركيز حقل البحث بعد انتهاء الأنيميشن
      const t = setTimeout(() => searchInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    } else {
      setSearch("");
    }
  }, [searchOpen]);

  /* ── Esc key ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDeleteModal) {
          setShowDeleteModal(false);
          return;
        }
        if (searchOpen) {
          onSearchClose?.();
          return;
        }
        if (panelMode !== null) {
          closePanel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelMode, showDeleteModal, searchOpen]);

  const executeTableDelete = async () => {
    if (!carToDelete) return;
    setSaving(true);
    try {
      await callTauri("delete_car", { num: carToDelete.car_number });
      setShowDeleteModal(false);
      setCarToDelete(null);
      if (selectedId === carToDelete.car_number) {
        closePanel();
      }
      await onRefresh();
    } catch (err) {
      console.error(err);
      showToast("تعذر حذف السيارة — حاول مرة أخرى");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cars-page" style={{ position: "relative", display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}>
      {toast && <div className="toast" role="status">{toast}</div>}

      {/* ── نافذة البحث المنبثقة ── */}
      {searchOpen && (
        <div className="cars-search-overlay" onClick={() => onSearchClose?.()}>
          <div
            className="cars-search-popup"
            onClick={(e) => e.stopPropagation()}
            role="search"
            aria-label="بحث في المعرض"
          >
            {/* ── رأس النافذة ── */}
            <div className="cars-search-popup__header">
              <span className="cars-search-popup__icon" aria-hidden>◈</span>
              <span className="cars-search-popup__title">بحث في المعرض</span>
              {search.trim() && (
                <span className="cars-search-popup__badge">
                  {filteredCars.length}
                </span>
              )}
              <button
                type="button"
                className="cars-search-popup__close"
                onClick={() => onSearchClose?.()}
                aria-label="إغلاق البحث"
              >
                ✕
              </button>
            </div>

            {/* ── حقل البحث ── */}
            <div className="cars-search-popup__body">
              <span className="cars-search-popup__search-icon" aria-hidden>🔍</span>
              <input
                ref={searchInputRef}
                type="search"
                className="cars-search-popup__input"
                placeholder="ابحث بالموديل أو رقم اللوحة أو الشاصي أو اللون..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  const results = filteredCars.slice(0, 8);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchHighlightIdx((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchHighlightIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results.length > 0) {
                    e.preventDefault();
                    const car = results[searchHighlightIdx] ?? results[0];
                    onSearchClose?.();
                    handleSingleClick(car);
                  }
                }}
                autoComplete="off"
                dir="rtl"
              />
              {search && (
                <button
                  type="button"
                  className="cars-search-popup__clear"
                  onClick={() => { setSearch(""); setSearchHighlightIdx(0); }}
                  aria-label="مسح البحث"
                >
                  ✕
                </button>
              )}
            </div>

            {/* ── قائمة النتائج ── */}
            {search.trim() && (
              <div className="cars-search-popup__results">
                {filteredCars.length === 0 ? (
                  <div className="cars-search-popup__empty">
                    <span className="cars-search-popup__empty-icon" aria-hidden>🚗</span>
                    <span>لا توجد سيارات مطابقة</span>
                  </div>
                ) : (
                  <ul className="cars-search-popup__list" role="listbox">
                    {filteredCars.slice(0, 8).map((car, resultIdx) => {
                      const isSold = car.status === "مبيوعة";
                      const isHighlighted = resultIdx === searchHighlightIdx;
                      const q = search.trim();
                      const highlight = (text: string) => {
                        if (!q) return text;
                        const idx = text.toLowerCase().indexOf(q.toLowerCase());
                        if (idx === -1) return text;
                        return (
                          <>
                            {text.slice(0, idx)}
                            <mark className="cars-search-popup__mark">{text.slice(idx, idx + q.length)}</mark>
                            {text.slice(idx + q.length)}
                          </>
                        );
                      };
                      return (
                        <li
                          key={car.car_number}
                          className={`cars-search-popup__item${isSold ? " cars-search-popup__item--sold" : ""}${isHighlighted ? " cars-search-popup__item--active" : ""}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setSearchHighlightIdx(resultIdx)}
                          onClick={() => {
                            onSearchClose?.();
                            handleSingleClick(car);
                          }}
                        >
                          <div className="cars-search-popup__item-main">
                            <span className="cars-search-popup__item-model">
                              {highlight(car.car_model || car.car_name || "—")}
                            </span>
                            {car.car_year && (
                              <span className="cars-search-popup__item-year">{car.car_year}</span>
                            )}
                            <span className={`cars-search-popup__item-status${isSold ? " sold" : " available"}`}>
                              {isSold ? "مبيوع" : "متوفر"}
                            </span>
                          </div>
                          <div className="cars-search-popup__item-sub">
                            <span className="cars-search-popup__item-plate">
                              {highlight(car.car_plate_num ?? car.car_number)}
                            </span>
                            {car.car_province && (
                              <span className="cars-search-popup__item-province">{car.car_province}</span>
                            )}
                            {car.color && (
                              <span className="cars-search-popup__item-color">
                                <span className="cars-search-popup__item-dot" aria-hidden>•</span>
                                {highlight(car.color)}
                              </span>
                            )}
                            {car.chassis_number && (
                              <span className="cars-search-popup__item-chassis">
                                <span className="cars-search-popup__item-dot" aria-hidden>•</span>
                                {highlight(car.chassis_number)}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {filteredCars.length > 8 && (
                      <li className="cars-search-popup__more">
                        و {filteredCars.length - 8} سيارة أخرى...
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── شريط الأدوات (دائماً ظاهر) ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          {/* تبويبات الحالة */}
          <div className="cars-tabs financial-tabs">
            {CARS_TABS.map((tab) => {
              const isActive = carsTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`${tab.id === "available" ? "top-btn-one" : "top-btn-two"} ${isActive ? (tab.id === "available" ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
                  onClick={() => {
                  if (tab.id === "available") {
                    const now = Date.now();
                    if (now - lastAvailableClickRef.current < 300) {
                      lastAvailableClickRef.current = 0;
                      startNewCar();
                      return;
                    }
                    lastAvailableClickRef.current = now;
                  }
                  if (panelMode !== null) {
                    closePanel();
                  }
                  setCarsTab(tab.id);
                }}
              >
                  {tab.label}
                  <span className="cars-tab__count">
                    {cars.filter((c) => tab.id === "available" ? c.status === "متوفرة" : c.status === "مبيوعة").length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="unified-toolbar__center">
        </div>
        <div className="unified-toolbar__left">
          {carsTab === "available" && panelMode === null && (
            <>
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={purchaseUsd} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={purchaseIqd} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── المحتوى الرئيسي (جدول أو نموذج) ── */}
      {panelMode === null ? (
        <div
          key="list-view"
          style={{ 
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column"
          }}
        >
          {/* العلامات الدالة على الصفحة (فوق الجدول) */}
          {totalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}

          {/* جدول السيارات */}
          <div
            className="table-card-container"
              onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
              onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
              tabIndex={0}
            >
              {filteredCars.length === 0 ? (
                <div className="cars-empty">
                  <p>لا توجد سيارات مطابقة</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table cars-data-table">
                    <thead>
                      <tr>
                        <th className="cell-num" style={{ width: "40px" }}>ت</th>
                        <th className={`ct-model ${sortConfig?.key === "model" ? "th--sorted" : ""}`}>{renderSortHeader("model")}</th>
                        <th className={`ct-year ${sortConfig?.key === "year" ? "th--sorted" : ""}`}>{renderSortHeader("year")}</th>
                        <th className={`ct-color ${sortConfig?.key === "color" ? "th--sorted" : ""}`}>{renderSortHeader("color")}</th>
                        <th className={`ct-num ${sortConfig?.key === "number" ? "th--sorted" : ""}`}>{renderSortHeader("number")}</th>
                        <th className={`ct-chassis ${sortConfig?.key === "chassis" ? "th--sorted" : ""}`}>{renderSortHeader("chassis")}</th>
                        <th className={`ct-price ${sortConfig?.key === "purchase" ? "th--sorted" : ""}`}>{renderSortHeader("purchase")}</th>
                        <th className={`ct-price ${sortConfig?.key === "selling" ? "th--sorted" : ""}`}>{renderSortHeader("selling")}</th>
                        <th className={`ct-profit ${sortConfig?.key === "profit" ? "th--sorted" : ""}`} colSpan={2}>
                          {renderSortHeader("profit")}
                        </th>
                        <th className="ct-delete">حذف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageEntries.map((car, idx) => {
                        const profit = carNetProfit(car);
                        const isSold = car.status === "مبيوعة";
                        const isSelected = selectedId === car.car_number;

                        return (
                          <tr
                            key={car.car_number}
                            className={`cars-tr${isSelected ? " cars-tr--selected" : ""}`}
                            onClick={() => handleSingleClick(car)}
                            title="اضغط لعرض التفاصيل"
                          >
                            <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                            <td className="ct-model cell-bold">
                              {car.car_model || car.car_name || "—"}
                            </td>
                            <td className="ct-year">{car.car_year || "—"}</td>
                            <td className="ct-color">{car.color || "—"}</td>
                            <td className="ct-num cell-bold">
                              <span className="ct-plate">{car.car_plate_num ?? car.car_number}</span>
                              {car.car_province && (
                                <span className="ct-province">{car.car_province}</span>
                              )}
                            </td>
                            <td className="ct-chassis">{car.chassis_number || "—"}</td>
                            <td className="ct-price" style={{ color: car.currency === "USD" ? "#10b981" : "#d8a85a" }}>
                              <PriceDisplay amount={car.purchase_price + (car.expenses_sum || 0)} currency={car.currency} />
                            </td>
                            <td className="ct-price" style={{ color: car.sale_currency === "USD" ? "#10b981" : "#d8a85a" }}>
                              {isSold ? (
                                <div><PriceDisplay amount={car.selling_price} currency={car.sale_currency} /></div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="ct-profit">
                              {isSold ? <span><PriceDisplay amount={profit} currency={car.sale_currency} /></span> : <span className="text-muted">—</span>}
                            </td>
                            <td className="ct-profit-pct">
                              {isSold ? <span className="text-green">({carProfitPercentage(car)}%)</span> : <span className="text-muted">—</span>}
                            </td>
                            <td className="ct-delete" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="partner-inline-delete-btn"
                                title="حذف السيارة"
                                onClick={() => {
                                  setCarToDelete(car);
                                  setShowDeleteModal(true);
                                }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {Array.from({ length: Math.max(0, PAGE_SIZE - pageEntries.length) }).map((_, i) => (
                        <tr key={`empty-${i}`} style={{ pointerEvents: "none" }} className="cars-tr opacity-25">
                          <td className="cell-num">&nbsp;</td>
                          <td className="ct-model">&nbsp;</td>
                          <td className="ct-year">&nbsp;</td>
                          <td className="ct-color">&nbsp;</td>
                          <td className="ct-num">&nbsp;</td>
                          <td className="ct-chassis">&nbsp;</td>
                          <td className="ct-price">&nbsp;</td>
                          <td className="ct-price">&nbsp;</td>
                          <td className="ct-profit">&nbsp;</td>
                          <td className="ct-profit-pct">&nbsp;</td>
                          <td className="ct-delete">&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          </div>
      ) : (
        <div
          key="form-view"
          style={{ 
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            flex: 1
          }}
        >
          <CarFormPanel
            embedMode={true}
            form={form}
            isEditing={isEditing}
            saving={saving}
            onChange={patchForm}
            onSubmit={handleSubmit}
            onClose={handleClosePanel}
          />
        </div>
      )}

      {/* نافذة تأكيد الحذف من الجدول */}
      {showDeleteModal && carToDelete && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowDeleteModal(false)}>
          <div
            className="modal-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-dialog__title">تأكيد حذف السيارة</h3>
            <p className="modal-dialog__message">
              هل أنت متأكد من حذف السيارة <strong>{carToDelete.car_name || carToDelete.car_model || carToDelete.car_number}</strong> نهائياً؟
              لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="modal-dialog__actions">
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => { setShowDeleteModal(false); setCarToDelete(null); }}
                disabled={saving}
              >
                إلغاء
              </ActionButton>
              <ActionButton
                type="button"
                variant="danger"
                onClick={() => void executeTableDelete()}
                disabled={saving}
              >
                {saving ? "جاري الحذف..." : "تأكيد الحذف"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

```

---

## File: `src/components/YearScrollField.tsx`

```tsx
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { toEnglishDigits } from "../utils/numberInput";
import {
  bumpYearLastTwo,
  normalizeYearValue,
  selectYearLastTwoDigits,
} from "../utils/dateSegments";

interface YearScrollFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  required?: boolean;
}

function sanitize(s: string): string {
  return toEnglishDigits(s).replace(/\D/g, "").slice(0, 4);
}

export function YearScrollField({
  id,
  value,
  onChange,
  minYear = 2000,
  maxYear = 2026,
  disabled,
  required,
}: YearScrollFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const fallback = new Date().getFullYear();

  useEffect(() => {
    if (disabled || composing.current) return;
    const el = inputRef.current;
    if (!el) return;
    const clean = sanitize(el.value);
    const current = clean || String(fallback);
    if (current === normalizeYearValue(value, fallback)) return;
    if (document.activeElement !== el) {
      el.value = normalizeYearValue(value, fallback);
    }
  }, [value, disabled]);

  const handleInput = () => {
    if (composing.current) return;
    const el = inputRef.current;
    if (!el) return;
    const cleaned = sanitize(el.value);
    const origLen = el.value.length;
    el.value = cleaned;
    const diff = origLen - cleaned.length;
    if (diff > 0) {
      const start = (el.selectionStart ?? 0) - diff;
      el.setSelectionRange(Math.max(0, start), Math.max(0, start));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = sanitize(e.currentTarget.value);
    const normalized = normalizeYearValue(raw, fallback);
    const n = parseInt(normalized, 10);
    if (n < minYear) onChange(String(minYear));
    else if (n > maxYear) onChange(String(maxYear));
    else onChange(normalized);
  };

  const display = normalizeYearValue(value, fallback);

  return (
    <div className="relative flex items-center w-full">
      {/* Glow الخلفية المحيطة — تدار بالكامل بالـ CSS لضمان انطفائها فور خروج التركيز */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
        <div
          className="input-glow absolute w-[500px] h-[500px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(216, 168, 90, 0.08), transparent 70%)",
          }}
        />
      </div>

      <div
        className={cn(
          "app-input-wrapper-sm relative flex items-center w-full rounded-xl border px-3 py-1.5",
          "bg-white/[0.03] backdrop-blur-xl",
          "transition-all duration-300",
          "border-white/10",
          disabled && "opacity-48 pointer-events-none",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          className="app-input-field-sm w-full min-w-0 bg-transparent text-sm font-semibold text-white placeholder:text-white/35 outline-none text-center flex-1"
          type="text"
          inputMode="decimal"
          dir="ltr"
          disabled={disabled}
          required={required}
          defaultValue={display}
          placeholder="سنة"
          aria-label="الموديل"
          autoComplete="off"
          onInput={handleInput}
          onFocus={(e) => selectYearLastTwoDigits(e.target)}
          onClick={(e) => selectYearLastTwoDigits(e.currentTarget)}
          onMouseUp={(e) => e.preventDefault()}
          onBlur={handleBlur}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => {
            composing.current = false;
            handleInput();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const el = inputRef.current;
              if (!el) return;
              const delta = e.key === "ArrowUp" ? 1 : -1;
              const next = String(bumpYearLastTwo(
                parseInt(normalizeYearValue(value, fallback), 10) || fallback,
                delta, minYear, maxYear,
              ));
              el.value = next;
              onChange(next);
            }
          }}
          onWheel={(e) => {
            e.preventDefault();
            const el = inputRef.current;
            if (!el) return;
            const delta = e.deltaY > 0 ? -1 : 1;
            const next = String(bumpYearLastTwo(
              parseInt(normalizeYearValue(value, fallback), 10) || fallback,
              delta, minYear, maxYear,
            ));
            el.value = next;
            onChange(next);
          }}
        />
      </div>
    </div>
  );
}

```

---

## File: `src/components/UnifiedDateField.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { toEnglishDigits } from "../utils/numberInput";
import {
  bumpYearLastTwo,
  combineIsoDate,
  daysInMonth,
  getDay,
  getMonth,
  getYear,
  normalizeIsoDate,
  todayIsoDate,
} from "../utils/dateSegments";

type DateSegment = "day" | "month" | "year";

const SEGMENT_TAB_ORDER: DateSegment[] = ["day", "month", "year"];

const SEGMENT_RANGE: Record<DateSegment, [number, number]> = {
  year: [0, 4],
  month: [5, 7],
  day: [8, 10],
};

const SEGMENT_MAX: Record<DateSegment, number> = {
  year: 4,
  month: 2,
  day: 2,
};

interface UnifiedDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  tabIndex?: number;
}

function nextSegment(current: DateSegment, backward: boolean): DateSegment {
  const index = SEGMENT_TAB_ORDER.indexOf(current);
  if (backward) {
    return SEGMENT_TAB_ORDER[Math.max(0, index - 1)];
  }
  return SEGMENT_TAB_ORDER[Math.min(SEGMENT_TAB_ORDER.length - 1, index + 1)];
}

function bumpSegment(iso: string, segment: DateSegment, delta: number): string {
  const year = parseInt(getYear(iso), 10) || new Date().getFullYear();
  let month = parseInt(getMonth(iso), 10) || 1;
  let day = parseInt(getDay(iso), 10) || 1;

  if (segment === "year") {
    const nextYear = bumpYearLastTwo(year, delta);
    const maxDay = daysInMonth(nextYear, month);
    if (day > maxDay) day = maxDay;
    return combineIsoDate(String(nextYear), String(month).padStart(2, "0"), String(day).padStart(2, "0"));
  }

  if (segment === "month") {
    month += delta;
    if (month < 1) month = 12;
    if (month > 12) month = 1;
    const maxDay = daysInMonth(year, month);
    if (day > maxDay) day = maxDay;
    return combineIsoDate(String(year), String(month).padStart(2, "0"), String(day).padStart(2, "0"));
  }

  const maxDay = daysInMonth(year, month);
  day += delta;
  if (day < 1) day = maxDay;
  if (day > maxDay) day = 1;
  return combineIsoDate(String(year), String(month).padStart(2, "0"), String(day).padStart(2, "0"));
}

function segmentFromPos(pos: number): DateSegment {
  if (pos <= 4) return "year";
  if (pos <= 7) return "month";
  return "day";
}

export function UnifiedDateField({ value, onChange, disabled, id, tabIndex }: UnifiedDateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [segment, setSegment] = useState<DateSegment>("day");
  const [digitBuf, setDigitBuf] = useState("");
  const digitBufRef = useRef("");
  const iso = normalizeIsoDate(value || todayIsoDate());
  const display = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayIsoDate();

  digitBufRef.current = digitBuf;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const [start] = SEGMENT_RANGE[segment];
    if (digitBuf) {
      const pos = start + digitBuf.length;
      input.setSelectionRange(pos, pos);
    } else {
      input.setSelectionRange(start, start + SEGMENT_MAX[segment]);
    }
  }, [segment, display, digitBuf]);

  const applyDelta = (delta: number) => {
    onChange(bumpSegment(display, segment, delta));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = toEnglishDigits(e.key);
    if (key >= "0" && key <= "9" && key.length === 1) {
      e.preventDefault();
      const nextBuf = (digitBuf + key).slice(0, SEGMENT_MAX[segment]);
      setDigitBuf(nextBuf);

      let y = getYear(display);
      let m = getMonth(display);
      let d = getDay(display);

      if (segment === "year") y = nextBuf.padStart(4, "0");
      else if (segment === "month") m = nextBuf.padStart(2, "0");
      else d = nextBuf.padStart(2, "0");

      const next = combineIsoDate(y, m, d);
      if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
        onChange(next);
      }

      if (nextBuf.length === SEGMENT_MAX[segment]) {
        setDigitBuf("");
        setSegment(nextSegment(segment, false));
      }
      return;
    }

    if (e.key === "Backspace" && digitBuf.length > 0) {
      e.preventDefault();
      setDigitBuf(digitBuf.slice(0, -1));
      return;
    }

    if (digitBuf) setDigitBuf("");

    if (e.key === "Tab") {
      const next = nextSegment(segment, e.shiftKey);
      if (next === segment) return; // exit the field
      e.preventDefault();
      setSegment(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      applyDelta(1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      applyDelta(-1);
    }
  };

  return (
    <div className="relative flex items-center w-full">
      {/* Glow الخلفية المحيطة — تدار بالكامل بالـ CSS لضمان انطفائها فور خروج التركيز */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
        <div
          className="input-glow absolute w-[500px] h-[500px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(216, 168, 90, 0.08), transparent 70%)",
          }}
        />
      </div>

      <div
        className={cn(
          "app-input-wrapper relative flex items-center w-full rounded-xl border px-3 py-2 unified-date-field-wrapper",
          "bg-white/[0.03] backdrop-blur-xl",
          "transition-all duration-300",
          "border-white/10",
          disabled && "opacity-48 pointer-events-none",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="app-input-field w-full min-w-0 bg-transparent text-xl font-bold text-white placeholder:text-white/35 outline-none text-center flex-1 unified-date-field"
          dir="ltr"
          disabled={disabled}
          tabIndex={tabIndex}
          value={display}
          placeholder="YYYY-MM-DD"
          autoComplete="off"
          inputMode="decimal"
          onFocus={(e) => {
            const el = e.currentTarget;
            setSegment("day");
            setDigitBuf("");
            requestAnimationFrame(() => {
              if (el && typeof el.setSelectionRange === "function") {
                const [start] = SEGMENT_RANGE["day"];
                el.setSelectionRange(start, start + SEGMENT_MAX["day"]);
              }
            });
          }}
          onClick={(e) => {
            const el = e.currentTarget;
            const part = segmentFromPos(el.selectionStart ?? 0);
            setSegment(part);
            setDigitBuf("");
            requestAnimationFrame(() => {
              if (el && typeof el.setSelectionRange === "function") {
                const [start] = SEGMENT_RANGE[part];
                el.setSelectionRange(start, start + SEGMENT_MAX[part]);
              }
            });
          }}
          onChange={(e) => {
            const next = normalizeIsoDate(e.target.value);
            if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
              onChange(next);
            }
          }}
          onBlur={(e) => {
            setDigitBuf("");
            const next = normalizeIsoDate(e.target.value);
            onChange(/^\d{4}-\d{2}-\d{2}$/.test(next) ? next : display);
          }}
          onKeyDown={onKeyDown}
          onWheel={(e) => {
            e.preventDefault();
            applyDelta(e.deltaY > 0 ? -1 : 1);
          }}
        />
      </div>
    </div>
  );
}

```

---

## File: `src/components/ExpensesTab.tsx`

```tsx
import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import { todayIsoDate } from "../utils/dateSegments";
import { UnifiedDateField } from "./UnifiedDateField";
import type { ExpenseEntry, Partner } from "../types";
import { ActionButton, TextInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import "../styles/expenses.css";
import "../styles/cards.css";

export function ExpensesTab() {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>("IQD");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [page, setPage] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [entries.length]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callTauri<ExpenseEntry[]>("get_expenses");
      setEntries(data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount) return;
    await callTauri("add_expense", {
      description: description.trim(),
      amount: Number(amount),
      date,
      notes: notes.trim() || null,
      currency,
    });

    // ═══════════════════════════════════════════════
    //  توزيع المصروف تلقائياً على الشركاء كـ سحب مصروف
    // ═══════════════════════════════════════════════
    const expenseAmount = Number(amount) || 0;
    if (expenseAmount > 0) {
      try {
        const allPartners = await callTauri<Partner[]>("get_partners");
        const kindPartners = allPartners.filter((p) => p.kind === "شريك");
        const totalPartnerCapital = kindPartners.reduce((sum, p) => sum + p.total_amount, 0);

        if (kindPartners.length > 0) {
          for (const partner of kindPartners) {
            let partnerShare = 0;
            if (totalPartnerCapital > 0) {
              partnerShare = (partner.total_amount / totalPartnerCapital) * expenseAmount;
            } else {
              partnerShare = expenseAmount / kindPartners.length;
            }

            partnerShare = Math.round(partnerShare);

            if (partnerShare > 0) {
              const formattedShare = currency === "USD"
                ? `${partnerShare.toLocaleString("en-US")} USD`
                : `${partnerShare.toLocaleString("en-US")} IQ`;

              const note = `سحب مصروف بقيمة ${formattedShare} لـ ${description.trim()}`;

              await callTauri("add_partner_transaction", {
                partnerName: partner.partner_name,
                kind: "شريك",
                type: "سحب مصروف",
                amount: partnerShare,
                date: date,
                notes: note,
                currency: currency,
                paymentType: "قاصه",
                payment_type: "قاصه",
              });
            }
          }
        }
      } catch (err) {
        console.error("فشل توزيع المصروف على الشركاء:", err);
      }
    }

    setDescription("");
    setAmount("");
    setNotes("");
    setDate(todayIsoDate());
    void load();
  };

  const handleDelete = async (id: number) => {
    await callTauri("delete_expense", { id });
    void load();
  };

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedEntries = useMemo(() => {
    if (!sortConfig) return entries;
    const { key, direction } = sortConfig;
    const sign = direction === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      if (key === "id" || key === "amount") {
        return (Number(a[key] ?? 0) - Number(b[key] ?? 0)) * sign;
      }
      if (key === "date") {
        const dtA = `${a.date}T${a.time || "00:00"}`;
        const dtB = `${b.date}T${b.time || "00:00"}`;
        return dtA.localeCompare(dtB) * sign;
      }
      const valA = String(a[key as keyof ExpenseEntry] ?? "");
      const valB = String(b[key as keyof ExpenseEntry] ?? "");
      return valA.localeCompare(valB, "ar", { numeric: true }) * sign;
    });
  }, [entries, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => sortedEntries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [sortedEntries, currentPage]
  );

  const expenseIqd = entries.filter((e) => e.currency !== "USD").reduce((sum, e) => sum + e.amount, 0);
  const expenseUsd = entries.filter((e) => e.currency === "USD").reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="dashboard">
      {/* ── شريط الأدوات الموحد في الأعلى ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          <ActionButton type="button" variant="primary" className="btn-new-car" onClick={() => setShowAddModal(true)}>
            + إضافة مصروف
          </ActionButton>
        </div>
        <div className="unified-toolbar__center"></div>
        <div className="unified-toolbar__left">
          <div className="currency-card currency-card--usd">
            <PriceDisplay amount={expenseUsd} currency="USD" />
          </div>
          <div className="currency-card currency-card--iqd">
            <PriceDisplay amount={expenseIqd} />
          </div>
        </div>
      </div>

      {/* ── نافذة إضافة مصروف منبثقة ── */}
      {showAddModal && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowAddModal(false)}>
          <div
            className="modal-dialog"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "500px" }}
          >
            <h3 className="modal-dialog__title">إضافة مصروف جديد</h3>
            <form
              onSubmit={(e) => {
                void handleAdd(e);
                setShowAddModal(false);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="cf-label">البيان</label>
                <TextInput
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  placeholder="وصف المصروف"
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="cf-label">المبلغ</label>
                <PriceInput
                  value={amount}
                  onChange={setAmount}
                  required
                  currency={currency}
                  onCurrencyChange={setCurrency}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="cf-label">التاريخ</label>
                <UnifiedDateField value={date} onChange={setDate} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="cf-label">ملاحظة</label>
                <TextInput
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="اختياري"
                />
              </div>
              <div className="modal-dialog__actions" style={{ marginTop: "1.25rem" }}>
                <ActionButton type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
                  إلغاء
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  إضافة مصروف
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {totalPages >= 1 && (
        <div className="table-page-dots" aria-label="تنقل بين الصفحات">
          {Array.from({ length: totalPages }, (_, idx) => (
            <button
              key={idx}
              type="button"
              className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
              onClick={() => setPage(idx)}
              aria-label={`الصفحة ${idx + 1}`}
            />
          ))}
        </div>
      )}

      <section
        className="table-card-container"
        onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
        onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
        tabIndex={0}
      >
        <div className="table-wrapper" style={{ flex: 1, minHeight: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className={`cell-num ${sortConfig?.key === "id" ? "th--sorted" : ""}`} onClick={() => handleSort("id")} style={{ width: "40px", cursor: "pointer" }}>ت</th>
                <th className={sortConfig?.key === "date" ? "th--sorted" : ""} onClick={() => handleSort("date")} style={{ width: "110px", cursor: "pointer" }}>التاريخ</th>
                <th className={sortConfig?.key === "time" ? "th--sorted" : ""} onClick={() => handleSort("time")} style={{ width: "60px", cursor: "pointer" }}>الساعة</th>
                <th className={sortConfig?.key === "description" ? "th--sorted" : ""} onClick={() => handleSort("description")} style={{ cursor: "pointer" }}>البيان</th>
                <th className={`col-money ${sortConfig?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSort("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                <th className={sortConfig?.key === "notes" ? "th--sorted" : ""} onClick={() => handleSort("notes")} style={{ cursor: "pointer" }}>ملاحظات</th>
                <th style={{ width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-cell">جاري التحميل...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="empty-cell">لا توجد مصروفات بعد</td></tr>
              ) : (
                pageEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cell-num">{entry.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-sm)", textAlign: "center" }}>{entry.time}</td>
                    <td>{entry.description}</td>
                    <td className="col-money"><PriceDisplay amount={entry.amount} currency={entry.currency} /></td>
                    <td style={{ fontSize: "var(--fs-sm)" }}>{entry.notes || ""}</td>
                    <td>
                      <button
                        type="button"
                        className="partner-inline-delete-btn"
                        onClick={() => handleDelete(entry.id)}
                        title="حذف"
                        aria-label="حذف المصروف"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              )}
              {Array.from({ length: Math.max(0, PAGE_SIZE - pageEntries.length) }).map((_, i) => (
                <tr key={`empty-${i}`} style={{ pointerEvents: "none" }} className="opacity-25">
                  <td className="cell-num">&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td className="col-money">&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

```

---

## File: `src/components/FinancialTransactionsTab.tsx`

```tsx
import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { Car, CashRegisterEntry } from "../types";
import { PriceDisplay } from "@/components/ui";
import "../styles/transactions.css";

import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";

/**
 * سجل المعاملات – يعرض جميع سجل المعاملات من كافة الحسابات (قاصه + ماستر + مصرف)
 * مجمّعة في جدول واحد.
 */
export function FinancialTransactionsTab() {
  const [entries, setEntries] = useState<(CashRegisterEntry & { _source?: "قاصه" | "ماستر" | "مصرف" })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // تحميل جميع السيارات والعمليات بشكل متوازٍ لتجنب التكرار ولربط الحساب الصحيح بالعملية
      const [cars, entriesData] = await Promise.all([
        callTauri<Car[]>("get_cars"),
        callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: null }),
      ]);

      const carsMap = new Map<string, Car>();
      for (const car of (cars ?? [])) {
        carsMap.set(car.car_number.trim(), car);
      }

      const all = (entriesData ?? []).map(entry => {
        let source: "قاصه" | "ماستر" | "مصرف" = "قاصه";
        
        // التحقق مما إذا كانت الحركة متعلقة بسيارة
        const isCarEntry = [
          "شراء سيارة",
          "بيع سيارة كاش",
          "بيع سيارة آجل",
          "مقدمة سيارة اقساط",
        ].includes(entry.type_);

        if (isCarEntry) {
          // استخراج رقم السيارة من التفاصيل (يكون بعد علامة " - ")
          const parts = entry.description.split(" - ");
          if (parts.length > 1) {
            const carNum = parts[parts.length - 1].trim();
            const car = carsMap.get(carNum);
            if (car && car.purchase_payment_type) {
              const pType = car.purchase_payment_type.trim();
              if (pType === "ماستر" || pType === "مصرف" || pType === "قاصه") {
                source = pType as any;
              }
            }
          }
        }
        
        return {
          ...entry,
          _source: source,
        };
      });

      // ترتيب حسب التاريخ والوقت (الأقدم أولاً)
      all.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.time ?? "").localeCompare(b.time ?? "");
      });

      const lastPage = Math.max(0, Math.ceil(all.length / PAGE_SIZE) - 1);
      setEntries(all);
      setPage(lastPage);
    } catch {
      setEntries([]);
      setPage(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedEntries = useMemo(() => {
    if (!sortConfig) return entries;
    const { key, direction } = sortConfig;
    const sign = direction === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      let valA: any = a[key as keyof typeof a] ?? "";
      let valB: any = b[key as keyof typeof b] ?? "";

      if (key === "amount" || key === "id") {
        return (Number(valA) - Number(valB)) * sign;
      }
      if (key === "date") {
        const dtA = `${a.date}T${a.time || "00:00"}`;
        const dtB = `${b.date}T${b.time || "00:00"}`;
        return dtA.localeCompare(dtB) * sign;
      }
      return String(valA).localeCompare(String(valB), "ar", { numeric: true }) * sign;
    });
  }, [entries, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => sortedEntries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [sortedEntries, currentPage],
  );

  return (
    <div
      className="dashboard"
      onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
      onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
      tabIndex={0}
    >
      {/* شريط الأدوات الموحد في الأعلى */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right"></div>
        <div className="unified-toolbar__center"></div>
        <div className="unified-toolbar__left"></div>
      </div>

      {totalPages >= 1 && (
        <div className="table-page-dots" aria-label="تنقل بين الصفحات">
          {Array.from({ length: totalPages }, (_, idx) => (
            <button
              key={idx}
              type="button"
              className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
              onClick={() => setPage(idx)}
              aria-label={`الصفحة ${idx + 1}`}
            />
          ))}
        </div>
      )}

      {/* الجدول */}
      <section className="table-card-container">
        <div className="table-wrapper" style={{ flex: 1, minHeight: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className={`cell-num ${sortConfig?.key === "id" ? "th--sorted" : ""}`} onClick={() => handleSort("id")} style={{ width: "40px", cursor: "pointer" }}>ت</th>
                <th className={sortConfig?.key === "_source" ? "th--sorted" : ""} onClick={() => handleSort("_source")} style={{ width: "90px", cursor: "pointer" }}>الحساب</th>
                <th className={sortConfig?.key === "date" ? "th--sorted" : ""} onClick={() => handleSort("date")} style={{ width: "110px", cursor: "pointer" }}>التاريخ</th>
                <th className={sortConfig?.key === "time" ? "th--sorted" : ""} onClick={() => handleSort("time")} style={{ width: "60px", cursor: "pointer" }}>الساعة</th>
                <th className={sortConfig?.key === "type_" ? "th--sorted" : ""} onClick={() => handleSort("type_")} style={{ width: "150px", cursor: "pointer" }}>نوع العملية</th>
                <th className={`col-money ${sortConfig?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSort("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                <th className={sortConfig?.key === "description" ? "th--sorted" : ""} onClick={() => handleSort("description")} style={{ cursor: "pointer" }}>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-cell">جاري التحميل...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="empty-cell">لا توجد حركات مالية</td></tr>
              ) : (
                <>
                  {pageEntries.map((entry, idx) => (
                    <tr key={`${entry._source}-${entry.id}-${idx}`}>
                      <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                      <td>
                        <span
                          className={`tx-badge ${
                            entry._source === "قاصه"
                              ? "tx-badge-qasa"
                              : entry._source === "ماستر"
                              ? "tx-badge-master"
                              : entry._source === "مصرف"
                              ? "tx-badge-bank"
                              : "tx-badge-default"
                          }`}
                        >
                          {entry._source}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                      <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-sm)", textAlign: "center" }}>{entry.time}</td>
                      <td>
                        <span
                          className={`badge ${entry.amount >= 0 ? "badge--primary" : "badge--sold"}`}
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {entry.type_}
                        </span>
                      </td>
                      <td
                        className={`col-money ${
                          entry.currency === "USD"
                            ? "tx-amount-usd"
                            : entry.amount >= 0
                            ? "tx-amount-iqd-pos"
                            : "tx-amount-iqd-neg"
                        }`}
                      >
                        <PriceDisplay amount={entry.amount} currency={entry.currency} />
                      </td>
                      <td style={{
                        fontSize: "var(--fs-sm)",
                        maxWidth: "280px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {entry.description}
                        {entry.notes ? (
                          <span className="text-muted" style={{ marginRight: "0.5rem" }}>({entry.notes})</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {Array.from({ length: PAGE_SIZE - pageEntries.length }).map((_, i) => (
                    <tr key={`empty-${i}`} style={{ pointerEvents: "none" }}>
                      <td className="cell-num">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

```

---

## File: `src/components/Header.tsx`

```tsx
import { useRef } from "react";
import type { TabId } from "../types";
import { BrandLogo } from "./BrandLogo";
import { ActionButton } from "./ui/ActionButton";

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onCarsSearchToggle?: () => void;
  onPartnersSearchToggle?: () => void;
  onAgenciesSearchToggle?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "لوحــــــــة التحكــــــــــم", icon: "✦" },
  { id: "cars", label: "المعــــــــــــــــــــــــــــــرض", icon: "◈" },
  { id: "partners-financial", label: "حسابات العمــلاء", icon: "❖" },
  { id: "agencies", label: "الوكـــــــــــــــــــــــــــالات", icon: "✉" },
  { id: "expenses", label: "المصروفــــــــــــــــــات", icon: "◉" },
  { id: "financial-accounts", label: "القاصــــــــــــــــــــــــــــــــة", icon: "♢" },
  { id: "financial-transactions", label: "سجــل المعاملات", icon: "⇄" },
];

export function Header({
  activeTab,
  onTabChange,
  onCarsSearchToggle,
  onPartnersSearchToggle,
  onAgenciesSearchToggle,
  onDeposit,
  onWithdraw,
}: HeaderProps) {
  // track double-click on cars tab
  const lastCarsClickAt = useRef(0);
  // track double-click on partners tab
  const lastPartnersClickAt = useRef(0);
  // track double-click on agencies tab
  const lastAgenciesClickAt = useRef(0);

  const handleTabClick = (tabId: TabId) => {
    if (tabId === "cars") {
      const now = Date.now();
      if (activeTab === "cars" && now - lastCarsClickAt.current < 400) {
        // نقرتان متتاليتان على تبويب المعرض → تبديل البحث
        lastCarsClickAt.current = 0;
        onCarsSearchToggle?.();
        return;
      }
      lastCarsClickAt.current = now;
    } else if (tabId === "partners-financial") {
      const now = Date.now();
      if (activeTab === "partners-financial" && now - lastPartnersClickAt.current < 400) {
        // نقرتان متتاليتان على تبويب حسابات العملاء → تبديل البحث
        lastPartnersClickAt.current = 0;
        onPartnersSearchToggle?.();
        return;
      }
      lastPartnersClickAt.current = now;
    } else if (tabId === "agencies") {
      const now = Date.now();
      if (activeTab === "agencies" && now - lastAgenciesClickAt.current < 400) {
        // نقرتان متتاليتان على تبويب الوكالات → تبديل البحث
        lastAgenciesClickAt.current = 0;
        onAgenciesSearchToggle?.();
        return;
      }
      lastAgenciesClickAt.current = now;
    }
    onTabChange(tabId);
  };

  return (
    <aside className="app-sidebar">
      <div className="sidebar-glow" aria-hidden />

      <div className="sidebar-header">
        <BrandLogo size="lg" className="sidebar-logo" />
      </div>

      <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`sidebar-btn ${activeTab === tab.id ? "sidebar-btn--active" : ""}`}
            onClick={() => handleTabClick(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            <span className="sidebar-btn__icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="sidebar-btn__label">
              {tab.label}
            </span>
          </button>
        ))}
      </nav>

      {onDeposit && onWithdraw && (
        <div className="sidebar-quick-actions">
          <ActionButton
            variant="success"
            onClick={onDeposit}
            className="w-full justify-center sidebar-action-btn"
          >
            إيداع
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={onWithdraw}
            className="w-full justify-center sidebar-action-btn"
          >
            سحب
          </ActionButton>
        </div>
      )}
    </aside>
  );
}

```

---

## File: `src/components/CashRegisterTab.tsx`

```tsx
import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { CashRegisterEntry } from "../types";
import { PriceDisplay } from "@/components/ui";
import "../styles/qasa.css";

import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";

const parseCommissionText = (notes: string | null | undefined, currency?: string | null, amount?: number): string => {
  const curr = currency || "IQD";
  if (!notes) return "—";
  const parts = notes.split("عمولة:");
  if (parts.length > 1) {
    const cleanPart = parts[1].split("%")[0].trim();
    if (parts[1].includes("%")) {
      const pct = parseFloat(cleanPart);
      if (!isNaN(pct)) {
        if (amount !== undefined) {
          const commissionVal = (Math.abs(amount) * pct) / 100;
          return curr === "USD"
            ? `${commissionVal.toLocaleString("en-US")} USD`
            : `${commissionVal.toLocaleString("en-US")} IQ`;
        }
        return pct + "%";
      }
    }
    const val = parseFloat(cleanPart);
    if (!isNaN(val)) {
      return curr === "USD"
        ? `${val.toLocaleString("en-US")} USD`
        : `${val.toLocaleString("en-US")} IQ`;
    }
  }
  return "—";
};

interface CashRegisterTabProps {
  paymentType?: string;
}

export function CashRegisterTab({ paymentType }: CashRegisterTabProps) {
  const [entries, setEntries] = useState<CashRegisterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callTauri<CashRegisterEntry[]>("get_cash_register_entries", {
        paymentType: paymentType ?? null,
      });
      setEntries(data ?? []);
      const lastPage = Math.max(0, Math.ceil((data ?? []).length / PAGE_SIZE) - 1);
      setPage(lastPage);
    } catch {
      setEntries([]);
      setPage(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [paymentType]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedEntries = useMemo(() => {
    if (!sortConfig) return entries;
    const { key, direction } = sortConfig;
    const sign = direction === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      let valA: any = a[key as keyof CashRegisterEntry] ?? "";
      let valB: any = b[key as keyof CashRegisterEntry] ?? "";

      if (key === "commission") {
        valA = parseCommissionText(a.notes, a.currency, a.amount);
        valB = parseCommissionText(b.notes, b.currency, b.amount);
      }

      if (key === "amount" || key === "balance" || key === "id") {
        return (Number(valA) - Number(valB)) * sign;
      }
      if (key === "date") {
        const dtA = `${a.date}T${a.time || "00:00"}`;
        const dtB = `${b.date}T${b.time || "00:00"}`;
        return dtA.localeCompare(dtB) * sign;
      }
      return String(valA).localeCompare(String(valB), "ar", { numeric: true }) * sign;
    });
  }, [entries, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => sortedEntries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [sortedEntries, currentPage],
  );

  const formatEntry = (entry: CashRegisterEntry, value: number) => {
    return <PriceDisplay amount={value} currency={entry.currency} />;
  };

  return (
    <>
      {totalPages >= 1 && (
        <div className="table-page-dots" aria-label="تنقل بين الصفحات">
          {Array.from({ length: totalPages }, (_, idx) => (
            <button
              key={idx}
              type="button"
              className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
              onClick={() => setPage(idx)}
              aria-label={`الصفحة ${idx + 1}`}
            />
          ))}
        </div>
      )}

    <section
      className="table-card-container"
      onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
      onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
      tabIndex={0}
    >
      <div className="table-wrapper" style={{ flex: 1, minHeight: 0 }}>
         <table className="data-table">
          <thead>
            <tr>
              <th className={`cell-num ${sortConfig?.key === "id" ? "th--sorted" : ""}`} onClick={() => handleSort("id")} style={{ width: "40px", cursor: "pointer" }}>ت</th>
              <th className={sortConfig?.key === "date" ? "th--sorted" : ""} onClick={() => handleSort("date")} style={{ width: "110px", cursor: "pointer" }}>التاريخ</th>
              <th className={sortConfig?.key === "time" ? "th--sorted" : ""} onClick={() => handleSort("time")} style={{ width: "60px", cursor: "pointer" }}>الساعة</th>
              <th className={sortConfig?.key === "type_" ? "th--sorted" : ""} onClick={() => handleSort("type_")} style={{ width: "150px", cursor: "pointer" }}>نوع العملية</th>
              <th className={`col-money ${sortConfig?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSort("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
              {paymentType === "ممول" && <th className={sortConfig?.key === "commission" ? "th--sorted" : ""} onClick={() => handleSort("commission")} style={{ width: "80px", textAlign: "center", cursor: "pointer" }}>العمولة</th>}
              <th className={sortConfig?.key === "description" ? "th--sorted" : ""} onClick={() => handleSort("description")} style={{ cursor: "pointer" }}>التفاصيل</th>
              <th className={`col-money ${sortConfig?.key === "balance" ? "th--sorted" : ""}`} onClick={() => handleSort("balance")} style={{ cursor: "pointer" }}>الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={paymentType === "ممول" ? 8 : 7} className="empty-cell">جاري التحميل...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={paymentType === "ممول" ? 8 : 7} className="empty-cell">لا توجد معاملات بعد</td></tr>
            ) : (
              <>
                {pageEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cell-num">{entry.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-sm)", textAlign: "center" }}>{entry.time}</td>
                    <td>
                      <span
                        className={`badge ${entry.amount >= 0 ? "badge--primary" : "badge--sold"}`}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {entry.type_}
                      </span>
                    </td>
                    <td className={`col-money ${entry.currency === "USD" ? "qasa-amount-usd" : (entry.amount >= 0 ? "qasa-amount-iqd-pos" : "qasa-amount-iqd-neg")}`}>
                      {formatEntry(entry, entry.amount)}
                    </td>
                    {paymentType === "ممول" && (
                      <td className="qasa-commission-text">
                        {parseCommissionText(entry.notes, entry.currency, entry.amount)}
                      </td>
                    )}
                    <td style={{ fontSize: "var(--fs-sm)", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.notes && entry.notes.startsWith("تم تسديد الممول") ? (
                        entry.notes.includes(" - عمولة:") ? entry.notes.split(" - عمولة:")[0] : entry.notes
                      ) : (
                        <>
                          {entry.description}
                          {entry.notes ? (
                            <span className="text-muted" style={{ marginRight: "0.5rem" }}>
                              ({entry.notes.includes(" - عمولة:") ? entry.notes.split(" - عمولة:")[0] : entry.notes})
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className={`col-money ${entry.currency === "USD" ? "qasa-amount-usd" : (entry.balance >= 0 ? "qasa-amount-iqd-pos" : "qasa-amount-iqd-neg")}`}>
                      {formatEntry(entry, entry.balance)}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: PAGE_SIZE - pageEntries.length }).map((_, i) => (
                  <tr key={`empty-${i}`} style={{ pointerEvents: "none" }}>
                    <td className="cell-num">&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    {paymentType === "ممول" && <td>&nbsp;</td>}
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
    </>
  );
}

```

---

## File: `src/components/PartnersTab.tsx`

```tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { callTauri } from "../api/tauri";
import type { Partner, PartnerTransaction, UnifiedAccount } from "../types";
import { englishKeyboardToArabic } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { SearchableCombobox } from "./SearchableCombobox";
import { UnifiedDateField } from "./UnifiedDateField";
import { ActionButton, TextInput, NumberInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";
import { Search } from "lucide-react";
import { PAGE_SIZE } from "../constants";
import { cn } from "../lib/utils";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import "../styles/partners.css";
import "../styles/cards.css";
import "../styles/cars.css";
import "../styles/monsadilah.css";

interface PartnersTabProps {
  partners: Partner[];
  onRefresh: () => Promise<void>;
  kind: string;
  partnersSearchOpen?: boolean;
  onPartnersSearchClose?: () => void;
  onPartnerActionsChange?: (actions: { onDeposit: () => void; onWithdraw: () => void } | null) => void;
}

const createEmptyForm = (kind: string) => ({
  name: "",
  phone: "",
  kind: kind === "partners-financial" ? "" : kind,
});

type TransactionType = "ايداع" | "سحب";
type TransactionSortKey = "sequence" | "date" | "type" | "amount";
type SortDirection = "asc" | "desc";

const isInstallmentWithdrawal = (tx: PartnerTransaction) =>
  tx.type_ === "سحب" && !!tx.notes?.includes("قسط");

const isUnpaidInstallment = (tx: PartnerTransaction) =>
  tx.type_ === "سحب" && (!!tx.notes?.includes("موعد تسليم") || !!tx.notes?.includes("قسط")) && tx.amount > 0;

const isSameCurrency = (tx: PartnerTransaction, currency: Currency) =>
  (tx.currency || "IQD") === currency;

const parseFinancierNotes = (notes: string | null) => {
  if (!notes) return { transferBy: "", commission: 0, commissionPercent: 0, originalNotes: "" };
  if (notes.startsWith("تم تسديد الممول")) {
    let commission = 0;
    let mainPart = notes;
    const commSplit = notes.split(" - عمولة:");
    if (commSplit.length > 1) {
      commission = Number(commSplit[commSplit.length - 1].trim()) || 0;
      mainPart = commSplit.slice(0, -1).join(" - عمولة:");
    }
    let transferBy = "";
    let originalNotes = "";
    const transferByMatch = mainPart.match(/(?:ارسل اليه بواسطة|ارسل بيد)\s*([^-]+)/);
    if (transferByMatch) {
      transferBy = transferByMatch[1].trim();
      const rest = mainPart.split(/(?:ارسل اليه بواسطة|ارسل بيد)\s*[^-]+/)[1] || "";
      if (rest.startsWith(" - ")) {
        originalNotes = rest.substring(3).trim();
      } else {
        originalNotes = rest.trim();
      }
    }
    return {
      transferBy,
      commission,
      commissionPercent: 0,
      originalNotes
    };
  }
  const transferByMatch = notes.match(/نقل بواسطة:\s*([^-]+)/);
  const commissionPercentMatch = notes.match(/عمولة:\s*([\d.]+)%/);
  const parts = notes.split(/-\s*عمولة:\s*[\d.]+%[^)]+\)\s*-?\s*/);
  const originalNotes = parts.length > 1 ? parts[1].trim() : "";
  return {
    transferBy: transferByMatch ? transferByMatch[1].trim() : "",
    commission: 0,
    commissionPercent: commissionPercentMatch ? Number(commissionPercentMatch[1]) : 1,
    originalNotes: originalNotes || (notes.startsWith("نقل بواسطة:") ? "" : notes)
  };
};

function splitAmountEvenly(total: number, parts: number) {
  if (parts <= 0) return [];
  const roundedTotal = Math.max(0, Math.round(total));
  const base = Math.floor(roundedTotal / parts);
  const remainder = roundedTotal - base * parts;
  return Array.from({ length: parts }, (_, index) =>
    index === parts - 1 ? base + remainder : base,
  );
}


const ACCOUNTS_TABS: { id: "list" | "personal"; label: string }[] = [
  { id: "list", label: "حسابات العملاء" },
  { id: "personal", label: "الحساب الشخصي" },
];

export function PartnersTab({ partners, onRefresh, kind, partnersSearchOpen, onPartnersSearchClose, onPartnerActionsChange }: PartnersTabProps) {
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [debtFilter, setDebtFilter] = useState<"all" | "we_owe" | "they_owe">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [accountsTab, setAccountsTab] = useState<"list" | "personal">("list");
  const lastListTabClickRef = useRef(0);
  const [partnersSearch, setPartnersSearch] = useState("");
  const [partnersSearchHighlightIdx, setPartnersSearchHighlightIdx] = useState(0);
  const partnersSearchInputRef = useRef<HTMLInputElement>(null);
  const [partnerToView, setPartnerToView] = useState<Partner | null>(null);

  const fetchUnifiedAccounts = useCallback(async () => {
    if (kind !== "مطلوب") return;

    try {
      const data = await callTauri<UnifiedAccount[]>("get_unified_accounts");
      setUnifiedAccounts(data ?? []);
    } catch (err) {
      console.error("Failed to fetch unified accounts:", err);
    } finally {

    }
  }, [kind]);

  useEffect(() => {
    if (kind === "مطلوب") {
      void fetchUnifiedAccounts();
    }
  }, [kind, partners, fetchUnifiedAccounts]);

  // Cleanup sidebar actions on unmount
  useEffect(() => {
    return () => {
      onPartnerActionsChange?.(null);
    };
  }, [onPartnerActionsChange]);

  const [form, setForm] = useState(createEmptyForm(kind));
  const formRef = useRef(createEmptyForm(kind));
  const savingRef = useRef(false);
  const [partnersSort, setPartnersSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const handleSortPartners = (key: string) => {
    setPartnersSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const myPartners = useMemo(() => {
    let list = [];
    if (kind === "partners-financial") {
      list = partners.filter((p) => p.kind === "شريك" || p.kind === "مستثمر" || p.kind === "ممول" || p.kind === "مقترض" || p.kind === "شركة");
    } else {
      list = partners.filter((p) => (p.kind || kind) === kind);
    }

    const { key, direction } = partnersSort;
    const sign = direction === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (key === "kind") {
        return (a.kind || "").localeCompare(b.kind || "", "ar") * sign;
      }
      if (key === "phone") {
        return (a.phone || "").localeCompare(b.phone || "") * sign;
      }
      if (key === "amount") {
        const valA = a.total_amount || a.total_withdrawals || 0;
        const valB = b.total_amount || b.total_withdrawals || 0;
        return (valA - valB) * sign;
      }
      return a.partner_name.localeCompare(b.partner_name, "ar") * sign;
    });
  }, [partners, kind, partnersSort]);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [modalPage, setModalPage] = useState(0);

  useEffect(() => {
    setModalPage(0);
  }, [editingKey]);
  const [originalPartnerData, setOriginalPartnerData] = useState<{ name: string; phone: string; kind: string } | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "new" | null>(null);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTxConfirm, setDeleteTxConfirm] = useState<PartnerTransaction | null>(null);
  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [currencyTotals, setCurrencyTotals] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    let cancelled = false;
    const fetchTotals = async () => {
      try {
        const data = await callTauri<[number, number]>("get_partners_totals", { kind });
        if (!cancelled) setCurrencyTotals(data ?? [0, 0]);
      } catch {
        if (!cancelled) setCurrencyTotals([0, 0]);
      }
    };
    fetchTotals();
    return () => { cancelled = true; };
  }, [kind, myPartners]);

  const [txCurrency, setTxCurrency] = useState<Currency>("IQD");
  const [txForm, setTxForm] = useState({
    type: "ايداع" as TransactionType,
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    installments: 1,
    paymentType: "قاصه" as "قاصه" | "ماستر" | "مصرف" | "ممول",
    transferBy: "",
    commission: 0,
    commissionPercent: 1,
  });
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [transactionSort, setTransactionSort] = useState<{
    key: TransactionSortKey;
    direction: SortDirection;
  }>({ key: "date", direction: "asc" });
  const transactionListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollTransactionsRef = useRef(false);










  const [accountsSort, setAccountsSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const handleSortAccounts = (key: string) => {
    setAccountsSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const filteredAndSortedAccounts = useMemo(() => {
    if (kind !== "مطلوب") return [];
    let result = unifiedAccounts.filter((acc) => acc.kind === "مطلوب");

    if (search.trim()) {
      const cleanSearch = search.trim().toLowerCase();
      result = result.filter(
        (acc) =>
          acc.partner_name.toLowerCase().includes(cleanSearch) ||
          (acc.phone && acc.phone.includes(cleanSearch))
      );
    }

    if (debtFilter === "they_owe") {
      result = result.filter((acc) => acc.iqd_balance > 0 || acc.usd_balance > 0);
    } else if (debtFilter === "we_owe") {
      result = result.filter((acc) => acc.iqd_balance < 0 || acc.usd_balance < 0);
    }

    const { key, direction } = accountsSort;
    const sign = direction === "asc" ? 1 : -1;
    return result.sort((a, b) => {
      if (key === "phone") {
        return (a.phone || "").localeCompare(b.phone || "") * sign;
      }
      if (key === "iqd") {
        return (a.iqd_balance - b.iqd_balance) * sign;
      }
      if (key === "usd") {
        return (a.usd_balance - b.usd_balance) * sign;
      }
      return a.partner_name.localeCompare(b.partner_name, "ar") * sign;
    });
  }, [unifiedAccounts, search, debtFilter, kind, accountsSort]);

  useEffect(() => {
    const totalCount = kind === "مطلوب" ? filteredAndSortedAccounts.length : myPartners.length;
    const lastPage = Math.max(0, Math.ceil(totalCount / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [kind, search, debtFilter, filteredAndSortedAccounts.length, myPartners.length]);

  const totalPages = useMemo(() => {
    const totalCount = kind === "مطلوب" ? filteredAndSortedAccounts.length : myPartners.length;
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  }, [kind, filteredAndSortedAccounts, myPartners]);

  const currentPage = Math.min(page, totalPages - 1);

  const pageAccounts = useMemo(() => {
    return filteredAndSortedAccounts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [filteredAndSortedAccounts, currentPage]);

  const pagePartners = useMemo(() => {
    return myPartners.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [myPartners, currentPage]);

  const stats = useMemo(() => {
    let iqdTheyOwe = 0;
    let usdTheyOwe = 0;
    let iqdWeOwe = 0;
    let usdWeOwe = 0;

    for (const acc of unifiedAccounts) {
      if (acc.kind !== "مطلوب") continue;
      if (acc.iqd_balance > 0) {
        iqdTheyOwe += acc.iqd_balance;
      } else if (acc.iqd_balance < 0) {
        iqdWeOwe += Math.abs(acc.iqd_balance);
      }

      if (acc.usd_balance > 0) {
        usdTheyOwe += acc.usd_balance;
      } else if (acc.usd_balance < 0) {
        usdWeOwe += Math.abs(acc.usd_balance);
      }
    }

    const iqdNet = iqdTheyOwe - iqdWeOwe;
    const usdNet = usdTheyOwe - usdWeOwe;

    return {
      iqdTheyOwe,
      usdTheyOwe,
      iqdWeOwe,
      usdWeOwe,
      iqdNet,
      usdNet,
    };
  }, [unifiedAccounts]);

  const currentBalanceDescription = useMemo(() => {
    if (kind !== "مطلوب") return "";

    const withdrawals = transactions.filter((t) => t.type_ === "سحب");
    const deposits = transactions.filter((t) => t.type_ === "ايداع");

    const withdrawalsIqd = withdrawals.filter((t) => t.currency !== "USD");
    const withdrawalsUsd = withdrawals.filter((t) => t.currency === "USD");
    const depositsIqd = deposits.filter((t) => t.currency !== "USD" && !t.notes?.includes("دفعة أولى") && !t.notes?.includes("قسط") && !t.notes?.includes("مؤجل"));
    const depositsUsd = deposits.filter((t) => t.currency === "USD" && !t.notes?.includes("دفعة أولى") && !t.notes?.includes("قسط") && !t.notes?.includes("مؤجل"));

    const hasInstallmentIqd = withdrawalsIqd.some(isInstallmentWithdrawal);
    const hasInstallmentUsd = withdrawalsUsd.some(isInstallmentWithdrawal);

    const totalDebtIqd = withdrawalsIqd.reduce((s, t) => s + t.amount, 0);
    const totalDebtUsd = withdrawalsUsd.reduce((s, t) => s + t.amount, 0);
    const totalPaidIqd = depositsIqd.reduce((s, t) => s + t.amount, 0);
    const totalPaidUsd = depositsUsd.reduce((s, t) => s + t.amount, 0);

    const remainingIqd = hasInstallmentIqd ? totalDebtIqd : totalDebtIqd - totalPaidIqd;
    const remainingUsd = hasInstallmentUsd ? totalDebtUsd : totalDebtUsd - totalPaidUsd;

    const descIqd = remainingIqd > 0
      ? `نطلبهم ${remainingIqd.toLocaleString()} IQ`
      : remainingIqd < 0
        ? `يطلبونا ${Math.abs(remainingIqd).toLocaleString()} IQ`
        : `خالص IQ`;

    const descUsd = remainingUsd > 0
      ? `نطلبهم ${remainingUsd.toLocaleString()} USD`
      : remainingUsd < 0
        ? `يطلبونا ${Math.abs(remainingUsd).toLocaleString()} USD`
        : `خالص USD`;

    return `${descIqd} | ${descUsd}`;
  }, [transactions, kind]);

  const [showTxModal, setShowTxModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<{ name: string; kind: string } | null>(null);

  const replaceForm = (next: ReturnType<typeof createEmptyForm>) => {
    formRef.current = next;
    setForm(next);
  };

  const patchForm = (patch: Partial<ReturnType<typeof createEmptyForm>>) => {
    const next = { ...formRef.current, ...patch };
    formRef.current = next;
    setForm(next);
  };

  const loadPartner = async (partner: Partner, preserveType?: boolean) => {
    setEditingKey(partner.partner_name);
    setOriginalPartnerData({ name: partner.partner_name, phone: partner.phone, kind: partner.kind });
    replaceForm({ name: partner.partner_name, phone: partner.phone, kind: partner.kind });
    setModalMode("view");
    setEditingTransactionId(null);
    setTransactionSort({ key: "date", direction: "asc" });
    if (!preserveType) {
      setTxForm({ type: "ايداع", amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1, paymentType: "قاصه", transferBy: "", commission: 0, commissionPercent: 1 });
    }
    setTransactionsLoading(true);
    try {
      const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", {
        partnerName: partner.partner_name,
        kind: partner.kind,
      });
      setTransactions(txs ?? []);
    } catch {
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const resetForm = () => {
    setEditingKey(null);
    setOriginalPartnerData(null);
    replaceForm(createEmptyForm(kind));
    setModalMode(null);
    setDeleteDialogOpen(false);
    setTransactions([]);
    setEditingTransactionId(null);
    setPartnerToView(null);
    setShowNewAccount(false);
    setAccountsTab("list");
    onPartnerActionsChange?.(null);
  };

  const handleClose = async () => {
    if (modalMode === "view") {
      await handleAutoSave();
    }
    resetForm();
  };

  const startNew = () => {
    setEditingKey(null);
    setOriginalPartnerData(null);
    replaceForm(createEmptyForm(kind));
    setModalMode(null);
    setTransactions([]);
    setShowNewAccount(true);
    if (kind === "partners-financial") {
      setAccountsTab("personal");
      setPartnerToView({ partner_name: "", phone: "", kind: formRef.current.kind, total_amount: 0, total_withdrawals: 0 });
    }
  };

  const patchPhone = (value: string) => {
    const normalized = toEnglishDigits(value);
    const cleaned = normalized.replace(/[^\d+\s()-]/g, "");
    patchForm({ phone: cleaned });
  };

  const patchName = (value: string) => {
    patchForm({ name: englishKeyboardToArabic(value) });
  };

  const resetTransactionForm = (type: TransactionType = txForm.type) => {
    setEditingTransactionId(null);
    setTxForm({
      type,
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      notes: "",
      installments: 1,
      paymentType: (formRef.current.kind === "ممول" && type === "ايداع") ? "ممول" : "قاصه",
      transferBy: "",
      commission: 0,
      commissionPercent: 1,
    });
  };

  const ensurePartnerSaved = async () => {
    const currentForm = formRef.current;
    const nameClean = currentForm.name.trim();
    const phoneClean = toEnglishDigits(currentForm.phone.trim());
    if (!nameClean) {
      alert(kind === "مطلوب" || kind === "partners-financial" ? "الرجاء كتابة اسم الحساب" : `الرجاء كتابة اسم ${form.kind}`);
      return null;
    }

    if (!editingKey) {
      const alreadyExists = partners.some(
        (p) => p.partner_name.trim() === nameClean && p.kind === currentForm.kind
      );
      if (alreadyExists) {
        setEditingKey(nameClean);
        setOriginalPartnerData({ name: nameClean, phone: phoneClean, kind: currentForm.kind });
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
        return nameClean;
      }

      if (savingRef.current) return null;
      savingRef.current = true;
      setSaving(true);
      try {
        await callTauri("add_partner", {
          name: nameClean,
          phone: phoneClean,
          kind: form.kind,
        });
        setEditingKey(nameClean);
        setOriginalPartnerData({ name: nameClean, phone: phoneClean, kind: form.kind });
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
        return nameClean;
      } catch (err) {
        console.error("Failed to auto-add partner:", err);
        alert("تعذر حفظ الحساب.");
        return null;
      } finally {
        setSaving(false);
        savingRef.current = false;
      }
    }
    return editingKey;
  };

  const openDepositForm = async () => {
    const savedKey = await ensurePartnerSaved();
    if (!savedKey) return;
    resetTransactionForm("ايداع");
    setShowTxModal(true);
  };

  const openWithdrawForm = async () => {
    const savedKey = await ensurePartnerSaved();
    if (!savedKey) return;
    resetTransactionForm("سحب");
    setShowTxModal(true);
  };

  const beginEditTransaction = (tx: PartnerTransaction) => {
    setEditingTransactionId(tx.id);
    const rawPaymentType = tx.payment_type || tx.paymentType || "قاصه";
    const paymentType = (rawPaymentType === "ماستر" || rawPaymentType === "مصرف") ? rawPaymentType : (rawPaymentType === "ممول" ? "ممول" : "قاصه");

    const isFinancierRepayment = form.kind === "ممول" && tx.type_.startsWith("سحب");
    const parsedNotes = isFinancierRepayment ? parseFinancierNotes(tx.notes) : null;

    setTxForm({
      type: tx.type_.startsWith("سحب") ? "سحب" : "ايداع",
      amount: tx.amount,
      date: tx.date?.split(" ")[0] || new Date().toISOString().slice(0, 10),
      notes: parsedNotes ? parsedNotes.originalNotes : (tx.notes ?? ""),
      installments: 1,
      paymentType,
      transferBy: parsedNotes ? parsedNotes.transferBy : "",
      commission: parsedNotes ? parsedNotes.commission : 0,
      commissionPercent: parsedNotes ? parsedNotes.commissionPercent : 1,
    });
    if (tx.currency === "USD" || tx.currency === "IQD") {
      setTxCurrency(tx.currency);
    }
    setShowTxModal(true);
  };

  const beginSettleInstallment = (tx: PartnerTransaction) => {
    beginEditTransaction(tx);
    setTxForm(prev => ({ ...prev, type: "ايداع" }));
  };

  const handleSortTransactions = (key: TransactionSortKey) => {
    setTransactionSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedTransactions = useMemo(() => {
    const direction = transactionSort.direction === "asc" ? 1 : -1;
    return [...transactions].sort((a, b) => {
      if (transactionSort.key === "date") {
        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * direction;
      }
      if (transactionSort.key === "type") {
        return a.type_.localeCompare(b.type_, "ar") * direction;
      }
      if (transactionSort.key === "amount") {
        return (a.amount - b.amount) * direction;
      }
      return (a.id - b.id) * direction;
    });
  }, [transactions, transactionSort]);

  const visibleSortedTransactions = useMemo(
    () => sortedTransactions.filter((tx) => !(isInstallmentWithdrawal(tx) && tx.amount <= 0)),
    [sortedTransactions],
  );

  const totalModalPages = Math.max(1, Math.ceil(visibleSortedTransactions.length / PAGE_SIZE));
  const currentModalPage = Math.min(modalPage, totalModalPages - 1);

  const pageTransactions = useMemo(() => {
    return visibleSortedTransactions.slice(currentModalPage * PAGE_SIZE, (currentModalPage + 1) * PAGE_SIZE);
  }, [visibleSortedTransactions, currentModalPage]);

  const sequenceByTransactionId = useMemo(() => {
    return new Map(visibleSortedTransactions.map((tx, index) => [tx.id, index + 1]));
  }, [visibleSortedTransactions]);

  const rebalanceInstallmentsAfterPayment = async (
    partnerName: string,
    paymentDelta: number,
    paymentDate: string,
    currency: Currency,
  ) => {
    const roundedDelta = Math.round(paymentDelta);
    if (roundedDelta === 0) return;

    const installmentRows = transactions
      .filter((tx) => isInstallmentWithdrawal(tx) && isSameCurrency(tx, currency))
      .sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        return dateDiff !== 0 ? dateDiff : a.id - b.id;
      });

    if (installmentRows.length === 0) return;

    const activeRows = installmentRows.filter((tx) => tx.amount > 0);
    if (activeRows.length === 0) return;

    const paymentTime = new Date(paymentDate).getTime();
    const target = activeRows.find((tx) => new Date(tx.date).getTime() >= paymentTime) ?? activeRows[0];
    const targetIndex = installmentRows.findIndex((tx) => tx.id === target.id);
    if (targetIndex < 0) return;

    const futureRows = installmentRows.slice(targetIndex + 1).filter((tx) => tx.amount > 0);

    if (futureRows.length === 0) {
      await callTauri("delete_partner_transaction", {
        id: target.id, partnerName, kind: form.kind,
      });
      return;
    }

    const futureTotal = futureRows.reduce((sum, tx) => sum + tx.amount, 0);
    const originalTotal = target.amount + futureTotal;
    const newRemaining = Math.max(0, originalTotal - roundedDelta);
    const distributedAmounts = splitAmountEvenly(newRemaining, futureRows.length);

    await callTauri("delete_partner_transaction", {
      id: target.id, partnerName, kind: form.kind,
    });

    await Promise.all(
      futureRows.map((tx, index) => {
        const nextAmount = distributedAmounts[index] ?? 0;
        if (nextAmount <= 0) {
          return callTauri("delete_partner_transaction", {
            id: tx.id, partnerName, kind: form.kind,
          });
        }
        return callTauri("update_partner_transaction", {
          id: tx.id, partnerName, kind: form.kind,
          type: "سحب", amount: nextAmount,
          date: tx.date, notes: tx.notes,
          currency,
          paymentType: tx.payment_type || tx.paymentType || "قاصه",
        });
      }),
    );
  };

  useEffect(() => {
    if (!shouldScrollTransactionsRef.current || transactionsLoading || transactions.length === 0) {
      return;
    }

    shouldScrollTransactionsRef.current = false;
    window.requestAnimationFrame(() => {
      transactionListRef.current?.scrollTo({
        top: transactionListRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [transactions, transactionsLoading]);



  /* ── متابعة حالة البحث المنبثق ── */
  useEffect(() => {
    if (kind !== "partners-financial") return;
    if (partnersSearchOpen) {
      const t = setTimeout(() => partnersSearchInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    } else {
      setPartnersSearch("");
    }
  }, [partnersSearchOpen, kind]);

  /* ── تصفية الشركاء للبحث ── */
  const filteredPartnersForSearch = useMemo(() => {
    if (kind !== "partners-financial") return [];
    const q = partnersSearch.trim().toLowerCase();
    if (!q) return [];
    return partners.filter((p) => {
      if (p.kind !== "شريك" && p.kind !== "مستثمر" && p.kind !== "ممول" && p.kind !== "مقترض" && p.kind !== "شركة") return false;
      return (
        p.partner_name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q))
      );
    });
  }, [partners, partnersSearch, kind]);

  const openPersonalAccount = useCallback(async (partner: Partner) => {
    setPartnerToView(partner);
    setAccountsTab("personal");
    setPartnersSearch("");
    await loadPartner(partner);
    onPartnerActionsChange?.({
      onDeposit: openDepositForm,
      onWithdraw: openWithdrawForm,
    });
  }, [onPartnerActionsChange]);

  /* ── Esc key ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (partnersSearchOpen) {
          onPartnersSearchClose?.();
          return;
        }
        setShowDeleteModal(false);
        setPartnerToDelete(null);
        setDeleteTxConfirm(null);
        setDeleteDialogOpen(false);
        setShowTxModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [partnersSearchOpen, onPartnersSearchClose]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      alert(kind === "partners-financial" ? "الرجاء كتابة اسم الحساب" : `الرجاء كتابة اسم ${form.kind}`);
      return;
    }

    setSaving(true);
    try {
      const nextName = form.name.trim();
      const phoneClean = toEnglishDigits(form.phone.trim());
      if (editingKey) {
        await callTauri("update_partner", {
          oldName: editingKey,
          oldKind: originalPartnerData?.kind || form.kind,
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: form.kind });
        await loadPartner({ partner_name: nextName, phone: phoneClean, total_amount: 0, total_withdrawals: 0, kind: form.kind }, true);
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      } else {
        await callTauri("add_partner", {
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        resetForm();
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      }
    } catch (err) {
      console.error(err);
      alert(`تعذر حفظ بيانات ${form.kind}.`);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const currentForm = formRef.current;
    const nextName = currentForm.name.trim();
    const phoneClean = toEnglishDigits(currentForm.phone.trim());
    if (!nextName) {
      if (originalPartnerData) {
        patchForm({ name: originalPartnerData.name });
      }
      savingRef.current = false;
      return;
    }
    if (!currentForm.kind && !editingKey) {
      savingRef.current = false;
      return;
    }
    if (!editingKey) {
      const alreadyExists = partners.some(
        (p) => p.partner_name.trim() === nextName && p.kind === currentForm.kind
      );
      if (alreadyExists) {
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: currentForm.kind });
        if (kind === "partners-financial") {
          setPartnerToView({ partner_name: nextName, phone: phoneClean, kind: currentForm.kind, total_amount: 0, total_withdrawals: 0 });
        }
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
        savingRef.current = false;
        return;
      }

      setSaving(true);
      try {
        await callTauri("add_partner", {
          name: nextName,
          phone: phoneClean,
          kind: currentForm.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: currentForm.kind });
        setShowNewAccount(false);
        if (kind === "partners-financial") {
          setPartnerToView({ partner_name: nextName, phone: phoneClean, kind: currentForm.kind, total_amount: 0, total_withdrawals: 0 });
        }
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      } catch (err) {
        console.error("Auto save failed:", err);
      } finally {
        setSaving(false);
        savingRef.current = false;
      }
      return;
    }
    if (originalPartnerData && (nextName !== originalPartnerData.name || phoneClean !== originalPartnerData.phone || currentForm.kind !== originalPartnerData.kind)) {
      setSaving(true);
      try {
        await callTauri("update_partner", {
          oldName: editingKey,
          oldKind: originalPartnerData.kind,
          name: nextName,
          phone: phoneClean,
          kind: currentForm.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: currentForm.kind });
        await loadPartner({ partner_name: nextName, phone: phoneClean, total_amount: 0, total_withdrawals: 0, kind: currentForm.kind }, true);
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      } catch (err) {
        console.error(err);
        alert(`تعذر تحديث البيانات تلقائياً.`);
      } finally {
        setSaving(false);
        savingRef.current = false;
      }
    } else {
      savingRef.current = false;
    }
  };

  const executeDelete = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      await callTauri("delete_partner", { name: editingKey, kind: form.kind });
      resetForm();
      await onRefresh();
      if (kind === "مطلوب") { void fetchUnifiedAccounts(); }
    } catch (err) {
      console.error(err);
      alert(`تعذر حذف ${form.kind}.`);
    } finally {
      setSaving(false);
    }
  };

  const executeInlineDelete = async (partnerName: string, partnerKind: string) => {
    setSaving(true);
    try {
      await callTauri("delete_partner", { name: partnerName, kind: partnerKind });
      if (editingKey === partnerName) resetForm();
      await onRefresh();
      if (kind === "مطلوب") { void fetchUnifiedAccounts(); }
    } catch (err) {
      console.error(err);
      alert(`تعذر حذف ${partnerKind}.`);
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteTransaction = async () => {
    const tx = deleteTxConfirm;
    if (!tx) return;
    setDeleteTxConfirm(null);
    try {
      await callTauri("delete_partner_transaction", { id: tx.id, partnerName: tx.partner_name, kind: tx.kind });
      if (kind === "مطلوب") { void fetchUnifiedAccounts(); }
      const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", { partnerName: tx.partner_name, kind: tx.kind });
      setTransactions(txs ?? []);
      if (editingTransactionId === tx.id) {
        setEditingTransactionId(null);
        setTxForm({ type: "ايداع" as TransactionType, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1, paymentType: "قاصه", transferBy: "", commission: 0, commissionPercent: 1 });
      }
      await onRefresh();
    } catch (err) {
      console.error("فشل حذف المعاملة:", err);
      alert("خطأ: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const dateStr = txForm.date?.trim() || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isFinite(txForm.amount) || txForm.amount <= 0) {
      alert("الرجاء إدخال مبلغ صحيح والتاريخ");
      return;
    }
    if (!editingKey) return;

    setSaving(true);
    try {
      const originalEditingTransaction = editingTransactionId
        ? transactions.find((tx) => tx.id === editingTransactionId) ?? null
        : null;
      const installments = txForm.type === "سحب" && !editingTransactionId
        ? Math.max(1, Math.floor(Number(txForm.installments)) || 1)
        : 1;
      const periodAmount = Number.isFinite(txForm.amount) ? txForm.amount : 0;
      const installmentAmount = Math.floor(periodAmount / installments);
      const remainder = periodAmount - installmentAmount * installments;
      const convertsInstallmentToPayment =
        (kind === "مطلوب" || form.kind === "مقترض") &&
        txForm.type === "ايداع" &&
        !!editingTransactionId &&
        !!originalEditingTransaction &&
        isInstallmentWithdrawal(originalEditingTransaction);

      if (convertsInstallmentToPayment) {
        await callTauri("add_partner_transaction", {
          partnerName: editingKey,
          kind: form.kind,
          type: "ايداع",
          amount: periodAmount,
          date: dateStr,
          notes: txForm.notes || `تسديد ${originalEditingTransaction.notes ?? "قسط"}`,
          currency: txCurrency,
          paymentType: txForm.paymentType,
        });
        await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);
      } else {
        for (let i = 0; i < installments; i++) {
          const date = new Date(dateStr);
          date.setMonth(date.getMonth() + i);
          const dateStr_i = date.toISOString().slice(0, 10);
          const amount = i === installments - 1 ? installmentAmount + remainder : installmentAmount;
          const monthNote = (() => {
            if (form.kind === "ممول" && txForm.type === "سحب") {
              const pct = txForm.commissionPercent || 0;
              const commissionVal = (amount * pct) / 100;
              const formattedTotal = txCurrency === "USD"
                ? `$${(amount + commissionVal).toLocaleString("en-US")}`
                : `${(amount + commissionVal).toLocaleString("en-US")} د.ع`;
              return `تم تسديد الممول ${form.name} بـ ${formattedTotal} ارسل اليه بواسطة ${txForm.transferBy || "—"}${txForm.notes ? ` - ${txForm.notes}` : ""} - عمولة: ${pct}%`;
            }
            return installments > 1
              ? `قسط ${i + 1}/${installments}${txForm.notes ? ` - ${txForm.notes}` : ""}`
              : (txForm.notes || null);
          })();

          const transactionPayload = {
            partnerName: editingKey,
            kind: form.kind,
            type: txForm.type,
            amount,
            date: dateStr_i,
            notes: monthNote,
            currency: txCurrency,
            paymentType: (form.kind === "ممول" && txForm.type === "ايداع") ? "ممول" : txForm.paymentType,
          };

          if (editingTransactionId) {
            await callTauri("update_partner_transaction", {
              id: editingTransactionId,
              ...transactionPayload,
            });
          } else {
            await callTauri("add_partner_transaction", transactionPayload);
          }
        }

        if ((kind === "مطلوب" || form.kind === "مقترض") && txForm.type === "ايداع") {
          const originalCurrency = originalEditingTransaction?.currency === "USD" ? "USD" : "IQD";
          const originalAmount = originalEditingTransaction?.type_ === "ايداع"
            ? originalEditingTransaction.amount
            : 0;
          if (!editingTransactionId) {
            await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);
          } else if (originalEditingTransaction?.type_ === "ايداع") {
            if (originalCurrency === txCurrency) {
              await rebalanceInstallmentsAfterPayment(
                editingKey,
                periodAmount - originalAmount,
                dateStr,
                txCurrency,
              );
            } else {
              await rebalanceInstallmentsAfterPayment(
                editingKey,
                -originalAmount,
                originalEditingTransaction.date?.split(" ")[0] || dateStr,
                originalCurrency,
              );
              await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);
            }
          }
        }
      }

      resetTransactionForm(txForm.type);
      shouldScrollTransactionsRef.current = !editingTransactionId;
      await loadPartner({ partner_name: editingKey, phone: form.phone, total_amount: 0, total_withdrawals: 0, kind: form.kind }, true);
      await onRefresh();
      if (kind === "مطلوب") { void fetchUnifiedAccounts(); }
      setShowTxModal(false);
    } catch (err) {
      console.error(err);
      alert("تعذر إضافة المعاملة.");
    } finally {
      setSaving(false);
    }
  };

  const totalDeposits = transactions
    .filter((t) => t.type_.startsWith("ايداع"))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => t.type_.startsWith("سحب"))
    .reduce((sum, t) => sum + t.amount, 0);

  const partnerIqdBalance = accountsTab === "personal" && partnerToView
    ? transactions.filter((t) => t.type_.startsWith("ايداع") && (t.currency || "IQD") === "IQD").reduce((s, t) => s + t.amount, 0)
    - transactions.filter((t) => t.type_.startsWith("سحب") && (t.currency || "IQD") === "IQD").reduce((s, t) => s + t.amount, 0)
    : currencyTotals[0];

  const partnerUsdBalance = accountsTab === "personal" && partnerToView
    ? transactions.filter((t) => t.type_.startsWith("ايداع") && t.currency === "USD").reduce((s, t) => s + t.amount, 0)
    - transactions.filter((t) => t.type_.startsWith("سحب") && t.currency === "USD").reduce((s, t) => s + t.amount, 0)
    : currencyTotals[1];

  const hasInstallmentSchedule = transactions.some(isInstallmentWithdrawal);
  const displayTotalDebt = hasInstallmentSchedule
    ? totalWithdrawals + totalDeposits
    : totalWithdrawals;
  const displayRemainingDebt = hasInstallmentSchedule
    ? totalWithdrawals
    : Math.max(0, totalWithdrawals - totalDeposits);


  return (
    <div className="customers-page">
      {/* ── لوحة الإحصائيات العلوية لكشف الحساب الموحد ── */}
      {kind === "مطلوب" && (
        <div className="car-dashboard__grid car-dashboard__grid--3col" style={{ marginBottom: "1.5rem", gap: "1.2rem", minHeight: "auto" }}>
          {/* Card 1: نطلبهم */}
          <div className="stat-card" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0",
            padding: "1.5rem 2rem",
            position: "relative",
            background: "linear-gradient(145deg, rgba(212,175,55,0.22), rgba(255,215,0,0.10), rgba(180,140,30,0.18))",
            border: "1.5px solid rgba(212,175,55,0.45)",
            boxShadow: "0 0 32px rgba(212,175,55,0.18), 0 4px 24px rgba(212,175,55,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}>
            <h3 className="stat-label" style={{
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-bold)",
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "#f0d060",
              textShadow: "0 0 12px rgba(212,175,55,0.5)"
            }}>نطلبهم</h3>
            <svg viewBox="0 0 100 36" style={{ width: "180px", height: "36px", margin: "4px 0 6px 0" }}>
              <path d="M 50 0 L 50 12 Q 50 17, 25 17 L 18 34 M 50 12 Q 50 17, 75 17 L 82 34"
                stroke="rgba(212,175,55,0.35)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <circle cx="18" cy="34" r="2" fill="rgba(216,168,90,0.5)" />
              <circle cx="82" cy="34" r="2" fill="rgba(212,175,55,0.7)" />
            </svg>
            <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(212,175,55,0.28), rgba(255,215,0,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "#f0d060",
                border: "1px solid rgba(212,175,55,0.4)",
                boxShadow: "0 0 20px rgba(212,175,55,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(212,175,55,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
                <PriceDisplay amount={stats.iqdTheyOwe} />
              </div>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(212,175,55,0.28), rgba(255,215,0,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "#f0d060",
                border: "1px solid rgba(212,175,55,0.4)",
                boxShadow: "0 0 20px rgba(212,175,55,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(212,175,55,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
                <PriceDisplay amount={stats.usdTheyOwe} currency="USD" />
              </div>
            </div>
          </div>

          {/* Card 2: يطلبونا */}
          <div className="stat-card" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0",
            padding: "1.5rem 2rem",
            position: "relative",
            background: "linear-gradient(145deg, rgba(239,68,68,0.22), rgba(248,113,113,0.10), rgba(185,28,28,0.18))",
            border: "1.5px solid rgba(239,68,68,0.45)",
            boxShadow: "0 0 32px rgba(239,68,68,0.18), 0 4px 24px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}>
            <h3 className="stat-label" style={{
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-bold)",
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "#fca5a5",
              textShadow: "0 0 12px rgba(239,68,68,0.5)"
            }}>يطلبونا</h3>
            <svg viewBox="0 0 100 36" style={{ width: "180px", height: "36px", margin: "4px 0 6px 0" }}>
              <path d="M 50 0 L 50 12 Q 50 17, 25 17 L 18 34 M 50 12 Q 50 17, 75 17 L 82 34"
                stroke="rgba(239,68,68,0.35)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <circle cx="18" cy="34" r="2" fill="rgba(216,168,90,0.5)" />
              <circle cx="82" cy="34" r="2" fill="rgba(248,113,113,0.7)" />
            </svg>
            <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(239,68,68,0.28), rgba(248,113,113,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "#fca5a5",
                border: "1px solid rgba(239,68,68,0.4)",
                boxShadow: "0 0 20px rgba(239,68,68,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(248,113,113,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
                <PriceDisplay amount={stats.iqdWeOwe} />
              </div>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(239,68,68,0.28), rgba(248,113,113,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "#fca5a5",
                border: "1px solid rgba(239,68,68,0.4)",
                boxShadow: "0 0 20px rgba(239,68,68,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(248,113,113,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
                <PriceDisplay amount={stats.usdWeOwe} currency="USD" />
              </div>
            </div>
          </div>

          {/* Card 3: الصافي */}
          <div className="stat-card" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0",
            padding: "1.5rem 2rem",
            position: "relative",
            background: "linear-gradient(145deg, rgba(34,197,94,0.20), rgba(74,222,128,0.10), rgba(22,163,74,0.16))",
            border: "1.5px solid rgba(34,197,94,0.45)",
            boxShadow: "0 0 32px rgba(34,197,94,0.18), 0 4px 24px rgba(34,197,94,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}>
            <h3 className="stat-label" style={{
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-bold)",
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "#86efac",
              textShadow: "0 0 12px rgba(34,197,94,0.5)"
            }}>الصافي</h3>
            <svg viewBox="0 0 100 36" style={{ width: "180px", height: "36px", margin: "4px 0 6px 0" }}>
              <path d="M 50 0 L 50 12 Q 50 17, 25 17 L 18 34 M 50 12 Q 50 17, 75 17 L 82 34"
                stroke="rgba(34,197,94,0.35)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <circle cx="18" cy="34" r="2" fill="rgba(216,168,90,0.5)" />
              <circle cx="82" cy="34" r="2" fill="rgba(74,222,128,0.7)" />
            </svg>
            <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(34,197,94,0.28), rgba(74,222,128,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "#86efac",
                border: "1px solid rgba(34,197,94,0.4)",
                boxShadow: "0 0 20px rgba(34,197,94,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(74,222,128,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
                <PriceDisplay amount={stats.iqdNet} />
              </div>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(34,197,94,0.28), rgba(74,222,128,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "#86efac",
                border: "1px solid rgba(34,197,94,0.4)",
                boxShadow: "0 0 20px rgba(34,197,94,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(74,222,128,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
                <PriceDisplay amount={stats.usdNet} currency="USD" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="cars-page__toolbar unified-toolbar">
        {kind === "partners-financial" ? (
          <>
            <div className="unified-toolbar__right">
              <div className="cars-tabs financial-tabs">
                {ACCOUNTS_TABS.map((tab) => {
                  if (tab.id === "personal" && accountsTab === "personal" && partnerToView) {
                    return (
                      <div key={tab.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <input
                          value={form.name}
                          onChange={(e) => patchName(e.target.value)}
                          onBlur={() => void handleAutoSave()}
                          placeholder="ادخل الاسم"
                          style={{
                            width: "250px",
                            minWidth: "250px",
                            height: "64px",
                            padding: "0 1rem",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            borderRadius: "14px",
                            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(16, 185, 129, 0.06))",
                            color: "#b7ffcf",
                            fontSize: "var(--font-size)",
                            fontWeight: "var(--fw-extrabold)",
                            fontFamily: "var(--btn-font-family)",
                            outline: "none",
                            textAlign: "center",
                            boxShadow: "0 0 24px rgba(34, 197, 94, 0.18), inset 0 1px 0 rgba(255,255,255,0.12)",
                            transition: "all 0.2s ease",
                            cursor: "text",
                          }}
                        />
                        <input
                          value={form.phone || ""}
                          onChange={(e) => patchPhone(e.target.value)}
                          onBlur={() => void handleAutoSave()}
                          placeholder="رقم الهاتف"
                          style={{
                            width: "180px",
                            minWidth: "180px",
                            height: "64px",
                            padding: "0 1rem",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "14px",
                            background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
                            color: "rgba(255,255,255,0.85)",
                            fontSize: "var(--font-size)",
                            fontWeight: "var(--fw-extrabold)",
                            fontFamily: "var(--btn-font-family)",
                            outline: "none",
                            textAlign: "center",
                            direction: "ltr",
                            boxShadow: "0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.05)",
                            transition: "all 0.2s ease",
                            cursor: "text",
                          }}
                        />
                        <div style={{ minWidth: "220px" }}>
                          <SearchableCombobox
                            value={form.kind}
                            onChange={(val) => {
                              patchForm({ kind: val });
                              void handleAutoSave();
                            }}
                            placeholder="اختر نوع الحساب"
                            options={[
                              { label: "شريك", value: "شريك", kind: "شريك" },
                              { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                              { label: "ممول", value: "ممول", kind: "ممول" },
                              { label: "مقترض", value: "مقترض", kind: "مقترض" },
                              { label: "شركة", value: "شركة", kind: "شركة" },
                            ]}
                          />
                        </div>
                      </div>
                    );
                  }

                  const isActive = accountsTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`${tab.id === "list" ? "top-btn-one" : "top-btn-two"} ${isActive ? (tab.id === "list" ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
                      onClick={() => {
                        if (tab.id === "list") {
                          const now = Date.now();
                          if (now - lastListTabClickRef.current < 300) {
                            lastListTabClickRef.current = 0;
                            startNew();
                            return;
                          }
                          lastListTabClickRef.current = now;
                        }
                        if (tab.id === "personal" && !partnerToView) return;
                        if (tab.id === "list") {
                          resetForm();
                        } else {
                          setAccountsTab(tab.id);
                        }
                      }}
                    >
                      {tab.id === "personal" && partnerToView ? form.name : tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="unified-toolbar__center" />
            <div className="unified-toolbar__left">
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={partnerUsdBalance} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={partnerIqdBalance} />
              </div>
            </div>
          </>
        ) : kind === "مطلوب" ? (
          <>
            <div className="unified-toolbar__right">
              <ActionButton type="button" variant="primary" className="btn-new-car" onClick={startNew} style={{ whiteSpace: "nowrap" }}>
                + إضافة حساب
              </ActionButton>

              <div className="flex items-center gap-1 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-xl p-1" style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all select-none border border-transparent whitespace-nowrap",
                    debtFilter === "all"
                      ? "bg-white/15 text-white border-white/10 shadow-sm shadow-black/20"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                  onClick={() => setDebtFilter("all")}
                >
                  الكل
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all select-none border border-transparent whitespace-nowrap",
                    debtFilter === "they_owe"
                      ? "bg-gradient-to-br from-green-500/25 to-green-600/10 text-green-300 border-green-500/40 shadow-sm shadow-green-500/10"
                      : "text-white/60 hover:text-green-300 hover:bg-green-500/5"
                  )}
                  onClick={() => setDebtFilter("they_owe")}
                >
                  نطلبهم
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all select-none border border-transparent whitespace-nowrap",
                    debtFilter === "we_owe"
                      ? "bg-gradient-to-br from-red-500/25 to-red-600/10 text-red-300 border-red-500/40 shadow-sm shadow-red-500/10"
                      : "text-white/60 hover:text-red-300 hover:bg-red-500/5"
                  )}
                  onClick={() => setDebtFilter("we_owe")}
                >
                  يطلبونا
                </button>
              </div>
            </div>
            <div className="unified-toolbar__center">
              <TextInput
                type="search"
                placeholder="بحث بالاسم أو رقم الهاتف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leadingIcon={Search}
                inputSize="sm"
                containerClassName="w-full max-w-[420px]"
              />
            </div>
            <div className="unified-toolbar__left"></div>
          </>
        ) : (
          <>
            <div className="unified-toolbar__right">
              <ActionButton type="button" variant="primary" className="btn-new-car" onClick={startNew}>
                + إضافة {kind}
              </ActionButton>
            </div>
            <div className="unified-toolbar__center"></div>
            <div className="unified-toolbar__left">
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={currencyTotals[1]} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={currencyTotals[0]} />
              </div>
            </div>
          </>
        )}
      </div>

      {kind === "partners-financial" && accountsTab === "list" ? (
        <>
          {totalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}

          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
            tabIndex={0}
          >
            <div className="table-wrapper partner-debtors-scroll">
              <table className="data-table partners-data-table">
                <thead>
                  <tr>
                    <th className="cell-num">ت</th>
                    <th className={partnersSort.key === "kind" ? "th--sorted" : ""} onClick={() => handleSortPartners("kind")} style={{ cursor: "pointer" }}>النوع</th>
                    <th className={`col-name ${partnersSort.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${partnersSort.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${partnersSort.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                    <th className={`col-ratio ${partnersSort.key === "ratio" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("ratio")} style={{ cursor: "pointer" }}>نسبة الشراكة</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagePartners.map((partner, idx) => {
                    const pKind = partner.kind || "شريك";
                    const sameKind = myPartners.filter((p) => (p.kind || "شريك") === pKind);
                    const totalSameKind = sameKind.reduce((sum, p) => sum + p.total_amount, 0);
                    const ratio = totalSameKind > 0 ? (partner.total_amount / totalSameKind) * 100 : 0;
                    return (
                      <tr
                        key={`${partner.partner_name}_${partner.kind}`}
                        className={`customers-tr partner-row--${pKind}`}
                        onClick={() => openPersonalAccount(partner)}
                        title="اضغط لعرض التفاصيل"
                      >
                        <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                        <td>
                          <span className={`badge badge--kind-${pKind}`}>
                            {pKind}
                          </span>
                        </td>
                        <td className="col-name cell-bold">{partner.partner_name}</td>
                        <td className="col-phone">{partner.phone || "—"}</td>
                        <td className="col-money cell-bold">
                          {pKind === "ممول" ? (
                            partner.total_amount > 0 ? (
                              <span className="text-green">
                                <PriceDisplay amount={partner.total_amount} noColor />
                              </span>
                            ) : partner.total_amount < 0 ? (
                              <span className="text-red">
                                <PriceDisplay amount={Math.abs(partner.total_amount)} noColor />
                              </span>
                            ) : (
                              <span style={{ color: "rgba(255,255,255,0.4)" }}>خالص</span>
                            )
                          ) : pKind === "مقترض" ? (
                            partner.total_withdrawals > 0 ? (
                              <span className="text-green">
                                <PriceDisplay amount={partner.total_withdrawals} noColor />
                              </span>
                            ) : (
                              <span style={{ color: "rgba(255,255,255,0.4)" }}>خالص</span>
                            )
                          ) : (
                            <span className={partner.total_amount >= 0 ? "text-green" : "text-red"}>
                              <PriceDisplay amount={partner.total_amount} noColor />
                            </span>
                          )}
                        </td>
                        <td className="col-ratio">{ratio.toFixed(1)}%</td>
                        <td className="col-delete">
                          <button
                            type="button"
                            className="partner-inline-delete-btn"
                            title="حذف"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPartnerToDelete({ name: partner.partner_name, kind: partner.kind });
                              setShowDeleteModal(true);
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {myPartners.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-cell">
                        لا توجد حسابات بعد
                      </td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - pagePartners.length) }).map((_, i) => (
                    <tr key={`empty-part-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td className="col-name">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-ratio">&nbsp;</td>
                      <td className="col-delete">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : kind === "partners-financial" && accountsTab === "personal" && partnerToView ? (
        <>
          {totalModalPages > 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalModalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentModalPage ? "is-active" : ""}`}
                  onClick={() => setModalPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}
          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentModalPage, totalModalPages, setModalPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentModalPage, totalModalPages, setModalPage)}
            tabIndex={0}
          >
            {transactionsLoading ? (
              <p className="text-muted partner-empty-state">جاري التحميل...</p>
            ) : visibleSortedTransactions.length === 0 ? (
              <p className="text-muted partner-empty-state">لا توجد معاملات بعد</p>
            ) : (
              <div
                className="table-wrapper partner-tx-wrapper"
                ref={transactionListRef}
              >
                <table className="data-table">
                  <thead>
                    <tr data-kind={partnerToView?.kind || ""}>
                      <th className={`col-seq ${transactionSort.key === "sequence" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("sequence")} style={{ cursor: "pointer" }}>ت</th>
                      <th className={`col-date ${transactionSort.key === "date" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("date")}>التاريخ</th>
                      <th className="col-time" style={{ width: "80px" }}>الوقت</th>
                      <th className={`col-type ${transactionSort.key === "type" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("type")} style={{ cursor: "pointer", width: "160px", minWidth: "120px" }}>العملية</th>
                      <th className={`col-amount ${transactionSort.key === "amount" ? "th--sorted" : ""}`}  onClick={() => handleSortTransactions("amount")} style={{ cursor: "pointer", width: "180px", minWidth: "140px" }}>المبلغ</th>
                      <th className="col-notes">ملاحظة</th>
                      <th className="col-actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageTransactions.map((tx) => {
                      const isWithdraw = tx.type_.startsWith("سحب");
                      const isDeposit = tx.type_.startsWith("ايداع");
                      return (
                        <tr
                          key={tx.id}
                          className={`partner-tx-row ${form.kind === "ممول"
                              ? (isWithdraw ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                              : (isDeposit ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                            }`}
                          title="اضغط لتعديل المعاملة"
                          onClick={() => beginEditTransaction(tx)}
                        >
                          <td className="cell-num col-seq">{sequenceByTransactionId.get(tx.id) ?? tx.id}</td>
                          <td className="col-date">{tx.date}</td>
                          <td className="col-time">{tx.time || "00:00"}</td>
                          <td className="col-type">
                            <span className={form.kind === "ممول" ? (isWithdraw ? "text-green font-bold" : "text-red font-bold") : (isWithdraw ? "tx-type-withdraw" : "tx-type-deposit")}>
                              {form.kind === "ممول" ? (isWithdraw ? "سحب" : "ايداع") : tx.type_}
                            </span>
                          </td>
                          <td className={cn(
                            "col-amount font-bold",
                            isWithdraw ? "text-red" : "text-green"
                          )}>
                            <PriceDisplay
                              amount={isWithdraw ? -tx.amount : tx.amount}
                              currency={tx.currency}
                              noColor
                            />
                          </td>
                          <td className="text-muted col-notes">
                            <span>{tx.notes ? (tx.notes.includes(" - عمولة:") ? tx.notes.split(" - عمولة:")[0] : tx.notes) : "—"}</span>
                          </td>
                          <td className="col-actions">
                            <button
                              type="button"
                              className="partner-tx-delete-btn"
                              title="حذف المعاملة"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTxConfirm(tx);
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : kind === "مطلوب" ? (
        <>
          {totalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}

          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
            tabIndex={0}
          >
            <div className="table-wrapper partner-debtors-scroll">
              <table className="data-table partners-data-table partners-data-table--debtors">
                <thead>
                  <tr>
                    <th className="cell-num" style={{ width: "35px" }}>ت</th>
                    <th className={`col-name ${accountsSort.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${accountsSort.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${accountsSort.key === "iqd" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("iqd")} style={{ cursor: "pointer" }}>الرصيد بالدينار</th>
                    <th className={`col-money ${accountsSort.key === "usd" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("usd")} style={{ cursor: "pointer" }}>الرصيد بالدولار</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageAccounts.map((account, idx) => {
                    const renderBalanceCell = (amount: number, isUsd: boolean) => {
                      if (amount > 0) {
                        return (
                          <span className="text-green font-bold" style={{ direction: "ltr", display: "inline-block" }}>
                            + <PriceDisplay amount={amount} currency={isUsd ? "USD" : "IQD"} noColor />
                          </span>
                        );
                      } else if (amount < 0) {
                        return (
                          <span className="text-red font-bold" style={{ direction: "ltr", display: "inline-block" }}>
                            - <PriceDisplay amount={Math.abs(amount)} currency={isUsd ? "USD" : "IQD"} noColor />
                          </span>
                        );
                      } else {
                        return <span style={{ color: "#888888" }}>-</span>;
                      }
                    };
                    return (
                      <tr
                        key={`${account.partner_name}_${account.kind}`}
                        className="customers-tr"
                        onClick={() => loadPartner({ partner_name: account.partner_name, phone: account.phone || "", total_amount: 0, total_withdrawals: 0, kind: "مطلوب" })}
                        title="اضغط لعرض التفاصيل"
                      >
                        <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                        <td className="col-name cell-bold">{account.partner_name}</td>
                        <td className="col-phone">{account.phone || "—"}</td>
                        <td className="col-money">{renderBalanceCell(account.iqd_balance, false)}</td>
                        <td className="col-money">{renderBalanceCell(account.usd_balance, true)}</td>
                        <td className="col-delete">
                          <button
                            type="button"
                            className="partner-inline-delete-btn"
                            title="حذف"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPartnerToDelete({ name: account.partner_name, kind: "مطلوب" });
                              setShowDeleteModal(true);
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAndSortedAccounts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-cell">لا توجد حسابات مطابقة للبحث أو التصفية</td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - pageAccounts.length) }).map((_, i) => (
                    <tr key={`empty-acc-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td className="col-name">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-delete">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : kind !== "مطلوب" && kind !== "partners-financial" ? (
        <>
          {totalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}

          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
            tabIndex={0}
          >
            <div className="table-wrapper partner-debtors-scroll">
              <table className="data-table partners-data-table">
                <thead>
                  <tr>
                    <th className="cell-num">ت</th>
                    <th className={partnersSort.key === "kind" ? "th--sorted" : ""} onClick={() => handleSortPartners("kind")} style={{ cursor: "pointer" }}>النوع</th>
                    <th className={`col-name ${partnersSort.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${partnersSort.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${partnersSort.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                    <th className={`col-ratio ${partnersSort.key === "ratio" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("ratio")} style={{ cursor: "pointer" }}>نسبة الشراكة</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagePartners.map((partner, idx) => {
                    const pKind = partner.kind || kind;
                    const sameKind = myPartners.filter((p) => (p.kind || kind) === pKind);
                    const totalSameKind = sameKind.reduce((sum, p) => sum + p.total_amount, 0);
                    const ratio = totalSameKind > 0 ? (partner.total_amount / totalSameKind) * 100 : 0;
                    return (
                      <tr
                        key={`${partner.partner_name}_${partner.kind}`}
                        className={`customers-tr partner-row--${pKind}`}
                        onClick={() => loadPartner(partner)}
                        title="اضغط لعرض التفاصيل"
                      >
                        <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                        <td>
                          <span className={`badge badge--kind-${pKind}`}>{pKind}</span>
                        </td>
                        <td className="col-name cell-bold">{partner.partner_name}</td>
                        <td className="col-phone">{partner.phone || "—"}</td>
                        <td className="col-money cell-bold">
                          <span className={partner.total_amount >= 0 ? "text-green" : "text-red"}>
                            <PriceDisplay amount={partner.total_amount} noColor />
                          </span>
                        </td>
                        <td className="col-ratio">{ratio.toFixed(1)}%</td>
                        <td className="col-delete">
                          <button
                            type="button"
                            className="partner-inline-delete-btn"
                            title="حذف"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPartnerToDelete({ name: partner.partner_name, kind: partner.kind });
                              setShowDeleteModal(true);
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {myPartners.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-cell">لا يوجد {kind === "مستثمر" ? "مستثمرون" : "شركاء"}</td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - pagePartners.length) }).map((_, i) => (
                    <tr key={`empty-part-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td className="col-name">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-ratio">&nbsp;</td>
                      <td className="col-delete">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {showNewAccount && kind !== "partners-financial" ? (
        <div className="car-form-card" style={{ marginTop: "1.5rem", padding: "12px" }}>
          <h4 className="car-form-group-title">
            إضافة حساب {kind}
          </h4>
          <form className="form customer-form" onSubmit={handleSubmit}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 250px", minWidth: 0 }}>
                <label className="label" htmlFor="partner-name-new">
                  اسم {kind}
                </label>
                <TextInput id="partner-name-new" value={form.name}
                  autoComplete="new-password"
                  onInput={(e: React.FormEvent<HTMLInputElement>) => patchName((e.target as HTMLInputElement).value)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchName(e.target.value)}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchName(e.target.value)}
                  placeholder="الاسم الثلاثي" />
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <label className="label" htmlFor="partner-phone-new">
                  رقم الهاتف
                </label>
                <TextInput id="partner-phone-new" value={form.phone}
                  autoComplete="new-password"
                  dir="ltr" placeholder="077xxxxxxxx"
                  onInput={(e: React.FormEvent<HTMLInputElement>) => patchPhone((e.target as HTMLInputElement).value)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchPhone(e.target.value)}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchPhone(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", paddingBottom: "2px" }}>
                <ActionButton type="submit" variant="success" disabled={saving}>
                  {saving ? "جاري الحفظ..." : `حفظ ${kind}`}
                </ActionButton>
                <ActionButton type="button" variant="ghost" onClick={resetForm}>
                  إلغاء
                </ActionButton>
              </div>
            </div>
          </form>
          <div className="table-card-container" style={{ marginTop: "1rem" }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ت</th>
                    <th>التاريخ</th>
                    <th>الوقت</th>
                    <th>العملية</th>
                    <th>الحساب</th>
                    <th>المبلغ</th>
                    <th>ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={7} className="empty-cell">لا توجد معاملات بعد</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {!showNewAccount && modalMode !== null && (kind !== "partners-financial" || !editingKey) && (
        <div className="modal-overlay modal-overlay--soft" role="presentation" onClick={handleClose}>
          <div
            className={`modal-dialog ${modalMode === "view" ? "modal-dialog--partner modal-dialog--wide" : "modal-dialog--slim"
              } modal-dialog--kind-${form.kind}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`customer-form-panel ${modalMode === "view" ? "partner-form-panel" : "partner-form-panel--slim"}`}>
              {modalMode === "view" && (
                <div className="partner-summary-sidebar">
                  <div className="partner-summary-field">
                    <span className="partner-summary-field__label">👤 الاسم</span>
                    <input
                      type="text"
                      className="partner-sidebar-input"
                      value={form.name}
                      onInput={(e) => patchName((e.target as HTMLInputElement).value)}
                      onChange={(e) => patchName(e.target.value)}
                      onBlur={() => void handleAutoSave()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                  <div className="partner-summary-field">
                    <span className="partner-summary-field__label">📞 رقم الهاتف</span>
                    <input
                      type="text"
                      className="partner-sidebar-input"
                      dir="ltr"
                      value={form.phone}
                      onInput={(e) => patchPhone((e.target as HTMLInputElement).value)}
                      onChange={(e) => patchPhone(e.target.value)}
                      onBlur={() => void handleAutoSave()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                  {kind === "partners-financial" && (
                    <div className="partner-summary-field">
                      <span className="partner-summary-field__label">💼 نوع الحساب</span>
                      <SearchableCombobox
                        value={form.kind}
                        onChange={(val) => {
                          patchForm({ kind: val });
                          void handleAutoSave();
                        }}
                        placeholder="نوع الحساب"
                        options={[
                          { label: "شريك", value: "شريك", kind: "شريك" },
                          { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                          { label: "ممول", value: "ممول", kind: "ممول" },
                          { label: "مقترض", value: "مقترض", kind: "مقترض" },
                          { label: "شركة", value: "شركة", kind: "شركة" },
                        ]}
                      />
                    </div>
                  )}
                  {(kind === "مطلوب") ? (
                    <>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">📊 المبلغ الكلي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--total">
                          <PriceDisplay amount={displayTotalDebt} />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">🟢 تم تسديد</span>
                        <span className="partner-summary-field__value partner-summary-field__value--paid">
                          <PriceDisplay amount={totalDeposits} />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">🔴 المتبقي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--remaining">
                          <PriceDisplay amount={displayRemainingDebt} />
                        </span>
                      </div>

                    </>
                  ) : form.kind === "مقترض" ? (
                    <>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">📊 المجموع الكلي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--total">
                          <PriceDisplay amount={totalDeposits + totalWithdrawals} />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label" style={{ color: "#22c55e" }}>🟢 تم تسديد</span>
                        <span className="partner-summary-field__value" style={{ color: "#22c55e" }}>
                          <PriceDisplay amount={totalDeposits} noColor />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label" style={{ color: "#ef4444" }}>🔴 المتبقي</span>
                        <span className="partner-summary-field__value" style={{ color: "#ef4444" }}>
                          <PriceDisplay amount={totalWithdrawals} noColor />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="partner-summary-field">
                      <span className="partner-summary-field__label">💼 صافي المبلغ</span>
                      <span className="partner-summary-field__value">
                        {form.kind === "ممول" ? (
                          (totalDeposits - totalWithdrawals) > 0 ? (
                            <span className="text-green">
                              <PriceDisplay amount={totalDeposits - totalWithdrawals} noColor />
                            </span>
                          ) : (totalDeposits - totalWithdrawals) < 0 ? (
                            <span className="text-red">
                              <PriceDisplay amount={Math.abs(totalDeposits - totalWithdrawals)} noColor />
                            </span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>خالص</span>
                          )
                        ) : (
                          <span className={(totalDeposits - totalWithdrawals) >= 0 ? "text-green" : "text-red"}>
                            <PriceDisplay amount={totalDeposits - totalWithdrawals} noColor />
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="partner-main-content">
                <div className="car-form-panel__header" style={{ textAlign: "center", width: "100%" }}>
                  <h3 className="car-form-panel__title" style={{ margin: "0 auto" }}>
                    {modalMode === "new"
                      ? "إضافة حساب"
                      : `سجل حركات الحساب ${form.name} ${kind === "مطلوب" && currentBalanceDescription ? `(${currentBalanceDescription})` : ""}`}
                  </h3>
                </div>

                {modalMode !== "view" && (
                  <form className="form customer-form partner-identity-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                      <label className="label" htmlFor="partner-name">
                        اسم {kind === "partners-financial" ? "الحساب" : kind}
                      </label>
                      <TextInput id="partner-name" value={form.name}
                        autoComplete="new-password"
                        onInput={(e: React.FormEvent<HTMLInputElement>) => patchName((e.target as HTMLInputElement).value)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchName(e.target.value)}
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchName(e.target.value)}
                        placeholder="الاسم الثلاثي" />
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor="partner-phone">
                        رقم الهاتف
                      </label>
                      <TextInput id="partner-phone" value={form.phone}
                        autoComplete="new-password"
                        dir="ltr" placeholder="077xxxxxxxx"
                        onInput={(e: React.FormEvent<HTMLInputElement>) => patchPhone((e.target as HTMLInputElement).value)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchPhone(e.target.value)}
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchPhone(e.target.value)} />
                    </div>
                    {kind === "partners-financial" && (
                      <div className="form-group">
                        <label className="label">نوع الحساب</label>
                        <SearchableCombobox
                          value={form.kind}
                          onChange={(val) => patchForm({ kind: val })}
                          placeholder="نوع الحساب"
                          options={[
                            { label: "شريك", value: "شريك", kind: "شريك" },
                            { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                            { label: "ممول", value: "ممول", kind: "ممول" },
                            { label: "مقترض", value: "مقترض", kind: "مقترض" },
                            { label: "شركة", value: "شركة", kind: "شركة" },
                          ]}
                        />
                      </div>
                    )}
                    <div className="car-form-panel__actions">
                      <ActionButton type="submit" variant="success" disabled={saving}>
                        {saving ? "جاري الحفظ..." : kind === "partners-financial" ? "حفظ الحساب" : `حفظ ${kind}`}
                      </ActionButton>
                      <ActionButton type="button" variant="ghost" onClick={resetForm}>
                        إلغاء
                      </ActionButton>
                    </div>
                  </form>
                )}

                {modalMode === "view" && (
                  <>
                    <div className="partner-transactions-panel">
                      {transactionsLoading ? (
                        <p className="text-muted partner-empty-state">جاري التحميل...</p>
                      ) : visibleSortedTransactions.length === 0 ? (
                        <p className="text-muted partner-empty-state">لا توجد معاملات بعد</p>
                      ) : (
                        <>
                          {totalModalPages > 1 && (
                            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
                              {Array.from({ length: totalModalPages }, (_, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  className={`table-page-dot ${idx === currentModalPage ? "is-active" : ""}`}
                                  onClick={() => setModalPage(idx)}
                                  aria-label={`الصفحة ${idx + 1}`}
                                />
                              ))}
                            </div>
                          )}
                          <section
                            className="table-card-container"
                            onWheel={(e) => handlePaginationWheel(e, currentModalPage, totalModalPages, setModalPage)}
                            onKeyDown={(e) => handlePaginationKeyDown(e, currentModalPage, totalModalPages, setModalPage)}
                            tabIndex={0}
                          >
                            <div
                              className="table-wrapper partner-tx-wrapper"
                              ref={transactionListRef}
                            >
                              <table className="data-table">
                                <thead>
                                  <tr data-kind={form.kind || ""}>
                                    <th className={`col-seq ${transactionSort.key === "sequence" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("sequence")} style={{ cursor: "pointer" }}>ت</th>
                                    <th className={`col-date ${transactionSort.key === "date" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("date")} style={{ cursor: "pointer" }}>التاريخ</th>
                                    <th className="col-time">الوقت</th>
                                    <th className={`col-type ${transactionSort.key === "type" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("type")} style={{ cursor: "pointer" }}>العملية</th>
                                    <th className="col-account">الحساب</th>
                                    <th className={`col-amount ${transactionSort.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                                    <th className="col-notes">ملاحظة</th>
                                    <th className="col-actions"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pageTransactions.map((tx) => {
                                    const rawPaymentType = tx.payment_type || tx.paymentType || "قاصه";
                                    const paymentTypeLabel = (rawPaymentType === "ماستر" || rawPaymentType === "مصرف") ? rawPaymentType : "قاصه";
                                    const badgeClass = paymentTypeLabel === "ماستر" ? "account-badge--master" : paymentTypeLabel === "مصرف" ? "account-badge--bank" : "account-badge--qasa";
                                    const isWithdraw = tx.type_.startsWith("سحب");
                                    const isDeposit = tx.type_.startsWith("ايداع");
                                    return (
                                      <tr
                                        key={tx.id}
                                        className={`partner-tx-row ${form.kind === "ممول" || kind === "مطلوب"
                                            ? (isWithdraw ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                                            : (isDeposit ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                                          }`}
                                        title="اضغط لتعديل المعاملة"
                                        onClick={() => beginEditTransaction(tx)}
                                      >
                                        <td className="cell-num col-seq">{sequenceByTransactionId.get(tx.id) ?? tx.id}</td>
                                        <td className="col-date">{tx.date}</td>
                                        <td className="col-time">{tx.time || "00:00"}</td>
                                        <td className="col-type">
                                          <span className={form.kind === "ممول" || kind === "مطلوب" ? (isWithdraw ? "text-green font-bold" : "text-red font-bold") : (isWithdraw ? "tx-type-withdraw" : "tx-type-deposit")}>
                                            {form.kind === "ممول" ? (isWithdraw ? "سحب" : "ايداع") : kind === "مطلوب" ? (isWithdraw ? "اعطيته" : "اخذت منه") : form.kind === "مقترض" ? (isWithdraw ? "لم يسدد بعد" : "تم التسديد") : tx.type_}
                                          </span>
                                        </td>
                                        <td className="col-account">
                                          <span className={`account-badge ${badgeClass}`}>
                                            {paymentTypeLabel}
                                          </span>
                                        </td>
                                        <td className={cn(
                                          "col-amount font-bold",
                                          isWithdraw ? "text-red" : "text-green"
                                        )}>
                                          <PriceDisplay
                                            amount={isWithdraw ? -tx.amount : tx.amount}
                                            currency={tx.currency}
                                            noColor
                                          />
                                        </td>
                                        <td className="text-muted col-notes">
                                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <span>
                                              {tx.notes
                                                ? tx.notes.includes(" - عمولة:")
                                                  ? tx.notes.split(" - عمولة:")[0]
                                                  : tx.notes
                                                : "—"}
                                            </span>
                                            {(form.kind === "مقترض" && isUnpaidInstallment(tx)) && (
                                              <button
                                                type="button"
                                                className="btn-settle-installment"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  beginSettleInstallment(tx);
                                                }}
                                              >
                                                تم التسديد
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="col-actions">
                                          <button
                                            type="button"
                                            className="partner-tx-delete-btn"
                                            title="حذف المعاملة"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteTxConfirm(tx);
                                            }}
                                          >
                                            ✕
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        </>
                      )}
                    </div>

                    <div className="car-form-panel__actions partner-modal-actions" style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                      <ActionButton
                        type="button"
                        variant={kind === "مطلوب" ? "success" : form.kind === "مقترض" ? "secondary" : "success"}
                        onClick={openWithdrawForm}
                      >
                        {form.kind === "ممول" ? "سحب" : kind === "مطلوب" ? `اعطي الى ${form.name || "الحساب"}` : form.kind === "مقترض" ? "لم يسدد بعد" : "سحب"}
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant={kind === "مطلوب" ? "secondary" : form.kind === "مقترض" ? "success" : "secondary"}
                        onClick={openDepositForm}
                      >
                        {form.kind === "ممول" ? "ايداع" : kind === "مطلوب" ? `اخذ من ${form.name || "الحساب"}` : form.kind === "مقترض" ? "تم التسديد" : "إيداع"}
                      </ActionButton>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة البحث المنبثقة للعملاء ── */}
      {kind === "partners-financial" && partnersSearchOpen && (
        <div className="cars-search-overlay" onClick={() => onPartnersSearchClose?.()}>
          <div
            className="cars-search-popup"
            onClick={(e) => e.stopPropagation()}
            role="search"
            aria-label="بحث في حسابات العملاء"
          >
            <div className="cars-search-popup__header">
              <span className="cars-search-popup__icon" aria-hidden>❖</span>
              <span className="cars-search-popup__title">بحث في حسابات العملاء</span>
              {partnersSearch.trim() && (
                <span className="cars-search-popup__badge">
                  {filteredPartnersForSearch.length}
                </span>
              )}
              <button
                type="button"
                className="cars-search-popup__close"
                onClick={() => onPartnersSearchClose?.()}
                aria-label="إغلاق البحث"
              >
                ✕
              </button>
            </div>

            <div className="cars-search-popup__body">
              <span className="cars-search-popup__search-icon" aria-hidden>🔍</span>
              <input
                ref={partnersSearchInputRef}
                type="search"
                className="cars-search-popup__input"
                placeholder="ابحث باسم الحساب أو رقم الهاتف..."
                value={partnersSearch}
                onChange={(e) => {
                  setPartnersSearch(e.target.value);
                  setPartnersSearchHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  const results = filteredPartnersForSearch.slice(0, 8);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPartnersSearchHighlightIdx((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPartnersSearchHighlightIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results.length > 0) {
                    e.preventDefault();
                    const partner = results[partnersSearchHighlightIdx] ?? results[0];
                    onPartnersSearchClose?.();
                    void openPersonalAccount(partner);
                  }
                }}
                autoComplete="off"
                dir="rtl"
              />
              {partnersSearch && (
                <button
                  type="button"
                  className="cars-search-popup__clear"
                  onClick={() => { setPartnersSearch(""); setPartnersSearchHighlightIdx(0); }}
                  aria-label="مسح البحث"
                >
                  ✕
                </button>
              )}
            </div>

            {partnersSearch.trim() && (
              <div className="cars-search-popup__results">
                {filteredPartnersForSearch.length === 0 ? (
                  <div className="cars-search-popup__empty">
                    <span className="cars-search-popup__empty-icon" aria-hidden>👤</span>
                    <span>لا توجد حسابات مطابقة</span>
                  </div>
                ) : (
                  <ul className="cars-search-popup__list" role="listbox">
                    {filteredPartnersForSearch.slice(0, 8).map((partner, resultIdx) => {
                      const isHighlighted = resultIdx === partnersSearchHighlightIdx;
                      const q = partnersSearch.trim();
                      const highlight = (text: string) => {
                        if (!q) return text;
                        const idx = text.toLowerCase().indexOf(q.toLowerCase());
                        if (idx === -1) return text;
                        return (
                          <>
                            {text.slice(0, idx)}
                            <mark className="cars-search-popup__mark">{text.slice(idx, idx + q.length)}</mark>
                            {text.slice(idx + q.length)}
                          </>
                        );
                      };
                      const pKind = partner.kind || "شريك";
                      return (
                        <li
                          key={`${partner.partner_name}_${partner.kind}`}
                          className={`cars-search-popup__item${isHighlighted ? " cars-search-popup__item--active" : ""}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setPartnersSearchHighlightIdx(resultIdx)}
                          onClick={() => {
                            onPartnersSearchClose?.();
                            void openPersonalAccount(partner);
                          }}
                        >
                          <div className="cars-search-popup__item-main">
                            <span className="cars-search-popup__item-model">
                              {highlight(partner.partner_name)}
                            </span>
                            <span className={`badge badge--kind-${pKind}`} style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                              {pKind}
                            </span>
                          </div>
                          <div className="cars-search-popup__item-sub">
                            <span className="cars-search-popup__item-plate">
                              {partner.phone || "—"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                    {filteredPartnersForSearch.length > 8 && (
                      <li className="cars-search-popup__more">
                        و {filteredPartnersForSearch.length - 8} حساب آخر...
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        title={`تأكيد حذف ${form.kind}`}
        message={`هل تريد حذف «${editingKey ?? form.name}» وكل معاملاته؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="نعم، احذف"
        cancelLabel="إلغاء"
        danger
        loading={saving}
        onConfirm={() => void executeDelete()}
        onCancel={() => setDeleteDialogOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteTxConfirm}
        title="تأكيد حذف المعاملة"
        message={<span>هل تريد حذف هذه المعاملة بقيمة ({deleteTxConfirm ? <PriceDisplay amount={deleteTxConfirm.amount} currency={deleteTxConfirm.currency} /> : ""})؟ لا يمكن التراجع عن هذا الإجراء.</span>}
        confirmLabel="نعم، احذف"
        cancelLabel="إلغاء"
        danger
        onConfirm={() => void executeDeleteTransaction()}
        onCancel={() => setDeleteTxConfirm(null)}
      />

      {/* ── نافذة إضافة / تحديث المعاملة ── */}
      {showTxModal && editingKey && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowTxModal(false)}>
          <div
            className="modal-dialog"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: (form.kind === "ممول" && txForm.type === "سحب") ? 650 : 480 }}
          >
            <h3 className="modal-dialog__title">
              {form.kind === "ممول" && txForm.type === "سحب"
                ? (editingTransactionId ? `تعديل سحب - ${form.name}` : `سحب - ${form.name}`)
                : (editingTransactionId ? "تحديث المعاملة" : `إضافة معاملة - ${form.name}`)}
            </h3>

            {!(form.kind === "ممول" && txForm.type === "سحب") && (form.kind === "ممول" || kind === "مطلوب") && (
              <div style={{
                margin: "0 0 1rem",
                padding: "0.6rem",
                borderRadius: "8px",
                textAlign: "center",
                fontWeight: "var(--fw-bold)",
                fontSize: "var(--fs-sm)",
                background: txForm.type === "سحب" ? "rgba(34,197,94,0.15)" : "rgba(212,175,55,0.15)",
                color: txForm.type === "سحب" ? "#22c55e" : "#f0d060",
                border: txForm.type === "سحب" ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(212,175,55,0.3)"
              }}>
                {form.kind === "ممول"
                  ? (txForm.type === "سحب" ? `سحب من حساب ${form.name}` : `ايداع في حساب ${form.name}`)
                  : (txForm.type === "سحب" ? `اعطي الى ${form.name} (نطلبه)` : `اخذ من ${form.name} (يطلبنا)`)}
              </div>
            )}

            {form.kind === "مقترض" && editingTransactionId && (
              <div style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "center",
                margin: "0 0 1rem",
              }}>
                <button
                  type="button"
                  className={`payment-type-btn payment-type-btn--settle ${txForm.type === "ايداع" ? "payment-type-btn--active" : ""}`}
                  onClick={() => setTxForm(prev => ({ ...prev, type: "ايداع" }))}
                  style={{
                    flex: 1, padding: "8px 16px",
                    background: txForm.type === "ايداع" ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.05)",
                    color: txForm.type === "ايداع" ? "#22c55e" : "rgba(255,255,255,0.6)",
                    border: txForm.type === "ايداع" ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  ✅ تم التسديد
                </button>
                <button
                  type="button"
                  className={`payment-type-btn payment-type-btn--unsettle ${txForm.type === "سحب" ? "payment-type-btn--active" : ""}`}
                  onClick={() => setTxForm(prev => ({ ...prev, type: "سحب" }))}
                  style={{
                    flex: 1, padding: "8px 16px",
                    background: txForm.type === "سحب" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.05)",
                    color: txForm.type === "سحب" ? "#ef4444" : "rgba(255,255,255,0.6)",
                    border: txForm.type === "سحب" ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  ❌ لم يسدد بعد
                </button>
              </div>
            )}

            <form className="form" onSubmit={handleAddTransaction}>
              {form.kind === "ممول" && txForm.type === "سحب" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 1.5rem" }}>
                  {/* Row 1: التاريخ - المبلغ */}
                  <div className="form-group">
                    <label className="label">التاريخ</label>
                    <UnifiedDateField
                      value={txForm.date}
                      onChange={(date) => setTxForm({ ...txForm, date })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">المبلغ</label>
                    <PriceInput
                      value={String(txForm.amount)}
                      onChange={(amount) => setTxForm({ ...txForm, amount: Number(amount) || 0 })}
                      currency={txCurrency}
                      onCurrencyChange={setTxCurrency}
                    />
                  </div>

                  {/* Row 2: العمولة - المبلغ مع العمولة */}
                  <div className="form-group">
                    <label className="label">العمولة (نسبة مئوية %)</label>
                    <NumberInput
                      value={String(txForm.commissionPercent)}
                      onChange={(val) => setTxForm({ ...txForm, commissionPercent: Number(val) || 0 })}
                      min={0}
                      step={0.1}
                      hideArrows
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">المبلغ الكلي مع العمولة</label>
                    <div style={{
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "8px",
                      color: "#10b981",
                      fontWeight: 700,
                      fontSize: "var(--fs-md)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      height: "42px"
                    }}>
                      <span style={{ fontSize: "var(--fs-sm)", opacity: 0.7 }}>المجموع:</span>
                      <PriceDisplay amount={txForm.amount + (txForm.amount * txForm.commissionPercent) / 100} currency={txCurrency} />
                    </div>
                  </div>

                  {/* Row 3: طريقة الدفع - ارسال المبلغ بيد */}
                  <div className="form-group">
                    <label className="label">طريقة الدفع</label>
                    <div className="payment-type-selector" style={{ height: "42px", maxWidth: "none", padding: "4px" }}>
                      {(["قاصه", "ماستر"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : "master"} ${txForm.paymentType === opt ? "payment-type-btn--active" : ""}`}
                          onClick={() => setTxForm({ ...txForm, paymentType: opt })}
                          style={{ flex: 1, padding: "8px 12px" }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="label">ارسال المبلغ بيد</label>
                    <TextInput
                      value={txForm.transferBy}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTxForm({ ...txForm, transferBy: e.target.value })}
                      placeholder="اسم ناقل المبلغ..."
                    />
                  </div>

                  {/* Row 4: الملاحظات */}
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label className="label">الملاحظات</label>
                    <textarea
                      className="input"
                      value={txForm.notes}
                      onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                      placeholder="ملاحظات اختيارية..."
                      rows={2}
                      style={{ resize: "none", width: "100%" }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="label">
                      {kind === "مطلوب"
                        ? txForm.type === "ايداع" ? "تاريخ التسديد" : "تاريخ الاستحقاق"
                        : "التاريخ"}
                    </label>
                    <UnifiedDateField
                      value={txForm.date}
                      onChange={(date) => setTxForm({ ...txForm, date })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">المبلغ</label>
                    <PriceInput
                      value={String(txForm.amount)}
                      onChange={(amount) => setTxForm({ ...txForm, amount: Number(amount) || 0 })}
                      currency={txCurrency}
                      onCurrencyChange={setTxCurrency}
                    />
                  </div>

                  {form.kind === "ممول" && txForm.type === "سحب" && (
                    <>
                      <div className="form-group">
                        <label className="label">نقل المبلغ بواسطة</label>
                        <TextInput
                          value={txForm.transferBy}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTxForm({ ...txForm, transferBy: e.target.value })}
                          placeholder="اسم ناقل المبلغ (مثال: ماستر، مكتب صرافة...)"
                        />
                      </div>
                      <div className="form-group">
                        <label className="label">العمولة (نسبة مئوية %)</label>
                        <NumberInput
                          value={String(txForm.commissionPercent)}
                          onChange={(val) => setTxForm({ ...txForm, commissionPercent: Number(val) || 0 })}
                          min={0}
                          step={0.1}
                          hideArrows
                        />
                      </div>
                      <div className="form-group">
                        <label className="label">المبلغ الكلي مع العمولة</label>
                        <div style={{
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "8px",
                          color: "#10b981",
                          fontWeight: 700,
                          fontSize: "var(--fs-md)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span>المجموع:</span>
                          <PriceDisplay amount={txForm.amount + (txForm.amount * txForm.commissionPercent) / 100} currency={txCurrency} />
                        </div>
                      </div>
                    </>
                  )}

                  {kind === "مطلوب" && txForm.type === "سحب" && !editingTransactionId && (
                    <div className="form-group">
                      <label className="label">عدد الأشهر</label>
                      <NumberInput
                        value={String(txForm.installments)}
                        onChange={(installments) => setTxForm({ ...txForm, installments: Math.max(1, Number(installments) || 1) })}
                        min={1}
                        hideArrows
                      />
                    </div>
                  )}

                  {!(form.kind === "ممول" && txForm.type === "ايداع") && (
                    <div className="form-group">
                      <label className="label">طريقة الدفع</label>
                      <div className="payment-type-selector">
                        {(["قاصه", "ماستر"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : "master"} ${txForm.paymentType === opt ? "payment-type-btn--active" : ""}`}
                            onClick={() => setTxForm({ ...txForm, paymentType: opt })}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="label">ملاحظة</label>
                    <textarea
                      className="input"
                      value={txForm.notes}
                      onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                      placeholder="اختياري"
                      rows={2}
                      style={{ resize: "none" }}
                    />
                  </div>
                </>
              )}

              <div className="modal-dialog__actions" style={{ marginTop: "1.5rem" }}>
                <ActionButton type="button" variant="ghost" onClick={() => setShowTxModal(false)}>
                  إلغاء
                </ActionButton>
                <ActionButton
                  type="submit"
                  variant={txForm.type === "ايداع" ? "success" : "secondary"}
                  disabled={saving}
                >
                  {saving ? "جاري الحفظ..." : editingTransactionId ? "تحديث" : "إضافة"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حذف العميل / المديونية */}
      {showDeleteModal && partnerToDelete && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowDeleteModal(false)}>
          <div
            className="modal-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-dialog__title">تأكيد حذف {partnerToDelete.kind === "مطلوب" ? "المديونية" : partnerToDelete.kind}</h3>
            <p className="modal-dialog__message">
              هل أنت متأكد من حذف <strong>{partnerToDelete.name}</strong> وكل معاملاته؟
              لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="modal-dialog__actions">
              <ActionButton
                type="button"
                variant="danger"
                onClick={() => {
                  const p = partnerToDelete;
                  setShowDeleteModal(false);
                  setPartnerToDelete(null);
                  void executeInlineDelete(p.name, p.kind);
                }}
                disabled={saving}
              >
                {saving ? "جاري الحذف..." : "تأكيد"}
              </ActionButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => { setShowDeleteModal(false); setPartnerToDelete(null); }}
                disabled={saving}
              >
                إلغاء
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

```

---

## File: `src/components/AgenciesTab.tsx`

```tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { callTauri } from "../api/tauri";
import type { Agency, AgencyTransaction } from "../types";
import { ActionButton, NumberInput, PriceDisplay, PriceInput, TextInput } from "@/components/ui";
import { YearScrollField } from "./YearScrollField";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import { ConfirmDialog } from "./ConfirmDialog";
import { UnifiedDateField } from "./UnifiedDateField";
import { englishKeyboardToArabic } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import "../styles/partners.css";
import "../styles/cards.css";
import "../styles/cars.css";
import "../styles/agencies.css";

interface AgenciesTabProps {
  onRefresh: () => Promise<void>;
  agenciesSearchOpen?: boolean;
  onAgenciesSearchClose?: () => void;
}

const AGENCIES_TABS: { id: "list" | "details"; label: string }[] = [
  { id: "list", label: "الوكالات" },
  { id: "details", label: "تفاصيل" },
];

export function AgenciesTab({ onRefresh, agenciesSearchOpen, onAgenciesSearchClose }: AgenciesTabProps) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [agenciesTab, setAgenciesTab] = useState<"list" | "details">("list");
  const lastListTabClickRef = useRef(0);
  const [agenciesSearch, setAgenciesSearch] = useState("");
  const [agenciesSearchHighlightIdx, setAgenciesSearchHighlightIdx] = useState(0);
  const agenciesSearchInputRef = useRef<HTMLInputElement>(null);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [transactions, setTransactions] = useState<AgencyTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);

  const [txForm, setTxForm] = useState({ type: "ايداع" as string, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", currency: "IQD" as string });
  const [txCurrency, setTxCurrency] = useState<"IQD" | "USD">("IQD");

  const [deleteTxConfirm, setDeleteTxConfirm] = useState<AgencyTransaction | null>(null);
  const [deleteAgencyConfirm, setDeleteAgencyConfirm] = useState<Agency | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAgencies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callTauri<Agency[]>("get_agencies");
      setAgencies(data ?? []);
    } catch (err) {
      console.error("Failed to fetch agencies:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddNewAgency = useCallback(async () => {
    try {
      const newId = await callTauri<number>("add_agency", {
        oldAgentName: "",
        carNumber: "",
        carModel: "",
        color: "",
        newAgentName: "",
        phone: "",
        amountUsd: 0,
        amountIqd: 0,
        notes: "",
      });
      const today = new Date().toISOString().slice(0, 10);
      const newAgency: Agency = {
        id: newId,
        old_agent_name: "",
        car_number: "",
        car_model: "",
        color: "",
        new_agent_name: "",
        phone: "",
        amount_usd: 0,
        amount_iqd: 0,
        notes: "",
        date: today,
        time: "",
      };
      setSelectedAgency(newAgency);
      setAgenciesTab("details");
      setTransactions([]);
      await fetchAgencies();
    } catch (err) {
      console.error("Failed to create agency:", err);
    }
  }, [fetchAgencies]);

  const handleAutoSave = useCallback((updatedAgency: Agency) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await callTauri("update_agency", {
          id: updatedAgency.id,
          oldAgentName: updatedAgency.old_agent_name,
          newAgentName: updatedAgency.new_agent_name,
          carNumber: updatedAgency.car_number,
          carModel: updatedAgency.car_model,
          color: updatedAgency.color,
          phone: toEnglishDigits(updatedAgency.phone),
          amountIqd: Number(updatedAgency.amount_iqd) || 0,
          amountUsd: Number(updatedAgency.amount_usd) || 0,
          notes: updatedAgency.notes
        });
        const data = await callTauri<Agency[]>("get_agencies");
        if (data) setAgencies(data);
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 1000);
  }, []);

  useEffect(() => {
    void fetchAgencies();
  }, [fetchAgencies]);

  const filteredAgencies = useMemo(() => {
    if (!agenciesSearch.trim()) return agencies;
    const q = agenciesSearch.trim().toLowerCase();
    return agencies.filter((a) =>
      a.old_agent_name.toLowerCase().includes(q) ||
      a.new_agent_name.toLowerCase().includes(q) ||
      a.car_number.toLowerCase().includes(q) ||
      a.phone.toLowerCase().includes(q)
    );
  }, [agencies, agenciesSearch]);

  const sortedAgencies = useMemo(() => {
    return [...filteredAgencies].sort((a, b) => b.id - a.id);
  }, [filteredAgencies]);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(sortedAgencies.length / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [sortedAgencies.length, agenciesSearch]);

  const totalPages = Math.max(1, Math.ceil(sortedAgencies.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageAgencies = useMemo(() => {
    return sortedAgencies.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [sortedAgencies, currentPage]);

  const loadAgency = useCallback(async (agency: Agency) => {
    setSelectedAgency(agency);
    setAgenciesTab("details");
    setTransactionsLoading(true);
    try {
      const txs = await callTauri<AgencyTransaction[]>("get_agency_transactions", { agencyId: agency.id });
      setTransactions(txs ?? []);
    } catch {
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  }, []);

  const handleDeleteAgency = async () => {
    if (!deleteAgencyConfirm) return;
    setSaving(true);
    try {
      await callTauri("delete_agency", { id: deleteAgencyConfirm.id });
      if (selectedAgency?.id === deleteAgencyConfirm.id) {
        setSelectedAgency(null);
        setTransactions([]);
        setAgenciesTab("list");
      }
      setDeleteAgencyConfirm(null);
      await fetchAgencies();
      await onRefresh();
    } catch {
      alert("تعذر حذف الوكالة");
    } finally {
      setSaving(false);
    }
  };

  const resetTxForm = (type: string) => {
    setTxForm({ type, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", currency: "IQD" });
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgency) return;
    const dateStr = txForm.date?.trim() || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isFinite(txForm.amount) || txForm.amount <= 0) {
      alert("الرجاء إدخال مبلغ صحيح والتاريخ");
      return;
    }
    setSaving(true);
    try {
      await callTauri("add_agency_transaction", {
        agencyId: selectedAgency.id,
        type: txForm.type,
        amount: txForm.amount,
        date: dateStr,
        notes: txForm.notes || null,
        currency: txCurrency,
      });
      resetTxForm(txForm.type);
      const txs = await callTauri<AgencyTransaction[]>("get_agency_transactions", { agencyId: selectedAgency.id });
      setTransactions(txs ?? []);
      setShowTxModal(false);
      await onRefresh();
    } catch {
      alert("تعذر إضافة المعاملة");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!deleteTxConfirm) return;
    try {
      await callTauri("delete_agency_transaction", { id: deleteTxConfirm.id });
      setDeleteTxConfirm(null);
      const txs = await callTauri<AgencyTransaction[]>("get_agency_transactions", { agencyId: deleteTxConfirm.agency_id });
      setTransactions(txs ?? []);
      await onRefresh();
    } catch {
      alert("تعذر حذف المعاملة");
    }
  };

  const filteredAgenciesForSearch = useMemo(() => {
    const q = agenciesSearch.trim().toLowerCase();
    if (!q) return [];
    return agencies.filter((a) =>
      a.old_agent_name.toLowerCase().includes(q) ||
      a.new_agent_name.toLowerCase().includes(q) ||
      a.car_number.toLowerCase().includes(q) ||
      a.phone.toLowerCase().includes(q)
    );
  }, [agencies, agenciesSearch]);

  useEffect(() => {
    if (agenciesSearchOpen) {
      const t = setTimeout(() => agenciesSearchInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    } else {
      setAgenciesSearch("");
    }
  }, [agenciesSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (agenciesSearchOpen) {
          onAgenciesSearchClose?.();
          return;
        }
        setShowTxModal(false);
        setDeleteTxConfirm(null);
        setDeleteAgencyConfirm(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [agenciesSearchOpen, onAgenciesSearchClose]);

  return (
    <div className="customers-page agencies-page">
      {/* ── شريط الأدوات ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          <div className="cars-tabs financial-tabs">
            {AGENCIES_TABS.map((tab) => {
              const isActive = agenciesTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`${tab.id === "list" ? "top-btn-one" : "top-btn-two"} ${isActive ? (tab.id === "list" ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
                  onClick={() => {
                    if (tab.id === "list") {
                      const now = Date.now();
                      if (now - lastListTabClickRef.current < 300) {
                        lastListTabClickRef.current = 0;
                        void handleAddNewAgency();
                        return;
                      }
                      lastListTabClickRef.current = now;
                    }
                    if (tab.id === "details" && !selectedAgency) return;
                    setAgenciesTab(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="unified-toolbar__center">
          {/* تم إزالة تفاصيل الوكيل من هنا بناءً على الطلب */}
        </div>
        <div className="unified-toolbar__left">
          {agenciesTab === "list" && (
            <>
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={agencies.reduce((s, a) => s + a.amount_usd, 0)} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={agencies.reduce((s, a) => s + a.amount_iqd, 0)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── المحتوى الرئيسي ── */}
      {loading ? (
        <div className="loading-state" style={{ minHeight: "300px" }}>
          <p>جاري تحميل الوكالات...</p>
        </div>
      ) : agenciesTab === "list" ? (
        <>
          {totalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}

          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
            tabIndex={0}
          >
            <div className="table-wrapper partner-debtors-scroll">
              <table className="data-table partners-data-table agencies-table">
                <thead>
                  <tr>
                    <th className="col-seq">ت</th>
                    <th className="col-date">التاريخ</th>
                    <th className="col-old-agent">الوكيل القديم</th>
                    <th className="col-car-num">رقم السيارة</th>
                    <th className="col-model">الموديل</th>
                    <th className="col-new-agent">الوكيل الجديد</th>
                    <th className="col-phone">رقم الهاتف</th>
                    <th className="col-money">المبلغ</th>
                    <th className="col-delete"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageAgencies.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-cell">لا توجد وكالات مسجلة</td>
                    </tr>
                  ) : (
                    pageAgencies.map((agency, idx) => {
                      return (
                        <tr
                          key={agency.id}
                          className="customers-tr"
                          onClick={() => loadAgency(agency)}
                          title="اضغط لعرض التفاصيل"
                        >
                          <td className="cell-num col-seq">{currentPage * PAGE_SIZE + idx + 1}</td>
                          <td className="col-date">{agency.date || "—"}</td>
                          <td className="col-old-agent cell-bold">{agency.old_agent_name}</td>
                          <td className="col-car-num">{agency.car_number || "—"}</td>
                          <td className="col-model">{agency.car_model || "—"}</td>
                          <td className="col-new-agent cell-bold">{agency.new_agent_name}</td>
                          <td className="col-phone">{agency.phone || "—"}</td>
                          <td className="col-money cell-bold">
                            <div style={{ display: "flex", gap: "10px" }}>
  {agency.amount_usd > 0 && (
    <span style={{ color: "#10b981", fontSize: "var(--fs-xs)", direction: "ltr", display: "inline-block" }}>
      <PriceDisplay amount={agency.amount_usd} currency="USD" noColor />
    </span>
  )}
  {agency.amount_iqd > 0 && (
    <span style={{ color: "#d8a85a", fontSize: "var(--fs-xs)", direction: "ltr", display: "inline-block" }}>
      <PriceDisplay amount={agency.amount_iqd} noColor />
    </span>
                              )}
                              {agency.amount_usd <= 0 && agency.amount_iqd <= 0 && <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}
                            </div>
                          </td>
                          <td className="col-delete">
                            <button
                              type="button"
                              className="partner-inline-delete-btn"
                              title="حذف"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteAgencyConfirm(agency);
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {pageAgencies.length > 0 && Array.from({ length: Math.max(0, PAGE_SIZE - pageAgencies.length) }).map((_, i) => (
                    <tr key={`empty-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="col-seq">&nbsp;</td>
                      <td className="col-date">&nbsp;</td>
                      <td className="col-old-agent">&nbsp;</td>
                      <td className="col-car-num">&nbsp;</td>
                      <td className="col-model">&nbsp;</td>
                      <td className="col-new-agent">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-delete">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : agenciesTab === "details" && selectedAgency ? (
        <div className="agency-unified-details">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">الوكيل القديم</label>
              <TextInput
                inputSize="sm"
                value={selectedAgency.old_agent_name}
                onChange={(e) => {
                  const next = { ...selectedAgency, old_agent_name: englishKeyboardToArabic(e.target.value) };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                placeholder="الوكيل القديم"
              />
            </div>
            <div className="col-span-1">
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">الوكيل الجديد</label>
              <TextInput
                inputSize="sm"
                value={selectedAgency.new_agent_name}
                onChange={(e) => {
                  const next = { ...selectedAgency, new_agent_name: englishKeyboardToArabic(e.target.value) };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                placeholder="الوكيل الجديد"
              />
            </div>
            <div className="col-span-1">
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">لون السيارة</label>
              <TextInput
                inputSize="sm"
                value={selectedAgency.color || ""}
                onChange={(e) => {
                  const next = { ...selectedAgency, color: e.target.value };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                placeholder="لون"
              />
            </div>
            <div className="max-w-28">
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">رقم اللوحة</label>
              <TextInput
                inputSize="sm"
                type="text"
                inputMode="decimal"
                value={selectedAgency.car_number}
                dir="ltr"
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  const v = toEnglishDigits((e.target as HTMLInputElement).value).replace(/\D/g, "");
                  const next = { ...selectedAgency, car_number: v };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = toEnglishDigits(e.target.value).replace(/\D/g, "");
                  const next = { ...selectedAgency, car_number: v };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  const v = toEnglishDigits(e.target.value).replace(/\D/g, "");
                  const next = { ...selectedAgency, car_number: v };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                placeholder="12345"
              />
            </div>
            <div className="max-w-24">
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">الموديل</label>
              <YearScrollField
                id="agency-car-year"
                value={selectedAgency.car_model}
                onChange={(year) => {
                  const next = { ...selectedAgency, car_model: year };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
              />
            </div>
            <div>
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">رقم الهاتف</label>
              <TextInput
                inputSize="sm"
                value={selectedAgency.phone || ""}
                autoComplete="new-password"
                dir="ltr"
                placeholder="07XX XXX XXXX"
                onInput={(e: React.FormEvent<HTMLInputElement>) => {
                  const v = toEnglishDigits((e.target as HTMLInputElement).value);
                  const next = { ...selectedAgency, phone: v };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = toEnglishDigits(e.target.value);
                  const next = { ...selectedAgency, phone: v };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  const v = toEnglishDigits(e.target.value);
                  const next = { ...selectedAgency, phone: v };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
              />
            </div>
            <div>
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">المبلغ (IQD)</label>
              <PriceInput
                value={selectedAgency.amount_iqd}
                onChange={(val) => {
                  const next = { ...selectedAgency, amount_iqd: val };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                hideCurrency
              />
            </div>
            <div>
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">المبلغ (USD)</label>
              <PriceInput
                value={selectedAgency.amount_usd}
                onChange={(val) => {
                  const next = { ...selectedAgency, amount_usd: val };
                  setSelectedAgency(next);
                  handleAutoSave(next);
                }}
                currency="USD"
                hideCurrency
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── نافذة البحث المنبثقة ── */}
      {agenciesSearchOpen && (
        <div className="cars-search-overlay" onClick={() => onAgenciesSearchClose?.()}>
          <div
            className="cars-search-popup"
            onClick={(e) => e.stopPropagation()}
            role="search"
            aria-label="بحث في الوكالات"
          >
            <div className="cars-search-popup__header">
              <span className="cars-search-popup__icon" aria-hidden>✉</span>
              <span className="cars-search-popup__title">بحث في الوكالات</span>
              {agenciesSearch.trim() && (
                <span className="cars-search-popup__badge">{filteredAgenciesForSearch.length}</span>
              )}
              <button
                type="button"
                className="cars-search-popup__close"
                onClick={() => onAgenciesSearchClose?.()}
                aria-label="إغلاق البحث"
              >
                ✕
              </button>
            </div>

            <div className="cars-search-popup__body">
              <span className="cars-search-popup__search-icon" aria-hidden>🔍</span>
              <input
                ref={agenciesSearchInputRef}
                type="search"
                className="cars-search-popup__input"
                placeholder="ابحث باسم الوكيل أو رقم السيارة..."
                value={agenciesSearch}
                onChange={(e) => {
                  setAgenciesSearch(e.target.value);
                  setAgenciesSearchHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  const results = filteredAgenciesForSearch.slice(0, 8);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setAgenciesSearchHighlightIdx((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setAgenciesSearchHighlightIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results.length > 0) {
                    e.preventDefault();
                    const agency = results[agenciesSearchHighlightIdx] ?? results[0];
                    onAgenciesSearchClose?.();
                    void loadAgency(agency);
                  }
                }}
                autoComplete="off"
                dir="rtl"
              />
              {agenciesSearch && (
                <button
                  type="button"
                  className="cars-search-popup__clear"
                  onClick={() => { setAgenciesSearch(""); setAgenciesSearchHighlightIdx(0); }}
                  aria-label="مسح البحث"
                >
                  ✕
                </button>
              )}
            </div>

            {agenciesSearch.trim() && (
              <div className="cars-search-popup__results">
                {filteredAgenciesForSearch.length === 0 ? (
                  <div className="cars-search-popup__empty">
                    <span className="cars-search-popup__empty-icon" aria-hidden>📋</span>
                    <span>لا توجد وكالات مطابقة</span>
                  </div>
                ) : (
                  <ul className="cars-search-popup__list" role="listbox">
                    {filteredAgenciesForSearch.slice(0, 8).map((agency, resultIdx) => {
                      const isHighlighted = resultIdx === agenciesSearchHighlightIdx;
                      const q = agenciesSearch.trim();
                      const highlight = (text: string) => {
                        if (!q) return text;
                        const idx = text.toLowerCase().indexOf(q.toLowerCase());
                        if (idx === -1) return text;
                        return (
                          <>
                            {text.slice(0, idx)}
                            <mark className="cars-search-popup__mark">{text.slice(idx, idx + q.length)}</mark>
                            {text.slice(idx + q.length)}
                          </>
                        );
                      };
                      return (
                        <li
                          key={agency.id}
                          className={`cars-search-popup__item${isHighlighted ? " cars-search-popup__item--active" : ""}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setAgenciesSearchHighlightIdx(resultIdx)}
                          onClick={() => {
                            onAgenciesSearchClose?.();
                            void loadAgency(agency);
                          }}
                        >
                          <div className="cars-search-popup__item-main">
                            <span className="cars-search-popup__item-model">{highlight(agency.old_agent_name)}</span>
                            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}>→ {agency.new_agent_name}</span>
                          </div>
                          <div className="cars-search-popup__item-sub">
                            <span className="cars-search-popup__item-plate">{highlight(agency.car_number)}</span>
                            <span className="cars-search-popup__item-dot" aria-hidden>•</span>
                            <span>{agency.phone || "—"}</span>
                          </div>
                        </li>
                      );
                    })}
                    {filteredAgenciesForSearch.length > 8 && (
                      <li className="cars-search-popup__more">
                        و {filteredAgenciesForSearch.length - 8} وكالة أخرى...
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── نافذة إضافة معاملة ── */}
      {showTxModal && selectedAgency && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowTxModal(false)}>
          <div className="modal-dialog" role="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 className="modal-dialog__title">
              {txForm.type === "ايداع" ? "إيداع" : "سحب"} - {selectedAgency.new_agent_name}
            </h3>
            <form className="form" onSubmit={handleAddTransaction}>
              <div className="form-group">
                <label className="label">التاريخ</label>
                <UnifiedDateField
                  value={txForm.date}
                  onChange={(date) => setTxForm({ ...txForm, date })}
                />
              </div>
              <div className="form-group">
                <label className="label">المبلغ</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <NumberInput
                      value={String(txForm.amount)}
                      onChange={(val) => setTxForm({ ...txForm, amount: Number(val) || 0 })}
                      min={0}
                      hideArrows
                    />
                  </div>
                  <div className="payment-type-selector" style={{ flexShrink: 0, padding: "4px" }}>
                    {(["IQD", "USD"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`payment-type-btn ${txCurrency === opt ? "payment-type-btn--active" : ""}`}
                        onClick={() => setTxCurrency(opt)}
                        style={{ padding: "8px 12px", fontSize: "var(--fs-xs)" }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="label">ملاحظة</label>
                <textarea
                  className="input"
                  value={txForm.notes}
                  onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                  placeholder="اختياري"
                  rows={2}
                  style={{ resize: "none", width: "100%" }}
                />
              </div>
              <div className="modal-dialog__actions" style={{ marginTop: "1.5rem" }}>
                <ActionButton type="button" variant="ghost" onClick={() => setShowTxModal(false)}>
                  إلغاء
                </ActionButton>
                <ActionButton type="submit" variant={txForm.type === "ايداع" ? "success" : "secondary"} disabled={saving}>
                  {saving ? "جاري الحفظ..." : "إضافة"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── تأكيد حذف المعاملة ── */}
      <ConfirmDialog
        open={!!deleteTxConfirm}
        title="تأكيد حذف المعاملة"
        message={<span>هل تريد حذف هذه المعاملة بقيمة ({deleteTxConfirm ? <PriceDisplay amount={deleteTxConfirm.amount} currency={deleteTxConfirm.currency} /> : ""})؟ لا يمكن التراجع عن هذا الإجراء.</span>}
        confirmLabel="نعم، احذف"
        cancelLabel="إلغاء"
        danger
        onConfirm={() => void handleDeleteTransaction()}
        onCancel={() => setDeleteTxConfirm(null)}
      />

      {/* ── تأكيد حذف الوكالة ── */}
      <ConfirmDialog
        open={!!deleteAgencyConfirm}
        title="تأكيد حذف الوكالة"
        message={`هل تريد حذف وكالة «${deleteAgencyConfirm?.old_agent_name || ""} → ${deleteAgencyConfirm?.new_agent_name || ""}» وكل معاملاتها؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="نعم، احذف"
        cancelLabel="إلغاء"
        danger
        loading={saving}
        onConfirm={() => void handleDeleteAgency()}
        onCancel={() => setDeleteAgencyConfirm(null)}
      />
    </div>
  );
}

```

---

## File: `src/components/ui/SelectMenu.tsx`

```tsx
"use client";

import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
} from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { motion } from "motion/react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../../lib/utils";

const SelectMenu = SelectPrimitive.Root;
SelectMenu.displayName = "SelectMenu";

const SelectMenuGroup = SelectPrimitive.Group;
SelectMenuGroup.displayName = "SelectMenuGroup";

const SelectMenuValue = SelectPrimitive.Value;
SelectMenuValue.displayName = "SelectMenuValue";

const SelectMenuTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "app-input-wrapper app-input-field group flex items-center gap-2 rounded-xl border px-4 py-2 text-xl font-bold",
        "bg-white/[0.03] backdrop-blur-xl w-full",
        "transition-all duration-300",
        "border-white/10",
        "data-[state=open]:border-[#d8a85a]/50 data-[state=open]:shadow-[0_0_0_3px_rgba(216,168,90,0.12),0_20px_50px_-15px_rgba(216,168,90,0.15)]",
        "focus:border-[#d8a85a]/50 focus:shadow-[0_0_0_3px_rgba(216,168,90,0.12),0_20px_50px_-15px_rgba(216,168,90,0.15)]",
        "focus-visible:outline-none",
        "disabled:opacity-48 disabled:pointer-events-none",
        "data-[placeholder]:text-white/35",
        "text-white",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          className={cn(
            "mr-auto h-4 w-4 shrink-0 text-text-muted",
            "transition-transform duration-250 ease-out",
            "group-data-[state=open]:rotate-180",
          )}
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectMenuTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectMenuContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-xl",
          "bg-[#0d0f14]/50 border border-white/10 backdrop-blur-2xl",
          "shadow-glow max-h-[350px] overflow-y-auto",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1 text-text-muted">
          <ChevronDown className="h-3 w-3 rotate-180" />
        </SelectPrimitive.ScrollUpButton>

        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <SelectPrimitive.Viewport
            className={cn(
              "p-1",
              position === "popper" &&
                "w-full min-w-[var(--radix-select-trigger-width)]",
            )}
          >
            {children}
          </SelectPrimitive.Viewport>
        </motion.div>

        <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1 text-text-muted">
          <ChevronDown className="h-3 w-3" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectMenuContent.displayName = SelectPrimitive.Content.displayName;

const SelectMenuItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-2 pl-8 pr-4 text-[1.1rem] font-bold text-right justify-end w-full",
        "text-text-secondary transition-colors duration-150",
        "data-[highlighted]:bg-gold/10 data-[highlighted]:text-text-primary",
        "data-[disabled]:opacity-48 data-[disabled]:pointer-events-none",
        "outline-none",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5 text-gold" />
        </SelectPrimitive.ItemIndicator>
      </span>

      <SelectPrimitive.ItemText asChild>
        <span className="w-full text-right">{children}</span>
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectMenuItem.displayName = SelectPrimitive.Item.displayName;

const SelectMenuSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-white/5", className)}
      {...props}
    />
  );
});
SelectMenuSeparator.displayName = SelectPrimitive.Separator.displayName;

const SelectMenuLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-xs font-bold text-text-muted", className)}
      {...props}
    />
  );
});
SelectMenuLabel.displayName = SelectPrimitive.Label.displayName;

export {
  SelectMenu,
  SelectMenuGroup,
  SelectMenuValue,
  SelectMenuTrigger,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
  SelectMenuLabel,
};

```

---

## File: `src/components/ui/TextInput.tsx`

```tsx
"use client";

import { type InputHTMLAttributes, forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface TextInputCustomProps {
  leadingIcon?: React.ElementType;
  trailingIcon?: React.ElementType;
  prefix?: string;
  suffix?: string;
  label?: string;
  containerClassName?: string;
  inputSize?: "sm" | "lg";
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & TextInputCustomProps;

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      className,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      prefix,
      suffix,
      label,
      id,
      placeholder,
      containerClassName,
      value,
      inputSize = "lg",
      ...props
    },
    ref,
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined && value !== "" && value !== null;
    const showFloating = isFocused || hasValue;

    return (
      <div className={cn("relative flex flex-col gap-1.5", containerClassName)}>
        {label && (
          <label
            htmlFor={id}
            className="app-input-label text-xs font-bold tracking-wide text-text-muted"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center w-full">
          {/* Glow الخلفية المحيطة — تدار بالكامل بالـ CSS لضمان انطفائها فور خروج التركيز */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
            <div
              className="input-glow absolute w-[500px] h-[500px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(216, 168, 90, 0.08), transparent 70%)",
              }}
            />
          </div>

          <div
            className={cn(
              "relative flex items-center gap-2 border px-4 py-2 w-full transition-all duration-300 border-white/10 bg-white/[0.03] backdrop-blur-xl",
              inputSize === "sm" ? "app-input-wrapper-sm px-3 py-1.5 rounded-xl" : "app-input-wrapper px-4 py-2.5 rounded-xl",
              props.disabled && "opacity-48 pointer-events-none",
            )}
          >
            {LeadingIcon && (
              <LeadingIcon
                className={cn("shrink-0 text-text-muted", inputSize === "sm" ? "h-4 w-4" : "h-5 w-5")}
                aria-hidden="true"
              />
            )}

            {prefix && (
              <span className="shrink-0 text-base font-medium text-text-muted">
                {prefix}
              </span>
            )}

            <input
              ref={ref}
              id={id}
              value={value}
              placeholder={showFloating || !label ? placeholder : undefined}
              onFocus={(e) => {
                setIsFocused(true);
                props.onFocus?.(e);
              }}
              onBlur={(e) => {
                setIsFocused(false);
                props.onBlur?.(e);
              }}
              className={cn(
                "w-full bg-transparent text-white outline-none placeholder:text-white/35 text-center",
                "file:mr-2 file:rounded-pill file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-bold file:text-text-secondary file:transition-colors hover:file:bg-white/20",
                inputSize === "sm" ? "app-input-field-sm text-sm font-semibold" : "app-input-field text-xl font-bold",
                className,
              )}
              {...props}
            />

            {suffix && (
              <span className="shrink-0 text-base font-medium text-text-muted">
                {suffix}
              </span>
            )}

            {TrailingIcon && (
              <TrailingIcon
                className={cn("shrink-0 text-text-muted", inputSize === "sm" ? "h-4 w-4" : "h-5 w-5")}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

TextInput.displayName = "TextInput";

export { TextInput };
export type { TextInputProps };

```

---

## File: `src/components/ui/StatCard.tsx`

```tsx
import React from "react";
import { cn } from "../../lib/utils";

interface StatCardProps {
  icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  iconBgColor?: string;
  iconColor?: string;
}

export function StatCard({
  icon: Icon,
  label,
  children,
  className,
  style,
  iconBgColor = "color-mix(in srgb, var(--smiles-bg), transparent 88%)",
  iconColor = "var(--smiles)",
}: StatCardProps) {
  return (
    <article
      className={cn("stat-card", className)}
      style={{
        position: "relative",
        cursor: "default",
        overflow: "hidden",
        transition: "none",
        transform: "none",
        ...style,
      } as React.CSSProperties}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <span style={{
          fontSize: "var(--fs-sm)",
          color: "var(--gray)",
          fontWeight: "var(--fw-bold)",
          letterSpacing: "0.04em",
        }}>
          {label}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: iconBgColor,
            border: `1px solid color-mix(in srgb, ${iconColor}, transparent 72%)`,
            color: iconColor,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 12px color-mix(in srgb, ${iconColor}, transparent 90%)`,
          }}
        >
          <Icon size={18} strokeWidth={2.2} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {children}
      </div>
    </article>
  );
}

```

---

## File: `src/components/ui/ActionButton.tsx`

```tsx
"use client";

import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "../../lib/utils";

type ActionButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

interface ActionButtonCustomProps {
  leadingIcon?: React.ElementType;
  trailingIcon?: React.ElementType;
  variant?: ActionButtonVariant;
  iconOnly?: boolean;
}

type ActionButtonProps = Omit<HTMLMotionProps<"button">, "ref"> &
  ActionButtonCustomProps &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled" | "form"> & {
    children?: ReactNode;
  };

const variantStyles: Record<ActionButtonVariant, string> = {
  primary: "act-btn--primary",
  secondary: "act-btn--secondary",
  ghost: "act-btn--ghost",
  danger: "act-btn--danger",
  success: "act-btn--success",
};

const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      className,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      variant = "primary",
      iconOnly = false,
      children,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    return (
      <motion.button
        ref={ref}
        disabled={disabled}
        whileHover={disabled ? undefined : { scale: 1.03, filter: "brightness(1.08)" }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 24,
          mass: 0.5,
        }}
        className={cn(
          "act-btn",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-page",
          variantStyles[variant],
          iconOnly && "!p-2.5",
          className,
        )}
        {...props}
      >
        {LeadingIcon && (
          <LeadingIcon
            className={cn("shrink-0", iconOnly ? "h-5 w-5" : "h-4 w-4")}
            aria-hidden="true"
          />
        )}
        {!iconOnly && children && <span>{children}</span>}
        {TrailingIcon && !iconOnly && (
          <TrailingIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </motion.button>
    );
  },
);

ActionButton.displayName = "ActionButton";

export { ActionButton };
export type { ActionButtonProps, ActionButtonVariant };

```

---

## File: `src/components/ui/PriceInput.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NumericFormat } from "react-number-format";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { toEnglishDigits } from "../../utils/numberInput";

type Currency = "USD" | "IQD";

interface PriceInputProps {
  value: string;
  onChange: (value: string) => void;
  currency?: Currency;
  onCurrencyChange?: (currency: Currency) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
  min?: number;
  required?: boolean;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}

const currencyConfig = {
  USD: {
    symbol: "USD",
    decimalScale: 2 as const,
    color: "#10b981",
  },
  IQD: {
    symbol: "IQ",
    decimalScale: 0 as const,
    color: "#f59e0b",
  },
};

export function PriceInput({
  value,
  onChange,
  currency: externalCurrency,
  onCurrencyChange,
  id,
  label,
  placeholder = "0",
  disabled = false,
  className,
  containerClassName,
  min = 0,
  required = false,
  tabIndex,
  onKeyDown: externalOnKeyDown,
  onBlur: externalOnBlur,
}: PriceInputProps) {
  const [internalCurrency, setInternalCurrency] = useState<Currency>("IQD");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // مرجع للاحتفاظ بآخر قيمة رقمية مدخلة لمنع مشاكل الـ Async ومشاكل الأسهم
  const latestFloatValue = useRef<number | undefined>(parseFloat(value) || 0);

  // تحويل الأرقام العربية إلى إنجليزية قبل معالجة NumericFormat
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const handler = (e: InputEvent) => {
      if (!e.data) return;
      if (/[\u0660-\u0669\u06f0-\u06f9]/.test(e.data)) {
        e.preventDefault();

        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const normalized = toEnglishDigits(e.data);

        const newValue = el.value.slice(0, start) + normalized + el.value.slice(end);

        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        )?.set;
        nativeSetter?.call(el, newValue);

        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };

    el.addEventListener("beforeinput", handler);
    return () => el.removeEventListener("beforeinput", handler);
  }, []);

  const currency = externalCurrency ?? internalCurrency;
  const config = currencyConfig[currency];

  const setCurrency = useCallback(
    (c: Currency) => {
      if (externalCurrency === undefined) {
        setInternalCurrency(c);
      }
      onCurrencyChange?.(c);
    },
    [externalCurrency, onCurrencyChange],
  );

  const toggleCurrency = (e: React.MouseEvent) => {
    e.preventDefault();
    const next = currency === "USD" ? "IQD" : "USD";
    setCurrency(next);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
  };

  const handleValueChange = (vals: { value: string; floatValue: number | undefined }) => {
    latestFloatValue.current = vals.floatValue;
    onChange(vals.value);
  };

  // معالجة حركة الأسهم الآمنة تماماً بدون تعليق المتصفح
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentVal = latestFloatValue.current || 0;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentVal === 0) {
        onChange("1000");
      } else {
        onChange(String(currentVal * 1000));
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentVal > 0) {
        const nextVal = Math.floor(currentVal / 1000);
        onChange(nextVal <= 0 ? "" : String(nextVal));
      }
    }
    externalOnKeyDown?.(e);
  };

  const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).select();
  };

  return (
    <div className={cn("relative flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label
          htmlFor={id}
          className="app-input-label text-xs font-bold tracking-wide text-text-muted text-right block w-full"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center w-full">
        {/* Glow الخلفية المحيطة — تدار بالكامل بالـ CSS لضمان انطفائها فور خروج التركيز */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
          <div
            className="input-glow absolute w-[500px] h-[500px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(216, 168, 90, 0.08), transparent 70%)",
            }}
          />
        </div>

        <div
          className={cn(
            "app-input-wrapper relative flex items-stretch w-full rounded-xl border overflow-hidden",
            "bg-white/[0.03] backdrop-blur-xl",
            "transition-all duration-300",
            "border-white/10",
            disabled && "opacity-48 pointer-events-none",
            className,
          )}
        >
          {/* زر العملة الأنحف والأرفع w-12 */}
          <button
            type="button"
            onClick={toggleCurrency}
            disabled={disabled}
            className="relative flex items-center justify-center w-14 h-auto min-h-[40px] cursor-pointer select-none border-l border-white/10 shrink-0 bg-transparent outline-none transition-colors"
            title={currency === "USD" ? "دولار أمريكي" : "دينار عراقي"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={currency}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="font-bold text-base pointer-events-none select-none inline-block"
                style={{ color: config.color }}
              >
                {config.symbol}
              </motion.span>
            </AnimatePresence>
          </button>

          {/* حقل إدخال الأرقام المصحح بالكامل */}
          <NumericFormat
            id={id}
            getInputRef={inputRef}
            value={value === "" ? "" : value}
            onValueChange={handleValueChange}
            thousandSeparator=","
            decimalScale={config.decimalScale}
            allowNegative={false}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            onBlur={() => {
              const currentVal = latestFloatValue.current;
              if (currentVal !== undefined && currentVal < min) {
                onChange(String(min));
              } else if ((value === "" || currentVal === undefined) && required) {
                onChange(String(min));
              }
              externalOnBlur?.();
            }}
            tabIndex={tabIndex}
            onKeyDown={handleKeyDown}
            onClick={handleInputClick}
            className="app-input-field w-full min-w-0 bg-transparent text-xl font-bold text-white placeholder:text-white/35 outline-none py-0 px-4 text-center flex-1"
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
}

export type { Currency, PriceInputProps };
```

---

## File: `src/components/ui/index.ts`

```ts
export { ActionButton } from "./ActionButton";
export type { ActionButtonProps, ActionButtonVariant } from "./ActionButton";

export { PriceInput } from "./PriceInput";
export type { Currency, PriceInputProps } from "./PriceInput";

export { TextInput } from "./TextInput";
export type { TextInputProps } from "./TextInput";

export { NumberInput } from "./NumberInput";
export type { NumberInputProps } from "./NumberInput";

export {
  SelectMenu,
  SelectMenuGroup,
  SelectMenuValue,
  SelectMenuTrigger,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
  SelectMenuLabel,
} from "./SelectMenu";

export { PriceDisplay } from "./PriceDisplay";
export { StatCard } from "./StatCard";

```

---

## File: `src/components/ui/PriceDisplay.tsx`

```tsx
import { formatNumber } from "../../utils/finance";

interface PriceDisplayProps {
  amount: number;
  currency?: string | null;
  noColor?: boolean;
}

export function PriceDisplay({ amount, currency, noColor }: PriceDisplayProps) {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = formatNumber(abs);
  const numColor = noColor ? "inherit" : isNegative ? "#f43f5e" : currency === "USD" ? "var(--usd-text-color, #10b981)" : "var(--iq-text-color, #d8a85a)";
  const symColor = numColor;
  const sign = isNegative ? "- " : "";

  if (currency === "USD") {
    return (
      <span style={{ color: numColor }} dir="ltr">
        {sign}{formatted} <span style={{ color: symColor }}>USD</span>
      </span>
    );
  }

  return (
    <span style={{ color: numColor }} dir="ltr">
      {sign}{formatted} <span style={{ color: symColor }}>IQ</span>
    </span>
  );
}

```

---

## File: `src/components/ui/NumberInput.tsx`

```tsx
"use client";

import {
  type InputHTMLAttributes,
  forwardRef,
  useCallback,
  useRef,
} from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface NumberInputCustomProps {
  leadingIcon?: React.ElementType;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  hideArrows?: boolean;
}

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "value"
> &
  NumberInputCustomProps & {
    value: string | number;
    onChange?: (value: string) => void;
    onValueChange?: (value: number) => void;
  };

function toNum(v: string | number): number {
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      leadingIcon: LeadingIcon,
      suffix,
      min = -Infinity,
      max = Infinity,
      step = 1,
      value,
      onChange,
      onValueChange,
      id,
      disabled = false,
      placeholder,
      required,
      hideArrows = false,
      ...props
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const numericValue = toNum(value);

    const clamp = useCallback(
      (v: number) => Math.min(Math.max(v, min), max),
      [min, max],
    );

    const commitValue = useCallback(
      (v: number) => {
        const clamped = clamp(v);
        if (clamped !== numericValue) {
          onChange?.(String(clamped));
          onValueChange?.(clamped);
        }
      },
      [clamp, numericValue, onChange, onValueChange],
    );

    const increment = useCallback(() => {
      commitValue(numericValue + step);
    }, [commitValue, numericValue, step]);

    const decrement = useCallback(() => {
      commitValue(numericValue - step);
    }, [commitValue, numericValue, step]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-") {
        e.preventDefault();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        increment();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        decrement();
      }
      props.onKeyDown?.(e);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      if (!/^-?\d*\.?\d*$/.test(pasted)) {
        e.preventDefault();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9.-]/g, "");
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        const clamped = clamp(parsed);
        if (clamped !== numericValue) {
          onValueChange?.(clamped);
          onChange?.(String(clamped));
        }
      } else if (raw === "" || raw === "-") {
        onValueChange?.(0);
        onChange?.("0");
      }
    };

    const spinButtonClass =
      "flex items-center justify-center px-2 py-1 text-text-muted transition-colors duration-150 hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none";

    return (
      <div className="relative flex items-center">
        {/* Glow الخلفية المحيطة — تدار بالكامل بالـ CSS لضمان انطفائها فور خروج التركيز */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
          <div
            className="input-glow absolute w-[500px] h-[500px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(216, 168, 90, 0.08), transparent 70%)",
            }}
          />
        </div>

        <div
          className={cn(
            "app-input-wrapper flex items-center gap-2 rounded-xl border px-4 py-2 number-input-wrapper",
            "bg-white/[0.03] backdrop-blur-xl",
            "transition-all duration-300",
            "border-white/10",
            disabled && "opacity-48 pointer-events-none",
          )}
        >
          {LeadingIcon && (
            <LeadingIcon
              className="h-5 w-5 shrink-0 text-text-muted"
              aria-hidden="true"
            />
          )}

          <input
            ref={(node) => {
              inputRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            id={id}
            type="text"
            inputMode="decimal"
            value={value}
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            dir="ltr"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={(e) => {
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              props.onBlur?.(e);
            }}
            className={cn(
              "app-input-field w-20 bg-transparent text-center text-xl font-bold tabular-nums text-white outline-none",
              "placeholder:text-white/35",
              className,
            )}
            {...props}
          />

          {suffix && (
            <span className="shrink-0 text-sm font-semibold text-text-muted">
              {suffix}
            </span>
          )}

          {!hideArrows && (
            <div className="flex flex-col -mr-1">
              <button
                type="button"
                tabIndex={-1}
                disabled={disabled || numericValue >= max}
                onClick={increment}
                className={cn(spinButtonClass, "rounded-t-sm")}
                aria-label="Increase value"
              >
                <ChevronUp className="h-4 w-4" />
              </button>

              <div className="h-px bg-white/5" />

              <button
                type="button"
                tabIndex={-1}
                disabled={disabled || numericValue <= min}
                onClick={decrement}
                className={cn(spinButtonClass, "rounded-b-sm")}
                aria-label="Decrease value"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  },
);

NumberInput.displayName = "NumberInput";

export { NumberInput };
export type { NumberInputProps };

```

---

## File: `src/theme/colors.ts`

```ts
export const colors = {
  background: "#0d0f14",
  surface: "rgba(16, 24, 39, 0.54)",
  surfaceSolid: "#101827",
  input: "rgba(13, 15, 20, 0.58)",
  subtle: "rgba(255, 255, 255, 0.055)",
  border: "rgba(255, 255, 255, 0.10)",
  borderLight: "rgba(255, 255, 255, 0.065)",
  text: {
    primary: "#ffffff",
    secondary: "#dde3ec",
    muted: "#aab4c8",
  },
  primary: {
    DEFAULT: "#61030b",
    dark: "#3d0207",
    deeper: "#100306",
  },
  gold: {
    DEFAULT: "#d8a85a",
    light: "#ffe0a3",
    pale: "rgba(216, 168, 90, 0.13)",
  },
  brand: {
    green: "#1a5c38",
    greenSoft: "#22c55e",
    red: "#61030b",
    redSoft: "#8b0713",
    wine: "#100306",
    black: "#090b10",
    slate: "#141c1a",
  },
  status: {
    green: "#55f5aa",
    greenBg: "rgba(85, 245, 170, 0.12)",
    red: "#ff6b6b",
    redBg: "rgba(255, 59, 59, 0.13)",
    amber: "#ffd27b",
    amberBg: "rgba(216, 168, 90, 0.13)",
    blue: "#22c55e",
    blueBg: "rgba(34, 197, 94, 0.16)",
    slate: "#aab4c8",
    slateBg: "rgba(170, 180, 200, 0.10)",
  },
  car: {
    cash: "#059669",
    delivery: "#7c3aed",
    installment: "#9b6f00",
    delete: "#ef4444",
  },
  partner: {
    sharik: "#006241",
    mumuol: "#3B82F6",
    moqtarid: "#F59E0B",
    mustathmir: "#8B5CF6",
  },
  glass: {
    blur: "20px",
    saturation: "180%",
  },
} as const;

export type ThemeColor = keyof typeof colors;

```

---

## File: `src/theme/shadows.ts`

```ts
export const shadows = {
  soft: "0 18px 54px rgba(0, 0, 0, 0.18), inset 0 1px 1px rgba(255,255,255,0.10)",
  glass: "0 24px 80px rgba(0, 0, 0, 0.24), 0 0 44px rgba(97, 3, 11, 0.055), inset 0 1px 1px rgba(255,255,255,0.10)",
  glow: "0 34px 110px rgba(0, 0, 0, 0.34), inset 0 1px 1px rgba(255,255,255,0.12)",
  focus: "0 0 0 3px rgba(216, 168, 90, 0.20), 0 0 20px rgba(216, 168, 90, 0.10)",
} as const;

```

---

## File: `src/theme/index.ts`

```ts
export { colors } from "./colors";
export type { ThemeColor } from "./colors";

export { typography } from "./typography";

export { spacing } from "./spacing";

export { shadows } from "./shadows";

```

---

## File: `src/theme/typography.ts`

```ts
const BASE_FONT_SIZE = 1.3; // rem — يطابق --font-size: 1.3rem في colors.css

export const typography = {
  fontFamily: {
    sans: ["Cairo", "Tajawal", "IBM Plex Sans Arabic", "Segoe UI", "system-ui", "sans-serif"],
    mono: "Tajawal",
  },
  fontWeight: {
    normal: 400,
    medium: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
  fontSize: {
    xs: `${BASE_FONT_SIZE * 0.78}rem`,
    sm: `${BASE_FONT_SIZE * 0.88}rem`,
    base: `${BASE_FONT_SIZE}rem`,
    md: `${BASE_FONT_SIZE * 1.1}rem`,
    lg: `${BASE_FONT_SIZE * 1.29}rem`,
    xl: `${BASE_FONT_SIZE * 1.57}rem`,
    xxl: `${BASE_FONT_SIZE * 2.1}rem`,
  },
  lineHeight: {
    relaxed: 1.65,
  },
} as const;

```

---

## File: `src/theme/spacing.ts`

```ts
export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  "2xl": "32px",
  "3xl": "48px",
  radius: {
    DEFAULT: "12px",
    xs: "8px",
    sm: "12px",
    md: "16px",
    lg: "20px",
    pill: "999px",
  },
  input: {
    height: "42px",
    heightSm: "42px",
  },
} as const;

```

---

## File: `src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

```

---

## File: `src/api/tauri.ts`

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Car, CarFormState, CashRegisterEntry, ExpenseEntry, CarExpenseRecord, Partner, PartnerTransaction, CarPartner } from "../types";

const isTauri = () =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || import.meta.env.TAURI_ENV_PLATFORM != null);

function generateMockTxId(): number {
  return parseInt(crypto.randomUUID().replace(/-/g, "").slice(0, 12), 16);
}

function mockStorageKey(command: string): string {
  if (command.includes("car")) return "mock_cars";
  if (command.includes("partner")) return "mock_partners";
  if (command.includes("expense")) return "mock_expenses";
  return "mock_default";
}

function parseCommissionAmount(amount: number, notes: string | null | undefined): number {
  if (!notes) return 0;
  const parts = notes.split("عمولة:");
  if (parts.length > 1) {
    if (parts[1].includes("%")) {
      const percentPart = parts[1].split("%")[0];
      const pct = parseFloat(percentPart.trim());
      if (!isNaN(pct)) return (amount * pct) / 100;
    } else {
      const commissionVal = parseFloat(parts[1].trim());
      if (!isNaN(commissionVal)) return commissionVal;
    }
  }
  return 0;
}

function mapMockCar(args: Record<string, unknown>): Car {
  const status = (args.status as Car["status"]) ?? "متوفرة";
  const paymentType = (args.payment_type ?? args.paymentType) as Car["payment_type"] | undefined;
  const plateNum = String(args.num ?? "").trim();
  const province = String(args.province ?? "").trim();
  // المفتاح الأساسي = رقم اللوحة + المحافظة
  const carNumber = province ? `${plateNum} ${province}` : plateNum;
  return {
    car_number: carNumber,
    car_plate_num: plateNum,
    car_province: province,
    chassis_number: String(args.chassis ?? "") || null,
    car_model: String(args.model ?? ""),
    car_year: String(args.year ?? ""),
    car_name: String(args.name ?? ""),
    color: String(args.color ?? ""),
    details: String(args.details ?? ""),
    purchase_price: Number(args.purchase) || 0,
    selling_price: Number(args.selling) || 0,
    status,
    payment_type: status === "مبيوعة" ? paymentType ?? "كاش" : undefined,
    cash_price: status === "مبيوعة" && (paymentType === "كاش" || paymentType === "موعد") ? Number(args.cash_price ?? args.cashPrice ?? args.amountPaid ?? args.amount_paid) || 0 : 0,
    amount_paid: status === "مبيوعة" ? Number(args.amount_paid ?? args.amountPaid) || 0 : 0,
    amount_remaining: Number(args.amount_remaining ?? args.amountRemaining) || 0,
    installment_months: Number(args.installment_months ?? args.installmentMonths) || 0,
    monthly_payment: Number(args.monthly_payment ?? args.monthlyPayment) || 0,
    buyer_name: String(args.buyer_name ?? args.buyerName ?? "") || null,
    buyer_phone: String(args.buyer_phone ?? args.buyerPhone ?? args.phone ?? "") || null,
    purchase_date: String(args.purchase_date ?? args.purchaseDate ?? "") || null,
    sale_date: String(args.sale_date ?? args.saleDate ?? "") || null,
    delivery_date: String(args.delivery_date ?? args.deliveryDate ?? "") || null,
    first_payment_date: String(args.first_payment_date ?? args.firstPaymentDate ?? "") || null,
    currency: (args.currency as Car["currency"]) || null,
    sale_currency: ((args.sale_currency ?? args.saleCurrency) as Car["sale_currency"]) || null,
    purchase_payment_type: ((args.purchase_payment_type ?? args.purchasePaymentType) as string) || null,
    purchase_type: ((args.purchase_type ?? args.purchaseType) as string) === "دين" ? "تمويل" : (((args.purchase_type ?? args.purchaseType) as string) || "كاش"),
    financer_name: ((args.financer_name ?? args.financerName) as string) || null,
    commission_type: ((args.commission_type ?? args.commissionType) as string) || null,
    commission_value: Number(args.commission_value ?? args.commissionValue) || 0,
    car_partners: (args.car_partners ?? args.carPartners ?? null) as CarPartner[] | null,
    purchase_time: ((args.purchase_time ?? args.purchaseTime) as string) || null,
    sale_time: ((args.sale_time ?? args.saleTime) as string) || null,
  };
}

function recalculateMockPartnerTotal(partnerName: string, kind: string) {
  const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
  const txns = allTx.filter((tx) => tx.partner_name === partnerName && tx.kind === kind);
  const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
  const pIdx = partners.findIndex((p) => p.partner_name === partnerName && p.kind === kind);
  if (pIdx < 0) return;

  partners[pIdx].total_amount = txns.reduce((total, tx) => {
    if (kind === "مطلوب") {
      if (tx.notes?.includes("دفعة أولى") || tx.notes?.includes("قسط") || tx.notes?.includes("مؤجل")) {
        return total;
      }
      // سحب / سحب مصروف / سحب ارباح → يضيف للرصيد (أعطيناهم)
      if (tx.type_.startsWith("سحب")) return total + tx.amount;
      // ايداع / ايداع ارباح → يطرح من الرصيد (أخذنا منهم)
      if (tx.type_.startsWith("ايداع")) return total - tx.amount;
    } else {
      if (tx.type_.startsWith("ايداع")) return total + tx.amount;
      if (tx.type_.startsWith("سحب")) return total - tx.amount;
    }
    return total;
  }, 0);
  localStorage.setItem("mock_partners", JSON.stringify(partners));
}

async function mockInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const key = mockStorageKey(command);

  if (command === "get_cars") {
    const raw = localStorage.getItem(key);
    const cars: Car[] = raw ? JSON.parse(raw) : [];
    const allExpenses: CarExpenseRecord[] = JSON.parse(localStorage.getItem("mock_car_expenses") ?? "[]");
    // تراجع: السيارات القديمة بدون حقول العملة → افتراضي IQD
    for (const car of cars) {
      if (car.currency !== "USD" && car.currency !== "IQD") {
        car.currency = "IQD";
      }
      if (!car.sale_currency || (car.sale_currency !== "USD" && car.sale_currency !== "IQD")) {
        car.sale_currency = "IQD";
      }
      const carExpenses = allExpenses.filter((e) => e.car_number === car.car_number);
      car.expenses_sum = carExpenses.reduce((sum, e) => sum + e.amount, 0);
    }
    return cars as unknown as T;
  }

  if (command === "add_car") {
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const plateNum = String(args.num ?? "").trim();
    const province = String(args.province ?? "").trim();
    const carNumber = province ? `${plateNum} ${province}` : plateNum;
    const oldCar = existing.find((c) => c.car_number === carNumber);

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hh}:${mm}`;

    const purchase_time = args.purchase_time ?? args.purchaseTime ?? oldCar?.purchase_time ?? (args.purchase_date || args.purchaseDate ? currentTime : null);
    const sale_time = args.sale_time ?? args.saleTime ?? oldCar?.sale_time ?? (args.sale_date || args.saleDate ? currentTime : null);

    const item = {
      ...mapMockCar(args),
      purchase_time: purchase_time ? String(purchase_time) : null,
      sale_time: sale_time ? String(sale_time) : null,
    };
    const next = existing.filter((c) => c.car_number !== item.car_number);
    next.push(item);
    localStorage.setItem(key, JSON.stringify(next));
    return undefined as T;
  }

  if (command === "delete_car") {
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const target = String(args.num ?? "").trim();
    const next = existing.filter((c) => c.car_number.trim() !== target);
    localStorage.setItem(key, JSON.stringify(next));
    return undefined as T;
  }

  if (command === "get_partners") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const existingIdx = existing.findIndex((p) => p.partner_name === name && p.kind === kind);
    if (existingIdx >= 0) {
      existing[existingIdx] = { ...existing[existingIdx], phone: String(args.phone ?? "").trim(), kind };
    } else {
      existing.push({
        partner_name: name,
        phone: String(args.phone ?? "").trim(),
        total_amount: 0,
        total_withdrawals: 0,
        kind,
      });
    }
    localStorage.setItem(key, JSON.stringify(existing));
    return undefined as T;
  }

  if (command === "update_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const oldName = String(args.oldName ?? "").trim();
    const oldKind = String(args.oldKind ?? "شريك").trim();
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const idx = existing.findIndex((p) => p.partner_name === oldName && p.kind === oldKind);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], partner_name: name, phone: String(args.phone ?? "").trim(), kind };
      localStorage.setItem(key, JSON.stringify(existing));
      if (oldName !== name || oldKind !== kind) {
        const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
        localStorage.setItem(
          "mock_partner_transactions",
          JSON.stringify(
            allTx.map((tx) =>
              tx.partner_name === oldName && tx.kind === oldKind
                ? { ...tx, partner_name: name, kind }
                : tx,
            ),
          ),
        );
      }
    }
    return undefined as T;
  }

  if (command === "delete_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const next = existing.filter((p) => !(p.partner_name === name && p.kind === kind));
    localStorage.setItem(key, JSON.stringify(next));
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    localStorage.setItem(
      "mock_partner_transactions",
      JSON.stringify(allTx.filter((tx) => !(tx.partner_name === name && tx.kind === kind))),
    );
    return undefined as T;
  }

  if (command === "get_partner_transactions") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    return allTx.filter((tx) => tx.partner_name === partnerName && tx.kind === kind) as T;
  }

  if (command === "add_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const type = String(args.type ?? args.type_ ?? "");
    const notes = args.notes ? String(args.notes) : null;
    const isFinancierRepayment =
      (kind === "ممول" && type.startsWith("سحب")) ||
      (kind === "مطلوب" && type.startsWith("ايداع") && !!notes?.includes("ممول"));
    const paymentType = isFinancierRepayment
      ? "ممول"
      : ((args.payment_type ?? args.paymentType ?? "قاصه") as string);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const newTx: PartnerTransaction & { time?: string } = {
      id: generateMockTxId(),
      partner_name: partnerName,
      kind,
      type_: type,
      amount: Number(args.amount) || 0,
      date: String(args.date ?? ""),
      time: `${hh}:${mm}`,
      notes,
      currency: (args.currency as string) || null,
      paymentType,
      payment_type: paymentType,
    };
    allTx.push(newTx);
    localStorage.setItem("mock_partner_transactions", JSON.stringify(allTx));
    recalculateMockPartnerTotal(partnerName, kind);
    if (isFinancierRepayment && !args.skipAutoFinancierDistribution) {
      const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
      const sharePartners = partners.filter((p) => p.kind === "شريك");
      const commissionAmount = parseCommissionAmount(newTx.amount, newTx.notes);
      if (sharePartners.length > 0) {
        const partnerShare = newTx.amount / sharePartners.length;
        for (const partner of sharePartners) {
          await mockInvoke("add_partner_transaction", {
            partnerName: partner.partner_name,
            kind: "شريك",
            type: "سحب تسديد ممول",
            amount: partnerShare,
            date: newTx.date,
            notes: `حصة الشريك من تسديد الممول ${partnerName}`,
            currency: newTx.currency || "IQD",
            paymentType: "قاصه",
          });
        }
      }

      if (commissionAmount > 0) {
        const commissionShare = commissionAmount / sharePartners.length;
        for (const partner of sharePartners) {
          await mockInvoke("add_partner_transaction", {
            partnerName: partner.partner_name,
            kind: "شريك",
            type: "سحب عمولة",
            amount: commissionShare,
            date: newTx.date,
            notes: `حصة الشريك من عمولة تسديد الممول ${partnerName}`,
            currency: newTx.currency || "IQD",
            paymentType: "قاصه",
          });
        }
      }
    }
    return undefined as T;
  }

  if (command === "pay_financier_from_partners") {
    const financierName = String(args.financier_name ?? args.financierName ?? "").trim();
    const financierKind = String(args.financier_kind ?? args.financierKind ?? "ممول").trim();
    const amount = Number(args.amount) || 0;
    const date = String(args.date ?? "");
    const currency = (args.currency as string) || "IQD";
    const allPartners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const sharePartners = allPartners.filter((p) => p.kind === "شريك");

    const commissionAmount = Number(args.commission_amount ?? args.commissionAmount) || 0;

    await mockInvoke("add_partner_transaction", {
      partnerName: financierName,
      kind: financierKind,
      type: financierKind === "مطلوب" ? "ايداع" : "سحب",
      amount,
      date,
      notes: args.notes ? String(args.notes) : null,
      currency,
      paymentType: "ممول",
      skipAutoFinancierDistribution: true,
    });

    // Distribute the amount equally among partners
    if (sharePartners.length > 0) {
      const partnerShare = amount / sharePartners.length;
      for (const partner of sharePartners) {
        await mockInvoke("add_partner_transaction", {
          partnerName: partner.partner_name,
          kind: "شريك",
          type: "سحب تسديد ممول",
          amount: partnerShare,
          date,
          notes: `حصة الشريك من تسديد الممول ${financierName}`,
          currency,
          paymentType: "قاصه",
        });
      }
    }

    // Distribute commission as partner withdrawal only (no separate expense)
    if (commissionAmount > 0) {
      const commissionCurrency = (args.commission_currency ?? args.commissionCurrency ?? "IQD") as string;
      const commissionShare = commissionAmount / sharePartners.length;
      for (const partner of sharePartners) {
        await mockInvoke("add_partner_transaction", {
          partnerName: partner.partner_name,
          kind: "شريك",
          type: "سحب عمولة",
          amount: commissionShare,
          date,
          notes: `حصة الشريك من عمولة تسديد الممول ${financierName}`,
          currency: commissionCurrency,
          paymentType: "قاصه",
        });
      }
    }

    return undefined as T;
  }

  if (command === "update_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.id);
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const next = allTx.map((tx) =>
      tx.id === id
        ? {
            ...tx,
            type_: String(args.type ?? args.type_ ?? ""),
            amount: Number(args.amount) || 0,
            date: String(args.date ?? ""),
            notes: args.notes ? String(args.notes) : null,
            currency: (args.currency as string) || tx.currency || null,
            paymentType: (args.payment_type ?? args.paymentType ?? tx.paymentType ?? "قاصه") as string,
            payment_type: (args.payment_type ?? args.paymentType ?? tx.payment_type ?? "قاصه") as string,
          }
        : tx,
    );
    localStorage.setItem("mock_partner_transactions", JSON.stringify(next));
    recalculateMockPartnerTotal(partnerName, kind);
    return undefined as T;
  }

  if (command === "delete_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.id);
    const partnerName = String(args.partner_name ?? args.partnerName ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    localStorage.setItem(
      "mock_partner_transactions",
      JSON.stringify(allTx.filter((tx) => !(tx.id === id))),
    );
    recalculateMockPartnerTotal(partnerName, kind);
    return undefined as T;
  }

  if (command === "get_cash_register_entries") {
    const filterType = args.payment_type ? String(args.payment_type) : null;
    const isMumuol = filterType === "ممول";
    const allCars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
    const cars = isMumuol ? [] : (filterType
      ? (filterType === "قاصه" || filterType === "قاصة"
        ? allCars.filter((c) => c.purchase_payment_type === "قاصه" || c.purchase_payment_type === "قاصة" || !c.purchase_payment_type)
        : allCars.filter((c) => c.purchase_payment_type === filterType))
      : allCars);
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const entries: CashRegisterEntry[] = [];

    // شراء السيارات
    for (const c of cars) {
      if (c.purchase_date && c.purchase_price > 0) {
        entries.push({
          id: 0,
          date: c.purchase_date,
          time: c.purchase_time || "00:00",
          type_: "شراء سيارة",
          amount: -c.purchase_price,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null,
          balance: 0,
          currency: c.currency || "IQD",
        });
      }
    }

    // بيع السيارات كاش
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "كاش" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: c.sale_time || "00:00", type_: "بيع سيارة",
          amount: c.selling_price,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
          currency: c.sale_currency || "IQD",
        });
      }
    }

    // بيع السيارات آجل
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "موعد" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: c.sale_time || "00:00", type_: "بيع سيارة",
          amount: c.amount_paid ?? 0,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
          currency: c.sale_currency || "IQD",
        });
      }
    }

    // مقدمات السيارات بالتقسيط
    for (const c of cars) {
      if (c.status === "مبيوعة" && c.payment_type === "اقساط" && c.sale_date) {
        entries.push({
          id: 0, date: c.sale_date, time: c.sale_time || "00:00", type_: "بيع سيارة",
          amount: c.amount_paid ?? 0,
          description: `${c.car_name} - ${c.car_number}`,
          notes: null, balance: 0,
          currency: c.sale_currency || "IQD",
        });
      }
    }

    const includeOthers = filterType === null || filterType === "قاصه" || filterType === "قاصة" || isMumuol;

    if (includeOthers) {
      // معاملات الشركاء والمستثمرين (بدون ديون العملاء غير المدفوعة)
      for (const tx of allTx) {
        if (isMumuol) {
          if (tx.kind !== "ممول") continue;
        } else {
          if (tx.kind === "مطلوب" && tx.type_.startsWith("سحب")) continue;
          if (tx.type_.startsWith("سحب شراء سيارة") || tx.type_.startsWith("ايداع بيع سيارة") || tx.type_.startsWith("سحب مصروف")) {
            continue;
          }
          if (filterType) {
            const isQasa = filterType === "قاصه" || filterType === "قاصة";
            const txPaymentType = tx.paymentType || tx.payment_type || "قاصه";
            const isTxQasa = txPaymentType === "قاصه" || txPaymentType === "قاصة";
            if (isQasa) {
              if (!isTxQasa) continue;
            } else {
              if (txPaymentType !== filterType) continue;
            }
          }
        }
        let type_: string;
        let amount: number;
        switch (tx.kind) {
          case "شريك":
            type_ = tx.type_.startsWith("ايداع") ? "ايداع شريك" : "سحب شريك";
            amount = tx.type_.startsWith("ايداع") ? tx.amount : -tx.amount;
            break;
          case "مستثمر":
            type_ = tx.type_.startsWith("ايداع") ? "ايداع مستثمر" : "سحب مستثمر";
            amount = tx.type_.startsWith("ايداع") ? tx.amount : -tx.amount;
            break;
          case "مطلوب":
            type_ = "تسديد دين";
            amount = tx.amount;
            break;
          case "ممول":
            if (tx.type_.startsWith("ايداع")) {
              if (isMumuol) {
                type_ = "ايداع ممول";
                amount = tx.amount;
              } else {
                type_ = "";
                amount = 0;
              }
            } else {
              type_ = "سحب ممول";
              if (isMumuol) {
                amount = -tx.amount;
              } else {
                const comm = parseCommissionAmount(tx.amount, tx.notes);
                amount = -(tx.amount + comm);
              }
            }
            break;
          case "مقترض":
            type_ = tx.type_.startsWith("ايداع") ? "ايداع مقترض" : "سحب مقترض";
            amount = tx.type_.startsWith("ايداع") ? tx.amount : -tx.amount;
            break;
          default:
            type_ = `${tx.kind} ${tx.type_}`;
            amount = tx.type_.startsWith("ايداع") ? tx.amount : -tx.amount;
        }
        if (!type_) continue;
        entries.push({
          id: 0, date: tx.date, time: tx.time ?? "00:00", type_, amount,
          description: tx.partner_name,
          notes: tx.notes, balance: 0,
          currency: tx.currency || "IQD",
        });
      }

      // المصروفات
      if (!isMumuol) {
        const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");
        for (const e of expenses) {
          entries.push({
            id: 0, date: e.date, time: e.time, type_: "مصروف",
            amount: -e.amount,
            description: e.description,
            notes: e.notes, balance: 0,
            currency: e.currency || "IQD",
          });
        }
      }
    }

    // ترتيب حسب التاريخ ثم الوقت (من الأقدم للأحدث)
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    let iqdRunning = 0;
    let usdRunning = 0;
    for (const e of entries) {
      const curr = e.currency === "USD" ? "USD" : "IQD";
      if (curr === "USD") {
        usdRunning += e.amount;
        e.balance = usdRunning;
      } else {
        iqdRunning += e.amount;
        e.balance = iqdRunning;
      }
    }

    entries.forEach((e, i) => { e.id = i + 1; });

    return entries as T;
  }

  if (command === "get_expenses") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_expense") {
    const carNumber = args.carNumber ?? args.car_number ?? null;
    if (carNumber) {
      // مصروف سيارة: يُسجل في car_expenses ويُحدّث سحب شراء السيارة
      const carKey = "mock_car_expenses";
      const existing: CarExpenseRecord[] = JSON.parse(localStorage.getItem(carKey) ?? "[]");
      const record: CarExpenseRecord = {
        id: generateMockTxId(),
        car_number: String(carNumber),
        description: String(args.description ?? ""),
        amount: Number(args.amount) || 0,
        date: String(args.date ?? ""),
        currency: (args.currency as string) || null,
      };
      existing.push(record);
      localStorage.setItem(carKey, JSON.stringify(existing));
    } else {
      // مصروف عام
      const existing: ExpenseEntry[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const newExpense: ExpenseEntry = {
        id: generateMockTxId(),
        description: String(args.description ?? ""),
        amount: Number(args.amount) || 0,
        date: String(args.date ?? ""),
        time: `${hh}:${mm}`,
        notes: args.notes ? String(args.notes) : null,
        currency: (args.currency as string) || null,
      };
      existing.push(newExpense);
      localStorage.setItem(key, JSON.stringify(existing));
    }
    return undefined as T;
  }

  if (command === "delete_expense") {
    const existing: ExpenseEntry[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const id = Number(args.id);
    localStorage.setItem(key, JSON.stringify(existing.filter((e) => e.id !== id)));
    return undefined as T;
  }

  if (command === "add_car_expense_record") {
    const carKey = "mock_car_expenses";
    const existing: CarExpenseRecord[] = JSON.parse(localStorage.getItem(carKey) ?? "[]");
    const carNumber = String(args.carNumber ?? args.car_number ?? "");
    const record: CarExpenseRecord = {
      id: generateMockTxId(),
      car_number: carNumber,
      description: String(args.description ?? ""),
      amount: Number(args.amount) || 0,
      date: String(args.date ?? ""),
      currency: (args.currency as string) || null,
    };
    existing.push(record);
    localStorage.setItem(carKey, JSON.stringify(existing));
    return record.id as T;
  }

  if (command === "get_car_expense_records") {
    const carKey = "mock_car_expenses";
    const carNumber = String(args.carNumber ?? args.car_number ?? "");
    const all: CarExpenseRecord[] = JSON.parse(localStorage.getItem(carKey) ?? "[]");
    return all.filter((r) => r.car_number === carNumber) as T;
  }

  if (command === "delete_car_expense_record") {
    const carKey = "mock_car_expenses";
    const existing: CarExpenseRecord[] = JSON.parse(localStorage.getItem(carKey) ?? "[]");
    const id = Number(args.id);
    localStorage.setItem(carKey, JSON.stringify(existing.filter((r) => r.id !== id)));
    return undefined as T;
  }

  if (command === "get_financial_summary") {
    const filterType = args.payment_type ? String(args.payment_type) : null;
    const cars: Car[] = JSON.parse(localStorage.getItem("mock_cars") ?? "[]");
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const expenses: ExpenseEntry[] = JSON.parse(localStorage.getItem("mock_expenses") ?? "[]");

    const filteredCars = filterType
      ? cars.filter((c) => c.purchase_payment_type === filterType)
      : cars;

    let iqdBalance = 0;
    let usdBalance = 0;

    // شراء السيارات
    for (const c of filteredCars) {
      if (c.purchase_date && c.purchase_price > 0) {
        if (c.currency === "USD") usdBalance -= c.purchase_price;
        else iqdBalance -= c.purchase_price;
      }
    }

    // بيع السيارات
    for (const c of filteredCars) {
      if (c.status === "مبيوعة" && c.sale_date) {
        const amount = c.payment_type === "كاش" ? c.selling_price : (c.amount_paid ?? 0);
        const curr = c.sale_currency === "USD" ? "USD" : "IQD";
        if (curr === "USD") usdBalance += amount;
        else iqdBalance += amount;
      }
    }

    // معاملات الشركاء والمستثمرين
    for (const tx of allTx) {
      if (tx.kind === "مطلوب" && tx.type_.startsWith("سحب")) continue;
      if (tx.type_.startsWith("سحب شراء سيارة") || tx.type_.startsWith("ايداع بيع سيارة") || tx.type_.startsWith("سحب مصروف")) {
        continue;
      }
      let signed = 0;
      if ((tx.kind === "شريك" || tx.kind === "مستثمر" || tx.kind === "مقترض") && tx.type_.startsWith("ايداع")) signed = tx.amount;
      else if (tx.kind === "شريك" && tx.type_.startsWith("سحب")) signed = -tx.amount;
      else if (tx.kind === "مستثمر" && tx.type_.startsWith("سحب")) signed = -tx.amount;
      else if (tx.kind === "مقترض" && tx.type_.startsWith("سحب")) signed = -tx.amount;
      else if (tx.kind === "ممول" && tx.type_.startsWith("سحب")) {
        const comm = parseCommissionAmount(tx.amount, tx.notes);
        signed = -(tx.amount + comm);
      }
      else if (tx.kind === "مطلوب" && tx.type_.startsWith("ايداع")) signed = tx.amount;
      const curr = tx.currency === "USD" ? "USD" : "IQD";
      if (curr === "USD") usdBalance += signed;
      else iqdBalance += signed;
    }

    // المصروفات
    for (const e of expenses) {
      if (e.currency === "USD") usdBalance -= e.amount;
      else iqdBalance -= e.amount;
    }

    const inventoryValue = filteredCars
      .filter((c) => c.status === "متوفرة")
      .reduce((sum, c) => sum + c.purchase_price, 0);

    const totalInvestments = partners
      .filter((p) => p.kind === "مستثمر" && p.total_amount > 0)
      .reduce((sum, p) => sum + p.total_amount, 0);

    const totalPartnerCapital = partners
      .filter((p) => p.kind === "شريك")
      .reduce((sum, p) => sum + p.total_amount, 0);

    const totalDebtors = partners
      .filter((p) => p.kind === "مطلوب" && p.total_amount > 0)
      .reduce((sum, p) => sum + p.total_amount, 0);

    const totalBorrowers = partners
      .filter((p) => p.kind === "مقترض" && p.total_amount < 0)
      .reduce((sum, p) => sum + p.total_amount, 0);

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const netCapital = iqdBalance + inventoryValue + totalDebtors - totalInvestments - totalBorrowers;

    return {
      iqd_balance: iqdBalance,
      usd_balance: usdBalance,
      inventory_value: inventoryValue,
      total_investments: totalInvestments,
      total_partner_capital: totalPartnerCapital,
      total_debtors: totalDebtors,
      total_expenses: totalExpenses,
      net_capital: netCapital,
    } as T;
  }

  if (command === "get_partners_totals") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const kind = String(args.kind ?? "شريك").trim();
    let iqd_total = 0;
    let usd_total = 0;
    const partnerTx = allTx.filter((tx) => {
      if (kind === "partners-financial") {
        return tx.kind === "شريك" || tx.kind === "مستثمر" || tx.kind === "ممول" || tx.kind === "مقترض";
      }
      return tx.kind === kind;
    });
    for (const tx of partnerTx) {
      const isUsd = tx.currency === "USD";
      let amount = 0;
      if (tx.kind === "ممول") {
        amount = tx.type_.startsWith("ايداع") ? -tx.amount : tx.type_.startsWith("سحب") ? tx.amount : 0;
      } else if (tx.kind === "مطلب" || tx.kind === "مطلوب") {
        if (tx.notes?.includes("دفعة أولى") || tx.notes?.includes("قسط") || tx.notes?.includes("مؤجل")) {
          continue;
        }
        amount = tx.type_.startsWith("سحب") ? tx.amount : tx.type_.startsWith("ايداع") ? -tx.amount : 0;
      } else {
        amount = tx.type_.startsWith("ايداع") ? tx.amount : tx.type_.startsWith("سحب") ? -tx.amount : 0;
      }
      if (isUsd) usd_total += amount;
      else iqd_total += amount;
    }
    return [iqd_total, usd_total] as unknown as T;
  }

  if (command === "get_unified_accounts") {
    const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const debtors = partners.filter((p) => p.kind === "مطلوب");
    
    return debtors.map((p) => {
      const txns = allTx.filter((tx) => tx.partner_name === p.partner_name && tx.kind === "مطلوب");
      let iqd_balance = 0;
      let usd_balance = 0;
      for (const tx of txns) {
        const isUsd = tx.currency === "USD";
        let signed = 0;
        // سحب / سحب مصروف / سحب ارباح → يضيف للرصيد (أعطيناهم)
        if (tx.type_.startsWith("سحب")) {
          signed = tx.amount;
        // ايداع / ايداع ارباح → يطرح من الرصيد (أخذنا منهم) - مع استثناء حركات التقسيط
        } else if (tx.type_.startsWith("ايداع")) {
          if (tx.notes?.includes("دفعة أولى") || tx.notes?.includes("قسط") || tx.notes?.includes("مؤجل")) {
            continue;
          }
          signed = -tx.amount;
        }
        if (isUsd) {
          usd_balance += signed;
        } else {
          iqd_balance += signed;
        }
      }
      return {
        partner_name: p.partner_name,
        phone: p.phone,
        iqd_balance,
        usd_balance,
      };
    }) as unknown as T;
  }

  if (command === "get_agencies") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_agency") {
    const existing: any[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const item = {
      id: Date.now(),
      old_agent_name: String(args.old_agent_name ?? "").trim(),
      car_number: String(args.car_number ?? "").trim(),
      car_model: String(args.car_model ?? "").trim(),
      color: String(args.color ?? "").trim(),
      new_agent_name: String(args.new_agent_name ?? "").trim(),
      phone: String(args.phone ?? "").trim(),
      amount_usd: Number(args.amount_usd) || 0,
      amount_iqd: Number(args.amount_iqd) || 0,
      notes: String(args.notes ?? "").trim(),
      date: `${y}-${m}-${d}`,
      time: `${hh}:${mm}`,
    };
    const idx = existing.findIndex((a: any) => a.id === item.id);
    if (idx >= 0) {
      existing[idx] = item;
    } else {
      existing.push(item);
    }
    localStorage.setItem(key, JSON.stringify(existing));
    return undefined as T;
  }

  if (command === "delete_agency") {
    const existing: any[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const targetId = Number(args.id) || 0;
    const next = existing.filter((a: any) => a.id !== targetId);
    localStorage.setItem(key, JSON.stringify(next));
    const txKey = "mock_agency_transactions";
    const allTx: any[] = JSON.parse(localStorage.getItem(txKey) ?? "[]");
    localStorage.setItem(txKey, JSON.stringify(allTx.filter((t: any) => t.agency_id !== targetId)));
    return undefined as T;
  }

  if (command === "get_agency_transactions") {
    const agencyId = Number(args.agency_id) || 0;
    const raw = localStorage.getItem(key);
    const all: any[] = raw ? JSON.parse(raw) : [];
    return all.filter((t: any) => t.agency_id === agencyId) as T;
  }

  if (command === "add_agency_transaction") {
    const allTx: any[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    allTx.push({
      id: Date.now(),
      agency_id: Number(args.agency_id) || 0,
      date: String(args.date ?? ""),
      time: String(args.time ?? `${hh}:${mm}`),
      type_: String(args.type_ ?? "ايداع"),
      amount: Number(args.amount) || 0,
      currency: String(args.currency ?? "IQD"),
      notes: args.notes ? String(args.notes) : null,
    });
    localStorage.setItem(key, JSON.stringify(allTx));
    return undefined as T;
  }

  if (command === "delete_agency_transaction") {
    const allTx: any[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const targetId = Number(args.id) || 0;
    localStorage.setItem(key, JSON.stringify(allTx.filter((t: any) => t.id !== targetId)));
    return undefined as T;
  }

  throw new Error(`أمر غير معروف: ${command}`);
}

/** يبني حمولة add_car متوافقة مع أوامر Rust */
export function buildCarInvokeArgs(form: CarFormState) {
  const isSold = form.status === "مبيوعة";
  const isDelivery = isSold && form.paymentType === "موعد";
  const isInstallment = isSold && form.paymentType === "اقساط";
  const isDeferred = isSold && form.paymentType !== "كاش";
  const months = Math.max(1, Number(form.installmentMonths) || 1);
  const remaining = Number(form.amountRemaining) || 0;
  const paid = Number(form.amountPaid) || 0;

  return {
    num: form.num.trim(),
    province: form.province.trim(),
    chassis: form.chassis.trim(),
    model: form.model.trim(),
    year: form.year.trim(),
    name: form.name.trim(),
    color: form.color.trim(),
    details: form.details.trim(),
    purchase: Number(form.purchase) || 0,
    selling: Number(form.selling) || 0,
    status: form.status,
    paymentType: isSold ? form.paymentType : null,
    cashPrice: isSold && (form.paymentType === "كاش" || form.paymentType === "موعد") ? paid : null,
    amountPaid: isSold ? paid : null,
    amountRemaining: isDeferred ? remaining : null,
    installmentMonths: isInstallment ? months : null,
    monthlyPayment: isInstallment ? remaining / months : null,
    buyerName: isSold ? form.buyerName.trim() || null : null,
    buyerPhone: isSold ? form.phone.trim() || null : null,
    purchaseDate: form.purchaseDate || null,
    purchasePaymentType: form.purchasePaymentType,
    saleDate: isSold ? form.saleDate || null : null,
    deliveryDate: isDelivery ? form.deliveryDate || null : null,
    firstPaymentDate: isInstallment ? form.firstPaymentDate || null : null,
    currency: form.currency,
    saleCurrency: form.saleCurrency,
    oldNum: form.oldNum || null,
    purchaseType: form.purchaseType === "تمويل" ? "دين" : (form.purchaseType || "كاش"),
    financerName: form.purchaseType === "تمويل" || form.purchaseType === "شركة" ? form.financerName || null : null,
    commissionType: null,
    commissionValue: null,
    carPartners: form.purchaseType === "شراكه"
      ? (form.carPartners || []).map((p) => ({
          car_number: [form.num.trim(), form.province.trim()].filter(Boolean).join(" "),
          partner_name: p.partner_name.trim(),
          amount: Number(p.amount) || 0,
          currency: p.currency,
          kind: p.kind || "شريك",
        }))
      : null,
  };
}

export async function callTauri<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (isTauri()) {
    return invoke<T>(command, args);
  }

  console.warn(`[وضع المتصفح] استدعاء: ${command}`, args);
  return mockInvoke<T>(command, args);
}

```

---

## File: `src-tauri/src/lib.rs`

```rs
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::{env, sync::Mutex};
use tauri::{Manager, State};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CarPartner {
    pub car_number: String,
    pub partner_name: String,
    pub amount: f64,
    pub currency: String,
    pub kind: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Car {
    pub car_number: String,
    pub car_plate_num: String,
    pub car_province: String,
    pub chassis_number: Option<String>,
    pub car_model: String,
    pub car_year: String,
    pub car_name: String,
    pub color: String,
    pub details: String,
    pub purchase_price: f64,
    pub currency: Option<String>,
    pub sale_currency: Option<String>,
    pub selling_price: f64,
    pub status: String,
    pub payment_type: Option<String>,
    pub cash_price: Option<f64>,
    pub amount_paid: Option<f64>,
    pub amount_remaining: Option<f64>,
    pub installment_months: Option<i32>,
    pub monthly_payment: Option<f64>,
    pub buyer_name: Option<String>,
    pub buyer_phone: Option<String>,
    pub purchase_date: Option<String>,
    pub sale_date: Option<String>,
    pub delivery_date: Option<String>,
    pub first_payment_date: Option<String>,
    pub purchase_payment_type: Option<String>,
    pub purchase_type: Option<String>,
    pub financer_name: Option<String>,
    pub commission_type: Option<String>,
    pub commission_value: Option<f64>,
    pub car_partners: Option<Vec<CarPartner>>,
    pub expenses_sum: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Partner {
    pub partner_name: String,
    pub phone: String,
    pub total_amount: f64,
    pub kind: String,
    pub total_withdrawals: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UnifiedAccount {
    pub partner_name: String,
    pub phone: Option<String>,
    pub iqd_balance: f64,
    pub usd_balance: f64,
    pub kind: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PartnerTransaction {
    pub id: i64,
    pub partner_name: String,
    pub kind: String,
    pub type_: String,
    pub amount: f64,
    pub date: String,
    pub notes: Option<String>,
    pub currency: Option<String>,
    pub payment_type: Option<String>,
    pub time: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExpenseEntry {
    pub id: i64,
    pub description: String,
    pub amount: f64,
    pub date: String,
    pub time: String,
    pub notes: Option<String>,
    pub currency: Option<String>,
    pub car_number: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CarExpenseRecord {
    pub id: i64,
    pub car_number: String,
    pub description: String,
    pub amount: f64,
    pub date: String,
    pub currency: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct CashRegisterEntry {
    pub id: i64,
    pub date: String,
    pub time: String,
    pub type_: String,
    pub amount: f64,
    pub description: String,
    pub notes: Option<String>,
    pub balance: f64,
    pub currency: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Agency {
    pub id: i64,
    pub old_agent_name: String,
    pub car_number: String,
    pub car_model: String,
    pub color: String,
    pub new_agent_name: String,
    pub phone: String,
    pub amount_usd: f64,
    pub amount_iqd: f64,
    pub notes: String,
    pub date: String,
    pub time: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgencyTransaction {
    pub id: i64,
    pub agency_id: i64,
    pub date: String,
    pub time: String,
    #[serde(rename = "type_")]
    pub type_: String,
    pub amount: f64,
    pub currency: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct FinancialSummary {
    pub iqd_balance: f64,
    pub usd_balance: f64,
    pub inventory_value: f64,
    pub total_investments: f64,
    pub total_partner_capital: f64,
    pub total_debtors: f64,
    pub total_expenses: f64,
    pub net_capital: f64,
}

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cars (
            car_number TEXT PRIMARY KEY,
            car_plate_num TEXT,
            car_province TEXT,
            chassis_number TEXT,
            car_model TEXT,
            car_year TEXT,
            car_name TEXT NOT NULL,
            color TEXT,
            details TEXT,
            purchase_price REAL DEFAULT 0.0,
            currency TEXT DEFAULT 'IQD',
            sale_currency TEXT DEFAULT 'IQD',
            selling_price REAL DEFAULT 0.0,
            status TEXT NOT NULL,
            payment_type TEXT,
            cash_price REAL,
            amount_paid REAL,
            amount_remaining REAL,
            installment_months INTEGER,
            monthly_payment REAL
        )",
        [],
    )?;

    // إضافة الأعمدة الجديدة إذا كانت الجداول موجودة مسبقاً
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN chassis_number TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_plate_num TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_province TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_model TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_year TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN payment_type TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN cash_price REAL", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN amount_paid REAL", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN amount_remaining REAL", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN installment_months INTEGER", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN monthly_payment REAL", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN buyer_name TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN buyer_phone TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN purchase_date TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN sale_date TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN delivery_date TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN first_payment_date TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN selling_currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN paid_currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN remaining_currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN sale_currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN purchase_payment_type TEXT DEFAULT 'قاصه'",
        [],
    );

    conn.execute(
        "CREATE TABLE IF NOT EXISTS partners (
            partner_name TEXT NOT NULL,
            phone TEXT,
            total_amount REAL DEFAULT 0.0,
            kind TEXT NOT NULL DEFAULT 'شريك',
            PRIMARY KEY (partner_name, kind)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS partner_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partner_name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'شريك',
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            notes TEXT,
            currency TEXT DEFAULT 'IQD',
            payment_type TEXT DEFAULT 'قاصه'
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cash_register (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            notes TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            notes TEXT,
            currency TEXT DEFAULT 'IQD'
        )",
        [],
    )?;

    // add time column if upgrading
    let _ = conn.execute(
        "ALTER TABLE cash_register ADD COLUMN time TEXT DEFAULT '00:00'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN time TEXT DEFAULT '00:00'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN payment_type TEXT DEFAULT 'قاصه'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN purchase_time TEXT DEFAULT '00:00'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN sale_time TEXT DEFAULT '00:00'",
        [],
    );

    // new fields
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN purchase_type TEXT DEFAULT 'كاش'",
        [],
    );
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN financer_name TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_type TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_value REAL", []);
    let _ = conn.execute("ALTER TABLE expenses ADD COLUMN car_number TEXT", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS car_partners (
            car_number TEXT NOT NULL,
            partner_name TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'IQD',
            kind TEXT NOT NULL DEFAULT 'شريك',
            PRIMARY KEY (car_number, partner_name)
        )",
        [],
    )?;

    let _ = conn.execute(
        "ALTER TABLE car_partners ADD COLUMN kind TEXT DEFAULT 'شريك'",
        [],
    );

    conn.execute(
        "CREATE TABLE IF NOT EXISTS car_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_number TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            currency TEXT DEFAULT 'IQD',
            time TEXT DEFAULT (strftime('%H:%M', 'now', 'localtime'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            old_agent_name TEXT NOT NULL,
            car_number TEXT NOT NULL DEFAULT '',
            car_model TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            new_agent_name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            amount_usd REAL NOT NULL DEFAULT 0.0,
            amount_iqd REAL NOT NULL DEFAULT 0.0,
            notes TEXT NOT NULL DEFAULT '',
            date TEXT NOT NULL,
            time TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agency_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agency_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL DEFAULT '00:00',
            type_ TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'IQD',
            notes TEXT,
            FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // ترقيم قاعدة البيانات للترحيل
    conn.execute(
        "CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY)",
        [],
    )?;

    let version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM db_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if version < 1 {
        // الترحيل 1: مفتاح مركب (partner_name, kind) للجداول القديمة
        // إنشاء جدول مؤقت، نسخ البيانات، حذف القديم، إعادة التسمية
        let _ = conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS partners_migrate (
                partner_name TEXT NOT NULL,
                phone TEXT,
                total_amount REAL DEFAULT 0.0,
                kind TEXT NOT NULL DEFAULT 'شريك',
                PRIMARY KEY (partner_name, kind)
            );
            INSERT OR IGNORE INTO partners_migrate (partner_name, phone, total_amount, kind)
            SELECT partner_name, phone, total_amount, COALESCE(kind, 'شريك') FROM partners;
            DROP TABLE IF EXISTS partners;
            ALTER TABLE partners_migrate RENAME TO partners;",
        );
        let _ = conn.execute(
            "ALTER TABLE partner_transactions ADD COLUMN kind TEXT NOT NULL DEFAULT 'شريك'",
            [],
        );
        conn.execute("INSERT INTO db_version (version) VALUES (1)", [])?;
    }

    if version < 2 {
        let _ = conn.execute(
            "ALTER TABLE cars ADD COLUMN purchase_type TEXT DEFAULT 'كاش'",
            [],
        );
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN financer_name TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_type TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_value REAL", []);
        let _ = conn.execute("ALTER TABLE expenses ADD COLUMN car_number TEXT", []);
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS car_partners (
                car_number TEXT NOT NULL,
                partner_name TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'IQD',
                kind TEXT NOT NULL DEFAULT 'شريك',
                PRIMARY KEY (car_number, partner_name)
            )",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE car_partners ADD COLUMN kind TEXT DEFAULT 'شريك'",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (2)", []);
    }

    if version < 3 {
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS car_expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                car_number TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                date TEXT NOT NULL,
                currency TEXT DEFAULT 'IQD',
                time TEXT DEFAULT (strftime('%H:%M', 'now', 'localtime'))
            )",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (3)", []);
    }

    // Performance indexes
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cars_purchase_type ON cars(purchase_type)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner ON partner_transactions(partner_name, kind)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_partner_transactions_date ON partner_transactions(date)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cash_register_date ON cash_register(date)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cash_register_type ON cash_register(type)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_car_expenses_car ON car_expenses(car_number)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_car_partners_car ON car_partners(car_number)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cars_plate ON cars(car_plate_num)", []);

    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn add_car(
    state: State<AppState>,
    num: String,
    province: String,
    chassis: String,
    model: String,
    year: String,
    name: String,
    color: String,
    details: String,
    purchase: f64,
    currency: Option<String>,
    sale_currency: Option<String>,
    selling: f64,
    status: String,
    payment_type: Option<String>,
    cash_price: Option<f64>,
    amount_paid: Option<f64>,
    amount_remaining: Option<f64>,
    installment_months: Option<i32>,
    monthly_payment: Option<f64>,
    buyer_name: Option<String>,
    buyer_phone: Option<String>,
    purchase_date: Option<String>,
    sale_date: Option<String>,
    delivery_date: Option<String>,
    first_payment_date: Option<String>,
    purchase_payment_type: Option<String>,
    old_num: Option<String>,
    purchase_type: Option<String>,
    financer_name: Option<String>,
    commission_type: Option<String>,
    commission_value: Option<f64>,
    car_partners: Option<Vec<CarPartner>>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let plate_num = num.trim();
    let province = province.trim();
    let car_number = if province.is_empty() {
        plate_num.to_string()
    } else {
        format!("{plate_num} {province}")
    };
    let old_num = old_num.unwrap_or_default();
    let old_num = old_num.trim();

    // الاستعلام عن وقت الشراء ووقت البيع الحاليين لحفظهما قبل حذف أو استبدال السجل، وكذلك الاسم ورقم الشاصي القديمين للتحديث
    let query_num = if !old_num.is_empty() {
        old_num
    } else {
        car_number.as_str()
    };
    let (existing_purchase_time, existing_sale_time, old_name, old_chassis, old_purchase_type, old_financer_name): (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = db
        .query_row(
            "SELECT purchase_time, sale_time, car_name, chassis_number, purchase_type, financer_name FROM cars WHERE car_number = ?1",
            [query_num],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .unwrap_or((None, None, None, None, None, None));

    if !old_num.is_empty() && old_num != car_number {
        db.execute("DELETE FROM cars WHERE car_number = ?1", [old_num])
            .map_err(|e| e.to_string())?;
        db.execute("DELETE FROM car_partners WHERE car_number = ?1", [old_num])
            .map_err(|e| e.to_string())?;
    }

    // INSERT with main fields
    db.execute(
        "INSERT OR REPLACE INTO cars (
            car_number, car_plate_num, car_province, chassis_number,
            car_model, car_year, car_name, color, details, 
            purchase_price, currency, sale_currency,
            selling_price, status,
            payment_type, cash_price, amount_paid, amount_remaining,
            installment_months, monthly_payment, purchase_payment_type,
            purchase_type, financer_name, commission_type, commission_value
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)",
        params![
            car_number.as_str(),
            plate_num,
            province,
            chassis.trim(),
            model.trim(),
            year.trim(),
            name.trim(),
            color.trim(),
            details.trim(),
            purchase,
            currency,
            sale_currency,
            selling,
            status,
            payment_type,
            cash_price,
            amount_paid,
            amount_remaining,
            installment_months,
            monthly_payment,
            purchase_payment_type,
            purchase_type.as_deref().unwrap_or("كاش"),
            financer_name,
            commission_type,
            commission_value,
        ],
    )
    .map_err(|e| e.to_string())?;

    // تحديث الشركاء المساهمين
    db.execute(
        "DELETE FROM car_partners WHERE car_number = ?1",
        [car_number.as_str()],
    )
    .map_err(|e| e.to_string())?;

    if purchase_type.as_deref() == Some("شراكه") {
        if let Some(partners) = &car_partners {
            for partner in partners {
                let p_kind = partner.kind.as_deref().unwrap_or("شريك");
                db.execute(
                    "INSERT INTO car_partners (car_number, partner_name, amount, currency, kind) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        car_number.as_str(),
                        partner.partner_name.trim(),
                        partner.amount,
                        partner.currency.trim(),
                        p_kind,
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // جلب قائمة الشركاء الفعليين من نوع 'شريك' باستثناء 'فجر الوادي'
    let mut partners_stmt = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'")
        .map_err(|e| e.to_string())?;
    let mut partners_list = partners_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;

    if partners_list.is_empty() {
        partners_list.push("فجر الوادي".to_string());
    }
    let n_partners = partners_list.len() as f64;

    let clean_name = name.trim();
    let clean_chassis = chassis.trim();
    let new_purchase_note = format!("سحب شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let new_debt_note = format!("تمويل شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let new_sale_note = format!("ايداع بيع سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let new_expense_prefix = format!("سحب مصروف سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");

    if let Some(ref o_name) = old_name {
        let o_chassis = old_chassis.unwrap_or_default();
        let old_purchase_note = format!("سحب شراء سيارة {} {}", o_name.trim(), o_chassis.trim())
            .trim()
            .replace("  ", " ");
        let old_debt_note = format!("تمويل شراء سيارة {} {}", o_name.trim(), o_chassis.trim())
            .trim()
            .replace("  ", " ");
        let old_sale_note = format!("ايداع بيع سيارة {} {}", o_name.trim(), o_chassis.trim())
            .trim()
            .replace("  ", " ");
        let old_expense_prefix = format!("سحب مصروف سيارة {} {}", o_name.trim(), o_chassis.trim())
            .trim()
            .replace("  ", " ");

        if old_purchase_note != new_purchase_note {
            db.execute(
                "UPDATE partner_transactions SET notes = ?1 WHERE notes = ?2",
                [&new_purchase_note, &old_purchase_note],
            )
            .map_err(|e| e.to_string())?;
        }

        if old_debt_note != new_debt_note {
            db.execute(
                "UPDATE partner_transactions SET notes = ?1 WHERE notes = ?2",
                [&new_debt_note, &old_debt_note],
            )
            .map_err(|e| e.to_string())?;
        }

        if old_sale_note != new_sale_note {
            db.execute(
                "UPDATE partner_transactions SET notes = ?1 WHERE notes = ?2",
                [&new_sale_note, &old_sale_note],
            )
            .map_err(|e| e.to_string())?;
        }

        if old_expense_prefix != new_expense_prefix {
            db.execute(
                "UPDATE partner_transactions 
                 SET notes = ?1 || SUBSTR(notes, LENGTH(?2) + 1)
                 WHERE notes LIKE ?3",
                params![
                    &new_expense_prefix,
                    &old_expense_prefix,
                    format!("{}%", old_expense_prefix)
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // حذف حركات الشراء القديمة ثم إعادة إنشائها حسب نوع الشراء الحالي
    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1 OR notes = ?2",
        params![&new_purchase_note, &new_debt_note],
    )
    .map_err(|e| e.to_string())?;

    if purchase_type.as_deref() == Some("شراكه") {
        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let total_amount = purchase + expenses_sum;
        let total_partner_amounts: f64 = car_partners
            .as_ref()
            .map(|p| p.iter().map(|x| x.amount).sum())
            .unwrap_or(0.0);
        if let Some(partners) = &car_partners {
            for partner in partners {
                let p_name = partner.partner_name.trim();
                let share = if total_partner_amounts > 0.0 {
                    (partner.amount / total_partner_amounts) * total_amount
                } else {
                    total_amount / partners.len() as f64
                };
                if p_name == "فجر الوادي" {
                    let amount_per_partner = share / n_partners;
                    for sub_p in &partners_list {
                        db.execute(
                        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                        [sub_p],
                    )
                    .map_err(|e| e.to_string())?;

                        let note = format!("سحب شراء سيارة {} {}", name.trim(), chassis.trim())
                            .trim()
                            .replace("  ", " ");

                        db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                         VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
                        params![
                            sub_p,
                            amount_per_partner,
                            purchase_date.as_deref().unwrap_or(""),
                            note,
                            partner.currency.trim(),
                            purchase_payment_type.as_deref().unwrap_or("قاصه"),
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                    }
                } else {
                    let p_kind = partner.kind.as_deref().unwrap_or("شريك");
                    db.execute(
                    "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                    params![p_name, p_kind],
                )
                .map_err(|e| e.to_string())?;

                    let note = format!("سحب شراء سيارة {} {}", name.trim(), chassis.trim())
                        .trim()
                        .replace("  ", " ");

                    db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, ?7)",
                    params![
                        p_name,
                        p_kind,
                        share,
                        purchase_date.as_deref().unwrap_or(""),
                        note,
                        partner.currency.trim(),
                        purchase_payment_type.as_deref().unwrap_or("قاصه"),
                    ],
                )
                .map_err(|e| e.to_string())?;
                }
            }
        }
    } else if purchase_type.as_deref() == Some("كاش") {
        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let total_amount = purchase + expenses_sum;
        let amount_per_partner = total_amount / n_partners;
        for sub_p in &partners_list {
            db.execute(
            "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
            [sub_p],
        )
        .map_err(|e| e.to_string())?;

            let note = format!("سحب شراء سيارة {} {}", name.trim(), chassis.trim())
                .trim()
                .replace("  ", " ");

            db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
            params![
                sub_p,
                amount_per_partner,
                purchase_date.as_deref().unwrap_or(""),
                note,
                currency.as_deref().unwrap_or("IQD"),
                purchase_payment_type.as_deref().unwrap_or("قاصه"),
            ],
        )
        .map_err(|e| e.to_string())?;
        }
    } else if purchase_type.as_deref() == Some("دين") || purchase_type.as_deref() == Some("شركة") {
        let p_kind = if purchase_type.as_deref() == Some("دين") { "ممول" } else { "شركة" };
        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let total_amount = purchase + expenses_sum;
        if let Some(f_name) = &financer_name {
            if !f_name.trim().is_empty() {
                let new_kind_exists = db
                    .query_row(
                        "SELECT 1 FROM partners WHERE partner_name = ?1 AND kind = ?2",
                        params![f_name.trim(), p_kind],
                        |_| Ok(()),
                    )
                    .is_ok();
                if new_kind_exists {
                    // partner with this name and kind already exists — no action needed
                } else if !old_num.is_empty()
                    && (old_purchase_type.as_deref() == Some("دين") || old_purchase_type.as_deref() == Some("شركة"))
                    && old_financer_name.as_deref() == Some(f_name.trim())
                {
                    // update from old kind to new kind when same financer name changes type
                    let old_p_kind = if old_purchase_type.as_deref() == Some("دين") { "ممول" } else { "شركة" };
                    if !old_p_kind.is_empty() && old_p_kind != p_kind {
                        let old_exists = db
                            .query_row(
                                "SELECT 1 FROM partners WHERE partner_name = ?1 AND kind = ?2",
                                params![f_name.trim(), old_p_kind],
                                |_| Ok(()),
                            )
                            .is_ok();
                        if old_exists {
                            db.execute(
                                "UPDATE partners SET kind = ?1 WHERE partner_name = ?2 AND kind = ?3",
                                params![p_kind, f_name.trim(), old_p_kind],
                            ).map_err(|e| e.to_string())?;
                        } else {
                            db.execute(
                                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                                params![f_name.trim(), p_kind],
                            ).map_err(|e| e.to_string())?;
                        }
                    }
                } else {
                    db.execute(
                        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                        params![f_name.trim(), p_kind],
                    ).map_err(|e| e.to_string())?;
                }

                let note = format!("سحب شراء سيارة {} {}", name.trim(), chassis.trim())
                    .trim()
                    .replace("  ", " ");

                db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                 VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, ?7)",
                params![
                    f_name.trim(),
                    p_kind,
                    total_amount,
                    purchase_date.as_deref().unwrap_or(""),
                    note,
                    currency.as_deref().unwrap_or("IQD"),
                    purchase_payment_type.as_deref().unwrap_or("قاصه"),
                ],
            )
            .map_err(|e| e.to_string())?;
            }
        }
    }

    // حذف وإعادة توزيع الأرباح ورأس المال عند البيع
    let sale_note = format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
        .trim()
        .replace("  ", " ");
    let debt_sale_prefix = format!("ارجاع (رأس المال + الأرباح) لشراكة سيارة {}", name.trim())
        .trim()
        .replace("  ", " ");

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1 OR notes LIKE ?2",
        params![&sale_note, format!("{}%", debt_sale_prefix)],
    )
    .map_err(|e| e.to_string())?;

    if status == "مبيوعة" {
        if purchase_type.as_deref() == Some("شراكه") {
            let profit = selling - purchase;
            if let Some(partners) = &car_partners {
                for partner in partners {
                    let p_name = partner.partner_name.trim();
                    let mut partner_profit = 0.0;
                    if purchase > 0.0 {
                        partner_profit = (partner.amount / purchase) * profit;
                    }
                    let total_return = partner.amount + partner_profit;

                    if p_name == "فجر الوادي" {
                        let return_per_partner = total_return / n_partners;
                        for sub_p in &partners_list {
                            let note =
                                format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
                                    .trim()
                                    .replace("  ", " ");

                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'ايداع بيع سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
                                params![
                                    sub_p,
                                    return_per_partner,
                                    sale_date.as_deref().unwrap_or(""),
                                    note,
                                    sale_currency.as_deref().unwrap_or("IQD"),
                                    payment_type.as_deref().unwrap_or("قاصه"),
                                ],
                            )
                            .map_err(|e| e.to_string())?;
                        }
                    } else {
                        let p_kind = partner.kind.as_deref().unwrap_or("شريك");

                        let tx_type = if p_kind == "مطلوب" {
                            "سحب ارباح"
                        } else {
                            "ايداع بيع سيارة"
                        };
                        let note = if p_kind == "مطلوب" {
                            format!(
                                "ارجاع (رأس المال + الأرباح) لشراكة سيارة {} (رأس المال: {}, الأرباح: {})",
                                name.trim(),
                                partner.amount,
                                partner_profit
                            ).trim().replace("  ", " ")
                        } else {
                            format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
                                .trim()
                                .replace("  ", " ")
                        };

                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, ?8)",
                            params![
                                p_name,
                                p_kind,
                                tx_type,
                                total_return,
                                sale_date.as_deref().unwrap_or(""),
                                note,
                                sale_currency.as_deref().unwrap_or("IQD"),
                                payment_type.as_deref().unwrap_or("قاصه"),
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
            }
        } else if purchase_type.as_deref() == Some("كاش") {
            let total_return = selling;
            let return_per_partner = total_return / n_partners;
            for sub_p in &partners_list {
                let note = format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
                    .trim()
                    .replace("  ", " ");

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, 'شريك', 'ايداع بيع سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
                    params![
                        sub_p,
                        return_per_partner,
                        sale_date.as_deref().unwrap_or(""),
                        note,
                        sale_currency.as_deref().unwrap_or("IQD"),
                        payment_type.as_deref().unwrap_or("قاصه"),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    recalculate_all_partners(&db)?;

    // تجهيز قيم الوقت المناسبة للكتابة
    let mut purchase_time_to_write = existing_purchase_time;
    if purchase_date.is_none() || purchase_date.as_deref() == Some("") {
        purchase_time_to_write = Some("00:00".to_string());
    }

    let mut sale_time_to_write = existing_sale_time;
    if sale_date.is_none() || sale_date.as_deref() == Some("") {
        sale_time_to_write = Some("00:00".to_string());
    }

    // UPDATE extra fields
    db.execute(
        "UPDATE cars SET buyer_name = ?1, buyer_phone = ?2, purchase_date = ?3, sale_date = ?4, delivery_date = ?5, first_payment_date = ?6, purchase_payment_type = ?7, purchase_time = ?8, sale_time = ?9 WHERE car_number = ?10",
        (
            buyer_name,
            buyer_phone,
            purchase_date,
            sale_date,
            delivery_date,
            first_payment_date,
            purchase_payment_type,
            purchase_time_to_write,
            sale_time_to_write,
            car_number.as_str(),
        ),
    )
    .map_err(|e| e.to_string())?;

    // تسجيل وقت الشراء — مرة واحدة فقط عند الإضافة الأولى (لا يُعاد عند البيع أو التعديل)
    db.execute(
        "UPDATE cars SET purchase_time = strftime('%H:%M', 'now', 'localtime') WHERE car_number = ?1 AND purchase_date IS NOT NULL AND purchase_date != '' AND (purchase_time IS NULL OR purchase_time = '' OR purchase_time = '00:00')",
        [car_number.as_str()],
    )
    .map_err(|e| e.to_string())?;
    // تسجيل وقت البيع — يُحدَّث فقط عند وجود تاريخ البيع ولم يكن مسجلاً سابقاً
    db.execute(
        "UPDATE cars SET sale_time = strftime('%H:%M', 'now', 'localtime') WHERE car_number = ?1 AND sale_date IS NOT NULL AND sale_date != '' AND (sale_time IS NULL OR sale_time = '' OR sale_time = '00:00')",
        [car_number.as_str()],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_cars(state: State<AppState>) -> Result<Vec<Car>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT car_number, chassis_number, car_name, color, details, 
                    purchase_price, currency,
                    sale_currency,
                    selling_price, status,
                    payment_type, cash_price, amount_paid, amount_remaining,
                    installment_months, monthly_payment,
                    buyer_name, buyer_phone, purchase_date, sale_date,
                    delivery_date, first_payment_date, purchase_payment_type,
                    COALESCE(car_plate_num, car_number), COALESCE(car_province, ''),
                    COALESCE(car_model, car_name), COALESCE(car_year, ''),
                    purchase_type, financer_name, commission_type, commission_value
             FROM cars ORDER BY car_name",
        )
        .map_err(|e| e.to_string())?;

    let cars = stmt
        .query_map([], |row| {
            Ok(Car {
                car_number: row.get(0)?,
                car_plate_num: row.get(23)?,
                car_province: row.get(24)?,
                chassis_number: row.get(1)?,
                car_model: row.get(25)?,
                car_year: row.get(26)?,
                car_name: row.get(2)?,
                color: row.get(3)?,
                details: row.get(4)?,
                purchase_price: row.get(5)?,
                currency: row.get(6)?,
                sale_currency: row.get(7)?,
                selling_price: row.get(8)?,
                status: row.get(9)?,
                payment_type: row.get(10)?,
                cash_price: row.get(11)?,
                amount_paid: row.get(12)?,
                amount_remaining: row.get(13)?,
                installment_months: row.get(14)?,
                monthly_payment: row.get(15)?,
                buyer_name: row.get(16)?,
                buyer_phone: row.get(17)?,
                purchase_date: row.get(18)?,
                sale_date: row.get(19)?,
                delivery_date: row.get(20)?,
                first_payment_date: row.get(21)?,
                purchase_payment_type: row.get(22)?,
                purchase_type: row.get(27)?,
                financer_name: row.get(28)?,
                commission_type: row.get(29)?,
                commission_value: row.get(30)?,
                car_partners: None,
                expenses_sum: None,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut cars_with_partners = Vec::new();
    for mut car in cars {
        let mut p_stmt = db
            .prepare("SELECT car_number, partner_name, amount, currency, kind FROM car_partners WHERE car_number = ?1")
            .map_err(|e| e.to_string())?;
        let partners = p_stmt
            .query_map([&car.car_number], |p_row| {
                Ok(CarPartner {
                    car_number: p_row.get(0)?,
                    partner_name: p_row.get(1)?,
                    amount: p_row.get(2)?,
                    currency: p_row.get(3)?,
                    kind: p_row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        car.car_partners = Some(partners);

        // Fetch sum of expenses for this car
        let mut exp_stmt = db
            .prepare("SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1")
            .map_err(|e| e.to_string())?;
        let expenses_sum: f64 = exp_stmt
            .query_row([&car.car_number], |row| row.get(0))
            .unwrap_or(0.0);
        car.expenses_sum = Some(expenses_sum);

        cars_with_partners.push(car);
    }

    Ok(cars_with_partners)
}

#[tauri::command]
fn delete_car(state: State<AppState>, num: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let car_number = num.trim();

    // Get car details before deleting it
    let (car_name, chassis_number): (String, Option<String>) = db
        .query_row(
            "SELECT car_name, chassis_number FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((String::new(), None));
    let chassis_str = chassis_number.unwrap_or_default();
    let clean_name = car_name.trim();
    let clean_chassis = chassis_str.trim();

    db.execute("DELETE FROM cars WHERE car_number = ?1", [car_number])
        .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM car_partners WHERE car_number = ?1",
        [car_number],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM car_expenses WHERE car_number = ?1",
        [car_number],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM expenses WHERE car_number = ?1",
        [car_number],
    )
    .map_err(|e| e.to_string())?;

    // Also delete any partner transactions associated with it using notes matching the formats
    let purchase_note = format!("سحب شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let debt_note = format!("تمويل شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let sale_note = format!("ايداع بيع سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let expense_prefix = format!("سحب مصروف سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let debt_sale_prefix = format!("ارجاع (رأس المال + الأرباح) لشراكة سيارة {}", clean_name)
        .trim()
        .replace("  ", " ");

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1",
        [purchase_note],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1",
        [debt_note],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1",
        [sale_note],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE notes LIKE ?1",
        [format!("{}%", expense_prefix)],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE notes LIKE ?1",
        [format!("{}%", debt_sale_prefix)],
    )
    .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;
    Ok(())
}

#[tauri::command]
fn add_partner(
    state: State<AppState>,
    name: String,
    phone: String,
    kind: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let name = name.trim();
    let phone = phone.trim();
    let kind = kind.trim();

    let exists: bool = db
        .query_row(
            "SELECT COUNT(*) FROM partners WHERE partner_name = ?1 AND kind = ?2",
            (name, kind),
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if exists {
        db.execute(
            "UPDATE partners SET phone = ?1 WHERE partner_name = ?2 AND kind = ?3",
            (phone, name, kind),
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let exists_with_other_kind: bool = db
        .query_row(
            "SELECT COUNT(*) FROM partners WHERE partner_name = ?1",
            [name],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if exists_with_other_kind {
        return Err(format!("الحساب '{}' موجود مسبقاً بنوع مختلف. استخدم تعديل الحساب لتغيير النوع.", name));
    }

    db.execute(
        "INSERT INTO partners (partner_name, phone, total_amount, kind)
         VALUES (?1, ?2, 0.0, ?3)",
        (name, phone, kind),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_partners(state: State<AppState>) -> Result<Vec<Partner>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT p.partner_name, p.phone, p.total_amount, p.kind,
                    COALESCE((SELECT SUM(amount) FROM partner_transactions WHERE partner_name = p.partner_name AND kind = p.kind AND type LIKE 'سحب%'), 0.0) AS total_withdrawals
             FROM partners p ORDER BY p.partner_name",
        )
        .map_err(|e| e.to_string())?;

    let partners = stmt
        .query_map([], |row| {
            Ok(Partner {
                partner_name: row.get(0)?,
                phone: row.get(1)?,
                total_amount: row.get(2)?,
                kind: row.get(3)?,
                total_withdrawals: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(partners)
}

#[tauri::command]
fn get_unified_accounts(state: State<AppState>) -> Result<Vec<UnifiedAccount>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT 
            p.partner_name,
            p.phone,
            COALESCE(SUM(CASE 
                WHEN (t.currency = 'IQD' OR t.currency IS NULL OR t.currency = '') 
                     AND (t.type LIKE 'سحب%') THEN t.amount 
                WHEN (t.currency = 'IQD' OR t.currency IS NULL OR t.currency = '') 
                     AND (t.type LIKE 'ايداع%') 
                     AND (p.kind = 'ممول' OR t.notes IS NULL OR (t.notes NOT LIKE '%دفعة أولى%' AND t.notes NOT LIKE '%قسط%' AND t.notes NOT LIKE '%مؤجل%')) THEN -t.amount 
                ELSE 0.0 END), 0.0) AS iqd_balance,
            COALESCE(SUM(CASE 
                WHEN t.currency = 'USD' 
                     AND (t.type LIKE 'سحب%') THEN t.amount 
                WHEN t.currency = 'USD' 
                     AND (t.type LIKE 'ايداع%') 
                     AND (p.kind = 'ممول' OR t.notes IS NULL OR (t.notes NOT LIKE '%دفعة أولى%' AND t.notes NOT LIKE '%قسط%' AND t.notes NOT LIKE '%مؤجل%')) THEN -t.amount 
                ELSE 0.0 END), 0.0) AS usd_balance,
            p.kind
         FROM partners p
         LEFT JOIN partner_transactions t ON p.partner_name = t.partner_name AND p.kind = t.kind
         WHERE p.kind = 'مطلوب' OR p.kind = 'ممول' OR p.kind = 'شركة'
         GROUP BY p.partner_name, p.phone, p.kind
         ORDER BY p.partner_name"
    ).map_err(|e| e.to_string())?;

    let accounts = stmt
        .query_map([], |row| {
            Ok(UnifiedAccount {
                partner_name: row.get(0)?,
                phone: row.get(1)?,
                iqd_balance: row.get(2)?,
                usd_balance: row.get(3)?,
                kind: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(accounts)
}

#[tauri::command]
fn delete_partner(state: State<AppState>, name: String, kind: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2",
        (name.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM partners WHERE partner_name = ?1 AND kind = ?2",
        (name.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn recalculate_partner_total(
    db: &Connection,
    partner_name: &str,
    kind: &str,
) -> Result<(), String> {
    let query = if kind.trim() == "مطلوب" {
        "UPDATE partners
         SET total_amount = COALESCE((
             SELECT SUM(CASE 
                 WHEN (type LIKE 'سحب%') THEN amount 
                 WHEN (type LIKE 'ايداع%') AND (notes IS NULL OR (notes NOT LIKE '%دفعة أولى%' AND notes NOT LIKE '%قسط%' AND notes NOT LIKE '%مؤجل%')) THEN -amount 
                 ELSE 0.0 
             END)
             FROM partner_transactions
             WHERE partner_name = ?1 AND kind = ?2
         ), 0.0)
         WHERE partner_name = ?1 AND kind = ?2"
    } else {
        "UPDATE partners
         SET total_amount = COALESCE((
             SELECT SUM(CASE WHEN type LIKE 'ايداع%' THEN amount WHEN type LIKE 'سحب%' THEN -amount ELSE 0 END)
             FROM partner_transactions
             WHERE partner_name = ?1 AND kind = ?2
         ), 0.0)
         WHERE partner_name = ?1 AND kind = ?2"
    };

    db.execute(query, (partner_name.trim(), kind.trim()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn recalculate_all_partners(db: &Connection) -> Result<(), String> {
    let mut stmt = db
        .prepare("SELECT partner_name, kind FROM partners")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (name, kind) = row.map_err(|e| e.to_string())?;
        recalculate_partner_total(db, &name, &kind)?;
    }
    Ok(())
}

#[tauri::command]
fn update_partner(
    state: State<AppState>,
    old_name: String,
    old_kind: String,
    name: String,
    phone: String,
    kind: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let name = name.trim().to_string();
    let old_name = old_name.trim().to_string();
    let old_kind = old_kind.trim().to_string();
    let kind = kind.trim().to_string();

    if old_name == name && old_kind == kind {
        db.execute(
            "UPDATE partners SET phone = ?1 WHERE partner_name = ?2 AND kind = ?3",
            (phone.trim(), &old_name, &old_kind),
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let target_exists: bool = db
        .query_row(
            "SELECT COUNT(*) FROM partners WHERE partner_name = ?1 AND kind = ?2",
            (&name, &kind),
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if target_exists {
        return Err(format!("يوجد حساب بالفعل باسم '{}' ونوع '{}'", name, kind));
    }

    db.execute(
        "UPDATE partners SET partner_name = ?1, phone = ?2, kind = ?3 WHERE partner_name = ?4 AND kind = ?5",
        (&name, phone.trim(), &kind, &old_name, &old_kind),
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE partner_transactions SET partner_name = ?1, kind = ?2 WHERE partner_name = ?3 AND kind = ?4",
        (&name, &kind, &old_name, &old_kind),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn add_partner_transaction(
    state: State<AppState>,
    partner_name: String,
    kind: String,
    type_: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let is_financier_repayment = (kind.trim() == "ممول" && type_.trim().starts_with("سحب"))
        || (kind.trim() == "مطلوب"
            && type_.trim().starts_with("ايداع")
            && notes
                .as_deref()
                .unwrap_or("")
                .contains("ممول"));
    let tx_payment_type = if is_financier_repayment {
        Some("ممول")
    } else {
        payment_type.as_deref()
    };

    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, ?8)",
        (
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            notes.as_deref(),
            currency.as_deref(),
            tx_payment_type,
        ),
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;
    if is_financier_repayment {
        distribute_financier_repayment_to_partners(
            &db,
            partner_name.trim(),
            amount,
            date.trim(),
            currency.as_deref().unwrap_or("IQD"),
            notes.as_deref(),
        )?;
    }

    Ok(())
}

fn distribute_financier_repayment_to_partners(
    db: &Connection,
    financier_name: &str,
    amount: f64,
    date: &str,
    currency: &str,
    notes: Option<&str>,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Ok(());
    }

    let mut stmt = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name ASC")
        .map_err(|e| e.to_string())?;
    let partners = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if partners.is_empty() {
        return Err("لا يوجد شركاء لتوزيع تسديد الممول عليهم".to_string());
    }

    let commission_amount = parse_financier_commission(amount, notes);
    let partner_share = amount / partners.len() as f64;
    for partner in &partners {
        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'شريك', 'سحب تسديد ممول', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
            params![
                partner.as_str(),
                partner_share,
                date,
                format!("حصة الشريك من تسديد الممول {}", financier_name),
                currency,
            ],
        )
        .map_err(|e| e.to_string())?;
        recalculate_partner_total(db, partner, "شريك")?;
    }

    // Distribute commission as partner withdrawal only (no separate expense)
    if commission_amount > 0.0 {
        let commission_share = commission_amount / partners.len() as f64;
        for partner in &partners {
            db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                 VALUES (?1, 'شريك', 'سحب عمولة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                params![
                    partner.as_str(),
                    commission_share,
                    date,
                    format!("حصة الشريك من عمولة تسديد الممول {}", financier_name),
                    currency,
                ],
            )
            .map_err(|e| e.to_string())?;
            recalculate_partner_total(db, partner, "شريك")?;
        }
    }

    Ok(())
}

fn parse_financier_commission(amount: f64, notes: Option<&str>) -> f64 {
    let Some(notes) = notes else {
        return 0.0;
    };
    let Some(raw_commission) = notes.split("عمولة:").nth(1) else {
        return 0.0;
    };
    let raw_commission = raw_commission.trim();
    if raw_commission.contains('%') {
        let percent = raw_commission
            .split('%')
            .next()
            .unwrap_or("")
            .trim()
            .parse::<f64>()
            .unwrap_or(0.0);
        return (amount * percent) / 100.0;
    }
    raw_commission.parse::<f64>().unwrap_or(0.0)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn pay_financier_from_partners(
    state: State<AppState>,
    financier_name: String,
    financier_kind: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    commission_amount: Option<f64>,
    commission_currency: Option<String>,
    _commission_notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let financier_name = financier_name.trim();
    let financier_kind = financier_kind.trim();
    let date = date.trim();
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    let commission_amount = commission_amount.unwrap_or(0.0);

    if financier_name.is_empty() {
        return Err("اسم الممول مطلوب".to_string());
    }
    if amount <= 0.0 {
        return Err("مبلغ التسديد يجب أن يكون أكبر من صفر".to_string());
    }

    let financier_tx_type = if financier_kind == "مطلوب" {
        "ايداع"
    } else {
        "سحب"
    };

    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, 'ممول')",
        params![
            financier_name,
            financier_kind,
            financier_tx_type,
            amount,
            date,
            notes.as_deref(),
            currency.as_str(),
        ],
    )
    .map_err(|e| e.to_string())?;
    recalculate_partner_total(&db, financier_name, financier_kind)?;

    let mut stmt = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name ASC")
        .map_err(|e| e.to_string())?;
    let partners = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if partners.is_empty() {
        return Err("لا يوجد شركاء لتوزيع تسديد الممول عليهم".to_string());
    }

    // Distribute the amount equally among partners
    let partner_share = amount / partners.len() as f64;
    for partner in &partners {
        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'شريك', 'سحب تسديد ممول', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
            params![
                partner.as_str(),
                partner_share,
                date,
                format!("حصة الشريك من تسديد الممول {}", financier_name),
                currency.as_str(),
            ],
        )
        .map_err(|e| e.to_string())?;
        recalculate_partner_total(&db, partner, "شريك")?;
    }

    // Distribute commission as partner withdrawal only (no separate expense)
    if commission_amount > 0.0 {
        let commission_currency = commission_currency.unwrap_or_else(|| "IQD".to_string());
        let commission_share = commission_amount / partners.len() as f64;
        for partner in &partners {
            db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                 VALUES (?1, 'شريك', 'سحب عمولة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                params![
                    partner.as_str(),
                    commission_share,
                    date,
                    format!("حصة الشريك من عمولة تسديد الممول {}", financier_name),
                    commission_currency.as_str(),
                ],
            )
            .map_err(|e| e.to_string())?;
            recalculate_partner_total(&db, partner, "شريك")?;
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn update_partner_transaction(
    state: State<AppState>,
    id: i64,
    partner_name: String,
    kind: String,
    type_: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE partner_transactions
         SET type = ?1, amount = ?2, date = ?3, time = strftime('%H:%M', 'now', 'localtime'), notes = ?4, currency = ?5, payment_type = ?6
         WHERE id = ?7 AND partner_name = ?8 AND kind = ?9",
        (
            type_.trim(),
            amount,
            date.trim(),
            notes,
            currency,
            payment_type,
            id,
            partner_name.trim(),
            kind.trim(),
        ),
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    Ok(())
}

#[tauri::command]
fn delete_partner_transaction(
    state: State<AppState>,
    id: i64,
    partner_name: String,
    kind: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM partner_transactions WHERE id = ?1 AND partner_name = ?2 AND kind = ?3",
        (id, partner_name.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    Ok(())
}

#[tauri::command]
fn get_partner_transactions(
    state: State<AppState>,
    partner_name: String,
    kind: String,
) -> Result<Vec<PartnerTransaction>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name, kind, type, amount, date, notes, currency, COALESCE(payment_type, 'قاصه'), COALESCE(time, '00:00')
             FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2 ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let transactions = stmt
        .query_map([partner_name.trim(), kind.trim()], |row| {
            Ok(PartnerTransaction {
                id: row.get(0)?,
                partner_name: row.get(1)?,
                kind: row.get(2)?,
                type_: row.get(3)?,
                amount: row.get(4)?,
                date: row.get(5)?,
                notes: row.get(6)?,
                currency: row.get(7)?,
                payment_type: row.get(8)?,
                time: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(transactions)
}

#[tauri::command]
fn get_cash_register_entries(
    state: State<AppState>,
    payment_type: Option<String>,
) -> Result<Vec<CashRegisterEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut entries: Vec<CashRegisterEntry> = Vec::new();

    let filter_sql = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                " AND (c.purchase_payment_type = 'قاصه' OR c.purchase_payment_type = 'قاصة' OR c.purchase_payment_type IS NULL OR c.purchase_payment_type = '')".to_string()
            } else if pt == "ممول" {
                " AND 1=0".to_string()
            } else {
                format!(
                    " AND c.purchase_payment_type = '{}'",
                    pt.replace('\'', "''")
                )
            }
        }
        None => String::new(),
    };

    // 1. مشتريات السيارات (outflow = سعر الشراء)
    {
        let sql = format!(
            "SELECT c.purchase_date, COALESCE(c.purchase_time, '00:00'), c.car_name, c.car_number, c.purchase_price, COALESCE(c.currency, 'IQD')
             FROM cars c
             WHERE c.purchase_price > 0 AND c.purchase_date IS NOT NULL AND c.purchase_date != ''{}
             ORDER BY c.purchase_date ASC",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, car_name, car_number, price, currency) =
                row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "شراء سيارة".to_string(),
                amount: -price,
                description: format!("{} - {}", car_name, car_number),
                notes: None,
                balance: 0.0,
                currency,
            });
        }
    }

    // 2. بيع السيارات كاش (inflow = المبلغ المستلم)
    {
        let sql = format!(
            "SELECT c.sale_date, COALESCE(c.sale_time, '00:00'), c.car_name, c.car_number, c.selling_price, COALESCE(c.sale_currency, 'IQD')
             FROM cars c
             WHERE c.status = 'مبيوعة' AND c.payment_type = 'كاش'
               AND c.sale_date IS NOT NULL AND c.sale_date != ''{}
             ORDER BY c.sale_date ASC",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, car_name, car_number, price, currency) =
                row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "بيع سيارة".to_string(),
                amount: price,
                description: format!("{} - {}", car_name, car_number),
                notes: None,
                balance: 0.0,
                currency,
            });
        }
    }

    // 3. بيع السيارات آجل (inflow = المبلغ المستلم)
    {
        let sql = format!(
            "SELECT c.sale_date, COALESCE(c.sale_time, '00:00'), c.car_name, c.car_number, c.amount_paid, COALESCE(c.sale_currency, 'IQD')
             FROM cars c
             WHERE c.status = 'مبيوعة' AND c.payment_type = 'موعد'
               AND c.sale_date IS NOT NULL AND c.sale_date != ''{}
             ORDER BY c.sale_date ASC",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, car_name, car_number, amount_paid, currency) =
                row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "بيع سيارة".to_string(),
                amount: amount_paid.unwrap_or(0.0),
                description: format!("{} - {}", car_name, car_number),
                notes: None,
                balance: 0.0,
                currency,
            });
        }
    }

    // 4. مقدمات السيارات بالتقسيط (inflow = المقدمة)
    {
        let sql = format!(
            "SELECT c.sale_date, COALESCE(c.sale_time, '00:00'), c.car_name, c.car_number, c.amount_paid, COALESCE(c.sale_currency, 'IQD')
             FROM cars c
             WHERE c.status = 'مبيوعة' AND c.payment_type = 'اقساط'
               AND c.sale_date IS NOT NULL AND c.sale_date != ''{}
             ORDER BY c.sale_date ASC",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, car_name, car_number, amount_paid, currency) =
                row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "بيع سيارة".to_string(),
                amount: amount_paid.unwrap_or(0.0),
                description: format!("{} - {}", car_name, car_number),
                notes: None,
                balance: 0.0,
                currency,
            });
        }
    }

    let filter_pt_sql = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                " AND (pt.payment_type = 'قاصه' OR pt.payment_type = 'قاصة' OR pt.payment_type IS NULL OR pt.payment_type = '')".to_string()
            } else if pt == "ممول" {
                " AND pt.kind = 'ممول'".to_string()
            } else {
                format!(" AND pt.payment_type = '{}'", pt.replace('\'', "''"))
            }
        }
        None => String::new(),
    };

    // 5. معاملات الشركاء والمستثمرين والمديونيات (المدفوعات فقط)
    {
        let sql = format!(
            "SELECT pt.date, COALESCE(pt.time, '00:00'), pt.kind, pt.type, pt.amount, pt.partner_name, pt.notes, COALESCE(pt.currency, 'IQD')
             FROM partner_transactions pt
             WHERE NOT (pt.kind = 'مطلوب' AND pt.type LIKE 'سحب%'){}
             ORDER BY pt.date ASC, pt.id ASC",
            filter_pt_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, kind, tx_type, amount, partner_name, notes, currency) =
                row.map_err(|e| e.to_string())?;
            let (type_, signed_amount) = match kind.as_str() {
                "شريك" if tx_type.starts_with("ايداع") => {
                    if tx_type.starts_with("ايداع بيع سيارة") {
                        ("", 0.0)
                    } else {
                        ("ايداع شريك", amount)
                    }
                }
                "شريك" if tx_type.starts_with("سحب") => {
                    if tx_type.starts_with("سحب شراء سيارة") || tx_type.starts_with("سحب مصروف")
                    {
                        ("", 0.0)
                    } else {
                        ("سحب شريك", -amount)
                    }
                }
                "مستثمر" if tx_type.starts_with("ايداع") => {
                    if tx_type.starts_with("ايداع بيع سيارة") {
                        ("", 0.0)
                    } else {
                        ("ايداع مستثمر", amount)
                    }
                }
                "مستثمر" if tx_type.starts_with("سحب") => {
                    if tx_type.starts_with("سحب شراء سيارة") || tx_type.starts_with("سحب مصروف")
                    {
                        ("", 0.0)
                    } else {
                        ("سحب مستثمر", -amount)
                    }
                }
                "مطلوب" if tx_type.starts_with("ايداع") => ("تسديد دين", amount),
                "مقترض" if tx_type.starts_with("ايداع") => ("ايداع مقترض", amount),
                "مقترض" if tx_type.starts_with("سحب") => ("سحب مقترض", -amount),
                "ممول" if tx_type.starts_with("ايداع")
                    && payment_type.as_deref() == Some("ممول") => {
                        ("ايداع ممول", amount)
                    }
                "ممول" if tx_type.starts_with("سحب") => {
                    let commission = match &notes {
                        Some(n) => {
                            if let Some(parts) = n.split("عمولة:").nth(1) {
                                if parts.contains('%') {
                                    if let Some(percent_part) = parts.split('%').next() {
                                        let pct = percent_part.trim().parse::<f64>().unwrap_or(0.0);
                                        (amount * pct) / 100.0
                                    } else {
                                        0.0
                                    }
                                } else {
                                    parts.trim().parse::<f64>().unwrap_or(0.0)
                                }
                            } else {
                                0.0
                            }
                        }
                        None => 0.0,
                    };
                    let total_amount = if payment_type.as_deref() == Some("ممول") {
                        amount
                    } else {
                        amount + commission
                    };
                    ("سحب ممول", -total_amount)
                }
                _ => ("", 0.0),
            };
            if type_.is_empty() {
                continue;
            }
            entries.push(CashRegisterEntry {
                id: 0,
                date,
                time,
                type_: type_.to_string(),
                amount: signed_amount,
                description: partner_name,
                notes,
                balance: 0.0,
                currency,
            });
        }
    }

    let include_others = match &payment_type {
        Some(pt) => pt == "قاصه" || pt == "قاصة",
        None => true,
    };

    if include_others {
        // 6. المصروفات (outflow)
        {
            let mut stmt = db
                .prepare(
                    "SELECT e.date, COALESCE(e.time, '00:00'), e.description, e.amount, e.notes, COALESCE(e.currency, 'IQD')
                     FROM expenses e
                     ORDER BY e.date ASC, e.id ASC",
                )
                .map_err(|e| e.to_string())?;

            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, f64>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                })
                .map_err(|e| e.to_string())?;

            for row in rows {
                let (date, time, description, amount, notes, currency) =
                    row.map_err(|e| e.to_string())?;
                entries.push(CashRegisterEntry {
                    id: 0,
                    date,
                    time,
                    type_: "مصروف".to_string(),
                    amount: -amount,
                    description,
                    notes,
                    balance: 0.0,
                    currency,
                });
            }
        }
    }

    // ترتيب تصاعدي (الأقدم أولاً) لحساب الرصيد
    entries.sort_by(|a, b| {
        a.date
            .cmp(&b.date)
            .then_with(|| a.time.cmp(&b.time))
            .then_with(|| a.id.cmp(&b.id))
    });

    // رصيد منفصل لكل عملة
    let mut iqd_running = 0.0;
    let mut usd_running = 0.0;
    for entry in entries.iter_mut() {
        if entry.currency == "USD" {
            usd_running += entry.amount;
            entry.balance = usd_running;
        } else {
            iqd_running += entry.amount;
            entry.balance = iqd_running;
        }
    }

    // إعادة ترقيم
    for (i, entry) in entries.iter_mut().enumerate() {
        entry.id = (i + 1) as i64;
    }

    Ok(entries)
}

#[tauri::command]
fn add_expense(
    state: State<AppState>,
    description: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    car_number: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // إذا كان المصروف خاص بسيارة: يُسجل في car_expenses ثم يُحدّث
    // سحب شراء السيارة ليشمل المبلغ الكلي (الشراء + جميع المصاريف)
    if let Some(ref car_num) = car_number {
        let car_num = car_num.trim();
        if !car_num.is_empty() {
            // 1. تسجيل المصروف في جدول car_expenses أولاً
            db.execute(
                "INSERT INTO car_expenses (car_number, description, amount, date, currency)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                (
                    car_num,
                    description.trim(),
                    amount,
                    date.trim(),
                    &currency,
                ),
            )
            .map_err(|e| e.to_string())?;

            // 2. جلب معلومات السيارة — إذا لم توجد السيارة بعد، نكتفي بتسجيل المصروف
            let car_exists: bool = db
                .query_row(
                    "SELECT COUNT(1) FROM cars WHERE car_number = ?1",
                    [car_num],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0) > 0;
            if !car_exists {
                return Ok(());
            }
            let (car_name, chassis_number, purchase_price, purchase_type, financer_name): (String, Option<String>, f64, Option<String>, Option<String>) = db
                .query_row(
                    "SELECT car_name, chassis_number, purchase_price, purchase_type, financer_name FROM cars WHERE car_number = ?1",
                    [car_num],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
                )
                .unwrap_or((String::new(), None, 0.0, None, None));
            let chassis_str = chassis_number.unwrap_or_default();

            // 3. حساب مجموع المصاريف بعد إضافة المصروف الجديد
            let expenses_sum: f64 = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                    [car_num],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            // 4. المبلغ الكلي = سعر الشراء + مجموع المصاريف
            let total_amount = purchase_price + expenses_sum;

            // 5. حذف حركات سحب شراء السيارة القديمة
            let purchase_note = format!("سحب شراء سيارة {} {}", car_name.trim(), chassis_str.trim())
                .trim()
                .replace("  ", " ");
            db.execute(
                "DELETE FROM partner_transactions WHERE notes = ?1",
                [&purchase_note],
            )
            .map_err(|e| e.to_string())?;

            // 6. إنشاء حركات جديدة بالمبلغ الكلي
            let expense_currency = currency.as_deref().unwrap_or("IQD");
            let expense_date = date.trim();

            if purchase_type.as_deref() == Some("شراكه") {
                // شراكه: جلب شركاء السيارة وتوزيع المبلغ الكلي بنسبة مساهمتهم
                let mut stmt = db
                    .prepare(
                        "SELECT cp.partner_name, cp.kind, cp.amount
                         FROM car_partners cp
                         WHERE cp.car_number = ?1",
                    )
                    .map_err(|e| e.to_string())?;

                let car_partner_rows: Vec<(String, String, f64)> = stmt
                    .query_map([car_num], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?))
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                let total_partner_amounts: f64 = car_partner_rows.iter().map(|(_, _, a)| a).sum();

                // قائمة الشركاء الفعليين لتوزيع حصة فجر الوادي
                let mut stmt2 = db
                    .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'")
                    .map_err(|e| e.to_string())?;
                let partner_list: Vec<String> = stmt2
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                for (p_name, p_kind, p_amount) in &car_partner_rows {
                    let share = if total_partner_amounts > 0.0 {
                        (p_amount / total_partner_amounts) * total_amount
                    } else {
                        total_amount / car_partner_rows.len() as f64
                    };

                    if p_name == "فجر الوادي" {
                        let sub_partners: Vec<&String> = partner_list.iter().filter(|s| *s != "فجر الوادي").collect();
                        if sub_partners.is_empty() {
                            db.execute(
                                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                                ["فجر الوادي"],
                            ).map_err(|e| e.to_string())?;
                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                params!["فجر الوادي", share, expense_date, purchase_note, expense_currency],
                            ).map_err(|e| e.to_string())?;
                        } else {
                            let sub_share = share / sub_partners.len() as f64;
                            for sub in sub_partners {
                                db.execute(
                                    "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                                    [sub],
                                ).map_err(|e| e.to_string())?;
                                db.execute(
                                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                     VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                    params![sub.as_str(), sub_share, expense_date, purchase_note, expense_currency],
                                ).map_err(|e| e.to_string())?;
                            }
                        }
                    } else {
                        let p_kind_str = p_kind.as_str();
                        let exists: bool = db
                            .query_row(
                                "SELECT COUNT(*) FROM partners WHERE partner_name = ?1 AND kind = ?2",
                                params![p_name.as_str(), p_kind_str],
                                |row| row.get::<_, i64>(0),
                            )
                            .unwrap_or(0) > 0;

                        if !exists {
                            db.execute(
                                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                                params![p_name.as_str(), p_kind_str],
                            ).map_err(|e| e.to_string())?;
                        }

                        let tx_type = if p_kind_str == "مطلوب" { "ايداع" } else { "سحب شراء سيارة" };
                        let note = if p_kind_str == "مطلوب" {
                            format!("تمويل شراء سيارة {} {}", car_name.trim(), chassis_str.trim())
                                .trim().replace("  ", " ")
                        } else {
                            purchase_note.clone()
                        };

                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, 'قاصه')",
                            params![
                                p_name.as_str(),
                                p_kind_str,
                                tx_type,
                                share,
                                expense_date,
                                note,
                                expense_currency,
                            ],
                        ).map_err(|e| e.to_string())?;
                    }
                }
        } else if purchase_type.as_deref() == Some("دين") || purchase_type.as_deref() == Some("شركة") {
            let p_kind = if purchase_type.as_deref() == Some("دين") { "ممول" } else { "شركة" };
                if let Some(f_name) = &financer_name {
                    if !f_name.trim().is_empty() {
                        let exists = db
                            .query_row(
                                "SELECT 1 FROM partners WHERE partner_name = ?1 AND kind = ?2",
                                params![f_name.trim(), p_kind],
                                |_| Ok(()),
                            )
                            .is_ok();
                        if !exists {
                            db.execute(
                                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                                params![f_name.trim(), p_kind],
                            ).map_err(|e| e.to_string())?;
                        }

                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, 'قاصه')",
                            params![
                                f_name.trim(),
                                p_kind,
                                total_amount,
                                expense_date,
                                purchase_note,
                                expense_currency,
                            ],
                        ).map_err(|e| e.to_string())?;
                    }
                }
            } else {
                // كاش أو غيره: توزيع بالتساوي على جميع الشركاء
                let mut stmt = db
                    .prepare(
                        "SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'"
                    )
                    .map_err(|e| e.to_string())?;
                let mut partners: Vec<String> = stmt
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                if partners.is_empty() {
                    partners.push("فجر الوادي".to_string());
                }

                let n = partners.len() as f64;
                let per_partner = total_amount / n;

                for p in &partners {
                    db.execute(
                        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                        [p.as_str()],
                    ).map_err(|e| e.to_string())?;

                    if p == "فجر الوادي" {
                        // توزيع حصة فجر الوادي على بقية الشركاء
                        let sub_partners: Vec<String> = partners.iter()
                            .filter(|s| *s != "فجر الوادي")
                            .cloned()
                            .collect();
                        if sub_partners.is_empty() {
                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                params!["فجر الوادي", per_partner, expense_date, purchase_note, expense_currency],
                            ).map_err(|e| e.to_string())?;
                        } else {
                            let sub_share = per_partner / sub_partners.len() as f64;
                            for sub in &sub_partners {
                                db.execute(
                                    "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                                    [sub.as_str()],
                                ).map_err(|e| e.to_string())?;
                                db.execute(
                                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                     VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                    params![sub.as_str(), sub_share, expense_date, purchase_note, expense_currency],
                                ).map_err(|e| e.to_string())?;
                            }
                        }
                    } else {
                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                            params![p.as_str(), per_partner, expense_date, purchase_note, expense_currency],
                        ).map_err(|e| e.to_string())?;
                    }
                }
            }

            recalculate_all_partners(&db)?;
            return Ok(());
        }
    }

    // إذا لم يكن مصروف سيارة → سجل في جدول المصروفات كالمعتاد
    db.execute(
        "INSERT INTO expenses (description, amount, date, time, notes, currency, car_number)
         VALUES (?1, ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
        (
            description.trim(),
            amount,
            date.trim(),
            &notes,
            &currency,
            &car_number,
        ),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_expenses(state: State<AppState>) -> Result<Vec<ExpenseEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, description, amount, date, COALESCE(time, '00:00'), notes, currency, car_number FROM expenses ORDER BY id ASC")
        .map_err(|e| e.to_string())?;

    let expenses = stmt
        .query_map([], |row| {
            Ok(ExpenseEntry {
                id: row.get(0)?,
                description: row.get(1)?,
                amount: row.get(2)?,
                date: row.get(3)?,
                time: row.get(4)?,
                notes: row.get(5)?,
                currency: row.get(6)?,
                car_number: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(expenses)
}

#[tauri::command]
fn delete_expense(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // 1. Fetch expense info before deleting
    let row_result = db.query_row(
        "SELECT description, date FROM expenses WHERE id = ?1",
        [id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );

    if let Ok((description, expense_date)) = row_result {
        // 2. Construct note pattern and delete corresponding transactions
        let pattern = format!("سحب مصروف بقيمة % لـ {}", description.trim());
        db.execute(
            "DELETE FROM partner_transactions WHERE notes LIKE ?1 AND type = 'سحب مصروف' AND date = ?2",
            params![pattern, expense_date.trim()],
        )
        .map_err(|e| e.to_string())?;
    }

    // 3. Delete from expenses table
    db.execute("DELETE FROM expenses WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    // 4. Recalculate totals
    recalculate_all_partners(&db)?;

    Ok(())
}

#[tauri::command]
fn add_car_expense_record(
    state: State<AppState>,
    car_number: String,
    description: String,
    amount: f64,
    date: String,
    currency: Option<String>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO car_expenses (car_number, description, amount, date, currency)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            car_number.trim(),
            description.trim(),
            amount,
            date.trim(),
            &currency,
        ),
    )
    .map_err(|e| e.to_string())?;
    let id = db.last_insert_rowid();
    Ok(id)
}

#[tauri::command]
fn get_car_expense_records(
    state: State<AppState>,
    car_number: String,
) -> Result<Vec<CarExpenseRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, car_number, description, amount, date, currency
             FROM car_expenses
             WHERE car_number = ?1
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let records = stmt
        .query_map([car_number.trim()], |row| {
            Ok(CarExpenseRecord {
                id: row.get(0)?,
                car_number: row.get(1)?,
                description: row.get(2)?,
                amount: row.get(3)?,
                date: row.get(4)?,
                currency: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(records)
}

#[tauri::command]
fn delete_car_expense_record(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // 1. جلب معلومات المصروف
    let row_result = db.query_row(
        "SELECT car_number, amount FROM car_expenses WHERE id = ?1",
        [id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)),
    );

    if let Ok((car_number, _expense_amount)) = row_result {
        // 2. حذف سجل المصروف أولاً
        db.execute("DELETE FROM car_expenses WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;

        // 3. جلب معلومات السيارة
        let (car_name, chassis_number, purchase_price, purchase_type, financer_name): (String, Option<String>, f64, Option<String>, Option<String>) = db
            .query_row(
                "SELECT car_name, chassis_number, purchase_price, purchase_type, financer_name FROM cars WHERE car_number = ?1",
                [&car_number],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap_or((String::new(), None, 0.0, None, None));
        let chassis_str = chassis_number.unwrap_or_default();

        // 4. حساب مجموع المصاريف المتبقية
        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [&car_number],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        // 5. المبلغ الكلي = سعر الشراء + المصاريف المتبقية
        let total_amount = purchase_price + expenses_sum;

        // 6. حذف حركات سحب شراء السيارة القديمة
        let purchase_note = format!("سحب شراء سيارة {} {}", car_name.trim(), chassis_str.trim())
            .trim()
            .replace("  ", " ");
        db.execute(
            "DELETE FROM partner_transactions WHERE notes = ?1",
            [&purchase_note],
        )
        .map_err(|e| e.to_string())?;

        // 7. إعادة إنشاء الحركات بالمبلغ الكلي الجديد
        let date = db
            .query_row(
                "SELECT COALESCE(MIN(date), '') FROM partner_transactions WHERE notes = ?1",
                [&purchase_note],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_default();

        if purchase_type.as_deref() == Some("شراكه") {
            let mut stmt = db
                .prepare(
                    "SELECT cp.partner_name, cp.kind, cp.amount
                     FROM car_partners cp WHERE cp.car_number = ?1",
                )
                .map_err(|e| e.to_string())?;

            let car_partner_rows: Vec<(String, String, f64)> = stmt
                .query_map([&car_number], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            let total_partner_amounts: f64 = car_partner_rows.iter().map(|(_, _, a)| a).sum();

            let mut stmt2 = db
                .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'")
                .map_err(|e| e.to_string())?;
            let partner_list: Vec<String> = stmt2
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            for (p_name, p_kind, p_amount) in &car_partner_rows {
                let share = if total_partner_amounts > 0.0 {
                    (p_amount / total_partner_amounts) * total_amount
                } else {
                    total_amount / car_partner_rows.len() as f64
                };

                if p_name == "فجر الوادي" {
                    let sub_partners: Vec<&String> = partner_list.iter().filter(|s| *s != "فجر الوادي").collect();
                    if sub_partners.is_empty() {
                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                            params!["فجر الوادي", share, date, purchase_note, "IQD"],
                        ).map_err(|e| e.to_string())?;
                    } else {
                        let sub_share = share / sub_partners.len() as f64;
                        for sub in sub_partners {
                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                params![sub.as_str(), sub_share, date, purchase_note, "IQD"],
                            ).map_err(|e| e.to_string())?;
                        }
                    }
                } else {
                    let p_kind_str = p_kind.as_str();
                    let tx_type = if p_kind_str == "مطلوب" { "ايداع" } else { "سحب شراء سيارة" };
                    let note = if p_kind_str == "مطلوب" {
                        format!("تمويل شراء سيارة {} {}", car_name.trim(), chassis_str.trim())
                            .trim().replace("  ", " ")
                    } else {
                        purchase_note.clone()
                    };

                    db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, 'قاصه')",
                        params![p_name.as_str(), p_kind_str, tx_type, share, date, note, "IQD"],
                    ).map_err(|e| e.to_string())?;
                }
            }
        } else if purchase_type.as_deref() == Some("دين") || purchase_type.as_deref() == Some("شركة") {
            let p_kind = if purchase_type.as_deref() == Some("دين") { "ممول" } else { "شركة" };
            if let Some(f_name) = &financer_name {
                if !f_name.trim().is_empty() {
                    let exists = db
                        .query_row(
                            "SELECT 1 FROM partners WHERE partner_name = ?1 AND kind = ?2",
                            params![f_name.trim(), p_kind],
                            |_| Ok(()),
                        )
                        .is_ok();
                    if !exists {
                        db.execute(
                            "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                            params![f_name.trim(), p_kind],
                        ).map_err(|e| e.to_string())?;
                    }

                    db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                         VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, 'قاصه')",
                        params![
                            f_name.trim(),
                            p_kind,
                            total_amount,
                            date,
                            purchase_note,
                            "IQD",
                        ],
                    ).map_err(|e| e.to_string())?;
                }
            }
        } else {
            let mut stmt = db
                .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'")
                .map_err(|e| e.to_string())?;
            let mut partners: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            if partners.is_empty() {
                partners.push("فجر الوادي".to_string());
            }

            let n = partners.len() as f64;
            let per_partner = total_amount / n;

            for p in &partners {
                if p == "فجر الوادي" {
                    let sub_partners: Vec<String> = partners.iter()
                        .filter(|s| *s != "فجر الوادي")
                        .cloned()
                        .collect();
                    if sub_partners.is_empty() {
                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                            params!["فجر الوادي", per_partner, date, purchase_note, "IQD"],
                        ).map_err(|e| e.to_string())?;
                    } else {
                        let sub_share = per_partner / sub_partners.len() as f64;
                        for sub in &sub_partners {
                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                params![sub.as_str(), sub_share, date, purchase_note, "IQD"],
                            ).map_err(|e| e.to_string())?;
                        }
                    }
                } else {
                    db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                         VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                        params![p.as_str(), per_partner, date, purchase_note, "IQD"],
                    ).map_err(|e| e.to_string())?;
                }
            }
        }

        recalculate_all_partners(&db)?;
    } else {
        // إذا لم يتم العثور على المصروف، فقط احذف السجل إن وُجد
        db.execute("DELETE FROM car_expenses WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn now_datetime() -> (String, String) {
    use std::time::SystemTime;
    let now = SystemTime::now();
    let epoch = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // simple UTC-based calculation (no chrono dependency)
    let secs_per_day = 86400u64;
    let total_days = epoch / secs_per_day;
    let time_of_day = epoch % secs_per_day;
    let hh = time_of_day / 3600;
    let mm = (time_of_day % 3600) / 60;
    // days since 1970-01-01
    let mut y = 1970u64;
    let mut days = total_days;
    loop {
        let days_in_year = if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 { 366 } else { 365 };
        if days < days_in_year { break; }
        days -= days_in_year;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let month_days: [u64; 12] = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if days < md { m = i; break; }
        days -= md;
    }
    let d = days + 1;
    let date = format!("{:04}-{:02}-{:02}", y, m + 1, d);
    let time = format!("{:02}:{:02}", hh, mm);
    (date, time)
}

#[tauri::command]
fn get_agencies(state: State<AppState>) -> Result<Vec<Agency>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, old_agent_name, car_number, car_model, color, new_agent_name, phone,
                    amount_usd, amount_iqd, notes, date, time
             FROM agencies ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;

    let agencies = stmt
        .query_map([], |row| {
            Ok(Agency {
                id: row.get(0)?,
                old_agent_name: row.get(1)?,
                car_number: row.get(2)?,
                car_model: row.get(3)?,
                color: row.get(4)?,
                new_agent_name: row.get(5)?,
                phone: row.get(6)?,
                amount_usd: row.get(7)?,
                amount_iqd: row.get(8)?,
                notes: row.get(9)?,
                date: row.get(10)?,
                time: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(agencies)
}

#[tauri::command]
fn add_agency(
    state: State<AppState>,
    old_agent_name: String,
    car_number: String,
    car_model: String,
    color: String,
    new_agent_name: String,
    phone: String,
    amount_usd: f64,
    amount_iqd: f64,
    notes: String,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (date, time) = now_datetime();

    db.execute(
        "INSERT INTO agencies (old_agent_name, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        (
            old_agent_name.trim(),
            car_number.trim(),
            car_model.trim(),
            color.trim(),
            new_agent_name.trim(),
            phone.trim(),
            amount_usd,
            amount_iqd,
            notes.trim(),
            date.clone(),
            time,
        ),
    )
    .map_err(|e| e.to_string())?;

    let new_id = db.last_insert_rowid();

    // توزيع ارباح الوكالة على حسابات الشركاء
    if amount_iqd > 0.0 || amount_usd > 0.0 {
        let mut stmt = db
            .prepare(
                "SELECT partner_name, kind FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'",
            )
            .map_err(|e| e.to_string())?;

        let partner_rows: Vec<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        drop(stmt);

        let n = partner_rows.len() as f64;
        let agency_note = format!(
            "ارباح وكالة {} {}",
            old_agent_name.trim(),
            new_agent_name.trim()
        )
        .trim()
        .replace("  ", " ");

        for (p_name, p_kind) in &partner_rows {
            db.execute(
                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                params![p_name, p_kind],
            )
            .map_err(|e| e.to_string())?;

            if amount_iqd > 0.0 && n > 0.0 {
                let share = amount_iqd / n;
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'ايداع ارباح وكالة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, 'IQD', 'قاصه')",
                    params![p_name, p_kind, share, date.trim(), agency_note],
                )
                .map_err(|e| e.to_string())?;
            }

            if amount_usd > 0.0 && n > 0.0 {
                let share = amount_usd / n;
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'ايداع ارباح وكالة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, 'USD', 'قاصه')",
                    params![p_name, p_kind, share, date.trim(), agency_note],
                )
                .map_err(|e| e.to_string())?;
            }

            recalculate_partner_total(&db, p_name, p_kind)?;
        }
    }

    Ok(new_id)
}

#[tauri::command]
fn update_agency(
    state: State<AppState>,
    id: i64,
    old_agent_name: String,
    car_number: String,
    car_model: String,
    color: String,
    new_agent_name: String,
    phone: String,
    amount_usd: f64,
    amount_iqd: f64,
    notes: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (old_amount_usd, old_amount_iqd): (f64, f64) = db
        .query_row(
            "SELECT amount_usd, amount_iqd FROM agencies WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((0.0, 0.0));

    db.execute(
        "UPDATE agencies SET old_agent_name = ?1, car_number = ?2, car_model = ?3, color = ?4, new_agent_name = ?5, phone = ?6, amount_usd = ?7, amount_iqd = ?8, notes = ?9 WHERE id = ?10",
        (
            old_agent_name.trim(),
            car_number.trim(),
            car_model.trim(),
            color.trim(),
            new_agent_name.trim(),
            phone.trim(),
            amount_usd,
            amount_iqd,
            notes.trim(),
            id,
        ),
    )
    .map_err(|e| e.to_string())?;

    let diff_usd = amount_usd - old_amount_usd;
    let diff_iqd = amount_iqd - old_amount_iqd;

    if diff_usd > 0.0 || diff_iqd > 0.0 {
        let (date, _time) = now_datetime();

        let mut stmt = db
            .prepare(
                "SELECT partner_name, kind FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'",
            )
            .map_err(|e| e.to_string())?;

        let partner_rows: Vec<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        drop(stmt);

        let n = partner_rows.len() as f64;
        let agency_note = format!(
            "ارباح وكالة {} {}",
            old_agent_name.trim(),
            new_agent_name.trim()
        )
        .trim()
        .replace("  ", " ");

        for (p_name, p_kind) in &partner_rows {
            db.execute(
                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                params![p_name, p_kind],
            )
            .map_err(|e| e.to_string())?;

            if diff_iqd > 0.0 && n > 0.0 {
                let share = diff_iqd / n;
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'ايداع ارباح وكالة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, 'IQD', 'قاصه')",
                    params![p_name, p_kind, share, date.trim(), agency_note],
                )
                .map_err(|e| e.to_string())?;
            }

            if diff_usd > 0.0 && n > 0.0 {
                let share = diff_usd / n;
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'ايداع ارباح وكالة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, 'USD', 'قاصه')",
                    params![p_name, p_kind, share, date.trim(), agency_note],
                )
                .map_err(|e| e.to_string())?;
            }

            recalculate_partner_total(&db, p_name, p_kind)?;
        }
    }

    Ok(())
}

#[tauri::command]
fn delete_agency(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let (old_agent_name, new_agent_name): (String, String) = db
        .query_row(
            "SELECT old_agent_name, new_agent_name FROM agencies WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or_default();

    let agency_note = format!(
        "ارباح وكالة {} {}",
        old_agent_name.trim(),
        new_agent_name.trim()
    )
    .trim()
    .replace("  ", " ");

    db.execute(
        "DELETE FROM partner_transactions WHERE type = 'ايداع ارباح وكالة' AND notes = ?1",
        [&agency_note],
    )
    .map_err(|e| e.to_string())?;

    db.execute("DELETE FROM agency_transactions WHERE agency_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM agencies WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

    Ok(())
}

#[tauri::command]
fn get_agency_transactions(
    state: State<AppState>,
    agency_id: i64,
) -> Result<Vec<AgencyTransaction>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, agency_id, date, time, type_, amount, currency, notes
             FROM agency_transactions WHERE agency_id = ?1 ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let transactions = stmt
        .query_map([agency_id], |row| {
            Ok(AgencyTransaction {
                id: row.get(0)?,
                agency_id: row.get(1)?,
                date: row.get(2)?,
                time: row.get(3)?,
                type_: row.get(4)?,
                amount: row.get(5)?,
                currency: row.get(6)?,
                notes: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(transactions)
}

#[tauri::command]
fn add_agency_transaction(
    state: State<AppState>,
    agency_id: i64,
    type_: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (_, time) = now_datetime();

    db.execute(
        "INSERT INTO agency_transactions (agency_id, date, time, type_, amount, currency, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            agency_id,
            date.trim(),
            time,
            type_.trim(),
            amount,
            currency.as_deref(),
            notes.as_deref(),
        ),
    )
    .map_err(|e| e.to_string())?;

    // توزيع المبلغ على حسابات الشركاء
    let (old_agent_name, new_agent_name): (String, String) = db
        .query_row(
            "SELECT old_agent_name, new_agent_name FROM agencies WHERE id = ?1",
            [agency_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let agency_note = format!(
        "وكالة {} {}",
        old_agent_name.trim(),
        new_agent_name.trim()
    )
    .trim()
    .replace("  ", " ");

    let mut stmt = db
        .prepare(
            "SELECT partner_name, kind FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'",
        )
        .map_err(|e| e.to_string())?;

    let partner_rows: Vec<(String, String)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    let n = partner_rows.len() as f64;
    let share = if n > 0.0 { amount / n } else { 0.0 };
    let partner_tx_type = if type_.trim() == "ايداع" {
        "ايداع وكالة"
    } else {
        "سحب وكالة"
    };

    for (p_name, p_kind) in &partner_rows {
        db.execute(
            "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
            params![p_name, p_kind],
        )
        .map_err(|e| e.to_string())?;

        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, 'قاصه')",
            params![
                p_name,
                p_kind,
                partner_tx_type,
                share,
                date.trim(),
                agency_note,
                currency.as_deref(),
            ],
        )
        .map_err(|e| e.to_string())?;

        recalculate_partner_total(&db, p_name, p_kind)?;
    }

    Ok(())
}

#[tauri::command]
fn delete_agency_transaction(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let (agency_id, tx_date, tx_type): (i64, String, String) = db
        .query_row(
            "SELECT agency_id, date, type_ FROM agency_transactions WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let (old_agent_name, new_agent_name): (String, String) = db
        .query_row(
            "SELECT old_agent_name, new_agent_name FROM agencies WHERE id = ?1",
            [agency_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let agency_note = format!(
        "وكالة {} {}",
        old_agent_name.trim(),
        new_agent_name.trim()
    )
    .trim()
    .replace("  ", " ");

    let partner_tx_type = if tx_type.trim() == "ايداع" {
        "ايداع وكالة"
    } else {
        "سحب وكالة"
    };

    db.execute(
        "DELETE FROM partner_transactions WHERE type = ?1 AND notes = ?2 AND date = ?3",
        params![partner_tx_type, agency_note, tx_date.trim()],
    )
    .map_err(|e| e.to_string())?;

    db.execute("DELETE FROM agency_transactions WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

    Ok(())
}

#[tauri::command]
fn get_financial_summary(
    state: State<AppState>,
    payment_type: Option<String>,
) -> Result<FinancialSummary, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut iqd_balance = 0.0;
    let mut usd_balance = 0.0;

    let filter_sql = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                " AND (c.purchase_payment_type = 'قاصه' OR c.purchase_payment_type = 'قاصة' OR c.purchase_payment_type IS NULL OR c.purchase_payment_type = '')".to_string()
            } else {
                format!(
                    " AND c.purchase_payment_type = '{}'",
                    pt.replace('\'', "''")
                )
            }
        }
        None => String::new(),
    };

    let filter_pt_sql = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                " AND (pt.payment_type = 'قاصه' OR pt.payment_type = 'قاصة' OR pt.payment_type IS NULL OR pt.payment_type = '')".to_string()
            } else {
                format!(" AND pt.payment_type = '{}'", pt.replace('\'', "''"))
            }
        }
        None => String::new(),
    };

    // 1. رصيد القاصة (IQD & USD) - مشتريات السيارات
    {
        let sql = format!(
            "SELECT c.currency, c.purchase_price FROM cars c WHERE c.purchase_date IS NOT NULL AND c.purchase_price > 0{}",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let purchase_rows: Vec<(String, f64)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (currency, price) in &purchase_rows {
            if currency == "USD" {
                usd_balance -= price;
            } else {
                iqd_balance -= price;
            }
        }
    }

    // بيع السيارات
    for (sale_type, amount_col) in [
        ("كاش", "selling_price"),
        ("موعد", "amount_paid"),
        ("اقساط", "amount_paid"),
    ] {
        let sql = format!(
            "SELECT COALESCE(c.sale_currency, 'IQD'), c.{} FROM cars c WHERE c.status = 'مبيوعة' AND c.payment_type = ?1 AND c.sale_date IS NOT NULL AND c.sale_date != ''{}",
            amount_col, filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let sale_rows: Vec<(String, f64)> = stmt
            .query_map([sale_type], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (currency, amount) in &sale_rows {
            if currency == "USD" {
                usd_balance += amount;
            } else {
                iqd_balance += amount;
            }
        }
    }

    // معاملات الشركاء والمستثمرين
    {
        let sql = format!(
            "SELECT pt.kind, pt.type, pt.amount, COALESCE(pt.currency, 'IQD'), pt.notes
             FROM partner_transactions pt
             WHERE NOT (pt.kind = 'مطلوب' AND pt.type LIKE 'سحب%'){}",
            filter_pt_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let tx_rows: Vec<(String, String, f64, String, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (kind, tx_type, amount, currency, notes) in &tx_rows {
            let signed = match kind.as_str() {
                "شريك" | "مستثمر" | "مطلوب" | "مقترض" if tx_type.starts_with("ايداع") => {
                    if tx_type.starts_with("ايداع بيع سيارة") {
                        0.0
                    } else {
                        *amount
                    }
                }
                "شريك" | "مستثمر" | "مقترض" if tx_type.starts_with("سحب") => {
                    if tx_type.starts_with("سحب شراء سيارة") || tx_type.starts_with("سحب مصروف")
                    {
                        0.0
                    } else {
                        -*amount
                    }
                }
                "ممول" if tx_type.starts_with("سحب") => {
                    let commission = match notes {
                        Some(ref n) => {
                            if let Some(parts) = n.split("عمولة:").nth(1) {
                                if parts.contains('%') {
                                    if let Some(percent_part) = parts.split('%').next() {
                                        let pct = percent_part.trim().parse::<f64>().unwrap_or(0.0);
                                        (amount * pct) / 100.0
                                    } else {
                                        0.0
                                    }
                                } else {
                                    parts.trim().parse::<f64>().unwrap_or(0.0)
                                }
                            } else {
                                0.0
                            }
                        }
                        None => 0.0,
                    };
                    let total_amount = amount + commission;
                    -total_amount
                }
                _ => 0.0,
            };
            if currency == "USD" {
                usd_balance += signed;
            } else {
                iqd_balance += signed;
            }
        }
    }

    // المصروفات
    let include_others = match &payment_type {
        Some(pt) => pt == "قاصه" || pt == "قاصة",
        None => true,
    };
    if include_others {
        let sql = "SELECT COALESCE(SUM(amount), 0), COALESCE(currency, 'IQD') FROM expenses GROUP BY currency";
        let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
        let exp_rows: Vec<(f64, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, f64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (total, currency) in &exp_rows {
            if currency == "USD" {
                usd_balance -= total;
            } else {
                iqd_balance -= total;
            }
        }
    }

    // 2. قيمة المخزون (مجموع سعر شراء السيارات المتوفرة)
    let inv_sql = format!(
        "SELECT COALESCE(SUM(purchase_price), 0) FROM cars WHERE status = 'متوفرة'{}",
        filter_sql
    );
    let inventory_value: f64 = db
        .query_row(&inv_sql, [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // 3. إجمالي استثمارات المستثمرين
    let total_investments: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total_amount), 0) FROM partners WHERE kind = 'مستثمر' AND total_amount > 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 4. رأس مال الشركاء
    let total_partner_capital: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total_amount), 0) FROM partners WHERE kind = 'شريك'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 5. إجمالي ديون العملاء
    let total_debtors: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total_amount), 0) FROM partners WHERE kind = 'مطلوب' AND total_amount > 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 6. إجمالي المصروفات
    let total_expenses: f64 = db
        .query_row("SELECT COALESCE(SUM(amount), 0) FROM expenses", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    // 7. صافي رأس المال (النقد + المخزون + ديون العملاء - استثمارات المستثمرين - ديون المقترضين)
    let total_borrowers: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total_amount), 0) FROM partners WHERE kind = 'مقترض' AND total_amount < 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let net_capital =
        iqd_balance + inventory_value + total_debtors - total_investments - total_borrowers;

    Ok(FinancialSummary {
        iqd_balance,
        usd_balance,
        inventory_value,
        total_investments,
        total_partner_capital,
        total_debtors,
        total_expenses,
        net_capital,
    })
}

#[tauri::command]
fn get_partners_totals(state: State<AppState>, kind: String) -> Result<(f64, f64), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let query_iqd = if kind == "partners-financial" {
        "SELECT COALESCE(SUM(CASE 
            WHEN kind = 'ممول' AND type LIKE 'ايداع%' THEN -amount 
            WHEN kind = 'ممول' AND type LIKE 'سحب%' THEN amount 
            WHEN kind != 'ممول' AND type LIKE 'ايداع%' THEN amount 
            WHEN kind != 'ممول' AND type LIKE 'سحب%' THEN -amount 
            ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind IN ('شريك', 'مستثمر', 'ممول', 'مقترض') AND (currency IS NULL OR currency = 'IQD' OR currency = '')"
    } else if kind == "مطلوب" {
        "SELECT COALESCE(SUM(CASE WHEN type LIKE 'سحب%' THEN amount WHEN type LIKE 'ايداع%' THEN -amount ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind = ?1 AND (currency IS NULL OR currency = 'IQD' OR currency = '') 
           AND (notes IS NULL OR (notes NOT LIKE '%دفعة أولى%' AND notes NOT LIKE '%قسط%' AND notes NOT LIKE '%مؤجل%'))"
    } else {
        "SELECT COALESCE(SUM(CASE WHEN type LIKE 'ايداع%' THEN amount WHEN type LIKE 'سحب%' THEN -amount ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind = ?1 AND (currency IS NULL OR currency = 'IQD' OR currency = '')"
    };

    let query_usd = if kind == "partners-financial" {
        "SELECT COALESCE(SUM(CASE 
            WHEN kind = 'ممول' AND type LIKE 'ايداع%' THEN -amount 
            WHEN kind = 'ممول' AND type LIKE 'سحب%' THEN amount 
            WHEN kind != 'ممول' AND type LIKE 'ايداع%' THEN amount 
            WHEN kind != 'ممول' AND type LIKE 'سحب%' THEN -amount 
            ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind IN ('شريك', 'مستثمر', 'ممول', 'مقترض') AND currency = 'USD'"
    } else if kind == "مطلوب" {
        "SELECT COALESCE(SUM(CASE WHEN type LIKE 'سحب%' THEN amount WHEN type LIKE 'ايداع%' THEN -amount ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind = ?1 AND currency = 'USD' 
           AND (notes IS NULL OR (notes NOT LIKE '%دفعة أولى%' AND notes NOT LIKE '%قسط%' AND notes NOT LIKE '%مؤجل%'))"
    } else {
        "SELECT COALESCE(SUM(CASE WHEN type LIKE 'ايداع%' THEN amount WHEN type LIKE 'سحب%' THEN -amount ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind = ?1 AND currency = 'USD'"
    };

    let iqd_total: f64 = if kind == "partners-financial" {
        db.query_row(query_iqd, [], |row| row.get(0))
            .map_err(|e| e.to_string())?
    } else {
        db.query_row(query_iqd, [&kind], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };
    let usd_total: f64 = if kind == "partners-financial" {
        db.query_row(query_usd, [], |row| row.get(0))
            .map_err(|e| e.to_string())?
    } else {
        db.query_row(query_usd, [&kind], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };

    Ok((iqd_total, usd_total))
}

#[tauri::command]
fn open_whatsapp(phone: String, text: String) -> Result<(), String> {
    let url = format!("whatsapp://send?phone={}&text={}", phone, text);
    open::that(&url).map_err(|e| format!("فشل فتح واتساب: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            } else {
                env::current_exe()
                    .map_err(|e| format!("تعذر معرفة مسار البرنامج: {e}"))?
                    .parent()
                    .ok_or_else(|| "تعذر معرفة مجلد البرنامج".to_string())?
                    .to_path_buf()
            };

            std::fs::create_dir_all(&app_dir)
                .map_err(|e| format!("تعذر إنشاء مجلد قاعدة البيانات: {e}"))?;

            let db_path = app_dir.join("fjr_alwadi_data.db");
            let conn =
                Connection::open(&db_path).map_err(|e| format!("تعذر فتح قاعدة البيانات: {e}"))?;

            init_db(&conn).map_err(|e| format!("تعذر تهيئة قاعدة البيانات: {e}"))?;

            app.manage(AppState {
                db: Mutex::new(conn),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_car,
            get_cars,
            delete_car,
            add_partner,
            update_partner,
            get_partners,
            delete_partner,
            add_partner_transaction,
            pay_financier_from_partners,
            update_partner_transaction,
            delete_partner_transaction,
            get_partner_transactions,
            get_cash_register_entries,
            add_expense,
            get_expenses,
            delete_expense,
            add_car_expense_record,
            get_car_expense_records,
            delete_car_expense_record,
            get_financial_summary,
            get_partners_totals,
            get_unified_accounts,
            get_agencies,
            add_agency,
            update_agency,
            delete_agency,
            get_agency_transactions,
            add_agency_transaction,
            delete_agency_transaction,
            open_whatsapp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

```

---

## File: `src-tauri/src/main.rs`

```rs
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fajir_alwadi_lib::run()
}

```

---

