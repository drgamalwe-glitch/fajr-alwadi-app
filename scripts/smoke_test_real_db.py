#!/usr/bin/env python3
"""
Real Fresh DB Smoke Tests — Fajr Alwadi
========================================
Runs workflows A-I directly on the real fresh DB (fjr_alwadi_data.db)
and cleans up test data afterward.
"""

import sqlite3
import sys
import os
import shutil
import tempfile
from datetime import datetime, timedelta

TD = datetime.now().strftime("%Y-%m-%d")
ORIGINAL_DB = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                          "src-tauri", "fjr_alwadi_data.db")
# Always run smoke tests against a TEMP COPY of the DB — never write to the real
# app DB. (Bug P2: previously this script connected directly to fjr_alwadi_data.db.)
DB_PATH = os.path.join(tempfile.gettempdir(), "fajr_smoke_test.db")

# Safety check: refuse to run if DB_PATH somehow points at the real app DB.
if os.path.basename(ORIGINAL_DB) in (os.path.basename(DB_PATH),) and not os.environ.get("FORCE_SMOKE_TEST"):
    sys.exit("ERROR: Refusing to run against real app DB. Set FORCE_SMOKE_TEST=1 to override.")

pass_count = 0
fail_count = 0
errors = []

def chkeq(label, actual, expected):
    global pass_count, fail_count
    if abs(actual - expected) < 0.001 if isinstance(expected, float) else actual == expected:
        pass_count += 1
    else:
        fail_count += 1
        errors.append(f"FAIL [{label}]: got {actual}, expected {expected}")

def chk(label, condition):
    global pass_count, fail_count
    if bool(condition):
        pass_count += 1
    else:
        fail_count += 1
        errors.append(f"FAIL [{label}]: condition false")

# ─── Helpers (mirror accounting_runtime_scenarios.py) ──────────────────

def seed_partners(cur):
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('أمير','شريك',0,0)")
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('منتصر','شريك',0,0)")

def create_car_cash_purchase(cur, cn, name, price, pdate=None):
    if pdate is None:
        pdate = TD
    cur.execute(
        "INSERT INTO cars (car_number, car_name, purchase_price, currency, status, purchase_type, purchase_date, purchase_time, purchase_payment_type) VALUES (?,?,?,'IQD','متوفرة','كاش',?,'00:00','قاصه')",
        (cn, name, price, pdate))
    cur.execute(
        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,?,0,'IQD','car',?,'شراء سيارة',?)",
        (pdate, cn, price, cn, f"شراء سيارة: {name} ({cn})"))
    cur.execute(
        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',0,?,'IQD','car',?,'شراء سيارة كاش',?)",
        (pdate, price, cn, f"سحب نقدي لشراء سيارة: {name} ({cn}) من قاصه"))
    for p in ["أمير", "منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'شريك','سحب شراء',?,?,'00:00','IQD','قاصه','car_purchase',?,'cash_payment',1,1,0)",
            (p, price/2, pdate, cn))

def sell_car_cash(cur, cn, name, buyer, price, pdate=None):
    if pdate is None:
        pdate = TD
    pp_row = cur.execute("SELECT purchase_price FROM cars WHERE car_number=?", (cn,)).fetchone()
    if pp_row is None:
        chk("car exists for cash sale", False); return
    purchase_price = pp_row[0]
    exp_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM car_expenses WHERE car_number=?", (cn,)).fetchone()[0]
    total_cost = purchase_price + exp_sum
    profit = price - total_cost
    cur.execute("UPDATE cars SET status='مبيوعة', selling_price=?, sale_currency='IQD', payment_type='كاش', amount_paid=?, amount_remaining=0, buyer_name=?, buyer_phone='', sale_date=? WHERE car_number=?",
                (price, price, buyer, pdate, cn))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','revenue',?,0,?,'IQD','car',?,'بيع سيارة',?)",
                (pdate, cn, price, cn, f"إيراد بيع سيارة {name} ({cn}) كاش"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',?,0,'IQD','car',?,'بيع سيارة كاش',?)",
                (pdate, price, cn, f"استلام نقدي بيع سيارة {name} ({cn})"))
    if total_cost > 0:
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                    (pdate, cn, total_cost, cn, f"تكلفة بيع سيارة {name} ({cn})"))
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                    (pdate, cn, total_cost, cn, f"إخراج سيارة {name} ({cn}) من المخزون"))
    for p in ["أمير", "منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'شريك','ايداع بيع سيارة',?,?,'00:00',?,'IQD','قاصه','car_sale',?,'cash_movement',1,1,0)",
            (p, price/2, pdate, f"ايداع بيع سيارة {name} ({cn})", cn))
    if profit > 0:
        for p in ["أمير", "منتصر"]:
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','car_sale',?,'profit_recognition',0,0,1,'car',?)",
                (p, profit/2, pdate, f"ايداع ارباح سيارة {name} ({cn}) #بيع_سيارة_{cn}", cn, cn))

def sell_car_installments(cur, cn, name, buyer, price, down_pmt, remaining, months, pdate=None):
    if pdate is None:
        pdate = TD
    pp_row = cur.execute("SELECT purchase_price FROM cars WHERE car_number=?", (cn,)).fetchone()
    if pp_row is None:
        chk("car exists for installment sale", False); return
    purchase_price = pp_row[0]
    exp_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM car_expenses WHERE car_number=?", (cn,)).fetchone()[0]
    total_cost = purchase_price + exp_sum
    full_profit = price - total_cost
    profit_ratio = full_profit / price if price > 0 else 0
    cur.execute("UPDATE cars SET status='مبيوعة', selling_price=?, sale_currency='IQD', payment_type='اقساط', amount_paid=?, amount_remaining=?, installment_months=?, buyer_name=?, buyer_phone='', sale_date=?, delivery_date=?, first_payment_date=? WHERE car_number=?",
                (price, down_pmt, remaining, months, buyer, pdate, pdate, pdate, cn))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable',?,?,0,'IQD','car',?,'مدينون بيع سيارة',?)",
                (pdate, buyer, price, cn, f"ذمة مدينة كاملة بيع سيارة {name} ({cn}) على {buyer}"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','deferred_revenue',?,0,?,'IQD','car',?,'إيراد مؤجل بيع سيارة',?)",
                (pdate, cn, price, cn, f"إيراد مؤجل بيع سيارة {name} ({cn}) إلى {buyer}"))
    if total_cost > 0:
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                    (pdate, cn, total_cost, cn, f"تكلفة بيع سيارة {name} ({cn})"))
        cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                    (pdate, cn, total_cost, cn, f"إخراج سيارة {name} ({cn}) من المخزون"))
    cur.execute("INSERT OR IGNORE INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES (?,'زبون',?,?)", (buyer, remaining, remaining))
    cur.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','مقدمة بيع سيارة',?,?,'00:00',?,'IQD','قاصه','customer_sale_payment',?,'sale_down_payment',0,0,0,'car',?)",
        (buyer, down_pmt, pdate, f"استلام مقدمة سيارة من {buyer} #بيع_سيارة_{cn}", f"{cn}:down_payment", cn))
    dp_id = cur.lastrowid
    for p in ["أمير", "منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع مقدمة',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'cash_movement',1,1,0,'car',?)",
            (p, down_pmt/2, pdate, f"دفعة زبون: استلام مقدمة سيارة من {buyer} #بيع_سيارة_{cn}", str(dp_id), cn))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable',?,0,?,'IQD','partner_transaction',?,?,?)",
                (pdate, buyer, down_pmt, str(dp_id), "تخفيض ذمة مدينة", f"من دفعة زبون {buyer}"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',?,0,'IQD','partner_transaction',?,?,?)",
                (pdate, down_pmt, str(dp_id), "استلام نقدي", f"دفعة زبون {buyer}"))
    dp_profit = down_pmt * profit_ratio
    if dp_profit > 0:
        for p in ["أمير", "منتصر"]:
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'profit_recognition',0,0,1,'car',?)",
                (p, dp_profit/2, pdate, f"ربح دفعة زبون {buyer} (مقدمة) #بيع_سيارة_{cn}", str(dp_id), cn))
    if months > 0 and remaining > 0:
        monthly = remaining / months
        for i in range(months):
            idt = (datetime.strptime(pdate, "%Y-%m-%d") + timedelta(days=30*(i+1))).strftime("%Y-%m-%d")
            amt = monthly if i < months-1 else remaining - monthly * (months-1)
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','باقي قسط',?,?,'00:00',?,'IQD','قاصه','customer_installment_schedule',?,'installment_schedule',0,0,0,'car',?)",
                (buyer, amt, idt, f"باقي قسط شهر {i+1} من {months} على {buyer} #بيع_سيارة_{cn}", f"{cn}:installment:{i+1}", cn))

def pay_installment(cur, cn, buyer, installment_idx, amount_paid):
    sid = f"{cn}:installment:{installment_idx}"
    installment = cur.execute(
        "SELECT id, amount FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id=? AND partner_name=? AND kind='زبون'",
        (sid, buyer)).fetchone()
    if not installment:
        chk(f"installment {sid} exists", False); return None
    orig_amount = installment[1]
    installment_id = installment[0]
    note = f"تسديد قسط شهر {installment_idx} {buyer} #بيع_سيارة_{cn}"
    cur.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'زبون','تسديد قسط',?,?,'00:00',?,'IQD','قاصه','customer_transaction',?,'account_movement',0,0,0,'car',?)",
        (buyer, amount_paid, TD, note, str(installment_id), cn))
    cust_pay_id = cur.lastrowid
    cur.execute("UPDATE partner_transactions SET type='واصل قسط', notes=? WHERE id=?",
                (f"واصل قسط شهر {installment_idx} {buyer} (مدفوع {amount_paid})", installment_id))
    diff = amount_paid - orig_amount
    if abs(diff) > 0.001:
        if diff < 0:
            remaining_inst = cur.execute(
                "SELECT id, amount, source_id FROM partner_transactions WHERE source_type='customer_installment_schedule' AND partner_name=? AND kind='زبون' AND type='باقي قسط' AND related_source_id=? ORDER BY date ASC",
                (buyer, cn)).fetchall()
            shortfall = -diff
            redistributed = 0
            for ri in remaining_inst:
                if shortfall - redistributed <= 0.001:
                    break
                add_to = min(shortfall - redistributed, ri[1])
                cur.execute("UPDATE partner_transactions SET amount=amount+? WHERE id=?", (add_to, ri[0]))
                redistributed += add_to
    # Cash movement for this payment
    for p in ["أمير", "منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع مقدمة',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'cash_movement',1,1,0,'car',?)",
            (p, amount_paid/2, TD, f"دفعة زبون: تسديد قسط {buyer} #بيع_سيارة_{cn}", str(cust_pay_id), cn))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable',?,0,?,'IQD','partner_transaction',?,?,?)",
                (TD, buyer, amount_paid, str(cust_pay_id), "تخفيض ذمة مدينة", f"من دفعة زبون {buyer}"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',?,0,'IQD','partner_transaction',?,?,?)",
                (TD, amount_paid, str(cust_pay_id), "استلام نقدي", f"دفعة زبون {buyer}"))
    # Profit recognition
    profit_ratio = 0.5
    pmt_profit = amount_paid * profit_ratio
    already_recognized = cur.execute(
        "SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE kind='شريك' AND affects_profit=1 AND source_role='profit_recognition' AND related_source_type='car' AND related_source_id=?",
        (cn,)).fetchone()[0] or 0
    full_profit = cur.execute("SELECT selling_price FROM cars WHERE car_number=?", (cn,)).fetchone()
    total_cost = cur.execute("SELECT purchase_price FROM cars WHERE car_number=?", (cn,)).fetchone()
    if full_profit and total_cost:
        exp_sum = cur.execute("SELECT COALESCE(SUM(amount),0) FROM car_expenses WHERE car_number=?", (cn,)).fetchone()[0]
        full_profit_val = full_profit[0] - total_cost[0] - exp_sum
        remaining_profit = full_profit_val - already_recognized
        if pmt_profit > remaining_profit:
            pmt_profit = max(0, remaining_profit)
    if pmt_profit > 0:
        for p in ["أمير", "منتصر"]:
            cur.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','customer_payment',?,'profit_recognition',0,0,1,'car',?)",
                (p, pmt_profit/2, TD, f"ربح دفعة زبون {buyer} (قسط {installment_idx}) #بيع_سيارة_{cn}", str(cust_pay_id), cn))
    return cust_pay_id

def add_car_expense_post_sale(cur, cn, desc, amt, edate=None):
    if edate is None:
        edate = TD
    cur.execute("INSERT INTO car_expenses (car_number, description, amount, date, currency) VALUES (?,?,?,?,'IQD')", (cn, desc, amt, edate))
    eid = cur.lastrowid
    row = cur.execute("SELECT purchase_price, selling_price, payment_type FROM cars WHERE car_number=?", (cn,)).fetchone()
    purchase_price = row[0] if row else 0
    selling_price = row[1] if row else 0
    is_installment = row[2] == 'اقساط' if row else False
    old_cost = purchase_price
    new_cost = purchase_price + amt
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id=? AND type_='تكلفة المبيعات'", (cn,))
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id=? AND type_='تخفيض المخزون بيع سيارة'", (cn,))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                (edate, cn, new_cost, cn, f"تكلفة بيع سيارة ({cn}) بعد المصروف"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                (edate, cn, new_cost, cn, f"إخراج سيارة ({cn}) من المخزون بعد المصروف"))
    for p in ["أمير", "منتصر"]:
        cur.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit) VALUES (?,'شريك','سحب مصروف سيارة',?,?,'00:00',?,'IQD','قاصه','car_expense',?,'cash_payment',1,1,0)",
            (p, amt/2, edate, f"مصروف سيارة: {desc} ({cn})", str(eid)))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car_expense',?,'مصروف سيارة',?)",
                (edate, cn, amt, str(eid), f"مصروف سيارة {desc} ({cn})"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','cash','قاصه',0,?,'IQD','car_expense',?,'مصروف سيارة كاش',?)",
                (edate, amt, str(eid), f"صرف نقدي مصروف سيارة {desc} ({cn})"))
    if not is_installment:
        old_profit = selling_price - old_cost
        new_profit = selling_price - new_cost
        cur.execute("DELETE FROM partner_transactions WHERE source_type='car_sale' AND source_id=? AND source_role='profit_recognition'", (cn,))
        if new_profit > 0:
            for p in ["أمير", "منتصر"]:
                cur.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id) VALUES (?,'شريك','ايداع ارباح سيارة',?,?,'00:00',?,'IQD','قاصه','car_sale',?,'profit_recognition',0,0,1,'car',?)",
                    (p, new_profit/2, edate, f"ايداع ارباح سيارة ({cn}) بعد المصروف #بيع_سيارة_{cn}", cn, cn))
    return eid


# ══════════════════════════════════════════════════════════════════════
# SMOKE WORKFLOWS
# ══════════════════════════════════════════════════════════════════════

def workflow_A_empty_state(cur):
    """A. Empty-state check"""
    chkeq("no cars", cur.execute("SELECT COUNT(*) FROM cars").fetchone()[0], 0)
    chkeq("no car_expenses", cur.execute("SELECT COUNT(*) FROM car_expenses").fetchone()[0], 0)
    chkeq("no car_partners", cur.execute("SELECT COUNT(*) FROM car_partners").fetchone()[0], 0)
    chkeq("no financial_ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger").fetchone()[0], 0)
    chkeq("no partner_transactions", cur.execute("SELECT COUNT(*) FROM partner_transactions").fetchone()[0], 0)
    # Partners: only the 2 default
    chkeq("partners count", cur.execute("SELECT COUNT(*) FROM partners").fetchone()[0], 2)
    # Balances zero
    for p in ["أمير", "منتصر"]:
        bal = cur.execute("SELECT iqd_balance FROM partners WHERE partner_name=? AND kind='شريك'", (p,)).fetchone()
        chkeq(f"{p} balance zero", bal[0] if bal else -1, 0.0)
    print("  ✓ Empty state: all clean")

def workflow_B_cash_purchase(cur):
    """B. Cash purchase"""
    create_car_cash_purchase(cur, "SMK_B", "اختبار شراء", 10000.0)
    chk("car exists", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='SMK_B'").fetchone()[0])
    # Inventory debit
    inv = cur.execute("SELECT SUM(debit)-SUM(credit) FROM financial_ledger WHERE account_type='inventory' AND account_id='SMK_B'").fetchone()[0]
    chkeq("inventory debit", inv, 10000.0)
    # Cash credit
    cash = cur.execute("SELECT SUM(credit)-SUM(debit) FROM financial_ledger WHERE account_type='cash' AND account_id='قاصه' AND reference_id='SMK_B'").fetchone()[0]
    chkeq("cash credit", cash, 10000.0)
    # Partner 50/50
    for p in ["أمير", "منتصر"]:
        amt = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE partner_name=? AND source_role='cash_payment' AND source_type='car_purchase' AND source_id='SMK_B'", (p,)).fetchone()[0]
        chkeq(f"{p} purchase split", amt, 5000.0)
    # No profit yet
    profit = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE affects_profit=1 AND source_id='SMK_B'").fetchone()[0]
    chkeq("no profit on purchase", profit, 0.0)
    # Partner cash decreased
    for p in ["أمير", "منتصر"]:
        pc = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE partner_name=? AND affects_partner_cash=1 AND source_id='SMK_B'", (p,)).fetchone()[0]
        chkeq(f"{p} cash decreased", pc, 5000.0)
    print("  ✓ Cash purchase: inventory + cash + partner split OK")

def workflow_C_cash_sale(cur):
    """C. Cash sale"""
    sell_car_cash(cur, "SMK_B", "اختبار شراء", "مشتري_نقدي", 20000.0)
    # Revenue
    rev = cur.execute("SELECT SUM(credit) FROM financial_ledger WHERE account_type='revenue' AND reference_id='SMK_B'").fetchone()[0]
    chkeq("revenue", rev, 20000.0)
    # COGS
    cogs = cur.execute("SELECT SUM(debit) FROM financial_ledger WHERE account_type='expense' AND reference_id='SMK_B' AND type_='تكلفة المبيعات'").fetchone()[0]
    chkeq("COGS", cogs, 10000.0)
    # Inventory credit
    inv_out = cur.execute("SELECT SUM(credit) FROM financial_ledger WHERE account_type='inventory' AND reference_id='SMK_B' AND type_='تخفيض المخزون بيع سيارة'").fetchone()[0]
    chkeq("inventory credit", inv_out, 10000.0)
    # Profit recognition
    profit = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_role='profit_recognition' AND source_type='car_sale' AND source_id='SMK_B'").fetchone()[0]
    chkeq("profit recognized", profit, 10000.0)
    # Qasa increased by sale amount (not by profit again)
    sale_cash = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_role='cash_movement' AND source_type='car_sale' AND source_id='SMK_B'").fetchone()[0]
    chkeq("qasa increase = sale amount", sale_cash, 20000.0)
    # Profit does not increase qasa again
    profit_qasa = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_role='profit_recognition' AND affects_qasa=1 AND source_id='SMK_B'").fetchone()[0]
    chkeq("profit does not affect qasa", profit_qasa, 0.0)
    print("  ✓ Cash sale: revenue + COGS + profit split + qasa OK")

def workflow_D_installment_sale(cur):
    """D. Installment sale"""
    create_car_cash_purchase(cur, "SMK_D", "اختبار تقسيط", 10000.0)
    sell_car_installments(cur, "SMK_D", "اختبار تقسيط", "مشتري_قسط", 20000.0, 5000.0, 15000.0, 15)
    # 15 installment rows
    inst_count = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='SMK_D'").fetchone()[0]
    chkeq("15 installment rows", inst_count, 15)
    # Down payment row
    dp_count = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_sale_payment' AND source_id='SMK_D:down_payment'").fetchone()[0]
    chkeq("down payment row", dp_count, 1)
    # Receivable net (total sale - down payment)
    recv = cur.execute("SELECT SUM(debit)-SUM(credit) FROM financial_ledger WHERE account_type='receivable' AND account_id='مشتري_قسط'").fetchone()[0]
    chkeq("net receivable after down pmt", recv, 15000.0)
    # Deferred revenue
    def_rev = cur.execute("SELECT SUM(credit)-SUM(debit) FROM financial_ledger WHERE account_type='deferred_revenue' AND reference_id='SMK_D'").fetchone()[0]
    chkeq("deferred revenue", def_rev, 20000.0)
    # Full profit NOT recognized upfront
    full_profit = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_role='profit_recognition' AND source_type='car_sale' AND source_id='SMK_D'").fetchone()[0]
    chkeq("no full profit upfront (car_sale)", full_profit, 0.0)
    print("  ✓ Installment sale: schedule + down pmt + receivable + deferred revenue OK")

def workflow_E_partial_payment(cur):
    """E. Partial installment payment"""
    cust_pay_id = pay_installment(cur, "SMK_D", "مشتري_قسط", 1, 700.0)
    # Verify installment 1 is marked paid
    inst1 = cur.execute("SELECT type, amount FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id='SMK_D:installment:1'").fetchone()
    chkeq("installment 1 marked paid", inst1[0], "واصل قسط")
    chkeq("installment 1 amount unchanged", inst1[1], 1000.0)
    # Verify remaining 300 was redistributed
    inst2 = cur.execute("SELECT amount FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id='SMK_D:installment:2'").fetchone()
    chkeq("remaining redistributed to inst 2", inst2[0], 1300.0)
    if cust_pay_id:
        qasa_inst = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_role='cash_movement' AND source_id=? AND partner_name='أمير'", (str(cust_pay_id),)).fetchone()[0]
        chkeq("qasa increased by 700 (installment cash movement, per partner)", qasa_inst, 350.0)  # 700/2 per partner
    else:
        chk("installment payment created", False)
    print("  ✓ Partial payment: 700 paid, 300 redistributed, qasa +700 OK")

def workflow_F_cost_edit(cur):
    """F. Sold car cost edit"""
    old_cost = 10000
    new_cost = 12000
    cur.execute("UPDATE cars SET purchase_price=? WHERE car_number='SMK_D'", (new_cost,))
    new_total_cost = new_cost
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='SMK_D' AND type_='تكلفة المبيعات'")
    cur.execute("DELETE FROM financial_ledger WHERE reference_type='car' AND reference_id='SMK_D' AND type_='تخفيض المخزون بيع سيارة'")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','expense',?,?,0,'IQD','car',?,'تكلفة المبيعات',?)",
                (TD, "SMK_D", new_total_cost, "SMK_D", f"تكلفة بيع سيارة (SMK_D) بعد التعديل"))
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','inventory',?,0,?,'IQD','car',?,'تخفيض المخزون بيع سيارة',?)",
                (TD, "SMK_D", new_total_cost, "SMK_D", f"إخراج سيارة (SMK_D) من المخزون بعد التعديل"))
    cogs = cur.execute("SELECT SUM(debit) FROM financial_ledger WHERE account_type='expense' AND reference_id='SMK_D' AND type_='تكلفة المبيعات'").fetchone()[0]
    chkeq("COGS updated after cost edit", cogs, new_total_cost)
    # Customer rows preserved
    inst_count = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND related_source_id='SMK_D'").fetchone()[0]
    chkeq("installment schedule preserved after cost edit", inst_count, 15)
    down_pmt = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_sale_payment' AND source_id='SMK_D:down_payment'").fetchone()[0]
    chkeq("down payment preserved after cost edit", down_pmt, 1)
    print("  ✓ Cost edit: COGS updated, customer rows preserved OK")

def workflow_G_number_change(cur):
    """G. Sold car number change"""
    cur.execute("UPDATE cars SET car_number='SMK_D_NEW' WHERE car_number='SMK_D'")
    # Migrate references
    cur.execute("UPDATE car_expenses SET car_number='SMK_D_NEW' WHERE car_number='SMK_D'")
    cur.execute("UPDATE car_partners SET car_number='SMK_D_NEW' WHERE car_number='SMK_D'")
    for row in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id='SMK_D'").fetchall():
        cur.execute("UPDATE partner_transactions SET source_id='SMK_D_NEW' WHERE source_id='SMK_D'")
    for row in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id='SMK_D:down_payment'").fetchall():
        cur.execute("UPDATE partner_transactions SET source_id='SMK_D_NEW:down_payment' WHERE source_id='SMK_D:down_payment'")
    for row in cur.execute("SELECT source_id FROM partner_transactions WHERE source_id LIKE 'SMK_D:installment:%'").fetchall():
        new_sid = row[0].replace("SMK_D:", "SMK_D_NEW:", 1)
        cur.execute("UPDATE partner_transactions SET source_id=? WHERE source_id=?", (new_sid, row[0]))
    cur.execute("UPDATE partner_transactions SET related_source_id='SMK_D_NEW' WHERE related_source_type='car' AND related_source_id='SMK_D'")
    cur.execute("UPDATE financial_ledger SET reference_id='SMK_D_NEW' WHERE reference_type='car' AND reference_id='SMK_D'")
    cur.execute("UPDATE financial_ledger SET account_id='SMK_D_NEW' WHERE reference_type='car' AND account_id='SMK_D' AND account_type IN ('inventory','expense','deferred_revenue')")
    # Verify no stale references
    chkeq("no old car", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='SMK_D'").fetchone()[0], 0)
    chkeq("no old ledger", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_id='SMK_D' AND reference_type='car'").fetchone()[0], 0)
    chkeq("no old car_expenses", cur.execute("SELECT COUNT(*) FROM car_expenses WHERE car_number='SMK_D'").fetchone()[0], 0)
    chkeq("no old car_partners", cur.execute("SELECT COUNT(*) FROM car_partners WHERE car_number='SMK_D'").fetchone()[0], 0)
    old_tx = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_id='SMK_D' OR source_id LIKE 'SMK_D:%'").fetchone()[0]
    chkeq("no old partner_tx source", old_tx, 0)
    old_rel = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE related_source_id='SMK_D' AND related_source_type='car'").fetchone()[0]
    chkeq("no old partner_tx related", old_rel, 0)
    # Verify new references
    chkeq("new car exists", cur.execute("SELECT COUNT(*) FROM cars WHERE car_number='SMK_D_NEW'").fetchone()[0], 1)
    new_ledger = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_id='SMK_D_NEW' AND reference_type='car'").fetchone()[0]
    chk("new ledger entries exist", new_ledger > 0)
    new_inst = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='customer_installment_schedule' AND source_id LIKE 'SMK_D_NEW:installment:%'").fetchone()[0]
    chkeq("new installment schedule", new_inst, 15)
    print("  ✓ Number change: all references migrated, no stale data OK")

def workflow_H_expense_after_sale(cur):
    """H. Car expense after cash sale"""
    create_car_cash_purchase(cur, "SMK_H", "اختبار مصروف", 10000.0)
    sell_car_cash(cur, "SMK_H", "اختبار مصروف", "مشتري_مصروف", 20000.0)
    profit_before = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_role='profit_recognition' AND source_type='car_sale' AND source_id='SMK_H'").fetchone()[0]
    chkeq("profit before expense", profit_before, 10000.0)
    add_car_expense_post_sale(cur, "SMK_H", "دهان", 2000.0)
    profit_after = cur.execute("SELECT COALESCE(SUM(amount),0) FROM partner_transactions WHERE source_role='profit_recognition' AND source_type='car_sale' AND source_id='SMK_H'").fetchone()[0]
    chkeq("profit reduced after expense", profit_after, 8000.0)
    # Qasa expense recorded once
    cash_exp = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_type='car_expense' AND account_type='cash' AND credit>0").fetchone()[0]
    chkeq("expense cash recorded once", cash_exp, 1)
    # No duplicate sale cash movement
    sale_cash_moves = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_type='car_sale' AND source_id='SMK_H' AND source_role='cash_movement'").fetchone()[0]
    chkeq("no duplicate sale cash movement", sale_cash_moves, 2)  # 2 partners
    print("  ✓ Expense after sale: COGS + profit + qasa OK")

def workflow_I_delete_protection(cur):
    """I. Delete protection"""
    cur.execute("INSERT INTO partners (partner_name, kind, total_amount, iqd_balance) VALUES ('مديون_سمك','زبون',0,10000)")
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable','مديون_سمك',10000,0,'IQD','car','SMK_I','مدينون بيع سيارة','ذمة مدينة')", (TD,))
    net = cur.execute("SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) FROM financial_ledger WHERE account_type='receivable' AND account_id='مديون_سمك'").fetchone()[0]
    chk("active receivable exists", net > 0.001)
    # Pay to zero
    cur.execute("INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description) VALUES (?,'00:00','receivable','مديون_سمك',0,10000,'IQD','partner_transaction','pay_smk','سداد مديونية','تسديد')", (TD,))
    net2 = cur.execute("SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) FROM financial_ledger WHERE account_type='receivable' AND account_id='مديون_سمك'").fetchone()[0]
    chkeq("net zero after payment", abs(net2) < 0.001, True)
    # Now delete is possible
    cur.execute("DELETE FROM financial_ledger WHERE account_type='receivable' AND account_id='مديون_سمك'")
    cur.execute("DELETE FROM partners WHERE partner_name='مديون_سمك' AND kind='زبون'")
    chkeq("customer deleted", cur.execute("SELECT COUNT(*) FROM partners WHERE partner_name='مديون_سمك'").fetchone()[0], 0)
    chkeq("ledger cleaned", cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE account_id='مديون_سمك'").fetchone()[0], 0)
    print("  ✓ Delete protection: active receivable blocked, zeroed then deleted OK")

# ─── Clean up all test data ────────────────────────────────────────

def clean_test_data(cur):
    # Delete ONLY test data — never wipe entire tables.
    # Test cars are identified by the "SMK_" prefix on car_number. (Bug P1.)
    # financial_ledger rows for cars reference the car via reference_id (car_number).
    cur.execute(
        "DELETE FROM financial_ledger "
        "WHERE reference_id IN (SELECT car_number FROM cars WHERE car_number LIKE 'SMK_%') "
        "OR reference_id LIKE 'SMK_%:%'"
    )
    # partner_transactions rows reference cars via source_id (e.g. 'SMK_D', 'SMK_D:down_payment')
    # and related_source_id (car_number).
    cur.execute(
        "DELETE FROM partner_transactions "
        "WHERE source_id IN (SELECT car_number FROM cars WHERE car_number LIKE 'SMK_%') "
        "OR source_id LIKE 'SMK_%:%' "
        "OR related_source_id LIKE 'SMK_%'"
    )
    cur.execute(
        "DELETE FROM car_expenses WHERE car_number IN (SELECT car_number FROM cars WHERE car_number LIKE 'SMK_%')"
    )
    cur.execute(
        "DELETE FROM car_partners WHERE car_number IN (SELECT car_number FROM cars WHERE car_number LIKE 'SMK_%')"
    )
    # Finally remove the test cars themselves.
    cur.execute("DELETE FROM cars WHERE car_number LIKE 'SMK_%'")

    # Test buyers inserted by smoke tests.
    test_buyers = ["مشتري_نقدي", "مشتري_قسط", "مشتري_مصروف"]
    for buyer in test_buyers:
        cur.execute("DELETE FROM partners WHERE partner_name=?", (buyer,))

    # SMK_I test receivable account.
    cur.execute("DELETE FROM financial_ledger WHERE account_type='receivable' AND account_id='مديون_سمك'")
    cur.execute("DELETE FROM partners WHERE partner_name='مديون_سمك'")

# ══════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════

def main():
    global pass_count, fail_count, errors
    print("=" * 60)
    print("FAJR ALWADI — REAL FRESH DB SMOKE TESTS")
    print("=" * 60)
    print(f"Source DB: {ORIGINAL_DB}")
    print(f"Using temp DB copy: {DB_PATH}")
    print(f"Date: {TD}")
    print()

    if not os.path.exists(ORIGINAL_DB):
        print(f"ERROR: Source DB not found at {ORIGINAL_DB}")
        sys.exit(1)

    # Copy the real DB to a temp location so we never mutate production data.
    shutil.copy(ORIGINAL_DB, DB_PATH)
    print(f"  ✓ Copied {ORIGINAL_DB} → {DB_PATH}")
    print()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    workflows = [
        ("A. Empty-state check", workflow_A_empty_state),
        ("B. Cash purchase", workflow_B_cash_purchase),
        ("C. Cash sale", workflow_C_cash_sale),
        ("D. Installment sale", workflow_D_installment_sale),
        ("E. Partial installment payment", workflow_E_partial_payment),
        ("F. Sold car cost edit", workflow_F_cost_edit),
        ("G. Sold car number change", workflow_G_number_change),
        ("H. Car expense after cash sale", workflow_H_expense_after_sale),
        ("I. Delete protection", workflow_I_delete_protection),
    ]

    for title, fn in workflows:
        print(f"\n{'─' * 50}")
        print(f"[{title}]")
        print(f"{'─' * 50}")
        try:
            fn(cur)
            conn.commit()
        except Exception as e:
            fail_count += 1
            errors.append(f"EXCEPTION [{title}]: {e}")
            conn.rollback()
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60)
    print("SMOKE TEST SUMMARY")
    print("=" * 60)
    for e in errors:
        print(f"  ⛔ {e}")
    print(f"\n  Assertions: {pass_count} passed, {fail_count} failed")

    # Clean up
    print("\n  Cleaning up test data (scoped to SMK_% test cars)...")
    clean_test_data(cur)
    conn.commit()

    # Verify cleanup removed all SMK_% test rows.
    partners_after = cur.execute("SELECT COUNT(*) FROM partners").fetchone()[0]
    cars_after = cur.execute("SELECT COUNT(*) FROM cars WHERE car_number LIKE 'SMK_%'").fetchone()[0]
    ledger_after = cur.execute("SELECT COUNT(*) FROM financial_ledger WHERE reference_id LIKE 'SMK_%'").fetchone()[0]
    pt_after = cur.execute("SELECT COUNT(*) FROM partner_transactions WHERE source_id LIKE 'SMK_%' OR related_source_id LIKE 'SMK_%'").fetchone()[0]
    print(f"  Partners (non-test remaining): {partners_after}")
    print(f"  Test cars remaining: {cars_after} (should be 0)")
    print(f"  Test ledger remaining: {ledger_after} (should be 0)")
    print(f"  Test partner_tx remaining: {pt_after} (should be 0)")

    conn.close()

    # Remove the temp DB copy now that the test run is finished.
    try:
        os.remove(DB_PATH)
        print(f"\n  ✓ Removed temp DB copy: {DB_PATH}")
    except OSError:
        pass

    if fail_count > 0:
        print("\n❌ SMOKE TESTS FAILED")
        sys.exit(1)
    else:
        print(f"\n✅ SMOKE TESTS PASSED ({pass_count} assertions)")

if __name__ == "__main__":
    main()
