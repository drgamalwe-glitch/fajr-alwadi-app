#!/usr/bin/env python3
"""
Create a temporary seeded SQLite database for runtime audit testing.

FORENSIC FIX (re-audit 2026-07-11, Bug FORENSIC-FRONT-2-1):
The previous version of this script created a stale schema frozen at
db_version=12, missing critical columns added by later migrations:
  - partner_transactions.is_reversed, original_amount, current_amount,
    actual_paid_amount, paid_event_id, due_date, ledger_batch_id
  - financial_ledger.ledger_batch_id
  - audit_log.ledger_batch_id, field_name, old_value, new_value
  - expenses.source_type, source_id, source_role
  - agencies.creation_token, payment_status
  - cars.expenses_at_sale, selling_currency, paid_currency, remaining_currency
  - users.must_change_password, last_login
  - The entire customer_installment_payment_events, audit_log, login_attempts,
    sessions, car_installment_schedule tables.

This caused `accounting_audit.py` and `check_installment_profit.py` to crash
with `sqlite3.OperationalError: no such column: pt.is_reversed` when run on
a DB created by this script.

Fix: bring this script's schema into sync with the production schema applied
by init_db() in src-tauri/src/lib.rs (db_version=33). Every TEXT column that
downstream scripts depend on is now present. Money columns are kept as REAL
for backward compatibility with existing seed data (which uses Python floats),
matching the runtime_test.py approach.

Covers all required test scenarios from Instructions.md.
"""
import sqlite3
import os
import sys


def create_test_db(path):
    # Bug P6: previously this unconditionally deleted any existing file at `path`.
    # We now prompt for confirmation before overwriting an existing DB so the
    # user doesn't lose a hand-crafted test fixture by accident.
    if os.path.exists(path):
        # In non-interactive contexts (stdin not a tty), overwrite silently.
        if sys.stdin.isatty():
            resp = input(f"File {path} exists. Overwrite? [y/N] ")
            if resp.lower() != "y":
                sys.exit("Aborted.")
        os.remove(path)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row

    # Create all tables matching lib.rs init_db() schema at db_version=33.
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY);
        INSERT INTO db_version VALUES (33);

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

        CREATE TABLE IF NOT EXISTS cash_register (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            notes TEXT
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

        CREATE TABLE IF NOT EXISTS profit_distributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            total_profit REAL NOT NULL,
            currency TEXT NOT NULL,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS partner_profit_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            distribution_id INTEGER NOT NULL,
            partner_name TEXT NOT NULL,
            profit_share REAL NOT NULL,
            drawings_deducted REAL NOT NULL,
            amount_reinvested REAL NOT NULL,
            amount_paid REAL NOT NULL,
            currency TEXT NOT NULL,
            FOREIGN KEY (distribution_id) REFERENCES profit_distributions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            profile_image TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime')),
            must_change_password INTEGER DEFAULT 0,
            last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            description TEXT,
            field_name TEXT,
            old_value TEXT,
            new_value TEXT,
            ledger_batch_id TEXT
        );

        CREATE TABLE IF NOT EXISTS customer_installment_payment_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_uuid TEXT NOT NULL UNIQUE,
            customer_name TEXT NOT NULL,
            car_number TEXT NOT NULL,
            installment_id INTEGER NOT NULL,
            currency TEXT NOT NULL,
            scheduled_amount REAL NOT NULL,
            actual_paid_amount REAL NOT NULL,
            difference_amount REAL NOT NULL,
            ledger_batch_id TEXT,
            notes TEXT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            ip_address TEXT,
            success INTEGER NOT NULL,
            attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
            ON partner_transactions(source_type, source_id, source_role, partner_name, kind, COALESCE(related_source_id, ''))
            WHERE source_type IS NOT NULL
              AND source_id IS NOT NULL
              AND source_role IS NOT NULL
              AND source_type != ''
              AND source_id != ''
              AND source_role != '';
        CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner ON partner_transactions(partner_name, kind);
        CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_batch ON financial_ledger(ledger_batch_id);
        CREATE INDEX IF NOT EXISTS idx_partner_tx_ledger_batch ON partner_transactions(ledger_batch_id);
        CREATE INDEX IF NOT EXISTS idx_agencies_creation_token ON agencies(creation_token);
        CREATE INDEX IF NOT EXISTS idx_cars_chassis
            ON cars(chassis_number COLLATE NOCASE)
            WHERE chassis_number IS NOT NULL AND TRIM(chassis_number) != '';
        CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
    """)

    # Default partners
    conn.execute("INSERT INTO partners VALUES ('أمير', '07808425228', 0.0, 'شريك', 0.0, 0.0)")
    conn.execute("INSERT INTO partners VALUES ('منتصر', '07812541714', 0.0, 'شريك', 0.0, 0.0)")

    # ===== Scenario 1: Cash sale car (valid) =====
    # Car CASH001: purchase 10M, sell 20M cash
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, car_name, purchase_price, currency, sale_currency,
            selling_price, status, payment_type, buyer_name, purchase_date, sale_date, purchase_type, expenses_at_sale)
        VALUES ('CASH001', 'CASH001', 'سيارة كاش اختبار', 10000000, 'IQD', 'IQD',
            20000000, 'مبيوعة', 'كاش', 'مشتري كاش', '2026-01-01', '2026-01-15', 'كاش', 0)
    """)
    # Purchase ledger: Dr inventory, Cr cash
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (1,'2026-01-01','00:00','inventory','CASH001',10000000,0.0,'IQD','car','CASH001','شراء سيارة','شراء سيارة: سيارة كاش اختبار',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (2,'2026-01-01','00:00','cash','قاصه',0.0,10000000,'IQD','car','CASH001','شراء سيارة كاش','سحب نقدي لشراء سيارة',NULL,NULL)")
    # Car purchase partner rows (50/50 split)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (5,'أمير','شريك','سحب شراء',5000000,'2026-01-01','00:00','سحب شراء سيارة كاش اختبار (شاصي: )','IQD','قاصه','car_purchase','CASH001','cash_payment',1,1,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (6,'منتصر','شريك','سحب شراء',5000000,'2026-01-01','00:00','سحب شراء سيارة كاش اختبار (شاصي: )','IQD','قاصه','car_purchase','CASH001','cash_payment',1,1,0,0)""")
    # Sale ledger: Dr cash, Cr revenue + COGS
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (3,'2026-01-15','00:00','revenue','CASH001',0.0,20000000,'IQD','car','CASH001','بيع سيارة','إيراد بيع سيارة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (4,'2026-01-15','00:00','cash','قاصه',20000000,0.0,'IQD','car','CASH001','بيع سيارة كاش','استلام نقدي بيع سيارة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (5,'2026-01-15','00:00','expense','CASH001',10000000,0.0,'IQD','car','CASH001','تكلفة المبيعات','تكلفة بيع سيارة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (6,'2026-01-15','00:00','inventory','CASH001',0.0,10000000,'IQD','car','CASH001','تخفيض المخزون بيع سيارة','إخراج سيارة من المخزون',NULL,NULL)")
    # Partner cash movement for sale
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (1,'أمير','شريك','ايداع بيع سيارة',10000000,'2026-01-15','00:00','ايداع بيع سيارة سيارة كاش اختبار','IQD','قاصه','car_sale','CASH001','cash_movement',1,1,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (2,'منتصر','شريك','ايداع بيع سيارة',10000000,'2026-01-15','00:00','ايداع بيع سيارة سيارة كاش اختبار','IQD','قاصه','car_sale','CASH001','cash_movement',1,1,0,0)""")
    # Profit recognition for cash sale
    # NOTE: car CASH001 has a 1M car_expense (id=100), so full profit = 20M - 10M - 1M = 9M
    # Each partner's 50% share = 4.5M (per Instructions.md §5.1, car_expenses table is authoritative)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (3,'أمير','شريك','ايداع ارباح سيارة',4500000,'2026-01-15','00:00','ايداع ارباح سيارة سيارة كاش اختبار #بيع_سيارة_CASH001','IQD','قاصه','car_sale','CASH001','profit_recognition',0,0,1,'car','CASH001',0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (4,'منتصر','شريك','ايداع ارباح سيارة',4500000,'2026-01-15','00:00','ايداع ارباح سيارة سيارة كاش اختبار #بيع_سيارة_CASH001','IQD','قاصه','car_sale','CASH001','profit_recognition',0,0,1,'car','CASH001',0)""")

    # ===== Scenario 2: Installment sale car =====
    # Car INST001: purchase 10M, sell 20M, down payment 5M, remaining 15M in 15 months
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, car_name, purchase_price, currency, sale_currency,
            selling_price, status, payment_type, amount_paid, amount_remaining, installment_months,
            buyer_name, purchase_date, sale_date, first_payment_date, purchase_type, expenses_at_sale)
        VALUES ('INST001', 'INST001', 'سيارة تقسيط اختبار', 10000000, 'IQD', 'IQD',
            20000000, 'مبيوعة', 'اقساط', 5000000, 15000000, 15,
            'مشتري تقسيط', '2026-02-01', '2026-02-15', '2026-03-15', 'كاش', 0)
    """)
    # Purchase ledger
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (10,'2026-02-01','00:00','inventory','INST001',10000000,0.0,'IQD','car','INST001','شراء سيارة','شراء سيارة: سيارة تقسيط اختبار',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (11,'2026-02-01','00:00','cash','قاصه',0.0,10000000,'IQD','car','INST001','شراء سيارة كاش','سحب نقدي لشراء سيارة',NULL,NULL)")
    # Car purchase partner rows (50/50 split)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (500,'أمير','شريك','سحب شراء',5000000,'2026-02-01','00:00','سحب شراء سيارة تقسيط اختبار (شاصي: )','IQD','قاصه','car_purchase','INST001','cash_payment',1,1,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (501,'منتصر','شريك','سحب شراء',5000000,'2026-02-01','00:00','سحب شراء سيارة تقسيط اختبار (شاصي: )','IQD','قاصه','car_purchase','INST001','cash_payment',1,1,0,0)""")
    # Sale ledger (installment method per §30.10): Dr receivable (selling), Cr inventory (cost), Cr deferred_revenue (profit only)
    # NOTE: per Instructions.md §30.10, installment sales use 3 entries (no separate COGS row).
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (12,'2026-02-15','00:00','receivable','مشتري تقسيط',20000000,0.0,'IQD','car','INST001','مدينون بيع سيارة','ذمة مدينة كاملة بيع سيارة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (13,'2026-02-15','00:00','inventory','INST001',0.0,10000000,'IQD','car','INST001','تخفيض المخزون بيع سيارة','إخراج سيارة من المخزون',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (15,'2026-02-15','00:00','deferred_revenue','INST001',0.0,10000000,'IQD','car','INST001','إيراد مؤجل بيع سيارة','إيراد مؤجل بيع سيارة',NULL,NULL)")

    # Customer account
    conn.execute("INSERT INTO partners VALUES ('مشتري تقسيط', '', 15000000.0, 'زبون', 15000000.0, 0.0)")

    # Down payment (5M): customer payment + cash_movement + profit_recognition
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (20,'مشتري تقسيط','زبون','مقدمة بيع سيارة',5000000,'2026-02-15','00:00','استلام مقدمة سيارة من مشتري تقسيط رقم الشاصي #بيع_سيارة_INST001 ','IQD','قاصه','customer_transaction','20','account_movement',0,0,0,'car','INST001',0)""")
    # Cash movement for down payment
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (21,'أمير','شريك','ايداع مقدمة',2500000,'2026-02-15','00:00','دفعة زبون: استلام مقدمة (رقم حركة دفعة: 20) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','20','cash_movement',1,1,0,'car','INST001',0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (22,'منتصر','شريك','ايداع مقدمة',2500000,'2026-02-15','00:00','دفعة زبون: استلام مقدمة (رقم حركة دفعة: 20) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','20','cash_movement',1,1,0,'car','INST001',0)""")
    # Receivable credit for down payment
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (20,'2026-02-15','00:00','receivable','مشتري تقسيط',0.0,5000000,'IQD','partner_transaction','20','ايداع زبون مديونية','تخفيض مديونية الزبون مشتري تقسيط',NULL,NULL)")
    # Cash debit for down payment
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (21,'2026-02-15','00:00','cash','قاصه',5000000,0.0,'IQD','partner_transaction','21','ايداع مقدمة','إيداع دفعة زبون',NULL,NULL)")
    # Profit recognition for down payment: 5M * 50% = 2.5M
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (23,'أمير','شريك','ايداع ارباح سيارة',1250000,'2026-02-15','00:00','ربح دفعة زبون (رقم حركة دفعة: 20) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','20','profit_recognition',0,0,1,'car','INST001',0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (24,'منتصر','شريك','ايداع ارباح سيارة',1250000,'2026-02-15','00:00','ربح دفعة زبون (رقم حركة دفعة: 20) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','20','profit_recognition',0,0,1,'car','INST001',0)""")

    # One installment payment of 1M
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (25,'مشتري تقسيط','زبون','تسديد قسط',1000000,'2026-03-15','00:00','تسديد قسط شهر 1 #بيع_سيارة_INST001','IQD','قاصه','customer_transaction','25','account_movement',0,0,0,'car','INST001',0)""")
    # Remaining installment rows (باقي قسط)
    for i, (iid, d) in enumerate([(200,'2026-04-15'),(201,'2026-05-15'),(202,'2026-06-15'),(203,'2026-07-15'),
                                  (204,'2026-08-15'),(205,'2026-09-15'),(206,'2026-10-15'),(207,'2026-11-15'),
                                  (208,'2026-12-15'),(209,'2027-01-15'),(210,'2027-02-15'),(211,'2027-03-15'),
                                  (212,'2027-04-15'),(213,'2027-05-15')]):
        conn.execute(f"""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
            VALUES ({iid},'مشتري تقسيط','زبون','باقي قسط',1000000,'{d}','00:00','باقي قسط شهر {i+2} من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','{iid}','account_movement',0,0,0,0)""")
    # Cash movement for installment
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (26,'أمير','شريك','ايداع مقدمة',500000,'2026-03-15','00:00','دفعة زبون: تسديد قسط (رقم حركة دفعة: 25) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','25','cash_movement',1,1,0,'car','INST001',0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (27,'منتصر','شريك','ايداع مقدمة',500000,'2026-03-15','00:00','دفعة زبون: تسديد قسط (رقم حركة دفعة: 25) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','25','cash_movement',1,1,0,'car','INST001',0)""")
    # Receivable credit for installment
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (25,'2026-03-15','00:00','receivable','مشتري تقسيط',0.0,1000000,'IQD','partner_transaction','25','ايداع زبون مديونية','تخفيض مديونية الزبون',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (26,'2026-03-15','00:00','cash','قاصه',1000000,0.0,'IQD','partner_transaction','26','ايداع مقدمة','إيداع دفعة زبون',NULL,NULL)")
    # Profit recognition: 1M * 50% = 500K
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (28,'أمير','شريك','ايداع ارباح سيارة',250000,'2026-03-15','00:00','ربح دفعة زبون (رقم حركة دفعة: 25) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','25','profit_recognition',0,0,1,'car','INST001',0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (29,'منتصر','شريك','ايداع ارباح سيارة',250000,'2026-03-15','00:00','ربح دفعة زبون (رقم حركة دفعة: 25) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','25','profit_recognition',0,0,1,'car','INST001',0)""")

    # Update customer balance after payments (5M + 1M = 6M paid, 14M remaining)
    conn.execute("UPDATE partners SET iqd_balance = 14000000.0 WHERE partner_name = 'مشتري تقسيط' AND kind = 'زبون'")

    # ===== Scenario 3: General expense =====
    conn.execute("INSERT INTO expenses (id, description, amount, date, time, notes, currency, car_number, source_type, source_id, source_role) VALUES (1, 'إيجار', 1000000, '2026-01-10', '00:00', NULL, 'IQD', NULL, 'expense', '1', 'general_expense')")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (30,'2026-01-10','00:00','expense','إيجار',1000000,0.0,'IQD','expense','1','مصروف عام','إيجار',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (31,'2026-01-10','00:00','cash','قاصه',0.0,1000000,'IQD','expense','1','دفع مصروف','دفع مصروف: إيجار',NULL,NULL)")
    # Partner expense split (with matching ledger entries)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (30,'أمير','شريك','سحب مصروف',500000,'2026-01-10','00:00','سحب مصروف إيجار','IQD','قاصه','expense','1','cash_payment',1,1,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (31,'منتصر','شريك','سحب مصروف',500000,'2026-01-10','00:00','سحب مصروف إيجار','IQD','قاصه','expense','1','cash_payment',1,1,0,0)""")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (32,'2026-01-10','00:00','cash','قاصه',0.0,500000,'IQD','partner_transaction','30','سحب مصروف','سحب مصروف: إيجار (شريك أمير)',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (33,'2026-01-10','00:00','cash','قاصه',0.0,500000,'IQD','partner_transaction','31','سحب مصروف','سحب مصروف: إيجار (شريك منتصر)',NULL,NULL)")
    # NOTE: per record_partner_ledger_entries pattern, expense split rows (kind='شريك', type='سحب ...')
    # only write Cr cash entries. The Dr expense is recorded once at the source expense level (entry 30).
    # Adding partner-side Dr expense entries here would double-count the expense.

    # ===== Scenario 4: Car expense (linked to CASH001) =====
    # NOTE: car_expense id=100 to avoid collision with general expense id=1
    conn.execute("INSERT INTO car_expenses (id, car_number, description, amount, date, currency, time) VALUES (100, 'CASH001', 'تصليح', 1000000, '2026-01-10', 'IQD', '00:00')")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (40,'2026-01-10','00:00','expense','CASH001',1000000,0.0,'IQD','car_expense','100','مصروف سيارة','تصليح سيارة CASH001',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (41,'2026-01-10','00:00','cash','قاصه',0.0,1000000,'IQD','car_expense','100','دفع مصروف سيارة','دفع مصروف: تصليح CASH001',NULL,NULL)")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (40,'أمير','شريك','سحب مصروف سيارة',500000,'2026-01-10','00:00','سحب مصروف سيارة CASH001','IQD','قاصه','car_expense','100','cash_payment',1,1,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (41,'منتصر','شريك','سحب مصروف سيارة',500000,'2026-01-10','00:00','سحب مصروف سيارة CASH001','IQD','قاصه','car_expense','100','cash_payment',1,1,0,0)""")
    # NOTE: per record_partner_ledger_entries pattern, car_expense split rows only write Cr cash.
    # The Dr expense is recorded once at the source car_expense level (entry 40).

    # ===== Scenario 5: Investor (deposit 10M) =====
    conn.execute("INSERT INTO partners VALUES ('مستثمر 1', '', 10000000.0, 'مستثمر', 0.0, 0.0)")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (50,'مستثمر 1','مستثمر','ايداع مستثمر',10000000,'2026-01-05','00:00','إيداع مستثمر','IQD','قاصه','investor_transaction','50','account_movement',1,0,0,0)""")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (50,'2026-01-05','00:00','cash','قاصه',10000000,0.0,'IQD','partner_transaction','50','ايداع مستثمر','إيداع مستثمر 1',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (51,'2026-01-05','00:00','liability','مستثمر 1',0.0,10000000,'IQD','partner_transaction','50','التزام مستثمر','التزام تجاه مستثمر 1',NULL,NULL)")

    # ===== Scenario 6: Funder (finance 10M, repay 5M) =====
    # NOTE: iqd_balance for liability-kind partners reflects the outstanding liability (10M funded - 5M repaid = 5M)
    conn.execute("INSERT INTO partners VALUES ('ممول 1', '', 5000000.0, 'ممول', 0.0, 0.0)")
    # Funder finance (does NOT affect qasa/cash)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (60,'ممول 1','ممول','ايداع ممول',10000000,'2026-01-06','00:00','تمويل ممول','IQD','قاصه','funder_transaction','60','account_movement',0,0,0,0)""")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (60,'2026-01-06','00:00','liability','ممول 1',0.0,10000000,'IQD','partner_transaction','60','التزام ممول','التزام تجاه ممول 1',NULL,NULL)")
    # Funder repayment 5M (affects qasa/cash, splits 50/50)
    # NOTE: type='سحب' (exact match per accounting_audit.py [37] check, also matches is_deposit_type prefix)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (61,'ممول 1','ممول','سحب',5000000,'2026-01-20','00:00','تسديد ممول','IQD','قاصه','funder_transaction','61','repayment_account_movement',0,0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (62,'أمير','شريك','سحب',2500000,'2026-01-20','00:00','سحب تسديد ممول (شريك أمير)','IQD','قاصه','funder_transaction','61','partner_cash_payment',1,1,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (63,'منتصر','شريك','سحب',2500000,'2026-01-20','00:00','سحب تسديد ممول (شريك منتصر)','IQD','قاصه','funder_transaction','61','partner_cash_payment',1,1,0,0)""")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (61,'2026-01-20','00:00','liability','ممول 1',5000000,0.0,'IQD','partner_transaction','61','سداد ممول','سداد جزء من التزام الممول 1',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (62,'2026-01-20','00:00','cash','قاصه',0.0,5000000,'IQD','partner_transaction','61','سداد ممول','سداد ممول من الكاش',NULL,NULL)")

    # ===== Scenario 7: Company (liability 5M) =====
    # NOTE: iqd_balance for liability-kind partners reflects the outstanding liability
    conn.execute("INSERT INTO partners VALUES ('شركة 1', '', 5000000.0, 'شركة', 0.0, 0.0)")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (70,'شركة 1','شركة','ايداع شركة',5000000,'2026-01-07','00:00','التزام شركة','IQD','قاصه','company_transaction','70','account_movement',0,0,0,0)""")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (70,'2026-01-07','00:00','liability','شركة 1',0.0,5000000,'IQD','partner_transaction','70','التزام شركة','التزام تجاه شركة 1',NULL,NULL)")

    # ===== Scenario 8: Agency (cash, profit recognized) =====
    conn.execute("""INSERT INTO agencies (id, old_agent_name, new_agent_name, phone, amount_iqd, amount_usd, date, time, payment_status, creation_token)
        VALUES (1, 'وكيل قديم 1', 'وكيل جديد 1', '07800000000', 2000000, 0, '2026-01-08', '00:00', 'واصل', NULL)""")
    # Agency profit + cash movement (50/50 split)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (80,'أمير','شريك','ايداع وكالة',1000000,'2026-01-08','00:00','ايداع وكالة وكيل جديد 1','IQD','قاصه','agency','1','cash_movement',1,1,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (81,'منتصر','شريك','ايداع وكالة',1000000,'2026-01-08','00:00','ايداع وكالة وكيل جديد 1','IQD','قاصه','agency','1','cash_movement',1,1,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (82,'أمير','شريك','ايداع ارباح وكالة',1000000,'2026-01-08','00:00','ربح وكالة #بيع_سيارة_','IQD','قاصه','agency','1','profit_recognition',0,0,1,'agency','1',0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id,is_reversed)
        VALUES (83,'منتصر','شريك','ايداع ارباح وكالة',1000000,'2026-01-08','00:00','ربح وكالة #بيع_سيارة_','IQD','قاصه','agency','1','profit_recognition',0,0,1,'agency','1',0)""")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (80,'2026-01-08','00:00','cash','قاصه',2000000,0.0,'IQD','agency','1','ايداع وكالة','استلام نقد وكالة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (81,'2026-01-08','00:00','revenue','agency:1',0.0,2000000,'IQD','agency','1','ايراد وكالة','إيراد وكالة',NULL,NULL)")
    # Partner-side ledger entries for the agency partner transactions (rows 80,81,82,83)
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (82,'2026-01-08','00:00','cash','قاصه',1000000,0.0,'IQD','partner_transaction','80','ايداع وكالة','حصة شريك أمير من وكالة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (83,'2026-01-08','00:00','cash','قاصه',1000000,0.0,'IQD','partner_transaction','81','ايداع وكالة','حصة شريك منتصر من وكالة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (84,'2026-01-08','00:00','revenue','agency:1',0.0,1000000,'IQD','partner_transaction','82','ربح وكالة','حصة شريك أمير من ربح وكالة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (85,'2026-01-08','00:00','revenue','agency:1',0.0,1000000,'IQD','partner_transaction','83','ربح وكالة','حصة شريك منتصر من ربح وكالة',NULL,NULL)")

    # ===== Scenario 9: Credit Agency (no profit, receivable only) =====
    conn.execute("""INSERT INTO agencies (id, old_agent_name, new_agent_name, phone, amount_iqd, amount_usd, date, time, payment_status, creation_token)
        VALUES (2, 'وكيل قديم 2', 'وكيل جديد 2', '07811111111', 1500000, 0, '2026-01-09', '00:00', 'غير واصل', NULL)""")
    # Agency customer must exist as a partner with kind='وكالة' (per v29 migration)
    conn.execute("INSERT INTO partners VALUES ('وكيل جديد 1', '', 0.0, 'وكالة', 0.0, 0.0)")
    conn.execute("INSERT INTO partners VALUES ('وكيل جديد 2', '', 1500000.0, 'وكالة', 0.0, 0.0)")
    # Receivable row (kind='وكالة', source_role='agency_receivable')
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,is_reversed)
        VALUES (90,'وكيل جديد 2','وكالة','باقي وكالة',1500000,'2026-01-09','00:00','ذمة وكالة غير واصلة','IQD','قاصه','agency','2','agency_receivable',0,0,0,0)""")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (90,'2026-01-09','00:00','receivable','وكيل جديد 2',1500000,0.0,'IQD','agency','2','ذمة وكالة','ذمة مدينة - وكالة غير واصلة',NULL,NULL)")
    conn.execute("INSERT INTO financial_ledger (id,date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description,notes,ledger_batch_id) VALUES (91,'2026-01-09','00:00','deferred_revenue','agency:2',0.0,1500000,'IQD','agency','2','إيراد مؤجل وكالة','إيراد مؤجل - وكالة غير واصلة',NULL,NULL)")

    # ===== Scenario 10: Default admin user =====
    # password_hash for "admin" (argon2 hashed in lib.rs; we use a placeholder here)
    conn.execute("""INSERT INTO users (id, username, password_hash, display_name, must_change_password)
        VALUES (1, 'admin', '$argon2id$placeholder', 'مدير النظام', 0)""")

    conn.commit()
    conn.close()
    print(f"Test database created at: {path}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "test_fajir_alwadi.db"
    create_test_db(path)
