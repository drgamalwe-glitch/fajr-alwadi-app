# AGENTS.md — Fajr Alwadi Accounting System

## Session Status (2026-06-22)

### Verification Commands
- `cargo check` — 0 errors, 3 pre-existing unused function warnings
- `npx tsc --noEmit` — exit 0
- `python3 scripts/accounting_audit.py static` — S1–S55 all PASS
- Runtime DB tests require `fajr_alwadi.db` in project root or `data/` or `src-tauri/`

### Final Fix Applied (ISSUE 1 FINAL — oldNum branch)

**The Bug:** When editing a car, the frontend always sends `oldNum` (set to `car.car_number`). The old `add_car` code checked `if !old_num.is_empty()` and did a broad `DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1` — deleting ALL financial_ledger rows for that car (purchase + sale + receivable + revenue + COGS + inventory). The precise deletion path only ran in the `else if is_existing_car` branch, which was never reached when `oldNum` was present.

**The Fix:**
1. Added `car_number_changed = has_old_num && old_num != car_number` — distinguishes actual number change from same-number edit.
2. Added `same_car_edit = is_existing_car && (!has_old_num || old_num == car_number)` — captures normal edits of the same car.
3. `if car_number_changed`: broad delete only when number actually changes (safe — old number being removed).
4. `else if same_car_edit`: precise type-filtered deletion via `delete_car_purchase_ledger_entries` / `delete_car_sale_ledger_entries`.
5. Added `sale_changed` boolean that detects changes to: selling_price, sale_currency, payment_type, amount_paid, amount_remaining, installment_months, monthly_payment, buyer_name, buyer_phone, sale_date, delivery_date, first_payment_date.
6. Replaced `should_create_sale_transactions` with `should_rebuild_sale_ledger` in all sale ledger deletion/recording conditions.

**update_partner hardening:** Removed the broad `account_type NOT IN ('receivable', 'funder', 'payable', 'investor')` fallback. Now only updates ledger rows scoped by the mapped account_type — a customer rename never touches funder/cash/capital/inventory/revenue/expense rows.

### Key Files
- `src-tauri/src/lib.rs` — All fixes (9381 lines)
  - `add_car` — restructured oldNum branch, added `sale_changed`/`should_rebuild_sale_ledger`
  - `update_partner` — removed broad fallback
  - Extended `old_car_data` query with 12 sale fields
- `scripts/accounting_audit.py` — 55 static checks S1–S55; runtime checks 1–52
- `scripts/check_installment_profit.py` — 52 test scenarios (1–52)

### Pending
- Runtime DB tests (scenarios 50–52) — need a seeded `fajr_alwadi.db`
