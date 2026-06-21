# Fajr Alwadi Car Trading System - Product Specification for TestSprite

## Application Type

This is a Tauri + React + Rust desktop/web application for managing a car dealership accounting system.

The application is currently running for testing on:

http://localhost:4173/

Start testing from the root path only:

/

Do not start from /login.

## Login Information

Use the existing test account only.

Username: admin
Password: admin

Do not create a new user.
Do not search for a user management page unless it is clearly visible after login.

## Testing Mode

Test type: Frontend
Scope: Codebase
Local port: 4173
Path: /

## Application Purpose

The system manages a car dealership business.

It includes:
- Car inventory
- Car purchases
- Cash car sales
- Installment car sales
- Customer accounts
- Investor accounts
- Company accounts
- Funder accounts
- Partner accounts
- Cash safe
- Expenses
- Agency income
- Profits
- Company status dashboard
- Account statement printing
- Ledger entries
- Cash register movements

## Main Accounting Rules

There are exactly two partners in the system.

Each partner owns 50%.

Any operation that affects partner accounts must be split automatically:
50% for partner 1 and 50% for partner 2.

The same transaction may appear in more than one screen or report, but it must not be counted twice.

No operation should ever be duplicated in accounting calculations.

Currencies must be separated. IQD and USD must never be mixed.

## Profit Formula

Total Profit =
cash car sale profits
+ agency profits
+ installment or deferred sale profits only after all payments are fully completed and converted to "واصل"
- expenses from the Expenses section only.

Cash sale profit is recognized immediately.

Agency profit is recognized immediately.

Installment sale profit must not be recognized until all installments are fully paid and all "باقي" installments become "واصل".

Expenses reduce profits only if they are recorded in the Expenses section.

## Customer Account Rules

For account type "زبون":

Transactions of type "واصل" must not affect the customer's real balance.

Transactions of type "باقي" represent the amount still owed by the customer.

The customer is considered owing money only for "باقي" transactions.

When all "باقي" installments are converted to "واصل", the customer balance must become zero.

## Customer Statement Printing Rules

For customer account statement printing only:

Total amount = sum of "واصل" + "باقي"

Paid amount = sum of "واصل" only

Remaining amount = sum of "باقي" only

Total installments = count of "واصل" + count of "باقي"

Paid installments = count of "واصل"

Remaining installments = count of "باقي"

This printing formula must not affect the real customer account balance or any accounting formula.

## Required Practical Test Scenarios

Test these workflows through the UI:

1. Sign in using admin/admin.
2. Reach the main dashboard.
3. Add a new car.
4. Buy a car with cash.
5. Buy a car through a company.
6. Buy a car through a funder.
7. Sell a car for cash.
8. Sell a car by installment.
9. Record a down payment.
10. Pay installments.
11. Convert installments from "باقي" to "واصل".
12. Verify customer balance before full payment.
13. Verify customer balance after all installments are paid.
14. Verify that installment profit does not enter total profit until all installments are paid and converted to "واصل".
15. Verify that cash sale profit enters profit immediately.
16. Verify that agency profit enters profit immediately.
17. Verify that expenses from the Expenses section reduce profit.
18. Add investor deposit.
19. Add investor withdrawal.
20. Add company transaction.
21. Add funder transaction.
22. Add partner deposit.
23. Add partner withdrawal.
24. Check cash safe balance.
25. Check profit card.
26. Check company status dashboard.
27. Print customer account statement.
28. View account transactions filtered by account type.
29. Review cash register movements.
30. Review ledger entries.
31. Update an existing car.
32. Remove a car from inventory if supported.
33. Verify that no transaction is counted twice.
34. Verify that IQD and USD are separated.

## Expected Report Format

Report only detected issues.

For each issue include:

1. Issue title
2. Location in the application
3. Steps to reproduce
4. Expected result
5. Actual result
6. Possible cause
7. Severity: Critical, High, Medium, Low
8. Category: Accounting, Logic, UI, Database, Workflow, Performance
9. Suggested files or modules to inspect later
10. Whether the issue blocks delivery to the client

## Important Instructions

Do not modify the code.

Do not fix bugs.

Do not refactor.

Do not change the UI.

Only test and report issues.

Focus especially on:
- Accounting correctness
- Customer balance
- Installment logic
- Profit calculation
- Partner 50/50 split
- Cash safe balance
- Duplicate transaction prevention
- IQD/USD currency separation
