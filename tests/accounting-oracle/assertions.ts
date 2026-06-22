export interface AssertionResult {
  field: string;
  expected: number;
  actual: number;
  pass: boolean;
  notes: string;
}

export function assertNear(
  field: string,
  expected: number,
  actual: number,
  tolerance = 1,
  notes = "",
): AssertionResult {
  const pass = Math.abs(expected - actual) <= tolerance;
  return { field, expected, actual, pass, notes };
}

export function assertExact(
  field: string,
  expected: number,
  actual: number,
  notes = "",
): AssertionResult {
  return { field, expected, actual, pass: expected === actual, notes };
}

export function assertBoolean(
  field: string,
  expected: boolean,
  actual: boolean,
  notes = "",
): AssertionResult {
  return {
    field,
    expected: expected ? 1 : 0,
    actual: actual ? 1 : 0,
    pass: expected === actual,
    notes,
  };
}

export function formatAssertions(results: AssertionResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    lines.push(`  ${status} ${r.field}: expected=${r.expected}, actual=${r.actual}${r.notes ? ` (${r.notes})` : ""}`);
  }
  return lines.join("\n");
}

export function allPassed(results: AssertionResult[]): boolean {
  return results.every((r) => r.pass);
}

export function summarizeResults(results: AssertionResult[]): {
  total: number;
  passed: number;
  failed: number;
} {
  const passed = results.filter((r) => r.pass).length;
  return { total: results.length, passed, failed: results.length - passed };
}
