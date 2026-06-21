import sys
sys.path.append('accounting_tests')
import sqlite3
from decimal import Decimal
import importlib
expected_accounting = importlib.import_module("2_expected_accounting")
get_decimal = expected_accounting.get_decimal
is_deposit_type = expected_accounting.is_deposit_type

db_path = 'src-tauri/fjr_alwadi_data.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("--- CAR CASH FLOWS ---")
cursor.execute("SELECT * FROM cars")
for car in cursor.fetchall():
    car_number = car["car_number"]
    purchase_price = get_decimal(car["purchase_price"])
    selling_price = get_decimal(car["selling_price"])
    curr = car["currency"] or "IQD"
    s_curr = car["sale_currency"] or curr
    status = car["status"]
    p_type = car["purchase_type"] or "كاش"
    p_reg = car["purchase_payment_type"] or "قاصه"
    
    # car expenses
    cursor.execute("SELECT amount FROM car_expenses WHERE car_number = ?", (car_number,))
    car_expenses_sum = sum(get_decimal(r["amount"]) for r in cursor.fetchall())
    
    if purchase_price > 0.0 and p_type == "كاش" and curr == "IQD":
        print(f"Car purchase {car_number}: -{purchase_price} from {p_reg}")
        
    if car_expenses_sum > 0.0 and curr == "IQD":
        print(f"Car expenses {car_number}: -{car_expenses_sum}")
        
    if status == "مبيوعة" and s_curr == "IQD":
        sale_payment = car["payment_type"] or "كاش"
        amount_paid = get_decimal(car["amount_paid"])
        if sale_payment == "كاش":
            print(f"Car sale {car_number} cash: +{selling_price}")
        else:
            if amount_paid > 0.0:
                print(f"Car sale {car_number} prepayment: +{amount_paid}")

print("\n--- GENERAL EXPENSE CASH FLOWS ---")
cursor.execute("SELECT * FROM expenses WHERE car_number IS NULL OR car_number = ''")
for exp in cursor.fetchall():
    amount = get_decimal(exp["amount"])
    curr = exp["currency"] or "IQD"
    desc = exp["description"]
    if curr == "IQD":
        print(f"General expense {desc}: -{amount}")

print("\n--- AGENCY CASH FLOWS ---")
cursor.execute("SELECT * FROM agencies")
for ag in cursor.fetchall():
    amount_iqd = get_decimal(ag["amount_iqd"])
    if amount_iqd > 0.0:
        print(f"Agency {ag['id']} profit: +{amount_iqd}")
        
cursor.execute("SELECT * FROM agency_transactions")
for tx in cursor.fetchall():
    amount = get_decimal(tx["amount"])
    curr = tx["currency"] or "IQD"
    tx_type = tx["type_"]
    if curr == "IQD":
        if tx_type == "ايداع":
            print(f"Agency tx deposit: +{amount}")
        else:
            print(f"Agency tx withdrawal: -{amount}")

print("\n--- PARTNER / GLOBAL CASH FLOWS ---")
cursor.execute("SELECT * FROM partner_transactions")
for pt in cursor.fetchall():
    name = pt["partner_name"]
    kind = pt["kind"]
    tx_type = pt["type"]
    amount = get_decimal(pt["amount"])
    curr = pt["currency"] or "IQD"
    payment_reg = pt["payment_type"] or "قاصه"
    is_dep = is_deposit_type(tx_type)
    
    is_internal_split = (
        tx_type.startswith("سحب شراء سيارة")
        or tx_type.startswith("ايداع بيع سيارة")
        or tx_type.startswith("مقدمة بيع سيارة")
        or tx_type.startswith("سحب مصروف")
        or tx_type.startswith("سحب تسديد")
        or tx_type.startswith("ايداع ارباح وكالة")
        or tx_type.startswith("ايداع ارباح سيارة")
        or tx_type.startswith("تسديد قسط") and kind != "زبون"
        or tx_type.startswith("باقي")
        or tx_type.startswith("تحويل")
        or tx_type.startswith("توزيع أرباح")
        or tx_type.startswith("سحب أرباح")
        or tx_type.startswith("تسوية مسحوبات")
        or tx_type.startswith("إعادة استثمار")
        or (pt["notes"] and "ارجاع (الكاش" in pt["notes"])
        or (pt["notes"] and "شراكة سيارة" in pt["notes"])
    )
    
    if curr == "IQD" and not is_internal_split:
        if kind == "زبون":
            if is_dep:
                print(f"Customer deposit {name}: -{amount}") # matching code logic
            else:
                print(f"Customer withdrawal {name}: -{amount}")
        elif kind == "شريك":
            if is_dep:
                print(f"Partner deposit {name}: +{amount}")
            else:
                print(f"Partner withdrawal {name}: -{amount}")
        elif kind == "مستثمر":
            if is_dep:
                print(f"Investor deposit {name}: +{amount}")
            else:
                print(f"Investor withdrawal {name}: -{amount}")
        elif kind == "ممول":
            if not is_dep:
                print(f"Funder payback {name}: -{amount}")
        elif kind == "شركة":
            if not is_dep:
                print(f"Company payback {name}: -{amount}")

print("\n--- PROFIT DISTRIBUTION CASH FLOWS ---")
cursor.execute("SELECT * FROM profit_distributions")
for pd in cursor.fetchall():
    dist_id = pd["id"]
    total_profit = get_decimal(pd["total_profit"])
    curr = pd["currency"] or "IQD"
    cursor.execute("SELECT * FROM partner_profit_shares WHERE distribution_id = ?", (dist_id,))
    for sh in cursor.fetchall():
        amount_paid = get_decimal(sh["amount_paid"])
        if amount_paid > 0.0 and curr == "IQD":
            print(f"Profit share paid {sh['partner_name']}: -{amount_paid}")
