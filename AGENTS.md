# AGENTS.md — Fajr Alwadi Accounting System

## Session Status (2026-06-22) — ✅ VERIFICATION COMPLETE

### Final Verification Results

| Check | Result |
|---|---|
| `cargo check` | ✅ PASS — 0 errors, 5 unused fn warnings |
| `npx tsc --noEmit` | ✅ PASS — exit 0 |
| `python3 scripts/accounting_audit.py static` | ✅ PASS — S1–S71 |
| `python3 scripts/accounting_runtime_scenarios.py` | ✅ PASS — 25/25, 120/120 assertions |
| `python3 scripts/accounting_audit.py "<fresh_db>"` | ✅ PASS — clean pre/post smoke |
| `python3 scripts/check_installment_profit.py "<fresh_db>"` | ✅ PASS — 37/37 |
| `python3 scripts/smoke_test_real_db.py` | ✅ PASS — 9/9 workflows, 51/51 assertions |
| `python3 scripts/accounting_audit.py "<fresh_db>"` (post-smoke) | ✅ PASS — clean |

### Tags
- `accounting-verified-v1`
- `fajr-alwadi-accounting-stable-2026-06-22`

### Key Files
- `AUDIT_RESULTS.md` — Full verification report
- `src-tauri/fjr_alwadi_data.clean_verified_2026-06-22.db` — Clean DB backup
- `scripts/smoke_test_real_db.py` — Real fresh DB smoke test suite

### Phase 3 Completed — 11 Defects Fixed (Rounds 1 + 2 + 3)

**Round 1 (6 defects):**
- Defect 1: `effective_skip_sale = skip_sale_raw && !car_number_changed`
- Defect 2: `validate_profit_cap_for_car()` helper + call for sold_cost_changed
- Defect 3: add_car customer split deletion scoped by source_type
- Defect 4: delete_partner SUM(ABS) → SUM(debit-credit) with .abs()
- Defect 5: CarsTab split hasSoldCarCostAccountingChange from hasSoldCarAccountingChange
- Defect 6: Dashboard handlePayInstallment redirect-only (no direct mutation)

**Round 2 (5 defects):**
- Defect 1: `effective_skip_sale` now also respects `!sold_cost_changed`
- Defect 2: CarsTab: 3 helpers sale/cost/identity, dispatch combines all 3
- Defect 3: `rebuild_sold_car_accounting_after_cost_change` for add_expense + delete_car_expense_record
- Defect 4: delete_partner blocks `مستثمر` with non-zero net balance
- Defect 5: Static audit S60-S64 strengthened

**Round 3 (2 defects):**
- Defect 1: CarsTab dispatch split: cost/identity→add_car, sale→update_sold_car
- Defect 2: add_car_expense_record uses rebuild helper
- Static audit S65-S67 added

**Round 4 (1 defect):**
- Defect 1: add_car deletes customer sale rows (down payment, installment schedule) during cost/number-only edits without rebuilding them
- Backend: customer row deletion guarded by `if sale_changed`
- Frontend: mixed edits (sale + cost/identity) blocked with Arabic error
- Static audit S68-S71 added

### Key Files
- `src-tauri/src/lib.rs` — All backend fixes (~10076 lines)
  - `add_car`: `effective_skip_sale` with `!sold_cost_changed`, customer row deletion guarded by `if sale_changed`
  - `validate_profit_cap_for_car()` at ~line 1228
  - `rebuild_sold_car_accounting_after_cost_change()` before add_expense
  - `delete_partner`: investor balance check added
  - `add_expense`, `delete_car_expense_record`, `add_car_expense_record`: use rebuild helper
- `src/components/CarsTab.tsx` — 3 helpers: sale, cost, identity; dispatch: sale→update_sold_car, cost/identity→add_car, mixed edits→Arabic error
- `scripts/accounting_audit.py` — S1–S71 static checks
- `scripts/accounting_runtime_scenarios.py` — 25-scenario seeded runtime tests
- `scripts/smoke_test_real_db.py` — 9-workflow real fresh DB smoke tests
- `scripts/check_installment_profit.py` — 37 practical accounting tests
