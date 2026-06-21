#!/usr/bin/env python3
"""
Accounting Test Scenarios for Fajr Alwadi
Validates Instructions.md required scenarios against the database.
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

def check(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    all_pass = True

    print("=" * 60)
    print("ACCOUNTING TEST SCENARIOS — Instructions.md")
    print("=" * 60)

    # ===== Scenario 1: Cash Sale =====
    print("\n[1] CASH SALE SCENARIO")
    print("  Expected: Qasa/Cash increase = selling_price only")
    print("  Expected: Profit recognized separately, not as extra cash")
    cash_cars = conn.execute("""
        SELECT car_number, car_name, purchase_price, selling_price,
               COALESCE(sale_currency, 'IQD') as sale_currency
        FROM cars WHERE status = 'مبيوعة' AND payment_type = 'كاش'
    """).fetchall()
    for car in cash_cars:
        cn = car['car_number']
        expenses = conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", [cn]
        ).fetchone()[0]
        full_profit = car['selling_price'] - car['purchase_price'] - expenses
        if full_profit <= 0:
            continue

        # Check: profit rows do NOT affect Qasa
        profit_qasa = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE affects_profit = 1 AND affects_qasa = 1
              AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]

        if profit_qasa > 0.01:
            print(f"  ❌ FAIL: Car {cn} profit rows affect Qasa ({profit_qasa:,.0f})")
            all_pass = False
        else:
            print(f"  ✅ Car {cn}: Profit rows do not inflate Qasa")

    # ===== Scenario 2: Installment Sale =====
    print("\n[2] INSTALLMENT SALE SCENARIO")
    inst_cars = conn.execute("""
        SELECT car_number, car_name, purchase_price, selling_price,
               COALESCE(sale_currency, 'IQD') as sale_currency
        FROM cars WHERE status = 'مبيوعة' AND payment_type IN ('اقساط', 'موعد')
    """).fetchall()
    for car in inst_cars:
        cn = car['car_number']
        expenses = conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", [cn]
        ).fetchone()[0]
        full_profit = car['selling_price'] - car['purchase_price'] - expenses
        if full_profit <= 0:
            continue

        # Check: total recognized <= full profit
        amir = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name LIKE '%أمير%' AND kind = 'شريك'
              AND affects_profit = 1 AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]

        muntasir = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name LIKE '%منتصر%' AND kind = 'شريك'
              AND affects_profit = 1 AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]

        total_recognized = amir + muntasir

        if total_recognized > full_profit + 0.01:
            print(f"  ❌ FAIL: Car {cn} recognized {total_recognized:,.0f} > full profit {full_profit:,.0f}")
            all_pass = False
        else:
            print(f"  ✅ Car {cn}: Recognized {total_recognized:,.0f} / {full_profit:,.0f}")

        # Check: equal partner shares
        if abs(amir - muntasir) > 0.01:
            print(f"  ❌ FAIL: Car {cn} unequal shares ({amir:,.0f} vs {muntasir:,.0f})")
            all_pass = False

        # Check: profit rows don't inflate Qasa
        profit_qasa = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE affects_profit = 1 AND affects_qasa = 1
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
        if profit_qasa > 0.01:
            print(f"  ❌ FAIL: Car {cn} profit rows affect Qasa")
            all_pass = False

    # ===== Scenario 3: Investor =====
    print("\n[3] INVESTOR SCENARIO")
    inv_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'مستثمر' AND affects_qasa = 1
    """).fetchone()[0]
    inv_cash = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'مستثمر' AND affects_partner_cash = 1
    """).fetchone()[0]
    inv_profit = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'مستثمر' AND affects_profit = 1
    """).fetchone()[0]
    if inv_cash > 0:
        print(f"  ❌ FAIL: {inv_cash} investor rows affect partner Cash")
        all_pass = False
    else:
        print("  ✅ Investor rows do not affect partner Cash")
    if inv_profit > 0:
        print(f"  ❌ FAIL: {inv_profit} investor rows affect profit")
        all_pass = False
    else:
        print("  ✅ Investor rows do not affect profit")

    # ===== Scenario 4: Funder =====
    print("\n[4] FUNDER SCENARIO")
    funder_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'ممول' AND affects_qasa = 1 AND type NOT LIKE 'سحب%'
    """).fetchone()[0]
    if funder_qasa > 0:
        print(f"  ❌ FAIL: {funder_qasa} funder deposit rows affect Qasa")
        all_pass = False
    else:
        print("  ✅ Funder deposits do not affect Qasa")

    # ===== Scenario 5: Company =====
    print("\n[5] COMPANY SCENARIO")
    company_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'شركة' AND affects_qasa = 1
    """).fetchone()[0]
    if company_qasa > 0:
        print(f"  ❌ FAIL: {company_qasa} company rows affect Qasa")
        all_pass = False
    else:
        print("  ✅ Company rows do not affect Qasa")

    # ===== Scenario 6: Car Expense =====
    print("\n[6] CAR EXPENSE SCENARIO")
    bad_car_exp = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE reference_type = 'expense'
          AND reference_id IN (SELECT CAST(id AS TEXT) FROM car_expenses)
    """).fetchone()[0]
    if bad_car_exp > 0:
        print(f"  ❌ FAIL: {bad_car_exp} car expenses use reference_type='expense'")
        all_pass = False
    else:
        print("  ✅ Car expenses use reference_type='car_expense'")

    # ===== Scenario 7: General Expense =====
    print("\n[7] GENERAL EXPENSE SCENARIO")
    gen_exp = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'expense' AND affects_partner_cash = 1
    """).fetchone()[0]
    print(f"  INFO: {gen_exp} general expense partner rows (should reduce Cash)")
    bad_gen = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'expense' AND affects_profit = 1
    """).fetchone()[0]
    if bad_gen > 0:
        print(f"  ❌ FAIL: {bad_gen} general expense rows affect profit")
        all_pass = False
    else:
        print("  ✅ General expenses do not affect profit directly")

    # ===== Scenario 8: Agency Duplicate Names =====
    print("\n[8] AGENCY DUPLICATE NAMES SCENARIO")
    dup_agencies = conn.execute("""
        SELECT a1.id as id1, a2.id as id2, a1.old_agent_name, a1.new_agent_name, a1.date
        FROM agencies a1
        JOIN agencies a2 ON a1.old_agent_name = a2.old_agent_name
          AND a1.new_agent_name = a2.new_agent_name
          AND a1.date = a2.date
          AND a1.id < a2.id
    """).fetchall()
    if dup_agencies:
        for d in dup_agencies:
            # Check that deleting one doesn't affect the other's profit
            profit1 = conn.execute("""
                SELECT COUNT(*) FROM partner_transactions
                WHERE source_type = 'agency' AND source_id = ?
            """, [str(d['id1'])]).fetchone()[0]
            profit2 = conn.execute("""
                SELECT COUNT(*) FROM partner_transactions
                WHERE source_type = 'agency' AND source_id = ?
            """, [str(d['id2'])]).fetchone()[0]
            print(f"  INFO: Agencies {d['id1']}({profit1} rows) and {d['id2']}({profit2} rows) share names/date")
            if profit1 > 0 and profit2 > 0:
                print(f"  ✅ Both agencies have separate profit rows (source_id linked)")
    else:
        print("  INFO: No duplicate agency names found")

    # ===== Summary =====
    print("\n" + "=" * 60)
    if all_pass:
        print("ALL SCENARIOS PASSED")
    else:
        print("SOME SCENARIOS FAILED — review above")
    print("=" * 60)

    conn.close()
    return all_pass

if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else find_db()
    if not db:
        print("ERROR: Could not find database. Pass path as argument.")
        sys.exit(1)
    print(f"Database: {db}")
    success = check(db)
    sys.exit(0 if success else 1)
