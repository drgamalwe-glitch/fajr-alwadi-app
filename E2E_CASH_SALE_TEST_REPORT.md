# E2E Cash Sale Test — Report

## How to Run

```bash
npm install
npx playwright install chromium
npm run test:e2e:headed
npm run test:e2e:report
```

## Scenario Executed

**Name:** `cash car purchase and sale accounting verification`

### Steps:
1. Open the app in Chromium via Vite dev server (browser mock mode)
2. Login with test credentials
3. Capture before-values from Dashboard, Cars, Partners, Company Status, and Qasa tabs
4. Add a new car: `Chromium Test Car` with chassis `CHROMIUM-CASH-<timestamp>`, purchase price 10,000 IQD
5. Verify the car appears in the available cars list
6. Sell the car for cash at 20,000 IQD to a test buyer
7. Verify the car moves to the sold list
8. Read Qasa/cash register for sale entries and balances
9. Read Partners tab for partner balances
10. Read Profit Distribution tab for profit shares
11. Read Company Status tab for cash, inventory, and company value
12. Inspect transaction log for chassis-number traceability
13. Compare all actual values against expected accounting results
14. Write `E2E_CASH_SALE_RESULT.md` with full comparison table

## Tabs Checked

| Tab | What was verified |
|---|---|
| Cars (available) | Car added, purchase price displayed |
| Cars (sold) | Car status changed to sold, sale price displayed |
| Qasa / القاصة | Sale cash entry appears once, no duplicate profit entry |
| Partners / حسابات العملاﺀ | Partner balances reflect 50/50 split |
| Profits / الأرباح | Total profit = 10,000 IQD, each partner share = 5,000 IQD |
| Company Status / وضع الشركة | Company value, cash, inventory cards updated |
| Transactions / سجل المعاملات | Sale traceable by chassis number |

## Expected Accounting Result

For a cash sale (purchase 10,000 / sale 20,000):

- **Profit:** 10,000 IQD
- **Each partner profit share:** 5,000 IQD
- **Qasa increase:** 20,000 IQD (sale cash) - 10,000 IQD (purchase cash) = 10,000 IQD net
- **Partner cash from sale:** 10,000 IQD each (half of sale amount)
- **No double counting:** Profit recognition must NOT create a second cash movement
- **Inventory:** Sold car removed from inventory value

## Actual Result from UI

The test reads live values from the Chromium UI and records them in `E2E_CASH_SALE_RESULT.md`. The actual result depends on the mock backend behavior in browser mode.

### Key behavioral note:
The app runs in **browser mock mode** (localStorage-based) when not inside a Tauri window. The mock's `sell_car_with_accounting` updates the car status and creates a customer account but does **not** generate partner transactions for profit distribution. This means:
- The Qasa balance calculation uses car sale data directly
- Partner balances may not reflect profit distribution entries
- The Profit Distribution tab may show an error if `get_profit_distribution_summary` is not mocked

This is expected behavior for the mock backend and highlights areas where the mock differs from the real Tauri backend.

## Double-Counting Check

The test explicitly checks:
1. Whether each partner's cash balance equals 10,000 IQD (not 15,000)
2. Whether `ايداع ارباح سيارة` appears as a separate cash movement in Qasa
3. Whether the Qasa sale entry appears exactly once
4. Whether any unexpected profit deposit row exists in the cash register

## Missing Selectors / Blocked Areas

- Partner balance cards in the Partners tab may need more specific selectors for reliable reading
- The Profit Distribution tab uses a table that may be empty or show an error in mock mode
- Transaction log filtering by chassis number relies on text content matching

## Discovered Issues

Any accounting or UI issues discovered during the test are recorded in `E2E_CASH_SALE_RESULT.md` under "Failure Details".

## Recommended Next Steps

1. If the mock backend does not properly simulate accounting, enhance `mockInvoke` for `sell_car_with_accounting` to create partner transactions
2. Add `get_profit_distribution_summary` to the mock backend
3. Build a full test suite covering installment sales, car expenses, agency profits, and investor movements
4. Consider testing against the real Tauri backend using `cargo tauri dev` for production-accurate results
