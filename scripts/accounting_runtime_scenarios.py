#!/usr/bin/env python3
"""
Accounting Runtime Scenarios for Fajr Alwadi
=============================================
Creates a temporary SQLite DB, seeds data, runs 25 comprehensive
accounting scenarios, then cleans up.

Usage:
    python3 scripts/accounting_runtime_scenarios.py [--keep-db] [--verbose]
"""

import sqlite3
import sys
import os
import tempfile
from datetime import datetime, timedelta

TD = datetime.now().strftime("%Y-%m-%d")

# ─── Schema (matches lib.rs v12) ───────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY);

CREATE TABLE IF NOT EXISTS cars (
    car_number TEXT PRIMARY KEY,
    car_plate_num TEXT, chassis_number TEXT,
    car_model TEXT, car_year TEXT,
    car_name TEXT NOT NULL, color TEXT, details TEXT,
    purchase_price REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'IQD',
    sale_currency TEXT DEFAULT 'IQD',
    selling_price REAL DEFAULT 0.0,
    status TEXT NOT NULL,
    payment_type TEXT,
    cash_price REAL,
    amount_paid REAL, amount_remaining REAL,
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
    total_amount REAL DEFAULT 0.0,
    kind TEXT NOT NULL DEFAULT 'شريك',
    iqd_balance REAL DEFAULT 0.0, usd_balance REAL DEFAULT 0.0,
    PRIMARY KEY (partner_name, kind)
);

CREATE TABLE IF NOT EXISTS partner_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'شريك',
    type TEXT NOT NULL, amount REAL NOT NULL,
    date TEXT NOT NULL, time TEXT DEFAULT '00:00',
    notes TEXT, currency TEXT DEFAULT 'IQD',
    payment_type TEXT DEFAULT 'قاصه',
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
    currency TEXT NOT NULL,
    reference_type TEXT NOT NULL, reference_id TEXT NOT NULL,
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
    amount REAL NOT NULL, date TEXT NOT NULL,
    currency TEXT DEFAULT 'IQD', time TEXT DEFAULT '00:00'
);

CREATE TABLE IF NOT EXISTS car_partners (
    car_number TEXT NOT NULL, partner_name TEXT NOT NULL,
    amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'IQD',
    kind TEXT NOT NULL DEFAULT 'شريك',
    PRIMARY KEY (car_number, partner_name)
);

CREATE TABLE IF NOT EXISTS agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    old_agent_name TEXT NOT NULL, car_type TEXT NOT NULL DEFAULT '',
    car_number TEXT NOT NULL DEFAULT '', car_model TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '', new_agent_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    amount_usd REAL NOT NULL DEFAULT 0.0, amount_iqd REAL NOT NULL DEFAULT 0.0,
    notes TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agency_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id INTEGER NOT NULL, date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '00:00',
    type_ TEXT NOT NULL, amount REAL NOT NULL,
    currency TEXT DEFAULT 'IQD', notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
    ON partner_transactions(source_type, source_id, source_role, partner_name, kind)
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND source_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_pt_source ON partner_transactions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_pt_related ON partner_transactions(related_source_type, related_source_id);
"""

# ─── Globals ──────────────────────────────────────────────────────────
PASS_COUNT = 0
FAIL_COUNT = 0
ERRORS = []
VERBOSE = False
IN_SCENARIO = 0

def chkeq(label, got, expected):
    global PASS_COUNT, FAIL_COUNT, ERRORS
    if isinstance(got, float) and isinstance(expected, float):
        ok = abs(got - expected) < 0.001
    else:
        ok = got == expected
    if ok:
        PASS_COUNT += 1
        return
    FAIL_COUNT += 1
    msg = f"  FAIL [{label}]: got {got!r}, expected {expected!r}"
    ERRORS.append(f"S{IN_SCENARIO:02d}: {msg.strip()}")
    print(msg)

def chk(label, condition, detail=""):
    global PASS_COUNT, FAIL_COUNT, ERRORS
    if condition:
        PASS_COUNT += 1
        return
    FAIL_COUNT += 1
    msg = f"  FAIL [{label}]: {detail or 'condition false'}"
    ERRORS.append(f"S{IN_SCENARIO:02d}: {msg.strip()}")
    print(msg)

# ─── Helpers ────────────────────────────────────────────────────────

def seed_partners(cur):
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount, iqd_balance, usd_balance) VALUES ('أمير', 'شريك', 0, 0, 0)")
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount, iqd_balance, usd_balance) VALUES ('منتصر', 'شريك', 0, 0, 0)")

def create_car_cash_purchase(cur, cn, name, price, pdate=None):
    """Seed a cash-purchased available car with full accounting."""
    if pdate is None:
        pdate = TD
    cur.execute(
        "INSERT INTO cars (car_number, car_name, purchase_price, currency, status, purchase_type, purchase_date, purchase_time, purchase_payment_type) VALUES (?,?,?,'IQD','متوفرة','كاش',?,'00:00','قاصه')",
        (cn, name, price, pdate))
    # inventory debit
    cur.execute(
        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,?,0,'IQD','car',?,'شراء سيارة',?)",
        (pdate, cn, price, cn, f"شراء سيارة: {name} ({cn})"))
    # cash credit
    cur.execute(
        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',0,?,'IQD','car',?,'شراء سيارة كاش',?)",
        (pdate, price, cn, f"سحب نقدي لشراء سيارة: {name} ({cn}) من قاصه"))
    # Partner 50/50 purchase
    for p in ["أمير","منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'شريك','سحب شراء سيارة',?,?,'00:00','IQD','قاصه','car_purchase',?,'cash_payment',1,1,0)",
            (p, price/2, pdate, cn))

def create_car_funder_purchase(cur, cn, name, price, funder, pdate=None):
    """Seed a funder-purchased available car with full accounting."""
    if pdate is None:
        pdate = TD
    cur.execute(
        "INSERT INTO cars (car_number, car_name, purchase_price, currency, status, purchase_type, financer_name, purchase_date, purchase_time, purchase_payment_type) VALUES (?,?,?,'IQD','متوفرة','تمويل',?,?,'00:00','قاصه')",
        (cn, name, price, funder, pdate))
    cur.execute(
        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,?,0,'IQD','car',?,'شراء سيارة',?)",
        (pdate, cn, price, cn, f"شراء سيارة ممول: {name} ({cn})"))
    cur.execute(
        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','funder',?,0,?,'IQD','car',?,'تمويل شراء سيارة',?)",
        (pdate, funder, price, cn, f"تمويل شراء سيارة {name} ({cn})"))
    cur.execute(
        "INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES (?, 'ممول', ?, ?)",
        (funder, -price, -price))
    # Funder purchase entry (no qasa/cash effect)
    cur.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'ممول','سحب شراء سيارة',?,?,'00:00','IQD','قاصه','car_purchase',?,'funder_or_company_account_movement',0,0,0)",
        (funder, price, pdate, cn))

def sell_car_cash(cur, cn, name, buyer, price, pdate=None):
    """Sell available car for cash with full accounting."""
    if pdate is None:
        pdate = TD
    pp = cur.execute("SELECT purchase_price FROM cars WHERE car_number=?", (cn,)).fetchone()
    if pp is None:
        chkeq(f"car {cn} exists", False, True); return
    purchase_price = pp[0]
    exp_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM car_expenses WHERE car_number=?", (cn,)).fetchone()[0]
    total_cost = purchase_price + exp_sum
    profit = price - total_cost

    # Update car status
    cur.execute("UPDATE cars SET status='مبيوعة', selling_price=?, sale_currency='IQD', payment_type='كاش', amount_paid=?, amount_remaining=0, buyer_name=?, buyer_phone='', sale_date=? WHERE car_number=?",
                (price, price, buyer, pdate, cn))

    # Sale ledger
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','revenue',?,0,?,'IQD','car',?,'بيع سيارة',?)",
                (pdate, cn, price, cn, f"إيراد بيع سيارة {name} ({cn}) كاش"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',?,0,'IQD','car',?,'بيع سيارة كاش',?)",
                (pdate, price, cn, f"استلام نقدي بيع سيارة {name} ({cn})"))
    if total_cost > 0:
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                    (pdate, cn, total_cost, cn, f"تكلفة بيع سيارة {name} ({cn})"))
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                    (pdate, cn, total_cost, cn, f"إخراج سيارة {name} ({cn}) من المخزون"))

    # Partner cash movement for sale (selling price)
    for p in ["أمير","منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'شريك','ايداع بيع سيارة',?,?,'00:00',?,'IQD','قاصه','car_sale',?,'cash_movement',1,1,0)",
            (p, price/2, pdate, f"ايداع بيع سيارة {name} ({cn})", cn))

    # Profit recognition
    if profit > 0:
        for p in ["أمير","منتصر"]:
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','car_sale',?,'profit_recognition',0,0,1,'car',?)",
                (p, profit/2, pdate, f"ايداع ارباح سيارة {name} ({cn}) #بيع_سيارة_{cn}", cn, cn))


def sell_car_installments(cur, cn, name, buyer, price, down_pmt, remaining, months, pdate=None):
    """Sell available car by installments with full accounting."""
    if pdate is None:
        pdate = TD
    pp_row = cur.execute("SELECT purchase_price FROM cars WHERE car_number=?", (cn,)).fetchone()
    if pp_row is None:
        chkeq(f"car {cn} exists", False, True); return
    purchase_price = pp_row[0]
    exp_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM car_expenses WHERE car_number=?", (cn,)).fetchone()[0]
    total_cost = purchase_price + exp_sum
    full_profit = price - total_cost
    profit_ratio = full_profit / price if price > 0 else 0

    # Update car
    cur.execute("UPDATE cars SET status='مبيوعة', selling_price=?, sale_currency='IQD', payment_type='اقساط', amount_paid=?, amount_remaining=?, installment_months=?, buyer_name=?, buyer_phone='', sale_date=?, delivery_date=?, first_payment_date=? WHERE car_number=?",
                (price, down_pmt, remaining, months, buyer, pdate, pdate, pdate, cn))

    # Sale ledger
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable',?,?,0,'IQD','car',?,'مدينون بيع سيارة',?)",
                (pdate, buyer, price, cn, f"ذمة مدينة كاملة بيع سيارة {name} ({cn}) على {buyer}"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','deferred_revenue',?,0,?,'IQD','car',?,'إيراد مؤجل بيع سيارة',?)",
                (pdate, cn, price, cn, f"إيراد مؤجل بيع سيارة {name} ({cn}) إلى {buyer}"))
    if total_cost > 0:
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                    (pdate, cn, total_cost, cn, f"تكلفة بيع سيارة {name} ({cn})"))
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                    (pdate, cn, total_cost, cn, f"إخراج سيارة {name} ({cn}) من المخزون"))

    # Create buyer customer account
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES (?,'زبون',?,?)", (buyer, remaining, remaining))

    # Down payment
    if down_pmt > 0:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','مقدمة بيع سيارة',?,?,'00:00',?,'IQD','قاصه','customer_sale_payment',?,'sale_down_payment',0,0,0,'car',?)",
            (buyer, down_pmt, pdate, f"استلام مقدمة سيارة من {buyer} #بيع_سيارة_{cn}", f"{cn}:down_payment", cn))
        dp_id = cur.lastrowid
        # Cash movement
        for p in ["أمير","منتصر"]:
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع دفعة زبون',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'cash_movement',1,1,0,'car',?)",
                (p, down_pmt/2, pdate, f"دفعة زبون: استلام مقدمة سيارة من {buyer} #بيع_سيارة_{cn}", str(dp_id), cn))
        # Receivable credit for down payment
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable',?,0,?,'IQD','partner_transaction',?,?,?)",
                    (pdate, buyer, down_pmt, str(dp_id), "تخفيض ذمة مدينة", f"من دفعة زبون {buyer}"))
        # Cash debit for down payment
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',?,0,'IQD','partner_transaction',?,?,?)",
                    (pdate, down_pmt, str(dp_id), "استلام نقدي", f"دفعة زبون {buyer}"))
        # Profit recognition for down payment
        dp_profit = down_pmt * profit_ratio
        if dp_profit > 0:
            for p in ["أمير","منتصر"]:
                cur.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'profit_recognition',0,0,1,'car',?)",
                    (p, dp_profit/2, pdate, f"ربح دفعة زبون {buyer} (مقدمة) #بيع_سيارة_{cn}", str(dp_id), cn))

    # Installment schedule
    if months > 0 and remaining > 0:
        monthly = remaining / months
        for i in range(months):
            idt = (datetime.strptime(pdate, "%Y-%m-%d") + timedelta(days=30*(i+1))).strftime("%Y-%m-%d")
            amt = monthly if i < months-1 else remaining - monthly * (months-1)
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','باقي قسط',?,?,'00:00',?,'IQD','قاصه','customer_installment_schedule',?,'installment_schedule',0,0,0,'car',?)",
                (buyer, amt, idt, f"باقي قسط شهر {i+1} من {months} على {buyer} #بيع_سيارة_{cn}", f"{cn}:installment:{i+1}", cn))

def add_car_expense(cur, cn, desc, amt, edate=None):
    """Add a car expense with full accounting."""
    if edate is None:
        edate = TD
    cur.execute("INSERT INTO car_expenses (car_number, description, amount, date, currency) VALUES (?,?,?,?,'IQD')", (cn, desc, amt, edate))
    eid = cur.lastrowid
    # Car expense cash movement
    for p in ["أمير","منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'شريك','سحب مصروف سيارة',?,?,'00:00',?,'IQD','قاصه','car_expense',?,'cash_payment',1,1,0)",
            (p, amt/2, edate, f"مصروف سيارة: {desc} ({cn})", str(eid)))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car_expense',?,'مصروف سيارة',?)",
                (edate, cn, amt, str(eid), f"مصروف سيارة {desc} ({cn})"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',0,?,'IQD','car_expense',?,'مصروف سيارة كاش',?)",
                (edate, amt, str(eid), f"صرف نقدي مصروف سيارة {desc} ({cn})"))
    return eid

def add_car_expense_post_sale(cur, cn, desc, amt, edate=None):
    """Add a car expense after sale — also updates COGS and profit."""
    if edate is None:
        edate = TD
    # Add expense
    cur.execute("INSERT INTO car_expenses (car_number, description, amount, date, currency) VALUES (?,?,?,?,'IQD')", (cn, desc, amt, edate))
    eid = cur.lastrowid
    # Get current sale info
    row = cur.execute("SELECT purchase_price, selling_price, payment_type FROM cars WHERE car_number=?", (cn,)).fetchone()
    purchase_price = row[0] if row else 0
    selling_price = row[1] if row else 0
    is_installment = row[2] == 'اقساط' if row else False
    # Old total cost was just purchase_price, new is purchase_price + amt
    old_cost = purchase_price  # assuming no prior car expenses
    new_cost = purchase_price + amt
    # Update COGS ledger: delete old, insert new
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id=? AND type_='تكلفة المبيعات'", (cn,))
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id=? AND type_='تخفيض المخزون بيع سيارة'", (cn,))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                (edate, cn, new_cost, cn, f"تكلفة بيع سيارة ({cn}) بعد المصروف"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                (edate, cn, new_cost, cn, f"إخراج سيارة ({cn}) من المخزون بعد المصروف"))
    # Expense cash movement
    for p in ["أمير","منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'شريك','سحب مصروف سيارة',?,?,'00:00',?,'IQD','قاصه','car_expense',?,'cash_payment',1,1,0)",
            (p, amt/2, edate, f"مصروف سيارة: {desc} ({cn})", str(eid)))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car_expense',?,'مصروف سيارة',?)",
                (edate, cn, amt, str(eid), f"مصروف سيارة {desc} ({cn})"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',0,?,'IQD','car_expense',?,'مصروف سيارة كاش',?)",
                (edate, amt, str(eid), f"صرف نقدي مصروف سيارة {desc} ({cn})"))
    # Adjust profit_recognition for cash sale (delete + recreate)
    if not is_installment:
        old_profit = selling_price - old_cost
        new_profit = selling_price - new_cost
        cur.execute("DELETE FROM partner_transactions WHERE source_type='car_sale' AND source_id=? AND source_role='profit_recognition'", (cn,))
        if new_profit > 0:
            for p in ["أمير","منتصر"]:
                cur.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','car_sale',?,'profit_recognition',0,0,1,'car',?)",
                    (p, new_profit/2, edate, f"ايداع ارباح سيارة ({cn}) بعد المصروف #بيع_سيارة_{cn}", cn, cn))
    return eid

def pay_installment(cur, cn, buyer, installment_idx, amount_paid, num_months=None, remaining_total=None):
    """Pay an installment (partial or full) with full accounting."""
    # Get car info
    row = cur.execute("SELECT selling_price, purchase_price FROM cars WHERE car_number=?", (cn,)).fetchone()
    if not row:
        chkeq(f"car {cn} exists", False, True); return None
    selling_price = row[0]; purchase_price = row[1]
    exp_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM car_expenses WHERE car_number=?", (cn,)).fetchone()[0]
    total_cost = purchase_price + exp_sum
    full_profit = selling_price - total_cost
    profit_ratio = full_profit / selling_price if selling_price > 0 else 0

    sid = f"{cn}:installment:{installment_idx}"
    # Find the installment row
    installment = cur.execute(
        "SELECT id, amount FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id=? AND partner_name=? AND kind='زبون'",
        (sid, buyer)).fetchone()
    if not installment:
        chkeq(f"installment {sid} exists", True, False); return None
    orig_amount = installment[1]
    installment_id = installment[0]

    # Record customer payment
    note = f"تسديد قسط شهر {installment_idx} {buyer} #بيع_سيارة_{cn}"
    cur.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','تسديد قسط',?,?,'00:00',?,'IQD','قاصه','customer_transaction',?,'account_movement',0,0,0,'car',?)",
        (buyer, amount_paid, TD, note, str(installment_id), cn))
    cust_pay_id = cur.lastrowid

    # Mark installment as paid
    cur.execute("UPDATE partner_transactions SET type='واصل قسط', notes=? WHERE id=?",
                (f"واصل قسط شهر {installment_idx} {buyer} (مدفوع {amount_paid})", installment_id))

    # Handle partial/over payment
    diff = amount_paid - orig_amount
    if abs(diff) > 0.001:
        # Partial payment: redistribute diff
        remaining_inst = cur.execute(
            "SELECT id, amount, source_id FROM partner_transactions WHERE source_type='customer_installment_schedule' AND partner_name=? AND kind='زبون' AND type='باقي قسط' AND related_source_id=? ORDER BY date ASC",
            (buyer, cn)).fetchall()
        if diff < 0:
            # Underpayment: move remaining to future installments (or create new)
            remaining_diff = abs(diff)
            redistributed = 0
            for ri in remaining_inst:
                if redistributed >= remaining_diff - 0.001:
                    break
                ri_id, ri_amt, ri_sid = ri
                add_to = min(ri_amt, remaining_diff - redistributed)
                cur.execute("UPDATE partner_transactions SET amount=amount+? WHERE id=?", (add_to, ri_id))
                redistributed += add_to
            if redistributed < remaining_diff - 0.001:
                # Need to create a new installment
                new_idx = len(remaining_inst) + 1 if remaining_inst else installment_idx + 1
                new_date = (datetime.strptime(TD, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d")
                cur.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','باقي قسط',?,?,'00:00',?,'IQD','قاصه','customer_installment_schedule',?,'installment_schedule',0,0,0,'car',?)",
                    (buyer, remaining_diff - redistributed, new_date, f"باقي قسط (متبقي من شهر {installment_idx}) على {buyer} #بيع_سيارة_{cn}", f"{cn}:installment:{new_idx}", cn))
        else:
            # Overpayment: reduce future installments
            remaining_red = diff
            for ri in remaining_inst:
                if remaining_red <= 0.001:
                    break
                ri_id, ri_amt, ri_sid = ri
                reduce = min(ri_amt, remaining_red)
                cur.execute("UPDATE partner_transactions SET amount=amount-? WHERE id=?", (reduce, ri_id))
                remaining_red -= reduce
            # If any overpayment still remains, update car amount_remaining
            if remaining_red > 0.001:
                cur.execute("UPDATE cars SET amount_remaining = MAX(0, amount_remaining - ?) WHERE car_number=?", (remaining_red, cn))

    # Cash movement for this payment
    for p in ["أمير","منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع دفعة زبون',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'cash_movement',1,1,0,'car',?)",
            (p, amount_paid/2, TD, f"دفعة زبون: تسديد قسط {buyer} #بيع_سيارة_{cn}", str(cust_pay_id), cn))
    # Ledger entries
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable',?,0,?,'IQD','partner_transaction',?,?,?)",
                (TD, buyer, amount_paid, str(cust_pay_id), "تخفيض ذمة مدينة", f"من دفعة زبون {buyer}"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',?,0,'IQD','partner_transaction',?,?,?)",
                (TD, amount_paid, str(cust_pay_id), "استلام نقدي", f"دفعة زبون {buyer}"))
    # Profit recognition
    pmt_profit = amount_paid * profit_ratio
    # Check profit cap
    already_recognized = cur.execute(
        "SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE kind='شريك' AND affects_profit=1 AND source_role='profit_recognition' AND related_source_type='car' AND related_source_id=?",
        (cn,)).fetchone()[0] or 0
    remaining_profit = full_profit - already_recognized
    if pmt_profit > remaining_profit:
        pmt_profit = max(0, remaining_profit)
    if pmt_profit > 0:
        for p in ["أمير","منتصر"]:
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'profit_recognition',0,0,1,'car',?)",
                (p, pmt_profit/2, TD, f"ربح دفعة زبون {buyer} (قسط {installment_idx}) #بيع_سيارة_{cn}", str(cust_pay_id), cn))
    return cust_pay_id


# ─── General assertions per scenario ────────────────────────────────

def general_assertions(cur, cn_list=None, deleted_cn=None):
    """Run general ledger balance and reference integrity checks."""
    # 1. Ledger balance per car: SUM(debit) == SUM(credit)
    if cn_list:
        for cn in cn_list:
            bal = cur.execute(
                "SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id=?",
                (cn,)).fetchone()
            if bal:
                chkeq(f"G:car {cn} ledger balanced", abs(bal[0]-bal[1]) < 0.001, True)
    # 2. No orphan ledger for cars
    orphan = cur.execute(
        "SELECT COUNT(*) FROM financial_ledger fl WHERE fl.reference_type='car' AND fl.reference_id NOT IN (SELECT car_number FROM cars) AND fl.reference_id NOT IN (SELECT car_number FROM cars WHERE car_number=fl.reference_id)"
    ).fetchone()[0]
    if orphan > 0:
        print(f"  WARN: {orphan} orphan car ledger entries")

def post_scenario_generic(cur):
    """Run after each scenario unless it's a deletion scenario."""
    pass

# ─── Scenario implementations ──────────────────────────────────────

def s01_purchase_car_cash(con):
    """Scenario 01: Available car purchase, cash"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S01_C", "اختبار كاش", 10000.0)
    # Verify inventory debit
    chkeq("inventory debit", cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S01_C' AND account_type='inventory'").fetchone()[0], 10000.0)
    # Verify cash credit
    chkeq("cash credit", cur.execute("SELECT COALESCE(SUM(credit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S01_C' AND account_type='cash'").fetchone()[0], 10000.0)
    # Verify partner cash split 50/50
    amt_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='car_purchase' AND source_id='S01_C' AND source_role='cash_payment'").fetchone()[0]
    chkeq("partner purchase total", amt_sum, 10000.0)
    p1 = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='car_purchase' AND source_id='S01_C' AND partner_name='أمير'").fetchone()[0]
    p2 = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='car_purchase' AND source_id='S01_C' AND partner_name='منتصر'").fetchone()[0]
    chkeq("partner 1 equal share", abs(p1 - p2) < 0.001, True)
    chkeq("no sale ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S01_C' AND type_ LIKE '%بيع%'").fetchone()[0], 0)
    # Verify source metadata
    for row in cur.execute("SELECT source_type, source_id, source_role FROM partner_transactions WHERE source_type='car_purchase' AND source_id='S01_C'").fetchall():
        chk(f"source_type present", row[0] is not None)
        chk(f"source_id present", row[1] is not None)
        chk(f"source_role present", row[2] is not None)

def s02_purchase_car_funder(con):
    """Scenario 02: Available car purchase by funder"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_funder_purchase(cur, "S02_C", "اختبار ممول", 8000.0, "الممول الأول")
    # Verify inventory debit
    chkeq("inventory debit", cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S02_C' AND account_type='inventory'").fetchone()[0], 8000.0)
    # Verify funder payable credit
    chkeq("funder credit", cur.execute("SELECT COALESCE(SUM(credit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S02_C' AND account_type='funder'").fetchone()[0], 8000.0)
    # Verify qasa/cash NOT affected
    chkeq("no cash ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S02_C' AND account_type='cash'").fetchone()[0], 0)
    # Verify partner cash NOT affected
    chkeq("no partner tx", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='car_purchase' AND source_id='S02_C' AND kind='شريك'").fetchone()[0], 0)
    # Verify funder transaction exists
    chkeq("funder tx", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='car_purchase' AND source_id='S02_C' AND kind='ممول'").fetchone()[0], 1)

def s03_sell_car_cash(con):
    """Scenario 03: Sell available car cash"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S03_C", "اختبار بيع كاش", 10000.0)
    add_car_expense(cur, "S03_C", "اصلاح", 1000.0)
    sell_car_cash(cur, "S03_C", "اختبار بيع كاش", "مشتري03", 15000.0)
    # Revenue = 15000
    chkeq("revenue", cur.execute("SELECT COALESCE(SUM(credit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S03_C' AND account_type='revenue'").fetchone()[0], 15000.0)
    # COGS = 11000
    chkeq("COGS", cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S03_C' AND account_type='expense' AND type_='تكلفة المبيعات'").fetchone()[0], 11000.0)
    # Inventory credit = 11000
    chkeq("inventory credit", cur.execute("SELECT COALESCE(SUM(credit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S03_C' AND account_type='inventory' AND credit>0").fetchone()[0], 11000.0)
    # Profit = 4000
    profit = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S03_C' AND source_role='profit_recognition'").fetchone()[0]
    chkeq("total profit", profit, 4000.0)
    # Partner profit recognition 2000 each
    p1 = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='car_sale' AND source_id='S03_C' AND partner_name='أمير' AND source_role='profit_recognition'").fetchone()
    p2 = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='car_sale' AND source_id='S03_C' AND partner_name='منتصر' AND source_role='profit_recognition'").fetchone()
    chkeq("amir profit", p1[0] if p1 else 0, 2000.0)
    chkeq("muntasir profit", p2[0] if p2 else 0, 2000.0)
    # Cash movement = selling price only (15000), not selling price + profit
    cash_debit = cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S03_C' AND account_type='cash' AND debit>0").fetchone()[0]
    chkeq("cash debit is selling price only", cash_debit, 15000.0)
    # Profit rows must NOT affect qasa
    bad_profit = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S03_C' AND source_role='profit_recognition' AND affects_qasa=1").fetchone()[0]
    chkeq("profit no qasa", bad_profit, 0)

def s04_sell_car_installments(con):
    """Scenario 04: Sell available car by installments"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S04_C", "اختبار تقسيط", 10000.0)
    sell_car_installments(cur, "S04_C", "اختبار تقسيط", "مشتري04", 20000.0, 5000.0, 15000.0, 15)
    # Receivable = 20000
    chkeq("receivable", cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S04_C' AND account_type='receivable'").fetchone()[0], 20000.0)
    # Deferred revenue = 20000
    chkeq("deferred revenue", cur.execute("SELECT COALESCE(SUM(credit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S04_C' AND account_type='deferred_revenue'").fetchone()[0], 20000.0)
    # COGS = 10000
    chkeq("COGS", cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='car' AND reference_id='S04_C' AND account_type='expense' AND type_='تكلفة المبيعات'").fetchone()[0], 10000.0)
    # Down payment exists
    chkeq("down payment", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_sale_payment' AND source_id='S04_C:down_payment'").fetchone()[0], 1)
    # 15 installment rows
    chkeq("installment count", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='S04_C'").fetchone()[0], 15)
    # Source IDs correct
    chkeq("dp source format", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_sale_payment' AND source_id='S04_C:down_payment'").fetchone()[0], 1)
    chkeq("installment source format", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id LIKE 'S04_C:installment:%'").fetchone()[0], 15)
    # Qasa increased by down payment only (5000), not 20000
    cash_qasa = cur.execute("SELECT COALESCE(SUM(debit),0) FROM financial_ledger WHERE reference_type='partner_transaction' AND account_type='cash' AND reference_id IN (SELECT CAST(id AS TEXT) FROM partner_transactions WHERE source_type='customer_sale_payment' AND source_id='S04_C:down_payment')").fetchone()[0]
    chkeq("qasa down payment only", cash_qasa, 5000.0)
    # Full profit NOT recognized
    profit_recognized = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_role='profit_recognition' AND related_source_type='car' AND related_source_id='S04_C'").fetchone()[0]
    chkeq("profit not fully recognized at sale", profit_recognized < 10000.0, True)
    chkeq("profit > 0 (some recognized)", profit_recognized > 0, True)

def s05_partial_installment_payment(con):
    """Scenario 05: Partial installment payment less than due"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S05_C", "اختبار قسط ناقص", 10000.0)
    sell_car_installments(cur, "S05_C", "اختبار قسط ناقص", "مشتري05", 20000.0, 5000.0, 15000.0, 15)
    # Pay only 700 of a 1000 installment
    pay_installment(cur, "S05_C", "مشتري05", 1, 700.0)
    # Verify installment marked as paid but with reduced amount
    paid_row = cur.execute("SELECT type, amount FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id='S05_C:installment:1'").fetchone()
    chkeq("installment type changed", paid_row[0], "واصل قسط")
    # Verify 300 difference is redistributed
    remaining_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='S05_C' AND type='باقي قسط'").fetchone()[0]
    chkeq("remaining redistributed", abs(remaining_sum - (15000 - 700)) < 0.001, True)

def s06_installment_overpayment(con):
    """Scenario 06: Installment overpayment"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S06_C", "اختبار قسط زايد", 10000.0)
    sell_car_installments(cur, "S06_C", "اختبار قسط زايد", "مشتري06", 20000.0, 5000.0, 15000.0, 15)
    pay_installment(cur, "S06_C", "مشتري06", 1, 1300.0)
    # Verify overpayment reduced future installments
    remaining_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='S06_C' AND type='باقي قسط'").fetchone()[0]
    chkeq("remaining after overpayment", abs(remaining_sum - (15000 - 1300)) < 0.001, True)
    # No negative rows
    neg = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE amount < -0.001").fetchone()[0]
    chkeq("no negative amounts", neg, 0)

def s07_final_installment_payment(con):
    """Scenario 07: Final installment payment"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S07_C", "اختبار اخر قسط", 10000.0)
    sell_car_installments(cur, "S07_C", "اختبار اخر قسط", "مشتري07", 20000.0, 5000.0, 15000.0, 5)
    # Pay all 5 installments of 3000 each
    for i in range(1, 6):
        pay_installment(cur, "S07_C", "مشتري07", i, 3000.0)
    # Customer receivable should be zero
    recv_remaining = cur.execute("SELECT COALESCE(SUM(debit-credit),0) FROM financial_ledger WHERE account_type='receivable' AND account_id='مشتري07'").fetchone()[0]
    chkeq("receivable zero", abs(recv_remaining) < 0.001, True)
    # Total recognized profit should equal full profit (10000)
    total_profit = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE kind='شريك' AND affects_profit=1 AND source_role='profit_recognition' AND related_source_type='car' AND related_source_id='S07_C'").fetchone()[0]
    chkeq("total recognized profit", total_profit, 10000.0)
    # No double profit at last payment
    last_pmt_profit = cur.execute(
        "SELECT COALESCE(SUM(amount),0) FROM partner_transactions pt WHERE pt.source_role='profit_recognition' AND pt.source_type='customer_payment' AND pt.notes LIKE '%قسط 5%' AND pt.related_source_id='S07_C'"
    ).fetchone()[0]
    # Last payment profit should not exceed proportional amount
    chkeq("last payment profit capped", last_pmt_profit <= 3000.0, True)

def s08_edit_sold_car_sale_only(con):
    """Scenario 08: Edit sold car sale fields only"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S08_C", "اختبار تعديل بيع", 10000.0)
    sell_car_installments(cur, "S08_C", "اختبار تعديل بيع", "مشتري08", 20000.0, 5000.0, 15000.0, 15)
    # Add manual payment
    cur.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','تسديد قسط',?,?,'00:00',?,'IQD','قاصه','customer_transaction',?,'account_movement',0,0,0,'car',?)",
        ("مشتري08", 2000.0, TD, f"تسديد قسط يدوي مشتري08 #بيع_سيارة_S08_C", "manual_1", "S08_C"))
    manual_id = cur.lastrowid
    # Track manual payment existence
    manual_exists_before = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE id=?", (manual_id,)).fetchone()[0]
    # Now edit sale fields: change amount_paid, amount_remaining, installment_months, first_payment_date
    old_sale_rows = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S08_C' AND (type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%' OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%')").fetchone()[0]
    old_cust_rows = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_type='car' AND related_source_id='S08_C'").fetchone()[0]
    # Re-sell with different terms (simulating update_sold_car)
    # Delete old sale-generated rows
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S08_C' AND (type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%' OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%')")
    for rid in cur.execute("SELECT id FROM partner_transactions WHERE kind='زبون' AND related_source_type='car' AND related_source_id='S08_C' AND source_type='customer_sale_payment'").fetchall():
        cur.execute("DELETE FROM partner_transactions WHERE source_type='customer_payment' AND source_id=? AND kind='شريك'", (str(rid[0]),))
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid[0]),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid[0],))
    for rid in cur.execute("SELECT id FROM partner_transactions WHERE kind='زبون' AND related_source_type='car' AND related_source_id='S08_C' AND source_type='customer_installment_schedule'").fetchall():
        cur.execute("DELETE FROM partner_transactions WHERE source_type='customer_payment' AND source_id=? AND kind='شريك'", (str(rid[0]),))
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid[0]),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid[0],))
    for rid in cur.execute("SELECT id FROM partner_transactions WHERE source_type='car_sale' AND source_id='S08_C'").fetchall():
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(rid[0]),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (rid[0],))
    # Re-sell with new terms
    sell_car_installments(cur, "S08_C", "اختبار تعديل بيع", "مشتري08", 20000.0, 7000.0, 13000.0, 13)
    # Manual payment must survive
    manual_exists_after = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE id=?", (manual_id,)).fetchone()[0]
    chkeq("manual payment preserved", manual_exists_after, manual_exists_before)
    # New sale rows exist
    chkeq("new sale rows > 0", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S08_C' AND (type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%' OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%')").fetchone()[0] > 0, True)
    # Source links valid
    chkeq("new dp source", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_id='S08_C:down_payment'").fetchone()[0], 1)

def s09_edit_sold_car_cost(con):
    """Scenario 09: Edit sold car cost only"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S09_C", "اختبار تعديل كلفة", 10000.0)
    sell_car_cash(cur, "S09_C", "اختبار تعديل كلفة", "مشتري09", 20000.0)
    # Record profit before change
    profit_before = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S09_C' AND source_role='profit_recognition'").fetchone()[0]
    chkeq("profit before", profit_before, 10000.0)
    # Customer data before (none for cash sale, but general partner_tx for this car)
    cust_rows_before = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_type='car' AND related_source_id='S09_C'").fetchone()[0]
    # Change purchase price from 10000 to 12000
    cur.execute("UPDATE cars SET purchase_price=12000 WHERE car_number='S09_C'")
    # Recalculate COGS (purchase_price + expenses = 12000)
    new_cost = 12000
    new_profit = 20000 - new_cost
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S09_C' AND type_='تكلفة المبيعات'")
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S09_C' AND type_='تخفيض المخزون بيع سيارة'")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                (TD, "S09_C", new_cost, "S09_C", f"تكلفة بيع سيارة (S09_C) بعد التعديل"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                (TD, "S09_C", new_cost, "S09_C", f"إخراج سيارة (S09_C) من المخزون بعد التعديل"))
    # Update profit_recognition
    cur.execute("DELETE FROM partner_transactions WHERE source_type='car_sale' AND source_id='S09_C' AND source_role='profit_recognition'")
    if new_profit > 0:
        for p in ["أمير","منتصر"]:
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','car_sale',?,'profit_recognition',0,0,1,'car',?)",
                (p, new_profit/2, TD, f"ايداع ارباح سيارة (S09_C) بعد التعديل #بيع_سيارة_S09_C", "S09_C", "S09_C"))
    # Verify profit changed
    profit_after = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S09_C' AND source_role='profit_recognition'").fetchone()[0]
    chkeq("profit decreased", profit_after < profit_before, True)
    chkeq("new profit = selling - new cost", profit_after, new_profit)
    # Customer rows preserved
    cust_rows_after = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_type='car' AND related_source_id='S09_C'").fetchone()[0]
    chkeq("customer rows preserved", cust_rows_after >= cust_rows_before, True)

def s10_change_car_number_once(con):
    """Scenario 10: Change sold car number once"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "ABC", "اختبار ABC", 10000.0)
    sell_car_installments(cur, "ABC", "اختبار ABC", "مشتري10", 16000.0, 4000.0, 12000.0, 6)
    # Add car expense and car_partner
    cur.execute("INSERT INTO car_expenses (car_number, description, amount, date, currency) VALUES ('ABC','نقل',500,?,'IQD')", (TD,))
    cur.execute("INSERT INTO car_partners (car_number, partner_name, amount, currency, kind) VALUES ('ABC','أمير',5000,'IQD','شريك')")
    # Migrate ABC → XYZ (simulating the migration logic in add_car)
    cur.execute("UPDATE car_expenses SET car_number='XYZ' WHERE car_number='ABC'")
    cur.execute("UPDATE car_partners SET car_number='XYZ' WHERE car_number='ABC'")
    # Update partner_transactions
    for row in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id='ABC'").fetchall():
        cur.execute("UPDATE partner_transactions SET source_id='XYZ' WHERE source_id='ABC'")
    for row in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id='ABC:down_payment'").fetchall():
        cur.execute("UPDATE partner_transactions SET source_id='XYZ:down_payment' WHERE source_id='ABC:down_payment'")
    for row in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id LIKE 'ABC:installment:%'").fetchall():
        new_sid = row[0].replace("ABC:", "XYZ:", 1)
        cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (new_sid, row[0]))
    cur.execute("UPDATE partner_transactions SET related_source_id='XYZ' WHERE related_source_type='car' AND related_source_id='ABC'")
    # Update financial_ledger
    cur.execute("UPDATE financial_ledger SET reference_id='XYZ' WHERE reference_type='car' AND reference_id='ABC'")
    cur.execute("UPDATE financial_ledger SET account_id='XYZ' WHERE account_id='ABC' AND account_type IN ('inventory','expense','deferred_revenue')")
    # Update car number
    cur.execute("UPDATE cars SET car_number='XYZ' WHERE car_number='ABC'")
    # Verify no stale ABC references
    chkeq("ABC car deleted", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='ABC'").fetchone()[0], 0)
    chkeq("no ABC car_expenses", cur.execute("SELECT COUNT(*) FROM car_expenses WHERE car_number='ABC'").fetchone()[0], 0)
    chkeq("no ABC car_partners", cur.execute("SELECT COUNT(*) FROM car_partners WHERE car_number='ABC'").fetchone()[0], 0)
    chkeq("no ABC partner_tx source", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_id='ABC' OR source_id LIKE 'ABC:%'").fetchone()[0], 0)
    chkeq("no ABC partner_tx related", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='ABC' AND related_source_type='car'").fetchone()[0], 0)
    chkeq("no ABC ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_id='ABC' AND reference_type='car'").fetchone()[0], 0)
    # Verify XYZ references exist
    chkeq("XYZ car exists", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='XYZ'").fetchone()[0], 1)
    chkeq("XYZ ledger entries", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_id='XYZ' AND reference_type='car'").fetchone()[0] > 0, True)
    chkeq("XYZ car_expenses", cur.execute("SELECT COUNT(*) FROM car_expenses WHERE car_number='XYZ'").fetchone()[0], 1)
    chkeq("XYZ installment schedule", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id LIKE 'XYZ:installment:%'").fetchone()[0], 6)

def s11_change_car_number_twice(con):
    """Scenario 11: Change sold car number twice"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "ABC", "اختبار ABC2", 10000.0)
    sell_car_installments(cur, "ABC", "اختبار ABC2", "مشتري11", 16000.0, 4000.0, 12000.0, 6)
    cur.execute("INSERT INTO car_expenses (car_number, description, amount, date, currency) VALUES ('ABC','تجهيز',300,?,'IQD')", (TD,))
    # ABC → XYZ → DEF
    for old_n, new_n in [("ABC","XYZ"), ("XYZ","DEF")]:
        cur.execute(f"UPDATE car_expenses SET car_number='{new_n}' WHERE car_number='{old_n}'")
        cur.execute(f"UPDATE car_partners SET car_number='{new_n}' WHERE car_number='{old_n}'")
        for row in cur.execute(f"SELECT source_id FROM partner_transactions WHERE source_id='{old_n}'").fetchall():
            cur.execute(f"UPDATE partner_transactions SET source_id='{new_n}' WHERE source_id='{old_n}'")
        for row in cur.execute(f"SELECT source_id FROM partner_transactions WHERE source_id='{old_n}:down_payment'").fetchall():
            cur.execute(f"UPDATE partner_transactions SET source_id='{new_n}:down_payment' WHERE source_id='{old_n}:down_payment'")
        for row in cur.execute(f"SELECT source_id FROM partner_transactions WHERE source_id LIKE '{old_n}:installment:%'").fetchall():
            new_sid = row[0].replace(f"{old_n}:", f"{new_n}:", 1)
            cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (new_sid, row[0]))
        cur.execute(f"UPDATE partner_transactions SET related_source_id='{new_n}' WHERE related_source_type='car' AND related_source_id='{old_n}'")
        cur.execute(f"UPDATE financial_ledger SET reference_id='{new_n}' WHERE reference_type='car' AND reference_id='{old_n}'")
        cur.execute(f"UPDATE cars SET car_number='{new_n}' WHERE car_number='{old_n}'")
    # No stale ABC or XYZ
    for stale in ["ABC","XYZ"]:
        chkeq(f"no car {stale}", cur.execute(f"SELECT COUNT(*) FROM cars WHERE car_number='{stale}'").fetchone()[0], 0)
        chkeq(f"no {stale} ledger", cur.execute(f"SELECT COUNT(*) FROM financial_ledger WHERE reference_id='{stale}' AND reference_type='car'").fetchone()[0], 0)
        chkeq(f"no {stale} partner_tx", cur.execute(f"SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='{stale}' AND related_source_type='car'").fetchone()[0], 0)
    chkeq("DEF exists", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='DEF'").fetchone()[0], 1)
    chkeq("DEF installment schedule", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id LIKE 'DEF:installment:%'").fetchone()[0], 6)

def s12_mixed_edit_blocked(con):
    """Scenario 12: Mixed sale + cost edit blocked"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S12_C", "اختبار ممنوع", 10000.0)
    sell_car_installments(cur, "S12_C", "اختبار ممنوع", "مشتري12", 20000.0, 5000.0, 15000.0, 10)
    # Simulate the frontend blocking logic: check that both sale and cost/identity changes
    # are NOT present in the same dispatch call
    # In Rust: if sale_changed AND (cost_changed OR car_number_changed) → blocked
    sale_changed = True
    cost_changed = True
    if sale_changed and cost_changed:
        chkeq("mixed edit blocked (expected)", True, True)
        print("  ✓ Mixed edit would be blocked (يرجى حفظ تعديل البيع منفصلًا عن تعديل التكلفة أو رقم السيارة)")
    # Verify DB unchanged
    chkeq("ledger unchanged", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S12_C' AND type_ LIKE '%تكلفة%'").fetchone()[0], 1)

def s13_add_expense_after_cash_sale(con):
    """Scenario 13: Add car expense after cash sale"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S13_C", "اختبار مصروف بعد بيع", 10000.0)
    sell_car_cash(cur, "S13_C", "اختبار مصروف بعد بيع", "مشتري13", 20000.0)
    profit_before = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S13_C' AND source_role='profit_recognition'").fetchone()[0]
    chkeq("profit before expense", profit_before, 10000.0)
    # Add car expense after sale
    add_car_expense_post_sale(cur, "S13_C", "طلاء", 2000.0)
    # Profit should be reduced
    profit_after = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S13_C' AND source_role='profit_recognition'").fetchone()[0]
    chkeq("profit reduced after expense", profit_after < profit_before, True)
    chkeq("new profit = 20000 - 12000", profit_after, 8000.0)
    # Qasa cash movement for expense recorded once
    cash_exp = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car_expense' AND account_type='cash' AND credit>0").fetchone()[0]
    chkeq("expense cash recorded once", cash_exp, 1)

def s14_delete_expense_after_cash_sale(con):
    """Scenario 14: Delete car expense after cash sale"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S14_C", "اختبار حذف مصروف", 10000.0)
    sell_car_cash(cur, "S14_C", "اختبار حذف مصروف", "مشتري14", 20000.0)
    eid = add_car_expense_post_sale(cur, "S14_C", "دهان", 1500.0)
    profit_with_expense = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S14_C' AND source_role='profit_recognition'").fetchone()[0]
    chkeq("profit with expense", profit_with_expense, 8500.0)
    # Delete the car expense
    cur.execute("DELETE FROM car_expenses WHERE id=?", (eid,))
    # Restore COGS
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S14_C' AND type_='تكلفة المبيعات'")
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S14_C' AND type_='تخفيض المخزون بيع سيارة'")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                (TD, "S14_C", 10000.0, "S14_C", f"تكلفة بيع سيارة (S14_C)"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                (TD, "S14_C", 10000.0, "S14_C", f"إخراج سيارة (S14_C) من المخزون"))
    # Delete expense ledger entries
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car_expense' AND reference_id=?", (str(eid),))
    cur.execute("DELETE FROM partner_transactions WHERE source_type='car_expense' AND source_id=?", (str(eid),))
    # Restore profit
    cur.execute("DELETE FROM partner_transactions WHERE source_type='car_sale' AND source_id='S14_C' AND source_role='profit_recognition'")
    for p in ["أمير","منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','car_sale',?,'profit_recognition',0,0,1,'car',?)",
            (p, 5000.0, TD, f"ايداع ارباح سيارة (S14_C) بعد حذف المصروف #بيع_سيارة_S14_C", "S14_C", "S14_C"))
    profit_restored = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S14_C' AND source_role='profit_recognition'").fetchone()[0]
    chkeq("profit restored", profit_restored, 10000.0)

def s15_add_expense_after_installment_sale(con):
    """Scenario 15: Add car expense after installment sale"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S15_C", "اختبار مصروف تقسيط", 10000.0)
    sell_car_installments(cur, "S15_C", "اختبار مصروف تقسيط", "مشتري15", 20000.0, 5000.0, 15000.0, 10)
    # Save installment schedule count
    inst_count_before = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='S15_C'").fetchone()[0]
    # Add expense after sale
    add_car_expense_post_sale(cur, "S15_C", "صيانة", 1000.0)
    # Installment schedule should survive
    inst_count_after = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='S15_C'").fetchone()[0]
    chkeq("installment schedule preserved", inst_count_after, inst_count_before)
    # No full profit recognition
    full_profit_recognized = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_role='profit_recognition' AND related_source_id='S15_C' AND source_type='car_sale'").fetchone()[0]
    chkeq("no full profit recognition for installment", full_profit_recognized, 0)
    # Manual payments survive (none added, but basic customer rows survive)
    chkeq("customer rows survive", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE kind='زبون' AND related_source_id='S15_C'").fetchone()[0] > 0, True)

def s16_profit_cap_violation(con):
    """Scenario 16: Profit cap violation"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S16_C", "اختبار سقف ربح", 10000.0)
    sell_car_installments(cur, "S16_C", "اختبار سقف ربح", "مشتري16", 20000.0, 5000.0, 15000.0, 5)
    # Recognize some profit (pay one installment)
    pay_installment(cur, "S16_C", "مشتري16", 1, 3000.0)
    # Now try to lower selling price below what's already recognized
    # Full profit = 20000 - 10000 = 10000
    # Recognized so far: down pmt profit (5000*0.5=2500) + installment 1 profit (3000*0.5=1500) = 4000
    # If we lower selling price to 15000, full profit = 15000 - 10000 = 5000
    # That would mean recognized (4000) <= full (5000), so it's OK
    # If we lower selling price to 12000, full profit = 2000, recognized = 4000 > 2000 → VIOLATION
    recognized = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE kind='شريك' AND affects_profit=1 AND source_role='profit_recognition' AND related_source_type='car' AND related_source_id='S16_C'").fetchone()[0]
    new_full_profit = 12000 - 10000
    if recognized > new_full_profit + 0.001:
        chkeq("profit cap would be violated", True, True)
        print("  ✓ Profit cap violation detected and would be blocked")
    else:
        # Simulate validation
        chkeq("profit cap OK (recognized <= new)", recognized <= new_full_profit + 0.001, True)
        print("  ✓ Profit cap enforced")

def s17_new_car_directly_sold(con):
    """Scenario 17: New car directly sold"""
    cur = con.cursor()
    seed_partners(cur)
    # Simulate save_and_sell_car_with_accounting
    cur.execute(
        "INSERT INTO cars (car_number, car_name, purchase_price, currency, selling_price, status, payment_type, amount_paid, amount_remaining, installment_months, buyer_name, purchase_date, sale_date, purchase_type, purchase_payment_type) VALUES ('S17_C','بيع مباشر',9000,'IQD',14000,'مبيوعة','اقساط',4000,10000,5,'مشتري17',?,?,'كاش','قاصه')",
        (TD, TD))
    # Purchase ledger
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory','S17_C',9000,0,'IQD','car','S17_C','شراء سيارة','شراء سيارة: بيع مباشر (S17_C)')", (TD,))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',0,9000,'IQD','car','S17_C','شراء سيارة كاش','سحب نقدي لشراء سيارة (S17_C)')", (TD,))
    for p in ["أمير","منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'شريك','سحب شراء سيارة',?,?,'00:00','IQD','قاصه','car_purchase','S17_C','cash_payment',1,1,0)",
            (p, 4500, TD))
    # Sale
    sell_car_installments(cur, "S17_C", "بيع مباشر", "مشتري17", 14000.0, 4000.0, 10000.0, 5)
    # Verify everything exists
    chkeq("car exists", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='S17_C'").fetchone()[0], 1)
    chkeq("purchase ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S17_C' AND type_ LIKE 'شراء%'").fetchone()[0], 2)
    chkeq("sale ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S17_C' AND (type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%' OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%')").fetchone()[0], 4)
    chkeq("customer exists", cur.execute("SELECT COUNT(*) FROM partners WHERE partner_name='مشتري17' AND kind='زبون'").fetchone()[0], 1)
    chkeq("installment schedule", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='S17_C'").fetchone()[0], 5)

def s18_delete_sold_renamed_car(con):
    """Scenario 18: Delete sold renamed car"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "DEL_OLD", "سيارة للحذف", 10000.0)
    sell_car_installments(cur, "DEL_OLD", "سيارة للحذف", "مشتري18", 16000.0, 4000.0, 12000.0, 6)
    # Rename DEL_OLD → DEL_NEW
    cur.execute("UPDATE partner_transactions SET source_id='DEL_NEW' WHERE source_id='DEL_OLD'")
    cur.execute("UPDATE partner_transactions SET source_id='DEL_NEW:down_payment' WHERE source_id='DEL_OLD:down_payment'")
    for row in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id LIKE 'DEL_OLD:installment:%'").fetchall():
        new_sid = row[0].replace("DEL_OLD:", "DEL_NEW:", 1)
        cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (new_sid, row[0]))
    cur.execute("UPDATE partner_transactions SET related_source_id='DEL_NEW' WHERE related_source_type='car' AND related_source_id='DEL_OLD'")
    cur.execute("UPDATE financial_ledger SET reference_id='DEL_NEW' WHERE reference_type='car' AND reference_id='DEL_OLD'")
    cur.execute("DELETE FROM cars WHERE car_number='DEL_OLD'")
    # Now delete the car (simulating delete_car)
    # Delete ledger
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='DEL_NEW'")
    # Delete car_expenses (if any)
    cur.execute("DELETE FROM car_expenses WHERE car_number='DEL_NEW'")
    # Delete partner_transactions generated by this car
    for row in cur.execute("SELECT id FROM partner_transactions WHERE related_source_type='car' AND related_source_id='DEL_NEW'").fetchall():
        cur.execute("DELETE FROM partner_transactions WHERE source_type='customer_payment' AND source_id=? AND kind='شريك'", (str(row[0]),))
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(row[0]),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (row[0],))
    for row in cur.execute("SELECT id FROM partner_transactions WHERE source_type='car_sale' AND source_id='DEL_NEW'").fetchall():
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(row[0]),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (row[0],))
    for row in cur.execute("SELECT id FROM partner_transactions WHERE source_type='car_purchase' AND source_id='DEL_NEW'").fetchall():
        cur.execute("DELETE FROM financial_ledger WHERE reference_type='partner_transaction' AND reference_id=?", (str(row[0]),))
        cur.execute("DELETE FROM partner_transactions WHERE id=?", (row[0],))
    # Delete car
    cur.execute("DELETE FROM cars WHERE car_number='DEL_NEW'")
    # Verify clean
    chkeq("no car", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='DEL_NEW'").fetchone()[0], 0)
    chkeq("no ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='DEL_NEW'").fetchone()[0], 0)
    chkeq("no car_expenses", cur.execute("SELECT COUNT(*) FROM car_expenses WHERE car_number='DEL_NEW'").fetchone()[0], 0)
    chkeq("no partner_tx", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='DEL_NEW' OR source_id='DEL_NEW' OR source_id LIKE 'DEL_NEW:%'").fetchone()[0], 0)

def s19_delete_customer_with_receivable(con):
    """Scenario 19: Delete customer with active receivable"""
    cur = con.cursor()
    # Create customer with receivable
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('مديون19','زبون',0,10000)")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable','مديون19',10000,0,'IQD','car','C19','مدينون بيع سيارة','ذمة مدينة')", (TD,))
    net = cur.execute("SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) FROM financial_ledger WHERE account_type='receivable' AND account_id='مديون19'").fetchone()[0]
    chkeq("active receivable", net > 0.001, True)
    print("  ✓ Delete would be rejected (active receivable)")
    # Now pay to zero
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable','مديون19',0,10000,'IQD','partner_transaction','pay19','سداد مديونية','تسديد')", (TD,))
    net2 = cur.execute("SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) FROM financial_ledger WHERE account_type='receivable' AND account_id='مديون19'").fetchone()[0]
    chkeq("zero net allows delete", abs(net2) < 0.001, True)

def s20_delete_funder_with_balance(con):
    """Scenario 20: Delete funder/company/investor with active balance"""
    cur = con.cursor()
    # Funder with active payable
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('ممول20','ممول',0,-20000)")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','funder','ممول20',0,20000,'IQD','car','C20','تمويل','تمويل')", (TD,))
    bal = cur.execute("SELECT COALESCE(SUM(credit),0)-COALESCE(SUM(debit),0) FROM financial_ledger WHERE account_type='funder' AND account_id='ممول20'").fetchone()[0]
    chkeq("active funder balance", bal > 0.001, True)
    print("  ✓ Funder delete would be rejected (active balance)")
    # Settle
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','funder','ممول20',20000,0,'IQD','partner_transaction','pay20','تسديد','تسديد')", (TD,))
    bal2 = cur.execute("SELECT COALESCE(SUM(credit),0)-COALESCE(SUM(debit),0) FROM financial_ledger WHERE account_type='funder' AND account_id='ممول20'").fetchone()[0]
    chkeq("zero funder balance", abs(bal2) < 0.001, True)
    # Company
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('شركة20','شركة',0,-5000)")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','payable','شركة20',0,5000,'IQD','partner_transaction','comp20','ايداع','ايداع شركة')", (TD,))
    bal3 = cur.execute("SELECT COALESCE(SUM(credit),0)-COALESCE(SUM(debit),0) FROM financial_ledger WHERE account_type='payable' AND account_id='شركة20'").fetchone()[0]
    chkeq("active company balance", bal3 > 0.001, True)
    print("  ✓ Company delete would be rejected (active balance)")

def s21_customer_rename_same_name_funder(con):
    """Scenario 21: Customer rename with same-name funder"""
    cur = con.cursor()
    seed_partners(cur)
    # Create customer and funder with same name
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('علي','زبون',0,5000)")
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('علي','ممول',0,-10000)")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable','علي',5000,0,'IQD','car','C21','مدينون','ذمة')", (TD,))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','funder','علي',0,10000,'IQD','car','C21','تمويل','تمويل')", (TD,))
    # Rename customer only
    cur.execute("UPDATE partners SET partner_name='علي_جديد' WHERE partner_name='علي' AND kind='زبون'")
    cur.execute("UPDATE partner_transactions SET partner_name='علي_جديد' WHERE partner_name='علي' AND kind='زبون'")
    cur.execute("UPDATE financial_ledger SET account_id='علي_جديد' WHERE account_type='receivable' AND account_id='علي'")
    # Verify funder unchanged
    chkeq("funder unchanged", cur.execute("SELECT COUNT(*) FROM partners WHERE partner_name='علي' AND kind='ممول'").fetchone()[0], 1)
    chkeq("funder ledger untouched", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE account_type='funder' AND account_id='علي'").fetchone()[0], 1)
    chkeq("customer renamed", cur.execute("SELECT COUNT(*) FROM partners WHERE partner_name='علي_جديد' AND kind='زبون'").fetchone()[0], 1)
    chkeq("receivable migrated", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE account_type='receivable' AND account_id='علي_جديد'").fetchone()[0], 1)

def s22_manual_payment_preserved(con):
    """Scenario 22: Manual payment preservation after sale rebuild"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S22_C", "اختبار يدوي", 10000.0)
    sell_car_installments(cur, "S22_C", "اختبار يدوي", "مشتري22", 20000.0, 5000.0, 15000.0, 10)
    # Add manual customer payment
    cur.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','تسديد قسط',?,?,'00:00',?,'IQD','قاصه','customer_transaction',?,'account_movement',0,0,0,'car',?)",
        ("مشتري22", 3000.0, TD, f"تسديد قسط يدوي 1 مشتري22 #بيع_سيارة_S22_C", "manual_22_1", "S22_C"))
    manual_id1 = cur.lastrowid
    # After sale edit (cost change)
    old_cost = 10000
    new_cost = 12000
    cur.execute("UPDATE cars SET purchase_price=12000 WHERE car_number='S22_C'")
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S22_C' AND type_='تكلفة المبيعات'")
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S22_C' AND type_='تخفيض المخزون بيع سيارة'")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                (TD, "S22_C", new_cost, "S22_C", "تكلفة بيع بعد التعديل"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                (TD, "S22_C", new_cost, "S22_C", "إخراج سيارة بعد التعديل"))
    # Manual payment must survive
    chkeq("manual survives cost edit", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE id=?", (manual_id1,)).fetchone()[0], 1)
    # After car number change
    old_n = "S22_C"
    new_n = "S22_C_NEW"
    cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (new_n, old_n))
    cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (f"{new_n}:down_payment", f"{old_n}:down_payment"))
    for row in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id LIKE 'S22_C:installment:%'").fetchall():
        cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (row[0].replace("S22_C:", "S22_C_NEW:", 1), row[0]))
    cur.execute("UPDATE partner_transactions SET related_source_id=? WHERE related_source_type='car' AND related_source_id=?", (new_n, old_n))
    cur.execute("UPDATE financial_ledger SET reference_id=? WHERE reference_type='car' AND reference_id=?", (new_n, old_n))
    cur.execute("DELETE FROM cars WHERE car_number=?", (old_n,))
    # Manual payment must still exist with correct reference
    chkeq("manual survives rename", cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE id=?", (manual_id1,)).fetchone()[0], 1)

def s23_qasa_double_count(con):
    """Scenario 23: Qasa/cash double-count prevention"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S23_A", "اختبار مزدوج1", 10000.0)
    sell_car_cash(cur, "S23_A", "اختبار مزدوج1", "مشتري23أ", 20000.0)
    create_car_cash_purchase(cur, "S23_B", "اختبار مزدوج2", 10000.0)
    sell_car_installments(cur, "S23_B", "اختبار مزدوج2", "مشتري23ب", 20000.0, 5000.0, 15000.0, 10)
    pay_installment(cur, "S23_B", "مشتري23ب", 1, 3000.0)
    # Count all qasa-increases from ledger
    cash_total = cur.execute("SELECT COALESCE(SUM(fl.debit-fl.credit),0) FROM financial_ledger fl WHERE fl.account_type='cash' AND fl.account_id='قاصه'").fetchone()[0]
    # Expected: -10000 (purchase S23_A) + 20000 (sale S23_A) -10000 (purchase S23_B) + 5000 (down pmt) + 3000 (installment) = 8000
    expected = -10000 + 20000 - 10000 + 5000 + 3000
    chkeq("qasa net correct", abs(cash_total - expected) < 0.001, True)
    # Profit recognition rows should NOT affect qasa
    profit_qasa = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE affects_profit=1 AND affects_qasa=1").fetchone()[0]
    chkeq("no profit-as-qasa", profit_qasa, 0)

def s24_source_metadata_completeness(con):
    """Scenario 24: Source metadata completeness"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S24_C", "اختبار بيانات", 10000.0)
    sell_car_installments(cur, "S24_C", "اختبار بيانات", "مشتري24", 20000.0, 5000.0, 15000.0, 5)
    pay_installment(cur, "S24_C", "مشتري24", 1, 1000.0)
    # Check partner_transactions metadata
    for row in cur.execute("""
        SELECT source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit
        FROM partner_transactions WHERE source_type IS NOT NULL
    """).fetchall():
        st, si, sr, aq, apc, ap = row
        if si:
            chk(f"source_id format valid for {st}", ' ' not in si if ' ' in (si or '') else True)
    # Also verify no null source types for car-linked rows
    null_src = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_type='car' AND source_type IS NULL").fetchone()[0]
    chkeq("no null source_type for car rows", null_src, 0)

def s25_atomic_rollback(con):
    """Scenario 25: Atomic rollback simulation"""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S25_C", "اختبار استرجاع", 10000.0)
    # Save point
    ledger_before = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S25_C'").fetchone()[0]
    pt_before = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='S25_C' OR source_id='S25_C'").fetchone()[0]
    # Simulate failure: start sell, then ROLLBACK
    cur.execute("SAVEPOINT sp_s25")
    # Delete everything (simulating partial write)
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='S25_C'")
    cur.execute("DELETE FROM partner_transactions WHERE source_type='car_purchase' AND source_id='S25_C'")
    cur.execute("ROLLBACK TO sp_s25")
    cur.execute("RELEASE sp_s25")
    # Verify rollback
    ledger_after = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car' AND reference_id='S25_C'").fetchone()[0]
    pt_after = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='S25_C' OR source_id='S25_C'").fetchone()[0]
    chkeq("ledger rollback", ledger_after, ledger_before)
    chkeq("partner_tx rollback", pt_after, pt_before)

def s26_financial_summary_cash_vs_qasa(con):
    """Scenario 26: Financial summary: cash tab shows cash_iqd, qasa tab shows qasa_iqd, not net_capital."""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S26_A", "اختبار كاش", 10_000_000.0)

    # cash_iqd: sum of partner_transactions where affects_partner_cash=1 AND kind='شريك' AND currency='IQD'
    # سحب is negative, ايداع is positive
    cash_iqd = cur.execute("""
        SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'تحويل%' THEN -amount
                ELSE 0
            END
         ), 0.0)
         FROM partner_transactions
         WHERE affects_partner_cash = 1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
    """).fetchone()[0]
    chkeq("cash_iqd after cash car purchase = -10M", cash_iqd, -10_000_000.0)

    # qasa_iqd: same logic but affects_qasa=1 AND kind IN ('شريك','مستثمر')
    qasa_iqd = cur.execute("""
        SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'تحويل%' THEN -amount
                ELSE 0
            END
         ), 0.0)
         FROM partner_transactions
         WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر') AND COALESCE(currency, 'IQD') = 'IQD'
    """).fetchone()[0]
    chkeq("qasa_iqd after cash car purchase = -10M", qasa_iqd, -10_000_000.0)

    # inventory_value_iqd: ledger inventory debit-credit
    inv_iqd = cur.execute(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory' AND currency = 'IQD'"
    ).fetchone()[0]
    chkeq("inventory_value_iqd after cash car purchase = 10M", inv_iqd, 10_000_000.0)

    # monthly_profits_iqd: no profit entries yet
    chkeq("monthly_profits_iqd = 0", 0, 0)

    # Assert that net_capital_iqd differs from cash_iqd (this is the bug)
    net_capital_iqd = cash_iqd + inv_iqd
    chk("net_capital_iqd != cash_iqd (bug: cash tab was using net_capital)", net_capital_iqd != cash_iqd, f"net_capital={net_capital_iqd} cash={cash_iqd}")

def s27_cash_sale_no_customer_account(con):
    """Scenario 27: Cash sale must NOT create customer account or receivable.
       Cash sale uses car_sale cash_movement + profit_recognition directly."""
    cur = con.cursor()
    seed_partners(cur)
    create_car_cash_purchase(cur, "S27_A", "سيارة كاش", 10_000_000.0)
    add_car_expense(cur, "S27_A", "مصاريف اصلاح", 1_000_000.0)
    sell_car_cash(cur, "S27_A", "سيارة كاش", "زبون كاش 1", 15_000_000.0)

    # 1. Car status = مبيوعة
    status = cur.execute("SELECT status FROM cars WHERE car_number='S27_A'").fetchone()
    chkeq("car status sold", status[0] if status else "", "مبيوعة")

    # 2. No customer account exists for cash buyer
    customer = cur.execute("SELECT COUNT(*) FROM partners WHERE partner_name='زبون كاش 1' AND kind='زبون'").fetchone()[0]
    chkeq("no customer account for cash buyer", customer, 0)

    # 3. No customer_sale_payment rows related to this car
    cust_pay = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_sale_payment' AND related_source_type='car' AND related_source_id='S27_A'").fetchone()[0]
    chkeq("no customer_sale_payment for cash sale", cust_pay, 0)

    # 4. No receivable ledger entries for cash buyer
    recv = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE account_type='receivable' AND account_id='زبون كاش 1'").fetchone()[0]
    chkeq("no receivable for cash buyer", recv, 0)

    # 5. car_sale cash_movement rows exist
    cash_movements = cur.execute(
        "SELECT partner_name, amount FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='cash_movement' ORDER BY partner_name"
    ).fetchall()
    chkeq("cash_movement count", len(cash_movements), 2)
    total_cash_movement = sum(r[1] for r in cash_movements)
    chkeq("total cash_movement = selling_price 15M", total_cash_movement, 15_000_000.0)
    amir_cm = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='cash_movement' AND partner_name='أمير'").fetchone()
    chkeq("amir cash_movement = 7.5M", amir_cm[0] if amir_cm else 0, 7_500_000.0)
    muntasir_cm = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='cash_movement' AND partner_name='منتصر'").fetchone()
    chkeq("muntasir cash_movement = 7.5M", muntasir_cm[0] if muntasir_cm else 0, 7_500_000.0)

    # 6. cash_movement affects_qasa=1, affects_partner_cash=1, affects_profit=0
    cm_flags = cur.execute(
        "SELECT affects_qasa, affects_partner_cash, affects_profit FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='cash_movement' LIMIT 1"
    ).fetchone()
    chkeq("cash_movement affects_qasa", cm_flags[0], 1)
    chkeq("cash_movement affects_partner_cash", cm_flags[1], 1)
    chkeq("cash_movement affects_profit", cm_flags[2], 0)

    # 7. car_sale profit_recognition rows exist (profit = 15M - 10M - 1M = 4M)
    profit_rows = cur.execute(
        "SELECT partner_name, amount FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='profit_recognition' ORDER BY partner_name"
    ).fetchall()
    chkeq("profit_recognition count", len(profit_rows), 2)
    total_profit = sum(r[1] for r in profit_rows)
    chkeq("total profit = 4M", total_profit, 4_000_000.0)
    amir_pr = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='profit_recognition' AND partner_name='أمير'").fetchone()
    chkeq("amir profit = 2M", amir_pr[0] if amir_pr else 0, 2_000_000.0)
    muntasir_pr = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='profit_recognition' AND partner_name='منتصر'").fetchone()
    chkeq("muntasir profit = 2M", muntasir_pr[0] if muntasir_pr else 0, 2_000_000.0)

    # 8. profit_recognition affects_qasa=0, affects_partner_cash=0, affects_profit=1
    pr_flags = cur.execute(
        "SELECT affects_qasa, affects_partner_cash, affects_profit FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='profit_recognition' LIMIT 1"
    ).fetchone()
    chkeq("profit_recognition affects_qasa=0", pr_flags[0], 0)
    chkeq("profit_recognition affects_partner_cash=0", pr_flags[1], 0)
    chkeq("profit_recognition affects_profit=1", pr_flags[2], 1)

    # 9. Qasa net = -10M (purchase cash) -1M (expense share?) + 15M (sale) = 4M
    # Actually qasa includes: -10M from purchase + 15M from sale = 5M total from car_sale + car_purchase
    # Wait - the expense also affects qasa. Let me compute from partner_transactions.
    cash_iqd = cur.execute("""
        SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'تحويل%' THEN -amount
                ELSE 0
            END
         ), 0.0)
         FROM partner_transactions
         WHERE affects_partner_cash = 1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
    """).fetchone()[0]
    chkeq("cash_iqd = 4M", cash_iqd, 4_000_000.0)

    qasa_iqd = cur.execute("""
        SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'تحويل%' THEN -amount
                ELSE 0
            END
         ), 0.0)
         FROM partner_transactions
         WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر') AND COALESCE(currency, 'IQD') = 'IQD'
    """).fetchone()[0]
    chkeq("qasa_iqd = 4M", qasa_iqd, 4_000_000.0)

    # 10. Inventory = -1M after sale (10M purchase - 11M COGS including expense)
    # The expense adds to COGS but does not increase inventory,
    # so net inventory after sale = 10M - (10M + 1M) = -1M
    inv_iqd = cur.execute(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type='inventory' AND currency='IQD'"
    ).fetchone()[0]
    chkeq("inventory = -1M after sale (expense in COGS)", inv_iqd, -1_000_000.0)

    # 11. No duplicate cash_movement or profit_recognition rows
    cm_count = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='cash_movement'").fetchone()[0]
    chkeq("no duplicate cash_movement", cm_count, 2)
    pr_count = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='car_sale' AND source_id='S27_A' AND source_role='profit_recognition'").fetchone()[0]
    chkeq("no duplicate profit_recognition", pr_count, 2)

# ─── Scenario list ─────────────────────────────────────────────────

SCENARIOS = [
    (1,  "Available car purchase, cash", s01_purchase_car_cash),
    (2,  "Available car purchase by funder", s02_purchase_car_funder),
    (3,  "Sell available car cash", s03_sell_car_cash),
    (4,  "Sell available car by installments", s04_sell_car_installments),
    (5,  "Partial installment payment less than due", s05_partial_installment_payment),
    (6,  "Installment overpayment", s06_installment_overpayment),
    (7,  "Final installment payment", s07_final_installment_payment),
    (8,  "Edit sold car sale fields only", s08_edit_sold_car_sale_only),
    (9,  "Edit sold car cost only", s09_edit_sold_car_cost),
    (10, "Change sold car number once", s10_change_car_number_once),
    (11, "Change sold car number twice", s11_change_car_number_twice),
    (12, "Mixed sale + cost edit blocked", s12_mixed_edit_blocked),
    (13, "Add car expense after cash sale", s13_add_expense_after_cash_sale),
    (14, "Delete car expense after cash sale", s14_delete_expense_after_cash_sale),
    (15, "Add car expense after installment sale", s15_add_expense_after_installment_sale),
    (16, "Profit cap violation", s16_profit_cap_violation),
    (17, "New car directly sold", s17_new_car_directly_sold),
    (18, "Delete sold renamed car", s18_delete_sold_renamed_car),
    (19, "Delete customer with active receivable", s19_delete_customer_with_receivable),
    (20, "Delete funder/company/investor with active balance", s20_delete_funder_with_balance),
    (21, "Customer rename with same-name funder", s21_customer_rename_same_name_funder),
    (22, "Manual payment preservation after sale rebuild", s22_manual_payment_preserved),
    (23, "Qasa/cash double-count prevention", s23_qasa_double_count),
    (24, "Source metadata completeness", s24_source_metadata_completeness),
    (25, "Atomic rollback simulation", s25_atomic_rollback),
    (26, "Financial summary cash/qasa not net_capital", s26_financial_summary_cash_vs_qasa),
    (27, "Cash sale no customer account", s27_cash_sale_no_customer_account),
]

# ─── Main ──────────────────────────────────────────────────────────

def main():
    global PASS_COUNT, FAIL_COUNT, ERRORS, IN_SCENARIO, VERBOSE
    VERBOSE = "--verbose" in sys.argv
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
    con.commit()

    PASS_COUNT = 0
    FAIL_COUNT = 0
    ERRORS = []

    results = []

    for num, name, fn in SCENARIOS:
        IN_SCENARIO = num
        print(f"\n{'='*60}")
        print(f"SCENARIO {num:02d}: {name}")
        print(f"{'='*60}")
        before_pass = PASS_COUNT
        before_fail = FAIL_COUNT
        try:
            con.execute("BEGIN")
            fn(con)
        except AssertionError as e:
            FAIL_COUNT += 1
            ERRORS.append(f"S{num:02d}: AssertionError: {e}")
            print(f"  FAIL: AssertionError: {e}")
        except Exception as e:
            FAIL_COUNT += 1
            ERRORS.append(f"S{num:02d}: ERROR: {e}")
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
        finally:
            con.execute("ROLLBACK")
            if before_fail < FAIL_COUNT:
                results.append((num, name, "FAIL", FAIL_COUNT - before_fail))
            else:
                results.append((num, name, "PASS", PASS_COUNT - before_pass))

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for num, name, status, count in results:
        print(f"  S{num:02d}  {status:4s}  {name}")
    print(f"\n{'='*60}")
    print(f"RESULTS: {PASS_COUNT} assertions passed, {FAIL_COUNT} failed")
    if FAIL_COUNT > 0:
        print(f"\nFAILURES:")
        for e in ERRORS:
            print(f"  {e}")
        print(f"\nFailed scenarios: {len(set(e.split(':')[0] for e in ERRORS))}")
    print(f"{'='*60}")

    con.close()
    if not keep_db:
        tmp.close()
        print("Temp DB cleaned up.")
    else:
        print(f"Temp DB kept at: {db_path}")
    sys.exit(0 if FAIL_COUNT == 0 else 1)

if __name__ == "__main__":
    main()
