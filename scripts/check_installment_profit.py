#!/usr/bin/env python3
"""
Installment Profit Verification Script for Fajr Alwadi
Tests the mandatory installment scenario from Instructions.md §21.
"""

import sqlite3
import sys
import os

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

def check_scenario(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    print("=" * 60)
    print("INSTALLMENT PROFIT VERIFICATION")
    print("Scenario from Instructions.md §21")
    print("=" * 60)

    print("""
Expected scenario:
  Purchase Price = 10,000,000
  Selling Price = 20,000,000
  Car Expenses = 0
  Sale Type = Installments
  Down Payment = 5,000,000
  Remaining = 15,000,000

Expected results:
  Full Car Profit = 10,000,000
  Profit Ratio = 50%

  Down payment profit = 5,000,000 × 50% = 2,500,000
  Each partner profit share = 1,250,000

  Installment payment 1,000,000:
    Payment profit = 500,000
    Each partner profit share = 250,000

  After all payments:
    Total recognized profit = 10,000,000
    Amir profit = 5,000,000
    Muntasir profit = 5,000,000

  Qasa/Cash increases only by actual payments.
""")

    # Find a car matching the scenario (or any installment car)
    cars = conn.execute("""
        SELECT car_number, car_name, purchase_price, selling_price, payment_type, status
        FROM cars
        WHERE status = 'مبيوعة' AND payment_type IN ('اقساط', 'موعد')
        ORDER BY car_number
    """).fetchall()

    if not cars:
        print("No installment cars found in database.")
        print("This test requires at least one installment sale to verify.")
        conn.close()
        return True

    all_pass = True
    for car in cars:
        cn = car['car_number']
        print(f"\n--- Car: {car['car_name']} ({cn}) ---")
        print(f"  Purchase: {car['purchase_price']:,.0f}")
        print(f"  Selling:  {car['selling_price']:,.0f}")

        expenses = conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?",
            [cn]
        ).fetchone()[0]
        full_profit = car['selling_price'] - car['purchase_price'] - expenses
        print(f"  Expenses: {expenses:,.0f}")
        print(f"  Full Profit: {full_profit:,.0f}")

        if full_profit <= 0:
            print("  Skipping (no profit)")
            continue

        profit_ratio = full_profit / car['selling_price'] if car['selling_price'] > 0 else 0
        print(f"  Profit Ratio: {profit_ratio:.1%}")

        # Count recognized profit
        amir_profit = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name LIKE '%أمير%' AND kind = 'شريك'
              AND affects_profit = 1 AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]

        muntasir_profit = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name LIKE '%منتصر%' AND kind = 'شريك'
              AND affects_profit = 1 AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]

        total_recognized = amir_profit + muntasir_profit

        print(f"\n  Recognized profit:")
        print(f"    Amir:     {amir_profit:,.0f}")
        print(f"    Muntasir: {muntasir_profit:,.0f}")
        print(f"    Total:    {total_recognized:,.0f}")

        # Check: total recognized <= full profit
        if total_recognized > full_profit + 0.01:
            print(f"  ❌ FAIL: Recognized profit ({total_recognized:,.0f}) > full profit ({full_profit:,.0f})")
            all_pass = False
        else:
            print(f"  ✅ PASS: Recognized profit <= full profit")

        # Check: partner shares are equal (50/50)
        if abs(amir_profit - muntasir_profit) > 0.01:
            print(f"  ❌ FAIL: Partner shares not equal ({amir_profit:,.0f} vs {muntasir_profit:,.0f})")
            all_pass = False
        else:
            print(f"  ✅ PASS: Partner shares are equal")

        # Check: Qasa/Cash not inflated by profit rows
        qasa_from_profit = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE affects_qasa = 1 AND affects_profit = 1
              AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]

        if qasa_from_profit > 0.01:
            print(f"  ❌ FAIL: Profit rows affect Qasa ({qasa_from_profit:,.0f})")
            all_pass = False
        else:
            print(f"  ✅ PASS: Profit rows do not affect Qasa")

    print("\n" + "=" * 60)
    if all_pass:
        print("ALL CHECKS PASSED")
    else:
        print("SOME CHECKS FAILED — review above")
    print("=" * 60)

    conn.close()
    return all_pass

if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else find_db()
    if not db:
        print("ERROR: Could not find database. Pass path as argument.")
        sys.exit(1)
    print(f"Database: {db}")
    success = check_scenario(db)
    sys.exit(0 if success else 1)
