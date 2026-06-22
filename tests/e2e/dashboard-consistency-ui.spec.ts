import { test, expect } from "@playwright/test";
import { safeText, login, resetBridgeState, bridgeInvoke } from "./helpers/ui";
import { parseMoney } from "./helpers/money";
import * as fs from "node:fs";
import * as path from "node:path";

type ComparisonRow = {
  area: string;
  field: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "WARN";
};

test.describe("Dashboard Consistency — UI Verification", () => {
  test("dashboard cards match backend values", async ({ page }) => {
    test.setTimeout(120_000);

    await resetBridgeState();

    // Seed: add one cash car sale
    await bridgeInvoke("add_car", {
      num: "UI-DASH-001",
      chassis: "CHASSIS-UI-DASH",
      model: "Dashboard Test",
      year: "2024",
      name: "سيارة داشبورد",
      color: "أبيض",
      details: "",
      purchase: 10_000,
      selling: 20_000,
      status: "مبيوعة",
      paymentType: "كاش",
      cashPrice: 20_000,
      amountPaid: 20_000,
      amountRemaining: 0,
      buyerName: "زبون داشبورد",
      buyerPhone: "07800000002",
      purchaseDate: "2024-01-01",
      saleDate: "2024-01-15",
      currency: "IQD",
      saleCurrency: "IQD",
      purchasePaymentType: "قاصه",
      purchaseType: "كاش",
    });

    // Get backend values
    const summary = await bridgeInvoke<any>("get_financial_summary", {});
    const profitDist = await bridgeInvoke<any>("get_profit_distribution_summary", {});

    const comparisons: ComparisonRow[] = [];
    function cmp(area: string, field: string, expected: string, actual: string) {
      const status: ComparisonRow["status"] =
        expected === actual ? "PASS" : actual === "N/A" ? "WARN" : "FAIL";
      comparisons.push({ area, field, expected, actual, status });
    }

    // Login
    await page.goto("http://localhost:1420");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await login(page);
    await page.waitForTimeout(1500);

    // Read dashboard values
    const dashQasa = await safeText(page.locator(".qasa-iqd span").first());
    const dashInv = await safeText(page.locator(".inventory-iqd span").first());

    // Compare with backend
    cmp("Dashboard", "Qasa matches backend", String(summary.qasa_iqd), String(parseMoney(dashQasa)));
    cmp("Dashboard", "Inventory matches backend", String(summary.inventory_value_iqd), String(parseMoney(dashInv)));

    // Company Status
    await page.locator('[data-testid="subtab-company-status"]').click();
    await page.waitForTimeout(1000);

    const csCash = await safeText(page.locator('[data-testid="card-cash"] .number'));
    const csInv = await safeText(page.locator('[data-testid="card-inventory"] .number'));
    const csCompany = await safeText(page.locator('[data-testid="company-value-iqd"]'));

    cmp("Company Status", "Cash card matches backend", String(summary.cash_iqd), String(parseMoney(csCash)));
    cmp("Company Status", "Inventory card matches backend", String(summary.inventory_value_iqd), String(parseMoney(csInv)));

    // Write report
    const result = comparisons.filter((c) => c.status === "FAIL").length === 0 ? "PASS" : "FAIL";
    const reportPath = path.join(process.cwd(), "E2E_DASHBOARD_CONSISTENCY_RESULT.md");
    const lines: string[] = [];
    lines.push("# Dashboard Consistency UI Verification\n");
    lines.push(`- **Backend mode:** E2E_BRIDGE`);
    lines.push(`- **Result:** ${result}\n`);
    lines.push("| Area | Field | Expected | Actual | Status |");
    lines.push("|---|---|---|---|---|");
    for (const c of comparisons) {
      lines.push(`| ${c.area} | ${c.field} | ${c.expected} | ${c.actual} | ${c.status} |`);
    }
    fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");

    expect(comparisons.filter((c) => c.status === "FAIL")).toEqual([]);
  });
});
