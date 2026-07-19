//! `ledger` — legacy/mod.rs lines 3976–6592
use super::*;

#[allow(clippy::too_many_arguments)]
pub fn record_ledger_entry(
    conn: &Connection,
    date: &str,
    time: &str,
    account_type: &str,
    account_id: Option<&str>,
    debit: Money,
    credit: Money,
    currency: &str,
    reference_type: &str,
    reference_id: &str,
    type_: &str,
    description: &str,
    notes: Option<&str>,
) -> Result<(), String> {
    validate_ledger_amounts(debit, credit)?;
    validate_currency(currency)?;
    let reference_entity_id = reference_id
        .trim()
        .parse::<i64>()
        .map_err(|_| format!("مرجع القيد {reference_type} يجب أن يكون معرّفاً رقمياً"))?;
    conn.execute(
        "INSERT INTO financial_ledger (
            date, time, account_type, account_id, debit, credit, currency,
            reference_type, reference_id, reference_entity_id, type_, description, notes
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            date.trim(),
            time.trim(),
            account_type.trim(),
            account_id.map(|s| s.trim()),
            debit,
            credit,
            currency.trim(),
            reference_type.trim(),
            reference_id.trim(),
            reference_entity_id,
            type_.trim(),
            description.trim(),
            notes.map(|s| s.trim()),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reverse_ledger_entries(
    conn: &Connection,
    reference_type: &str,
    reference_id: &str,
) -> Result<(), String> {
    let reference_entity_id = reference_id
        .trim()
        .parse::<i64>()
        .map_err(|_| format!("مرجع العكس {reference_type} يجب أن يكون معرّفاً رقمياً"))?;
    let (reversal_date, reversal_time) = now_datetime();
    // FORENSIC FIX (re-audit 2026-07-11, FORENSIC-RUST-1-8):
    // The previous deduplication checked whether a reversal entry with the
    // same (account_type, account_id, debit, credit, currency, type_) already
    // exists. This is fundamentally wrong because:
    //   1. Two different original entries can have the same account/amount/type
    //      but different rowids — both need their own reversal.
    //   2. If `record_partner_ledger_entries` is called again (e.g. via
    //      `update_agency`, `update_partner_transaction`, or
    //      `set_agency_receivable_status`), it re-creates the original entries,
    //      and then `reverse_ledger_entries` would skip creating the matching
    //      reversal (because a reversal already exists from a prior call),
    //      leaving the ledger with DUPLICATE original entries and only ONE
    //      set of reversals — inflating the ledger balance.
    //
    // Fix: track reversals by the original entry's rowid. Each original entry
    // gets exactly one reversal, identified by a `reverses_ledger_id` link.
    // If the original entry is deleted and re-created, it gets a new rowid,
    // so the new entry's reversal is correctly created.
    //
    // We use a description marker `عكس:rowid=<N>` to link the reversal to the
    // original entry's rowid. This is forward-compatible with existing data
    // (old reversals without the marker are still detected by the type_ prefix).

    let mut stmt = conn
        .prepare(
            "SELECT id, date, time, account_type, account_id, debit, credit, currency, type_, description, notes
             FROM financial_ledger
             WHERE reference_type = ?1 AND reference_entity_id = ?2
               AND type_ NOT LIKE 'عكس:%'
               AND type_ NOT LIKE 'عكس: %'",
        )
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map(params![reference_type.trim(), reference_entity_id], |row| {
            Ok((
                row.get::<_, i64>(0)?, // id (rowid)
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Money>(5)?,
                row.get::<_, Money>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, Option<String>>(10)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    for (
        orig_id,
        _orig_date,
        _orig_time,
        account_type,
        account_id,
        debit,
        credit,
        currency,
        type_,
        description,
        notes,
    ) in entries
    {
        let rev_debit = credit;
        let rev_credit = debit;
        let rev_type = format!("عكس: {}", type_);
        let rev_desc = format!("عكس: {}", description);

        // Check if THIS specific original entry (by rowid) has already been
        // reversed. This is a 1:1 link, not a fuzzy match.
        let already_reversed: bool = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM financial_ledger
                    WHERE reverses_ledger_id = ?1
                )",
                params![orig_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if already_reversed {
            continue;
        }

        conn.execute(
            "INSERT INTO financial_ledger (
                date, time, account_type, account_id, debit, credit, currency,
                reference_type, reference_id, reference_entity_id, type_, description, notes,
                reverses_ledger_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                reversal_date,
                reversal_time,
                account_type,
                account_id.as_deref(),
                rev_debit,
                rev_credit,
                currency,
                reference_type,
                reference_id,
                reference_entity_id,
                rev_type,
                rev_desc,
                notes.as_deref(),
                orig_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Appends a compensating expense row and reverses every accounting projection
/// linked to the original expense. Runtime rebuilds must use this helper instead
/// of physically deleting an expense that has already been posted.
pub fn append_expense_reversal(
    conn: &Connection,
    expense_id: i64,
    reason: &str,
) -> Result<i64, String> {
    if let Some(reversal_id) = conn
        .query_row(
            "SELECT id FROM expenses WHERE reverses_expense_id=?1",
            [expense_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(reversal_id);
    }

    type ExpenseReversalRow = (
        String,
        Money,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        String,
        i64,
    );
    let (
        description,
        amount,
        notes,
        currency,
        source_type,
        source_id,
        source_role,
        car_number,
        car_id,
        original_operation_id,
        version,
    ): ExpenseReversalRow = conn
        .query_row(
            "SELECT description,amount,notes,COALESCE(currency,'IQD'),source_type,
                    source_id,source_role,car_number,car_id,operation_id,version
             FROM expenses
             WHERE id=?1 AND reverses_expense_id IS NULL AND COALESCE(is_reversed,0)=0",
            [expense_id],
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
                ))
            },
        )
        .map_err(|_| "المصروف المطلوب عكسه غير موجود أو معكوس مسبقاً".to_string())?;

    let reversal_operation_id = new_ledger_token("expense_rebuild_reversal");
    conn.execute(
        "INSERT INTO operations(id,operation_type,status,reverses_operation_id)
         VALUES (?1,'expense_reversal','active',?2)",
        params![reversal_operation_id, original_operation_id],
    )
    .map_err(|e| e.to_string())?;

    append_partner_transaction_reversals_by_source(
        conn,
        "expense",
        &expense_id.to_string(),
        "cash_payment",
        &reversal_operation_id,
    )?;
    reverse_ledger_entries(conn, "expense", &expense_id.to_string())?;
    conn.execute(
        "UPDATE financial_ledger
         SET operation_id=?1
         WHERE reference_type='expense' AND reference_id=?2
           AND reverses_ledger_id IS NOT NULL AND operation_id IS NULL",
        params![reversal_operation_id, expense_id.to_string()],
    )
    .map_err(|e| e.to_string())?;

    let (date, time) = now_datetime();
    let reversal_notes = match notes {
        Some(value) => Some(format!("عكس: {value} | السبب: {}", reason.trim())),
        None => Some(format!("السبب: {}", reason.trim())),
    };
    conn.execute(
        "INSERT INTO expenses
         (description,amount,date,time,notes,currency,source_type,source_id,source_role,
          car_number,car_id,operation_id,reverses_expense_id,version)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,1)",
        params![
            format!("عكس: {description}"),
            -amount,
            date,
            time,
            reversal_notes,
            currency,
            source_type,
            source_id,
            source_role,
            car_number,
            car_id,
            reversal_operation_id,
            expense_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let reversal_expense_id = conn.last_insert_rowid();

    let updated = conn
        .execute(
            "UPDATE expenses
             SET is_reversed=1,reversal_operation_id=?1,version=version+1
             WHERE id=?2 AND version=?3 AND COALESCE(is_reversed,0)=0",
            params![reversal_operation_id, expense_id, version],
        )
        .map_err(|e| e.to_string())?;
    if updated != 1 {
        return Err("تعارض إصدار المصروف أثناء العكس".to_string());
    }
    conn.execute(
        "UPDATE operations SET reversal_operation_id=?1 WHERE id=?2",
        params![reversal_operation_id, original_operation_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(reversal_expense_id)
}

pub fn append_partner_transaction_reversals_by_source(
    conn: &Connection,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    reversal_operation_id: &str,
) -> Result<usize, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id,partner_name,kind,type,amount,notes,currency,payment_type,
                    source_role,affects_qasa,affects_partner_cash,affects_profit,
                    related_source_type,related_source_id,account_id,sale_id
             FROM partner_transactions original
             WHERE source_type=?1 AND source_id=?2 AND source_role=?3
               AND COALESCE(is_reversed,0)=0
               AND NOT EXISTS (SELECT 1 FROM partner_transactions reversal
                               WHERE reversal.reverses_transaction_id=original.id)",
        )
        .map_err(|e| e.to_string())?;
    type SourceRow = (
        i64,
        String,
        String,
        String,
        Money,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        i64,
        i64,
        i64,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<i64>,
    );
    let rows: Vec<SourceRow> = stmt
        .query_map(params![source_type, source_id, source_role], |row| {
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
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let (date, time) = now_datetime();
    for (
        original_id,
        partner_name,
        kind,
        tx_type,
        amount,
        notes,
        currency,
        payment_type,
        original_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
        related_source_type,
        related_source_id,
        account_id,
        sale_id,
    ) in &rows
    {
        reverse_ledger_entries(conn, "partner_transaction", &original_id.to_string())?;
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name,kind,type,amount,date,time,notes,currency,payment_type,
              source_type,source_id,source_role,affects_qasa,affects_partner_cash,
              affects_profit,related_source_type,related_source_id,account_id,sale_id,
               operation_id,reverses_transaction_id,is_reversed)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,
                     ?16,?17,?18,?19,?20,?21,1)",
            params![
                partner_name,
                kind,
                tx_type,
                -*amount,
                date,
                time,
                notes.as_deref().map(|value| format!("عكس: {value}")),
                currency,
                payment_type,
                format!("{source_type}_reversal"),
                source_id,
                format!("{original_role}_reversal"),
                affects_qasa,
                affects_partner_cash,
                affects_profit,
                related_source_type,
                related_source_id,
                account_id,
                sale_id,
                reversal_operation_id,
                original_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE partner_transactions
             SET is_reversed=1,status='reversed'
             WHERE id=?1 AND COALESCE(is_reversed,0)=0",
            [original_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(rows.len())
}

pub fn append_partner_transaction_reversal_by_id(
    conn: &Connection,
    original_id: i64,
    reversal_note: &str,
) -> Result<bool, String> {
    let already_reversed: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM partner_transactions
                           WHERE reverses_transaction_id=?1)",
            [original_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if already_reversed {
        return Ok(false);
    }
    type ReversalRow = (
        String,
        String,
        String,
        Money,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        i64,
        i64,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
        Option<i64>,
    );
    let row: ReversalRow = conn
        .query_row(
            "SELECT partner_name,kind,type,amount,notes,currency,payment_type,
                    source_type,source_role,affects_qasa,affects_partner_cash,
                    affects_profit,related_source_type,related_source_id,account_id,
                    operation_id,sale_id
             FROM partner_transactions WHERE id=?1",
            [original_id],
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
                    row.get(16)?,
                ))
            },
        )
        .map_err(|error| error.to_string())?;
    reverse_ledger_entries(conn, "partner_transaction", &original_id.to_string())?;
    let (date, time) = now_datetime();
    conn.execute(
        "INSERT INTO partner_transactions
         (partner_name,kind,type,amount,date,time,notes,currency,payment_type,
          source_type,source_id,source_role,affects_qasa,affects_partner_cash,
          affects_profit,related_source_type,related_source_id,account_id,operation_id,
           sale_id,reverses_transaction_id,is_reversed)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
                  ?17,?18,?19,?20,?21,1)",
        params![
            row.0,
            row.1,
            row.2,
            -row.3,
            date,
            time,
            Some(match row.4 {
                Some(notes) if !notes.trim().is_empty() => {
                    format!("{notes} | عكس: {reversal_note}")
                }
                _ => format!("عكس: {reversal_note}"),
            }),
            row.5,
            row.6,
            format!("{}_reversal", row.7.as_deref().unwrap_or("transaction")),
            original_id.to_string(),
            format!("{}_reversal", row.8.as_deref().unwrap_or("transaction")),
            row.9,
            row.10,
            row.11,
            row.12,
            row.13,
            row.14,
            row.15,
            row.16,
            original_id,
        ],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "UPDATE partner_transactions
         SET is_reversed=1,status='reversed'
         WHERE id=?1 AND COALESCE(is_reversed,0)=0",
        [original_id],
    )
    .map_err(|error| error.to_string())?;
    Ok(true)
}

pub fn append_partner_transaction_reversals_matching<P: rusqlite::Params>(
    conn: &Connection,
    select_ids_sql: &str,
    params: P,
    reversal_note: &str,
) -> Result<usize, String> {
    let ids = {
        let mut statement = conn
            .prepare(select_ids_sql)
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params, |row| row.get::<_, i64>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows
    };
    let mut appended = 0usize;
    for id in ids {
        if append_partner_transaction_reversal_by_id(conn, id, reversal_note)? {
            appended += 1;
        }
    }
    Ok(appended)
}

pub fn new_ledger_token(prefix: &str) -> String {
    let mut bytes = [0u8; 16];
    rand_core::OsRng.fill_bytes(&mut bytes);
    format!("{}_{}", prefix, hex::encode(bytes))
}

pub fn set_ledger_batch_for_partner_transaction(
    conn: &Connection,
    tx_id: i64,
    ledger_batch_id: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE partner_transactions SET ledger_batch_id = ?1 WHERE id = ?2",
        params![ledger_batch_id, tx_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE financial_ledger
         SET ledger_batch_id = ?1
         WHERE reference_type = 'partner_transaction' AND reference_id = ?2",
        params![ledger_batch_id, tx_id.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_customer_payment_batch(
    conn: &Connection,
    payment_tx_id: i64,
    ledger_batch_id: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE partner_transactions
         SET ledger_batch_id = ?1
         WHERE id = ?2
            OR (source_type = 'customer_payment' AND source_id = ?3)",
        params![ledger_batch_id, payment_tx_id, payment_tx_id.to_string()],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id FROM partner_transactions
             WHERE id = ?1
                OR (source_type = 'customer_payment' AND source_id = ?2)",
        )
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map(params![payment_tx_id, payment_tx_id.to_string()], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for id in ids {
        conn.execute(
            "UPDATE financial_ledger
             SET ledger_batch_id = ?1
             WHERE reference_type = 'partner_transaction' AND reference_id = ?2",
            params![ledger_batch_id, id.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn reverse_ledger_batch_entries(
    conn: &Connection,
    original_batch_id: &str,
    reversal_batch_id: &str,
) -> Result<(), String> {
    let existing_reversal_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM financial_ledger WHERE ledger_batch_id = ?1",
            [reversal_batch_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing_reversal_count > 0 {
        return Ok(());
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, account_type, account_id, debit, credit, currency,
                    reference_type, reference_id, type_, description, notes
             FROM financial_ledger
             WHERE ledger_batch_id = ?1
               AND type_ NOT LIKE 'عكس:%'
               AND type_ NOT LIKE 'عكس: %'
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([original_batch_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Money>(3)?,
                row.get::<_, Money>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, Option<String>>(10)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let (reversal_date, reversal_time) = now_datetime();
    for (
        original_id,
        account_type,
        account_id,
        debit,
        credit,
        currency,
        reference_type,
        reference_id,
        type_,
        description,
        notes,
    ) in entries
    {
        conn.execute(
            "INSERT INTO financial_ledger (
               date, time, account_type, account_id, debit, credit, currency,
               reference_type, reference_id, type_, description, notes, ledger_batch_id,
               reverses_ledger_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                reversal_date,
                reversal_time,
                account_type,
                account_id.as_deref(),
                credit,
                debit,
                currency,
                reference_type,
                reference_id,
                format!("عكس: {}", type_),
                format!("عكس: {}", description),
                notes.as_deref(),
                reversal_batch_id,
                original_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn mark_partner_batch_reversed(conn: &Connection, ledger_batch_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE partner_transactions
         SET is_reversed = 1,
             affects_qasa = 0,
             affects_partner_cash = 0,
             affects_profit = 0,
             notes = CASE
                 WHEN notes IS NULL OR notes = '' THEN 'ملغاة ضمن عكس دفعة قسط'
                 WHEN notes LIKE '%ملغاة ضمن عكس دفعة قسط%' THEN notes
                 ELSE notes || ' | ملغاة ضمن عكس دفعة قسط'
             END
         WHERE ledger_batch_id = ?1",
        [ledger_batch_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn append_partner_batch_reversals(
    conn: &Connection,
    original_batch_id: &str,
    reversal_batch_id: &str,
    reversal_operation_id: &str,
    sale_id: i64,
    account_id: i64,
    reversal_event_id: i64,
) -> Result<usize, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id,partner_name,kind,type,amount,notes,currency,payment_type,
                    COALESCE(source_role,'payment'),affects_qasa,affects_partner_cash,
                    affects_profit,related_source_type,related_source_id
             FROM partner_transactions original
             WHERE ledger_batch_id=?1 AND COALESCE(is_reversed,0)=0
               AND NOT EXISTS (SELECT 1 FROM partner_transactions reversal
                               WHERE reversal.reverses_transaction_id=original.id)",
        )
        .map_err(|e| e.to_string())?;
    type BatchRow = (
        i64,
        String,
        String,
        String,
        Money,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        i64,
        i64,
        i64,
        Option<String>,
        Option<String>,
    );
    let rows: Vec<BatchRow> = stmt
        .query_map([original_batch_id], |row| {
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
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let (date, time) = now_datetime();
    for (
        original_id,
        partner_name,
        kind,
        tx_type,
        amount,
        notes,
        currency,
        payment_type,
        source_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
        related_source_type,
        related_source_id,
    ) in &rows
    {
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name,kind,type,amount,date,time,notes,currency,payment_type,
              source_type,source_id,source_role,affects_qasa,affects_partner_cash,
              affects_profit,related_source_type,related_source_id,ledger_batch_id,
              account_id,operation_id,sale_id,reverses_transaction_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'customer_payment_reversal',
                     ?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
            params![
                partner_name,
                kind,
                tx_type,
                -*amount,
                date,
                time,
                notes.as_deref().map(|value| format!("عكس: {value}")),
                currency,
                payment_type,
                reversal_event_id.to_string(),
                source_role,
                affects_qasa,
                affects_partner_cash,
                affects_profit,
                related_source_type,
                related_source_id,
                reversal_batch_id,
                account_id,
                reversal_operation_id,
                sale_id,
                original_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(rows.len())
}

/// CRITICAL-3 FIX: Insert reversal entries for every financial_ledger row
/// matching `select_sql` (bound by `param_name`/`param_value`), then delete
/// the originals. This preserves the audit trail in all "delete-and-rebuild"
/// code paths.
struct LedgerRowForReversal {
    id: i64,
    date: String,
    time: String,
    account_type: String,
    account_id: Option<String>,
    debit: String,
    credit: String,
    currency: String,
    reference_type: String,
    reference_id: String,
    type_: String,
}

pub fn reverse_and_delete_ledger_entries(
    db: &Connection,
    select_sql: &str,
    param_name: &str,
    param_value: &str,
    reversal_note: &str,
) -> Result<(), String> {
    let named_param = format!(":{param_name}");
    let select_with_param = select_sql.replace(":param", &named_param);

    // SELECT 13 cols: id, date, time, account_type, account_id, debit, credit,
    //   currency, reference_type, reference_id, type_, description, notes
    let mut stmt = db.prepare(&select_with_param).map_err(|e| e.to_string())?;
    let rows: Vec<LedgerRowForReversal> = {
        let binding = [(
            named_param.as_str(),
            &param_value as &dyn rusqlite::types::ToSql,
        )];
        stmt.query_map(&binding, |row| {
            Ok(LedgerRowForReversal {
                id: row.get(0)?,
                date: row.get(1)?,
                time: row.get(2)?,
                account_type: row.get(3)?,
                account_id: row.get(4)?,
                debit: row.get(5)?,
                credit: row.get(6)?,
                currency: row.get(7)?,
                reference_type: row.get(8)?,
                reference_id: row.get(9)?,
                type_: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    };
    drop(stmt);

    for row in rows {
        db.execute(
            "INSERT INTO financial_ledger (
                date, time, account_type, account_id, debit, credit, currency,
                reference_type, reference_id, type_, description, notes, reverses_ledger_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'عكس', ?10, ?11, ?12)",
            params![
                row.date,
                row.time,
                row.account_type,
                row.account_id,
                row.credit,
                row.debit,
                row.currency,
                row.reference_type,
                row.reference_id,
                format!("عكس {}", row.type_),
                reversal_note,
                row.id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn delete_ledger_entries(
    conn: &Connection,
    reference_type: &str,
    reference_id: &str,
) -> Result<(), String> {
    reverse_ledger_entries(conn, reference_type, reference_id)
}

/// Central helper: Delete partner_transactions by source fields WITH their ledger entries.
/// This prevents orphan financial_ledger rows.
pub fn delete_partner_transactions_by_source_with_ledger(
    db: &Connection,
    source_type: &str,
    source_id: &str,
    source_role: Option<&str>,
) -> Result<(), String> {
    let source_entity_id = source_id
        .trim()
        .parse::<i64>()
        .map_err(|_| format!("مرجع المصدر {source_type} يجب أن يكون معرّفاً رقمياً"))?;
    let sql = match source_role {
        Some(_) => "SELECT id, partner_name, kind FROM partner_transactions WHERE source_type = ?1 AND source_entity_id = ?2 AND source_role = ?3",
        None => "SELECT id, partner_name, kind FROM partner_transactions WHERE source_type = ?1 AND source_entity_id = ?2",
    };
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;

    let mut rows: Vec<(i64, String, String)> = Vec::new();
    if let Some(role) = source_role {
        let query_rows = stmt
            .query_map(params![source_type, source_entity_id, role], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in query_rows.flatten() {
            rows.push(row);
        }
    } else {
        let query_rows = stmt
            .query_map(params![source_type, source_entity_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in query_rows.flatten() {
            rows.push(row);
        }
    }
    drop(stmt);

    let mut partners_to_recalc: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();
    for (id, partner_name, kind) in &rows {
        append_partner_transaction_reversal_by_id(db, *id, "استبدال إسقاط محاسبي مولد")?;
        partners_to_recalc.insert((partner_name.clone(), kind.clone()));
    }

    for (p_name, p_kind) in partners_to_recalc {
        recalculate_partner_total(db, &p_name, &p_kind)?;
    }

    Ok(())
}

/// Central helper: delete generated partner rows by source_type/source_role when the
/// source_id intentionally varies across many original records.
pub fn delete_partner_transactions_by_source_with_ledger_for_role(
    db: &Connection,
    source_type: &str,
    source_role: &str,
    kind: Option<&str>,
) -> Result<(), String> {
    let sql = match kind {
        Some(_) => {
            "SELECT id, partner_name, kind FROM partner_transactions
             WHERE source_type = ?1 AND source_role = ?2 AND kind = ?3"
        }
        None => {
            "SELECT id, partner_name, kind FROM partner_transactions
             WHERE source_type = ?1 AND source_role = ?2"
        }
    };
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;

    let rows = if let Some(kind) = kind {
        stmt.query_map(params![source_type, source_role, kind], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect::<Vec<_>>()
    } else {
        stmt.query_map(params![source_type, source_role], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect::<Vec<_>>()
    };
    drop(stmt);

    let mut partners_to_recalc: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();
    for (id, partner_name, kind) in rows {
        append_partner_transaction_reversal_by_id(db, id, "استبدال إسقاط محاسبي مولد حسب الدور")?;
        partners_to_recalc.insert((partner_name, kind));
    }

    for (partner_name, kind) in partners_to_recalc {
        recalculate_partner_total(db, &partner_name, &kind)?;
    }

    Ok(())
}

/// Cleanup orphan partner_transaction split rows.
///
/// A split row is "orphan" when its `source_id` points to a parent
/// `partner_transactions.id` that no longer exists. This happens when the
/// parent was deleted via a pre-Audit-fix-#3 code path that did not clean up
/// the derived split rows (for example, the production DB at v30 contained
/// `funder_payment` rows 229/230 referencing deleted parent 228, producing a
/// -52,050 IQD overall ledger imbalance).
///
/// This helper is idempotent and safe to call from a migration. It only
/// deletes split rows whose parent is gone; it leaves every other row alone.
/// After deletion it also removes the orphan's ledger entries and
/// recalculates affected partner balances.
///
/// Returns the number of orphan rows removed.
/// Test-only entry point that runs init_db (and thus all pending migrations)
/// on an EXISTING database connection. Used by integration tests that need to
/// verify migration behavior on a copy of the production database.
pub fn init_db_for_test(conn: &Connection) -> rusqlite::Result<()> {
    init_db(conn)
}

pub fn cleanup_orphan_partner_splits(db: &Connection) -> Result<usize, String> {
    // Collect orphans first to avoid cursor invalidation during delete.
    let orphan_rows: Vec<(i64, String, String)> = db
        .prepare(
            "SELECT id, partner_name, kind FROM partner_transactions
             WHERE source_type IN ('customer_payment','funder_payment','company_payment')
               AND source_id IS NOT NULL AND source_id != ''
               AND NOT EXISTS (
                 SELECT 1 FROM partner_transactions pt2
                 WHERE CAST(pt2.id AS TEXT) = partner_transactions.source_id
               )
               AND COALESCE(is_reversed, 0) = 0",
        )
        .map_err(|e| e.to_string())?
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut partners_to_recalc: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();
    let mut removed = 0usize;
    for (id, partner_name, kind) in &orphan_rows {
        append_partner_transaction_reversal_by_id(db, *id, "عكس إسقاط يتيم")?;
        partners_to_recalc.insert((partner_name.clone(), kind.clone()));
        removed += 1;
    }

    for (partner_name, kind) in partners_to_recalc {
        recalculate_partner_total(db, &partner_name, &kind)?;
    }

    Ok(removed)
}

/// Removes 50/50 partner deposit entries created for a customer payment (e.g. تسديد قسط).
pub fn delete_customer_payment_partner_splits(
    db: &Connection,
    payment_tx_id: i64,
) -> Result<(), String> {
    // Issue 6: Use source fields instead of notes LIKE
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE source_type = 'customer_payment' AND source_entity_id = ?1 AND source_role = 'cash_movement' AND kind = 'شريك'",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([payment_tx_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut partners_to_recalc = std::collections::HashSet::new();
    for (split_id, partner_name) in rows {
        append_partner_transaction_reversal_by_id(db, split_id, "إعادة بناء توزيع دفعة زبون")?;
        partners_to_recalc.insert(partner_name);
    }

    for p_name in partners_to_recalc {
        recalculate_partner_total(db, &p_name, "شريك")?;
    }

    Ok(())
}

pub fn delete_customer_payment_profit_splits(
    db: &Connection,
    payment_tx_id: i64,
) -> Result<(), String> {
    // Issue 6: Use source fields instead of notes LIKE
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE source_type = 'customer_payment' AND source_entity_id = ?1 AND source_role = 'profit_recognition' AND kind = 'شريك'",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([payment_tx_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut partners_to_recalc = std::collections::HashSet::new();
    for (split_id, partner_name) in rows {
        append_partner_transaction_reversal_by_id(db, split_id, "إعادة بناء ربح دفعة زبون")?;
        partners_to_recalc.insert(partner_name);
    }

    for p_name in partners_to_recalc {
        recalculate_partner_total(db, &p_name, "شريك")?;
    }

    Ok(())
}

#[allow(clippy::type_complexity)]
pub fn record_partner_ledger_entries(conn: &Connection, tx_id: i64) -> Result<(), String> {
    // Issue 11: Read affects_* flags to decide whether to create cash ledger entries
    // Issue 1: Also read source_type and source_role for proper classification
    let tx_info: Result<(String, String, String, Money, String, Option<String>, Option<String>, String, String, i32, i32, i32, String, String), rusqlite::Error> = conn.query_row(
        "SELECT partner_name, kind, type, amount, date, notes, currency, COALESCE(payment_type, 'قاصه'), COALESCE(time, '00:00'),
                COALESCE(affects_qasa, 1), COALESCE(affects_partner_cash, 1), COALESCE(affects_profit, 0),
                COALESCE(source_type, ''), COALESCE(source_role, '')
         FROM partner_transactions WHERE id = ?1",
        [tx_id],
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
            ))
        }
    );

    let (
        p_name,
        kind,
        tx_type,
        amount,
        tx_date,
        notes_opt,
        curr_opt,
        payment_type,
        tx_time,
        affects_qasa,
        affects_partner_cash,
        _affects_profit,
        source_type,
        source_role,
    ) = match tx_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());
    let notes = notes_opt.unwrap_or_default();
    let ref_id = tx_id.to_string();

    let is_deposit = is_deposit_type(&tx_type);

    // Issue 11: Skip cash ledger entries for rows that don't affect Qasa/Cash
    let should_create_cash_entry = affects_qasa == 1 || affects_partner_cash == 1;

    // Issue 1: Handle customer_payment cash_movement rows (kind="شريك", source_type="customer_payment", source_role="cash_movement")
    // These should record Dr cash only. Cr receivable is handled by the original customer row (kind="زبون").
    if kind == "شريك" && source_type == "customer_payment" && source_role == "cash_movement" {
        // Audit fix #1: customer cash-out projection rows ("سحب نقدي زبون") must not
        // write ledger entries. The original customer "سحب" row already records
        // Dr receivable / Cr cash; adding a Dr cash here would corrupt the ledger.
        if tx_type.starts_with("سحب") {
            return Ok(());
        }
        // Look up the original customer payment row to get the customer name for receivable
        let source_id_val: i64 = conn
            .query_row(
                "SELECT CAST(source_id AS INTEGER) FROM partner_transactions WHERE id = ?1",
                [tx_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("تعذر ربط حركة الزبون بمصدرها: {e}"))?;

        let customer_name: String = if source_id_val > 0 {
            conn.query_row(
                "SELECT partner_name FROM partner_transactions WHERE id = ?1 AND kind = 'زبون'",
                [source_id_val],
                |row| row.get(0),
            )
            .map_err(|e| format!("تعذر تحديد الزبون المرتبط بالحركة: {e}"))?
        } else {
            p_name.clone()
        };

        // Record Dr cash only (cash increases)
        // Cr receivable is handled by the original customer row (kind="زبون")
        record_ledger_entry(
            conn,
            &tx_date,
            &tx_time,
            "cash",
            Some(&payment_type),
            amount,
            Money::zero(),
            &curr,
            "partner_transaction",
            &ref_id,
            &tx_type,
            &format!("إيداع دفعة زبون: {}", customer_name),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;

        return Ok(());
    }

    // Issue 1: Handle customer_payment profit_recognition rows (kind="شريك", source_type="customer_payment", source_role="profit_recognition")
    // Recognize deferred revenue: Dr deferred_revenue, Cr revenue
    if kind == "شريك" && source_type == "customer_payment" && source_role == "profit_recognition"
    {
        if amount > Money::zero() {
            record_ledger_entry(
                conn,
                &tx_date,
                &tx_time,
                "deferred_revenue",
                Some(&p_name),
                amount,
                Money::zero(),
                &curr,
                "partner_transaction",
                &ref_id,
                "إيراد مؤجل",
                &format!("تخفيض الإيراد المؤجل - دفعة زبون: {}", p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
            record_ledger_entry(
                conn,
                &tx_date,
                &tx_time,
                "revenue",
                Some(&p_name),
                Money::zero(),
                amount,
                &curr,
                "partner_transaction",
                &ref_id,
                "إيراد مكتسب",
                &format!("إثبات الإيراد المكتسب - دفعة زبون: {}", p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    if is_borrower_account_kind(&kind) {
        let account_label = if kind == "وكالة" {
            "وكالة"
        } else {
            "زبون"
        };
        // Issue 2: For customer payment rows, always record receivable reduction
        // Even if affects_qasa=0, the receivable must still decrease
        if is_deposit {
            // Only record cash entry if the row affects Qasa/Cash
            if should_create_cash_entry {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    amount,
                    Money::zero(),
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    &format!("ايداع {}", account_label),
                    &format!("إيداع {}: {}", account_label, p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            }
            // Always record receivable reduction for customer payments
            record_ledger_entry(
                conn,
                &tx_date,
                &tx_time,
                "receivable",
                Some(&p_name),
                Money::zero(),
                amount,
                &curr,
                "partner_transaction",
                &ref_id,
                &format!("ايداع {} مديونية", account_label),
                &format!("تخفيض مديونية {} {}", account_label, p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
        } else if tx_type.starts_with("سحب") {
            record_ledger_entry(
                conn,
                &tx_date,
                &tx_time,
                "receivable",
                Some(&p_name),
                amount,
                Money::zero(),
                &curr,
                "partner_transaction",
                &ref_id,
                &format!("سحب {} مديونية", account_label),
                &format!("زيادة مديونية {} {}", account_label, p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
            record_ledger_entry(
                conn,
                &tx_date,
                &tx_time,
                "cash",
                Some(&payment_type),
                Money::zero(),
                amount,
                &curr,
                "partner_transaction",
                &ref_id,
                &format!("سحب {}", account_label),
                &format!("سحب نقدي {}: {}", account_label, p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    // Agency rows are projection rows for Qasa/Cash and Profit Distribution.
    // The agency/agency_transaction ledger functions own the real cash/revenue entries.
    if kind == "شريك"
        && (source_type == "agency" || source_type == "agency_transaction")
        && matches!(source_role.as_str(), "cash_movement" | "profit_recognition")
    {
        return Ok(());
    }

    // Legacy agency_profit rows are also projection rows. Version 22 splits them, but this keeps
    // older databases from writing duplicate cash/capital ledger entries before migration finishes.
    if (source_type == "agency" || source_type == "agency_transaction")
        && source_role == "agency_profit"
        && should_create_cash_entry
    {
        return Ok(());
    }

    let has_dedicated_ledger = matches!(
        source_type.as_str(),
        "car_purchase" | "car_sale" | "car_expense" | "expense" | "profit_distribution"
    );
    // BUG-1 (forensic re-audit, 2026-07-10): the early-exit guard used to be:
    //   `!should_create_cash_entry && source_role != "profit_recognition"`
    // which incorrectly skipped writing the funder/company/investor liability
    // ledger entry for `funder_transaction` / `company_transaction` /
    // `investor_transaction` rows. These rows have affects_qasa=0 and
    // affects_partner_cash=0 (they affect a liability account, not cash), so
    // the guard treated them as "non-cash schedule" rows and bailed out before
    // the `kind == "ممول" / "شركة" / "مستثمر"` blocks below could write the
    // liability-side entry. The result was a permanent ledger imbalance equal
    // to the repayment amount (production: -52,050 IQD after a 52,050 IQD
    // funder repayment, because only the partner-cash credit was recorded).
    //
    // Fix: allow through any row whose kind is a liability-tracking account
    // (ممول / شركة / مستثمر) OR whose source_type marks it as a liability-side
    // transaction. Schedule/transfer rows (باقي/تحويل) and pure projection
    // rows still exit early.
    let is_liability_side_kind = matches!(kind.as_str(), "ممول" | "شركة" | "مستثمر");
    let is_non_cash_schedule_or_transfer = tx_type.starts_with("باقي")
        || tx_type.starts_with("تحويل")
        || (!should_create_cash_entry
            && source_role != "profit_recognition"
            && !is_liability_side_kind);
    if has_dedicated_ledger || is_non_cash_schedule_or_transfer {
        return Ok(());
    }

    // Issue 3: For "سحب تسديد" rows — only process if it's a partner_cash_payment
    if tx_type.starts_with("سحب تسديد") {
        if kind == "شريك" && source_role == "partner_cash_payment" && should_create_cash_entry {
            // Record cash outflow for partner repayment
            record_ledger_entry(
                conn,
                &tx_date,
                &tx_time,
                "cash",
                Some(&payment_type),
                Money::zero(),
                amount,
                &curr,
                "partner_transaction",
                &ref_id,
                "سحب شريك نقدي",
                &format!("سحب نقدي شريك: {} — {}", p_name, notes),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    match kind.as_str() {
        "شريك" => {
            // Issue 11: Only create cash entries if the row affects Qasa/Cash
            if is_deposit && should_create_cash_entry {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    amount,
                    Money::zero(),
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع شريك",
                    &format!("إيداع شريك: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "capital",
                    Some(&p_name),
                    Money::zero(),
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع شريك رأس مال",
                    &format!("إيداع رأس مال الشريك {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else if tx_type.starts_with("سحب شريك") && should_create_cash_entry {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "drawings",
                    Some(&p_name),
                    amount,
                    Money::zero(),
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب شريك مصروف",
                    &format!("مسحوبات الشريك {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    Money::zero(),
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب شريك",
                    &format!("سحب نقدي شريك: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                return Ok(());
            }
        }
        "مستثمر" => {
            if is_deposit {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    amount,
                    Money::zero(),
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع مستثمر",
                    &format!("إيداع مستثمر: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "investor",
                    Some(&p_name),
                    Money::zero(),
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع مستثمر اموال",
                    &format!("إيداع أموال المستثمر {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "investor",
                    Some(&p_name),
                    amount,
                    Money::zero(),
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب مستثمر اموال",
                    &format!("سحب أموال المستثمر {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                if should_create_cash_entry {
                    record_ledger_entry(
                        conn,
                        &tx_date,
                        &tx_time,
                        "cash",
                        Some(&payment_type),
                        Money::zero(),
                        amount,
                        &curr,
                        "partner_transaction",
                        &ref_id,
                        "سحب مستثمر",
                        &format!("سحب نقدي مستثمر: {}", p_name),
                        Some(&notes),
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        "ممول" => {
            if is_deposit {
                if should_create_cash_entry {
                    record_ledger_entry(
                        conn,
                        &tx_date,
                        &tx_time,
                        "cash",
                        Some(&payment_type),
                        amount,
                        Money::zero(),
                        &curr,
                        "partner_transaction",
                        &ref_id,
                        "استلام تمويل نقدي",
                        &format!("استلام نقدي من الممول: {}", p_name),
                        Some(&notes),
                    )
                    .map_err(|e| e.to_string())?;
                }
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "funder",
                    Some(&p_name),
                    Money::zero(),
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "تمويل ممول اموال",
                    &format!("استلام تمويل من الممول {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "funder",
                    Some(&p_name),
                    amount,
                    Money::zero(),
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سداد ممول اموال",
                    &format!("تسديد تمويل للممول {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                // Issue 11: Only create cash entry if the row affects Qasa/Cash
                if should_create_cash_entry {
                    record_ledger_entry(
                        conn,
                        &tx_date,
                        &tx_time,
                        "cash",
                        Some(&payment_type),
                        Money::zero(),
                        amount,
                        &curr,
                        "partner_transaction",
                        &ref_id,
                        "سداد ممول نقدي",
                        &format!("سداد نقدي للممول: {}", p_name),
                        Some(&notes),
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        "شركة" => {
            if is_deposit {
                if should_create_cash_entry {
                    record_ledger_entry(
                        conn,
                        &tx_date,
                        &tx_time,
                        "cash",
                        Some(&payment_type),
                        amount,
                        Money::zero(),
                        &curr,
                        "partner_transaction",
                        &ref_id,
                        "استلام شركة نقدي",
                        &format!("استلام نقدي من الشركة: {}", p_name),
                        Some(&notes),
                    )
                    .map_err(|e| e.to_string())?;
                }
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "payable",
                    Some(&p_name),
                    Money::zero(),
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع شركة اموال",
                    &format!("إيداع حساب شركة {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "payable",
                    Some(&p_name),
                    amount,
                    Money::zero(),
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب شركة اموال",
                    &format!("سحب حساب شركة {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                // Issue 11: Only create cash entry if the row affects Qasa/Cash
                if should_create_cash_entry {
                    record_ledger_entry(
                        conn,
                        &tx_date,
                        &tx_time,
                        "cash",
                        Some(&payment_type),
                        Money::zero(),
                        amount,
                        &curr,
                        "partner_transaction",
                        &ref_id,
                        "سحب شركة نقدي",
                        &format!("سداد نقدي لحساب الشركة: {}", p_name),
                        Some(&notes),
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        _ => {}
    }

    Ok(())
}

#[allow(clippy::type_complexity)]
pub fn record_agency_ledger_entries(conn: &Connection, agency_id: i64) -> Result<(), String> {
    reverse_ledger_entries(conn, "agency", &agency_id.to_string())?;

    let agency_info: Result<
        (
            String,
            String,
            Money,
            Money,
            String,
            String,
            String,
            Option<i64>,
            Option<String>,
        ),
        rusqlite::Error,
    > = conn.query_row(
        "SELECT old_agent_name, new_agent_name, amount_usd, amount_iqd, date, time,
                COALESCE(payment_status, 'واصل'), account_id, operation_id
         FROM agencies WHERE id = ?1",
        [agency_id],
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
            ))
        },
    );

    let (
        old_agent_name,
        new_agent_name,
        amount_usd,
        amount_iqd,
        date,
        time,
        payment_status,
        account_id,
        operation_id,
    ) = match agency_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    let received = agency_is_received(&payment_status);

    let agency_desc = format!("وكالة {} {}", old_agent_name.trim(), new_agent_name.trim());
    let ref_id = agency_id.to_string();
    let debit_account_type = if received { "cash" } else { "receivable" };
    let debit_account_id = if received {
        "قاصه"
    } else {
        new_agent_name.trim()
    };
    let debit_type = if received {
        "أرباح وكالة"
    } else {
        "باقي وكالة"
    };

    // ============================================================
    // FORENSIC FIX (re-audit 2026-07-10, Instructions.md §31.4.4):
    // For CREDIT agencies (received=false), the credit side must be
    // `deferred_revenue` (not `revenue`) so that the profit is NOT
    // counted by `calculate_analytical_profit` until the agency is
    // marked "واصل". When the payment is received, `set_agency_receivable_status`
    // re-calls this function with received=true, which records:
    //   Dr cash / Cr revenue  (the real recognition)
    // AND the deferred_revenue entry is reversed and replaced.
    //
    // For CASH agencies (received=true), the credit is `revenue` as before.
    // ============================================================
    let credit_account_type = if received {
        "revenue"
    } else {
        "deferred_revenue"
    };
    let credit_type_label = if received {
        "أرباح وكالة إيراد"
    } else {
        "إيراد مؤجل وكالة"
    };

    if amount_usd > Money::zero() {
        record_ledger_entry(
            conn,
            &date,
            &time,
            debit_account_type,
            Some(debit_account_id),
            amount_usd,
            Money::zero(),
            "USD",
            "agency",
            &ref_id,
            debit_type,
            &agency_desc,
            None,
        )
        .map_err(|e| e.to_string())?;
        record_ledger_entry(
            conn,
            &date,
            &time,
            credit_account_type,
            Some("agency"),
            Money::zero(),
            amount_usd,
            "USD",
            "agency",
            &ref_id,
            credit_type_label,
            &agency_desc,
            None,
        )
        .map_err(|e| e.to_string())?;
    }

    if amount_iqd > Money::zero() {
        record_ledger_entry(
            conn,
            &date,
            &time,
            debit_account_type,
            Some(debit_account_id),
            amount_iqd,
            Money::zero(),
            "IQD",
            "agency",
            &ref_id,
            debit_type,
            &agency_desc,
            None,
        )
        .map_err(|e| e.to_string())?;
        record_ledger_entry(
            conn,
            &date,
            &time,
            credit_account_type,
            Some("agency"),
            Money::zero(),
            amount_iqd,
            "IQD",
            "agency",
            &ref_id,
            credit_type_label,
            &agency_desc,
            None,
        )
        .map_err(|e| e.to_string())?;
    }

    if operation_id.is_some() || account_id.is_some() {
        conn.execute(
            "UPDATE financial_ledger
             SET operation_id=COALESCE(?1,operation_id),
                 account_id_v2=CASE
                    WHEN account_type='receivable' THEN COALESCE(?2,account_id_v2)
                    ELSE account_id_v2
                 END
             WHERE reference_type='agency' AND reference_entity_id=?3",
            params![operation_id, account_id, agency_id],
        )
        .map_err(|e| format!("تعذر ربط قيود الوكالة بهوية الحساب: {e}"))?;
    }

    Ok(())
}

#[allow(clippy::type_complexity)]
pub fn record_agency_transaction_ledger_entries(
    conn: &Connection,
    tx_id: i64,
) -> Result<(), String> {
    reverse_ledger_entries(conn, "agency_transaction", &tx_id.to_string())?;

    let tx_info: Result<(i64, String, String, String, Money, Option<String>, Option<String>), rusqlite::Error> = conn.query_row(
        "SELECT agency_id, date, time, type_, amount, currency, notes FROM agency_transactions WHERE id = ?1",
        [tx_id],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            ))
        }
    );

    let (agency_id, date, time, type_, amount, curr_opt, notes_opt) = match tx_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());
    let notes = notes_opt.unwrap_or_default();
    let ref_id = tx_id.to_string();

    let is_deposit = type_.trim() == "ايداع";

    if is_deposit {
        record_ledger_entry(
            conn,
            &date,
            &time,
            "cash",
            Some("قاصه"),
            amount,
            Money::zero(),
            &curr,
            "agency_transaction",
            &ref_id,
            "إيداع وكالة",
            &format!("إيداع حركة وكالة رقم {}", agency_id),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;
        record_ledger_entry(
            conn,
            &date,
            &time,
            "revenue",
            Some("agency"),
            Money::zero(),
            amount,
            &curr,
            "agency_transaction",
            &ref_id,
            "إيداع وكالة إيراد",
            &format!("إيراد حركة وكالة رقم {}", agency_id),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;
    } else {
        record_ledger_entry(
            conn,
            &date,
            &time,
            "revenue",
            Some("agency"),
            amount,
            Money::zero(),
            &curr,
            "agency_transaction",
            &ref_id,
            "سحب وكالة إيراد",
            &format!("تخفيض إيراد حركة وكالة رقم {}", agency_id),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;
        record_ledger_entry(
            conn,
            &date,
            &time,
            "cash",
            Some("قاصه"),
            Money::zero(),
            amount,
            &curr,
            "agency_transaction",
            &ref_id,
            "سحب وكالة",
            &format!("سحب نقدي حركة وكالة رقم {}", agency_id),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn migrate_existing_data_to_ledger(conn: &Connection) -> SqlResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM financial_ledger", [], |row| {
        row.get(0)
    })?;

    if count > 0 {
        return Ok(());
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    let get_valid_date = |d: Option<String>| {
        let val = d.unwrap_or_default().trim().to_string();
        if val.is_empty() {
            today.clone()
        } else {
            val
        }
    };
    let get_valid_time = |t: Option<String>| {
        let val = t.unwrap_or_default().trim().to_string();
        if val.is_empty() {
            "00:00".to_string()
        } else {
            val
        }
    };

    // 1. Cars Purchase & Sale
    let mut cars_stmt = conn.prepare(
        "SELECT car_number, car_name, purchase_price, currency, purchase_type, financer_name, purchase_date, purchase_time,
                status, selling_price, sale_currency, payment_type, amount_paid, amount_remaining, sale_date, sale_time, buyer_name
         FROM cars"
    )?;

    let mut car_expenses_stmt =
        conn.prepare("SELECT amount FROM car_expenses WHERE car_number = ?1")?;

    let cars_rows = cars_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Money>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, Money>(9)?,
            row.get::<_, Option<String>>(10)?,
            row.get::<_, Option<String>>(11)?,
            row.get::<_, Option<Money>>(12)?,
            row.get::<_, Option<Money>>(13)?,
            row.get::<_, Option<String>>(14)?,
            row.get::<_, Option<String>>(15)?,
            row.get::<_, Option<String>>(16)?,
        ))
    })?;

    for car_res in cars_rows {
        let (
            car_number,
            car_name,
            purchase_price,
            currency_opt,
            purchase_type_opt,
            financer_name_opt,
            purchase_date_opt,
            purchase_time_opt,
            status,
            selling_price,
            sale_currency_opt,
            payment_type_opt,
            amount_paid_opt,
            amount_remaining_opt,
            sale_date_opt,
            sale_time_opt,
            buyer_name_opt,
        ) = car_res?;

        let currency = currency_opt.unwrap_or_else(|| "IQD".to_string());
        let purchase_type = purchase_type_opt.unwrap_or_else(|| "كاش".to_string());
        let purchase_date = get_valid_date(purchase_date_opt);
        let purchase_time = get_valid_time(purchase_time_opt);

        if purchase_price > Money::zero() {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'inventory', ?3, ?4, 0.0, ?5, 'car', ?6, 'شراء سيارة', ?7, NULL)",
                params![
                    purchase_date,
                    purchase_time,
                    car_number,
                    purchase_price,
                    currency,
                    car_number,
                    format!("شراء سيارة: {} ({})", car_name, car_number)
                ],
            )?;

            if purchase_type == "تمويل" || purchase_type == "دين" {
                let financer_name = financer_name_opt.unwrap_or_default().trim().to_string();
                let acc_id = if financer_name.is_empty() {
                    "ممول عام".to_string()
                } else {
                    financer_name
                };
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'funder', ?3, 0.0, ?4, ?5, 'car', ?6, 'تمويل شراء سيارة', ?7, NULL)",
                    params![
                        purchase_date,
                        purchase_time,
                        acc_id,
                        purchase_price,
                        currency,
                        car_number,
                        format!("تمويل شراء سيارة: {} ({}) من قبل {}", car_name, car_number, acc_id)
                    ],
                )?;
            } else if purchase_type == "شركة" {
                let financer_name = financer_name_opt.unwrap_or_default().trim().to_string();
                let acc_id = if financer_name.is_empty() {
                    "شركة عامة".to_string()
                } else {
                    financer_name
                };
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'payable', ?3, 0.0, ?4, ?5, 'car', ?6, 'شراء سيارة عن طريق شركة', ?7, NULL)",
                    params![
                        purchase_date,
                        purchase_time,
                        acc_id,
                        purchase_price,
                        currency,
                        car_number,
                        format!("شراء سيارة: {} ({}) عن طريق شركة {}", car_name, car_number, acc_id)
                    ],
                )?;
            } else {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'car', ?5, 'شراء سيارة كاش', ?6, NULL)",
                    params![
                        purchase_date,
                        purchase_time,
                        purchase_price,
                        currency,
                        car_number,
                        format!("سحب نقدي لشراء سيارة: {} ({})", car_name, car_number)
                    ],
                )?;
            }
        }

        if status == "مبيوعة" {
            let sale_currency = sale_currency_opt.unwrap_or_else(|| "IQD".to_string());
            let payment_type = payment_type_opt.unwrap_or_else(|| "كاش".to_string());
            let sale_date = get_valid_date(sale_date_opt);
            let sale_time = get_valid_time(sale_time_opt);
            let buyer_name = buyer_name_opt.unwrap_or_else(|| "مشتري مجهول".to_string());
            let amount_paid = amount_paid_opt.unwrap_or(selling_price);
            let _amount_remaining = amount_remaining_opt.unwrap_or(Money::zero());

            // Issue 7: For installment/term sales, only record amount_paid as realized revenue
            if payment_type == "كاش" {
                // Cash sale: full selling price as revenue
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'revenue', ?3, 0.0, ?4, ?5, 'car', ?6, 'بيع سيارة', ?7, NULL)",
                    params![
                        sale_date,
                        sale_time,
                        car_number,
                        selling_price,
                        sale_currency,
                        car_number,
                        format!("إيراد بيع سيارة {} ({}) إلى {}", car_name, car_number, buyer_name)
                    ],
                )?;
            } else {
                // Installment/term sale: only amount_paid as realized revenue
                if amount_paid > Money::zero() {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'revenue', ?3, 0.0, ?4, ?5, 'car', ?6, 'بيع سيارة - جزئي', ?7, NULL)",
                        params![
                            sale_date,
                            sale_time,
                            car_number,
                            amount_paid,
                            sale_currency,
                            car_number,
                            format!("إيراد جزئي بيع سيارة {} ({})", car_name, car_number)
                        ],
                    )?;
                }
            }

            if payment_type == "كاش" {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'cash', 'قاصه', ?3, 0.0, ?4, 'car', ?5, 'بيع سيارة كاش', ?6, NULL)",
                    params![
                        sale_date,
                        sale_time,
                        selling_price,
                        sale_currency,
                        car_number,
                        format!("استلام نقدي بيع سيارة {} ({})", car_name, car_number)
                    ],
                )?;
            } else {
                // Installment/term sale: cash is recorded through customer_payment rows
                // to avoid double-counting. Record receivable for full selling price.
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'receivable', ?3, ?4, 0.0, ?5, 'car', ?6, 'مدينون بيع سيارة', ?7, NULL)",
                    params![
                        sale_date,
                        sale_time,
                        buyer_name,
                        selling_price,
                        sale_currency,
                        car_number,
                        format!("ذمة مدينة كاملة بيع سيارة {} ({}) على {}", car_name, car_number, buyer_name)
                    ],
                )?;
                // Matching credit: deferred revenue (balances the receivable debit)
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'deferred_revenue', ?3, 0.0, ?4, ?5, 'car', ?6, 'إيراد مؤجل بيع سيارة', ?7, NULL)",
                    params![
                        sale_date,
                        sale_time,
                        car_number,
                        selling_price,
                        sale_currency,
                        car_number,
                        format!("إيراد مؤجل بيع سيارة {} ({}) إلى {}", car_name, car_number, buyer_name)
                    ],
                )?;
            }

            let mut exp_amount_sum = Money::zero();
            let mut exp_rows = car_expenses_stmt.query([&car_number])?;
            while let Some(r) = exp_rows.next()? {
                exp_amount_sum += r.get::<_, Money>(0)?;
            }
            let total_cogs = purchase_price + exp_amount_sum;

            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'expense', ?3, ?4, 0.0, ?5, 'car', ?6, 'تكلفة المبيعات', ?7, NULL)",
                params![
                    sale_date,
                    sale_time,
                    car_number,
                    total_cogs,
                    currency,
                    car_number,
                    format!("تكلفة بيع سيارة {} ({})", car_name, car_number)
                ],
            )?;

            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'inventory', ?3, 0.0, ?4, ?5, 'car', ?6, 'تخفيض المخزون بيع سيارة', ?7, NULL)",
                params![
                    sale_date,
                    sale_time,
                    car_number,
                    total_cogs,
                    currency,
                    car_number,
                    format!("إخراج سيارة {} ({}) من المخزون", car_name, car_number)
                ],
            )?;
        }
    }

    // 2. Car Expenses (Issue 6: use reference_type = 'car_expense')
    let mut ce_stmt = conn.prepare(
        "SELECT id, car_number, description, amount, date, currency, time FROM car_expenses",
    )?;
    let ce_rows = ce_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Money>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, String>(6)?,
        ))
    })?;
    for ce in ce_rows {
        let (id, car_number, description, amount, ce_date, ce_curr_opt, ce_time) = ce?;
        let ce_curr = ce_curr_opt.unwrap_or_else(|| "IQD".to_string());

        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             VALUES (?1, ?2, 'inventory', ?3, ?4, 0.0, ?5, 'car_expense', ?6, 'مصروف سيارة', ?7, NULL)",
            params![
                ce_date,
                ce_time,
                car_number,
                amount,
                ce_curr,
                id.to_string(),
                format!("مصروف سيارة {} - {}", car_number, description)
            ],
        )?;

        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'car_expense', ?5, 'مصروف سيارة نقدي', ?6, NULL)",
            params![
                ce_date,
                ce_time,
                amount,
                ce_curr,
                id.to_string(),
                format!("دفع نقدي مصروف سيارة {} - {}", car_number, description)
            ],
        )?;
    }

    // 3. General Expenses
    let mut exp_stmt = conn.prepare("SELECT id, description, amount, date, time, notes, currency FROM expenses WHERE car_number IS NULL OR car_number = ''")?;
    let exp_rows = exp_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Money>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
        ))
    })?;
    for exp in exp_rows {
        let (id, desc, amount, exp_date, exp_time, notes, curr_opt) = exp?;
        let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());

        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             VALUES (?1, ?2, 'expense', ?3, ?4, 0.0, ?5, 'expense', ?6, 'مصروف عام', ?7, ?8)",
            params![
                exp_date,
                exp_time,
                desc,
                amount,
                curr,
                id.to_string(),
                desc,
                notes
            ],
        )?;

        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'expense', ?5, 'دفع مصروف', ?6, ?7)",
            params![
                exp_date,
                exp_time,
                amount,
                curr,
                id.to_string(),
                format!("سحب نقدي مصروف: {}", desc),
                notes
            ],
        )?;
    }

    // 4. Partner Transactions (Manual Only)
    let mut pt_stmt = conn.prepare(
        "SELECT id, partner_name, kind, type, amount, date, notes, currency,
                COALESCE(payment_type, 'قاصه'), COALESCE(time, '00:00'),
                COALESCE(affects_qasa, 0), COALESCE(affects_partner_cash, 0)
         FROM partner_transactions",
    )?;
    let pt_rows = pt_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Money>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, i32>(10)?,
            row.get::<_, i32>(11)?,
        ))
    })?;

    for pt in pt_rows {
        let (
            id,
            p_name,
            kind,
            tx_type,
            amount,
            tx_date,
            notes_opt,
            curr_opt,
            payment_type,
            tx_time,
            affects_qasa,
            affects_partner_cash,
        ) = pt?;
        let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());
        let notes = notes_opt.unwrap_or_default();
        let should_create_cash_entry = affects_qasa != 0 || affects_partner_cash != 0;

        let is_deposit = tx_type.starts_with("ايداع")
            || tx_type.starts_with("مقدمة")
            || tx_type.starts_with("تسديد")
            || tx_type.starts_with("استلام");

        if is_borrower_account_kind(&kind) {
            let account_label = if kind == "وكالة" {
                "وكالة"
            } else {
                "زبون"
            };
            if is_deposit {
                if should_create_cash_entry {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, ?7, ?8, ?9)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("ايداع {}", account_label), format!("إيداع {}: {}", account_label, p_name), notes],
                    )?;
                }
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'receivable', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, ?7, ?8, ?9)",
                    params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("ايداع {} مديونية", account_label), format!("تخفيض مديونية {} {}", account_label, p_name), notes],
                )?;
            } else if tx_type.starts_with("سحب") {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'receivable', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, ?7, ?8, ?9)",
                    params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("سحب {} مديونية", account_label), format!("زيادة مديونية {} {}", account_label, p_name), notes],
                )?;
                if should_create_cash_entry {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, ?7, ?8, ?9)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سحب {}", account_label), format!("سحب نقدي {}: {}", account_label, p_name), notes],
                    )?;
                }
            }
            continue;
        }

        if tx_type.starts_with("سحب شراء سيارة")
            || tx_type.starts_with("ايداع بيع سيارة")
            || tx_type.starts_with("مقدمة بيع سيارة")
            || tx_type.starts_with("سحب مصروف")
            || tx_type.starts_with("سحب تسديد")
            || tx_type == "ايداع وكالة"
            || tx_type.starts_with("ايداع ارباح وكالة")
            || tx_type.starts_with("ايداع ارباح سيارة")
            || tx_type.starts_with("تسديد قسط")
            || tx_type.starts_with("باقي")
            || tx_type.starts_with("تحويل")
            || notes.starts_with("ارجاع (الكاش")
            || notes.contains("شراكة سيارة")
            || ((kind == "ممول" || kind == "شركة") && is_deposit)
            || tx_type.starts_with("توزيع أرباح")
            || tx_type.starts_with("سحب أرباح")
            || tx_type.starts_with("تسوية مسحوبات")
            || tx_type.starts_with("إعادة استثمار")
            || notes.contains("توزيع أرباح")
        {
            continue;
        }

        match kind.as_str() {
            "شريك" => {
                if is_deposit && should_create_cash_entry {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'ايداع شريك', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("إيداع شريك: {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'capital', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'ايداع شريك رأس مال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("إيداع رأس مال الشريك {}", p_name), notes],
                    )?;
                } else if tx_type.starts_with("سحب شريك") && should_create_cash_entry {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'capital', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سحب شريك رأس مال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("سحب رأس مال الشريك {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سحب شريك', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سحب نقدي شريك: {}", p_name), notes],
                    )?;
                }
            }
            "مستثمر" => {
                if is_deposit {
                    if should_create_cash_entry {
                        conn.execute(
                            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'ايداع مستثمر', ?7, ?8)",
                            params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("إيداع مستثمر: {}", p_name), notes],
                        )?;
                    }
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'investor', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'ايداع مستثمر اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("إيداع أموال المستثمر {}", p_name), notes],
                    )?;
                } else {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'investor', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سحب مستثمر اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("سحب أموال المستثمر {}", p_name), notes],
                    )?;
                    if should_create_cash_entry {
                        conn.execute(
                            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سحب مستثمر', ?7, ?8)",
                            params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سحب نقدي مستثمر: {}", p_name), notes],
                        )?;
                    }
                }
            }
            "ممول" => {
                if is_deposit {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'funder', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'تمويل ممول اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("استلام تمويل من الممول {}", p_name), notes],
                    )?;
                } else {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'funder', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سداد ممول اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("تسديد تمويل للممول {}", p_name), notes],
                    )?;
                    if should_create_cash_entry {
                        conn.execute(
                            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سداد ممول نقدي', ?7, ?8)",
                            params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سداد نقدي للممول: {}", p_name), notes],
                        )?;
                    }
                }
            }
            "شركة" => {
                if is_deposit {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'payable', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'ايداع شركة اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("إيداع حساب شركة {}", p_name), notes],
                    )?;
                } else {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'payable', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سحب شركة اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("سحب حساب شركة {}", p_name), notes],
                    )?;
                    if should_create_cash_entry {
                        conn.execute(
                            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سحب شركة نقدي', ?7, ?8)",
                            params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سداد نقدي لحساب الشركة: {}", p_name), notes],
                        )?;
                    }
                }
            }
            _ => {}
        }
    }

    // 5. Agencies & Agency Transactions
    let mut ag_stmt = conn.prepare(
        "SELECT id, old_agent_name, new_agent_name, amount_usd, amount_iqd, date, time, COALESCE(payment_status, 'واصل') FROM agencies",
    )?;
    let ag_rows = ag_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Money>(3)?,
            row.get::<_, Money>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
        ))
    })?;
    for ag in ag_rows {
        let (id, old_name, new_name, amount_usd, amount_iqd, ag_date, ag_time, payment_status) =
            ag?;
        let received = agency_is_received(&payment_status);
        let debit_account_type = if received { "cash" } else { "receivable" };
        let debit_account_id = if received {
            "قاصه"
        } else {
            new_name.trim()
        };
        let debit_type = if received {
            "أرباح وكالة"
        } else {
            "باقي وكالة"
        };

        if amount_usd > Money::zero() {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0.0, 'USD', 'agency', ?6, ?7, ?8, NULL)",
                params![ag_date, ag_time, debit_account_type, debit_account_id, amount_usd, id.to_string(), debit_type, format!("إيداع أرباح وكالة من {} إلى {}", old_name, new_name)],
            )?;
            if received {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'revenue', 'agency', 0.0, ?3, 'USD', 'agency', ?4, 'أرباح وكالة إيراد', ?5, NULL)",
                    params![ag_date, ag_time, amount_usd, id.to_string(), format!("إيراد أرباح وكالة من {} إلى {}", old_name, new_name)],
                )?;
            }
        }

        if amount_iqd > Money::zero() {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0.0, 'IQD', 'agency', ?6, ?7, ?8, NULL)",
                params![ag_date, ag_time, debit_account_type, debit_account_id, amount_iqd, id.to_string(), debit_type, format!("إيداع أرباح وكالة من {} إلى {}", old_name, new_name)],
            )?;
            if received {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'revenue', 'agency', 0.0, ?3, 'IQD', 'agency', ?4, 'أرباح وكالة إيراد', ?5, NULL)",
                    params![ag_date, ag_time, amount_iqd, id.to_string(), format!("إيراد أرباح وكالة من {} إلى {}", old_name, new_name)],
                )?;
            }
        }
    }

    let mut agt_stmt = conn.prepare(
        "SELECT id, agency_id, date, time, type_, amount, currency, notes FROM agency_transactions",
    )?;
    let agt_rows = agt_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Money>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
        ))
    })?;
    for agt in agt_rows {
        let (id, agency_id, date, time, type_, amount, curr_opt, notes) = agt?;
        let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());

        if type_ == "ايداع" {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'cash', 'قاصه', ?3, 0.0, ?4, 'agency_transaction', ?5, 'إيداع وكالة', ?6, ?7)",
                params![date, time, amount, curr, id.to_string(), format!("إيداع حركة وكالة رقم {}", agency_id), notes],
            )?;
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'revenue', 'agency', 0.0, ?3, ?4, 'agency_transaction', ?5, 'إيداع وكالة إيراد', ?6, ?7)",
                params![date, time, amount, curr, id.to_string(), format!("إيراد حركة وكالة رقم {}", agency_id), notes],
            )?;
        } else {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'revenue', 'agency', ?3, 0.0, ?4, 'agency_transaction', ?5, 'سحب وكالة إيراد', ?6, ?7)",
                params![date, time, amount, curr, id.to_string(), format!("تخفيض إيراد حركة وكالة رقم {}", agency_id), notes],
            )?;
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'agency_transaction', ?5, 'سحب وكالة', ?6, ?7)",
                params![date, time, amount, curr, id.to_string(), format!("سحب نقدي حركة وكالة رقم {}", agency_id), notes],
            )?;
        }
    }

    Ok(())
}

pub fn ensure_sales_cogs_entries(conn: &Connection) -> SqlResult<()> {
    let cars = {
        let mut statement = conn.prepare(
            "SELECT car_number, car_name, purchase_price, COALESCE(currency,'IQD'),
                    COALESCE(NULLIF(sale_date,''),date('now','localtime')),
                    COALESCE(NULLIF(sale_time,''),'00:00')
             FROM cars c
             WHERE c.status='مبيوعة' AND COALESCE(c.payment_type,'كاش')='كاش'
               AND NOT EXISTS (
                   SELECT 1 FROM financial_ledger fl
                   WHERE fl.reference_type='car' AND fl.reference_id=c.car_number
                     AND fl.account_type='expense' AND fl.type_='تكلفة المبيعات'
               )",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Money>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (car_number, car_name, purchase_price, currency, sale_date, sale_time) in cars {
        let expenses = sum_money_rows(
            conn,
            "SELECT amount FROM car_expenses
             WHERE car_number=?1 AND COALESCE(currency,'IQD')=?2",
            params![car_number, currency],
        )
        .map_err(|error| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(error)))
        })?;
        let cost = purchase_price + expenses;
        if cost <= Money::zero() {
            continue;
        }
        conn.execute(
            "INSERT INTO financial_ledger (
                date,time,account_type,account_id,debit,credit,currency,
                reference_type,reference_id,type_,description,notes
             ) VALUES (?1,?2,'expense',?3,?4,'0',?5,'car',?3,
                       'تكلفة المبيعات',?6,NULL)",
            params![
                sale_date,
                sale_time,
                car_number,
                cost,
                currency,
                format!("تكلفة بيع سيارة {car_name} ({car_number})")
            ],
        )?;
    }
    Ok(())
}

#[allow(clippy::type_complexity)]
pub fn record_car_purchase_ledger_entries(db: &Connection, car_id: i64) -> Result<(), String> {
    let car_info: Result<(String, String, Money, String, String, Option<String>, String, String), rusqlite::Error> = db.query_row(
        "SELECT car_number, car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(purchase_type, 'كاش'), financer_name,
                COALESCE(purchase_date, ''), COALESCE(purchase_time, '00:00')
         FROM cars WHERE id = ?1",
        [car_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
    );

    let (
        car_number,
        car_name,
        purchase_price,
        currency,
        purchase_type,
        financer_name_opt,
        purchase_date,
        purchase_time,
    ) = match car_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    let reference_id = car_id.to_string();

    // Audit fix #22: fall back to the current date, never a hardcoded magic date.
    let p_date = if purchase_date.is_empty() {
        now_datetime().0
    } else {
        purchase_date
    };
    let p_time = purchase_time;

    if purchase_price > Money::zero() {
        record_ledger_entry(
            db,
            &p_date,
            &p_time,
            "inventory",
            Some(&reference_id),
            purchase_price,
            Money::zero(),
            &currency,
            "car",
            &reference_id,
            "شراء سيارة",
            &format!("شراء سيارة: {} ({})", car_name, car_number),
            None,
        )
        .map_err(|e| e.to_string())?;

        if purchase_type == "تمويل" || purchase_type == "دين" {
            let f_name = financer_name_opt.unwrap_or_default().trim().to_string();
            let acc_id = if f_name.is_empty() {
                "ممول عام".to_string()
            } else {
                f_name
            };
            record_ledger_entry(
                db,
                &p_date,
                &p_time,
                "funder",
                Some(&acc_id),
                Money::zero(),
                purchase_price,
                &currency,
                "car",
                &reference_id,
                "تمويل شراء سيارة",
                &format!(
                    "تمويل شراء سيارة: {} ({}) من قبل {}",
                    car_name, car_number, acc_id
                ),
                None,
            )
            .map_err(|e| e.to_string())?;
        } else if purchase_type == "شركة" {
            let f_name = financer_name_opt.unwrap_or_default().trim().to_string();
            let acc_id = if f_name.is_empty() {
                "شركة عامة".to_string()
            } else {
                f_name
            };
            record_ledger_entry(
                db,
                &p_date,
                &p_time,
                "payable",
                Some(&acc_id),
                Money::zero(),
                purchase_price,
                &currency,
                "car",
                &reference_id,
                "شراء سيارة عن طريق شركة",
                &format!(
                    "شراء سيارة: {} ({}) عن طريق شركة {}",
                    car_name, car_number, acc_id
                ),
                None,
            )
            .map_err(|e| e.to_string())?;
        } else {
            let mut p_stmt = db
                .prepare("SELECT COALESCE(purchase_payment_type, 'قاصه') FROM cars WHERE id = ?1")
                .map_err(|e| e.to_string())?;
            let register: String = p_stmt
                .query_row([car_id], |row| row.get(0))
                .map_err(|e| format!("تعذر قراءة مصدر دفع شراء السيارة: {e}"))?;
            let register = if register.trim().is_empty() {
                "قاصه".to_string()
            } else {
                register
            };
            record_ledger_entry(
                db,
                &p_date,
                &p_time,
                "cash",
                Some(&register),
                Money::zero(),
                purchase_price,
                &currency,
                "car",
                &reference_id,
                "شراء سيارة كاش",
                &format!(
                    "سحب نقدي لشراء سيارة: {} ({}) من {}",
                    car_name, car_number, register
                ),
                None,
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[allow(clippy::type_complexity)]
pub fn record_car_sale_ledger_entries(db: &Connection, car_id: i64) -> Result<(), String> {
    car_sale_identity_by_id(db, car_id)?;
    let car_info: Result<(String, String, Money, String, String, String, Money, String, Option<String>, Option<Money>, Option<Money>, String, String, Option<String>, i64), rusqlite::Error> = db.query_row(
        "SELECT car_number, car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(sale_currency, 'IQD'),
                COALESCE(sale_date, ''), selling_price, status, payment_type, amount_paid, amount_remaining,
                COALESCE(sale_time, '00:00'), COALESCE(purchase_date, ''), buyer_name, active_sale_id
         FROM cars WHERE id = ?1",
        [car_id],
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
            ))
        },
    );

    let (
        car_number,
        car_name,
        purchase_price,
        currency,
        sale_currency,
        sale_date,
        selling_price,
        status,
        payment_type_opt,
        amount_paid_opt,
        amount_remaining_opt,
        sale_time,
        _purchase_date,
        buyer_name_opt,
        sale_id,
    ) = match car_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    if status != "مبيوعة" {
        return Ok(());
    }

    // Audit fix #22: fall back to the current date, never a hardcoded magic date.
    let s_date = if sale_date.is_empty() {
        now_datetime().0
    } else {
        sale_date
    };
    let s_time = sale_time;
    let buyer_name = buyer_name_opt.unwrap_or_else(|| "مشتري مجهول".to_string());
    let payment_type = payment_type_opt.unwrap_or_else(|| "كاش".to_string());
    let _amount_paid = amount_paid_opt.unwrap_or(selling_price);
    let _amount_remaining = amount_remaining_opt.unwrap_or(Money::zero());

    let expenses_sum: Money = car_expenses_for_profit(db, car_id)?;
    let reference_id = sale_id.to_string();
    let total_cogs = purchase_price + expenses_sum;
    let _total_profit = selling_price - total_cogs;

    if payment_type == "كاش" {
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "revenue",
            Some(&reference_id),
            Money::zero(),
            selling_price,
            &sale_currency,
            "car",
            &reference_id,
            "بيع سيارة",
            &format!(
                "إيراد بيع سيارة {} ({}) إلى {}",
                car_name, car_number, buyer_name
            ),
            None,
        )?;

        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "cash",
            Some("قاصه"),
            selling_price,
            Money::zero(),
            &sale_currency,
            "car",
            &reference_id,
            "بيع سيارة كاش",
            &format!("استلام نقدي بيع سيارة {} ({})", car_name, car_number),
            None,
        )?;
        if total_cogs > Money::zero() {
            record_ledger_entry(
                db,
                &s_date,
                &s_time,
                "expense",
                Some(&reference_id),
                total_cogs,
                Money::zero(),
                &currency,
                "car",
                &reference_id,
                "تكلفة المبيعات",
                &format!("تكلفة بيع سيارة {} ({})", car_name, car_number),
                None,
            )?;

            record_ledger_entry(
                db,
                &s_date,
                &s_time,
                "inventory",
                Some(&reference_id),
                Money::zero(),
                total_cogs,
                &currency,
                "car",
                &reference_id,
                "تخفيض المخزون بيع سيارة",
                &format!("إخراج سيارة {} ({}) من المخزون", car_name, car_number),
                None,
            )?;
        }
    } else {
        // Audit fix #17: classic installment-method entries. The deferred revenue
        // account holds only the UNEARNED PROFIT (never the full selling price), so
        // the per-payment recognition entries (Dr deferred_revenue / Cr revenue for
        // the profit portion) drive the account to exactly zero once the full car
        // profit has been recognized — no permanent cost-portion residual remains.
        //
        //   Dr receivable       selling_price
        //   Cr inventory        total_cogs
        //   Cr deferred_revenue full_profit            (profitable sale)
        //   Dr expense (loss)   |full_profit|          (loss sale — recognized at once)
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "receivable",
            Some(&buyer_name),
            selling_price,
            Money::zero(),
            &sale_currency,
            "car",
            &reference_id,
            "مدينون بيع سيارة",
            &format!(
                "ذمة مدينة كاملة بيع سيارة {} ({}) على {}",
                car_name, car_number, buyer_name
            ),
            None,
        )?;

        if total_cogs > Money::zero() {
            record_ledger_entry(
                db,
                &s_date,
                &s_time,
                "inventory",
                Some(&reference_id),
                Money::zero(),
                total_cogs,
                &currency,
                "car",
                &reference_id,
                "تخفيض المخزون بيع سيارة",
                &format!("إخراج سيارة {} ({}) من المخزون", car_name, car_number),
                None,
            )?;
        }

        let full_profit = selling_price - total_cogs;
        if full_profit > Money::zero() {
            record_ledger_entry(
                db,
                &s_date,
                &s_time,
                "deferred_revenue",
                Some(&reference_id),
                Money::zero(),
                full_profit,
                &sale_currency,
                "car",
                &reference_id,
                "إيراد مؤجل بيع سيارة",
                &format!(
                    "ربح مؤجل بيع سيارة {} ({}) إلى {}",
                    car_name, car_number, buyer_name
                ),
                None,
            )?;
        } else if full_profit < Money::zero() {
            // Losses must reduce net profit immediately (Instructions.md §5, §24.1).
            record_ledger_entry(
                db,
                &s_date,
                &s_time,
                "expense",
                Some(&reference_id),
                -full_profit,
                Money::zero(),
                &sale_currency,
                "car",
                &reference_id,
                "خسارة بيع سيارة",
                &format!("خسارة بيع سيارة {} ({})", car_name, car_number),
                None,
            )?;
        }
    }

    Ok(())
}
