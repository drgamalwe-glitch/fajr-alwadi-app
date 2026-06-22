import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  scenarioCashSaleOracle,
  scenarioInstallmentOracle,
  scenarioGeneralExpenseOracle,
} from "../accounting-oracle/oracle";
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
  try {
    existing = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
  } catch {}
  existing.push(result);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2), "utf-8");
}

async function bridgeInvoke<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}/__e2e/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  } catch {
    return "N/A";
  }
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

// ─── Scenario A: Cash Sale UI ─────────────────────────────────────

test.describe("السيناريو أ: بيع كاش — فحص الواجهة", () => {
  test("بيع كاش: شراء ثم بيع — التحقق من لوحة التحكم والقاصة", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];
    let failureReason = "";

    // Step 1: Purchase car (available, not sold)
    await bridgeReset();
    await bridgeInvoke("add_car", {
      num: "UI-CASH-001",
      chassis: "CHASSIS-UI-CASH",
      model: "سيارة كاش UI",
      year: "2024",
      name: "سيارة كاش اختبار",
      color: "أبيض",
      details: "",
      purchase: 10_000,
      status: "متوفرة",
      purchaseDate: "2024-01-01",
      currency: "IQD",
      purchasePaymentType: "قاصه",
      purchaseType: "كاش",
    });

    // Verify after purchase
    const afterPurchase = await bridgeInvoke<any>("get_financial_summary", {});
    uiChecks.push({
      tab: "بعد الشراء",
      element: "قيمة المخزون",
      expected: "10000",
      actual: String(afterPurchase.inventory_value_iqd),
      pass: afterPurchase.inventory_value_iqd === 10_000,
    });
    uiChecks.push({
      tab: "بعد الشراء",
      element: "القاصة",
      expected: "-10000",
      actual: String(afterPurchase.qasa_iqd),
      pass: afterPurchase.qasa_iqd === -10_000,
    });
    uiChecks.push({
      tab: "بعد الشراء",
      element: "رأس مال الشركاء",
      expected: "-10000",
      actual: String(afterPurchase.total_partner_capital_iqd),
      pass: afterPurchase.total_partner_capital_iqd === -10_000,
    });
    uiChecks.push({
      tab: "بعد الشراء",
      element: "الربح",
      expected: "0",
      actual: String(afterPurchase.monthly_profits_iqd),
      pass: afterPurchase.monthly_profits_iqd === 0,
    });

    // Verify no sale rows after purchase
    const amirTxPurchase: any[] = await bridgeInvoke("get_partner_transactions", {
      partner_name: "أمير",
      kind: "شريك",
    });
    const saleRowsAfterPurchase = amirTxPurchase.filter((tx: any) => tx.source_type === "car_sale");
    uiChecks.push({
      tab: "بعد الشراء",
      element: "صفوف البيع",
      expected: "0",
      actual: String(saleRowsAfterPurchase.length),
      pass: saleRowsAfterPurchase.length === 0,
    });

    // Step 2: Sell car for cash
    await bridgeInvoke("sell_car_with_accounting", {
      carNumber: "UI-CASH-001",
      sellingPrice: 20_000,
      paymentType: "كاش",
      amountPaid: 20_000,
      amountRemaining: 0,
      buyerName: "زبون كاش UI",
      buyerPhone: "07800000000",
      saleDate: "2024-01-15",
      saleCurrency: "IQD",
    });

    // Verify after sale
    const afterSale = await bridgeInvoke<any>("get_financial_summary", {});
    const expectedQasa = 10_000;
    const expectedInventory = 0;
    const expectedProfit = 10_000;

    uiChecks.push({
      tab: "بعد البيع",
      element: "قيمة المخزون",
      expected: String(expectedInventory),
      actual: String(afterSale.inventory_value_iqd),
      pass: afterSale.inventory_value_iqd === expectedInventory,
    });
    uiChecks.push({
      tab: "بعد البيع",
      element: "القاصة الصافية",
      expected: String(expectedQasa),
      actual: String(afterSale.qasa_iqd),
      pass: afterSale.qasa_iqd === expectedQasa,
    });
    uiChecks.push({
      tab: "بعد البيع",
      element: "الربح",
      expected: String(expectedProfit),
      actual: String(afterSale.monthly_profits_iqd),
      pass: afterSale.monthly_profits_iqd === expectedProfit,
    });

    // Verify partner profits (5000 each)
    const profitDist = await bridgeInvoke<any>("get_profit_distribution_summary", {});
    const amirProfit = profitDist.partners.find((p: any) => p.partner_name === "أمير");
    const muntasirProfit = profitDist.partners.find((p: any) => p.partner_name === "منتصر");
    uiChecks.push({
      tab: "بعد البيع",
      element: "ربح أمير",
      expected: "5000",
      actual: String(amirProfit?.profit_iqd ?? 0),
      pass: (amirProfit?.profit_iqd ?? 0) === 5_000,
    });
    uiChecks.push({
      tab: "بعد البيع",
      element: "ربح منتصر",
      expected: "5000",
      actual: String(muntasirProfit?.profit_iqd ?? 0),
      pass: (muntasirProfit?.profit_iqd ?? 0) === 5_000,
    });

    // Verify no duplicate rows
    const amirTx: any[] = await bridgeInvoke("get_partner_transactions", {
      partner_name: "أمير",
      kind: "شريك",
    });
    const amirCashRows = amirTx.filter((tx: any) => tx.source_type === "car_sale" && tx.source_role === "cash_movement");
    const amirProfitRows = amirTx.filter((tx: any) => tx.source_type === "car_sale" && tx.source_role === "profit_recognition");
    uiChecks.push({
      tab: "بعد البيع",
      element: "صفوف حركة النقد (لا تكرار)",
      expected: "1",
      actual: String(amirCashRows.length),
      pass: amirCashRows.length === 1,
    });
    uiChecks.push({
      tab: "بعد البيع",
      element: "صفوف الربح (لا تكرار)",
      expected: "1",
      actual: String(amirProfitRows.length),
      pass: amirProfitRows.length === 1,
    });

    // Verify profit recognition rows do NOT affect qasa or partner cash
    if (amirProfitRows.length > 0) {
      const profRow = amirProfitRows[0];
      uiChecks.push({
        tab: "بعد البيع",
        element: "صف الربح لا يؤثر على القاصة",
        expected: "0",
        actual: String(profRow.affects_qasa),
        pass: profRow.affects_qasa === 0,
      });
      uiChecks.push({
        tab: "بعد البيع",
        element: "صف الربح لا يؤثر على رأس المال",
        expected: "0",
        actual: String(profRow.affects_partner_cash),
        pass: profRow.affects_partner_cash === 0,
      });
    }

    // Login and verify UI values
    await setupAndLogin(page);

    // Dashboard — Qasa card
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({
      tab: "لوحة التحكم",
      element: "بطاقة القاصة (IQD)",
      expected: String(expectedQasa),
      actual: String(qasaVal),
      pass: !isNaN(qasaVal) && Math.abs(qasaVal - expectedQasa) < 1,
    });

    // Dashboard — Inventory
    const invText = await safeText(page.locator(".inventory-iqd span").first());
    const invVal = parseMoney(invText);
    uiChecks.push({
      tab: "لوحة التحكم",
      element: "قيمة المخزون (IQD)",
      expected: String(expectedInventory),
      actual: String(invVal),
      pass: !isNaN(invVal) && Math.abs(invVal - expectedInventory) < 1,
    });

    // Dashboard — Profit card
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({
      tab: "لوحة التحكم",
      element: "بطاقة الربح (IQD)",
      expected: String(expectedProfit),
      actual: String(profitVal),
      pass: !isNaN(profitVal) && Math.abs(profitVal - expectedProfit) < 1,
    });

    // Write result
    const pass = uiChecks.every((c) => c.pass);
    if (!pass) {
      failureReason = uiChecks.filter((c) => !c.pass).map((c) => `${c.tab}/${c.element}: متوقع ${c.expected}، فعلي ${c.actual}`).join("; ");
    }

    appendResult({
      scenarioId: "A",
      scenarioName: "بيع سيارة كاش (شراء ثم بيع)",
      layer: "CHROMIUM_UI",
      backendMode: "E2E_BRIDGE",
      executionTimeMs: Date.now() - t0,
      pass,
      failureReason,
      uiChecks,
      expected: { qasa: expectedQasa, inventory: expectedInventory, profit: expectedProfit, partner1Profit: 5_000, partner2Profit: 5_000 },
      actual: { qasa: qasaVal, inventory: invVal, profit: profitVal },
      rows: [],
    });

    expect(pass).toBe(true);
  });
});

// ─── Scenario B: Installment Sale UI ──────────────────────────────

test.describe("السيناريو ب: بيع بالاقساط — فحص الواجهة", () => {
  test("اقساط: التحقق من توزيع الارباح", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];
    let failureReason = "";

    // Seed via bridge
    await bridgeReset();
    const carNum = "UI-INST-001";
    await bridgeInvoke("add_car", {
      num: carNum,
      chassis: "CHASSIS-UI-INST",
      model: "سيارة اقساط UI",
      year: "2024",
      name: "سيارة اقساط اختبار",
      color: "أزرق",
      details: "",
      purchase: 10_000_000,
      selling: 20_000_000,
      status: "مبيوعة",
      paymentType: "اقساط",
      amountPaid: 5_000_000,
      amountRemaining: 15_000_000,
      installmentMonths: 15,
      monthlyPayment: 1_000_000,
      buyerName: "زبون اقساط UI",
      buyerPhone: "07800000001",
      purchaseDate: "2024-01-01",
      saleDate: "2024-01-15",
      firstPaymentDate: "2024-02-15",
      currency: "IQD",
      saleCurrency: "IQD",
      purchasePaymentType: "قاصه",
      purchaseType: "كاش",
    });

    // Pay one installment
    await bridgeInvoke("add_partner_transaction", {
      partner_name: "زبون اقساط UI",
      kind: "زبون",
      type_: "تسديد قسط سيارة",
      amount: 1_000_000,
      date: "2024-02-15",
      notes: `تسديد قسط سيارة ${carNum}`,
      currency: "IQD",
      payment_type: "قاصه",
    });

    // Get backend values
    const summary = await bridgeInvoke<any>("get_financial_summary", {});
    const expectedProfit = summary.monthly_profits_iqd;

    // Login
    await setupAndLogin(page);

    // 1. Dashboard — Profit card
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    uiChecks.push({
      tab: "لوحة التحكم",
      element: "بطاقة الربح (IQD)",
      expected: String(expectedProfit),
      actual: String(profitVal),
      pass: !isNaN(profitVal) && Math.abs(profitVal - expectedProfit) < 1000,
    });

    // 2. Profit Distribution page
    await page.locator('[data-testid="nav-profit-distribution"]').click();
    await page.waitForTimeout(2000);

    const profitDistText = await safeText(page.locator(".currency-card--iqd span").first());
    const profitDistVal = parseMoney(profitDistText);
    uiChecks.push({
      tab: "توزيع الارباح",
      element: "اجمالي الارباح (IQD)",
      expected: String(expectedProfit),
      actual: String(profitDistVal),
      pass: !isNaN(profitDistVal) && Math.abs(profitDistVal - expectedProfit) < 1000,
    });

    // Write result
    const pass = uiChecks.every((c) => c.pass);
    if (!pass) {
      failureReason = uiChecks.filter((c) => !c.pass).map((c) => `${c.tab}/${c.element}: متوقع ${c.expected}، فعلي ${c.actual}`).join("; ");
    }

    appendResult({
      scenarioId: "B",
      scenarioName: "بيع بالاقساط — مقدمة وقسط واحد",
      layer: "CHROMIUM_UI",
      backendMode: "E2E_BRIDGE",
      executionTimeMs: Date.now() - t0,
      pass,
      failureReason,
      uiChecks,
      expected: { profitTotal: expectedProfit },
      actual: { profitTotal: profitDistVal },
      rows: [],
    });

    expect(pass).toBe(true);
  });
});

// ─── Scenario C: General Expense UI ───────────────────────────────

test.describe("السيناريو ج: مصروف عام — فحص الواجهة", () => {
  test("مصروف عام: التحقق من تاثيره على القاصة", async ({ page }) => {
    test.setTimeout(120_000);
    const t0 = Date.now();
    const uiChecks: UiCheck[] = [];
    let failureReason = "";

    // Seed via bridge — expense only, no cars
    await bridgeReset();
    await bridgeInvoke("add_expense", {
      description: "ايجار",
      amount: 1_000_000,
      date: "2024-02-01",
      currency: "IQD",
    });

    // Get backend values
    const summary = await bridgeInvoke<any>("get_financial_summary", {});
    const expectedQasa = summary.qasa_iqd;
    const expectedProfit = summary.monthly_profits_iqd;

    // Login
    await setupAndLogin(page);

    // 1. Dashboard — Qasa card
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    uiChecks.push({
      tab: "لوحة التحكم",
      element: "بطاقة القاصة (IQD)",
      expected: String(expectedQasa),
      actual: String(qasaVal),
      pass: !isNaN(qasaVal) && Math.abs(qasaVal - expectedQasa) < 1,
    });

    // 2. Dashboard — Profit card
    const profitText = await safeText(page.locator(".profit-iqd span").first());
    const profitVal = parseMoney(profitText);
    // Strict signed comparison — do NOT accept absolute value fallback
    uiChecks.push({
      tab: "لوحة التحكم",
      element: "بطاقة الربح (IQD)",
      expected: String(expectedProfit),
      actual: String(profitVal),
      pass: !isNaN(profitVal) && Math.abs(profitVal - expectedProfit) < 1,
    });

    // Write result
    const pass = uiChecks.every((c) => c.pass);
    if (!pass) {
      failureReason = uiChecks.filter((c) => !c.pass).map((c) => `${c.tab}/${c.element}: متوقع ${c.expected}، فعلي ${c.actual}`).join("; ");
    }

    appendResult({
      scenarioId: "C",
      scenarioName: "مصروف عام — ايجار",
      layer: "CHROMIUM_UI",
      backendMode: "E2E_BRIDGE",
      executionTimeMs: Date.now() - t0,
      pass,
      failureReason,
      uiChecks,
      expected: { qasa: expectedQasa, profit: expectedProfit },
      actual: { qasa: qasaVal, profit: profitVal },
      rows: [],
    });

    expect(pass).toBe(true);
  });
});
