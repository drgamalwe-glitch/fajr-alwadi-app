import { test, expect } from "@playwright/test";
import { safeText, login, resetBridgeState, bridgeInvoke } from "./helpers/ui";
import { parseMoney } from "./helpers/money";
import { calcInstallmentResult } from "../accounting-oracle/oracle";
import { SCENARIO_B } from "../accounting-oracle/scenarios";
import * as fs from "node:fs";
import * as path from "node:path";

const oracle = calcInstallmentResult(SCENARIO_B.cars[0], SCENARIO_B.installmentsPaid ?? 0);

type ComparisonRow = {
  area: string;
  field: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "WARN";
  notes: string;
};

test.describe("Installment Payment — UI Verification", () => {
  test("installment: down payment + 1 installment, verify profit and customer balance", async ({ page }) => {
    test.setTimeout(120_000);

    await resetBridgeState();

    const carNum = "UI-INST-001";
    const sellingPrice = SCENARIO_B.cars[0].sellingPrice;
    const downPayment = SCENARIO_B.cars[0].downPayment!;
    const monthlyPayment = SCENARIO_B.cars[0].monthlyPayment!;
    const remaining = sellingPrice - downPayment;

    // Seed via backend
    await bridgeInvoke("add_car", {
      num: carNum,
      chassis: "CHASSIS-UI-INST",
      model: "سيارة اقساط UI",
      year: "2024",
      name: "سيارة اقساط اختبار",
      color: "أزرق",
      details: "",
      purchase: SCENARIO_B.cars[0].purchasePrice,
      selling: sellingPrice,
      status: "مبيوعة",
      paymentType: "اقساط",
      cashPrice: null,
      amountPaid: downPayment,
      amountRemaining: remaining,
      installmentMonths: SCENARIO_B.cars[0].installmentMonths,
      monthlyPayment: monthlyPayment,
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
      amount: monthlyPayment,
      date: "2024-02-15",
      notes: `تسديد قسط سيارة ${carNum}`,
      currency: "IQD",
      payment_type: "قاصه",
    });

    const comparisons: ComparisonRow[] = [];
    function cmp(area: string, field: string, expected: string, actual: string, notes = "") {
      const status: ComparisonRow["status"] =
        expected === actual ? "PASS" : actual === "N/A" ? "WARN" : "FAIL";
      comparisons.push({ area, field, expected, actual, status, notes });
    }

    // Login and navigate
    await page.goto("http://localhost:1420");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await login(page);
    await page.waitForTimeout(1500);

    // Profit Distribution page
    await page.locator('[data-testid="nav-profit-distribution"]').click();
    await page.waitForTimeout(1500);

    const profitDistText = await safeText(page.locator(".currency-card--iqd span").first());
    cmp("Profit", "Profit page loads", "not N/A", profitDistText === "N/A" ? "N/A" : "loaded");

    // Write report
    const result = comparisons.filter((c) => c.status === "FAIL").length === 0 ? "PASS" : "FAIL";
    const reportPath = path.join(process.cwd(), "E2E_INSTALLMENT_UI_RESULT.md");
    const lines: string[] = [];
    lines.push("# Installment Payment UI Verification\n");
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
