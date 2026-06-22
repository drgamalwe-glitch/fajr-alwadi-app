import { describe, it, expect, beforeEach } from "vitest";
import { bridgeInvoke, bridgeReset } from "../e2e-bridge/e2e-commands";
import { appendResult, type LayerResult } from "../shared/result-collector";

describe("S63 — Read-only functions do not write", () => {
  beforeEach(async () => {
    await bridgeReset();
    // Seed some data
    await bridgeInvoke("add_car", {
      num: "CAR-RO", chassis: "CH-RO", model: "Test", year: "2024",
      name: "سيارة اختبار", color: "أبيض", details: "",
      purchase: 10_000_000, status: "متوفرة",
      purchaseDate: "2024-01-01", currency: "IQD",
      purchasePaymentType: "قاصه", purchaseType: "كاش",
    });
    await bridgeInvoke("add_expense", {
      description: "ايجار", amount: 500_000, date: "2024-01-15", currency: "IQD",
    });
  });

  it("read-only functions produce no side effects", async () => {
    const t0 = Date.now();

    // Capture before counts
    const beforePartners: any[] = await bridgeInvoke("get_partners", {});
    const beforePartnerCount = beforePartners.length;
    const beforeCars: any[] = await bridgeInvoke("get_cars", {});
    const beforeCarCount = beforeCars.length;
    const beforeExpenses: any[] = await bridgeInvoke("get_expenses", {});
    const beforeExpenseCount = beforeExpenses.length;

    // Call all read-only functions 10 times each
    const readOnlyCommands = [
      ["get_financial_summary", {}],
      ["get_profit_distribution_summary", {}],
      ["get_partner_transactions", { partner_name: "أمير", kind: "شريك" }],
      ["get_cash_register_entries", {}],
      ["get_cars", {}],
      ["get_partners", {}],
      ["get_partners_totals", { kind: "شريك" }],
      ["get_unified_accounts", {}],
      ["get_expenses", {}],
    ];

    for (let i = 0; i < 10; i++) {
      for (const [cmd, args] of readOnlyCommands) {
        await bridgeInvoke(cmd as string, args as Record<string, unknown>);
      }
    }

    // Capture after counts
    const afterPartners: any[] = await bridgeInvoke("get_partners", {});
    const afterCars: any[] = await bridgeInvoke("get_cars", {});
    const afterExpenses: any[] = await bridgeInvoke("get_expenses", {});

    const pass = afterPartners.length === beforePartnerCount
      && afterCars.length === beforeCarCount
      && afterExpenses.length === beforeExpenseCount;

    const result: LayerResult = {
      scenarioId: "S63",
      scenarioName: "الدوال القرائية لا تكتب",
      layer: "BACKEND_DB",
      backendMode: "E2E_BRIDGE",
      executionTimeMs: Date.now() - t0,
      pass,
      failureReason: pass ? "" : `Partners: ${beforePartnerCount}→${afterPartners.length}, Cars: ${beforeCarCount}→${afterCars.length}, Expenses: ${beforeExpenseCount}→${afterExpenses.length}`,
      expected: { partners: beforePartnerCount, cars: beforeCarCount, expenses: beforeExpenseCount } as Record<string, number | string>,
      actual: { partners: afterPartners.length, cars: afterCars.length, expenses: afterExpenses.length } as Record<string, number | string>,
      rows: [],
    };
    appendResult(result);
    expect(pass).toBe(true);
  });
});
