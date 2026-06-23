import * as fs from "node:fs";
import * as path from "node:path";

const RESULTS_DIR = path.resolve(process.cwd(), "test/accounting/state");
const RESULTS_FILE = path.join(RESULTS_DIR, "all-results.json");

export interface LayerResult {
  scenarioId: string;
  scenarioName: string;
  layer: "ORACLE" | "BACKEND_DB" | "CHROMIUM_UI";
  backendMode: string;
  executionTimeMs: number;
  pass: boolean;
  failureReason: string;
  uiChecks?: UiCheck[];
  expected: Record<string, number | string>;
  actual: Record<string, number | string>;
  rows: Array<Record<string, unknown>>;
}

export interface UiCheck {
  tab: string;
  element: string;
  expected: string;
  actual: string;
  pass: boolean;
}

function ensureDir() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

export function appendResult(result: LayerResult): void {
  ensureDir();
  let existing: LayerResult[] = [];
  try {
    const raw = fs.readFileSync(RESULTS_FILE, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // file doesn't exist yet
  }
  existing.push(result);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2), "utf-8");
}

export function readAllResults(): LayerResult[] {
  ensureDir();
  try {
    const raw = fs.readFileSync(RESULTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function clearResults(): void {
  ensureDir();
  fs.writeFileSync(RESULTS_FILE, "[]", "utf-8");
}
