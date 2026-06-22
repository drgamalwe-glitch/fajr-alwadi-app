# AGENTS.md — Fajr Alwadi Accounting System

## Session Status (2026-06-22)

### Verification Commands
- `cargo check` — 0 errors, 3 pre-existing unused function warnings
- `npx tsc --noEmit` — exit 0
- `python3 scripts/accounting_audit.py static` — S1–S51 all PASS
- Runtime DB tests require `fajr_alwadi.db` in project root or `data/` or `src-tauri/`

### Fixes Applied (All 4 ISSUEs Closed)

**ISSUE 1: `add_car` broad car ledger deletion**
- Created `delete_car_purchase_ledger_entries` (type_-filtered: purchase-specific values)
- Created `delete_car_sale_ledger_entries` (type_-filtered: sale-specific patterns)
- Replaced `DELETE FROM financial_ledger WHERE reference_type = 'car'` with precise logic:
  - Car number changed → `DELETE ... reference_id = ?1` (entire old number's ledger)
  - Existing car, same number, purchase changed → `delete_car_purchase_ledger_entries`
  - Existing car, same number, new sale (`should_create_sale_transactions && !skip_sale`) → `delete_car_sale_ledger_entries`
  - Only non-financial fields changed → delete nothing
- `record_car_purchase_ledger_entries` conditional on `should_rebuild_purchase`
- `record_car_sale_ledger_entries` conditional on `should_create_sale_transactions && !skip_sale`

**ISSUE 2: Down payment not explicitly classified**
- Replaced `classify_partner_transaction` + `related_source` update with single UPDATE:
  `source_type='customer_sale_payment'`, `source_id='{car_number}:down_payment'`,
  `source_role='sale_down_payment'`, `affects_qasa=1`, `affects_partner_cash=1`,
  `affects_profit=0`, `related_source_type='car'`, `related_source_id=car_number`

**ISSUE 3: `update_partner` not transactional + too broad ledger update**
- Added `ledger_account_type_for_kind` helper: `زبون`→`receivable`, `ممول`→`funder`, `شركة`→`payable`, `مستثمر`→`investor`
- Wrapped function in `transaction()`
- Blocks kind change when `financial_ledger` history exists: Arabic error
- `UPDATE financial_ledger SET account_id` now scoped by `account_type = mapped`

**ISSUE 4: Audit coverage**
- Static checks S46–S51
- Runtime scenarios 41–45 (both `accounting_audit.py` and `check_installment_profit.py`)
- Frontend `skipSaleAccounting` flag (preserved from prior session)

### Key Files
- `src-tauri/src/lib.rs` — All backend fixes (9348 lines)
- `src/components/CarsTab.tsx` — Frontend skipSaleAccounting flag
- `scripts/accounting_audit.py` — 51 static + 49 runtime checks
- `scripts/check_installment_profit.py` — 45 test scenarios

### Pending
- Runtime DB tests (scenarios 41–45) — need a seeded `fajr_alwadi.db`
