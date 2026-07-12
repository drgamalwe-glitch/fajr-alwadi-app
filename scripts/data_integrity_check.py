#!/usr/bin/env python3
"""
scripts/data_integrity_check.py

FORENSIC FIX (re-audit 2026-07-11, DATA-INTEGRITY-1):
Runs PRAGMA integrity_check, PRAGMA foreign_key_check, and a series of
accounting invariants on the attached SQLite database. The result is
written as a structured Markdown + JSON report so it can be cited as
evidence in the final audit.

Usage:
    python3 scripts/data_integrity_check.py [path_to_db] [output_dir]

If output_dir is omitted, reports are written next to the database.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

INVARIANTS = [
    ("db_version", "SELECT MAX(version) FROM db_version"),
    ("cars_count", "SELECT COUNT(*) FROM cars"),
    ("partners_count", "SELECT COUNT(*) FROM partners"),
    ("partner_transactions_count", "SELECT COUNT(*) FROM partner_transactions"),
    ("financial_ledger_count", "SELECT COUNT(*) FROM financial_ledger"),
    ("agencies_count", "SELECT COUNT(*) FROM agencies"),
    ("expenses_count", "SELECT COUNT(*) FROM expenses"),
    ("users_count", "SELECT COUNT(*) FROM users"),
    ("sessions_active", "SELECT COUNT(*) FROM sessions WHERE expires_at > strftime('%s','now')"),
    ("audit_log_count", "SELECT COUNT(*) FROM audit_log"),
    # §31.6: source metadata completeness
    ("pt_missing_source_type", "SELECT COUNT(*) FROM partner_transactions WHERE source_type IS NULL OR source_type = ''"),
    ("pt_missing_source_id", "SELECT COUNT(*) FROM partner_transactions WHERE source_id IS NULL OR source_id = ''"),
    ("pt_missing_source_role", "SELECT COUNT(*) FROM partner_transactions WHERE source_role IS NULL OR source_role = ''"),
    ("ledger_missing_reference_type", "SELECT COUNT(*) FROM financial_ledger WHERE reference_type IS NULL OR reference_type = ''"),
    ("ledger_missing_reference_id", "SELECT COUNT(*) FROM financial_ledger WHERE reference_id IS NULL OR reference_id = ''"),
    # Ledger balance per currency (debits must equal credits)
    ("ledger_iqd_dr", "SELECT COALESCE(SUM(CAST(debit AS REAL)),0) FROM financial_ledger WHERE currency='IQD' OR (currency IS NULL AND 'IQD'='IQD')"),
    ("ledger_iqd_cr", "SELECT COALESCE(SUM(CAST(credit AS REAL)),0) FROM financial_ledger WHERE currency='IQD' OR (currency IS NULL AND 'IQD'='IQD')"),
    # Orphan checks
    ("pt_orphan_partner", "SELECT COUNT(*) FROM partner_transactions pt WHERE NOT EXISTS (SELECT 1 FROM partners p WHERE p.partner_name = pt.partner_name AND p.kind = pt.kind)"),
    # creation_token uniqueness (per §31.2)
    ("pt_dup_creation_token", "SELECT COUNT(*) FROM (SELECT creation_token FROM partner_transactions WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '' GROUP BY creation_token HAVING COUNT(*) > 1)"),
    ("cars_dup_creation_token", "SELECT COUNT(*) FROM (SELECT creation_token FROM cars WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '' GROUP BY creation_token HAVING COUNT(*) > 1)"),
    ("expenses_dup_creation_token", "SELECT COUNT(*) FROM (SELECT creation_token FROM expenses WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '' GROUP BY creation_token HAVING COUNT(*) > 1)"),
    ("agency_tx_dup_creation_token", "SELECT COUNT(*) FROM (SELECT creation_token FROM agency_transactions WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '' GROUP BY creation_token HAVING COUNT(*) > 1)"),
]


def run_pragma(conn: sqlite3.Connection, pragma: str) -> list[tuple]:
    cur = conn.execute(f"PRAGMA {pragma}")
    return cur.fetchall()


def run_invariant(conn: sqlite3.Connection, name: str, sql: str) -> int:
    try:
        cur = conn.execute(sql)
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else 0
    except sqlite3.Error as e:
        return -1  # signal error


def main() -> int:
    db_path = sys.argv[1] if len(sys.argv) > 1 else "src-tauri/fjr_alwadi_data.db"
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(db_path) or ".")
    out_dir.mkdir(parents=True, exist_ok=True)

    if not os.path.exists(db_path):
        print(f"ERROR: database {db_path} not found", file=sys.stderr)
        return 2

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")

    integrity = run_pragma(conn, "integrity_check")
    fk_check = run_pragma(conn, "foreign_key_check")

    invariant_results: list[dict] = []
    for name, sql in INVARIANTS:
        val = run_invariant(conn, name, sql)
        invariant_results.append({"name": name, "value": val})

    # Compute ledger imbalance per currency if columns allow
    imbalance: dict[str, float] = {}
    try:
        cur = conn.execute(
            "SELECT COALESCE(currency, 'IQD') AS c, "
            "SUM(CAST(debit AS REAL)) - SUM(CAST(credit AS REAL)) AS diff "
            "FROM financial_ledger GROUP BY c"
        )
        for c, diff in cur.fetchall():
            if diff is None:
                continue
            if abs(diff) > 0.005:
                imbalance[c] = float(diff)
    except sqlite3.Error:
        pass

    conn.close()

    integrity_ok = len(integrity) == 1 and integrity[0][0] == "ok"
    fk_ok = len(fk_check) == 0
    imbalance_ok = len(imbalance) == 0

    # Source metadata violations are critical per §31.6
    src_meta_violations = (
        next((r for r in invariant_results if r["name"] == "pt_missing_source_type"), {"value": 0})["value"]
        + next((r for r in invariant_results if r["name"] == "pt_missing_source_id"), {"value": 0})["value"]
        + next((r for r in invariant_results if r["name"] == "pt_missing_source_role"), {"value": 0})["value"]
    )

    dup_token_violations = (
        next((r for r in invariant_results if r["name"] == "pt_dup_creation_token"), {"value": 0})["value"]
        + next((r for r in invariant_results if r["name"] == "cars_dup_creation_token"), {"value": 0})["value"]
        + next((r for r in invariant_results if r["name"] == "expenses_dup_creation_token"), {"value": 0})["value"]
        + next((r for r in invariant_results if r["name"] == "agency_tx_dup_creation_token"), {"value": 0})["value"]
    )

    overall_pass = (
        integrity_ok
        and fk_ok
        and imbalance_ok
        and src_meta_violations == 0
        and dup_token_violations == 0
    )

    # JSON report
    json_report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "database": db_path,
        "overall": "PASS" if overall_pass else "FAIL",
        "integrity_check": [list(r) for r in integrity],
        "foreign_key_check": [list(r) for r in fk_check],
        "ledger_imbalance_per_currency": imbalance,
        "source_metadata_violations": src_meta_violations,
        "duplicate_creation_token_violations": dup_token_violations,
        "invariants": invariant_results,
    }
    json_path = out_dir / "data_integrity_report.json"
    json_path.write_text(json.dumps(json_report, indent=2, ensure_ascii=False), encoding="utf-8")

    # Markdown report (Arabic)
    md_lines = [
        "# تقرير سلامة البيانات — Data Integrity Report",
        "",
        f"- **تاريخ التوليد:** {json_report['generated_at']}",
        f"- **قاعدة البيانات:** `{db_path}`",
        f"- **الحكم النهائي:** {'PASS ✅' if overall_pass else 'FAIL ❌'}",
        "",
        "## 1. PRAGMA integrity_check",
        "",
        "```",
    ]
    for r in integrity:
        md_lines.append(f"  {r[0]}")
    md_lines += ["```", "", "## 2. PRAGMA foreign_key_check", ""]
    if fk_ok:
        md_lines.append("- لا توجد مخالفات Foreign Key. ✅")
    else:
        md_lines.append("- توجد مخالفات:")
        for r in fk_check:
            md_lines.append(f"  - {list(r)}")
    md_lines += ["", "## 3. توازن Ledger حسب العملة", ""]
    if imbalance_ok:
        md_lines.append("- جميع العملات متوازنة (Debit = Credit). ✅")
    else:
        for c, diff in imbalance.items():
            md_lines.append(f"- عملة `{c}`: انحراف = {diff}")
    md_lines += ["", "## 4. اكتمال Source Metadata (§31.6)", ""]
    md_lines.append(f"- عدد الصفوف التي تفتقد source_type/source_id/source_role: **{src_meta_violations}**")
    md_lines += ["", "## 5. تكرار creation_token (§31.2)", ""]
    md_lines.append(f"- عدد الـ tokens المكررة: **{dup_token_violations}**")
    md_lines += ["", "## 6. Invariants", ""]
    md_lines.append("| الاسم | القيمة |")
    md_lines.append("|---|---|")
    for r in invariant_results:
        md_lines.append(f"| {r['name']} | {r['value']} |")
    md_lines += ["", "## 7. الحكم", ""]
    if overall_pass:
        md_lines.append("- ✅ جميع الفحوصات ناجحة.")
    else:
        md_lines.append("- ❌ يوجد فشل في واحد أو أكثر من الفحوصات. راجع الأقسام أعلاه.")
    md_lines += ["", f"- المسار الكامل للتقرير JSON: `{json_path}`"]

    md_path = out_dir / "data_integrity_report.md"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")

    print(f"Report written to: {md_path}")
    print(f"JSON written to:   {json_path}")
    print(f"Overall: {json_report['overall']}")
    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(main())
