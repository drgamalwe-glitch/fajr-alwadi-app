import { bridgeInvoke, bridgeReset } from "../e2e-bridge/e2e-commands";
import { assertExact, assertNear, allPassed, type AssertionResult } from "../accounting-oracle/assertions";
import { appendResult, type LayerResult } from "../shared/result-collector";
import type { ScenarioOracleResult } from "../accounting-oracle/oracle";

const BACKEND_MODE = "E2E_BRIDGE";

export type PartnerTx = {
  id: number;
  partner_name: string;
  kind: string;
  type_: string;
  amount: number;
  date: string;
  notes: string | null;
  currency: string | null;
  affects_qasa: number;
  affects_partner_cash: number;
  affects_profit: number;
  source_type: string | null;
  source_id: string | null;
  source_role: string | null;
};

export type FinancialSummary = {
  cash_iqd: number;
  qasa_iqd: number;
  inventory_value_iqd: number;
  total_partner_capital_iqd: number;
  monthly_profits_iqd: number;
  total_expenses_iqd: number;
  cash_usd: number;
  qasa_usd: number;
  inventory_value_usd: number;
  total_partner_capital_usd: number;
  monthly_profits_usd: number;
  total_expenses_usd: number;
  total_investments_iqd: number;
  total_debtors_iqd: number;
  net_capital_iqd: number;
};

export type ProfitDist = {
  undistributed_iqd: number;
  partners: { partner_name: string; profit_iqd: number; profit_usd: number; drawings_iqd: number; drawings_usd: number }[];
  expenses_iqd: number;
};

export async function resetDb() {
  await bridgeReset();
}

export async function getSummary(): Promise<FinancialSummary> {
  return bridgeInvoke("get_financial_summary", {});
}

export async function getProfitDist(): Promise<ProfitDist> {
  return bridgeInvoke("get_profit_distribution_summary", {});
}

export async function getAmirTx(): Promise<PartnerTx[]> {
  return bridgeInvoke("get_partner_transactions", { partner_name: "أمير", kind: "شريك" });
}

export async function getMuntasirTx(): Promise<PartnerTx[]> {
  return bridgeInvoke("get_partner_transactions", { partner_name: "منتصر", kind: "شريك" });
}

export async function getCars(): Promise<any[]> {
  return bridgeInvoke("get_cars", {});
}

export async function getExpenses(): Promise<any[]> {
  return bridgeInvoke("get_expenses", {});
}

export async function getPartners(): Promise<any[]> {
  return bridgeInvoke("get_partners", {});
}

export async function addCar(args: Record<string, unknown>) {
  return bridgeInvoke("add_car", args);
}

export async function sellCar(args: Record<string, unknown>) {
  return bridgeInvoke("sell_car_with_accounting", args);
}

export async function addExpense(args: Record<string, unknown>) {
  return bridgeInvoke("add_expense", args);
}

export async function addPartnerTx(args: Record<string, unknown>) {
  return bridgeInvoke("add_partner_transaction", args);
}

export async function deleteCar(num: string) {
  return bridgeInvoke("delete_car", { num });
}

export async function deleteExpense(id: number) {
  return bridgeInvoke("delete_expense", { id });
}

export async function updateExpense(args: Record<string, unknown>) {
  return bridgeInvoke("update_expense", args);
}

export async function addCarExpense(args: Record<string, unknown>) {
  return bridgeInvoke("add_car_expense_record", args);
}

export async function deleteCarExpense(id: number) {
  return bridgeInvoke("delete_car_expense_record", { id });
}

export async function addPartner(args: Record<string, unknown>) {
  return bridgeInvoke("add_partner", args);
}

export async function deletePartner(args: Record<string, unknown>) {
  return bridgeInvoke("delete_partner", args);
}

export async function payFinancier(args: Record<string, unknown>) {
  return bridgeInvoke("pay_financier_from_partners", args);
}

export function buildResult(
  id: string,
  name: string,
  expected: Record<string, number>,
  actual: Record<string, number>,
  assertions: AssertionResult[],
  elapsedMs: number,
  failureReason: string,
): LayerResult {
  return {
    scenarioId: id,
    scenarioName: name,
    layer: "BACKEND_DB",
    backendMode: BACKEND_MODE,
    executionTimeMs: elapsedMs,
    pass: allPassed(assertions) && !failureReason,
    failureReason,
    expected: expected as Record<string, number | string>,
    actual: actual as Record<string, number | string>,
    rows: [],
  };
}

export function collectAssertions(assertions: AssertionResult[]): string {
  if (allPassed(assertions)) return "";
  return assertions
    .filter((a) => !a.pass)
    .map((a) => `${a.field}: expected ${a.expected}, got ${a.actual}`)
    .join("; ");
}

export { assertExact, assertNear, allPassed, appendResult };
