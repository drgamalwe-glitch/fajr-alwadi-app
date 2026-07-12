#!/usr/bin/env tsx
/**
 * test/accounting/runners/generate-accounting-report.ts
 *
 * FORENSIC FIX (re-audit 2026-07-11, REPORT-HONESTY-1):
 * The previous report generator accepted `data.failed` directly, which is not a
 * real field on either Vitest or Playwright JSON output. As a result the report
 * could silently report `Overall: PASS` with `Total: 0 tests` even when no
 * suite had actually executed (see §6.1 of the executive prompt — "لا تعتبر
 * `0 failed` نجاحاً إذا لم ينفذ أي اختبار").
 *
 * This rewrite:
 *   1. Reads the REAL fields from each runner's JSON output.
 *        - Vitest:  numTotalTests / numPassedTests / numFailedTests / numPendingTests
 *        - Playwright: stats.expected / stats.unexpected / stats.flaky / stats.skipped
 *   2. Distinguishes six explicit suite states:
 *        PASS, FAIL, SKIPPED, UNKNOWN, NOT_RUN, INFRASTRUCTURE_ERROR
 *   3. Records the backend mode for each suite (real / mock / stub / oracle).
 *   4. Enforces a Release Gate that FAILS the report if any mandatory suite
 *      contains a skip, is a stub, runs on mock, or has zero executed tests.
 *   5. Emits both a human-readable console summary and a structured JSON file.
 *
 * Run with:  npm run test:consolidate
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", "state");
const REPORT_PATH = join(STATE_DIR, "report.json");

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

type SuiteStatus =
  | "PASS"
  | "FAIL"
  | "SKIPPED"
  | "UNKNOWN"
  | "NOT_RUN"
  | "INFRASTRUCTURE_ERROR";

type BackendMode = "real" | "mock" | "stub" | "oracle" | "n/a";

interface SuiteResult {
  suite: string;
  status: SuiteStatus;
  backend_mode: BackendMode;
  mandatory: boolean;
  tests_discovered: number;
  tests_executed: number;
  tests_passed: number;
  tests_failed: number;
  tests_skipped: number;
  duration_ms?: number;
  raw_path?: string;
  error?: string;
}

interface ReleaseGate {
  decision: "GO" | "NO_GO";
  blocking_reasons: string[];
  warnings: string[];
}

interface Report {
  generated_at: string;
  overall_status: "PASS" | "FAIL" | "UNKNOWN";
  release_gate: ReleaseGate;
  total_tests_discovered: number;
  total_tests_executed: number;
  total_tests_passed: number;
  total_tests_failed: number;
  total_tests_skipped: number;
  suites: SuiteResult[];
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function safeParse(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${String(err)}`);
  }
}

function asNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// ----------------------------------------------------------------------
// Suite readers
// ----------------------------------------------------------------------

function readOracleResults(): SuiteResult {
  const oracleState = join(STATE_DIR, "oracle-results.json");
  const raw = safeParse(oracleState);
  if (raw === null) {
    return {
      suite: "oracle",
      status: "NOT_RUN",
      backend_mode: "oracle",
      mandatory: false, // oracle tests are an independent reference, not a release gate
      tests_discovered: 0,
      tests_executed: 0,
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      raw_path: oracleState,
      error: "oracle-results.json not found — run `npm run test:oracle` first",
    };
  }
  const data = raw as Record<string, unknown>;
  const numTotal = asNum(data.numTotalTests);
  const numPassed = asNum(data.numPassedTests);
  const numFailed = asNum(data.numFailedTests);
  const numPending = asNum(data.numPendingTests);
  const executed = numPassed + numFailed;
  let status: SuiteStatus;
  if (numFailed > 0) status = "FAIL";
  else if (numPending > 0) status = "SKIPPED";
  else if (executed === 0) status = "UNKNOWN";
  else status = "PASS";
  return {
    suite: "oracle",
    status,
    backend_mode: "oracle",
    mandatory: false,
    tests_discovered: numTotal,
    tests_executed: executed,
    tests_passed: numPassed,
    tests_failed: numFailed,
    tests_skipped: numPending,
    duration_ms: asNum(data.startTime),
    raw_path: oracleState,
  };
}

function readBackendResults(): SuiteResult {
  const backendState = join(STATE_DIR, "backend-results.json");
  const raw = safeParse(backendState);
  if (raw === null) {
    return {
      suite: "backend_bridge",
      status: "NOT_RUN",
      backend_mode: "stub",
      mandatory: true,
      tests_discovered: 0,
      tests_executed: 0,
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      raw_path: backendState,
      error: "backend-results.json not found — run `npm run test:backend` first",
    };
  }
  const data = raw as Record<string, unknown>;
  // The bridge is a stub by design — it returns 503 for real-backend invocations.
  // The suite is therefore "STUB" if the bridge mode is stub AND all real-backend
  // cases are marked skipped. See §6.1: a stub suite MUST NOT contribute to PASS.
  const numTotal = asNum(data.numTotalTests);
  const numPassed = asNum(data.numPassedTests);
  const numFailed = asNum(data.numFailedTests);
  const numPending = asNum(data.numPendingTests);
  const executed = numPassed + numFailed;
  let status: SuiteStatus;
  if (numFailed > 0) status = "FAIL";
  else if (numPending > 0 && executed === 0) status = "SKIPPED";
  else if (executed === 0) status = "UNKNOWN";
  else status = "PASS";
  return {
    suite: "backend_bridge",
    status,
    backend_mode: "stub",
    mandatory: true,
    tests_discovered: numTotal,
    tests_executed: executed,
    tests_passed: numPassed,
    tests_failed: numFailed,
    tests_skipped: numPending,
    raw_path: backendState,
  };
}

function readE2eResults(): SuiteResult {
  const e2eState = join(STATE_DIR, "e2e-results.json");
  const raw = safeParse(e2eState);
  if (raw === null) {
    return {
      suite: "e2e_playwright",
      status: "NOT_RUN",
      backend_mode: "mock",
      mandatory: true,
      tests_discovered: 0,
      tests_executed: 0,
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      raw_path: e2eState,
      error: "e2e-results.json not found — run `npm run test:e2e` first",
    };
  }
  const data = raw as Record<string, unknown>;
  const stats = (data.stats ?? {}) as Record<string, unknown>;
  const expected = asNum(stats.expected);
  const flaky = asNum(stats.flaky);
  const unexpected = asNum(stats.unexpected);
  const skipped = asNum(stats.skipped);
  const passed = expected + flaky;
  const failed = unexpected;
  const executed = passed + failed;
  let status: SuiteStatus;
  if (failed > 0) status = "FAIL";
  else if (executed === 0 && skipped > 0) status = "SKIPPED";
  else if (executed === 0) status = "UNKNOWN";
  else if (skipped > 0) status = "SKIPPED"; // mandatory suite cannot have any skip
  else status = "PASS";
  // E2E uses the localStorage mock — not a real backend. See §6.2.
  const mode: BackendMode = "mock";
  return {
    suite: "e2e_playwright",
    status,
    backend_mode: mode,
    mandatory: true,
    tests_discovered: passed + failed + skipped,
    tests_executed: executed,
    tests_passed: passed,
    tests_failed: failed,
    tests_skipped: skipped,
    duration_ms: asNum(stats.duration),
    raw_path: e2eState,
  };
}

function readRustResults(): SuiteResult {
  // The Rust backend tests are the ONLY real-backend suite. Their result file
  // is written by `test:accounting:real-tauri` / `test:accounting:real-full-71-report`.
  // We probe both the standard and the full-71 JSON files.
  const candidates = [
    join(STATE_DIR, "real-tauri-results.json"),
    join(STATE_DIR, "TAURA_REAL_FULL_71_RESULTS.json"),
    join(STATE_DIR, "TAURI_REAL_FULL_71_RESULTS.json"),
  ];
  let raw: unknown | null = null;
  let chosen: string | null = null;
  for (const p of candidates) {
    raw = safeParse(p);
    if (raw !== null) {
      chosen = p;
      break;
    }
  }
  if (raw === null) {
    return {
      suite: "rust_backend",
      status: "NOT_RUN",
      backend_mode: "real",
      mandatory: true,
      tests_discovered: 0,
      tests_executed: 0,
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      error:
        "real-tauri-results.json / TAURI_REAL_FULL_71_RESULTS.json not found — " +
        "run `npm run test:accounting:real-tauri` (requires Rust toolchain + Tauri system deps)",
    };
  }
  const data = raw as Record<string, unknown>;
  // The Rust runner writes its own schema — be defensive about every field.
  const passed = asNum(data.passed ?? data.numPassedTests ?? data.tests_passed);
  const failed = asNum(data.failed ?? data.numFailedTests ?? data.tests_failed);
  const skipped = asNum(data.skipped ?? data.numPendingTests ?? data.tests_skipped);
  const total = asNum(data.total ?? data.numTotalTests ?? data.tests_discovered);
  const executed = passed + failed;
  let status: SuiteStatus;
  if (failed > 0) status = "FAIL";
  else if (executed === 0) status = "UNKNOWN";
  else if (skipped > 0) status = "SKIPPED";
  else status = "PASS";
  return {
    suite: "rust_backend",
    status,
    backend_mode: "real",
    mandatory: true,
    tests_discovered: total || executed,
    tests_executed: executed,
    tests_passed: passed,
    tests_failed: failed,
    tests_skipped: skipped,
    raw_path: chosen ?? undefined,
  };
}

// ----------------------------------------------------------------------
// Release gate
// ----------------------------------------------------------------------

function evaluateReleaseGate(suites: SuiteResult[]): ReleaseGate {
  const blocking: string[] = [];
  const warnings: string[] = [];

  for (const s of suites) {
    if (!s.mandatory) continue;
    if (s.status === "FAIL") {
      blocking.push(`${s.suite}: FAIL (${s.tests_failed} failing test(s))`);
    }
    if (s.status === "SKIPPED") {
      blocking.push(`${s.suite}: contains ${s.tests_skipped} skipped test(s) — Release Gate forbids skip in mandatory suites`);
    }
    if (s.status === "UNKNOWN") {
      blocking.push(`${s.suite}: executed 0 tests — cannot prove behavior`);
    }
    if (s.status === "NOT_RUN") {
      blocking.push(`${s.suite}: not executed — ${s.error ?? "no result file"}`);
    }
    if (s.status === "INFRASTRUCTURE_ERROR") {
      blocking.push(`${s.suite}: infrastructure error — ${s.error ?? "unknown"}`);
    }
    if (s.backend_mode === "mock" || s.backend_mode === "stub") {
      blocking.push(
        `${s.suite}: runs on ${s.backend_mode} backend, not real Rust/SQLite — cannot prove production behavior`,
      );
    }
    if (s.backend_mode === "oracle") {
      warnings.push(`${s.suite}: oracle is an independent reference, not a backend proof`);
    }
  }

  return {
    decision: blocking.length > 0 ? "NO_GO" : "GO",
    blocking_reasons: blocking,
    warnings,
  };
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

function main() {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  const suites: SuiteResult[] = [
    readOracleResults(),
    readBackendResults(),
    readE2eResults(),
    readRustResults(),
  ];

  const totalDiscovered = suites.reduce((s, r) => s + r.tests_discovered, 0);
  const totalExecuted = suites.reduce((s, r) => s + r.tests_executed, 0);
  const totalPassed = suites.reduce((s, r) => s + r.tests_passed, 0);
  const totalFailed = suites.reduce((s, r) => s + r.tests_failed, 0);
  const totalSkipped = suites.reduce((s, r) => s + r.tests_skipped, 0);

  const gate = evaluateReleaseGate(suites);

  const overall_status: Report["overall_status"] =
    totalFailed > 0 ? "FAIL" : totalExecuted > 0 && gate.decision === "GO" ? "PASS" : "UNKNOWN";

  const report: Report = {
    generated_at: new Date().toISOString(),
    overall_status,
    release_gate: gate,
    total_tests_discovered: totalDiscovered,
    total_tests_executed: totalExecuted,
    total_tests_passed: totalPassed,
    total_tests_failed: totalFailed,
    total_tests_skipped: totalSkipped,
    suites,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  const line = "=".repeat(72);
  console.log(line);
  console.log("FAJR AL-WADI — ACCOUNTING TEST REPORT");
  console.log(line);
  console.log(`Overall: ${overall_status}`);
  console.log(
    `Totals: ${totalExecuted}/${totalDiscovered} executed, ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`,
  );
  console.log(`Release Gate: ${gate.decision}`);
  if (gate.blocking_reasons.length > 0) {
    console.log("Blocking reasons:");
    for (const r of gate.blocking_reasons) console.log(`  - ${r}`);
  }
  if (gate.warnings.length > 0) {
    console.log("Warnings:");
    for (const w of gate.warnings) console.log(`  - ${w}`);
  }
  console.log("");
  console.log("Per-suite:");
  for (const s of suites) {
    const icon =
      s.status === "PASS" ? "✅" :
      s.status === "FAIL" ? "❌" :
      s.status === "SKIPPED" ? "⏭️" :
      s.status === "NOT_RUN" ? "⚪" :
      s.status === "INFRASTRUCTURE_ERROR" ? "🏗️" :
      "⚠️";
    const mandatory = s.mandatory ? "[MANDATORY]" : "[advisory]";
    console.log(
      `  ${icon} ${mandatory} ${s.suite} (${s.backend_mode}): ` +
      `${s.tests_passed}/${s.tests_executed} passed, ${s.tests_failed} failed, ${s.tests_skipped} skipped — ${s.status}`,
    );
    if (s.error) console.log(`     ${s.error}`);
  }
  console.log("");
  console.log(`Report written to: ${REPORT_PATH}`);
  console.log(line);

  // Exit non-zero on any failure or NO_GO decision so CI catches it.
  process.exit(gate.decision === "GO" && totalFailed === 0 ? 0 : 1);
}

main();
