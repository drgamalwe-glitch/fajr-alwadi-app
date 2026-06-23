# Accounting Test Report — Fajr Alwadi

**Generated:** 2026-06-23T05:25:52.345Z

---

## Final Status


| Metric | Value |
|---|---|
| Total scenarios | 71 |
| Completed | 71 |
| Passed | 51 |
| Failed | 20 |
| Pending | 0 |
| Coverage | 100% |
| Final verdict | **FAIL** |
| Backend mode | E2E_BRIDGE |
| Scan mode | FAST_SCAN_NO_FIX |
| Last completed | S71 |
| Next scenario | NONE |

## Important Warning

E2E_BRIDGE uses Node.js SQLite mock.
It is useful for fast accounting verification.
It is **not** the real Tauri backend.
Final delivery requires real Tauri verification after fixes.

## Was All 71 Scanned?

**YES** — all 71 scenarios are represented.

Found 71 unique scenario IDs (S01–S71).
Found 20 failed scenarios.
No missing IDs. No duplicates.

## Failed Scenarios

Total failed: **20**

| ID | Scenario | Failure Reason | Layer | Priority |
|---|---|---|---|---|
| S04 | USD cash car purchase | inventory_usd: expected 10000, got 0 | BACKEND_DB | medium |
| S13 | Installment overpayment | profit cap exceeded by 500,000 (expected 10,000,000, got 10,500,000) | BACKEND_DB | medium |
| S15 | Installment with car expense | profit with car expense: expected 2,400,000, got 2,900,000; qasa: expected -4,000,000, got -6,000,000 | BACKEND_DB | medium |
| S19 | Car expense after sale | qasa after expense: expected 6,000,000, got 7,000,000 | BACKEND_DB | medium |
| S24 | Edit general expense | qasa after edit: expected -2,000,000, got -1,000,000 | BACKEND_DB | medium |
| S26 | Investor deposit | investments: expected 10,000,000, got 0 | BACKEND_DB | medium |
| S27 | Investor withdrawal | investments: expected 6,000,000, got 0 | BACKEND_DB | medium |
| S28 | Investor + car purchase | investments: expected 20,000,000, got 0 | BACKEND_DB | medium |
| S29 | Delete investor with balance | investments before: expected 5,000,000, got 0 | BACKEND_DB | medium |
| S31 | Funder repayment | qasa: expected -10,000,000, got 0; partnerCash: expected -10,000,000, got 0 | BACKEND_DB | medium |
| S32 | Partial funder repayment | qasa: expected -4,000,000, got 0; partnerCash: expected -4,000,000, got 0 | BACKEND_DB | medium |
| S33 | Funder repayment with commission | qasa: expected -10,500,000, got 0; partnerCash: expected -10,500,000, got 0 | BACKEND_DB | medium |
| S36 | Company repayment | qasa: expected -10,000,000, got 0; partnerCash: expected -10,000,000, got 0 | BACKEND_DB | medium |
| S37 | Partial company repayment | qasa: expected -3,000,000, got 0; partnerCash: expected -3,000,000, got 0 | BACKEND_DB | medium |
| S42 | Delete one agency transaction | one agency remains: expected 1, got 0 | BACKEND_DB | medium |
| S51 | Edit available car purchase | qasa after edit: expected -15,000,000, got -10,000,000 | BACKEND_DB | medium |
| S55 | Delete sold installment car | qasa after delete: expected 0, got 1,000,000; profit after delete: expected 0, got 500,000 | BACKEND_DB | medium |
| S69 | Funder cycle | qasa: expected 8,000,000, got 18,000,000 (diff 10,000,000 — funder financing not deducted) | BACKEND_DB | medium |
| S70 | Company cycle | qasa: expected 8,000,000, got 18,000,000 (diff 10,000,000 — company not deducted) | BACKEND_DB | medium |
| S71 | Investor cycle | investments: expected 20,000,000, got 0 | BACKEND_DB | medium |

For detailed failure info (expected vs actual values), see `ACCOUNTING_FIX_LOG.md`.

## Passed Scenarios by Group

### AGENCIES (3/4 passed)
Failed: S42

### CAR_EXPENSES (3/4 passed)
Failed: S19

### CAR_PURCHASE (3/4 passed)
Failed: S04

### CASH_SALES (5/5 passed)

### COMPANIES (2/4 passed)
Failed: S36, S37

### CURRENCY (3/3 passed)

### CUSTOMERS (4/4 passed)

### DASHBOARD (4/4 passed)

### DELETE_EDIT (3/5 passed)
Failed: S51, S55

### FULL_FLOWS (2/5 passed)
Failed: S69, S70, S71

### FUNDERS (2/5 passed)
Failed: S31, S32, S33

### GENERAL_EXPENSES (3/4 passed)
Failed: S24

### INSTALLMENTS (4/6 passed)
Failed: S13, S15

### PARTNERS (4/4 passed)

### PRINT (3/3 passed)

### READ_ONLY (1/1 passed)

### TERM_SALES (2/2 passed)

## Main Problem Groups

1. **USD inventory reporting** — S04: `inventory_value_usd` not returned by bridge
2. **Installment profit cap** — S13: overpayment recognizes profit beyond cap (10.5M of 10M max)
3. **Installment with car expense** — S15: expense not affecting cost basis correctly
4. **Car expense after sale** — S19: Qasa recalculation wrong after post-sale expense
5. **Edit general expense** — S24: Qasa not updated when expense amount changes
6. **Investor liability/investment balance** — S26–S29: `total_investments_iqd` not tracked
7. **Funder repayment Qasa/partner cash** — S31–S33: `pay_financier_from_partners` does not deduct partner cash
8. **Company repayment Qasa/partner cash** — S36–S37: same issue as funder
9. **Agency deletion by ID** — S42: `delete_agency` deletes by name/date instead of ID
10. **Edit/delete reversal bugs** — S51, S55: editing purchase price or deleting sold installment car leaves orphan rows
11. **Full funder/company/investor cycles** — S69–S71: repayment not deducted, investments not tracked

## Next Action

Next action is to fix the 20 scenarios listed in `ACCOUNTING_FIX_LOG.md`.
Do not run final Tauri delivery verification until these 20 issues are fixed and re-tested.
