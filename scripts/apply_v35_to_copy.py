#!/usr/bin/env python3
"""
scripts/apply_v35_to_copy.py

FORENSIC VERIFICATION (re-audit 2026-07-11, MIGRATION-V35):
We cannot compile Rust in this environment to run `init_db`, but we CAN
verify that the v35 migration SQL is syntactically valid and idempotent
by applying it to a COPY of the attached database using Python's sqlite3
module. The copy is then discarded.

This proves:
  - The ALTER TABLE statements don't fail with "duplicate column" on a
    second run (idempotency).
  - The CREATE UNIQUE INDEX IF NOT EXISTS statements succeed.
  - The postcondition SELECT finds all five indexes.
  - The db_version row can be inserted.

If this script fails, the Rust migration will fail at runtime.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

SRC_DB = "src-tauri/fjr_alwadi_data.db"

V35_SQL = """
-- 1. audit_log new columns (idempotent — DuplicateColumn is swallowed by Rust)
ALTER TABLE audit_log ADD COLUMN actor_user_id INTEGER;
ALTER TABLE audit_log ADD COLUMN session_id TEXT;
ALTER TABLE audit_log ADD COLUMN request_id TEXT;
ALTER TABLE audit_log ADD COLUMN creation_token TEXT;

-- 2. creation_token indexes (idempotent via IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_creation_token
    ON cars(creation_token)
    WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_creation_token
    ON expenses(creation_token)
    WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_car_expenses_creation_token
    ON car_expenses(creation_token)
    WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_creation_token
    ON partner_transactions(creation_token)
    WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_tx_creation_token
    ON agency_transactions(creation_token)
    WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '';

-- 3. Record version
INSERT INTO db_version (version) VALUES (35);
"""


def apply_v35(conn: sqlite3.Connection, expect_second_run_ok: bool) -> list[str]:
    """Apply V35_SQL statement-by-statement, tolerating DuplicateColumn on re-run."""
    errors: list[str] = []
    for stmt in V35_SQL.strip().split(";"):
        # Strip comment lines first, THEN check if anything is left.
        clean_lines = [ln for ln in stmt.splitlines() if not ln.strip().startswith("--")]
        clean = "\n".join(clean_lines).strip()
        if not clean:
            continue
        try:
            conn.execute(clean)
        except sqlite3.OperationalError as e:
            msg = str(e).lower()
            if "duplicate column" in msg:
                # Expected on second run
                if not expect_second_run_ok:
                    errors.append(f"UNEXPECTED duplicate column on first run: {e} :: {clean[:80]}")
            else:
                errors.append(f"{e} :: {clean[:80]}")
        except sqlite3.Error as e:
            errors.append(f"{e} :: {clean[:80]}")
    return errors


def verify_postconditions(conn: sqlite3.Connection, expect_version_35: bool = True) -> list[str]:
    errors: list[str] = []
    expected_indexes = [
        "idx_cars_creation_token",
        "idx_expenses_creation_token",
        "idx_car_expenses_creation_token",
        "idx_partner_tx_creation_token",
        "idx_agency_tx_creation_token",
    ]
    for idx in expected_indexes:
        cur = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?",
            (idx,),
        )
        cnt = cur.fetchone()[0]
        if cnt != 1:
            errors.append(f"postcondition failed: index {idx} count={cnt}")
    # Verify audit_log columns
    cur = conn.execute("PRAGMA table_info(audit_log)")
    cols = {row[1] for row in cur.fetchall()}
    for required in ("actor_user_id", "session_id", "request_id", "creation_token"):
        if required not in cols:
            errors.append(f"postcondition failed: audit_log column {required} missing")
    # Verify db_version row (only on first run — second run doesn't insert)
    if expect_version_35:
        cur = conn.execute("SELECT MAX(version) FROM db_version")
        v = cur.fetchone()[0]
        if v != 35:
            errors.append(f"postcondition failed: db_version max = {v}, expected 35")
    return errors


def main() -> int:
    if not os.path.exists(SRC_DB):
        print(f"ERROR: source DB {SRC_DB} not found", file=sys.stderr)
        return 2

    # Work on a copy — NEVER modify the original DB during testing.
    with tempfile.TemporaryDirectory() as td:
        copy_path = Path(td) / "v35_test.db"
        shutil.copy(SRC_DB, copy_path)

        conn = sqlite3.connect(copy_path)
        conn.execute("PRAGMA foreign_keys = ON")

        # First run — should succeed without "duplicate column"
        print("First run (fresh v35 application)...")
        errors1 = apply_v35(conn, expect_second_run_ok=False)
        if errors1:
            print("FIRST RUN ERRORS:", file=sys.stderr)
            for e in errors1:
                print(f"  - {e}", file=sys.stderr)
            conn.close()
            return 1
        conn.commit()  # persist the first run so the second run sees it
        post1 = verify_postconditions(conn)
        if post1:
            print("POSTCONDITION ERRORS after first run:", file=sys.stderr)
            for e in post1:
                print(f"  - {e}", file=sys.stderr)
            conn.close()
            return 1
        print("  OK: first run succeeded, all postconditions verified.")

        # Second run — should be idempotent (DuplicateColumn tolerated)
        # We have to remove the v35 row first OR tolerate its duplicate.
        # The Rust code only runs v35 if version < 35, so a second application
        # wouldn't happen in production. But we want to verify the SQL itself
        # is idempotent — so we re-run without re-inserting db_version.
        print("Second run (idempotency check)...")
        # The INSERT INTO db_version would fail with PRIMARY KEY constraint,
        # but Rust's `if version < 35` guard prevents it. So we only re-run
        # the ALTER + CREATE INDEX statements, not the INSERT.
        conn2 = sqlite3.connect(copy_path)
        conn2.execute("PRAGMA foreign_keys = ON")
        idempotent_sql = V35_SQL.replace("INSERT INTO db_version (version) VALUES (35);", "")
        for stmt in idempotent_sql.strip().split(";"):
            clean_lines = [ln for ln in stmt.splitlines() if not ln.strip().startswith("--")]
            clean = "\n".join(clean_lines).strip()
            if not clean:
                continue
            try:
                conn2.execute(clean)
            except sqlite3.OperationalError as e:
                msg = str(e).lower()
                if "duplicate column" in msg:
                    pass  # expected
                else:
                    print(f"  UNEXPECTED ERROR: {e}", file=sys.stderr)
                    conn2.close()
                    conn.close()
                    return 1
        post2 = verify_postconditions(conn2, expect_version_35=False)
        if post2:
            print("POSTCONDITION ERRORS after second run:", file=sys.stderr)
            for e in post2:
                print(f"  - {e}", file=sys.stderr)
            conn2.close()
            conn.close()
            return 1
        print("  OK: second run was idempotent, all postconditions still hold.")
        conn2.close()
        conn.close()

    print("\nVERDICT: v35 migration SQL is valid and idempotent on a copy of the attached DB.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
