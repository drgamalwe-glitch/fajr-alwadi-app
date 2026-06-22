# AGENTS.md — Fajr Alwadi Accounting System

## Session Status (2026-06-22)

### Verification Commands
- `cargo check` — 0 errors, 4 pre-existing unused function warnings
- `npx tsc --noEmit` — exit 0
- `python3 scripts/accounting_audit.py static` — S1–S64 all PASS
- Runtime DB tests require `fajr_alwadi.db` in project root or `data/` or `src-tauri/`

### Phase 3 Completed — 9 Defects Fixed (Rounds 1 + 2)

**Round 1 (6 defects):**
- Defect 1: `effective_skip_sale = skip_sale_raw && !car_number_changed`
- Defect 2: `validate_profit_cap_for_car()` helper + call for sold_cost_changed
- Defect 3: add_car customer split deletion scoped by source_type
- Defect 4: delete_partner SUM(ABS) → SUM(debit-credit) with .abs()
- Defect 5: CarsTab split hasSoldCarCostAccountingChange from hasSoldCarAccountingChange
- Defect 6: Dashboard handlePayInstallment redirect-only (no direct mutation)

**Round 2 (5 defects):**
- Defect 1: `effective_skip_sale` now also respects `!sold_cost_changed` (moved after sold_cost_changed calc)
- Defect 2: CarsTab now has 3 separated helpers: `hasSoldCarSaleAccountingChange`, `hasSoldCarCostAccountingChange` (checks purchase fields), `hasSoldCarIdentityChange` (car_number). `isSoldCarAccountingEdit` combines all 3.
- Defect 3: New `rebuild_sold_car_accounting_after_cost_change` used in add_expense + delete_car_expense_record. For cash sales: rebuilds profit_recognition splits via delete + re-apply. For installment: rebuilds ledger only, preserves manual payments.
- Defect 4: delete_partner now also blocks `مستثمر` with non-zero net balance.
- Defect 5: Static audit S60-S64 strengthened: S60 checks all 3 helpers defined, S61 checks they're combined in dispatch, S62 checks effective_skip_sale has both guards, S64 checks no direct mutation in Dashboard + has guard.

### Key Files
- `src-tauri/src/lib.rs` — All backend fixes (~10007 lines)
  - `add_car`: `effective_skip_sale` with `!sold_cost_changed`
  - `validate_profit_cap_for_car()` at ~line 1228
  - `rebuild_sold_car_accounting_after_cost_change()` before add_expense
  - `delete_partner`: investor balance check added
  - `add_expense`, `delete_car_expense_record`: use rebuild helper
- `src/components/CarsTab.tsx` — 3 helpers: sale, cost, identity; dispatch combines all 3
- `scripts/accounting_audit.py` — S1–S64 (S60–S64 strengthened)

### Pending
- Runtime DB tests (scenarios 50–52) — need a seeded `fajr_alwadi.db`
