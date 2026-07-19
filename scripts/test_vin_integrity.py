#!/usr/bin/env python3
"""Validate VIN normalization and duplicate-chassis policy on a SQLite snapshot."""
from __future__ import annotations

import hashlib
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


def sqlite_snapshot(source: Path, destination: Path) -> None:
    """Create a consistent snapshot including committed WAL content."""
    source_uri = f"file:{source}?mode=ro"
    with sqlite3.connect(source_uri, uri=True) as source_conn, sqlite3.connect(destination) as dest_conn:
        source_conn.backup(dest_conn)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: test_vin_integrity.py <sqlite-db>", file=sys.stderr)
        return 2

    source = Path(sys.argv[1]).resolve()
    before_hash = sha256(source)
    assertions = 0

    with tempfile.TemporaryDirectory(prefix="fajr-vin-audit-") as temp_dir:
        work_db = Path(temp_dir) / "audit.db"
        sqlite_snapshot(source, work_db)
        conn = sqlite3.connect(work_db)
        try:
            rows = conn.execute(
                "SELECT car_number, COALESCE(chassis_number, '') FROM cars "
                "WHERE TRIM(COALESCE(chassis_number, '')) != ''"
            ).fetchall()
            normalized_rows: list[tuple[str, str]] = []
            for car_number, chassis in rows:
                normalized = normalize(chassis)
                assert normalized, f"normalization erased VIN for {car_number!r}"
                normalized_rows.append((normalized, car_number))
            assertions += 1

            conn.execute("BEGIN IMMEDIATE")
            conn.executemany(
                "UPDATE cars SET chassis_number = ? WHERE car_number = ?",
                normalized_rows,
            )
            conn.commit()
            assertions += 1

            if normalized_rows:
                duplicate_vin = normalized_rows[0][0].lower()
                conn.execute(
                    "INSERT INTO cars (car_number, car_name, chassis_number, status) "
                    "VALUES (?, ?, ?, ?)",
                    ("__VIN_DUPLICATE_TEST__", "اختبار السماح بالتكرار", duplicate_vin, "متوفرة"),
                )
                conn.commit()
                duplicate_count = conn.execute(
                    "SELECT COUNT(*) FROM cars WHERE chassis_number = ? COLLATE NOCASE",
                    (duplicate_vin,),
                ).fetchone()[0]
                assert duplicate_count >= 2, "duplicate chassis must be allowed by §31.3"
                assertions += 1

            unique_index = conn.execute(
                "SELECT COUNT(*) FROM sqlite_master "
                "WHERE type='index' AND name='idx_cars_chassis_unique'"
            ).fetchone()[0]
            assert unique_index == 0, "obsolete unique chassis index still exists"
            assertions += 1
        finally:
            conn.close()

    assert sha256(source) == before_hash, "source database was modified"
    assertions += 1
    print(f"VIN policy PASS: {assertions} assertions; duplicate chassis allowed; source DB unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
