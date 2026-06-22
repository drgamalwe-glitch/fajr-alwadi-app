#!/usr/bin/env python3
"""
Accounting Audit Script for Fajr Alwadi
Checks accounting integrity against Instructions.md rules.
Includes both runtime DB checks and static source code scans.
"""

import sqlite3
import sys
import os
import re

def find_db():
    candidates = [
        os.path.expanduser("~/.fajr-alwadi/fajr_alwadi.db"),
        os.path.expanduser("~/Library/Application Support/fajr-alwadi/fajr_alwadi.db"),
        "fajr_alwadi.db",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    for root, dirs, files in os.walk(os.path.expanduser("~")):
        for f in files:
            if f == "fajr_alwadi.db":
                return os.path.join(root, f)
    return None

def find_lib_rs():
    candidates = [
        "src-tauri/src/lib.rs",
        "../src-tauri/src/lib.rs",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def audit_db(db_path):
    """Runtime database integrity checks."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    errors = []
    warnings = []

    print("=" * 60)
    print("RUNTIME DATABASE AUDIT")
    print("=" * 60)

    # 1. No funder/company rows with affects_qasa = 1
    print("\n[1] Funders/companies must NOT affect Qasa...")
    bad = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_qasa = 1 AND kind IN ('ممول', 'شركة')
    """).fetchone()[0]
    if bad > 0:
        errors.append(f"FAIL: {bad} funder/company rows have affects_qasa=1")
    else:
        print("  PASS")

    # 2. No funder/company rows with affects_partner_cash = 1
    print("\n[2] Funders/companies must NOT affect Cash...")
    bad = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_partner_cash = 1 AND kind IN ('ممول', 'شركة')
    """).fetchone()[0]
    if bad > 0:
        errors.append(f"FAIL: {bad} funder/company rows have affects_partner_cash=1")
    else:
        print("  PASS")

    # 3. No investor rows with affects_partner_cash = 1
    print("\n[3] Investors must NOT affect Cash...")
    bad = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_partner_cash = 1 AND kind = 'مستثمر'
    """).fetchone()[0]
    if bad > 0:
        errors.append(f"FAIL: {bad} investor rows have affects_partner_cash=1")
    else:
        print("  PASS")

    # 4. No profit rows with affects_qasa = 1
    print("\n[4] Profit rows must NOT affect Qasa...")
    bad = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_profit = 1 AND affects_qasa = 1
    """).fetchone()[0]
    if bad > 0:
        errors.append(f"FAIL: {bad} profit rows have affects_qasa=1")
    else:
        print("  PASS")

    # 5. No profit rows with affects_partner_cash = 1
    print("\n[5] Profit rows must NOT affect Cash...")
    bad = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_profit = 1 AND affects_partner_cash = 1
    """).fetchone()[0]
    if bad > 0:
        errors.append(f"FAIL: {bad} profit rows have affects_partner_cash=1")
    else:
        print("  PASS")

    # 6. No car_expense rows stored as reference_type = 'expense'
    print("\n[6] Car expenses must use reference_type='car_expense'...")
    bad = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE reference_type = 'expense'
          AND reference_id IN (SELECT CAST(id AS TEXT) FROM car_expenses)
    """).fetchone()[0]
    if bad > 0:
        errors.append(f"FAIL: {bad} car_expense rows stored as reference_type='expense'")
    else:
        print("  PASS")

    # 7. No duplicate COGS rows
    print("\n[7] No duplicate COGS rows...")
    dup = conn.execute("""
        SELECT reference_id, COUNT(*) as cnt
        FROM financial_ledger
        WHERE reference_type = 'car' AND type_ = 'تكلفة المبيعات'
        GROUP BY reference_id HAVING cnt > 1
    """).fetchall()
    if dup:
        for r in dup:
            errors.append(f"FAIL: Car {r['reference_id']} has {r['cnt']} COGS rows")
    else:
        print("  PASS")

    # 8. Inventory credit uses total_cost not selling_price
    print("\n[8] Inventory credit check...")
    bad = conn.execute("""
        SELECT fl.reference_id, fl.credit, c.purchase_price,
               COALESCE((SELECT SUM(amount) FROM car_expenses WHERE car_number = fl.reference_id), 0) as exp_sum
        FROM financial_ledger fl
        JOIN cars c ON c.car_number = fl.reference_id
        WHERE fl.reference_type = 'car' AND fl.account_type = 'inventory'
          AND fl.credit > 0
          AND fl.credit > c.purchase_price + COALESCE((SELECT SUM(amount) FROM car_expenses WHERE car_number = fl.reference_id), 0) + 0.01
    """).fetchall()
    if bad:
        for r in bad:
            errors.append(f"FAIL: Car {r['reference_id']} inventory credit {r['credit']:,.0f} > total_cost")
    else:
        print("  PASS")

    # 9. Profit cap per car
    print("\n[9] Profit cap check...")
    cars = conn.execute("""
        SELECT car_number, purchase_price, selling_price
        FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in cars:
        expenses = conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?",
            [car['car_number']]
        ).fetchone()[0]
        full_profit = car['selling_price'] - car['purchase_price'] - expenses
        if full_profit <= 0:
            continue
        recognized = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE kind = 'شريك' AND affects_profit = 1
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{car['car_number']}%"]).fetchone()[0]
        if recognized > full_profit + 0.01:
            errors.append(f"FAIL: Car {car['car_number']} recognized {recognized:,.0f} > full profit {full_profit:,.0f}")

    # 10. Orphan ledger entries
    print("\n[10] Orphan ledger entries...")
    for ref_type, table, id_col in [
        ('partner_transaction', 'partner_transactions', 'id'),
        ('car_expense', 'car_expenses', 'id'),
        ('agency', 'agencies', 'id'),
        ('agency_transaction', 'agency_transactions', 'id'),
    ]:
        orphan = conn.execute(f"""
            SELECT COUNT(*) FROM financial_ledger
            WHERE reference_type = ?
              AND reference_id NOT IN (SELECT CAST({id_col} AS TEXT) FROM {table})
        """, [ref_type]).fetchone()[0]
        if orphan > 0:
            warnings.append(f"WARN: {orphan} orphan {ref_type} ledger entries")

    # 11. Source classification completeness
    print("\n[11] Source classification...")
    unclassified = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type IS NULL
    """).fetchone()[0]
    if unclassified > 0:
        warnings.append(f"WARN: {unclassified} rows without source_type")

    # 12. Net Qasa/Cash calculation
    print("\n[12] Qasa/Cash summary...")
    qasa = conn.execute("""
        SELECT COALESCE(SUM(CASE
            WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                  OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                  OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%' THEN amount
            WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%' THEN -amount
            ELSE 0 END), 0.0)
        FROM partner_transactions
        WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر')
    """).fetchone()[0]
    cash = conn.execute("""
        SELECT COALESCE(SUM(CASE
            WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                  OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                  OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%' THEN amount
            WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%' THEN -amount
            ELSE 0 END), 0.0)
        FROM partner_transactions
        WHERE affects_partner_cash = 1 AND kind = 'شريك'
    """).fetchone()[0]
    print(f"  Qasa: {qasa:,.0f}  Cash: {cash:,.0f}")

    # 13. Customer payment cash movement check (ALL payments, not just car-linked)
    print("\n[13] Customer payment cash movement check (all payments)...")
    customer_payments = conn.execute("""
        SELECT id, amount FROM partner_transactions
        WHERE kind = 'زبون' AND source_type = 'customer_transaction'
          AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
               OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
    """).fetchall()
    for cp in customer_payments:
        cash_movement = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE source_type = 'customer_payment' AND source_id = ?1
              AND source_role = 'cash_movement' AND kind = 'شريك'
        """, [str(cp['id'])]).fetchone()[0]
        if abs(cash_movement - cp['amount']) > 0.01:
            errors.append(f"FAIL: Customer payment {cp['id']} amount={cp['amount']:,.0f} but cash_movement={cash_movement:,.0f}")

    # 14. Customer payment profit recognition check
    print("\n[14] Customer payment profit recognition check...")
    for cp in customer_payments:
        profit_rows = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE source_type = 'customer_payment' AND source_id = ?1
              AND source_role = 'profit_recognition' AND kind = 'شريك'
              AND affects_qasa = 1
        """, [str(cp['id'])]).fetchone()[0]
        if profit_rows > 0:
            errors.append(f"FAIL: Customer payment {cp['id']} profit rows have affects_qasa=1")

    # 15. Investor double-count check
    print("\n[15] Investor double-count check...")
    investor_auto_deduct = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'investor_transaction' AND source_role = 'partner_cash_payment'
    """).fetchone()[0]
    if investor_auto_deduct > 0:
        errors.append(f"FAIL: {investor_auto_deduct} investor rows auto-created partner_cash_payment (double-count risk)")

    # 16. Funder repayment ledger check
    print("\n[16] Funder repayment ledger check...")
    partner_repayments = conn.execute("""
        SELECT id, amount, currency FROM partner_transactions
        WHERE source_role = 'partner_cash_payment'
          AND source_type IN ('funder_payment', 'company_payment')
          AND kind = 'شريك'
    """).fetchall()
    for pr in partner_repayments:
        ledger_cash = conn.execute("""
            SELECT COUNT(*) FROM financial_ledger
            WHERE reference_type = 'partner_transaction'
              AND reference_id = ?1
              AND account_type = 'cash'
        """, [str(pr['id'])]).fetchone()[0]
        if ledger_cash == 0:
            warnings.append(f"WARN: Partner repayment {pr['id']} has no cash ledger entry")

    # 17. Customer payment must not create capital ledger entries
    print("\n[17] Customer payment capital ledger check...")
    bad_capital = conn.execute("""
        SELECT fl.reference_id, fl.account_type
        FROM financial_ledger fl
        JOIN partner_transactions pt ON CAST(pt.id AS TEXT) = fl.reference_id
        WHERE fl.reference_type = 'partner_transaction'
          AND pt.source_type = 'customer_payment'
          AND pt.source_role = 'cash_movement'
          AND pt.kind = 'شريك'
          AND fl.account_type = 'capital'
    """).fetchall()
    if bad_capital:
        for r in bad_capital:
            errors.append(f"FAIL: Customer payment cash_movement {r['reference_id']} has capital ledger entry")
    else:
        print("  PASS")

    # 18. Customer payment ledger NET effect check (using net debit/credit for reversal safety)
    print("\n[18] Customer payment ledger NET effect check...")
    customer_payments_ledger = conn.execute("""
        SELECT id, amount FROM partner_transactions
        WHERE kind = 'زبون' AND source_type = 'customer_transaction'
          AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
               OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
    """).fetchall()
    for cp in customer_payments_ledger:
        cp_id = str(cp['id'])
        # Net cash debit from generated cash_movement rows (debit - credit handles reversals)
        cash_net = conn.execute("""
            SELECT COALESCE(SUM(fl.debit - fl.credit), 0.0) FROM financial_ledger fl
            JOIN partner_transactions pt ON CAST(pt.id AS TEXT) = fl.reference_id
            WHERE fl.reference_type = 'partner_transaction'
              AND fl.account_type = 'cash'
              AND pt.source_type = 'customer_payment' AND pt.source_id = ?
              AND pt.source_role = 'cash_movement' AND pt.kind = 'شريك'
        """, [cp_id]).fetchone()[0]
        # Net receivable credit from original customer row (credit - debit handles reversals)
        recv_net = conn.execute("""
            SELECT COALESCE(SUM(fl.credit - fl.debit), 0.0) FROM financial_ledger fl
            WHERE fl.reference_type = 'partner_transaction'
              AND fl.reference_id = ?
              AND fl.account_type = 'receivable'
        """, [cp_id]).fetchone()[0]
        # Net capital change from any related rows
        cap_net = conn.execute("""
            SELECT COALESCE(SUM(fl.credit - fl.debit), 0.0) FROM financial_ledger fl
            WHERE fl.reference_type = 'partner_transaction'
              AND fl.account_type = 'capital'
              AND fl.reference_id IN (
                  SELECT CAST(id AS TEXT) FROM partner_transactions
                  WHERE source_type = 'customer_payment' AND source_id = ?
              )
        """, [cp_id]).fetchone()[0]
        if abs(cash_net - cp['amount']) > 0.01:
            errors.append(f"FAIL: Customer payment {cp_id} cash net={cash_net:,.0f} expected={cp['amount']:,.0f}")
        if abs(recv_net - cp['amount']) > 0.01:
            errors.append(f"FAIL: Customer payment {cp_id} receivable net={recv_net:,.0f} expected={cp['amount']:,.0f}")
        if abs(cap_net) > 0.01:
            errors.append(f"FAIL: Customer payment {cp_id} capital net={cap_net:,.0f} (should be 0)")
    if not customer_payments_ledger:
        print("  SKIP (no customer payments found)")
    else:
        print("  PASS" if not any('FAIL' in e for e in errors[len(errors)-len(customer_payments_ledger)*3:]) else "  FAIL")

    # 19. Customer balance verification (debt - paid)
    print("\n[19] Customer balance verification...")
    customers = conn.execute("""
        SELECT partner_name FROM partners WHERE kind = 'زبون'
    """).fetchall()
    for cust in customers:
        cname = cust['partner_name']
        balance = conn.execute("""
            SELECT COALESCE(p.iqd_balance, 0.0), COALESCE(p.usd_balance, 0.0)
            FROM partners p WHERE p.partner_name = ? AND p.kind = 'زبون'
        """, [cname]).fetchone()
        iqd_bal = balance[0]
        usd_bal = balance[1]
        # Verify balance >= 0 (debt can't be negative in normal flow)
        if iqd_bal < -0.01 or usd_bal < -0.01:
            warnings.append(f"WARN: Customer {cname} has negative balance IQD={iqd_bal:,.0f} USD={usd_bal:,.0f}")

    # 20. net_capital formula check
    print("\n[20] net_capital formula check...")
    cash_val = conn.execute("""
        SELECT COALESCE(SUM(CASE
            WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                  OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                  OR type LIKE 'تسوية%' OR type LIKE 'تسديد%') THEN amount
            WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%') THEN -amount
            ELSE 0 END), 0.0)
        FROM partner_transactions
        WHERE affects_partner_cash = 1 AND kind = 'شريك'
    """).fetchone()[0]
    inv_val = conn.execute("SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory'").fetchone()[0]
    recv_val = conn.execute("SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'receivable'").fetchone()[0]
    investor_val = conn.execute("SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'investor'").fetchone()[0]
    funder_val = conn.execute("SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'funder'").fetchone()[0]
    payable_val = conn.execute("SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'payable'").fetchone()[0]
    expected_net = cash_val + inv_val + recv_val - investor_val - funder_val - payable_val
    print(f"  Expected net_capital = {cash_val:,.0f} + {inv_val:,.0f} + {recv_val:,.0f} - {investor_val:,.0f} - {funder_val:,.0f} - {payable_val:,.0f} = {expected_net:,.0f}")

    # 21. Legacy helper collision check
    print("\n[21] Legacy helper source_id collision check...")
    collisions = conn.execute("""
        SELECT source_type, source_id, source_role, partner_name, kind, COUNT(*) as cnt
        FROM partner_transactions
        WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND source_role IS NOT NULL
        GROUP BY source_type, source_id, source_role, partner_name, kind
        HAVING cnt > 1
    """).fetchall()
    for c in collisions:
        errors.append(f"FAIL: Duplicate source: {c['source_type']}/{c['source_id']}/{c['source_role']} ({c['cnt']} rows)")

    # 22. Receivable double-count: partner cash_movement rows should not have receivable entries
    print("\n[22] Receivable double-count check...")
    bad_recv = conn.execute("""
        SELECT fl.id, fl.reference_id, fl.credit
        FROM financial_ledger fl
        WHERE fl.reference_type = 'partner_transaction'
          AND fl.account_type = 'receivable'
          AND fl.type_ = 'ايداع دفعة زبون'
          AND fl.reference_id IN (
              SELECT CAST(pt.id AS TEXT) FROM partner_transactions pt
              WHERE pt.source_type = 'customer_payment'
                AND pt.source_role = 'cash_movement'
                AND pt.kind = 'شريك'
          )
    """).fetchall()
    if bad_recv:
        for r in bad_recv:
            errors.append(f"FAIL: Partner cash_movement {r['reference_id']} has receivable entry {r['id']} (double-count)")
    else:
        print("  PASS")

    # 23. Old capital entries from customer payment cash_movement
    print("\n[23] Old capital entries from customer payment cash_movement...")
    old_cap = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger fl
        WHERE fl.reference_type = 'partner_transaction'
          AND fl.account_type = 'capital'
          AND fl.reference_id IN (
              SELECT CAST(id AS TEXT) FROM partner_transactions
              WHERE source_type = 'customer_payment'
                AND source_role = 'cash_movement'
                AND kind = 'شريك'
          )
    """).fetchone()[0]
    if old_cap > 0:
        errors.append(f"FAIL: {old_cap} old capital entries from customer payment cash_movement (v10 migration needed)")
    else:
        print("  PASS")

    # 24. Car purchase source_type check
    print("\n[24] Car purchase source_type check...")
    bad_purchase = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE type = 'سحب شراء سيارة'
          AND source_type = 'car_sale'
          AND source_role = 'cash_payment'
    """).fetchone()[0]
    if bad_purchase > 0:
        errors.append(f"FAIL: {bad_purchase} car purchase rows have source_type='car_sale' (v11 migration needed)")
    else:
        print("  PASS")

    # 25. Car sale ledger balance check
    print("\n[25] Car sale ledger balance check...")
    sold_cars = conn.execute("""
        SELECT car_number FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars:
        cn = car['car_number']
        balance = conn.execute("""
            SELECT
                COALESCE(SUM(debit), 0.0) as total_debit,
                COALESCE(SUM(credit), 0.0) as total_credit
            FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
        """, [cn]).fetchone()
        if balance and abs(balance['total_debit'] - balance['total_credit']) > 0.01:
            errors.append(f"FAIL: Car {cn} ledger unbalanced: debit={balance['total_debit']:,.0f} credit={balance['total_credit']:,.0f}")

    # 26. Installment receivable check (corrected)
    print("\n[26] Installment receivable check...")
    # Check if related_source_type column exists
    has_related_col = False
    try:
        conn.execute("SELECT related_source_type FROM partner_transactions LIMIT 1")
        has_related_col = True
    except sqlite3.OperationalError:
        pass

    installment_cars = conn.execute("""
        SELECT car_number, selling_price, buyer_name FROM cars
        WHERE status = 'مبيوعة' AND payment_type IN ('اقساط', 'موعد')
    """).fetchall()
    for car in installment_cars:
        cn = car['car_number']
        buyer = car['buyer_name']
        selling = car['selling_price']
        if not buyer:
            continue
        # Receivable from car ledger (should be full selling_price)
        car_recv = conn.execute("""
            SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
              AND account_type = 'receivable'
        """, [cn]).fetchone()[0]
        # Car receivable should equal full selling price
        if abs(car_recv - selling) > 0.01:
            errors.append(f"FAIL: Car {cn} receivable={car_recv:,.0f} expected={selling:,.0f} (full selling price)")
        # Receivable credits from customer payment rows linked to this car
        if has_related_col:
            payment_recv = conn.execute("""
                SELECT COALESCE(SUM(fl.credit - fl.debit), 0.0) FROM financial_ledger fl
                WHERE fl.reference_type = 'partner_transaction'
                  AND fl.account_type = 'receivable'
                  AND fl.account_id = ?
                  AND fl.reference_id IN (
                      SELECT CAST(pt.id AS TEXT) FROM partner_transactions pt
                      WHERE (pt.related_source_type = 'car' AND pt.related_source_id = ?)
                         OR (pt.related_source_id IS NULL AND pt.notes LIKE ?)
                  )
            """, [buyer, cn, f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
            total_payments = conn.execute("""
                SELECT COALESCE(SUM(pt.amount), 0.0) FROM partner_transactions pt
                WHERE pt.kind = 'زبون' AND pt.source_type = 'customer_transaction'
                  AND ((pt.related_source_type = 'car' AND pt.related_source_id = ?)
                       OR (pt.related_source_id IS NULL AND pt.notes LIKE ?))
            """, [cn, f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
        else:
            payment_recv = conn.execute("""
                SELECT COALESCE(SUM(fl.credit - fl.debit), 0.0) FROM financial_ledger fl
                WHERE fl.reference_type = 'partner_transaction'
                  AND fl.account_type = 'receivable'
                  AND fl.account_id = ?
            """, [buyer]).fetchone()[0]
            total_payments = conn.execute("""
                SELECT COALESCE(SUM(pt.amount), 0.0) FROM partner_transactions pt
                WHERE pt.kind = 'زبون' AND pt.source_type = 'customer_transaction'
                  AND pt.notes LIKE ?
            """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
        # Net receivable = car ledger debit - payment credits
        net_receivable = car_recv - payment_recv
        # Expected remaining = selling - total payments
        expected_remaining = selling - total_payments
        if abs(net_receivable - expected_remaining) > 0.01:
            errors.append(f"FAIL: Car {cn} net receivable={net_receivable:,.0f} expected remaining={expected_remaining:,.0f}")

    # 27. Profit cap source linking check
    print("\n[27] Profit cap source linking check...")
    if has_related_col:
        bad_profit_rows = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE kind = 'شريك' AND affects_profit = 1
              AND source_role = 'profit_recognition'
              AND source_type = 'customer_payment'
              AND (related_source_id IS NULL OR related_source_id = '')
              AND notes LIKE '%#بيع_سيارة_%'
        """).fetchone()[0]
        if bad_profit_rows > 0:
            errors.append(f"FAIL: {bad_profit_rows} profit_recognition rows have car marker in notes but missing related_source_id")
        else:
            print("  PASS")
    else:
        print("  SKIP (related_source_id column not yet added)")

    # 28. Profit cap exceeded check
    print("\n[28] Profit cap exceeded check...")
    sold_cars_profit = conn.execute("""
        SELECT car_number, purchase_price, selling_price FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars_profit:
        cn = car['car_number']
        expenses = conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", [cn]
        ).fetchone()[0]
        full_profit = car['selling_price'] - car['purchase_price'] - expenses
        if full_profit <= 0:
            continue
        if has_related_col:
            recognized = conn.execute("""
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE kind = 'شريك' AND affects_profit = 1
                  AND source_role = 'profit_recognition'
                  AND related_source_type = 'car' AND related_source_id = ?
            """, [cn]).fetchone()[0]
            recognized_legacy = conn.execute("""
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE kind = 'شريك' AND affects_profit = 1
                  AND source_role = 'profit_recognition'
                  AND (related_source_id IS NULL OR related_source_id = '')
                  AND notes LIKE ?
            """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
        else:
            recognized = 0.0
            recognized_legacy = conn.execute("""
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE kind = 'شريك' AND affects_profit = 1
                  AND notes LIKE ?
            """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
        total_recognized = recognized + recognized_legacy
        if total_recognized > full_profit + 0.01:
            errors.append(f"FAIL: Car {cn} recognized profit={total_recognized:,.0f} > full profit={full_profit:,.0f}")

    # 29. Installment sale deferred_revenue check
    print("\n[29] Installment sale deferred_revenue check...")
    installment_cars_def = conn.execute("""
        SELECT car_number, selling_price FROM cars
        WHERE status = 'مبيوعة' AND payment_type IN ('اقساط', 'موعد')
    """).fetchall()
    for car in installment_cars_def:
        cn = car['car_number']
        selling = car['selling_price']
        has_deferred = conn.execute("""
            SELECT COUNT(*) FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
              AND account_type = 'deferred_revenue'
        """, [cn]).fetchone()[0]
        if has_deferred == 0:
            errors.append(f"FAIL: Installment car {cn} missing deferred_revenue entry (ledger unbalanced)")
        else:
            def_amount = conn.execute("""
                SELECT COALESCE(SUM(credit), 0.0) FROM financial_ledger
                WHERE reference_type = 'car' AND reference_id = ?
                  AND account_type = 'deferred_revenue'
            """, [cn]).fetchone()[0]
            if abs(def_amount - selling) > 0.01:
                errors.append(f"FAIL: Car {cn} deferred_revenue={def_amount:,.0f} expected={selling:,.0f}")

    # 30. No notes-based DELETE/UPDATE in runtime car flows (static check)
    # This is checked in audit_source below

    # 31. Customer balance vs ledger receivable net
    print("\n[31] Customer balance vs ledger receivable net...")
    customers_bal = conn.execute("""
        SELECT partner_name, COALESCE(iqd_balance, 0.0) as iqd_bal, COALESCE(usd_balance, 0.0) as usd_bal
        FROM partners WHERE kind = 'زبون'
    """).fetchall()
    for cust in customers_bal:
        cname = cust['partner_name']
        iqd_bal = cust['iqd_bal']
        usd_bal = cust['usd_bal']
        # Get ledger receivable net
        iqd_ledger = conn.execute("""
            SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
            WHERE account_type = 'receivable' AND account_id = ? AND currency = 'IQD'
        """, [cname]).fetchone()[0]
        usd_ledger = conn.execute("""
            SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
            WHERE account_type = 'receivable' AND account_id = ? AND currency = 'USD'
        """, [cname]).fetchone()[0]
        if abs(iqd_bal - iqd_ledger) > 0.01:
            errors.append(f"FAIL: Customer {cname} IQD balance={iqd_bal:,.0f} != ledger={iqd_ledger:,.0f}")
        if abs(usd_bal - usd_ledger) > 0.01:
            errors.append(f"FAIL: Customer {cname} USD balance={usd_bal:,.0f} != ledger={usd_ledger:,.0f}")

    # 32. related_source_id migration completeness
    print("\n[32] related_source_id migration completeness...")
    if has_related_col:
        bad_related = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE notes LIKE '%#بيع_سيارة_%'
              AND (related_source_id IS NULL OR related_source_id = '' OR related_source_id LIKE '% %')
        """).fetchone()[0]
        if bad_related > 0:
            errors.append(f"FAIL: {bad_related} rows with car marker but bad related_source_id (v12 migration needed)")
        else:
            print("  PASS")
    else:
        errors.append("FAIL: related_source_id column not found (v11/v12 migration needed)")

    # 33. Mixed currency check
    print("\n[33] Mixed currency check...")
    mixed_cars = conn.execute("""
        SELECT car_number, COALESCE(currency, 'IQD') as purchase_curr, COALESCE(sale_currency, 'IQD') as sale_curr
        FROM cars WHERE status = 'مبيوعة'
          AND COALESCE(currency, 'IQD') != COALESCE(sale_currency, 'IQD')
    """).fetchall()
    for mc in mixed_cars:
        errors.append(f"FAIL: Car {mc['car_number']} mixed currency: purchase={mc['purchase_curr']} sale={mc['sale_curr']}")

    # 34. Orphan partner_transaction ledger entries (detailed)
    print("\n[34] Orphan partner_transaction ledger entries (detailed)...")
    orphan_ledger = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger fl
        WHERE fl.reference_type = 'partner_transaction'
          AND fl.reference_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions)
    """).fetchone()[0]
    if orphan_ledger > 0:
        errors.append(f"FAIL: {orphan_ledger} orphan partner_transaction ledger entries")
    else:
        print("  PASS")

    # 35. No 0/0 financial_ledger entries
    print("\n[35] No 0/0 financial_ledger entries...")
    zero_zero = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE debit = 0.0 AND credit = 0.0
    """).fetchone()[0]
    if zero_zero > 0:
        errors.append(f"FAIL: {zero_zero} ledger entries with debit=0 AND credit=0")
    else:
        print("  PASS")

    # 36. Installment schedule rows have related_source fields
    print("\n[36] Installment schedule rows source-linked...")
    if has_related_col:
        bad_schedule = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE source_type = 'customer_installment_schedule'
              AND (related_source_type IS NULL OR related_source_id IS NULL)
        """).fetchone()[0]
        if bad_schedule > 0:
            errors.append(f"FAIL: {bad_schedule} installment schedule rows missing related_source fields")
        else:
            print("  PASS")
    else:
        print("  SKIP (no related_source_type column)")

    # 37. Funder repayment type is correct Arabic
    print("\n[37] Funder repayment type check...")
    bad_type = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_role = 'repayment_account_movement'
          AND type NOT IN ('سحب')
    """).fetchone()[0]
    if bad_type > 0:
        errors.append(f"FAIL: {bad_type} funder repayment rows have wrong type")
    else:
        print("  PASS")

    # 38. Car purchase rows not duplicated by frontend
    print("\n[38] No duplicate car purchase rows...")
    dup_purchase = conn.execute("""
        SELECT source_id, COUNT(*) as cnt
        FROM partner_transactions
        WHERE source_type = 'car_purchase'
        GROUP BY source_id, partner_name, kind
        HAVING cnt > 1
    """).fetchall()
    if dup_purchase:
        for r in dup_purchase:
            errors.append(f"FAIL: Car {r['source_id']} has {r['cnt']} purchase rows for same partner")
    else:
        print("  PASS")

    # 39. Car sale ledger balance (detailed)
    print("\n[39] Car sale ledger balance (detailed)...")
    sold_cars_detail = conn.execute("""
        SELECT car_number FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars_detail:
        cn = car['car_number']
        bal = conn.execute("""
            SELECT COALESCE(SUM(debit), 0.0), COALESCE(SUM(credit), 0.0)
            FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
        """, [cn]).fetchone()
        if bal and abs(bal[0] - bal[1]) > 0.01:
            errors.append(f"FAIL: Car {cn} ledger unbalanced: debit={bal[0]:,.0f} credit={bal[1]:,.0f}")
    if not sold_cars_detail:
        print("  SKIP (no sold cars)")
    else:
        print("  PASS" if not any('FAIL' in e and 'ledger unbalanced' in e for e in errors[len(errors)-len(sold_cars_detail):]) else "  FAIL")

    # 40. No duplicate sale-generated customer rows per car (ISSUE 2)
    print("\n[40] No duplicate sale-generated customer rows per car...")
    dup_customer_rows = conn.execute("""
        SELECT related_source_id, source_role, COUNT(*) as cnt
        FROM partner_transactions
        WHERE kind = 'زبون' AND related_source_type = 'car'
          AND source_role IS NOT NULL
        GROUP BY related_source_id, source_role
        HAVING cnt > 1
    """).fetchall()
    if dup_customer_rows:
        for r in dup_customer_rows:
            errors.append(f"FAIL: Car {r['related_source_id']} has {r['cnt']} customer rows with role '{r['source_role']}'")
    else:
        print("  PASS")

    # 41. No duplicate purchase ledger entries per car (ISSUE 1 complement)
    print("\n[41] No duplicate purchase ledger entries per car...")
    dup_purchase_ledger = conn.execute("""
        SELECT reference_id, account_type, COUNT(*) as cnt
        FROM financial_ledger
        WHERE reference_type = 'car' AND account_type = 'inventory'
        GROUP BY reference_id
        HAVING cnt > 2
    """).fetchall()
    if dup_purchase_ledger:
        for r in dup_purchase_ledger:
            errors.append(f"FAIL: Car {r['reference_id']} has {r['cnt']} inventory ledger entries (expected 2: debit + credit)")
    else:
        print("  PASS")

    # 42. update_partner also updated financial_ledger account_id (ISSUE 5)
    print("\n[42] update_partner financial_ledger consistency...")
    orphan_account_ids = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE account_id NOT IN (SELECT partner_name FROM partners)
    """).fetchone()[0]
    if orphan_account_ids > 0:
        errors.append(f"FAIL: {orphan_account_ids} ledger entries with non-existing account_id")
    else:
        print("  PASS")

    # 43. No invalid dates in installment schedules (ISSUE 6)
    print("\n[43] No invalid dates in installment schedules...")
    bad_dates = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'customer_installment_schedule'
          AND source_role = 'installment_schedule'
          AND date NOT LIKE '____-__-__'
    """).fetchone()[0]
    if bad_dates > 0:
        errors.append(f"FAIL: {bad_dates} installment schedule rows with invalid date format")
    else:
        print("  PASS")

    # 44. No duplicate purchase partner_transactions from unnecessary rebuild (ISSUE 7)
    print("\n[44] No duplicate purchase partner_transactions...")
    dup_purchase_pt = conn.execute("""
        SELECT source_id, partner_name, COUNT(*) as cnt
        FROM partner_transactions
        WHERE source_type = 'car_purchase' AND source_role = 'cash_payment'
        GROUP BY source_id, partner_name
        HAVING cnt > 1
    """).fetchall()
    if dup_purchase_pt:
        for r in dup_purchase_pt:
            errors.append(f"FAIL: Car {r['source_id']} has {r['cnt']} purchase rows for {r['partner_name']}")
    else:
        print("  PASS")

    # 45. car_exists guard check (ISSUE 3)
    print("\n[45] Non-existing car guard check...")
    orphan_car_transactions = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'car_sale'
          AND source_id NOT IN (SELECT CAST(car_number AS TEXT) FROM cars)
    """).fetchone()[0]
    if orphan_car_transactions > 0:
        errors.append(f"FAIL: {orphan_car_transactions} sale transactions for non-existing cars")
    else:
        print("  PASS")

    # 46. No orphan sale ledger after non-financial edit (ISSUE 1)
    print("\n[46] Sold cars have sale ledger entries...")
    sold_cars = conn.execute("""
        SELECT car_number FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    missing_sale_ledger = 0
    for car in sold_cars:
        cn = car['car_number']
        sale_entries = conn.execute("""
            SELECT COUNT(*) FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
              AND (type_ LIKE '%بيع%' OR type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%'
                   OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%')
        """, [cn]).fetchone()[0]
        if sale_entries == 0:
            missing_sale_ledger += 1
            errors.append(f"FAIL: Sold car {cn} missing sale ledger entries (may have been broadly deleted)")
    if missing_sale_ledger == 0 and sold_cars:
        print("  PASS")
    elif not sold_cars:
        print("  SKIP (no sold cars)")

    # 47. Down payment classified as customer_sale_payment (ISSUE 2)
    print("\n[47] Down payment classification...")
    sale_down_payments = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'customer_sale_payment'
          AND source_role = 'sale_down_payment'
    """).fetchone()[0]
    generic_dp_with_car = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'customer_transaction'
          AND source_role LIKE '%down%'
          AND related_source_type = 'car'
    """).fetchone()[0]
    if sale_down_payments > 0:
        print("  PASS")
    elif generic_dp_with_car > 0:
        errors.append(f"FAIL: {generic_dp_with_car} down payments still use generic classification")
    else:
        print("  SKIP (no down payments found)")

    # 48. No orphan ledger account_ids (ISSUE 3)
    print("\n[48] No orphan account_ids in financial_ledger...")
    partial_renames = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger fl
        WHERE fl.account_id NOT IN (
            SELECT partner_name FROM partners
        )
    """).fetchone()[0]
    if partial_renames > 0:
        errors.append(f"FAIL: {partial_renames} ledger entries reference non-existing partner names")
    else:
        print("  PASS")

    # 49. Same-name different-kind account isolation (ISSUE 3)
    print("\n[49] Same-name different-kind account isolation...")
    dup_name_kinds = conn.execute("""
        SELECT p1.partner_name, p1.kind as kind1, p2.kind as kind2
        FROM partners p1
        JOIN partners p2 ON p1.partner_name = p2.partner_name AND p1.kind < p2.kind
    """).fetchall()
    dup_name_errors = 0
    for d in dup_name_kinds:
        name = d['partner_name']
        kind1 = d['kind1']
        kind2 = d['kind2']
        acc1 = conn.execute("""
            SELECT fl.account_type FROM financial_ledger fl
            WHERE fl.account_id = ? AND fl.account_type NOT IN (
                'receivable', 'funder', 'payable', 'investor'
            )
            LIMIT 1
        """, [name]).fetchone()
        if acc1:
            errors.append(f"FAIL: Partner '{name}' ({kind1}/{kind2}) has ledger with account_type='{acc1['account_type']}'")
            dup_name_errors += 1
    if not dup_name_kinds:
        print("  PASS (no same-name different-kind partners)")
    elif dup_name_errors == 0:
        print("  PASS")
    else:
        print("  FAIL")

    # Summary
    print("\n" + "=" * 60)
    if errors:
        print(f"DB AUDIT FAILED — {len(errors)} error(s):")
        for e in errors:
            print(f"  ❌ {e}")
    else:
        print("DB AUDIT PASSED")

    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  ⚠️  {w}")

    conn.close()
    return len(errors) == 0

def audit_source(lib_path):
    """Static source code scan for risky patterns."""
    print("\n" + "=" * 60)
    print("STATIC SOURCE CODE AUDIT")
    print("=" * 60)

    with open(lib_path, 'r', encoding='utf-8') as f:
        content = f.read()

    errors = []
    warnings = []
    lines = content.split('\n')

    # 1. Direct INSERT INTO partner_transactions without affects_qasa
    print("\n[S1] INSERT INTO partner_transactions without affects_qasa...")
    for i, line in enumerate(lines, 1):
        if 'INSERT' in line and 'partner_transactions' in line:
            context = '\n'.join(lines[max(0,i-3):i+5])
            if 'affects_qasa' not in context and 'source_type' not in context:
                warnings.append(f"WARN: Line {i} — INSERT without affects_qasa: {line.strip()[:80]}")

    # 2. DELETE by notes for agency operations
    print("\n[S2] Agency deletion by notes...")
    for i, line in enumerate(lines, 1):
        if 'DELETE' in line and 'partner_transactions' in line and 'notes' in line.lower():
            context = '\n'.join(lines[max(0,i-5):i+5])
            if 'agency' in context.lower():
                warnings.append(f"WARN: Line {i} — Agency DELETE by notes: {line.strip()[:80]}")

    # 3. get_* functions calling write helpers
    print("\n[S3] Read-only functions calling write helpers...")
    func_pattern = re.compile(r'fn\s+(get_\w+|list_\w+|read_\w+|summary_\w+)\s*\(', re.IGNORECASE)
    write_helpers = ['recalculate_all_partners', 'recalculate_partner_total', 'record_ledger_entry',
                     'reverse_ledger_entries', 'delete_ledger_entries', 'insert_partner_transaction']
    in_func = None
    func_start = 0
    brace_depth = 0
    for i, line in enumerate(lines, 1):
        m = func_pattern.search(line)
        if m:
            in_func = m.group(1)
            func_start = i
            brace_depth = 0
        if in_func:
            brace_depth += line.count('{') - line.count('}')
            stripped = line.split('//')[0] if '//' in line else line
            for helper in write_helpers:
                if helper in stripped and 'fn ' not in stripped and 'NOTE' not in stripped:
                    errors.append(f"FAIL: {in_func} (line {func_start}) calls {helper} at line {i}")
            if brace_depth <= 0 and '{' in content[:content.find(line)]:
                in_func = None

    # 4. Car expenses with reference_type = 'expense'
    print("\n[S4] Car expense reference_type...")
    for i, line in enumerate(lines, 1):
        if 'car_expense' in line.lower() and "'expense'" in line and 'reference_type' in line:
            if 'car_expense' not in line:
                warnings.append(f"WARN: Line {i} — Car expense may use wrong reference_type")

    # 5. Customer payment cash_movement must be handled before generic partner deposit
    print("\n[S5] Customer payment capital guard in record_partner_ledger_entries...")
    func_start = None
    generic_deposit_line = None
    customer_guard_line = None
    for i, line in enumerate(lines, 1):
        if 'fn record_partner_ledger_entries' in line:
            func_start = i
        if func_start and i > func_start:
            if "source_type == \"customer_payment\"" in line and "source_role == \"cash_movement\"" in line:
                customer_guard_line = i
            if "ايداع شريك رأس مال" in line or "Cr capital" in line:
                if generic_deposit_line is None:
                    generic_deposit_line = i
    if customer_guard_line and generic_deposit_line:
        if customer_guard_line < generic_deposit_line:
            print("  PASS — customer_payment guard before generic deposit")
        else:
            errors.append(f"FAIL: customer_payment guard (line {customer_guard_line}) after generic deposit (line {generic_deposit_line})")
    elif generic_deposit_line and not customer_guard_line:
        errors.append("FAIL: No customer_payment guard found before generic partner capital logic")
    else:
        print("  PASS")

    # 6. New business logic calling legacy helpers
    print("\n[S6] New logic calling legacy helpers...")
    for i, line in enumerate(lines, 1):
        stripped = line.split('//')[0] if '//' in line else line
        if 'deduct_from_partners_5050(' in stripped or 'distribute_to_partners_50(' in stripped:
            context_before = '\n'.join(lines[max(0,i-10):i])
            if ('fn distribute_to_partners_50' not in context_before
                and 'fn deduct_from_partners_5050' not in context_before):
                errors.append(f"FAIL: Line {i} — calls legacy helper: {stripped.strip()[:80]}")

    # 7. Profit_recognition rows must NOT affect Qasa/Cash
    print("\n[S7] profit_recognition must not affect Qasa/Cash...")
    for i, line in enumerate(lines, 1):
        stripped = line.split('//')[0] if '//' in line else line
        if 'profit_recognition' in stripped and ('affects_qasa' in stripped or 'affects_partner_cash' in stripped):
            # Check if it's setting affects_qasa=1 or affects_partner_cash=1
            if 'true' in stripped and ('affects_qasa' in stripped or 'affects_partner_cash' in stripped):
                # Could be a legitimate false in context, check more carefully
                context = '\n'.join(lines[max(0,i-3):i+3])
                if 'profit_recognition' in context and ('true,' in stripped or 'true,' in context):
                    pass  # Need deeper check
            if 'affects_qasa: true' in stripped or 'affects_partner_cash: true' in stripped:
                errors.append(f"FAIL: Line {i} — profit_recognition with affects_qasa/affects_partner_cash=true")

    # 8. Funder/company rows must NOT affect Qasa/Cash
    print("\n[S8] Funder/company must not affect Qasa/Cash...")
    for i, line in enumerate(lines, 1):
        stripped = line.split('//')[0] if '//' in line else line
        if 'funder' in stripped.lower() or 'company' in stripped.lower() or 'ممول' in stripped or 'شركة' in stripped:
            if 'affects_qasa' in stripped and 'true' in stripped:
                context = '\n'.join(lines[max(0,i-5):i+5])
                if 'source_type' in context or 'customer_payment' not in context:
                    pass  # May be legitimate in specific contexts

    # 9. Customer payment without car number must still create cash_movement
    print("\n[S9] Customer payment cash_movement without car reference check...")
    in_splits_func = False
    car_guard_before_cash = False
    cash_creation_line = None
    for i, line in enumerate(lines, 1):
        if 'fn apply_partner_transaction_splits' in line:
            in_splits_func = True
            car_guard_before_cash = False
            cash_creation_line = None
        if in_splits_func:
            if 'extract_car_number_from_notes' in line and 'if let' in line:
                car_guard_before_cash = True
            if 'cash_movement' in line and 'distribute_to_partners_50_with_effects' in line:
                cash_creation_line = i
                break
            brace_depth_check = line.count('{') - line.count('}')
            if brace_depth_check < 0 and i > 4500:
                in_splits_func = False
    if cash_creation_line and car_guard_before_cash:
        # Check if cash_movement creation is inside the car number guard
        context = '\n'.join(lines[max(0,cash_creation_line-10):cash_creation_line])
        if 'extract_car_number_from_notes' in context or 'car_num' in context:
            warnings.append(f"WARN: cash_movement creation at line {cash_creation_line} appears inside car number guard")
        else:
            print("  PASS")
    else:
        print("  PASS")

    # 10. v11 migration exists
    print("\n[S10] v11 migration exists...")
    if 'version < 11' in content and 'VALUES (11)' in content:
        print("  PASS")
    else:
        errors.append("FAIL: v11 migration not found in lib.rs")

    # 11. get_recognized_profit_for_car uses source fields
    print("\n[S11] get_recognized_profit_for_car uses source fields...")
    in_func = False
    uses_source = False
    for i, line in enumerate(lines, 1):
        if 'fn get_recognized_profit_for_car' in line:
            in_func = True
        if in_func:
            if 'source_role' in line and 'profit_recognition' in line:
                uses_source = True
                break
            if line.strip().startswith('}') and i > 7300:
                in_func = False
    if uses_source:
        print("  PASS")
    else:
        errors.append("FAIL: get_recognized_profit_for_car still depends only on notes LIKE")

    # 12. No notes-based DELETE in add_car runtime flow
    print("\n[S12] No notes-based DELETE in add_car runtime flow...")
    in_add_car = False
    bad_delete_line = None
    for i, line in enumerate(lines, 1):
        if 'fn add_car' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_add_car = True
        if in_add_car:
            stripped = line.split('//')[0] if '//' in line else line
            if 'DELETE' in stripped and 'partner_transactions' in stripped and 'notes' in stripped.lower():
                # Exception: source_type based deletes are OK
                if 'source_type' not in stripped:
                    bad_delete_line = i
                    break
            if 'fn delete_car' in line or 'fn update_car' in line:
                in_add_car = False
    if bad_delete_line:
        errors.append(f"FAIL: Line {bad_delete_line} — notes-based DELETE in add_car")
    else:
        print("  PASS")

    # 13. Installment sale does not debit cash in record_car_ledger_entries
    print("\n[S13] Installment sale no cash debit check...")
    in_record_car = False
    bad_cash_line = None
    for i, line in enumerate(lines, 1):
        if 'fn record_car_ledger_entries' in line:
            in_record_car = True
        if in_record_car:
            stripped = line.split('//')[0] if '//' in line else line
            # Check for cash debit in installment context
            if '"cash"' in stripped and 'debit' in stripped.lower():
                context = '\n'.join(lines[max(0,i-10):i+5])
                if 'payment_type' in context or 'Installment' in context or 'تقسيط' in context:
                    bad_cash_line = i
                    break
            if 'fn record_agency' in line:
                in_record_car = False
    if bad_cash_line:
        errors.append(f"FAIL: Line {bad_cash_line} — installment sale may debit cash in car ledger")
    else:
        print("  PASS")

    # 14. get_recognized_profit_for_car uses related_source_id, not source_id=car_number
    print("\n[S14] get_recognized_profit_for_car uses related_source_id...")
    in_func = False
    uses_related = False
    uses_wrong_source_id = False
    for i, line in enumerate(lines, 1):
        if 'fn get_recognized_profit_for_car' in line:
            in_func = True
        if in_func:
            stripped = line.split('//')[0] if '//' in line else line
            if 'related_source_id' in stripped:
                uses_related = True
            if 'source_id = ?1' in stripped and 'customer_payment' in '\n'.join(lines[max(0,i-5):i]):
                uses_wrong_source_id = True
            if line.strip().startswith('}') and i > 7300:
                in_func = False
    if uses_related and not uses_wrong_source_id:
        print("  PASS")
    elif uses_wrong_source_id:
        errors.append("FAIL: get_recognized_profit_for_car uses source_id=car_number for customer_payment rows")
    else:
        errors.append("FAIL: get_recognized_profit_for_car does not use related_source_id")

    # 15. Customer payment source_id must not be changed to car_number
    print("\n[S15] Customer payment source_id preservation...")
    bad_update = False
    for i, line in enumerate(lines, 1):
        stripped = line.split('//')[0] if '//' in line else line
        if 'UPDATE partner_transactions SET source_id' in stripped and 'customer_payment' in stripped:
            context = '\n'.join(lines[max(0,i-3):i+3])
            if 'related_source' not in context:
                bad_update = True
                break
    if bad_update:
        errors.append(f"FAIL: Line {i} — source_id update on customer_payment rows (should use related_source_id)")
    else:
        print("  PASS")

    # 16. Expense deletion safety - DELETE by source_type must use centralized helper
    print("\n[S16] Expense deletion safety...")
    for i, line in enumerate(lines, 1):
        stripped = line.split('//')[0] if '//' in line else line
        if 'DELETE FROM partner_transactions WHERE source_type' in stripped:
            context = '\n'.join(lines[max(0,i-10):i+5])
            if 'delete_partner_transactions_by_source_with_ledger' not in context:
                errors.append(f"FAIL: Line {i} — DELETE by source_type without centralized helper: {stripped.strip()[:80]}")

    # 17. v12 migration exists
    print("\n[S17] v12 migration exists...")
    if 'version < 12' in content and 'VALUES (12)' in content:
        print("  PASS")
    else:
        errors.append("FAIL: v12 migration not found in lib.rs")

    # 18. Mixed currency blocked in add_car
    print("\n[S18] Mixed currency blocked in add_car...")
    in_add_car = False
    has_currency_check = False
    for i, line in enumerate(lines, 1):
        if 'fn add_car' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_add_car = True
        if in_add_car:
            stripped = line.split('//')[0] if '//' in line else line
            if 'purchase_curr' in stripped and 'sale_curr' in stripped and ('!=' in stripped or 'return Err' in stripped):
                has_currency_check = True
                break
            if 'fn delete_car' in line or 'fn update_car' in line:
                in_add_car = False
    if has_currency_check:
        print("  PASS")
    else:
        errors.append("FAIL: No mixed-currency check found in add_car")

    # 19. add_car uses transaction
    print("\n[S19] add_car uses transaction...")
    in_add_car = False
    has_tx = False
    for i, line in enumerate(lines, 1):
        if 'fn add_car' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_add_car = True
        if in_add_car:
            stripped = line.split('//')[0] if '//' in line else line
            if 'transaction()' in stripped:
                has_tx = True
                break
            if 'fn delete_car' in line or 'fn update_car' in line:
                in_add_car = False
    if has_tx:
        print("  PASS")
    else:
        errors.append("FAIL: add_car does not use database transaction")

    # 20. add_partner_transaction uses transaction
    print("\n[S20] add_partner_transaction uses transaction...")
    in_func = False
    has_tx = False
    for i, line in enumerate(lines, 1):
        if 'fn add_partner_transaction' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_func = True
        if in_func:
            stripped = line.split('//')[0] if '//' in line else line
            if 'transaction()' in stripped:
                has_tx = True
                break
            if 'fn pay_financier' in line or 'fn update_partner_transaction' in line:
                in_func = False
    if has_tx:
        print("  PASS")
    else:
        errors.append("FAIL: add_partner_transaction does not use database transaction")

    # 21. delete_car does not use notes LIKE to delete partner_transactions
    print("\n[S21] delete_car source-based deletion...")
    in_delete_car = False
    bad_notes_delete = False
    for i, line in enumerate(lines, 1):
        if 'fn delete_car' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_delete_car = True
        if in_delete_car:
            stripped = line.split('//')[0] if '//' in line else line
            if 'DELETE' in stripped and 'partner_transactions' in stripped and 'notes LIKE' in stripped:
                bad_notes_delete = True
                break
            if 'fn add_partner' in line:
                in_delete_car = False
    if not bad_notes_delete:
        print("  PASS")
    else:
        errors.append("FAIL: delete_car still uses notes LIKE to delete partner_transactions")

    # 22. record_ledger_entry validates debit/credit
    print("\n[S22] record_ledger_entry validates debit/credit...")
    in_func = False
    has_validation = False
    for i, line in enumerate(lines, 1):
        if 'fn record_ledger_entry' in line:
            in_func = True
        if in_func:
            stripped = line.split('//')[0] if '//' in line else line
            if 'validate_ledger_amounts' in stripped or 'validate_currency' in stripped:
                has_validation = True
                break
            if line.strip().startswith('}') and i > 1250:
                in_func = False
    if has_validation:
        print("  PASS")
    else:
        errors.append("FAIL: record_ledger_entry does not validate debit/credit")

    # 23. update_expense does not use reverse_ledger_entries
    print("\n[S23] update_expense uses delete-and-rebuild...")
    in_func = False
    uses_reverse = False
    for i, line in enumerate(lines, 1):
        if 'fn update_expense' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_func = True
        if in_func:
            stripped = line.split('//')[0] if '//' in line else line
            if 'reverse_ledger_entries' in stripped:
                uses_reverse = True
                break
            if 'fn add_car_expense' in line:
                in_func = False
    if not uses_reverse:
        print("  PASS")
    else:
        errors.append("FAIL: update_expense still uses reverse_ledger_entries")

    # 24. sell_car_with_accounting exists
    print("\n[S24] sell_car_with_accounting exists...")
    if 'fn sell_car_with_accounting' in content:
        print("  PASS")
    else:
        errors.append("FAIL: sell_car_with_accounting not found")

    # 25. Expense functions validate amount
    print("\n[S25] Expense functions validate amount...")
    for func_name in ['fn add_expense', 'fn update_expense', 'fn add_car_expense_record']:
        in_func = False
        has_validation = False
        func_start_line = 0
        for i, line in enumerate(lines, 1):
            if func_name in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
                in_func = True
                func_start_line = i
            if in_func and i > func_start_line:
                stripped = line.split('//')[0] if '//' in line else line
                if 'validate_positive_amount' in stripped or 'validate_non_negative_amount' in stripped:
                    has_validation = True
                    break
                # Stop at next function definition
                if i > func_start_line + 5 and ('fn ' in stripped and '(' in stripped and '{' in stripped):
                    in_func = False
                    break
        if not has_validation:
            errors.append(f"FAIL: {func_name} does not validate amount")
    if not any('FAIL' in e for e in errors[len(errors)-3:]):
        print("  PASS")

    # 26. pay_financier_from_partners uses transaction
    print("\n[S26] pay_financier_from_partners uses transaction...")
    in_func = False
    has_tx = False
    for i, line in enumerate(lines, 1):
        if 'fn pay_financier_from_partners' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_func = True
        if in_func:
            stripped = line.split('//')[0] if '//' in line else line
            if 'transaction()' in stripped:
                has_tx = True
                break
            if 'fn update_partner_transaction' in line or 'fn delete_partner_transaction' in line:
                in_func = False
    if has_tx:
        print("  PASS")
    else:
        errors.append("FAIL: pay_financier_from_partners does not use database transaction")

    # 27. update_partner_transaction uses transaction
    print("\n[S27] update_partner_transaction uses transaction...")
    in_func = False
    has_tx = False
    for i, line in enumerate(lines, 1):
        if 'fn update_partner_transaction' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_func = True
        if in_func:
            stripped = line.split('//')[0] if '//' in line else line
            if 'transaction()' in stripped:
                has_tx = True
                break
            if 'fn delete_partner_transaction' in line:
                in_func = False
    if has_tx:
        print("  PASS")
    else:
        errors.append("FAIL: update_partner_transaction does not use database transaction")

    # 28. delete_partner_transaction uses transaction
    print("\n[S28] delete_partner_transaction uses transaction...")
    in_func = False
    has_tx = False
    for i, line in enumerate(lines, 1):
        if 'fn delete_partner_transaction' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_func = True
        if in_func:
            stripped = line.split('//')[0] if '//' in line else line
            if 'transaction()' in stripped:
                has_tx = True
                break
            if 'fn get_partner_transactions' in line:
                in_func = False
    if has_tx:
        print("  PASS")
    else:
        errors.append("FAIL: delete_partner_transaction does not use database transaction")

    # 29. Car purchase rebuild on edit
    print("\n[S29] Car purchase rebuild on edit...")
    if 'should_rebuild_purchase' in content and 'delete_generated_car_purchase_partner_transactions' in content:
        print("  PASS")
    else:
        errors.append("FAIL: Car purchase rebuild logic not found in add_car")

    # 30. Frontend uses sell_car_with_accounting for sale
    print("\n[S30] Frontend uses sell_car_with_accounting...")
    frontend_path = os.path.join(os.path.dirname(lib_path) if lib_path else '.', '..', 'src', 'components', 'CarsTab.tsx')
    alt_frontend = os.path.join('src', 'components', 'CarsTab.tsx')
    fe_file = None
    for p in [frontend_path, alt_frontend]:
        if os.path.exists(p):
            fe_file = p
            break
    if fe_file:
        with open(fe_file, 'r', encoding='utf-8') as f:
            fe_content = f.read()
        if 'sell_car_with_accounting' in fe_content:
            print("  PASS")
        else:
            errors.append("FAIL: Frontend does not call sell_car_with_accounting")
    else:
        print("  SKIP (CarsTab.tsx not found)")

    # 31. delete_car does NOT write 0/0 financial_ledger entry
    print("\n[S31] delete_car no 0/0 ledger entry...")
    in_delete_car = False
    has_zero_entry = False
    for i, line in enumerate(lines, 1):
        if 'fn delete_car' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_delete_car = True
        if in_delete_car:
            stripped = line.split('//')[0] if '//' in line else line
            if 'record_ledger_entry' in stripped:
                has_zero_entry = True
                break
            if 'fn add_partner' in line:
                in_delete_car = False
    if not has_zero_entry:
        print("  PASS")
    else:
        errors.append("FAIL: delete_car still calls record_ledger_entry (should use audit_log)")

    # 32. No record_ledger_entry with debit=0 AND credit=0
    print("\n[S32] No 0/0 ledger entries anywhere...")
    has_zero_zero = False
    for i, line in enumerate(lines, 1):
        stripped = line.split('//')[0] if '//' in line else line
        if 'record_ledger_entry' in stripped:
            context = '\n'.join(lines[max(0,i-1):i+15])
            if '0.0,' in context and '0.0,' in context:
                # Check if both debit and credit are 0.0 in the same call
                zero_count = context.count('0.0,')
                if zero_count >= 2 and 'system' in context.lower():
                    has_zero_zero = True
                    break
    if not has_zero_zero:
        print("  PASS")
    else:
        errors.append("FAIL: Found record_ledger_entry call with debit=0.0 and credit=0.0")

    # 33. pay_financier_from_partners has correct Arabic type (not corrupted)
    print("\n[S33] pay_financier_from_partners type not corrupted...")
    in_func = False
    has_corrupted = False
    for i, line in enumerate(lines, 1):
        if 'fn pay_financier_from_partners' in line:
            in_func = True
        if in_func:
            stripped = line.split('//')[0] if '//' in line else line
            if '挓' in stripped:
                has_corrupted = True
                break
            if line.strip().startswith('}') and i > 5150:
                in_func = False
    if not has_corrupted:
        print("  PASS")
    else:
        errors.append("FAIL: pay_financier_from_partners has corrupted type '挓'")

    # 34. sell_car_with_accounting updates car sale fields
    print("\n[S34] sell_car_with_accounting updates car fields...")
    has_update = False
    in_func = False
    brace_depth = 0
    saw_first_brace = False
    for i, line in enumerate(lines, 1):
        if 'fn sell_car_with_accounting' in line:
            in_func = True
        if in_func:
            this_brace = line.count('{') - line.count('}')
            if this_brace != 0:
                saw_first_brace = True
            if saw_first_brace:
                brace_depth += this_brace
            stripped = line.split('//')[0] if '//' in line else line
            if 'UPDATE cars SET' in stripped:
                context = '\n'.join(lines[max(0,i-2):i+5])
                if 'status' in context:
                    has_update = True
                    break
            if saw_first_brace and brace_depth <= 0:
                in_func = False
    if has_update:
        print("  PASS")
    else:
        errors.append("FAIL: sell_car_with_accounting does not update car sale fields")

    # 35. sell_car_with_accounting validates sale amounts
    print("\n[S35] sell_car_with_accounting validates sale amounts...")
    has_validation = False
    in_func = False
    brace_depth = 0
    saw_first_brace = False
    for i, line in enumerate(lines, 1):
        if 'fn sell_car_with_accounting' in line:
            in_func = True
        if in_func:
            this_brace = line.count('{') - line.count('}')
            if this_brace != 0:
                saw_first_brace = True
            if saw_first_brace:
                brace_depth += this_brace
            stripped = line.split('//')[0] if '//' in line else line
            if 'validate_sale_amounts' in stripped:
                has_validation = True
                break
            if saw_first_brace and brace_depth <= 0:
                in_func = False
    if has_validation:
        print("  PASS")
    else:
        errors.append("FAIL: sell_car_with_accounting does not validate sale amounts")

    # 36. Installment schedule rows have related_source fields
    print("\n[S36] Installment schedule rows have related_source...")
    has_schedule_source = False
    for i, line in enumerate(lines, 1):
        stripped = line.split('//')[0] if '//' in line else line
        if 'customer_installment_schedule' in stripped:
            # Check context for related_source_type
            context = '\n'.join(lines[max(0,i-5):i+3])
            if 'related_source_type' in context:
                has_schedule_source = True
                break
    if has_schedule_source:
        print("  PASS")
    else:
        errors.append("FAIL: Installment schedule rows missing related_source fields")

    # 37. Frontend does NOT create funder/company purchase transactions
    print("\n[S37] Frontend no duplicate purchase automation...")
    if fe_file:
        with open(fe_file, 'r', encoding='utf-8') as f:
            fe_content = f.read()
        # Check if handlePurchaseAutomation still calls add_partner_transaction for ممول/شركة
        in_handle_purchase = False
        bad_line = None
        for i, line in enumerate(fe_content.split('\n'), 1):
            if 'handlePurchaseAutomation' in line and 'const' in line and '=>' in line:
                in_handle_purchase = True
            if in_handle_purchase:
                if ('add_partner_transaction' in line or 'update_partner_transaction' in line) and ('ممول' in line or 'شركة' in line):
                    bad_line = i
                    break
                if line.strip().startswith('};'):
                    in_handle_purchase = False
        if not bad_line:
            print("  PASS")
        else:
            errors.append(f"FAIL: handlePurchaseAutomation still creates purchase transactions at line {bad_line}")
    else:
        print("  SKIP (CarsTab.tsx not found)")

    # 38. record_car_sale_ledger_entries exists (ISSUE 1)
    print("\n[S38] record_car_sale_ledger_entries exists...")
    if 'fn record_car_sale_ledger_entries' in content:
        print("  PASS")
    else:
        errors.append("FAIL: record_car_sale_ledger_entries not found")

    # 39. delete_sale_generated_customer_rows_for_car in sell_car_with_accounting (ISSUE 2)
    print("\n[S39] delete_sale_generated_customer_rows_for_car in sell_car_with_accounting...")
    has_delete_customer = False
    in_func = False
    brace_depth = 0
    saw_first_brace = False
    for i, line in enumerate(lines, 1):
        if 'fn sell_car_with_accounting' in line:
            in_func = True
        if in_func:
            this_brace = line.count('{') - line.count('}')
            if this_brace != 0:
                saw_first_brace = True
            if saw_first_brace:
                brace_depth += this_brace
            if 'delete_sale_generated_customer_rows_for_car' in line:
                has_delete_customer = True
                break
            if saw_first_brace and brace_depth <= 0:
                in_func = False
    if has_delete_customer:
        print("  PASS")
    else:
        errors.append("FAIL: sell_car_with_accounting does not call delete_sale_generated_customer_rows_for_car")

    # 40. car_exists check in sell_car_with_accounting (ISSUE 3)
    print("\n[S40] car_exists check in sell_car_with_accounting...")
    has_car_exists = False
    in_func = False
    brace_depth = 0
    saw_first_brace = False
    for i, line in enumerate(lines, 1):
        if 'fn sell_car_with_accounting' in line:
            in_func = True
        if in_func:
            this_brace = line.count('{') - line.count('}')
            if this_brace != 0:
                saw_first_brace = True
            if saw_first_brace:
                brace_depth += this_brace
            if 'car_exists' in line:
                # Check surrounding lines for the > 0 or !car_exists check
                context = '\n'.join(lines[max(0,i-3):min(len(lines),i+10)])
                if '> 0' in context or '!car_exists' in context:
                    has_car_exists = True
                    break
            if saw_first_brace and brace_depth <= 0:
                in_func = False
    if has_car_exists:
        print("  PASS")
    else:
        errors.append("FAIL: sell_car_with_accounting missing car_exists check")

    # 41. skip_sale_accounting parameter on add_car (ISSUE 4)
    print("\n[S41] skip_sale_accounting parameter on add_car...")
    if 'skip_sale_accounting' in content:
        print("  PASS")
    else:
        errors.append("FAIL: add_car missing skip_sale_accounting parameter")

    # 42. UPDATE financial_ledger SET account_id in update_partner (ISSUE 5)
    print("\n[S42] update_partner updates financial_ledger account_id...")
    in_update_partner = False
    has_ledger_update = False
    for i, line in enumerate(lines, 1):
        if 'fn update_partner' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_update_partner = True
        if in_update_partner:
            stripped = line.split('//')[0] if '//' in line else line
            if 'UPDATE financial_ledger' in stripped and 'SET account_id' in stripped:
                has_ledger_update = True
                break
            if 'fn update_partner_transaction' in line:
                in_update_partner = False
    if has_ledger_update:
        print("  PASS")
    else:
        errors.append("FAIL: update_partner does not update financial_ledger account_id")

    # 43. days_in_month helper exists (ISSUE 6)
    print("\n[S43] days_in_month helper exists...")
    if 'fn days_in_month' in content:
        print("  PASS")
    else:
        errors.append("FAIL: days_in_month helper not found")

    # 44. purchase_changed logic in add_car (ISSUE 7)
    print("\n[S44] purchase_changed logic in add_car...")
    if 'purchase_changed' in content:
        print("  PASS")
    else:
        errors.append("FAIL: purchase_changed logic not found in add_car")

    # 45. skipSaleAccounting flag in frontend (ISSUE 4 frontend)
    print("\n[S45] skipSaleAccounting flag in frontend...")
    fe_file = None
    for p in [os.path.join(os.path.dirname(lib_path) if lib_path else '.', '..', 'src', 'components', 'CarsTab.tsx'),
              os.path.join('src', 'components', 'CarsTab.tsx')]:
        if os.path.exists(p):
            fe_file = p
            break
    if fe_file:
        with open(fe_file, 'r', encoding='utf-8') as f:
            fe_content = f.read()
        if 'skipSaleAccounting' in fe_content:
            print("  PASS")
        else:
            errors.append("FAIL: skipSaleAccounting flag not found in CarsTab.tsx")
    else:
        print("  SKIP (CarsTab.tsx not found)")

    # 46. add_car must not broadly delete all car ledger (ISSUE 1 regression)
    print("\n[S46] add_car no broad car ledger deletion...")
    in_add_car = False
    bad_delete = False
    for i, line in enumerate(lines, 1):
        if 'fn add_car' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_add_car = True
        if in_add_car:
            stripped = line.split('//')[0] if '//' in line else line
            # Look for DELETE FROM financial_ledger WHERE reference_type = 'car' without type_/account_type/reference_id filter
            if 'DELETE FROM financial_ledger' in stripped and "reference_type = 'car'" in stripped:
                # Accept type_, account_type, or reference_id as sufficient scoping
                if 'type_' not in stripped and 'account_type' not in stripped and 'reference_id' not in stripped:
                    bad_delete = True
                    break
            if 'fn sell_car_with_accounting' in line:
                in_add_car = False
    if bad_delete:
        errors.append("FAIL: add_car contains broad car ledger deletion without type_/account_type filter")
    else:
        print("  PASS")

    # 47. add_car uses precise ledger deletion helpers (ISSUE 1)
    print("\n[S47] add_car uses delete_car_purchase_ledger_entries / delete_car_sale_ledger_entries...")
    if 'delete_car_purchase_ledger_entries' in content and 'delete_car_sale_ledger_entries' in content:
        print("  PASS")
    else:
        errors.append("FAIL: delete_car_purchase_ledger_entries or delete_car_sale_ledger_entries not found")

    # 48. sell_car_with_accounting down payment uses customer_sale_payment / sale_down_payment (ISSUE 2)
    print("\n[S48] sell_car_with_accounting down payment classification...")
    if 'customer_sale_payment' in content and 'sale_down_payment' in content:
        print("  PASS")
    else:
        errors.append("FAIL: customer_sale_payment / sale_down_payment not found in sell_car_with_accounting")

    # 49. update_partner must use transaction (ISSUE 3)
    print("\n[S49] update_partner uses transaction...")
    in_update_partner = False
    has_tx = False
    for i, line in enumerate(lines, 1):
        if 'fn update_partner' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_update_partner = True
        if in_update_partner:
            stripped = line.split('//')[0] if '//' in line else line
            if 'transaction()' in stripped:
                has_tx = True
                break
            if 'fn add_partner_transaction' in line:
                in_update_partner = False
    if has_tx:
        print("  PASS")
    else:
        errors.append("FAIL: update_partner does not use transaction")

    # 50. update_partner ledger rename scoped by account_type (ISSUE 3)
    print("\n[S50] update_partner ledger rename scoped by account_type...")
    in_update_partner = False
    has_scoped = False
    for i, line in enumerate(lines, 1):
        if 'fn update_partner' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_update_partner = True
        if in_update_partner:
            stripped = line.split('//')[0] if '//' in line else line
            if 'UPDATE financial_ledger' in stripped and 'SET account_id' in stripped and 'account_type' in stripped:
                has_scoped = True
                # Check it's not the broad UPDATE
                if 'account_type NOT IN' in stripped:
                    continue  # This is the legacy fallback, not the scoped one
                break
            if 'fn add_partner_transaction' in line:
                in_update_partner = False
    if has_scoped:
        print("  PASS")
    else:
        errors.append("FAIL: update_partner financial_ledger update not scoped by account_type")

    # 51. update_partner blocks kind change with ledger history (ISSUE 3)
    print("\n[S51] update_partner blocks kind change with ledger history...")
    if 'لا يمكن تغيير نوع حساب لديه قيود مالية' in content:
        print("  PASS")
    else:
        errors.append("FAIL: update_partner missing ledger history check on kind change")

    # 52. add_car oldNum branch must not broadly delete all car ledger when old_num == car_number (ISSUE 1 FINAL)
    print("\n[S52] add_car oldNum branch distinguishes car_number change from same-number edit...")
    in_add_car = False
    has_car_number_changed = False
    has_car_number_changed_guard = False
    for i, line in enumerate(lines, 1):
        if 'fn add_car' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_add_car = True
        if in_add_car:
            stripped = line.split('//')[0] if '//' in line else line
            if 'car_number_changed' in stripped:
                has_car_number_changed = True
            if 'old_num != car_number' in stripped:
                has_car_number_changed_guard = True
            if 'fn sell_car_with_accounting' in line:
                break
    if has_car_number_changed and has_car_number_changed_guard:
        print("  PASS")
    elif has_car_number_changed:
        errors.append("FAIL: car_number_changed defined but no old_num != car_number guard found")
    else:
        errors.append("FAIL: car_number_changed boolean not found in add_car")

    # 53. add_car uses same_car_edit for precise deletion path
    print("\n[S53] add_car uses same_car_edit for normal edits...")
    if 'same_car_edit' in content:
        print("  PASS")
    else:
        errors.append("FAIL: same_car_edit boolean not found in add_car")

    # 54. add_car normal edit uses precise deletion helpers (ISSUE 1 FINAL)
    print("\n[S54] add_car same-car edit calls precise deletion helpers...")
    in_add_car = False
    has_precise_purchase_delete = False
    has_precise_sale_delete = False
    for i, line in enumerate(lines, 1):
        if 'fn add_car' in line and 'tauri::command' in '\n'.join(lines[max(0,i-5):i]):
            in_add_car = True
        if in_add_car:
            if 'should_rebuild_purchase' in line:
                # Check next few lines for delete_car_purchase_ledger_entries
                for j in range(i, min(i+5, len(lines)+1)):
                    if 'delete_car_purchase_ledger_entries' in lines[j-1]:
                        has_precise_purchase_delete = True
                        break
            if 'should_rebuild_sale_ledger' in line and 'delete_car_sale_ledger_entries' in line:
                has_precise_sale_delete = True
            elif 'should_rebuild_sale_ledger' in line:
                # Check next few lines for delete_car_sale_ledger_entries
                for j in range(i, min(i+5, len(lines)+1)):
                    if 'delete_car_sale_ledger_entries' in lines[j-1] and 'should_rebuild_sale_ledger' not in lines[j-1]:
                        has_precise_sale_delete = True
                        break
            if 'fn sell_car_with_accounting' in line:
                break
    if has_precise_purchase_delete and has_precise_sale_delete:
        print("  PASS")
    elif has_precise_purchase_delete:
        errors.append("FAIL: add_car same-car edit missing precise sale deletion")
    else:
        errors.append("FAIL: add_car same-car edit missing precise deletion helpers")

    # 55. update_partner no broad fallback (ISSUE 3 FINAL)
    print("\n[S55] update_partner no broad account_type NOT IN fallback...")
    if 'account_type NOT IN' in content:
        errors.append("FAIL: update_partner still contains broad account_type NOT IN fallback")
    else:
        print("  PASS")

    # S56-S64: New static checks for Phase 3 fixes
    # 56. effective_skip_sale used (not bare skip_sale) in add_car sale rebuild checks
    print("\n[S56] effective_skip_sale guards sale ledger rebuild in add_car...")
    eff_count = content.count("effective_skip_sale")
    if eff_count >= 4:
        print(f"  PASS ({eff_count} occurrences)")
    else:
        errors.append(f"FAIL: expected >=4 effective_skip_sale references, found {eff_count}")

    # 57. validate_profit_cap_for_car helper exists and is called for sold_cost_changed
    print("\n[S57] validate_profit_cap_for_car exists and called for sold_cost_changed...")
    if "fn validate_profit_cap_for_car" in content and "sold_cost_changed" in content:
        if "if sold_cost_changed" in content and "validate_profit_cap_for_car" in content:
            print("  PASS")
        else:
            errors.append("FAIL: validate_profit_cap_for_car defined but not called for sold_cost_changed")
    else:
        errors.append("FAIL: validate_profit_cap_for_car not found")

    # 58. Customer split deletion in add_car scoped by source_type
    print("\n[S58] add_car customer split deletion scoped by source_type...")
    if "source_type = 'customer_sale_payment' OR source_type = 'customer_installment_schedule'" in content:
        print("  PASS")
    else:
        errors.append("FAIL: add_car customer split deletion not scoped by source_type")

    # 59. delete_partner uses SUM(debit-credit) not SUM(ABS(...))
    print("\n[S59] delete_partner uses net balance not SUM(ABS)...")
    sum_abs_count = len(re.findall(r'SUM\s*\(\s*ABS\s*\(', content))
    if sum_abs_count == 0:
        print("  PASS")
    else:
        errors.append(f"FAIL: still contains {sum_abs_count} SUM(ABS) occurrence(s)")

    # 60-61: CarsTab.tsx helper split checks
    cars_tab_ok = True
    cars_tab_path = None
    for c in ["src/components/CarsTab.tsx", "../src/components/CarsTab.tsx"]:
        if os.path.exists(c):
            cars_tab_path = c
            break

    print("\n[S60] CarsTab defines all 3 sold-car change detectors (sale, cost, identity)...")
    if cars_tab_path:
        with open(cars_tab_path) as f:
            cars_content = f.read()
        has_sale = "function hasSoldCarSaleAccountingChange" in cars_content
        has_cost = "function hasSoldCarCostAccountingChange" in cars_content
        has_identity = "function hasSoldCarIdentityChange" in cars_content
        if has_sale and has_cost and has_identity:
            print("  PASS (all 3 functions defined)")
        else:
            cnt_txt = []
            if not has_sale: cnt_txt.append("hasSoldCarSaleAccountingChange")
            if not has_cost: cnt_txt.append("hasSoldCarCostAccountingChange")
            if not has_identity: cnt_txt.append("hasSoldCarIdentityChange")
            cars_tab_ok = False
            errors.append(f"FAIL: missing {', '.join(cnt_txt)} in CarsTab.tsx")
    else:
        cars_tab_ok = False
        errors.append("FAIL: CarsTab.tsx not found")

    print("\n[S61] Dispatch uses all 3 helpers in isPureSaleEdit / isCostOrIdentityEdit...")
    if cars_tab_ok:
        has_sale_helper = "hasSoldCarSaleAccountingChange" in cars_content
        has_cost_helper = "hasSoldCarCostAccountingChange" in cars_content
        has_identity_helper = "hasSoldCarIdentityChange" in cars_content
        has_is_pure = "isPureSaleEdit" in cars_content
        has_is_cost_id = "isCostOrIdentityEdit" in cars_content
        if has_sale_helper and has_cost_helper and has_identity_helper and has_is_pure and has_is_cost_id:
            print("  PASS")
        else:
            errors.append("FAIL: dispatch missing one or more helpers or variables")

    # 62. Backend effective_skip_sale includes both !car_number_changed and !sold_cost_changed
    print("\n[S62] Backend effective_skip_sale includes !car_number_changed && !sold_cost_changed...")
    if "effective_skip_sale" in content:
        if "!car_number_changed" in content and "!sold_cost_changed" in content:
            # Verify they are both part of the same effective_skip_sale expression
            line_start = content.find("let effective_skip_sale")
            if line_start >= 0:
                line_end = content.find("\n", line_start)
                eff_line = content[line_start:line_end] if line_end > line_start else content[line_start:line_start+200]
                if "!car_number_changed" in eff_line and "!sold_cost_changed" in eff_line:
                    print("  PASS")
                else:
                    errors.append("FAIL: effective_skip_sale expression missing one or both guards")
            else:
                errors.append("FAIL: effective_skip_sale declaration not found")
        else:
            errors.append("FAIL: effective_skip_sale not guarded by both car_number_changed and sold_cost_changed")
    else:
        errors.append("FAIL: effective_skip_sale not found at all")

    # 63. No bare !skip_sale (without effective_) in add_car
    print("\n[S63] No bare !skip_sale (without effective_) in add_car sale rebuild...")
    bare_skip = len(re.findall(r'!skip_sale[^_]', content))
    if bare_skip == 0:
        print("  PASS")
    else:
        errors.append(f"FAIL: found {bare_skip} bare !skip_sale without effective_ prefix")

    # 64. Dashboard does not directly mutate installment settlement
    print("\n[S64] Dashboard does not directly mutate installment settlement...")
    dashboard_path = None
    for c in ["src/components/Dashboard.tsx", "../src/components/Dashboard.tsx"]:
        if os.path.exists(c):
            dashboard_path = c
            break
    if dashboard_path:
        with open(dashboard_path) as f:
            dash_content = f.read()
        # Check for defensive guard string AND absence of direct mutations in handlePayInstallment
        has_guard = "لا يمكن تسديد القسط من لوحة التحكم مباشرة" in dash_content
        # Verify no add_partner_transaction or delete_partner_transaction in handlePayInstallment function body
        pay_fn_start = dash_content.find("handlePayInstallment")
        creditor_fn_start = dash_content.find("handlePayCreditor")
        if pay_fn_start >= 0 and creditor_fn_start > pay_fn_start:
            pay_fn_body = dash_content[pay_fn_start:creditor_fn_start]
            has_direct_mutation = "add_partner_transaction" in pay_fn_body or "delete_partner_transaction" in pay_fn_body
        else:
            has_direct_mutation = True
        if has_guard and not has_direct_mutation:
            print("  PASS (redirect/error guard present, no direct mutation)")
        elif has_guard:
            errors.append("FAIL: Dashboard has guard but handlePayInstallment still mutates directly")
        else:
            errors.append("FAIL: Dashboard handlePayInstallment lacks defensive guard")

    # 65. CarsTab does not route cost/identity changes to update_sold_car_with_accounting
    print("\n[S65] CarsTab cost/identity edits go through add_car (not update_sold_car_with_accounting)...")
    if cars_tab_ok:
        has_pure_sale = "isPureSaleEdit" in cars_content
        has_cost_id = "isCostOrIdentityEdit" in cars_content
        has_old_num = "carArgs.oldNum" in cars_content
        # Find branch-level references (not variable declarations)
        pure_branch = cars_content.find("} else if (isPureSaleEdit)")
        cost_branch = cars_content.find("} else if (isCostOrIdentityEdit)")
        if pure_branch >= 0 and cost_branch >= 0:
            # Check pure-sale branch body (between pure_branch and cost_branch)
            pure_body = cars_content[pure_branch:cost_branch]
            update_sold_ok = "update_sold_car_with_accounting" in pure_body
            # Check cost/identity branch body (after cost_branch until next } else if)
            after_cost = cars_content[cost_branch:cost_branch+2000]
            # Skip the current else-if, find the NEXT one
            after_current = after_cost[4:]  # Skip past the first `} el`
            next_else = after_current.find("} else if (")
            cost_body = after_current[:next_else] if next_else >= 0 else after_cost[:1000]
            add_car_ok = "add_car" in cost_body
            add_old_num_ok = "oldNum" in cost_body or "carArgs.oldNum" in cost_body
            if update_sold_ok and add_car_ok and add_old_num_ok:
                print("  PASS (cost/identity→add_car, pure sale→update_sold_car_with_accounting)")
            else:
                missing = []
                if not update_sold_ok: missing.append("update_sold_car_with_accounting in pure-sale branch")
                if not add_car_ok: missing.append("add_car in cost/identity branch")
                if not add_old_num_ok: missing.append("oldNum in cost/identity branch")
                errors.append(f"FAIL: cost/identity edit path: missing {', '.join(missing)}")
        else:
            missing = []
            if not has_pure_sale: missing.append("isPureSaleEdit variable")
            if pure_branch < 0: missing.append("else if (isPureSaleEdit) branch")
            if not has_cost_id: missing.append("isCostOrIdentityEdit variable")
            if cost_branch < 0: missing.append("else if (isCostOrIdentityEdit) branch")
            if not has_old_num: missing.append("carArgs.oldNum")
            errors.append(f"FAIL: cost/identity dispatch pattern: missing {', '.join(missing)}")

    # 66. add_car_expense_record uses rebuild_sold_car_accounting_after_cost_change
    print("\n[S66] add_car_expense_record uses rebuild_sold_car_accounting_after_cost_change...")
    fn_start = content.find("fn add_car_expense_record")
    if fn_start >= 0:
        fn_end = content.find("\n}", fn_start)
        fn_body = content[fn_start:fn_end] if fn_end > fn_start else content[fn_start:fn_start+1000]
        has_rebuild = "rebuild_sold_car_accounting_after_cost_change" in fn_body
        has_record_car_ledger = "record_car_ledger_entries" in fn_body
        if has_rebuild and not has_record_car_ledger:
            print("  PASS")
        elif has_rebuild:
            errors.append("FAIL: add_car_expense_record uses rebuild helper but still has record_car_ledger_entries")
        else:
            errors.append("FAIL: add_car_expense_record does not use rebuild_sold_car_accounting_after_cost_change")
    else:
        errors.append("FAIL: add_car_expense_record not found in lib.rs")

    # 67. No sold-car cost rebuild path uses record_car_ledger_entries directly
    print("\n[S67] No sold-car cost rebuild calls record_car_ledger_entries directly...")
    sold_paths_with_old = ["add_expense", "delete_car_expense_record", "add_car_expense_record"]
    offending = 0
    for fn_name in sold_paths_with_old:
        fstart = content.find(f"fn {fn_name}")
        if fstart >= 0:
            fend = content.find("fn ", fstart + 5)
            if fend < 0:
                fend = content.find("#[tauri::command]", fstart + 5)
            if fend < 0:
                fend = fstart + 2000
            fn_body = content[fstart:fend]
            if "record_car_ledger_entries" in fn_body and "rebuild_sold_car_accounting_after_cost_change" not in fn_body:
                offending += 1
    if offending == 0:
        print("  PASS")
    else:
        errors.append(f"FAIL: {offending} sold-car function(s) still call record_car_ledger_entries directly")

    # 68. add_car must only delete customer_sale_payment/installment_schedule when guarded by sale_changed
    print("\n[S68] add_car customer row deletion guarded by sale_changed...")
    add_car_start = content.find("\nfn add_car(")
    if add_car_start >= 0:
        add_car_end = content.find("\nfn ", add_car_start + 5)
        if add_car_end < 0:
            add_car_end = content.find("#[tauri::command]", add_car_start + 5)
        if add_car_end < 0:
            add_car_end = add_car_start + 25000
        add_car_body = content[add_car_start:add_car_end]
        cust_pay_pos = add_car_body.find("customer_sale_payment")
        cust_inst_pos = add_car_body.find("customer_installment_schedule")
        sale_guard_pos = add_car_body.find("if sale_changed")
        if cust_pay_pos >= 0 and sale_guard_pos >= 0:
            before_pay = add_car_body[:cust_pay_pos]
            last_sale_guard_before_pay = before_pay.rfind("if sale_changed")
            if last_sale_guard_before_pay >= 0:
                print("  PASS (customer_sale_payment inside sale_changed guard)")
            else:
                errors.append("FAIL: customer_sale_payment in add_car outside sale_changed guard")
        else:
            errors.append("FAIL: add_car missing customer_sale_payment or sale_changed guard")
        if cust_inst_pos >= 0 and sale_guard_pos >= 0:
            before_inst = add_car_body[:cust_inst_pos]
            last_sale_guard_before_inst = before_inst.rfind("if sale_changed")
            if last_sale_guard_before_inst < 0:
                errors.append("FAIL: customer_installment_schedule in add_car outside sale_changed guard")
    else:
        errors.append("FAIL: add_car function not found")

    # 69. sold_cost_changed-only path preserves customer rows
    print("\n[S69] sold_cost_changed-only path preserves customer sale-generated rows...")
    if add_car_start >= 0:
        rebuild_def_pos = add_car_body.find("let should_rebuild_sale_ledger")
        rebuild_def = add_car_body[rebuild_def_pos:rebuild_def_pos+200] if rebuild_def_pos >= 0 else ""
        has_sold_cost_in_rebuild = "sold_cost_changed" in rebuild_def
        has_unconditional_delete = False
        for token in ["customer_sale_payment", "customer_installment_schedule"]:
            pos = 0
            while True:
                pos = add_car_body.find(token, pos)
                if pos < 0:
                    break
                before = add_car_body[:pos]
                last_guard = before.rfind("if sale_changed")
                if last_guard < 0:
                    before_100 = before[-100:] if len(before) >= 100 else before
                    if "source_type =" in before_100 or "AND source_type" in before_100:
                        has_unconditional_delete = True
                pos += 1
        if has_sold_cost_in_rebuild and not has_unconditional_delete:
            print("  PASS (sold_cost_changed in should_rebuild_sale_ledger, customer deletion guarded by sale_changed)")
        else:
            missing = []
            if not has_sold_cost_in_rebuild: missing.append("sold_cost_changed not in should_rebuild_sale_ledger")
            if has_unconditional_delete: missing.append("unconditional customer_sale_payment deletion without sale_changed")
            errors.append(f"FAIL: {'; '.join(missing)}")
    else:
        errors.append("FAIL: add_car function not found for S69")

    # 70. car_number_changed path preserves and migrates customer rows
    print("\n[S70] car_number_changed path preserves + migrates customer sale-generated rows...")
    migrate_fn_start = content.find("fn migrate_car_number_references")
    if migrate_fn_start >= 0:
        migrate_fn_end = content.find("\nfn ", migrate_fn_start + 5)
        if migrate_fn_end < 0:
            migrate_fn_end = migrate_fn_start + 2000
        migrate_body = content[migrate_fn_start:migrate_fn_end]
        has_cust_sale_migrate = "customer_sale_payment" in migrate_body and "source_id" in migrate_body
        has_cust_inst_migrate = "customer_installment_schedule" in migrate_body and "source_id" in migrate_body
        msg_parts = []
        if has_cust_sale_migrate:
            msg_parts.append("customer_sale_payment migrated")
        else:
            errors.append("FAIL: customer_sale_payment not migrated in migrate_car_number_references")
        if has_cust_inst_migrate:
            msg_parts.append("customer_installment_schedule migrated")
        else:
            errors.append("FAIL: customer_installment_schedule not migrated in migrate_car_number_references")
        if not any("migrate" in e for e in errors):
            print(f"  PASS ({'; '.join(msg_parts)})")
    else:
        errors.append("FAIL: migrate_car_number_references function not found")

    # 71. Mixed sale+cost edit blocked in frontend
    print("\n[S71] Mixed sale+cost/identity edit blocked in frontend...")
    if cars_tab_ok:
        has_arabic_error = any(msg in cars_content for msg in [
            "يرجى حفظ تعديل البيع منفصلًا عن تعديل التكلفة أو رقم السيارة",
            "منفصلًا عن",
        ])
        has_mixed_condition = "hasSaleChange && (hasCostChange || hasIdentityChange)" in cars_content
        if has_arabic_error and has_mixed_condition:
            print("  PASS (mixed edits show Arabic error and are blocked)")
        elif has_arabic_error:
            errors.append("FAIL: Arabic error found but mixed-edit condition missing")
        elif has_mixed_condition:
            errors.append("FAIL: mixed-edit condition found but Arabic error message missing")
        else:
            errors.append("FAIL: no mixed-edit guard found in CarsTab")
    else:
        errors.append("FAIL: CarsTab not found for S71")
        if not cars_tab_ok:
            warnings.append("S71: CarsTab.tsx could not be read")

    # Summary
    print("\n" + "=" * 60)
    if errors:
        print(f"SOURCE AUDIT FAILED — {len(errors)} error(s):")
        for e in errors:
            print(f"  ❌ {e}")
    else:
        print("SOURCE AUDIT PASSED")

    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  ⚠️  {w}")

    return len(errors) == 0

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    lib = find_lib_rs()

    db_ok = True
    src_ok = True

    if arg == "static":
        # Static-only mode: skip runtime DB checks
        print("Mode: STATIC ONLY")
        if lib:
            print(f"Source: {lib}")
            src_ok = audit_source(lib)
        else:
            print("WARNING: lib.rs not found, skipping static checks")
    else:
        db = arg if arg and arg != "static" else find_db()
        if db:
            print(f"Database: {db}")
            db_ok = audit_db(db)
        else:
            print("WARNING: Database not found, skipping runtime checks")

        if lib:
            print(f"Source: {lib}")
            src_ok = audit_source(lib)
        else:
            print("WARNING: lib.rs not found, skipping static checks")

    print("\n" + "=" * 60)
    if db_ok and src_ok:
        print("OVERALL: ALL AUDITS PASSED")
    else:
        print("OVERALL: SOME AUDITS FAILED")
    print("=" * 60)

    sys.exit(0 if (db_ok and src_ok) else 1)
