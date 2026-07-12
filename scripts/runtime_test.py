#!/usr/bin/env python3
"""
Runtime Test Scenarios for Fajr Alwadi
Creates a temporary seeded SQLite database and validates accounting rules.

FORENSIC FIX (re-audit 2026-07-10, Bug #1):
The previous schema was stuck at db_version=12 and was missing critical
columns added by later migrations (is_reversed, original_amount,
current_amount, actual_paid_amount, paid_event_id, due_date,
ledger_batch_id, expenses_at_sale, selling_currency, paid_currency,
remaining_currency, must_change_password, last_login, audit_log
field_name/old_value/new_value, expenses.source_type/source_id/
source_role, agencies.creation_token/payment_status, etc.). It also used
REAL for money columns whereas the production schema uses TEXT.

Symptom: check_installment_profit.py queried `pt.is_reversed` against the
runtime test DB and crashed with `sqlite3.OperationalError: no such
column: pt.is_reversed`, masking all subsequent installment-profit
checks.

Fix: bring this script's schema into sync with the production schema
applied by init_db() in src-tauri/src/lib.rs (db_version=32). Money
columns are kept as REAL for backward compatibility with the seed data
below (which already uses Python floats), but every TEXT column that
downstream scripts depend on is now present.
"""

import sqlite3
import sys
import os
import tempfile

def create_test_db(path):
    """Create a minimal seeded database for testing.

    Schema mirrors production init_db() (db_version=32) closely enough that
    accounting_audit.py and check_installment_profit.py can run unchanged.
    """
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row

    # Create tables — mirror production schema (init_db in lib.rs).
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY);
        INSERT INTO db_version VALUES (32);

        CREATE TABLE IF NOT EXISTS cars (
            car_number TEXT PRIMARY KEY,
            car_plate_num TEXT,
            chassis_number TEXT,
            car_model TEXT,
            car_year TEXT,
            car_name TEXT NOT NULL,
            color TEXT,
            details TEXT,
            purchase_price REAL DEFAULT 0.0,
            currency TEXT DEFAULT 'IQD',
            sale_currency TEXT DEFAULT 'IQD',
            selling_price REAL DEFAULT 0.0,
            status TEXT NOT NULL,
            payment_type TEXT,
            cash_price REAL,
            amount_paid REAL,
            amount_remaining REAL,
            installment_months INTEGER,
            monthly_payment REAL,
            buyer_name TEXT,
            buyer_phone TEXT,
            purchase_date TEXT,
            sale_date TEXT,
            delivery_date TEXT,
            first_payment_date TEXT,
            selling_currency TEXT DEFAULT 'IQD',
            paid_currency TEXT DEFAULT 'IQD',
            remaining_currency TEXT DEFAULT 'IQD',
            purchase_payment_type TEXT DEFAULT 'قاصه',
            purchase_time TEXT DEFAULT '00:00',
            sale_time TEXT DEFAULT '00:00',
            purchase_type TEXT DEFAULT 'كاش',
            financer_name TEXT,
            commission_type TEXT,
            commission_value REAL,
            expenses_at_sale REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS partners (
            partner_name TEXT NOT NULL,
            phone TEXT,
            total_amount REAL DEFAULT 0.0,
            kind TEXT NOT NULL DEFAULT 'شريك',
            iqd_balance REAL DEFAULT 0.0,
            usd_balance REAL DEFAULT 0.0,
            PRIMARY KEY (partner_name, kind)
        );

        CREATE TABLE IF NOT EXISTS partner_transactions (
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
            original_amount TEXT,
            current_amount TEXT,
            actual_paid_amount TEXT,
            paid_event_id INTEGER,
            due_date TEXT,
            ledger_batch_id TEXT,
            is_reversed INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS financial_ledger (
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
            ledger_batch_id TEXT
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            notes TEXT,
            currency TEXT DEFAULT 'IQD',
            car_number TEXT,
            source_type TEXT,
            source_id TEXT,
            source_role TEXT
        );

        CREATE TABLE IF NOT EXISTS car_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_number TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            currency TEXT DEFAULT 'IQD',
            time TEXT DEFAULT '00:00'
        );

        CREATE TABLE IF NOT EXISTS car_partners (
            car_number TEXT NOT NULL,
            partner_name TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'IQD',
            kind TEXT NOT NULL DEFAULT 'شريك',
            PRIMARY KEY (car_number, partner_name)
        );

        CREATE TABLE IF NOT EXISTS agencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            old_agent_name TEXT NOT NULL,
            car_type TEXT NOT NULL DEFAULT '',
            car_number TEXT NOT NULL DEFAULT '',
            car_model TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            new_agent_name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            amount_usd REAL NOT NULL DEFAULT 0.0,
            amount_iqd REAL NOT NULL DEFAULT 0.0,
            notes TEXT NOT NULL DEFAULT '',
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            creation_token TEXT,
            payment_status TEXT NOT NULL DEFAULT 'واصل'
        );

        CREATE TABLE IF NOT EXISTS agency_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agency_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL DEFAULT '00:00',
            type_ TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'IQD',
            notes TEXT,
            FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS users (
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

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            actor TEXT,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            field_name TEXT,
            old_value TEXT,
            new_value TEXT,
            description TEXT,
            notes TEXT,
            ledger_batch_id TEXT
        );

        -- Tables added by later migrations (presence required so that
        -- downstream audit scripts that JOIN against these tables do not
        -- fail with "no such table").
        CREATE TABLE IF NOT EXISTS cash_register (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            type TEXT NOT NULL,
            amount TEXT NOT NULL,
            description TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS customer_installment_payment_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_uuid TEXT NOT NULL UNIQUE,
            customer_id TEXT NOT NULL,
            sale_id TEXT NOT NULL,
            installment_id INTEGER NOT NULL,
            currency TEXT NOT NULL,
            scheduled_amount_at_payment_time TEXT NOT NULL,
            actual_paid_amount TEXT NOT NULL,
            difference_amount TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            ledger_batch_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            reversed_at TEXT,
            reversed_by_event_id INTEGER,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
            username TEXT NOT NULL,
            attempted_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS profit_distributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            total_profit TEXT NOT NULL,
            currency TEXT NOT NULL,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS partner_profit_shares (
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
    """)

    # Seed partners
    conn.execute("INSERT INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES ('أمير', '07808425228', 0, 'شريك', 0, 0)")
    conn.execute("INSERT INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES ('منتصر', '07812541714', 0, 'شريك', 0, 0)")

    # ===== Seed Car 1: Cash purchased, available =====
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, chassis_number, car_model, car_year, car_name, color,
            purchase_price, currency, sale_currency, selling_price, status, payment_type, purchase_type,
            purchase_date, purchase_time)
        VALUES ('CAR001', '12345', 'CH001', 'كامري', '2024', 'كامري 2024', 'أبيض',
            10000000, 'IQD', 'IQD', 0, 'متوفرة', NULL, 'كاش',
            '2026-01-15', '10:00')
    """)
    # Purchase ledger for CAR001
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-01-15', '10:00', 'inventory', 'CAR001', 10000000, 0, 'IQD', 'car', 'CAR001', 'شراء سيارة', 'شراء سيارة: كامري 2024', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-01-15', '10:00', 'cash', 'قاصه', 0, 10000000, 'IQD', 'car', 'CAR001', 'شراء سيارة كاش', 'سحب نقدي لشراء سيارة', NULL)")
    # Partner purchase rows for CAR001
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('أمير', 'شريك', 'سحب شراء', 5000000, '2026-01-15', 'سحب شراء كامري 2024', 'IQD', 'قاصه', '10:00', 'car_purchase', 'CAR001', 'cash_payment', 1, 1, 0, NULL, NULL)")
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('منتصر', 'شريك', 'سحب شراء', 5000000, '2026-01-15', 'سحب شراء كامري 2024', 'IQD', 'قاصه', '10:00', 'car_purchase', 'CAR001', 'cash_payment', 1, 1, 0, NULL, NULL)")

    # ===== Seed Car 2: Cash sale (complete) =====
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, chassis_number, car_model, car_year, car_name, color,
            purchase_price, currency, sale_currency, selling_price, status, payment_type, amount_paid,
            amount_remaining, buyer_name, buyer_phone, purchase_type, purchase_date, sale_date,
            purchase_time, sale_time)
        VALUES ('CAR002', '67890', 'CH002', 'كورولا', '2024', 'كورولا 2024', 'أسود',
            8000000, 'IQD', 'IQD', 15000000, 'مبيوعة', 'كاش', 15000000,
            0, 'أحمد', '07901234567', 'كاش', '2026-02-01', '2026-02-15',
            '09:00', '14:00')
    """)
    # Purchase ledger for CAR002
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-02-01', '09:00', 'inventory', 'CAR002', 8000000, 0, 'IQD', 'car', 'CAR002', 'شراء سيارة', 'شراء سيارة: كورولا 2024', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-02-01', '09:00', 'cash', 'قاصه', 0, 8000000, 'IQD', 'car', 'CAR002', 'شراء سيارة كاش', 'سحب نقدي لشراء سيارة', NULL)")
    # Partner purchase rows for CAR002
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('أمير', 'شريك', 'سحب شراء', 4000000, '2026-02-01', 'سحب شراء كورولا 2024', 'IQD', 'قاصه', '09:00', 'car_purchase', 'CAR002', 'cash_payment', 1, 1, 0, NULL, NULL)")
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('منتصر', 'شريك', 'سحب شراء', 4000000, '2026-02-01', 'سحب شراء كورولا 2024', 'IQD', 'قاصه', '09:00', 'car_purchase', 'CAR002', 'cash_payment', 1, 1, 0, NULL, NULL)")
    # Sale ledger for CAR002 (cash sale)
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-02-15', '14:00', 'revenue', 'CAR002', 0, 15000000, 'IQD', 'car', 'CAR002', 'بيع سيارة', 'إيراد بيع سيارة كورولا 2024', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-02-15', '14:00', 'cash', 'قاصه', 15000000, 0, 'IQD', 'car', 'CAR002', 'بيع سيارة كاش', 'استلام نقدي بيع سيارة', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-02-15', '14:00', 'expense', 'CAR002', 8000000, 0, 'IQD', 'car', 'CAR002', 'تكلفة المبيعات', 'تكلفة بيع سيارة', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-02-15', '14:00', 'inventory', 'CAR002', 0, 8000000, 'IQD', 'car', 'CAR002', 'تخفيض المخزون بيع سيارة', 'إخراج سيارة من المخزون', NULL)")
    # Partner sale rows for CAR002
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('أمير', 'شريك', 'ايداع بيع سيارة', 7500000, '2026-02-15', 'ايداع بيع سيارة كورولا 2024', 'IQD', 'قاصه', '14:00', 'car_sale', 'CAR002', 'cash_movement', 1, 1, 0, NULL, NULL)")
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('منتصر', 'شريك', 'ايداع بيع سيارة', 7500000, '2026-02-15', 'ايداع بيع سيارة كورولا 2024', 'IQD', 'قاصه', '14:00', 'car_sale', 'CAR002', 'cash_movement', 1, 1, 0, NULL, NULL)")
    # Profit recognition for CAR002
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('أمير', 'شريك', 'ايداع ارباح سيارة', 3500000, '2026-02-15', 'ايداع ارباح سيارة كورولا 2024 #بيع_سيارة_CAR002', 'IQD', 'قاصه', '14:00', 'car_sale', 'CAR002', 'profit_recognition', 0, 0, 1, 'car', 'CAR002')")
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('منتصر', 'شريك', 'ايداع ارباح سيارة', 3500000, '2026-02-15', 'ايداع ارباح سيارة كورولا 2024 #بيع_سيارة_CAR002', 'IQD', 'قاصه', '14:00', 'car_sale', 'CAR002', 'profit_recognition', 0, 0, 1, 'car', 'CAR002')")

    # ===== Seed Car 3: Installment sale =====
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, chassis_number, car_model, car_year, car_name, color,
            purchase_price, currency, sale_currency, selling_price, status, payment_type, amount_paid,
            amount_remaining, installment_months, buyer_name, buyer_phone, purchase_type, purchase_date, sale_date,
            first_payment_date, purchase_time, sale_time)
        VALUES ('CAR003', '11111', 'CH003', 'لاندكروزر', '2024', 'لاندكروزر 2024', 'رمادي',
            10000000, 'IQD', 'IQD', 20000000, 'مبيوعة', 'اقساط', 5000000,
            15000000, 15, 'محمد', '07909876543', 'كاش', '2026-03-01', '2026-03-15',
            '2026-04-15', '08:00', '11:00')
    """)
    # Purchase ledger for CAR003
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-03-01', '08:00', 'inventory', 'CAR003', 10000000, 0, 'IQD', 'car', 'CAR003', 'شراء سيارة', 'شراء سيارة: لاندكروزر 2024', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-03-01', '08:00', 'cash', 'قاصه', 0, 10000000, 'IQD', 'car', 'CAR003', 'شراء سيارة كاش', 'سحب نقدي لشراء سيارة', NULL)")
    # Partner purchase rows for CAR003
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('أمير', 'شريك', 'سحب شراء', 5000000, '2026-03-01', 'سحب شراء لاندكروزر 2024', 'IQD', 'قاصه', '08:00', 'car_purchase', 'CAR003', 'cash_payment', 1, 1, 0, NULL, NULL)")
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('منتصر', 'شريك', 'سحب شراء', 5000000, '2026-03-01', 'سحب شراء لاندكروزر 2024', 'IQD', 'قاصه', '08:00', 'car_purchase', 'CAR003', 'cash_payment', 1, 1, 0, NULL, NULL)")
    # Sale ledger for CAR003 (installment sale).
    # Per Instructions.md §30.10 and the production code in
    # record_car_sale_ledger_entries (lib.rs lines 5518-5604), the installment-
    # method sale entries are:
    #   Dr receivable       selling_price   (20,000,000)
    #   Cr inventory        total_cogs      (10,000,000)
    #   Cr deferred_revenue full_profit     (10,000,000)  -- ONLY when profitable
    # There is NO separate "Dr expense (COGS)" entry on the installment path
    # (that entry exists only on the cash-sale path). The previous seed data
    # both (a) credited deferred_revenue for the full selling price (20M instead
    # of 10M) and (b) inserted a spurious 10M COGS expense entry, leaving the
    # car ledger unbalanced. Both are fixed below.
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-03-15', '11:00', 'receivable', 'محمد', 20000000, 0, 'IQD', 'car', 'CAR003', 'مدينون بيع سيارة', 'ذمة مدينة كاملة بيع سيارة', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-03-15', '11:00', 'inventory', 'CAR003', 0, 10000000, 'IQD', 'car', 'CAR003', 'تخفيض المخزون بيع سيارة', 'إخراج سيارة من المخزون', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-03-15', '11:00', 'deferred_revenue', 'CAR003', 0, 10000000, 'IQD', 'car', 'CAR003', 'إيراد مؤجل بيع سيارة', 'إيراد مؤجل بيع سيارة (ربح السيارة الكامل)', NULL)")
    # Customer: down payment (5M) - use explicit ID for source_id consistency
    conn.execute("INSERT INTO partner_transactions (id, partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (100, 'محمد', 'زبون', 'مقدمة بيع سيارة', 5000000, '2026-03-15', 'استلام مقدمة سيارة من محمد رقم الشاصي CH003 #بيع_سيارة_CAR003', 'IQD', 'قاصه', '11:00', 'customer_transaction', '100', 'account_movement', 0, 0, 0, 'car', 'CAR003')")
    # Partner cash movement for down payment (use explicit IDs)
    conn.execute("INSERT INTO partner_transactions (id, partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (101, 'أمير', 'شريك', 'ايداع مقدمة', 2500000, '2026-03-15', 'دفعة زبون #بيع_سيارة_CAR003', 'IQD', 'قاصه', '11:00', 'customer_payment', '100', 'cash_movement', 1, 1, 0, 'car', 'CAR003')")
    conn.execute("INSERT INTO partner_transactions (id, partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (102, 'منتصر', 'شريك', 'ايداع مقدمة', 2500000, '2026-03-15', 'دفعة زبون #بيع_سيارة_CAR003', 'IQD', 'قاصه', '11:00', 'customer_payment', '100', 'cash_movement', 1, 1, 0, 'car', 'CAR003')")
    # Profit recognition for down payment
    conn.execute("INSERT INTO partner_transactions (id, partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (103, 'أمير', 'شريك', 'ايداع ارباح سيارة', 1250000, '2026-03-15', 'ربح دفعة زبون #بيع_سيارة_CAR003', 'IQD', 'قاصه', '11:00', 'customer_payment', '100', 'profit_recognition', 0, 0, 1, 'car', 'CAR003')")
    conn.execute("INSERT INTO partner_transactions (id, partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (104, 'منتصر', 'شريك', 'ايداع ارباح سيارة', 1250000, '2026-03-15', 'ربح دفعة زبون #بيع_سيارة_CAR003', 'IQD', 'قاصه', '11:00', 'customer_payment', '100', 'profit_recognition', 0, 0, 1, 'car', 'CAR003')")
    # Installment schedule rows (with source fields)
    for i in range(15):
        conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('محمد', 'زبون', 'باقي قسط', 1000000, '2026-{:02}-15', 'باقي قسط شهر {} من 15 على محمد رقم الشاصي CH003', 'IQD', 'قاصه', '11:00', 'customer_installment_schedule', 'CAR003:installment:{}', 'installment_schedule', 0, 0, 0, 'car', 'CAR003')".format(4 + i, i + 1, i + 1))
    # Receivable credit for down payment (reference_id = 100, the customer payment ID)
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-03-15', '11:00', 'receivable', 'محمد', 0, 5000000, 'IQD', 'partner_transaction', '100', 'ايداع زبون مديونية', 'تخفيض مديونية الزبون محمد', NULL)")
    # Cash debit for down payment (reference_id = cash_movement partner row ID 101)
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-03-15', '11:00', 'cash', 'قاصه', 5000000, 0, 'IQD', 'partner_transaction', '101', 'ايداع مقدمة', 'إيداع دفعة زبون', NULL)")
    # Customer partner balance
    conn.execute("INSERT INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES ('محمد', '07909876543', 0, 'زبون', 0, 0)")
    conn.execute("UPDATE partners SET iqd_balance = 15000000, total_amount = 15000000 WHERE partner_name = 'محمد' AND kind = 'زبون'")

    # ===== Seed Car 4: Financed purchase =====
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, chassis_number, car_model, car_year, car_name, color,
            purchase_price, currency, sale_currency, selling_price, status, payment_type, purchase_type,
            financer_name, purchase_date, purchase_time)
        VALUES ('CAR004', '22222', 'CH004', 'هايلكس', '2024', 'هايلكس 2024', 'أبيض',
            12000000, 'IQD', 'IQD', 0, 'متوفرة', NULL, 'تمويل',
            'الممول الأول', '2026-04-01', '09:00')
    """)
    # Purchase ledger for CAR004 (financed)
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-04-01', '09:00', 'inventory', 'CAR004', 12000000, 0, 'IQD', 'car', 'CAR004', 'شراء سيارة', 'شراء سيارة: هايلكس 2024', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-04-01', '09:00', 'funder', 'الممول الأول', 0, 12000000, 'IQD', 'car', 'CAR004', 'تمويل شراء سيارة', 'تمويل شراء سيارة', NULL)")
    # Funder purchase row
    conn.execute("INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES ('الممول الأول', 'ممول', 'سحب شراء', 12000000, '2026-04-01', 'سحب شراء هايلكس 2024', 'IQD', 'قاصه', '09:00', 'car_purchase', 'CAR004', 'funder_or_company_account_movement', 0, 0, 0, NULL, NULL)")
    # Funder partner
    conn.execute("INSERT INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES ('الممول الأول', '', -12000000, 'ممول', -12000000, 0)")

    # ===== Seed Funder repayment =====
    conn.execute("INSERT INTO partner_transactions (id, partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (200, 'الممول الأول', 'ممول', 'سحب', 12000000, '2026-05-01', 'تسديد تمويل', 'IQD', 'قاصه', '10:00', 'funder_transaction', '200', 'repayment_account_movement', 0, 0, 0, NULL, NULL)")
    # Partner cash payment for funder repayment
    conn.execute("INSERT INTO partner_transactions (id, partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (201, 'أمير', 'شريك', 'سحب تسديد', 6000000, '2026-05-01', 'تسديد ممول', 'IQD', 'قاصه', '10:00', 'funder_payment', '200', 'partner_cash_payment', 1, 1, 0, NULL, NULL)")
    conn.execute("INSERT INTO partner_transactions (id, partner_name, kind, type, amount, date, notes, currency, payment_type, time, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (202, 'منتصر', 'شريك', 'سحب تسديد', 6000000, '2026-05-01', 'تسديد ممول', 'IQD', 'قاصه', '10:00', 'funder_payment', '200', 'partner_cash_payment', 1, 1, 0, NULL, NULL)")
    # Funder repayment ledger
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-05-01', '10:00', 'funder', 'الممول الأول', 12000000, 0, 'IQD', 'partner_transaction', '200', 'سداد ممول اموال', 'تسديد تمويل', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-05-01', '10:00', 'cash', 'قاصه', 0, 12000000, 'IQD', 'partner_transaction', '200', 'سداد ممول نقدي', 'سداد نقدي', NULL)")
    # Partner cash payment ledger
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-05-01', '10:00', 'drawings', 'أمير', 6000000, 0, 'IQD', 'partner_transaction', '201', 'سحب شريك مصروف', 'مسحوبات الشريك أمير', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-05-01', '10:00', 'cash', 'قاصه', 0, 6000000, 'IQD', 'partner_transaction', '201', 'سحب شريك', 'سحب نقدي شريك', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-05-01', '10:00', 'drawings', 'منتصر', 6000000, 0, 'IQD', 'partner_transaction', '202', 'سحب شريك مصروف', 'مسحوبات الشريك منتصر', NULL)")
    conn.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes) VALUES ('2026-05-01', '10:00', 'cash', 'قاصه', 0, 6000000, 'IQD', 'partner_transaction', '202', 'سحب شريك', 'سحب نقدي شريك', NULL)")

    # Update partner totals
    conn.execute("UPDATE partners SET total_amount = -10000000, iqd_balance = -10000000 WHERE partner_name = 'أمير' AND kind = 'شريك'")
    conn.execute("UPDATE partners SET total_amount = -10000000, iqd_balance = -10000000 WHERE partner_name = 'منتصر' AND kind = 'شريك'")
    conn.execute("UPDATE partners SET total_amount = 0, iqd_balance = 0 WHERE partner_name = 'الممول الأول' AND kind = 'ممول'")

    conn.commit()
    conn.close()


def run_runtime_tests(db_path):
    """Run runtime audit against the test database."""
    import subprocess
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    result = subprocess.run(
        ['python3', os.path.join(script_dir, 'accounting_audit.py'), db_path],
        capture_output=True, text=True,
        cwd=project_dir
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    return result.returncode == 0


def run_installment_tests(db_path):
    """Run installment profit tests against the test database."""
    import subprocess
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    result = subprocess.run(
        ['python3', os.path.join(script_dir, 'check_installment_profit.py'), db_path],
        capture_output=True, text=True,
        cwd=project_dir
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    return result.returncode == 0


if __name__ == "__main__":
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name

    try:
        print("Creating test database...")
        create_test_db(db_path)
        print(f"Test database created: {db_path}\n")

        print("=" * 60)
        print("RUNNING RUNTIME AUDIT")
        print("=" * 60)
        db_ok = run_runtime_tests(db_path)

        print("\n" + "=" * 60)
        print("RUNNING INSTALLMENT PROFIT TESTS")
        print("=" * 60)
        inst_ok = run_installment_tests(db_path)

        print("\n" + "=" * 60)
        if db_ok and inst_ok:
            print("ALL RUNTIME TESTS PASSED")
        else:
            print("SOME RUNTIME TESTS FAILED")
        print("=" * 60)

        sys.exit(0 if (db_ok and inst_ok) else 1)
    finally:
        os.unlink(db_path)
