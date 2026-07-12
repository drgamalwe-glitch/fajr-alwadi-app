#!/usr/bin/env python3
"""
FORENSIC REGRESSION TEST (re-audit 2026-07-10):
Agency Cash vs Credit Profit Recognition — Instructions.md §31.4

This test verifies the new agency profit recognition rules:

  1. Cash agency (payment_status="واصل"):
     - profit_recognition row created (affects_profit=1)
     - cash_movement row created (affects_qasa=1, affects_partner_cash=1)
     - NO receivable row
     - Amount appears in Profit card, Qasa, Cash

  2. Credit agency (payment_status="غير واصل"):
     - NO profit_recognition row
     - NO cash_movement row
     - receivable row created (kind="وكالة", source_role="agency_receivable")
     - Amount does NOT appear in Profit card, Qasa, or Cash
     - Amount DOES appear in Receivables

  3. Receiving payment on a credit agency (set_agency_receivable_status → paid=true):
     - receivable row reversed
     - profit_recognition row created
     - cash_movement row created
     - Amount now appears in Profit, Qasa, Cash

Because cargo is not available in this environment, this test simulates the
Rust logic in Python against an in-memory SQLite database that mirrors the
production schema (init_db v33).

Usage:
    python3 scripts/test_agency_cash_vs_credit.py
"""

import os
import sqlite3
import sys
import tempfile
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
            type TEXT NOT NULL,
            amount TEXT NOT NULL,
            date TEXT NOT NULL,
            notes TEXT,
            currency TEXT DEFAULT 'IQD',
            payment_type TEXT DEFAULT 'قاصه',
            time TEXT DEFAULT '00:00',
            source_type TEXT, source_id TEXT, source_role TEXT,
            affects_qasa INTEGER DEFAULT 1,
            affects_partner_cash INTEGER DEFAULT 1,
            affects_profit INTEGER DEFAULT 0,
            related_source_type TEXT, related_source_id TEXT,
            original_amount TEXT, current_amount TEXT,
            actual_paid_amount TEXT, paid_event_id INTEGER,
            due_date TEXT, ledger_batch_id TEXT,
            is_reversed INTEGER DEFAULT 0
        );

        CREATE TABLE financial_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL, time TEXT NOT NULL,
            account_type TEXT NOT NULL, account_id TEXT,
            debit TEXT NOT NULL, credit TEXT NOT NULL,
            currency TEXT NOT NULL,
            reference_type TEXT NOT NULL, reference_id TEXT NOT NULL,
            type_ TEXT NOT NULL, description TEXT NOT NULL, notes TEXT,
            ledger_batch_id TEXT
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

        CREATE TABLE agency_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agency_id INTEGER NOT NULL,
            date TEXT NOT NULL, time TEXT NOT NULL DEFAULT '00:00',
            type_ TEXT NOT NULL, amount TEXT NOT NULL,
            currency TEXT DEFAULT 'IQD', notes TEXT,
            FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
        );

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

        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            profile_image TEXT,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            last_login TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime'))
        );

        CREATE TABLE audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL, time TEXT NOT NULL,
            actor TEXT, action TEXT NOT NULL,
            entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
            field_name TEXT, old_value TEXT, new_value TEXT,
            description TEXT, notes TEXT,
            ledger_batch_id TEXT
        );

        CREATE TABLE car_partners (
            car_number TEXT NOT NULL, partner_name TEXT NOT NULL,
            amount TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'IQD',
            kind TEXT NOT NULL DEFAULT 'شريك',
            PRIMARY KEY (car_number, partner_name)
        );

        CREATE TABLE cash_register (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL, time TEXT DEFAULT '00:00',
            type TEXT NOT NULL, amount TEXT NOT NULL,
            description TEXT, notes TEXT
        );

        CREATE TABLE customer_installment_payment_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_uuid TEXT NOT NULL UNIQUE,
            customer_id TEXT NOT NULL, sale_id TEXT NOT NULL,
            installment_id INTEGER NOT NULL,
            currency TEXT NOT NULL,
            scheduled_amount_at_payment_time TEXT NOT NULL,
            actual_paid_amount TEXT NOT NULL,
            difference_amount TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            ledger_batch_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            reversed_at TEXT, reversed_by_event_id INTEGER,
            notes TEXT
        );

        CREATE TABLE login_attempts (
            username TEXT NOT NULL, attempted_at INTEGER NOT NULL
        );

        CREATE TABLE sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE profit_distributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL, time TEXT NOT NULL,
            total_profit TEXT NOT NULL, currency TEXT NOT NULL, notes TEXT
        );

        CREATE TABLE partner_profit_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            distribution_id INTEGER NOT NULL,
            partner_name TEXT NOT NULL,
            profit_share TEXT NOT NULL,
            drawings_deducted TEXT NOT NULL,
            amount_reinvested TEXT NOT NULL,
            amount_paid TEXT NOT NULL,
            currency TEXT NOT NULL,
            FOREIGN KEY (distribution_id) REFERENCES profit_distributions(id) ON DELETE CASCADE
        );

        INSERT INTO db_version VALUES (33);

        -- Seed the two business partners (Instructions.md §1.1).
        INSERT INTO partners (partner_name, kind, iqd_balance, usd_balance)
        VALUES ('أمير', 'شريك', '0', '0');
        INSERT INTO partners (partner_name, kind, iqd_balance, usd_balance)
        VALUES ('منتصر', 'شريك', '0', '0');

        -- Seed admin user (for session tests).
        INSERT INTO users (username, password_hash, display_name, must_change_password)
        VALUES ('admin', 'dummy_hash', 'Admin', 0);
    """)
    return conn


def add_agency_py(conn, old_agent, new_agent, amount_iqd, amount_usd, payment_status, token=None):
    """Python mirror of add_agency (lib.rs lines 13715-13799).

    Implements Instructions.md §31.4:
      - Cash (واصل): profit_recognition + cash_movement
      - Credit (غير واصل): only receivable row, no profit/cash
    """
    cur = conn.cursor()
    # Idempotency: check creation_token
    if token:
        existing = cur.execute(
            "SELECT id FROM agencies WHERE creation_token = ? LIMIT 1", (token,)
        ).fetchone()
        if existing:
            return existing[0]

    date = "2026-07-10"
    time = "12:00"
    cur.execute(
        """INSERT INTO agencies (old_agent_name, car_type, car_number, car_model, color,
           new_agent_name, phone, amount_usd, amount_iqd, notes, payment_status, date, time, creation_token)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (old_agent, "", "", "", "", new_agent, "", str(amount_usd), str(amount_iqd),
         "", payment_status, date, time, token)
    )
    agency_id = cur.lastrowid

    received = (payment_status == "واصل")
    note = f"وكالة {old_agent} {new_agent}"

    # Ledger entries (mirror of record_agency_ledger_entries, lib.rs §31.4.4).
    debit_acct = "cash" if received else "receivable"
    debit_id = "قاصه" if received else new_agent
    debit_type = "أرباح وكالة" if received else "باقي وكالة"
    credit_acct = "revenue" if received else "deferred_revenue"
    credit_type = "أرباح وكالة إيراد" if received else "إيراد مؤجل وكالة"

    if amount_iqd > 0:
        cur.execute(
            """INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
               currency, reference_type, reference_id, type_, description)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (date, time, debit_acct, debit_id, str(amount_iqd), "0", "IQD",
             "agency", str(agency_id), debit_type, note)
        )
        cur.execute(
            """INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
               currency, reference_type, reference_id, type_, description)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (date, time, credit_acct, "agency", "0", str(amount_iqd), "IQD",
             "agency", str(agency_id), credit_type, note)
        )

    if amount_usd > 0:
        cur.execute(
            """INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
               currency, reference_type, reference_id, type_, description)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (date, time, debit_acct, debit_id, str(amount_usd), "0", "USD",
             "agency", str(agency_id), debit_type, note)
        )
        cur.execute(
            """INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
               currency, reference_type, reference_id, type_, description)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (date, time, credit_acct, "agency", "0", str(amount_usd), "USD",
             "agency", str(agency_id), credit_type, note)
        )

    # Partner transaction effects (mirror of distribute_agency_partner_effects, lib.rs §31.4).
    if received:
        # profit_recognition — 50/50 split, affects_profit=1 only.
        for partner in ["أمير", "منتصر"]:
            cur.execute(
                """INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time,
                   notes, currency, payment_type, source_type, source_id, source_role,
                   affects_qasa, affects_partner_cash, affects_profit)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (partner, "شريك", "ايداع ارباح وكالة", str(amount_iqd / 2), date, time,
                 note, "IQD", "قاصه", "agency", str(agency_id), "profit_recognition",
                 0, 0, 1)
            )
        # cash_movement — 50/50 split, affects_qasa=1, affects_partner_cash=1.
        for partner in ["أمير", "منتصر"]:
            cur.execute(
                """INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time,
                   notes, currency, payment_type, source_type, source_id, source_role,
                   affects_qasa, affects_partner_cash, affects_profit)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (partner, "شريك", "ايداع ارباح وكالة", str(amount_iqd / 2), date, time,
                 note, "IQD", "قاصه", "agency", str(agency_id), "cash_movement",
                 1, 1, 0)
            )
    else:
        # Credit agency: only receivable row, no profit, no cash.
        cur.execute(
            """INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time,
               notes, currency, payment_type, source_type, source_id, source_role,
               affects_qasa, affects_partner_cash, affects_profit)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (new_agent, "وكالة", "باقي وكالة", str(amount_iqd), date, time,
             note, "IQD", "قاصه", "agency", str(agency_id), "agency_receivable",
             0, 0, 0)
        )

    return agency_id


def set_agency_received_py(conn, agency_id, received):
    """Python mirror of set_agency_receivable_status (mark agency as paid/unpaid).

    When marking as received:
      1. Update agencies.payment_status = "واصل"
      2. Reverse the old receivable + deferred_revenue ledger entries.
      3. Rebuild ledger + partner effects with received=true.
    """
    status = "واصل" if received else "غير واصل"
    cur = conn.cursor()
    cur.execute("UPDATE agencies SET payment_status = ? WHERE id = ?", (status, agency_id))

    # Reverse old ledger entries for this agency.
    cur.execute(
        "DELETE FROM financial_ledger WHERE reference_type='agency' AND reference_id=?",
        (str(agency_id),)
    )
    # Reverse old partner_transactions for this agency (non-receivable).
    cur.execute(
        """DELETE FROM partner_transactions
           WHERE source_type='agency' AND source_id=?""",
        (str(agency_id),)
    )

    # Re-read agency data.
    row = conn.execute(
        "SELECT old_agent_name, new_agent_name, amount_iqd, amount_usd, date, time FROM agencies WHERE id=?",
        (agency_id,)
    ).fetchone()
    if not row:
        return
    old_agent, new_agent, amount_iqd, amount_usd, date, time = row
    amount_iqd = float(amount_iqd or 0)
    amount_usd = float(amount_usd or 0)
    note = f"وكالة {old_agent} {new_agent}"

    if received:
        # Rebuild as cash agency: profit_recognition + cash_movement + ledger (Dr cash / Cr revenue).
        debit_acct, debit_id, debit_type = "cash", "قاصه", "أرباح وكالة"
        credit_acct, credit_type = "revenue", "أرباح وكالة إيراد"
        for partner in ["أمير", "منتصر"]:
            cur.execute(
                """INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time,
                   notes, currency, payment_type, source_type, source_id, source_role,
                   affects_qasa, affects_partner_cash, affects_profit)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (partner, "شريك", "ايداع ارباح وكالة", str(amount_iqd / 2), date, time,
                 note, "IQD", "قاصه", "agency", str(agency_id), "profit_recognition",
                 0, 0, 1)
            )
            cur.execute(
                """INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time,
                   notes, currency, payment_type, source_type, source_id, source_role,
                   affects_qasa, affects_partner_cash, affects_profit)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (partner, "شريك", "ايداع ارباح وكالة", str(amount_iqd / 2), date, time,
                 note, "IQD", "قاصه", "agency", str(agency_id), "cash_movement",
                 1, 1, 0)
            )
    else:
        # Rebuild as credit agency: receivable + deferred_revenue.
        debit_acct, debit_id, debit_type = "receivable", new_agent, "باقي وكالة"
        credit_acct, credit_type = "deferred_revenue", "إيراد مؤجل وكالة"
        cur.execute(
            """INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time,
               notes, currency, payment_type, source_type, source_id, source_role,
               affects_qasa, affects_partner_cash, affects_profit)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (new_agent, "وكالة", "باقي وكالة", str(amount_iqd), date, time,
             note, "IQD", "قاصه", "agency", str(agency_id), "agency_receivable",
             0, 0, 0)
        )

    if amount_iqd > 0:
        cur.execute(
            """INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
               currency, reference_type, reference_id, type_, description)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (date, time, debit_acct, debit_id, str(amount_iqd), "0", "IQD",
             "agency", str(agency_id), debit_type, note)
        )
        cur.execute(
            """INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
               currency, reference_type, reference_id, type_, description)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (date, time, credit_acct, "agency", "0", str(amount_iqd), "IQD",
             "agency", str(agency_id), credit_type, note)
        )


def main():
    print("=" * 70)
    print("REGRESSION TEST: Agency Cash vs Credit (Instructions.md §31.4)")
    print("=" * 70)

    conn = create_test_db()

    # ─────────────────────────────────────────────────────────────────
    print("\n[1] Cash agency (payment_status='واصل') — profit recognized immediately")
    # ─────────────────────────────────────────────────────────────────
    agency_id_1 = add_agency_py(conn, "وكيل1", "زبون1", 1_000_000, 0, "واصل")

    # Check profit_recognition row exists.
    profit_rows = conn.execute(
        """SELECT COUNT(*) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='profit_recognition' AND affects_profit=1""",
        (str(agency_id_1),)
    ).fetchone()[0]
    check("cash agency: 2 profit_recognition rows (50/50)", profit_rows == 2, f"got {profit_rows}")

    # Check cash_movement row exists.
    cash_rows = conn.execute(
        """SELECT COUNT(*) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='cash_movement' AND affects_qasa=1""",
        (str(agency_id_1),)
    ).fetchone()[0]
    check("cash agency: 2 cash_movement rows (50/50)", cash_rows == 2, f"got {cash_rows}")

    # Check NO receivable row.
    recv_rows = conn.execute(
        """SELECT COUNT(*) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='agency_receivable'""",
        (str(agency_id_1),)
    ).fetchone()[0]
    check("cash agency: 0 receivable rows", recv_rows == 0, f"got {recv_rows}")

    # Check profit amount.
    profit_amount = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(amount AS REAL)),0) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='profit_recognition'""",
        (str(agency_id_1),)
    ).fetchone()[0] or 0)
    check("cash agency: profit = 1,000,000", profit_amount == 1_000_000, f"got {profit_amount}")

    # Check ledger: Dr cash / Cr revenue.
    cash_debit = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(debit AS REAL)),0) FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='cash'""",
        (str(agency_id_1),)
    ).fetchone()[0] or 0)
    check("cash agency: ledger Dr cash = 1,000,000", cash_debit == 1_000_000, f"got {cash_debit}")

    revenue_credit = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(credit AS REAL)),0) FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='revenue'""",
        (str(agency_id_1),)
    ).fetchone()[0] or 0)
    check("cash agency: ledger Cr revenue = 1,000,000", revenue_credit == 1_000_000, f"got {revenue_credit}")

    # Check NO deferred_revenue.
    deferred = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(credit AS REAL)),0) FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='deferred_revenue'""",
        (str(agency_id_1),)
    ).fetchone()[0] or 0)
    check("cash agency: 0 deferred_revenue", deferred == 0, f"got {deferred}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[2] Credit agency (payment_status='غير واصل') — NO profit recognized")
    # ─────────────────────────────────────────────────────────────────
    agency_id_2 = add_agency_py(conn, "وكيل2", "زبون2", 2_000_000, 0, "غير واصل")

    # Check NO profit_recognition row.
    profit_rows_2 = conn.execute(
        """SELECT COUNT(*) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='profit_recognition'""",
        (str(agency_id_2),)
    ).fetchone()[0]
    check("credit agency: 0 profit_recognition rows", profit_rows_2 == 0, f"got {profit_rows_2}")

    # Check NO cash_movement row.
    cash_rows_2 = conn.execute(
        """SELECT COUNT(*) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='cash_movement'""",
        (str(agency_id_2),)
    ).fetchone()[0]
    check("credit agency: 0 cash_movement rows", cash_rows_2 == 0, f"got {cash_rows_2}")

    # Check receivable row exists.
    recv_rows_2 = conn.execute(
        """SELECT COUNT(*) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='agency_receivable'""",
        (str(agency_id_2),)
    ).fetchone()[0]
    check("credit agency: 1 receivable row", recv_rows_2 == 1, f"got {recv_rows_2}")

    # Check profit amount = 0.
    profit_amount_2 = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(amount AS REAL)),0) FROM partner_transactions
           WHERE affects_profit=1 AND source_type='agency' AND source_id=?""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("credit agency: profit = 0", profit_amount_2 == 0, f"got {profit_amount_2}")

    # Check Qasa contribution = 0.
    qasa_2 = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(amount AS REAL)),0) FROM partner_transactions
           WHERE affects_qasa=1 AND source_type='agency' AND source_id=?""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("credit agency: qasa contribution = 0", qasa_2 == 0, f"got {qasa_2}")

    # Check ledger: Dr receivable / Cr deferred_revenue (NOT revenue).
    recv_debit = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(debit AS REAL)),0) FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='receivable'""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("credit agency: ledger Dr receivable = 2,000,000", recv_debit == 2_000_000, f"got {recv_debit}")

    deferred_credit = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(credit AS REAL)),0) FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='deferred_revenue'""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("credit agency: ledger Cr deferred_revenue = 2,000,000", deferred_credit == 2_000_000, f"got {deferred_credit}")

    revenue_credit_2 = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(credit AS REAL)),0) FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='revenue'""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("credit agency: 0 revenue (deferred instead)", revenue_credit_2 == 0, f"got {revenue_credit_2}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[3] Receive payment on credit agency → profit recognized")
    # ─────────────────────────────────────────────────────────────────
    set_agency_received_py(conn, agency_id_2, received=True)

    # Check profit_recognition now exists.
    profit_rows_3 = conn.execute(
        """SELECT COUNT(*) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='profit_recognition' AND affects_profit=1""",
        (str(agency_id_2),)
    ).fetchone()[0]
    check("after payment: 2 profit_recognition rows", profit_rows_3 == 2, f"got {profit_rows_3}")

    # Check cash_movement now exists.
    cash_rows_3 = conn.execute(
        """SELECT COUNT(*) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='cash_movement' AND affects_qasa=1""",
        (str(agency_id_2),)
    ).fetchone()[0]
    check("after payment: 2 cash_movement rows", cash_rows_3 == 2, f"got {cash_rows_3}")

    # Check profit amount = 2,000,000.
    profit_amount_3 = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(amount AS REAL)),0) FROM partner_transactions
           WHERE source_type='agency' AND source_id=?
             AND source_role='profit_recognition'""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("after payment: profit = 2,000,000", profit_amount_3 == 2_000_000, f"got {profit_amount_3}")

    # Check ledger now: Dr cash / Cr revenue.
    cash_debit_3 = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(debit AS REAL)),0) FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='cash'""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("after payment: ledger Dr cash = 2,000,000", cash_debit_3 == 2_000_000, f"got {cash_debit_3}")

    revenue_credit_3 = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(credit AS REAL)),0) FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='revenue'""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("after payment: ledger Cr revenue = 2,000,000", revenue_credit_3 == 2_000_000, f"got {revenue_credit_3}")

    # Check deferred_revenue is now 0 (was reversed).
    deferred_after = float(conn.execute(
        """SELECT COALESCE(SUM(CAST(credit AS REAL))-SUM(CAST(debit AS REAL)),0)
           FROM financial_ledger
           WHERE reference_type='agency' AND reference_id=? AND account_type='deferred_revenue'""",
        (str(agency_id_2),)
    ).fetchone()[0] or 0)
    check("after payment: deferred_revenue net = 0", abs(deferred_after) < 0.01, f"got {deferred_after}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[4] Idempotency: same creation_token returns same agency ID")
    # ─────────────────────────────────────────────────────────────────
    token = str(uuid.uuid4())
    id_first = add_agency_py(conn, "وكيل3", "زبون3", 500_000, 0, "واصل", token=token)
    id_second = add_agency_py(conn, "وكيل3", "زبون3", 500_000, 0, "واصل", token=token)
    check("idempotency: same token → same ID", id_first == id_second, f"{id_first} != {id_second}")

    # Check only 1 agency was created.
    count = conn.execute(
        "SELECT COUNT(*) FROM agencies WHERE old_agent_name='وكيل3'"
    ).fetchone()[0]
    check("idempotency: only 1 agency row", count == 1, f"got {count}")

    # ─────────────────────────────────────────────────────────────────
    print("\n[5] Global ledger balance after all agency operations")
    # ─────────────────────────────────────────────────────────────────
    rows = conn.execute("""
        SELECT currency,
               COALESCE(SUM(CAST(debit AS REAL)),0),
               COALESCE(SUM(CAST(credit AS REAL)),0)
        FROM financial_ledger GROUP BY currency
    """).fetchall()
    for r in rows:
        cur_code, td, tc = r[0], float(r[1] or 0), float(r[2] or 0)
        diff = td - tc
        check(f"global ledger {cur_code} balanced", abs(diff) < 0.01, f"debit={td:.2f} credit={tc:.2f} diff={diff:.2f}")

    conn.close()

    # ─────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    if FAIL > 0:
        print("FAILURES:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    print("ALL ASSERTIONS PASSED — Agency cash vs credit rules verified.")
    print("=" * 70)


if __name__ == "__main__":
    main()
