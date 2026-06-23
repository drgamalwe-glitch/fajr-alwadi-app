# Accounting Fix Log

## Summary

- Total failed scenarios: **20**
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Backend mode: E2E_BRIDGE
- Fixes applied during scan: **No**
- Next step: fix these 20 scenarios then re-run targeted tests

---

### S04 — USD cash car purchase

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: inventory_usd: expected 10000, got 0
- Expected: {"inventoryUsd":10000,"qasaUsd":-10000,"qasaIqd":0}
- Actual: {"inventoryUsd":0,"qasaUsd":-10000,"qasaIqd":0}
- Backend command involved: add_car (USD), get_financial_summary
- Suspected file/function: Bridge get_financial_summary / inventory_value_usd not populated
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S13 — Installment overpayment

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: profit cap exceeded by 500,000 (expected 10,000,000, got 10,500,000)
- Expected: {"profit":10000000,"qasa":11000000,"totalProfit":10000000}
- Actual: {"profit":10500000,"qasa":11000000,"totalProfit":10500000}
- Backend command involved: add_partner_transaction (installment payment), get_financial_summary
- Suspected file/function: Installment profit cap logic / profit recognition on overpayment
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S15 — Installment with car expense

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: profit with car expense: expected 2,400,000, got 2,900,000; qasa: expected -4,000,000, got -6,000,000
- Expected: {"profit":2400000,"qasa":-4000000}
- Actual: {"profit":2900000,"qasa":-6000000}
- Backend command involved: add_car, add_car_expense_record, add_partner_transaction, get_financial_summary
- Suspected file/function: Car expense not affecting cost basis / double-counting expense in qasa
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S19 — Car expense after sale

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa after expense: expected 6,000,000, got 7,000,000
- Expected: {"profitBefore":8000000,"profitAfter":8000000,"qasaAfter":6000000}
- Actual: {"profitBefore":8000000,"profitAfter":8000000,"qasaAfter":7000000}
- Backend command involved: add_car, sell_car_with_accounting, add_car_expense_record, get_financial_summary
- Suspected file/function: Car expense after sale not reducing qasa / cost recalculation
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S24 — Edit general expense

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa after edit: expected -2,000,000, got -1,000,000
- Expected: {"qasa":-2000000,"profit":-2000000}
- Actual: {"qasa":-1000000,"profit":-2000000}
- Backend command involved: add_expense, update_expense, get_financial_summary
- Suspected file/function: update_expense not adjusting partner transaction amounts
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S26 — Investor deposit

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: investments: expected 10,000,000, got 0
- Expected: {"qasa":10000000,"partnerCash":0,"profit":0,"investments":10000000}
- Actual: {"qasa":10000000,"partnerCash":0,"profit":0,"investments":0}
- Backend command involved: add_partner (investor), add_partner_transaction (deposit), get_financial_summary
- Suspected file/function: total_investments_iqd not calculated in get_financial_summary
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S27 — Investor withdrawal

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: investments: expected 6,000,000, got 0
- Expected: {"qasa":6000000,"investments":6000000}
- Actual: {"qasa":6000000,"investments":0}
- Backend command involved: add_partner_transaction (investor deposit+withdrawal), get_financial_summary
- Suspected file/function: total_investments_iqd not calculated in get_financial_summary
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S28 — Investor + car purchase

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: investments: expected 20,000,000, got 0
- Expected: {"qasa":10000000,"inventory":10000000,"investments":20000000}
- Actual: {"qasa":10000000,"inventory":10000000,"investments":0}
- Backend command involved: add_partner_transaction (investor deposit), add_car, get_financial_summary
- Suspected file/function: total_investments_iqd not tracked in bridge
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S29 — Delete investor with balance

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: investments before: expected 5,000,000, got 0
- Expected: {"investmentsBefore":5000000,"investmentsAfter":0,"qasaAfter":0}
- Actual: {"investmentsBefore":0,"investmentsAfter":0,"qasaAfter":0}
- Backend command involved: add_partner_transaction, delete_partner, get_financial_summary
- Suspected file/function: total_investments_iqd not tracked in bridge
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S31 — Funder repayment

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa: expected -10,000,000, got 0; partnerCash: expected -10,000,000, got 0
- Expected: {"qasa":-10000000,"partnerCash":-10000000,"inventory":10000000}
- Actual: {"qasa":0,"partnerCash":0,"inventory":10000000}
- Backend command involved: add_car (funder), pay_financier_from_partners, get_financial_summary
- Suspected file/function: pay_financier_from_partners not creating partner cash movement
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S32 — Partial funder repayment

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa: expected -4,000,000, got 0; partnerCash: expected -4,000,000, got 0
- Expected: {"qasa":-4000000,"partnerCash":-4000000}
- Actual: {"qasa":0,"partnerCash":0}
- Backend command involved: add_car (funder), pay_financier_from_partners (partial), get_financial_summary
- Suspected file/function: pay_financier_from_partners not creating partner cash movement
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S33 — Funder repayment with commission

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa: expected -10,500,000, got 0; partnerCash: expected -10,500,000, got 0
- Expected: {"qasa":-10500000,"partnerCash":-10500000}
- Actual: {"qasa":0,"partnerCash":0}
- Backend command involved: add_car (funder), pay_financier_from_partners (with commission), get_financial_summary
- Suspected file/function: pay_financier_from_partners not creating partner cash movement
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S36 — Company repayment

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa: expected -10,000,000, got 0; partnerCash: expected -10,000,000, got 0
- Expected: {"qasa":-10000000,"partnerCash":-10000000}
- Actual: {"qasa":0,"partnerCash":0}
- Backend command involved: add_car (company), pay_financier_from_partners (company), get_financial_summary
- Suspected file/function: pay_financier_from_partners for company kind not creating partner cash movement
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S37 — Partial company repayment

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa: expected -3,000,000, got 0; partnerCash: expected -3,000,000, got 0
- Expected: {"qasa":-3000000,"partnerCash":-3000000}
- Actual: {"qasa":0,"partnerCash":0}
- Backend command involved: add_car (company), pay_financier_from_partners (partial company), get_financial_summary
- Suspected file/function: pay_financier_from_partners for company kind not creating partner cash movement
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S42 — Delete one agency transaction

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: one agency remains: expected 1, got 0
- Expected: {"remainingCount":1,"deletedGone":0}
- Actual: {"remainingCount":0,"deletedGone":0}
- Backend command involved: add_agency (2x), delete_agency, get_agencies
- Suspected file/function: delete_agency deleting by name/date instead of ID
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S51 — Edit available car purchase

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa after edit: expected -15,000,000, got -10,000,000
- Expected: {"inventoryBefore":10000000,"qasaBefore":-10000000,"inventoryAfter":15000000,"qasaAfter":-15000000}
- Actual: {"inventoryBefore":10000000,"qasaBefore":-10000000,"inventoryAfter":15000000,"qasaAfter":-10000000}
- Backend command involved: add_car (overwrite with oldNum), get_financial_summary
- Suspected file/function: Car edit not reversing/adjusting original partner transaction
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S55 — Delete sold installment car

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa after delete: expected 0, got 1,000,000; profit after delete: expected 0, got 500,000
- Expected: {"qasaBefore":-4000000,"qasaAfter":0,"profitAfter":0,"inventoryAfter":0}
- Actual: {"qasaBefore":-4000000,"qasaAfter":1000000,"profitAfter":500000,"inventoryAfter":0}
- Backend command involved: add_car, add_partner_transaction, delete_car, get_financial_summary
- Suspected file/function: delete_car not reversing installment profit rows
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S69 — Funder cycle

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa: expected 8,000,000, got 18,000,000 (diff 10,000,000 — funder financing not deducted)
- Expected: {"qasa":8000000,"profit":8000000}
- Actual: {"qasa":18000000,"profit":8000000}
- Backend command involved: add_car (funder), sell_car_with_accounting, pay_financier_from_partners, get_financial_summary
- Suspected file/function: pay_financier_from_partners not deducting partner cash in full cycle
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S70 — Company cycle

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: qasa: expected 8,000,000, got 18,000,000 (diff 10,000,000 — company not deducted)
- Expected: {"qasa":8000000,"profit":8000000}
- Actual: {"qasa":18000000,"profit":8000000}
- Backend command involved: add_car (company), sell_car_with_accounting, pay_financier_from_partners, get_financial_summary
- Suspected file/function: pay_financier_from_partners not deducting partner cash for company
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario

### S71 — Investor cycle

- Status: NEEDS_FIX
- Scan mode: E2E_BRIDGE_FAST_SCAN_NO_FIX
- Failed layer: BACKEND_DB
- Error category: ACCOUNTING_MISMATCH
- Exact problem: investments: expected 20,000,000, got 0
- Expected: {"qasa":28000000,"profit":8000000,"investments":20000000}
- Actual: {"qasa":28000000,"profit":8000000,"investments":0}
- Backend command involved: add_partner (investor), add_partner_transaction (deposit), add_car, sell_car_with_accounting, get_financial_summary
- Suspected file/function: total_investments_iqd not tracked in bridge; full investor cycle not managing liability
- Fix later priority: medium
- Do not fix now: true
- Continue scan from: next scenario
