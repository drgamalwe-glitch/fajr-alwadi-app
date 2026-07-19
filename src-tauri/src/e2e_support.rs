//! Read-only diagnostics compiled only into the dedicated E2E binary.
//!
//! Every mutation in the E2E suite still happens through the visible UI. These
//! commands expose accounting state so tests can assert exact invariants without
//! weakening or expanding the production command surface.

use crate::{
    legacy::{borrower_balance_for_currency, is_borrower_account_kind},
    money::Money,
    AppState,
};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::collections::BTreeMap;
use tauri::State;

#[derive(Serialize)]
pub struct E2eInstallmentSnapshot {
    id: i64,
    due_date: String,
    original_amount: String,
    current_amount: String,
    status: String,
    transaction_type: String,
    legacy_transaction_id: Option<i64>,
    actual_paid_amount: Option<String>,
    paid_event_id: Option<i64>,
}

#[derive(Serialize)]
pub struct E2eCarSnapshot {
    id: i64,
    car_number: String,
    plate_number: String,
    chassis_number: Option<String>,
    car_model: String,
    car_year: String,
    color: String,
    status: String,
    purchase_type: String,
    purchase_price: String,
    selling_price: String,
    payment_type: Option<String>,
    buyer_name: Option<String>,
    amount_paid: Option<String>,
    amount_remaining: Option<String>,
    active_sale_id: Option<i64>,
    active_sale_status: Option<String>,
    active_profit_total: String,
    active_related_transactions: i64,
    reversed_related_transactions: i64,
    active_related_ledger_rows: i64,
    reversed_related_ledger_rows: i64,
    audit_events: i64,
    installments: Vec<E2eInstallmentSnapshot>,
}

#[derive(Serialize)]
pub struct E2eAgencySnapshot {
    id: i64,
    payment_status: String,
    amount_iqd: String,
    amount_usd: String,
    active_transactions: i64,
    reversed_transactions: i64,
    active_ledger_rows: i64,
    reversed_ledger_rows: i64,
    audit_events: i64,
}

#[derive(Serialize)]
pub struct E2eExpenseSnapshot {
    id: i64,
    description: String,
    amount: String,
    currency: String,
    is_reversed: bool,
    reversal_expense_id: Option<i64>,
    active_transactions: i64,
    reversed_transactions: i64,
    active_ledger_rows: i64,
    reversed_ledger_rows: i64,
    audit_events: i64,
}

#[derive(Serialize)]
pub struct E2eAccountTransactionSnapshot {
    id: i64,
    transaction_type: String,
    amount: String,
    currency: String,
    notes: Option<String>,
    source_type: Option<String>,
    source_entity_id: Option<i64>,
    source_role: Option<String>,
    related_source_type: Option<String>,
    related_entity_id: Option<i64>,
    operation_id: Option<String>,
    is_reversed: bool,
    reverses_transaction_id: Option<i64>,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
}

#[derive(Serialize)]
pub struct E2eAccountSnapshot {
    account_id: i64,
    display_name: String,
    kind: String,
    iqd_balance: String,
    usd_balance: String,
    classifications: Vec<String>,
    active_transactions: i64,
    reversed_transactions: i64,
    operation_count: i64,
    ledger_rows: i64,
    ledger_balance_iqd: String,
    ledger_balance_usd: String,
    audit_events: i64,
    transactions: Vec<E2eAccountTransactionSnapshot>,
}

#[derive(Serialize)]
pub struct E2eCarMatchSnapshot {
    id: i64,
    car_number: String,
    plate_number: String,
    chassis_number: Option<String>,
    purchase_price: String,
    purchase_type: String,
    status: String,
    purchase_operation_id: Option<String>,
    active_car_expenses: i64,
}

#[derive(Serialize)]
pub struct E2eCarExpenseRowSnapshot {
    id: i64,
    car_id: i64,
    description: String,
    amount: String,
    currency: String,
    operation_id: String,
    is_reversed: bool,
    reverses_car_expense_id: Option<i64>,
    active_ledger_rows: i64,
    reversed_ledger_rows: i64,
    active_partner_transactions: i64,
    reversed_partner_transactions: i64,
}

#[derive(Serialize)]
pub struct E2eIntegritySnapshot {
    quick_check: String,
    foreign_key_violations: i64,
    unresolved_partner_source_ids: i64,
    unresolved_partner_related_ids: i64,
    unresolved_ledger_reference_ids: i64,
    ledger_balance_iqd: String,
    ledger_balance_usd: String,
    invalid_audit_events: i64,
    duplicate_active_partner_sources: i64,
    unbalanced_operation_currency_groups: i64,
    orphan_operations: i64,
    cars_total: i64,
    active_sales: i64,
    agencies_total: i64,
    cancelled_agencies: i64,
    expenses_total: i64,
    ledger_rows: i64,
    partner_transaction_rows: i64,
}

fn count(db: &rusqlite::Connection, sql: &str, value: i64) -> Result<i64, String> {
    db.query_row(sql, [value], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn sum_money_column<P: rusqlite::Params>(
    db: &rusqlite::Connection,
    sql: &str,
    params: P,
) -> Result<Money, String> {
    let mut statement = db.prepare(sql).map_err(|error| error.to_string())?;
    let values = statement
        .query_map(params, |row| row.get::<_, Money>(0))
        .map_err(|error| error.to_string())?;
    let mut total = Money::zero();
    for value in values {
        total += value.map_err(|error| error.to_string())?;
    }
    Ok(total)
}

fn sum_money_difference<P: rusqlite::Params>(
    db: &rusqlite::Connection,
    sql: &str,
    params: P,
) -> Result<Money, String> {
    let mut statement = db.prepare(sql).map_err(|error| error.to_string())?;
    let values = statement
        .query_map(params, |row| {
            Ok((row.get::<_, Money>(0)?, row.get::<_, Money>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let mut total = Money::zero();
    for value in values {
        let (debit, credit) = value.map_err(|error| error.to_string())?;
        total += debit - credit;
    }
    Ok(total)
}

fn exact_ledger_balance(db: &rusqlite::Connection, currency: &str) -> Result<Money, String> {
    let mut statement = db
        .prepare(
            "SELECT debit,credit FROM financial_ledger
             WHERE currency=?1 AND COALESCE(status,'active')='active'",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([currency], |row| {
            Ok((row.get::<_, Money>(0)?, row.get::<_, Money>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let mut total = Money::zero();
    for row in rows {
        let (debit, credit) = row.map_err(|error| error.to_string())?;
        total += debit - credit;
    }
    Ok(total)
}

fn exact_unbalanced_operation_currency_groups(db: &rusqlite::Connection) -> Result<i64, String> {
    let mut statement = db
        .prepare(
            "SELECT operation_id,currency,debit,credit
             FROM financial_ledger
             WHERE COALESCE(status,'active')='active'
               AND operation_id IS NOT NULL AND TRIM(operation_id)<>''",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Money>(2)?,
                row.get::<_, Money>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut balances = BTreeMap::<(String, String), Money>::new();
    for row in rows {
        let (operation_id, currency, debit, credit) = row.map_err(|error| error.to_string())?;
        *balances
            .entry((operation_id, currency))
            .or_insert_with(Money::zero) += debit - credit;
    }
    Ok(balances
        .into_values()
        .filter(|balance| !balance.is_zero())
        .count() as i64)
}

fn active_account_balance(
    db: &rusqlite::Connection,
    account_id: i64,
    display_name: &str,
    kind: &str,
    currency: &str,
) -> Result<Money, String> {
    if is_borrower_account_kind(kind) {
        let balance = borrower_balance_for_currency(db, Some(display_name), Some(kind), currency)?;
        return Ok(Money(balance.0));
    }

    let mut statement = db
        .prepare(
            "SELECT type,amount
             FROM partner_transactions original
             WHERE original.account_id=?1 AND original.currency=?2
               AND original.reverses_transaction_id IS NULL
               AND COALESCE(original.is_reversed,0)=0
               AND NOT EXISTS (
                   SELECT 1 FROM partner_transactions reversal
                   WHERE reversal.reverses_transaction_id=original.id
               )
             ORDER BY original.id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![account_id, currency], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Money>(1)?))
        })
        .map_err(|error| error.to_string())?;

    let mut balance = Money::zero();
    for row in rows {
        let (transaction_type, amount) = row.map_err(|error| error.to_string())?;
        if transaction_type.starts_with("ايداع")
            || transaction_type.starts_with("إيداع")
            || transaction_type.starts_with("مقدمة")
            || transaction_type.starts_with("استلام")
            || transaction_type.starts_with("إستلام")
            || transaction_type.starts_with("إعادة استثمار")
            || transaction_type.starts_with("تسوية")
            || transaction_type.starts_with("تسديد")
        {
            balance -= amount;
        } else if transaction_type.starts_with("سحب") || transaction_type.starts_with("باقي")
        {
            balance += amount;
        }
    }
    Ok(balance)
}

fn account_ledger_balance(
    db: &rusqlite::Connection,
    account_id: i64,
    currency: &str,
) -> Result<Money, String> {
    sum_money_difference(
        db,
        "SELECT debit,credit
         FROM financial_ledger original
         WHERE original.account_id_v2=?1 AND original.currency=?2
           AND COALESCE(original.status,'active')='active'
           AND original.reverses_ledger_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM financial_ledger reversal
               WHERE reversal.reverses_ledger_id=original.id
           )",
        params![account_id, currency],
    )
}

#[tauri::command]
pub fn e2e_car_snapshot(
    state: State<AppState>,
    plate_number: String,
) -> Result<E2eCarSnapshot, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let (
        id,
        car_number,
        plate_number,
        chassis_number,
        car_model,
        car_year,
        color,
        status,
        purchase_type,
        purchase_price,
        selling_price,
        payment_type,
        buyer_name,
        amount_paid,
        amount_remaining,
        active_sale_id,
    ): (
        i64,
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
    ) = db
        .query_row(
            "SELECT id,car_number,COALESCE(car_plate_num,car_number),chassis_number,
                    COALESCE(car_model,car_name),COALESCE(car_year,''),COALESCE(color,''),
                    status,COALESCE(purchase_type,'كاش'),purchase_price,selling_price,
                    payment_type,buyer_name,amount_paid,amount_remaining,active_sale_id
             FROM cars
             WHERE COALESCE(car_plate_num,car_number)=?1
             ORDER BY id DESC LIMIT 1",
            [plate_number.trim()],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                    row.get(11)?,
                    row.get(12)?,
                    row.get(13)?,
                    row.get(14)?,
                    row.get(15)?,
                ))
            },
        )
        .map_err(|_| format!("لا توجد سيارة اختبار باللوحة {}", plate_number.trim()))?;

    let active_sale_status = active_sale_id
        .map(|sale_id| {
            db.query_row(
                "SELECT status FROM car_sales WHERE id=?1",
                [sale_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())
        })
        .transpose()?;

    let active_profit_total = sum_money_column(
        &db,
        "SELECT original.amount
         FROM partner_transactions original
         WHERE original.related_source_type='car' AND original.related_entity_id=?1
           AND original.affects_profit=1 AND COALESCE(original.is_reversed,0)=0
           AND original.reverses_transaction_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM partner_transactions reversal
               WHERE reversal.reverses_transaction_id=original.id
           )",
        [id],
    )?
    .to_string();

    let active_related_transactions = count(
        &db,
        "SELECT COUNT(*) FROM partner_transactions original
         WHERE original.reverses_transaction_id IS NULL
           AND COALESCE(original.is_reversed,0)=0
           AND (
               (original.related_source_type='car' AND original.related_entity_id=?1)
               OR (original.source_type='car_purchase' AND original.source_entity_id=?1)
               OR original.sale_id IN (SELECT id FROM car_sales WHERE car_id=?1)
               OR original.operation_id IN (
                   SELECT purchase_operation_id FROM cars WHERE id=?1
                   UNION SELECT operation_id FROM car_sales WHERE car_id=?1
                   UNION SELECT operation_id FROM car_expenses WHERE car_id=?1
               )
           )
           AND NOT EXISTS (
               SELECT 1 FROM partner_transactions reversal
               WHERE reversal.reverses_transaction_id=original.id
           )",
        id,
    )?;
    let reversed_related_transactions = count(
        &db,
        "SELECT COUNT(*) FROM partner_transactions original
         WHERE original.reverses_transaction_id IS NULL
           AND (
               (original.related_source_type='car' AND original.related_entity_id=?1)
               OR (original.source_type='car_purchase' AND original.source_entity_id=?1)
               OR original.sale_id IN (SELECT id FROM car_sales WHERE car_id=?1)
               OR original.operation_id IN (
                   SELECT purchase_operation_id FROM cars WHERE id=?1
                   UNION SELECT operation_id FROM car_sales WHERE car_id=?1
                   UNION SELECT operation_id FROM car_expenses WHERE car_id=?1
               )
           )
           AND (
               COALESCE(original.is_reversed,0)=1
               OR EXISTS (
                   SELECT 1 FROM partner_transactions reversal
                   WHERE reversal.reverses_transaction_id=original.id
               )
           )",
        id,
    )?;
    let active_related_ledger_rows = count(
        &db,
        "SELECT COUNT(*) FROM financial_ledger original
         WHERE original.reverses_ledger_id IS NULL
           AND (
               (original.reference_type='car' AND original.reference_entity_id=?1)
               OR original.sale_id IN (SELECT id FROM car_sales WHERE car_id=?1)
               OR original.operation_id IN (
                   SELECT purchase_operation_id FROM cars WHERE id=?1
                   UNION SELECT operation_id FROM car_sales WHERE car_id=?1
                   UNION SELECT operation_id FROM car_expenses WHERE car_id=?1
               )
           )
           AND NOT EXISTS (
               SELECT 1 FROM financial_ledger reversal
               WHERE reversal.reverses_ledger_id=original.id
           )",
        id,
    )?;
    let reversed_related_ledger_rows = count(
        &db,
        "SELECT COUNT(*) FROM financial_ledger original
         WHERE original.reverses_ledger_id IS NULL
           AND (
               (original.reference_type='car' AND original.reference_entity_id=?1)
               OR original.sale_id IN (SELECT id FROM car_sales WHERE car_id=?1)
               OR original.operation_id IN (
                   SELECT purchase_operation_id FROM cars WHERE id=?1
                   UNION SELECT operation_id FROM car_sales WHERE car_id=?1
                   UNION SELECT operation_id FROM car_expenses WHERE car_id=?1
               )
           )
           AND EXISTS (
               SELECT 1 FROM financial_ledger reversal
               WHERE reversal.reverses_ledger_id=original.id
           )",
        id,
    )?;
    let audit_events = count(
        &db,
        "SELECT COUNT(*) FROM audit_log
         WHERE entity_type='car' AND entity_id_numeric=?1",
        id,
    )?;

    let mut installments = Vec::new();
    let mut statement = db
        .prepare(
            "SELECT i.id,i.due_date,i.original_amount,i.current_amount,i.status,
                    COALESCE(pt.type,''),i.legacy_transaction_id,
                    pt.actual_paid_amount,pt.paid_event_id
             FROM installments i
             JOIN car_sales cs ON cs.id=i.sale_id
             LEFT JOIN partner_transactions pt ON pt.id=i.legacy_transaction_id
             WHERE cs.car_id=?1
               AND i.status NOT IN ('reversed','cancelled')
             ORDER BY i.due_date,i.id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([id], |row| {
            Ok(E2eInstallmentSnapshot {
                id: row.get(0)?,
                due_date: row.get(1)?,
                original_amount: row.get(2)?,
                current_amount: row.get(3)?,
                status: row.get(4)?,
                transaction_type: row.get(5)?,
                legacy_transaction_id: row.get(6)?,
                actual_paid_amount: row.get(7)?,
                paid_event_id: row.get(8)?,
            })
        })
        .map_err(|error| error.to_string())?;
    for row in rows {
        installments.push(row.map_err(|error| error.to_string())?);
    }

    Ok(E2eCarSnapshot {
        id,
        car_number,
        plate_number,
        chassis_number,
        car_model,
        car_year,
        color,
        status,
        purchase_type,
        purchase_price,
        selling_price,
        payment_type,
        buyer_name,
        amount_paid,
        amount_remaining,
        active_sale_id,
        active_sale_status,
        active_profit_total,
        active_related_transactions,
        reversed_related_transactions,
        active_related_ledger_rows,
        reversed_related_ledger_rows,
        audit_events,
        installments,
    })
}

#[tauri::command]
pub fn e2e_agency_snapshot(
    state: State<AppState>,
    agency_id: i64,
) -> Result<E2eAgencySnapshot, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let (payment_status, amount_iqd, amount_usd): (String, String, String) = db
        .query_row(
            "SELECT payment_status,amount_iqd,amount_usd FROM agencies WHERE id=?1",
            [agency_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| error.to_string())?;
    let source_count = |reversed: bool| -> Result<i64, String> {
        db.query_row(
            if reversed {
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type='agency' AND source_entity_id=?1
                   AND (COALESCE(is_reversed,0)=1 OR reverses_transaction_id IS NOT NULL)"
            } else {
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type='agency' AND source_entity_id=?1
                   AND COALESCE(is_reversed,0)=0 AND reverses_transaction_id IS NULL"
            },
            [agency_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
    };
    Ok(E2eAgencySnapshot {
        id: agency_id,
        payment_status,
        amount_iqd,
        amount_usd,
        active_transactions: source_count(false)?,
        reversed_transactions: source_count(true)?,
        active_ledger_rows: count(
            &db,
            "SELECT COUNT(*) FROM financial_ledger original
             WHERE original.reference_type='agency' AND original.reference_entity_id=?1
               AND original.reverses_ledger_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM financial_ledger reversal
                   WHERE reversal.reverses_ledger_id=original.id
               )",
            agency_id,
        )?,
        reversed_ledger_rows: count(
            &db,
            "SELECT COUNT(*) FROM financial_ledger original
             WHERE original.reference_type='agency' AND original.reference_entity_id=?1
               AND original.reverses_ledger_id IS NULL
               AND EXISTS (
                   SELECT 1 FROM financial_ledger reversal
                   WHERE reversal.reverses_ledger_id=original.id
               )",
            agency_id,
        )?,
        audit_events: count(
            &db,
            "SELECT COUNT(*) FROM audit_log
             WHERE entity_type='agency' AND entity_id_numeric=?1",
            agency_id,
        )?,
    })
}

#[tauri::command]
pub fn e2e_expense_snapshot(
    state: State<AppState>,
    description: String,
) -> Result<E2eExpenseSnapshot, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let (id, description, amount, currency, is_reversed, _reversal_operation_id): (
        i64,
        String,
        String,
        String,
        i64,
        Option<String>,
    ) = db
        .query_row(
            "SELECT id,description,amount,COALESCE(currency,'IQD'),
                    COALESCE(is_reversed,0),reversal_operation_id
             FROM expenses WHERE description=?1 AND reverses_expense_id IS NULL
             ORDER BY id DESC LIMIT 1",
            [description.trim()],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .map_err(|error| error.to_string())?;
    let reversal_expense_id = db
        .query_row(
            "SELECT id FROM expenses WHERE reverses_expense_id=?1 ORDER BY id DESC LIMIT 1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let tx_count = |reversed: bool| -> Result<i64, String> {
        db.query_row(
            if reversed {
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type='expense' AND source_entity_id=?1
                   AND (COALESCE(is_reversed,0)=1 OR reverses_transaction_id IS NOT NULL)"
            } else {
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type='expense' AND source_entity_id=?1
                   AND COALESCE(is_reversed,0)=0 AND reverses_transaction_id IS NULL"
            },
            [id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
    };
    Ok(E2eExpenseSnapshot {
        id,
        description,
        amount,
        currency,
        is_reversed: is_reversed != 0,
        reversal_expense_id,
        active_transactions: tx_count(false)?,
        reversed_transactions: tx_count(true)?,
        active_ledger_rows: count(
            &db,
            "SELECT COUNT(*) FROM financial_ledger original
             WHERE original.reference_type='expense' AND original.reference_entity_id=?1
               AND original.reverses_ledger_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM financial_ledger reversal
                   WHERE reversal.reverses_ledger_id=original.id
               )",
            id,
        )?,
        reversed_ledger_rows: count(
            &db,
            "SELECT COUNT(*) FROM financial_ledger original
             WHERE original.reference_type='expense' AND original.reference_entity_id=?1
               AND original.reverses_ledger_id IS NULL
               AND EXISTS (
                   SELECT 1 FROM financial_ledger reversal
                   WHERE reversal.reverses_ledger_id=original.id
               )",
            id,
        )?,
        audit_events: count(
            &db,
            "SELECT COUNT(*) FROM audit_log
             WHERE entity_type='expense' AND entity_id_numeric=?1",
            id,
        )?,
    })
}

#[tauri::command]
pub fn e2e_account_snapshot(
    state: State<AppState>,
    name: String,
    kind: String,
) -> Result<E2eAccountSnapshot, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let (account_id, display_name, account_kind): (i64, String, String) = db
        .query_row(
            "SELECT a.id,a.display_name,a.account_type
             FROM accounts a
             JOIN partners p ON p.account_id=a.id
             WHERE p.partner_name=?1 AND p.kind=?2",
            params![name.trim(), kind.trim()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| {
            format!(
                "لا يوجد حساب اختبار باسم {} ونوع {}",
                name.trim(),
                kind.trim()
            )
        })?;

    let iqd_balance = active_account_balance(&db, account_id, &display_name, &account_kind, "IQD")?;
    let usd_balance = active_account_balance(&db, account_id, &display_name, &account_kind, "USD")?;
    let zero = Money::zero();
    let mut classifications = Vec::new();
    if iqd_balance == zero && usd_balance == zero {
        classifications.push("العملاء".to_string());
    }
    if iqd_balance > zero || usd_balance > zero {
        classifications.push("نطلب".to_string());
    }
    if iqd_balance < zero || usd_balance < zero {
        classifications.push("مطلوبين".to_string());
    }

    let mut statement = db
        .prepare(
            "SELECT id,type,amount,COALESCE(currency,'IQD'),notes,source_type,source_entity_id,
                    source_role,related_source_type,related_entity_id,operation_id,
                    COALESCE(is_reversed,0),reverses_transaction_id,
                    COALESCE(affects_qasa,0),COALESCE(affects_partner_cash,0),
                    COALESCE(affects_profit,0)
             FROM partner_transactions
             WHERE account_id=?1
             ORDER BY id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([account_id], |row| {
            Ok(E2eAccountTransactionSnapshot {
                id: row.get(0)?,
                transaction_type: row.get(1)?,
                amount: row.get(2)?,
                currency: row.get(3)?,
                notes: row.get(4)?,
                source_type: row.get(5)?,
                source_entity_id: row.get(6)?,
                source_role: row.get(7)?,
                related_source_type: row.get(8)?,
                related_entity_id: row.get(9)?,
                operation_id: row.get(10)?,
                is_reversed: row.get::<_, i64>(11)? != 0,
                reverses_transaction_id: row.get(12)?,
                affects_qasa: row.get::<_, i64>(13)? != 0,
                affects_partner_cash: row.get::<_, i64>(14)? != 0,
                affects_profit: row.get::<_, i64>(15)? != 0,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut transactions = Vec::new();
    for row in rows {
        transactions.push(row.map_err(|error| error.to_string())?);
    }

    Ok(E2eAccountSnapshot {
        account_id,
        display_name,
        kind: account_kind,
        iqd_balance: iqd_balance.to_string(),
        usd_balance: usd_balance.to_string(),
        classifications,
        active_transactions: count(
            &db,
            "SELECT COUNT(*) FROM partner_transactions original
             WHERE original.account_id=?1
               AND original.reverses_transaction_id IS NULL
               AND COALESCE(original.is_reversed,0)=0
               AND NOT EXISTS (
                   SELECT 1 FROM partner_transactions reversal
                   WHERE reversal.reverses_transaction_id=original.id
               )",
            account_id,
        )?,
        reversed_transactions: count(
            &db,
            "SELECT COUNT(*) FROM partner_transactions original
             WHERE original.account_id=?1 AND (
                 original.reverses_transaction_id IS NOT NULL
                 OR COALESCE(original.is_reversed,0)=1
                 OR EXISTS (
                     SELECT 1 FROM partner_transactions reversal
                     WHERE reversal.reverses_transaction_id=original.id
                 )
             )",
            account_id,
        )?,
        operation_count: count(
            &db,
            "SELECT COUNT(DISTINCT operation_id) FROM partner_transactions
             WHERE account_id=?1 AND operation_id IS NOT NULL",
            account_id,
        )?,
        ledger_rows: count(
            &db,
            "SELECT COUNT(*) FROM financial_ledger WHERE account_id_v2=?1",
            account_id,
        )?,
        ledger_balance_iqd: account_ledger_balance(&db, account_id, "IQD")?.to_string(),
        ledger_balance_usd: account_ledger_balance(&db, account_id, "USD")?.to_string(),
        audit_events: count(
            &db,
            "SELECT COUNT(*) FROM audit_log
             WHERE account_id=?1 OR operation_id IN (
                 SELECT operation_id FROM partner_transactions WHERE account_id=?1
             )",
            account_id,
        )?,
        transactions,
    })
}

#[tauri::command]
pub fn e2e_car_matches(
    state: State<AppState>,
    plate_number: Option<String>,
    chassis_number: Option<String>,
    plate_prefix: Option<String>,
) -> Result<Vec<E2eCarMatchSnapshot>, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let plate = plate_number.as_deref().map(str::trim).unwrap_or("");
    let chassis = chassis_number.as_deref().map(str::trim).unwrap_or("");
    let prefix = plate_prefix.as_deref().map(str::trim).unwrap_or("");
    if plate.is_empty() && chassis.is_empty() && prefix.is_empty() {
        return Err("يجب تحديد لوحة أو شاصي أو بادئة لوحة للتحقق".to_string());
    }

    let mut statement = db
        .prepare(
            "SELECT c.id,c.car_number,COALESCE(c.car_plate_num,c.car_number),
                    c.chassis_number,c.purchase_price,COALESCE(c.purchase_type,'كاش'),
                    c.status,c.purchase_operation_id,
                    (SELECT COUNT(*) FROM car_expenses ce
                     WHERE ce.car_id=c.id AND COALESCE(ce.is_reversed,0)=0
                       AND ce.reverses_car_expense_id IS NULL
                       AND NOT EXISTS (
                           SELECT 1 FROM car_expenses reversal
                           WHERE reversal.reverses_car_expense_id=ce.id
                       ))
             FROM cars c
             WHERE (?1<>'' AND COALESCE(c.car_plate_num,c.car_number)=?1)
                OR (?2<>'' AND COALESCE(c.chassis_number,'')=?2)
                OR (?3<>'' AND COALESCE(c.car_plate_num,c.car_number) LIKE ?3 || '%')
             ORDER BY c.id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![plate, chassis, prefix], |row| {
            Ok(E2eCarMatchSnapshot {
                id: row.get(0)?,
                car_number: row.get(1)?,
                plate_number: row.get(2)?,
                chassis_number: row.get(3)?,
                purchase_price: row.get(4)?,
                purchase_type: row.get(5)?,
                status: row.get(6)?,
                purchase_operation_id: row.get(7)?,
                active_car_expenses: row.get(8)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn e2e_car_expense_snapshot(
    state: State<AppState>,
    car_id: i64,
) -> Result<Vec<E2eCarExpenseRowSnapshot>, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let mut statement = db
        .prepare(
            "SELECT id,car_id,description,amount,COALESCE(currency,'IQD'),operation_id,
                    COALESCE(is_reversed,0),reverses_car_expense_id
             FROM car_expenses
             WHERE car_id=?1
             ORDER BY id",
        )
        .map_err(|error| error.to_string())?;
    let base_rows = statement
        .query_map([car_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)? != 0,
                row.get::<_, Option<i64>>(7)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(statement);

    let mut snapshots = Vec::with_capacity(base_rows.len());
    for (id, row_car_id, description, amount, currency, operation_id, is_reversed, reverses_id) in
        base_rows
    {
        snapshots.push(E2eCarExpenseRowSnapshot {
            id,
            car_id: row_car_id,
            description,
            amount,
            currency,
            operation_id,
            is_reversed,
            reverses_car_expense_id: reverses_id,
            active_ledger_rows: count(
                &db,
                "SELECT COUNT(*) FROM financial_ledger original
                 WHERE original.reference_type='car_expense'
                   AND original.reference_entity_id=?1
                   AND original.reverses_ledger_id IS NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM financial_ledger reversal
                       WHERE reversal.reverses_ledger_id=original.id
                   )",
                id,
            )?,
            reversed_ledger_rows: count(
                &db,
                "SELECT COUNT(*) FROM financial_ledger original
                 WHERE original.reference_type='car_expense'
                   AND original.reference_entity_id=?1
                   AND (
                       original.reverses_ledger_id IS NOT NULL
                       OR EXISTS (
                           SELECT 1 FROM financial_ledger reversal
                           WHERE reversal.reverses_ledger_id=original.id
                       )
                   )",
                id,
            )?,
            active_partner_transactions: count(
                &db,
                "SELECT COUNT(*) FROM partner_transactions original
                 WHERE original.source_type='car_expense'
                   AND original.source_entity_id=?1
                   AND original.reverses_transaction_id IS NULL
                   AND COALESCE(original.is_reversed,0)=0
                   AND NOT EXISTS (
                       SELECT 1 FROM partner_transactions reversal
                       WHERE reversal.reverses_transaction_id=original.id
                   )",
                id,
            )?,
            reversed_partner_transactions: count(
                &db,
                "SELECT COUNT(*) FROM partner_transactions original
                 WHERE original.source_type='car_expense'
                   AND original.source_entity_id=?1
                   AND (
                       original.reverses_transaction_id IS NOT NULL
                       OR COALESCE(original.is_reversed,0)=1
                       OR EXISTS (
                           SELECT 1 FROM partner_transactions reversal
                           WHERE reversal.reverses_transaction_id=original.id
                       )
                   )",
                id,
            )?,
        });
    }
    Ok(snapshots)
}

#[tauri::command]
pub fn e2e_integrity_snapshot(state: State<AppState>) -> Result<E2eIntegritySnapshot, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let quick_check = db
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let scalar = |sql: &str| -> Result<i64, String> {
        db.query_row(sql, [], |row| row.get(0))
            .map_err(|error| error.to_string())
    };
    Ok(E2eIntegritySnapshot {
        quick_check,
        foreign_key_violations: scalar("SELECT COUNT(*) FROM pragma_foreign_key_check")?,
        unresolved_partner_source_ids: scalar(
            "SELECT COUNT(*) FROM partner_transactions original
             WHERE TRIM(COALESCE(original.source_type,''))<>''
               AND COALESCE(original.is_reversed,0)=0
               AND original.reverses_transaction_id IS NULL
               AND original.source_entity_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM partner_transactions reversal
                   WHERE reversal.reverses_transaction_id=original.id
               )",
        )?,
        unresolved_partner_related_ids: scalar(
            "SELECT COUNT(*) FROM partner_transactions original
             WHERE TRIM(COALESCE(original.related_source_type,''))<>''
               AND COALESCE(original.is_reversed,0)=0
               AND original.reverses_transaction_id IS NULL
               AND original.related_entity_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM partner_transactions reversal
                   WHERE reversal.reverses_transaction_id=original.id
               )",
        )?,
        unresolved_ledger_reference_ids: scalar(
            "SELECT COUNT(*) FROM financial_ledger original
             WHERE TRIM(COALESCE(original.reference_type,''))<>''
               AND COALESCE(original.status,'active')='active'
               AND original.reverses_ledger_id IS NULL
               AND original.reference_entity_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM financial_ledger reversal
                   WHERE reversal.reverses_ledger_id=original.id
               )",
        )?,
        ledger_balance_iqd: exact_ledger_balance(&db, "IQD")?.to_string(),
        ledger_balance_usd: exact_ledger_balance(&db, "USD")?.to_string(),
        invalid_audit_events: scalar(
            "SELECT COUNT(*) FROM audit_log
             WHERE actor_user_id IS NULL OR TRIM(COALESCE(entity_type,''))=''
                OR TRIM(COALESCE(action,''))='' OR TRIM(COALESCE(occurred_at,''))=''
                OR schema_version<>50
                OR COALESCE(session_id,'')<>COALESCE(session_fingerprint,'')",
        )?,
        duplicate_active_partner_sources: scalar(
            "SELECT COUNT(*) FROM (
                SELECT source_type,source_entity_id,source_role,partner_name,kind,currency,
                       COALESCE(related_entity_id,-1),COUNT(*) AS copies
                FROM partner_transactions
                WHERE COALESCE(is_reversed,0)=0 AND reverses_transaction_id IS NULL
                  AND source_type IS NOT NULL AND source_entity_id IS NOT NULL
                  AND source_role IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM partner_transactions reversal
                      WHERE reversal.reverses_transaction_id=partner_transactions.id
                  )
                GROUP BY source_type,source_entity_id,source_role,partner_name,kind,currency,
                         COALESCE(related_entity_id,-1)
                HAVING copies>1
             )",
        )?,
        unbalanced_operation_currency_groups: exact_unbalanced_operation_currency_groups(&db)?,
        orphan_operations: scalar(
            "SELECT COUNT(*) FROM operations o
             WHERE NOT EXISTS (SELECT 1 FROM financial_ledger l WHERE l.operation_id=o.id)
               AND NOT EXISTS (SELECT 1 FROM partner_transactions pt WHERE pt.operation_id=o.id)
               AND NOT EXISTS (SELECT 1 FROM cars c WHERE c.purchase_operation_id=o.id)
               AND NOT EXISTS (SELECT 1 FROM car_sales cs WHERE cs.operation_id=o.id)
               AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.operation_id=o.id)
               AND NOT EXISTS (SELECT 1 FROM car_expenses ce WHERE ce.operation_id=o.id)
               AND NOT EXISTS (SELECT 1 FROM agencies a WHERE a.operation_id=o.id)
               AND NOT EXISTS (SELECT 1 FROM agency_transactions at WHERE at.operation_id=o.id)
               AND NOT EXISTS (
                   SELECT 1 FROM customer_installment_payment_events ipe
                   WHERE ipe.operation_id=o.id
               )
               AND NOT EXISTS (SELECT 1 FROM audit_log al WHERE al.operation_id=o.id)",
        )?,
        cars_total: scalar("SELECT COUNT(*) FROM cars")?,
        active_sales: scalar("SELECT COUNT(*) FROM car_sales WHERE status='active'")?,
        agencies_total: scalar("SELECT COUNT(*) FROM agencies")?,
        cancelled_agencies: scalar("SELECT COUNT(*) FROM agencies WHERE payment_status='محذوفة'")?,
        expenses_total: scalar("SELECT COUNT(*) FROM expenses")?,
        ledger_rows: scalar("SELECT COUNT(*) FROM financial_ledger")?,
        partner_transaction_rows: scalar("SELECT COUNT(*) FROM partner_transactions")?,
    })
}
