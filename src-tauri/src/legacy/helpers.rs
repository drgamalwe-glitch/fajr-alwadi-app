//! `helpers` — legacy/mod.rs lines 3507–3975
use super::*;

/// Audit fix #20: accounting rebuild steps inside migrations must never fail
/// silently. Failures are logged so partial rebuilds leave an audit trail.
pub fn log_migration_step(step: &str, result: Result<(), String>) {
    if let Err(e) = result {
        eprintln!("[fajir-alwadi][migration] فشلت الخطوة '{}': {}", step, e);
        MIGRATION_STEP_ERROR.with(|error| {
            if error.borrow().is_none() {
                *error.borrow_mut() = Some(format!("{step}: {e}"));
            }
        });
    }
}

/// Audit note #10: transaction DIRECTION (deposit vs withdrawal) is derived from
/// the Arabic type prefix. This list is the single source of truth for the sign
/// convention — the inline SQL CASE expressions in get_financial_summary,
/// get_partners_totals, recalculate_partner_total and get_cash_register_entries
/// must always stay in sync with it. Rows whose type matches neither prefix set
/// are counted as ZERO everywhere (cards AND tabs), so totals stay consistent.
pub fn is_deposit_type(tx_type: &str) -> bool {
    tx_type.starts_with("ايداع")
        || tx_type.starts_with("إيداع")
        || tx_type.starts_with("مقدمة")
        || tx_type.starts_with("استلام")
        || tx_type.starts_with("إستلام")
        || tx_type.starts_with("إعادة استثمار")
        || tx_type.starts_with("تسوية")
        || tx_type.starts_with("تسديد")
}

pub fn is_withdrawal_type(tx_type: &str) -> bool {
    tx_type.starts_with("سحب") || tx_type.starts_with("باقي")
}

pub fn signed_transaction_amount(
    tx_type: &str,
    amount: Money,
    deposits_are_positive: bool,
) -> Option<Money> {
    if tx_type.starts_with("تحويل") {
        return None;
    }
    if is_deposit_type(tx_type) {
        Some(if deposits_are_positive {
            amount
        } else {
            -amount
        })
    } else if is_withdrawal_type(tx_type) {
        Some(if deposits_are_positive {
            -amount
        } else {
            amount
        })
    } else {
        None
    }
}

// ============================================================
// CENTRAL VALIDATION HELPERS
// ============================================================

pub fn validate_required_text(value: &str, field_name: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{} مطلوب ولا يمكن أن يكون فارغاً", field_name));
    }
    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
pub enum IdempotencyClaim {
    Proceed,
    Replay(String),
}

/// Claim one creation token inside the caller's write transaction. The token
/// is global across commands and is inseparable from the canonical payload
/// hash; a token can never silently stand for two different requests.
pub fn claim_idempotent_creation(
    conn: &Connection,
    token: Option<&str>,
    command_name: &str,
    payload: &serde_json::Value,
) -> Result<IdempotencyClaim, String> {
    let Some(token) = token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(IdempotencyClaim::Proceed);
    };
    let canonical =
        serde_json::to_vec(payload).map_err(|e| format!("تعذر حساب بصمة طلب الإنشاء: {e}"))?;
    let request_hash = hex::encode(Sha256::digest(canonical));
    let existing: Option<(String, String, String, Option<String>)> = conn
        .query_row(
            "SELECT command_name,request_hash,status,result_reference
             FROM idempotency_requests WHERE token=?1",
            [token],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((existing_command, existing_hash, status, result_reference)) = existing {
        if existing_command != command_name || existing_hash != request_hash {
            return Err("رمز الإنشاء مستخدم مسبقًا مع بيانات مختلفة".to_string());
        }
        return match (status.as_str(), result_reference) {
            ("completed", Some(reference)) => Ok(IdempotencyClaim::Replay(reference)),
            ("completed", None) => Err("طلب الإنشاء السابق مكتمل بلا معرّف نتيجة صالح".to_string()),
            ("in_progress", _) => Err("طلب الإنشاء نفسه قيد التنفيذ".to_string()),
            _ => Err("طلب الإنشاء السابق فشل؛ استخدم رمز إنشاء جديدًا".to_string()),
        };
    }
    conn.execute(
        "INSERT INTO idempotency_requests(token,command_name,request_hash,status)
         VALUES (?1,?2,?3,'in_progress')",
        params![token, command_name, request_hash],
    )
    .map_err(|e| e.to_string())?;
    Ok(IdempotencyClaim::Proceed)
}

pub fn complete_idempotent_creation(
    conn: &Connection,
    token: Option<&str>,
    result_reference: &str,
) -> Result<(), String> {
    let Some(token) = token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let changed = conn
        .execute(
            "UPDATE idempotency_requests
             SET status='completed',result_reference=?1,
                 completed_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
             WHERE token=?2 AND status='in_progress'",
            params![result_reference, token],
        )
        .map_err(|e| e.to_string())?;
    if changed != 1 {
        return Err("تعذر إكمال سجل منع تكرار طلب الإنشاء".to_string());
    }
    Ok(())
}

/// Stable identity normalization for every financial account type. Display
/// names remain unchanged; only this value participates in global uniqueness.
pub fn normalize_account_name(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
        .chars()
        .map(|ch| match ch {
            'أ' | 'إ' | 'آ' | 'ٱ' => 'ا',
            'ؤ' => 'و',
            'ئ' | 'ى' => 'ي',
            _ => ch,
        })
        .collect()
}

pub fn ensure_accounting_period_open(
    conn: &Connection,
    operation_date: &str,
) -> Result<(), String> {
    validate_required_text(operation_date, "تاريخ العملية")?;
    let closed_period: Option<i64> = conn
        .query_row(
            "SELECT id FROM accounting_periods
         WHERE ?1 BETWEEN start_date AND end_date AND status='closed'
         ORDER BY id DESC LIMIT 1",
            [operation_date.trim()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(period_id) = closed_period {
        return Err(format!(
            "الفترة المحاسبية مغلقة (الفترة رقم {period_id})؛ استخدم قيد عكسي أو تسوية في فترة مفتوحة"
        ));
    }
    Ok(())
}

pub fn normalize_phone_digits(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter_map(|ch| match ch {
            '\u{0660}'..='\u{0669}' => char::from_digit(ch as u32 - 0x0660, 10),
            '\u{06f0}'..='\u{06f9}' => char::from_digit(ch as u32 - 0x06f0, 10),
            '\u{200e}' | '\u{200f}' | '\u{202a}' | '\u{202b}' | '\u{202c}' | '\u{202d}'
            | '\u{202e}' | '\u{2066}' | '\u{2067}' | '\u{2068}' | '\u{2069}' | '\u{feff}' => None,
            _ => Some(ch),
        })
        .collect()
}

pub fn normalize_vehicle_identity(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect()
}

pub fn car_number_exists(db: &Connection, car_number: &str) -> Result<bool, String> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM cars WHERE car_number = ?1)",
        [car_number.trim()],
        |row| row.get::<_, bool>(0),
    )
    .map_err(|e| e.to_string())
}

pub fn resolve_unique_car_number(
    db: &Connection,
    requested_plate: &str,
    current_car_number: Option<&str>,
) -> Result<String, String> {
    let plate = requested_plate.trim();
    if plate.is_empty() {
        return Err("رقم السيارة مطلوب ولا يمكن أن يكون فارغاً".to_string());
    }

    if let Some(current) = current_car_number
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let old_plate = db.query_row(
            "SELECT COALESCE(NULLIF(TRIM(car_plate_num), ''), car_number) FROM cars WHERE car_number = ?1",
            [current],
            |row| row.get::<_, String>(0),
        );
        if let Ok(old_plate) = old_plate {
            if normalize_vehicle_identity(&old_plate) == normalize_vehicle_identity(plate) {
                return Ok(current.to_string());
            }
        }
    }

    if !car_number_exists(db, plate)? {
        return Ok(plate.to_string());
    }

    for suffix in 2..10_000 {
        let candidate = format!("{plate}#{suffix}");
        if !car_number_exists(db, &candidate)? {
            return Ok(candidate);
        }
    }

    Err("تعذر توليد معرف داخلي فريد للسيارة المكررة".to_string())
}

pub fn normalize_chassis_value(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .flat_map(char::to_uppercase)
        .collect()
}

pub fn ensure_unique_chassis(
    _db: &Connection,
    chassis: &str,
    _exclude_car_number: Option<&str>,
) -> Result<(), String> {
    // ============================================================
    // FORENSIC FIX (re-audit 2026-07-10, Instructions.md §31.3):
    // Duplicate chassis numbers are now ALLOWED. The same physical vehicle
    // may be purchased, sold, and re-purchased multiple times — each cycle
    // is an independent accounting event with its own car_number and its
    // own cost basis / sale price / profit.
    //
    // This function now only validates that the chassis is non-empty.
    // It no longer rejects duplicates.
    //
    // The caller is responsible for ensuring the car_number is unique
    // (via resolve_unique_car_number, which auto-appends #2, #3, etc.
    // when the requested plate already exists).
    // ============================================================
    let normalized = normalize_chassis_value(chassis);
    if normalized.is_empty() {
        return Err("رقم الشاصي مطلوب".to_string());
    }
    // Duplicate chassis is allowed — no rejection.
    Ok(())
}

pub fn find_recent_duplicate_car_id(
    db: &Connection,
    chassis: &str,
    purchase_price: Money,
    purchase_date: Option<&str>,
) -> Result<Option<i64>, String> {
    db.query_row(
        "SELECT id FROM cars
         WHERE chassis_number=?1
           AND purchase_price=?2
           AND COALESCE(purchase_date,'')=COALESCE(?3,'')
           AND created_at >= strftime('%Y-%m-%d %H:%M:%f','now','-5 seconds')
         ORDER BY created_at DESC,rowid DESC
         LIMIT 1",
        params![chassis, purchase_price, purchase_date],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("تعذر فحص تكرار إضافة السيارة: {e}"))
}

pub fn validate_finite_amount(value: Money, field_name: &str) -> Result<(), String> {
    if value > Money(MAX_FINANCIAL_AMOUNT) {
        return Err(format!(
            "{} exceeds maximum allowed amount ({})",
            field_name, MAX_FINANCIAL_AMOUNT
        ));
    }
    if value < Money(-MAX_FINANCIAL_AMOUNT) {
        return Err(format!(
            "{} exceeds minimum allowed amount (-{})",
            field_name, MAX_FINANCIAL_AMOUNT
        ));
    }
    Ok(())
}

pub fn validate_positive_amount(value: Money, field_name: &str) -> Result<(), String> {
    validate_finite_amount(value, field_name)?;
    if value <= Money::zero() {
        return Err(format!("{} يجب أن يكون أكبر من صفر", field_name));
    }
    Ok(())
}

pub fn validate_non_negative_amount(value: Money, field_name: &str) -> Result<(), String> {
    validate_finite_amount(value, field_name)?;
    if value < Money::zero() {
        return Err(format!("{} لا يمكن أن يكون سالباً", field_name));
    }
    Ok(())
}

pub fn validate_currency(currency: &str) -> Result<(), String> {
    let c = currency.trim();
    if c != "IQD" && c != "USD" {
        return Err(format!("العملة غير مدعومة: {}. يجب أن تكون IQD أو USD", c));
    }
    Ok(())
}

pub fn validate_ledger_amounts(debit: Money, credit: Money) -> Result<(), String> {
    validate_finite_amount(debit, "المدين")?;
    validate_finite_amount(credit, "الدائن")?;
    if debit < Money::zero() {
        return Err("المدين لا يمكن أن يكون سالباً".to_string());
    }
    if credit < Money::zero() {
        return Err("الدائن لا يمكن أن يكون سالباً".to_string());
    }
    if debit == Money::zero() && credit == Money::zero() {
        return Err("المدين والدائن لا يمكن أن يكونا صفر معاً".to_string());
    }
    if debit > Money::zero() && credit > Money::zero() {
        return Err("المدين والدائن لا يمكن أن يكونا موجبين معاً في نفس القيد".to_string());
    }
    Ok(())
}

pub fn validate_sale_amounts(
    selling_price: Money,
    amount_paid: Money,
    amount_remaining: Money,
    payment_type: &str,
) -> Result<(), String> {
    validate_positive_amount(selling_price, "سعر البيع")?;
    validate_non_negative_amount(amount_paid, "المبلغ المدفوع")?;
    validate_non_negative_amount(amount_remaining, "المبلغ المتبقي")?;

    if payment_type == "كاش" {
        if (amount_paid - selling_price).abs() > MONEY_EPSILON {
            return Err("في البيع النقدي: المبلغ المدفوع يجب أن يساوي سعر البيع".to_string());
        }
        if amount_remaining > MONEY_EPSILON {
            return Err("في البيع النقدي: المبلغ المتبقي يجب أن يكون صفر".to_string());
        }
    } else {
        // Installment / term sale
        let diff = ((amount_paid + amount_remaining) - selling_price).abs();
        if diff > MONEY_EPSILON {
            return Err("المقدمة + الباقي يجب أن يساوي سعر البيع".to_string());
        }
    }
    Ok(())
}

pub fn validate_profit_cap_for_car(
    db: &Connection,
    car_id: i64,
    sale_id: i64,
) -> Result<(), String> {
    // Bug 11 (N6): Enforce the profit cap rule from Instructions.md §7.4:
    //   Total recognized installment profit must never exceed the full car profit.
    //   Full Car Profit = Selling Price - Purchase Price - Car Expenses
    let car_data: Result<(Money, Money), rusqlite::Error> = db.query_row(
        "SELECT c.purchase_price,s.selling_price
         FROM cars c JOIN car_sales s ON s.id=?2 AND s.car_id=c.id
         WHERE c.id=?1",
        params![car_id, sale_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );
    let (purchase_price, selling_price) = match car_data {
        Ok(data) => data,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    let car_expenses = car_expenses_for_profit(db, car_id)?;
    let full_profit = selling_price - purchase_price - car_expenses;
    let recognized = recognized_installment_profit_for_car(db, sale_id)?;

    // The cap only applies when there is a positive full profit. If the car was
    // sold at a loss (full_profit <= 0), recognized losses are allowed (Bug 1 / N1).
    if full_profit > Money::zero() && recognized > full_profit {
        return Err(format!(
            "تجاوز سقف الأرباح للسيارة {}: الأرباح المعترف بها ({}) تتجاوز الربح الكامل ({})",
            car_id, recognized, full_profit
        ));
    }
    Ok(())
}

/// FORENSIC FIX (re-audit 2026-07-11, AUDIT-TRAIL-1):
/// Append-only audit trail writer that records actor identity from backend
/// session only (never from client-supplied actor name). See §10.4 of the
/// executive prompt.
///
/// Columns added by migration v35:
/// - actor_user_id  INTEGER — the authenticated user from sessions.user_id
/// - session_id     TEXT    — the session token that authorized the operation
///   (NULL for system-initiated events)
/// - request_id     TEXT    — operation-scoped id for trace correlation
/// - creation_token TEXT    — the idempotency token if the operation carried one
///
/// SECURITY: this function NEVER accepts a free-form actor name. The actor is
/// always the numeric user_id returned by require_admin_session, which means
/// identity cannot be spoofed via the client.
pub fn append_audit_event(
    conn: &Connection,
    actor_user_id: i64,
    entity_type: &str,
    entity_id: Option<i64>,
    action: &str,
    session_token: Option<&str>,
    creation_token: Option<&str>,
) -> Result<(), String> {
    append_audit_event_with_details(
        conn,
        actor_user_id,
        entity_type,
        entity_id,
        action,
        session_token,
        creation_token,
        AuditEventDetails::default(),
    )?;
    Ok(())
}

#[derive(Default)]
pub struct AuditEventDetails<'a> {
    pub operation_id: Option<&'a str>,
    pub account_id: Option<i64>,
    pub version: Option<i64>,
    pub old_values_json: Option<&'a str>,
    pub new_values_json: Option<&'a str>,
    pub reason: Option<&'a str>,
}

#[allow(clippy::too_many_arguments)]
pub fn append_audit_event_with_details(
    conn: &Connection,
    actor_user_id: i64,
    entity_type: &str,
    entity_id: Option<i64>,
    action: &str,
    session_token: Option<&str>,
    creation_token: Option<&str>,
    details: AuditEventDetails<'_>,
) -> Result<i64, String> {
    validate_required_text(entity_type, "نوع كيان سجل التدقيق")?;
    validate_required_text(action, "إجراء سجل التدقيق")?;
    for (label, payload) in [
        ("القيم القديمة", details.old_values_json),
        ("القيم الجديدة", details.new_values_json),
    ] {
        if let Some(payload) = payload {
            serde_json::from_str::<serde_json::Value>(payload)
                .map_err(|_| format!("{label} في سجل التدقيق ليست JSON صالحة"))?;
        }
    }
    let (date, time) = now_datetime();
    let entity_id_str = entity_id.map(|i| i.to_string()).unwrap_or_default();
    let occurred_at = format!("{date}T{time}");
    // Store an irreversible correlation fingerprint, never any session-token bytes.
    let session_fingerprint = session_token.map(|token| {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        format!("{:x}", hasher.finalize())
    });
    conn.execute(
        "INSERT INTO audit_log (
            date, time, actor, action, entity_type, entity_id, description, notes,
            actor_user_id, session_id, request_id, creation_token,operation_id,account_id,
            version,occurred_at,entity_id_numeric,session_fingerprint,old_values_json,
            new_values_json,reason,schema_version
         )
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
                 ?17,?18,?19,?20,?21,?22)",
        params![
            date,
            time,
            format!("user#{}", actor_user_id),
            action.trim(),
            entity_type.trim(),
            entity_id_str,
            action.trim(),
            Option::<String>::None,
            actor_user_id,
            session_fingerprint,
            creation_token,
            creation_token,
            details.operation_id,
            details.account_id,
            details.version,
            occurred_at,
            entity_id,
            session_fingerprint,
            details.old_values_json,
            details.new_values_json,
            details.reason,
            LATEST_SCHEMA_VERSION,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

// Issue 3: Classification helper for partner transactions
pub struct TransactionClassification {
    pub source_type: String,
    pub source_id: String,
    pub source_role: String,
    pub affects_qasa: i32,
    pub affects_partner_cash: i32,
    pub affects_profit: i32,
}

pub fn classify_partner_transaction(
    kind: &str,
    type_: &str,
    tx_id: i64,
) -> TransactionClassification {
    match kind {
        "مستثمر" => TransactionClassification {
            source_type: "investor_transaction".to_string(),
            source_id: tx_id.to_string(),
            source_role: "account_movement".to_string(),
            affects_qasa: 1,
            affects_partner_cash: 0,
            affects_profit: 0,
        },
        "ممول" => TransactionClassification {
            source_type: "funder_transaction".to_string(),
            source_id: tx_id.to_string(),
            source_role: "account_movement".to_string(),
            // استلام مبلغ من الممول يزيد القاصة. أما تسديد الممول فيُسجّل
            // خروجه عبر قيود دفع الشريكين المولدة أدناه.
            affects_qasa: if is_deposit_type(type_) { 1 } else { 0 },
            affects_partner_cash: 0,
            affects_profit: 0,
        },
        "شركة" => TransactionClassification {
            source_type: "company_transaction".to_string(),
            source_id: tx_id.to_string(),
            source_role: "account_movement".to_string(),
            // استلام مبلغ من الشركة حركة نقدية حقيقية، بينما سداد الشركة
            // يخرج من الشريكين ويُنشئ قيود القاصة المقابلة بواسطة split.
            affects_qasa: if is_deposit_type(type_) { 1 } else { 0 },
            affects_partner_cash: 0,
            affects_profit: 0,
        },
        "زبون" => TransactionClassification {
            source_type: "customer_transaction".to_string(),
            source_id: tx_id.to_string(),
            source_role: "account_movement".to_string(),
            affects_qasa: 0,
            affects_partner_cash: 0,
            affects_profit: 0,
        },
        "شريك" => {
            // Audit fix #7: match profit types by prefix so variants such as
            // "ايداع ارباح قسط سيارة" are classified as profit recognition and
            // never fall through to cash_movement (which would double-count
            // profit rows inside Qasa/Cash).
            if type_.starts_with("ايداع ارباح") {
                TransactionClassification {
                    source_type: "partner_profit".to_string(),
                    source_id: tx_id.to_string(),
                    source_role: "profit_recognition".to_string(),
                    affects_qasa: 0,
                    affects_partner_cash: 0,
                    affects_profit: 1,
                }
            } else {
                TransactionClassification {
                    source_type: "partner_cash".to_string(),
                    source_id: tx_id.to_string(),
                    source_role: "cash_movement".to_string(),
                    affects_qasa: 1,
                    affects_partner_cash: 1,
                    affects_profit: 0,
                }
            }
        }
        _ => TransactionClassification {
            source_type: "manual_transaction".to_string(),
            source_id: tx_id.to_string(),
            source_role: "account_movement".to_string(),
            affects_qasa: 1,
            affects_partner_cash: 1,
            affects_profit: 0,
        },
    }
}

/// Audit fix #7/#20: source types produced by `classify_partner_transaction` for rows
/// entered manually. Only these rows may be reclassified when edited; rows generated
/// by accounting flows must keep their original source fields and affects_* flags.
pub fn is_reclassifiable_source_type(source_type: &str) -> bool {
    matches!(
        source_type,
        "" | "partner_cash"
            | "partner_profit"
            | "manual_transaction"
            | "investor_transaction"
            | "funder_transaction"
            | "company_transaction"
            | "customer_transaction"
    )
}

/// Audit fix #7/#20: a generated partner (شريك) split row — one half of a 50/50
/// cash movement, profit recognition, or settlement deduction. Editing or deleting
/// a single half directly would break the 50/50 invariant and the source linkage,
/// so such rows may only change through their original source transaction.
pub fn is_generated_partner_split(kind: &str, source_type: &str, source_role: &str) -> bool {
    kind == "شريك"
        && matches!(
            source_role,
            "cash_movement" | "profit_recognition" | "partner_cash_payment" | "cash_payment"
        )
        && !is_reclassifiable_source_type(source_type)
}

/// Sum one monetary column without delegating arithmetic to SQLite. Monetary
/// columns are canonical decimal TEXT; SQLite SUM would coerce them to numeric
/// (and frequently REAL) before Money can validate the result.
pub fn sum_money_rows<P: rusqlite::Params>(
    db: &Connection,
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

/// Fold `SELECT first_amount, second_amount ...` as first - second in Decimal.
pub fn sum_money_difference_rows<P: rusqlite::Params>(
    db: &Connection,
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
        let (first, second) = value.map_err(|error| error.to_string())?;
        total += first - second;
    }
    Ok(total)
}

/// Fold `SELECT type, amount ...` using the centralized Arabic transaction
/// direction policy, without SQL CASE/SUM coercion.
pub fn sum_typed_money_rows<P: rusqlite::Params>(
    db: &Connection,
    sql: &str,
    params: P,
    deposits_are_positive: bool,
) -> Result<Money, String> {
    let mut statement = db.prepare(sql).map_err(|error| error.to_string())?;
    let values = statement
        .query_map(params, |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Money>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let mut total = Money::zero();
    for value in values {
        let (tx_type, amount) = value.map_err(|error| error.to_string())?;
        if let Some(signed) = signed_transaction_amount(&tx_type, amount, deposits_are_positive) {
            total += signed;
        }
    }
    Ok(total)
}
