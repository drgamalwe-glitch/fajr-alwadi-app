# Installment System Fix Report

## Existing Bugs Found

- Installment payments were handled by inserting a generic customer payment row, then rebuilding schedule rows by deleting and recreating `partner_transactions`.
- The old rebuild logic treated payments as a running pool that could partially cover multiple installments, so the selected installment was not the durable source of truth.
- Reversal deleted payment rows and partner split rows, which removed accounting history instead of preserving an audit trail.
- There was no immutable payment event table, no active/reversed event status, and no ledger batch id joining all accounting effects of one payment.
- The React UI used the generic transaction edit modal for installment payment, so it could not preview overpayment/underpayment redistribution before confirmation.

## Files Modified

- `src-tauri/src/lib.rs`
- `src/types.ts`
- `src/components/PartnersTab.tsx`
- `INSTALLMENT_SYSTEM_FIX_REPORT.md`

## Migrations Added

Safe startup migration now ensures:

- `partner_transactions.original_amount`
- `partner_transactions.current_amount`
- `partner_transactions.actual_paid_amount`
- `partner_transactions.paid_event_id`
- `partner_transactions.due_date`
- `partner_transactions.ledger_batch_id`
- `partner_transactions.is_reversed`
- `financial_ledger.ledger_batch_id`
- `audit_log.ledger_batch_id`
- `customer_installment_payment_events`

Indexes were added for event lookup, one active event per installment, and ledger batch lookup.

## Backend Commands Changed

Added:

- `pay_customer_installment`
- `reverse_customer_installment_payment`
- `preview_installment_payment_redistribution`
- `recalculate_installment_schedule`
- `get_customer_installments`

Updated:

- `set_customer_installment_status` is now a backward-compatible wrapper over the new safe payment/reversal core.
- `rebuild_installment_schedule` now delegates to deterministic event-sourced recalculation.
- `get_partner_transactions` now returns installment metadata and hides reversed rows from normal account views.

## Event Sourcing Design

- Original schedule rows are preserved in `partner_transactions` with `source_type = customer_installment_schedule`.
- Each payment creates one immutable active row in `customer_installment_payment_events`.
- Reversal marks the original event as `reversed` and creates a separate `reversal` event.
- Schedule state is recalculated from original schedule rows plus active events ordered by creation time.

## Recalculation Algorithm

1. Load or initialize the original schedule from the car sale data.
2. Reset each installment to `original_amount`, status `باقي`, and no paid event.
3. Load active payment events by sale/car.
4. For each event:
   - mark the selected installment as `واصل`
   - store `actual_paid_amount`
   - calculate `difference = actual_paid_amount - current_amount`
   - distribute the difference exactly over later unpaid installments
5. Persist final `amount`, `current_amount`, status, and event linkage.

## Reversal Strategy

- The payment event is marked `reversed`.
- A reversal event is inserted for audit history.
- All `financial_ledger` rows with the original `ledger_batch_id` receive reversing ledger rows.
- All `partner_transactions` rows in the batch are marked `is_reversed = 1` and excluded from Qasa/Cash effects.
- The schedule is recalculated from the remaining active events.

## Accounting Entries Affected

Each installment payment batch includes:

- customer payment transaction
- partner cash split rows
- financial ledger rows
- shared `ledger_batch_id`

Reversal reverses the entire batch and prevents partial reversal.

## Frontend Components Changed

- Added Arabic installment payment modal with:
  - `مبلغ القسط الحالي`
  - `المبلغ المدفوع فعلياً`
  - `الفرق`
  - `عدد الأقساط المتبقية التي ستتأثر`
  - `هل سيتم تخفيض الأقساط القادمة أو زيادتها`
  - preview of changed future installments
- Added reversal warning modal explaining Qasa, partner, accounting, and schedule recalculation impacts.
- Installment rows now open the specialized payment/reversal flow instead of the generic transaction edit flow.

## Test Scenarios Executed

Automated Rust tests now cover:

- exact payment
- overpayment
- reverse overpayment
- underpayment
- currency separation
- duplicate payment rejection
- last installment exact/under/over rules
- legacy rebuild test updated to the new event-sourced behavior

Commands run:

- `cargo check`
- `cargo test`
- `npm run build`

## Before/After Behavior

Before:

- payment rows were mutable/deletable side effects
- schedule rows were deleted and recreated from generic payments
- no ledger batch bound all payment effects together
- no preview existed for over/under payment

After:

- payment events are immutable and reversible
- schedule is deterministic from original schedule plus active events
- payment/reversal is atomic inside one SQLite transaction
- each payment has one ledger batch id
- UI previews redistribution before confirmation

## Remaining Risks

- Existing legacy payments that predate the event table remain as historical rows. New installment payments and reversals use the event-sourced path.
- The current project still stores installment projections in `partner_transactions`; a future deeper migration could move original schedules into a dedicated `customer_installments` table while keeping the same event model.
