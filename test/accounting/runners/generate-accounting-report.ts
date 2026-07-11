#!/usr/bin/env tsx
/**
 * test/accounting/runners/generate-accounting-report.ts
 *
 * FORENSIC FIX (re-audit 2026-07-10):
 * The `test:consolidate` npm script referenced this file but it did not
 * exist, causing `npm run test:consolidate` to fail.
 *
 * This runner consolidates the results from the oracle, backend, and e2e
 * test suites into a single JSON report at test/accounting/state/report.json.
 *
 * Run with:  npm run test:consolidate
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", "state");
const REPORT_PATH = join(STATE_DIR, "report.json");

interface SuiteResult {
  suite: string;
  status: "pass" | "fail" | "skip" | "unknown";
  tests: number;
  passed: number;
  failed: number;
  duration_ms?: number;
  error?: string;
}

function readOracleResults(): SuiteResult {
  // The oracle tests run via vitest and produce output on stdout.
  // In a real CI, we'd parse the JUnit XML. Here we check if the
  // oracle state file exists (written by vitest's reporter).
  const oracleState = join(STATE_DIR, "oracle-results.json");
  if (!existsSync(oracleState)) {
    return {
      suite: "oracle",
      status: "unknown",
      tests: 0,
      passed: 0,
      failed: 0,
      error: "oracle-results.json not found — run `npm run test:oracle` first",
    };
  }
  try {
    const data = JSON.parse(readFileSync(oracleState, "utf-8"));
    return {
      suite: "oracle",
      status: data.failed > 0 ? "fail" : "pass",
      tests: data.numTotalTests || 0,
      passed: data.numPassedTests || 0,
      failed: data.numFailedTests || 0,
      duration_ms: data.startTime,
    };
  } catch (err) {
    return {
      suite: "oracle",
      status: "unknown",
      tests: 0,
      passed: 0,
      failed: 0,
      error: String(err),
    };
  }
}

function readBackendResults(): SuiteResult {
  const backendState = join(STATE_DIR, "backend-results.json");
  if (!existsSync(backendState)) {
    return {
      suite: "backend",
      status: "unknown",
      tests: 0,
      passed: 0,
      failed: 0,
      error: "backend-results.json not found — run `npm run test:backend` first",
    };
  }
  try {
    const data = JSON.parse(readFileSync(backendState, "utf-8"));
    return {
      suite: "backend",
      status: data.failed > 0 ? "fail" : "pass",
      tests: data.numTotalTests || 0,
      passed: data.numPassedTests || 0,
      failed: data.numFailedTests || 0,
    };
  } catch (err) {
    return {
      suite: "backend",
      status: "unknown",
      tests: 0,
      passed: 0,
      failed: 0,
      error: String(err),
    };
  }
}

function readE2eResults(): SuiteResult {
  const e2eState = join(STATE_DIR, "e2e-results.json");
  if (!existsSync(e2eState)) {
    return {
      suite: "e2e",
      status: "unknown",
      tests: 0,
      passed: 0,
      failed: 0,
      error: "e2e-results.json not found — run `npm run test:e2e` first",
    };
  }
  try {
    const data = JSON.parse(readFileSync(e2eState, "utf-8"));
    const passed = (data.stats.expected || 0) + (data.stats.flaky || 0);
    const failed = data.stats.unexpected || 0;
    const skipped = data.stats.skipped || 0;
    return {
      suite: "e2e",
      status: failed > 0 ? "fail" : "pass",
      tests: passed + failed + skipped,
      passed,
      failed,
      duration_ms: data.stats.duration,
    };
  } catch (err) {
    return {
      suite: "e2e",
      status: "unknown",
      tests: 0,
      passed: 0,
      failed: 0,
      error: String(err),
    };
  }
}

function main() {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  const suites: SuiteResult[] = [
    readOracleResults(),
    readBackendResults(),
    readE2eResults(),
  ];

  const totalTests = suites.reduce((s, r) => s + r.tests, 0);
  const totalPassed = suites.reduce((s, r) => s + r.passed, 0);
  const totalFailed = suites.reduce((s, r) => s + r.failed, 0);
  const overallStatus = totalFailed > 0 ? "FAIL" : (totalTests > 0 ? "PASS" : "UNKNOWN");

  const report = {
    generated_at: new Date().toISOString(),
    overall_status: overallStatus,
    total_tests: totalTests,
    total_passed: totalPassed,
    total_failed: totalFailed,
    suites,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("=".repeat(60));
  console.log("ACCOUNTING TEST REPORT");
  console.log("=".repeat(60));
  console.log(`Overall: ${overallStatus}`);
  console.log(`Total: ${totalTests} tests, ${totalPassed} passed, ${totalFailed} failed`);
  console.log("");
  for (const s of suites) {
    const icon = s.status === "pass" ? "✅" : s.status === "fail" ? "❌" : "⚠️";
    console.log(`  ${icon} ${s.suite}: ${s.passed}/${s.tests} passed`);
    if (s.error) {
      console.log(`     ${s.error}`);
    }
  }
  console.log("");
  console.log(`Report written to: ${REPORT_PATH}`);
  console.log("=".repeat(60));

  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
