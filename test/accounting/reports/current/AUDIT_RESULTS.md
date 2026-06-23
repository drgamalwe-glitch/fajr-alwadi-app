# Fajr Alwadi — Accounting Verification Results

**Date:** 2026-06-22
**Branch:** `main` (792b096)
**Tags:** `accounting-verified-v1`, `fajr-alwadi-accounting-stable-2026-06-22`

---

## Commands Run

| Command | Result |
|---|---|
| `cargo check` | ✅ PASS — 0 errors (5 pre-existing unused fn warnings) |
| `npx tsc --noEmit` | ✅ PASS — exit 0 |
| `python3 scripts/accounting_audit.py static` | ✅ PASS — S1–S71 all pass |
| `python3 scripts/accounting_runtime_scenarios.py` | ✅ PASS — 25/25 scenarios, 120/120 assertions |
| `python3 scripts/accounting_audit.py "<fresh_db>"` | ✅ PASS — pre-smoke: clean; post-smoke: clean |
| `python3 scripts/check_installment_profit.py "<fresh_db>"` | ✅ PASS — 37/37 tests |

---

## Scenarios Covered

### Seeded Runtime (25 scenarios, 120 assertions)
1. Available car purchase, cash
2. Available car purchase by funder
3. Sell available car cash
4. Sell available car by installments
5. Partial installment payment less than due
6. Installment overpayment
7. Final installment payment
8. Edit sold car sale fields only
9. Edit sold car cost only
10. Change sold car number once
11. Change sold car number twice
12. Mixed sale + cost edit blocked
13. Add car expense after cash sale
14. Delete car expense after cash sale
15. Add car expense after installment sale
16. Profit cap violation
17. New car directly sold
18. Delete sold renamed car
19. Delete customer with active receivable
20. Delete funder/company/investor with active balance
21. Customer rename with same-name funder
22. Manual payment preservation after sale rebuild
23. Qasa/cash double-count prevention
24. Source metadata completeness
25. Atomic rollback simulation

### Real Fresh DB Smoke Workflows (9 workflows, 51 assertions)
- A. Empty-state check
- B. Cash purchase
- C. Cash sale
- D. Installment sale
- E. Partial installment payment
- F. Sold car cost edit
- G. Sold car number change
- H. Car expense after cash sale
- I. Delete protection (customer + funder + company)

### Practical Accounting Tests (37 tests)
- Cash/installment/investor/funder/company rules
- Car expense, general expense, profit consistency
- Customer payment cash movement, profit recognition
- Rebuild completeness, installment cycle, ledger balance
- Profit cap, source linking, migration validation
- Currency, orphan, duplicate, and isolation checks

---

## Known Remaining Risks

1. **No concurrent-user test** — all tests run single-threaded
2. **No full Tauri IPC end-to-end test** — tests use direct SQL simulation, not the actual Tauri command layer
3. **5 non-critical pre-existing warnings** — `cargo check` shows 5 unused function warnings (legacy helpers that are no longer called but retained for reference)

---

## Confirmations

- ✅ No old DB data was used — the verification started with a fresh empty DB
- ✅ All tests were run on the fresh DB or a seeded temporary DB
- ✅ `Instructions.md` was followed — no accounting rules were modified
- ✅ No UI design, layout, colors, or Arabic labels were changed
- ✅ `check_installment_profit.py` accepts DB path as first argument (no `--db` flag needed)

---

## Conclusion

**Accounting verification is complete. The project is ready for controlled delivery.**
