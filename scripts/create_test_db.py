#!/usr/bin/env python3
"""
Create a temporary seeded SQLite database for runtime audit testing.
Covers all required test scenarios from the task.
"""
import sqlite3
import os
import sys

def create_test_db(path):
    if os.path.exists(path):
        os.remove(path)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row

    # Create all tables matching lib.rs schema
    conn.executescript("""
        CREATE TABLE db_version (version INTEGER PRIMARY KEY);
        INSERT INTO db_version VALUES (12);

        CREATE TABLE cars (
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
            purchase_payment_type TEXT DEFAULT 'قاصه',
            purchase_time TEXT DEFAULT '00:00',
            sale_time TEXT DEFAULT '00:00',
            purchase_type TEXT DEFAULT 'كاش',
            financer_name TEXT,
            commission_type TEXT,
            commission_value REAL
        );

        CREATE TABLE partners (
            partner_name TEXT NOT NULL,
            phone TEXT,
            total_amount REAL DEFAULT 0.0,
            kind TEXT NOT NULL DEFAULT 'شريك',
            iqd_balance REAL DEFAULT 0.0,
            usd_balance REAL DEFAULT 0.0,
            PRIMARY KEY (partner_name, kind)
        );

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
            related_source_id TEXT
        );

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
            notes TEXT
        );

        CREATE TABLE expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            notes TEXT,
            currency TEXT DEFAULT 'IQD',
            car_number TEXT
        );

        CREATE TABLE car_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_number TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            currency TEXT DEFAULT 'IQD',
            time TEXT DEFAULT '00:00'
        );

        CREATE TABLE car_partners (
            car_number TEXT NOT NULL,
            partner_name TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'IQD',
            kind TEXT NOT NULL DEFAULT 'شريك',
            PRIMARY KEY (car_number, partner_name)
        );

        CREATE TABLE cash_register (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            notes TEXT
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
            amount_usd REAL NOT NULL DEFAULT 0.0,
            amount_iqd REAL NOT NULL DEFAULT 0.0,
            notes TEXT NOT NULL DEFAULT '',
            date TEXT NOT NULL,
            time TEXT NOT NULL
        );

        CREATE TABLE agency_transactions (
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

        CREATE TABLE profit_distributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            total_profit REAL NOT NULL,
            currency TEXT NOT NULL,
            notes TEXT
        );

        CREATE TABLE partner_profit_shares (
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

        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            profile_image TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
            ON partner_transactions(source_type, source_id, source_role, partner_name, kind)
            WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND source_role IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id);
    """)

    # Default partners
    conn.execute("INSERT INTO partners VALUES ('أمير', '07808425228', 0.0, 'شريك', 0.0, 0.0)")
    conn.execute("INSERT INTO partners VALUES ('منتصر', '07812541714', 0.0, 'شريك', 0.0, 0.0)")

    # ===== Scenario 1: Cash sale car (valid) =====
    # Car CASH001: purchase 10M, sell 20M cash
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, car_name, purchase_price, currency, sale_currency,
            selling_price, status, payment_type, buyer_name, purchase_date, sale_date, purchase_type)
        VALUES ('CASH001', 'CASH001', 'سيارة كاش اختبار', 10000000, 'IQD', 'IQD',
            20000000, 'مبيوعة', 'كاش', 'مشتري كاش', '2026-01-01', '2026-01-15', 'كاش')
    """)
    # Purchase ledger: Dr inventory, Cr cash
    conn.execute("INSERT INTO financial_ledger VALUES (1,'2026-01-01','00:00','inventory','CASH001',10000000,0.0,'IQD','car','CASH001','شراء سيارة','شراء سيارة: سيارة كاش اختبار',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (2,'2026-01-01','00:00','cash','قاصه',0.0,10000000,'IQD','car','CASH001','شراء سيارة كاش','سحب نقدي لشراء سيارة',NULL)")
    # Car purchase partner rows (50/50 split)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (5,'أمير','شريك','سحب شراء',5000000,'2026-01-01','00:00','سحب شراء سيارة كاش اختبار (شاصي: )','IQD','قاصه','car_purchase','CASH001','cash_payment',1,1,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (6,'منتصر','شريك','سحب شراء',5000000,'2026-01-01','00:00','سحب شراء سيارة كاش اختبار (شاصي: )','IQD','قاصه','car_purchase','CASH001','cash_payment',1,1,0)""")
    # Sale ledger: Dr cash, Cr revenue + COGS
    conn.execute("INSERT INTO financial_ledger VALUES (3,'2026-01-15','00:00','revenue','CASH001',0.0,20000000,'IQD','car','CASH001','بيع سيارة','إيراد بيع سيارة',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (4,'2026-01-15','00:00','cash','قاصه',20000000,0.0,'IQD','car','CASH001','بيع سيارة كاش','استلام نقدي بيع سيارة',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (5,'2026-01-15','00:00','expense','CASH001',10000000,0.0,'IQD','car','CASH001','تكلفة المبيعات','تكلفة بيع سيارة',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (6,'2026-01-15','00:00','inventory','CASH001',0.0,10000000,'IQD','car','CASH001','تخفيض المخزون بيع سيارة','إخراج سيارة من المخزون',NULL)")
    # Partner cash movement for sale
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (1,'أمير','شريك','ايداع بيع سيارة',10000000,'2026-01-15','00:00','ايداع بيع سيارة سيارة كاش اختبار','IQD','قاصه','car_sale','CASH001','cash_movement',1,1,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (2,'منتصر','شريك','ايداع بيع سيارة',10000000,'2026-01-15','00:00','ايداع بيع سيارة سيارة كاش اختبار','IQD','قاصه','car_sale','CASH001','cash_movement',1,1,0)""")
    # Profit recognition for cash sale
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (3,'أمير','شريك','ايداع ارباح سيارة',5000000,'2026-01-15','00:00','ايداع ارباح سيارة سيارة كاش اختبار #بيع_سيارة_CASH001','IQD','قاصه','car_sale','CASH001','profit_recognition',0,0,1,'car','CASH001')""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (4,'منتصر','شريك','ايداع ارباح سيارة',5000000,'2026-01-15','00:00','ايداع ارباح سيارة سيارة كاش اختبار #بيع_سيارة_CASH001','IQD','قاصه','car_sale','CASH001','profit_recognition',0,0,1,'car','CASH001')""")

    # ===== Scenario 2: Installment sale car =====
    # Car INST001: purchase 10M, sell 20M, down payment 5M, remaining 15M in 15 months
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, car_name, purchase_price, currency, sale_currency,
            selling_price, status, payment_type, amount_paid, amount_remaining, installment_months,
            buyer_name, purchase_date, sale_date, first_payment_date, purchase_type)
        VALUES ('INST001', 'INST001', 'سيارة تقسيط اختبار', 10000000, 'IQD', 'IQD',
            20000000, 'مبيوعة', 'اقساط', 5000000, 15000000, 15,
            'مشتري تقسيط', '2026-02-01', '2026-02-15', '2026-03-15', 'كاش')
    """)
    # Purchase ledger
    conn.execute("INSERT INTO financial_ledger VALUES (10,'2026-02-01','00:00','inventory','INST001',10000000,0.0,'IQD','car','INST001','شراء سيارة','شراء سيارة: سيارة تقسيط اختبار',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (11,'2026-02-01','00:00','cash','قاصه',0.0,10000000,'IQD','car','INST001','شراء سيارة كاش','سحب نقدي لشراء سيارة',NULL)")
    # Car purchase partner rows (50/50 split)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (500,'أمير','شريك','سحب شراء',5000000,'2026-02-01','00:00','سحب شراء سيارة تقسيط اختبار (شاصي: )','IQD','قاصه','car_purchase','INST001','cash_payment',1,1,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (501,'منتصر','شريك','سحب شراء',5000000,'2026-02-01','00:00','سحب شراء سيارة تقسيط اختبار (شاصي: )','IQD','قاصه','car_purchase','INST001','cash_payment',1,1,0)""")
    # Sale ledger: receivable and deferred_revenue
    conn.execute("INSERT INTO financial_ledger VALUES (12,'2026-02-15','00:00','receivable','مشتري تقسيط',20000000,0.0,'IQD','car','INST001','مدينون بيع سيارة','ذمة مدينة كاملة بيع سيارة',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (13,'2026-02-15','00:00','deferred_revenue','INST001',0.0,20000000,'IQD','car','INST001','إيراد مؤجل بيع سيارة','إيراد مؤجل بيع سيارة',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (14,'2026-02-15','00:00','expense','INST001',10000000,0.0,'IQD','car','INST001','تكلفة المبيعات','تكلفة بيع سيارة',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (15,'2026-02-15','00:00','inventory','INST001',0.0,10000000,'IQD','car','INST001','تخفيض المخزون بيع سيارة','إخراج سيارة من المخزون',NULL)")

    # Customer account
    conn.execute("INSERT INTO partners VALUES ('مشتري تقسيط', '', 15000000.0, 'زبون', 15000000.0, 0.0)")

    # Down payment (5M): customer payment + cash_movement + profit_recognition
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (20,'مشتري تقسيط','زبون','مقدمة بيع سيارة',5000000,'2026-02-15','00:00','استلام مقدمة سيارة من مشتري تقسيط رقم الشاصي #بيع_سيارة_INST001 ','IQD','قاصه','customer_transaction','20','account_movement',0,0,0,'car','INST001')""")
    # Cash movement for down payment
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (21,'أمير','شريك','ايداع مقدمة',2500000,'2026-02-15','00:00','دفعة زبون: استلام مقدمة (رقم حركة دفعة: 20) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','20','cash_movement',1,1,0,'car','INST001')""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (22,'منتصر','شريك','ايداع مقدمة',2500000,'2026-02-15','00:00','دفعة زبون: استلام مقدمة (رقم حركة دفعة: 20) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','20','cash_movement',1,1,0,'car','INST001')""")
    # Receivable credit for down payment
    conn.execute("INSERT INTO financial_ledger VALUES (20,'2026-02-15','00:00','receivable','مشتري تقسيط',0.0,5000000,'IQD','partner_transaction','20','ايداع زبون مديونية','تخفيض مديونية الزبون مشتري تقسيط',NULL)")
    # Cash debit for down payment
    conn.execute("INSERT INTO financial_ledger VALUES (21,'2026-02-15','00:00','cash','قاصه',5000000,0.0,'IQD','partner_transaction','21','ايداع مقدمة','إيداع دفعة زبون',NULL)")
    # Profit recognition for down payment: 5M * 50% = 2.5M
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (23,'أمير','شريك','ايداع ارباح سيارة',1250000,'2026-02-15','00:00','ربح دفعة زبون (رقم حركة دفعة: 20) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','20','profit_recognition',0,0,1,'car','INST001')""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (24,'منتصر','شريك','ايداع ارباح سيارة',1250000,'2026-02-15','00:00','ربح دفعة زبون (رقم حركة دفعة: 20) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','20','profit_recognition',0,0,1,'car','INST001')""")

    # One installment payment of 1M
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (25,'مشتري تقسيط','زبون','تسديد قسط',1000000,'2026-03-15','00:00','تسديد قسط شهر 1 #بيع_سيارة_INST001','IQD','قاصه','customer_transaction','25','account_movement',0,0,0,'car','INST001')""")
    # Remaining installment rows (باقي قسط)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (200,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-04-15','00:00','باقي قسط شهر 2 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','200','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (201,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-05-15','00:00','باقي قسط شهر 3 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','201','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (202,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-06-15','00:00','باقي قسط شهر 4 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','202','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (203,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-07-15','00:00','باقي قسط شهر 5 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','203','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (204,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-08-15','00:00','باقي قسط شهر 6 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','204','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (205,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-09-15','00:00','باقي قسط شهر 7 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','205','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (206,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-10-15','00:00','باقي قسط شهر 8 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','206','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (207,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-11-15','00:00','باقي قسط شهر 9 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','207','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (208,'مشتري تقسيط','زبون','باقي قسط',1000000,'2026-12-15','00:00','باقي قسط شهر 10 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','208','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (209,'مشتري تقسيط','زبون','باقي قسط',1000000,'2027-01-15','00:00','باقي قسط شهر 11 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','209','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (210,'مشتري تقسيط','زبون','باقي قسط',1000000,'2027-02-15','00:00','باقي قسط شهر 12 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','210','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (211,'مشتري تقسيط','زبون','باقي قسط',1000000,'2027-03-15','00:00','باقي قسط شهر 13 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','211','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (212,'مشتري تقسيط','زبون','باقي قسط',1000000,'2027-04-15','00:00','باقي قسط شهر 14 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','212','account_movement',0,0,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (213,'مشتري تقسيط','زبون','باقي قسط',1000000,'2027-05-15','00:00','باقي قسط شهر 15 من 15 على مشتري تقسيط رقم الشاصي','IQD','قاصه','customer_transaction','213','account_movement',0,0,0)""")
    # Cash movement for installment
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (26,'أمير','شريك','ايداع مقدمة',500000,'2026-03-15','00:00','دفعة زبون: تسديد قسط (رقم حركة دفعة: 25) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','25','cash_movement',1,1,0,'car','INST001')""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (27,'منتصر','شريك','ايداع مقدمة',500000,'2026-03-15','00:00','دفعة زبون: تسديد قسط (رقم حركة دفعة: 25) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','25','cash_movement',1,1,0,'car','INST001')""")
    # Receivable credit for installment
    conn.execute("INSERT INTO financial_ledger VALUES (25,'2026-03-15','00:00','receivable','مشتري تقسيط',0.0,1000000,'IQD','partner_transaction','25','ايداع زبون مديونية','تخفيض مديونية الزبون',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (26,'2026-03-15','00:00','cash','قاصه',1000000,0.0,'IQD','partner_transaction','26','ايداع مقدمة','إيداع دفعة زبون',NULL)")
    # Profit recognition: 1M * 50% = 500K
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (28,'أمير','شريك','ايداع ارباح سيارة',250000,'2026-03-15','00:00','ربح دفعة زبون (رقم حركة دفعة: 25) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','25','profit_recognition',0,0,1,'car','INST001')""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id)
        VALUES (29,'منتصر','شريك','ايداع ارباح سيارة',250000,'2026-03-15','00:00','ربح دفعة زبون (رقم حركة دفعة: 25) #بيع_سيارة_INST001','IQD','قاصه','customer_payment','25','profit_recognition',0,0,1,'car','INST001')""")

    # Update customer balance after payments (5M + 1M = 6M paid, 14M remaining)
    conn.execute("UPDATE partners SET iqd_balance = 14000000.0 WHERE partner_name = 'مشتري تقسيط' AND kind = 'زبون'")

    # ===== Scenario 3: General expense =====
    conn.execute("INSERT INTO expenses (id, description, amount, date, time, notes, currency, car_number) VALUES (1, 'إيجار', 1000000, '2026-01-10', '00:00', NULL, 'IQD', NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (30,'2026-01-10','00:00','expense','إيجار',1000000,0.0,'IQD','expense','1','مصروف عام','إيجار',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (31,'2026-01-10','00:00','cash','قاصه',0.0,1000000,'IQD','expense','1','دفع مصروف','دفع مصروف: إيجار',NULL)")
    # Partner expense split (with matching ledger entries)
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (30,'أمير','شريك','سحب مصروف',500000,'2026-01-10','00:00','سحب مصروف إيجار (رقم المصروف: 1)','IQD','قاصه','expense','1','cash_payment',1,1,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (31,'منتصر','شريك','سحب مصروف',500000,'2026-01-10','00:00','سحب مصروف إيجار (رقم المصروف: 1)','IQD','قاصه','expense','1','cash_payment',1,1,0)""")
    # Ledger entries for partner expense splits
    conn.execute("INSERT INTO financial_ledger VALUES (32,'2026-01-10','00:00','drawings','أمير',500000,0.0,'IQD','partner_transaction','30','سحب شريك مصروف','مسحوبات الشريك أمير',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (33,'2026-01-10','00:00','cash','قاصه',0.0,500000,'IQD','partner_transaction','30','سحب شريك','سحب نقدي شريك: أمير',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (34,'2026-01-10','00:00','drawings','منتصر',500000,0.0,'IQD','partner_transaction','31','سحب شريك مصروف','مسحوبات الشريك منتصر',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (35,'2026-01-10','00:00','cash','قاصه',0.0,500000,'IQD','partner_transaction','31','سحب شريك','سحب نقدي شريك: منتصر',NULL)")

    # ===== Scenario 4: Investor =====
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (40,'مستثمر اختبار','مستثمر','ايداع',10000000,'2026-01-05','00:00','إيداع مستثمر','IQD','قاصه','investor_transaction','40','account_movement',1,0,0)""")
    conn.execute("INSERT INTO financial_ledger VALUES (40,'2026-01-05','00:00','cash','قاصه',10000000,0.0,'IQD','partner_transaction','40','ايداع مستثمر','إيداع مستثمر',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (41,'2026-01-05','00:00','investor','مستثمر اختبار',0.0,10000000,'IQD','partner_transaction','40','ايداع مستثمر اموال','إيداع أموال المستثمر',NULL)")
    conn.execute("INSERT INTO partners VALUES ('مستثمر اختبار', '', 10000000.0, 'مستثمر', 0.0, 0.0)")

    # ===== Scenario 5: Funder =====
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (50,'ممول اختبار','ممول','ايداع',5000000,'2026-01-06','00:00','استلام تمويل','IQD','قاصه','funder_transaction','50','account_movement',0,0,0)""")
    conn.execute("INSERT INTO financial_ledger VALUES (50,'2026-01-06','00:00','funder','ممول اختبار',0.0,5000000,'IQD','partner_transaction','50','تمويل ممول اموال','استلام تمويل',NULL)")
    conn.execute("INSERT INTO partners VALUES ('ممول اختبار', '', 5000000.0, 'ممول', 0.0, 0.0)")

    # ===== Scenario 6: Car with similar notes (for delete test) =====
    # Car DEL001 and DEL002 with similar chassis numbers
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, car_name, chassis_number, purchase_price, currency, sale_currency,
            selling_price, status, payment_type, purchase_date, purchase_type)
        VALUES ('DEL001', 'DEL001', 'سيارة حذف 1', 'CHASSIS-SAME', 8000000, 'IQD', 'IQD',
            0, 'متوفرة', 'كاش', '2026-03-01', 'كاش')
    """)
    conn.execute("""
        INSERT INTO cars (car_number, car_plate_num, car_name, chassis_number, purchase_price, currency, sale_currency,
            selling_price, status, payment_type, purchase_date, purchase_type)
        VALUES ('DEL002', 'DEL002', 'سيارة حذف 2', 'CHASSIS-SAME', 9000000, 'IQD', 'IQD',
            0, 'متوفرة', 'كاش', '2026-03-02', 'كاش')
    """)
    # Purchase rows for DEL001
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (60,'أمير','شريك','سحب شراء',4000000,'2026-03-01','00:00','سحب شراء سيارة حذف 1 (شاصي: CHASSIS-SAME)','IQD','قاصه','car_purchase','DEL001','cash_payment',1,1,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (61,'منتصر','شريك','سحب شراء',4000000,'2026-03-01','00:00','سحب شراء سيارة حذف 1 (شاصي: CHASSIS-SAME)','IQD','قاصه','car_purchase','DEL001','cash_payment',1,1,0)""")
    # Purchase rows for DEL002
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (62,'أمير','شريك','سحب شراء',4500000,'2026-03-02','00:00','سحب شراء سيارة حذف 2 (شاصي: CHASSIS-SAME)','IQD','قاصه','car_purchase','DEL002','cash_payment',1,1,0)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (63,'منتصر','شريك','سحب شراء',4500000,'2026-03-02','00:00','سحب شراء سيارة حذف 2 (شاصي: CHASSIS-SAME)','IQD','قاصه','car_purchase','DEL002','cash_payment',1,1,0)""")
    # Ledger for DEL001
    conn.execute("INSERT INTO financial_ledger VALUES (60,'2026-03-01','00:00','inventory','DEL001',8000000,0.0,'IQD','car','DEL001','شراء سيارة','شراء سيارة: سيارة حذف 1',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (61,'2026-03-01','00:00','cash','قاصه',0.0,8000000,'IQD','car','DEL001','شراء سيارة كاش','سحب نقدي لشراء سيارة',NULL)")
    # Ledger for DEL002
    conn.execute("INSERT INTO financial_ledger VALUES (62,'2026-03-02','00:00','inventory','DEL002',9000000,0.0,'IQD','car','DEL002','شراء سيارة','شراء سيارة: سيارة حذف 2',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (63,'2026-03-02','00:00','cash','قاصه',0.0,9000000,'IQD','car','DEL002','شراء سيارة كاش','سحب نقدي لشراء سيارة',NULL)")

    # ===== Scenario 7: Company (شركة) =====
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (70,'شركة اختبار','شركة','ايداع',3000000,'2026-01-07','00:00','إيداع شركة','IQD','قاصه','company_transaction','70','account_movement',0,0,0)""")
    conn.execute("INSERT INTO financial_ledger VALUES (70,'2026-01-07','00:00','payable','شركة اختبار',0.0,3000000,'IQD','partner_transaction','70','ايداع شركة اموال','إيداع حساب شركة',NULL)")
    conn.execute("INSERT INTO partners VALUES ('شركة اختبار', '', 3000000.0, 'شركة', 0.0, 0.0)")

    # ===== Scenario 8: Agency =====
    conn.execute("""INSERT INTO agencies (id, old_agent_name, car_type, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time)
        VALUES (1, 'وكيل قديم', 'تاهو', 'AG001', '2024', 'أبيض', 'وكيل جديد', '', 0, 2000000, '', '2026-01-08', '00:00')""")
    conn.execute("INSERT INTO financial_ledger VALUES (80,'2026-01-08','00:00','cash','قاصه',2000000,0.0,'IQD','agency','1','أرباح وكالة','وكالة وكيل قديم وكيل جديد',NULL)")
    conn.execute("INSERT INTO financial_ledger VALUES (81,'2026-01-08','00:00','revenue','agency',0.0,2000000,'IQD','agency','1','أرباح وكالة إيراد','وكالة وكيل قديم وكيل جديد',NULL)")
    # Profit recognition for agency
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (80,'أمير','شريك','ايداع ارباح وكالة',1000000,'2026-01-08','00:00','ايداع ارباح وكالة وكيل قديم وكيل جديد','IQD','قاصه','agency','1','profit_recognition',0,0,1)""")
    conn.execute("""INSERT INTO partner_transactions (id,partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit)
        VALUES (81,'منتصر','شريك','ايداع ارباح وكالة',1000000,'2026-01-08','00:00','ايداع ارباح وكالة وكيل قديم وكيل جديد','IQD','قاصه','agency','1','profit_recognition',0,0,1)""")

    # Recalculate partner totals (cash: deposits - withdrawals for partners)
    for name in ['أمير', 'منتصر']:
        iqd_dep = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name = ? AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
            AND affects_partner_cash = 1
            AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%' OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%' OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
            AND type NOT LIKE 'تحويل%'
        """, [name]).fetchone()[0]
        iqd_wit = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name = ? AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
            AND affects_partner_cash = 1
            AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
            AND type NOT LIKE 'تحويل%'
        """, [name]).fetchone()[0]
        conn.execute("UPDATE partners SET iqd_balance = ?, total_amount = ? WHERE partner_name = ? AND kind = 'شريك'",
                     [iqd_dep - iqd_wit, iqd_dep - iqd_wit, name])

    # Update customer balance from ledger receivable net (source of truth per Instructions.md)
    iqd_recv = conn.execute("""
        SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
        WHERE account_type = 'receivable' AND account_id = 'مشتري تقسيط' AND currency = 'IQD'
    """).fetchone()[0]
    conn.execute("UPDATE partners SET iqd_balance = ?, total_amount = ? WHERE partner_name = 'مشتري تقسيط' AND kind = 'زبون'",
                 [iqd_recv, iqd_recv])

    conn.commit()
    conn.close()
    print(f"Test database created at: {path}")

if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else "test_fajir_alwadi.db"
    create_test_db(db_path)
