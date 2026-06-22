import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LayerResult, UiCheck } from "../shared/result-collector";

const BRIDGE_URL = "http://127.0.0.1:3899";
const BASE_URL = "http://localhost:1420";
const RESULTS_DIR = path.resolve(process.cwd(), ".test-results");
const RESULTS_FILE = path.join(RESULTS_DIR, "all-results.json");

function ensureDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function appendResult(result: LayerResult) {
  ensureDir();
  let existing: LayerResult[] = [];
  try { existing = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8")); } catch {}
  existing.push(result);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2), "utf-8");
}

async function bridgeInvoke<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}/__e2e/invoke`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "bridge error");
  return json.data as T;
}

async function bridgeReset() {
  await fetch(`${BRIDGE_URL}/__e2e/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
}

async function safeText(locator: ReturnType<Page["locator"]>): Promise<string> {
  try {
    if ((await locator.count()) === 0) return "N/A";
    return (await locator.first().textContent() ?? "").trim();
  } catch { return "N/A"; }
}

function parseMoney(text: string): number {
  if (!text || text === "N/A") return NaN;
  const cleaned = text.replace(/[^\d.,\-]/g, "").replace(/,/g, "");
  return parseFloat(cleaned) || 0;
}

async function login(page: Page) {
  await page.locator('[data-testid="login-username"]').fill("admin");
  await page.locator('[data-testid="login-password"]').fill("admin");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('[data-testid="nav-dashboard"]').waitFor({ timeout: 15_000 });
}

async function setupAndLogin(page: Page) {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await login(page);
  await page.waitForTimeout(2000);
}

function writeUiResult(id: string, name: string, uiChecks: UiCheck[], t0: number) {
  const pass = uiChecks.every((c) => c.pass);
  const failureReason = pass ? "" : uiChecks.filter((c) => !c.pass)
    .map((c) => `${c.tab}/${c.element}: متوقع ${c.expected}، فعلي ${c.actual}`).join("; ");
  appendResult({
    scenarioId: id, scenarioName: name, layer: "CHROMIUM_UI",
    backendMode: "E2E_BRIDGE", executionTimeMs: Date.now() - t0,
    pass, failureReason, uiChecks,
    expected: {}, actual: {}, rows: [],
  });
  return pass;
}

// ─── S01 UI: Cash car purchase ─────────────────────────────────────

test.describe("S01: شراء سيارة كاش — فحص الواجهة", () => {
  test("شراء كاش: التحقق من المخزون والقاصة", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-S01", chassis: "CH-UI-S01", model: "سيارة S01", year: "2024",
      name: "سيارة اختبار S01", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    const s = await bridgeInvoke<any>("get_financial_summary", {});
    await setupAndLogin(page);

    // Dashboard — Inventory
    const invText = await safeText(page.locator(".inventory-iqd span").first());
    const invVal = parseMoney(invText);
    uiChecks.push({ tab: "لوحة التحكم", element: "قيمة المخزون", expected: "10000000", actual: String(invVal), pass: !isNaN(invVal) && Math.abs(invVal - 10_000_000) < 1 });

    // Dashboard — Qasa
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "-10000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - (-10_000_000)) < 1 });

    // Dashboard — Profit
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "0", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal) < 1 });

    const pass = writeUiResult("S01", "شراء سيارة كاش", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S05 UI: Cash sale ─────────────────────────────────────────────

test.describe("S05: بيع كاش — فحص الواجهة", () => {
  test("بيع كاش: التحقق من القاصة والربح", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-S05", chassis: "CH-UI-S05", model: "سيارة S05", year: "2024",
      name: "سيارة اختبار S05", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });
    await bridgeInvoke("sell_car_with_accounting", {
      carNumber: "UI-S05", sellingPrice: 16_000_000, paymentType: "كاش",
      amountPaid: 16_000_000, amountRemaining: 0,
      buyerName: "زبون S05", buyerPhone: "07800000005",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    await setupAndLogin(page);

    // Dashboard — Qasa = 6M
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "6000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - 6_000_000) < 1 });

    // Dashboard — Inventory = 0
    const invText = await safeText(page.locator(".inventory-iqd span").first());
    const invVal = parseMoney(invText);
    uiChecks.push({ tab: "لوحة التحكم", element: "قيمة المخزون", expected: "0", actual: String(invVal), pass: !isNaN(invVal) && Math.abs(invVal) < 1 });

    // Dashboard — Profit = 6M
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "6000000", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal - 6_000_000) < 1 });

    // Profit Distribution page
    await page.locator('[data-testid="nav-profit-distribution"]').click();
    await page.waitForTimeout(2000);
    const distText = await safeText(page.locator(".currency-card--iqd span").first());
    const distVal = parseMoney(distText);
    uiChecks.push({ tab: "توزيع الارباح", element: "اجمالي الارباح", expected: "6000000", actual: String(distVal), pass: !isNaN(distVal) && Math.abs(distVal - 6_000_000) < 1 });

    const pass = writeUiResult("S05", "بيع كاش بعد شراء كاش", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S22 UI: General expense ───────────────────────────────────────

test.describe("S22: مصروف عام — فحص الواجهة", () => {
  test("مصروف عام: التحقق من القاصة والربح", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_expense", {
      description: "ايجار", amount: 1_000_000, date: "2024-02-01", currency: "IQD",
    });

    const s = await bridgeInvoke<any>("get_financial_summary", {});
    await setupAndLogin(page);

    // Dashboard — Qasa = -1M
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "-1000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - (-1_000_000)) < 1 });

    // Dashboard — Profit = -1M (strict signed)
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "-1000000", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal - (-1_000_000)) < 1 });

    const pass = writeUiResult("S22", "مصروف عام", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S08 UI: Cash sale with car expense ────────────────────────────

test.describe("S08: بيع كاش مع مصروف سيارة — فحص الواجهة", () => {
  test("بيع كاش مع مصروف سيارة: التحقق من القاصة والربح", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-S08", chassis: "CH-UI-S08", model: "سيارة S08", year: "2024",
      name: "سيارة اختبار S08", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });
    await bridgeInvoke("add_car_expense_record", {
      carNumber: "UI-S08", description: "اصلاح", amount: 2_000_000,
      date: "2024-01-05", currency: "IQD",
    });
    await bridgeInvoke("sell_car_with_accounting", {
      carNumber: "UI-S08", sellingPrice: 18_000_000, paymentType: "كاش",
      amountPaid: 18_000_000, amountRemaining: 0,
      buyerName: "زبون S08", buyerPhone: "07800000008",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    await setupAndLogin(page);

    // Dashboard — Qasa = 6M (18M sale - 10M purchase - 2M expense)
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "6000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - 6_000_000) < 1 });

    // Dashboard — Profit = 6M (18M - 10M - 2M)
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "6000000", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal - 6_000_000) < 1 });

    const pass = writeUiResult("S08", "بيع كاش مع مصروف سيارة", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S09 UI: Cash sale at loss ─────────────────────────────────────

test.describe("S09: بيع كاش بخسارة — فحص الواجهة", () => {
  test("بيع كاش بخسارة: التحقق من القاصة", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-S09", chassis: "CH-UI-S09", model: "سيارة S09", year: "2024",
      name: "سيارة اختبار S09", color: "أبيض", details: "",
      purchase: 20_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });
    await bridgeInvoke("sell_car_with_accounting", {
      carNumber: "UI-S09", sellingPrice: 17_000_000, paymentType: "كاش",
      amountPaid: 17_000_000, amountRemaining: 0,
      buyerName: "زبون S09", buyerPhone: "07800000009",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });

    await setupAndLogin(page);

    // Dashboard — Qasa = -3M (17M sale - 20M purchase)
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "-3000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - (-3_000_000)) < 1 });

    // Dashboard — Profit = 0 (loss not recognized as negative profit)
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "0", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal) < 1 });

    const pass = writeUiResult("S09", "بيع كاش بخسارة", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S10 UI: Installment after down payment ────────────────────────

test.describe("S10: بيع بالاقساط — بعد المقدمة — فحص الواجهة", () => {
  test("اقساط بعد المقدمة: التحقق من القاصة والربح", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-S10", chassis: "CH-UI-S10", model: "سيارة S10", year: "2024",
      name: "سيارة اختبار S10", color: "أبيض", details: "",
      purchase: 10_000_000, selling: 20_000_000,
      status: "مبيوعة", paymentType: "اقساط",
      amountPaid: 5_000_000, amountRemaining: 15_000_000,
      installmentMonths: 15, monthlyPayment: 1_000_000,
      buyerName: "زبون S10", buyerPhone: "07800000010",
      purchaseDate: "2024-01-01", saleDate: "2024-01-15",
      firstPaymentDate: "2024-02-15",
      currency: "IQD", saleCurrency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    await setupAndLogin(page);

    // Dashboard — Qasa = -5M (5M down - 10M purchase)
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "-5000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - (-5_000_000)) < 1 });

    // Dashboard — Profit = 2.5M (50% of 5M down payment)
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "2500000", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal - 2_500_000) < 1 });

    const pass = writeUiResult("S10", "بيع بالاقساط — بعد المقدمة", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S11 UI: Installment after one payment ─────────────────────────

test.describe("S11: بيع بالاقساط — بعد قسط واحد — فحص الواجهة", () => {
  test("اقساط بعد قسط واحد: التحقق من القاصة والربح", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-S11", chassis: "CH-UI-S11", model: "سيارة S11", year: "2024",
      name: "سيارة اختبار S11", color: "أبيض", details: "",
      purchase: 10_000_000, selling: 20_000_000,
      status: "مبيوعة", paymentType: "اقساط",
      amountPaid: 5_000_000, amountRemaining: 15_000_000,
      installmentMonths: 15, monthlyPayment: 1_000_000,
      buyerName: "زبون S11", buyerPhone: "07800000011",
      purchaseDate: "2024-01-01", saleDate: "2024-01-15",
      firstPaymentDate: "2024-02-15",
      currency: "IQD", saleCurrency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    // Pay one installment
    await bridgeInvoke("add_partner_transaction", {
      partner_name: "زبون S11", kind: "زبون",
      type_: "تسديد قسط سيارة", amount: 1_000_000,
      date: "2024-02-15", notes: "تسديد قسط سيارة UI-S11",
      currency: "IQD", payment_type: "قاصه",
    });

    await setupAndLogin(page);

    // Dashboard — Qasa = -4M (-10M purchase + 5M down + 1M installment)
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "-4000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - (-4_000_000)) < 1 });

    // Dashboard — Profit = 3M (2.5M down + 0.5M installment)
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "3000000", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal - 3_000_000) < 1 });

    const pass = writeUiResult("S11", "بيع بالاقساط — بعد قسط واحد", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S12 UI: Installment after all payments ────────────────────────

test.describe("S12: بيع بالاقساط — بعد كل الدفعات — فحص الواجهة", () => {
  test("اقساط بعد كل الدفعات: التحقق من القاصة والربح", async ({ page }) => {
    test.setTimeout(180_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-S12", chassis: "CH-UI-S12", model: "سيارة S12", year: "2024",
      name: "سيارة اختبار S12", color: "أبيض", details: "",
      purchase: 10_000_000, selling: 20_000_000,
      status: "مبيوعة", paymentType: "اقساط",
      amountPaid: 5_000_000, amountRemaining: 15_000_000,
      installmentMonths: 15, monthlyPayment: 1_000_000,
      buyerName: "زبون S12", buyerPhone: "07800000012",
      purchaseDate: "2024-01-01", saleDate: "2024-01-15",
      firstPaymentDate: "2024-02-15",
      currency: "IQD", saleCurrency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });

    // Pay all 15 installments
    for (let i = 0; i < 15; i++) {
      await bridgeInvoke("add_partner_transaction", {
        partner_name: "زبون S12", kind: "زبون",
        type_: "تسديد قسط سيارة", amount: 1_000_000,
        date: `2024-${String(i + 2).padStart(2, "0")}-15`,
        notes: "تسديد قسط سيارة UI-S12",
        currency: "IQD", payment_type: "قاصه",
      });
    }

    await setupAndLogin(page);

    // Dashboard — Qasa = 10M (-10M purchase + 5M down + 15M installments)
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "10000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - 10_000_000) < 1 });

    // Dashboard — Profit = 10M (full car profit)
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "10000000", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal - 10_000_000) < 1 });

    const pass = writeUiResult("S12", "بيع بالاقساط — بعد كل الدفعات", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S23 UI: General expense after car profit ──────────────────────

test.describe("S23: مصروف عام بعد ربح سيارة — فحص الواجهة", () => {
  test("مصروف عام بعد ربح سيارة: التحقق من القاصة والربح", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-S23", chassis: "CH-UI-S23", model: "سيارة S23", year: "2024",
      name: "سيارة اختبار S23", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });
    await bridgeInvoke("sell_car_with_accounting", {
      carNumber: "UI-S23", sellingPrice: 18_000_000, paymentType: "كاش",
      amountPaid: 18_000_000, amountRemaining: 0,
      buyerName: "زبون S23", buyerPhone: "07800000023",
      saleDate: "2024-01-15", saleCurrency: "IQD",
    });
    await bridgeInvoke("add_expense", {
      description: "ايجار", amount: 1_000_000, date: "2024-02-01", currency: "IQD",
    });

    await setupAndLogin(page);

    // Dashboard — Qasa = 7M (18M sale - 10M purchase - 1M expense)
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "7000000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - 7_000_000) < 1 });

    // Dashboard — Profit = 7M (8M car profit - 1M expense)
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "7000000", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal - 7_000_000) < 1 });

    const pass = writeUiResult("S23", "مصروف عام بعد ربح سيارة", uiChecks, t0);
    expect(pass).toBe(true);
  });
});

// ─── S56 UI: Company status ────────────────────────────────────────

test.describe("S56: حالة الشركة — فحص الواجهة", () => {
  test("حالة الشركة بعد عمليات مختلطة", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];

    await bridgeReset();
    // Deposits
    await bridgeInvoke("add_partner_transaction", { partner_name: "أمير", kind: "شريك", type_: "ايداع شريك", amount: 15_000_000, date: "2024-01-01", currency: "IQD", payment_type: "قاصه" });
    await bridgeInvoke("add_partner_transaction", { partner_name: "منتصر", kind: "شريك", type_: "ايداع شريك", amount: 15_000_000, date: "2024-01-01", currency: "IQD", payment_type: "قاصه" });
    // Buy and sell car
    await bridgeInvoke("add_car", { num: "UI-S56", chassis: "CH-UI-S56", model: "سيارة S56", year: "2024", name: "سيارة اختبار S56", color: "أبيض", details: "", purchase: 10_000_000, status: "متوفرة", purchaseDate: "2024-01-05", currency: "IQD", purchasePaymentType: "قاصه", purchaseType: "كاش" });
    await bridgeInvoke("sell_car_with_accounting", { carNumber: "UI-S56", sellingPrice: 18_000_000, paymentType: "كاش", amountPaid: 18_000_000, amountRemaining: 0, buyerName: "زبون S56", buyerPhone: "07800000056", saleDate: "2024-01-10", saleCurrency: "IQD" });
    // Expense
    await bridgeInvoke("add_expense", { description: "مصاريف", amount: 500_000, date: "2024-01-15", currency: "IQD" });

    await setupAndLogin(page);

    // Dashboard values
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({ tab: "لوحة التحكم", element: "القاصة", expected: "37500000", actual: String(qasaVal), pass: !isNaN(qasaVal) && Math.abs(qasaVal - 37_500_000) < 1 });

    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({ tab: "لوحة التحكم", element: "الربح", expected: "7500000", actual: String(profitVal), pass: !isNaN(profitVal) && Math.abs(profitVal - 7_500_000) < 1 });

    const pass = writeUiResult("S56", "حالة الشركة بعد عمليات مختلطة", uiChecks, t0);
    expect(pass).toBe(true);
  });
});
