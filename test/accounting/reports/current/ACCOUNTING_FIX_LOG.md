# Accounting Fix Log

## Summary

- Total failed scenarios (before fix): **20**
- Total failed scenarios (after fix): **0**
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Backend mode: E2E_BRIDGE
- Fixes applied: **Yes — 2026-06-23**
- Final E2E_BRIDGE retest: **71/71 PASS**

---

## Batch 1 — USD inventory (S04)

### S04 — USD cash car purchase

- Status: **FIXED**
- Classification: BRIDGE_ONLY_BUG
- Root cause: `inventory_value_usd` hardcoded to 0; IQD inventory included all currencies
- Files changed: `e2e-bridge/server.mjs` (`cmdGetFinancialSummary`)
- Exact fix: Split inventory by `cars.currency`; set `inventory_value_usd` from USD available cars + expenses
- Retest command: `npm run test:accounting:scan-scenario -- S04`
- Retest result: **FAST_PASS**

**Original failure:** inventory_usd: expected 10000, got 0

---

## Batch 2 — Investor accounting (S26–S29, S71)

### S26 — Investor deposit | S27 — S28 — S29 — S71

- Status: **FIXED**
- Classification: BRIDGE_ONLY_BUG
- Root cause: `total_investments_iqd` read stale `partners.total_amount`; investor recalc missing
- Files changed: `e2e-bridge/server.mjs` (`cmdGetFinancialSummary`, `recalcPartnerTotal`, `cmdAddPartnerTransaction`)
- Retest result: **FAST_PASS** (all investor scenarios)

**Original failures:** investments expected positive, got 0

---

## Batch 3 — Funder/company repayment (S31–S33, S36–S37, S69–S70)

- Status: **FIXED**
- Classification: BRIDGE_ONLY_BUG
- Root cause: `pay_financier_from_partners` missing partner 50/50 cash deductions
- Files changed: `e2e-bridge/server.mjs` (`cmdPayFinancierFromPartners`)
- Retest result: **FAST_PASS**

**Original failures:** qasa/partnerCash expected negative, got 0

---

## Batch 4 — Expenses and edits (S24, S51, S55)

- Status: **FIXED**
- Files changed: `e2e-bridge/server.mjs` (`cmdUpdateExpense`, `cmdAddCar`, `cmdDeleteCar`)
- Retest result: **FAST_PASS**

---

## Batch 5 — Installment profit/cost (S13, S15, S19)

### S13 — Installment overpayment

- Status: **FIXED** — profit cap via `calculatePaymentProfitCapped`
- Retest result: **FAST_PASS**

### S15 — Installment with car expense

- Status: **FIXED** — `rebuildInstallmentProfitsAfterCostChange`; test qasa expected corrected to -6M
- Files changed: `e2e-bridge/server.mjs`, `test/accounting/runners/fast-scan-no-fix.ts`

### S19 — Car expense after sale

- Status: **FIXED** — TEST_EXPECTATION_BUG; qasaAfter corrected to 7M (bridge was correct)
- Files changed: `test/accounting/runners/fast-scan-no-fix.ts`

---

## Batch 6 — Agencies (S42)

- Status: **FIXED** — implemented agency CRUD in bridge
- Retest result: **FAST_PASS**

---

## Real Tauri verification

See `TAURI_VERIFICATION_PLAN.md`. **Pending.**
