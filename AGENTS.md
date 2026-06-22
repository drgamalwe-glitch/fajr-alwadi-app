# AGENTS.md — Fajr Alwadi Accounting System

## Session Status (2026-06-22)

### Verification Commands
- `cargo check` — 0 errors, 5 pre-existing unused function warnings
- `npx tsc --noEmit` — exit 0
- `python3 scripts/accounting_audit.py static` — S1–S71 all PASS
- Runtime DB tests require `fajr_alwadi.db` in project root or `data/` or `src-tauri/`

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

### Pending
- Runtime DB tests (scenarios 50–52) — need a seeded `fajr_alwadi.db`
