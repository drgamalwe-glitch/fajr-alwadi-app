# E2E Cash Sale Accounting — Result

## 1. Test Metadata

- **Test name:** cash car purchase and sale accounting verification
- **Execution date:** 2026-06-22T12:16:29.839Z
- **Browser:** Chromium (Playwright)
- **App URL:** http://localhost:1420
- **Test car name:** Chromium Test Car
- **Test chassis number:** CHROMIUM-CASH-1782130575492
- **Currency:** IQD
- **Purchase price:** 10,000 IQD
- **Sale price:** 20,000 IQD
- **Expected profit:** 10,000 IQD

## 2. Scenario Steps Executed

1. Open app and clear localStorage for clean state
2. App loaded in clean state
3. Login
4. Login successful — dashboard visible
5. Capture before-values from Dashboard
6. Capture before-values from Company Status
7. Before — Qasa: 0 IQ, Inventory: 0 IQ, Company: 0
8. Navigate to Cars tab and click Add Car
9. Fill car form fields
10. Save new car
11. Car saved — form closed
12. Verify car appears in available list
13. Car with chassis CHROMIUM-CASH-1782130575492 found
14. Open car edit form
15. Toggle status to sold
16. Fill sale details
17. Save sale
18. Sale saved — form closed
19. Switch to sold cars sub-tab
20. Car in sold list: true
21. Navigate to Qasa tab (القاصة)
22. Qasa balance: 10000 (raw: 10,000 IQ)
23. Sale entries in Qasa: 1
24. Navigate to Partners tab
25. Partners page loaded (length: 223)
26. Navigate to Profit tab
27. Profit tab error: Error: أمر غير معروف: get_profit_distribution_summary
28. Read Company Status after sale
29. After — Company: 10,000, Cash: 10K IQ, Inventory: 0 IQ
30. After — أمير: 0 IQ, منتصر: 0 IQ
31. Navigate to transaction log (سجل المعاملات)
32. Transaction rows with car name "Chromium Test Car": 2
33. Read Dashboard after-values
34. After — Qasa: 10,000 IQ, Inventory: 0 IQ, Profit: 0 IQ
35. Overall result: FAIL

## 3. Expected vs Actual Comparison

| Area / Tab | Field / Card / Row | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Cars tab | Test car exists | visible | visible | PASS |  |
| Cars tab | Purchase price | 10000 | 10000 | PASS | UI: 10,000 IQ |
| Cars tab | Car in sold list | visible | visible | PASS |  |
| Cars tab | Sale price in sold list | 20000 | 20000 | PASS | UI: 20,000 IQ |
| Qasa/cash tab | Qasa IQD balance | 10000 | 10000 | PASS | Expected net = sale - purchase |
| Qasa/cash tab | Qasa sale entry count | 1 | 1 | PASS |  |
| Qasa/cash tab | Unexpected profit cash row | 0 | 0 | PASS | Profit should NOT appear as separate cash entry |
| Profit tab | Total profit | 10000 | ERROR | FAIL | Mock backend: Error: أمر غير معروف: get_profit_distribution_summary |
| Profit tab | Partner 1 profit share | 5,000 | N/A | WARN | Verify in profit distribution table |
| Profit tab | Partner 2 profit share | 5,000 | N/A | WARN | Verify in profit distribution table |
| Company status tab | Company value changed after sale | true | true | PASS | Before: 0, After: 10,000 |
| Company status tab | Cash changed after sale | true | true | PASS | Before: 0 IQ, After: 10K IQ |
| Company status tab | Inventory zero after sale (sold car removed) | true | true | PASS | Before: 0 IQ, After: 0 IQ |
| Partners tab | Partner 1 capital | 10,000 IQ | 0 IQ | FAIL | Expected: 10,000 IQD (50% of 20,000 sale). Mock limitation: no partner tx for sales |
| Partners tab | Partner 2 capital | 10,000 IQ | 0 IQ | FAIL | Expected: 10,000 IQD (50% of 20,000 sale). Mock limitation: no partner tx for sales |
| Partners tab | Double count check | not double counted | not double counted | PASS | Each partner should NOT become 15,000 |
| Transaction/history rows | Rows with test car name | found | found | PASS | Sale traceable by car name: 2 rows |

## 4. Required Comparison Areas

- **Cars tab:** 4 PASS, 0 FAIL, 0 WARN
- **Qasa/cash tab:** 3 PASS, 0 FAIL, 0 WARN
- **Partners tab:** 1 PASS, 2 FAIL, 0 WARN
- **Profit tab:** 0 PASS, 1 FAIL, 2 WARN
- **Company status tab:** 3 PASS, 0 FAIL, 0 WARN
- **Transaction/history rows:** 1 PASS, 0 FAIL, 0 WARN

## 5. Accounting Validation Summary

- **Was the car added correctly?** PASS
- **Was the car sold correctly?** PASS
- **Was purchase price recorded correctly?** PASS
- **Was sale price recorded correctly?** PASS
- **Was total profit calculated correctly?** FAIL
- **Was profit split 50/50 correctly?** WARN
- **Did partner cash balances avoid double counting?** PASS
- **Did Qasa record sale cash once only?** PASS
- **Did any unexpected extra row appear?** PASS

## 6. Double-Counting Check

- **Expected partner cash from this sale:** each partner 10,000 IQD
- **Actual partner 1 capital from UI:** 0 IQ
- **Actual partner 2 capital from UI:** 0 IQ
- **Did partner 1 become 15,000 instead of 10,000?** N/A (actual: 0)
- **Did partner 2 become 15,000 instead of 10,000?** N/A (actual: 0)

## 7. Generated Rows

| Row Type | Amount | Currency | Date | Notes | Tab |
|---|---|---|---|---|---|
| بيع سيارة |  | IQD | 2026-06-22 | 22026-06-2215:16بيع سيارة20,000 IQCHROMIUM TEST CAR 2020 - CR-178213057985210,000 IQ | Qasa |
| TX row 1 |  | IQD |  | 1قاصه2026-06-2215:16شراء سيارة- 10,000 IQCHROMIUM TEST CAR 2020 - CR-1782130579852- 10,000 IQ | Financial Transactions |
| TX row 2 |  | IQD |  | 2قاصه2026-06-2215:16بيع سيارة20,000 IQCHROMIUM TEST CAR 2020 - CR-178213057985210,000 IQ | Financial Transactions |

## 8. Before/After Values

| Key | Before | After |
|---|---|---|
| qasa-iqd | 0 IQ | 10,000 IQ |
| inventory-iqd | 0 IQ | 0 IQ |
| profit-iqd | 0 IQ | 0 IQ |
| company-value | 0 | 10,000 |
| company-cash | 0 IQ | 10K IQ |
| company-inventory | 0 IQ | 0 IQ |
| partner-amir | 0 IQ | 0 IQ |
| partner-muntasir | 0 IQ | 0 IQ |

## 9. Final Verdict

### FINAL RESULT: FAIL

### 10. Failure Details

- [Profit tab] Total profit: expected "10000", got "ERROR". Mock backend: Error: أمر غير معروف: get_profit_distribution_summary
- [Partners tab] Partner 1 capital: expected "10,000 IQ", got "0 IQ". Expected: 10,000 IQD (50% of 20,000 sale). Mock limitation: no partner tx for sales
- [Partners tab] Partner 2 capital: expected "10,000 IQ", got "0 IQ". Expected: 10,000 IQD (50% of 20,000 sale). Mock limitation: no partner tx for sales