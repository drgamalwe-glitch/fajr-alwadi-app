import sys
sys.path.append('accounting_tests')
import sqlite3
from decimal import Decimal

# Read the file content of 2_expected_accounting.py
with open('accounting_tests/2_expected_accounting.py', 'r') as f:
    code = f.read()

# Replace the add_balance definition to print its calls
old_def = """    def add_balance(acc_type: str, acc_id: str | None, curr: str, amount: Decimal):
        acc_id = acc_id.strip() if acc_id else "قاصه"
        curr = curr.strip() if curr else "IQD"
        key = (acc_type.strip(), acc_id, curr)
        expected_balances[key] = expected_balances.get(key, Decimal("0.0")) + amount"""

new_def = """    def add_balance(acc_type: str, acc_id: str | None, curr: str, amount: Decimal):
        acc_id = acc_id.strip() if acc_id else "قاصه"
        curr = curr.strip() if curr else "IQD"
        key = (acc_type.strip(), acc_id, curr)
        if acc_type == "cash":
            print(f"ADD CASH: {acc_id} | {curr} | {amount}")
        expected_balances[key] = expected_balances.get(key, Decimal("0.0")) + amount"""

code = code.replace(old_def, new_def)

# Execute the modified code in global context
exec(code, globals())

# Call the function
print("--- RUNNING CALCULATION ---")
calculate_expected_accounting('src-tauri/fjr_alwadi_data.db')
