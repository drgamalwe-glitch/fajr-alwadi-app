# Fajr Alwadi Accounting Instructions

This file is the main accounting source of truth for the project.

Any code, report, dashboard card, database migration, or AI-generated change must follow this file exactly.

If the current code conflicts with this file, the code must be changed to follow this file.

---

# 1. Core Rules

## 1.1 Partners

- The system has exactly two partners.
- Each partner owns 50%.
- Every partner-related profit, cost, cash deposit, or cash withdrawal must be split automatically:
  - Partner 1: 50%
  - Partner 2: 50%

## 1.2 No Double Counting

The same accounting event may appear in more than one screen for display purposes, but it must not be counted more than once.

Showing a transaction in several places does not mean it is a new accounting transaction.

## 1.3 Read-Only Means Read-Only

Any function, screen, report, summary card, or dashboard that only reads data must not create, update, delete, reverse, rebuild, or migrate accounting records.

Only create, update, and delete operations are allowed to change the database.

Examples of read-only functions that must never write data:

- `get_financial_summary`
- `get_cash_register_entries`
- `get_profit_distribution_summary`
- `get_partners_totals`
- `get_unified_accounts`
- `get_partner_transactions`
- `get_cars`

---

# 2. Main Accounting Concepts

## 2.1 Qasa

Qasa means the operational cash/safe register.

Qasa includes only:

1. Partner cash movements.
2. Investor cash movements.

Qasa must not include:

- Funder movements.
- Company movements.
- Customer movements that do not affect partner or investor cash.
- Profit recognition rows that are not real cash movements.

## 2.2 Cash Tab Inside Qasa

The Cash tab inside Qasa means partner cash only.

It includes only partner cash movements.

It does not include investor movements.

## 2.3 Investors

Investor movements appear in:

- General operations log.
- Qasa tab.

Investor movements do not appear in:

- Partner Cash tab.

## 2.4 Funders and Companies

Funder and company movements appear in:

- General operations log.
- Customer/accounts section.
- Receivables or liabilities depending on the balance.

Funder and company movements do not appear in:

- Qasa.
- Partner Cash tab.

Exception:

If a funder or company settlement causes a real partner cash payment, then only the separate partner cash movement appears in Qasa/Cash.

The funder/company transaction itself must still not appear in Qasa/Cash.

---

# 3. Cash Movement vs Profit Recognition

This is the most important rule in the system.

A cash movement is not the same as profit recognition.

## 3.1 Cash Movement

A cash movement means real money entered or left Qasa/Cash.

Examples:

- Customer payment received.
- Cash car sale received.
- Partner paid car purchase.
- Partner paid general expense.
- Partner paid car expense.
- Partner paid funder or company settlement.
- Investor deposit or withdrawal.

## 3.2 Profit Recognition

Profit recognition means the system records how much of the received money is profit.

Profit recognition does not create new cash by itself.

## 3.3 Critical Example

A customer pays:

```text
Customer payment = 5,000,000
Payment profit = 2,500,000
````

Correct result:

```text
Qasa increases by 5,000,000 only.
Cash increases by 5,000,000 only.
Profit increases by 2,500,000.
Each partner profit share = 1,250,000.
```

Wrong result:

```text
Qasa increases by 5,000,000
Then Qasa increases again by 2,500,000 as profit
Total Qasa increase = 7,500,000
```

This is forbidden.

Payment profit is part of the payment amount that already entered Qasa/Cash.

It must be recognized as profit, but it must not be added as a second cash movement.

---

# 4. Recommended Transaction Classification

Every generated accounting row should clearly define what it affects.

Recommended fields:

```text
source_type
source_id
source_role
affects_qasa
affects_partner_cash
affects_profit
```

## 4.1 Field Meaning

### source_type

The original source of the transaction.

Examples:

```text
customer_payment
car_sale
agency
agency_transaction
expense
car_expense
funder_payment
company_payment
investor_transaction
```

### source_id

The id or unique reference of the original source.

Examples:

```text
customer payment id
car number
expense id
car expense id
agency id
agency transaction id
funder transaction id
company transaction id
```

### source_role

The accounting role of the generated transaction.

Examples:

```text
cash_movement
profit_recognition
cash_payment
partner_cash_payment
legacy_customer_payment_cash
```

### affects_qasa

Use `true` only if this row must appear in Qasa.

### affects_partner_cash

Use `true` only if this row must appear in the partner Cash tab.

### affects_profit

Use `true` only if this row must be included in profit and profit distribution.

---

# 5. Profit Formula

All profit cards, profit sections, profit distribution, and net profit must follow this formula:

```text
Total Profit =
Cash Car Sale Profits
+ Agency Profits
+ Installment/Term Sale Profits Recognized Gradually From Payments
- General Expenses Only
```

## Important Notes

* Cash car sale profit is recognized immediately at sale time.
* Agency profit is recognized when recorded.
* Installment or term-sale profit is not recognized fully at sale time.
* Installment or term-sale profit is not delayed until the last payment.
* Installment or term-sale profit is recognized gradually with each customer payment.
* Only general expenses from the Expenses section reduce net profit.
* Car expenses do not reduce general net profit directly.
* Car expenses are part of the car cost and reduce the car profit.
* **Losses must reduce net profit.** If a car is sold below its cost (selling < purchase + car expenses), the negative profit (loss) must be subtracted from net profit. A loss is not silently ignored.

---

# 5.1 Car Expenses Source of Truth for Cash Sales

For cash car sales, `calculate_analytical_profit` uses the `car_expenses` table as the authoritative source for car expenses, not the legacy `expenses_at_sale` snapshot on the cars row.

```text
Car Profit = Selling Price - Purchase Price - SUM(car_expenses.amount WHERE car_number = ?)
```

If no rows exist in `car_expenses` for the car, it falls back to `COALESCE(expenses_at_sale, 0)` for backward compatibility with cars sold before the `car_expenses` table existed.

This ensures that:
- Cash car profits and installment payment profits use the same car cost basis.
- A car expense added after sale (e.g. repair cost) is reflected in both paths.
- The `expenses_at_sale` snapshot is never used when actual `car_expenses` rows exist.

---

# 6. Car Profit Formula

## 6.1 Car Cost

```text
Car Cost = Purchase Price + Car Expenses
```

## 6.2 Full Car Profit

```text
Full Car Profit = Selling Price - Car Cost
```

## 6.3 Profit Ratio

```text
Profit Ratio = Full Car Profit / Selling Price
```

## 6.4 Payment Profit

```text
Payment Profit = Payment Amount × Profit Ratio
```

## 6.5 Partner Share

```text
Each Partner Profit Share = Payment Profit / 2
```

---

# 7. Installment and Term Sales

Installment and term-sale profits must be recognized gradually with each customer payment.

## 7.1 At Sale Time

When a car is sold by installments or term sale:

* Do not recognize the full car profit immediately.
* Do not distribute the full car profit to partners.
* Create the customer receivable or remaining balance.
* Record any actual payment received as cash movement.
* Recognize profit only for the amount actually paid.

## 7.2 At Each Customer Payment

Each customer payment must create two accounting effects:

### Effect 1: Cash Movement

The full payment amount enters Qasa/Cash if it belongs to partner cash.

Example:

```text
Customer payment = 5,000,000
```

Then:

```text
Qasa/Cash increases by 5,000,000
```

This movement affects:

```text
affects_qasa = true
affects_partner_cash = true
affects_profit = false
```

### Effect 2: Profit Recognition

Only the profit part of the payment is recognized as profit.

Example:

```text
Payment profit = 2,500,000
```

Then:

```text
Profit increases by 2,500,000
Each partner profit share = 1,250,000
```

This movement affects:

```text
affects_qasa = false
affects_partner_cash = false
affects_profit = true
```

This row must not increase Qasa or Cash again.

## 7.3 Last Installment

When the last installment is paid:

* Record the payment as cash movement.
* Recognize only the profit of that payment.
* Do not add the full car profit again.
* Do not create any final extra profit row.

## 7.4 Profit Cap

The total recognized profit from all payments must never exceed the full car profit.

Use this rule:

```text
Remaining Recognizable Profit =
Full Car Profit - Already Recognized Profit
```

Then:

```text
Recognized Payment Profit =
min(Calculated Payment Profit, Remaining Recognizable Profit)
```

If the remaining recognizable profit is zero or negative, do not recognize more profit.

---

# 8. Installment Example

Car data:

```text
Purchase Price = 10,000,000
Selling Price = 20,000,000
Car Expenses = 0
Sale Type = Installments
Down Payment = 5,000,000
Remaining = 15,000,000
```

Calculation:

```text
Car Cost = 10,000,000
Full Car Profit = 20,000,000 - 10,000,000 = 10,000,000
Profit Ratio = 10,000,000 / 20,000,000 = 50%
```

When the customer pays the down payment:

```text
Payment Amount = 5,000,000
Payment Profit = 5,000,000 × 50% = 2,500,000
Each Partner Share = 1,250,000
```

Correct result:

```text
Qasa increases by 5,000,000 only.
Cash increases by 5,000,000 only.
Profit increases by 2,500,000.
Partner 1 profit = 1,250,000.
Partner 2 profit = 1,250,000.
```

When the customer pays an installment of 1,000,000:

```text
Payment Amount = 1,000,000
Payment Profit = 1,000,000 × 50% = 500,000
Each Partner Share = 250,000
```

After all payments:

```text
Total Recognized Profit = 10,000,000
Partner 1 Total Profit = 5,000,000
Partner 2 Total Profit = 5,000,000
```

No extra profit is allowed after the last installment.

---

# 9. Cash Car Sales

When a car is sold for cash:

## 9.1 Cash Movement

The full selling price enters Qasa/Cash once.

Example:

```text
Selling Price = 20,000,000
```

Then:

```text
Qasa/Cash increases by 20,000,000
```

## 9.2 Profit Recognition

Profit is recognized separately:

```text
Profit = Selling Price - Purchase Price - Car Expenses
```

Example:

```text
Purchase Price = 10,000,000
Selling Price = 20,000,000
Car Expenses = 0
Profit = 10,000,000
Each Partner Share = 5,000,000
```

Correct result:

```text
Qasa/Cash increases by 20,000,000 only.
Profit increases by 10,000,000.
```

Wrong result:

```text
Qasa/Cash increases by 20,000,000
Then increases again by 10,000,000 as profit
Total increase = 30,000,000
```

This is forbidden.

---

# 10. Customer Accounts

A customer account tracks what the customer still owes.

## 10.1 Remaining Balance

The customer is considered owing money only through remaining/debt transactions.

Examples:

```text
باقي
سحب
```

## 10.2 Paid Transactions

Paid transactions reduce the customer balance.

Examples:

```text
واصل
ايداع
إيداع
مقدمة
استلام
تسديد
```

## 10.3 Fully Paid Customer

When all remaining installments become paid, the customer balance must become zero.

The customer must not still appear as owing money after all installments are paid.

## 10.4 Printing Reports

Customer statement printing may show:

* Total amount.
* Paid amount.
* Remaining amount.
* Total installments.
* Paid installments.
* Remaining installments.

But printing calculations must not change the customer account or database records.

---

# 11. General Expenses

General expenses are expenses from the Expenses section that are not linked to a car.

They reduce net profit.

A general expense must:

* Reduce partner cash if paid by partners.
* Appear in Qasa and Cash if it affects partner cash.
* Reduce net profit.

General expense effect:

```text
affects_qasa = true
affects_partner_cash = true
affects_profit = false
```

Net profit must subtract general expenses separately from the `expenses` table.

General expenses should be identified as:

```text
car_number IS NULL OR car_number = ''
```

---

# 12. Car Expenses

Car expenses are expenses linked to a specific car.

Examples:

* Repair cost.
* Registration cost.
* Transport cost.
* Car-specific commission.
* Any cost that belongs to one car.

Car expenses:

* Are part of the car cost.
* Reduce the car profit.
* Do not reduce general net profit directly.
* Should not be counted twice.

Car expense formula:

```text
Car Cost = Purchase Price + Car Expenses
```

Car expense partner cash movement:

```text
affects_qasa = true
affects_partner_cash = true
affects_profit = false
```

Car expense must not be treated as a general expense.

---

# 13. Agencies

Agency profit is recognized when recorded.

Agency profit must be split 50/50 between the two partners.

Agency profit appears in:

* Profit Distribution.
* Profit Card.
* Net Profit.
* General operations log.

If agency profit is also a real cash receipt, then the cash receipt may appear in Qasa/Cash.

But it must not be double-counted.

## Agency Linking Rule

Every agency profit must be linked to a clear source:

```text
agency_id
or
agency_transaction_id
```

Never delete agency profit by only matching:

```text
name
date
notes
```

This is unsafe.

If two agencies have the same names and date, deleting one must not affect the other.

---

# 14. Investors

Investor deposits and withdrawals affect Qasa but not partner Cash.

Investor deposit:

```text
affects_qasa = true
affects_partner_cash = false
affects_profit = false
```

Investor withdrawal:

```text
affects_qasa = true
affects_partner_cash = false
affects_profit = false
```

If partners pay an investor from partner cash, create a separate partner cash movement for the payment.

---

# 15. Funders

Funder transactions do not appear in Qasa or partner Cash by themselves.

Funder financing means the funder provided financing or created a liability.

It must not automatically reduce partner cash.

Funder financing:

```text
affects_qasa = false
affects_partner_cash = false
affects_profit = false
```

Funder repayment from partners must create a separate partner cash movement:

```text
source_type = funder_payment
source_role = partner_cash_payment
affects_qasa = true
affects_partner_cash = true
affects_profit = false
```

The repayment must reduce partner cash once only.

---

# 16. Companies

Company transactions do not appear in Qasa or partner Cash by themselves.

Company-related balances appear in:

* Customer/accounts section.
* Receivables or liabilities.
* General operations log.

If partners pay a company from partner cash, create a separate partner cash movement:

```text
source_type = company_payment
source_role = partner_cash_payment
affects_qasa = true
affects_partner_cash = true
affects_profit = false
```

The company transaction itself must still not appear in Qasa/Cash.

---

# 17. Dashboard Rules

Dashboard cards must match their original sections.

## 17.1 Qasa Card

Qasa Card source:

```text
Qasa tab = partner movements + investor movements
```

It must use:

```text
affects_qasa = true
kind IN ('شريك', 'مستثمر')
```

## 17.2 Cash Card

Cash Card source:

```text
Cash tab inside Qasa = partner movements only
```

It must use:

```text
affects_partner_cash = true
kind = 'شريك'
```

## 17.3 Profit Card

Profit Card source:

```text
Profit recognition rows - general expenses only
```

It must use:

```text
affects_profit = true
```

Then subtract general expenses only.

## 17.4 Inventory Card

Inventory value must represent available cars only.

Sold cars must not remain in inventory value.

## 17.5 Receivables

Receivables mean amounts owed to the company.

They come from customer/accounts logic, not from Qasa.

## 17.6 Liabilities

Liabilities mean amounts the company owes to others.

They include investors, funders, companies, or any account that has a liability balance.

---

# 18. Company Status Page

Company Status must show:

```text
Company Value = Cash + Available Car Value + Receivables - Liabilities
```

Where:

```text
Cash = partner cash only
Available Car Value = available inventory only
Receivables = what others owe the company
Liabilities = what the company owes others
```

Company Status is not just partner balance.

---

# 19. Ledger and Audit Rules

Every generated transaction must have a clear source.

Required references:

* Customer payment profit must reference the customer payment id.
* Car sale profit must reference the car number.
* General expense partner movement must reference the expense id.
* Car expense partner movement must reference the car expense id.
* Agency profit must reference agency id or agency transaction id.
* Funder/company partner payment must reference the original settlement transaction.

## Forbidden

Do not rely only on:

```text
name
date
notes
description
```

to delete or update accounting transactions.

These are not safe identifiers.

---

# 20. Editing and Deleting Transactions

When a source transaction is edited or deleted, only its related generated transactions may be edited or deleted.

Use:

```text
source_type
source_id
source_role
```

Do not delete unrelated transactions because they have the same note, same date, same name, or same description.

---

# 21. Required Test Scenario: Installment Sale

The system must pass this test:

```text
Purchase Price = 10,000,000
Selling Price = 20,000,000
Car Expenses = 0
Sale Type = Installments
Down Payment = 5,000,000
Remaining = 15,000,000
Monthly Installment = 1,000,000
```

Expected:

```text
Full Car Profit = 10,000,000
Profit Ratio = 50%
```

After down payment:

```text
Qasa increase = 5,000,000
Cash increase = 5,000,000
Recognized Profit = 2,500,000
Partner 1 Profit = 1,250,000
Partner 2 Profit = 1,250,000
```

After one installment:

```text
Qasa increase = 1,000,000
Cash increase = 1,000,000
Recognized Profit = 500,000
Partner 1 Profit = 250,000
Partner 2 Profit = 250,000
```

After all payments:

```text
Total Recognized Profit = 10,000,000
Partner 1 Profit = 5,000,000
Partner 2 Profit = 5,000,000
Customer Remaining Balance = 0
```

Forbidden result:

```text
Adding full car profit again on the last installment.
```

---

# 22. Required Test Scenario: Cash Sale

```text
Purchase Price = 10,000,000
Selling Price = 20,000,000
Car Expenses = 0
Sale Type = Cash
```

Expected:

```text
Qasa increase = 20,000,000
Cash increase = 20,000,000
Recognized Profit = 10,000,000
Partner 1 Profit = 5,000,000
Partner 2 Profit = 5,000,000
```

Forbidden result:

```text
Qasa/Cash increase = 30,000,000
```

---

# 23. Required Test Scenario: Car Expense

```text
Purchase Price = 10,000,000
Car Expense = 1,000,000
Selling Price = 20,000,000
```

Expected:

```text
Car Cost = 11,000,000
Full Car Profit = 9,000,000
```

The car expense:

* Reduces partner Cash/Qasa if paid by partners.
* Increases car cost.
* Does not reduce general net profit directly.
* Must not be counted twice.

---

# 24. Required Test Scenario: General Expense

General expense:

```text
Rent = 1,000,000
```

Expected:

```text
Partner Cash decreases by 1,000,000
Each partner bears 500,000
Net Profit decreases by 1,000,000
```

This expense is not part of any car cost.

---

# 24.1 Required Test Scenario: Cash Car Loss

A car is sold for cash below its cost:

```text
Purchase Price = 10,000,000
Car Expenses = 1,000,000
Selling Price = 8,000,000
Sale Type = Cash
```

Expected:

```text
Car Cost = 11,000,000
Car Profit (Loss) = 8,000,000 - 11,000,000 = -3,000,000
Qasa/Cash increases by 8,000,000 (the actual selling price)
Net Profit decreases by 3,000,000 (the loss)
```

Forbidden result:

```text
Loss is ignored and net profit is not reduced.
```

---

# 25. Required Test Scenario: Investor

Investor deposit:

```text
Investor deposits 10,000,000
```

Expected:

```text
Qasa increases by 10,000,000
Partner Cash does not increase
Profit does not increase
Liability to investor increases
```

---

# 26. Required Test Scenario: Funder

Funder financing:

```text
Funder finances a car for 10,000,000
```

Expected:

```text
Partner Cash does not decrease
Qasa does not change
Funder liability increases
Profit does not change
```

Funder repayment from partners:

```text
Partners repay funder 10,000,000
```

Expected:

```text
Partner Cash decreases by 10,000,000
Each partner bears 5,000,000
Funder liability decreases
```

The repayment must happen once only.

---

# 27. Required Test Scenario: Agency

Create two agency transactions with:

```text
Same old agent name
Same new agent name
Same date
Different transaction ids
```

Deleting one agency transaction must delete only its own profit rows.

It must not delete the other agency transaction profit.

---

# 28. Final Acceptance Rules

The system is correct only if all these are true:

1. Qasa tab equals Qasa card.
2. Cash tab equals Cash card.
3. Funders and companies do not appear in Qasa/Cash.
4. Investors appear in Qasa but not in partner Cash.
5. Customer payments increase Qasa/Cash only by the actual payment amount.
6. Payment profit increases profit only, not Qasa/Cash again.
7. Total recognized installment profit never exceeds full car profit.
8. Last installment does not create full car profit again.
9. General expenses reduce net profit.
10. Car expenses reduce car profit through car cost only.
11. Agency profits are linked by id, not by name/date only.
12. Deleting one transaction does not delete unrelated transactions.
13. Read-only functions never write to the database.
14. Dashboard profit equals Profit Distribution.
15. All partner profit shares are split 50/50.

---

# 29. AI Implementation Reminder

When modifying the code, always ask:

1. Is this a real cash movement?
2. Does it affect Qasa?
3. Does it affect partner Cash?
4. Is it only profit recognition?
5. Does it affect profit?
6. What is the original source id?
7. Can this be deleted safely without affecting unrelated rows?
8. Is this consistent with Instructions.md?

If the answer is unclear, do not guess by transaction name only.

Use explicit fields and clear source references.

---

# 30. Confirmed Architecture Behaviors (Not Bugs)

The following behaviors have been reviewed and confirmed as correct. They must not be flagged as bugs by future audits or AI reviews.

## 30.1 Cash Sale — Cash Movement + Signed Profit Recognition Rows

When a car is sold for cash, the system deposits the full selling price to partners in a single `cash_movement` row (affects_qasa = affects_partner_cash = 1, affects_profit = 0). In addition, `rebuild_cash_sale_profit_recognition` creates SIGNED `profit_recognition` rows (source_type = `car_sale`, affects_profit = 1, affects_qasa = affects_partner_cash = 0) carrying the car profit — or the negative loss — split 50/50. `calculate_analytical_profit` reads these `profit_recognition` rows (it does not recompute from the `cars` table). The profit rows never enter Qasa/Cash, so there is no double counting. This is by design and is correct.

## 30.2 Down Payment — Full Two-Effect Treatment

The installment down payment (`sale_down_payment`) is handled by `apply_partner_transaction_splits`, which detects the type prefix "مقدمة" and calls `create_customer_payment_accounting_effects`. This creates the same two effects as any installment payment (cash_movement + profit_recognition). The down payment is NOT missing its effects.

## 30.3 Partner Balance Already Contains Cash Share

Partner `iqd_balance` / `usd_balance` already includes each partner's 50% share of cash (because cash deposits increase the partner's balance). In the Company Status page, `sharedIqd` must NOT include cash again, otherwise cash would be double-counted: once in the partner's direct balance and once in the shared calculation. The formula `sharedIqd = (inventory + receivables - liabilities) / 2` is correct.

## 30.4 Fixed Two Partners

The system has exactly two partners, hardcoded in business logic (50/50 split). Reading partner names from the database is for name resolution only, not for determining the split ratio. Dividing by 2 in read paths (e.g. `get_profit_distribution_summary`) is correct and intentional.

## 30.5 Agency Profit Sources Are Distinct

Agency profits come from two separate, non-overlapping sources: the `agencies.amount_iqd/amount_usd` (initial amounts at agency creation) and `agency_transactions.amount` (subsequent transactions against that agency). These are added together in `calculate_analytical_profit`. This is not double-counting — they represent different events.

## 30.6 Qasa vs Cash — Correct Kind Filtering

- Qasa tab (`قاصه/قاصة`): `affects_qasa = 1 AND kind IN ('شريك', 'مستثمر')` — includes partners and investors.
- Cash tab (`الكاش`): `affects_partner_cash = 1 AND kind = 'شريك'` — partners only, not investors.

This is correct per sections 2.1 and 2.2.

## 30.7 Profit Rebuild — Must Skip Reversed Rows

When rebuilding profit recognitions (`rebuild_customer_payment_profit_recognitions`), the delete query must filter `COALESCE(is_reversed, 0) = 0`. This prevents resurrecting profit rows that were correctly marked as reversed during a payment reversal.

## 30.8 Down Payment Cap — Must Include Existing Down Payments

When validating a down payment update, the cap check must include all existing down payments for the same sale (not just installment events). The formula is: `new_amount + paid_installments + existing_down_payments <= selling_price`.

## 30.9 Agency Profit — Recognized When Recorded, Cash Only When Received

Per section 13, agency profit `profit_recognition` rows are created as soon as the agency is recorded, even when the payment status is "غير واصل". The `cash_movement` rows are created only when the status is "واصل" (real cash). While unpaid, a receivable row (kind = "وكالة") tracks the amount owed. The ledger always credits `revenue` at record time, debiting `cash` when received or `receivable` while owed.

## 30.10 Deferred Revenue Ledger Account Holds Unearned Profit Only

For installment/term sales, the sale ledger entries follow the installment method: `Dr receivable (selling price)`, `Cr inventory (car cost)`, and `Cr deferred_revenue (full car profit only)`. Loss sales record `Dr expense "خسارة بيع سيارة"` instead of a deferred credit. Each payment's profit recognition transfers `Dr deferred_revenue / Cr revenue` for the profit portion, so the deferred account reaches exactly zero when the full car profit is recognized.

## 30.11 Deterministic 50/50 Split Remainder

When an odd smallest unit cannot be split evenly, the remainder deterministically goes to the FIRST partner (alphabetical order). Rebuilding generated rows therefore always reproduces identical amounts.

---

# 31. ID-Based Design and Agency Cash vs Credit Rules

This section defines new mandatory rules added by the forensic re-audit. These rules override any conflicting statement in section 30.

## 31.1 ID-Based Design — Everything Must Have a Unique ID

Every entity in the system must be identified by a unique numeric ID (INTEGER PRIMARY KEY AUTOINCREMENT), never by a text field alone.

Entities that already have IDs:
- `cars.car_number` is the PRIMARY KEY, but every car also has an implicit `rowid`.
- `partner_transactions.id` — auto-increment.
- `financial_ledger.id` — auto-increment.
- `agencies.id` — auto-increment.
- `agency_transactions.id` — auto-increment.
- `expenses.id` — auto-increment.
- `car_expenses.id` — auto-increment.
- `audit_log.id` — auto-increment.
- `users.id` — auto-increment.

Entities that must gain IDs (design requirement):
- All `partner_transactions.source_id` values must reference a numeric ID, never a text name.
- All `financial_ledger.reference_id` values must reference a numeric ID when the entity type has one.
- All `audit_log.entity_id` values must reference a numeric ID.

## 31.2 Idempotency Tokens (creation_token)

Every create operation must accept an optional `creation_token` (UUID v4). If the same token is submitted twice, the second request must return the original entity's ID without creating a duplicate.

Entities that must support `creation_token`:
- `agencies` — already implemented (§31.2.1).
- `cars` — must be added.
- `expenses` — must be added.
- `car_expenses` — must be added.
- `partner_transactions` (manual entries) — must be added.
- `agency_transactions` — must be added.

### 31.2.1 Agency creation_token (already implemented)

The `agencies` table has a `creation_token TEXT` column with a `UNIQUE` index. `add_agency` checks for an existing token before inserting. If found, it returns the existing ID.

## 31.3 Duplicate Chassis and Car Numbers — Allowed with Different IDs

A chassis number (`chassis_number`) MAY be shared by multiple car records. Each car record has its own `car_number` (primary key) and its own `rowid`.

When a user adds a car with a chassis number that already exists:
1. The operation MUST succeed (no rejection).
2. A new car record is created with a new `car_number`.
3. If the requested `car_number` already exists, the system auto-generates a unique variant by appending `#2`, `#3`, etc.
4. The new car has its own independent accounting (own purchase ledger, own sale ledger, own expenses).

This rule supersedes any previous unique constraint on `chassis_number`. The `UNIQUE` index on `chassis_number` (added in migration v31) must be removed or made non-unique.

Rationale: the same physical vehicle may be purchased, sold, and re-purchased multiple times. Each cycle is an independent accounting event with its own cost basis, sale price, and profit.

## 31.4 Agency Cash vs Credit — Profit Recognition Rules

This section REPLACES §30.9 with a stricter rule.

### 31.4.1 Cash Agency (payment_status = "واصل")

When an agency is recorded with `payment_status = "واصل"` (cash received):

1. The full agency amount is recognized as profit immediately.
2. A `profit_recognition` row is created (`affects_profit = 1`, `affects_qasa = 0`, `affects_partner_cash = 0`).
3. A `cash_movement` row is created (`affects_profit = 0`, `affects_qasa = 1`, `affects_partner_cash = 1`).
4. The agency amount appears in:
   - Profit card (via `affects_profit = 1`).
   - Qasa tab (via `affects_qasa = 1`).
   - Cash tab (via `affects_partner_cash = 1`).
5. No receivable row is created (the cash was received).

### 31.4.2 Credit Agency (payment_status = "غير واصل")

When an agency is recorded with `payment_status = "غير واصل"` (cash NOT received):

1. NO profit is recognized. No `profit_recognition` row is created.
2. NO cash movement is created. No `cash_movement` row is created.
3. A receivable row is created (`kind = "وكالة"`, `source_type = "agency"`, `source_role = "agency_receivable"`) tracking the amount owed.
4. The agency amount does NOT appear in:
   - Profit card (no `affects_profit = 1` row).
   - Qasa tab (no `affects_qasa = 1` row).
   - Cash tab (no `affects_partner_cash = 1` row).
5. The agency amount DOES appear in:
   - Receivables (via the `agency_receivable` row).
   - General operations log (display only).

### 31.4.3 Receiving Payment on a Credit Agency

When the user marks a credit agency as "واصل" (received) — via `set_agency_receivable_status` or by creating a payment transaction through the agency account:

1. The receivable row is reversed (or marked as paid).
2. A `profit_recognition` row is created (the profit is now recognized).
3. A `cash_movement` row is created (the cash entered Qasa/Cash).
4. The agency amount now appears in Profit card, Qasa tab, and Cash tab.

### 31.4.4 Ledger Entries for Agency

Cash agency ledger:
```text
Dr cash (قاصه)           agency_amount
Cr revenue (agency_id)   agency_amount
```

Credit agency ledger (at record time):
```text
Dr receivable (new_agent_name)  agency_amount
Cr revenue (agency_id)          agency_amount
```

Wait — this credits revenue, which would show in the profit card via the ledger. To strictly enforce "no profit until paid", the credit agency ledger must instead be:

```text
Dr receivable (new_agent_name)  agency_amount
Cr deferred_revenue (agency_id) agency_amount
```

When the payment is received:
```text
Dr cash (قاصه)                  agency_amount
Cr receivable (new_agent_name)  agency_amount
Dr deferred_revenue (agency_id) agency_amount
Cr revenue (agency_id)          agency_amount
```

This ensures `calculate_analytical_profit` (which reads `affects_profit = 1` rows from `partner_transactions`, NOT the ledger `revenue` account) does not count the agency profit until the `profit_recognition` row is created at payment time.

### 31.4.5 Agency Transactions (subsequent transactions against an existing agency)

`agency_transactions` (added via `add_agency_transaction`) follow the same cash-vs-credit rule:
- If the agency's `payment_status` is "واصل": the transaction amount is recognized as profit + cash immediately.
- If the agency's `payment_status` is "غير واصل": the transaction amount is added to the receivable, no profit recognized until paid.

## 31.5 Duplicate Addition Prevention

### 31.5.1 Duplicate Agency Prevention

If `add_agency` is called twice with the same `creation_token`, the second call returns the original agency ID without creating a duplicate.

If `add_agency` is called twice WITHOUT a `creation_token` but with identical data (same `old_agent_name`, `new_agent_name`, `date`, `amount_iqd`, `amount_usd`), the system must NOT create a duplicate. It must detect the duplicate within a 5-second window and return the existing agency ID.

### 31.5.2 Duplicate Expense Prevention

If `add_expense` is called twice with the same `creation_token`, the second call returns the original expense ID without creating a duplicate.

If `add_expense` is called twice WITHOUT a `creation_token` but with identical data (same `description`, `amount`, `date`, `currency`, `car_number`), the system must detect the duplicate within a 5-second window and return the existing expense ID.

### 31.5.3 Duplicate Car Prevention

If `add_car` is called twice with the same `creation_token`, the second call returns without creating a duplicate.

If `add_car` is called twice WITHOUT a `creation_token` but with identical data (same `chassis`, `purchase_price`, `purchase_date`), the system must detect the duplicate within a 5-second window and return without creating a duplicate.

NOTE: This does NOT prevent adding a car with the same `chassis_number` as an existing car — that is allowed (§31.3). It only prevents the EXACT same car record from being inserted twice in rapid succession (double-click protection).

## 31.6 Source Metadata Completeness

Every `partner_transaction` and every `financial_ledger` row must have:
- `source_type` — non-null, non-empty.
- `source_id` — non-null, non-empty, references a numeric ID.
- `source_role` — non-null, non-empty.

Rows that do not meet this requirement are considered corrupt and must be flagged by the audit.
