#!/usr/bin/env python3
"""Validate VIN normalization and uniqueness against a disposable SQLite copy."""
from __future__ import annotations

import hashlib
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(value: str) -> str:
    return "".join(ch for ch in value if not ch.isspace()).upper()


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: test_vin_integrity.py <sqlite-db>", file=sys.stderr)
        return 2

    source = Path(sys.argv[1]).resolve()
    before_hash = sha256(source)
    assertions = 0

    with tempfile.TemporaryDirectory(prefix="fajr-vin-audit-") as temp_dir:
        work_db = Path(temp_dir) / "audit.db"
        shutil.copy2(source, work_db)
        conn = sqlite3.connect(work_db)
        try:
            rows = conn.execute(
                "SELECT car_number, COALESCE(chassis_number, '') FROM cars "
                "WHERE TRIM(COALESCE(chassis_number, '')) != ''"
            ).fetchall()
            seen: dict[str, str] = {}
            normalized_rows: list[tuple[str, str]] = []
            for car_number, chassis in rows:
                normalized = normalize(chassis)
                if normalized in seen:
                    raise AssertionError(
                        f"duplicate normalized VIN {normalized!r}: "
                        f"{seen[normalized]!r} and {car_number!r}"
                    )
                seen[normalized] = car_number
                normalized_rows.append((normalized, car_number))
            assertions += 1

            conn.execute("BEGIN IMMEDIATE")
            conn.executemany(
                "UPDATE cars SET chassis_number = ? WHERE car_number = ?",
                normalized_rows,
            )
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_chassis_unique "
                "ON cars(chassis_number COLLATE NOCASE) "
                "WHERE chassis_number IS NOT NULL AND TRIM(chassis_number) != ''"
            )
            conn.commit()
            assertions += 1

            if normalized_rows:
                duplicate_vin = normalized_rows[0][0].lower()
                try:
                    conn.execute(
                        "INSERT INTO cars (car_number, car_name, chassis_number) "
                        "VALUES (?, ?, ?)",
                        ("__VIN_DUPLICATE_TEST__", "اختبار منع التكرار", duplicate_vin),
                    )
                    conn.commit()
                except sqlite3.IntegrityError:
                    conn.rollback()
                    assertions += 1
                else:
                    raise AssertionError("database accepted a duplicate VIN")

            duplicate_groups = conn.execute(
                "SELECT chassis_number, COUNT(*) FROM cars "
                "WHERE TRIM(COALESCE(chassis_number, '')) != '' "
                "GROUP BY chassis_number COLLATE NOCASE HAVING COUNT(*) > 1"
            ).fetchall()
            assert not duplicate_groups, duplicate_groups
            assertions += 1
        finally:
            conn.close()

    assert sha256(source) == before_hash, "source database was modified"
    assertions += 1
    print(f"VIN integrity PASS: {assertions} assertions; source DB unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
