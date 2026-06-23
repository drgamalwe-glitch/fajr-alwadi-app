# Accounting Test Matrix — Fajr Alwadi

**Generated:** 2026-06-23T05:25:52.346Z

Total scenarios: **71** | Passed: **51** | Failed: **20** | Not run: **0**


| ID | Group | Scenario | Status | ORACLE | BACKEND_DB | CHROMIUM_UI | Needs Fix |
|---|---|---|---|---|---|---|---|
| S01 | CAR_PURCHASE | Cash car purchase | ✅ PASS | ✅ | ✅ | ✅ | — |
| S02 | CAR_PURCHASE | Funded car purchase | ✅ PASS | ✅ | ✅ | ✅ | — |
| S03 | CAR_PURCHASE | Company car purchase | ✅ PASS | — | ✅ | — | — |
| S04 | CAR_PURCHASE | USD cash car purchase | ❌ FAIL | — | ❌ | — | ❌ |
| S05 | CASH_SALES | Cash sale after cash purchase | ✅ PASS | ✅ | ✅ | ✅ | — |
| S06 | CASH_SALES | Cash sale after funded purchase | ✅ PASS | — | ✅ | — | — |
| S07 | CASH_SALES | Cash sale after company purchase | ✅ PASS | — | ✅ | — | — |
| S08 | CASH_SALES | Cash sale with car expense | ✅ PASS | ✅ | ✅ | ✅ | — |
| S09 | CASH_SALES | Cash sale at loss | ✅ PASS | ✅ | ✅ | ✅ | — |
| S10 | INSTALLMENTS | Installment - after down payment | ✅ PASS | ✅ | ✅ | ✅ | — |
| S11 | INSTALLMENTS | Installment - after one installment | ✅ PASS | ✅ | ✅ | ✅ | — |
| S12 | INSTALLMENTS | Installment - after all payments | ✅ PASS | ✅ | ✅ | ✅ | — |
| S13 | INSTALLMENTS | Installment overpayment | ❌ FAIL | — | ❌ | — | ❌ |
| S14 | INSTALLMENTS | Final installment exact close | ✅ PASS | — | ✅ | — | — |
| S15 | INSTALLMENTS | Installment with car expense | ❌ FAIL | — | ❌ | — | ❌ |
| S16 | TERM_SALES | Term sale with down payment | ✅ PASS | — | ✅ | — | — |
| S17 | TERM_SALES | Term sale final payment | ✅ PASS | — | ✅ | — | — |
| S18 | CAR_EXPENSES | Car expense before sale | ✅ PASS | — | ✅ | — | — |
| S19 | CAR_EXPENSES | Car expense after sale | ❌ FAIL | — | ❌ | — | ❌ |
| S20 | CAR_EXPENSES | Edit car expense | ✅ PASS | — | ✅ | — | — |
| S21 | CAR_EXPENSES | Delete car expense | ✅ PASS | — | ✅ | — | — |
| S22 | GENERAL_EXPENSES | General expense | ✅ PASS | ✅ | ✅ | ✅ | — |
| S23 | GENERAL_EXPENSES | General expense after car profit | ✅ PASS | ✅ | ✅ | ✅ | — |
| S24 | GENERAL_EXPENSES | Edit general expense | ❌ FAIL | — | ❌ | — | ❌ |
| S25 | GENERAL_EXPENSES | Delete general expense | ✅ PASS | ✅ | ✅ | ✅ | — |
| S26 | INVESTORS | Investor deposit | ❌ FAIL | — | ❌ | — | ❌ |
| S27 | INVESTORS | Investor withdrawal | ❌ FAIL | — | ❌ | — | ❌ |
| S28 | INVESTORS | Investor + car purchase | ❌ FAIL | — | ❌ | — | ❌ |
| S29 | INVESTORS | Delete investor with balance | ❌ FAIL | — | ❌ | — | ❌ |
| S30 | FUNDERS | Funder financing | ✅ PASS | — | ✅ | — | — |
| S31 | FUNDERS | Funder repayment | ❌ FAIL | — | ❌ | — | ❌ |
| S32 | FUNDERS | Partial funder repayment | ❌ FAIL | — | ❌ | — | ❌ |
| S33 | FUNDERS | Funder repayment with commission | ❌ FAIL | — | ❌ | — | ❌ |
| S34 | FUNDERS | Delete funder with balance | ✅ PASS | — | ✅ | — | — |
| S35 | COMPANIES | Company purchase | ✅ PASS | — | ✅ | — | — |
| S36 | COMPANIES | Company repayment | ❌ FAIL | — | ❌ | — | ❌ |
| S37 | COMPANIES | Partial company repayment | ❌ FAIL | — | ❌ | — | ❌ |
| S38 | COMPANIES | Delete company with balance | ✅ PASS | — | ✅ | — | — |
| S39 | AGENCIES | Agency profit IQD | ✅ PASS | — | ✅ | — | — |
| S40 | AGENCIES | Agency profit USD | ✅ PASS | — | ✅ | — | — |
| S41 | AGENCIES | Two agencies same names/date | ✅ PASS | — | ✅ | — | — |
| S42 | AGENCIES | Delete one agency transaction | ❌ FAIL | — | ❌ | — | ❌ |
| S43 | CUSTOMERS | Customer balance after installment | ✅ PASS | — | ✅ | — | — |
| S44 | CUSTOMERS | Customer pays one installment | ✅ PASS | — | ✅ | — | — |
| S45 | CUSTOMERS | Customer pays all installments | ✅ PASS | — | ✅ | — | — |
| S46 | CUSTOMERS | Print customer statement | ✅ PASS | — | ✅ | — | — |
| S47 | PARTNERS | Partner deposits | ✅ PASS | ✅ | ✅ | ✅ | — |
| S48 | PARTNERS | Partner withdrawal | ✅ PASS | — | ✅ | — | — |
| S49 | PARTNERS | Block third partner | ✅ PASS | ✅ | ✅ | ✅ | — |
| S50 | PARTNERS | Block partner deletion | ✅ PASS | ✅ | ✅ | ✅ | — |
| S51 | DELETE_EDIT | Edit available car purchase | ❌ FAIL | — | ❌ | — | ❌ |
| S52 | DELETE_EDIT | Edit sold car sale price | ✅ PASS | — | ✅ | — | — |
| S53 | DELETE_EDIT | Delete available car | ✅ PASS | ✅ | ✅ | ✅ | — |
| S54 | DELETE_EDIT | Delete sold cash car | ✅ PASS | ✅ | ✅ | ✅ | — |
| S55 | DELETE_EDIT | Delete sold installment car | ❌ FAIL | — | ❌ | — | ❌ |
| S56 | DASHBOARD | Company status mixed ops | ✅ PASS | ✅ | ✅ | ✅ | — |
| S57 | DASHBOARD | Qasa tab = Qasa card | ✅ PASS | — | ✅ | — | — |
| S58 | DASHBOARD | Cash tab = partner cash card | ✅ PASS | — | ✅ | — | — |
| S59 | DASHBOARD | Profit tab = profit card | ✅ PASS | ✅ | ✅ | ✅ | — |
| S60 | CURRENCY | IQD/USD separation | ✅ PASS | ✅ | ✅ | ✅ | — |
| S61 | CURRENCY | USD general expense | ✅ PASS | ✅ | ✅ | ✅ | — |
| S62 | CURRENCY | Mixed currency blocked | ✅ PASS | — | ✅ | — | — |
| S63 | READ_ONLY | Read-only safety | ✅ PASS | ✅ | ✅ | ✅ | — |
| S64 | PRINT | Print partner statement | ✅ PASS | — | ✅ | — | — |
| S65 | PRINT | Print customer statement | ✅ PASS | — | ✅ | — | — |
| S66 | PRINT | Export database | ✅ PASS | — | ✅ | — | — |
| S67 | FULL_FLOWS | Full cash business cycle | ✅ PASS | — | ✅ | — | — |
| S68 | FULL_FLOWS | Full installment cycle | ✅ PASS | — | ✅ | — | — |
| S69 | FULL_FLOWS | Funder cycle | ❌ FAIL | — | ❌ | — | ❌ |
| S70 | FULL_FLOWS | Company cycle | ❌ FAIL | — | ❌ | — | ❌ |
| S71 | FULL_FLOWS | Investor cycle | ❌ FAIL | — | ❌ | — | ❌ |

### Legend

- ✅ PASS — passed all checks in this layer
- ❌ FAIL — failed one or more checks in this layer
- — NOT_RUN — not executed for this scenario
- ORACLE = pure accounting calculation
- BACKEND_DB = database/E2E_BRIDGE test
- CHROMIUM_UI = Playwright UI test
