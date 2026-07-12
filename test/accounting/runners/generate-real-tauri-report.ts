#!/usr/bin/env tsx
/**
 * test/accounting/runners/generate-real-tauri-report.ts
 *
 * Generates a report from the Rust `cargo test` results stored in
 * test/accounting/state/real-tauri-results.json.
 *
 * Run with:  npm run test:accounting:real-report
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", "state");
const INPUT_PATH = join(STATE_DIR, "real-tauri-results.json");
const OUTPUT_PATH = join(STATE_DIR, "real-tauri-report.json");

interface RealVerificationResult {
  id: string;
  name: string;
  related_scenarios: string[];
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
    console.error("Run `npm run test:accounting:real-tauri` first.");
    process.exit(1);
  }

  const results: RealVerificationResult[] = JSON.parse(readFileSync(INPUT_PATH, "utf-8"));
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  const report = {
    generated_at: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    status: failed > 0 ? "FAIL" : "PASS",
    results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log("=".repeat(60));
  console.log("REAL TAURI REPORT");
  console.log("=".repeat(60));
  console.log(`Status: ${report.status}`);
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log("");
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : "❌";
    console.log(`  ${icon} [${r.id}] ${r.name}`);
    if (r.status === "FAIL") {
      console.log(`     ${r.notes}`);
    }
  }
  console.log("");
  console.log(`Report: ${OUTPUT_PATH}`);
  console.log("=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
