#!/usr/bin/env python3
"""
Accounting Audit Script for Fajr Alwadi
Checks accounting integrity against Instructions.md rules.
Run against the SQLite database directly.
"""

import sqlite3
import sys
import os

def find_db():
    """Find the database file."""
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

def audit(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    errors = []
    warnings = []

    print("=" * 60)
    print("ACCOUNTING AUDIT — Fajr Alwadi")
    print("=" * 60)

    # 1. Qasa = sum of affects_qasa movements
    print("\n[1] Qasa consistency check...")
    qasa_sum = conn.execute("""
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
        WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر')
    """).fetchone()[0]
    print(f"  Qasa (partner+investor) sum: {qasa_sum:,.0f}")

    # 2. Cash = sum of affects_partner_cash partner movements
    print("\n[2] Cash consistency check...")
    cash_sum = conn.execute("""
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
        WHERE affects_partner_cash = 1 AND kind = 'شريك'
    """).fetchone()[0]
    print(f"  Cash (partner only) sum: {cash_sum:,.0f}")

    # 3. Profit = affects_profit movements - general expenses
    print("\n[3] Profit consistency check...")
    profit_sum = conn.execute("""
        SELECT COALESCE(SUM(amount), 0.0)
        FROM partner_transactions
        WHERE kind = 'شريك' AND affects_profit = 1
    """).fetchone()[0]
    general_expenses = conn.execute("""
        SELECT COALESCE(SUM(amount), 0.0)
        FROM expenses
        WHERE car_number IS NULL OR car_number = ''
    """).fetchone()[0]
    net_profit = profit_sum - general_expenses
    print(f"  Total profit (affects_profit): {profit_sum:,.0f}")
    print(f"  General expenses: {general_expenses:,.0f}")
    print(f"  Net profit: {net_profit:,.0f}")

    # 4. No funder/company rows with affects_qasa = 1
    print("\n[4] Funders/companies in Qasa check...")
    bad_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_qasa = 1 AND kind IN ('ممول', 'شركة')
    """).fetchone()[0]
    if bad_qasa > 0:
        errors.append(f"FAIL: {bad_qasa} funder/company rows have affects_qasa=1")
    else:
        print("  PASS: No funders/companies in Qasa")

    # 5. No funder/company rows with affects_partner_cash = 1
    print("\n[5] Funders/companies in Cash check...")
    bad_cash = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_partner_cash = 1 AND kind IN ('ممول', 'شركة')
    """).fetchone()[0]
    if bad_cash > 0:
        errors.append(f"FAIL: {bad_cash} funder/company rows have affects_partner_cash=1")
    else:
        print("  PASS: No funders/companies in partner Cash")

    # 6. No investor rows with affects_partner_cash = 1
    print("\n[6] Investor Cash check...")
    investor_in_cash = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_partner_cash = 1 AND kind = 'مستثمر'
    """).fetchone()[0]
    if investor_in_cash > 0:
        errors.append(f"FAIL: {investor_in_cash} investor rows have affects_partner_cash=1")
    else:
        print("  PASS: Investors not in partner Cash")

    # 7. No profit recognition rows with affects_qasa = 1
    print("\n[7] Profit rows in Qasa check...")
    profit_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_profit = 1 AND affects_qasa = 1
    """).fetchone()[0]
    if profit_qasa > 0:
        errors.append(f"FAIL: {profit_qasa} profit rows have affects_qasa=1")
    else:
        print("  PASS: Profit rows do not affect Qasa")

    # 8. No profit recognition rows with affects_partner_cash = 1
    print("\n[8] Profit rows in Cash check...")
    profit_cash = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_profit = 1 AND affects_partner_cash = 1
    """).fetchone()[0]
    if profit_cash > 0:
        errors.append(f"FAIL: {profit_cash} profit rows have affects_partner_cash=1")
    else:
        print("  PASS: Profit rows do not affect Cash")

    # 9. No duplicate cash ledger rows for same car sale
    print("\n[9] Duplicate car sale cash ledger check...")
    dup_cash = conn.execute("""
        SELECT reference_id, COUNT(*) as cnt
        FROM financial_ledger
        WHERE reference_type = 'car' AND account_type = 'cash'
          AND type_ = 'بيع سيارة كاش'
        GROUP BY reference_id
        HAVING cnt > 1
    """).fetchall()
    if dup_cash:
        for r in dup_cash:
            errors.append(f"FAIL: Car {r['reference_id']} has {r['cnt']} duplicate cash sale ledger rows")
    else:
        print("  PASS: No duplicate cash sale ledger rows")

    # 10. No duplicate COGS rows for same car
    print("\n[10] Duplicate COGS check...")
    dup_cogs = conn.execute("""
        SELECT reference_id, COUNT(*) as cnt
        FROM financial_ledger
        WHERE reference_type = 'car' AND type_ = 'تكلفة المبيعات'
        GROUP BY reference_id
        HAVING cnt > 1
    """).fetchall()
    if dup_cogs:
        for r in dup_cogs:
            errors.append(f"FAIL: Car {r['reference_id']} has {r['cnt']} duplicate COGS rows")
    else:
        print("  PASS: No duplicate COGS rows")

    # 11. Inventory credit uses total_cost not selling_price
    print("\n[11] Inventory credit check...")
    bad_inv = conn.execute("""
        SELECT fl.reference_id, fl.credit, c.selling_price, c.purchase_price,
               COALESCE((SELECT SUM(amount) FROM car_expenses WHERE car_number = fl.reference_id), 0) as exp_sum
        FROM financial_ledger fl
        JOIN cars c ON c.car_number = fl.reference_id
        WHERE fl.reference_type = 'car' AND fl.account_type = 'inventory'
          AND fl.credit > 0
          AND fl.credit > c.purchase_price + COALESCE((SELECT SUM(amount) FROM car_expenses WHERE car_number = fl.reference_id), 0) + 0.01
    """).fetchall()
    if bad_inv:
        for r in bad_inv:
            expected = r['purchase_price'] + r['exp_sum']
            errors.append(f"FAIL: Car {r['reference_id']} inventory credit {r['credit']:,.0f} > total_cost {expected:,.0f}")
    else:
        print("  PASS: Inventory credits use correct total_cost")

    # 12. No car_expense rows stored as reference_type = 'expense'
    print("\n[12] Car expense reference_type check...")
    bad_car_exp = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE reference_type = 'expense'
          AND reference_id IN (SELECT CAST(id AS TEXT) FROM car_expenses)
    """).fetchone()[0]
    if bad_car_exp > 0:
        errors.append(f"FAIL: {bad_car_exp} car_expense rows stored as reference_type='expense'")
    else:
        print("  PASS: Car expenses use reference_type='car_expense'")

    # 13. Orphan ledger entries
    print("\n[13] Orphan ledger entries check...")
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
        else:
            print(f"  PASS: No orphan {ref_type} ledger entries")

    # 14. Profit cap per car
    print("\n[14] Profit cap check...")
    cars = conn.execute("""
        SELECT car_number, purchase_price, selling_price, COALESCE(currency, 'IQD') as currency,
               COALESCE(sale_currency, 'IQD') as sale_currency
        FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in cars:
        if car['currency'] != car['sale_currency']:
            continue
        expenses = conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?",
            [car['car_number']]
        ).fetchone()[0]
        full_profit = car['selling_price'] - car['purchase_price'] - expenses
        if full_profit <= 0:
            continue
        recognized = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE kind = 'شريك' AND affects_profit = 1 AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{car['car_number']}%"]).fetchone()[0]
        if recognized > full_profit + 0.01:
            errors.append(f"FAIL: Car {car['car_number']} recognized {recognized:,.0f} > full profit {full_profit:,.0f}")
        else:
            print(f"  PASS: Car {car['car_number']} — {recognized:,.0f} / {full_profit:,.0f}")

    # 15. Source classification completeness
    print("\n[15] Source classification check...")
    unclassified = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type IS NULL AND kind = 'شريك'
    """).fetchone()[0]
    if unclassified > 0:
        warnings.append(f"WARN: {unclassified} partner transactions without source_type")
    else:
        print("  PASS: All partner transactions have source_type")

    # 16. No old capital entries for customer payments
    print("\n[16] Capital entries check...")
    bad_capital = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE reference_type = 'partner_transaction'
          AND account_type = 'capital'
          AND reference_id IN (SELECT CAST(id AS TEXT) FROM partner_transactions WHERE type = 'ايداع دفعات زبائن')
    """).fetchone()[0]
    if bad_capital > 0:
        errors.append(f"FAIL: {bad_capital} customer payment rows have capital ledger entries")
    else:
        print("  PASS: No customer payments in capital")

    # Summary
    print("\n" + "=" * 60)
    if errors:
        print(f"AUDIT FAILED — {len(errors)} error(s):")
        for e in errors:
            print(f"  ❌ {e}")
    else:
        print("AUDIT PASSED — No critical errors found")

    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  ⚠️  {w}")

    print("=" * 60)
    conn.close()
    return len(errors) == 0

if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else find_db()
    if not db:
        print("ERROR: Could not find database. Pass path as argument.")
        sys.exit(1)
    print(f"Database: {db}")
    success = audit(db)
    sys.exit(0 if success else 1)
