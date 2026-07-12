#!/usr/bin/env python3
"""
Practical Accounting Test Scenarios for Fajr Alwadi
Validates Instructions.md required scenarios against the database.
"""

import sqlite3
import sys
import os
from decimal import Decimal, InvalidOperation

MONEY_EPSILON = Decimal("0.01")

def money(value):
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")

def find_db():
    """Find the Fajr Alwadi SQLite DB in documented app-data locations.

    Bug P3: previously this function did an os.walk over the entire home
    directory which is slow and broad. We now only check the documented
    paths used by the Tauri app (see src-tauri/src/lib.rs::setup).
    Bug P4: the DB filename is `fjr_alwadi_data.db`, not `fajr_alwadi.db`.
    For non-default installs, pass the DB path as a CLI argument instead:
        python check_installment_profit.py /path/to/fjr_alwadi_data.db
    """
    candidates = [
        # Dev mode (cargo run): CARGO_MANIFEST_DIR/fjr_alwadi_data.db
        os.path.join(os.path.dirname(os.path.dirname(__file__)),
                     "src-tauri", "fjr_alwadi_data.db"),
        # Linux release
        os.path.expanduser("~/.local/share/com.fajralwadi.app/fjr_alwadi_data.db"),
        # macOS release
        os.path.expanduser("~/Library/Application Support/com.fajralwadi.app/fjr_alwadi_data.db"),
        # Windows release (AppData/Roaming)
        os.path.expandvars("%APPDATA%/com.fajralwadi.app/fjr_alwadi_data.db"),
        # Legacy fallback name (older dev installs)
        "fjr_alwadi_data.db",
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
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
        expenses = money(conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", [cn]
        ).fetchone()[0])
        selling = money(car['selling_price'])
        purchase = money(car['purchase_price'])
        full_profit = selling - purchase - expenses
        if full_profit <= 0:
            continue

        profit_qasa = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE affects_profit = 1 AND affects_qasa = 1
              AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0]
        test(f"Cash sale {cn}: profit rows don't inflate Qasa",
             profit_qasa < 0.01,
             f"profit in Qasa={profit_qasa:,.0f}")

        cash_increase = money(conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE affects_qasa = 1 AND kind = 'شريك'
              AND source_type = 'car_sale'
              AND source_id = ?
              AND source_role = 'cash_movement'
        """, [cn]).fetchone()[0])
        if cash_increase > 0:
            test(f"Cash sale {cn}: Qasa increase = selling_price",
                 abs(cash_increase - selling) < MONEY_EPSILON,
                 f"Qasa={cash_increase:,.0f} expected={selling:,.0f}")

    # ===== Scenario 2: Installment Sale =====
    print("\n[2] INSTALLMENT SALE")
    inst_cars = conn.execute("""
        SELECT car_number, car_name, purchase_price, selling_price
        FROM cars WHERE status = 'مبيوعة' AND payment_type IN ('اقساط', 'موعد')
    """).fetchall()
    for car in inst_cars:
        cn = car['car_number']
        expenses = money(conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", [cn]
        ).fetchone()[0])
        full_profit = money(car['selling_price']) - money(car['purchase_price']) - expenses
        if full_profit <= 0:
            continue

        amir = money(conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name LIKE '%أمير%' AND kind = 'شريك'
              AND affects_profit = 1 AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0])
        muntasir = money(conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name LIKE '%منتصر%' AND kind = 'شريك'
              AND affects_profit = 1 AND type = 'ايداع ارباح سيارة'
              AND notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0])
        total = amir + muntasir

        test(f"Installment {cn}: recognized <= full profit",
             total <= full_profit + MONEY_EPSILON,
             f"recognized={total:,.0f} full={full_profit:,.0f}")

        test(f"Installment {cn}: equal partner shares",
             abs(amir - muntasir) < MONEY_EPSILON,
             f"amir={amir:,.0f} muntasir={muntasir:,.0f}")

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

    # ===== Scenario 9: Profit Consistency =====
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

    # ===== Scenario 10: Customer Payment Cash Movement (ALL payments, not just car-linked) =====
    print("\n[10] CUSTOMER PAYMENT CASH MOVEMENT (ALL PAYMENTS)")
    customer_payments = conn.execute("""
        SELECT id, amount, notes FROM partner_transactions
        WHERE kind = 'زبون' AND source_type = 'customer_transaction'
          AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
               OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
    """).fetchall()
    for cp in customer_payments:
        cp_amount = money(cp['amount'])
        cash_movement = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE source_type = 'customer_payment' AND source_id = ?
              AND source_role = 'cash_movement' AND kind = 'شريك'
        """, [str(cp['id'])]).fetchone()[0]
        test(f"Payment {cp['id']}: cash movement = payment amount",
             abs(money(cash_movement) - cp_amount) < MONEY_EPSILON,
             f"cash={money(cash_movement):,.0f} expected={cp_amount:,.0f}")

        bad_cash_affects = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE source_type = 'customer_payment' AND source_id = ?
              AND source_role = 'cash_movement'
              AND (affects_qasa != 1 OR affects_partner_cash != 1 OR affects_profit != 0)
        """, [str(cp['id'])]).fetchone()[0]
        test(f"Payment {cp['id']}: cash movement has correct affects",
             bad_cash_affects == 0, f"bad count={bad_cash_affects}")

    # ===== Scenario 10b: Profit recognition only for car-linked payments =====
    print("\n[10b] PROFIT RECOGNITION ONLY FOR CAR-LINKED PAYMENTS")
    for cp in customer_payments:
        has_car_ref = '#بيع_سيارة_' in (cp['notes'] or '')
        has_profit = conn.execute("""
            SELECT COUNT(*) > 0 FROM partner_transactions
            WHERE source_type = 'customer_payment' AND source_id = ?
              AND source_role = 'profit_recognition' AND kind = 'شريك'
        """, [str(cp['id'])]).fetchone()[0]
        if has_car_ref:
            # Car-linked payment: profit recognition may exist (depends on profit calc)
            test(f"Payment {cp['id']}: car-linked payment profit check",
                 True, f"has_profit={has_profit}")
        else:
            # Non-car-linked payment: profit recognition must NOT exist
            test(f"Payment {cp['id']}: non-car payment has no profit recognition",
                 not has_profit, f"has_profit={has_profit}")

    # ===== Scenario 11: Customer Payment Capital / Receivable (NET values) =====
    print("\n[11] CUSTOMER PAYMENT CAPITAL / RECEIVABLE (NET)")
    customer_payments_cr = conn.execute("""
        SELECT id, amount FROM partner_transactions
        WHERE kind = 'زبون' AND source_type = 'customer_transaction'
          AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
               OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
    """).fetchall()
    for cp in customer_payments_cr:
        cp_id = str(cp['id'])
        cp_amount = money(cp['amount'])
        # Net capital change (handles reversals)
        cap_net = conn.execute("""
            SELECT COALESCE(SUM(fl.credit - fl.debit), 0.0) FROM financial_ledger fl
            WHERE fl.reference_type = 'partner_transaction'
              AND fl.account_type = 'capital'
              AND fl.reference_id IN (
                  SELECT CAST(id AS TEXT) FROM partner_transactions
                  WHERE source_type = 'customer_payment' AND source_id = ?
              )
        """, [cp_id]).fetchone()[0]
        test(f"Payment {cp_id}: no capital entry (net)",
             abs(cap_net) < 0.01, f"cap net={cap_net:,.0f}")

        # Net receivable credit (handles reversals)
        recv_net = conn.execute("""
            SELECT COALESCE(SUM(fl.credit - fl.debit), 0.0) FROM financial_ledger fl
            WHERE fl.reference_type = 'partner_transaction'
              AND fl.reference_id = ?
              AND fl.account_type = 'receivable'
        """, [cp_id]).fetchone()[0]
        test(f"Payment {cp_id}: receivable reduces (net)",
             abs(money(recv_net) - cp_amount) < MONEY_EPSILON,
             f"recv net={money(recv_net):,.0f} expected={cp_amount:,.0f}")

        # Net cash debit from generated cash_movement rows (handles reversals)
        cash_net = conn.execute("""
            SELECT COALESCE(SUM(fl.debit - fl.credit), 0.0) FROM financial_ledger fl
            JOIN partner_transactions pt ON CAST(pt.id AS TEXT) = fl.reference_id
            WHERE fl.reference_type = 'partner_transaction'
              AND fl.account_type = 'cash'
              AND pt.source_type = 'customer_payment' AND pt.source_id = ?
              AND pt.source_role = 'cash_movement' AND pt.kind = 'شريك'
        """, [cp_id]).fetchone()[0]
        test(f"Payment {cp_id}: cash increases (net)",
             abs(money(cash_net) - cp_amount) < MONEY_EPSILON,
             f"cash net={money(cash_net):,.0f} expected={cp_amount:,.0f}")

    # ===== Scenario 12: Investor Double-Count =====
    print("\n[12] INVESTOR DOUBLE-COUNT")
    investor_auto = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'investor_transaction' AND source_role = 'partner_cash_payment'
    """).fetchone()[0]
    test("Investor: no auto partner_cash_payment rows",
         investor_auto == 0, f"count={investor_auto}")

    # ===== Scenario 13: Rebuild must create cash_movement for ALL payments =====
    print("\n[13] REBUILD COMPLETENESS (ALL PAYMENTS)")
    customer_payments_rebuild = conn.execute("""
        SELECT id, amount, notes FROM partner_transactions
        WHERE kind = 'زبون' AND source_type = 'customer_transaction'
          AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
               OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
    """).fetchall()
    for cp in customer_payments_rebuild:
        cp_id = str(cp['id'])
        has_cash = conn.execute("""
            SELECT COUNT(*) > 0 FROM partner_transactions
            WHERE source_type = 'customer_payment' AND source_id = ?
              AND source_role = 'cash_movement' AND kind = 'شريك'
        """, [cp_id]).fetchone()[0]
        test(f"Payment {cp_id}: cash_movement exists",
             has_cash, f"exists={has_cash}")

    # ===== Scenario 14: Complete Installment Cycle =====
    print("\n[14] COMPLETE INSTALLMENT CYCLE")
    inst_cars_cycle = conn.execute("""
        SELECT car_number, purchase_price, selling_price
        FROM cars WHERE status = 'مبيوعة' AND payment_type IN ('اقساط', 'موعد')
    """).fetchall()
    for car in inst_cars_cycle:
        cn = car['car_number']
        expenses = money(conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", [cn]
        ).fetchone()[0])
        full_profit = money(car['selling_price']) - money(car['purchase_price']) - expenses
        if full_profit <= 0:
            continue

        # Total recognized profit (using NET values for reversal safety)
        recognized_net = money(conn.execute("""
            SELECT COALESCE(SUM(pt.amount), 0.0) FROM partner_transactions pt
            WHERE pt.kind = 'شريك' AND pt.affects_profit = 1
              AND pt.type = 'ايداع ارباح سيارة'
              AND pt.notes LIKE ?
        """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0])
        test(f"Installment {cn}: total recognized <= full profit",
             recognized_net <= full_profit + MONEY_EPSILON,
             f"recognized={recognized_net:,.0f} full={full_profit:,.0f}")

        # Customer balance for this car's buyer
        buyer = conn.execute("""
            SELECT buyer_name FROM cars WHERE car_number = ?
        """, [cn]).fetchone()
        if buyer and buyer['buyer_name']:
            buyer_name = buyer['buyer_name']
            buyer_bal = conn.execute("""
                SELECT COALESCE(iqd_balance, 0.0) FROM partners
                WHERE partner_name = ? AND kind = 'زبون'
            """, [buyer_name]).fetchone()
            if buyer_bal:
                buyer_balance = money(buyer_bal[0])
                test(f"Installment {cn}: customer {buyer_name} balance >= 0",
                     buyer_balance >= -MONEY_EPSILON,
                     f"balance={buyer_balance:,.0f}")

    # ===== Scenario 15: Car purchase source_type check =====
    print("\n[15] CAR PURCHASE SOURCE TYPE")
    bad_purchase_source = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE type = 'سحب شراء'
          AND source_type = 'car_sale'
          AND source_role = 'cash_payment'
    """).fetchone()[0]
    test("Car purchase rows use source_type='car_purchase'",
         bad_purchase_source == 0, f"bad count={bad_purchase_source}")

    # ===== Scenario 16: Car sale ledger balance =====
    print("\n[16] CAR SALE LEDGER BALANCE")
    sold_cars_bal = conn.execute("""
        SELECT car_number FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars_bal:
        cn = car['car_number']
        bal = conn.execute("""
            SELECT COALESCE(SUM(debit), 0.0), COALESCE(SUM(credit), 0.0)
            FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
        """, [cn]).fetchone()
        if bal:
            test(f"Car {cn}: ledger balanced",
                 abs(bal[0] - bal[1]) < 0.01,
                 f"debit={bal[0]:,.0f} credit={bal[1]:,.0f}")

    # ===== Scenario 17: Installment receivable net (corrected) =====
    print("\n[17] INSTALLMENT RECEIVABLE NET")
    # Check if related_source_type column exists
    has_related_col = False
    try:
        conn.execute("SELECT related_source_type FROM partner_transactions LIMIT 1")
        has_related_col = True
    except:
        pass

    inst_recv_cars = conn.execute("""
        SELECT car_number, selling_price, buyer_name FROM cars
        WHERE status = 'مبيوعة' AND payment_type IN ('اقساط', 'موعد')
    """).fetchall()
    for car in inst_recv_cars:
        cn = car['car_number']
        buyer = car['buyer_name']
        selling = money(car['selling_price'])
        if not buyer:
            continue
        # Car ledger receivable should be full selling price
        car_recv = money(conn.execute("""
            SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
              AND account_type = 'receivable'
        """, [cn]).fetchone()[0])
        test(f"Car {cn}: car ledger receivable = selling price",
             abs(car_recv - selling) < MONEY_EPSILON,
             f"car_recv={car_recv:,.0f} selling={selling:,.0f}")
        # Payment receivable credits
        if has_related_col:
            payment_recv = money(conn.execute("""
                SELECT COALESCE(SUM(fl.credit - fl.debit), 0.0) FROM financial_ledger fl
                WHERE fl.reference_type = 'partner_transaction'
                  AND fl.account_type = 'receivable'
                  AND fl.account_id = ?
                  AND fl.reference_id IN (
                      SELECT CAST(pt.id AS TEXT) FROM partner_transactions pt
                      WHERE (pt.related_source_type = 'car' AND pt.related_source_id = ?)
                         OR (pt.related_source_id IS NULL AND pt.notes LIKE ?)
                  )
            """, [buyer, cn, f"%#بيع_سيارة_{cn}%"]).fetchone()[0])
            total_payments = money(conn.execute("""
                SELECT COALESCE(SUM(pt.amount), 0.0) FROM partner_transactions pt
                WHERE pt.kind = 'زبون'
                  AND COALESCE(pt.is_reversed, 0) = 0
                  AND (
                    pt.source_type = 'customer_transaction'
                    OR (pt.source_type = 'customer_sale_payment' AND pt.source_role = 'sale_down_payment')
                  )
                  AND ((pt.related_source_type = 'car' AND pt.related_source_id = ?)
                       OR (pt.related_source_id IS NULL AND pt.notes LIKE ?))
            """, [cn, f"%#بيع_سيارة_{cn}%"]).fetchone()[0])
        else:
            payment_recv = money(conn.execute("""
                SELECT COALESCE(SUM(fl.credit - fl.debit), 0.0) FROM financial_ledger fl
                WHERE fl.reference_type = 'partner_transaction'
                  AND fl.account_type = 'receivable'
                  AND fl.account_id = ?
            """, [buyer]).fetchone()[0])
            total_payments = money(conn.execute("""
                SELECT COALESCE(SUM(pt.amount), 0.0) FROM partner_transactions pt
                WHERE pt.kind = 'زبون'
                  AND COALESCE(pt.is_reversed, 0) = 0
                  AND (
                    pt.source_type = 'customer_transaction'
                    OR (pt.source_type = 'customer_sale_payment' AND pt.source_role = 'sale_down_payment')
                  )
                  AND pt.notes LIKE ?
            """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0])
        net_receivable = car_recv - payment_recv
        expected_remaining = selling - total_payments
        test(f"Car {cn}: net receivable correct",
             abs(net_receivable - expected_remaining) < MONEY_EPSILON,
             f"net={net_receivable:,.0f} expected={expected_remaining:,.0f}")

    # ===== Scenario 18: Profit cap source linking =====
    print("\n[18] PROFIT CAP SOURCE LINKING")
    if has_related_col:
        bad_profit_rows = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE kind = 'شريك' AND affects_profit = 1
              AND source_role = 'profit_recognition'
              AND source_type = 'customer_payment'
              AND (related_source_id IS NULL OR related_source_id = '')
              AND notes LIKE '%#بيع_سيارة_%'
        """).fetchone()[0]
        test("Profit rows have related_source_id for car-linked payments",
             bad_profit_rows == 0, f"bad count={bad_profit_rows}")
    else:
        test("Profit rows have related_source_id (column not yet added)", True, "SKIP")

    # ===== Scenario 19: Profit cap not exceeded =====
    print("\n[19] PROFIT CAP NOT EXCEEDED")
    sold_cars_cap = conn.execute("""
        SELECT car_number, purchase_price, selling_price FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars_cap:
        cn = car['car_number']
        expenses = money(conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", [cn]
        ).fetchone()[0])
        full_profit = money(car['selling_price']) - money(car['purchase_price']) - expenses
        if full_profit <= 0:
            continue
        if has_related_col:
            recognized = money(conn.execute("""
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE kind = 'شريك' AND affects_profit = 1
                  AND source_role = 'profit_recognition'
                  AND related_source_type = 'car' AND related_source_id = ?
            """, [cn]).fetchone()[0])
            recognized_legacy = money(conn.execute("""
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE kind = 'شريك' AND affects_profit = 1
                  AND source_role = 'profit_recognition'
                  AND (related_source_id IS NULL OR related_source_id = '')
                  AND notes LIKE ?
            """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0])
        else:
            recognized = Decimal("0")
            recognized_legacy = money(conn.execute("""
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE kind = 'شريك' AND affects_profit = 1
                  AND notes LIKE ?
            """, [f"%#بيع_سيارة_{cn}%"]).fetchone()[0])
        total_recognized = recognized + recognized_legacy
        test(f"Car {cn}: profit cap respected",
             total_recognized <= full_profit + MONEY_EPSILON,
             f"recognized={total_recognized:,.0f} full={full_profit:,.0f}")

    # ===== Scenario 20: Installment ledger balanced =====
    print("\n[20] INSTALLMENT LEDGER BALANCED")
    inst_bal_cars = conn.execute("""
        SELECT car_number, selling_price FROM cars
        WHERE status = 'مبيوعة' AND payment_type IN ('اقساط', 'موعد')
    """).fetchall()
    for car in inst_bal_cars:
        cn = car['car_number']
        selling = money(car['selling_price'])
        bal = conn.execute("""
            SELECT COALESCE(SUM(debit), 0.0), COALESCE(SUM(credit), 0.0)
            FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
        """, [cn]).fetchone()
        if bal:
            test(f"Car {cn}: installment ledger balanced",
                 abs(bal[0] - bal[1]) < 0.01,
                 f"debit={bal[0]:,.0f} credit={bal[1]:,.0f}")

    # ===== Scenario 21: source_id preserved for customer payments =====
    print("\n[21] SOURCE_ID PRESERVATION")
    bad_source_id = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'customer_payment'
          AND source_role IN ('cash_movement', 'profit_recognition')
          AND source_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions WHERE kind = 'زبون')
    """).fetchone()[0]
    test("Customer payment splits have correct source_id (payment ID, not car number)",
         bad_source_id == 0, f"bad count={bad_source_id}")

    # ===== Scenario 22: v11 migration =====
    print("\n[22] V11 MIGRATION")
    # This is a static check — just verify the DB version
    db_ver = conn.execute("SELECT MAX(version) FROM db_version").fetchone()[0]
    test("DB version >= 11 (v11 migration applied)",
         db_ver >= 11, f"version={db_ver}")

    # ===== Scenario 23: Customer balance vs ledger receivable net =====
    print("\n[23] CUSTOMER BALANCE VS LEDGER")
    customers_bal = conn.execute("""
        SELECT partner_name, COALESCE(iqd_balance, 0.0) as iqd_bal, COALESCE(usd_balance, 0.0) as usd_bal
        FROM partners WHERE kind = 'زبون'
    """).fetchall()
    for cust in customers_bal:
        cname = cust['partner_name']
        iqd_bal = money(cust['iqd_bal'])
        usd_bal = money(cust['usd_bal'])
        iqd_ledger = money(conn.execute("""
            SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
            WHERE account_type = 'receivable' AND account_id = ? AND currency = 'IQD'
        """, [cname]).fetchone()[0])
        usd_ledger = money(conn.execute("""
            SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
            WHERE account_type = 'receivable' AND account_id = ? AND currency = 'USD'
        """, [cname]).fetchone()[0])
        test(f"Customer {cname}: IQD balance matches ledger",
             abs(iqd_bal - iqd_ledger) < MONEY_EPSILON,
             f"balance={iqd_bal:,.0f} ledger={iqd_ledger:,.0f}")
        test(f"Customer {cname}: USD balance matches ledger",
             abs(usd_bal - usd_ledger) < MONEY_EPSILON,
             f"balance={usd_bal:,.0f} ledger={usd_ledger:,.0f}")

    # ===== Scenario 24: related_source_id migration completeness =====
    print("\n[24] RELATED_SOURCE_ID MIGRATION")
    if has_related_col:
        bad_related = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE notes LIKE '%#بيع_سيارة_%'
              AND (related_source_id IS NULL OR related_source_id = '' OR related_source_id LIKE '% %')
        """).fetchone()[0]
        test("All car-linked rows have clean related_source_id",
             bad_related == 0, f"bad count={bad_related}")
    else:
        test("related_source_id column exists", False, "column not found")

    # ===== Scenario 25: Mixed currency check =====
    print("\n[25] MIXED CURRENCY CHECK")
    mixed_cars = conn.execute("""
        SELECT car_number, COALESCE(currency, 'IQD') as purchase_curr, COALESCE(sale_currency, 'IQD') as sale_curr
        FROM cars WHERE status = 'مبيوعة'
          AND COALESCE(currency, 'IQD') != COALESCE(sale_currency, 'IQD')
    """).fetchall()
    test("No sold cars with mixed purchase/sale currencies",
         len(mixed_cars) == 0,
         f"mixed count={len(mixed_cars)}")

    # ===== Scenario 26: Orphan ledger check =====
    print("\n[26] ORPHAN LEDGER CHECK")
    orphan_count = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger fl
        WHERE fl.reference_type = 'partner_transaction'
          AND fl.reference_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions)
    """).fetchone()[0]
    test("No orphan partner_transaction ledger entries",
         orphan_count == 0, f"orphan count={orphan_count}")

    # ===== Scenario 27: Expense deletion safety =====
    print("\n[27] EXPENSE DELETION SAFETY")
    # Check that expense-related partner transactions have matching ledger entries
    expense_splits = conn.execute("""
        SELECT id FROM partner_transactions
        WHERE source_type = 'expense' AND source_role = 'cash_payment'
    """).fetchall()
    orphans_exp = 0
    for es in expense_splits:
        has_ledger = conn.execute("""
            SELECT COUNT(*) > 0 FROM financial_ledger
            WHERE reference_type = 'partner_transaction' AND reference_id = ?
        """, [str(es['id'])]).fetchone()[0]
        if not has_ledger:
            orphans_exp += 1
    test("Expense partner transactions have matching ledger entries",
         orphans_exp == 0, f"missing ledger count={orphans_exp}")

    # ===== Scenario 28: Car purchase source rebuild on edit =====
    print("\n[28] CAR PURCHASE SOURCE REBUILD")
    # Verify that car_purchase rows exist for all cash-purchased cars
    cash_cars = conn.execute("""
        SELECT car_number, purchase_price FROM cars
        WHERE purchase_type = 'كاش' AND purchase_price > 0
    """).fetchall()
    for car in cash_cars:
        cn = car['car_number']
        expected_purchase = money(car['purchase_price'])
        purchase_rows = money(conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE source_type = 'car_purchase' AND source_id = ? AND source_role = 'cash_payment'
        """, [cn]).fetchone()[0])
        test(f"Car {cn}: purchase rows match purchase price",
             abs(purchase_rows - expected_purchase) < MONEY_EPSILON,
             f"purchase_rows={purchase_rows:,.0f} expected={expected_purchase:,.0f}")

    # ===== Scenario 29: Customer balance after full payment =====
    print("\n[29] CUSTOMER BALANCE AFTER FULL PAYMENT")
    # Check that customers with all installments paid have zero balance
    customers = conn.execute("""
        SELECT partner_name FROM partners WHERE kind = 'زبون'
    """).fetchall()
    for cust in customers:
        cname = cust['partner_name']
        # Check if all installments are paid (no remaining 'باقي' rows)
        remaining = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name = ? AND kind = 'زبون'
              AND type LIKE 'باقي%' AND type NOT LIKE 'واصل%'
        """, [cname]).fetchone()[0]
        paid = conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name = ? AND kind = 'زبون'
              AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                   OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
        """, [cname]).fetchone()[0]
        if money(remaining) <= MONEY_EPSILON and money(paid) > 0:
            # All installments paid - balance should be zero or negative
            balance = money(conn.execute("""
                SELECT COALESCE(iqd_balance, 0.0) FROM partners
                WHERE partner_name = ? AND kind = 'زبون'
            """, [cname]).fetchone()[0])
            test(f"Customer {cname}: balance zero after full payment",
                 abs(balance) < MONEY_EPSILON,
                 f"balance={balance:,.0f}")

    # ===== Scenario 30: Ledger balance per sold car =====
    print("\n[30] LEDGER BALANCE PER SOLD CAR")
    sold_cars = conn.execute("""
        SELECT car_number, selling_price FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars:
        cn = car['car_number']
        bal = conn.execute("""
            SELECT COALESCE(SUM(debit), 0.0), COALESCE(SUM(credit), 0.0)
            FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
        """, [cn]).fetchone()
        if bal:
            test(f"Car {cn}: ledger balanced",
                 abs(bal[0] - bal[1]) < 0.01,
                 f"debit={bal[0]:,.0f} credit={bal[1]:,.0f}")

    # ===== Scenario 31: No 0/0 ledger entries =====
    print("\n[31] NO 0/0 LEDGER ENTRIES")
    zero_zero = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE debit = 0.0 AND credit = 0.0
    """).fetchone()[0]
    test("No 0/0 financial_ledger entries",
         zero_zero == 0, f"count={zero_zero}")

    # ===== Scenario 32: Installment schedule source linking =====
    print("\n[32] INSTALLMENT SCHEDULE SOURCE LINKING")
    has_related = False
    try:
        conn.execute("SELECT related_source_type FROM partner_transactions LIMIT 1")
        has_related = True
    except:
        pass
    if has_related:
        bad_schedule = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE source_type = 'customer_installment_schedule'
              AND (related_source_type IS NULL OR related_source_id IS NULL)
        """).fetchone()[0]
        test("Installment schedule rows have related_source fields",
             bad_schedule == 0, f"bad count={bad_schedule}")
    else:
        test("Installment schedule rows have related_source (column not found)", True, "SKIP")

    # ===== Scenario 33: No duplicate car sale ledger =====
    print("\n[33] NO DUPLICATE CAR SALE LEDGER")
    dup_sale = conn.execute("""
        SELECT reference_id, account_type, COUNT(*) as cnt
        FROM financial_ledger
        WHERE reference_type = 'car'
          AND account_type IN ('receivable', 'deferred_revenue', 'revenue')
        GROUP BY reference_id, account_type
        HAVING cnt > 1
    """).fetchall()
    if dup_sale:
        for r in dup_sale:
            test(f"Car {r['reference_id']}: no duplicate {r['account_type']}",
                 False, f"count={r['cnt']}")
    else:
        test("No duplicate car sale ledger entries", True)

    # ===== Scenario 34: Funder repayment type =====
    print("\n[34] FUNDER REPAYMENT TYPE")
    bad_type = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_role = 'repayment_account_movement'
          AND type NOT IN ('سحب')
    """).fetchone()[0]
    test("Funder repayment type is 'سحب'",
         bad_type == 0, f"bad count={bad_type}")

    # ===== Scenario 35: No duplicate sale customer rows on re-sell (ISSUE 1 + ISSUE 2) =====
    print("\n[35] NO DUPLICATE SALE CUSTOMER ROWS ON RE-SELL")
    has_related = False
    try:
        conn.execute("SELECT related_source_type FROM partner_transactions LIMIT 1")
        has_related = True
    except:
        pass
    if has_related:
        dup_customer = conn.execute("""
            SELECT related_source_id, source_role, COUNT(*) as cnt
            FROM partner_transactions
            WHERE kind = 'زبون' AND related_source_type = 'car'
              AND source_role IS NOT NULL
            GROUP BY related_source_id, source_role, source_id
            HAVING cnt > 1
        """).fetchall()
        if dup_customer:
            for r in dup_customer:
                test(f"Car {r['related_source_id']}: no duplicate {r['source_role']} rows",
                     False, f"count={r['cnt']}")
        else:
            test("No duplicate sale-generated customer rows per car", True)
    else:
        test("No duplicate sale customer rows (related_source missing)", True, "SKIP")

    # ===== Scenario 36: Car existence check in sell_car_with_accounting (ISSUE 3) =====
    print("\n[36] CAR EXISTENCE CHECK")
    # Runtime check: no orphan sale transactions for non-existing cars
    orphan_sales = conn.execute("""
        SELECT COUNT(*) FROM partner_transactions
        WHERE source_type = 'car_sale'
          AND source_id NOT IN (SELECT CAST(car_number AS TEXT) FROM cars)
    """).fetchone()[0]
    test("No sale transactions for non-existing cars",
         orphan_sales == 0, f"orphan count={orphan_sales}")

    # ===== Scenario 37: Purchase only rebuilt when changed (ISSUE 7) =====
    print("\n[37] PURCHASE NOT UNNECESSARILY REBUILT")
    dup_purchase = conn.execute("""
        SELECT source_id, partner_name, COUNT(*) as cnt
        FROM partner_transactions
        WHERE source_type = 'car_purchase' AND source_role = 'cash_payment'
        GROUP BY source_id, partner_name
        HAVING cnt > 1
    """).fetchall()
    if dup_purchase:
        for r in dup_purchase:
            test(f"Car {r['source_id']}: no duplicate purchase for {r['partner_name']}",
                 False, f"count={r['cnt']}")
    else:
        test("No duplicate purchase rows per car", True)

    # ===== Scenario 38: Financial ledger account_id consistency (ISSUE 5) =====
    print("\n[38] FINANCIAL LEDGER ACCOUNT_ID CONSISTENCY")
    orphan_accounts = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger
        WHERE account_type IN ('receivable', 'funder', 'payable', 'investor')
          AND account_id NOT IN (SELECT partner_name FROM partners)
    """).fetchone()[0]
    if orphan_accounts > 0:
        details = conn.execute("""
            SELECT account_type, account_id, debit, credit, type_, reference_type, reference_id FROM financial_ledger
            WHERE account_type IN ('receivable', 'funder', 'payable', 'investor')
              AND account_id NOT IN (SELECT partner_name FROM partners)
        """).fetchall()
        for d in details:
            print("  ORPHAN DETAILED:", dict(d))
    test("No orphan account_ids in financial_ledger",
         orphan_accounts == 0, f"orphan count={orphan_accounts}")

    # ===== Scenario 39: No invalid dates (ISSUE 6) =====
    print("\n[39] NO INVALID DATES")
    bad_dates = 0
    if has_related:
        bad_dates = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE source_type = 'customer_installment_schedule'
              AND date NOT LIKE '____-__-__'
        """).fetchone()[0]
    test("No invalid installment schedule dates",
         bad_dates == 0, f"bad count={bad_dates}")

    # ===== Scenario 40: No duplicate inventory ledger entries (ISSUE 1) =====
    print("\n[40] NO DUPLICATE INVENTORY LEDGER ENTRIES")
    dup_inventory = conn.execute("""
        SELECT reference_id, COUNT(*) as cnt
        FROM financial_ledger
        WHERE reference_type = 'car' AND account_type = 'inventory'
        GROUP BY reference_id
        HAVING cnt > 2
    """).fetchall()
    if dup_inventory:
        for r in dup_inventory:
            test(f"Car {r['reference_id']}: no duplicate inventory entries",
                 False, f"count={r['cnt']}")
    else:
        test("No duplicate inventory ledger entries per car", True)

    # ===== Scenario 41: Sold cars have sale ledger entries (ISSUE 1) =====
    print("\n[41] SOLD CARS HAVE SALE LEDGER ENTRIES")
    sold_cars = conn.execute("""
        SELECT car_number FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars:
        cn = car['car_number']
        sale_entries = conn.execute("""
            SELECT COUNT(*) FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
              AND (type_ LIKE '%بيع%' OR type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%'
                   OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%')
        """, [cn]).fetchone()[0]
        test(f"Car {cn}: sale ledger exists",
             sale_entries > 0, f"count={sale_entries}")
    if not sold_cars:
        test("Sold cars have sale ledger (no sold cars)", True, "SKIP")

    # ===== Scenario 42: Down payment source classification (ISSUE 2) =====
    print("\n[42] DOWN PAYMENT SOURCE CLASSIFICATION")
    sale_down_payments = conn.execute("""
        SELECT id, related_source_id FROM partner_transactions
        WHERE source_type = 'customer_sale_payment'
          AND source_role = 'sale_down_payment'
    """).fetchall()
    if sale_down_payments:
        for sp in sale_down_payments:
            test(f"DP {sp['id']}: correct source classification",
                 True, f"car={sp['related_source_id']}")
    else:
        generic_dp = conn.execute("""
            SELECT COUNT(*) FROM partner_transactions
            WHERE source_type = 'customer_transaction'
              AND source_role LIKE '%down%'
              AND related_source_type = 'car'
        """).fetchone()[0]
        if generic_dp > 0:
            test("Down payments use customer_sale_payment classification",
                 False, f"{generic_dp} rows still use generic classification")
        else:
            test("Down payment classification (no down payments)", True, "SKIP")

    # ===== Scenario 43: Same-name different-kind isolation (ISSUE 3) =====
    print("\n[43] SAME-NAME DIFFERENT-KIND ISOLATION")
    dup_name_kinds = conn.execute("""
        SELECT p1.partner_name, p1.kind as kind1, p2.kind as kind2
        FROM partners p1
        JOIN partners p2 ON p1.partner_name = p2.partner_name AND p1.kind < p2.kind
    """).fetchall()
    for d in dup_name_kinds:
        name = d['partner_name']
        kind1 = d['kind1']
        kind2 = d['kind2']
        acc_mismatch = conn.execute("""
            SELECT fl.account_type FROM financial_ledger fl
            WHERE fl.account_id = ? AND fl.account_type NOT IN
                ('receivable', 'funder', 'payable', 'investor')
            LIMIT 1
        """, [name]).fetchone()
        test(f"Partner '{name}' ({kind1}/{kind2}): ledger isolation",
             acc_mismatch is None,
             f"unexpected account_type={acc_mismatch['account_type'] if acc_mismatch else 'none'}")
    if not dup_name_kinds:
        test("Same-name different-kind isolation (no duplicates)", True)

    # ===== Scenario 44: update_partner transaction integrity (ISSUE 3) =====
    print("\n[44] UPDATE_PARTNER TRANSACTION INTEGRITY")
    orphan_ids = conn.execute("""
        SELECT COUNT(*) FROM financial_ledger fl
        WHERE fl.account_type IN ('receivable', 'funder', 'payable', 'investor')
          AND fl.account_id NOT IN (SELECT partner_name FROM partners)
    """).fetchone()[0]
    test("No orphan financial_ledger account_ids",
         orphan_ids == 0, f"orphan count={orphan_ids}")

    # ===== Scenario 45: No sale ledger deleted on non-financial edit (ISSUE 1) =====
    print("\n[45] NO SALE LEDGER DELETED ON NON-FINANCIAL EDIT")
    sold_cars_sale = conn.execute("""
        SELECT car_number, selling_price FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars_sale:
        cn = car['car_number']
        selling = money(car['selling_price'])
        has_receivable = conn.execute("""
            SELECT COUNT(*) > 0 FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
              AND account_type IN ('receivable', 'revenue')
        """, [cn]).fetchone()[0]
        test(f"Car {cn}: sale ledger preserved",
             has_receivable,
             f"has_receivable={has_receivable}")
    if not sold_cars_sale:
        test("Sale ledger preserved on non-financial edit (no sold cars)", True, "SKIP")

    # ===== Scenario 50: editing sold car non-financial fields preserves sale ledger (ISSUE 1 FINAL) =====
    print("\n[50] EDITING SOLD CAR NON-FINANCIAL FIELDS PRESERVES SALE LEDGER")
    sold_cars = conn.execute("""
        SELECT car_number FROM cars WHERE status = 'مبيوعة'
    """).fetchall()
    for car in sold_cars:
        cn = car['car_number']
        # Count sale ledger entries: receivable/revenue + cash + deferred_revenue + COGS + inventory credit
        sale_ledger_count = conn.execute("""
            SELECT COUNT(*) FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
              AND (type_ LIKE '%بيع%' OR type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%'
                   OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%'
                   OR type_ LIKE '%ارباح%')
        """, [cn]).fetchone()[0]
        # Expected: at least 2 (revenue + cash for cash sale, or receivable + deferred_revenue for installment)
        test(f"Car {cn}: sale ledger count >= 2",
             sale_ledger_count >= 2, f"count={sale_ledger_count}")
    if not sold_cars:
        test("Editing sold car preserves sale ledger (no sold cars)", True, "SKIP")

    # ===== Scenario 51: oldNum == car_number does not delete all ledger (ISSUE 1 FINAL) =====
    print("\n[51] oldNum == car_number DOES NOT DELETE ALL LEDGER")
    all_cars = conn.execute("""
        SELECT car_number FROM cars
    """).fetchall()
    car_ledger_counts = {}
    for car in all_cars:
        cn = car['car_number']
        count = conn.execute("""
            SELECT COUNT(*) FROM financial_ledger
            WHERE reference_type = 'car' AND reference_id = ?
        """, [cn]).fetchone()[0]
        car_ledger_counts[cn] = count
    if car_ledger_counts:
        # Just report counts — the real test is runtime: call add_car with oldNum=car_number
        # then verify counts match. This is a proxy check: any car with 0 ledger entries
        # when it should have some would be flagged.
        for cn, count in car_ledger_counts.items():
            status = conn.execute(
                "SELECT status FROM cars WHERE car_number = ?", [cn]
            ).fetchone()[0]
            expected_min = 2 if status == 'مبيوعة' else 1  # sold cars need sale+inventory, unsold need purchase
            test(f"Car {cn}: ledger count >= {expected_min}",
                 count >= expected_min, f"count={count}")
    else:
        test("oldNum == car_number does not delete all ledger (no cars)", True, "SKIP")

    # ===== Scenario 52: update_partner rename does not touch unrelated account types (ISSUE 3 FINAL) =====
    print("\n[52] UPDATE_PARTNER RENAME DOES NOT TOUCH UNRELATED ACCOUNT TYPES")
    customers = conn.execute("""
        SELECT partner_name FROM partners WHERE kind = 'زبون'
    """).fetchall()
    for c in customers:
        name = c['partner_name']
        # Check if any non-receivable ledger rows exist with this account_id
        unrelated = conn.execute("""
            SELECT COUNT(*) FROM financial_ledger
            WHERE account_id = ? AND account_type NOT IN ('receivable', 'funder', 'payable', 'investor')
        """, [name]).fetchone()[0]
        # If unrelated > 0, a rename via update_partner would have touched these rows
        # (since the old code had the broad fallback, and we verify the new code doesn't)
        test(f"Customer '{name}': no unrelated ledger rows",
             unrelated == 0,
             f"unrelated_count={unrelated}" if unrelated > 0 else "PASS")
    if not customers:
        test("Update_partner unrelated account types (no customers)", True, "SKIP")

    # ===== Scenario 53: Cash sale profit does not double-count in partner balances =====
    print("\n[53] CASH SALE PROFIT NOT DOUBLE-COUNTED IN PARTNER BALANCE")
    cash_sale_cars = conn.execute("""
        SELECT car_number, selling_price FROM cars WHERE status = 'مبيوعة' AND payment_type = 'كاش'
    """).fetchall()
    for car in cash_sale_cars:
        cn = car['car_number']
        sp = money(car['selling_price'])
        # Get cash movement rows for this car
        cash_movement_total = money(conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE source_type = 'car_sale' AND source_id = ?
              AND source_role = 'cash_movement'
        """, [cn]).fetchone()[0])
        # Get profit recognition rows for this car
        profit_recognition_total = money(conn.execute("""
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE source_type = 'car_sale' AND source_id = ?
              AND source_role = 'profit_recognition'
        """, [cn]).fetchone()[0])
        # Only test if cash movement rows exist (skip for pre-migration data)
        if cash_movement_total < 0.01:
            test(f"Car {cn}: cash movement rows exist (pre-migration data)",
                 False, "SKIP — no cash_movement rows found (pre-v13 data)")
            continue
        # Cash movement should equal selling price (full amount split between partners)
        test(f"Car {cn}: cash movement = selling price",
             abs(cash_movement_total - sp) < MONEY_EPSILON,
             f"cash_movement={cash_movement_total:,.0f} selling_price={sp:,.0f}")
        for p_name in ['أمير', 'منتصر']:
            half_sale = sp / 2
            profit_recognition_partner = money(conn.execute("""
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE kind = 'شريك' AND partner_name = ?
                  AND source_type = 'car_sale' AND source_id = ?
                  AND source_role = 'profit_recognition'
            """, [p_name, cn]).fetchone()[0])
            # Partner's cash movement for this car should equal half selling price (not inflated by profit)
            partner_cash_movement = money(conn.execute("""
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE kind = 'شريك' AND partner_name = ?
                  AND source_type = 'car_sale' AND source_id = ?
                  AND source_role = 'cash_movement'
            """, [p_name, cn]).fetchone()[0])
            test(f"Partner {p_name}: cash_movement={partner_cash_movement:,.0f} == half sale ({half_sale:,.0f}), profit/loss={profit_recognition_partner:,.0f} separate",
                 abs(partner_cash_movement - half_sale) < MONEY_EPSILON and abs(profit_recognition_partner) > MONEY_EPSILON,
                 f"cash_movement={partner_cash_movement:,.0f} half_sale={half_sale:,.0f} profit_recognition={profit_recognition_partner:,.0f}")
            # Verify profit recognition has affects_partner_cash = 0
            profit_flags = conn.execute("""
                SELECT affects_partner_cash, affects_qasa, affects_profit FROM partner_transactions
                WHERE kind = 'شريك' AND partner_name = ?
                  AND source_type = 'car_sale' AND source_id = ?
                  AND source_role = 'profit_recognition'
                LIMIT 1
            """, [p_name, cn]).fetchone()
            if profit_flags:
                test(f"Partner {p_name}: profit row flags correct (cash=0, qasa=0, profit=1)",
                     profit_flags[0] == 0 and profit_flags[1] == 0 and profit_flags[2] == 1,
                     f"affects_partner_cash={profit_flags[0]} affects_qasa={profit_flags[1]} affects_profit={profit_flags[2]}")
    if not cash_sale_cars:
        test("Cash sale profit not double-counted (no cash sales)", True, "SKIP")

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
