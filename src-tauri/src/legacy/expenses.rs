//! `expenses` — legacy/mod.rs lines 13944–14678
use super::*;

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn add_expense(
    state: State<AppState>,
    description: String,
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    car_number: Option<String>,
    creation_token: Option<String>,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&description, "وصف المصروف")?;
    validate_positive_amount(amount, "المبلغ")?;
    validate_required_text(&date, "التاريخ")?;
    let currency_val = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency_val)?;

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    ensure_accounting_period_open(&db, &date)?;

    let creation_token = creation_token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    let idempotency_payload = serde_json::json!({
        "description": description.trim(),
        "amount": amount,
        "date": date.trim(),
        "notes": notes,
        "currency": currency_val,
        "car_number": car_number.as_deref().map(str::trim).filter(|value| !value.is_empty()),
    });
    if let IdempotencyClaim::Replay(_) = claim_idempotent_creation(
        &db,
        creation_token.as_deref(),
        "add_expense",
        &idempotency_payload,
    )? {
        return Ok(());
    }
    let (_current_date, current_time) = now_datetime();
    let operation_id = new_ledger_token("expense");
    db.execute(
        "INSERT INTO operations(id,operation_type,status,creation_token,actor_user_id)
         VALUES (?1,'expense_creation','active',?2,?3)",
        params![operation_id, creation_token.as_deref(), actor_user_id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(ref car_num) = car_number {
        let car_num = car_num.trim();
        if !car_num.is_empty() {
            let car_id = car_id_by_number(&db, car_num)?;
            // 1. تسجيل المصروف في جدول car_expenses أولاً
            // AUD-009 FIX: Include creation_token in INSERT so idempotency check works.
            db.execute(
                "INSERT INTO car_expenses
                 (car_id, car_number, description, amount, date, currency, time, creation_token, operation_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                 (
                    car_id,
                    car_num,
                    description.trim(),
                    amount,
                    date.trim(),
                    &currency_val,
                    &current_time,
                    creation_token.as_deref(),
                    &operation_id,
                ),
            )
            .map_err(|e| e.to_string())?;

            let exp_id = db.last_insert_rowid();

            // Phase 12: Use reference_type = "car_expense"
            record_ledger_entry(
                &db,
                date.trim(),
                &current_time,
                "inventory",
                Some(&car_id.to_string()),
                amount,
                Money::zero(),
                &currency_val,
                "car_expense",
                &exp_id.to_string(),
                "مصروف سيارة",
                &format!("مصروف سيارة {} - {}", car_num, description.trim()),
                notes.as_deref(),
            )?;

            record_ledger_entry(
                &db,
                date.trim(),
                &current_time,
                "cash",
                Some("قاصه"),
                Money::zero(),
                amount,
                &currency_val,
                "car_expense",
                &exp_id.to_string(),
                "دفع مصروف سيارة",
                &format!("دفع مصروف سيارة: {} - {}", car_num, description.trim()),
                notes.as_deref(),
            )?;

            if amount > Money::zero() {
                let expense_note =
                    car_expense_partner_note(&db, car_num, description.trim(), exp_id);
                distribute_to_partners_50_with_effects(
                    &db,
                    amount,
                    &currency_val,
                    date.trim(),
                    "قاصه",
                    "سحب مصروف",
                    &expense_note,
                    "car_expense",
                    &exp_id.to_string(),
                    "cash_payment",
                    true,  // affects_qasa
                    true,  // affects_partner_cash
                    false, // affects_profit
                )?;
            }

            db.execute(
                "UPDATE financial_ledger SET operation_id=?1
         WHERE reference_type='car_expense' AND reference_entity_id=?2",
                params![operation_id, exp_id.to_string()],
            )
            .map_err(|e| e.to_string())?;
            db.execute(
                "UPDATE partner_transactions SET operation_id=?1
         WHERE source_type='car_expense' AND source_entity_id=?2",
                params![operation_id, exp_id.to_string()],
            )
            .map_err(|e| e.to_string())?;

            // 3. إذا كانت السيارة مبيوعة، نقوم بتحديث تكلفة المبيعات (COGS)
            let sale_id: Option<i64> = db
                .query_row(
                    "SELECT active_sale_id FROM cars
                     WHERE id=?1 AND status='مبيوعة' AND active_sale_id IS NOT NULL",
                    [car_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| format!("تعذر التحقق من حالة السيارة بعد إضافة المصروف: {e}"))?;

            if let Some(sale_id) = sale_id {
                // Phase 3: Use comprehensive rebuild that also updates partner profit splits for cash sales
                rebuild_sold_car_accounting_after_cost_change(&db, car_id, sale_id)?;
            }

            append_audit_event_with_details(
                &db,
                actor_user_id,
                "car_expense",
                Some(exp_id),
                "add_expense",
                Some(&session_token),
                creation_token.as_deref(),
                AuditEventDetails {
                    operation_id: Some(&operation_id),
                    ..Default::default()
                },
            )?;
            complete_idempotent_creation(&db, creation_token.as_deref(), &exp_id.to_string())?;

            db.commit().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    // مصروف عام
    // Bug 14 (H12): General expenses must NOT carry a car_number — passing
    // &car_number here (which would be Some("") when the caller omitted it)
    // would link this general expense to whatever value happened to be in
    // car_number, causing confusion in car-expense queries that filter by
    // `car_number IS NULL OR car_number = ''`. Pass None instead.
    // AUD-009 FIX: Include creation_token in INSERT so idempotency check works.
    db.execute(
        "INSERT INTO expenses
         (description, amount, date, time, notes, currency, car_number, creation_token, operation_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8)",
        (
            description.trim(),
            amount,
            date.trim(),
            &current_time,
            notes.as_deref(),
            &currency_val,
            creation_token.as_deref(),
            &operation_id,
        ),
    )
    .map_err(|e| e.to_string())?;

    let exp_id = db.last_insert_rowid();

    // القيد الأول: مدين مصروف عام
    record_ledger_entry(
        &db,
        date.trim(),
        &current_time,
        "expense",
        Some(description.trim()),
        amount,
        Money::zero(),
        &currency_val,
        "expense",
        &exp_id.to_string(),
        "مصروف عام",
        description.trim(),
        notes.as_deref(),
    )?;

    // القيد الثاني: دائن قاصه (نقدية)
    record_ledger_entry(
        &db,
        date.trim(),
        &current_time,
        "cash",
        Some("قاصه"),
        Money::zero(),
        amount,
        &currency_val,
        "expense",
        &exp_id.to_string(),
        "دفع مصروف",
        &format!("دفع مصروف: {}", description.trim()),
        notes.as_deref(),
    )?;

    // Phase 13: Use source fields for partner transactions
    if amount > Money::zero() {
        let expense_note = format!("سحب مصروف {} (رقم المصروف: {})", description.trim(), exp_id);
        distribute_to_partners_50_with_effects(
            &db,
            amount,
            &currency_val,
            date.trim(),
            "قاصه",
            "سحب مصروف",
            &expense_note,
            "expense",
            &exp_id.to_string(),
            "cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    }

    db.execute(
        "UPDATE financial_ledger SET operation_id=?1
         WHERE reference_type='expense' AND reference_entity_id=?2",
        params![operation_id, exp_id.to_string()],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE partner_transactions SET operation_id=?1
         WHERE source_type='expense' AND source_entity_id=?2",
        params![operation_id, exp_id.to_string()],
    )
    .map_err(|e| e.to_string())?;
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "expense",
        Some(exp_id),
        "add_expense",
        Some(&session_token),
        creation_token.as_deref(),
        AuditEventDetails {
            operation_id: Some(&operation_id),
            ..Default::default()
        },
    )?;
    complete_idempotent_creation(&db, creation_token.as_deref(), &exp_id.to_string())?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_expenses(state: State<AppState>) -> Result<Vec<ExpenseEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, description, amount, date, COALESCE(time, '00:00'), notes,
                         currency, car_number, version FROM expenses
             WHERE COALESCE(is_reversed,0)=0 AND reverses_expense_id IS NULL
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let expenses = stmt
        .query_map([], |row| {
            Ok(ExpenseEntry {
                id: row.get(0)?,
                description: row.get(1)?,
                amount: row.get(2)?,
                date: row.get(3)?,
                time: row.get(4)?,
                notes: row.get(5)?,
                currency: row.get(6)?,
                car_number: row.get(7)?,
                version: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(expenses)
}

#[tauri::command]
pub fn delete_expense(
    state: State<AppState>,
    id: i64,
    expected_version: i64,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    let (description, amount, notes, currency, current_version): (
        String,
        Money,
        Option<String>,
        String,
        i64,
    ) = db
        .query_row(
            "SELECT description,amount,notes,COALESCE(currency,'IQD'),version
             FROM expenses
             WHERE id=?1 AND reverses_expense_id IS NULL AND COALESCE(is_reversed,0)=0",
            [id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|_| "المصروف المطلوب حذفه غير موجود".to_string())?;
    if current_version != expected_version {
        return Err(format!(
            "تعارض إصدار المصروف: المتوقع {expected_version} والحالي {current_version}"
        ));
    }
    let (reversal_date, reversal_time) = now_datetime();
    ensure_accounting_period_open(&db, &reversal_date)?;

    let reversal_operation_id = new_ledger_token("expense_reversal");
    db.execute(
        "INSERT INTO operations(id,operation_type,status,reverses_operation_id)
         SELECT ?1,'expense_reversal','active',operation_id FROM expenses WHERE id=?2",
        params![reversal_operation_id, id],
    )
    .map_err(|e| e.to_string())?;

    let reversed_partner_rows = append_partner_transaction_reversals_by_source(
        &db,
        "expense",
        &id.to_string(),
        "cash_payment",
        &reversal_operation_id,
    )?;
    if reversed_partner_rows == 0 {
        return Err("تعذر عكس المصروف: لا توجد حركات شركاء أصلية مرتبطة رقميًا".to_string());
    }

    reverse_ledger_entries(&db, "expense", &id.to_string())?;
    let reversed_ledger_rows = db
        .execute(
            "UPDATE financial_ledger
             SET operation_id=?1
         WHERE reference_type='expense' AND reference_entity_id=?2
               AND reverses_ledger_id IS NOT NULL AND operation_id IS NULL",
            params![reversal_operation_id, id.to_string()],
        )
        .map_err(|e| e.to_string())?;
    if reversed_ledger_rows == 0 {
        return Err("تعذر عكس المصروف: لا توجد قيود أصلية قابلة للعكس".to_string());
    }

    db.execute(
        "INSERT INTO expenses
         (description,amount,date,time,notes,currency,car_number,operation_id,
          reverses_expense_id,version)
         VALUES (?1,?2,?3,?4,?5,?6,NULL,?7,?8,1)",
        params![
            format!("عكس: {description}"),
            -amount,
            reversal_date,
            reversal_time,
            notes.as_deref().map(|value| format!("عكس: {value}")),
            currency,
            reversal_operation_id,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let reversal_expense_id = db.last_insert_rowid();

    let updated = db
        .execute(
            "UPDATE expenses
             SET is_reversed=1,reversal_operation_id=?1,version=version+1
             WHERE id=?2 AND version=?3 AND COALESCE(is_reversed,0)=0",
            params![reversal_operation_id, id, expected_version],
        )
        .map_err(|e| e.to_string())?;
    if updated != 1 {
        return Err("تعارض إصدار المصروف أثناء العكس".to_string());
    }

    db.execute(
        "UPDATE operations SET reversal_operation_id=?1 WHERE id=reverses_operation_id",
        [&reversal_operation_id],
    )
    .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

    let new_values_json = format!("{{\"reversal_expense_id\":{reversal_expense_id}}}");
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "expense",
        Some(id),
        "reverse_expense",
        Some(&session_token),
        None,
        AuditEventDetails {
            operation_id: Some(&reversal_operation_id),
            new_values_json: Some(&new_values_json),
            reason: Some("عكس المصروف"),
            ..Default::default()
        },
    )?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_expense(
    state: State<AppState>,
    id: i64,
    description: String,
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    expected_version: i64,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&description, "وصف المصروف")?;
    validate_positive_amount(amount, "المبلغ")?;
    validate_required_text(&date, "التاريخ")?;
    let currency_val = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency_val)?;

    // ============================================================
    // ATOMIC TRANSACTION — Delete and Rebuild policy
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    let (old_date, current_version): (String, i64) = db
        .query_row(
            "SELECT date,version FROM expenses WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "المصروف المطلوب تعديله غير موجود".to_string())?;
    if current_version != expected_version {
        return Err(format!(
            "تعارض إصدار المصروف: المتوقع {expected_version} والحالي {current_version}"
        ));
    }
    ensure_accounting_period_open(&db, &old_date)?;
    ensure_accounting_period_open(&db, &date)?;
    let (_, current_time) = now_datetime();

    // 1. Delete old partner transactions WITH their ledger entries
    delete_partner_transactions_by_source_with_ledger(
        &db,
        "expense",
        &id.to_string(),
        Some("cash_payment"),
    )?;

    // 2. Delete old expense ledger entries (clean rebuild, not reverse)
    delete_ledger_entries(&db, "expense", &id.to_string())?;

    // 3. تحديث جدول المصروفات
    // Audit fix #27: also refresh the `time` column so the time-aware profit
    // period filters see the updated timestamp, not a stale one.
    let updated = db
        .execute(
            "UPDATE expenses SET description = ?1, amount = ?2, date = ?3, time = ?4,
         notes = ?5, currency = ?6, version=version+1,
         updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
         WHERE id = ?7 AND version=?8",
            params![
                description.trim(),
                amount,
                date.trim(),
                &current_time,
                notes.as_deref().map(|s| s.trim()),
                &currency_val,
                id,
                expected_version,
            ],
        )
        .map_err(|e| e.to_string())?;
    if updated != 1 {
        return Err("تعارض إصدار المصروف؛ أعد تحميل البيانات".to_string());
    }

    // 4. كتابة القيد الجديد في دفتر الأستاذ
    record_ledger_entry(
        &db,
        date.trim(),
        &current_time,
        "expense",
        Some(description.trim()),
        amount,
        Money::zero(),
        &currency_val,
        "expense",
        &id.to_string(),
        "مصروف عام",
        description.trim(),
        notes.as_deref(),
    )?;

    record_ledger_entry(
        &db,
        date.trim(),
        &current_time,
        "cash",
        Some("قاصه"),
        Money::zero(),
        amount,
        &currency_val,
        "expense",
        &id.to_string(),
        "دفع مصروف",
        &format!("دفع مصروف: {}", description.trim()),
        notes.as_deref(),
    )?;

    // 5. إعادة توزيع 50% من المصروف على حسابات الشركاء
    if amount > Money::zero() {
        let expense_note = format!("سحب مصروف {} (رقم المصروف: {})", description.trim(), id);
        distribute_to_partners_50_with_effects(
            &db,
            amount,
            &currency_val,
            date.trim(),
            "قاصه",
            "سحب مصروف",
            &expense_note,
            "expense",
            &id.to_string(),
            "cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    }

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn apply_car_expense_changes(
    state: State<AppState>,
    car_id: i64,
    mut delete_ids: Vec<i64>,
    delete_versions: Option<HashMap<i64, i64>>,
    additions: Vec<CarExpenseChangeInput>,
    creation_token: Option<String>,
    session_token: String,
) -> Result<(), String> {
    for item in &additions {
        validate_required_text(&item.description, "وصف مصروف السيارة")?;
        validate_positive_amount(item.amount, "مبلغ مصروف السيارة")?;
        validate_required_text(&item.date, "تاريخ مصروف السيارة")?;
        validate_currency(item.currency.as_deref().unwrap_or("IQD"))?;
    }

    delete_ids.sort_unstable();
    delete_ids.dedup();
    let delete_versions = delete_versions.unwrap_or_default();
    let deletion_claims = delete_ids
        .iter()
        .map(|id| {
            delete_versions
                .get(id)
                .copied()
                .map(|expected_version| {
                    serde_json::json!({
                        "id": id,
                        "expected_version": expected_version,
                    })
                })
                .ok_or_else(|| format!("نسخة مصروف السيارة رقم {id} مطلوبة للحذف"))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let idempotency_payload = serde_json::json!({
        "car_id": car_id,
        "deletions": deletion_claims,
        "additions": additions.iter().map(|item| serde_json::json!({
            "description": item.description.trim(),
            "amount": item.amount,
            "date": item.date.trim(),
            "currency": item.currency.as_deref().unwrap_or("IQD"),
        })).collect::<Vec<_>>(),
    });

    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    for item in &additions {
        ensure_accounting_period_open(&db, &item.date)?;
    }

    let creation_token = creation_token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    if let IdempotencyClaim::Replay(_) = claim_idempotent_creation(
        &db,
        creation_token.as_deref(),
        "apply_car_expense_changes",
        &idempotency_payload,
    )? {
        append_audit_event(
            &db,
            actor_user_id,
            "car_expense",
            None,
            "apply_car_expense_changes.idempotent_retry",
            Some(&session_token),
            creation_token.as_deref(),
        )?;
        db.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Resolve the immutable database identity exactly once. Plate and chassis
    // are intentionally not accepted as identity inputs because both may be
    // duplicated across independent purchase cycles.
    let resolved_car_number: String = db
        .query_row(
            "SELECT car_number FROM cars WHERE id = ?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|_| format!("تعذر العثور على السيارة ذات المعرّف {}", car_id))?;

    if delete_ids.is_empty() && additions.is_empty() {
        complete_idempotent_creation(&db, creation_token.as_deref(), "no_changes")?;
        db.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let change_operation_id = new_ledger_token("car_expense_change");
    db.execute(
        "INSERT INTO operations(id,operation_type,status,creation_token,actor_user_id,created_at)
         VALUES (?1,'car_expense_change','active',?2,?3,
                 strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        params![
            change_operation_id,
            creation_token.as_deref(),
            actor_user_id
        ],
    )
    .map_err(|e| format!("تعذر إنشاء هوية عملية مصروفات السيارة: {e}"))?;

    if !delete_ids.is_empty() {
        let (reversal_date, _) = now_datetime();
        ensure_accounting_period_open(&db, &reversal_date)?;
    }
    for id in delete_ids {
        let expected_version = *delete_versions
            .get(&id)
            .ok_or_else(|| format!("نسخة مصروف السيارة رقم {id} مطلوبة للحذف"))?;
        let (expense_car_id, description, amount, expense_currency, current_version, operation_id):
            (i64, String, Money, String, i64, Option<String>) = db
            .query_row(
                "SELECT car_id,description,amount,COALESCE(currency,'IQD'),version,operation_id
                 FROM car_expenses
                 WHERE id=?1 AND COALESCE(is_reversed,0)=0
                   AND reverses_car_expense_id IS NULL",
                [id],
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
            .map_err(|_| format!("مصروف السيارة رقم {} غير موجود", id))?;
        if expense_car_id != car_id {
            return Err(format!("المصروف رقم {} لا يخص السيارة المحددة", id));
        }
        if current_version != expected_version {
            return Err(format!(
                "تعارض إصدار مصروف السيارة رقم {id}: النسخة الحالية {current_version} وليست {expected_version}"
            ));
        }

        let (reversal_date, reversal_time) = now_datetime();
        append_partner_transaction_reversals_by_source(
            &db,
            "car_expense",
            &id.to_string(),
            "cash_payment",
            &change_operation_id,
        )?;
        reverse_ledger_entries(&db, "car_expense", &id.to_string())?;
        db.execute(
            "UPDATE financial_ledger SET operation_id=?1
             WHERE reverses_ledger_id IN (
                 SELECT original.id FROM financial_ledger original
                 WHERE original.reference_type='car_expense' AND original.reference_entity_id=?2
             )",
            params![change_operation_id, id.to_string()],
        )
        .map_err(|e| format!("تعذر ربط قيود عكس مصروف السيارة: {e}"))?;
        db.execute(
            "INSERT INTO car_expenses
             (car_id,car_number,description,amount,date,currency,time,operation_id,
              version,is_reversed,reverses_car_expense_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,1,?9)",
            params![
                car_id,
                resolved_car_number,
                format!("عكس: {description}"),
                -amount,
                reversal_date,
                expense_currency,
                reversal_time,
                change_operation_id,
                id,
            ],
        )
        .map_err(|e| format!("تعذر إضافة صف عكس مصروف السيارة: {e}"))?;
        let affected = db
            .execute(
                "UPDATE car_expenses
                 SET is_reversed=1,reversal_operation_id=?1,version=version+1,
                     updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id=?2 AND car_id=?3 AND version=?4 AND COALESCE(is_reversed,0)=0",
                params![change_operation_id, id, car_id, expected_version],
            )
            .map_err(|e| format!("تعذر وسم مصروف السيارة كمعكوس: {e}"))?;
        if affected != 1 {
            return Err(format!("تعارض إصدار مصروف السيارة رقم {id} أثناء العكس"));
        }
        db.execute(
            "UPDATE operations
             SET status='reversed',reversed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 reversal_operation_id=?1
             WHERE id=?2 AND status='active'",
            params![change_operation_id, operation_id],
        )
        .map_err(|e| format!("تعذر وسم عملية مصروف السيارة كمعكوسة: {e}"))?;
    }

    let (_, current_time) = now_datetime();
    // CRITICAL-2: track whether we've already stored the creation_token on the
    // FIRST inserted car_expenses row. The schema's UNIQUE partial index on
    // creation_token means only one row can carry the token; subsequent rows
    // in the same request leave it NULL (they're guarded by the transaction).
    let mut added_first_iteration_done = false;
    for item in additions {
        let currency = item.currency.unwrap_or_else(|| "IQD".to_string());
        // CRITICAL-2: write creation_token into the car_expenses row itself,
        // so the idempotency check at the top of this function can find it on
        // retry. The previous INSERT omitted this column entirely.
        let token_for_this_row: Option<&str> = if !added_first_iteration_done {
            creation_token.as_deref()
        } else {
            None
        };
        db.execute(
            "INSERT INTO car_expenses
             (car_id,car_number,description,amount,date,currency,time,creation_token,operation_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                car_id,
                resolved_car_number.as_str(),
                item.description.trim(),
                item.amount,
                item.date.trim(),
                currency.as_str(),
                current_time.as_str(),
                token_for_this_row,
                change_operation_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        let expense_id = db.last_insert_rowid();
        added_first_iteration_done = true;

        record_ledger_entry(
            &db,
            item.date.trim(),
            &current_time,
            "inventory",
            Some(resolved_car_number.as_str()),
            item.amount,
            Money::zero(),
            &currency,
            "car_expense",
            &expense_id.to_string(),
            "مصروف سيارة",
            &format!(
                "مصروف سيارة {} - {}",
                resolved_car_number,
                item.description.trim()
            ),
            None,
        )?;
        record_ledger_entry(
            &db,
            item.date.trim(),
            &current_time,
            "cash",
            Some("قاصه"),
            Money::zero(),
            item.amount,
            &currency,
            "car_expense",
            &expense_id.to_string(),
            "دفع مصروف سيارة",
            &format!(
                "دفع مصروف سيارة: {} - {}",
                resolved_car_number,
                item.description.trim()
            ),
            None,
        )?;

        let expense_note = car_expense_partner_note(
            &db,
            &resolved_car_number,
            item.description.trim(),
            expense_id,
        );
        distribute_to_partners_50_with_effects(
            &db,
            item.amount,
            &currency,
            item.date.trim(),
            "قاصه",
            "سحب مصروف",
            &expense_note,
            "car_expense",
            &expense_id.to_string(),
            "cash_payment",
            true,
            true,
            false,
        )?;
        db.execute(
            "UPDATE partner_transactions SET operation_id=?1
         WHERE source_type='car_expense' AND source_entity_id=?2",
            params![change_operation_id, expense_id.to_string()],
        )
        .map_err(|e| format!("تعذر ربط حركات شركاء مصروف السيارة: {e}"))?;
        db.execute(
            "UPDATE financial_ledger SET operation_id=?1
         WHERE (reference_type='car_expense' AND reference_entity_id=?2)
            OR (reference_type='partner_transaction' AND reference_entity_id IN (
                SELECT id FROM partner_transactions
                WHERE source_type='car_expense' AND source_entity_id=?2))",
            params![change_operation_id, expense_id.to_string()],
        )
        .map_err(|e| format!("تعذر ربط قيود مصروف السيارة: {e}"))?;
    }

    let active_sale_id: Option<i64> = db
        .query_row(
            "SELECT active_sale_id FROM cars
             WHERE id=?1 AND status='مبيوعة' AND active_sale_id IS NOT NULL",
            [car_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    if let Some(sale_id) = active_sale_id {
        rebuild_sold_car_accounting_after_cost_change(&db, car_id, sale_id)?;
    }
    recalculate_all_partners(&db)?;

    // FORENSIC FIX (re-audit 2026-07-11, AUDIT-TRAIL-4):
    // Audit-trail the car expense change — record actor, command, session, and
    // creation_token so the mutation can be traced back to its originator.
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "car_expense",
        None,
        "apply_car_expense_changes",
        Some(&session_token),
        creation_token.as_deref(),
        AuditEventDetails {
            operation_id: Some(&change_operation_id),
            reason: Some("تطبيق حزمة تغييرات مصروفات السيارة"),
            ..Default::default()
        },
    )?;

    complete_idempotent_creation(&db, creation_token.as_deref(), &change_operation_id)?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_car_expense_records(
    state: State<AppState>,
    car_id: i64,
) -> Result<Vec<CarExpenseRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, car_id, car_number, description, amount, date, currency,version
             FROM car_expenses
             WHERE car_id=?1 AND COALESCE(is_reversed,0)=0
               AND reverses_car_expense_id IS NULL
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let records = stmt
        .query_map([car_id], |row| {
            Ok(CarExpenseRecord {
                id: row.get(0)?,
                car_id: row.get(1)?,
                car_number: row.get(2)?,
                description: row.get(3)?,
                amount: row.get(4)?,
                date: row.get(5)?,
                currency: row.get(6)?,
                version: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(records)
}
