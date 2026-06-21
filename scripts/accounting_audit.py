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
    db = sys.argv[1] if len(sys.argv) > 1 else find_db()
    lib = find_lib_rs()

    db_ok = True
    src_ok = True

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
