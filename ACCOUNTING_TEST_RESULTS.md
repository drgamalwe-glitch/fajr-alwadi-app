# Accounting Test Results

**Generated:** 2026-06-22T13:18:17.705Z

**Final Verdict:** PASS

## Summary

- Total scenarios: 3
- Passed: 3
- Failed: 0
- Warnings: 0

## Scenario Results

### A: A: Cash Car Sale

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Database:** e2e-bridge :memory:
- **Execution Time:** 5ms
- **Result:** PASS

**Expected vs Actual:**

| Field | Expected | Actual | Status |
|---|---|---|---|
| amirCashMovementRows | 1 | 1 | PASS |
| amirProfitRows | 1 | 1 | PASS |
| cashAffectsQasa | 1 | 1 | PASS |
| cashAffectsPartnerCash | 1 | 1 | PASS |
| cashAffectsProfit | 0 | 0 | PASS |
| amirCashAmount | 10,000 | 10,000 | PASS |
| profitAffectsQasa | 0 | 0 | PASS |
| profitAffectsPartnerCash | 0 | 0 | PASS |
| profitAffectsProfit | 1 | 1 | PASS |
| amirProfitAmount | 5,000 | 5,000 | PASS |
| amirProfitIqd | 5,000 | 5,000 | PASS |
| muntasirProfitIqd | 5,000 | 5,000 | PASS |
| qasaIqd | 10,000 | 10,000 | PASS |
| inventory | 0 | 0 | PASS |

**Generated Rows:**

| Source Type | Source Role | Affects Qasa | Affects Cash | Affects Profit | Amount | Description |
|---|---|---|---|---|---|---|
| car_sale | cash_movement | 1 | 1 | 0 | 20,000 | Cash car sale - cash movement |
| car_sale | profit_recognition | 0 | 0 | 1 | 10,000 | Cash car sale - profit recognition |

### B: B1: Installment - After Down Payment

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Database:** e2e-bridge :memory:
- **Execution Time:** 4ms
- **Result:** PASS

**Expected vs Actual:**

| Field | Expected | Actual | Status |
|---|---|---|---|
| amirDownPaymentProfit | 1,250,000 | 1,250,000 | PASS |
| totalProfit | 2,500,000 | 2,500,000 | PASS |

**Generated Rows:**

| Source Type | Source Role | Affects Qasa | Affects Cash | Affects Profit | Amount | Description |
|---|---|---|---|---|---|---|
| customer_payment | cash_movement | 1 | 1 | 0 | 5,000,000 | Down payment - cash movement |
| customer_payment | profit_recognition | 0 | 0 | 1 | 2,500,000 | Down payment - profit recognition |

### C: C: General Expense

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Database:** e2e-bridge :memory:
- **Execution Time:** 2ms
- **Result:** PASS

**Expected vs Actual:**

| Field | Expected | Actual | Status |
|---|---|---|---|
| expenseCount | 1 | 1 | PASS |
| totalExpenses | 1,000,000 | 1,000,000 | PASS |
| netProfit | -1,000,000 | -1,000,000 | PASS |
| inventory | 0 | 0 | PASS |

**Generated Rows:**

| Source Type | Source Role | Affects Qasa | Affects Cash | Affects Profit | Amount | Description |
|---|---|---|---|---|---|---|
| expense | cash_movement | 1 | 1 | 0 | -1,000,000 | General expense (rent) - cash movement |

## Slowest Scenarios

- A: 5ms
- B: 4ms
- C: 2ms

## Final Verdict

### FINAL RESULT: PASS
