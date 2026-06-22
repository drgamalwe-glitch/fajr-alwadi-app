import * as fs from "node:fs";
import * as path from "node:path";

export type ComparisonRow = {
  area: string;
  field: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL" | "WARN";
  notes: string;
};

export function writeUiReport(
  title: string,
  backendMode: string,
  comparisons: ComparisonRow[],
  extraLines?: string[],
): "PASS" | "FAIL" {
  const failures = comparisons.filter((c) => c.status === "FAIL");
  const result: "PASS" | "FAIL" = failures.length === 0 ? "PASS" : "FAIL";
  const reportPath = path.join(process.cwd(), `${title.replace(/\s+/g, "_").toUpperCase()}_RESULT.md`);

  const lines: string[] = [];
  lines.push(`# ${title}\n`);
  lines.push(`- **Date:** ${new Date().toISOString()}`);
  lines.push(`- **Backend mode:** ${backendMode}`);
  lines.push(`- **Result:** ${result}\n`);

  if (extraLines) {
    lines.push(...extraLines, "");
  }

  lines.push("## Comparisons\n");
  lines.push("| Area | Field | Expected | Actual | Status | Notes |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of comparisons) {
    lines.push(`| ${c.area} | ${c.field} | ${c.expected} | ${c.actual} | ${c.status} | ${c.notes} |`);
  }

  if (failures.length > 0) {
    lines.push("\n## Failures\n");
    for (const f of failures) {
      lines.push(`- **${f.area} / ${f.field}:** expected "${f.expected}", got "${f.actual}". ${f.notes}`);
    }
  }

  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  return result;
}
