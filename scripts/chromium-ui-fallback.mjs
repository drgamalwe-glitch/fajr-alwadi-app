import * as fs from "node:fs";
import * as path from "node:path";

const RESULTS_DIR = path.resolve(process.cwd(), ".test-results");
const RESULTS_FILE = path.join(RESULTS_DIR, "all-results.json");

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

  // Find scenario prefixes that have ORACLE or BACKEND_DB
  const scenarioPrefixes = new Set();
  const scenarioNames = new Map();
  for (const r of results) {
    const prefix = r.scenarioId.replace(/-\d+$/, "");
    if (r.layer === "ORACLE" || r.layer === "BACKEND_DB") {
      scenarioPrefixes.add(prefix);
      if (!scenarioNames.has(prefix)) scenarioNames.set(prefix, r.scenarioName);
    }
  }

  // Find scenario prefixes that have CHROMIUM_UI
  const hasChromiumUi = new Set();
  for (const r of results) {
    if (r.layer === "CHROMIUM_UI") {
      hasChromiumUi.add(r.scenarioId.replace(/-\d+$/, ""));
    }
  }

  // For each prefix with ORACLE/BACKEND but no CHROMIUM_UI, add a failure entry
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
