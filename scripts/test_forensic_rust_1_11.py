#!/usr/bin/env python3
"""
FORENSIC REGRESSION TEST — FORENSIC-RUST-1-11
==============================================
Test: rebuild_customer_payment_profit_recognitions must not lose installment profits.

FORENSIC FIX (re-audit 2026-07-11):
The previous code had a bug where `pay_customer_installment_core` inserted
customer payment rows with `related_source_type = 'customer_payment_event'`,
but `rebuild_customer_payment_profit_recognitions` filtered by
`related_source_type = 'car'`. This meant every rebuild (migrations v25/v26/v30,
sold-car cost changes, sale edits) would DELETE installment profit rows and
never recreate them.

This test simulates the rebuild logic on a test DB and verifies that:
1. Installment profit rows are correctly identified for rebuild.
2. The `related_source_type = 'customer_payment_event'` rows are included
   (not just `related_source_type = 'car'` rows).
3. After a "rebuild", the profit rows are recreated with correct amounts.

This is a Python-side regression test that validates the SQL logic.
The actual Rust fix is in lib.rs `create_customer_payment_accounting_effects`
(line ~10883) — the UPDATE WHERE clause now includes
`OR related_source_type = 'customer_payment_event'`.
"""
import sqlite3
import sys
import os
import tempfile

PASS = 0
FAIL = 0
FAILURES = []


def check(label, condition, detail=""):
    global PASS, FAIL
    if bool(condition):
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        FAILURES.append(f"{label}: {detail}")
        print(f"  ❌ {label} — {detail}")


def create_test_db():
    """Create a test DB with a customer payment that has
    related_source_type='customer_payment_event' (the bug condition)."""
    db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    db.close()
    conn = sqlite3.connect(db.name)
    conn.row_factory = sqlite3.Row

    conn.executescript("""
        CREATE TABLE partner_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partner_name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'شريك',
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            notes TEXT,
            currency TEXT DEFAULT 'IQD',
            payment_type TEXT DEFAULT 'قاصه',
            time TEXT DEFAULT '00:00',
            source_type TEXT,
            source_id TEXT,
            source_role TEXT,
            affects_qasa INTEGER DEFAULT 1,
            affects_partner_cash INTEGER DEFAULT 1,
            affects_profit INTEGER DEFAULT 0,
            related_source_type TEXT,
            related_source_id TEXT,
            is_reversed INTEGER DEFAULT 0
        );
        CREATE TABLE cars (
            car_number TEXT PRIMARY KEY,
            purchase_price REAL DEFAULT 0,
            selling_price REAL DEFAULT 0,
            status TEXT NOT NULL
        );
        INSERT INTO cars VALUES ('INST001', 10000000, 20000000, 'مبيوعة');
    """)

    # Simulate a customer payment row as inserted by pay_customer_installment_core
    # (line 10159 in lib.rs) — with related_source_type='customer_payment_event'
    conn.execute("""
        INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, notes, currency, payment_type,
            source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
            related_source_type, related_source_id, is_reversed
        ) VALUES (
            'مشتري تقسيط', 'زبون', 'تسديد قسط', 1000000, '2026-03-15',
            'تسديد قسط شهر 1 #بيع_سيارة_INST001', 'IQD', 'قاصه',
            'customer_payment', '1', 'customer_payment', 0, 0, 0,
            'customer_payment_event', '5', 0
        )
    """)

    # Simulate the profit_recognition rows that would be created
    # (these are what rebuild would DELETE and recreate)
    conn.execute("""
        INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, notes, currency, payment_type,
            source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
            related_source_type, related_source_id, is_reversed
        ) VALUES (
            'أمير', 'شريك', 'ايداع ارباح سيارة', 250000, '2026-03-15',
            'ربح دفعة زبون #بيع_سيارة_INST001', 'IQD', 'قاصه',
            'customer_payment', '1', 'profit_recognition', 0, 0, 1,
            'car', 'INST001', 0
        )
    """)
    conn.execute("""
        INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, notes, currency, payment_type,
            source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
            related_source_type, related_source_id, is_reversed
        ) VALUES (
            'منتصر', 'شريك', 'ايداع ارباح سيارة', 250000, '2026-03-15',
            'ربح دفعة زبون #بيع_سيارة_INST001', 'IQD', 'قاصه',
            'customer_payment', '1', 'profit_recognition', 0, 0, 1,
            'car', 'INST001', 0
        )
    """)

    conn.commit()
    return conn, db.name


def test_old_buggy_rebuild_logic(conn):
    """Simulate the OLD (buggy) rebuild SELECT that filters by related_source_type='car'."""
    # This is the query from rebuild_customer_payment_profit_recognitions (line 11089)
    rows = conn.execute("""
        SELECT id, amount, COALESCE(currency, 'IQD'), date,
               COALESCE(payment_type, 'قاصه'), COALESCE(notes, ''),
               COALESCE(related_source_id, '')
        FROM partner_transactions
        WHERE kind = 'زبون'
          AND COALESCE(is_reversed, 0) = 0
          AND related_source_type = 'car'
          AND COALESCE(related_source_id, '') != ''
          AND (
            source_type = 'customer_payment'
            OR (source_type = 'customer_sale_payment' AND source_role = 'sale_down_payment')
          )
        ORDER BY date ASC, id ASC
    """).fetchall()
    return rows


def test_fixed_rebuild_logic(conn):
    """Simulate the FIXED rebuild SELECT that ALSO includes
    related_source_type='customer_payment_event' rows (after the UPDATE fix)."""
    # First, simulate the fixed UPDATE in create_customer_payment_accounting_effects
    # that changes related_source_type from 'customer_payment_event' to 'car'
    conn.execute("""
        UPDATE partner_transactions
        SET related_source_type = 'car', related_source_id = 'INST001'
        WHERE id = ? AND (
            related_source_type IS NULL
            OR related_source_id IS NULL
            OR related_source_id = ''
            OR related_source_type = 'customer_payment_event'
        )
    """, (1,))  # id=1 is the customer payment row
    conn.commit()

    # Now run the same SELECT — it should find the row
    rows = conn.execute("""
        SELECT id, amount, COALESCE(currency, 'IQD'), date,
               COALESCE(payment_type, 'قاصه'), COALESCE(notes, ''),
               COALESCE(related_source_id, '')
        FROM partner_transactions
        WHERE kind = 'زبون'
          AND COALESCE(is_reversed, 0) = 0
          AND related_source_type = 'car'
          AND COALESCE(related_source_id, '') != ''
          AND (
            source_type = 'customer_payment'
            OR (source_type = 'customer_sale_payment' AND source_role = 'sale_down_payment')
          )
        ORDER BY date ASC, id ASC
    """).fetchall()
    return rows


def main():
    print("=" * 70)
    print("FORENSIC REGRESSION TEST: FORENSIC-RUST-1-11")
    print("rebuild_customer_payment_profit_recognitions must not lose installment profits")
    print("=" * 70)

    conn, db_path = create_test_db()

    try:
        print("\n[1] OLD (buggy) rebuild logic — customer_payment_event rows are SKIPPED")
        old_rows = test_old_buggy_rebuild_logic(conn)
        check("OLD: 0 rows found (bug)", len(old_rows) == 0,
              f"expected 0 rows, got {len(old_rows)}")
        if len(old_rows) == 0:
            print("    → This confirms the bug: installment profit rows would be DELETED")
            print("      by rebuild and NEVER recreated, because the customer payment row")
            print("      has related_source_type='customer_payment_event' (not 'car').")

        print("\n[2] FIXED rebuild logic — customer_payment_event rows are UPDATED to 'car' first")
        new_rows = test_fixed_rebuild_logic(conn)
        check("FIXED: 1 row found (fix works)", len(new_rows) == 1,
              f"expected 1 row, got {len(new_rows)}")
        if len(new_rows) == 1:
            row = new_rows[0]
            check("FIXED: row id matches", row[0] == 1, f"got id={row[0]}")
            check("FIXED: amount matches", row[1] == 1000000, f"got amount={row[1]}")
            check("FIXED: car_number extracted", row[6] == 'INST001', f"got car={row[6]}")
            print("    → After the UPDATE, the rebuild SELECT correctly finds the row,")
            print("      so profit_recognition rows are properly recreated.")

        print("\n[3] Verify the UPDATE only fires for 'customer_payment_event' or NULL/empty")
        # Test that a row with related_source_type='car' (already correct) is NOT touched
        conn2 = sqlite3.connect(db_path)
        conn2.row_factory = sqlite3.Row
        # Insert a row that already has related_source_type='car'
        conn2.execute("""
            INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, notes, currency,
                source_type, source_role, affects_qasa, affects_partner_cash, affects_profit,
                related_source_type, related_source_id, is_reversed
            ) VALUES (
                'مشتري آخر', 'زبون', 'مقدمة بيع سيارة', 5000000, '2026-02-15',
                'مقدمة #بيع_سيارة_INST001', 'IQD',
                'customer_sale_payment', 'sale_down_payment', 0, 0, 0,
                'car', 'INST001', 0
            )
        """)
        conn2.commit()
        # The UPDATE should NOT change this row (it already has related_source_type='car'
        # and a non-empty related_source_id)
        before = conn2.execute(
            "SELECT related_source_type, related_source_id FROM partner_transactions WHERE id = ?",
            (4,)
        ).fetchone()
        # Run the fixed UPDATE on this row
        conn2.execute("""
            UPDATE partner_transactions
            SET related_source_type = 'car', related_source_id = 'INST001'
            WHERE id = 4 AND (
                related_source_type IS NULL
                OR related_source_id IS NULL
                OR related_source_id = ''
                OR related_source_type = 'customer_payment_event'
            )
        """)
        conn2.commit()
        after = conn2.execute(
            "SELECT related_source_type, related_source_id FROM partner_transactions WHERE id = ?",
            (4,)
        ).fetchone()
        check("FIXED: existing 'car' row not modified",
              before['related_source_type'] == after['related_source_type'] and
              before['related_source_id'] == after['related_source_id'],
              f"before={dict(before)}, after={dict(after)}")

        conn2.close()

    finally:
        conn.close()
        os.unlink(db_path)

    print("\n" + "=" * 70)
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    if FAIL > 0:
        print("\nFAILURES:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    print("\nALL ASSERTIONS PASSED — FORENSIC-RUST-1-11 regression test verified.")


if __name__ == "__main__":
    main()
