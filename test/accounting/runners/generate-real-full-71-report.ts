#!/usr/bin/env tsx
/**
 * test/accounting/runners/generate-real-full-71-report.ts
 *
 * Generates a report from the Rust `accounting_real_backend_full_71` test
 * results stored in test/accounting/state/full-71-results.json.
 *
 * Run with:  npm run test:accounting:real-full-71-report
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", "state");
const INPUT_PATH = join(STATE_DIR, "full-71-results.json");
const OUTPUT_PATH = join(STATE_DIR, "full-71-report.json");

interface Full71Result {
  id: string;
  name: string;
  group: string;
  status: string;
  expected: unknown;
  actual: unknown;
  rust_functions: string[];
  notes: string;
}

function main() {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  if (!existsSync(INPUT_PATH)) {
    console.error(`No input found at ${INPUT_PATH}`);
    console.error("Run `npm run test:accounting:real-tauri-full-71` first.");
    process.exit(1);
  }

  const results: Full71Result[] = JSON.parse(readFileSync(INPUT_PATH, "utf-8"));
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  // Group by group field.
  const groups: Record<string, Full71Result[]> = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  }

  const report = {
    generated_at: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    status: failed > 0 ? "FAIL" : "PASS",
    groups: Object.keys(groups),
    results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log("=".repeat(60));
  console.log("FULL-71 REAL BACKEND REPORT");
  console.log("=".repeat(60));
  console.log(`Status: ${report.status}`);
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log(`Groups: ${Object.keys(groups).join(", ")}`);
  console.log("");
  for (const [group, groupResults] of Object.entries(groups)) {
    console.log(`  [${group}]`);
    for (const r of groupResults) {
      const icon = r.status === "PASS" ? "✅" : "❌";
      console.log(`    ${icon} [${r.id}] ${r.name}`);
      if (r.status === "FAIL") {
        console.log(`       ${r.notes}`);
      }
    }
  }
  console.log("");
  console.log(`Report: ${OUTPUT_PATH}`);
  console.log("=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
