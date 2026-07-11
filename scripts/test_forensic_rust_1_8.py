#!/usr/bin/env python3
"""
FORENSIC REGRESSION TEST — FORENSIC-RUST-1-8
==============================================
Test: reverse_ledger_entries must track reversals by original entry rowid,
not by fuzzy (account, amount, type) matching.

FORENSIC FIX (re-audit 2026-07-11):
The previous code checked whether a reversal entry with the same
(account_type, account_id, debit, credit, currency, type_) already existed.
This is wrong because:
1. Two different original entries can have the same account/amount/type
   but different rowids — both need their own reversal.
2. If record_partner_ledger_entries is called again (e.g. via update_agency),
   it re-creates the original entries, and then reverse_ledger_entries would
   skip creating the matching reversal (because a reversal already exists
   from a prior call), leaving the ledger with DUPLICATE original entries
   and only ONE set of reversals.

The fix adds a `reverses_ledger_id` column that links each reversal to the
specific original entry's rowid. This is a 1:1 link.

This Python test simulates the reversal logic and verifies:
1. Two original entries with the same account/amount get separate reversals.
2. Re-calling reverse on the same entries does NOT create duplicate reversals.
3. If an original entry is deleted and re-created (new rowid), its reversal
   IS created (because the new rowid has no reversal yet).
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
    db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    db.close()
    conn = sqlite3.connect(db.name)
    conn.row_factory = sqlite3.Row

    conn.executescript("""
        CREATE TABLE financial_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            account_type TEXT NOT NULL,
            account_id TEXT,
            debit REAL NOT NULL,
            credit REAL NOT NULL,
            currency TEXT NOT NULL,
            reference_type TEXT NOT NULL,
            reference_id TEXT NOT NULL,
            type_ TEXT NOT NULL,
            description TEXT NOT NULL,
            notes TEXT,
            ledger_batch_id TEXT,
            reverses_ledger_id INTEGER DEFAULT NULL
        );
    """)
    conn.commit()
    return conn, db.name


def fixed_reverse_ledger_entries(conn, reference_type, reference_id):
    """Python implementation of the FIXED reverse_ledger_entries logic."""
    # Ensure reverses_ledger_id column exists
    try:
        conn.execute("ALTER TABLE financial_ledger ADD COLUMN reverses_ledger_id INTEGER DEFAULT NULL")
    except sqlite3.OperationalError:
        pass  # Column already exists

    rows = conn.execute("""
        SELECT id, date, time, account_type, account_id, debit, credit, currency, type_, description, notes
        FROM financial_ledger
        WHERE reference_type = ? AND reference_id = ?
          AND type_ NOT LIKE 'عكس:%'
          AND type_ NOT LIKE 'عكس: %'
    """, (reference_type, reference_id)).fetchall()

    for row in rows:
        orig_id = row['id']
        rev_debit = row['credit']
        rev_credit = row['debit']
        rev_type = f"عكس: {row['type_']}"
        rev_desc = f"عكس: {row['description']}"

        # Check if THIS specific original entry (by rowid) has already been reversed
        already = conn.execute(
            "SELECT EXISTS(SELECT 1 FROM financial_ledger WHERE reverses_ledger_id = ?)",
            (orig_id,)
        ).fetchone()[0]
        if already:
            continue

        conn.execute("""
            INSERT INTO financial_ledger (
                date, time, account_type, account_id, debit, credit, currency,
                reference_type, reference_id, type_, description, notes, reverses_ledger_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            row['date'], row['time'], row['account_type'], row['account_id'],
            rev_debit, rev_credit, row['currency'],
            reference_type, reference_id, rev_type, rev_desc, row['notes'],
            orig_id
        ))
    conn.commit()


def old_buggy_reverse_ledger_entries(conn, reference_type, reference_id):
    """Python implementation of the OLD (buggy) reverse_ledger_entries logic."""
    rows = conn.execute("""
        SELECT date, time, account_type, account_id, debit, credit, currency, type_, description, notes
        FROM financial_ledger
        WHERE reference_type = ? AND reference_id = ?
          AND type_ NOT LIKE 'عكس:%'
          AND type_ NOT LIKE 'عكس: %'
    """, (reference_type, reference_id)).fetchall()

    for row in rows:
        rev_debit = row['credit']
        rev_credit = row['debit']
        rev_type = f"عكس: {row['type_']}"

        # BUG: check by (account, amount, type) fuzzy match
        already = conn.execute("""
            SELECT EXISTS(
                SELECT 1 FROM financial_ledger
                WHERE reference_type = ? AND reference_id = ?
                  AND account_type = ?
                  AND COALESCE(account_id, '') = COALESCE(?, '')
                  AND debit = ? AND credit = ?
                  AND currency = ?
                  AND type_ = ?
            )
        """, (
            reference_type, reference_id,
            row['account_type'], row['account_id'],
            rev_debit, rev_credit, row['currency'], rev_type
        )).fetchone()[0]
        if already:
            continue

        conn.execute("""
            INSERT INTO financial_ledger (
                date, time, account_type, account_id, debit, credit, currency,
                reference_type, reference_id, type_, description, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            row['date'], row['time'], row['account_type'], row['account_id'],
            rev_debit, rev_credit, row['currency'],
            reference_type, reference_id, rev_type, f"عكس: {row['description']}", row['notes']
        ))
    conn.commit()


def main():
    print("=" * 70)
    print("FORENSIC REGRESSION TEST: FORENSIC-RUST-1-8")
    print("reverse_ledger_entries must track reversals by rowid, not fuzzy match")
    print("=" * 70)

    # ── Test 1: Two original entries with same account/amount get separate reversals ──
    print("\n[1] Two original entries with same account/amount → separate reversals")
    conn, db_path = create_test_db()
    try:
        # Insert two identical original entries (same account, amount, type)
        conn.execute("""
            INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description)
            VALUES ('2026-01-01', '00:00', 'cash', 'قاصه', 1000000, 0, 'IQD', 'partner_transaction', '100', 'ايداع شريك', 'إيداع 1')
        """)
        conn.execute("""
            INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description)
            VALUES ('2026-01-02', '00:00', 'cash', 'قاصه', 1000000, 0, 'IQD', 'partner_transaction', '100', 'ايداع شريك', 'إيداع 2')
        """)
        conn.commit()

        fixed_reverse_ledger_entries(conn, 'partner_transaction', '100')

        orig_count = conn.execute(
            "SELECT COUNT(*) FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id='100' AND type_ NOT LIKE 'عكس:%'"
        ).fetchone()[0]
        rev_count = conn.execute(
            "SELECT COUNT(*) FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id='100' AND type_ LIKE 'عكس:%'"
        ).fetchone()[0]

        check("FIXED: 2 original entries", orig_count == 2, f"got {orig_count}")
        check("FIXED: 2 reversal entries (1:1)", rev_count == 2, f"got {rev_count}")
    finally:
        conn.close()
        os.unlink(db_path)

    # ── Test 2: OLD bug — second identical entry does NOT get a reversal ──
    print("\n[2] OLD bug: second identical entry skipped (fuzzy match)")
    conn, db_path = create_test_db()
    try:
        conn.execute("""
            INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description)
            VALUES ('2026-01-01', '00:00', 'cash', 'قاصه', 1000000, 0, 'IQD', 'partner_transaction', '200', 'ايداع شريك', 'إيداع 1')
        """)
        conn.execute("""
            INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description)
            VALUES ('2026-01-02', '00:00', 'cash', 'قاصه', 1000000, 0, 'IQD', 'partner_transaction', '200', 'ايداع شريك', 'إيداع 2')
        """)
        conn.commit()

        old_buggy_reverse_ledger_entries(conn, 'partner_transaction', '200')

        rev_count = conn.execute(
            "SELECT COUNT(*) FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id='200' AND type_ LIKE 'عكس:%'"
        ).fetchone()[0]

        check("OLD: only 1 reversal (bug)", rev_count == 1,
              f"got {rev_count} (should be 2 — second entry skipped)")
    finally:
        conn.close()
        os.unlink(db_path)

    # ── Test 3: Re-calling reverse does NOT create duplicate reversals ──
    print("\n[3] Re-calling reverse does NOT create duplicate reversals")
    conn, db_path = create_test_db()
    try:
        conn.execute("""
            INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description)
            VALUES ('2026-01-01', '00:00', 'cash', 'قاصه', 500000, 0, 'IQD', 'partner_transaction', '300', 'ايداع شريك', 'إيداع')
        """)
        conn.commit()

        fixed_reverse_ledger_entries(conn, 'partner_transaction', '300')
        fixed_reverse_ledger_entries(conn, 'partner_transaction', '300')  # second call

        rev_count = conn.execute(
            "SELECT COUNT(*) FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id='300' AND type_ LIKE 'عكس:%'"
        ).fetchone()[0]
        check("FIXED: still 1 reversal after 2 calls", rev_count == 1, f"got {rev_count}")
    finally:
        conn.close()
        os.unlink(db_path)

    # ── Test 4: Re-created original (new rowid) DOES get a reversal ──
    print("\n[4] Re-created original entry (new rowid) gets a new reversal")
    conn, db_path = create_test_db()
    try:
        # Insert original, reverse it, then delete both and re-insert original
        conn.execute("""
            INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description)
            VALUES ('2026-01-01', '00:00', 'cash', 'قاصه', 500000, 0, 'IQD', 'partner_transaction', '400', 'ايداع شريك', 'إيداع')
        """)
        conn.commit()
        fixed_reverse_ledger_entries(conn, 'partner_transaction', '400')

        # Delete ALL entries for this reference and re-insert original
        conn.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id='400'")
        conn.execute("""
            INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description)
            VALUES ('2026-01-01', '00:00', 'cash', 'قاصه', 500000, 0, 'IQD', 'partner_transaction', '400', 'ايداع شريك', 'إيداع')
        """)
        conn.commit()

        # Now reverse again — should create a new reversal (new rowid)
        fixed_reverse_ledger_entries(conn, 'partner_transaction', '400')

        rev_count = conn.execute(
            "SELECT COUNT(*) FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id='400' AND type_ LIKE 'عكس:%'"
        ).fetchone()[0]
        check("FIXED: new reversal created for re-created original", rev_count == 1, f"got {rev_count}")
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
    print("\nALL ASSERTIONS PASSED — FORENSIC-RUST-1-8 regression test verified.")


if __name__ == "__main__":
    main()
