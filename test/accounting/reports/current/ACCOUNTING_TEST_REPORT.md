# Accounting Test Report — Fajr Alwadi

**Generated:** 2026-06-23T05:39:52.652Z

---

## Final Status


| Metric | Value |
|---|---|
| Total scenarios | 71 |
| Completed | 71 |
| Passed | 71 |
| Failed | 0 |
| Pending | 0 |
| Coverage | 100% |
| Final verdict | **PASS** |
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
No missing IDs. No duplicates.

## REPORT CONSISTENCY WARNING

- ⚠️ Progress says completed=50, expected 71

## Failed Scenarios

Total failed: **0**

| ID | Scenario | Failure Reason | Layer | Priority |
|---|---|---|---|---|

For detailed failure info (expected vs actual values), see `ACCOUNTING_FIX_LOG.md`.

## Passed Scenarios by Group

### AGENCIES (4/4 passed)

### CAR_EXPENSES (4/4 passed)

### CAR_PURCHASE (4/4 passed)

### CASH_SALES (5/5 passed)

### COMPANIES (4/4 passed)

### CURRENCY (3/3 passed)

### CUSTOMERS (4/4 passed)

### DASHBOARD (4/4 passed)

### DELETE_EDIT (5/5 passed)

### FULL_FLOWS (5/5 passed)

### FUNDERS (5/5 passed)

### GENERAL_EXPENSES (4/4 passed)

### INSTALLMENTS (6/6 passed)

### INVESTORS (4/4 passed)

### PARTNERS (4/4 passed)

### PRINT (3/3 passed)

### READ_ONLY (1/1 passed)

### TERM_SALES (2/2 passed)

## Result

All 71 scenarios pass in E2E_BRIDGE mode.

## Next Action

Run real Tauri verification per `TAURI_VERIFICATION_PLAN.md` before final delivery.
