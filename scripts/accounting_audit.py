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
    # Try to find it
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
    qasa_partner_sum = conn.execute("""
        SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'interopRequire%' THEN -amount
                ELSE 0
            END
        ), 0.0)
        FROM partner_transactions
        WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر')
    """).fetchone()[0]
    print(f"  Qasa (partner+investor) sum: {qasa_partner_sum:,.0f}")
    # This is informational — Qasa card should match this value

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
                     AND type NOT LIKE 'interopRequire%' THEN -amount
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

    # 4. Funders and companies must NOT appear in Qasa
    print("\n[4] Funders/companies in Qasa check...")
    bad_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_qasa = 1 AND kind IN ('ممول', 'شركة')
    """).fetchone()[0]
    if bad_qasa > 0:
        errors.append(f"  FAIL: {bad_qasa} funder/company rows have affects_qasa=1")
    else:
        print("  PASS: No funders/companies in Qasa")

    # 5. Investors appear in Qasa but NOT in Cash
    print("\n[5] Investor Qasa/Cash check...")
    investor_in_cash = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_partner_cash = 1 AND kind = 'مستثمر'
    """).fetchone()[0]
    if investor_in_cash > 0:
        errors.append(f"  FAIL: {investor_in_cash} investor rows have affects_partner_cash=1")
    else:
        print("  PASS: Investors not in partner Cash")

    # 6. Payment profit must not create second cash inflow
    print("\n[6] Payment profit double-counting check...")
    profit_with_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE affects_profit = 1 AND affects_qasa = 1
          AND type = 'ايداع ارباح سيارة'
          AND notes LIKE '%رقم حركة دفعة%'
    """).fetchone()[0]
    if profit_with_qasa > 0:
        errors.append(f"  FAIL: {profit_with_qasa} payment profit rows affect Qasa")
    else:
        print("  PASS: Payment profit does not affect Qasa")

    # 7. Total recognized profit per car never exceeds full car profit
    print("\n[7] Profit cap check...")
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
            errors.append(f"  FAIL: Car {car['car_number']} recognized profit {recognized:,.0f} > full profit {full_profit:,.0f}")
        else:
            print(f"  PASS: Car {car['car_number']} — recognized {recognized:,.0f} / full {full_profit:,.0f}")

    # 8. Car expenses not treated as general expenses
    print("\n[8] Car expense classification check...")
    car_exp_in_expenses = conn.execute("""
        SELECT COUNT(*) FROM expenses
        WHERE car_number IS NOT NULL AND car_number != ''
    """).fetchone()[0]
    print(f"  Car-linked expenses in expenses table: {car_exp_in_expenses} (informational)")

    # 9. No orphan ledger entries
    print("\n[9] Orphan ledger entries check...")
    orphan_partner = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE reference_type = 'partner_transaction'
          AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions)
    """).fetchone()[0]
    if orphan_partner > 0:
        warnings.append(f"  WARN: {orphan_partner} orphan partner_transaction ledger entries")
    else:
        print("  PASS: No orphan partner ledger entries")

    orphan_car_expense = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE reference_type = 'car_expense'
          AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM car_expenses)
    """).fetchone()[0]
    if orphan_car_expense > 0:
        warnings.append(f"  WARN: {orphan_car_expense} orphan car_expense ledger entries")
    else:
        print("  PASS: No orphan car_expense ledger entries")

    # 10. Source classification completeness
    print("\n[10] Source classification check...")
    unclassified = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type IS NULL AND kind = 'شريك'
    """).fetchone()[0]
    if unclassified > 0:
        warnings.append(f"  WARN: {unclassified} partner transactions without source_type")
    else:
        print("  PASS: All partner transactions have source_type")

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
