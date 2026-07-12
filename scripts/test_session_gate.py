#!/usr/bin/env python3
"""Verify the SQL semantics of the legacy-compatible admin session gate safely.

The production database is copied to a temporary file; only the copy is changed.
"""
from __future__ import annotations

import hashlib
import shutil
import sqlite3
import sys
import tempfile
import time
from pathlib import Path


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "src-tauri/fjr_alwadi_data.db").resolve()
    if not source.is_file():
        print(f"[FAIL] database not found: {source}")
        return 1

    before = sha256(source)
    checks = 0
    with tempfile.TemporaryDirectory(prefix="fajr-session-gate-") as temp_dir:
        copy_path = Path(temp_dir) / "session-gate.db"
        shutil.copy2(source, copy_path)
        conn = sqlite3.connect(copy_path)
        try:
            user = conn.execute("SELECT id FROM users WHERE id = 1").fetchone()
            assert user == (1,), "primary admin user id 1 is missing"
            checks += 1
            print("[PASS] primary admin exists in test copy")

            conn.execute("DELETE FROM sessions")
            conn.commit()
            now = int(time.time())
            active = conn.execute(
                "SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?",
                (1, now),
            ).fetchone()[0]
            assert active == 0
            checks += 1
            print("[PASS] no session means compatibility writes are denied")

            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                ("audit-live-session", 1, now, now + 3600),
            )
            conn.commit()
            active = conn.execute(
                "SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?",
                (1, now),
            ).fetchone()[0]
            assert active == 1
            checks += 1
            print("[PASS] live primary-admin session satisfies the gate")

            conn.execute(
                "UPDATE sessions SET expires_at = ? WHERE token = ?",
                (now - 1, "audit-live-session"),
            )
            conn.commit()
            active = conn.execute(
                "SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?",
                (1, now),
            ).fetchone()[0]
            assert active == 0
            checks += 1
            print("[PASS] expired session is rejected")
        finally:
            conn.close()

    after = sha256(source)
    assert before == after, "source database changed during session-gate test"
    checks += 1
    print("[PASS] production database hash remained unchanged")
    print(f"Session gate test completed: {checks} checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
