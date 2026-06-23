import * as fs from "node:fs";
import * as path from "node:path";

export interface ScenarioResult {
  id: string;
  name: string;
  layer: "ORACLE" | "BACKEND_DB" | "CHROMIUM_UI";
  backendMode: "REAL_BACKEND" | "E2E_BRIDGE" | "MOCK" | "PURE_CALCULATION";
  databasePath: string;
  executionTimeMs: number;
  expected: Record<string, number>;
  actual: Record<string, number>;
  pass: boolean;
  failureReason: string;
  rows: Array<Record<string, unknown>>;
  notes: string;
}

export interface TestReport {
  timestamp: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  warnings: string[];
  slowestScenarios: Array<{ id: string; timeMs: number }>;
  accountingMismatches: string[];
  missingSelectors: string[];
  missingBackendCommands: string[];
  unexpectedRows: string[];
  doubleCountingRisks: string[];
  finalVerdict: "PASS" | "FAIL";
  scenarios: ScenarioResult[];
}

const RESULTS_DIR = path.resolve(process.cwd());

export function writeResultsMd(report: TestReport): void {
  const lines: string[] = [];
  lines.push("# Accounting Test Results\n");
  lines.push(`**Generated:** ${report.timestamp}\n`);
  lines.push(`**Final Verdict:** ${report.finalVerdict}\n`);
  lines.push(`## Summary\n`);
  lines.push(`- Total scenarios: ${report.totalScenarios}`);
  lines.push(`- Passed: ${report.passedScenarios}`);
  lines.push(`- Failed: ${report.failedScenarios}`);
  lines.push(`- Warnings: ${report.warnings.length}\n`);

  if (report.warnings.length > 0) {
    lines.push(`## Warnings\n`);
    for (const w of report.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push(`## Scenario Results\n`);
  for (const s of report.scenarios) {
    lines.push(`### ${s.id}: ${s.name}\n`);
    lines.push(`- **Layer:** ${s.layer}`);
    lines.push(`- **Backend Mode:** ${s.backendMode}`);
    lines.push(`- **Database:** ${s.databasePath}`);
    lines.push(`- **Execution Time:** ${s.executionTimeMs}ms`);
    lines.push(`- **Result:** ${s.pass ? "PASS" : "FAIL"}`);
    if (!s.pass) lines.push(`- **Failure Reason:** ${s.failureReason}`);

    lines.push(`\n**Expected vs Actual:**\n`);
    lines.push(`| Field | Expected | Actual | Status |`);
    lines.push(`|---|---|---|---|`);
    const allKeys = new Set([...Object.keys(s.expected), ...Object.keys(s.actual)]);
    for (const k of allKeys) {
      const exp = s.expected[k] ?? 0;
      const act = s.actual[k] ?? 0;
      const status = Math.abs(exp - act) <= 1 ? "PASS" : "FAIL";
      lines.push(`| ${k} | ${exp.toLocaleString()} | ${act.toLocaleString()} | ${status} |`);
    }

    if (s.rows.length > 0) {
      lines.push(`\n**Generated Rows:**\n`);
      lines.push(`| Source Type | Source Role | Affects Qasa | Affects Cash | Affects Profit | Amount | Description |`);
      lines.push(`|---|---|---|---|---|---|---|`);
      for (const r of s.rows) {
        lines.push(`| ${r.sourceType} | ${r.sourceRole} | ${r.affectsQasa ? "1" : "0"} | ${r.affectsPartnerCash ? "1" : "0"} | ${r.affectsProfit ? "1" : "0"} | ${Number(r.amount).toLocaleString()} | ${r.description} |`);
      }
    }
    lines.push("");
  }

  if (report.accountingMismatches.length > 0) {
    lines.push(`## Accounting Mismatches\n`);
    for (const m of report.accountingMismatches) lines.push(`- ${m}`);
    lines.push("");
  }

  if (report.doubleCountingRisks.length > 0) {
    lines.push(`## Double-Counting Risks\n`);
    for (const d of report.doubleCountingRisks) lines.push(`- ${d}`);
    lines.push("");
  }

  if (report.slowestScenarios.length > 0) {
    lines.push(`## Slowest Scenarios\n`);
    for (const s of report.slowestScenarios) lines.push(`- ${s.id}: ${s.timeMs}ms`);
    lines.push("");
  }

  lines.push(`## Final Verdict\n`);
  lines.push(`### FINAL RESULT: ${report.finalVerdict}\n`);

  fs.writeFileSync(path.join(RESULTS_DIR, "ACCOUNTING_TEST_RESULTS.md"), lines.join("\n"), "utf-8");
}

export function writeSummaryJson(report: TestReport): void {
  fs.writeFileSync(
    path.join(RESULTS_DIR, "ACCOUNTING_TEST_SUMMARY.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );
}

export function writeFailuresMd(report: TestReport): void {
  const failures = report.scenarios.filter((s) => !s.pass);
  const lines: string[] = [];
  lines.push("# Accounting Test Failures\n");
  lines.push(`**Generated:** ${report.timestamp}\n`);
  lines.push(`**Total Failures:** ${failures.length}\n`);

  if (failures.length === 0) {
    lines.push("No failures. All scenarios passed.\n");
  } else {
    for (const s of failures) {
      lines.push(`## ${s.id}: ${s.name}\n`);
      lines.push(`- **Layer:** ${s.layer}`);
      lines.push(`- **Backend Mode:** ${s.backendMode}`);
      lines.push(`- **Failure Reason:** ${s.failureReason}\n`);
      lines.push(`**Expected:**`);
      for (const [k, v] of Object.entries(s.expected)) {
        lines.push(`- ${k}: ${v.toLocaleString()}`);
      }
      lines.push(`\n**Actual:**`);
      for (const [k, v] of Object.entries(s.actual)) {
        lines.push(`- ${k}: ${v.toLocaleString()}`);
      }
      lines.push("");
    }
  }

  fs.writeFileSync(path.join(RESULTS_DIR, "ACCOUNTING_TEST_FAILURES.md"), lines.join("\n"), "utf-8");
}

export function writeAllReports(scenarios: ScenarioResult[]): void {
  const timestamp = new Date().toISOString();
  const passed = scenarios.filter((s) => s.pass).length;
  const failed = scenarios.length - passed;

  const accountingMismatches: string[] = [];
  const doubleCountingRisks: string[] = [];

  for (const s of scenarios) {
    if (!s.pass) {
      accountingMismatches.push(`${s.id}: ${s.failureReason}`);
    }
  }

  const report: TestReport = {
    timestamp,
    totalScenarios: scenarios.length,
    passedScenarios: passed,
    failedScenarios: failed,
    warnings: [],
    slowestScenarios: scenarios
      .sort((a, b) => b.executionTimeMs - a.executionTimeMs)
      .slice(0, 5)
      .map((s) => ({ id: s.id, timeMs: s.executionTimeMs })),
    accountingMismatches,
    missingSelectors: [],
    missingBackendCommands: [],
    unexpectedRows: [],
    doubleCountingRisks,
    finalVerdict: failed === 0 ? "PASS" : "FAIL",
    scenarios,
  };

  writeResultsMd(report);
  writeSummaryJson(report);
  writeFailuresMd(report);
}
