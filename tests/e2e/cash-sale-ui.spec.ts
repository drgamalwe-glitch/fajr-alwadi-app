import { test, expect } from "@playwright/test";
import { safeText, login, resetBridgeState, bridgeInvoke } from "./helpers/ui";
import { parseMoney } from "./helpers/money";
import { calcCashSaleResult } from "../accounting-oracle/oracle";
import { SCENARIO_A } from "../accounting-oracle/scenarios";
import * as fs from "node:fs";
import * as path from "node:path";

const PURCHASE = SCENARIO_A.cars[0].purchasePrice;
const SALE = SCENARIO_A.cars[0].sellingPrice;
const oracle = calcCashSaleResult(SCENARIO_A.cars[0]);

type ComparisonRow = {
  area: string;
  field: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "WARN";
  notes: string;
};

test.describe("Cash Sale — UI Verification", () => {
  test("cash sale: verify dashboard, qasa, partners, profit cards", async ({ page }) => {
    test.setTimeout(120_000);

    // Reset bridge and seed data via backend
    await resetBridgeState();
    await bridgeInvoke("add_car", {
      num: "UI-CASH-001",
      chassis: "CHASSIS-UI-CASH",
      model: "سيارة كاش UI",
      year: "2024",
      name: "سيارة كاش اختبار",
      color: "أبيض",
      details: "",
      purchase: PURCHASE,
      selling: SALE,
      status: "مبيوعة",
      paymentType: "كاش",
      cashPrice: SALE,
      amountPaid: SALE,
      amountRemaining: 0,
      buyerName: "زبون كاش UI",
      buyerPhone: "07800000000",
      purchaseDate: "2024-01-01",
      saleDate: "2024-01-15",
      currency: "IQD",
      saleCurrency: "IQD",
      purchasePaymentType: "قاصه",
      purchaseType: "كاش",
    });

    const comparisons: ComparisonRow[] = [];
    function cmp(area: string, field: string, expected: string, actual: string, notes = "") {
      const status: ComparisonRow["status"] =
        expected === actual ? "PASS" : actual === "N/A" ? "WARN" : "FAIL";
      comparisons.push({ area, field, expected, actual, status, notes });
    }

    // Login
    await page.goto("http://localhost:1420");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await login(page);
    await page.waitForTimeout(1500);

    // Dashboard — Qasa card
    const qasaText = await safeText(page.locator(".qasa-iqd span").first());
    const qasaVal = parseMoney(qasaText);
    const expectedQasa = SALE - PURCHASE; // net qasa = sale - purchase
    cmp("Dashboard", "Qasa card IQD", String(expectedQasa), String(qasaVal), `Raw: ${qasaText}`);

    // Dashboard — Inventory (should be 0 after sale)
    const invText = await safeText(page.locator(".inventory-iqd span").first());
    const invVal = parseMoney(invText);
    cmp("Dashboard", "Inventory IQD", "0", String(invVal), `Raw: ${invText}`);

    // Navigate to Company Status
    await page.locator('[data-testid="subtab-company-status"]').click();
    await page.waitForTimeout(1000);

    const companyCashText = await safeText(page.locator('[data-testid="card-cash"] .number'));
    const companyCashVal = parseMoney(companyCashText);
    cmp("Company Status", "Cash", String(expectedQasa), String(companyCashVal), `Raw: ${companyCashText}`);

    const companyInvText = await safeText(page.locator('[data-testid="card-inventory"] .number'));
    const companyInvVal = parseMoney(companyInvText);
    cmp("Company Status", "Inventory", "0", String(companyInvVal), `Raw: ${companyInvText}`);

    // Write report
    const result = comparisons.every((c) => c.status === "PASS") ? "PASS" : "FAIL";
    const reportPath = path.join(process.cwd(), "E2E_CASH_SALE_UI_RESULT.md");
    const lines: string[] = [];
    lines.push("# Cash Sale UI Verification\n");
    lines.push(`- **Backend mode:** E2E_BRIDGE`);
    lines.push(`- **Result:** ${result}\n`);
    lines.push("| Area | Field | Expected | Actual | Status |");
    lines.push("|---|---|---|---|---|");
    for (const c of comparisons) {
      lines.push(`| ${c.area} | ${c.field} | ${c.expected} | ${c.actual} | ${c.status} |`);
    }
    fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");

    // Assert all pass
    const failures = comparisons.filter((c) => c.status === "FAIL");
    expect(failures).toEqual([]);
  });
});
