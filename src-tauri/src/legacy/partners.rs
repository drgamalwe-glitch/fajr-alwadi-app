//! `partners` — legacy/mod.rs lines 8749–9955
use super::*;

#[tauri::command]
pub fn add_partner(
    state: State<AppState>,
    name: String,
    phone: String,
    kind: String,
    session_token: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    let name = name.trim();
    let phone = normalize_phone_digits(&phone);
    let kind = kind.trim();

    if kind == "شريك" {
        return Err("لا يمكن إنشاء حساب شريك جديد".to_string());
    }

    ensure_partner_exists(&db, name, &phone, kind)?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_partners(state: State<AppState>) -> Result<Vec<Partner>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    // NOTE: Read-only function — must NOT call recalculate_all_partners or any write operation

    let mut stmt = db
        .prepare(
            "SELECT p.partner_name, p.phone, p.total_amount, p.kind,
                    COALESCE(p.iqd_balance, '0'),
                    COALESCE(p.usd_balance, '0'),a.version
             FROM partners p JOIN accounts a ON a.id=p.account_id
             ORDER BY p.rowid ASC",
        )
        .map_err(|e| e.to_string())?;

    let partner_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Money>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Money>(4)?,
                row.get::<_, Money>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut partners = Vec::with_capacity(partner_rows.len());
    for (partner_name, phone, total_amount, kind, iqd_balance, usd_balance, version) in partner_rows
    {
        let total_withdrawals = sum_money_rows(
            &db,
            "SELECT amount FROM partner_transactions
             WHERE partner_name=?1 AND kind=?2 AND type LIKE 'سحب%'
               AND COALESCE(is_reversed,0)=0",
            params![partner_name, kind],
        )?;
        partners.push(Partner {
            partner_name,
            phone,
            total_amount,
            kind,
            total_withdrawals,
            iqd_balance,
            usd_balance,
            version,
        });
    }

    Ok(partners)
}

pub fn customer_balance_for_currency(
    db: &Connection,
    partner_name: Option<&str>,
    currency: &str,
) -> Result<Money, String> {
    borrower_balance_for_currency(db, partner_name, Some("زبون"), currency)
}

#[tauri::command]
pub fn get_unified_accounts(state: State<AppState>) -> Result<Vec<UnifiedAccount>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .prepare(
            "SELECT p.partner_name, p.phone, p.kind, a.version FROM partners p
         JOIN accounts a ON a.id=p.account_id
         WHERE kind = 'ممول' OR kind = 'شركة' OR kind = 'مستثمر' OR kind = 'زبون' OR kind = 'وكالة'
         ORDER BY p.rowid ASC",
        )
        .map_err(|e| e.to_string())?;

    let partners_list = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    let mut accounts = Vec::new();

    for (name, phone, kind, version) in partners_list {
        let (iqd_balance, usd_balance) = if is_borrower_account_kind(&kind) {
            (
                borrower_balance_for_currency(&db, Some(&name), Some(&kind), "IQD")?,
                borrower_balance_for_currency(&db, Some(&name), Some(&kind), "USD")?,
            )
        } else {
            // Non-customer: use partner_transactions logic
            let mut tx_stmt = db
                .prepare(
                    "SELECT original.type,original.amount,original.currency,original.notes
                 FROM partner_transactions original
                 WHERE original.partner_name=?1 AND original.kind=?2
                   AND original.reverses_transaction_id IS NULL
                   AND COALESCE(original.is_reversed,0)=0
                   AND NOT EXISTS (
                       SELECT 1 FROM partner_transactions reversal
                       WHERE reversal.reverses_transaction_id=original.id
                   )",
                )
                .map_err(|e| e.to_string())?;

            let rows = tx_stmt
                .query_map(params![name, kind], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Money>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                })
                .map_err(|e| e.to_string())?;

            let mut iqd_balance = Money::zero();
            let mut usd_balance = Money::zero();

            for r in rows {
                let (tx_type, amount, currency_opt, _notes_opt) = r.map_err(|e| e.to_string())?;
                let curr = currency_opt.unwrap_or_else(|| "IQD".to_string());
                let is_usd = curr == "USD";

                let signed = match kind.as_str() {
                    "مستثمر" | "ممول" | "شركة" => {
                        if tx_type.starts_with("ايداع")
                            || tx_type.starts_with("إيداع")
                            || tx_type.starts_with("مقدمة")
                            || tx_type.starts_with("استلام")
                            || tx_type.starts_with("إستلام")
                            || tx_type.starts_with("إعادة استثمار")
                            || tx_type.starts_with("تسوية")
                            || tx_type.starts_with("تسديد")
                        {
                            -amount
                        } else if tx_type.starts_with("سحب") || tx_type.starts_with("باقي") {
                            amount
                        } else {
                            continue;
                        }
                    }
                    _ => continue,
                };

                if is_usd {
                    usd_balance += signed;
                } else {
                    iqd_balance += signed;
                }
            }
            (iqd_balance, usd_balance)
        };

        accounts.push(UnifiedAccount {
            partner_name: name,
            phone,
            iqd_balance,
            usd_balance,
            kind,
            version,
        });
    }

    Ok(accounts)
}

#[tauri::command]
pub fn delete_partner(
    state: State<AppState>,
    name: String,
    kind: String,
    session_token: String,
) -> Result<(), String> {
    let kind = kind.trim().to_string();
    let name = name.trim().to_string();
    if kind == "شريك" {
        return Err("لا يمكن حذف حساب شريك".to_string());
    }
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    let account_id = partner_account_id(&db, &name, &kind)?;

    // Bug Q: Block deleting customer only when customer-account logic still shows debt.
    // Some legacy receivable ledger rows can remain after all installments are marked "واصل".
    // In that case the account is settled and deletion should clean those stale receivable rows.
    if is_borrower_account_kind(&kind) {
        let account_label = if kind == "وكالة" {
            "وكالة"
        } else {
            "زبون"
        };
        let customer_remaining = sum_money_rows(
            &db,
            "SELECT amount FROM partner_transactions
                 WHERE account_id = ?1
                   AND (type LIKE 'باقي%' OR type LIKE 'سحب%')
                   AND type NOT LIKE 'تحويل%'",
            [account_id],
        )?;
        if customer_remaining.abs() > MONEY_STRICT_EPSILON {
            return Err(format!("لا يمكن حذف حساب {} لديه رصيد مستحق", account_label));
        }

        let receivable = sum_money_difference_rows(
            &db,
            "SELECT debit, credit FROM financial_ledger
             WHERE account_type = 'receivable' AND account_id_v2 = ?1",
            [account_id],
        )?;
        if receivable.abs() > MONEY_STRICT_EPSILON {
            return Err(format!(
                "لا يمكن حذف حساب {account_label} لديه أثر تاريخي في دفتر الأستاذ"
            ));
        }
    }

    // Bug S: Block deleting investor with active balance (net balance)
    if kind == "مستثمر" {
        let balance = sum_money_difference_rows(
            &db,
            "SELECT credit, debit FROM financial_ledger
             WHERE account_type = 'investor' AND account_id_v2 = ?1",
            [account_id],
        )?;
        if balance.abs() > MONEY_STRICT_EPSILON {
            return Err("لا يمكن حذف حساب مستثمر لديه رصيد مستحق في دفتر الأستاذ".to_string());
        }
    }

    // Bug R: Block deleting funder/company with active payable (net balance)
    if kind == "ممول" || kind == "شركة" {
        let account_type = if kind == "ممول" {
            "funder"
        } else {
            "payable"
        };
        let ledger_balance = sum_money_difference_rows(
            &db,
            "SELECT credit, debit FROM financial_ledger
             WHERE account_type = ?1 AND account_id_v2 = ?2",
            params![account_type, account_id],
        )?;
        let tx_balance = sum_typed_money_rows(
            &db,
            "SELECT type, amount
                 FROM partner_transactions
                 WHERE account_id = ?1 AND type NOT LIKE 'تحويل%'",
            [account_id],
            false,
        )?;
        if ledger_balance.abs() > MONEY_STRICT_EPSILON || tx_balance.abs() > MONEY_STRICT_EPSILON {
            let msg = if kind == "ممول" {
                "لا يمكن حذف حساب ممول لديه رصيد مستحق في دفتر الأستاذ"
            } else {
                "لا يمكن حذف حساب شركة لديه رصيد مستحق في دفتر الأستاذ"
            };
            return Err(msg.to_string());
        }
    }

    let historical_rows: i64 = db
        .query_row(
            "SELECT
                (SELECT COUNT(*) FROM partner_transactions
                 WHERE account_id=?1)
              + (SELECT COUNT(*) FROM financial_ledger
                 WHERE account_id_v2=?1)",
            [account_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if historical_rows != 0 {
        return Err("لا يمكن حذف حساب له سجل مالي؛ استخدم الإلغاء المحاسبي".to_string());
    }
    db.execute("DELETE FROM partners WHERE account_id = ?1", [account_id])
        .map_err(|e| e.to_string())?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn partner_account_id(db: &Connection, partner_name: &str, kind: &str) -> Result<i64, String> {
    let existing: Option<i64> = db
        .query_row(
            "SELECT account_id FROM partners WHERE partner_name=?1 AND kind=?2",
            params![partner_name.trim(), kind.trim()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    if let Some(account_id) = existing {
        return Ok(account_id);
    }
    let partner_exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM partners WHERE partner_name=?1 AND kind=?2)",
            params![partner_name.trim(), kind.trim()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !partner_exists {
        return Err("الحساب غير موجود أو بلا معرّف رقمي".to_string());
    }
    let normalized_name = normalize_account_name(partner_name);
    let account: Option<(i64, String)> = db
        .query_row(
            "SELECT id,account_type FROM accounts WHERE normalized_name=?1",
            [&normalized_name],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let account_id = match account {
        Some((id, account_type)) if account_type == kind.trim() => id,
        Some(_) => return Err("اسم الحساب مرتبط بنوع آخر؛ رفض الربط الملتبس".to_string()),
        None => {
            db.execute(
                "INSERT INTO accounts(display_name,normalized_name,account_type)
                 VALUES (?1,?2,?3)",
                params![partner_name.trim(), normalized_name, kind.trim()],
            )
            .map_err(|e| e.to_string())?;
            db.last_insert_rowid()
        }
    };
    let updated = db
        .execute(
            "UPDATE partners SET account_id=?1
             WHERE partner_name=?2 AND kind=?3 AND account_id IS NULL",
            params![account_id, partner_name.trim(), kind.trim()],
        )
        .map_err(|e| e.to_string())?;
    if updated != 1 {
        return Err("تعذر تثبيت account_id للحساب بصورة وحيدة".to_string());
    }
    Ok(account_id)
}

pub fn recalculate_partner_total(
    db: &Connection,
    partner_name: &str,
    kind: &str,
) -> Result<(), String> {
    let account_id = match partner_account_id(db, partner_name, kind) {
        Ok(account_id) => account_id,
        Err(error) => {
            let identity_migration_complete: bool = db
                .query_row(
                    "SELECT COALESCE(MAX(version),0)>=41 FROM db_version",
                    [],
                    |row| row.get(0),
                )
                .map_err(|db_error| {
                    format!("تعذر التحقق من اكتمال ترحيل هوية الحسابات: {db_error}")
                })?;
            if !identity_migration_complete {
                return Ok(());
            }
            return Err(error);
        }
    };
    let balance_for = |currency: &str| -> Result<Money, String> {
        if is_borrower_account_kind(kind) {
            return borrower_balance_for_account_currency(db, account_id, currency);
        }
        let deposit_minus_withdrawal = sum_typed_money_rows(
            db,
            "SELECT type, amount
                 FROM partner_transactions
                 WHERE account_id=?1
                   AND COALESCE(currency, 'IQD')=?2
                   AND (?3<>'شريك' OR affects_partner_cash=1)
                   AND type NOT LIKE 'تحويل%'
                   AND COALESCE(is_reversed,0)=0",
            params![account_id, currency, kind.trim()],
            true,
        )?;
        Ok(if kind == "شريك" {
            deposit_minus_withdrawal
        } else {
            -deposit_minus_withdrawal
        })
    };
    let iqd_balance = balance_for("IQD")?;
    let usd_balance = balance_for("USD")?;

    db.execute(
        "UPDATE partners SET total_amount = ?1, iqd_balance = ?2, usd_balance = ?3 WHERE account_id = ?4",
        params![
            iqd_balance + usd_balance,
            iqd_balance,
            usd_balance,
            account_id
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn recalculate_all_partners(db: &Connection) -> Result<(), String> {
    let mut stmt = db
        .prepare("SELECT partner_name, kind FROM partners")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (name, kind) = row.map_err(|e| e.to_string())?;
        recalculate_partner_total(db, &name, &kind)?;
    }
    Ok(())
}

pub fn ledger_account_type_for_kind(kind: &str) -> Option<&'static str> {
    match kind {
        "زبون" | "وكالة" => Some("receivable"),
        "ممول" => Some("funder"),
        "شركة" => Some("payable"),
        "مستثمر" => Some("investor"),
        _ => None, // شريك does not map to a single ledger account type
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri IPC payload mirrors the editable account fields.
pub fn update_partner(
    state: State<AppState>,
    old_name: String,
    old_kind: String,
    name: String,
    phone: String,
    kind: String,
    expected_version: i64,
    session_token: String,
) -> Result<(), String> {
    let name = name.trim().to_string();
    let old_name = old_name.trim().to_string();
    let old_kind = old_kind.trim().to_string();
    let kind = kind.trim().to_string();

    if old_kind == "شريك" {
        if old_name != name {
            return Err("لا يمكن تغيير اسم شريك".to_string());
        }
        if old_kind != kind {
            return Err("لا يمكن تغيير نوع شريك".to_string());
        }
    }
    if kind == "شريك" && old_kind != "شريك" {
        return Err("لا يمكن تغيير نوع الحساب إلى شريك".to_string());
    }

    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (tx, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;

    let account_id = partner_account_id(&tx, &old_name, &old_kind)?;
    let current_version: i64 = tx
        .query_row(
            "SELECT version FROM accounts WHERE id=?1",
            [account_id],
            |row| row.get(0),
        )
        .map_err(|_| "الحساب غير موجود".to_string())?;
    if current_version != expected_version {
        return Err(format!(
            "تعارض تعديل الحساب: النسخة الحالية {current_version} وليست {expected_version}"
        ));
    }
    let normalized_name = normalize_account_name(&name);
    validate_required_text(&normalized_name, "اسم الحساب")?;
    let conflicting_account: Option<i64> = tx
        .query_row(
            "SELECT id FROM accounts WHERE normalized_name=?1 AND id<>?2",
            params![normalized_name, account_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if conflicting_account.is_some() {
        return Err("اسم الحساب مستخدم مسبقًا بعد التطبيع".to_string());
    }

    // Block kind change if ledger history exists
    if old_kind != kind {
        let old_account_type = ledger_account_type_for_kind(&old_kind);
        if let Some(acc_type) = old_account_type {
            let ledger_count: i64 = tx
                .query_row(
                    "SELECT COUNT(*) FROM financial_ledger
                     WHERE account_id_v2 = ?1 AND account_type = ?2",
                    params![account_id, acc_type],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|e| format!("تعذر التحقق من القيود المرتبطة بالحساب: {e}"))?;
            if ledger_count > 0 {
                return Err("لا يمكن تغيير نوع حساب لديه قيود مالية".to_string());
            }
        }
    }

    if old_name == name && old_kind == kind {
        tx.execute(
            "UPDATE partners SET phone = ?1 WHERE account_id = ?2",
            params![phone.trim(), account_id],
        )
        .map_err(|e| e.to_string())?;
        let changed = tx
            .execute(
                "UPDATE accounts SET phone=?1, version=version+1,
             updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
             WHERE id=?2 AND version=?3",
                params![phone.trim(), account_id, expected_version],
            )
            .map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err("تعارض تعديل الحساب أثناء الحفظ".to_string());
        }
        tx.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }

    tx.execute(
        "UPDATE partners SET partner_name = ?1, phone = ?2, kind = ?3 WHERE account_id = ?4",
        params![&name, phone.trim(), &kind, account_id],
    )
    .map_err(|e| e.to_string())?;
    let changed = tx
        .execute(
            "UPDATE accounts SET display_name=?1, normalized_name=?2, account_type=?3, phone=?4,
         version=version+1, updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
         WHERE id=?5 AND version=?6",
            params![
                name,
                normalized_name,
                kind,
                phone.trim(),
                account_id,
                expected_version
            ],
        )
        .map_err(|e| e.to_string())?;
    if changed != 1 {
        return Err("تعارض تعديل الحساب أثناء الحفظ".to_string());
    }
    tx.execute(
        "UPDATE partner_transactions SET partner_name = ?1, kind = ?2
         WHERE account_id = ?3 AND kind = ?4",
        params![&name, &kind, account_id, &old_kind],
    )
    .map_err(|e| e.to_string())?;
    if old_name != name {
        // Scope the ledger rename by mapped account_type
        if let Some(acc_type) = ledger_account_type_for_kind(&kind) {
            tx.execute(
                "UPDATE financial_ledger SET account_id = ?1
                 WHERE account_id_v2 = ?2 AND account_type = ?3",
                params![&name, account_id, acc_type],
            )
            .map_err(|e| e.to_string())?;
        }
        // Bug P: Update cars.buyer_name for sold cars linked to renamed customer
        if kind == "زبون" {
            tx.execute(
                "UPDATE cars SET buyer_name = ?1
                 WHERE active_sale_id IN (
                     SELECT id FROM car_sales WHERE customer_account_id = ?2
                 )",
                params![&name, account_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn add_partner_transaction(
    state: State<AppState>,
    partner_name: String,
    kind: String,
    type_: String,
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
    creation_token: Option<String>,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&partner_name, "اسم الشريك/العميل")?;
    validate_required_text(&kind, "نوع الحساب")?;
    validate_required_text(&type_, "نوع المعاملة")?;
    validate_positive_amount(amount, "المبلغ")?;
    validate_required_text(&date, "التاريخ")?;
    let curr = currency.as_deref().unwrap_or("IQD");
    validate_currency(curr)?;

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    ensure_accounting_period_open(&db, &date)?;
    let account_id = ensure_partner_exists(&db, partner_name.trim(), "", kind.trim())?;

    let creation_token = creation_token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    let idempotency_payload = serde_json::json!({
        "partner_name": partner_name.trim(),
        "kind": kind.trim(),
        "type": type_.trim(),
        "amount": amount,
        "date": date.trim(),
        "notes": notes.as_deref().map(str::trim),
        "currency": curr,
        "payment_type": payment_type.as_deref(),
    });
    if let IdempotencyClaim::Replay(_) = claim_idempotent_creation(
        &db,
        creation_token.as_deref(),
        "add_partner_transaction",
        &idempotency_payload,
    )? {
        append_audit_event(
            &db,
            actor_user_id,
            "partner_transaction",
            None,
            "add_partner_transaction.idempotent_retry",
            Some(&session_token),
            creation_token.as_deref(),
        )?;
        db.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let is_financier_repayment = kind.trim() == "ممول" && type_.trim().starts_with("سحب");
    let tx_payment_type = if is_financier_repayment {
        Some(payment_type.as_deref().unwrap_or("قاصه"))
    } else {
        payment_type.as_deref()
    };

    let time_str = Local::now().format("%H:%M").to_string();
    let classification = classify_partner_transaction(kind.trim(), type_.trim(), 0);
    let operation_id = new_ledger_token("partner_transaction");
    db.execute(
        "INSERT INTO operations(id,operation_type,status,creation_token)
         VALUES (?1,'partner_transaction','active',?2)",
        params![operation_id, creation_token.as_deref()],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_role, affects_qasa, affects_partner_cash, affects_profit,
            creation_token, account_id, operation_id
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            &time_str,
            notes.as_deref(),
            currency.as_deref(),
            tx_payment_type,
            classification.source_type,
            classification.source_role,
            classification.affects_qasa,
            classification.affects_partner_cash,
            classification.affects_profit,
            creation_token.as_deref(),
            account_id,
            operation_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let tx_id = db.last_insert_rowid();

    db.execute(
        "UPDATE partner_transactions SET source_id = ?1 WHERE id = ?2",
        params![tx_id.to_string(), tx_id],
    )
    .map_err(|e| e.to_string())?;

    // Ledger record
    record_partner_ledger_entries(&db, tx_id)?;
    db.execute(
        "UPDATE financial_ledger SET operation_id=?1, account_id_v2=?2
         WHERE reference_type='partner_transaction' AND reference_entity_id=?3",
        params![operation_id, account_id, tx_id.to_string()],
    )
    .map_err(|e| e.to_string())?;

    let curr = currency.as_deref().unwrap_or("IQD");
    apply_partner_transaction_splits(
        &db,
        tx_id,
        partner_name.trim(),
        kind.trim(),
        type_.trim(),
        amount,
        date.trim(),
        notes.as_deref(),
        curr,
        tx_payment_type.unwrap_or("قاصه"),
    )?;
    // The partner/company/funder split rows are accounting legs of the same
    // user action. Keep every generated transaction and ledger leg under the
    // parent operation so debit/credit balance is provable per operation.
    db.execute(
        "UPDATE partner_transactions
         SET operation_id=?1
         WHERE operation_id IS NULL
           AND source_entity_id=?2
           AND source_type IN ('company_payment','funder_payment')",
        params![operation_id, tx_id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE financial_ledger
         SET operation_id=?1
         WHERE operation_id IS NULL
           AND reference_type='partner_transaction'
           AND reference_entity_id IN (
               SELECT id FROM partner_transactions
               WHERE operation_id=?1
                 AND source_entity_id=?2
                 AND source_type IN ('company_payment','funder_payment')
           )",
        params![operation_id, tx_id],
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    // Audit trail — see §10.4 of the executive prompt.
    append_audit_event(
        &db,
        actor_user_id,
        "partner_transaction",
        Some(tx_id),
        "add_partner_transaction",
        None,
        creation_token.as_deref(),
    )?;
    complete_idempotent_creation(&db, creation_token.as_deref(), &tx_id.to_string())?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn distribute_financier_repayment_to_partners(
    db: &Connection,
    financier_name: &str,
    amount: Money,
    date: &str,
    currency: &str,
    notes: Option<&str>,
    tx_id: i64,
) -> Result<(), String> {
    if amount <= Money::zero() {
        return Ok(());
    }

    let commission_amount = parse_financier_commission(amount, notes)?;

    // Audit fix #3: make the commission expense idempotent. If a commission expense
    // already exists for this repayment transaction, remove it (with its ledger
    // entries and partner deduction rows) before re-creating it, so edits never
    // accumulate duplicate commission expenses that double-reduce net profit.
    if let Some(existing_exp_id) = find_financier_commission_expense_id(db, tx_id)? {
        append_expense_reversal(
            db,
            existing_exp_id,
            "إعادة بناء عمولة الممول مع منع التكرار",
        )?;
    }

    if commission_amount > Money::zero() {
        let current_time = Local::now().format("%H:%M").to_string();
        let exp_id = insert_financier_commission_expense(
            db,
            financier_name,
            commission_amount,
            date,
            &current_time,
            currency,
            tx_id,
        )?;

        record_ledger_entry(
            db,
            date,
            &current_time,
            "expense",
            Some("عمولة تسديد تمويل"),
            commission_amount,
            Money::zero(),
            currency,
            "expense",
            &exp_id.to_string(),
            "مصروف عام",
            &format!("عمولة ممول: {} ({})", financier_name, tx_id),
            None,
        )?;

        record_ledger_entry(
            db,
            date,
            &current_time,
            "cash",
            Some("قاصه"),
            Money::zero(),
            commission_amount,
            currency,
            "expense",
            &exp_id.to_string(),
            "دفع مصروف",
            &format!("عمولة ممول: {}", financier_name),
            None,
        )?;

        let commission_partner_note = format!("عمولة ممول: {}", financier_name);
        // Issue 5: Use source-aware helper instead of legacy deduct_from_partners_5050
        deduct_from_partners_5050_with_effects(
            db,
            commission_amount,
            currency,
            date,
            "قاصه",
            "سحب مصروف",
            &commission_partner_note,
            "expense",
            &exp_id.to_string(),
            "cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    }

    Ok(())
}

pub fn extract_car_number_from_notes(notes: &str) -> Option<String> {
    if let Some(pos) = notes.find("#بيع_سيارة_") {
        let start = pos + "#بيع_سيارة_".len();
        let rest = &notes[start..];
        let marker_end = rest.find(" | ").unwrap_or(rest.len());
        let value = rest[..marker_end].trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

/// Delete generated car PURCHASE partner transactions by source fields.
/// Only deletes source_type = 'car_purchase' AND source_id = car_number.
pub fn delete_generated_car_purchase_partner_transactions(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
    let mut stmt = db
        .prepare(
            "SELECT id FROM partner_transactions
             WHERE source_type = 'car_purchase'
           AND source_entity_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map([car_number], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for tx_id in ids {
        append_partner_transaction_reversal_by_id(db, tx_id, "إعادة بناء شراء السيارة")?;
    }
    Ok(())
}

/// Delete generated car SALE partner transactions by source fields.
/// Only deletes source_type = 'car_sale' AND source_id = car_number.
pub fn delete_generated_car_sale_partner_transactions(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
    let mut stmt = db
        .prepare(
            "SELECT id FROM partner_transactions
             WHERE source_type = 'car_sale'
           AND source_entity_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map([car_number], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for tx_id in ids {
        append_partner_transaction_reversal_by_id(db, tx_id, "إعادة بناء بيع السيارة")?;
    }
    Ok(())
}

pub fn delete_car_purchase_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    // CRITICAL-3 FIX: Insert reversal entries before deleting to preserve audit trail.
    reverse_and_delete_ledger_entries(
        db,
        "SELECT id, date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, notes
         FROM financial_ledger WHERE reference_type = 'car' AND reference_entity_id = :param
         AND reverses_ledger_id IS NULL
         AND (type_ IN ('شراء سيارة', 'شراء سيارة كاش', 'تمويل شراء سيارة', 'شراء سيارة عن طريق شركة')
              OR (type_ NOT LIKE '%بيع%' AND type_ NOT LIKE '%مدينون%' AND type_ NOT LIKE '%إيراد%'
                  AND type_ NOT LIKE '%تكلفة%' AND type_ NOT LIKE '%تخفيض%'
                  AND type_ NOT LIKE '%مخزون%' AND type_ NOT LIKE '%ارباح%'))",
        "car_number",
        car_number,
        &format!("عكس قيود شراء السيارة {} قبل إعادة البناء{}", car_number, ""),
    )?;
    Ok(())
}

pub fn delete_car_sale_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    // CRITICAL-3 FIX: Insert reversal entries before deleting to preserve audit trail.
    reverse_and_delete_ledger_entries(
        db,
        "SELECT id, date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, notes
         FROM financial_ledger WHERE reference_type = 'car' AND reference_entity_id = :param
         AND reverses_ledger_id IS NULL
         AND (type_ IN ('بيع سيارة', 'بيع سيارة كاش', 'مدينون بيع سيارة', 'إيراد مؤجل بيع سيارة',
                         'تكلفة المبيعات', 'تخفيض المخزون بيع سيارة')
              OR (type_ LIKE '%بيع%' OR type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%'
                  OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%'
                  OR type_ LIKE '%ارباح%'))",
        "car_number",
        car_number,
        &format!("عكس قيود بيع السيارة {} قبل إعادة البناء{}", car_number, ""),
    )?;
    Ok(())
}

/// FIX-4+5: حذف قيود بيع السيارة بالبحث عبر sale_id الرقمي.
///
/// `record_car_sale_ledger_entries` تُدرج القيود بـ reference_entity_id = sale_id،
/// لذا الحذف الصحيح يجب أن يستخدم sale_id وليس car_number النصي.
/// كانت `delete_car_sale_ledger_entries` تمرر car_number فلا تُطابق شيئاً →
/// كل تعديل يُضاعف قيود المخزون/الإيراد.
pub fn delete_car_sale_ledger_entries_by_sale_id(
    db: &Connection,
    sale_id: i64,
) -> Result<(), String> {
    let sale_id_str = sale_id.to_string();
    reverse_and_delete_ledger_entries(
        db,
        "SELECT id, date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, notes
         FROM financial_ledger
         WHERE reference_type = 'car'
           AND reference_entity_id = :param
           AND reverses_ledger_id IS NULL
           AND (type_ IN ('بيع سيارة', 'بيع سيارة كاش', 'مدينون بيع سيارة', 'إيراد مؤجل بيع سيارة',
                           'تكلفة المبيعات', 'تخفيض المخزون بيع سيارة', 'بيع سيارة - جزئي')
                OR type_ LIKE '%بيع%'
                OR type_ LIKE '%مدينون%'
                OR type_ LIKE '%إيراد%'
                OR type_ LIKE '%تكلفة%'
                OR type_ LIKE '%تخفيض%'
                OR type_ LIKE '%ارباح%')",
        "sale_id",
        &sale_id_str,
        &format!("عكس قيود بيع السيارة (sale_id={}) قبل إعادة البناء", sale_id),
    )?;
    Ok(())
}

/// Migrate all database references from old car number to new car number.
/// This ensures no stale source_id, related_source_id, car_number, or account_id
/// references remain after a car number change.
///
/// IMPORTANT:
/// - Does NOT overwrite source_id for customer_payment split rows (source_id = payment transaction id)
/// - For split rows, only related_source_id is updated
/// - Can be called repeatedly (idempotent for the target range)
pub fn migrate_car_number_references(
    db: &Connection,
    car_id: i64,
    new_car_number: &str,
) -> Result<(), String> {
    let new = new_car_number.trim();
    if new.is_empty() {
        return Ok(());
    }
    db.execute(
        "UPDATE car_expenses SET car_number = ?1 WHERE car_id = ?2",
        params![new, car_id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE expenses SET car_number = ?1 WHERE car_id = ?2",
        params![new, car_id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE car_partners SET car_number = ?1 WHERE car_id = ?2",
        params![new, car_id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE cars SET car_number=?1 WHERE id=?2",
        params![new, car_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn delete_sale_generated_customer_rows_for_car(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car' AND related_entity_id = ?1
               AND source_type IN ('customer_sale_payment', 'customer_installment_schedule')",
        )
        .map_err(|e| e.to_string())?;
    let customer_rows: Vec<(i64, String)> = stmt
        .query_map([car_number], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut buyers_to_recalc = std::collections::HashSet::new();
    for (cust_id, buyer_name) in &customer_rows {
        delete_customer_payment_partner_splits(db, *cust_id)?;
        delete_customer_payment_profit_splits(db, *cust_id)?;
        append_partner_transaction_reversal_by_id(
            db,
            *cust_id,
            "إعادة بناء حركة زبون مرتبطة بالسيارة",
        )?;
        buyers_to_recalc.insert(buyer_name.clone());
    }

    for buyer_name in buyers_to_recalc {
        recalculate_partner_total(db, &buyer_name, "زبون")?;
    }

    Ok(())
}
