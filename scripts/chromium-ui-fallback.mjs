import * as fs from "node:fs";
import * as path from "node:path";

const RESULTS_DIR = path.resolve(process.cwd(), ".test-results");
const RESULTS_FILE = path.join(RESULTS_DIR, "all-results.json");

// Bug P8: Validation allowlist. The fallback writer must only ever emit
// CHROMIUM_UI failure entries for scenario IDs we actually know about.
// Source of truth: scripts/accounting_runtime_scenarios.py::SCENARIOS (S01..S27).
// Scenario IDs in the results file may be `S01` or `S01-<n>` (multi-step runs);
// we strip the trailing `-<n>` before matching, so the allowlist uses prefixes.
const KNOWN_SCENARIO_IDS = new Set([
  "S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09",
  "S10", "S11", "S12", "S13", "S14", "S15", "S16", "S17", "S18",
  "S19", "S20", "S21", "S22", "S23", "S24", "S25", "S26", "S27",
]);
function isKnownScenarioId(prefix) {
  return KNOWN_SCENARIO_IDS.has(prefix);
}

function main() {
  if (!fs.existsSync(RESULTS_FILE)) {
    console.log("[chromium-ui-fallback] No results file found — creating with CHROMIUM_UI failures.");
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(RESULTS_FILE, "[]", "utf-8");
  }

  let results;
  try {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
  } catch {
    console.log("[chromium-ui-fallback] Could not parse results file, resetting.");
    results = [];
  }

  // Find scenario prefixes that have ORACLE or BACKEND_DB.
  // Bug P8: filter out any scenario IDs that are not in KNOWN_SCENARIO_IDS
  // so we never fabricate fallback entries for unknown/garbage scenario IDs.
  const scenarioPrefixes = new Set();
  const scenarioNames = new Map();
  const droppedUnknown = new Set();
  for (const r of results) {
    const prefix = r.scenarioId.replace(/-\d+$/, "");
    if (r.layer === "ORACLE" || r.layer === "BACKEND_DB") {
      if (!isKnownScenarioId(prefix)) {
        droppedUnknown.add(prefix);
        continue;
      }
      scenarioPrefixes.add(prefix);
      if (!scenarioNames.has(prefix)) scenarioNames.set(prefix, r.scenarioName);
    }
  }
  if (droppedUnknown.size > 0) {
    console.log(
      `[chromium-ui-fallback] Ignoring unknown scenario IDs: ${[...droppedUnknown].join(", ")}`,
    );
  }

  // Find scenario prefixes that have CHROMIUM_UI
  const hasChromiumUi = new Set();
  for (const r of results) {
    if (r.layer === "CHROMIUM_UI") {
      const prefix = r.scenarioId.replace(/-\d+$/, "");
      if (isKnownScenarioId(prefix)) {
        hasChromiumUi.add(prefix);
      }
    }
  }

  // For each prefix with ORACLE/BACKEND but no CHROMIUM_UI, add a failure entry.
  let added = 0;
  for (const prefix of scenarioPrefixes) {
    if (!hasChromiumUi.has(prefix)) {
      results.push({
        scenarioId: prefix,
        scenarioName: scenarioNames.get(prefix) || prefix,
        layer: "CHROMIUM_UI",
        backendMode: "E2E_BRIDGE",
        executionTimeMs: 0,
        pass: false,
        failureReason: "Chromium UI لم يتم تشغيله — فشل في بدء تشغيل Playwright أو التطبيق",
        expected: {},
        actual: {},
        rows: [],
      });
      added++;
      console.log(`[chromium-ui-fallback] Added CHROMIUM_UI failure for scenario ${prefix}`);
    }
  }

  if (added > 0) {
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), "utf-8");
    console.log(`[chromium-ui-fallback] Wrote ${added} fallback CHROMIUM_UI failure entry/entries.`);
  } else {
    console.log("[chromium-ui-fallback] All scenarios already have CHROMIUM_UI entries — no fallback needed.");
  }
}

main();
