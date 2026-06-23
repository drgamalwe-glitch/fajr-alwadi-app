# Accounting Failure Analysis — 20 Failed Scenarios

**Generated:** 2026-06-23  
**Backend mode:** E2E_BRIDGE  
**Source of truth:** Instructions.md / AGENTS.md

---

## Summary

| Classification | Count | Scenarios |
|---|---|---|
| BRIDGE_ONLY_BUG | 17 | S04, S13, S15 (profit), S24, S26–S29, S31–S33, S36–S37, S42, S51, S55, S69–S71 |
| TEST_EXPECTATION_BUG | 2 | S15 (qasa), S19 (qasa) |
| REAL_BACKEND_BUG | 0 | — |
| NEEDS_INVESTIGATION | 0 | — |

Rust backend (`src-tauri/src/lib.rs`) already implements: profit cap, expense rebuild, update_expense rebuild, pay_financier partner deductions, investor ledger, agency delete-by-id, delete_car cleanup, purchase price edit rebuild. Failures are overwhelmingly E2E bridge gaps.

---

## S04 — USD cash car purchase

- **Failure reason:** `inventory_usd: expected 10000, got 0`
- **Classification:** BRIDGE_ONLY_BUG
- **Evidence (bridge):** `cmdGetFinancialSummary` hardcodes `inventory_value_usd: 0`; IQD inventory sums all cars without currency filter
- **Evidence (Rust):** `get_financial_summary` reads `inventory_value_usd` from ledger by currency
- **File/function:** `e2e-bridge/server.mjs` → `cmdGetFinancialSummary`
- **Test expectation change:** No
- **Rust change:** No
- **Bridge change:** Yes — split inventory by `cars.currency`
- **Re-test:** `npm run test:accounting:scan-scenario -- S04`

---

## S13 — Installment overpayment

- **Failure reason:** Profit cap exceeded (10,500,000 vs 10,000,000 max)
- **Classification:** BRIDGE_ONLY_BUG
- **Evidence (bridge):** `cmdAddPartnerTransaction` uses `amount * profitRatio` without cap
- **Evidence (Rust):** `calculate_customer_payment_profit_capped` enforces remaining profit
- **File/function:** `e2e-bridge/server.mjs` → `calculatePaymentProfitCapped`, `cmdAddPartnerTransaction`
- **Test expectation change:** No
- **Rust change:** No
- **Bridge change:** Yes
- **Re-test:** `npm run test:accounting:scan-scenario -- S13`

---

## S15 — Installment with car expense

- **Failure reason:** profit 2,900,000 vs 2,400,000; qasa -6,000,000 vs -4,000,000
- **Classification:** BRIDGE_ONLY_BUG (profit) + TEST_EXPECTATION_BUG (qasa)
- **Evidence (bridge):** Car expense not included in down-payment profit ratio; expense cash (-2M) correctly in qasa
- **Evidence (Rust):** `rebuild_sold_car_accounting_after_cost_change` on expense add (installment ledger; profit ratio uses expenses)
- **Correct qasa per Instructions.md:** -10M purchase + 5M down + 1M installment - 2M expense = **-6,000,000**
- **Correct profit:** ratio 40% → 2.4M total
- **File/function:** `e2e-bridge/server.mjs` → `rebuildInstallmentProfitsAfterCostChange`, `cmdAddCarExpenseRecord`; `fast-scan-no-fix.ts` S15 qasa expected
- **Test expectation change:** Yes — qasa expected -6,000,000
- **Rust change:** No
- **Bridge change:** Yes — rebuild installment profit after expense
- **Re-test:** `npm run test:accounting:scan-scenario -- S15`

---

## S19 — Car expense after sale

- **Failure reason:** qasa after expense 7,000,000 vs expected 6,000,000
- **Classification:** TEST_EXPECTATION_BUG
- **Evidence (bridge):** Qasa -10M + 18M sale - 1M expense = 7M (correct)
- **Evidence (Rust):** Car expense creates partner cash movement reducing qasa
- **File/function:** `test/accounting/runners/fast-scan-no-fix.ts` S19
- **Test expectation change:** Yes — qasaAfter = 7,000,000
- **Rust change:** No
- **Bridge change:** No (behavior already correct)
- **Re-test:** `npm run test:accounting:scan-scenario -- S19`

---

## S24 — Edit general expense

- **Failure reason:** qasa -1,000,000 vs -2,000,000 after doubling expense
- **Classification:** BRIDGE_ONLY_BUG
- **Evidence (bridge):** `cmdUpdateExpense` only updates `expenses` table
- **Evidence (Rust):** `update_expense` deletes/rebuilds partner cash rows by source_id
- **File/function:** `e2e-bridge/server.mjs` → `cmdUpdateExpense`
- **Test expectation change:** No
- **Rust change:** No
- **Bridge change:** Yes
- **Re-test:** `npm run test:accounting:scan-scenario -- S24`

---

## S26 — Investor deposit

- **Failure reason:** investments 0 vs 10,000,000
- **Classification:** BRIDGE_ONLY_BUG
- **Evidence (bridge):** `total_investments_iqd` uses `partners.total_amount>0` but `recalcPartnerTotal` skips investors
- **Evidence (Rust):** Ledger investor account + `recalculate_partner_total` for مستثمر
- **File/function:** `e2e-bridge/server.mjs` → `cmdGetFinancialSummary`, `recalcPartnerTotal`, `cmdAddPartnerTransaction`
- **Test expectation change:** No
- **Rust change:** No
- **Bridge change:** Yes
- **Re-test:** `npm run test:accounting:scan-scenario -- S26`

---

## S27 — Investor withdrawal

- **Classification:** BRIDGE_ONLY_BUG (same root as S26)
- **Re-test:** `npm run test:accounting:scan-scenario -- S27`

---

## S28 — Investor + car purchase

- **Classification:** BRIDGE_ONLY_BUG (same root as S26)
- **Re-test:** `npm run test:accounting:scan-scenario -- S28`

---

## S29 — Delete investor with balance

- **Classification:** BRIDGE_ONLY_BUG (same root as S26)
- **Re-test:** `npm run test:accounting:scan-scenario -- S29`

---

## S31 — Funder repayment

- **Failure reason:** qasa/partnerCash 0 vs -10,000,000
- **Classification:** BRIDGE_ONLY_BUG
- **Evidence (bridge):** `cmdPayFinancierFromPartners` inserts ممول row with affects_qasa=true but qasa query excludes ممول kind; no partner 50/50 deduction rows
- **Evidence (Rust):** `deduct_from_partners_5050_with_effects` after funder account movement
- **File/function:** `e2e-bridge/server.mjs` → `cmdPayFinancierFromPartners`
- **Test expectation change:** No
- **Rust change:** No
- **Bridge change:** Yes
- **Re-test:** `npm run test:accounting:scan-scenario -- S31`

---

## S32 — Partial funder repayment

- **Classification:** BRIDGE_ONLY_BUG (same as S31)
- **Re-test:** `npm run test:accounting:scan-scenario -- S32`

---

## S33 — Funder repayment with commission

- **Classification:** BRIDGE_ONLY_BUG (same as S31; full amount deducted from partners)
- **Re-test:** `npm run test:accounting:scan-scenario -- S33`

---

## S36 — Company repayment

- **Classification:** BRIDGE_ONLY_BUG (same pattern as funder)
- **Re-test:** `npm run test:accounting:scan-scenario -- S36`

---

## S37 — Partial company repayment

- **Classification:** BRIDGE_ONLY_BUG
- **Re-test:** `npm run test:accounting:scan-scenario -- S37`

---

## S42 — Delete one agency transaction

- **Failure reason:** one agency remains: expected 1, got 0
- **Classification:** BRIDGE_ONLY_BUG
- **Evidence (bridge):** `cmdAddAgency` returns `Date.now()` stub; `cmdDeleteAgency` no-op; `get_agencies` returns empty
- **Evidence (Rust):** `add_agency` inserts row; `delete_agency` deletes by id only
- **File/function:** `e2e-bridge/server.mjs` → agency handlers
- **Test expectation change:** No
- **Rust change:** No
- **Bridge change:** Yes
- **Re-test:** `npm run test:accounting:scan-scenario -- S42`

---

## S51 — Edit available car purchase

- **Failure reason:** qasa -10,000,000 vs -15,000,000 after edit
- **Classification:** BRIDGE_ONLY_BUG
- **Evidence (bridge):** `cmdAddCar` update path does not rebuild `car_purchase` partner rows
- **Evidence (Rust):** `should_rebuild_purchase` deletes/recreates purchase transactions
- **File/function:** `e2e-bridge/server.mjs` → `cmdAddCar`
- **Test expectation change:** No
- **Rust change:** No
- **Bridge change:** Yes
- **Re-test:** `npm run test:accounting:scan-scenario -- S51`

---

## S55 — Delete sold installment car

- **Failure reason:** qasa 1,000,000 and profit 500,000 remain after delete
- **Classification:** BRIDGE_ONLY_BUG
- **Evidence (bridge):** `cmdDeleteCar` only deletes car_purchase/car_sale; leaves customer_installment rows
- **Evidence (Rust):** `delete_sale_generated_customer_rows_for_car` + related cleanup
- **File/function:** `e2e-bridge/server.mjs` → `cmdDeleteCar`
- **Test expectation change:** No
- **Rust change:** No
- **Bridge change:** Yes
- **Re-test:** `npm run test:accounting:scan-scenario -- S55`

---

## S69 — Funder cycle

- **Classification:** BRIDGE_ONLY_BUG (pay_financier partner deduction missing)
- **Re-test:** `npm run test:accounting:scan-scenario -- S69`

---

## S70 — Company cycle

- **Classification:** BRIDGE_ONLY_BUG
- **Re-test:** `npm run test:accounting:scan-scenario -- S70`

---

## S71 — Investor cycle

- **Classification:** BRIDGE_ONLY_BUG (investments tracking)
- **Re-test:** `npm run test:accounting:scan-scenario -- S71`
