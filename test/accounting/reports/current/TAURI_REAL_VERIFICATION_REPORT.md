# Tauri Real Verification Report

## Final Status

- Real backend tested: YES
- Backend mode: REAL_TAURI_RUST
- Total real verification scenarios: 11
- Passed: 11
- Failed: 0
- Pending: 0
- Final verdict: PASS
- Date/time: 2026-06-23T05:56:52.734Z

## Important distinction

E2E_BRIDGE exercises `e2e-bridge/server.mjs` (Node SQLite mock).

REAL_TAURI_RUST exercises production command handlers in `src-tauri/src/lib.rs` via in-process Tauri test harness — no bridge, no mock frontend API.

- **E2E_BRIDGE result:** 71/71 PASS
- **REAL_TAURI_RUST result:** 11/11 PASS (PASS)

Regression smoke checks (not counted in priority total): 3/3 PASS

## Scenario results

| ID | Behavior | Related Scenarios | Status | Expected | Actual | Notes |
|---|---|---|---|---|---|---|
| REAL-S04 | USD inventory by currency | S04 | PASS | `{"inventory_value_iqd":0,"inventory_value_usd":10000,"qasa_iqd":0,"qasa_usd":-10000}` | `{"inventory_value_iqd":0,"inventory_value_usd":10000,"qasa_iqd":0,"qasa_usd":-10000}` | USD purchase moves USD qasa/inventory only |
| REAL-S13 | Installment profit cap | S13 | PASS | `{"amir_profit_iqd":5000000,"monthly_profits_iqd":10000000,"muntasir_profit_iqd":5000000,"qasa_iqd":11000000,"total_partner_profit_iqd":10000000}` | `{"amir_profit_iqd":5000000,"monthly_profits_iqd":10000000,"muntasir_profit_iqd":5000000,"qasa_iqd":11000000,"total_partner_profit_iqd":10000000}` | Overpayment caps profit at full car profit |
| REAL-S15 | Installment profit after car expense | S15 | PASS | `{"amir_profit_iqd":1200000,"monthly_profits_iqd":2400000,"muntasir_profit_iqd":1200000,"qasa_iqd":-6000000}` | `{"amir_profit_iqd":1200000,"monthly_profits_iqd":2400000,"muntasir_profit_iqd":1200000,"qasa_iqd":-6000000}` | 40% profit ratio after 2M car expense |
| REAL-S19 | Car expense after cash sale | S19 | PASS | `{"profit_after":8000000,"profit_before":8000000,"qasa_after":7000000}` | `{"profit_after":8000000,"profit_before":8000000,"qasa_after":7000000}` | Post-sale car expense reduces qasa only |
| REAL-S24 | Edit general expense rebuild | S24 | PASS | `{"cash_iqd":-2000000,"monthly_profits_iqd":-2000000,"qasa_iqd":-2000000,"stale_1m_rows":0}` | `{"cash_iqd":-2000000,"monthly_profits_iqd":-2000000,"qasa_iqd":-2000000,"stale_1m_rows":0}` | Expense edit rebuilds partner rows |
| REAL-S26 | Investor liability / investments | S26, S27, S28, S29, S71 | PASS | `{"delete_blocked":1,"deposit_cash":0,"deposit_investments":10000000,"deposit_profit":0,"deposit_qasa":10000000,"mixed_inventory":10000000,"mixed_qasa":16000000,"withdraw_investments":6000000,"withdraw_qasa":6000000}` | `{"delete_blocked":1,"deposit_cash":0,"deposit_investments":10000000,"deposit_profit":0,"deposit_qasa":10000000,"mixed_inventory":10000000,"mixed_qasa":16000000,"withdraw_investments":6000000,"withdraw_qasa":6000000}` | Investor affects qasa/investments only |
| REAL-S31 | Funder repayment from partners | S31, S32, S33, S69 | PASS | `{"cash_after":-10000000,"cash_before":0,"inventory_after":10000000,"profit_after":0,"profit_before":0,"qasa_after":-10000000,"qasa_before":0}` | `{"cash_after":-10000000,"cash_before":0,"inventory_after":10000000,"profit_after":0,"profit_before":0,"qasa_after":-10000000,"qasa_before":0}` | Funder financing silent; partner repayment hits qasa/cash |
| REAL-S36 | Company repayment from partners | S36, S37, S70 | PASS | `{"cash_after":-10000000,"cash_before":0,"profit_after":0,"profit_before":0,"qasa_after":-10000000,"qasa_before":0}` | `{"cash_after":-10000000,"cash_before":0,"profit_after":0,"profit_before":0,"qasa_after":-10000000,"qasa_before":0}` | Company purchase silent until partner repayment |
| REAL-S51 | Edit available car purchase | S51 | PASS | `{"inventory_after":15000000,"inventory_before":10000000,"purchase_rows_per_partner":1,"qasa_after":-15000000,"qasa_before":-10000000}` | `{"inventory_after":15000000,"inventory_before":10000000,"purchase_rows_per_partner":1,"qasa_after":-15000000,"qasa_before":-10000000}` | Purchase price edit rebuilds qasa/inventory |
| REAL-S55 | Delete sold installment car | S55 | PASS | `{"debtors_after":0,"inventory_after":0,"orphan_profit_rows":0,"profit_after":0,"qasa_after":0,"qasa_before":-4000000}` | `{"debtors_after":0,"inventory_after":0,"orphan_profit_rows":0,"profit_after":0,"qasa_after":0,"qasa_before":-4000000}` | Delete sold installment car cleans generated rows |
| REAL-S42 | Agency delete by ID | S42 | PASS | `{"deleted_gone":0,"distinct_ids":1,"remaining_count":1}` | `{"deleted_gone":0,"distinct_ids":1,"remaining_count":1}` | Agency delete by ID removes only target agency |
| REAL-REG-S01 | Regression: cash car purchase | S01 | PASS | `{"inventory_value_iqd":10000000,"monthly_profits_iqd":0,"qasa_iqd":-10000000}` | `{"inventory_value_iqd":10000000,"monthly_profits_iqd":0,"qasa_iqd":-10000000}` | Regression S01 |
| REAL-REG-S05 | Regression: cash sale after cash purchase | S05 | PASS | `{"inventory_value_iqd":0,"monthly_profits_iqd":10000000,"qasa_iqd":10000000}` | `{"inventory_value_iqd":0,"monthly_profits_iqd":10000000,"qasa_iqd":10000000}` | Regression S05 |
| REAL-REG-READONLY | Regression: read-only safety | S63 | PASS | `{"inventory_unchanged":5000000,"qasa_unchanged":-5000000}` | `{"inventory_unchanged":5000000,"qasa_unchanged":-5000000}` | Regression read-only |



## Commands

```bash
npm run test:accounting:real-tauri
npm run test:accounting:real-report
npm run test:accounting:final-verify
```
