//! `cars` — legacy/mod.rs lines 6593–8748
use super::*;

type CarSaleIdentityRow = (
    i64,
    Option<i64>,
    String,
    Option<String>,
    Option<String>,
    Money,
    String,
    String,
);

pub fn car_id_by_number(db: &Connection, car_number: &str) -> Result<i64, String> {
    db.query_row(
        "SELECT id FROM cars WHERE car_number=?1",
        [car_number.trim()],
        |row| row.get(0),
    )
    .map_err(|_| "السيارة غير موجودة أو بلا معرّف رقمي".to_string())
}

pub fn car_sale_identity_by_number(
    db: &Connection,
    car_number: &str,
) -> Result<(i64, Option<i64>), String> {
    let car: CarSaleIdentityRow = db
        .query_row(
            "SELECT id,active_sale_id,status,buyer_name,payment_type,selling_price,
                COALESCE(sale_currency,'IQD'),COALESCE(sale_date,'')
         FROM cars WHERE car_number=?1",
            [car_number.trim()],
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
                ))
            },
        )
        .map_err(|_| "السيارة غير موجودة أو بلا معرّف رقمي".to_string())?;
    if car.1.is_some() || car.2 != "مبيوعة" {
        return Ok((car.0, car.1));
    }
    let buyer_name = car.3.as_deref().unwrap_or("").trim();
    if buyer_name.is_empty() {
        return Err("رفض إنشاء هوية بيع لسيارة مبيوعة بلا زبون".to_string());
    }
    let customer_account_id = ensure_partner_exists(db, buyer_name, "", "زبون")?;
    let operation_id = new_ledger_token("legacy_sale_identity");
    db.execute(
        "INSERT INTO operations(id,operation_type,status) VALUES (?1,'car_sale','active')",
        [&operation_id],
    )
    .map_err(|e| e.to_string())?;
    let sale_type = match car.4.as_deref() {
        Some("اقساط") => "اقساط",
        Some("موعد") => "موعد",
        _ => "كاش",
    };
    db.execute(
        "INSERT INTO car_sales
         (operation_id,car_id,customer_account_id,sale_type,selling_price,currency,sale_date,status)
         VALUES (?1,?2,?3,?4,?5,?6,?7,'active')",
        params![
            operation_id,
            car.0,
            customer_account_id,
            sale_type,
            car.5,
            car.6,
            car.7
        ],
    )
    .map_err(|e| e.to_string())?;
    let sale_id = db.last_insert_rowid();
    db.execute(
        "UPDATE cars SET active_sale_id=?1 WHERE id=?2 AND active_sale_id IS NULL",
        params![sale_id, car.0],
    )
    .map_err(|e| e.to_string())?;
    sync_sale_identity_links(db, car.0, sale_id, &operation_id, customer_account_id)?;
    Ok((car.0, Some(sale_id)))
}

pub fn car_sale_identity_by_id(db: &Connection, car_id: i64) -> Result<(i64, Option<i64>), String> {
    let car_number: String = db
        .query_row("SELECT car_number FROM cars WHERE id=?1", [car_id], |row| {
            row.get(0)
        })
        .map_err(|_| "السيارة غير موجودة أو بلا معرّف رقمي".to_string())?;
    car_sale_identity_by_number(db, &car_number)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCarInput {
    pub num: String,
    pub chassis: String,
    pub model: String,
    pub year: String,
    pub name: String,
    pub color: String,
    pub purchase: Money,
    pub currency: String,
    pub purchase_type: String,
    pub financer_name: Option<String>,
    pub purchase_date: String,
}

fn validate_batch_car_input(car: &BatchCarInput) -> Result<(), String> {
    validate_required_text(&car.num, "رقم السيارة")?;
    validate_required_text(&car.chassis, "رقم الشاصي")?;
    validate_required_text(&car.model, "نوع السيارة")?;
    validate_required_text(&car.year, "موديل السيارة")?;
    validate_required_text(&car.color, "لون السيارة")?;
    validate_required_text(&car.purchase_date, "تاريخ الشراء")?;
    validate_positive_amount(car.purchase, "سعر الشراء")?;
    validate_currency(car.currency.trim())?;
    if !matches!(car.purchase_type.trim(), "كاش" | "تمويل" | "دين" | "شركة") {
        return Err("نوع شراء سيارة المجموعة غير صالح".to_string());
    }
    if matches!(car.purchase_type.trim(), "تمويل" | "دين" | "شركة")
        && car.financer_name.as_deref().unwrap_or("").trim().is_empty()
    {
        return Err("اسم الممول أو الشركة مطلوب لشراء المجموعة".to_string());
    }
    Ok(())
}

pub(crate) fn add_cars_batch_in_transaction(
    db: &rusqlite::Transaction<'_>,
    actor_user_id: i64,
    cars: &[BatchCarInput],
    batch_creation_token: &str,
    session_token: &str,
) -> Result<Vec<i64>, String> {
    if cars.is_empty() || cars.len() > 1000 {
        return Err("عدد سيارات المجموعة يجب أن يكون بين 1 و1000".to_string());
    }
    for car in cars {
        validate_batch_car_input(car)?;
        ensure_accounting_period_open(db, car.purchase_date.trim())?;
    }

    let mut saved_ids = Vec::with_capacity(cars.len());
    for (index, car) in cars.iter().enumerate() {
        let requested_plate = car.num.trim();
        let car_number = resolve_unique_car_number(db, requested_plate, None)?;
        let clean_chassis = normalize_chassis_value(&car.chassis);
        ensure_unique_chassis(db, &clean_chassis, None)?;
        let stored_purchase_type = if car.purchase_type.trim() == "تمويل" {
            "دين"
        } else {
            car.purchase_type.trim()
        };
        let car_creation_token = format!("{batch_creation_token}:{}", index + 1);
        let (_, purchase_time) = now_datetime();

        db.execute(
            "INSERT INTO cars (
                car_number,car_plate_num,chassis_number,car_model,car_year,car_name,
                color,details,purchase_price,currency,sale_currency,selling_price,status,
                payment_type,purchase_payment_type,purchase_type,financer_name,
                purchase_date,purchase_time,creation_token
             ) VALUES (
                ?1,?2,?3,?4,?5,?6,?7,'',?8,?9,?9,'0','متوفرة',
                NULL,'قاصه',?10,?11,?12,?13,?14
             )",
            params![
                car_number,
                requested_plate,
                clean_chassis,
                car.model.trim(),
                car.year.trim(),
                car.name.trim(),
                car.color.trim(),
                car.purchase,
                car.currency.trim(),
                stored_purchase_type,
                car.financer_name.as_deref().map(str::trim),
                car.purchase_date.trim(),
                purchase_time,
                car_creation_token,
            ],
        )
        .map_err(|e| format!("تعذر حفظ سيارة المجموعة رقم {}: {e}", index + 1))?;
        let car_id = db.last_insert_rowid();
        let operation_id = ensure_purchase_identity(db, car_id)?;
        db.execute(
            "UPDATE operations
             SET actor_user_id=?1,creation_token=COALESCE(creation_token,?2)
             WHERE id=?3",
            params![actor_user_id, car_creation_token, operation_id],
        )
        .map_err(|e| format!("تعذر ربط عملية سيارة المجموعة رقم {}: {e}", index + 1))?;

        let purchase_note = format!(
            "سحب شراء سيارة {} (شاصي: {})",
            car.name.trim(),
            clean_chassis
        );
        if stored_purchase_type == "كاش" {
            distribute_to_partners_50_with_effects(
                db,
                car.purchase,
                car.currency.trim(),
                car.purchase_date.trim(),
                "قاصه",
                "سحب شراء سيارة",
                &purchase_note,
                "car_purchase",
                &car_id.to_string(),
                "cash_payment",
                true,
                true,
                false,
            )?;
        } else {
            let (account_kind, tx_type, source_role) =
                if matches!(stored_purchase_type, "دين" | "تمويل") {
                    ("ممول", "استلام تمويل شراء سيارة", "financing_liability")
                } else {
                    ("شركة", "استلام شراء سيارة", "company_purchase_liability")
                };
            let financer_name = car.financer_name.as_deref().unwrap_or("").trim();
            let financer_account_id = ensure_partner_exists(db, financer_name, "", account_kind)?;
            db.execute(
                "INSERT INTO partner_transactions (
                    partner_name,kind,type,amount,date,time,notes,currency,payment_type,
                    source_type,source_id,source_entity_id,source_role,
                    affects_qasa,affects_partner_cash,affects_profit,
                    related_source_type,related_source_id,related_entity_id,
                    account_id,operation_id
                 ) VALUES (
                    ?1,?2,?3,?4,?5,?6,?7,?8,'قاصه',
                    'car_purchase',CAST(?9 AS TEXT),?9,?10,
                    0,0,0,'car',CAST(?9 AS TEXT),?9,?11,?12
                 )",
                params![
                    financer_name,
                    account_kind,
                    tx_type,
                    car.purchase,
                    car.purchase_date.trim(),
                    purchase_time,
                    purchase_note,
                    car.currency.trim(),
                    car_id,
                    source_role,
                    financer_account_id,
                    operation_id,
                ],
            )
            .map_err(|e| format!("تعذر تسجيل تمويل سيارة المجموعة رقم {}: {e}", index + 1))?;
        }

        record_car_purchase_ledger_entries(db, car_id)?;
        ensure_purchase_identity(db, car_id)?;
        let audit_values = serde_json::json!({
            "batch_creation_token": batch_creation_token,
            "batch_index": index + 1,
            "car_id": car_id,
            "plate_number": requested_plate,
            "chassis_number": clean_chassis,
            "purchase_price": car.purchase,
            "purchase_currency": car.currency.trim(),
            "purchase_type": stored_purchase_type,
            "status": "متوفرة",
        })
        .to_string();
        append_audit_event_with_details(
            db,
            actor_user_id,
            "car",
            Some(car_id),
            "add_car_batch",
            Some(session_token),
            Some(&car_creation_token),
            AuditEventDetails {
                operation_id: Some(&operation_id),
                new_values_json: Some(&audit_values),
                ..Default::default()
            },
        )?;
        saved_ids.push(car_id);
    }
    recalculate_all_partners(db)?;
    Ok(saved_ids)
}

#[tauri::command]
pub fn add_cars_batch(
    state: State<AppState>,
    cars: Vec<BatchCarInput>,
    creation_token: String,
    session_token: String,
) -> Result<Vec<i64>, String> {
    let creation_token = creation_token.trim().to_string();
    validate_required_text(&creation_token, "رمز إنشاء المجموعة")?;
    let payload = serde_json::to_value(&cars).map_err(|e| e.to_string())?;
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    if let IdempotencyClaim::Replay(reference) =
        claim_idempotent_creation(&db, Some(&creation_token), "add_cars_batch", &payload)?
    {
        let ids = serde_json::from_str::<Vec<i64>>(&reference)
            .map_err(|_| "نتيجة طلب المجموعة السابق غير صالحة".to_string())?;
        db.commit().map_err(|e| e.to_string())?;
        return Ok(ids);
    }
    let ids =
        add_cars_batch_in_transaction(&db, actor_user_id, &cars, &creation_token, &session_token)?;
    let reference = serde_json::to_string(&ids).map_err(|e| e.to_string())?;
    complete_idempotent_creation(&db, Some(&creation_token), &reference)?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(ids)
}

#[allow(clippy::too_many_arguments, clippy::type_complexity)]
#[tauri::command]
pub fn add_car(
    state: State<AppState>,
    num: String,
    chassis: String,
    model: String,
    year: String,
    name: String,
    color: String,
    details: String,
    purchase: Money,
    currency: Option<String>,
    sale_currency: Option<String>,
    selling: Money,
    status: String,
    payment_type: Option<String>,
    cash_price: Option<Money>,
    amount_paid: Option<Money>,
    amount_remaining: Option<Money>,
    installment_months: Option<i32>,
    monthly_payment: Option<Money>,
    buyer_name: Option<String>,
    buyer_phone: Option<String>,
    purchase_date: Option<String>,
    sale_date: Option<String>,
    delivery_date: Option<String>,
    first_payment_date: Option<String>,
    purchase_payment_type: Option<String>,
    old_num: Option<String>,
    car_id: Option<i64>,
    purchase_type: Option<String>,
    financer_name: Option<String>,
    commission_type: Option<String>,
    commission_value: Option<Money>,
    car_partners: Option<Vec<CarPartner>>,
    skip_sale_accounting: Option<bool>,
    expected_version: Option<i64>,
    creation_token: Option<String>,
    session_token: String,
) -> Result<i64, String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&num, "رقم السيارة")?;
    validate_required_text(&chassis, "رقم الشاصي")?;
    validate_required_text(&name, "اسم السيارة")?;
    validate_non_negative_amount(purchase, "سعر الشراء")?;
    validate_non_negative_amount(selling, "سعر البيع")?;
    if let Some(ref ap) = amount_paid {
        validate_non_negative_amount(*ap, "المبلغ المدفوع")?;
    }
    if let Some(ref ar) = amount_remaining {
        validate_non_negative_amount(*ar, "المبلغ المتبقي")?;
    }
    if let Some(ref mp) = monthly_payment {
        validate_non_negative_amount(*mp, "القسط الشهري")?;
    }
    if let Some(ref cv) = commission_value {
        validate_non_negative_amount(*cv, "قيمة العمولة")?;
    }
    let curr = currency.as_deref().unwrap_or("IQD");
    validate_currency(curr)?;
    let sale_curr = sale_currency.as_deref().unwrap_or("IQD");
    validate_currency(sale_curr)?;

    // Mixed currency validation
    if status == "مبيوعة" && curr != sale_curr {
        return Err("لا يمكن بيع السيارة بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string());
    }

    // Buyer name required when sold
    if status == "مبيوعة" && buyer_name.as_deref().unwrap_or("").trim().is_empty() {
        return Err("اسم المشتري مطلوب عند بيع السيارة".to_string());
    }

    // Installment months validation
    if payment_type.as_deref() == Some("اقساط") {
        if let Some(months) = installment_months {
            if months <= 0 {
                return Err("عدد أشهر التقسيط يجب أن يكون أكبر من صفر".to_string());
            }
        }
    }
    if car_id.is_none()
        && old_num
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        return Err("تعديل السيارة يتطلب car_id رقميًا ونسخة متوقعة".to_string());
    }

    // FORENSIC FIX (re-audit 2026-07-11, FORENSIC-RUST-1-3):
    // Idempotency: if a creation_token is provided and a car with that token
    // already exists, return success without creating a duplicate (§31.2/§31.5.3).
    // Also detect 5-second duplicate for the no-token case (double-click protection).
    let creation_token = creation_token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    if let Some(existing_car_id) = car_id {
        let expected_version = expected_version
            .ok_or_else(|| "نسخة السيارة المتوقعة مطلوبة عند التعديل".to_string())?;
        let current_version: i64 = db
            .query_row(
                "SELECT version FROM cars WHERE id=?1 AND status<>'محذوفة'",
                [existing_car_id],
                |row| row.get(0),
            )
            .map_err(|_| "السيارة المطلوبة غير موجودة".to_string())?;
        if current_version != expected_version {
            return Err(format!(
                "تعارض تعديل السيارة: النسخة الحالية {current_version} وليست {expected_version}"
            ));
        }
    }
    if let Some(date) = purchase_date
        .as_deref()
        .filter(|date| !date.trim().is_empty())
    {
        ensure_accounting_period_open(&db, date)?;
    }
    if status == "مبيوعة" {
        if let Some(date) = sale_date.as_deref().filter(|date| !date.trim().is_empty()) {
            ensure_accounting_period_open(&db, date)?;
        }
    }

    let idempotency_payload = serde_json::json!({
        "num": num,
        "chassis": chassis,
        "model": model,
        "year": year,
        "name": name,
        "color": color,
        "details": details,
        "purchase": purchase,
        "currency": currency,
        "sale_currency": sale_currency,
        "selling": selling,
        "status": status,
        "payment_type": payment_type,
        "cash_price": cash_price,
        "amount_paid": amount_paid,
        "amount_remaining": amount_remaining,
        "installment_months": installment_months,
        "monthly_payment": monthly_payment,
        "buyer_name": buyer_name,
        "buyer_phone": buyer_phone,
        "purchase_date": purchase_date,
        "sale_date": sale_date,
        "delivery_date": delivery_date,
        "first_payment_date": first_payment_date,
        "purchase_payment_type": purchase_payment_type,
        "old_num": old_num,
        "car_id": car_id,
        "purchase_type": purchase_type,
        "financer_name": financer_name,
        "commission_type": commission_type,
        "commission_value": commission_value,
        "car_partners": car_partners,
        "skip_sale_accounting": skip_sale_accounting,
        "expected_version": expected_version,
    });
    if let IdempotencyClaim::Replay(reference) = claim_idempotent_creation(
        &db,
        creation_token.as_deref(),
        "add_car",
        &idempotency_payload,
    )? {
        return reference
            .parse::<i64>()
            .map_err(|_| "معرّف نتيجة طلب الإنشاء السابق غير صالح".to_string());
    }
    // ============================================================
    // ATOMIC TRANSACTION
    // (Transaction was already opened above for idempotency check)
    // ============================================================
    // Reuse the db transaction opened above for the idempotency check.

    let buyer_phone = buyer_phone.map(|phone| normalize_phone_digits(&phone));
    let requested_plate = num.trim().to_string();
    let clean_chassis = normalize_chassis_value(&chassis);
    if car_id.is_none() && creation_token.is_none() {
        let recent_duplicate =
            find_recent_duplicate_car_id(&db, &clean_chassis, purchase, purchase_date.as_deref())?;
        if let Some(existing_id) = recent_duplicate {
            db.commit().map_err(|e| e.to_string())?;
            return Ok(existing_id);
        }
    }
    let old_num_from_id: Option<String> = match car_id {
        Some(id) => Some(
            db.query_row("SELECT car_number FROM cars WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .map_err(|_| format!("تعذر العثور على السيارة ذات المعرّف {}", id))?,
        ),
        None => None,
    };
    let old_num_input = old_num.unwrap_or_default();
    let old_num_owned = old_num_from_id.unwrap_or(old_num_input);
    let old_num = old_num_owned.trim();
    let car_number = resolve_unique_car_number(
        &db,
        &requested_plate,
        (!old_num.is_empty()).then_some(old_num),
    )?;

    // الاستعلام عن وقت الشراء ووقت البيع الحاليين لحفظهما قبل حذف أو استبدال السجل، وكذلك الاسم ورقم الشاصي والشركاء القديمين للتحديث
    ensure_unique_chassis(
        &db,
        &clean_chassis,
        (!old_num.is_empty()).then_some(old_num),
    )?;
    let old_car_data: (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<Money>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>,
                       Option<Money>, Option<String>, Option<String>, Option<Money>, Option<Money>, Option<i32>, Option<Money>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = db
        .query_row(
            "SELECT purchase_time, sale_time, car_name, chassis_number, car_model, car_year, status,
                    purchase_price, COALESCE(purchase_type, 'كاش'), financer_name, currency,
                    COALESCE(purchase_date, ''), purchase_payment_type,
                    selling_price, sale_currency, payment_type,
                    amount_paid, amount_remaining, installment_months, monthly_payment,
                    buyer_name, buyer_phone, sale_date, delivery_date, first_payment_date,
                    car_plate_num
             FROM cars WHERE id = ?1",
            [car_id.unwrap_or(-1)],
            |row| Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
                row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?,
                row.get(10)?, row.get(11)?, row.get(12)?,
                row.get(13)?, row.get(14)?, row.get(15)?, row.get(16)?, row.get(17)?,
                row.get(18)?, row.get(19)?, row.get(20)?, row.get(21)?, row.get(22)?,
                row.get(23)?, row.get(24)?, row.get(25)?,
            )),
        )
        .unwrap_or((None, None, None, None, None, None, None, None, None, None, None, None, None,
                    None, None, None, None, None, None, None, None, None, None, None, None, None));
    let (
        existing_purchase_time,
        existing_sale_time,
        old_name,
        _old_chassis,
        _old_model,
        _old_year,
        old_status,
        old_purchase_price,
        old_purchase_type,
        old_financer_name,
        old_currency,
        _old_purchase_date,
        _old_purchase_payment_type,
        _old_selling_price,
        _old_sale_currency,
        _old_payment_type,
        _old_amount_paid,
        _old_amount_remaining,
        _old_installment_months,
        _old_monthly_payment,
        _old_buyer_name,
        _old_buyer_phone,
        _old_sale_date,
        _old_delivery_date,
        _old_first_payment_date,
        existing_plate_num,
    ) = old_car_data;
    let is_existing_car = old_name.is_some();
    let should_create_purchase_transactions = !is_existing_car;
    let _should_create_sale_transactions =
        status == "مبيوعة" && old_status.as_deref() != Some("مبيوعة");

    let skip_sale_raw = skip_sale_accounting.unwrap_or(false);
    let has_old_num = !old_num.is_empty();
    let car_number_changed = has_old_num && old_num != car_number;
    let same_car_edit = is_existing_car && (!has_old_num || old_num == car_number);

    let purchase_changed = is_existing_car
        && (old_purchase_price.is_none_or(|v| (v - purchase).abs() > MONEY_STRICT_EPSILON)
            || old_purchase_type.as_deref() != purchase_type.as_deref()
            || old_financer_name.as_deref() != financer_name.as_deref()
            || old_currency.as_deref() != currency.as_deref());
    let force_rebuild_due_to_number_change = car_number_changed;

    // sold_cost_changed: detecting purchase/cost changes for sold cars that also affect COGS/sale ledger
    let sold_cost_changed = is_existing_car && status == "مبيوعة" && purchase_changed;

    // effective_skip_sale: force sale ledger rebuild when car_number changes or sold cost changes
    let effective_skip_sale = skip_sale_raw && !car_number_changed && !sold_cost_changed;

    let should_rebuild_purchase = should_create_purchase_transactions
        || purchase_changed
        || force_rebuild_due_to_number_change;

    let sale_changed = is_existing_car
        && status == "مبيوعة"
        && (old_status.as_deref() != Some("مبيوعة")
            || _old_selling_price.is_none_or(|v| (v - selling).abs() > MONEY_STRICT_EPSILON)
            || _old_sale_currency.as_deref() != sale_currency.as_deref()
            || _old_payment_type.as_deref() != payment_type.as_deref()
            || _old_amount_paid
                .is_none_or(|v| amount_paid.is_none_or(|a| (v - a).abs() > MONEY_STRICT_EPSILON))
            || _old_amount_remaining.is_none_or(|v| {
                amount_remaining.is_none_or(|a| (v - a).abs() > MONEY_STRICT_EPSILON)
            })
            || _old_installment_months != installment_months
            || _old_monthly_payment.is_none_or(|v| {
                monthly_payment.is_none_or(|m| (v - m).abs() > MONEY_STRICT_EPSILON)
            })
            || _old_buyer_name.as_deref() != buyer_name.as_deref()
            || _old_buyer_phone.as_deref() != buyer_phone.as_deref()
            || _old_sale_date.as_deref() != sale_date.as_deref()
            || _old_delivery_date.as_deref() != delivery_date.as_deref()
            || _old_first_payment_date.as_deref() != first_payment_date.as_deref());
    let should_rebuild_sale_ledger = sale_changed
        || sold_cost_changed
        || (force_rebuild_due_to_number_change && status == "مبيوعة");

    if car_number_changed {
        // CRITICAL-3 FIX: Insert reversal entries before deleting to preserve audit trail.
        // All ledger entries for the old car number are reversed (debit↔credit) and then
        // deleted. The migration below re-creates entries under the new car number.
        let (_rev_date, _rev_time) = now_datetime();
        reverse_and_delete_ledger_entries(
            &db,
            "SELECT id, date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, notes
             FROM financial_ledger
             WHERE reference_type = 'car' AND reference_entity_id = :param
               AND reverses_ledger_id IS NULL",
            "car_id",
            old_num,
            &format!("تم تغيير رقم السيارة من {} إلى {} — عكس جميع القيود للترحيل تحت الرقم الجديد", old_num, car_number),
        )?;

        // Migrate all source references to new number
        migrate_car_number_references(
            &db,
            car_id.expect("existing car has numeric id"),
            &car_number,
        )?;
    } else if same_car_edit {
        // Normal edit of same car — use precise type-filtered deletion only
        if should_rebuild_purchase {
            delete_car_purchase_ledger_entries(&db, car_number.as_str())?;
        }
        if should_rebuild_sale_ledger && !effective_skip_sale {
            // Sale ledger entries use sale_id as their immutable identity.
            let existing_sale_id: Option<i64> = db
                .query_row(
                    "SELECT active_sale_id FROM cars WHERE id = ?1",
                    [car_id.expect("existing car has numeric id")],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| format!("تعذر قراءة sale_id قبل حذف قيود البيع: {e}"))?
                .flatten();
            if let Some(sid) = existing_sale_id {
                delete_car_sale_ledger_entries_by_sale_id(&db, sid)?;
            } else {
                // سيارة مبيوعة حديثاً (أول مرة) — لا توجد قيود قديمة للحذف
                delete_car_sale_ledger_entries(&db, car_number.as_str())?;
            }
        }
    }
    // New car: no existing ledger to delete

    let plate_num = if requested_plate.trim().is_empty() {
        existing_plate_num
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| car_number.clone())
    } else {
        requested_plate.clone()
    };

    // INSERT with main fields — use ON CONFLICT to avoid silently overwriting columns not in the INSERT list
    let saved_rowid: i64 = db.query_row(
        "INSERT INTO cars (car_number, car_plate_num, chassis_number, car_model, car_year, car_name, color, details, purchase_price, currency, sale_currency, selling_price, status, payment_type, cash_price, amount_paid, amount_remaining, installment_months, monthly_payment, purchase_payment_type, purchase_type, financer_name, commission_type, commission_value, creation_token, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, strftime('%Y-%m-%d %H:%M:%f', 'now'))
         ON CONFLICT(car_number) DO UPDATE SET
            car_plate_num=excluded.car_plate_num, chassis_number=excluded.chassis_number,
            car_model=excluded.car_model, car_year=excluded.car_year,
            car_name=excluded.car_name, color=excluded.color, details=excluded.details,
            purchase_price=excluded.purchase_price, currency=excluded.currency,
            sale_currency=excluded.sale_currency, selling_price=excluded.selling_price,
            status=excluded.status, payment_type=excluded.payment_type,
            cash_price=excluded.cash_price, amount_paid=excluded.amount_paid,
            amount_remaining=excluded.amount_remaining,
            installment_months=excluded.installment_months,
            monthly_payment=excluded.monthly_payment,
            purchase_payment_type=excluded.purchase_payment_type,
            purchase_type=excluded.purchase_type,
            financer_name=excluded.financer_name,
            commission_type=excluded.commission_type,
            commission_value=excluded.commission_value,
            version=cars.version+1,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         RETURNING rowid",
        params![
            car_number.as_str(),
            plate_num.as_str(),
            clean_chassis.as_str(),
            model.trim(),
            year.trim(),
            name.trim(),
            color.trim(),
            details.trim(),
            purchase,
            currency,
            sale_currency,
            selling,
            status,
            payment_type,
            cash_price,
            amount_paid,
            amount_remaining,
            installment_months,
            monthly_payment,
            purchase_payment_type,
            purchase_type.as_deref().unwrap_or("كاش"),
            financer_name,
            commission_type,
            commission_value,
            creation_token.as_deref(),
        ],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())?;
    let proposed_car_id = if let Some(existing_id) = car_id {
        existing_id
    } else {
        db.query_row("SELECT COALESCE(MAX(id),0)+1 FROM cars", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("تعذر توليد معرّف السيارة: {e}"))?
    };
    db.execute(
        "UPDATE cars SET id=COALESCE(id,?1) WHERE rowid=?2",
        params![proposed_car_id, saved_rowid],
    )
    .map_err(|e| format!("تعذر تثبيت معرّف السيارة: {e}"))?;
    let saved_car_id: i64 = db
        .query_row("SELECT id FROM cars WHERE rowid=?1", [saved_rowid], |row| {
            row.get(0)
        })
        .map_err(|e| format!("تعذر قراءة معرّف السيارة بعد الحفظ: {e}"))?;
    let saved_car_id_text = saved_car_id.to_string();

    // تحديث الشركاء المساهمين
    db.execute("DELETE FROM car_partners WHERE car_id = ?1", [saved_car_id])
        .map_err(|e| e.to_string())?;

    // Insert car_partners if provided
    if let Some(ref partners) = car_partners {
        for p in partners {
            if p.amount > Money::zero() {
                let p_kind = p.kind.as_deref().unwrap_or("شريك");
                let currency = p.currency.as_str();
                db.execute(
                    "INSERT INTO car_partners (car_id, car_number, partner_name, amount, currency, kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![saved_car_id, car_number.as_str(), p.partner_name.trim(), p.amount, currency, p_kind],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    let clean_name = name.trim();
    let new_purchase_note = format!("سحب شراء سيارة {} (شاصي: {})", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");

    if old_name.is_some() {
        // Update notes for car-generated rows using source fields (not notes matching)
        let new_purchase_note = format!("سحب شراء سيارة {} (شاصي: {})", clean_name, clean_chassis)
            .trim()
            .replace("  ", " ");
        let new_sale_note = format!("ايداع بيع سيارة {} {}", clean_name, clean_chassis)
            .trim()
            .replace("  ", " ");
        let new_profit_note = format!("ايداع ارباح سيارة {} {}", clean_name, clean_chassis)
            .trim()
            .replace("  ", " ");

        // Update purchase rows by source_type/source_id
        db.execute(
            "UPDATE partner_transactions SET notes = ?1
                 WHERE source_type = 'car_purchase' AND source_entity_id = ?2",
            params![new_purchase_note, saved_car_id_text],
        )
        .map_err(|e| e.to_string())?;

        // Update sale rows by source_type/source_id
        db.execute(
            "UPDATE partner_transactions SET notes = ?1
                 WHERE source_type = 'car_sale' AND source_entity_id = ?2 AND source_role = 'cash_movement'",
            params![new_sale_note, saved_car_id_text],
        )
        .map_err(|e| e.to_string())?;

        // Update profit rows by source_type/source_id
        db.execute(
            "UPDATE partner_transactions SET notes = ?1
                 WHERE source_type = 'car_sale' AND source_entity_id = ?2 AND source_role = 'profit_recognition'",
            params![new_profit_note, saved_car_id_text],
        ).map_err(|e| e.to_string())?;

        // Update car number reference in customer payment notes if car_number changed
        if old_num != car_number {
            // NOTE: migrate_car_number_references already changed related_source_id from old_num to car_number
            // So we must use car_number (new) in the WHERE clause
            db.execute(
                "UPDATE partner_transactions SET notes = REPLACE(notes, ?1, ?2)
                 WHERE related_source_type = 'car' AND related_entity_id = ?3",
                params![
                    format!("#بيع_سيارة_{}", old_num),
                    format!("#بيع_سيارة_{}", car_number),
                    saved_car_id_text,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Establish the immutable purchase operation before any generated accounting row.
    ensure_purchase_identity(&db, saved_car_id)?;

    // حذف حركات الشراء القديمة ثم إعادة إنشائها حسب نوع الشراء الحالي (باستخدام حقول المصدر)
    // Only rebuild when purchase-impacting fields actually change
    if should_rebuild_purchase {
        // Delete only car purchase generated rows (not sale rows)
        delete_generated_car_purchase_partner_transactions(&db, &saved_car_id_text)?;
    }

    if should_rebuild_purchase && purchase_type.as_deref() == Some("كاش") {
        // توزيع 50% من مبلغ الشراء على حسابات الشركاء
        let purchase_curr = currency.as_deref().unwrap_or("IQD");
        distribute_to_partners_50_with_effects(
            &db,
            purchase,
            purchase_curr,
            purchase_date.as_deref().unwrap_or(""),
            purchase_payment_type.as_deref().unwrap_or("قاصه"),
            "سحب شراء سيارة",
            &new_purchase_note,
            "car_purchase",
            &saved_car_id_text,
            "cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    } else if should_rebuild_purchase
        && (purchase_type.as_deref() == Some("تمويل")
            || purchase_type.as_deref() == Some("شركة")
            || purchase_type.as_deref() == Some("دين"))
    {
        let p_kind = if purchase_type.as_deref() == Some("تمويل")
            || purchase_type.as_deref() == Some("دين")
        {
            "ممول"
        } else {
            "شركة"
        };
        let p_type = if purchase_type.as_deref() == Some("تمويل")
            || purchase_type.as_deref() == Some("دين")
        {
            "استلام تمويل شراء سيارة"
        } else {
            "استلام شراء سيارة"
        };
        let role = if purchase_type.as_deref() == Some("تمويل")
            || purchase_type.as_deref() == Some("دين")
        {
            "financing_liability"
        } else {
            "company_purchase_liability"
        };
        // Bug 8 (N3) + Bug 13 (N8): Funder/company finances the PURCHASE PRICE
        // ONLY, matching the ledger entry (Instructions.md §15 / §16). Car
        // expenses are paid by the partners separately, not by the funder.
        // Previously this added `expenses_sum` (direct car_expenses SQL) which
        // inflated the funder liability above the actual financed amount, and
        // bypassed the `car_expenses_for_profit` fallback used everywhere else.
        let total_amount = purchase;
        if let Some(f_name) = &financer_name {
            let f_name = f_name.trim();
            if !f_name.is_empty() {
                let financier_account_id = ensure_partner_exists(&db, f_name, "", p_kind)?;
                let purchase_operation_id: String = db
                    .query_row(
                        "SELECT purchase_operation_id FROM cars WHERE id=?1",
                        [saved_car_id],
                        |row| row.get(0),
                    )
                    .map_err(|e| format!("تعذر قراءة عملية شراء السيارة الممولة: {e}"))?;
                let note = format!(
                    "{} {} (شاصي: {})",
                    p_type,
                    name.trim(),
                    clean_chassis.as_str()
                )
                .trim()
                .replace("  ", " ");

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,related_source_type,related_source_id,account_id,operation_id)
                     VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, ?8, 'car_purchase', ?9, ?10, 0, 0, 0,'car',?9,?11,?12)",
                    params![
                        f_name,
                        p_kind,
                        p_type,
                        total_amount,
                        purchase_date.as_deref().unwrap_or(""),
                        note,
                        currency.as_deref().unwrap_or("IQD"),
                        purchase_payment_type.as_deref().unwrap_or("قاصه"),
                        saved_car_id_text.as_str(),
                        role,
                        financier_account_id,
                        purchase_operation_id,
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // حذف وإعادة توزيع الأرباح والكاش عند البيع
    let sale_note = format!("ايداع بيع سيارة {} {}", name.trim(), clean_chassis.as_str())
        .trim()
        .replace("  ", " ");

    if should_rebuild_sale_ledger && !effective_skip_sale {
        // Delete only car sale generated rows (not purchase rows)
        delete_generated_car_sale_partner_transactions(&db, &saved_car_id_text)?;

        // Only delete and recreate customer sale-generated rows when actual sale terms changed.
        // For cost-only or car-number-only edits, preserve existing customer rows (down payment,
        // installment schedule, due-date) to avoid data loss — add_car does not recreate them.
        if sale_changed {
            let sale_gen_customer_ids: Vec<(i64, String)> = db
        .prepare("SELECT id, partner_name FROM partner_transactions WHERE kind = 'زبون' AND related_source_type = 'car' AND related_entity_id = ?1 AND (source_type = 'customer_sale_payment' OR source_type = 'customer_installment_schedule')")
                .map_err(|e| e.to_string())?
                .query_map(params![saved_car_id_text], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            let mut buyers_to_recalc_for_splits: std::collections::HashSet<String> =
                std::collections::HashSet::new();
            for (pid, buyer_name_str) in &sale_gen_customer_ids {
                delete_customer_payment_partner_splits(&db, *pid)?;
                delete_customer_payment_profit_splits(&db, *pid)?;
                append_partner_transaction_reversal_by_id(&db, *pid, "تعديل شروط بيع السيارة")?;
                buyers_to_recalc_for_splits.insert(buyer_name_str.clone());
            }
            for buyer_name_recalc in buyers_to_recalc_for_splits {
                recalculate_partner_total(&db, &buyer_name_recalc, "زبون")?;
            }
        }
    }

    if should_rebuild_sale_ledger && !effective_skip_sale {
        // Currency policy: block mixed-currency sales without explicit fx_rate
        let purchase_curr = currency.as_deref().unwrap_or("IQD");
        let sale_curr = sale_currency.as_deref().unwrap_or("IQD");
        if purchase_curr != sale_curr {
            return Err(
                "لا يمكن بيع السيارة بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string(),
            );
        }

        // توزيع 50% للشركاء عند بيع السيارة
        let sale_payment_type = payment_type.as_deref().unwrap_or("قاصه");
        let sale_date_str = sale_date.as_deref().unwrap_or("");

        if payment_type.as_deref() == Some("كاش") {
            // Phase 8: Cash sale — one cash movement for full selling price + one profit recognition
            // Effect 1: Cash movement for full selling price
            distribute_to_partners_50_with_effects(
                &db,
                selling,
                sale_curr,
                sale_date_str,
                sale_payment_type,
                "ايداع بيع سيارة",
                &sale_note,
                "car_sale",
                &saved_car_id_text,
                "cash_movement",
                true,  // affects_qasa
                true,  // affects_partner_cash
                false, // affects_profit
            )?;

            // Effect 2: Profit recognition (does not increase Qasa/Cash)
            rebuild_cash_sale_profit_recognition(&db, saved_car_id)?;
        } else {
            // لا نوزع الأرباح هنا لأن السيارة بيعت بالتقسيط أو بموعد تسليم والأرباح لم تقبض بالكامل بعد.
            // خسارة بيع التقسيط، إن وجدت، يعاد إثباتها بعد قيود البيع حتى تتطابق تقارير الشركاء مع دفتر الأستاذ.
        }
    }

    recalculate_all_partners(&db)?;

    // تجهيز قيم الوقت المناسبة للكتابة
    let mut purchase_time_to_write = existing_purchase_time;
    if purchase_date.is_none() || purchase_date.as_deref() == Some("") {
        purchase_time_to_write = Some("00:00".to_string());
    }

    let mut sale_time_to_write = existing_sale_time;
    if sale_date.is_none() || sale_date.as_deref() == Some("") {
        sale_time_to_write = Some("00:00".to_string());
    }

    // UPDATE extra fields
    db.execute(
        "UPDATE cars SET buyer_name = ?1, buyer_phone = ?2, purchase_date = ?3, sale_date = ?4, delivery_date = ?5, first_payment_date = ?6, purchase_payment_type = ?7, purchase_time = ?8, sale_time = ?9 WHERE id = ?10",
        (
            buyer_name,
            buyer_phone,
            purchase_date,
            sale_date,
            delivery_date,
            first_payment_date,
            purchase_payment_type,
            purchase_time_to_write,
            sale_time_to_write,
            saved_car_id,
        ),
    )
    .map_err(|e| e.to_string())?;

    // تسجيل وقت الشراء — مرة واحدة فقط عند الإضافة الأولى (لا يُعاد عند البيع أو التعديل)
    db.execute(
        "UPDATE cars SET purchase_time = strftime('%H:%M', 'now', 'localtime') WHERE id = ?1 AND purchase_date IS NOT NULL AND purchase_date != '' AND (purchase_time IS NULL OR purchase_time = '' OR purchase_time = '00:00')",
        [saved_car_id],
    )
    .map_err(|e| e.to_string())?;
    // تسجيل وقت البيع — يُحدَّث فقط عند وجود تاريخ البيع ولم يكن مسجلاً سابقاً
    db.execute(
        "UPDATE cars SET sale_time = strftime('%H:%M:%S', 'now', 'localtime') WHERE id = ?1 AND sale_date IS NOT NULL AND sale_date != '' AND (sale_time IS NULL OR sale_time = '' OR sale_time = '00:00')",
        [saved_car_id],
    )
    .map_err(|e| e.to_string())?;

    if should_rebuild_purchase {
        record_car_purchase_ledger_entries(&db, saved_car_id)?;
        // The purchase rows are created after the initial identity pass above.
        // Link the newly generated ledger rows before the transaction commits so
        // append-only cancellation can discover and reverse them by operation_id.
        ensure_purchase_identity(&db, saved_car_id)?;
    }
    if should_rebuild_sale_ledger && !effective_skip_sale {
        record_car_sale_ledger_entries(&db, saved_car_id)?;
    }
    if should_rebuild_sale_ledger && !effective_skip_sale && payment_type.as_deref() != Some("كاش")
    {
        rebuild_installment_sale_loss_recognition(&db, saved_car_id)?;
    }
    if sold_cost_changed && payment_type.as_deref() != Some("كاش") {
        rebuild_customer_payment_profit_recognitions_for_car(&db, &car_number)?;
        let cap_sale_id: i64 = db
            .query_row(
                "SELECT active_sale_id FROM cars WHERE id=?1",
                [saved_car_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        validate_profit_cap_for_car(&db, saved_car_id, cap_sale_id)?;
    } else if sold_cost_changed {
        let cap_sale_id: i64 = db
            .query_row(
                "SELECT active_sale_id FROM cars WHERE id=?1",
                [saved_car_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        validate_profit_cap_for_car(&db, saved_car_id, cap_sale_id)?;
    }

    let purchase_operation_id: String = db
        .query_row(
            "SELECT purchase_operation_id FROM cars WHERE id=?1",
            [saved_car_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر قراءة عملية شراء السيارة للتدقيق: {e}"))?;
    let audit_values = serde_json::json!({
        "car_id": saved_car_id,
        "plate_number": requested_plate,
        "chassis_number": clean_chassis,
        "purchase_price": purchase,
        "purchase_currency": curr,
        "purchase_type": purchase_type,
        "status": status,
    })
    .to_string();
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "car",
        Some(saved_car_id),
        if car_id.is_some() {
            "update_car"
        } else {
            "add_car"
        },
        Some(&session_token),
        None,
        AuditEventDetails {
            operation_id: Some(&purchase_operation_id),
            new_values_json: Some(&audit_values),
            ..Default::default()
        },
    )?;

    complete_idempotent_creation(&db, creation_token.as_deref(), &saved_car_id.to_string())?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(saved_car_id)
}

fn ensure_purchase_identity(tx: &rusqlite::Transaction, car_id: i64) -> Result<String, String> {
    let car_id_text = car_id.to_string();
    let existing: Option<String> = tx
        .query_row(
            "SELECT purchase_operation_id FROM cars WHERE id=?1",
            [car_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    let operation_id = if let Some(id) = existing {
        id
    } else {
        let id = new_ledger_token("car_purchase");
        tx.execute(
            "INSERT INTO operations (id,operation_type,status) VALUES (?1,'car_purchase','active')",
            [&id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE cars SET purchase_operation_id=?1,
             updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime') WHERE id=?2",
            params![id, car_id],
        )
        .map_err(|e| e.to_string())?;
        id
    };
    tx.execute(
        "UPDATE partner_transactions SET operation_id=?1
         WHERE source_type='car_purchase' AND source_entity_id=?2",
        params![operation_id, car_id_text],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE financial_ledger SET operation_id=?1
         WHERE reference_type='car' AND reference_entity_id=?2
           AND (type_ LIKE '%شراء%' OR type_ LIKE '%تمويل%')",
        params![operation_id, car_id_text],
    )
    .map_err(|e| e.to_string())?;
    Ok(operation_id)
}

/// Add a partner if not exists (inside transaction).
pub fn ensure_partner_exists(
    tx: &Connection,
    name: &str,
    phone: &str,
    kind: &str,
) -> Result<i64, String> {
    let phone = normalize_phone_digits(phone);
    let display_name = name.trim();
    let account_type = kind.trim();
    let normalized_name = normalize_account_name(display_name);
    validate_required_text(&normalized_name, "اسم الحساب")?;

    let existing_account: Option<(i64, String, String)> = tx
        .query_row(
            "SELECT id, display_name, account_type FROM accounts WHERE normalized_name=?1",
            [&normalized_name],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let account_id = if let Some((id, existing_name, existing_type)) = existing_account {
        if existing_name != display_name || existing_type != account_type {
            return Err(format!(
                "اسم الحساب '{}' مستخدم مسبقًا للحساب {}/{}",
                display_name, existing_name, existing_type
            ));
        }
        tx.execute(
            "UPDATE accounts SET phone=CASE WHEN ?1<>'' THEN ?1 ELSE phone END,
             updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime') WHERE id=?2",
            params![phone.as_str(), id],
        )
        .map_err(|e| e.to_string())?;
        id
    } else {
        tx.execute(
            "INSERT INTO accounts (display_name,normalized_name,account_type,phone)
             VALUES (?1,?2,?3,?4)",
            params![display_name, normalized_name, account_type, phone.as_str()],
        )
        .map_err(|e| e.to_string())?;
        tx.last_insert_rowid()
    };
    tx.execute(
        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind, account_id)
         VALUES (?1, ?2, '0', ?3, ?4)",
        params![display_name, phone.as_str(), account_type, account_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE partners SET account_id=?1,
         phone=CASE WHEN ?2<>'' THEN ?2 ELSE phone END
         WHERE account_id=?1",
        params![account_id, phone.as_str()],
    )
    .map_err(|e| e.to_string())?;
    Ok(account_id)
}

#[allow(clippy::too_many_arguments)]
fn create_sale_identity(
    tx: &rusqlite::Transaction,
    car_id: i64,
    customer_account_id: i64,
    payment_type: &str,
    selling_price: Money,
    currency: &str,
    sale_date: &str,
    creation_token: Option<&str>,
) -> Result<(i64, String), String> {
    let operation_id = new_ledger_token("car_sale");
    tx.execute(
        "INSERT INTO operations (id,operation_type,status,creation_token)
         VALUES (?1,'car_sale','active',?2)",
        params![operation_id, creation_token],
    )
    .map_err(|e| e.to_string())?;
    let sale_type = match payment_type {
        "اقساط" => "اقساط",
        "موعد" => "موعد",
        _ => "كاش",
    };
    tx.execute(
        "INSERT INTO car_sales
         (operation_id,car_id,customer_account_id,sale_type,selling_price,currency,sale_date,status,creation_token)
         VALUES (?1,?2,?3,?4,?5,?6,?7,'active',?8)",
        params![operation_id, car_id, customer_account_id, sale_type,
                selling_price, currency, sale_date, creation_token],
    ).map_err(|e| e.to_string())?;
    let sale_id = tx.last_insert_rowid();
    tx.execute(
        "UPDATE cars SET active_sale_id=?1, version=version+1,
         updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime') WHERE id=?2",
        params![sale_id, car_id],
    )
    .map_err(|e| e.to_string())?;
    Ok((sale_id, operation_id))
}

fn sync_sale_identity_links(
    tx: &Connection,
    car_id: i64,
    sale_id: i64,
    operation_id: &str,
    customer_account_id: i64,
) -> Result<(), String> {
    tx.execute(
        "UPDATE partner_transactions
         SET account_id=CASE WHEN kind='زبون' THEN ?1 ELSE account_id END,
             operation_id=?2, sale_id=?3,
             related_source_id=CAST(?4 AS TEXT),related_entity_id=?4
         WHERE related_source_type='car' AND related_entity_id=?4",
        params![customer_account_id, operation_id, sale_id, car_id,],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE partner_transactions
         SET source_id=CAST(?1 AS TEXT),source_entity_id=?1
         WHERE sale_id=?1 AND source_type='customer_sale_payment'
           AND source_role='sale_down_payment'",
        [sale_id],
    )
    .map_err(|e| e.to_string())?;
    let invalid_account_links: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM partner_transactions pt
             LEFT JOIN partners p ON p.account_id=pt.account_id AND p.kind=pt.kind
             WHERE pt.related_source_type='car' AND pt.related_entity_id=?1
               AND (pt.account_id IS NULL OR p.account_id IS NULL)",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if invalid_account_links != 0 {
        return Err(format!(
            "تعذر ربط {invalid_account_links} من آثار البيع بحساب رقمي صحيح"
        ));
    }
    tx.execute(
        "UPDATE financial_ledger SET operation_id=?1, sale_id=?2
         WHERE reference_type='car' AND reference_entity_id IN (?3,?4)
           AND type_ NOT LIKE '%شراء%' AND type_ NOT LIKE '%تمويل%'",
        params![operation_id, sale_id, sale_id, car_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE partner_transactions
         SET operation_id=(SELECT purchase_operation_id FROM cars WHERE id=?1),
             source_entity_id=?1
         WHERE source_type='car_purchase' AND source_entity_id=?1",
        [car_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO installments
         (operation_id,sale_id,customer_account_id,legacy_transaction_id,
          due_date,currency,original_amount,current_amount,status)
         SELECT ?1,?2,?3,pt.id,COALESCE(pt.due_date,pt.date),COALESCE(pt.currency,'IQD'),
                COALESCE(pt.original_amount,pt.amount),COALESCE(pt.current_amount,pt.amount),
                CASE WHEN COALESCE(pt.is_reversed,0)=1 THEN 'reversed'
                     WHEN COALESCE(pt.current_amount,pt.amount)='0' THEN 'paid' ELSE 'unpaid' END
         FROM partner_transactions pt
         WHERE pt.related_source_type='car' AND pt.related_entity_id=?4
           AND pt.source_type='customer_installment_schedule'
           AND pt.source_role='installment_schedule'
           AND NOT EXISTS (SELECT 1 FROM installments i WHERE i.legacy_transaction_id=pt.id)",
        params![operation_id, sale_id, customer_account_id, car_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn resolve_existing_customer_phone(
    tx: &rusqlite::Transaction,
    buyer_name: &str,
    provided_phone: &str,
) -> String {
    let phone = normalize_phone_digits(provided_phone);
    if !phone.trim().is_empty() {
        return phone;
    }
    tx.query_row(
        "SELECT COALESCE(phone, '')
         FROM partners
         WHERE partner_name = ?1 AND kind = 'زبون'",
        [buyer_name.trim()],
        |row| row.get::<_, String>(0),
    )
    .map(|saved_phone| normalize_phone_digits(&saved_phone))
    .unwrap_or_default()
}

/// sell_car_with_accounting: Atomic car sale workflow.
/// Creates customer account, down payment, installment rows, and car ledger entries in one transaction.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn sell_car_with_accounting(
    state: State<AppState>,
    car_id: i64,
    buyer_name: String,
    buyer_phone: String,
    selling_price: Money,
    sale_currency: String,
    sale_date: String,
    payment_type: String,
    amount_paid: Money,
    amount_remaining: Money,
    installment_months: Option<i32>,
    first_payment_date: Option<String>,
    delivery_date: Option<String>,
    chassis_number: Option<String>,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&buyer_name, "اسم المشتري")?;
    validate_currency(&sale_currency)?;
    validate_required_text(&sale_date, "تاريخ البيع")?;

    validate_sale_amounts(selling_price, amount_paid, amount_remaining, &payment_type)?;

    if payment_type == "اقساط" {
        if let Some(months) = installment_months {
            if months <= 0 {
                return Err("عدد أشهر التقسيط يجب أن يكون أكبر من صفر".to_string());
            }
        }
    }

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    ensure_accounting_period_open(&db, &sale_date)?;
    let car_number: String = db
        .query_row(
            "SELECT car_number FROM cars WHERE id = ?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|_| format!("تعذر العثور على السيارة ذات المعرّف {}", car_id))?;

    let car_label = db
        .query_row("SELECT car_name FROM cars WHERE id = ?1", [car_id], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| format!("تعذر قراءة اسم السيارة: {e}"))?;

    let chassis_label = chassis_number.clone().unwrap_or_default();
    let clean_chassis = chassis_label.trim();
    let clean_buyer_phone = normalize_phone_digits(&buyer_phone);
    let customer_account_id = ensure_partner_exists(&db, &buyer_name, &clean_buyer_phone, "زبون")?;

    // Mixed currency check
    let purchase_currency: String = db
        .query_row(
            "SELECT COALESCE(currency, 'IQD') FROM cars WHERE id = ?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر قراءة عملة شراء السيارة: {e}"))?;

    if purchase_currency != sale_currency {
        return Err("لا يمكن بيع السيارة بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string());
    }

    // ============================================================
    // STEP 1: Check car exists, then update sale fields
    // ============================================================
    let existing_status: String = db
        .query_row("SELECT status FROM cars WHERE id = ?1", [car_id], |row| {
            row.get(0)
        })
        .map_err(|_| format!("تعذر العثور على السيارة ذات المعرّف {}", car_id))?;
    if existing_status == "مبيوعة" {
        return Err(
            "السيارة مبيوعة بالفعل. استخدم تعديل السيارة المبيوعة بدلاً من إعادة البيع.".to_string(),
        );
    }

    let now_time = db
        .query_row(
            "SELECT strftime('%H:%M:%S', 'now', 'localtime')",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("تعذر تحديد وقت البيع: {e}"))?;

    let rows_affected = db
        .execute(
            "UPDATE cars SET
            status = 'مبيوعة',
            selling_price = ?1,
            sale_currency = ?2,
            payment_type = ?3,
            amount_paid = ?4,
            amount_remaining = ?5,
            installment_months = ?6,
            buyer_name = ?7,
            buyer_phone = ?8,
            sale_date = ?9,
            sale_time = ?10,
            delivery_date = ?11,
            first_payment_date = ?12
         WHERE id = ?13",
            params![
                selling_price,
                sale_currency,
                payment_type,
                amount_paid,
                amount_remaining,
                installment_months.unwrap_or(1),
                buyer_name.trim(),
                clean_buyer_phone.as_str(),
                sale_date,
                now_time,
                delivery_date,
                first_payment_date,
                car_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    if rows_affected == 0 {
        return Err(format!("تعذر العثور على السيارة ذات المعرّف {}", car_id));
    }
    let (sale_id, operation_id) = create_sale_identity(
        &db,
        car_id,
        customer_account_id,
        &payment_type,
        selling_price,
        &sale_currency,
        &sale_date,
        None,
    )?;

    // Store total car expenses at sale time for accurate profit calculation
    let expenses_at_sale = sum_money_rows(
        &db,
        "SELECT amount FROM car_expenses WHERE car_expenses.car_id = ?1",
        [car_id],
    )?;
    db.execute(
        "UPDATE cars SET expenses_at_sale = ?1 WHERE id = ?2",
        params![expenses_at_sale, car_id],
    )
    .map_err(|e| e.to_string())?;

    // ============================================================
    // STEP 2: Delete existing sale-related customer rows, partner rows, splits, and ledger entries before rebuilding
    // ============================================================
    // Delete customer rows and their splits linked to this car (down payment, installment schedule)
    delete_sale_generated_customer_rows_for_car(&db, &car_id.to_string())?;

    // Delete sale partner rows (not purchase rows)
    delete_generated_car_sale_partner_transactions(&db, &sale_id.to_string())?;

    // Delete sale-related car ledger entries (receivable, deferred_revenue, revenue, COGS, inventory credit)
    // But keep purchase entries.
    // CRITICAL-3 FIX: Insert reversal entries before deleting to preserve audit trail.
    // Combines both original DELETEs (sale accounts + inventory credit) into one reversal+delete.
    reverse_and_delete_ledger_entries(
        &db,
        "SELECT id, date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, notes
             FROM financial_ledger WHERE reference_type = 'car' AND reference_entity_id = :param
         AND reverses_ledger_id IS NULL
         AND (
           (account_type IN ('receivable', 'deferred_revenue', 'revenue', 'expense', 'cash')
            AND (type_ LIKE '%بيع%' OR type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%' OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%'))
           OR (account_type = 'inventory' AND credit > 0 AND type_ LIKE '%تخفيض%')
         )",
        "sale_id",
        &sale_id.to_string(),
        &format!("عكس قيود بيع السيارة {} قبل إعادة بناء البيع", car_number),
    )?;

    // ============================================================
    // STEP 3a: Installment/Due-date: Create customer account + payment + schedule
    // ============================================================
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";
    if is_installments_or_due {
        // Down payment
        if amount_paid > Money::zero() {
            let dp_notes = format!(
                "استلام مقدمة سيارة من {} رقم الشاصي {} #بيع_سيارة_{}",
                buyer_name, clean_chassis, car_number
            );

            db.execute(
                "INSERT INTO partner_transactions (
                    partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                    source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                    related_source_type, related_source_id, account_id, operation_id, sale_id
                 )
                 VALUES (?1, 'زبون', 'مقدمة بيع سيارة', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_sale_payment', ?7, 'sale_down_payment', 0, 0, 0, 'car', ?8, ?9, ?10, ?11)",
                params![
                    buyer_name.trim(),
                    amount_paid,
                    sale_date,
                    &now_time,
                    &dp_notes,
                    sale_currency,
                    sale_id.to_string(),
                    car_id.to_string(),
                    customer_account_id,
                    operation_id,
                    sale_id,
                ],
            )
            .map_err(|e| e.to_string())?;
            let dp_id = db.last_insert_rowid();

            record_partner_ledger_entries(&db, dp_id)?;
            apply_partner_transaction_splits(
                &db,
                dp_id,
                buyer_name.trim(),
                "زبون",
                "مقدمة بيع سيارة",
                amount_paid,
                &sale_date,
                Some(&dp_notes),
                &sale_currency,
                "قاصه",
            )?;

            recalculate_partner_total(&db, buyer_name.trim(), "زبون")?;
        }
        // Installment schedule
        rebuild_installment_schedule(&db, &car_number)?;
        recalculate_partner_total(&db, buyer_name.trim(), "زبون")?;
    } else if payment_type == "كاش" {
        // ============================================================
        // STEP 3b: Cash sale — NO customer account, NO receivable
        // Car_sale cash_movement + profit_recognition directly to partners
        // ============================================================

        // 1. Cash movement (selling_price split 50/50, affects qasa/cash)
        let cash_note = format!(
            "ايداع بيع سيارة {} ({}) إلى {}",
            car_label,
            car_number,
            buyer_name.trim()
        );
        distribute_to_partners_50_with_effects_and_related(
            &db,
            selling_price,
            &sale_currency,
            &sale_date,
            "قاصه",
            "ايداع بيع سيارة",
            &cash_note,
            "car_sale",
            &sale_id.to_string(),
            "cash_movement",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
            Some("car"),
            Some(&car_id.to_string()),
        )?;
        rebuild_cash_sale_profit_recognition(&db, car_id)?;
    }

    // ============================================================
    // STEP 6: Record car sale ledger entries only (old entries already deleted above)
    // ============================================================
    record_car_sale_ledger_entries(&db, car_id)?;
    if is_installments_or_due {
        rebuild_installment_sale_loss_recognition(&db, car_id)?;
        rebuild_customer_payment_profit_recognitions_for_car(&db, &car_number)?;
    }

    sync_sale_identity_links(&db, car_id, sale_id, &operation_id, customer_account_id)?;

    // ============================================================
    // STEP 7: Recalculate and commit
    // ============================================================
    recalculate_all_partners(&db)?;

    let audit_values = serde_json::json!({
        "sale_id": sale_id,
        "customer_account_id": customer_account_id,
        "buyer_name": buyer_name.trim(),
        "selling_price": selling_price,
        "sale_currency": sale_currency,
        "payment_type": payment_type,
        "amount_paid": amount_paid,
        "amount_remaining": amount_remaining,
    })
    .to_string();
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "car",
        Some(car_id),
        "sell_car_with_accounting",
        Some(&session_token),
        None,
        AuditEventDetails {
            operation_id: Some(&operation_id),
            account_id: Some(customer_account_id),
            new_values_json: Some(&audit_values),
            ..Default::default()
        },
    )?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn days_in_month(year: i32, month: i32) -> i32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

pub fn add_months_to_date(date_str: &str, months: i32) -> String {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return date_str.to_string();
    }
    let year: i32 = parts[0].parse().unwrap_or(2026);
    let month: i32 = parts[1].parse().unwrap_or(1);
    let day: i32 = parts[2].parse().unwrap_or(1);

    let total_months = (year * 12 + month - 1) + months;
    let new_year = total_months / 12;
    let new_month = (total_months % 12) + 1;

    let max_day = days_in_month(new_year, new_month);
    let clamped_day = day.min(max_day);

    format!("{:04}-{:02}-{:02}", new_year, new_month, clamped_day)
}

#[tauri::command]
pub fn get_cars(state: State<AppState>) -> Result<Vec<Car>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT car_number, chassis_number, car_name, color, details,
                    purchase_price, currency,
                    sale_currency,
                    selling_price, status,
                    payment_type, cash_price, amount_paid, amount_remaining,
                    installment_months, monthly_payment,
                    buyer_name, buyer_phone, purchase_date, sale_date,
                    delivery_date, first_payment_date, purchase_payment_type,
                    COALESCE(car_plate_num, car_number),
                    COALESCE(car_model, car_name), COALESCE(car_year, ''),
                    purchase_type, financer_name, commission_type, commission_value,
                    id, version,
                    (SELECT cs.version FROM car_sales cs
                     WHERE cs.id=cars.active_sale_id AND cs.status='active')
             FROM cars WHERE status<>'محذوفة' ORDER BY rowid ASC",
        )
        .map_err(|e| e.to_string())?;

    let cars = stmt
        .query_map([], |row| {
            Ok(Car {
                id: row.get(30)?,
                car_number: row.get(0)?,
                car_plate_num: row.get(23)?,
                chassis_number: row.get(1)?,
                car_model: row.get(24)?,
                car_year: row.get(25)?,
                car_name: row.get(2)?,
                color: row.get(3)?,
                details: row.get(4)?,
                purchase_price: row.get(5)?,
                currency: row.get(6)?,
                sale_currency: row.get(7)?,
                selling_price: row.get(8)?,
                status: row.get(9)?,
                payment_type: row.get(10)?,
                cash_price: row.get(11)?,
                amount_paid: row.get(12)?,
                amount_remaining: row.get(13)?,
                installment_months: row.get(14)?,
                monthly_payment: row.get(15)?,
                buyer_name: row.get(16)?,
                buyer_phone: row.get(17)?,
                purchase_date: row.get(18)?,
                sale_date: row.get(19)?,
                delivery_date: row.get(20)?,
                first_payment_date: row.get(21)?,
                purchase_payment_type: row.get(22)?,
                purchase_type: row.get(26)?,
                financer_name: row.get(27)?,
                commission_type: row.get(28)?,
                commission_value: row.get(29)?,
                car_partners: None,
                expenses_sum: None,
                version: row.get(31)?,
                active_sale_version: row.get(32)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut cars_with_partners = Vec::new();
    for mut car in cars {
        let mut p_stmt = db
            .prepare("SELECT car_number, partner_name, amount, currency, kind FROM car_partners WHERE car_number = ?1")
            .map_err(|e| e.to_string())?;
        let partners = p_stmt
            .query_map([&car.car_number], |p_row| {
                Ok(CarPartner {
                    car_number: p_row.get(0)?,
                    partner_name: p_row.get(1)?,
                    amount: p_row.get(2)?,
                    currency: p_row.get(3)?,
                    kind: p_row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        car.car_partners = Some(partners);

        // Fetch sum of expenses for this car.
        // Audit fixes #5/#25: use the exact same cost basis as the backend profit
        // calculation (car_expenses_for_profit): expenses in the car's purchase
        // currency only, with the legacy expenses_at_sale snapshot as fallback, so
        // the UI profit always matches the recognized backend profit.
        car.expenses_sum = Some(car_expenses_for_profit(&db, car.id)?);

        cars_with_partners.push(car);
    }

    Ok(cars_with_partners)
}

fn append_car_ledger_reversals(
    db: &Connection,
    car_id: i64,
    cancellation_operation_id: &str,
) -> Result<usize, String> {
    let (date, time) = now_datetime();
    db.execute(
        "INSERT INTO financial_ledger (
            date,time,account_type,account_id,debit,credit,currency,
            reference_type,reference_id,type_,description,notes,ledger_batch_id,
            operation_id,account_id_v2,sale_id,reverses_ledger_id
         )
         SELECT ?2,?3,original.account_type,original.account_id,
                original.credit,original.debit,original.currency,
                original.reference_type,original.reference_id,
                'عكس: ' || original.type_,'عكس إلغاء دورة شراء سيارة',
                CASE WHEN original.notes IS NULL OR original.notes=''
                     THEN 'إلغاء موثق للسيارة ذات المعرّف ' || ?1
                     ELSE original.notes || ' | إلغاء موثق للسيارة ذات المعرّف ' || ?1 END,
                ?4,?4,original.account_id_v2,original.sale_id,original.id
         FROM financial_ledger original
         WHERE original.reverses_ledger_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM financial_ledger reversal
               WHERE reversal.reverses_ledger_id=original.id
           )
           AND (
               original.sale_id IN (SELECT id FROM car_sales WHERE car_id=?1)
               OR original.operation_id IN (
                   SELECT purchase_operation_id FROM cars WHERE id=?1
                   UNION SELECT operation_id FROM car_sales WHERE car_id=?1
                   UNION SELECT operation_id FROM car_expenses
                         WHERE car_id=?1 AND operation_id IS NOT NULL
                   UNION SELECT e.operation_id
                         FROM customer_installment_payment_events e
                         JOIN car_sales cs ON cs.id=e.sale_id_v2
                         WHERE cs.car_id=?1 AND e.status<>'reversal'
               )
           )",
        params![car_id, date, time, cancellation_operation_id],
    )
    .map_err(|e| format!("تعذر إنشاء قيود عكس إلغاء السيارة: {e}"))
}

pub(crate) fn append_car_partner_reversals(
    db: &Connection,
    car_id: i64,
    cancellation_operation_id: &str,
) -> Result<usize, String> {
    type PartnerRow = (
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
    let rows: Vec<PartnerRow> = {
        let mut stmt = db
            .prepare(
                "SELECT original.id,original.partner_name,original.kind,original.type,
                        original.amount,original.notes,original.currency,original.payment_type,
                        COALESCE(original.source_role,'car_effect'),
                        original.affects_qasa,original.affects_partner_cash,original.affects_profit,
                        original.related_source_type,original.related_source_id,
                        original.account_id,original.sale_id
                 FROM partner_transactions original
                 WHERE original.reverses_transaction_id IS NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM partner_transactions reversal
                       WHERE reversal.reverses_transaction_id=original.id
                   )
                   AND (
                       original.sale_id IN (SELECT id FROM car_sales WHERE car_id=?1)
                       OR original.operation_id IN (
                           SELECT purchase_operation_id FROM cars WHERE id=?1
                           UNION SELECT operation_id FROM car_sales WHERE car_id=?1
                           UNION SELECT operation_id FROM car_expenses
                                 WHERE car_id=?1 AND operation_id IS NOT NULL
                           UNION SELECT e.operation_id
                                 FROM customer_installment_payment_events e
                                 JOIN car_sales cs ON cs.id=e.sale_id_v2
                                 WHERE cs.car_id=?1 AND e.status<>'reversal'
                       )
                        -- Legacy profit rows may only carry the textual sale id.
                        OR (
                           original.source_type = 'car_sale'
                           AND original.source_role = 'profit_recognition'
                           AND CAST(original.source_id AS INTEGER) IN (
                               SELECT id FROM car_sales WHERE car_id=?1
                           )
                       )
                   )
                 ORDER BY original.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([car_id], |row| {
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
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };
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
        account_id,
        sale_id,
    ) in &rows
    {
        // Profit reports intentionally sum signed recognition rows. Keep the
        // canonical role on the negative reversal so the deleted car's profit
        // is removed from both the report and its summary cards.
        let reversal_source_role = if source_role == "profit_recognition" {
            source_role.clone()
        } else {
            format!("{source_role}_reversal")
        };
        db.execute(
            "INSERT INTO partner_transactions (
                partner_name,kind,type,amount,date,time,notes,currency,payment_type,
                source_type,source_id,source_role,affects_qasa,affects_partner_cash,
                affects_profit,related_source_type,related_source_id,ledger_batch_id,
                account_id,operation_id,sale_id,reverses_transaction_id
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'car_cancellation_reversal',
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
                format!("{cancellation_operation_id}:{original_id}"),
                reversal_source_role,
                affects_qasa,
                affects_partner_cash,
                affects_profit,
                related_source_type,
                related_source_id,
                cancellation_operation_id,
                account_id,
                cancellation_operation_id,
                sale_id,
                original_id,
            ],
        )
        .map_err(|e| format!("تعذر إنشاء عكس حركة شريك للسيارة: {e}"))?;
    }
    Ok(rows.len())
}

#[tauri::command]
pub fn delete_car(
    state: State<AppState>,
    car_id: i64,
    expected_car_version: i64,
    expected_sale_version: Option<i64>,
    session_token: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    let (
        _car_number,
        current_car_version,
        active_sale_id,
        current_sale_version,
        purchase_operation_id,
    ): (String, i64, Option<i64>, Option<i64>, String) = db
        .query_row(
            "SELECT c.car_number,c.version,c.active_sale_id,cs.version,c.purchase_operation_id
             FROM cars c LEFT JOIN car_sales cs ON cs.id=c.active_sale_id
             WHERE c.id=?1 AND c.status<>'محذوفة'",
            [car_id],
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
        .map_err(|_| format!("تعذر العثور على السيارة ذات المعرّف {}", car_id))?;
    if current_car_version != expected_car_version {
        return Err(format!(
            "تعارض تعديل السيارة: النسخة الحالية {} وليست {}",
            current_car_version, expected_car_version
        ));
    }
    if active_sale_id.is_some() && current_sale_version != expected_sale_version {
        return Err("تعارض تعديل البيع النشط: أعد تحميل السيارة قبل الإلغاء".to_string());
    }
    if active_sale_id.is_none() && expected_sale_version.is_some() {
        return Err("تعارض تعديل البيع: السيارة لا تملك بيعًا نشطًا".to_string());
    }

    let (reversal_date, _) = now_datetime();
    ensure_accounting_period_open(&db, &reversal_date)?;
    let ambiguous_legacy_expenses: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM expenses
             WHERE car_id=?1 AND operation_id IS NULL AND reverses_expense_id IS NULL",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if ambiguous_legacy_expenses != 0 {
        return Err(format!(
            "تعذر إلغاء السيارة: توجد {} مصروفات قديمة مرتبطة نصيًا ولا يمكن إسنادها إلى car_id بأمان",
            ambiguous_legacy_expenses
        ));
    }

    let cancellation_operation_id = new_ledger_token("car_cancellation");
    db.execute(
        "INSERT INTO operations
         (id,operation_type,status,reverses_operation_id,actor_user_id)
         VALUES (?1,'car_cancellation','active',?2,?3)",
        params![
            cancellation_operation_id,
            purchase_operation_id,
            actor_user_id
        ],
    )
    .map_err(|e| format!("تعذر إنشاء عملية إلغاء السيارة: {e}"))?;

    let paid_installments: Vec<i64> = {
        let mut stmt = db
            .prepare(
                "SELECT DISTINCT i.legacy_transaction_id
                 FROM installments i
                 JOIN customer_installment_payment_events e ON e.installment_id_v2=i.id
                 JOIN car_sales cs ON cs.id=i.sale_id
                 WHERE cs.car_id=?1 AND e.status='active'
                   AND i.legacy_transaction_id IS NOT NULL
                 ORDER BY i.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([car_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };
    for installment_id in paid_installments {
        reverse_customer_installment_payment_core(&db, installment_id)?;
    }

    append_car_ledger_reversals(&db, car_id, &cancellation_operation_id)?;
    append_car_partner_reversals(&db, car_id, &cancellation_operation_id)?;
    db.execute(
        "UPDATE operations
         SET status='reversed',reversed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             reversal_operation_id=?2
         WHERE status='active' AND id<>?2 AND id IN (
             SELECT purchase_operation_id FROM cars WHERE id=?1
             UNION SELECT operation_id FROM car_sales WHERE car_id=?1
             UNION SELECT operation_id FROM car_expenses
                    WHERE car_id=?1 AND operation_id IS NOT NULL
             UNION SELECT e.operation_id FROM customer_installment_payment_events e
                    JOIN car_sales cs ON cs.id=e.sale_id_v2
                    WHERE cs.car_id=?1 AND e.status<>'reversal'
         )",
        params![car_id, cancellation_operation_id],
    )
    .map_err(|e| format!("تعذر عكس عمليات السيارة الأصلية: {e}"))?;
    db.execute(
        "UPDATE installments
         SET status='cancelled',version=version+1,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE sale_id IN (SELECT id FROM car_sales WHERE car_id=?1)",
        [car_id],
    )
    .map_err(|e| format!("تعذر إلغاء استحقاقات السيارة: {e}"))?;
    if let Some(sale_id) = active_sale_id {
        let changed = db
            .execute(
                "UPDATE car_sales
                 SET status='cancelled',version=version+1,
                     updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id=?1 AND car_id=?2 AND status='active' AND version=?3",
                params![sale_id, car_id, expected_sale_version],
            )
            .map_err(|e| format!("تعذر إلغاء بيع السيارة: {e}"))?;
        if changed != 1 {
            return Err("تعارض تعديل البيع النشط أثناء إلغاء السيارة".to_string());
        }
    }
    let changed = db
        .execute(
            "UPDATE cars
             SET status='محذوفة',version=version+1,
                 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?1 AND version=?2 AND status<>'محذوفة'",
            params![car_id, expected_car_version],
        )
        .map_err(|e| format!("تعذر إلغاء السيارة: {e}"))?;
    if changed != 1 {
        return Err("تعارض تعديل السيارة أثناء الإلغاء".to_string());
    }

    append_audit_event_with_details(
        &db,
        actor_user_id,
        "car",
        Some(car_id),
        "cancel_car",
        Some(&session_token),
        None,
        AuditEventDetails {
            operation_id: Some(&cancellation_operation_id),
            reason: Some("إلغاء السيارة مع عكس قيودها"),
            ..Default::default()
        },
    )?;
    recalculate_all_partners(&db)?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[cfg(any())]
fn delete_car_physical_legacy(
    state: State<AppState>,
    car_id: i64,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    let car_number: String = db
        .query_row(
            "SELECT car_number FROM cars WHERE id = ?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|_| format!("تعذر العثور على السيارة ذات المعرّف {}", car_id))?;
    let car_number = car_number.as_str();

    // Get car details before deleting it
    let (_car_name, _chassis_number): (String, Option<String>) = db
        .query_row(
            "SELECT car_name, chassis_number FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("السيارة رقم {} غير موجودة", car_number))?;
    append_audit_event(
        &db,
        actor_user_id,
        "car",
        None,
        "delete_car",
        Some(&session_token),
        None,
    )?;

    // Audit fix #6: the sale tag must be matched as a complete token (end of the
    // note or followed by a space), otherwise deleting car "123" would also match
    // rows tagged for car "1234" because '%..._123%' is a prefix of '..._1234'.
    let sale_tag_end = format!("%#بيع_سيارة_{}", car_number);
    let sale_tag_mid = format!("%#بيع_سيارة_{} %", car_number);
    // AUD-002 FIX: The transaction_splits table does not exist in the current schema.
    // The old DELETE statements referenced a table that was never created, which would
    // cause delete_car to fail on any database. Partner transaction splits are stored
    // in the partner_transactions table via source_type/source_id columns, so deleting
    // partner_transactions (done below) is sufficient.

    db.execute(
        "SELECT 1 FROM financial_ledger
         WHERE (reference_type = 'car' AND reference_entity_id = ?1)
            OR (reference_type = 'car_expense' AND reference_id IN (
                SELECT CAST(id AS TEXT) FROM car_expenses WHERE car_number = ?1
            ))
            OR (reference_type = 'expense' AND reference_id IN (
                SELECT CAST(id AS TEXT) FROM expenses WHERE car_number = ?1
            ))
            OR (reference_type = 'partner_transaction' AND reference_id IN (
                SELECT CAST(id AS TEXT) FROM partner_transactions
                WHERE (source_type IN ('car_purchase', 'car_sale') AND source_id = ?1)
                   OR (related_source_type = 'car' AND related_source_id = ?1)
                   OR (source_type = 'car_expense' AND source_id IN (
                       SELECT CAST(id AS TEXT) FROM car_expenses WHERE car_number = ?1
                   ))
                   OR COALESCE(notes, '') LIKE ?2
                   OR COALESCE(notes, '') LIKE ?3
            ))",
        params![car_number, sale_tag_end.as_str(), sale_tag_mid.as_str()],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "SELECT 1 FROM customer_installment_payment_events WHERE sale_id = ?1",
        [car_number],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "SELECT 1 FROM partner_transactions
         WHERE (source_type IN ('car_purchase', 'car_sale') AND source_entity_id = ?1)
            OR (related_source_type = 'car' AND related_source_id = ?1)
            OR (source_type = 'car_expense' AND source_id IN (
                SELECT CAST(id AS TEXT) FROM car_expenses WHERE car_number = ?1
            ))
            OR COALESCE(notes, '') LIKE ?2
            OR COALESCE(notes, '') LIKE ?3",
        params![car_number, sale_tag_end.as_str(), sale_tag_mid.as_str()],
    )
    .map_err(|e| e.to_string())?;
    // Numeric identity tables carry real foreign keys, so dependent payment,
    // installment, and sale rows must be removed in child-to-parent order.
    // This legacy delete command remains atomic; the dedicated reversal flow
    // will supersede physical deletion for posted financial history.
    db.execute(
        "SELECT 1 FROM customer_installment_payment_events
         WHERE sale_id_v2 IN (SELECT id FROM car_sales WHERE car_id=?1)",
        [car_id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "SELECT 1 FROM installments WHERE sale_id IN (SELECT id FROM car_sales WHERE car_id=?1)",
        [car_id],
    )
    .map_err(|e| e.to_string())?;
    db.execute("SELECT 1 FROM car_sales WHERE car_id=?1", [car_id])
        .map_err(|e| e.to_string())?;
    db.execute("SELECT 1 FROM car_expenses WHERE car_id=?1", [car_id])
        .map_err(|e| e.to_string())?;
    db.execute("SELECT 1 FROM cars WHERE id = ?1", [car_id])
        .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM car_partners WHERE car_number = ?1",
        [car_number],
    )
    .map_err(|e| e.to_string())?;
    db.execute("SELECT 1 FROM expenses WHERE car_number = ?1", [car_number])
        .map_err(|e| e.to_string())?;
    recalculate_all_partners(&db)?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// update_sold_car_with_accounting: Atomic sold-car financial field edit.
/// Preserves manual customer payments, rebuilds only sale-generated rows.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
#[allow(clippy::type_complexity)]
pub fn update_sold_car_with_accounting(
    state: State<AppState>,
    car_id: i64,
    buyer_name: String,
    buyer_phone: String,
    selling_price: Money,
    sale_currency: String,
    sale_date: String,
    payment_type: String,
    amount_paid: Money,
    amount_remaining: Money,
    installment_months: Option<i32>,
    first_payment_date: Option<String>,
    delivery_date: Option<String>,
    monthly_payment: Option<Money>,
    expected_car_version: i64,
    expected_sale_version: i64,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION
    // ============================================================
    validate_required_text(&buyer_name, "اسم المشتري")?;
    validate_currency(&sale_currency)?;
    validate_required_text(&sale_date, "تاريخ البيع")?;
    validate_non_negative_amount(selling_price, "سعر البيع")?;
    validate_non_negative_amount(amount_paid, "المقدمة")?;
    validate_non_negative_amount(amount_remaining, "المبلغ المتبقي")?;

    if payment_type == "اقساط" {
        if let Some(months) = installment_months {
            if months <= 0 {
                return Err("عدد أشهر التقسيط يجب أن يكون أكبر من صفر".to_string());
            }
        }
    }

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    ensure_accounting_period_open(&db, &sale_date)?;
    let (car_number, current_car_version, active_sale_id, current_sale_version, sale_operation_id):
        (String, i64, i64, i64, String) = db
        .query_row(
            "SELECT c.car_number,c.version,cs.id,cs.version,cs.operation_id
             FROM cars c JOIN car_sales cs ON cs.id=c.active_sale_id AND cs.status='active'
             WHERE c.id=?1",
            [car_id],
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
        .map_err(|_| format!("تعذر العثور على بيع فعال للسيارة ذات المعرّف {car_id}"))?;
    if current_car_version != expected_car_version || current_sale_version != expected_sale_version
    {
        return Err(format!(
            "تعارض: السيارة/البيع عُدّلا من مستخدم آخر (car {current_car_version}, sale {current_sale_version})"
        ));
    }

    // Load existing car data
    let old_car: Result<(String, Money, String, String, Money, String, Option<String>, Option<Money>, Option<Money>, Option<i32>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>), rusqlite::Error> = db.query_row(
        "SELECT car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(sale_currency, 'IQD'),
                selling_price, status, payment_type, amount_paid, amount_remaining,
                installment_months, buyer_name, buyer_phone, sale_date, delivery_date, first_payment_date
         FROM cars WHERE id = ?1",
        [car_id],
        |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
            row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
            row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?,
            row.get(12)?, row.get(13)?, row.get(14)?,
        )),
    );
    let (
        car_name,
        _purchase_price,
        currency,
        _old_sale_currency,
        _old_selling_price,
        status,
        old_payment_type,
        _old_amount_paid,
        _old_amount_remaining,
        _old_installment_months,
        _old_buyer_name,
        _old_buyer_phone,
        _old_sale_date,
        _old_delivery_date,
        _old_first_payment_date,
    ) = match old_car {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err(format!("السيارة رقم {} غير موجودة", car_number))
        }
        Err(e) => return Err(e.to_string()),
    };

    if status != "مبيوعة" {
        return Err("السيارة غير مباعة، استخدم sell_car_with_accounting".to_string());
    }

    // Mixed currency check
    if currency != sale_currency {
        return Err("لا يمكن تعديل البيع بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string());
    }

    let old_is_installments_or_due =
        matches!(old_payment_type.as_deref(), Some("اقساط") | Some("موعد"));
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";
    let preserve_customer_schedule = old_is_installments_or_due && is_installments_or_due;

    let existing_down_payment_sum = sum_money_rows(
        &db,
        "SELECT amount FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_entity_id = ?1
               AND source_type = 'customer_sale_payment'
               AND source_role = 'sale_down_payment'
               AND COALESCE(is_reversed, 0) = 0",
        [car_id],
    )?;

    // Calculate already-collected manual payments (non-sale-generated customer payments)
    let collected_manual = sum_money_rows(
        &db,
        "SELECT amount FROM partner_transactions
         WHERE kind = 'زبون'
           AND related_source_type = 'car' AND related_entity_id = ?1
           AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
           AND source_type IS DISTINCT FROM 'customer_sale_payment'
           AND source_type IS DISTINCT FROM 'customer_installment_schedule'
           AND NOT EXISTS (
               SELECT 1 FROM customer_installment_payment_events e
               WHERE e.ledger_batch_id=partner_transactions.ledger_batch_id
                 AND e.status='active'
           )",
        [car_id],
    )?;

    let active_installment_payment_sum = sum_money_rows(
        &db,
        "SELECT actual_paid_amount
             FROM customer_installment_payment_events
             WHERE sale_id = ?1 AND status = 'active'",
        [active_sale_id],
    )?;

    let active_installment_payment_count: i64 = db
        .query_row(
            "SELECT COUNT(*)
             FROM customer_installment_payment_events
             WHERE sale_id = ?1 AND status = 'active'",
            [active_sale_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let locked_by_paid_installment = active_installment_payment_count > 0;
    if locked_by_paid_installment {
        if old_payment_type.as_deref().unwrap_or("") != payment_type {
            return Err("لا يمكن تغيير نوع الدفع بعد وجود قسط واصل".to_string());
        }
        if _old_buyer_name.as_deref().unwrap_or("").trim() != buyer_name.trim() {
            return Err("لا يمكن تغيير اسم المشتري بعد وجود قسط واصل".to_string());
        }
        if (amount_paid - existing_down_payment_sum).abs() > MONEY_STRICT_EPSILON {
            return Err("لا يمكن تغيير المقدمة المستلمة بعد وجود قسط واصل".to_string());
        }
        if payment_type == "اقساط"
            && _old_first_payment_date.as_deref().unwrap_or("").trim()
                != first_payment_date.as_deref().unwrap_or("").trim()
        {
            return Err("لا يمكن تغيير تاريخ القسط الأول بعد وجود قسط واصل".to_string());
        }
        if payment_type == "موعد"
            && _old_delivery_date.as_deref().unwrap_or("").trim()
                != delivery_date.as_deref().unwrap_or("").trim()
        {
            return Err("لا يمكن تغيير موعد التسليم بعد وجود قسط واصل".to_string());
        }
    } else {
        validate_sale_amounts(selling_price, amount_paid, amount_remaining, &payment_type)?;
    }

    let committed_customer_cash = if preserve_customer_schedule && locked_by_paid_installment {
        existing_down_payment_sum + active_installment_payment_sum + collected_manual
    } else if preserve_customer_schedule {
        validate_sale_amounts(selling_price, amount_paid, amount_remaining, &payment_type)?;
        amount_paid + collected_manual
    } else {
        if payment_type != "كاش" {
            validate_sale_amounts(selling_price, amount_paid, amount_remaining, &payment_type)?;
        }
        amount_paid + collected_manual
    };

    let effective_amount_paid = if locked_by_paid_installment {
        existing_down_payment_sum
    } else {
        amount_paid
    };
    let effective_amount_remaining = if locked_by_paid_installment {
        selling_price - committed_customer_cash
    } else {
        amount_remaining
    };
    validate_non_negative_amount(effective_amount_remaining, "المبلغ المتبقي")?;
    if locked_by_paid_installment
        && (amount_remaining - effective_amount_remaining).abs() > MONEY_STRICT_EPSILON
    {
        return Err("المقدمة + الأقساط الواصلة + المتبقي يجب أن يساوي سعر البيع".to_string());
    }

    // Validate that new selling_price >= already collected
    if selling_price < committed_customer_cash {
        return Err(format!(
            "لا يمكن تعديل سعر البيع إلى مبلغ أقل من المبالغ المستلمة (تم استلام {:.0})",
            committed_customer_cash
        ));
    }

    let chassis_label: String = db
        .query_row(
            "SELECT COALESCE(chassis_number, '') FROM cars WHERE id = ?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر قراءة رقم الشاصي: {e}"))?;
    let clean_chassis = chassis_label.trim();
    let clean_buyer_phone = normalize_phone_digits(&buyer_phone);
    let customer_account_id = ensure_partner_exists(&db, &buyer_name, &clean_buyer_phone, "زبون")?;
    let now_time = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| format!("تعذر تحديد وقت العملية: {e}"))?;

    // ============================================================
    // STEP 1: Update sale fields
    // ============================================================
    db.execute(
        "UPDATE cars SET
            selling_price = ?1, sale_currency = ?2, payment_type = ?3,
            amount_paid = ?4, amount_remaining = ?5,
            installment_months = ?6, monthly_payment = ?7,
            buyer_name = ?8, buyer_phone = ?9,
            sale_date = ?10, sale_time = ?11,
            delivery_date = ?12, first_payment_date = ?13,
            version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?14 AND version=?15",
        params![
            selling_price,
            sale_currency,
            payment_type,
            effective_amount_paid,
            effective_amount_remaining,
            installment_months.unwrap_or(1),
            monthly_payment,
            buyer_name.trim(),
            clean_buyer_phone.as_str(),
            sale_date,
            now_time,
            delivery_date,
            first_payment_date,
            car_id,
            expected_car_version,
        ],
    )
    .map_err(|e| e.to_string())?;
    if db.changes() != 1 {
        return Err("تعارض: تم تعديل السيارة من قبل مستخدم آخر".to_string());
    }
    let sale_updated = db
        .execute(
            "UPDATE car_sales
             SET customer_account_id=?1,sale_type=?2,selling_price=?3,currency=?4,
                 sale_date=?5,version=version+1,
                 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?6 AND car_id=?7 AND version=?8 AND status='active'",
            params![
                customer_account_id,
                payment_type,
                selling_price,
                sale_currency,
                sale_date,
                active_sale_id,
                car_id,
                expected_sale_version,
            ],
        )
        .map_err(|e| e.to_string())?;
    if sale_updated != 1 {
        return Err("تعارض: تم تعديل البيع من قبل مستخدم آخر".to_string());
    }

    // ============================================================
    let mut buyers_to_recalc: std::collections::HashSet<String> = std::collections::HashSet::new();

    // STEP 2: Delete only sale-generated customer rows (preserve manual payments)
    // ============================================================
    if preserve_customer_schedule {
        db.execute(
            "UPDATE partner_transactions
             SET partner_name = ?1,
                 currency = ?2,
                 account_id=?3
             WHERE kind = 'زبون'
               AND sale_id=?4
               AND source_type IN ('customer_sale_payment', 'customer_installment_schedule')",
            params![
                buyer_name.trim(),
                &sale_currency,
                customer_account_id,
                active_sale_id
            ],
        )
        .map_err(|e| e.to_string())?;
        buyers_to_recalc.insert(buyer_name.trim().to_string());

        // Manage down payment transaction
        let dp_tx_id: Option<i64> = match db.query_row(
            "SELECT id FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_entity_id = ?1
               AND source_type = 'customer_sale_payment'
               AND source_role = 'sale_down_payment'",
            [car_id],
            |row| row.get(0),
        ) {
            Ok(id) => Some(id),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(e.to_string()),
        };

        if amount_paid > Money::zero() {
            let dp_notes = format!(
                "استلام مقدمة سيارة من {} رقم الشاصي {} #بيع_سيارة_{}",
                buyer_name.trim(),
                clean_chassis,
                car_number
            );
            if let Some(dp_id) = dp_tx_id {
                // UPDATE existing
                delete_customer_payment_partner_splits(&db, dp_id)?;
                delete_customer_payment_profit_splits(&db, dp_id)?;
                delete_ledger_entries(&db, "partner_transaction", &dp_id.to_string())?;

                db.execute(
                    "UPDATE partner_transactions
                     SET amount = ?1,
                         notes = ?2,
                         date = ?3,
                         affects_qasa = 0,
                         affects_partner_cash = 0,
                         affects_profit = 0
                     WHERE id = ?4",
                    params![amount_paid, &dp_notes, &sale_date, dp_id],
                )
                .map_err(|e| e.to_string())?;

                record_partner_ledger_entries(&db, dp_id)?;
                apply_partner_transaction_splits(
                    &db,
                    dp_id,
                    buyer_name.trim(),
                    "زبون",
                    "مقدمة بيع سيارة",
                    amount_paid,
                    &sale_date,
                    Some(&dp_notes),
                    &sale_currency,
                    "قاصه",
                )?;
            } else {
                // INSERT new
                db.execute(
                    "INSERT INTO partner_transactions (
                        partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id, account_id, operation_id, sale_id
                     )
                     VALUES (?1, 'زبون', 'مقدمة بيع سيارة', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                        'customer_sale_payment', ?7, 'sale_down_payment', 0, 0, 0, 'car', ?8, ?9, ?10, ?11)",
                    params![
                        buyer_name.trim(),
                        amount_paid,
                        sale_date,
                        &now_time,
                        &dp_notes,
                        sale_currency,
                        active_sale_id.to_string(),
                        car_id.to_string(),
                        customer_account_id,
                        sale_operation_id,
                        active_sale_id,
                    ],
                )
                .map_err(|e| e.to_string())?;
                let new_dp_id = db.last_insert_rowid();

                record_partner_ledger_entries(&db, new_dp_id)?;
                apply_partner_transaction_splits(
                    &db,
                    new_dp_id,
                    buyer_name.trim(),
                    "زبون",
                    "مقدمة بيع سيارة",
                    amount_paid,
                    &sale_date,
                    Some(&dp_notes),
                    &sale_currency,
                    "قاصه",
                )?;
            }
        } else if let Some(dp_id) = dp_tx_id {
            // DELETE existing (since amount_paid is now 0)
            delete_customer_payment_partner_splits(&db, dp_id)?;
            delete_customer_payment_profit_splits(&db, dp_id)?;
            append_partner_transaction_reversal_by_id(&db, dp_id, "إلغاء مقدمة البيع")?;
        }
    } else {
        // Delete sale-generated down payment and installment schedule rows
        let sale_gen_ids: Vec<(i64, String)> = {
            let mut stmt = db.prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car' AND related_entity_id = ?1
               AND (source_type = 'customer_sale_payment' OR source_type = 'customer_installment_schedule')"
        ).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([car_id], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            rows
        };

        for (cust_id, buyer_name_str) in &sale_gen_ids {
            delete_customer_payment_partner_splits(&db, *cust_id)?;
            delete_customer_payment_profit_splits(&db, *cust_id)?;
            append_partner_transaction_reversal_by_id(
                &db,
                *cust_id,
                "إلغاء الإسقاطات المولدة للبيع",
            )?;
            buyers_to_recalc.insert(buyer_name_str.clone());
        }
    }

    // Delete sale partner rows (source_type = 'car_sale')
    delete_generated_car_sale_partner_transactions(&db, &active_sale_id.to_string())?;

    // Delete sale ledger entries (but preserve purchase entries)
    delete_car_sale_ledger_entries(&db, &active_sale_id.to_string())?;

    // ============================================================
    // STEP 3a: Installment/Due-date: Recreate down payment + schedule
    // ============================================================
    if is_installments_or_due {
        if !preserve_customer_schedule && amount_paid > Money::zero() {
            let dp_notes = format!(
                "استلام مقدمة سيارة من {} رقم الشاصي {} #بيع_سيارة_{}",
                buyer_name.trim(),
                clean_chassis,
                car_number
            );

            db.execute(
                "INSERT INTO partner_transactions (
                    partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                    source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                    related_source_type, related_source_id, account_id, operation_id, sale_id
                 )
                 VALUES (?1, 'زبون', 'مقدمة بيع سيارة', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_sale_payment', ?7, 'sale_down_payment', 0, 0, 0, 'car', ?8, ?9, ?10, ?11)",
                params![
                    buyer_name.trim(),
                    amount_paid,
                    sale_date,
                    &now_time,
                    &dp_notes,
                    sale_currency,
                    active_sale_id.to_string(),
                    car_id.to_string(),
                    customer_account_id,
                    sale_operation_id,
                    active_sale_id,
                ],
            )
            .map_err(|e| e.to_string())?;
            let dp_id = db.last_insert_rowid();

            record_partner_ledger_entries(&db, dp_id)?;
            apply_partner_transaction_splits(
                &db,
                dp_id,
                buyer_name.trim(),
                "زبون",
                "مقدمة بيع سيارة",
                amount_paid,
                &sale_date,
                Some(&dp_notes),
                &sale_currency,
                "قاصه",
            )?;

            buyers_to_recalc.insert(buyer_name.trim().to_string());
        }

        // STEP 4: Recreate installment rows using rebuild helper
        rebuild_installment_schedule(&db, &car_number)?;
        buyers_to_recalc.insert(buyer_name.trim().to_string());
    } else if payment_type == "كاش" {
        // ============================================================
        // STEP 3b: Cash sale — NO customer, NO receivable
        // Car_sale cash_movement + profit_recognition directly to partners
        // ============================================================

        // 1. Cash movement
        let cash_note = format!(
            "ايداع بيع سيارة {} ({}) إلى {}",
            car_name,
            car_number,
            buyer_name.trim()
        );
        distribute_to_partners_50_with_effects_and_related(
            &db,
            selling_price,
            &sale_currency,
            &sale_date,
            "قاصه",
            "ايداع بيع سيارة",
            &cash_note,
            "car_sale",
            &active_sale_id.to_string(),
            "cash_movement",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
            Some("car"),
            Some(&car_id.to_string()),
        )?;
        rebuild_cash_sale_profit_recognition(&db, car_id)?;
    }

    // ============================================================
    // STEP 5: Rebuild sale ledger entries
    // ============================================================
    record_car_sale_ledger_entries(&db, car_id)?;
    if is_installments_or_due {
        rebuild_installment_sale_loss_recognition(&db, car_id)?;
    }
    rebuild_customer_payment_profit_recognitions_for_car(&db, &car_number)?;
    sync_sale_identity_links(
        &db,
        car_id,
        active_sale_id,
        &sale_operation_id,
        customer_account_id,
    )?;

    // ============================================================
    // STEP 6: Recalculate all affected partners
    // ============================================================
    for buyer in &buyers_to_recalc {
        recalculate_partner_total(&db, buyer, "زبون")?;
    }
    recalculate_all_partners(&db)?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// save_and_sell_car_with_accounting: Atomic new-car-direct-sold creation.
/// Inserts car, records purchase accounting, sells it, all in one transaction.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn save_and_sell_car_with_accounting(
    state: State<AppState>,
    num: String,
    chassis: String,
    model: String,
    year: String,
    name: String,
    color: String,
    details: String,
    purchase: Money,
    currency: Option<String>,
    sale_currency: Option<String>,
    selling: Money,
    payment_type: String,
    amount_paid: Money,
    amount_remaining: Money,
    installment_months: Option<i32>,
    monthly_payment: Option<Money>,
    buyer_name: String,
    buyer_phone: String,
    purchase_date: Option<String>,
    sale_date: Option<String>,
    delivery_date: Option<String>,
    first_payment_date: Option<String>,
    purchase_payment_type: Option<String>,
    purchase_type: Option<String>,
    financer_name: Option<String>,
    commission_type: Option<String>,
    commission_value: Option<Money>,
    // AUD-008 FIX: creation_token for idempotency (§31.2/§31.5.3).
    creation_token: Option<String>,
    // CRITICAL-7: bind this write to the supplied session token so the audit
    // trail records the actual operator.
    session_token: String,
) -> Result<i64, String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&num, "رقم السيارة")?;
    validate_required_text(&chassis, "رقم الشاصي")?;
    validate_required_text(&name, "اسم السيارة")?;
    validate_non_negative_amount(purchase, "سعر الشراء")?;
    validate_non_negative_amount(selling, "سعر البيع")?;
    validate_non_negative_amount(amount_paid, "المبلغ المدفوع")?;
    validate_non_negative_amount(amount_remaining, "المبلغ المتبقي")?;
    if let Some(ref mp) = monthly_payment {
        validate_non_negative_amount(*mp, "القسط الشهري")?;
    }
    if let Some(ref cv) = commission_value {
        validate_non_negative_amount(*cv, "قيمة العمولة")?;
    }
    validate_required_text(&buyer_name, "اسم المشتري")?;
    validate_required_text(sale_date.as_deref().unwrap_or(""), "تاريخ البيع")?;

    let curr = currency.as_deref().unwrap_or("IQD");
    validate_currency(curr)?;
    let sale_curr = sale_currency.as_deref().unwrap_or("IQD");
    validate_currency(sale_curr)?;
    if curr != sale_curr {
        return Err("لا يمكن بيع السيارة بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string());
    }

    validate_sale_amounts(selling, amount_paid, amount_remaining, &payment_type)?;

    if payment_type == "اقساط" {
        if let Some(months) = installment_months {
            if months <= 0 {
                return Err("عدد أشهر التقسيط يجب أن يكون أكبر من صفر".to_string());
            }
        }
    }

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    // CRITICAL-7: bind this write to the supplied session token so the
    // audit trail records the actual operator, not "any admin".
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    if let Some(date) = purchase_date
        .as_deref()
        .filter(|date| !date.trim().is_empty())
    {
        ensure_accounting_period_open(&db, date)?;
    }
    ensure_accounting_period_open(&db, sale_date.as_deref().unwrap_or(""))?;

    let creation_token = creation_token
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());
    let idempotency_payload = serde_json::json!({
        "num": num,
        "chassis": chassis,
        "model": model,
        "year": year,
        "name": name,
        "color": color,
        "details": details,
        "purchase": purchase,
        "currency": currency,
        "sale_currency": sale_currency,
        "selling": selling,
        "payment_type": payment_type,
        "amount_paid": amount_paid,
        "amount_remaining": amount_remaining,
        "installment_months": installment_months,
        "monthly_payment": monthly_payment,
        "buyer_name": buyer_name,
        "buyer_phone": buyer_phone,
        "purchase_date": purchase_date,
        "sale_date": sale_date,
        "delivery_date": delivery_date,
        "first_payment_date": first_payment_date,
        "purchase_payment_type": purchase_payment_type,
        "purchase_type": purchase_type,
        "financer_name": financer_name,
        "commission_type": commission_type,
        "commission_value": commission_value,
    });
    if let IdempotencyClaim::Replay(reference) = claim_idempotent_creation(
        &db,
        creation_token.as_deref(),
        "save_and_sell_car_with_accounting",
        &idempotency_payload,
    )? {
        let saved_car_id = reference
            .parse::<i64>()
            .map_err(|_| "معرّف نتيجة طلب الإنشاء السابق غير صالح".to_string())?;
        append_audit_event(
            &db,
            actor_user_id,
            "car",
            Some(saved_car_id),
            "save_and_sell_car_with_accounting.idempotent_retry",
            Some(&session_token),
            creation_token.as_deref(),
        )?;
        db.commit().map_err(|e| e.to_string())?;
        return Ok(saved_car_id);
    }

    let requested_plate = num.trim().to_string();
    let car_number = resolve_unique_car_number(&db, &requested_plate, None)?;
    let clean_name = name.trim();
    let clean_chassis = normalize_chassis_value(&chassis);
    ensure_unique_chassis(&db, &clean_chassis, None)?;
    let clean_buyer_phone = resolve_existing_customer_phone(&db, &buyer_name, &buyer_phone);
    let now_time = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| format!("تعذر تحديد وقت العملية: {e}"))?;
    let purchase_time = if purchase_date.as_deref().unwrap_or("").is_empty() {
        "00:00".to_string()
    } else {
        now_time.clone()
    };

    // ============================================================
    // STEP 1: Insert car
    // ============================================================
    db.execute(
        "INSERT INTO cars (
            car_number, car_plate_num, chassis_number,
            car_model, car_year, car_name, color, details,
            purchase_price, currency, sale_currency,
            selling_price, status,
            payment_type, cash_price, amount_paid, amount_remaining,
            installment_months, monthly_payment, purchase_payment_type,
            purchase_type, financer_name, commission_type, commission_value,
            buyer_name, buyer_phone, purchase_date, sale_date, delivery_date,
            first_payment_date, purchase_time, sale_time, creation_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            car_number.as_str(), requested_plate.as_str(), clean_chassis.as_str(),
            model.trim(), year.trim(), clean_name, color.trim(), details.trim(),
            purchase, curr, sale_curr,
            selling,
            "مبيوعة",
            payment_type,
            amount_paid,
            amount_paid,
            amount_remaining,
            installment_months,
            monthly_payment,
            purchase_payment_type.as_deref().unwrap_or("قاصه"),
            purchase_type.as_deref().unwrap_or("كاش"),
            financer_name,
            commission_type,
            commission_value,
            buyer_name.trim(), clean_buyer_phone.as_str(),
            purchase_date.as_deref().unwrap_or(""),
            sale_date.as_deref().unwrap_or(""),
            delivery_date.as_deref().unwrap_or(""),
            first_payment_date.as_deref().unwrap_or(""),
            purchase_time,
            now_time,
            creation_token.as_deref(),
        ],
    ).map_err(|e| e.to_string())?;

    let saved_car_id: i64 = db
        .query_row(
            "SELECT id FROM cars WHERE car_number=?1",
            [car_number.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر قراءة معرّف دورة شراء السيارة: {e}"))?;
    let customer_account_id = ensure_partner_exists(&db, &buyer_name, &clean_buyer_phone, "زبون")?;
    let (sale_id, operation_id) = create_sale_identity(
        &db,
        saved_car_id,
        customer_account_id,
        &payment_type,
        selling,
        sale_curr,
        sale_date.as_deref().unwrap_or(""),
        creation_token.as_deref(),
    )?;
    // This command represents one user action (purchase + immediate sale), so
    // every generated effect intentionally shares the sale operation identity.
    db.execute(
        "UPDATE cars SET purchase_operation_id=?1 WHERE id=?2",
        params![operation_id, saved_car_id],
    )
    .map_err(|e| e.to_string())?;

    // ============================================================
    // STEP 2: Record purchase accounting (partner rows)
    // ============================================================
    let p_date = purchase_date.as_deref().unwrap_or("");

    if purchase_type.as_deref() == Some("كاش")
        || purchase_type.is_none()
        || purchase_type.as_deref() == Some("")
    {
        let purchase_note = format!("سحب شراء سيارة {} (شاصي: {})", clean_name, clean_chassis)
            .trim()
            .replace("  ", " ");
        distribute_to_partners_50_with_effects(
            &db,
            purchase,
            curr,
            p_date,
            purchase_payment_type.as_deref().unwrap_or("قاصه"),
            "سحب شراء سيارة",
            &purchase_note,
            "car_purchase",
            &saved_car_id.to_string(),
            "cash_payment",
            true,
            true,
            false,
        )?;
    } else if purchase_type.as_deref() == Some("تمويل")
        || purchase_type.as_deref() == Some("دين")
        || purchase_type.as_deref() == Some("شركة")
    {
        let p_kind = if purchase_type.as_deref() == Some("تمويل")
            || purchase_type.as_deref() == Some("دين")
        {
            "ممول"
        } else {
            "شركة"
        };
        let p_type = if purchase_type.as_deref() == Some("تمويل")
            || purchase_type.as_deref() == Some("دين")
        {
            "استلام تمويل شراء سيارة"
        } else {
            "استلام شراء سيارة"
        };
        let role = if purchase_type.as_deref() == Some("تمويل")
            || purchase_type.as_deref() == Some("دين")
        {
            "financing_liability"
        } else {
            "company_purchase_liability"
        };
        let purchase_note = format!("{} {} (شاصي: {})", p_type, clean_name, clean_chassis)
            .trim()
            .replace("  ", " ");
        if let Some(f_name) = &financer_name {
            let f_name = f_name.trim();
            if !f_name.is_empty() {
                let financer_account_id = ensure_partner_exists(&db, f_name, "", p_kind)?;
                db.execute(
                    "INSERT INTO partner_transactions (
                        partner_name, kind, type, amount, date, time, notes, currency,
                        payment_type, source_type, source_id, source_entity_id, source_role,
                        affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id, related_entity_id,
                        account_id, operation_id, sale_id
                     )
                     VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                        'car_purchase', CAST(?10 AS TEXT), ?10, ?11, 0, 0, 0,
                        'car', CAST(?10 AS TEXT), ?10, ?12, ?13, ?14
                     )",
                    params![
                        f_name,
                        p_kind,
                        p_type,
                        purchase,
                        p_date,
                        &purchase_time,
                        &purchase_note,
                        curr,
                        purchase_payment_type.as_deref().unwrap_or("قاصه"),
                        saved_car_id,
                        role,
                        financer_account_id,
                        &operation_id,
                        sale_id
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // ============================================================
    // STEP 3: Record purchase ledger entries
    // ============================================================
    record_car_purchase_ledger_entries(&db, saved_car_id)?;
    // This command creates the purchase and sale in one transaction. The
    // purchase operation id is already stored on the car, but the ledger rows
    // did not exist when that identity was established; attach them now.
    ensure_purchase_identity(&db, saved_car_id)?;

    // ============================================================
    // STEP 4a: Installment/Due-date: Create customer + payment + schedule
    // ============================================================
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";
    let sale_date_str = sale_date.as_deref().unwrap_or("");

    if is_installments_or_due {
        ensure_partner_exists(&db, &buyer_name, &clean_buyer_phone, "زبون")?;

        // Down payment
        if amount_paid > Money::zero() {
            let dp_notes = format!(
                "استلام مقدمة سيارة من {} رقم الشاصي {} #بيع_سيارة_{}",
                buyer_name.trim(),
                clean_chassis,
                car_number
            );

            db.execute(
                "INSERT INTO partner_transactions (
                    partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                    source_type, source_id, source_entity_id, source_role,
                    affects_qasa, affects_partner_cash, affects_profit,
                    related_source_type, related_source_id, related_entity_id,
                    account_id, operation_id, sale_id
                 )
                 VALUES (?1, 'زبون', 'مقدمة بيع سيارة', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_sale_payment', CAST(?7 AS TEXT), ?7, 'sale_down_payment',
                    0, 0, 0, 'car', CAST(?8 AS TEXT), ?8, ?9, ?10, ?7)",
                params![
                    buyer_name.trim(),
                    amount_paid,
                    sale_date_str,
                    &now_time,
                    &dp_notes,
                    sale_curr,
                    sale_id,
                    saved_car_id,
                    customer_account_id,
                    &operation_id,
                ],
            )
            .map_err(|e| e.to_string())?;
            let dp_id = db.last_insert_rowid();

            record_partner_ledger_entries(&db, dp_id)?;
            apply_partner_transaction_splits(
                &db,
                dp_id,
                buyer_name.trim(),
                "زبون",
                "مقدمة بيع سيارة",
                amount_paid,
                sale_date_str,
                Some(&dp_notes),
                sale_curr,
                "قاصه",
            )?;
        }

        // Installment schedule
        if amount_remaining > Money::zero() {
            if payment_type == "اقساط" {
                let base_date = first_payment_date.as_deref().unwrap_or(sale_date_str);
                let months = installment_months.unwrap_or(1).max(1) as usize;
                let (monthly_amount, last_amount) =
                    split_remaining_evenly(amount_remaining, months, sale_curr)?;

                for i in 0..months {
                    let inst_amount = if i == months - 1 {
                        last_amount
                    } else {
                        monthly_amount
                    };
                    if inst_amount <= Money::zero() {
                        continue;
                    }

                    let inst_date = add_months_to_date(base_date, i as i32);
                    let inst_notes = if months > 1 {
                        format!(
                            "باقي قسط شهر {} من {} على {} رقم الشاصي {}",
                            i + 1,
                            months,
                            buyer_name.trim(),
                            clean_chassis
                        )
                    } else {
                        format!(
                            "باقي مجموع قسط على {} رقم الشاصي {}",
                            buyer_name.trim(),
                            clean_chassis
                        )
                    };

                    db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                            source_type, source_id, source_entity_id, source_role,
                            affects_qasa, affects_partner_cash, affects_profit,
                            related_source_type, related_source_id, related_entity_id,
                            account_id, operation_id, sale_id)
                         VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                            'customer_installment_schedule', NULL, NULL, 'installment_schedule',
                            0, 0, 0, 'car', CAST(?7 AS TEXT), ?7, ?8, ?9, ?10)",
                        params![buyer_name.trim(), inst_amount, inst_date, &now_time, &inst_notes, sale_curr,
                            saved_car_id, customer_account_id, &operation_id, sale_id],
                    ).map_err(|e| e.to_string())?;
                    let installment_id = db.last_insert_rowid();
                    db.execute(
                        "UPDATE partner_transactions
                         SET source_id=CAST(?1 AS TEXT), source_entity_id=?1
                         WHERE id=?1",
                        [installment_id],
                    )
                    .map_err(|e| format!("تعذر ربط القسط بهويته الرقمية: {e}"))?;
                }
            } else if payment_type == "موعد" {
                let due_date = delivery_date.as_deref().unwrap_or(sale_date_str);
                let due_notes = format!(
                    "باقي مجموع قسط على {} رقم الشاصي {}",
                    buyer_name.trim(),
                    clean_chassis
                );

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                        source_type, source_id, source_entity_id, source_role,
                        affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id, related_entity_id,
                        account_id, operation_id, sale_id)
                     VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                        'customer_installment_schedule', NULL, NULL, 'installment_schedule',
                        0, 0, 0, 'car', CAST(?7 AS TEXT), ?7, ?8, ?9, ?10)",
                    params![buyer_name.trim(), amount_remaining, due_date, &now_time, &due_notes, sale_curr,
                        saved_car_id, customer_account_id, &operation_id, sale_id],
                ).map_err(|e| e.to_string())?;
                let installment_id = db.last_insert_rowid();
                db.execute(
                    "UPDATE partner_transactions
                     SET source_id=CAST(?1 AS TEXT), source_entity_id=?1
                     WHERE id=?1",
                    [installment_id],
                )
                .map_err(|e| format!("تعذر ربط الاستحقاق بهويته الرقمية: {e}"))?;
            }
        }
    } else if payment_type == "كاش" {
        // ============================================================
        // STEP 4b: Cash sale — NO customer, NO receivable
        // Car_sale cash_movement + profit_recognition directly to partners
        // ============================================================

        // 1. Cash movement
        let cash_note = format!(
            "ايداع بيع سيارة {} ({}) إلى {}",
            clean_name,
            car_number,
            buyer_name.trim()
        );
        distribute_to_partners_50_with_effects_and_related(
            &db,
            selling,
            sale_curr,
            sale_date_str,
            "قاصه",
            "ايداع بيع سيارة",
            &cash_note,
            "car_sale",
            &sale_id.to_string(),
            "cash_movement",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
            Some("car"),
            Some(&saved_car_id.to_string()),
        )?;
        rebuild_cash_sale_profit_recognition(&db, saved_car_id)?;
    }

    // ============================================================
    // STEP 7: Record sale ledger entries
    // ============================================================
    record_car_sale_ledger_entries(&db, saved_car_id)?;
    if is_installments_or_due {
        rebuild_installment_sale_loss_recognition(&db, saved_car_id)?;
        rebuild_customer_payment_profit_recognitions_for_car(&db, &car_number)?;
    }

    // ============================================================
    // STEP 8: Recalculate and commit
    // ============================================================
    if is_installments_or_due {
        recalculate_partner_total(&db, buyer_name.trim(), "زبون")?;
    }
    sync_sale_identity_links(
        &db,
        saved_car_id,
        sale_id,
        &operation_id,
        customer_account_id,
    )?;
    recalculate_all_partners(&db)?;

    let audit_values = serde_json::json!({
        "car_id": saved_car_id,
        "sale_id": sale_id,
        "customer_account_id": customer_account_id,
        "payment_type": payment_type,
        "selling_price": selling,
        "amount_paid": amount_paid,
        "amount_remaining": amount_remaining,
    })
    .to_string();
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "car",
        Some(saved_car_id),
        "save_and_sell_car_with_accounting",
        Some(&session_token),
        creation_token.as_deref(),
        AuditEventDetails {
            operation_id: Some(&operation_id),
            account_id: Some(customer_account_id),
            new_values_json: Some(&audit_values),
            ..Default::default()
        },
    )?;
    complete_idempotent_creation(&db, creation_token.as_deref(), &saved_car_id.to_string())?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(saved_car_id)
}
