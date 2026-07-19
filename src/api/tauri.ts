import { invoke } from "@tauri-apps/api/core";
import type { CarFormState } from "../types";
import { moneyDiv, moneyToStorage, type MoneyInput } from "../utils/money";
import { normalizePhoneNumber } from "../utils/numberInput";

const isTauri = () =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || import.meta.env.TAURI_ENV_PLATFORM != null);

// WARNING: When adding a new Tauri command that accepts a money argument, add the arg key here.
// Otherwise the value will be sent as a JS number and lose precision.
const MONEY_ARG_KEYS = new Set([
  "amount",
  "actualPaidAmount",
  "actual_paid_amount",
  "amountIqd",
  "amount_iqd",
  "amountPaid",
  "amount_paid",
  "amountRemaining",
  "amount_remaining",
  "amountUsd",
  "amount_usd",
  "cashPrice",
  "cash_price",
  "commissionAmount",
  "commission_amount",
  "commissionValue",
  "commission_value",
  "credit",
  "debit",
  "monthlyPayment",
  "monthly_payment",
  "purchase",
  "purchasePrice",
  "purchase_price",
  "selling",
  "sellingPrice",
  "selling_price",
  // Additional money-like keys used across the codebase
  "cost",
  "cost_price",
  "profit",
  "balance",
  "capital",
  "cash",
  "value",
]);

// Pattern used by the dev-mode runtime check in serializeTauriMoneyArgs to catch money-like
// arg keys that were forgotten in MONEY_ARG_KEYS.
const MONEY_ARG_KEY_PATTERN = /amount|price|payment|cost|profit|balance|capital|commission|monthly|cash|value/i;
const NON_MONEY_ARG_KEYS = new Set([
  "paymentType",
  "payment_type",
  "purchasePaymentType",
  "purchase_payment_type",
  "salePaymentType",
  "sale_payment_type",
  "paymentStatus",
  "payment_status",
]);

const PHONE_ARG_KEYS = new Set(["phone", "buyerPhone", "buyer_phone"]);

function serializeTauriMoneyArgs(value: unknown, key?: string, depth = 0): unknown {
  // Recursion guard: avoid stack overflow on deeply-nested (or cyclic) objects.
  if (depth > 10) return value;
  if (key && PHONE_ARG_KEYS.has(key) && typeof value === "string") {
    return normalizePhoneNumber(value);
  }
  if (key && MONEY_ARG_KEYS.has(key)) {
    return value === null || value === undefined ? value : moneyToStorage(value as MoneyInput);
  }
  // Dev-mode runtime check: warn about money-like keys missing from MONEY_ARG_KEYS.
  if (
    import.meta.env &&
    !import.meta.env.PROD &&
    key &&
    !MONEY_ARG_KEYS.has(key) &&
    !NON_MONEY_ARG_KEYS.has(key) &&
    MONEY_ARG_KEY_PATTERN.test(key) &&
    (typeof value === "string" || typeof value === "number")
  ) {
    console.warn(
      `[serializeTauriMoneyArgs] Arg "${key}" looks like a money field but is not in MONEY_ARG_KEYS. ` +
      `Add it to MONEY_ARG_KEYS to ensure money precision is preserved across the Tauri IPC boundary.`,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeTauriMoneyArgs(item, undefined, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        serializeTauriMoneyArgs(childValue, childKey, depth + 1),
      ]),
    );
  }
  return value;
}

// FORENSIC FIX (re-audit 2026-07-11, MOCK-ISOLATION-3):
// The localStorage-based mock layer (~1,700 lines) has been DELETED from this
// file. The backend (Rust + SQLite via Tauri IPC) is the single source of
// truth for ALL accounting logic — including the 50/50 partner split and
// profit calculations. The previous mock layer re-implemented these formulas
// in TypeScript, which produced false positives in development and masked
// real backend regressions. There is no browser-only fallback anymore.
//
// To run the app: `npm run tauri dev` (opens Tauri webview with live backend).
// Focused unit tests use pure fixtures; no browser bridge or mock accounting
// backend is shipped with the product.

export function buildCarInvokeArgs(form: CarFormState, creationToken?: string) {
  const isSold = form.status === "مبيوعة";
  const isDelivery = isSold && form.paymentType === "موعد";
  const isInstallment = isSold && form.paymentType === "اقساط";
  const isDeferred = isSold && form.paymentType !== "كاش";
  const months = Math.max(1, Number(form.installmentMonths) || 1);
  // Pass raw form strings for money fields — serializeTauriMoneyArgs + moneyToStorage
  // (via toMoney, which strips commas) will normalize them at the IPC boundary so we
  // never lose precision by going through JS Number() coercion.
  const remaining = form.amountRemaining;
  const paid = form.amountPaid;
  // Use Decimal division to avoid JS floating-point errors on money.
  // moneyDiv returns a Decimal; moneyToStorage serializes it for IPC.
  const monthlyPayment = moneyDiv(form.amountRemaining, months);

  const savedUser = localStorage.getItem("app_current_user");
  const adminName = savedUser ? (JSON.parse(savedUser).display_name || JSON.parse(savedUser).username) : null;

  // FORENSIC FIX (re-audit 2026-07-11, FORENSIC-FRONT-2-4):
  // Pass creationToken to backend for idempotency (§31.2/§31.5.3).
  return {
    carId: form.carId ?? null,
    expectedVersion: form.expectedVersion ?? null,
    num: form.num.trim(),
    chassis: form.chassis.trim(),
    model: form.model.trim(),
    year: form.year.trim(),
    name: form.name.trim(),
    color: form.color.trim(),
    details: form.details.trim(),
    purchase: form.purchase,
    selling: form.selling,
    status: form.status,
    paymentType: isSold ? form.paymentType : null,
    cashPrice: isSold && (form.paymentType === "كاش" || form.paymentType === "موعد") ? paid : null,
    amountPaid: isSold ? paid : null,
    amountRemaining: isDeferred ? remaining : null,
    installmentMonths: isInstallment ? months : null,
    monthlyPayment: isInstallment ? monthlyPayment : null,
    buyerName: isSold ? form.buyerName.trim() || null : null,
    buyerPhone: isSold ? normalizePhoneNumber(form.phone) || null : null,
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
    carPartners: null,
    adminName,
    creationToken: creationToken ?? null,
  };
}

export async function callTauri<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const serializedArgs = serializeTauriMoneyArgs(args) as Record<string, unknown>;

  if (isTauri()) {
    return invoke<T>(command, serializedArgs);
  }

  // FORENSIC FIX (re-audit 2026-07-11, MOCK-ISOLATION-1):
  // Production builds MUST NOT silently fall back to the localStorage mock.
  // The mock is for browser-only development and UI tests; in a packaged
  // desktop app, missing Tauri IPC means the backend is broken and the user
  // must see a hard error, not a fake success.
  //
  // See §6.2 of the executive prompt: "في Production، غياب Tauri يجب أن يكون
  // خطأ واضحاً، لا تشغيل Backend وهمي".
  if (import.meta.env.PROD) {
    throw new Error(
      `[fajr-alwadi] Backend unavailable in production: Tauri IPC bridge not detected ` +
      `(command=${command}). This indicates a packaging or build error; the app ` +
      `must run inside the Tauri webview to access the Rust/SQLite backend.`,
    );
  }

  // FORENSIC FIX (re-audit 2026-07-11, MOCK-ISOLATION-2):
  // The localStorage-based mock layer has been DELETED. There is no
  // browser-only fallback anymore — the backend (Rust + SQLite via Tauri
  // IPC) is the single source of truth, both in production AND in
  // development. If you are running the app outside the Tauri webview
  // (e.g. `npm run dev` in a plain browser tab), every callTauri() will
  // throw a hard error so the failure is impossible to miss.
  throw new Error(
    `[fajr-alwadi] Backend unavailable: Tauri IPC bridge not detected ` +
    `(command=${command}). Run the app inside the Tauri webview (npm run tauri dev).`,
  );
}
