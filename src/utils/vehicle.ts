/**
 * Normalizes identifiers that must compare by their visible alphanumeric value.
 * VIN/chassis identifiers are stored without whitespace and in uppercase so the
 * frontend, mock runtime, Rust backend, and SQLite unique index agree.
 */
export function normalizeVehicleIdentifier(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/gu, "")
    .toUpperCase();
}
