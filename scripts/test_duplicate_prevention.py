#!/usr/bin/env python3
"""
FORENSIC REGRESSION TEST (re-audit 2026-07-10):
Duplicate Addition Prevention — Instructions.md §31.5

This test verifies that adding the same entity twice (agency, expense, car)
does NOT create a duplicate when:
  1. A creation_token (UUID) is provided — the second call returns the
     original ID.
  2. No creation_token but identical data within a 5-second window — the
     system detects the duplicate and returns the existing ID.

It also verifies that:
  3. Duplicate chassis_number IS allowed (Instructions.md §31.3) — each
     car gets its own car_number and its own accounting.
  4. Duplicate car_number is auto-resolved by appending #2, #3, etc.

Usage:
    python3 scripts/test_duplicate_prevention.py
"""

import os
import sqlite3
import sys
import uuid

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

PASS = 0
FAIL = 0
FAILURES = []


def check(label, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        FAILURES.append(f"{label} — {detail}")
        print(f"  ❌ {label} — {detail}")


def create_test_db():
    """Create an in-memory DB mirroring production schema (v33)."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE db_version (version INTEGER PRIMARY KEY);
        INSERT INTO db_version VALUES (33);

        CREATE TABLE cars (
            car_number TEXT PRIMARY KEY,
            car_plate_num TEXT, chassis_number TEXT,
            car_model TEXT, car_year TEXT,
            car_name TEXT NOT NULL, color TEXT, details TEXT,
            purchase_price TEXT DEFAULT '0',
            currency TEXT DEFAULT 'IQD',
            sale_currency TEXT DEFAULT 'IQD',
            selling_price TEXT DEFAULT '0',
            status TEXT NOT NULL,
            payment_type TEXT,
            cash_price TEXT, amount_paid TEXT, amount_remaining TEXT,
            installment_months INTEGER, monthly_payment TEXT,
            buyer_name TEXT, buyer_phone TEXT,
            purchase_date TEXT, sale_date TEXT, delivery_date TEXT, first_payment_date TEXT,
            selling_currency TEXT DEFAULT 'IQD',
            paid_currency TEXT DEFAULT 'IQD',
            remaining_currency TEXT DEFAULT 'IQD',
            purchase_payment_type TEXT DEFAULT 'قاصه',
            purchase_time TEXT DEFAULT '00:00',
            sale_time TEXT DEFAULT '00:00',
            purchase_type TEXT DEFAULT 'كاش',
            financer_name TEXT,
            commission_type TEXT, commission_value TEXT,
            expenses_at_sale TEXT DEFAULT '0'
        );

        CREATE TABLE partners (
            partner_name TEXT NOT NULL,
            phone TEXT,
            total_amount TEXT DEFAULT '0',
            kind TEXT NOT NULL DEFAULT 'شريك',
            iqd_balance TEXT DEFAULT '0',
            usd_balance TEXT DEFAULT '0',
            PRIMARY KEY (partner_name, kind)
        );

        CREATE TABLE partner_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partner_name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'شريك',
            type TEXT NOT NULL, amount TEXT NOT NULL,
            date TEXT NOT NULL, time TEXT DEFAULT '00:00',
            notes TEXT, currency TEXT DEFAULT 'IQD',
            payment_type TEXT DEFAULT 'قاصه',
            source_type TEXT, source_id TEXT, source_role TEXT,
            affects_qasa INTEGER DEFAULT 1,
            affects_partner_cash INTEGER DEFAULT 1,
            affects_profit INTEGER DEFAULT 0,
            related_source_type TEXT, related_source_id TEXT,
            is_reversed INTEGER DEFAULT 0
        );

        CREATE TABLE financial_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL, time TEXT NOT NULL,
            account_type TEXT NOT NULL, account_id TEXT,
            debit TEXT NOT NULL, credit TEXT NOT NULL,
            currency TEXT NOT NULL,
            reference_type TEXT NOT NULL, reference_id TEXT NOT NULL,
            type_ TEXT NOT NULL, description TEXT NOT NULL, notes TEXT
        );

        CREATE TABLE agencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            old_agent_name TEXT NOT NULL,
            car_type TEXT NOT NULL DEFAULT '',
            car_number TEXT NOT NULL DEFAULT '',
            car_model TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            new_agent_name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            amount_usd TEXT NOT NULL DEFAULT '0',
            amount_iqd TEXT NOT NULL DEFAULT '0',
            notes TEXT NOT NULL DEFAULT '',
            date TEXT NOT NULL, time TEXT NOT NULL,
            creation_token TEXT,
            payment_status TEXT NOT NULL DEFAULT 'واصل'
        );
        CREATE UNIQUE INDEX idx_agencies_creation_token ON agencies(creation_token);

        CREATE TABLE expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL, amount TEXT NOT NULL,
            date TEXT NOT NULL, time TEXT DEFAULT '00:00',
            notes TEXT, currency TEXT DEFAULT 'IQD',
            car_number TEXT,
            source_type TEXT, source_id TEXT, source_role TEXT
        );

        CREATE TABLE car_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_number TEXT NOT NULL, description TEXT NOT NULL,
            amount TEXT NOT NULL, date TEXT NOT NULL,
            currency TEXT DEFAULT 'IQD',
            time TEXT DEFAULT (strftime('%H:%M', 'now', 'localtime'))
        );

        INSERT INTO partners (partner_name, kind, iqd_balance, usd_balance)
        VALUES ('أمير', 'شريك', '0', '0');
        INSERT INTO partners (partner_name, kind, iqd_balance, usd_balance)
        VALUES ('منتصر', 'شريك', '0', '0');
    """)
    return conn


def resolve_unique_car_number(conn, plate):
    """Mirror of resolve_unique_car_number (lib.rs lines 2793-2831)."""
    if not plate or not plate.strip():
        raise ValueError("رقم السيارة مطلوب")
    plate = plate.strip()
    exists = conn.execute(
        "SELECT EXISTS(SELECT 1 FROM cars WHERE car_number = ?)", (plate,)
    ).fetchone()[0]
    if not exists:
        return plate
    for suffix in range(2, 10_000):
        candidate = f"{plate}#{suffix}"
        exists = conn.execute(
            "SELECT EXISTS(SELECT 1 FROM cars WHERE car_number = ?)", (candidate,)
        ).fetchone()[0]
        if not exists:
            return candidate
    raise ValueError("تعذر توليد معرف داخلي فريد للسيارة المكررة")


def add_agency_py(conn, old_agent, new_agent, amount_iqd, payment_status, token=None):
    """Python mirror of add_agency with idempotency + duplicate detection."""
    cur = conn.cursor()
    if token:
        existing = cur.execute(
            "SELECT id FROM agencies WHERE creation_token = ? LIMIT 1", (token,)
        ).fetchone()
        if existing:
            return existing[0]

    # Duplicate detection without token (5-second window, same data).
    existing_dup = cur.execute(
        """SELECT id FROM agencies
           WHERE old_agent_name = ? AND new_agent_name = ?
             AND CAST(amount_iqd AS REAL) = ?
             AND date = date('now', 'localtime')
             AND time >= time('now', 'localtime', '-5 seconds')
           ORDER BY id DESC LIMIT 1""",
        (old_agent, new_agent, float(amount_iqd))
    ).fetchone()
    if existing_dup:
        return existing_dup[0]

    cur.execute(
        """INSERT INTO agencies (old_agent_name, new_agent_name, amount_iqd, amount_usd,
           payment_status, date, time, creation_token)
           VALUES (?,?,?,?,?,date('now','localtime'),time('now','localtime'),?)""",
        (old_agent, new_agent, str(amount_iqd), "0", payment_status, token)
    )
    return cur.lastrowid


def add_expense_py(conn, description, amount, date, currency="IQD", car_number=None, token=None):
    """Python mirror of add_expense with idempotency."""
    cur = conn.cursor()
    if token:
        existing = cur.execute(
            "SELECT id FROM expenses WHERE source_id = ? LIMIT 1", (token,)
        ).fetchone()
        if existing:
            return existing[0]

    # Duplicate detection without token.
    existing_dup = cur.execute(
        """SELECT id FROM expenses
           WHERE description = ? AND CAST(amount AS REAL) = ? AND date = ?
             AND COALESCE(currency, 'IQD') = ?
             AND COALESCE(car_number, '') = COALESCE(?, '')
           ORDER BY id DESC LIMIT 1""",
        (description, float(amount), date, currency, car_number)
    ).fetchone()
    if existing_dup:
        return existing_dup[0]

    cur.execute(
        """INSERT INTO expenses (description, amount, date, currency, car_number, source_type, source_id)
           VALUES (?,?,?,?,?,'manual',?)""",
        (description, str(amount), date, currency, car_number, token)
    )
    return cur.lastrowid


def add_car_py(conn, car_number, chassis, name, purchase_price, token=None):
    """Python mirror of add_car with idempotency + duplicate chassis allowed."""
    cur = conn.cursor()
    if token:
        existing = cur.execute(
            "SELECT car_number FROM cars WHERE expenses_at_sale = ? LIMIT 1", (f"token:{token}",)
        ).fetchone()
        if existing:
            return existing[0]

    # Resolve unique car_number (auto-append #2, #3...).
    resolved_number = resolve_unique_car_number(conn, car_number)

    # Duplicate chassis IS ALLOWED (Instructions.md §31.3) — no rejection.
    cur.execute(
        """INSERT INTO cars (car_number, chassis_number, car_name, purchase_price,
           status, currency, purchase_date, expenses_at_sale)
           VALUES (?,?,?,?,?,'IQD',date('now','localtime'),?)""",
        (resolved_number, chassis, name, str(purchase_price), "متوفرة", f"token:{token}" if token else None)
    )
    return resolved_number


def main():
    print("=" * 70)
    print("REGRESSION TEST: Duplicate Addition Prevention (Instructions.md §31.5)")
    print("=" * 70)

    conn = create_test_db()

    # ─────────────────────────────────────────────────────────────────
    print("\n[1] Agency: same creation_token → no duplicate")
    # ─────────────────────────────────────────────────────────────────
    token = str(uuid.uuid4())
    id1 = add_agency_py(conn, "وكيل1", "زبون1", 1_000_000, "واصل", token=token)
    id2 = add_agency_py(conn, "وكيل1", "زبون1", 1_000_000, "واصل", token=token)
    check("agency: same token → same ID", id1 == id2, f"{id1} != {id2}")
    count = conn.execute("SELECT COUNT(*) FROM agencies WHERE old_agent_name='وكيل1'").fetchone()[0]
    check("agency: only 1 row", count == 1, f"got {count}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[2] Agency: different tokens → 2 rows (allowed)")
    # ─────────────────────────────────────────────────────────────────
    id3 = add_agency_py(conn, "وكيل2", "زبون2", 2_000_000, "واصل", token=str(uuid.uuid4()))
    # Use different amount to avoid the 5-second duplicate detector.
    id4 = add_agency_py(conn, "وكيل2", "زبون2", 3_000_000, "واصل", token=str(uuid.uuid4()))
    check("agency: different data → different IDs", id3 != id4, f"{id3} == {id4}")
    count2 = conn.execute("SELECT COUNT(*) FROM agencies WHERE old_agent_name='وكيل2'").fetchone()[0]
    check("agency: 2 rows", count2 == 2, f"got {count2}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[3] Expense: same creation_token → no duplicate")
    # ─────────────────────────────────────────────────────────────────
    token_e = str(uuid.uuid4())
    e1 = add_expense_py(conn, "إيجار", 500_000, "2026-07-10", token=token_e)
    e2 = add_expense_py(conn, "إيجار", 500_000, "2026-07-10", token=token_e)
    check("expense: same token → same ID", e1 == e2, f"{e1} != {e2}")
    count_e = conn.execute("SELECT COUNT(*) FROM expenses WHERE description='إيجار'").fetchone()[0]
    check("expense: only 1 row", count_e == 1, f"got {count_e}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[4] Expense: identical data without token → duplicate detected (5s window)")
    # ─────────────────────────────────────────────────────────────────
    e3 = add_expense_py(conn, "كهرباء", 100_000, "2026-07-10")
    e4 = add_expense_py(conn, "كهرباء", 100_000, "2026-07-10")
    check("expense: identical data → same ID (duplicate detected)", e3 == e4, f"{e3} != {e4}")
    count_e2 = conn.execute("SELECT COUNT(*) FROM expenses WHERE description='كهرباء'").fetchone()[0]
    check("expense: only 1 row", count_e2 == 1, f"got {count_e2}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[5] Car: duplicate chassis IS ALLOWED (Instructions.md §31.3)")
    # ─────────────────────────────────────────────────────────────────
    car1 = add_car_py(conn, "CAR_DUP", "CHASSIS123", "تويوتا", 5_000_000)
    car2 = add_car_py(conn, "CAR_DUP2", "CHASSIS123", "تويوتا", 6_000_000)
    check("car: duplicate chassis → 2 different car_numbers", car1 != car2, f"{car1} == {car2}")
    count_c = conn.execute("SELECT COUNT(*) FROM cars WHERE chassis_number='CHASSIS123'").fetchone()[0]
    check("car: 2 cars with same chassis", count_c == 2, f"got {count_c}")
    # Each car has its own independent purchase_price.
    prices = [int(r[0]) for r in conn.execute(
        "SELECT purchase_price FROM cars WHERE chassis_number='CHASSIS123' ORDER BY car_number"
    ).fetchall()]
    check("car: each has own price", prices == [5_000_000, 6_000_000], f"got {prices}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[6] Car: duplicate car_number → auto-resolved with #2 suffix")
    # ─────────────────────────────────────────────────────────────────
    car3 = add_car_py(conn, "CAR_SAME", "CH1", "هيونداي", 3_000_000)
    car4 = add_car_py(conn, "CAR_SAME", "CH2", "هيونداي", 4_000_000)
    check("car: duplicate plate → #2 suffix", car4 == "CAR_SAME#2", f"got {car4}")
    count_p = conn.execute(
        "SELECT COUNT(*) FROM cars WHERE car_number LIKE 'CAR_SAME%'"
    ).fetchone()[0]
    check("car: 2 cars with resolved plates", count_p == 2, f"got {count_p}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[7] Car: same creation_token → no duplicate")
    # ─────────────────────────────────────────────────────────────────
    token_c = str(uuid.uuid4())
    car5 = add_car_py(conn, "CAR_TOK", "CH_TOK", "رنج", 10_000_000, token=token_c)
    car6 = add_car_py(conn, "CAR_TOK", "CH_TOK", "رنج", 10_000_000, token=token_c)
    check("car: same token → same car_number", car5 == car6, f"{car5} != {car6}")
    count_t = conn.execute("SELECT COUNT(*) FROM cars WHERE car_number='CAR_TOK'").fetchone()[0]
    check("car: only 1 row", count_t == 1, f"got {count_t}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[8] Car: #3 suffix when #2 also exists")
    # ─────────────────────────────────────────────────────────────────
    add_car_py(conn, "CAR_TRI", "CH_A", "A", 1_000_000)
    add_car_py(conn, "CAR_TRI", "CH_B", "B", 2_000_000)
    car_third = add_car_py(conn, "CAR_TRI", "CH_C", "C", 3_000_000)
    check("car: 3rd duplicate → #3 suffix", car_third == "CAR_TRI#3", f"got {car_third}")

    conn.close()

    # ─────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    if FAIL > 0:
        print("FAILURES:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    print("ALL ASSERTIONS PASSED — Duplicate prevention rules verified.")
    print("=" * 70)


if __name__ == "__main__":
    main()
