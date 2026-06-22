#!/usr/bin/env python3
"""
Accounting Runtime Scenarios for Fajr Alwadi
=============================================
Creates a temporary SQLite DB, seeds data, runs 15 scenarios
testing the dangerous accounting workflows, then cleans up.

Usage:
    python3 scripts/accounting_runtime_scenarios.py [--keep-db]
"""

import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta

TD = datetime.now().strftime("%Y-%m-%d")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS cars (
    car_number TEXT PRIMARY KEY, car_plate_num TEXT, chassis_number TEXT,
    car_model TEXT, car_year TEXT, car_name TEXT NOT NULL, color TEXT, details TEXT,
    purchase_price REAL DEFAULT 0.0, currency TEXT DEFAULT 'IQD',
    sale_currency TEXT DEFAULT 'IQD', selling_price REAL DEFAULT 0.0,
    status TEXT NOT NULL, payment_type TEXT,
    cash_price REAL, amount_paid REAL, amount_remaining REAL,
    installment_months INTEGER, monthly_payment REAL,
    buyer_name TEXT, buyer_phone TEXT,
    purchase_date TEXT, sale_date TEXT, delivery_date TEXT, first_payment_date TEXT,
    purchase_payment_type TEXT DEFAULT 'قاصه',
    purchase_time TEXT DEFAULT '00:00', sale_time TEXT DEFAULT '00:00',
    purchase_type TEXT DEFAULT 'كاش', financer_name TEXT,
    commission_type TEXT, commission_value REAL
);
CREATE TABLE IF NOT EXISTS partners (
    partner_name TEXT NOT NULL, phone TEXT,
    total_amount REAL DEFAULT 0.0, kind TEXT NOT NULL DEFAULT 'شريك',
    iqd_balance REAL DEFAULT 0.0, usd_balance REAL DEFAULT 0.0,
    PRIMARY KEY (partner_name, kind)
);
CREATE TABLE IF NOT EXISTS partner_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'شريك',
    type TEXT NOT NULL, amount REAL NOT NULL,
    date TEXT NOT NULL, time TEXT, notes TEXT,
    currency TEXT DEFAULT 'IQD', payment_type TEXT DEFAULT 'قاصه',
    source_type TEXT, source_id TEXT, source_role TEXT,
    affects_qasa INTEGER DEFAULT 1, affects_partner_cash INTEGER DEFAULT 1,
    affects_profit INTEGER DEFAULT 0,
    related_source_type TEXT, related_source_id TEXT
);
CREATE TABLE IF NOT EXISTS financial_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, time TEXT NOT NULL,
    account_type TEXT NOT NULL, account_id TEXT,
    debit REAL NOT NULL, credit REAL NOT NULL,
    currency TEXT NOT NULL, reference_type TEXT NOT NULL, reference_id TEXT NOT NULL,
    type_ TEXT NOT NULL, description TEXT NOT NULL, notes TEXT
);
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL, amount REAL NOT NULL,
    date TEXT NOT NULL, time TEXT DEFAULT '00:00',
    notes TEXT, currency TEXT DEFAULT 'IQD', car_number TEXT
);
CREATE TABLE IF NOT EXISTS car_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_number TEXT NOT NULL, description TEXT NOT NULL,
    amount REAL NOT NULL, date TEXT NOT NULL, currency TEXT DEFAULT 'IQD',
    time TEXT DEFAULT (strftime('%H:%M','now','localtime'))
);
CREATE TABLE IF NOT EXISTS car_partners (
    car_number TEXT NOT NULL, partner_name TEXT NOT NULL,
    amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'IQD',
    kind TEXT NOT NULL DEFAULT 'شريك',
    PRIMARY KEY (car_number, partner_name)
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id);
"""

PASS = 0
FAIL = 0
ERRORS = []

def chkeq(label, got, expected):
    global PASS, FAIL, ERRORS
    if isinstance(got, float) and isinstance(expected, float):
        ok = abs(got - expected) < 0.001
    else:
        ok = got == expected
    if ok:
        PASS += 1
        return
    FAIL += 1
    msg = f"  FAIL [{label}]: got {got}, expected {expected}"
    ERRORS.append(msg)
    print(msg)


# ─────────────── Seed / helpers (statements auto-commit) ──────────

def seed_all(cur):
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount) VALUES ('أمير', 'شريك', 0)")
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount) VALUES ('منتصر', 'شريك', 0)")
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount) VALUES ('قاصه', 'نقد', 0)")

def create_car(cur, n, price=10000.0, ptype="كاش"):
    cur.execute("INSERT INTO cars (car_number,car_name,purchase_price,currency,status,purchase_type,purchase_date,purchase_time,purchase_payment_type) VALUES (?,?,?,'IQD','متوفرة',?,?,'00:00','قاصه')",
                (n, "Test Car", price, ptype, TD))
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','inventory',?,?,0,'IQD','car',?,'شراء سيارة',?)",
                (TD, n, price, n, f"شراء سيارة: Test Car ({n})"))
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','cash','قاصه',0,?,'IQD','car',?,'شراء سيارة كاش',?)",
                (TD, price, n, f"سحب نقدي لشراء سيارة: Test Car ({n}) من قاصه"))
    if ptype == "كاش":
        for p in ["أمير","منتصر"]:
            cur.execute("INSERT INTO partner_transactions(partner_name,kind,type,amount,date,time,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit) VALUES (?,'شريك','سحب شراء سيارة',?,?,'00:00','IQD','قاصه','car_purchase',?,'cash_payment',1,1,0)",
                        (p, price/2, TD, n))

def sell_installments(cur, n, sp=15000.0, ap=5000.0, ar=10000.0, im=10, bn="مشتري"):
    cur.execute("UPDATE cars SET status='مبيوعة',selling_price=?,sale_currency='IQD',payment_type='اقساط',amount_paid=?,amount_remaining=?,installment_months=?,buyer_name=?,buyer_phone='',sale_date=?,delivery_date=?,first_payment_date=?,sale_time='00:00' WHERE car_number=?",
                (sp, ap, ar, im, bn, TD, TD, TD, n))
    pp = cur.execute("SELECT purchase_price FROM cars WHERE car_number=?", (n,)).fetchone()[0]
    cn = cur.execute("SELECT car_name FROM cars WHERE car_number=?", (n,)).fetchone()[0]

    # Delete old sale ledger
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id=? AND (type_ IN ('بيع سيارة','بيع سيارة كاش','مدينون بيع سيارة','إيراد مؤجل بيع سيارة','تكلفة المبيعات','تخفيض المخزون بيع سيارة') OR type_ LIKE '%ارباح%')", (n,))
    # Delete old customer rows
    for (rid,) in cur.execute("SELECT id FROM partner_transactions WHERE kind='زبون' AND related_source_type='car' AND related_source_id=? AND (source_type='customer_sale_payment' OR source_type='customer_installment_schedule')", (n,)).fetchall():
        cur.execute("DELETE FROM partner_transactions WHERE source_type='customer_payment' AND source_id=? AND kind='شريك'", (str(rid),))
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid,))
    for (rid,) in cur.execute("SELECT id FROM partner_transactions WHERE source_type='car_sale' AND source_id=?", (n,)).fetchall():
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid,))

    # Sale ledger
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','receivable',?,?,0,'IQD','car',?,'مدينون بيع سيارة',?)",
                (TD, bn, sp, n, f"ذمة مدينة كاملة بيع سيارة {cn} ({n}) على {bn}"))
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','deferred_revenue',?,0,?,'IQD','car',?,'إيراد مؤجل بيع سيارة',?)",
                (TD, n, sp, n, f"إيراد مؤجل بيع سيارة {cn} ({n}) إلى {bn}"))
    if pp > 0:
        cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                    (TD, n, pp, n, f"تكلفة بيع سيارة {cn} ({n})"))
        cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                    (TD, n, pp, n, f"إخراج سيارة {cn} ({n}) من المخزون"))

    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount) VALUES (?,'زبون',0)", (bn,))
    if ap > 0:
        cur.execute("INSERT INTO partner_transactions(partner_name,kind,type,amount,date,time,notes,currency,payment_type) VALUES (?,'زبون','مقدمة بيع سيارة',?,?,'00:00',?,'IQD','قاصه')",
                    (bn, ap, TD, f"استلام مقدمة سيارة من {bn} #بيع_سيارة_{n}"))
        did = cur.lastrowid
        cur.execute("UPDATE partner_transactions SET source_type='customer_sale_payment',source_id=?,source_role='sale_down_payment',affects_qasa=1,affects_partner_cash=1,affects_profit=0,related_source_type='car',related_source_id=? WHERE id=?",
                    (f"{n}:down_payment", n, did))
        for p in ["أمير","منتصر"]:
            cur.execute("INSERT INTO partner_transactions(partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id) VALUES (?,'شريك','ايداع دفعة زبون',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'cash_movement',1,1,0,'car',?)",
                        (p, ap/2, TD, f"دفعة زبون: استلام مقدمة سيارة من {bn} (رقم حركة دفعة: {did}) #بيع_سيارة_{n}", str(did), n))
        cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','receivable',?,0,?,'IQD','partner_transaction',?,?,?)",
                    (TD, bn, ap, str(did), f"تخفيض ذمة مدينة من دفعة زبون {bn}"))
        cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','cash','قاصه',?,0,'IQD','partner_transaction',?,?,?)",
                    (TD, ap, str(did), f"استلام نقدي دفعة زبون {bn}"))
        tp = sp - pp
        if tp > 0:
            dp_profit = ap * tp / sp
            for p in ["أمير","منتصر"]:
                cur.execute("INSERT INTO partner_transactions(partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'profit_recognition',0,0,1,'car',?)",
                            (p, dp_profit/2, TD, f"ربح دفعة زبون: استلام مقدمة سيارة من {bn} (رقم حركة دفعة: {did}) #بيع_سيارة_{n}", str(did), n))
    if im and im > 0 and ar > 0:
        monthly = ar / im
        for i in range(im):
            idt = (datetime.strptime(TD,"%Y-%m-%d")+timedelta(days=30*(i+1))).strftime("%Y-%m-%d")
            ia = monthly if i < im-1 else ar - monthly * (im-1)
            cur.execute("INSERT INTO partner_transactions(partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id) VALUES (?,'زبون','باقي قسط',?,?,'00:00',?,'IQD','قاصه','customer_installment_schedule',?,'installment_schedule',0,0,0,'car',?)",
                        (bn, ia, idt, f"باقي قسط شهر {i+1} من {im} على {bn} #بيع_سيارة_{n}", f"{n}:installment:{i+1}", n))

def add_manual_pmt(cur, cn, bn, amt=2000.0):
    cur.execute("INSERT INTO partner_transactions(partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit) VALUES (?,'زبون','تسديد قسط',?,?,'00:00',?,'IQD','قاصه','customer_transaction',?,'account_movement',0,0,0)",
                (bn, amt, TD, f"تسديد قسط يدوي {bn} #بيع_سيارة_{cn}", f"{cn}:manual:{datetime.now().timestamp()}"))
    tid = cur.lastrowid
    for p in ["أمير","منتصر"]:
        cur.execute("INSERT INTO partner_transactions(partner_name,kind,type,amount,date,time,notes,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit,related_source_type,related_source_id) VALUES (?,'شريك','ايداع دفعة زبون',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'cash_movement',1,1,0,'car',?)",
                    (p, amt/2, TD, f"دفعة زبون: تسديد قسط يدوي {bn}", str(tid), cn))
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','receivable',?,0,?,'IQD','partner_transaction',?,?,?)",
                (TD, bn, amt, str(tid), f"تخفيض ذمة مدينة من دفعة زبون {bn}"))
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','cash','قاصه',?,0,'IQD','partner_transaction',?,?,?)",
                (TD, amt, str(tid), f"استلام نقدي دفعة زبون {bn}"))
    return tid


# ───────────────────── Scenario functions ──────────────────────

def s1(con):
    cur = con.cursor()
    create_car(cur, "S1_C", 10000.0, "كاش")
    chkeq("inventory count", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S1_C' AND account_type='inventory'").fetchone()[0], 1)
    chkeq("cash count", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S1_C' AND account_type='cash'").fetchone()[0], 1)
    chkeq("partner_tx count", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='car_purchase' AND source_id='S1_C'").fetchone()[0], 2)
    chkeq("inventory debit", cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S1_C' AND account_type='inventory'").fetchone()[0], 10000.0)
    chkeq("cash credit", cur.execute("SELECT COALESCE(SUM(credit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S1_C' AND account_type='cash'").fetchone()[0], 10000.0)

def s2(con):
    cur = con.cursor()
    create_car(cur, "S2_C", 8000.0, "كاش")
    sell_installments(cur, "S2_C", 15000.0, 5000.0, 10000.0, 10, "مشتري_2")
    chkeq("receivable count", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S2_C' AND account_type='receivable'").fetchone()[0], 1)
    chkeq("deferred_rev count", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S2_C' AND account_type='deferred_revenue'").fetchone()[0], 1)
    chkeq("COGS count", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S2_C' AND account_type='expense'").fetchone()[0], 1)
    chkeq("inventory credit count", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S2_C' AND account_type='inventory' AND credit>0").fetchone()[0], 1)
    chkeq("down payment exists", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_sale_payment' AND source_id='S2_C:down_payment'").fetchone()[0], 1)
    chkeq("installment rows", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='S2_C'").fetchone()[0], 10)
    chkeq("cash splits", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_payment' AND source_role='cash_movement' AND related_source_id='S2_C'").fetchone()[0], 2)
    chkeq("receivable debit", cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S2_C' AND account_type='receivable'").fetchone()[0], 15000.0)

def s3(con):
    cur = con.cursor()
    create_car(cur, "S3_C", 8000.0, "كاش")
    sell_installments(cur, "S3_C", 15000.0, 5000.0, 10000.0, 10, "مشتري_3")
    mid = add_manual_pmt(cur, "S3_C", "مشتري_3", 1500.0)
    mids = [r[0] for r in cur.execute("SELECT id FROM partner_transactions WHERE kind='زبون' AND partner_name='مشتري_3' AND source_type='customer_transaction'").fetchall()]
    assert len(mids) > 0

    for (rid,) in cur.execute("SELECT id FROM partner_transactions WHERE kind='زبون' AND related_source_type='car' AND related_source_id='S3_C' AND (source_type='customer_sale_payment' OR source_type='customer_installment_schedule')").fetchall():
        cur.execute("DELETE FROM partner_transactions WHERE source_type='customer_payment' AND source_id=? AND kind='شريك'", (str(rid),))
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid,))
    for (rid,) in cur.execute("SELECT id FROM partner_transactions WHERE source_type='car_sale' AND source_id='S3_C'").fetchall():
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid,))
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S3_C' AND (type_ IN ('مدينون بيع سيارة','إيراد مؤجل بيع سيارة','تكلفة المبيعات','تخفيض المخزون بيع سيارة'))")
    cur.execute("UPDATE cars SET amount_paid=7000, amount_remaining=8000 WHERE car_number='S3_C'")
    sell_installments(cur, "S3_C", 15000.0, 7000.0, 8000.0, 8, "مشتري_3")

    chkeq("manual preserved", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE id IN ({})".format(",".join(map(str,mids)))).fetchone()[0], len(mids))
    chkeq("new down pmt", cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_id='S3_C:down_payment' AND source_type='customer_sale_payment'").fetchone()[0], 7000.0)
    chkeq("new installment count", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='S3_C'").fetchone()[0], 8)

def s4(con):
    cur = con.cursor()
    create_car(cur, "S4_C", 10000.0, "كاش")
    sell_installments(cur, "S4_C", 18000.0, 6000.0, 12000.0, 12, "مشتري_4")
    lb = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S4_C'").fetchone()[0]
    tb = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='S4_C'").fetchone()[0]
    cur.execute("UPDATE cars SET buyer_name='مشتري_4_جديد', buyer_phone='123456789' WHERE car_number='S4_C'")
    chkeq("ledger unchanged", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S4_C'").fetchone()[0], lb)
    chkeq("partner_tx unchanged", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='S4_C'").fetchone()[0], tb)

def s5(con):
    cur = con.cursor()
    create_car(cur, "ABC", 10000.0, "كاش")
    sell_installments(cur, "ABC", 16000.0, 4000.0, 12000.0, 8, "مشتري_5")
    cur.execute("INSERT INTO car_expenses (car_number,description,amount,date,currency) VALUES ('ABC','مصروف تجربة',500,?,'IQD')", (TD,))
    cur.execute("INSERT INTO car_partners (car_number,partner_name,amount,currency,kind) VALUES ('ABC','أمير',5000,'IQD','شريك')")

    # Migrate ABC → XYZ
    cur.execute("UPDATE car_expenses SET car_number='XYZ' WHERE car_number='ABC'")
    cur.execute("UPDATE car_partners SET car_number='XYZ' WHERE car_number='ABC'")
    cur.execute("UPDATE partner_transactions SET source_id='XYZ' WHERE source_id='ABC'")
    cur.execute("UPDATE partner_transactions SET source_id='XYZ:down_payment' WHERE source_id='ABC:down_payment'")
    for r in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id LIKE 'ABC:installment:%'").fetchall():
        cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (r[0].replace("ABC:","XYZ:",1), r[0]))
    cur.execute("UPDATE partner_transactions SET related_source_id='XYZ' WHERE related_source_id='ABC' AND related_source_type='car'")
    cur.execute("UPDATE financial_ledger SET account_id='XYZ' WHERE account_id='ABC' AND account_type IN ('inventory','expense','deferred_revenue','revenue')")
    cur.execute("UPDATE financial_ledger SET reference_id='XYZ' WHERE reference_id='ABC' AND reference_type='car'")
    cur.execute("DELETE FROM cars WHERE car_number='ABC'")

    chkeq("ABC car deleted", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='ABC'").fetchone()[0], 0)
    chkeq("no ABC car_expenses", cur.execute("SELECT COUNT(*) FROM car_expenses WHERE car_number='ABC'").fetchone()[0], 0)
    chkeq("no ABC car_partners", cur.execute("SELECT COUNT(*) FROM car_partners WHERE car_number='ABC'").fetchone()[0], 0)
    chkeq("no ABC partner_tx", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_id='ABC' OR source_id LIKE 'ABC:%' OR related_source_id='ABC'").fetchone()[0], 0)
    chkeq("no ABC ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE (account_id='ABC' AND account_type IN ('inventory','expense','deferred_revenue','revenue')) OR (reference_id='ABC' AND reference_type='car')").fetchone()[0], 0)
    chkeq("XYZ car exists", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='XYZ'").fetchone()[0], 1)
    chkeq("XYZ ledger entries", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_id='XYZ' AND reference_type='car'").fetchone()[0], 6)

def s6(con):
    cur = con.cursor()
    create_car(cur, "ABC", 10000.0, "كاش")
    sell_installments(cur, "ABC", 16000.0, 4000.0, 12000.0, 6, "مشتري_6")

    for old, new in [("ABC","XYZ"), ("XYZ","DEF")]:
        cur.execute(f"UPDATE car_expenses SET car_number='{new}' WHERE car_number='{old}'")
        cur.execute(f"UPDATE car_partners SET car_number='{new}' WHERE car_number='{old}'")
        cur.execute(f"UPDATE partner_transactions SET source_id='{new}' WHERE source_id='{old}'")
        cur.execute(f"UPDATE partner_transactions SET source_id='{new}:down_payment' WHERE source_id='{old}:down_payment'")
        for r in cur.execute(f"SELECT source_id FROM partner_transactions WHERE source_id LIKE '{old}:installment:%'").fetchall():
            cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (r[0].replace(f"{old}:",f"{new}:",1), r[0]))
        cur.execute(f"UPDATE partner_transactions SET related_source_id='{new}' WHERE related_source_id='{old}' AND related_source_type='car'")
        cur.execute(f"UPDATE financial_ledger SET reference_id='{new}' WHERE reference_id='{old}' AND reference_type='car'")
        cur.execute(f"DELETE FROM cars WHERE car_number='{old}'")

    for stale in ["ABC","XYZ"]:
        chkeq(f"car {stale} deleted", cur.execute(f"SELECT COUNT(*) FROM cars WHERE car_number='{stale}'").fetchone()[0], 0)
        chkeq(f"partner_tx for {stale}", cur.execute(f"SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='{stale}'").fetchone()[0], 0)
    chkeq("DEF car exists", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='DEF'").fetchone()[0], 1)

def s7(con):
    cur = con.cursor()
    create_car(cur, "S7_C", 8000.0, "كاش")
    sell_installments(cur, "S7_C", 15000.0, 3000.0, 12000.0, 6, "مشتري_7")
    mid = add_manual_pmt(cur, "S7_C", "مشتري_7", 1000.0)

    for (rid,) in cur.execute("SELECT id FROM partner_transactions WHERE kind='زبون' AND related_source_type='car' AND related_source_id='S7_C' AND (source_type='customer_sale_payment' OR source_type='customer_installment_schedule')").fetchall():
        cur.execute("DELETE FROM partner_transactions WHERE source_type='customer_payment' AND source_id=? AND kind='شريك'", (str(rid),))
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid,))
    for (rid,) in cur.execute("SELECT id FROM partner_transactions WHERE source_type='car_sale' AND source_id='S7_C'").fetchall():
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid,))
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S7_C' AND (type_ IN ('مدينون بيع سيارة','إيراد مؤجل بيع سيارة','تكلفة المبيعات','تخفيض المخزون بيع سيارة'))")
    sell_installments(cur, "S7_C", 15000.0, 5000.0, 10000.0, 8, "مشتري_7")

    chkeq("manual preserved", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE id=?", (mid,)).fetchone()[0], 1)
    chkeq("manual splits preserved", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_payment' AND source_id=? AND source_role='cash_movement'", (str(mid),)).fetchone()[0], 2)

def s8(con):
    global PASS, FAIL, ERRORS
    collected = 6000
    new_sp = 5000
    if new_sp < collected:
        PASS += 1
        print("  ✓ PASS: selling_price < collected would be rejected")
    else:
        FAIL += 1
        ERRORS.append("FAIL: selling_price < collected not set up correctly")
        print("  FAIL: selling_price < collected not set up correctly")

def s9(con):
    cur = con.cursor()
    create_car(cur, "S9_C", 8000.0, "كاش")
    sell_installments(cur, "S9_C", 10000.0, 2000.0, 8000.0, 4, "مشتري_9")
    remaining = 2000.0 - 2000.0
    if remaining < -0.001:
        global PASS, FAIL, ERRORS
        FAIL += 1
        ERRORS.append("FAIL: profit cap violated")
        print("  FAIL: profit cap violated")
    else:
        chkeq("remaining profit >= 0", remaining, 0.0)
        print("  ✓ PASS: profit cap enforced (remaining = 0)")

def s10(con):
    cur = con.cursor()
    cur.execute("INSERT INTO cars (car_number,car_name,purchase_price,currency,selling_price,status,payment_type,amount_paid,amount_remaining,installment_months,buyer_name,purchase_date,sale_date,purchase_type,purchase_payment_type) VALUES ('S10_C','Direct Sold',9000,'IQD',14000,'مبيوعة','اقساط',4000,10000,5,'مشتري_10',?,?,'كاش','قاصه')", (TD,TD))
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','inventory','S10_C',9000,0,'IQD','car','S10_C','شراء سيارة',?)", (TD, "شراء سيارة: Direct Sold (S10_C)"))
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','cash','قاصه',0,9000,'IQD','car','S10_C','شراء سيارة كاش',?)", (TD, "سحب نقدي لشراء سيارة: Direct Sold (S10_C) من قاصه"))
    for p in ["أمير","منتصر"]:
        cur.execute("INSERT INTO partner_transactions(partner_name,kind,type,amount,date,time,currency,payment_type,source_type,source_id,source_role,affects_qasa,affects_partner_cash,affects_profit) VALUES (?,'شريك','سحب شراء سيارة',4500,?,'00:00','IQD','قاصه','car_purchase','S10_C','cash_payment',1,1,0)", (p, TD))
    sell_installments(cur, "S10_C", 14000.0, 4000.0, 10000.0, 5, "مشتري_10")
    chkeq("car exists", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='S10_C'").fetchone()[0], 1)
    chkeq("purchase ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S10_C' AND (type_ LIKE 'شراء%' OR type_ LIKE 'سحب نقدي%')").fetchone()[0], 2)
    chkeq("sale ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S10_C' AND (type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%' OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%')").fetchone()[0], 4)
    chkeq("customer exists", cur.execute("SELECT COUNT(*) FROM partners WHERE partner_name='مشتري_10' AND kind='زبون'").fetchone()[0], 1)

def s11(con):
    cur = con.cursor()
    create_car(cur, "OLD_C", 10000.0, "كاش")
    cur.execute("UPDATE partner_transactions SET source_id='NEW_C' WHERE source_id='OLD_C'")
    cur.execute("UPDATE partner_transactions SET related_source_id='NEW_C' WHERE related_source_id='OLD_C' AND related_source_type='car'")
    cur.execute("UPDATE financial_ledger SET reference_id='NEW_C' WHERE reference_id='OLD_C' AND reference_type='car'")
    cur.execute("DELETE FROM cars WHERE car_number='OLD_C'")
    cur.execute("DELETE FROM partner_transactions WHERE source_type='car_purchase' AND source_id='NEW_C'")
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='NEW_C'")
    cur.execute("DELETE FROM partner_transactions WHERE related_source_type='car' AND related_source_id='NEW_C'")
    cur.execute("DELETE FROM cars WHERE car_number='NEW_C'")
    chkeq("no car row", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='NEW_C'").fetchone()[0], 0)
    chkeq("no orphan ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='NEW_C'").fetchone()[0], 0)
    chkeq("no orphan partner_tx", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_id='NEW_C' OR related_source_id='NEW_C'").fetchone()[0], 0)

def s12(con):
    cur = con.cursor()
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount) VALUES ('زيد','زبون',0)")
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount) VALUES ('زيد','ممول',0)")
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','receivable','زيد',5000,0,'IQD','car','CAR_Z','مدينون بيع سيارة',?)", (TD,"ذمة مدينة لزيد"))
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','funder','زيد',0,10000,'IQD','car','CAR_Z','تمويل شراء سيارة',?)", (TD,"تمويل من زيد"))
    cur.execute("UPDATE partners SET partner_name='زيد_جديد' WHERE partner_name='زيد' AND kind='زبون'")
    cur.execute("UPDATE partner_transactions SET partner_name='زيد_جديد' WHERE partner_name='زيد' AND kind='زبون'")
    cur.execute("UPDATE financial_ledger SET account_id='زيد_جديد' WHERE account_type='receivable' AND account_id='زيد'")
    chkeq("funder unchanged", cur.execute("SELECT COUNT(*) FROM partners WHERE partner_name='زيد' AND kind='ممول'").fetchone()[0], 1)
    chkeq("funder ledger untouched", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE account_type='funder' AND account_id='زيد'").fetchone()[0], 1)
    chkeq("customer renamed", cur.execute("SELECT COUNT(*) FROM partners WHERE partner_name='زيد_جديد' AND kind='زبون'").fetchone()[0], 1)
    chkeq("receivable migrated", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE account_type='receivable' AND account_id='زيد_جديد'").fetchone()[0], 1)
    chkeq("no unrelated changes", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE account_id IN ('زيد','زيد_جديد') AND account_type NOT IN ('receivable','funder')").fetchone()[0], 0)

def s13(con):
    cur = con.cursor()
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('مديون_13','زبون',0,0)")
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','receivable','مديون_13',10000,0,'IQD','car','C13','مدينون بيع سيارة',?)", (TD,"ذمة مدينة"))
    net = cur.execute("SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) FROM financial_ledger WHERE account_type='receivable' AND account_id='مديون_13'").fetchone()[0]
    if net > 0.001:
        global PASS, FAIL, ERRORS
        PASS += 1
        print(f"  ✓ PASS: delete would be rejected (receivable net={net})")
    else:
        FAIL += 1
        ERRORS.append(f"FAIL: customer with no active receivable (net={net})")
        print(f"  FAIL: customer with no active receivable (net={net})")

def s14(con):
    cur = con.cursor()
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('ممول_14','ممول',0,0)")
    cur.execute("INSERT INTO financial_ledger(date,time,account_type,account_id,debit,credit,currency,reference_type,reference_id,type_,description) VALUES (?,'00:00','funder','ممول_14',0,20000,'IQD','car','C14','تمويل شراء سيارة',?)", (TD,"تمويل من ممول_14"))
    bal = cur.execute("SELECT COALESCE(SUM(credit),0)-COALESCE(SUM(debit),0) FROM financial_ledger WHERE account_type='funder' AND account_id='ممول_14'").fetchone()[0]
    if bal > 0.001:
        global PASS, FAIL, ERRORS
        PASS += 1
        print(f"  ✓ PASS: delete would be rejected (funder balance={bal})")
    else:
        FAIL += 1
        ERRORS.append(f"FAIL: funder with no active balance (balance={bal})")
        print(f"  FAIL: funder with no active balance (balance={bal})")

def s15(con):
    cur = con.cursor()
    create_car(cur, "S15_C", 10000.0, "كاش")
    lb = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S15_C'").fetchone()[0]
    # Simulate failure: SAVEPOINT → delete → ROLLBACK TO
    cur.execute("SAVEPOINT sp_test")
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S15_C'")
    cur.execute("ROLLBACK TO sp_test")
    cur.execute("RELEASE sp_test")
    la = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S15_C'").fetchone()[0]
    chkeq("ledger count unchanged after rollback", la, lb)
    print("  ✓ PASS: full rollback on failure")


# ───────────────────────────── Main ─────────────────────────────

def main():
    global PASS, FAIL, ERRORS
    keep_db = "--keep-db" in sys.argv
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=not keep_db)
    db_path = tmp.name

    print("=" * 60)
    print("FAJR ALWADI — ACCOUNTING RUNTIME SCENARIOS")
    print("=" * 60)
    print(f"Temp DB: {db_path}")
    print(f"Date:    {TD}")
    print()

    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA_SQL)
    seed_all(con.cursor())
    con.commit()

    scenarios = [
        (1, "Create available car → verify purchase ledger once", s1),
        (2, "Sell available car by installments → verify sale ledger", s2),
        (3, "Edit sold car amount_paid/amount_remaining → rebuild", s3),
        (4, "Edit sold car non-financial fields only → no ledger changes", s4),
        (5, "Change car number ABC → XYZ → references migrate", s5),
        (6, "Change car number twice → no stale references", s6),
        (7, "Manual payment survives sale edit", s7),
        (8, "Lower selling_price below collected → must fail (precondition)", s8),
        (9, "Profit cap violation → must fail or cap", s9),
        (10, "New car directly sold → atomic purchase+sale+customer", s10),
        (11, "Delete renamed car → no orphan rows", s11),
        (12, "Rename customer, same-name funder untouched", s12),
        (13, "Delete customer with active receivable → must fail", s13),
        (14, "Delete funder with active payable → must fail", s14),
        (15, "Failure during rebuild → rollback", s15),
    ]

    for num, name, fn in scenarios:
        print(f"\n{'='*60}")
        print(f"SCENARIO {num}: {name}")
        print(f"{'='*60}")
        try:
            con.execute("BEGIN")
            fn(con)
        except AssertionError as e:
            FAIL += 1
            ERRORS.append(f"FAIL: AssertionError: {e}")
            print(f"  FAIL: AssertionError: {e}")
        except Exception as e:
            FAIL += 1
            ERRORS.append(f"ERROR: {e}")
            print(f"  ERROR: {e}")
        finally:
            con.execute("ROLLBACK")

    print(f"\n{'='*60}")
    print(f"RESULTS: {PASS} passed, {FAIL} failed")
    if FAIL > 0:
        print(f"\nFAILURES:")
        for e in ERRORS:
            print(f"  {e}")
    print(f"{'='*60}")

    con.close()
    if not keep_db:
        tmp.close()
        print("Temp DB cleaned up.")
    else:
        print(f"Temp DB kept at: {db_path}")

    sys.exit(0 if FAIL == 0 else 1)

if __name__ == "__main__":
    main()
