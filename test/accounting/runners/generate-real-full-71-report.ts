import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, "test/accounting/state");
const REPORTS_DIR = path.join(ROOT, "test/accounting/reports/current");
const RESULTS_PATH = path.join(STATE_DIR, "TAURI_REAL_FULL_71_RESULTS.json");

interface RealResult {
  id: string;
  name: string;
  group: string;
  related_scenarios: string[];
  status: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  rust_functions: string[];
  notes: string;
}

const ALL_SCENARIOS: Array<{ id: string; group: string; name: string }> = [
  { id: "S01", group: "CAR_PURCHASE", name: "Cash car purchase" },
  { id: "S02", group: "CAR_PURCHASE", name: "Funded car purchase" },
  { id: "S03", group: "CAR_PURCHASE", name: "Company car purchase" },
  { id: "S04", group: "CAR_PURCHASE", name: "USD cash car purchase" },
  { id: "S05", group: "CASH_SALES", name: "Cash sale after cash purchase" },
  { id: "S06", group: "CASH_SALES", name: "Cash sale after funded purchase" },
  { id: "S07", group: "CASH_SALES", name: "Cash sale after company purchase" },
  { id: "S08", group: "CASH_SALES", name: "Cash sale with car expense" },
  { id: "S09", group: "CASH_SALES", name: "Cash sale at loss" },
  { id: "S10", group: "INSTALLMENTS", name: "Installment after down payment" },
  { id: "S11", group: "INSTALLMENTS", name: "Installment after one installment" },
  { id: "S12", group: "INSTALLMENTS", name: "Installment after all payments" },
  { id: "S13", group: "INSTALLMENTS", name: "Installment overpayment" },
  { id: "S14", group: "INSTALLMENTS", name: "Final installment exact close" },
  { id: "S15", group: "INSTALLMENTS", name: "Installment with car expense" },
  { id: "S16", group: "TERM_SALES", name: "Term sale with down payment" },
  { id: "S17", group: "TERM_SALES", name: "Term sale final payment" },
  { id: "S18", group: "CAR_EXPENSES", name: "Car expense before sale" },
  { id: "S19", group: "CAR_EXPENSES", name: "Car expense after sale" },
  { id: "S20", group: "CAR_EXPENSES", name: "Edit car expense" },
  { id: "S21", group: "CAR_EXPENSES", name: "Delete car expense" },
  { id: "S22", group: "GENERAL_EXPENSES", name: "General expense" },
  { id: "S23", group: "GENERAL_EXPENSES", name: "General expense after car profit" },
  { id: "S24", group: "GENERAL_EXPENSES", name: "Edit general expense" },
  { id: "S25", group: "GENERAL_EXPENSES", name: "Delete general expense" },
  { id: "S26", group: "INVESTORS", name: "Investor deposit" },
  { id: "S27", group: "INVESTORS", name: "Investor withdrawal" },
  { id: "S28", group: "INVESTORS", name: "Investor + car purchase" },
  { id: "S29", group: "INVESTORS", name: "Delete investor with balance" },
  { id: "S30", group: "FUNDERS", name: "Funder financing" },
  { id: "S31", group: "FUNDERS", name: "Funder repayment" },
  { id: "S32", group: "FUNDERS", name: "Partial funder repayment" },
  { id: "S33", group: "FUNDERS", name: "Funder repayment with commission" },
  { id: "S34", group: "FUNDERS", name: "Delete funder with balance" },
  { id: "S35", group: "COMPANIES", name: "Company purchase" },
  { id: "S36", group: "COMPANIES", name: "Company repayment" },
  { id: "S37", group: "COMPANIES", name: "Partial company repayment" },
  { id: "S38", group: "COMPANIES", name: "Delete company with balance" },
  { id: "S39", group: "AGENCIES", name: "Agency profit IQD" },
  { id: "S40", group: "AGENCIES", name: "Agency profit USD" },
  { id: "S41", group: "AGENCIES", name: "Two agencies same names/date" },
  { id: "S42", group: "AGENCIES", name: "Delete one agency transaction" },
  { id: "S43", group: "CUSTOMERS", name: "Customer balance after installment" },
  { id: "S44", group: "CUSTOMERS", name: "Customer pays one installment" },
  { id: "S45", group: "CUSTOMERS", name: "Customer pays all installments" },
  { id: "S46", group: "CUSTOMERS", name: "Print customer statement calculation" },
  { id: "S47", group: "PARTNERS", name: "Partner deposits" },
  { id: "S48", group: "PARTNERS", name: "Partner withdrawal" },
  { id: "S49", group: "PARTNERS", name: "Block third partner" },
  { id: "S50", group: "PARTNERS", name: "Block partner deletion" },
  { id: "S51", group: "DELETE_EDIT", name: "Edit available car purchase" },
  { id: "S52", group: "DELETE_EDIT", name: "Edit sold car sale price" },
  { id: "S53", group: "DELETE_EDIT", name: "Delete available car" },
  { id: "S54", group: "DELETE_EDIT", name: "Delete sold cash car" },
  { id: "S55", group: "DELETE_EDIT", name: "Delete sold installment car" },
  { id: "S56", group: "DASHBOARD", name: "Company status mixed operations" },
  { id: "S57", group: "DASHBOARD", name: "Qasa tab equals Qasa card" },
  { id: "S58", group: "DASHBOARD", name: "Cash tab equals partner cash card" },
  { id: "S59", group: "DASHBOARD", name: "Profit tab equals profit card" },
  { id: "S60", group: "CURRENCY", name: "IQD/USD separation" },
  { id: "S61", group: "CURRENCY", name: "USD general expense" },
  { id: "S62", group: "CURRENCY", name: "Mixed currency blocked" },
  { id: "S63", group: "READ_ONLY", name: "Read-only safety" },
  { id: "S64", group: "PRINT", name: "Print partner statement" },
  { id: "S65", group: "PRINT", name: "Print customer statement" },
  { id: "S66", group: "PRINT", name: "Export database" },
  { id: "S67", group: "FULL_FLOWS", name: "Full cash business cycle" },
  { id: "S68", group: "FULL_FLOWS", name: "Full installment cycle" },
  { id: "S69", group: "FULL_FLOWS", name: "Full funder cycle" },
  { id: "S70", group: "FULL_FLOWS", name: "Full company cycle" },
  { id: "S71", group: "FULL_FLOWS", name: "Full investor cycle" },
];

const EXPECTED_IDS = ALL_SCENARIOS.map((s) => s.id);

function loadResults(): RealResult[] {
  if (!fs.existsSync(RESULTS_PATH)) return [];
  return JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8")) as RealResult[];
}

function formatJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

function main() {
  const results = loadResults();
  const byId = new Map<string, RealResult>();
  const dupes: string[] = [];
  for (const r of results) {
    const sid = r.id.startsWith("S") ? r.id : r.related_scenarios[0];
    const key = sid || r.id;
    if (byId.has(key)) dupes.push(key);
    byId.set(key, { ...r, id: key });
  }

  const foundIds = [...byId.keys()].filter((id) => EXPECTED_IDS.includes(id));
  const missing = EXPECTED_IDS.filter((id) => !byId.has(id));
  const passed = foundIds.filter((id) => byId.get(id)?.status === "PASS").length;
  const failed = foundIds.filter((id) => byId.get(id)?.status === "FAIL").length;
  const pending = 71 - foundIds.length;
  const completed = foundIds.length;
  const coveragePercent = Math.round((completed / 71) * 100);
  const finalVerdict = failed === 0 && pending === 0 && passed === 71 ? "PASS" : "FAIL";
  const finalDeliveryApproved = finalVerdict === "PASS";
  const timestamp = new Date().toISOString();

  if (missing.length > 0 || dupes.length > 0) {
    console.log("[REAL_TAURI_FULL_71_WARNING]");
    if (missing.length > 0) console.log(`Missing scenarios: ${missing.join(", ")}`);
    if (dupes.length > 0) console.log(`Duplicate scenarios: ${[...new Set(dupes)].join(", ")}`);
  }

  const summary = {
    timestamp,
    backendMode: "REAL_TAURI_RUST_FULL_71",
    totalScenarios: 71,
    completedScenarios: completed,
    passedScenarios: passed,
    failedScenarios: failed,
    pendingScenarios: pending,
    coveragePercent,
    finalVerdict,
    e2eBridgeBaseline: { total: 71, passed: 71, failed: 0, verdict: "PASS" },
    previousRealPriorityVerification: { total: 11, passed: 11, failed: 0, verdict: "PASS" },
    fullRealVerification: {
      total: 71,
      passed,
      failed,
      pending,
      verdict: finalVerdict,
    },
    failedScenarioIds: foundIds.filter((id) => byId.get(id)?.status === "FAIL"),
    finalDeliveryApproved,
    reason: finalDeliveryApproved
      ? "All 71 scenarios passed against REAL_TAURI_RUST_FULL_71"
      : "Final delivery requires REAL_TAURI_RUST_FULL_71 PASS",
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });

  fs.writeFileSync(
    path.join(REPORTS_DIR, "TAURI_REAL_FULL_71_SUMMARY.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );

  const state = {
    timestamp,
    backendMode: "REAL_TAURI_RUST_FULL_71",
    totalScenarios: 71,
    completedScenarios: completed,
    passedScenarios: passed,
    failedScenarios: failed,
    pendingScenarios: pending,
    coveragePercent,
    finalVerdict,
    missingScenarioIds: missing,
    duplicateScenarioIds: [...new Set(dupes)],
    isComplete: completed === 71,
    isConsistent: missing.length === 0 && dupes.length === 0 && failed === 0 && pending === 0,
    resultsPath: RESULTS_PATH,
  };
  fs.writeFileSync(
    path.join(STATE_DIR, "TAURI_REAL_FULL_71_STATE.json"),
    JSON.stringify(state, null, 2) + "\n",
  );

  const failures = foundIds
    .filter((id) => byId.get(id)?.status === "FAIL")
    .map((id) => {
      const r = byId.get(id)!;
      return `### ${id} — ${r.name}

- **Expected:** \`${formatJson(r.expected)}\`
- **Actual:** \`${formatJson(r.actual)}\`
- **Rust functions:** ${r.rust_functions.join(", ") || "n/a"}
- **Notes:** ${r.notes}
- **Retest:** \`npm run test:accounting:real-tauri-full-71\`
`;
    })
    .join("\n");

  const tableRows = EXPECTED_IDS.map((id) => {
    const def = ALL_SCENARIOS.find((s) => s.id === id)!;
    const r = byId.get(id);
    const status = r?.status ?? "PENDING";
    const expected = r ? formatJson(r.expected) : "—";
    const actual = r ? formatJson(r.actual) : "—";
    const fns = r?.rust_functions.join(", ") ?? "—";
    const notes = (r?.notes ?? "Not run").replace(/\|/g, "/");
    return `| ${id} | ${def.group} | ${def.name} | ${status} | \`${expected}\` | \`${actual}\` | ${fns} | ${notes} |`;
  }).join("\n");

  const matrixRows = EXPECTED_IDS.map((id) => {
    const def = ALL_SCENARIOS.find((s) => s.id === id)!;
    const r = byId.get(id);
    const status = r?.status ?? "PENDING";
    return `| ${id} | ${def.group} | ${def.name} | ${status === "PASS" ? "✅ PASS" : status === "FAIL" ? "❌ FAIL" : "⏳ PENDING"} | REAL_TAURI_RUST |`;
  }).join("\n");

  const report = `# Tauri Real Full 71 Verification Report

## Final Status

- Backend mode: REAL_TAURI_RUST_FULL_71
- Total scenarios: 71
- Completed: ${completed}
- Passed: ${passed}
- Failed: ${failed}
- Pending: ${pending}
- Coverage: ${coveragePercent}%
- Final verdict: ${finalVerdict}
- Final delivery approved: ${finalDeliveryApproved ? "YES" : "NO"}

## Important distinction

- E2E_BRIDGE: 71/71 PASS
- REAL_TAURI_RUST priority check: 11/11 PASS
- REAL_TAURI_RUST_FULL_71: ${passed}/71 PASS

## Scenario results

| ID | Group | Scenario | Status | Expected | Actual | Rust functions | Notes |
|---|---|---|---|---|---|---|---|
${tableRows}

${failed > 0 ? `## Failure details\n\n${failures}` : ""}

## Final decision

Final delivery approved: ${finalDeliveryApproved ? "YES" : "NO"}

${finalDeliveryApproved ? "All 71 real Rust scenarios passed." : "Fix failed scenarios and rerun `npm run test:accounting:final-full-verify`."}
`;

  const matrix = `# REAL_TAURI_RUST_FULL_71 Matrix

**Generated:** ${timestamp}

Total: **71** | Passed: **${passed}** | Failed: **${failed}** | Pending: **${pending}**

| ID | Group | Scenario | Status | Backend |
|---|---|---|---|---|
${matrixRows}
`;

  fs.writeFileSync(path.join(REPORTS_DIR, "TAURI_REAL_FULL_71_REPORT.md"), report);
  fs.writeFileSync(path.join(REPORTS_DIR, "TAURI_REAL_FULL_71_MATRIX.md"), matrix);

  console.log("[REAL_TAURI_FULL_71]");
  console.log(`Total: 71`);
  console.log(`Completed: ${completed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Pending: ${pending}`);
  console.log(`Coverage: ${coveragePercent}%`);
  console.log(`Verdict: ${finalVerdict}`);
  console.log(`Final delivery approved: ${finalDeliveryApproved ? "YES" : "NO"}`);
}

main();
