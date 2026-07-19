//! `installments` — legacy/mod.rs lines 9956–13943
use super::*;

type SaleRecognitionCarData = (String, String, String, Money, Money, String, String);

pub fn split_remaining_evenly(
    total: Money,
    count: usize,
    currency: &str,
) -> Result<(Money, Money), String> {
    if count == 0 {
        return Ok((Money::zero(), Money::zero()));
    }
    let scale = currency_scale(currency)?;
    let base = Money(
        (total / Money::from_usize(count))
            .0
            .round_dp_with_strategy(scale, RoundingStrategy::ToZero),
    );
    let last = if count == 1 {
        total
    } else {
        total - base * Money::from_usize(count - 1)
    };
    Ok((base, last))
}

#[derive(Debug, Clone)]
pub struct InstallmentTemplate {
    amount: Money,
    date: String,
    notes: String,
}

#[derive(Debug, Clone)]
pub struct InstallmentScheduleState {
    id: i64,
    installment_id: Option<i64>,
    partner_name: String,
    due_date: String,
    currency: String,
    payment_type: String,
    notes: String,
    original_amount: Money,
    current_amount: Money,
    display_amount: Money,
    actual_paid_amount: Option<Money>,
    paid_event_id: Option<i64>,
    paid: bool,
}

pub fn first_non_empty_date(values: &[&str]) -> String {
    values
        .iter()
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
        .unwrap_or("")
        .to_string()
}

pub fn build_installment_templates(
    db: &Connection,
    car_id: i64,
    sale_id: i64,
) -> Result<(String, Money, String, String, Vec<InstallmentTemplate>), String> {
    let (
        buyer_name,
        selling_price,
        installment_months,
        first_payment_date,
        sale_currency,
        payment_type,
        car_name,
        chassis_number,
        sale_date,
        delivery_date,
    ) = db
        .query_row(
            "SELECT c.buyer_name,c.selling_price,c.installment_months,c.first_payment_date,
                    c.sale_currency,c.payment_type,c.car_name,COALESCE(c.chassis_number,''),
                    COALESCE(c.sale_date,''),c.delivery_date
             FROM cars c JOIN car_sales s ON s.id=?2 AND s.car_id=c.id
             WHERE c.id=?1 AND c.active_sale_id=s.id",
            params![car_id, sale_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Money>(1)?,
                    row.get::<_, Option<i32>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                format!("السيارة ذات المعرّف {} غير موجودة", car_id)
            }
            other => other.to_string(),
        })?;

    let down_payment_sum = sum_money_rows(
        db,
        "SELECT amount FROM partner_transactions
             WHERE kind = 'زبون'
               AND sale_id = ?1
               AND source_role = 'sale_down_payment'
               AND COALESCE(is_reversed, 0) = 0",
        [sale_id],
    )?;

    let mut templates = Vec::new();
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";
    if !is_installments_or_due {
        return Ok((
            buyer_name,
            selling_price,
            sale_currency,
            payment_type,
            templates,
        ));
    }

    let initial_remaining = selling_price - down_payment_sum;
    let clean_chassis = chassis_number.trim();
    if payment_type == "موعد" {
        let due_date = first_non_empty_date(&[
            first_payment_date.as_deref().unwrap_or(""),
            delivery_date.as_deref().unwrap_or(""),
            sale_date.as_str(),
        ]);
        templates.push(InstallmentTemplate {
            amount: initial_remaining,
            date: due_date,
            notes: format!("باقي قسط {} {}", car_name.trim(), clean_chassis)
                .trim()
                .replace("  ", " "),
        });
    } else {
        let months = installment_months.unwrap_or(1).max(1) as usize;
        let (monthly_amount, last_amount) =
            split_remaining_evenly(initial_remaining, months, &sale_currency)?;
        let base_date = first_non_empty_date(&[
            first_payment_date.as_deref().unwrap_or(""),
            sale_date.as_str(),
        ]);
        for i in 0..months {
            let inst_amount = if i == months - 1 {
                last_amount
            } else {
                monthly_amount
            };
            if inst_amount <= Money::zero() {
                continue;
            }
            let inst_date = add_months_to_date(&base_date, i as i32);
            let inst_notes = if months > 1 {
                format!(
                    "باقي قسط شهر {} من {} {} {}",
                    i + 1,
                    months,
                    car_name.trim(),
                    clean_chassis
                )
            } else {
                format!("باقي قسط {} {}", car_name.trim(), clean_chassis)
            }
            .trim()
            .replace("  ", " ");
            templates.push(InstallmentTemplate {
                amount: inst_amount,
                date: inst_date,
                notes: inst_notes,
            });
        }
    }

    Ok((
        buyer_name,
        selling_price,
        sale_currency,
        payment_type,
        templates,
    ))
}

#[allow(clippy::too_many_arguments)] // Internal schedule writer keeps one explicit atomic context.
pub fn insert_installment_template_rows(
    db: &Connection,
    car_id: i64,
    sale_id: i64,
    customer_account_id: i64,
    operation_id: &str,
    buyer_name: &str,
    sale_currency: &str,
    payment_type: &str,
    templates: &[InstallmentTemplate],
) -> Result<(), String> {
    let now_time = Local::now().format("%H:%M:%S").to_string();

    for template in templates {
        db.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_entity_id, source_role,
                affects_qasa, affects_partner_cash, affects_profit,
                related_source_type, related_source_id, related_entity_id,
                original_amount, current_amount, due_date, is_reversed,
                account_id, operation_id, sale_id
             )
             VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, ?7,
                'customer_installment_schedule', NULL, NULL, 'installment_schedule', 0, 0, 0,
                'car', CAST(?8 AS TEXT), ?8, ?2, ?2, ?3, 0, ?9, ?10, ?11)",
            params![
                buyer_name.trim(),
                template.amount,
                &template.date,
                &now_time,
                &template.notes,
                sale_currency,
                payment_type,
                car_id,
                customer_account_id,
                operation_id,
                sale_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        let installment_id = db.last_insert_rowid();
        db.execute(
            "UPDATE partner_transactions
             SET source_id=CAST(?1 AS TEXT), source_entity_id=?1
             WHERE id=?1",
            [installment_id],
        )
        .map_err(|e| format!("تعذر ربط القسط بهويته الرقمية: {e}"))?;
    }
    Ok(())
}

pub fn ensure_original_installment_rows(db: &Connection, car_number: &str) -> Result<(), String> {
    let (car_id, sale_id) = car_sale_identity_by_number(db, car_number)?;
    let sale_id = sale_id.ok_or_else(|| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    let (operation_id, customer_account_id): (String, i64) = db
        .query_row(
            "SELECT operation_id,customer_account_id FROM car_sales WHERE id=?1 AND car_id=?2",
            params![sale_id, car_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("تعذر قراءة هوية البيع الرقمية: {e}"))?;
    let (buyer_name, selling_price, sale_currency, payment_type, templates) =
        build_installment_templates(db, car_id, sale_id)?;
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";
    if !is_installments_or_due {
        append_partner_transaction_reversals_matching(
            db,
            "SELECT id FROM partner_transactions
             WHERE kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND sale_id = ?1",
            [sale_id],
            "إلغاء جدول أقساط بعد تغيير نوع البيع",
        )?;
        return Ok(());
    }

    let active_events: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM customer_installment_payment_events
             WHERE sale_id_v2 = ?1 AND status = 'active'",
            [sale_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = db
        .prepare(
            "SELECT id FROM partner_transactions
             WHERE kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'
               AND COALESCE(is_reversed,0)=0
               AND sale_id=?1
             ORDER BY COALESCE(due_date, date), id",
        )
        .map_err(|e| e.to_string())?;
    let existing = stmt
        .query_map([sale_id], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let base_rows_match = existing.len() >= templates.len();
    let has_only_deferred_extensions = existing.len() >= templates.len();
    let has_safe_deferred_extensions =
        active_events > 0 && base_rows_match && has_only_deferred_extensions;

    if existing.is_empty() {
        insert_installment_template_rows(
            db,
            car_id,
            sale_id,
            customer_account_id,
            &operation_id,
            &buyer_name,
            &sale_currency,
            &payment_type,
            &templates,
        )?;
    } else if existing.len() != templates.len() && active_events == 0 {
        if base_rows_match && has_only_deferred_extensions {
            for row_id in existing.iter().skip(templates.len()) {
                db.execute(
                    "UPDATE partner_transactions
                     SET is_reversed=1,type='ملغي قسط مؤجل',current_amount='0'
                     WHERE id=?1 AND COALESCE(is_reversed,0)=0",
                    [row_id],
                )
                .map_err(|e| format!("تعذر عكس صف القسط المؤجل {row_id}: {e}"))?;
                db.execute(
                    "UPDATE installments SET status='reversed',current_amount='0'
                     WHERE legacy_transaction_id=?1",
                    [row_id],
                )
                .map_err(|e| format!("تعذر عكس هوية القسط المؤجل {row_id}: {e}"))?;
            }
        } else {
            return Err(
                "رفض إعادة بناء جدول الأقساط ماديًا بعد إنشاء هوية البيع؛ استخدم مسار تعديل بإصدار متوقع"
                    .to_string(),
            );
        }
    } else if existing.len() != templates.len()
        && active_events > 0
        && !has_safe_deferred_extensions
    {
        // Recalculate and rebuild schedule rows with active events
        struct ActiveEvent {
            id: i64,
            actual_paid_amount: Money,
            _currency: String,
        }
        let mut stmt = db
            .prepare(
                "SELECT id, actual_paid_amount, currency
             FROM customer_installment_payment_events
             WHERE sale_id_v2 = ?1 AND status = 'active'
             ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let active_events_list = stmt
            .query_map([sale_id], |row| {
                Ok(ActiveEvent {
                    id: row.get(0)?,
                    actual_paid_amount: row.get(1)?,
                    _currency: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);

        let p_count = active_events_list.len();
        let mut m_months = templates.len();
        if m_months < p_count {
            m_months = p_count;
        }
        let r_months = m_months - p_count;
        let total_paid_installments = active_events_list
            .iter()
            .map(|e| e.actual_paid_amount)
            .sum::<Money>();
        let down_payment_sum = sum_money_rows(
            db,
            "SELECT amount FROM partner_transactions
                 WHERE kind = 'زبون'
                   AND related_source_type = 'car'
                   AND related_entity_id = ?1
                   AND source_role = 'sale_down_payment'
                   AND COALESCE(is_reversed, 0) = 0",
            [car_id.to_string()],
        )?;
        let remaining_balance =
            (selling_price - down_payment_sum - total_paid_installments).max(Money::zero());

        let (monthly_amount, last_amount) = if r_months > 0 {
            split_remaining_evenly(remaining_balance, r_months, &sale_currency)?
        } else {
            (Money::zero(), Money::zero())
        };

        let (car_name, chassis_number): (String, String) = db.query_row(
             "SELECT COALESCE(car_name, ''), COALESCE(chassis_number, '') FROM cars WHERE id = ?1",
             [car_id],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).map_err(|e| e.to_string())?;
        let clean_chassis = chassis_number.trim();

        let (first_payment_date, sale_date): (Option<String>, String) = db
            .query_row(
                "SELECT first_payment_date, COALESCE(sale_date, '') FROM cars WHERE id = ?1",
                [car_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let base_date = first_non_empty_date(&[
            first_payment_date.as_deref().unwrap_or(""),
            sale_date.as_str(),
        ]);

        for i in 1..=m_months {
            let template_date = add_months_to_date(&base_date, (i - 1) as i32);
            let template_notes = if m_months > 1 {
                format!(
                    "باقي قسط شهر {} من {} {} {}",
                    i,
                    m_months,
                    car_name.trim(),
                    clean_chassis
                )
            } else {
                format!("باقي قسط {} {}", car_name.trim(), clean_chassis)
            }
            .trim()
            .replace("  ", " ");

            if i - 1 < existing.len() {
                let row_id = existing[i - 1];
                if i <= p_count {
                    let event = &active_events_list[i - 1];
                    let notes_paid = template_notes.replace("باقي", "واصل");
                    db.execute(
                        "UPDATE partner_transactions
                         SET amount = ?1,
                             original_amount = ?1,
                             current_amount = ?1,
                             actual_paid_amount = ?1,
                             paid_event_id = ?2,
                             type = 'واصل قسط',
                             date = ?3,
                             due_date = ?3,
                             notes = ?4,
                             currency = ?5,
                             payment_type = ?6,
                             related_source_type = 'customer_payment_event',
                             related_source_id = CAST(?7 AS TEXT),
                             related_entity_id = ?7,
                             is_reversed = 0
                         WHERE id = ?8",
                        params![
                            event.actual_paid_amount,
                            event.id,
                            template_date,
                            notes_paid,
                            sale_currency,
                            payment_type,
                            event.id,
                            row_id,
                        ],
                    )
                    .map_err(|e| e.to_string())?;

                    db.execute(
                        "UPDATE customer_installment_payment_events
                         SET installment_id = (
                            SELECT id FROM installments WHERE legacy_transaction_id=?1
                         )
                         WHERE id = ?2",
                        params![row_id, event.id],
                    )
                    .map_err(|e| e.to_string())?;
                } else {
                    let inst_amount = if i == m_months {
                        last_amount
                    } else {
                        monthly_amount
                    };
                    db.execute(
                        "UPDATE partner_transactions
                         SET amount = ?1,
                             original_amount = ?1,
                             current_amount = ?1,
                             actual_paid_amount = NULL,
                             paid_event_id = NULL,
                             type = 'باقي قسط',
                             date = ?2,
                             due_date = ?2,
                             notes = ?3,
                             currency = ?4,
                             payment_type = ?5,
                             related_source_type = 'car',
                             related_source_id = CAST(?6 AS TEXT),
                             related_entity_id = ?6,
                             is_reversed = 0
                         WHERE id = ?7",
                        params![
                            inst_amount,
                            template_date,
                            template_notes,
                            sale_currency,
                            payment_type,
                            car_id,
                            row_id,
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                }
            } else {
                let inst_amount = if i == m_months {
                    last_amount
                } else {
                    monthly_amount
                };
                db.execute(
                    "INSERT INTO partner_transactions (
                        partner_name, kind, type, amount, original_amount, current_amount,
                        actual_paid_amount, paid_event_id, date, due_date, notes, currency, payment_type,
                        source_type, source_id, source_entity_id, source_role,
                        affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id, related_entity_id,
                        account_id,operation_id,sale_id
                     )
                     VALUES (?1, 'زبون', 'باقي قسط', ?2, ?2, ?2, NULL, NULL, ?3, ?3, ?4, ?5, ?6,
                        'customer_installment_schedule', NULL, NULL, 'installment_schedule', 0, 0, 0,
                        'car', CAST(?7 AS TEXT), ?7, ?8,?9,?10)",
                    params![
                        buyer_name.trim(),
                        inst_amount,
                        template_date,
                        template_notes,
                        sale_currency,
                        payment_type,
                        car_id,
                        customer_account_id,
                        &operation_id,
                        sale_id,
                    ]
                ).map_err(|e| e.to_string())?;
            }
        }

        if existing.len() > m_months {
            for row_id in existing.iter().skip(m_months) {
                db.execute(
                    "UPDATE partner_transactions
                     SET is_reversed=1,type='ملغي قسط بعد إعادة الجدولة',current_amount='0'
                     WHERE id=?1 AND COALESCE(is_reversed,0)=0",
                    [row_id],
                )
                .map_err(|e| e.to_string())?;
                db.execute(
                    "UPDATE installments SET status='reversed',current_amount='0'
                     WHERE legacy_transaction_id=?1",
                    [row_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    } else if active_events == 0 {
        for (id, template) in existing.iter().zip(templates.iter()) {
            db.execute(
                "UPDATE partner_transactions
                 SET amount = ?1,
                     original_amount = ?1,
                     current_amount = ?1,
                     actual_paid_amount = NULL,
                     paid_event_id = NULL,
                     type = 'باقي قسط',
                     date = ?2,
                     due_date = ?2,
                     notes = ?3,
                     currency = ?4,
                     payment_type = ?5,
                     related_source_type = 'car',
                     related_source_id = CAST(?6 AS TEXT),
                     related_entity_id = ?6,
                     is_reversed = 0
                 WHERE id = ?7",
                params![
                    template.amount,
                    &template.date,
                    &template.notes,
                    &sale_currency,
                    &payment_type,
                    car_id,
                    id,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        struct ActiveEvent {
            id: i64,
            installment_id: i64,
        }
        let mut stmt = db
            .prepare(
                "SELECT id, installment_id
                 FROM customer_installment_payment_events
                 WHERE sale_id_v2 = ?1 AND status = 'active'
                 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let active_events_list = stmt
            .query_map([sale_id], |row| {
                Ok(ActiveEvent {
                    id: row.get(0)?,
                    installment_id: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);

        let event_by_installment = active_events_list
            .iter()
            .map(|event| (event.installment_id, event.id))
            .collect::<std::collections::HashMap<_, _>>();
        if event_by_installment.len() != active_events_list.len() {
            return Err("يوجد أكثر من حدث دفع فعال لنفس القسط".to_string());
        }

        let down_payment_sum = sum_money_rows(
            db,
            "SELECT amount FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_entity_id = ?1
               AND source_role = 'sale_down_payment'
               AND COALESCE(is_reversed, 0) = 0",
            [car_id.to_string()],
        )?;
        let paid_original_sum = sum_money_rows(
            db,
            "SELECT COALESCE(pt.original_amount, pt.amount)
             FROM partner_transactions pt
             JOIN customer_installment_payment_events event
               ON event.installment_id = pt.id
              AND event.sale_id_v2 = ?1
              AND event.status = 'active'
             WHERE pt.sale_id = ?1
               AND pt.source_type = 'customer_installment_schedule'
               AND pt.source_role = 'installment_schedule'
               AND COALESCE(pt.is_reversed, 0) = 0",
            [sale_id],
        )?;
        let unpaid_count = existing
            .iter()
            .take(templates.len())
            .filter(|id| !event_by_installment.contains_key(id))
            .count();
        let unpaid_original_total =
            (selling_price - down_payment_sum - paid_original_sum).max(Money::zero());
        let (monthly_amount, last_amount) =
            split_remaining_evenly(unpaid_original_total, unpaid_count, &sale_currency)?;
        let mut unpaid_index = 0usize;

        for (id, template) in existing.iter().zip(templates.iter()) {
            if let Some(event_id) = event_by_installment.get(id) {
                db.execute(
                    "UPDATE partner_transactions
                     SET date = ?1,
                         due_date = ?1,
                         currency = ?2,
                         payment_type = ?3,
                         related_source_type = 'customer_payment_event',
                         related_source_id = CAST(?4 AS TEXT),
                         related_entity_id = ?4,
                         is_reversed = 0
                     WHERE id = ?5",
                    params![&template.date, &sale_currency, &payment_type, event_id, id,],
                )
                .map_err(|e| e.to_string())?;
            } else {
                unpaid_index += 1;
                let amount = if unpaid_index == unpaid_count {
                    last_amount
                } else {
                    monthly_amount
                };
                db.execute(
                    "UPDATE partner_transactions
                     SET amount = ?1,
                         original_amount = ?1,
                         current_amount = ?1,
                         actual_paid_amount = NULL,
                         paid_event_id = NULL,
                         type = 'باقي قسط',
                         date = ?2,
                         due_date = ?2,
                         notes = ?3,
                         currency = ?4,
                         payment_type = ?5,
                         related_source_type = 'car',
                         related_source_id = CAST(?6 AS TEXT),
                         related_entity_id = ?6,
                         is_reversed = 0
                     WHERE id = ?7",
                    params![
                        amount,
                        &template.date,
                        &template.notes,
                        &sale_currency,
                        &payment_type,
                        car_id,
                        id,
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    db.execute(
        "UPDATE partner_transactions
         SET original_amount = COALESCE(original_amount, amount),
             current_amount = COALESCE(current_amount, amount),
             due_date = COALESCE(due_date, date),
             is_reversed = COALESCE(is_reversed, 0),
             account_id=COALESCE(account_id,?1),
             operation_id=COALESCE(operation_id,?2),
             sale_id=COALESCE(sale_id,?3)
         WHERE source_type = 'customer_installment_schedule'
           AND source_role = 'installment_schedule'
           AND sale_id=?3",
        params![customer_account_id, operation_id, sale_id],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "INSERT INTO installments
         (operation_id,sale_id,customer_account_id,legacy_transaction_id,
          due_date,currency,original_amount,current_amount,status)
         SELECT ?1,?2,?3,pt.id,COALESCE(pt.due_date,pt.date),COALESCE(pt.currency,'IQD'),
                COALESCE(pt.original_amount,pt.amount),COALESCE(pt.current_amount,pt.amount),
                CASE WHEN COALESCE(pt.is_reversed,0)=1 THEN 'reversed'
                     WHEN COALESCE(pt.current_amount,pt.amount)='0' THEN 'paid' ELSE 'unpaid' END
         FROM partner_transactions pt
         WHERE pt.sale_id=?2 AND pt.source_type='customer_installment_schedule'
           AND pt.source_role='installment_schedule'
           AND NOT EXISTS (SELECT 1 FROM installments i WHERE i.legacy_transaction_id=pt.id)",
        params![operation_id, sale_id, customer_account_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn load_installment_schedule_states(
    db: &Connection,
    car_number: &str,
) -> Result<Vec<InstallmentScheduleState>, String> {
    let (_, sale_id) = car_sale_identity_by_number(db, car_number)?;
    let sale_id = sale_id.ok_or_else(|| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT pt.id, i.id, pt.partner_name,
                     COALESCE(pt.due_date, pt.date), COALESCE(pt.currency, 'IQD'),
                     COALESCE(pt.payment_type, 'قاصه'), COALESCE(pt.notes, ''),
                     COALESCE(pt.original_amount, pt.amount),
                     COALESCE(pt.current_amount, pt.amount), pt.amount,
                     pt.actual_paid_amount, pt.paid_event_id, pt.type
             FROM partner_transactions pt
             LEFT JOIN installments i ON i.legacy_transaction_id=pt.id
             WHERE pt.kind = 'زبون'
               AND pt.source_type = 'customer_installment_schedule'
               AND pt.source_role = 'installment_schedule'
               AND pt.sale_id = ?1
               AND COALESCE(pt.is_reversed, 0) = 0
             ORDER BY COALESCE(pt.due_date, pt.date), pt.id",
        )
        .map_err(|e| e.to_string())?;
    let states = stmt
        .query_map([sale_id], |row| {
            let tx_type: String = row.get(12)?;
            Ok(InstallmentScheduleState {
                id: row.get(0)?,
                installment_id: row.get(1)?,
                partner_name: row.get(2)?,
                due_date: row.get(3)?,
                currency: row.get(4)?,
                payment_type: row.get(5)?,
                notes: row.get(6)?,
                original_amount: row.get(7)?,
                current_amount: row.get(8)?,
                display_amount: row.get(9)?,
                actual_paid_amount: row.get(10)?,
                paid_event_id: row.get(11)?,
                paid: tx_type.starts_with("واصل"),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(states)
}

pub fn append_deferred_installment_state(
    states: &mut Vec<InstallmentScheduleState>,
    _sale_id: i64,
    paid_index: usize,
    amount: Money,
) -> Result<(), String> {
    if amount <= Money::zero() {
        return Ok(());
    }
    let paid_state = states
        .get(paid_index)
        .cloned()
        .ok_or_else(|| "القسط المحدد غير موجود ضمن جدول السيارة".to_string())?;
    let base_note = paid_state
        .notes
        .replace("واصل ", "باقي ")
        .replace("واصل", "باقي");
    states.push(InstallmentScheduleState {
        id: 0,
        installment_id: None,
        partner_name: paid_state.partner_name,
        due_date: add_months_to_date(&paid_state.due_date, 1),
        currency: paid_state.currency,
        payment_type: paid_state.payment_type,
        notes: format!("باقي قسط شهر لاحق للفرق المتبقي بعد {}", base_note),
        original_amount: Money::zero(),
        current_amount: amount,
        display_amount: amount,
        actual_paid_amount: None,
        paid_event_id: None,
        paid: false,
    });
    Ok(())
}

pub fn materialize_deferred_installment_states(
    db: &Connection,
    car_number: &str,
    states: &mut [InstallmentScheduleState],
) -> Result<(), String> {
    let (car_id, sale_id) = car_sale_identity_by_number(db, car_number)?;
    let sale_id = sale_id.ok_or_else(|| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    let (operation_id, customer_account_id): (String, i64) = db
        .query_row(
            "SELECT operation_id,customer_account_id FROM car_sales
             WHERE id=?1 AND car_id=?2 AND status='active'",
            params![sale_id, car_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("تعذر قراءة هوية البيع عند إنشاء القسط المؤجل: {e}"))?;
    let now_time = Local::now().format("%H:%M:%S").to_string();

    for state in states.iter_mut().filter(|state| state.id == 0) {
        db.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_entity_id, source_role,
                affects_qasa, affects_partner_cash, affects_profit,
                related_source_type, related_source_id, related_entity_id,
                original_amount, current_amount, due_date, is_reversed,
                account_id, operation_id, sale_id
             )
             VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, ?7,
                'customer_installment_schedule', NULL, NULL, 'installment_schedule', 0, 0, 0,
                'car', CAST(?8 AS TEXT), ?8, ?9, ?10, ?3, 0, ?11, ?12, ?13)",
            params![
                state.partner_name.trim(),
                state.display_amount,
                &state.due_date,
                &now_time,
                &state.notes,
                &state.currency,
                &state.payment_type,
                car_id,
                state.original_amount,
                state.current_amount,
                customer_account_id,
                &operation_id,
                sale_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        state.id = db.last_insert_rowid();
    }

    db.execute(
        "INSERT INTO installments
         (operation_id,sale_id,customer_account_id,legacy_transaction_id,
          due_date,currency,original_amount,current_amount,status)
         SELECT ?1,?2,?3,pt.id,COALESCE(pt.due_date,pt.date),COALESCE(pt.currency,'IQD'),
                COALESCE(pt.original_amount,pt.amount),COALESCE(pt.current_amount,pt.amount),'unpaid'
         FROM partner_transactions pt
         WHERE pt.sale_id=?2 AND pt.source_type='customer_installment_schedule'
           AND pt.source_role='installment_schedule'
           AND NOT EXISTS (SELECT 1 FROM installments i WHERE i.legacy_transaction_id=pt.id)",
        params![operation_id, sale_id, customer_account_id],
    )
    .map_err(|e| format!("تعذر ربط القسط المؤجل بهويته الرقمية: {e}"))?;

    for state in states.iter_mut() {
        state.installment_id = db
            .query_row(
                "SELECT id FROM installments WHERE legacy_transaction_id=?1",
                [state.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("تعذر قراءة معرف القسط الرقمي: {e}"))?;
    }

    Ok(())
}

pub fn distribute_installment_difference(
    states: &mut Vec<InstallmentScheduleState>,
    sale_id: i64,
    paid_index: usize,
    difference: Money,
    currency: &str,
) -> Result<Vec<usize>, String> {
    if difference == Money::zero() {
        return Ok(Vec::new());
    }
    let scale = currency_scale(currency)?;
    let future_indices: Vec<usize> = states
        .iter()
        .enumerate()
        .filter_map(|(idx, state)| {
            if idx > paid_index && !state.paid {
                Some(idx)
            } else {
                None
            }
        })
        .collect();
    if future_indices.is_empty() {
        if difference.is_negative() {
            append_deferred_installment_state(states, sale_id, paid_index, difference.abs())?;
            return Ok(Vec::new());
        }
        return Err("لا يمكن تسجيل دفعة زائدة على آخر قسط بدون نظام رصيد دائن آمن".to_string());
    }

    if difference.is_positive() {
        let future_total: Money = future_indices
            .iter()
            .map(|idx| states[*idx].current_amount)
            .sum();
        if difference > future_total {
            return Err(
                "المبلغ الزائد أكبر من مجموع الأقساط المتبقية ولا يوجد نظام رصيد دائن آمن"
                    .to_string(),
            );
        }
    }

    let abs_diff = difference.abs();
    let count = future_indices.len();
    let base = Money(
        (abs_diff / Money::from_usize(count))
            .0
            .round_dp_with_strategy(scale, RoundingStrategy::ToZero),
    );
    let last = if count == 1 {
        abs_diff
    } else {
        abs_diff - base * Money::from_usize(count - 1)
    };

    for (pos, idx) in future_indices.iter().enumerate() {
        let share = if pos == count - 1 { last } else { base };
        if difference.is_positive() {
            if states[*idx].current_amount < share {
                return Err("نتيجة التوزيع تجعل أحد الأقساط القادمة سالباً".to_string());
            }
            states[*idx].current_amount -= share;
        } else {
            states[*idx].current_amount += share;
        }
        states[*idx].display_amount = states[*idx].current_amount;
    }
    Ok(future_indices
        .into_iter()
        .filter(|idx| states[*idx].current_amount.is_zero())
        .collect())
}

pub fn update_car_installment_totals(db: &Connection, car_number: &str) -> Result<(), String> {
    let (car_id, sale_id) = car_sale_identity_by_number(db, car_number)?;
    let sale_id = sale_id.ok_or_else(|| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    let selling_price: Money = db
        .query_row(
            "SELECT selling_price FROM cars WHERE id = ?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let down_payment_sum = sum_money_rows(
        db,
        "SELECT amount FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_entity_id = ?1
               AND source_role = 'sale_down_payment'
               AND COALESCE(is_reversed, 0) = 0",
        [car_id.to_string()],
    )?;
    let active_payment_sum = sum_money_rows(
        db,
        "SELECT actual_paid_amount
             FROM customer_installment_payment_events
             WHERE sale_id_v2 = ?1 AND status = 'active'",
        [sale_id],
    )?;
    let total_paid = down_payment_sum + active_payment_sum;
    db.execute(
        "UPDATE cars SET amount_paid = ?1, amount_remaining = ?2 WHERE id = ?3",
        params![total_paid, selling_price - total_paid, car_id],
    )
    .map_err(|e| format!("تعذر تحديث إجماليات دفعات السيارة: {e}"))?;
    Ok(())
}

pub fn recalculate_installment_schedule_for_car(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
    ensure_original_installment_rows(db, car_number)?;
    let (car_id, sale_id) = car_sale_identity_by_number(db, car_number)?;
    let sale_id = sale_id.ok_or_else(|| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    let (operation_id, customer_account_id): (String, i64) = db
        .query_row(
            "SELECT operation_id,customer_account_id FROM car_sales
             WHERE id=?1 AND car_id=?2 AND status='active'",
            params![sale_id, car_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("تعذر قراءة هوية البيع عند إعادة حساب الأقساط: {e}"))?;
    let mut states = load_installment_schedule_states(db, car_number)?;

    for state in &mut states {
        state.current_amount = state.original_amount;
        state.display_amount = state.original_amount;
        state.actual_paid_amount = None;
        state.paid_event_id = None;
        state.paid = false;
    }

    struct ActiveEvent {
        id: i64,
        installment_id: i64,
        actual_paid_amount: Money,
        currency: String,
    }

    let mut stmt = db
        .prepare(
            "SELECT id, installment_id, actual_paid_amount, currency
             FROM customer_installment_payment_events
             WHERE sale_id_v2 = ?1 AND status = 'active'
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let events = stmt
        .query_map([sale_id], |row| {
            Ok(ActiveEvent {
                id: row.get(0)?,
                installment_id: row.get(1)?,
                actual_paid_amount: row.get(2)?,
                currency: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for event in events {
        let idx = states
            .iter()
            .position(|state| state.id == event.installment_id)
            .ok_or_else(|| "حدث دفعة مرتبط بقسط غير موجود".to_string())?;
        if states[idx].paid {
            return Err("يوجد أكثر من حدث دفع فعال لنفس القسط".to_string());
        }
        if states[idx].currency != event.currency {
            return Err("عملة حدث الدفع لا تطابق عملة القسط".to_string());
        }
        let scheduled_at_event = states[idx].current_amount;
        let difference = event.actual_paid_amount - scheduled_at_event;
        let automatically_settled = distribute_installment_difference(
            &mut states,
            sale_id,
            idx,
            difference,
            &event.currency,
        )?;
        for settled_idx in automatically_settled {
            states[settled_idx].paid = true;
            states[settled_idx].display_amount = Money::zero();
            states[settled_idx].actual_paid_amount = Some(Money::zero());
            states[settled_idx].paid_event_id = Some(event.id);
        }
        states[idx].paid = true;
        states[idx].display_amount = event.actual_paid_amount;
        states[idx].actual_paid_amount = Some(event.actual_paid_amount);
        states[idx].paid_event_id = Some(event.id);
    }

    materialize_deferred_installment_states(db, car_number, &mut states)?;

    for state in &states {
        let tx_type = if state.paid {
            "واصل قسط"
        } else {
            "باقي قسط"
        };
        let notes = if state.paid {
            state
                .notes
                .replace("باقي ", "واصل ")
                .replace("باقي", "واصل")
        } else {
            state
                .notes
                .replace("واصل ", "باقي ")
                .replace("واصل", "باقي")
        };
        let (related_type, related_id) = if state.paid {
            (
                "customer_payment_event",
                state
                    .paid_event_id
                    .map(|id| id.to_string())
                    .unwrap_or_default(),
            )
        } else {
            ("car", car_id.to_string())
        };
        db.execute(
            "UPDATE partner_transactions
             SET type = ?1,
                 amount = ?2,
                 current_amount = ?3,
                 actual_paid_amount = ?4,
                 paid_event_id = ?5,
                 related_source_type = ?6,
                 related_source_id = ?7,
                 notes = ?8,
                 is_reversed = 0,
                 account_id = ?10,
                 operation_id = ?11,
                 sale_id = ?12
             WHERE id = ?9",
            params![
                tx_type,
                state.display_amount,
                state.current_amount,
                state.actual_paid_amount,
                state.paid_event_id,
                related_type,
                related_id,
                notes,
                state.id,
                customer_account_id,
                &operation_id,
                sale_id,
            ],
        )
        .map_err(|e| e.to_string())?;

        let installment_status = if state.paid { "paid" } else { "unpaid" };
        let updated_installment = db
            .execute(
                "UPDATE installments
                 SET current_amount=?1,
                     status=?2,
                     version=version+1,
                     updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE legacy_transaction_id=?3
                   AND status NOT IN ('reversed','cancelled')",
                params![state.current_amount, installment_status, state.id],
            )
            .map_err(|e| format!("تعذر مزامنة حالة هوية القسط {}: {e}", state.id))?;
        if updated_installment != 1 {
            return Err(format!(
                "تعذر مزامنة حالة القسط {} مع سجل الأقساط الرقمي",
                state.id
            ));
        }
    }

    update_car_installment_totals(db, car_number)?;
    Ok(())
}

pub fn rebuild_installment_schedule(db: &Connection, car_number: &str) -> Result<(), String> {
    recalculate_installment_schedule_for_car(db, car_number)
}

pub fn extract_linked_installment_id(notes: &str) -> Option<i64> {
    let marker = "قسط#";
    let start = notes.find(marker)? + marker.len();
    let digits: String = notes[start..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    digits.parse::<i64>().ok()
}

pub fn is_installment_schedule_id(db: &Connection, id: i64) -> bool {
    db.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM partner_transactions
            WHERE id = ?1
              AND kind = 'زبون'
              AND source_type = 'customer_installment_schedule'
              AND source_role = 'installment_schedule'
              AND COALESCE(is_reversed, 0) = 0
         )",
        [id],
        |row| row.get(0),
    )
    .unwrap_or(false)
}

pub fn resolve_installment_schedule_id(db: &Connection, tx_id: i64) -> Result<i64, String> {
    if is_installment_schedule_id(db, tx_id) {
        return Ok(tx_id);
    }

    let notes: Option<String> = db
        .query_row(
            "SELECT notes FROM partner_transactions WHERE id = ?1",
            [tx_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    if let Some(linked_id) = notes
        .as_deref()
        .and_then(extract_linked_installment_id)
        .filter(|id| is_installment_schedule_id(db, *id))
    {
        return Ok(linked_id);
    }

    Err("القسط غير موجود".to_string())
}

pub fn resolve_car_number_for_installment(
    db: &Connection,
    installment_id: i64,
) -> Result<String, String> {
    let numeric_car_number: Option<String> = db
        .query_row(
            "SELECT c.car_number
             FROM installments i
             JOIN car_sales s ON s.id=i.sale_id
             JOIN cars c ON c.id=s.car_id
             WHERE i.legacy_transaction_id=?1",
            [installment_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(car_number) = numeric_car_number {
        return Ok(car_number);
    }
    let (rel_type, rel_id, source_id, notes): (String, String, String, Option<String>) = db
        .query_row(
            "SELECT COALESCE(related_source_type, ''), COALESCE(related_source_id, ''),
                    COALESCE(source_id, ''), notes
             FROM partner_transactions
             WHERE id = ?1
               AND kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'",
            [installment_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "القسط غير موجود أو ليس من جدول أقساط الزبون".to_string())?;

    if rel_type == "car" && !rel_id.trim().is_empty() {
        return Ok(rel_id);
    }
    if source_id.contains(':') {
        if let Some(car_number) = source_id.split(':').next() {
            if !car_number.trim().is_empty() {
                return Ok(car_number.to_string());
            }
        }
    }
    if let Some(notes) = notes {
        if let Some(car_number) = extract_car_number_from_notes(&notes) {
            return Ok(car_number);
        }
    }
    Err("لم يتم العثور على السيارة المرتبطة بهذا القسط".to_string())
}

pub fn calculate_installment_payment_preview(
    db: &Connection,
    installment_id: i64,
    actual_paid_amount: Money,
    currency: Option<&str>,
) -> Result<InstallmentPaymentPreview, String> {
    validate_positive_amount(actual_paid_amount, "المبلغ المدفوع فعلياً")?;
    let installment_id = resolve_installment_schedule_id(db, installment_id)?;
    let car_number = resolve_car_number_for_installment(db, installment_id)?;
    let (_, sale_id) = car_sale_identity_by_number(db, &car_number)?;
    let sale_id = sale_id.ok_or_else(|| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    let mut states = load_installment_schedule_states(db, &car_number)?;
    let idx = states
        .iter()
        .position(|state| state.id == installment_id)
        .ok_or_else(|| "لم يتم العثور على القسط ضمن جدول السيارة".to_string())?;
    if states[idx].paid {
        return Err("هذا القسط مسدد بالفعل".to_string());
    }
    if let Some(currency) = currency {
        if states[idx].currency != currency {
            return Err("عملة الدفع لا تطابق عملة القسط".to_string());
        }
    }
    let current_amount = states[idx].current_amount;
    let difference = actual_paid_amount - current_amount;
    let old_amounts: std::collections::HashMap<i64, Money> = states
        .iter()
        .map(|state| (state.id, state.current_amount))
        .collect();
    let installment_currency = states[idx].currency.clone();
    distribute_installment_difference(
        &mut states,
        sale_id,
        idx,
        difference,
        &installment_currency,
    )?;
    let preview_installments = states
        .iter()
        .enumerate()
        .filter_map(|(row_idx, state)| {
            if row_idx <= idx || state.paid {
                return None;
            }
            if state.id == 0 {
                return Some(InstallmentPreviewRow {
                    installment_id: 0,
                    due_date: state.due_date.clone(),
                    old_amount: Money::zero(),
                    new_amount: state.current_amount,
                    currency: state.currency.clone(),
                    status: "سيتم إنشاء قسط لاحق".to_string(),
                });
            }
            let old_amount = *old_amounts.get(&state.id).unwrap_or(&state.current_amount);
            if old_amount == state.current_amount {
                return None;
            }
            Some(InstallmentPreviewRow {
                installment_id: state.id,
                due_date: state.due_date.clone(),
                old_amount,
                new_amount: state.current_amount,
                currency: state.currency.clone(),
                status: "باقي".to_string(),
            })
        })
        .collect::<Vec<_>>();
    let direction = if difference.is_positive() {
        "تخفيض الأقساط القادمة".to_string()
    } else if difference.is_negative() {
        "زيادة الأقساط القادمة".to_string()
    } else {
        "لا يوجد فرق".to_string()
    };
    Ok(InstallmentPaymentPreview {
        installment_id,
        current_amount,
        actual_paid_amount,
        difference_amount: difference,
        affected_count: preview_installments.len(),
        redistribution_direction: direction,
        preview_installments,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn pay_customer_installment_core(
    db: &Connection,
    installment_id: i64,
    customer_name: &str,
    actual_paid_amount: Money,
    date: &str,
    notes: Option<&str>,
    currency: &str,
    payment_type: &str,
) -> Result<(), String> {
    validate_required_text(customer_name, "اسم الزبون")?;
    validate_positive_amount(actual_paid_amount, "المبلغ المدفوع فعلياً")?;
    validate_required_text(date, "التاريخ")?;
    validate_currency(currency)?;

    let installment_id = resolve_installment_schedule_id(db, installment_id)?;
    let car_number = resolve_car_number_for_installment(db, installment_id)?;
    ensure_original_installment_rows(db, &car_number)?;
    let numeric_identity: (i64, i64, i64) = db
        .query_row(
            "SELECT i.id,i.sale_id,i.customer_account_id
         FROM installments i WHERE i.legacy_transaction_id=?1",
            [installment_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| {
            "لا يمكن تسجيل دفعة لقسط بلا installment_id وsale_id وaccount_id رقمية".to_string()
        })?;

    let (row_customer, row_type, row_currency, scheduled_amount, source_id): (
        String,
        String,
        String,
        Money,
        String,
    ) = db
        .query_row(
            "SELECT partner_name, type, COALESCE(currency, 'IQD'),
                    COALESCE(current_amount, amount), COALESCE(source_id, '')
             FROM partner_transactions
             WHERE id = ?1
               AND kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'
               AND COALESCE(is_reversed, 0) = 0",
            [installment_id],
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
        .map_err(|_| "القسط غير موجود".to_string())?;

    if row_customer.trim() != customer_name.trim() {
        return Err("القسط لا ينتمي إلى هذا الزبون".to_string());
    }
    if !row_type.starts_with("باقي") {
        return Err("لا يمكن دفع قسط مسدد مسبقاً".to_string());
    }
    if row_currency != currency {
        return Err("عملة الدفع لا تطابق عملة القسط".to_string());
    }
    let active_exists: bool = db
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM customer_installment_payment_events
                WHERE installment_id = ?1 AND status = 'active'
             )",
            [installment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if active_exists {
        return Err("يوجد حدث دفع فعال لهذا القسط مسبقاً".to_string());
    }

    let preview = calculate_installment_payment_preview(
        db,
        installment_id,
        actual_paid_amount,
        Some(currency),
    )?;
    let ledger_batch_id = new_ledger_token("installment_batch");
    let event_uuid = new_ledger_token("installment_event");
    let payment_operation_id = new_ledger_token("customer_payment");
    db.execute(
        "INSERT INTO operations(id,operation_type,status) VALUES (?1,'customer_payment','active')",
        [&payment_operation_id],
    )
    .map_err(|e| format!("تعذر إنشاء عملية دفعة القسط: {e}"))?;
    let time_str = Local::now().format("%H:%M:%S").to_string();
    let effective_notes = notes
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| format!("تسديد قسط {}", source_id));

    db.execute(
        "INSERT INTO customer_installment_payment_events (
            event_uuid, customer_id, sale_id, installment_id, currency,
            scheduled_amount_at_payment_time, actual_paid_amount, difference_amount,
            status, ledger_batch_id, notes, operation_id, sale_id_v2, account_id, installment_id_v2
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            &event_uuid,
            customer_name.trim(),
            numeric_identity.1,
            installment_id,
            currency,
            scheduled_amount,
            actual_paid_amount,
            preview.difference_amount,
            &ledger_batch_id,
            &effective_notes,
            &payment_operation_id,
            numeric_identity.1,
            numeric_identity.2,
            numeric_identity.0,
        ],
    )
    .map_err(|e| format!("تعذر إضافة حدث دفعة القسط: {e}"))?;
    let event_id = db.last_insert_rowid();

    let customer_payment_notes = format!(
        "{} | قسط#{} | حدث#{} #بيع_سيارة_{}",
        effective_notes, installment_id, event_id, car_number
    );
    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_role, affects_qasa, affects_partner_cash, affects_profit,
            related_source_type, related_source_id, ledger_batch_id, is_reversed,
            operation_id, sale_id, account_id
         )
         VALUES (?1, 'زبون', 'تسديد قسط', ?2, ?3, ?4, ?5, ?6, ?7,
            'customer_payment', 'customer_payment', 0, 0, 0,
            'customer_payment_event', ?8, ?9, 0, ?10, ?11, ?12)",
        params![
            customer_name.trim(),
            actual_paid_amount,
            date.trim(),
            &time_str,
            &customer_payment_notes,
            currency,
            payment_type,
            event_id.to_string(),
            &ledger_batch_id,
            &payment_operation_id,
            numeric_identity.1,
            numeric_identity.2,
        ],
    )
    .map_err(|e| e.to_string())?;
    let customer_payment_id = db.last_insert_rowid();
    db.execute(
        "UPDATE partner_transactions SET source_id = ?1 WHERE id = ?2",
        params![customer_payment_id.to_string(), customer_payment_id],
    )
    .map_err(|e| e.to_string())?;
    record_partner_ledger_entries(db, customer_payment_id)?;
    set_ledger_batch_for_partner_transaction(db, customer_payment_id, &ledger_batch_id)?;
    create_customer_payment_accounting_effects(
        db,
        customer_payment_id,
        actual_paid_amount,
        currency,
        date,
        payment_type,
        &customer_payment_notes,
    )?;
    set_customer_payment_batch(db, customer_payment_id, &ledger_batch_id)?;
    db.execute(
        "UPDATE partner_transactions SET operation_id=?1,
         sale_id=COALESCE(sale_id,?2), account_id=COALESCE(account_id,?3)
         WHERE ledger_batch_id=?4",
        params![
            payment_operation_id,
            numeric_identity.1,
            numeric_identity.2,
            ledger_batch_id
        ],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE financial_ledger SET operation_id=?1,
         sale_id=COALESCE(sale_id,?2), account_id_v2=COALESCE(account_id_v2,?3)
         WHERE ledger_batch_id=?4",
        params![
            payment_operation_id,
            numeric_identity.1,
            numeric_identity.2,
            ledger_batch_id
        ],
    )
    .map_err(|e| e.to_string())?;

    recalculate_installment_schedule_for_car(db, &car_number)?;
    recalculate_partner_total(db, customer_name.trim(), "زبون")?;
    recalculate_all_partners(db)?;
    Ok(())
}

pub fn reverse_customer_installment_payment_core(
    db: &Connection,
    installment_id: i64,
) -> Result<String, String> {
    let installment_id = resolve_installment_schedule_id(db, installment_id)?;
    let car_number = resolve_car_number_for_installment(db, installment_id)?;
    let (tx_type, paid_event_id): (String, Option<i64>) = db
        .query_row(
            "SELECT type, paid_event_id
             FROM partner_transactions
             WHERE id = ?1
               AND kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'",
            [installment_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "القسط غير موجود".to_string())?;
    if !tx_type.starts_with("واصل") {
        return Err("لا يمكن إلغاء قسط غير مسدد".to_string());
    }
    let event_id = paid_event_id.ok_or_else(|| "القسط لا يحتوي على حدث دفع فعال".to_string())?;
    let (
        status,
        ledger_batch_id,
        original_operation_id,
        sale_id,
        account_id,
        numeric_installment_id,
        event_installment_id,
    ): (String, String, String, i64, i64, i64, i64) = db
        .query_row(
            "SELECT status,ledger_batch_id,operation_id,sale_id_v2,account_id,
                    installment_id_v2,installment_id
             FROM customer_installment_payment_events
             WHERE id = ?1",
            [event_id],
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
            },
        )
        .map_err(|_| "حدث الدفع المرتبط بالقسط لا يملك سلسلة هوية رقمية مكتملة".to_string())?;
    if status != "active" {
        return Err("حدث الدفع ملغى مسبقاً".to_string());
    }
    if !is_installment_schedule_id(db, event_installment_id) {
        return Err("حدث الدفع مرتبط بقسط أصلي غير صالح".to_string());
    }

    let reversal_batch_id = new_ledger_token("installment_reversal");
    let reversal_uuid = new_ledger_token("installment_reversal_event");
    let reversal_operation_id = new_ledger_token("customer_payment_reversal");
    let (date, time) = now_datetime();
    db.execute(
        "INSERT INTO operations
         (id,operation_type,status,reverses_operation_id,actor_user_id)
         SELECT ?1,'customer_payment_reversal','active',?2,actor_user_id
         FROM operations WHERE id=?2",
        params![reversal_operation_id, original_operation_id],
    )
    .map_err(|e| format!("تعذر إنشاء عملية عكس دفعة القسط: {e}"))?;
    db.execute(
        "INSERT INTO customer_installment_payment_events (
            event_uuid, customer_id, sale_id, installment_id, currency,
            scheduled_amount_at_payment_time, actual_paid_amount, difference_amount,
            status, ledger_batch_id, created_at, notes, operation_id, sale_id_v2,
            account_id, installment_id_v2
         )
         SELECT ?1, customer_id, sale_id, installment_id, currency,
                scheduled_amount_at_payment_time, actual_paid_amount, difference_amount,
                'reversal', ?2, ?3, 'عكس حدث دفع قسط', ?4, ?5, ?6, ?7
         FROM customer_installment_payment_events
         WHERE id = ?8",
        params![
            &reversal_uuid,
            &reversal_batch_id,
            format!("{} {}", date, time),
            &reversal_operation_id,
            sale_id,
            account_id,
            numeric_installment_id,
            event_id,
        ],
    )
    .map_err(|e| format!("تعذر إضافة حدث عكس دفعة القسط: {e}"))?;
    let reversal_event_id = db.last_insert_rowid();

    db.execute(
        "UPDATE customer_installment_payment_events
         SET status = 'reversed',
             reversed_at = ?1,
             reversed_by_event_id = ?2
         WHERE id = ?3",
        params![format!("{} {}", date, time), reversal_event_id, event_id],
    )
    .map_err(|e| format!("تعذر ربط حدث الدفع الأصلي بحدث العكس: {e}"))?;

    reverse_ledger_batch_entries(db, &ledger_batch_id, &reversal_batch_id)?;
    db.execute(
        "UPDATE financial_ledger
         SET operation_id=?1,sale_id=?2,account_id_v2=COALESCE(account_id_v2,?3)
         WHERE ledger_batch_id=?4",
        params![
            reversal_operation_id,
            sale_id,
            account_id,
            reversal_batch_id
        ],
    )
    .map_err(|e| format!("تعذر ربط قيود عكس دفعة القسط بالعملية: {e}"))?;
    let partner_reversals = append_partner_batch_reversals(
        db,
        &ledger_batch_id,
        &reversal_batch_id,
        &reversal_operation_id,
        sale_id,
        account_id,
        reversal_event_id,
    )?;
    if partner_reversals == 0 {
        return Err("تعذر عكس دفعة القسط: لا توجد حركات شركاء أصلية مرتبطة بالدفعة".to_string());
    }
    db.execute(
        "UPDATE operations
         SET status='reversed',reversed_at=?1,reversal_operation_id=?2
         WHERE id=?3 AND status='active'",
        params![
            format!("{} {}", date, time),
            reversal_operation_id,
            original_operation_id
        ],
    )
    .map_err(|e| format!("تعذر تحديث حالة عملية دفعة القسط الأصلية: {e}"))?;
    recalculate_installment_schedule_for_car(db, &car_number)
        .map_err(|e| format!("تعذر إعادة احتساب جدول الأقساط بعد العكس: {e}"))?;

    // FIX-2: ضمان أن كل قسط ليس له حدث دفع فعال يُعاد نوعه إلى 'باقي قسط'
    // هذا الإجراء الدفاعي يُصحح أي حالة انحدار حيث يبقى type='واصل قسط'
    // بعد إلغاء الدفعة رغم صحة منطق إعادة الحساب.
    db.execute(
        "UPDATE partner_transactions
         SET type = 'باقي قسط',
             paid_event_id = NULL,
             actual_paid_amount = NULL
         WHERE kind = 'زبون'
           AND source_type = 'customer_installment_schedule'
           AND source_role = 'installment_schedule'
           AND COALESCE(is_reversed, 0) = 0
           AND type = 'واصل قسط'
           AND (
               paid_event_id IS NULL
               OR NOT EXISTS (
                   SELECT 1 FROM customer_installment_payment_events e
                   WHERE e.id = partner_transactions.paid_event_id
                     AND e.status = 'active'
               )
           )
           AND sale_id = ?1",
        [sale_id],
    )
    .map_err(|e| format!("تعذر إصلاح أنواع الأقساط بعد العكس: {e}"))?;

    let customer_name: Option<String> = db
        .query_row(
            "SELECT partner_name FROM partner_transactions WHERE id = ?1",
            [installment_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(customer_name) = customer_name {
        recalculate_partner_total(db, &customer_name, "زبون")?;
    }
    recalculate_all_partners(db)?;
    Ok(reversal_operation_id)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_customer_sale_down_payment(
    state: State<AppState>,
    transaction_id: i64,
    customer_name: String,
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
    creation_token: Option<String>,
    session_token: String,
) -> Result<(), String> {
    validate_required_text(&customer_name, "اسم الزبون")?;
    validate_positive_amount(amount, "المقدمة")?;
    validate_required_text(&date, "التاريخ")?;
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency)?;
    let payment_type = payment_type.unwrap_or_else(|| "قاصه".to_string());

    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    ensure_accounting_period_open(&db, &date)?;
    let creation_token = creation_token
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty());
    let idempotency_payload = serde_json::json!({
        "transaction_id": transaction_id,
        "customer_name": customer_name.trim(),
        "amount": amount,
        "date": date.trim(),
        "notes": notes.as_deref().map(str::trim),
        "currency": currency,
        "payment_type": payment_type,
    });
    if let IdempotencyClaim::Replay(_) = claim_idempotent_creation(
        &db,
        creation_token.as_deref(),
        "update_customer_sale_down_payment",
        &idempotency_payload,
    )? {
        append_audit_event(
            &db,
            actor_user_id,
            "partner_transaction",
            Some(transaction_id),
            "update_customer_sale_down_payment.idempotent_retry",
            Some(&session_token),
            creation_token.as_deref(),
        )?;
        db.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let (row_customer, row_currency, related_source_id, sale_id, existing_notes): (
        String,
        String,
        String,
        i64,
        Option<String>,
    ) = db
        .query_row(
            "SELECT partner_name, COALESCE(currency, 'IQD'), COALESCE(related_source_id, ''),
                    sale_id, notes
             FROM partner_transactions
             WHERE id = ?1
               AND kind = 'زبون'
               AND source_type = 'customer_sale_payment'
               AND source_role = 'sale_down_payment'
               AND COALESCE(is_reversed, 0) = 0",
            [transaction_id],
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
        .map_err(|_| "هذه الحركة ليست مقدمة بيع سيارة قابلة للتعديل".to_string())?;

    if row_customer.trim() != customer_name.trim() {
        return Err("المقدمة لا تنتمي إلى هذا الزبون".to_string());
    }
    if row_currency != currency {
        return Err("عملة المقدمة لا تطابق عملة الحركة الأصلية".to_string());
    }

    let car_id = related_source_id
        .trim()
        .parse::<i64>()
        .map_err(|_| "المقدمة لا تحمل car_id رقميًا صالحًا".to_string())?;

    let (car_number, selling_price, sale_currency, car_payment_type): (String, Money, String, String) = db
        .query_row(
            "SELECT c.car_number,c.selling_price,COALESCE(c.sale_currency,'IQD'),COALESCE(c.payment_type,'')
             FROM cars c JOIN car_sales s ON s.id=?2 AND s.car_id=c.id
             WHERE c.id=?1 AND c.active_sale_id=s.id",
            params![car_id, sale_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "السيارة المرتبطة بالمقدمة غير موجودة".to_string())?;

    if sale_currency != currency {
        return Err("عملة المقدمة لا تطابق عملة بيع السيارة".to_string());
    }
    if car_payment_type != "اقساط" && car_payment_type != "موعد" {
        return Err("تعديل المقدمة من حساب الزبون متاح لبيع التقسيط أو الموعد فقط".to_string());
    }

    // Cap check: the new down payment plus everything already received for this sale
    // (other down payments + active installment payments) must not exceed the selling
    // price. Previously the existing down payment(s) were ignored, which let the total
    // receipts bypass the selling-price cap.
    let paid_installments_sum = sum_money_rows(
        &db,
        "SELECT actual_paid_amount
             FROM customer_installment_payment_events
             WHERE sale_id_v2 = ?1 AND status = 'active'",
        [sale_id],
    )?;
    let existing_down_payments_sum = sum_money_rows(
        &db,
        "SELECT amount
             FROM partner_transactions
             WHERE kind = 'زبون'
               AND source_type = 'customer_sale_payment'
               AND source_role = 'sale_down_payment'
               AND related_source_type = 'car'
               AND related_entity_id = ?1
               AND id != ?2
               AND COALESCE(is_reversed, 0) = 0",
        params![car_id.to_string(), transaction_id],
    )?;
    if amount + paid_installments_sum + existing_down_payments_sum > selling_price {
        return Err("المقدمة مع الأقساط المسددة أكبر من سعر البيع".to_string());
    }

    let time_str = Local::now().format("%H:%M:%S").to_string();
    let effective_notes = notes
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .or(existing_notes)
        .unwrap_or_else(|| {
            format!(
                "استلام مقدمة سيارة من {} #بيع_سيارة_{}",
                customer_name.trim(),
                car_number
            )
        });

    reverse_ledger_entries(&db, "partner_transaction", &transaction_id.to_string())?;
    delete_customer_payment_partner_splits(&db, transaction_id)?;
    delete_customer_payment_profit_splits(&db, transaction_id)?;

    db.execute(
        "UPDATE partner_transactions
         SET partner_name = ?1,
             type = 'مقدمة بيع سيارة',
             amount = ?2,
             date = ?3,
             time = ?4,
             notes = ?5,
             currency = ?6,
             payment_type = ?7,
             source_type = 'customer_sale_payment',
             source_role = 'sale_down_payment',
             affects_qasa = 0,
             affects_partner_cash = 0,
             affects_profit = 0,
             related_source_type = 'car',
             related_source_id = ?8
         WHERE id = ?9",
        params![
            customer_name.trim(),
            amount,
            date.trim(),
            &time_str,
            &effective_notes,
            &currency,
            &payment_type,
            car_id.to_string(),
            transaction_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    record_partner_ledger_entries(&db, transaction_id)?;
    apply_partner_transaction_splits(
        &db,
        transaction_id,
        customer_name.trim(),
        "زبون",
        "مقدمة بيع سيارة",
        amount,
        date.trim(),
        Some(&effective_notes),
        &currency,
        &payment_type,
    )?;

    recalculate_installment_schedule_for_car(&db, &car_number)?;
    recalculate_partner_total(&db, customer_name.trim(), "زبون")?;
    recalculate_all_partners(&db)?;
    append_audit_event(
        &db,
        actor_user_id,
        "partner_transaction",
        Some(transaction_id),
        "update_customer_sale_down_payment",
        Some(&session_token),
        creation_token.as_deref(),
    )?;
    complete_idempotent_creation(&db, creation_token.as_deref(), &transaction_id.to_string())?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn car_expenses_for_profit(db: &Connection, car_id: i64) -> Result<Money, String> {
    // Car Cost = Purchase Price + Car Expenses (AGENTS.md section 6.1, 12).
    // The authoritative source of car expenses is the car_expenses table.
    // expenses_at_sale is only a legacy snapshot kept on the cars row; it must not
    // override or hide real car_expenses rows, and the two must never be treated as
    // mutually exclusive (that would understate car cost and inflate profit).
    //
    // Audit fix #5: only expenses recorded in the SAME currency as the car's
    // purchase currency are part of the car cost. Summing IQD and USD amounts
    // together corrupts profit, profit ratio, and the profit cap.
    let car_currency: String = db
        .query_row(
            "SELECT COALESCE(currency,'IQD') FROM cars WHERE id=?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر قراءة عملة السيارة لحساب الربح: {e}"))?;
    let recorded_expenses = sum_money_rows(
        db,
        "SELECT amount FROM car_expenses
             WHERE car_id=?1 AND COALESCE(currency,'IQD')=?2",
        params![car_id, car_currency],
    )
    .map_err(|e| format!("تعذر حساب مصروفات السيارة: {e}"))?;
    if recorded_expenses > Money::zero() {
        return Ok(recorded_expenses);
    }
    // Legacy fallback: a car sold before car_expenses rows existed keeps its
    // at-sale snapshot so its cost is not understated.
    db.query_row(
        "SELECT COALESCE(expenses_at_sale,0.0) FROM cars WHERE id=?1",
        [car_id],
        |row| row.get(0),
    )
    .map_err(|e| format!("تعذر قراءة لقطة مصروفات السيارة: {e}"))
}

pub fn recognized_installment_profit_for_car(
    db: &Connection,
    sale_id: i64,
) -> Result<Money, String> {
    // Audit fix #5: the profit cap must compare amounts in the sale currency only.
    let sale_currency: String = db
        .query_row(
            "SELECT currency FROM car_sales WHERE id=?1",
            [sale_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر قراءة عملة بيع السيارة: {e}"))?;
    sum_money_rows(
        db,
        "SELECT amount
         FROM partner_transactions
         WHERE kind = 'شريك'
           AND source_type = 'customer_payment'
           AND source_role = 'profit_recognition'
           AND affects_profit = 1
           AND sale_id=?1
           AND COALESCE(currency, 'IQD') = ?2
           AND COALESCE(is_reversed, 0) = 0",
        params![sale_id, sale_currency],
    )
    .map_err(|e| format!("تعذر حساب الربح المعترف به للأقساط: {e}"))
}

pub fn calculate_deferred_revenue_from_unrecognized_profit(
    db: &Connection,
) -> Result<(Money, Money), String> {
    struct SoldDeferredCar {
        car_id: i64,
        sale_id: i64,
        purchase_price: Money,
        selling_price: Money,
        sale_currency: String,
    }

    let mut stmt = db
        .prepare(
            "SELECT id,active_sale_id,purchase_price,selling_price,COALESCE(sale_currency,'IQD')
             FROM cars
             WHERE status = 'مبيوعة'
               AND COALESCE(payment_type, 'كاش') != 'كاش'",
        )
        .map_err(|e| e.to_string())?;
    let cars = stmt
        .query_map([], |row| {
            Ok(SoldDeferredCar {
                car_id: row.get(0)?,
                sale_id: row.get(1)?,
                purchase_price: row.get(2)?,
                selling_price: row.get(3)?,
                sale_currency: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut deferred_iqd = Money::zero();
    let mut deferred_usd = Money::zero();
    for car in cars {
        let full_profit =
            car.selling_price - car.purchase_price - car_expenses_for_profit(db, car.car_id)?;
        if full_profit <= Money::zero() {
            continue;
        }
        let recognized = recognized_installment_profit_for_car(db, car.sale_id)?;
        let remaining = (full_profit - recognized).max(Money::zero());
        if car.sale_currency == "USD" {
            deferred_usd += remaining;
        } else {
            deferred_iqd += remaining;
        }
    }

    Ok((deferred_iqd, deferred_usd))
}

pub fn rebuild_cash_sale_profit_recognition(db: &Connection, car_id: i64) -> Result<(), String> {
    car_sale_identity_by_id(db, car_id)?;
    let car_id_text = car_id.to_string();
    let sale_id: i64 = db
        .query_row(
            "SELECT active_sale_id FROM cars WHERE id=?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|_| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    let sale_id_text = sale_id.to_string();
    delete_partner_transactions_by_source_with_ledger(
        db,
        "car_sale",
        &sale_id_text,
        Some("profit_recognition"),
    )?;

    let car_data: Result<SaleRecognitionCarData, rusqlite::Error> = db.query_row(
        "SELECT car_number,status,COALESCE(payment_type,'كاش'),purchase_price,selling_price,
                    COALESCE(sale_currency, 'IQD'), COALESCE(sale_date, '')
             FROM cars WHERE id = ?1 AND active_sale_id=?2",
        params![car_id, sale_id],
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
        },
    );
    let (car_number, status, payment_type, purchase_price, selling_price, sale_currency, sale_date) =
        match car_data {
            Ok(data) => data,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };

    if status != "مبيوعة" || payment_type != "كاش" {
        return Ok(());
    }

    let profit = selling_price - purchase_price - car_expenses_for_profit(db, car_id)?;
    if profit.is_zero() {
        return Ok(());
    }

    let tx_type = if profit > Money::zero() {
        "ايداع ارباح سيارة"
    } else {
        "سحب خسارة سيارة"
    };
    let note = if profit > Money::zero() {
        format!("ايداع ارباح سيارة {}", car_number)
    } else {
        format!("إثبات خسارة بيع سيارة {}", car_number)
    };

    distribute_signed_profit_recognition_50_with_related(
        db,
        profit,
        &sale_currency,
        &sale_date,
        "قاصه",
        tx_type,
        &note,
        "car_sale",
        &sale_id_text,
        Some("car"),
        Some(&car_id_text),
    )
}

pub fn rebuild_cash_sale_profit_recognitions(db: &Connection) -> Result<(), String> {
    let has_numeric_car_id: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('cars') WHERE name='id')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !has_numeric_car_id {
        return Ok(());
    }
    let mut stmt = db
        .prepare(
            "SELECT id FROM cars
             WHERE status = 'مبيوعة'
               AND COALESCE(payment_type, 'كاش') = 'كاش'",
        )
        .map_err(|e| e.to_string())?;
    let car_ids = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for car_id in car_ids {
        rebuild_cash_sale_profit_recognition(db, car_id)?;
    }
    Ok(())
}

pub fn rebuild_installment_sale_loss_recognition(
    db: &Connection,
    car_id: i64,
) -> Result<(), String> {
    car_sale_identity_by_id(db, car_id)?;
    let car_id_text = car_id.to_string();
    let sale_id: i64 = db
        .query_row(
            "SELECT active_sale_id FROM cars WHERE id=?1",
            [car_id],
            |row| row.get(0),
        )
        .map_err(|_| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    let sale_id_text = sale_id.to_string();
    delete_partner_transactions_by_source_with_ledger(
        db,
        "car_sale",
        &sale_id_text,
        Some("profit_recognition"),
    )?;

    let car_data: Result<SaleRecognitionCarData, rusqlite::Error> = db.query_row(
        "SELECT car_number,status,COALESCE(payment_type,'كاش'),purchase_price,selling_price,
                    COALESCE(sale_currency, 'IQD'), COALESCE(sale_date, '')
             FROM cars WHERE id = ?1 AND active_sale_id=?2",
        params![car_id, sale_id],
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
        },
    );
    let (car_number, status, payment_type, purchase_price, selling_price, sale_currency, sale_date) =
        match car_data {
            Ok(data) => data,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };

    if status != "مبيوعة" || payment_type == "كاش" {
        return Ok(());
    }

    let full_profit = selling_price - purchase_price - car_expenses_for_profit(db, car_id)?;
    if full_profit >= Money::zero() {
        return Ok(());
    }

    distribute_signed_profit_recognition_50_with_related(
        db,
        full_profit,
        &sale_currency,
        &sale_date,
        "قاصه",
        "سحب خسارة سيارة",
        &format!("إثبات خسارة بيع سيارة {} عند البيع", car_number),
        "car_sale",
        &sale_id_text,
        Some("car"),
        Some(&car_id_text),
    )
}

pub fn calculate_customer_payment_profit(
    db: &Connection,
    payment_tx_id: i64,
    car_number: &str,
    payment_amount: Money,
    payment_currency: &str,
) -> Result<Money, String> {
    let (car_id, sale_id, purchase_price, selling_price, sale_currency): (
        i64,
        i64,
        Money,
        Money,
        String,
    ) = db
        .query_row(
            "SELECT id,active_sale_id,purchase_price,selling_price,COALESCE(sale_currency,'IQD')
             FROM cars WHERE car_number = ?1",
            [car_number],
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
        .map_err(|e| e.to_string())?;
    if payment_amount <= Money::zero() || selling_price <= Money::zero() {
        return Ok(Money::zero());
    }
    // Audit fix #5: the profit ratio is defined in the sale currency. A payment in a
    // different currency cannot be mixed into the same profit pool without a fixed
    // exchange rate, so no profit is recognized for it (conservative, never corrupts
    // totals). Scheduled installment payments already enforce currency equality.
    if payment_currency.trim() != sale_currency {
        return Ok(Money::zero());
    }

    let full_profit = selling_price - purchase_price - car_expenses_for_profit(db, car_id)?;
    if full_profit <= Money::zero() {
        // Installment losses are recognized once at sale time so financial_ledger
        // and partner profit distribution use the same recognition date.
        return Ok(Money::zero());
    }

    let already_recognized = sum_money_rows(
        db,
        "SELECT amount
             FROM partner_transactions
             WHERE kind = 'شريك'
               AND source_type = 'customer_payment'
               AND source_role = 'profit_recognition'
               AND affects_profit = 1
               AND sale_id = ?1
               AND COALESCE(currency, 'IQD') = ?3
               AND COALESCE(source_id, '') != ?2
               AND COALESCE(is_reversed, 0) = 0",
        params![sale_id, payment_tx_id.to_string(), sale_currency],
    )
    .map_err(|e| format!("تعذر حساب الأرباح المعترف بها سابقاً: {e}"))?;
    let remaining_profit = full_profit - already_recognized;
    if remaining_profit <= Money::zero() {
        return Ok(Money::zero());
    }

    let payment_profit = payment_amount * (full_profit / selling_price);
    Ok(payment_profit.min(remaining_profit))
}

#[allow(clippy::too_many_arguments)]
pub fn create_customer_payment_profit_recognition(
    db: &Connection,
    payment_tx_id: i64,
    payment_amount: Money,
    currency: &str,
    date: &str,
    payment_type: &str,
    notes: &str,
    car_number: &str,
) -> Result<(), String> {
    let source_id = payment_tx_id.to_string();
    let profit_exists: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM partner_transactions
             WHERE source_type = 'customer_payment'
               AND source_entity_id = ?1
               AND source_role = 'profit_recognition'
               AND kind = 'شريك'
               AND COALESCE(is_reversed, 0) = 0",
            [&source_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر التحقق من تكرار قيد الربح: {e}"))?;
    if profit_exists {
        return Ok(());
    }

    let payment_profit =
        calculate_customer_payment_profit(db, payment_tx_id, car_number, payment_amount, currency)?;
    // Bug 1 (N1): Allow negative payment_profit (installment loss) to flow through.
    // We only short-circuit on exactly zero (no effect).
    if payment_profit.is_zero() {
        return Ok(());
    }

    let profit_note = format!(
        "ارباح قسط سيارة: {} (رقم حركة دفعة: {}) #بيع_سيارة_{}",
        notes, payment_tx_id, car_number
    );
    let (car_id, sale_id) = car_sale_identity_by_number(db, car_number)?;
    let sale_id = sale_id.ok_or_else(|| "السيارة لا تملك بيعًا نشطًا".to_string())?;
    distribute_to_partners_50_with_effects_and_related(
        db,
        payment_profit,
        currency,
        date,
        payment_type,
        "ايداع ارباح قسط سيارة",
        &profit_note,
        "customer_payment",
        &source_id,
        "profit_recognition",
        false,
        false,
        true,
        Some("car"),
        Some(&car_id.to_string()),
    )?;
    let operation_id: String = db
        .query_row(
            "SELECT operation_id FROM car_sales WHERE id=?1 AND car_id=?2",
            params![sale_id, car_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر قراءة عملية البيع لقيد الربح: {e}"))?;
    db.execute(
        "UPDATE partner_transactions SET operation_id=?1,sale_id=?2
         WHERE source_type='customer_payment' AND source_entity_id=?3
           AND source_role='profit_recognition'",
        params![operation_id, sale_id, source_id],
    )
    .map_err(|e| format!("تعذر ربط قيد الربح بهوية البيع: {e}"))?;
    Ok(())
}

pub fn create_customer_payment_accounting_effects(
    db: &Connection,
    payment_tx_id: i64,
    amount: Money,
    currency: &str,
    date: &str,
    payment_type: &str,
    notes: &str,
) -> Result<(), String> {
    let numeric_link: Option<(i64, String, i64, i64, String)> = db
        .query_row(
            "SELECT c.id,c.car_number,pt.sale_id,pt.account_id,pt.operation_id
             FROM partner_transactions pt
             JOIN car_sales s ON s.id=pt.sale_id
             JOIN cars c ON c.id=s.car_id
             WHERE pt.id=?1",
            [payment_tx_id],
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
        .optional()
        .map_err(|e| e.to_string())?;
    let car_num = numeric_link
        .as_ref()
        .map(|(_, car_number, _, _, _)| car_number.clone())
        .or_else(|| extract_car_number_from_notes(notes));
    let related_car_id = numeric_link
        .as_ref()
        .map(|(car_id, _, _, _, _)| car_id.to_string())
        .or_else(|| {
            car_num
                .as_deref()
                .and_then(|car_number| car_id_by_number(db, car_number).ok())
                .map(|car_id| car_id.to_string())
        });

    if let Some(ref car_id) = related_car_id {
        // FORENSIC FIX (re-audit 2026-07-11, FORENSIC-RUST-1-11):
        // The previous WHERE clause was:
        //   (related_source_type IS NULL OR related_source_id IS NULL OR related_source_id = '')
        // But `pay_customer_installment_core` INSERTs the customer payment row with
        //   related_source_type = 'customer_payment_event', related_source_id = <event_id>
        // Both fields are non-null and non-empty, so the UPDATE never fired.
        // This left the row with related_source_type='customer_payment_event',
        // causing `rebuild_customer_payment_profit_recognitions` (which filters
        // by related_source_type='car') to SKIP these rows entirely. Every
        // rebuild (migrations v25/v26/v30, sold-car cost changes, sale edits)
        // would DELETE installment profit rows and never recreate them.
        // Fix: also overwrite when related_source_type='customer_payment_event'
        // (the payment event is tracked separately via paid_event_id).
        db.execute(
            "UPDATE partner_transactions
             SET related_source_type='car',related_source_id=CAST(?1 AS TEXT),related_entity_id=?1
             WHERE id = ?2 AND (
                related_source_type IS NULL
                OR related_entity_id IS NULL
                OR related_source_type = 'customer_payment_event'
             )",
            params![car_id, payment_tx_id],
        )
        .map_err(|e| e.to_string())?;
    }

    let source_id = payment_tx_id.to_string();

    // Bug 9 (N4): Determine whether this is a customer "سحب" (cash OUT to customer).
    // For "سحب" we record a NEGATIVE-direction cash_movement (deduct from partners).
    let (src_type_name, _src_role): (String, String) = db
        .query_row(
            "SELECT COALESCE(type, ''), COALESCE(source_role, '')
             FROM partner_transactions WHERE id = ?1",
            [payment_tx_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| format!("تعذر قراءة حركة الزبون الأصلية: {e}"))?;
    let is_customer_withdrawal = src_type_name.starts_with("سحب");

    let cash_exists: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM partner_transactions
             WHERE source_type = 'customer_payment'
               AND source_entity_id = ?1
               AND source_role = 'cash_movement'
               AND kind = 'شريك'
               AND COALESCE(is_reversed, 0) = 0
               AND reverses_transaction_id IS NULL",
            [&source_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر التحقق من حركة الكاش المولدة: {e}"))?;

    if !cash_exists {
        let cash_note = match car_num.as_deref() {
            Some(cn) => format!(
                "دفعة زبون: {} (رقم حركة دفعة: {}) #بيع_سيارة_{}",
                notes, payment_tx_id, cn
            ),
            None => format!("دفعة زبون: {} (رقم حركة دفعة: {})", notes, payment_tx_id),
        };
        let cash_movement_type = if is_customer_withdrawal {
            // Bug 9 (N4): "سحب نقدي زبون" reverses cash flow direction.
            "سحب نقدي زبون"
        } else {
            let (payment_type_name, source_role): (String, String) = db
                .query_row(
                    "SELECT COALESCE(type, ''), COALESCE(source_role, '')
                     FROM partner_transactions WHERE id = ?1",
                    [payment_tx_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .map_err(|e| format!("تعذر تصنيف دفعة الزبون: {e}"))?;
            if source_role == "sale_down_payment" || payment_type_name.starts_with("مقدمة") {
                "ايداع مقدمة سيارة"
            } else if payment_type_name.contains("قسط") || notes.contains("قسط#") {
                "ايداع قسط سيارة"
            } else {
                "ايداع مقدمة سيارة"
            }
        };

        if is_customer_withdrawal {
            // Bug 9 (N4) + Audit fixes #1/#2: Deduct cash from partners.
            // The shares are stored as POSITIVE amounts with a "سحب..." type.
            // Every reader (Qasa/Cash cards, cash register tab, partner balance)
            // derives the sign from the type prefix ("سحب" => minus), so storing a
            // negative amount here caused a double negation that INCREASED cash on
            // a customer cash-out. The ledger side (Dr receivable / Cr cash) is
            // owned by the original customer "سحب" row, so these projection rows
            // must not write ledger entries of their own.
            let partners: Vec<(String, i64)> = db
                .prepare(
                    "SELECT partner_name,account_id
                     FROM partners
                     WHERE kind='شريك' AND account_id IS NOT NULL
                     ORDER BY partner_name",
                )
                .map_err(|e| e.to_string())?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            if partners.len() != 2 {
                return Err(format!(
                    "يجب أن يكون هناك شريكان بالضبط، وجد {}",
                    partners.len()
                ));
            }
            let time_str = Local::now().format("%H:%M").to_string();
            let (share1, share2) = split_partner_amount_50_by_currency(amount.0, currency);
            // Audit fix #2: related_source_type must be the literal 'car' (or empty),
            // never the car number itself.
            let related_type = if related_car_id.is_some() { "car" } else { "" };
            let (operation_id, sale_id): (String, Option<i64>) = db
                .query_row(
                    "SELECT operation_id,sale_id FROM partner_transactions WHERE id=?1",
                    [payment_tx_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|e| format!("تعذر قراءة هوية عملية دفعة الزبون: {e}"))?;
            let related_entity_id = related_car_id
                .as_deref()
                .and_then(|value| value.parse::<i64>().ok());
            for ((partner_name, account_id), share) in
                [(&partners[0], share1), (&partners[1], share2)]
            {
                db.execute(
                    "INSERT INTO partner_transactions (
                        partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                        source_type, source_id, source_entity_id, source_role,
                        affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id, related_entity_id,
                        account_id, operation_id, sale_id
                     )
                     VALUES (?1, 'شريك', ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                             ?9, CAST(?10 AS TEXT), ?10, 'cash_movement', 1, 1, 0,
                             ?11, ?12, ?13, ?14, ?15, ?16)",
                    params![
                        partner_name.trim(),
                        cash_movement_type,
                        Money(share),
                        date.trim(),
                        &time_str,
                        cash_note,
                        currency,
                        payment_type,
                        "customer_payment",
                        payment_tx_id,
                        related_type,
                        related_car_id.as_deref().unwrap_or(""),
                        related_entity_id,
                        account_id,
                        &operation_id,
                        sale_id,
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        } else {
            distribute_to_partners_50_with_effects_and_related(
                db,
                amount,
                currency,
                date,
                payment_type,
                cash_movement_type,
                &cash_note,
                "customer_payment",
                &source_id,
                "cash_movement",
                true,
                true,
                false,
                related_car_id.as_deref().map(|_| "car"),
                related_car_id.as_deref(),
            )?;
        }
    }

    // Bug 9 (N4): Only create profit recognition for actual payments (not "سحب" withdrawals).
    // A "سحب" by the customer is a cash-out, not a payment, so it must NOT trigger
    // installment profit recognition.
    if !is_customer_withdrawal {
        if let Some(cn) = car_num.as_deref() {
            create_customer_payment_profit_recognition(
                db,
                payment_tx_id,
                amount,
                currency,
                date,
                payment_type,
                notes,
                cn,
            )?;
        }
    }
    if let Some((car_id, _, sale_id, account_id, operation_id)) = numeric_link {
        db.execute(
            "UPDATE partner_transactions
             SET related_source_type='car',related_source_id=?1,
                 operation_id=?2,sale_id=?3,account_id=COALESCE(account_id,?4)
             WHERE source_type='customer_payment' AND source_entity_id=?5",
            params![
                car_id.to_string(),
                operation_id,
                sale_id,
                account_id,
                source_id
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn rebuild_customer_payment_profit_recognitions(db: &Connection) -> Result<(), String> {
    let existing_profit_ids: Vec<i64> = {
        let mut stmt = db
            .prepare(
                "SELECT id FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'customer_payment'
                   AND source_role = 'profit_recognition'
                   AND COALESCE(is_reversed, 0) = 0",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        rows
    };
    for tx_id in existing_profit_ids {
        append_partner_transaction_reversal_by_id(
            db,
            tx_id,
            "إعادة بناء الاعتراف بربح دفعات الزبائن",
        )?;
    }

    struct PaymentForProfit {
        id: i64,
        amount: Money,
        currency: String,
        date: String,
        payment_type: String,
        notes: String,
        car_number: String,
    }

    let payments: Vec<PaymentForProfit> = {
        let mut stmt = db
            .prepare(
                "SELECT id, amount, COALESCE(currency, 'IQD'), date,
                        COALESCE(payment_type, 'قاصه'), COALESCE(notes, ''),
                        COALESCE(related_source_id, '')
                 FROM partner_transactions
                 WHERE kind = 'زبون'
                   AND COALESCE(is_reversed, 0) = 0
                   AND related_source_type = 'car'
                   AND related_entity_id IS NOT NULL
                   AND (
                     source_type = 'customer_payment'
                     OR (source_type = 'customer_sale_payment' AND source_role = 'sale_down_payment')
                   )
                 ORDER BY date ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(PaymentForProfit {
                    id: row.get(0)?,
                    amount: row.get(1)?,
                    currency: row.get(2)?,
                    date: row.get(3)?,
                    payment_type: row.get(4)?,
                    notes: row.get(5)?,
                    car_number: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        rows
    };

    for payment in payments {
        create_customer_payment_profit_recognition(
            db,
            payment.id,
            payment.amount,
            &payment.currency,
            &payment.date,
            &payment.payment_type,
            &payment.notes,
            &payment.car_number,
        )?;
    }

    Ok(())
}

pub fn rebuild_customer_payment_profit_recognitions_for_car(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
    let existing_profit_ids: Vec<i64> = {
        let mut stmt = db
            .prepare(
                "SELECT id FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'customer_payment'
                   AND source_role = 'profit_recognition'
                   AND related_source_type = 'car'
                   AND related_entity_id = ?1
                   AND COALESCE(is_reversed, 0) = 0",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([car_number], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        rows
    };
    for tx_id in existing_profit_ids {
        append_partner_transaction_reversal_by_id(db, tx_id, "إعادة بناء الاعتراف بربح السيارة")?;
    }

    struct PaymentForProfit {
        id: i64,
        amount: Money,
        currency: String,
        date: String,
        payment_type: String,
        notes: String,
    }

    let payments: Vec<PaymentForProfit> = {
        let mut stmt = db
            .prepare(
                "SELECT id, amount, COALESCE(currency, 'IQD'), date,
                        COALESCE(payment_type, 'قاصه'), COALESCE(notes, '')
                 FROM partner_transactions
                 WHERE kind = 'زبون'
                   AND COALESCE(is_reversed, 0) = 0
                   AND related_source_type = 'car'
                   AND related_entity_id = ?1
                   AND (
                     source_type = 'customer_payment'
                     OR (source_type = 'customer_sale_payment' AND source_role = 'sale_down_payment')
                   )
                 ORDER BY date ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([car_number], |row| {
                Ok(PaymentForProfit {
                    id: row.get(0)?,
                    amount: row.get(1)?,
                    currency: row.get(2)?,
                    date: row.get(3)?,
                    payment_type: row.get(4)?,
                    notes: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        rows
    };

    for payment in payments {
        create_customer_payment_profit_recognition(
            db,
            payment.id,
            payment.amount,
            &payment.currency,
            &payment.date,
            &payment.payment_type,
            &payment.notes,
            car_number,
        )?;
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn apply_partner_transaction_splits(
    db: &Connection,
    tx_id: i64,
    partner_name: &str,
    kind: &str,
    type_: &str,
    amount: Money,
    date: &str,
    notes: Option<&str>,
    currency: &str,
    payment_type: &str,
) -> Result<(), String> {
    if amount <= Money::zero() {
        return Ok(());
    }

    // Safety guard: never apply partner splits for car purchase generated rows
    let source_type: Option<String> = db
        .query_row(
            "SELECT source_type FROM partner_transactions WHERE id = ?1",
            params![tx_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    if source_type.as_deref() == Some("car_purchase") {
        return Ok(());
    }

    // Audit fix #3: partner-cash deductions generated for funder/company settlements
    // must never be duplicated. Skip re-creation when active split rows already
    // exist for the same source (edits first delete the old splits explicitly).
    let partner_split_exists = |split_source_type: &str| -> Result<bool, String> {
        db.query_row(
            "SELECT COUNT(*) > 0 FROM partner_transactions
             WHERE source_type = ?1 AND source_entity_id = ?2
               AND source_role = 'partner_cash_payment' AND kind = 'شريك'
               AND COALESCE(is_reversed, 0) = 0",
            params![split_source_type, tx_id.to_string()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    };

    // === 2. Company Cash Withdrawal (سحب شركة) ===
    // Audit fix #15: prefer the explicit type ("سحب نقدي") over free-text notes.
    // The notes marker is kept only for backward compatibility with rows created
    // before the type-based flag existed.
    let is_company_cash_withdrawal = kind == "شركة"
        && type_.starts_with("سحب")
        && (type_.contains("نقدي") || notes.unwrap_or("").contains("سحب نقدي"));
    if is_company_cash_withdrawal && !partner_split_exists("company_payment")? {
        let partner_note = format!("تسديد شركة: {} ({})", partner_name, tx_id);
        deduct_from_partners_5050_with_effects(
            db,
            amount,
            currency,
            date,
            "قاصه",
            "سحب تسديد",
            &partner_note,
            "company_payment",
            &tx_id.to_string(),
            "partner_cash_payment",
            true,
            true,
            false,
        )?;
    }

    // === 3. Funder Deposit (تمويل ممول) — Phase 15: Do NOT deduct from partners ===
    // Financing means the funder provided financing, not that partners paid.
    // Funder records do not affect Qasa/Cash.

    // === 4. Funder Repayment (سحب ممول) ===
    let is_financier_repayment = kind == "ممول" && type_.starts_with("سحب");
    if is_financier_repayment {
        if !partner_split_exists("funder_payment")? {
            let partner_note = format!("تسديد ممول: {} ({})", partner_name, tx_id);
            deduct_from_partners_5050_with_effects(
                db,
                amount,
                currency,
                date,
                "قاصه",
                "سحب تسديد",
                &partner_note,
                "funder_payment",
                &tx_id.to_string(),
                "partner_cash_payment",
                true,
                true,
                false,
            )?;
        }
        distribute_financier_repayment_to_partners(
            db,
            partner_name,
            amount,
            date,
            currency,
            notes,
            tx_id,
        )?;
    }

    // === 5. Customer Payments (دفعات الزبائن) — Two separate effects ===
    // Bug 9 (N4): "سحب" type transactions on customers must also flow through
    // `create_customer_payment_accounting_effects`, but with reversed cash
    // direction (deduct from partners rather than deposit).
    let is_customer_payment = kind == "زبون"
        && (type_.starts_with("ايداع")
            || type_.starts_with("إيداع")
            || type_.starts_with("مقدمة")
            || type_.starts_with("استلام")
            || type_.starts_with("إستلام")
            || type_.starts_with("تسديد")
            || type_.starts_with("سحب"));
    if is_customer_payment {
        let notes_str = notes.unwrap_or("");
        create_customer_payment_accounting_effects(
            db,
            tx_id,
            amount,
            currency,
            date,
            payment_type,
            notes_str,
        )?;
    }

    Ok(())
}

pub fn parse_financier_commission(amount: Money, notes: Option<&str>) -> Result<Money, String> {
    let Some(notes) = notes else {
        return Ok(Money::zero());
    };
    let Some(raw_commission) = notes.split("عمولة:").nth(1) else {
        return Ok(Money::zero());
    };
    let raw_commission = raw_commission.trim();
    if raw_commission.contains('%') {
        let percent_str = raw_commission.split('%').next().unwrap_or("").trim();
        let clean: String = percent_str
            .chars()
            .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == '+')
            .collect();
        if clean.is_empty()
            || clean == "."
            || clean == "-"
            || clean == "+"
            || clean == "-."
            || clean == "+."
        {
            return Err("صيغة عمولة الممول غير صحيحة".to_string());
        }
        let percent = clean
            .parse::<Money>()
            .map_err(|_| "صيغة عمولة الممول غير صحيحة".to_string())?;
        // Audit fix #14: reject negative commission values explicitly.
        if percent < Money::zero() {
            return Err("عمولة الممول لا يمكن أن تكون سالبة".to_string());
        }
        return Ok((amount * percent) / Money(dec!(100)));
    }
    let clean: String = raw_commission
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == '+')
        .collect();
    if clean.is_empty()
        || clean == "."
        || clean == "-"
        || clean == "+"
        || clean == "-."
        || clean == "+."
    {
        return Err("صيغة عمولة الممول غير صحيحة".to_string());
    }
    let parsed = clean
        .parse::<Money>()
        .map_err(|_| "صيغة عمولة الممول غير صحيحة".to_string())?;
    // Audit fix #14: reject negative commission values explicitly.
    if parsed < Money::zero() {
        return Err("عمولة الممول لا يمكن أن تكون سالبة".to_string());
    }
    Ok(parsed)
}

pub fn find_financier_commission_expense_id(
    db: &Connection,
    tx_id: i64,
) -> Result<Option<i64>, String> {
    let source_id = tx_id.to_string();
    let by_source = db.query_row(
        "SELECT id FROM expenses
         WHERE source_type = 'funder_commission'
           AND source_id = ?1
           AND source_role = 'commission_expense'
         LIMIT 1",
        [&source_id],
        |row| row.get::<_, i64>(0),
    );
    match by_source {
        Ok(id) => return Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => {}
        Err(e) => return Err(e.to_string()),
    }

    let movement_note = format!("%رقم الحركة: {}%", tx_id);
    let legacy_note = format!("%({})%", tx_id);
    let legacy_id = db.query_row(
        "SELECT id FROM expenses
         WHERE description = 'عمولة تسديد تمويل'
           AND (notes LIKE ?1 OR notes LIKE ?2)
         LIMIT 1",
        params![movement_note, legacy_note],
        |row| row.get::<_, i64>(0),
    );
    match legacy_id {
        Ok(id) => {
            db.execute(
                "UPDATE expenses
                 SET source_type = 'funder_commission',
                     source_id = ?1,
                     source_role = 'commission_expense'
                 WHERE id = ?2",
                params![source_id, id],
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(id))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn insert_financier_commission_expense(
    db: &Connection,
    financier_name: &str,
    amount: Money,
    date: &str,
    time: &str,
    currency: &str,
    tx_id: i64,
) -> Result<i64, String> {
    let operation_id = new_ledger_token("funder-commission");
    db.execute(
        "INSERT INTO operations(id,operation_type,status)
         VALUES (?1,'funder_commission_expense','active')",
        [&operation_id],
    )
    .map_err(|e| e.to_string())?;
    let expense_notes = format!(
        "عمولة تسديد الممول {} (رقم الحركة: {})",
        financier_name.trim(),
        tx_id
    );
    db.execute(
        "INSERT INTO expenses (
            description, amount, date, time, notes, currency, car_number,
            source_type, source_id, source_role, operation_id
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 'funder_commission', ?7, 'commission_expense', ?8)",
        params![
            "عمولة تسديد تمويل".to_string(),
            amount,
            date.trim(),
            time.trim(),
            Some(expense_notes),
            currency.trim(),
            tx_id.to_string(),
            operation_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn preview_installment_payment_redistribution(
    state: State<AppState>,
    installment_id: i64,
    actual_paid_amount: Money,
    currency: Option<String>,
) -> Result<InstallmentPaymentPreview, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    calculate_installment_payment_preview(
        &db,
        installment_id,
        actual_paid_amount,
        currency.as_deref(),
    )
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn pay_customer_installment(
    state: State<AppState>,
    installment_id: i64,
    customer_name: String,
    actual_paid_amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
    creation_token: Option<String>,
    session_token: String,
) -> Result<(), String> {
    // FORENSIC FIX (re-audit 2026-07-11, IDEMPOTENCY-2 + AUDIT-TRAIL-2):
    // Backfill the same idempotency + audit-trail guarantees as the other
    // write commands. §31.2/§31.5 — every mutation must accept a creation_token
    // and emit an audit_log row tying the mutation to the actor + session.
    validate_required_text(&customer_name, "اسم الزبون")?;
    validate_positive_amount(actual_paid_amount, "المبلغ المدفوع")?;
    validate_required_text(&date, "التاريخ")?;
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency)?;
    let payment_type = payment_type.unwrap_or_else(|| "قاصه".to_string());

    let creation_token = creation_token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());

    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    ensure_accounting_period_open(&db, &date)?;

    // Idempotent retry: if a partner_transactions row with this creation_token
    // already exists, treat as success (the user is retrying a double-click).
    if let Some(token) = creation_token.as_deref() {
        let already_paid: bool = db
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM partner_transactions
                    WHERE source_type = 'customer_payment'
                      AND creation_token = ?1
                )",
                [token],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if already_paid {
            append_audit_event(
                &db,
                actor_user_id,
                "installment",
                Some(installment_id),
                "pay_customer_installment.idempotent_retry",
                Some(&session_token),
                Some(token),
            )?;
            db.commit().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    pay_customer_installment_core(
        &db,
        installment_id,
        customer_name.trim(),
        actual_paid_amount,
        date.trim(),
        notes.as_deref(),
        &currency,
        &payment_type,
    )?;
    if let Some(token) = creation_token.as_deref() {
        db.execute(
            "UPDATE partner_transactions SET creation_token=?1
             WHERE id=(SELECT MAX(id) FROM partner_transactions
                       WHERE source_type='customer_payment' AND date=?2)",
            params![token, date.trim()],
        )
        .map_err(|e| e.to_string())?;
        db.execute(
            "UPDATE operations SET creation_token=?1
             WHERE id=(SELECT operation_id FROM partner_transactions
                       WHERE creation_token=?1 LIMIT 1)",
            [token],
        )
        .map_err(|e| e.to_string())?;
    }

    // Audit-trail: record who paid which installment and when.
    append_audit_event(
        &db,
        actor_user_id,
        "installment",
        Some(installment_id),
        "pay_customer_installment",
        Some(&session_token),
        creation_token.as_deref(),
    )?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reverse_customer_installment_payment(
    state: State<AppState>,
    installment_id: i64,
    session_token: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    let (reversal_date, _) = now_datetime();
    ensure_accounting_period_open(&db, &reversal_date)?;
    let reversal_operation_id = reverse_customer_installment_payment_core(&db, installment_id)?;
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "installment",
        Some(installment_id),
        "reverse_customer_installment_payment",
        Some(&session_token),
        None,
        AuditEventDetails {
            operation_id: Some(&reversal_operation_id),
            reason: Some("عكس دفعة قسط زبون"),
            ..Default::default()
        },
    )?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn recalculate_installment_schedule(
    state: State<AppState>,
    car_number: String,
    session_token: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    recalculate_installment_schedule_for_car(&db, car_number.trim())?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_customer_installments(
    state: State<AppState>,
    customer_name: String,
    car_number: Option<String>,
) -> Result<Vec<CustomerInstallment>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let car_filter = car_number.unwrap_or_default();
    let mut sql = "SELECT pt.id, pt.partner_name, pt.source_id, COALESCE(pt.due_date, pt.date),
                          COALESCE(pt.currency, 'IQD'), COALESCE(pt.original_amount, pt.amount),
                          COALESCE(pt.current_amount, pt.amount), pt.actual_paid_amount, pt.type,
                          pt.paid_event_id, pt.notes, i.version
                   FROM partner_transactions pt
                   JOIN installments i ON i.legacy_transaction_id=pt.id
                   WHERE pt.kind = 'زبون'
                     AND pt.partner_name = ?1
                     AND pt.source_type = 'customer_installment_schedule'
                     AND pt.source_role = 'installment_schedule'
                     AND COALESCE(pt.is_reversed, 0) = 0"
        .to_string();
    if !car_filter.trim().is_empty() {
        sql.push_str(" AND source_id LIKE ?2");
    }
    sql.push_str(" ORDER BY COALESCE(due_date, date), id");

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = if car_filter.trim().is_empty() {
        stmt.query_map([customer_name.trim()], |row| {
            let source_id: String = row.get(2)?;
            let status_type: String = row.get(8)?;
            Ok(CustomerInstallment {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                sale_id: source_id.split(':').next().unwrap_or("").to_string(),
                due_date: row.get(3)?,
                currency: row.get(4)?,
                original_amount: row.get(5)?,
                current_amount: row.get(6)?,
                actual_paid_amount: row.get(7)?,
                status: if status_type.starts_with("واصل") {
                    "واصل"
                } else {
                    "باقي"
                }
                .to_string(),
                paid_event_id: row.get(9)?,
                notes: row.get(10)?,
                version: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    } else {
        stmt.query_map(
            params![customer_name.trim(), format!("{}:%", car_filter.trim())],
            |row| {
                let source_id: String = row.get(2)?;
                let status_type: String = row.get(8)?;
                Ok(CustomerInstallment {
                    id: row.get(0)?,
                    customer_id: row.get(1)?,
                    sale_id: source_id.split(':').next().unwrap_or("").to_string(),
                    due_date: row.get(3)?,
                    currency: row.get(4)?,
                    original_amount: row.get(5)?,
                    current_amount: row.get(6)?,
                    actual_paid_amount: row.get(7)?,
                    status: if status_type.starts_with("واصل") {
                        "واصل"
                    } else {
                        "باقي"
                    }
                    .to_string(),
                    paid_event_id: row.get(9)?,
                    notes: row.get(10)?,
                    version: row.get(11)?,
                })
            },
        )
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    };
    Ok(rows)
}

/// Backward-compatible wrapper for the old UI command name.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn set_customer_installment_status(
    state: State<AppState>,
    installment_id: i64,
    partner_name: String,
    kind: String,
    paid: bool,
    amount: Money,
    date: String,
    _notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
    expected_version: i64,
    session_token: String,
) -> Result<(), String> {
    if kind != "زبون" {
        return Err("نوع الحساب يجب أن يكون زبون".to_string());
    }
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    let payment_type = payment_type.unwrap_or_else(|| "قاصه".to_string());
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    let schedule_id = resolve_installment_schedule_id(&db, installment_id)?;
    let numeric_installment_id: i64 = db
        .query_row(
            "SELECT id FROM installments WHERE legacy_transaction_id=?1 AND version=?2",
            params![schedule_id, expected_version],
            |row| row.get(0),
        )
        .map_err(|_| "تعارض نسخة القسط — أعد تحميل البيانات".to_string())?;
    let locked = db
        .execute(
            "UPDATE installments SET version=version+1,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?1 AND version=?2",
            params![numeric_installment_id, expected_version],
        )
        .map_err(|e| e.to_string())?;
    if locked != 1 {
        return Err("تعارض نسخة القسط أثناء الحفظ".to_string());
    }
    if paid {
        pay_customer_installment_core(
            &db,
            installment_id,
            partner_name.trim(),
            amount,
            date.trim(),
            _notes.as_deref(),
            &currency,
            &payment_type,
        )?;
    } else {
        reverse_customer_installment_payment_core(&db, installment_id)?;
    }
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_agency_receivable_status_core(
    db: &Connection,
    transaction_id: i64,
    paid: bool,
) -> Result<(), String> {
    let agency_id_raw: String = match db.query_row(
        "SELECT COALESCE(source_id, '')
         FROM partner_transactions
         WHERE id = ?1
           AND kind = 'وكالة'
           AND source_type = 'agency'
           AND source_role = 'agency_receivable'",
        [transaction_id],
        |row| row.get(0),
    ) {
        Ok(value) => value,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err("تعذر العثور على مديونية الوكالة المرتبطة بهذه الحركة".to_string());
        }
        Err(e) => return Err(e.to_string()),
    };

    let agency_id = agency_id_raw
        .trim()
        .parse::<i64>()
        .map_err(|_| "تعذر تحديد الوكالة المرتبطة بهذه الحركة".to_string())?;
    let payment_status = if paid { "واصل" } else { "غير واصل" };
    let updated = db
        .execute(
            "UPDATE agencies SET payment_status = ?1 WHERE id = ?2",
            params![payment_status, agency_id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("تعذر العثور على الوكالة المرتبطة بهذه الحركة".to_string());
    }

    record_agency_ledger_entries(db, agency_id)?;
    rebuild_agency_partner_entries(db, agency_id)?;
    recalculate_all_partners(db)?;
    Ok(())
}

#[tauri::command]
pub fn set_agency_receivable_status(
    state: State<AppState>,
    transaction_id: i64,
    paid: bool,
    session_token: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;
    set_agency_receivable_status_core(&db, transaction_id, paid)?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn pay_financier_from_partners(
    state: State<AppState>,
    financier_name: String,
    financier_kind: String,
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    commission_amount: Option<Money>,
    commission_currency: Option<String>,
    commission_notes: Option<String>,
    creation_token: Option<String>,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&financier_name, "اسم الممول")?;
    validate_required_text(&financier_kind, "نوع الممول")?;
    validate_positive_amount(amount, "مبلغ التسديد")?;
    validate_required_text(&date, "التاريخ")?;
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency)?;
    let commission_amount = commission_amount.unwrap_or(Money::zero());
    // Audit fix #14: a negative commission is a data-entry error, not "no commission".
    validate_non_negative_amount(commission_amount, "العمولة")?;
    if commission_amount > Money::zero() {
        validate_positive_amount(commission_amount, "العمولة")?;
    }

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;

    let creation_token = creation_token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    let idempotency_payload = serde_json::json!({
        "financier_name": financier_name.trim(),
        "financier_kind": financier_kind.trim(),
        "amount": amount,
        "date": date.trim(),
        "notes": notes.as_deref().map(str::trim),
        "currency": currency,
        "commission_amount": commission_amount,
        "commission_currency": commission_currency.as_deref(),
        "commission_notes": commission_notes.as_deref().map(str::trim),
    });
    if let IdempotencyClaim::Replay(_) = claim_idempotent_creation(
        &db,
        creation_token.as_deref(),
        "pay_financier_from_partners",
        &idempotency_payload,
    )? {
        append_audit_event(
            &db,
            actor_user_id,
            "partner_transaction",
            None,
            "pay_financier_from_partners.idempotent_retry",
            Some(&session_token),
            creation_token.as_deref(),
        )?;
        db.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }
    if creation_token.is_none() {
        // 5-second duplicate detection (no-token case) — §31.5 spirit.
        let recent_dup: bool = db
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM partner_transactions
                    WHERE partner_name = ?1
                      AND kind = ?2
                      AND type = 'سحب'
                      AND amount = ?3
                      AND date = ?4
                      AND creation_token IS NULL
                      AND julianday('now') - julianday(date || ' ' || COALESCE(time, '00:00')) < 0.00006
                )",
                params![
                    financier_name.trim(),
                    financier_kind.trim(),
                    amount,
                    date.trim()
                ],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if recent_dup {
            return Ok(()); // Double-click — silently absorb.
        }
    }

    let financier_name = financier_name.trim();
    let financier_kind = financier_kind.trim();
    let date = date.trim();

    let financier_tx_type = "سحب";
    let financier_account_id = partner_account_id(&db, financier_name, financier_kind)?;
    let operation_id = new_ledger_token("funder_repayment");
    db.execute(
        "INSERT INTO operations(id,operation_type,status,actor_user_id,creation_token)
         VALUES (?1,'funder_repayment','active',?2,?3)",
        params![operation_id, actor_user_id, creation_token.as_deref()],
    )
    .map_err(|e| format!("تعذر إنشاء عملية تسديد الممول: {e}"))?;

    let time_str = Local::now().format("%H:%M").to_string();

    let (src_type, src_role, aq, apc, apr) = match financier_kind {
        "مستثمر" => ("investor_transaction", "account_movement", 1, 0, 0),
        "شركة" => ("company_transaction", "repayment_account_movement", 0, 0, 0),
        _ => ("funder_transaction", "repayment_account_movement", 0, 0, 0),
    };

    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_role, affects_qasa, affects_partner_cash, affects_profit,
            creation_token,account_id,operation_id
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'قاصه', ?9, ?10, ?11, ?12, ?13, ?14,?15,?16)",
        params![
            financier_name,
            financier_kind,
            financier_tx_type,
            amount,
            date,
            &time_str,
            notes.as_deref(),
            currency.as_str(),
            src_type,
            src_role,
            aq,
            apc,
            apr,
            creation_token.as_deref(),
            financier_account_id,
            &operation_id,
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
        params![&operation_id, financier_account_id, tx_id],
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, financier_name, financier_kind)?;

    // For investors, the transaction itself handles Qasa — no partner split needed
    if financier_kind != "مستثمر" {
        let account_label = match financier_kind {
            "شركة" => "الشركة",
            _ => "الممول",
        };
        let partner_note = format!("سحب لتسديد {} {}", account_label, financier_name);
        let source_type = match financier_kind {
            "شركة" => "company_payment",
            _ => "funder_payment",
        };
        deduct_from_partners_5050_with_effects(
            &db,
            amount,
            &currency,
            date,
            "قاصه",
            "سحب تسديد",
            &partner_note,
            source_type,
            &tx_id.to_string(),
            "partner_cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    }

    if commission_amount > Money::zero() {
        let commission_currency = commission_currency.unwrap_or_else(|| "IQD".to_string());
        let exp_id = insert_financier_commission_expense(
            &db,
            financier_name,
            commission_amount,
            date,
            &time_str,
            &commission_currency,
            tx_id,
        )?;

        record_ledger_entry(
            &db,
            date,
            &time_str,
            "expense",
            Some("عمولة تسديد تمويل"),
            commission_amount,
            Money::zero(),
            &commission_currency,
            "expense",
            &exp_id.to_string(),
            "مصروف عام",
            &format!(
                "عمولة تسديد الممول {} (رقم الحركة: {})",
                financier_name, tx_id
            ),
            None,
        )?;

        record_ledger_entry(
            &db,
            date,
            &time_str,
            "cash",
            Some("قاصه"),
            Money::zero(),
            commission_amount,
            &commission_currency,
            "expense",
            &exp_id.to_string(),
            "دفع مصروف",
            &format!("دفع مصروف: عمولة تسديد الممول {}", financier_name),
            None,
        )?;

        let commission_partner_note = format!("سحب مصروف عمولة تسديد الممول {}", financier_name);
        // Task 6: Use source-aware helper for commission expense
        deduct_from_partners_5050_with_effects(
            &db,
            commission_amount,
            &commission_currency,
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

    // FORENSIC FIX (re-audit 2026-07-11, AUDIT-TRAIL-3):
    // Audit-trail the financier payment — record actor, command, session, and
    // creation_token so the mutation can be traced back to its originator.
    append_audit_event(
        &db,
        actor_user_id,
        "partner_transaction",
        None,
        "pay_financier_from_partners",
        Some(&session_token),
        creation_token.as_deref(),
    )?;
    complete_idempotent_creation(&db, creation_token.as_deref(), &tx_id.to_string())?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn find_car_number_for_transaction(db: &Connection, tx_id: i64) -> Option<String> {
    if let Ok((rel_type, rel_id)) = db.query_row(
        "SELECT COALESCE(related_source_type, ''), COALESCE(related_source_id, '') FROM partner_transactions WHERE id = ?1",
        [tx_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    ) {
        if rel_type == "car" && !rel_id.is_empty() {
            return Some(rel_id);
        }
        if rel_type == "installment" && !rel_id.is_empty() {
            if let Ok(inst_id) = rel_id.parse::<i64>() {
                if let Ok((inst_rel_type, inst_rel_id)) = db.query_row(
                    "SELECT COALESCE(related_source_type, ''), COALESCE(related_source_id, '') FROM partner_transactions WHERE id = ?1",
                    [inst_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                ) {
                    if inst_rel_type == "car" && !inst_rel_id.is_empty() {
                        return Some(inst_rel_id);
                    }
                }
            }
        }
    }
    None
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_partner_transaction(
    state: State<AppState>,
    id: i64,
    partner_name: String,
    kind: String,
    type_: String,
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
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
    let curr_val = currency.as_deref().unwrap_or("IQD");
    validate_currency(curr_val)?;

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, _actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;

    let pre_car_number = find_car_number_for_transaction(&db, id);

    // Audit fix #7/#20: refuse to edit generated 50/50 split rows directly.
    let (existing_name, existing_kind, existing_source_type, existing_source_role): (
        String,
        String,
        String,
        String,
    ) = db
        .query_row(
            "SELECT partner_name,kind,COALESCE(source_type,''),COALESCE(source_role,'')
             FROM partner_transactions WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "الحركة غير موجودة".to_string())?;
    if existing_name != partner_name.trim() || existing_kind != kind.trim() {
        return Err("بيانات الحساب لا تطابق الحركة الأصلية".to_string());
    }
    if is_generated_partner_split(&existing_kind, &existing_source_type, &existing_source_role) {
        return Err(
            "لا يمكن تعديل حركة مولّدة تلقائياً من حركة أصلية؛ عدّل الحركة الأصلية بدلاً من ذلك"
                .to_string(),
        );
    }

    // 1. Reverse old ledger entries for this partner transaction
    reverse_ledger_entries(&db, "partner_transaction", &id.to_string())?;

    delete_customer_payment_partner_splits(&db, id)?;
    delete_customer_payment_profit_splits(&db, id)?;

    // Audit fix #3: also remove generated funder/company settlement deductions and
    // the commission expense linked to this transaction, so re-applying splits below
    // rebuilds them exactly once (no duplicates, no orphans).
    delete_partner_transactions_by_source_with_ledger(
        &db,
        "funder_payment",
        &id.to_string(),
        Some("partner_cash_payment"),
    )?;
    delete_partner_transactions_by_source_with_ledger(
        &db,
        "company_payment",
        &id.to_string(),
        Some("partner_cash_payment"),
    )?;
    if let Some(exp_id) = find_financier_commission_expense_id(&db, id)? {
        append_expense_reversal(&db, exp_id, "إعادة بناء عمولة الممول بعد تعديل حركة الشريك")?;
    }

    // Clean up linked split transactions using source fields instead of notes LIKE
    let linked_ids: Vec<i64> = {
        let original_st: Option<String> = db
            .query_row(
                "SELECT source_type FROM partner_transactions WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        if let Some(ref st) = original_st {
            let mut stmt = db
            .prepare("SELECT id FROM partner_transactions WHERE source_type = ?1 AND source_entity_id = ?2 AND id != ?3")
                .map_err(|e| e.to_string())?;
            let ids: Vec<i64> = stmt
                .query_map(params![st, id.to_string(), id], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            drop(stmt);
            ids
        } else {
            Vec::new()
        }
    };

    for lid in &linked_ids {
        append_partner_transaction_reversal_by_id(&db, *lid, "تعديل الحركة المصدرية")?;
    }

    let time_str = Local::now().format("%H:%M").to_string();

    db.execute(
        "UPDATE partner_transactions
         SET type = ?1, amount = ?2, date = ?3, time = ?4, notes = ?5, currency = ?6, payment_type = ?7
         WHERE id = ?8",
        (
            type_.trim(),
            amount,
            date.trim(),
            &time_str,
            notes.as_deref(),
            currency.as_deref(),
            payment_type.as_deref(),
            id,
        ),
    )
    .map_err(|e| e.to_string())?;

    // Issue 3 + Audit fix #7: recalculate classification ONLY for manually
    // classifiable rows. Rows that carry a generated source (customer payments,
    // schedule rows, sale down payments, ...) keep their source fields and
    // affects_* flags so the source linkage is never destroyed by an edit.
    if is_reclassifiable_source_type(&existing_source_type) {
        let classification = classify_partner_transaction(kind.trim(), type_.trim(), id);
        db.execute(
            "UPDATE partner_transactions SET source_type = ?1, source_id = ?2, source_role = ?3, affects_qasa = ?4, affects_partner_cash = ?5, affects_profit = ?6 WHERE id = ?7",
            params![classification.source_type, classification.source_id, classification.source_role, classification.affects_qasa, classification.affects_partner_cash, classification.affects_profit, id],
        ).map_err(|e| e.to_string())?;
    }

    // Write new ledger entries
    record_partner_ledger_entries(&db, id)?;

    // Apply splits
    let curr = currency.as_deref().unwrap_or("IQD");
    apply_partner_transaction_splits(
        &db,
        id,
        partner_name.trim(),
        kind.trim(),
        type_.trim(),
        amount,
        date.trim(),
        notes.as_deref(),
        curr,
        payment_type.as_deref().unwrap_or("قاصه"),
    )?;

    // Audit fix #3: the commission expense lifecycle is now handled in exactly one
    // place. The pre-cleanup above removed any existing commission expense (with its
    // ledger entries and partner deduction rows), and apply_partner_transaction_splits
    // -> distribute_financier_repayment_to_partners recreated it idempotently when the
    // updated transaction is still a financier repayment carrying a commission.

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    if let Some(ref cn) = pre_car_number {
        rebuild_installment_schedule(&db, cn)?;
    }
    if let Some(ref cn) = find_car_number_for_transaction(&db, id) {
        if Some(cn) != pre_car_number.as_ref() {
            rebuild_installment_schedule(&db, cn)?;
        }
    }

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_partner_transaction(
    state: State<AppState>,
    id: i64,
    partner_name: String,
    kind: String,
    session_token: String,
) -> Result<(), String> {
    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let (db, actor_user_id) = begin_admin_transaction(&mut db_guard, &session_token)?;

    let pre_car_number = find_car_number_for_transaction(&db, id);

    // Audit fix #7/#20: refuse to delete a single generated 50/50 split row directly.
    let existing_row: Option<(String, String, String, String, String, Option<String>)> = db
        .query_row(
            "SELECT partner_name,kind,COALESCE(source_type,''),COALESCE(source_id,''),
                    COALESCE(source_role,''),operation_id
             FROM partner_transactions WHERE id = ?1",
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
        .optional()
        .map_err(|e| e.to_string())?;
    if existing_row.is_none() {
        return Err("الحركة غير موجودة".to_string());
    }
    if let Some((ref stored_name, ref k, ref st, _, ref sr, _)) = existing_row {
        if stored_name != partner_name.trim() || k != kind.trim() {
            return Err("بيانات الحساب لا تطابق الحركة الأصلية".to_string());
        }
        if is_generated_partner_split(k, st, sr) {
            return Err(
                "لا يمكن حذف حركة مولّدة تلقائياً من حركة أصلية؛ احذف الحركة الأصلية بدلاً من ذلك"
                    .to_string(),
            );
        }
    }

    // Determine the source_type of the original transaction to find linked rows properly
    let original_source_type: Option<String> = existing_row
        .as_ref()
        .map(|(_, _, st, _, _, _)| st.clone())
        .filter(|st| !st.is_empty());
    let (_, _, source_type, source_id, source_role, original_operation_id) =
        existing_row.as_ref().expect("checked above");
    if source_type.is_empty() || source_id.is_empty() || source_role.is_empty() {
        return Err("رفض عكس حركة بلا هوية مصدر رقمية مكتملة".to_string());
    }
    let (reversal_date, reversal_time) = now_datetime();
    ensure_accounting_period_open(&db, &reversal_date)?;
    let reversal_operation_id = new_ledger_token("partner_transaction_reversal");
    db.execute(
        "INSERT INTO operations
         (id,operation_type,status,reverses_operation_id,actor_user_id,created_at)
         VALUES (?1,'partner_transaction_reversal','active',?2,?3,
                 strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        params![reversal_operation_id, original_operation_id, actor_user_id],
    )
    .map_err(|e| format!("تعذر إنشاء عملية عكس الحركة: {e}"))?;

    // Delete corresponding commission expense if it exists
    // Audit fix #3: also remove the partner deduction rows generated for the
    // commission expense, so they never remain as orphans reducing partner cash.
    if let Some(exp_id) = find_financier_commission_expense_id(&db, id)? {
        let (description, amount, notes, currency, expense_version): (
            String,
            Money,
            Option<String>,
            String,
            i64,
        ) = db
            .query_row(
                "SELECT description,amount,notes,COALESCE(currency,'IQD'),version
                 FROM expenses WHERE id=?1 AND COALESCE(is_reversed,0)=0",
                [exp_id],
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
            .map_err(|e| e.to_string())?;
        append_partner_transaction_reversals_by_source(
            &db,
            "expense",
            &exp_id.to_string(),
            "cash_payment",
            &reversal_operation_id,
        )?;
        reverse_ledger_entries(&db, "expense", &exp_id.to_string())?;
        db.execute(
            "INSERT INTO expenses
             (description,amount,date,time,notes,currency,operation_id,reverses_expense_id,version)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1)",
            params![
                format!("عكس: {description}"),
                -amount,
                reversal_date,
                reversal_time,
                notes.as_deref().map(|value| format!("عكس: {value}")),
                currency,
                reversal_operation_id,
                exp_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        db.execute(
            "UPDATE expenses
             SET is_reversed=1,reversal_operation_id=?1,version=version+1
             WHERE id=?2 AND version=?3 AND COALESCE(is_reversed,0)=0",
            params![reversal_operation_id, exp_id, expense_version],
        )
        .map_err(|e| e.to_string())?;
    }

    // Audit fix #3: remove generated funder/company settlement deductions tied to
    // this transaction (they carry a different source_type than the original row,
    // so the generic linked-row cleanup below cannot find them).
    append_partner_transaction_reversals_by_source(
        &db,
        "funder_payment",
        &id.to_string(),
        "partner_cash_payment",
        &reversal_operation_id,
    )?;
    append_partner_transaction_reversals_by_source(
        &db,
        "company_payment",
        &id.to_string(),
        "partner_cash_payment",
        &reversal_operation_id,
    )?;

    // Clean up linked split transactions using source fields instead of notes LIKE
    let linked_sources: Vec<(String, String, String)> = if let Some(ref st) = original_source_type {
        // Use source_type + source_id for safe matching
        let mut stmt = db
            .prepare(
                "SELECT DISTINCT source_type,source_id,source_role
                      FROM partner_transactions
                      WHERE source_type=?1 AND source_entity_id=?2 AND id<>?3",
            )
            .map_err(|e| e.to_string())?;
        let sources = stmt
            .query_map(params![st, id.to_string(), id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        sources
    } else {
        Vec::new()
    };

    for (linked_type, linked_id, linked_role) in linked_sources {
        append_partner_transaction_reversals_by_source(
            &db,
            &linked_type,
            &linked_id,
            &linked_role,
            &reversal_operation_id,
        )?;
    }

    for role in ["cash_movement", "profit_recognition"] {
        append_partner_transaction_reversals_by_source(
            &db,
            "customer_payment",
            &id.to_string(),
            role,
            &reversal_operation_id,
        )?;
    }
    let reversed_original = append_partner_transaction_reversals_by_source(
        &db,
        source_type,
        source_id,
        source_role,
        &reversal_operation_id,
    )?;
    if reversed_original == 0 {
        return Err("تعذر إنشاء عكس 1:1 للحركة الأصلية".to_string());
    }
    db.execute(
        "UPDATE financial_ledger SET operation_id=?1
         WHERE reverses_ledger_id IN (
             SELECT original.id FROM financial_ledger original
             WHERE original.reference_type='partner_transaction'
               AND EXISTS (SELECT 1 FROM partner_transactions reversal
                           WHERE reversal.operation_id=?1
                              AND reversal.reverses_transaction_id=original.reference_entity_id)
         )",
        [&reversal_operation_id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE operations
         SET status='reversed',reversed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             reversal_operation_id=?1 WHERE id=?2 AND status='active'",
        params![reversal_operation_id, original_operation_id],
    )
    .map_err(|e| e.to_string())?;
    append_audit_event_with_details(
        &db,
        actor_user_id,
        "partner_transaction",
        Some(id),
        "reverse_partner_transaction",
        Some(&session_token),
        None,
        AuditEventDetails {
            operation_id: Some(&reversal_operation_id),
            reason: Some("عكس حركة شريك"),
            ..Default::default()
        },
    )?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    if let Some(ref cn) = pre_car_number {
        rebuild_installment_schedule(&db, cn)?;
    }

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_partner_transactions(
    state: State<AppState>,
    partner_name: String,
    kind: String,
) -> Result<Vec<PartnerTransaction>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
             "SELECT pt.id, pt.partner_name, pt.kind, pt.type, pt.amount, pt.date, pt.notes, pt.currency,
                     COALESCE(pt.payment_type, 'قاصه'), COALESCE(pt.time, '00:00'),
                     pt.source_type, pt.source_id, pt.source_role,
                     COALESCE(pt.affects_qasa, 1), COALESCE(pt.affects_partner_cash, 1), COALESCE(pt.affects_profit, 0),
                     pt.related_source_type, pt.related_source_id,
                     pt.original_amount, pt.current_amount, pt.actual_paid_amount, pt.paid_event_id,
                     pt.due_date, pt.ledger_batch_id, COALESCE(pt.is_reversed, 0),i.version
              FROM partner_transactions pt
              LEFT JOIN installments i ON i.legacy_transaction_id=pt.id
              WHERE pt.partner_name = ?1 AND pt.kind = ?2
                AND COALESCE(pt.source_role, '') != 'profit_recognition'
                AND COALESCE(pt.is_reversed, 0) = 0
              ORDER BY pt.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let transactions = stmt
        .query_map([partner_name.trim(), kind.trim()], |row| {
            Ok(PartnerTransaction {
                id: row.get(0)?,
                partner_name: row.get(1)?,
                kind: row.get(2)?,
                type_: row.get(3)?,
                amount: row.get(4)?,
                date: row.get(5)?,
                notes: row.get(6)?,
                currency: row.get(7)?,
                payment_type: row.get(8)?,
                time: row.get(9)?,
                source_type: row.get(10)?,
                source_id: row.get(11)?,
                source_role: row.get(12)?,
                affects_qasa: row.get(13)?,
                affects_partner_cash: row.get(14)?,
                affects_profit: row.get(15)?,
                related_source_type: row.get(16)?,
                related_source_id: row.get(17)?,
                original_amount: row.get(18)?,
                current_amount: row.get(19)?,
                actual_paid_amount: row.get(20)?,
                paid_event_id: row.get(21)?,
                due_date: row.get(22)?,
                ledger_batch_id: row.get(23)?,
                is_reversed: row.get(24)?,
                installment_version: row.get(25)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(transactions)
}

#[tauri::command]
pub fn get_cash_register_entries(
    state: State<AppState>,
    payment_type: Option<String>,
) -> Result<Vec<CashRegisterEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    if let Some(pt) = &payment_type {
        if pt == "الكاش" || pt == "قاصه" || pt == "قاصة" {
            // Phase 3: Use affects_qasa / affects_partner_cash flags
            // Audit fix #9: the tab must select exactly the same rows the Qasa/Cash
            // cards aggregate, so both always show identical totals (acceptance
            // rules 28.1/28.2). Transfers are excluded by PREFIX to match the cards.
            let query = if pt == "الكاش" {
                "SELECT id, date, COALESCE(time, '00:00'), type, amount, partner_name, notes, COALESCE(currency, 'IQD'), kind
                  FROM partner_transactions
                  WHERE affects_partner_cash = 1 AND kind = 'شريك' AND type NOT LIKE 'تحويل%'
                  ORDER BY date ASC, time ASC, id ASC"
            } else {
                "SELECT id, date, COALESCE(time, '00:00'), type, amount, partner_name, notes, COALESCE(currency, 'IQD'), kind
                  FROM partner_transactions
                  WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر') AND type NOT LIKE 'تحويل%'
                  ORDER BY date ASC, time ASC, id ASC"
            };

            let mut stmt = db.prepare(query).map_err(|e| e.to_string())?;
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            let mut entries = Vec::new();
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                let id: i64 = row.get(0).map_err(|e| e.to_string())?;
                let date: String = row.get(1).map_err(|e| e.to_string())?;
                let time: String = row.get(2).map_err(|e| e.to_string())?;
                let tx_type: String = row.get(3).map_err(|e| e.to_string())?;
                let raw_amount: Money = row.get(4).map_err(|e| e.to_string())?;
                let partner_name: String = row.get(5).map_err(|e| e.to_string())?;
                let notes: Option<String> = row.get(6).map_err(|e| e.to_string())?;
                let currency: String = row.get(7).map_err(|e| e.to_string())?;
                let _kind: String = row.get(8).map_err(|e| e.to_string())?;

                let is_deposit = tx_type.starts_with("ايداع")
                    || tx_type.starts_with("إيداع")
                    || tx_type.starts_with("مقدمة")
                    || tx_type.starts_with("استلام")
                    || tx_type.starts_with("إستلام")
                    || tx_type.starts_with("إعادة استثمار")
                    || tx_type.starts_with("تسوية")
                    || tx_type.starts_with("تسديد");
                let is_withdrawal = tx_type.starts_with("سحب") || tx_type.starts_with("باقي");

                let amount = if is_deposit {
                    raw_amount
                } else if is_withdrawal {
                    -raw_amount
                } else {
                    // Audit fix #9: rows whose type matches no known deposit/withdrawal
                    // prefix are counted as ZERO by the Qasa/Cash card queries. Skip
                    // them here as well so the tab total always equals the card total.
                    continue;
                };

                // Phase 3: Show original transaction type for clear audit trail
                entries.push(CashRegisterEntry {
                    id,
                    date,
                    time,
                    type_: tx_type,
                    amount,
                    description: partner_name,
                    notes,
                    balance: Money::zero(),
                    currency,
                });
            }

            let mut iqd_running = Money::zero();
            let mut usd_running = Money::zero();
            for entry in entries.iter_mut() {
                if entry.currency == "USD" {
                    usd_running += entry.amount;
                    entry.balance = usd_running;
                } else {
                    iqd_running += entry.amount;
                    entry.balance = iqd_running;
                }
            }

            return Ok(entries);
        }
    }

    let mut query = "SELECT id, date, time, type_, (debit - credit) AS amount, description, notes, currency, account_id
                     FROM financial_ledger".to_string();

    let mut params: Vec<String> = Vec::new();

    if let Some(pt) = &payment_type {
        query.push_str(" WHERE account_type = 'cash'");
        if pt == "قاصه" || pt == "قاصة" {
            query.push_str(" AND (account_id = 'قاصه' OR account_id = 'قاصة' OR account_id IS NULL OR account_id = '')");
        } else {
            query.push_str(" AND account_id = ?1");
            params.push(pt.trim().to_string());
        }
    } else {
        query.push_str(" WHERE account_type != 'inventory'");
    }

    query.push_str(
        " AND type_ != 'تكلفة المبيعات'
          AND type_ NOT LIKE 'عكس: تكلفة المبيعات%'
          AND type_ NOT IN ('تعديل ايداع', 'تعديل إيداع', 'تعديل سحب', 'تعديل حركة')
          AND NOT (
            account_type = 'revenue'
            AND type_ = 'بيع سيارة'
            AND reference_type = 'car'
            AND EXISTS (
              SELECT 1 FROM cars
              WHERE cars.car_number = financial_ledger.reference_id
                AND COALESCE(cars.payment_type, 'كاش') = 'كاش'
            )
          )",
    );
    // Audit fix #24: order chronologically so the running balance is meaningful
    // even when entries are recorded with back-dated dates.
    query.push_str(" ORDER BY date ASC, time ASC, id ASC");

    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;

    let mut rows = if params.is_empty() {
        stmt.query([]).map_err(|e| e.to_string())?
    } else {
        stmt.query([&params[0]]).map_err(|e| e.to_string())?
    };

    let mut entries = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: i64 = row.get(0).map_err(|e| e.to_string())?;
        let date: String = row.get(1).map_err(|e| e.to_string())?;
        let time: String = row.get(2).map_err(|e| e.to_string())?;
        let type_: String = row.get(3).map_err(|e| e.to_string())?;
        let amount: Money = row.get(4).map_err(|e| e.to_string())?;
        let description: String = row.get(5).map_err(|e| e.to_string())?;
        let notes: Option<String> = row.get(6).map_err(|e| e.to_string())?;
        let currency: String = row.get(7).map_err(|e| e.to_string())?;

        entries.push(CashRegisterEntry {
            id,
            date,
            time,
            type_,
            amount,
            description,
            notes,
            balance: Money::zero(),
            currency,
        });
    }

    let mut iqd_running = Money::zero();
    let mut usd_running = Money::zero();
    for entry in entries.iter_mut() {
        if entry.currency == "USD" {
            usd_running += entry.amount;
            entry.balance = usd_running;
        } else {
            iqd_running += entry.amount;
            entry.balance = iqd_running;
        }
    }

    Ok(entries)
}

pub fn car_expense_partner_note(
    db: &Connection,
    car_number: &str,
    description: &str,
    expense_id: i64,
) -> String {
    let car_info: Option<(String, Option<String>)> = match db.query_row(
        "SELECT car_name, chassis_number FROM cars WHERE car_number = ?1",
        [car_number.trim()],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
    ) {
        Ok(value) => Some(value),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(error) => {
            eprintln!("[car-expense] failed to load car label for {car_number}: {error}");
            None
        }
    };

    let prefix = if let Some((car_name, chassis_number)) = car_info {
        let value = format!(
            "سحب مصروف سيارة {} {}",
            car_name.trim(),
            chassis_number.unwrap_or_default().trim()
        )
        .trim()
        .replace("  ", " ");
        if value == "سحب مصروف سيارة" {
            format!("سحب مصروف سيارة {}", car_number.trim())
        } else {
            value
        }
    } else {
        format!("سحب مصروف سيارة {}", car_number.trim())
    };

    format!(
        "{} - {} (رقم المصروف: {})",
        prefix,
        description.trim(),
        expense_id
    )
    .trim()
    .replace("  ", " ")
}

/// Rebuild sold-car accounting after cost change (expense add/delete).
/// - Enforces profit cap.
/// - Rebuilds sale ledger entries (COGS, receivable, deferred_revenue, revenue, inventory).
/// - For cash sales: rebuilds partner profit_recognition splits to reflect updated costs.
/// - For installment/due sales: rebuilds loss recognition and payment profit splits without touching customer payments.
pub fn rebuild_sold_car_accounting_after_cost_change(
    db: &Connection,
    car_id: i64,
    sale_id: i64,
) -> Result<(), String> {
    let car_info = db.query_row(
        "SELECT c.car_number,c.status,COALESCE(c.payment_type,'')
         FROM cars c JOIN car_sales s ON s.id=?2 AND s.car_id=c.id
         WHERE c.id=?1 AND c.active_sale_id=s.id AND s.status='active'",
        params![car_id, sale_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    );
    let (car_number, status, payment_type) = match car_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    if status != "مبيوعة" {
        return Ok(());
    }

    // 1. Rebuild sale ledger entries (COGS, receivable, deferred_revenue, revenue, inventory credit)
    delete_car_sale_ledger_entries(db, &car_number)?;
    record_car_sale_ledger_entries(db, car_id)?;

    // 3. For cash sales: rebuild car_sale cash_movement only
    if payment_type == "كاش" {
        // Delete old car_sale partner rows (cash_movement + any legacy profit_recognition)
        delete_generated_car_sale_partner_transactions(db, &sale_id.to_string())?;

        // Also clean up any legacy customer_sale_payment rows from the old bug
        let legacy_ids: Vec<i64> = {
            let mut stmt = db
                .prepare(
                    "SELECT id FROM partner_transactions
                 WHERE kind = 'زبون'
                   AND source_type = 'customer_sale_payment'
                   AND related_source_type = 'car'
                   AND related_entity_id = ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([car_id.to_string()], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            drop(stmt);
            rows
        };
        for pid in &legacy_ids {
            delete_customer_payment_partner_splits(db, *pid)?;
            delete_customer_payment_profit_splits(db, *pid)?;
            append_partner_transaction_reversal_by_id(db, *pid, "استبدال مقدمة بيع قديمة")?;
        }

        let car_data: Result<(Money, Money, String, String, String), _> = db.query_row(
            "SELECT purchase_price, selling_price,
                    COALESCE(car_name, ''), COALESCE(sale_currency, 'IQD'),
                    COALESCE(sale_date, '')
             FROM cars WHERE id=?1 AND active_sale_id=?2",
            params![car_id, sale_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        );
        let (_purchase_price, selling_price, car_name, sale_currency, sale_date) = match car_data {
            Ok(d) => d,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };

        // Recreate cash_movement (selling_price split 50/50)
        let cash_note = format!(
            "ايداع بيع سيارة {} ({}) بعد تغيير التكلفة",
            car_name, car_number
        );
        distribute_to_partners_50_with_effects_and_related(
            db,
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
        rebuild_cash_sale_profit_recognition(db, car_id)?;
    } else {
        // Rebuild profit recognitions for installments/term sales at new cost/profit ratio
        rebuild_customer_payment_profit_recognitions_for_car(db, &car_number)?;
    }

    // Audit fix #19: enforce the profit cap AFTER rebuilding. The rebuild recomputes
    // recognized profit with the new cost basis (clamped by the cap), so a legitimate
    // post-sale expense can no longer be rejected because of stale recognitions.
    // The validation now acts as a consistency assertion on the rebuilt state.
    validate_profit_cap_for_car(db, car_id, sale_id)?;

    recalculate_all_partners(db)?;

    Ok(())
}
