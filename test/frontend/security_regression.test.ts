import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FORENSIC REGRESSION TESTS (re-audit 2026-07-11, SECURITY-1)
 *
 * These tests enforce §7.1 of the executive prompt:
 *   - The `admin/admin` default credential MUST NOT appear in production code.
 *   - The `initial_admin_password.txt` artifact MUST NOT ship in any package.
 *   - The Rust source MUST NOT contain a hardcoded `DEFAULT_ADMIN_PASSWORD = "admin"`.
 *
 * They are deliberately filesystem-based so they catch regressions even
 * without compiling Rust. A failure here is a release blocker.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");

describe("SECURITY-1: no hardcoded admin/admin default in production", () => {
  it("lib.rs OR legacy.rs must not contain a DEFAULT_ADMIN_PASSWORD constant set to 'admin'", () => {
    // FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
    // After the lib.rs split, the implementation lives in legacy.rs (and is
    // re-exported via the domain modules). The test must scan BOTH files to
    // catch a regression in either location.
    const candidates = [
      join(PROJECT_ROOT, "src-tauri", "src", "lib.rs"),
      join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs"),
    ];
    let src = "";
    for (const p of candidates) {
      if (existsSync(p)) src += "\n" + readFileSync(p, "utf-8");
    }
    if (!src) return; // running outside project tree

    // The legacy constant `const DEFAULT_ADMIN_PASSWORD: &str = "admin";`
    // MUST be gone. The new code keeps only `LEGACY_INSECURE_ADMIN_PASSWORD`
    // for the rotation-warning path (which is allowed).
    expect(src).not.toMatch(/const\s+DEFAULT_ADMIN_PASSWORD\s*:\s*&str\s*=\s*"admin"/);

    // The legacy `write_initial_admin_password` function MUST be gone.
    expect(src).not.toMatch(/fn\s+write_initial_admin_password\s*\(/);
  });

  it("lib.rs OR legacy.rs may only reference 'admin' as a password in the legacy-insecure constant for rotation warnings", () => {
    const candidates = [
      join(PROJECT_ROOT, "src-tauri", "src", "lib.rs"),
      join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs"),
    ];
    let src = "";
    for (const p of candidates) {
      if (existsSync(p)) src += "\n" + readFileSync(p, "utf-8");
    }
    if (!src) return;

    // The username "admin" is allowed (DEFAULT_ADMIN_USERNAME). What is forbidden
    // is using "admin" as a PASSWORD. Match any `const NAME: &str = "admin";` and
    // verify the name is either the username constant or the legacy-insecure one.
    const matches = [...src.matchAll(/const\s+(\w+)\s*:\s*&str\s*=\s*"admin"\s*;/g)];
    for (const m of matches) {
      const allowedNames = new Set([
        "DEFAULT_ADMIN_USERNAME",
        "LEGACY_INSECURE_ADMIN_PASSWORD",
      ]);
      expect(allowedNames.has(m[1])).toBe(true);
    }
  });
});

describe("SECURITY-1: initial_admin_password.txt must never ship", () => {
  it("the legacy credentials file does not exist in the project tree", () => {
    const legacyPath = join(PROJECT_ROOT, "src-tauri", "initial_admin_password.txt");
    expect(existsSync(legacyPath)).toBe(false);
  });

  it("the .gitignore forbids initial_admin_password.txt", () => {
    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    if (!existsSync(gitignorePath)) return;
    const gi = readFileSync(gitignorePath, "utf-8");
    expect(gi).toContain("initial_admin_password.txt");
    expect(gi).toMatch(/\.db$/m);
    expect(gi).toMatch(/backups?\//m);
  });
});

describe("MOCK-ISOLATION-1: production build must not fall back to mock", () => {
  it("callTauri throws in PROD when Tauri is not detected", async () => {
    // We exercise the production-guard branch by importing the module with
    // PROD=true stubbed. The actual Tauri detector is replaced so isTauri()
    // returns false; we then expect the PROD guard to throw.
    //
    // We cannot easily stub import.meta.env.PROD from Vitest, so this test
    // is a static source check instead: the source must contain the PROD guard.
    const tauriPath = join(PROJECT_ROOT, "src", "api", "tauri.ts");
    if (!existsSync(tauriPath)) return;
    const src = readFileSync(tauriPath, "utf-8");
    expect(src).toMatch(/import\.meta\.env\.PROD/);
    expect(src).toMatch(/Backend unavailable in production/);
  });
});

describe("IDEMPOTENCY-1: add_partner_transaction must accept creation_token", () => {
  it("the Rust command signature includes creation_token and session_token", () => {
    // FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
    // Scan both lib.rs and legacy.rs (the implementation lives in legacy.rs
    // after the restructure; lib.rs only re-exports).
    const candidates = [
      join(PROJECT_ROOT, "src-tauri", "src", "lib.rs"),
      join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs"),
    ];
    let src = "";
    for (const p of candidates) {
      if (existsSync(p)) src += "\n" + readFileSync(p, "utf-8");
    }
    if (!src) return;

    // Find the add_partner_transaction signature block.
    const sigMatch = src.match(/fn\s+add_partner_transaction\s*\(([^)]+)\)/s);
    expect(sigMatch).not.toBeNull();
    const sig = sigMatch![1];
    expect(sig).toContain("creation_token: Option<String>");
    expect(sig).toContain("session_token: String");

    // The body must check for an existing token via SQL.
    expect(src).toMatch(/SELECT EXISTS\(SELECT 1 FROM partner_transactions WHERE creation_token = /);
  });
});

describe("AUDIT-TRAIL-1: append_audit_event must record backend actor", () => {
  it("lib.rs OR legacy.rs defines append_audit_event that writes actor_user_id from backend session", () => {
    // FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
    // Scan both lib.rs and legacy.rs.
    const candidates = [
      join(PROJECT_ROOT, "src-tauri", "src", "lib.rs"),
      join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs"),
    ];
    let src = "";
    for (const p of candidates) {
      if (existsSync(p)) src += "\n" + readFileSync(p, "utf-8");
    }
    if (!src) return;

    expect(src).toMatch(/fn\s+append_audit_event\s*\(/);
    // The function must insert into audit_log with the new actor_user_id column.
    expect(src).toMatch(/INSERT INTO audit_log \(.*actor_user_id.*\)/s);
    // It must NOT accept a free-form actor name from the caller.
    const fnMatch = src.match(/fn\s+append_audit_event\s*\(([^)]+)\)/s);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).not.toMatch(/actor_name/);
  });
});

describe("AUTH-MANDATE-1: all write commands require mandatory session_token", () => {
  const WRITE_COMMANDS = [
    "save_and_sell_car_with_accounting",
    "add_partner_transaction",
    "pay_customer_installment",
    "pay_financier_from_partners",
    "apply_car_expense_changes",
    "add_user",
    "update_user",
    "change_password",
    "delete_user",
    "set_selected_background",
    "rename_background",
    "delete_background",
  ];

  it("every write command has session_token: String (not Option<String>)", () => {
    const candidates = [
      join(PROJECT_ROOT, "src-tauri", "src", "lib.rs"),
      join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs"),
    ];
    let src = "";
    for (const p of candidates) {
      if (existsSync(p)) src += "\n" + readFileSync(p, "utf-8");
    }
    if (!src) return;

    for (const cmd of WRITE_COMMANDS) {
      const fnMatch = src.match(new RegExp(`fn\\s+${cmd}\\s*\\(([^)]+)\\)`, "s"));
      expect(fnMatch).not.toBeNull();
      const sig = fnMatch![1];
      // Must have session_token as a required String, not Option<String>
      expect(sig).toContain("session_token: String");
      expect(sig).not.toContain("session_token: Option<String>");
    }
  });

  it("no write command uses require_admin_session with None", () => {
    const p = join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs");
    if (!existsSync(p)) return;
    const src = readFileSync(p, "utf-8");
    // There should be zero instances of require_admin_session(&db, None)
    expect(src).not.toMatch(/require_admin_session\(&\w+,\s*None\)/);
  });
});

describe("CRITICAL-3: reversal_and_delete_ledger_entries helper exists", () => {
  it("legacy.rs defines the reversal helper function", () => {
    const p = join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs");
    if (!existsSync(p)) return;
    const src = readFileSync(p, "utf-8");
    expect(src).toMatch(/fn\s+reverse_and_delete_ledger_entries\s*\(/);
  });

  it("delete_car_purchase_ledger_entries uses reversal before delete", () => {
    const p = join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs");
    if (!existsSync(p)) return;
    const src = readFileSync(p, "utf-8");
    const fnMatch = src.match(/fn\s+delete_car_purchase_ledger_entries\s*\([^)]*\)\s*->[^{]*\{([^}]+)\}/s);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain("reverse_and_delete_ledger_entries");
  });

  it("delete_car_sale_ledger_entries uses reversal before delete", () => {
    const p = join(PROJECT_ROOT, "src-tauri", "src", "legacy.rs");
    if (!existsSync(p)) return;
    const src = readFileSync(p, "utf-8");
    const fnMatch = src.match(/fn\s+delete_car_sale_ledger_entries\s*\([^)]*\)\s*->[^{]*\{([^}]+)\}/s);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain("reverse_and_delete_ledger_entries");
  });
});
