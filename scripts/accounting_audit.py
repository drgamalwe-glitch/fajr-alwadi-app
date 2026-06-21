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

    # 1. Direct INSERT INTO partner_transactions without affects_qasa
    print("\n[S1] INSERT INTO partner_transactions without affects_qasa...")
    insert_pattern = re.compile(
        r'INSERT\s+INTO\s+partner_transactions\s*\([^)]*\)\s*VALUES',
        re.IGNORECASE
    )
    for i, line in enumerate(content.split('\n'), 1):
        if 'INSERT' in line and 'partner_transactions' in line:
            # Check if affects_qasa is in the nearby context (within 5 lines)
            context = '\n'.join(content.split('\n')[max(0,i-3):i+5])
            if 'affects_qasa' not in context and 'source_type' not in context:
                warnings.append(f"WARN: Line {i} — INSERT without affects_qasa: {line.strip()[:80]}")

    # 2. DELETE by notes for agency operations
    print("\n[S2] Agency deletion by notes...")
    for i, line in enumerate(content.split('\n'), 1):
        if 'DELETE' in line and 'partner_transactions' in line and 'notes' in line.lower():
            context = '\n'.join(content.split('\n')[max(0,i-5):i+5])
            if 'agency' in context.lower():
                warnings.append(f"WARN: Line {i} — Agency DELETE by notes: {line.strip()[:80]}")

    # 3. get_* functions calling write helpers
    print("\n[S3] Read-only functions calling write helpers...")
    func_pattern = re.compile(r'fn\s+(get_\w+|list_\w+|read_\w+|summary_\w+)\s*\(', re.IGNORECASE)
    write_helpers = ['recalculate_all_partners', 'recalculate_partner_total', 'record_ledger_entry',
                     'reverse_ledger_entries', 'delete_ledger_entries', 'insert_partner_transaction']
    lines = content.split('\n')
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
            # Skip comments
            stripped = line.split('//')[0] if '//' in line else line
            for helper in write_helpers:
                if helper in stripped and 'fn ' not in stripped and 'NOTE' not in stripped:
                    errors.append(f"FAIL: {in_func} (line {func_start}) calls {helper} at line {i}")
            if brace_depth <= 0 and '{' in content[:content.find(line)]:
                in_func = None

    # 4. Car expenses with reference_type = 'expense'
    print("\n[S4] Car expense reference_type...")
    for i, line in enumerate(content.split('\n'), 1):
        if 'car_expense' in line.lower() and "'expense'" in line and 'reference_type' in line:
            if 'car_expense' not in line:
                warnings.append(f"WARN: Line {i} — Car expense may use wrong reference_type")

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
