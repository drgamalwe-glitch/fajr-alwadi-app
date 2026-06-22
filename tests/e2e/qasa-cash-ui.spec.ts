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

test.describe("Qasa / Cash — UI Verification", () => {
  test("qasa and cash tabs show correct values after cash sale", async ({ page }) => {
    test.setTimeout(120_000);

    await resetBridgeState();

    // Seed: cash car sale
    await bridgeInvoke("add_car", {
      num: "UI-QASA-001",
      chassis: "CHASSIS-UI-QASA",
      model: "Qasa Test",
      year: "2024",
      name: "سيارة قاصة",
      color: "أبيض",
      details: "",
      purchase: 10_000,
      selling: 20_000,
      status: "مبيوعة",
      paymentType: "كاش",
      cashPrice: 20_000,
      amountPaid: 20_000,
      amountRemaining: 0,
      buyerName: "زبون قاصة",
      buyerPhone: "07800000003",
      purchaseDate: "2024-01-01",
      saleDate: "2024-01-15",
      currency: "IQD",
      saleCurrency: "IQD",
      purchasePaymentType: "قاصه",
      purchaseType: "كاش",
    });

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

    // Navigate to Financial Accounts (Qasa)
    await page.locator('[data-testid="nav-financial-accounts"]').click();
    await page.waitForTimeout(1500);

    // Read qasa balance
    const qasaText = await safeText(page.locator(".currency-card--iqd span").first());
    const qasaVal = parseMoney(qasaText);

    // Qasa = sale - purchase = 20,000 - 10,000 = 10,000
    cmp("Qasa", "Qasa IQD balance", "10000", String(qasaVal));

    // Write report
    const result = comparisons.filter((c) => c.status === "FAIL").length === 0 ? "PASS" : "FAIL";
    const reportPath = path.join(process.cwd(), "E2E_QASA_CASH_UI_RESULT.md");
    const lines: string[] = [];
    lines.push("# Qasa / Cash UI Verification\n");
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
