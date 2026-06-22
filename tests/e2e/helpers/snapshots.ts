export type Snapshot = Record<string, string>;

export function diffSnapshots(before: Snapshot, after: Snapshot): { key: string; before: string; after: string; changed: boolean }[] {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(allKeys).map((key) => ({
    key,
    before: before[key] ?? "N/A",
    after: after[key] ?? "N/A",
    changed: (before[key] ?? "N/A") !== (after[key] ?? "N/A"),
  }));
}
