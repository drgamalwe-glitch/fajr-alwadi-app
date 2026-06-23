# Tauri Verification Plan

**Status:** Pending real backend verification  
**Date:** 2026-06-23  
**Context:** All 20 previously failed E2E_BRIDGE scenarios now pass after bridge fixes. Rust backend (`src-tauri/src/lib.rs`) already implements most of these behaviors; verification confirms bridge parity with production.

---

## Priority 1 — Must verify in real Tauri

| Behavior | Scenarios | Rust functions to exercise |
|---|---|---|
| USD inventory by currency | S04 | `get_financial_summary`, `add_car` |
| Installment profit cap | S13 | `calculate_customer_payment_profit_capped`, customer payment handlers |
| Installment profit after car expense | S15 | `add_car_expense_record`, `rebuild_sold_car_accounting_after_cost_change` |
| Car expense after cash sale (qasa only) | S19 | `add_car_expense_record` |
| Edit general expense rebuild | S24 | `update_expense` |
| Investor liability / investments | S26–S29, S71 | `recalculate_partner_total`, `get_financial_summary` ledger investor account |
| Funder repayment from partners | S31–S33, S69 | `pay_financier_from_partners`, `deduct_from_partners_5050_with_effects` |
| Company repayment from partners | S36–S37, S70 | `pay_financier_from_partners` with `financier_kind=شركة` |
| Edit available car purchase | S51 | `add_car` purchase rebuild path |
| Delete sold installment car | S55 | `delete_car`, `delete_sale_generated_customer_rows_for_car` |
| Agency delete by ID | S42 | `delete_agency`, `delete_partner_transactions_by_source_with_ledger` |

---

## Recommended verification commands

```bash
# Full backend suite against real bridge (already uses e2e-bridge; swap to Tauri invoke for production)
npm run test:backend

# Targeted Rust unit/integration tests if available
cd src-tauri && cargo test

# Manual UI smoke in Tauri app for:
# - Investor deposit → dashboard investments card
# - Funder repayment → Qasa and partner cash cards
# - USD car purchase → inventory USD card
```

---

## Known bridge-only changes (verify Rust already correct)

These fixes were applied only to `e2e-bridge/server.mjs`. Rust code was used as reference and already had correct logic for:

- Profit cap (`calculate_customer_payment_profit_capped`)
- Expense update rebuild (`update_expense`)
- Funder/company partner deductions (`pay_financier_from_partners`)
- Car delete cleanup (`delete_sale_generated_customer_rows_for_car`)
- Agency delete by ID (`delete_agency`)
- Purchase price edit rebuild (`add_car` with `should_rebuild_purchase`)

---

## Test expectation changes (document for Tauri runs)

| Scenario | Change | Reason |
|---|---|---|
| S15 | qasa expected -6,000,000 (was -4,000,000) | Car expense cash movement must reduce qasa |
| S19 | qasaAfter expected 7,000,000 (was 6,000,000) | -10M + 18M - 1M = 7M per Instructions.md |

If real Tauri tests use the old expectations, update them before declaring production PASS.

---

## Acceptance criteria

Real Tauri verification is complete when:

1. All 11 priority behaviors pass manual or automated Rust-backed tests
2. Dashboard cards match section totals (Qasa, Cash, Profit, Investments)
3. No regression in the 21 previously full-pass scenarios (S01, S02, S05, etc.)
4. E2E_BRIDGE and Tauri produce identical accounting numbers for the 20 fixed scenarios

---

## Next action

Run `npm run test:accounting:full` with Tauri backend enabled (not E2E bridge) and compare results to this E2E_BRIDGE 71/71 PASS baseline.
