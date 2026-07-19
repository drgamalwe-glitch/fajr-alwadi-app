//! `misc_commands` — extracted from legacy/mod.rs lines 16847–17421
use super::*;

#[tauri::command]
pub fn open_whatsapp(phone: String, text: String) -> Result<(), String> {
    // Bug 15 (T5): Validate and URL-encode phone & text before formatting the URL.
    // Phone numbers may legitimately contain digits, '+', spaces, and hyphens.
    // Anything else is rejected to prevent injection of URL metacharacters.
    let phone_trimmed = phone.trim();
    if !phone_trimmed
        .chars()
        .all(|c| c.is_ascii_digit() || c == '+' || c == ' ' || c == '-')
    {
        return Err("رقم الهاتف يحتوي على أحرف غير صالحة".to_string());
    }
    if phone_trimmed.is_empty() {
        return Err("رقم الهاتف مطلوب".to_string());
    }

    let encoded_phone = urlencoding::encode(phone_trimmed);
    let encoded_text = urlencoding::encode(&text);
    let url = format!(
        "whatsapp://send?phone={}&text={}",
        encoded_phone, encoded_text
    );
    open::that(&url).map_err(|e| format!("فشل فتح واتساب: {e}"))
}

/// hash_password: Memory-hard Argon2id password hashing with a random salt.
pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Password hashing failed: {e}"))
}

/// verify_password: Verify a password against a stored hash.
/// Supports both Argon2 PHC strings (new) and legacy SHA-256 hex strings.
pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    match PasswordHash::new(stored_hash) {
        Ok(parsed_hash) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok(),
        Err(_) => {
            let mut hasher = Sha256::new();
            hasher.update(password.as_bytes());
            hex::encode(hasher.finalize()) == stored_hash
        }
    }
}

// ==================== PHASE 2: CENTRALIZED PARTNER TRANSACTION HELPERS ====================

#[allow(clippy::too_many_arguments)]
pub fn insert_partner_transaction_with_effects(
    db: &Connection,
    partner_name: &str,
    kind: &str,
    type_: &str,
    amount: Money,
    date: &str,
    payment_type: &str,
    notes: &str,
    currency: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
) -> Result<i64, String> {
    insert_partner_transaction_with_effects_and_related(
        db,
        partner_name,
        kind,
        type_,
        amount,
        date,
        payment_type,
        notes,
        currency,
        source_type,
        source_id,
        source_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
        None,
        None,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn insert_partner_transaction_with_effects_and_related(
    db: &Connection,
    partner_name: &str,
    kind: &str,
    type_: &str,
    amount: Money,
    date: &str,
    payment_type: &str,
    notes: &str,
    currency: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
    related_source_type: Option<&str>,
    related_source_id: Option<&str>,
) -> Result<i64, String> {
    if amount <= Money::zero() {
        return Ok(0);
    }

    let account_id = ensure_partner_exists(db, partner_name, "", kind)?;
    let (operation_id, sale_id) = if source_type.trim() == "car_purchase" {
        let car_id = source_id
            .trim()
            .parse::<i64>()
            .map_err(|_| "أثر شراء السيارة يتطلب car_id رقميًا".to_string())?;
        let purchase_operation_id: String = db
            .query_row(
                "SELECT purchase_operation_id FROM cars WHERE id=?1",
                [car_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("تعذر قراءة هوية عملية شراء السيارة: {e}"))?;
        (Some(purchase_operation_id), None)
    } else if related_source_type == Some("car") {
        let car_id = related_source_id
            .unwrap_or_default()
            .trim()
            .parse::<i64>()
            .map_err(|_| "الربط المحاسبي بالسيارة يتطلب car_id رقميًا".to_string())?;
        db.query_row(
            "SELECT s.operation_id,s.id
             FROM cars c JOIN car_sales s ON s.id=c.active_sale_id AND s.car_id=c.id
             WHERE c.id=?1 AND s.status='active'",
            [car_id],
            |row| Ok((Some(row.get::<_, String>(0)?), Some(row.get::<_, i64>(1)?))),
        )
        .optional()
        .map_err(|e| format!("تعذر قراءة هوية البيع الرقمية للحركة: {e}"))?
        .unwrap_or((None, None))
    } else {
        (None, None)
    };

    let time_str = Local::now().format("%H:%M").to_string();

    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id, account_id, operation_id, sale_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        params![
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            &time_str,
            notes.trim(),
            currency.trim(),
            payment_type.trim(),
            source_type.trim(),
            source_id.trim(),
            source_role.trim(),
            affects_qasa as i32,
            affects_partner_cash as i32,
            affects_profit as i32,
            related_source_type.unwrap_or(""),
            related_source_id.unwrap_or(""),
            account_id,
            operation_id,
            sale_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let tx_id = db.last_insert_rowid();

    // Ledger entry for partner/investor transactions
    record_partner_ledger_entries(db, tx_id)?;
    recalculate_partner_total(db, partner_name.trim(), kind.trim())?;

    Ok(tx_id)
}

#[allow(clippy::too_many_arguments)]
pub fn distribute_to_partners_50_with_effects(
    db: &Connection,
    amount: Money,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
) -> Result<(), String> {
    if amount <= Money::zero() {
        return Ok(());
    }
    let partners: Vec<String> = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    if partners.len() != 2 {
        return Err(format!(
            "يجب أن يكون هناك شريكان بالضبط، وجد {}",
            partners.len()
        ));
    }
    let (share1, share2) = split_partner_amount_50_by_currency(amount.0, currency);
    insert_partner_transaction_with_effects(
        db,
        &partners[0],
        "شريك",
        tx_type,
        Money(share1),
        date,
        payment_type,
        notes,
        currency,
        source_type,
        source_id,
        source_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
    )?;
    insert_partner_transaction_with_effects(
        db,
        &partners[1],
        "شريك",
        tx_type,
        Money(share2),
        date,
        payment_type,
        notes,
        currency,
        source_type,
        source_id,
        source_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
    )?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn distribute_to_partners_50_with_effects_and_related(
    db: &Connection,
    amount: Money,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
    related_source_type: Option<&str>,
    related_source_id: Option<&str>,
) -> Result<(), String> {
    if amount <= Money::zero() {
        return Ok(());
    }
    let partners: Vec<String> = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    if partners.len() != 2 {
        return Err(format!(
            "يجب أن يكون هناك شريكان بالضبط، وجد {}",
            partners.len()
        ));
    }
    let (share1, share2) = split_partner_amount_50_by_currency(amount.0, currency);
    insert_partner_transaction_with_effects_and_related(
        db,
        &partners[0],
        "شريك",
        tx_type,
        Money(share1),
        date,
        payment_type,
        notes,
        currency,
        source_type,
        source_id,
        source_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
        related_source_type,
        related_source_id,
    )?;
    insert_partner_transaction_with_effects_and_related(
        db,
        &partners[1],
        "شريك",
        tx_type,
        Money(share2),
        date,
        payment_type,
        notes,
        currency,
        source_type,
        source_id,
        source_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
        related_source_type,
        related_source_id,
    )?;
    Ok(())
}

/// Inserts one signed (positive OR negative) partner profit-recognition share.
///
/// Ledger note (Audit fix #16): these rows intentionally write NO financial_ledger
/// entries. For cash sales the sale entries (revenue/COGS) already carry the full
/// profit or loss; for installment sales the loss is recognized in the ledger at
/// sale time ("خسارة بيع سيارة"), and positive recognitions are handled by
/// record_partner_ledger_entries. Writing entries here would double-count.
#[allow(clippy::too_many_arguments)]
pub fn insert_signed_profit_recognition_share_with_related(
    db: &Connection,
    partner_name: &str,
    type_: &str,
    amount: Money,
    date: &str,
    payment_type: &str,
    notes: &str,
    currency: &str,
    source_type: &str,
    source_id: &str,
    related_source_type: Option<&str>,
    related_source_id: Option<&str>,
) -> Result<i64, String> {
    if amount.is_zero() {
        return Ok(0);
    }

    let account_id = ensure_partner_exists(db, partner_name, "", "شريك")?;

    let time_str = Local::now().format("%H:%M").to_string();

    // Profit rows must carry the sale's immutable identities so cancellation can
    // find and reverse them without relying on display text.
    let (resolved_sale_id, resolved_operation_id): (Option<i64>, Option<String>) =
        if source_type.trim() == "car_sale" {
            if let Ok(sid) = source_id.trim().parse::<i64>() {
                db.query_row(
                    "SELECT id, operation_id FROM car_sales WHERE id=?1",
                    [sid],
                    |row| Ok((Some(row.get::<_, i64>(0)?), Some(row.get::<_, String>(1)?))),
                )
                .optional()
                .map_err(|e| format!("تعذر ربط ربح السيارة بهوية البيع: {e}"))?
                .unwrap_or((None, None))
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_id, source_role, affects_qasa, affects_partner_cash,
            affects_profit, related_source_type, related_source_id, account_id,
            sale_id, operation_id
         )
         VALUES (?1, 'شريك', ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                 ?9, ?10, 'profit_recognition', 0, 0, 1, ?11, ?12, ?13, ?14, ?15)",
        params![
            partner_name.trim(),
            type_.trim(),
            amount,
            date.trim(),
            &time_str,
            notes.trim(),
            currency.trim(),
            payment_type.trim(),
            source_type.trim(),
            source_id.trim(),
            related_source_type.unwrap_or(""),
            related_source_id.unwrap_or(""),
            account_id,
            resolved_sale_id,
            resolved_operation_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(db.last_insert_rowid())
}

#[allow(clippy::too_many_arguments)]
pub fn distribute_signed_profit_recognition_50_with_related(
    db: &Connection,
    amount: Money,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
    source_type: &str,
    source_id: &str,
    related_source_type: Option<&str>,
    related_source_id: Option<&str>,
) -> Result<(), String> {
    if amount.is_zero() {
        return Ok(());
    }
    let partners: Vec<String> = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    if partners.len() != 2 {
        return Err(format!(
            "يجب أن يكون هناك شريكان بالضبط، وجد {}",
            partners.len()
        ));
    }
    let (share1, share2) = split_partner_amount_50_by_currency(amount.0, currency);
    insert_signed_profit_recognition_share_with_related(
        db,
        &partners[0],
        tx_type,
        Money(share1),
        date,
        payment_type,
        notes,
        currency,
        source_type,
        source_id,
        related_source_type,
        related_source_id,
    )?;
    insert_signed_profit_recognition_share_with_related(
        db,
        &partners[1],
        tx_type,
        Money(share2),
        date,
        payment_type,
        notes,
        currency,
        source_type,
        source_id,
        related_source_type,
        related_source_id,
    )?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn deduct_from_partners_5050_with_effects(
    db: &Connection,
    amount: Money,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
) -> Result<(), String> {
    distribute_to_partners_50_with_effects(
        db,
        amount,
        currency,
        date,
        payment_type,
        tx_type,
        notes,
        source_type,
        source_id,
        source_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
    )
}

// ==================== COMPANY SETTLEMENT THROUGH FUNDER ====================

#[tauri::command]
pub fn settle_company_through_funder(
    state: State<AppState>,
    company_name: String,
    funder_name: String,
    amount: Money,
    date: String,
    currency: Option<String>,
    session_token: String,
) -> Result<(), String> {
    validate_positive_amount(amount, "المبلغ")?;
    validate_required_text(&company_name, "اسم الشركة")?;
    validate_required_text(&funder_name, "اسم الممول")?;
    validate_required_text(&date, "التاريخ")?;
    let curr = currency.as_deref().unwrap_or("IQD");
    validate_currency(curr)?;

    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    ensure_accounting_period_open(&db, &date)?;
    let company_account_id = partner_account_id(&db, company_name.trim(), "شركة")?;
    let funder_account_id = partner_account_id(&db, funder_name.trim(), "ممول")?;
    let operation_id = new_ledger_token("company_funder_settlement");
    db.execute(
        "INSERT INTO operations(id,operation_type,status,actor_user_id)
         VALUES (?1,'company_funder_settlement','active',?2)",
        params![operation_id, actor_user_id],
    )
    .map_err(|e| format!("تعذر إنشاء عملية تسوية الشركة: {e}"))?;
    let time_str = Local::now().format("%H:%M").to_string();

    // 1. Create company withdrawal with special note
    // Audit fix #8: source_id must be a unique identifier (the row's own id), never a
    // name-based value. Two settlements for the same company previously shared one
    // source_id, so source-based deletes/updates could hit unrelated settlements.
    let note = format!(
        "تسديد {} من قبل {}",
        company_name.trim(),
        funder_name.trim()
    );
    let company_note = note.clone();
    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_id, source_role, affects_qasa, affects_partner_cash,
            affects_profit, account_id, operation_id
         )
         VALUES (
            ?1, 'شركة', 'سحب', ?2, ?3, ?4, ?5, ?6, 'نقدا',
            'company_funder_settlement', '', 'company_account_movement', 0, 0, 0, ?7, ?8
         )",
        params![
            company_name.trim(),
            amount,
            date.trim(),
            &time_str,
            &company_note,
            curr,
            company_account_id,
            &operation_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let company_tx_id = db.last_insert_rowid();
    db.execute(
        "UPDATE partner_transactions
         SET source_id = ?1, source_entity_id = ?2
         WHERE id = ?2",
        params![company_tx_id.to_string(), company_tx_id],
    )
    .map_err(|e| e.to_string())?;
    record_partner_ledger_entries(&db, company_tx_id)?;
    db.execute(
        "UPDATE financial_ledger SET operation_id=?1, account_id_v2=?2
         WHERE reference_type='partner_transaction' AND reference_entity_id=?3",
        params![&operation_id, company_account_id, company_tx_id],
    )
    .map_err(|e| e.to_string())?;
    recalculate_partner_total(&db, company_name.trim(), "شركة")?;

    // 2. Create funder deposit (funder pays out to cover the company)
    let funder_note = note.clone();
    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_id, source_role, affects_qasa, affects_partner_cash,
            affects_profit, related_source_type, related_source_id, account_id, operation_id,
            related_entity_id
         )
         VALUES (
            ?1, 'ممول', 'ايداع', ?2, ?3, ?4, ?5, ?6, 'قاصه',
            'company_funder_settlement', '', 'funder_account_movement', 0, 0, 0,
            'partner_transaction', ?7, ?8, ?9, ?10
         )",
        params![
            funder_name.trim(),
            amount,
            date.trim(),
            &time_str,
            &funder_note,
            curr,
            company_tx_id.to_string(),
            funder_account_id,
            &operation_id,
            company_tx_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let funder_tx_id = db.last_insert_rowid();
    db.execute(
        "UPDATE partner_transactions
         SET source_id = ?1, source_entity_id = ?2
         WHERE id = ?2",
        params![funder_tx_id.to_string(), funder_tx_id],
    )
    .map_err(|e| e.to_string())?;
    record_partner_ledger_entries(&db, funder_tx_id)?;
    db.execute(
        "UPDATE financial_ledger SET operation_id=?1, account_id_v2=?2
         WHERE reference_type='partner_transaction' AND reference_entity_id=?3",
        params![&operation_id, funder_account_id, funder_tx_id],
    )
    .map_err(|e| e.to_string())?;
    recalculate_partner_total(&db, funder_name.trim(), "ممول")?;

    let audit_values = serde_json::json!({
        "company_account_id": company_account_id,
        "company_transaction_id": company_tx_id,
        "funder_account_id": funder_account_id,
        "funder_transaction_id": funder_tx_id,
        "amount": amount,
        "currency": curr,
        "date": date.trim(),
    })
    .to_string();
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "company_funder_settlement",
        Some(company_tx_id),
        "settle_company_through_funder",
        Some(&session_token),
        None,
        AuditEventDetails {
            operation_id: Some(&operation_id),
            account_id: Some(company_account_id),
            new_values_json: Some(&audit_values),
            ..Default::default()
        },
    )?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== AUTHENTICATION COMMANDS ====================
