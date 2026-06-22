# AGENTS.md — Fajr Alwadi Accounting System

## Session Status (2026-06-22)

### Verification Commands
- `cargo check` — 0 errors, 4 pre-existing unused function warnings
- `npx tsc --noEmit` — exit 0
- `python3 scripts/accounting_audit.py static` — S1–S64 all PASS
- Runtime DB tests require `fajr_alwadi.db` in project root or `data/` or `src-tauri/`

### Phase 3 Completed — 6 Defects Fixed

**Defect 1 — `skip_sale` blocking sale rebuild when car number changes:**
- Introduced `effective_skip_sale = skip_sale_raw && !car_number_changed` — car_number change always forces sale ledger rebuild.
- Added `sold_cost_changed` flag detecting changes to purchase_price + car_expenses for sold cars.
- `sold_cost_changed` forces both `should_rebuild_purchase` and `should_rebuild_sale_ledger`.

**Defect 2 — No profit cap validation on sold-cost edit:**
- Added `validate_profit_cap_for_car()` helper: queries full_profit (selling_price − purchase_price − expenses_sum) and recognized_profit (SUM of affects_profit rows linked to car). Returns Arabic error if recognized > full_profit.
- Called in `add_car` when `sold_cost_changed` is true, before any rebuild operations.

**Defect 3 — Broad customer split deletion deleting manual payments:**
- Restricted add_car customer-split deletion to `source_type IN ('customer_sale_payment', 'customer_installment_schedule')`.
- Manual customer payments (different source_type or NULL) are preserved.
- Legacy rows (source_type IS NULL, notes LIKE marker) still handled for migration completeness.

**Defect 4 — `delete_partner` SUM(ABS) blocking deletion of fully paid customers:**
- Changed `SUM(ABS(debit - credit))` to `SUM(debit - credit)` with `.abs()` guard in Rust.
- Fully paid-off customers (net balance ≈ 0) can now be deleted.
- Overpaid/underpaid customers with any non-zero net balance are still blocked.

**Defect 5 — Frontend sold-car edit dispatch (identity-only triggers accounting rebuild):**
- Split `hasSoldCarAccountingChange` into `hasSoldCarCostAccountingChange` (financial changes) and removed unused `hasSoldCarIdentityChange`.
- `isSoldCarAccountingEdit` now based only on `hasCostChange` — identity-only edits go through `add_car` with `skipSaleAccounting: true`.

**Defect 6 — Dashboard `handlePayInstallment` direct accounting mutation:**
- Replaced `handlePayInstallment` body with redirect to partner page via `onNavigateToPartner`.
- `handleOpenPayInstallment` now always navigates (no fallback modal).
- Direct mutation (`add_partner_transaction` + `delete_partner_transaction`) removed.

### Key Files
- `src-tauri/src/lib.rs` — Defects 1-4 fixes (9977 lines)
  - `add_car` — `effective_skip_sale`, `sold_cost_changed`, `validate_profit_cap_for_car()` call, scoped customer split deletion
  - `delete_partner` — net balance check (SUM(debit-credit) not SUM(ABS))
  - New `validate_profit_cap_for_car()` helper at ~line 1228
- `src/components/CarsTab.tsx` — Defect 5 fix: `hasSoldCarCostAccountingChange` + `hasCostChange` dispatch
- `src/components/Dashboard.tsx` — Defect 6 fix: redirect-only installment payment
- `scripts/accounting_audit.py` — S1–S64 static checks (S56–S64 new)

### Pending
- Runtime DB tests (scenarios 50–52) — need a seeded `fajr_alwadi.db`
