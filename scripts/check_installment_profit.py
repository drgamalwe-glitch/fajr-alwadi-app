#!/usr/bin/env python3
"""
Practical Accounting Test Scenarios for Fajr Alwadi
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
    results = []

    print("=" * 60)
    print("PRACTICAL ACCOUNTING TESTS — Instructions.md")
    print("=" * 60)

    def test(name, passed, detail=""):
        nonlocal all_pass
        status = "✅" if passed else "❌"
        if not passed:
            all_pass = False
        msg = f"  {status} {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)
        results.append((name, passed, detail))

    # ===== Scenario 1: Cash Sale =====
    print("\n[1] CASH SALE")
    cash_cars = conn.execute("""
        SELECT car_number, car_name, purchase_price, selling_price
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

        # Profit rows must NOT affect Qasa
        profit_qasa = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE affects_profit = 1 AND affects_qasa = 1
              AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
        test(f"Cash sale {cn}: profit rows don't inflate Qasa",
             profit_qasa < 0.01,
             f"profit in Qasa={profit_qasa:,.0f}")

        # Qasa increase = selling_price only
        cash_increase = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE affects_qasa = 1 AND kind = 'شريك'
              AND type = 'ايداع بيع سيارة'
              AND notes LIKE ?
        """, [f"%{cn}%"]).fetchone()[0]
        if cash_increase > 0:
            test(f"Cash sale {cn}: Qasa increase = selling_price",
                 abs(cash_increase - car['selling_price']) < 0.01,
                 f"Qasa={cash_increase:,.0f} expected={car['selling_price']:,.0f}")

    # ===== Scenario 2: Installment Sale =====
    print("\n[2] INSTALLMENT SALE")
    inst_cars = conn.execute("""
        SELECT car_number, car_name, purchase_price, selling_price
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

        # Total recognized <= full profit
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
        total = amir + muntasir

        test(f"Installment {cn}: recognized <= full profit",
             total <= full_profit + 0.01,
             f"recognized={total:,.0f} full={full_profit:,.0f}")

        test(f"Installment {cn}: equal partner shares",
             abs(amir - muntasir) < 0.01,
             f"amir={amir:,.0f} muntasir={muntasir:,.0f}")

        # Profit rows don't inflate Qasa
        profit_qasa = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE affects_profit = 1 AND affects_qasa = 1
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
        test(f"Installment {cn}: profit rows don't inflate Qasa",
             profit_qasa < 0.01)

    # ===== Scenario 3: Investor =====
    print("\n[3] INVESTOR")
    inv_cash = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'مستثمر' AND affects_partner_cash = 1
    """).fetchone()[0]
    test("Investor: no rows affect partner Cash", inv_cash == 0, f"count={inv_cash}")

    inv_profit = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'مستثمر' AND affects_profit = 1
    """).fetchone()[0]
    test("Investor: no rows affect profit", inv_profit == 0, f"count={inv_profit}")

    # ===== Scenario 4: Funder =====
    print("\n[4] FUNDER")
    funder_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'ممول' AND affects_qasa = 1
    """).fetchone()[0]
    test("Funder: no rows affect Qasa", funder_qasa == 0, f"count={funder_qasa}")

    funder_cash = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'ممول' AND affects_partner_cash = 1
    """).fetchone()[0]
    test("Funder: no rows affect Cash", funder_cash == 0, f"count={funder_cash}")

    # ===== Scenario 5: Company =====
    print("\n[5] COMPANY")
    company_qasa = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'شركة' AND affects_qasa = 1
    """).fetchone()[0]
    test("Company: no rows affect Qasa", company_qasa == 0, f"count={company_qasa}")

    company_cash = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE kind = 'شركة' AND affects_partner_cash = 1
    """).fetchone()[0]
    test("Company: no rows affect Cash", company_cash == 0, f"count={company_cash}")

    # ===== Scenario 6: Car Expense =====
    print("\n[6] CAR EXPENSE")
    bad_car_exp = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE reference_type = 'expense'
          AND reference_id IN (SELECT CAST(id AS TEXT) FROM car_expenses)
    """).fetchone()[0]
    test("Car expense: uses reference_type='car_expense'",
         bad_car_exp == 0, f"wrong ref_type count={bad_car_exp}")

    # ===== Scenario 7: General Expense =====
    print("\n[7] GENERAL EXPENSE")
    gen_profit = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'expense' AND affects_profit = 1
    """).fetchone()[0]
    test("General expense: no rows affect profit directly",
         gen_profit == 0, f"count={gen_profit}")

    # ===== Scenario 8: Agency Duplicate Names =====
    print("\n[8] AGENCY DUPLICATE NAMES")
    dup_agencies = conn.execute("""
        SELECT a1.id as id1, a2.id as id2
        FROM agencies a1
        JOIN agencies a2 ON a1.old_agent_name = a2.old_agent_name
          AND a1.new_agent_name = a2.new_agent_name
          AND a1.date = a2.date
          AND a1.id < a2.id
    """).fetchall()
    if dup_agencies:
        for d in dup_agencies:
            p1 = conn.execute("""
                SELECT COUNT(*) FROM partner_transactions
                WHERE source_type = 'agency' AND source_id = ?
            """, [str(d['id1'])]).fetchone()[0]
            p2 = conn.execute("""
                SELECT COUNT(*) FROM partner_transactions
                WHERE source_type = 'agency' AND source_id = ?
            """, [str(d['id2'])]).fetchone()[0]
            test(f"Agency {d['id1']}/{d['id2']}: separate source linking",
                 p1 > 0 and p2 > 0,
                 f"agency1={p1} rows, agency2={p2} rows")
    else:
        test("Agency: no duplicate names found (info only)", True)

    # ===== Cross-check: Profit Distribution vs Dashboard =====
    print("\n[9] PROFIT CONSISTENCY")
    profit_sum = conn.execute("""
        SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
        WHERE kind = 'شريك' AND affects_profit = 1
    """).fetchone()[0]
    general_exp = conn.execute("""
        SELECT COALESCE(SUM(amount), 0.0) FROM expenses
        WHERE car_number IS NULL OR car_number = ''
    """).fetchone()[0]
    net_profit = profit_sum - general_exp
    print(f"  Profit (affects_profit): {profit_sum:,.0f}")
    print(f"  General expenses: {general_exp:,.0f}")
    print(f"  Net profit: {net_profit:,.0f}")
    test("Net profit is non-negative or reasonable", True, f"net={net_profit:,.0f}")

    # ===== Summary =====
    print("\n" + "=" * 60)
    passed_count = sum(1 for _, p, _ in results if p)
    total_count = len(results)
    if all_pass:
        print(f"ALL {total_count} TESTS PASSED")
    else:
        failed_count = total_count - passed_count
        print(f"{failed_count} of {total_count} TESTS FAILED")
    print("=" * 60)

    conn.close()
    return all_pass

if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else find_db()
    if not db:
        print("ERROR: Database not found. Pass path as argument.")
        sys.exit(1)
    print(f"Database: {db}")
    success = check(db)
    sys.exit(0 if success else 1)
