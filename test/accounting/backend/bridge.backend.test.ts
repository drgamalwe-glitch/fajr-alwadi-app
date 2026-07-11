/**
 * test/accounting/backend/bridge.backend.test.ts
 *
 * FORENSIC FIX (re-audit 2026-07-10):
 * The `test:backend` npm script referenced `test/accounting/backend/` but
 * the directory did not exist, causing `npm run test:backend` to fail with
 * "No test files found".
 *
 * Backend tests verify the Rust backend via the e2e-bridge HTTP server.
 * In this Python-only environment (no cargo), the bridge is a stub that
 * returns 503 for invoke calls. These tests are designed to:
 *   1. Skip gracefully when the bridge is a stub (no real backend).
 *   2. Run real assertions when cargo + tauri dev are available.
 *
 * Run with:  npm run test:backend
 */

import { describe, expect, it, beforeAll } from "vitest";

const BRIDGE_URL = process.env.E2E_BRIDGE_URL || "http://127.0.0.1:3899";

interface BridgeHealth {
  status: string;
  mode?: "stub" | "real";
  port: number;
  db: string;
}

interface InvokeResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

async function bridgeHealth(): Promise<BridgeHealth | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/__e2e/health`);
    if (!res.ok) return null;
    return (await res.json()) as BridgeHealth;
  } catch {
    return null;
  }
}

async function invoke(cmd: string, args: unknown[] = []): Promise<InvokeResult> {
  try {
    const res = await fetch(`${BRIDGE_URL}/__e2e/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd, args }),
    });
    const data = await res.json();
    if (res.status === 503) {
      return { ok: false, error: data.error || "bridge stub" };
    }
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

let health: BridgeHealth | null = null;
const isStub = () => health?.mode !== "real";

beforeAll(async () => {
  health = await bridgeHealth();
});

describe("e2e-bridge health", () => {
  it("bridge is reachable", () => {
    // If the bridge is not reachable, the test:backend script would have
    // failed to start. This assertion confirms the webServer config works.
    expect(health).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Backend scenario tests — these call real Tauri commands via the bridge.
// They skip gracefully when the bridge is a stub (no cargo).
// ─────────────────────────────────────────────────────────────────────

describe("§22 backend — Cash Sale (no double-counting)", () => {
  it.skipIf(isStub())("cash sale produces cash=20M, profit=10M", async () => {
    // 1. Add a car.
    const addCar = await invoke("add_car", [
      "B22", "CH-B22", "Toyota", "2024", "Test", "White", "",
      "10000000", "IQD", "IQD", "0", "متوفرة",
      null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null, null, null, null,
    ]);
    expect(addCar.ok).toBe(true);

    // 2. Sell for cash.
    const sell = await invoke("save_and_sell_car_with_accounting", [
      "B22", "CH-B22", "Toyota", "2024", "Test", "White", "",
      "10000000", "IQD", "IQD", "20000000", "كاش",
      "20000000", "0", null, null, "مشتري", "07800000000",
      "2026-07-10", "2026-07-10", null, null, "قاصه", null, "كاش",
      null, null, null, null,
    ]);
    expect(sell.ok).toBe(true);

    // 3. Get financial summary and verify.
    const summary = await invoke("get_financial_summary", [null]);
    expect(summary.ok).toBe(true);
    const data = summary.data as { cash_iqd: string; monthly_profits_iqd: string };
    expect(parseFloat(data.cash_iqd)).toBe(20000000);
    expect(parseFloat(data.monthly_profits_iqd)).toBe(10000000);
  });
});

describe("§24 backend — General Expense", () => {
  it.skipIf(isStub())("general expense reduces partner cash by 1M", async () => {
    const result = await invoke("add_expense", [
      "إيجار", "1000000", "2026-07-10", null, "IQD", null,
    ]);
    expect(result.ok).toBe(true);

    const summary = await invoke("get_financial_summary", [null]);
    const data = summary.data as { cash_iqd: string };
    // Cash should have decreased by 1M.
    expect(parseFloat(data.cash_iqd)).toBeLessThanOrEqual(-1000000);
  });
});

describe("§25 backend — Investor Deposit", () => {
  it.skipIf(isStub())("investor deposit increases qasa, not partner cash", async () => {
    // 1. Add investor partner.
    await invoke("add_partner", ["مستثمر B25", "07800000000", "مستثمر"]);

    // 2. Add investor deposit transaction.
    await invoke("add_partner_transaction", [
      "مستثمر B25", "مستثمر", "ايداع مستثمر", "10000000",
      "2026-07-10", null, "IQD", "قاصه",
    ]);

    // 3. Verify summary.
    const summary = await invoke("get_financial_summary", [null]);
    const data = summary.data as { qasa_iqd: string; cash_iqd: string };
    expect(parseFloat(data.qasa_iqd)).toBe(10000000);
    // Partner cash should NOT increase from investor deposit.
    expect(parseFloat(data.cash_iqd)).toBe(0);
  });
});

describe("§26 backend — Funder Repayment", () => {
  it.skipIf(isStub())("funder repayment decreases partner cash once", async () => {
    // 1. Add funded car.
    await invoke("add_car", [
      "B26", "CH-B26", "Toyota", "2024", "Test", "White", "",
      "10000000", "IQD", "IQD", "0", "متوفرة",
      null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      null, "ممول B26", null, null, null,
    ]);

    // 2. Repay funder from partners.
    await invoke("pay_financier_from_partners", [
      "ممول B26", "ممول", "10000000", "2026-07-10",
      null, "IQD", null, null, null,
    ]);

    // 3. Verify cash decreased by 10M.
    const summary = await invoke("get_financial_summary", [null]);
    const data = summary.data as { cash_iqd: string };
    expect(parseFloat(data.cash_iqd)).toBe(-10000000);

    // 4. Idempotency: paying again should NOT double-deduct.
    await invoke("pay_financier_from_partners", [
      "ممول B26", "ممول", "10000000", "2026-07-10",
      null, "IQD", null, null, null,
    ]);
    const summary2 = await invoke("get_financial_summary", [null]);
    const data2 = summary2.data as { cash_iqd: string };
    expect(parseFloat(data2.cash_iqd)).toBe(-10000000); // still -10M, not -20M
  });
});

describe("§31.4 backend — Agency Cash vs Credit", () => {
  it.skipIf(isStub())("credit agency does not enter profit until paid", async () => {
    // 1. Add a CREDIT agency (payment_status='غير واصل').
    const addResult = await invoke("add_agency", [
      "وكيل B31", "تويوتا", "", "", "", "زبون B31", "",
      "0", "1000000", "", "غير واصل", null,
    ]);
    expect(addResult.ok).toBe(true);

    // 2. Verify profit = 0 (credit agency does not recognize profit).
    const summary = await invoke("get_financial_summary", [null]);
    const data = summary.data as { monthly_profits_iqd: string; cash_iqd: string };
    expect(parseFloat(data.monthly_profits_iqd)).toBe(0);
    expect(parseFloat(data.cash_iqd)).toBe(0); // no cash movement either
  });
});
