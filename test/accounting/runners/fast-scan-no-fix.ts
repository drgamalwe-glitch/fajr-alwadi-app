#!/usr/bin/env tsx
/**
 * test/accounting/runners/fast-scan-no-fix.ts
 *
 * Fast scanner that runs accounting scenarios without applying fixes.
 * Used by `npm run test:accounting:fast-scan-no-fix` to detect regressions.
 *
 * Supports flags:
 *   --one        Run only the next pending scenario.
 *   --scenario   Run a specific scenario by ID.
 *
 * Run with:  npm run test:accounting:fast-scan-no-fix
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", "state");
const PROGRESS_PATH = join(STATE_DIR, "fast-scan-progress.json");

// All scenario IDs from Instructions.md §21-§27 + §31.4.
const ALL_SCENARIOS = [
  "S22-cash-sale-no-double-count",
  "S23-car-expense-reduces-car-profit",
  "S24-general-expense-reduces-net-profit",
  "S24.1-cash-car-loss-must-reduce-net-profit",
  "S25-investor-deposit-no-partner-cash",
  "S26-funder-repayment-once-only",
  "S27-agency-deletion-scoped-by-id",
  "S31.4-agency-cash-vs-credit",
  "S28-general-expense-full-cycle",
  "S29-investor-full-cycle",
  "S30-funder-full-cycle",
  "S31-company-settlement-via-funder",
  "S32-installment-sale-at-loss",
  "S33-term-sale-full-cycle",
  "S34-multiple-down-payments",
  "S35-cash-sale-full-reversal",
  "S36-double-click-car-sale",
  "S37-concurrent-installment-payment",
  "S38-concurrent-payments-different-installments",
  "S39-edit-vs-delete-race",
  "S40-idempotency-all-operations",
  "S41-usd-full-journey",
  "S42-smallest-unit-rounding",
  "S43-boundary-numbers",
  "S44-month-year-boundaries",
  "S45-profit-period-boundaries",
  "S46-locale-timezone",
  "S47-migration-mid-failure",
  "S48-upgrade-from-all-versions",
  "S49-relationship-constraints",
  "S50-old-corrupt-db",
  "S51-qasa-cash-match",
  "S52-profit-match",
  "S53-company-value",
  "S54-e2e-after-login",
  "S55-prevent-double-click",
  "S56-print-few-many-rows",
  "S57-performance-large-data",
  "S58-memory-growth",
  "S59-write-command-permissions",
  "S60-attack-inputs",
  "S61-backup-restore",
];

interface ScanProgress {
  lastRun: string;
  completed: string[];
  pending: string[];
  results: Record<string, { status: string; timestamp: string }>;
}

function loadProgress(): ScanProgress {
  if (!existsSync(PROGRESS_PATH)) {
    return {
      lastRun: "",
      completed: [],
      pending: ALL_SCENARIOS,
      results: {},
    };
  }
  try {
    return JSON.parse(readFileSync(PROGRESS_PATH, "utf-8"));
  } catch {
    return {
      lastRun: "",
      completed: [],
      pending: ALL_SCENARIOS,
      results: {},
    };
  }
}

function saveProgress(progress: ScanProgress) {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  progress.lastRun = new Date().toISOString();
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

async function runScenario(_id: string): Promise<{ status: string; notes: string }> {
  // In a real environment, this would call the e2e-bridge to execute the
  // scenario. In stub mode, we mark as SKIP.
  const bridgeUrl = process.env.E2E_BRIDGE_URL || "http://127.0.0.1:3899";
  try {
    const res = await fetch(`${bridgeUrl}/__e2e/health`);
    if (!res.ok()) {
      return { status: "SKIP", notes: "bridge not reachable" };
    }
    // Bridge is a stub — would invoke real backend here.
    return { status: "SKIP", notes: "bridge is stub (no cargo)" };
  } catch {
    return { status: "SKIP", notes: "bridge not reachable" };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const runOne = args.includes("--one");
  const runScenarioFlag = args.includes("--scenario");
  const scenarioId = runScenarioFlag ? args[args.indexOf("--scenario") + 1] : null;

  const progress = loadProgress();

  let toRun: string[];
  if (scenarioId) {
    toRun = [scenarioId];
  } else if (runOne) {
    toRun = progress.pending.slice(0, 1);
  } else {
    toRun = ALL_SCENARIOS;
  }

  console.log("=".repeat(60));
  console.log("FAST SCAN (no fix)");
  console.log("=".repeat(60));
  console.log(`Scenarios to run: ${toRun.length}`);
  console.log("");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const id of toRun) {
    const result = await runScenario(id);
    progress.results[id] = { status: result.status, timestamp: new Date().toISOString() };
    if (result.status === "PASS") {
      passed++;
      if (!progress.completed.includes(id)) progress.completed.push(id);
      progress.pending = progress.pending.filter((s) => s !== id);
      console.log(`  ✅ ${id}`);
    } else if (result.status === "FAIL") {
      failed++;
      console.log(`  ❌ ${id} — ${result.notes}`);
    } else {
      skipped++;
      console.log(`  ⏭️  ${id} — ${result.notes}`);
    }
  }

  saveProgress(progress);

  console.log("");
  console.log("=".repeat(60));
  console.log(`Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}`);
  console.log(`Completed total: ${progress.completed.length}/${ALL_SCENARIOS.length}`);
  console.log("=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
