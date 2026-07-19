//! `reports` — legacy/mod.rs lines 15617–16569
use super::*;

fn sum_money_query<P: rusqlite::Params>(
    db: &Connection,
    sql: &str,
    params: P,
) -> Result<Money, String> {
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params, |row| row.get::<_, Money>(0))
        .map_err(|e| e.to_string())?;
    let mut total = Money::zero();
    for row in rows {
        total += row.map_err(|e| e.to_string())?;
    }
    Ok(total)
}

fn sum_partner_movements(
    db: &Connection,
    affects_column: &str,
    kind_clause: &str,
    currency: &str,
) -> Result<Money, String> {
    debug_assert!(matches!(
        affects_column,
        "affects_qasa" | "affects_partner_cash"
    ));
    debug_assert!(matches!(
        kind_clause,
        "kind IN ('شريك', 'مستثمر')" | "kind = 'شريك'"
    ));
    let sql = format!(
        "SELECT type, amount FROM partner_transactions
         WHERE {affects_column} = 1 AND {kind_clause}
           AND COALESCE(currency, 'IQD') = ?1
           AND type NOT LIKE 'تحويل%'"
    );
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([currency], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Money>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut total = Money::zero();
    for row in rows {
        let (tx_type, amount) = row.map_err(|e| e.to_string())?;
        if is_deposit_type(&tx_type) {
            total += amount;
        } else if tx_type.starts_with("سحب") || tx_type.starts_with("باقي") {
            total -= amount;
        }
    }
    Ok(total)
}

fn sum_ledger_account(
    db: &Connection,
    account_type: &str,
    currency: &str,
    debit_normal: bool,
) -> Result<Money, String> {
    let mut stmt = db
        .prepare(
            "SELECT debit, credit FROM financial_ledger
             WHERE account_type = ?1 AND currency = ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![account_type, currency], |row| {
            Ok((row.get::<_, Money>(0)?, row.get::<_, Money>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut total = Money::zero();
    for row in rows {
        let (debit, credit) = row.map_err(|e| e.to_string())?;
        total += if debit_normal {
            debit - credit
        } else {
            credit - debit
        };
    }
    Ok(total)
}

#[tauri::command]
#[allow(unused_variables)]
pub fn get_financial_summary(
    state: State<AppState>,
    payment_type: Option<String>,
) -> Result<FinancialSummary, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    // NOTE: Read-only function — must NOT call recalculate_all_partners or any write operation
    // payment_type is accepted from the frontend but unused: Qasa vs Cash are distinguished
    // internally by the affects_qasa / affects_partner_cash flags, not by a payment-type filter.
    let _payment_type = payment_type;

    // Phase 4: Calculate qasa (partners + investors) and cash (partners only) using affects_* flags
    let qasa_iqd = sum_partner_movements(&db, "affects_qasa", "kind IN ('شريك', 'مستثمر')", "IQD")?;
    let qasa_usd = sum_partner_movements(&db, "affects_qasa", "kind IN ('شريك', 'مستثمر')", "USD")?;
    let cash_iqd = sum_partner_movements(&db, "affects_partner_cash", "kind = 'شريك'", "IQD")?;
    let cash_usd = sum_partner_movements(&db, "affects_partner_cash", "kind = 'شريك'", "USD")?;

    // 2. Inventory Value — from ledger entries. Car purchases, including cash purchases,
    // are recorded via record_car_purchase_ledger_entries(), so adding cars.purchase_price here
    // would count the same vehicle twice.
    let ledger_inventory_iqd = sum_ledger_account(&db, "inventory", "IQD", true)?;
    let ledger_inventory_usd = sum_ledger_account(&db, "inventory", "USD", true)?;
    let inventory_value_iqd = ledger_inventory_iqd;
    let inventory_value_usd = ledger_inventory_usd;

    // 3. Total Investments
    let total_investments_iqd = sum_ledger_account(&db, "investor", "IQD", false)?;
    let total_investments_usd = sum_ledger_account(&db, "investor", "USD", false)?;

    // 4. Total Partner Capital
    let total_partner_capital_iqd = sum_ledger_account(&db, "capital", "IQD", false)?;
    let total_partner_capital_usd = sum_ledger_account(&db, "capital", "USD", false)?;

    // 5. Total Debtors
    let total_debtors_iqd = sum_ledger_account(&db, "receivable", "IQD", true)?;
    let total_debtors_usd = sum_ledger_account(&db, "receivable", "USD", true)?;

    // 6. Total Expenses — only general expenses from Expenses tab, not COGS or car expenses
    let total_expenses_iqd = sum_money_query(
        &db,
        "SELECT amount FROM expenses
         WHERE COALESCE(currency, 'IQD') = 'IQD'
           AND (car_number IS NULL OR car_number = '')",
        [],
    )?;
    let total_expenses_usd = sum_money_query(
        &db,
        "SELECT amount FROM expenses
         WHERE COALESCE(currency, 'IQD') = 'USD'
           AND (car_number IS NULL OR car_number = '')",
        [],
    )?;

    // 7. Net Capital (Assets - Liabilities = (cash + inventory + receivable) - (investor + funder + payable))
    let total_funders_iqd = sum_ledger_account(&db, "funder", "IQD", false)?;
    let total_funders_usd = sum_ledger_account(&db, "funder", "USD", false)?;

    let total_payables_iqd = sum_ledger_account(&db, "payable", "IQD", false)?;
    let total_payables_usd = sum_ledger_account(&db, "payable", "USD", false)?;

    // Deferred revenue means only unrecognized installment/term profit, not the full sale price.
    let (deferred_revenue_iqd, deferred_revenue_usd) =
        calculate_deferred_revenue_from_unrecognized_profit(&db)?;

    // 7c. Deferred Expenses — reserved for future use
    let deferred_expense_iqd = sum_ledger_account(&db, "deferred_expense", "IQD", false)?;
    let deferred_expense_usd = sum_ledger_account(&db, "deferred_expense", "USD", false)?;

    let liabilities_iqd = total_investments_iqd
        + total_funders_iqd
        + total_payables_iqd
        + deferred_revenue_iqd
        + deferred_expense_iqd;
    let liabilities_usd = total_investments_usd
        + total_funders_usd
        + total_payables_usd
        + deferred_revenue_usd
        + deferred_expense_usd;

    // Net Capital = (Cash on Hand + Inventory Value - Liabilities) - Total Fixed Capital.
    // Receivables stay visible in their own dashboard/company-status fields and are not folded
    // into this capital metric.
    let net_capital_iqd =
        (cash_iqd + inventory_value_iqd - liabilities_iqd) - total_partner_capital_iqd;
    let net_capital_usd =
        (cash_usd + inventory_value_usd - liabilities_usd) - total_partner_capital_usd;

    // 8. Profits since the first day of the month or the latest manual reset.
    let (current_date, current_time) = now_datetime();
    let (profit_start_date, profit_start_time) =
        current_profit_period_start(&db, &current_date, &current_time)?;
    let (monthly_profits_iqd, monthly_profits_usd) =
        calculate_profit_totals_since(&db, &profit_start_date, &profit_start_time)?;

    Ok(FinancialSummary {
        cash_iqd,
        cash_usd,
        qasa_iqd,
        qasa_usd,
        inventory_value_iqd,
        inventory_value_usd,
        total_investments_iqd,
        total_investments_usd,
        total_partner_capital_iqd,
        total_partner_capital_usd,
        total_debtors_iqd,
        total_debtors_usd,
        total_expenses_iqd,
        total_expenses_usd,
        deferred_revenue_iqd,
        deferred_revenue_usd,
        deferred_expense_iqd,
        deferred_expense_usd,
        net_capital_iqd,
        net_capital_usd,
        monthly_profits_iqd,
        monthly_profits_usd,
    })
}

/// FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-3):
/// Precompute the company-status snapshot so `CompanyStatusTab.tsx` can be a
/// pure renderer. Mirrors the formulas the frontend previously had:
///   - receivables = sum of positive iqd_balance/usd_balance across account kinds
///   - liabilities = sum of |negative| iqd_balance/usd_balance across account kinds
///   - company_value = cash + inventory + receivables − liabilities
///   - shared_capital = (inventory + receivables − liabilities) / 2
///   - partner.capital = partner.iqd_balance + shared_iqd (same for USD)
/// Account kinds considered: مستثمر، ممول، زبون، وكالة، شركة.
#[tauri::command]
pub fn get_company_status(
    state: State<AppState>,
    session_token: Option<String>,
) -> Result<CompanyStatus, String> {
    // FORENSIC FIX (re-audit 2026-07-11, CRITICAL-3 — COMPANY STATUS DEADLOCK + WRONG BALANCES):
    // (A) DEADLOCK — previous code locked `state.db` (a std::sync::Mutex,
    //     NON-reentrant) then called `get_financial_summary(state, ..)` which
    //     tried to lock the SAME mutex again. Fixed by inlining the cash +
    //     inventory reads against the already-locked `&Connection`.
    // (B) WRONG BALANCES — previous code used `affects_partner_cash = 1` as a
    //     universal filter for ALL partner kinds. That flag is only set on
    //     شريك transactions; for every other kind it is 0, so non-partner
    //     balances were always reported as zero. Fixed by using
    //     `borrower_balance_for_currency` (correct sign convention, no
    //     affects_partner_cash filter) for borrower accounts.
    let db = state.db.lock().map_err(|e| e.to_string())?;
    // This is a read-only dashboard snapshot and is available to every signed-in
    // account. Administrative mutations continue to use require_admin_session.
    let _actor = require_authenticated_session(&db, session_token.as_deref())?;

    // --- Cash (IQD / USD) — inlined to avoid re-entering the Mutex.
    let cash_iqd = sum_typed_money_rows(
        &db,
            "SELECT type, amount FROM partner_transactions
             WHERE affects_partner_cash = 1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'",
            [],
            true,
        )?;
    let cash_usd = sum_typed_money_rows(
        &db,
            "SELECT type, amount FROM partner_transactions
             WHERE affects_partner_cash = 1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'USD'",
            [],
            true,
        )?;

    // --- Inventory (IQD / USD) — from financial_ledger (single source of truth).
    let inv_iqd = sum_money_difference_rows(
        &db,
        "SELECT debit, credit FROM financial_ledger
             WHERE account_type = 'inventory' AND currency = 'IQD'",
        [],
    )?;
    let inv_usd = sum_money_difference_rows(
        &db,
        "SELECT debit, credit FROM financial_ledger
             WHERE account_type = 'inventory' AND currency = 'USD'",
        [],
    )?;

    // --- Receivables / Liabilities (IQD / USD) — correct per-kind computation.
    let mut receivables_iqd = rust_decimal::Decimal::ZERO;
    let mut receivables_usd = rust_decimal::Decimal::ZERO;
    let mut liabilities_iqd = rust_decimal::Decimal::ZERO;
    let mut liabilities_usd = rust_decimal::Decimal::ZERO;

    // Borrower accounts (per audit §4.3 — must NOT use affects_partner_cash).
    for kind in ["ممول", "شركة", "زبون", "وكالة"] {
        if !is_borrower_account_kind(kind) {
            continue;
        }
        let bal_iqd = borrower_balance_for_currency(&db, None, Some(kind), "IQD")?;
        let bal_usd = borrower_balance_for_currency(&db, None, Some(kind), "USD")?;
        if bal_iqd.0 > rust_decimal::Decimal::ZERO {
            receivables_iqd += bal_iqd.0;
        } else if bal_iqd.0 < rust_decimal::Decimal::ZERO {
            liabilities_iqd += -bal_iqd.0;
        }
        if bal_usd.0 > rust_decimal::Decimal::ZERO {
            receivables_usd += bal_usd.0;
        } else if bal_usd.0 < rust_decimal::Decimal::ZERO {
            liabilities_usd += -bal_usd.0;
        }
    }

    // مستثمر — investor balances are liabilities (we owe them their capital).
    let investor_iqd = sum_typed_money_rows(
        &db,
            "SELECT type, amount FROM partner_transactions
             WHERE kind = 'مستثمر' AND type NOT LIKE 'تحويل%' AND COALESCE(currency, 'IQD') = 'IQD'",
            [],
            false,
        )?;
    let investor_usd = sum_typed_money_rows(
        &db,
            "SELECT type, amount FROM partner_transactions
             WHERE kind = 'مستثمر' AND type NOT LIKE 'تحويل%' AND COALESCE(currency, 'IQD') = 'USD'",
            [],
            false,
        )?;
    if investor_iqd.0 > rust_decimal::Decimal::ZERO {
        liabilities_iqd += investor_iqd.0;
    } else if investor_iqd.0 < rust_decimal::Decimal::ZERO {
        receivables_iqd += -investor_iqd.0;
    }
    if investor_usd.0 > rust_decimal::Decimal::ZERO {
        liabilities_usd += investor_usd.0;
    } else if investor_usd.0 < rust_decimal::Decimal::ZERO {
        receivables_usd += -investor_usd.0;
    }

    let company_value_iqd = cash_iqd.0 + inv_iqd.0 + receivables_iqd - liabilities_iqd;
    let company_value_usd = cash_usd.0 + inv_usd.0 + receivables_usd - liabilities_usd;

    let shared_capital_iqd =
        (inv_iqd.0 + receivables_iqd - liabilities_iqd) / rust_decimal::Decimal::from(2);
    let shared_capital_usd =
        (inv_usd.0 + receivables_usd - liabilities_usd) / rust_decimal::Decimal::from(2);

    // Build the per-partner rows (only شريك partners get capital cards).
    let mut stmt = db
        .prepare("SELECT partner_name, iqd_balance, usd_balance FROM partners WHERE kind = 'شريك' ORDER BY partner_name")
        .map_err(|e| e.to_string())?;
    let partners_iter = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Money>(1).unwrap_or(Money::zero()),
                row.get::<_, Money>(2).unwrap_or(Money::zero()),
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut partners = Vec::new();
    for row in partners_iter {
        let (name, iqd_bal, usd_bal) = row.map_err(|e| e.to_string())?;
        partners.push(CompanyStatusPartner {
            partner_name: name,
            capital_iqd: Money(iqd_bal.0 + shared_capital_iqd),
            capital_usd: Money(usd_bal.0 + shared_capital_usd),
        });
    }

    Ok(CompanyStatus {
        cash_iqd,
        cash_usd,
        inventory_value_iqd: inv_iqd,
        inventory_value_usd: inv_usd,
        receivables_iqd: Money(receivables_iqd),
        receivables_usd: Money(receivables_usd),
        liabilities_iqd: Money(liabilities_iqd),
        liabilities_usd: Money(liabilities_usd),
        company_value_iqd: Money(company_value_iqd),
        company_value_usd: Money(company_value_usd),
        shared_capital_iqd: Money(shared_capital_iqd),
        shared_capital_usd: Money(shared_capital_usd),
        partners,
    })
}

#[tauri::command]
pub fn get_partners_totals(state: State<AppState>, kind: String) -> Result<(Money, Money), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let filter_kind = match kind.as_str() {
        "partners-financial" => vec!["شريك", "مستثمر", "ممول", "شركة"],
        "partners-only" => vec!["شريك"],
        "customers-only" => vec!["مستثمر", "ممول", "شركة", "زبون", "وكالة"],
        _ => vec![kind.as_str()],
    };

    let mut iqd_total = Money::zero();
    let mut usd_total = Money::zero();

    for k in &filter_kind {
        if is_borrower_account_kind(k) {
            iqd_total += borrower_balance_for_currency(&db, None, Some(k), "IQD")?;
            usd_total += borrower_balance_for_currency(&db, None, Some(k), "USD")?;
            continue;
        }

        // Task 7: Use affects_* flags for partner/investor, with customer debt handled above.
        let (sql, use_param): (&str, bool) = if *k == "شريك" {
            (
                "SELECT type, amount, COALESCE(currency, 'IQD')
             FROM partner_transactions
             WHERE kind = 'شريك' AND affects_partner_cash = 1 AND type NOT LIKE 'تحويل%'",
                false,
            )
        } else if *k == "مستثمر" {
            (
                "SELECT type, amount, COALESCE(currency, 'IQD')
             FROM partner_transactions
             WHERE kind = 'مستثمر' AND type NOT LIKE 'تحويل%'",
                false,
            )
        } else {
            (
                "SELECT type, amount, COALESCE(currency, 'IQD')
             FROM partner_transactions
             WHERE kind = ?1 AND type NOT LIKE 'تحويل%'",
                true,
            )
        };

        let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
        let mut row_pairs: Vec<(String, Money, String)> = Vec::new();
        if use_param {
            let mut rows = stmt.query([k]).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                row_pairs.push((
                    row.get(0).map_err(|e| e.to_string())?,
                    row.get(1).map_err(|e| e.to_string())?,
                    row.get(2).map_err(|e| e.to_string())?,
                ));
            }
        } else {
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                row_pairs.push((
                    row.get(0).map_err(|e| e.to_string())?,
                    row.get(1).map_err(|e| e.to_string())?,
                    row.get(2).map_err(|e| e.to_string())?,
                ));
            }
        }

        for (tx_type, amount, currency) in row_pairs {
            let Some(total) = signed_transaction_amount(&tx_type, amount, *k == "شريك") else {
                continue;
            };
            if currency == "USD" {
                usd_total += total;
            } else {
                iqd_total += total;
            }
        }
    }

    Ok((iqd_total, usd_total))
}

pub fn calculate_analytical_profit(
    db: &Connection,
    start_date: &str,
    end_date: Option<&str>,
    start_time: &str,
) -> Result<(Money, Money), String> {
    let effective_time = if start_time.trim().is_empty() {
        "00:00"
    } else {
        start_time.trim()
    };

    // Bug 10 (N5): Use bound parameters (?1, ?2, ?3) instead of `format!()`-interpolating
    // user-supplied date/time strings into the SQL string. This prevents SQL injection
    // even if a malicious date string is passed in.
    //
    // Audit fix #11: a single unified query. The start bound is always time-aware
    // (a "00:00" start time is equivalent to `date >= start`), and the optional end
    // date is ALWAYS honored — previously a provided end date was silently ignored
    // whenever the time-aware branch was used.
    let sql = "SELECT pt.amount, COALESCE(pt.currency, 'IQD')
               FROM partner_transactions pt
               WHERE pt.kind = 'شريك'
                 AND pt.source_role = 'profit_recognition'
                 AND COALESCE(pt.affects_profit, 0) = 1
                 AND COALESCE(pt.is_reversed, 0) = 0
                 AND (pt.date > ?1 OR (pt.date = ?1 AND COALESCE(pt.time, '00:00') >= ?2))
                 AND (?3 IS NULL OR pt.date <= ?3)
               ORDER BY pt.id";
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![start_date, effective_time, end_date], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut profit_stmt: Vec<(Money, String)> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut profit_iqd = Money::zero();
    let mut profit_usd = Money::zero();
    for (recognized_profit, currency) in profit_stmt.drain(..) {
        if currency == "IQD" {
            profit_iqd += recognized_profit;
        } else {
            profit_usd += recognized_profit;
        }
    }

    Ok((profit_iqd, profit_usd))
}

pub fn calculate_partner_analytical_profit(
    db: &Connection,
    partner_name: &str,
    start_date: &str,
    end_date: Option<&str>,
    start_time: &str,
) -> Result<(Money, Money), String> {
    let effective_time = if start_time.trim().is_empty() {
        "00:00"
    } else {
        start_time.trim()
    };

    let mut stmt = db
        .prepare(
            "SELECT pt.amount, COALESCE(pt.currency, 'IQD')
             FROM partner_transactions pt
             WHERE pt.kind = 'شريك'
               AND pt.partner_name = ?1
               AND pt.source_role = 'profit_recognition'
               AND COALESCE(pt.affects_profit, 0) = 1
               AND COALESCE(pt.is_reversed, 0) = 0
               AND (pt.date > ?2 OR (pt.date = ?2 AND COALESCE(pt.time, '00:00') >= ?3))
               AND (?4 IS NULL OR pt.date <= ?4)
             ORDER BY pt.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(
            params![partner_name, start_date, effective_time, end_date],
            |row| Ok((row.get::<_, Money>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let mut profit_iqd = Money::zero();
    let mut profit_usd = Money::zero();
    for row in rows {
        let (amount, currency) = row.map_err(|e| e.to_string())?;
        if currency == "USD" {
            profit_usd += amount;
        } else {
            profit_iqd += amount;
        }
    }
    Ok((profit_iqd, profit_usd))
}

pub fn calculate_profit_totals_since(
    db: &Connection,
    start_date: &str,
    start_time: &str,
) -> Result<(Money, Money), String> {
    let (profit_iqd, profit_usd) = calculate_analytical_profit(db, start_date, None, start_time)?;

    // General expenses (not linked to a car)
    let effective_time = if start_time.trim().is_empty() {
        "00:00"
    } else {
        start_time.trim()
    };
    let general_expenses_iqd = sum_money_query(
        db,
        "SELECT amount FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'IQD'
               AND (car_number IS NULL OR car_number = '')
               AND (date > ?1 OR (date = ?1 AND COALESCE(time, '00:00') >= ?2))",
        params![start_date, effective_time],
    )?;
    let general_expenses_usd = sum_money_query(
        db,
        "SELECT amount FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'USD'
               AND (car_number IS NULL OR car_number = '')
               AND (date > ?1 OR (date = ?1 AND COALESCE(time, '00:00') >= ?2))",
        params![start_date, effective_time],
    )?;

    Ok((
        profit_iqd - general_expenses_iqd,
        profit_usd - general_expenses_usd,
    ))
}

pub fn parse_ymd(date: &str) -> Option<(i32, u32, u32)> {
    let mut parts = date.split('-');
    let year = parts.next()?.parse::<i32>().ok()?;
    let month = parts.next()?.parse::<u32>().ok()?;
    let day = parts.next()?.parse::<u32>().ok()?;
    if (1..=12).contains(&month) && (1..=31).contains(&day) {
        Some((year, month, day))
    } else {
        None
    }
}

pub fn profit_period_month_start(current_date: &str, _current_time: &str) -> String {
    let (year, month, _) = parse_ymd(current_date).unwrap_or((2025, 1, 1));
    format!("{:04}-{:02}-01", year, month)
}

pub fn current_profit_period_start(
    db: &Connection,
    current_date: &str,
    current_time: &str,
) -> Result<(String, String), String> {
    // Audit note #26: the 'manual-reset:' notes prefix is the storage format for
    // profit-period reset markers in profit_distributions. It acts as a typed tag
    // (deterministic machine-written prefix), not free user text, and is only ever
    // READ here — it is never used to delete or mutate accounting records.
    let month_start = profit_period_month_start(current_date, current_time);
    let latest_reset = db
        .query_row(
            "SELECT date, time FROM profit_distributions
         WHERE notes LIKE 'manual-reset:%' AND date >= ?1
         ORDER BY date DESC, time DESC, id DESC
         LIMIT 1",
            params![&month_start],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(latest_reset.unwrap_or((month_start, String::new())))
}

#[tauri::command]
pub fn get_profit_distribution_summary(
    state: State<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<ProfitDistributionSummary, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Issue 8: Use current profit period start (with time) for consistency with Dashboard
    let (current_date, current_time) = now_datetime();
    let (period_start_date, period_start_time) =
        current_profit_period_start(&db, &current_date, &current_time)?;

    let start = start_date.unwrap_or_else(|| period_start_date.clone());
    let end = end_date.unwrap_or_else(|| "9999-12-31".to_string());

    // Use time-aware filtering when start matches the period start
    let use_time = start == period_start_date && !period_start_time.is_empty();
    let effective_start_time = if use_time {
        period_start_time.as_str()
    } else {
        "00:00"
    };

    let mut stmt = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name")
        .map_err(|e| e.to_string())?;

    let partners_list = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    let mut partners = Vec::new();
    for name in partners_list {
        let (profit_iqd, profit_usd) = calculate_partner_analytical_profit(
            &db,
            &name,
            &start,
            Some(&end),
            effective_start_time,
        )?;

        // Query IQD drawings (only type = 'سحب شريك', excluding expenses)
        // Audit fix #11: use the same time-aware start bound as the profit query so
        // drawings and profit cover exactly the same period.
        let drawings_iqd = sum_money_query(
            &db,
            "SELECT amount FROM partner_transactions
             WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'IQD'
               AND type = 'سحب شريك'
               AND (date > ?2 OR (date = ?2 AND COALESCE(time, '00:00') >= ?3))
               AND date <= ?4",
            params![&name, &start, effective_start_time, &end],
        )?;

        // Query USD drawings (only type = 'سحب شريك', excluding expenses)
        let drawings_usd = sum_money_query(
            &db,
            "SELECT amount FROM partner_transactions
             WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'USD'
               AND type = 'سحب شريك'
               AND (date > ?2 OR (date = ?2 AND COALESCE(time, '00:00') >= ?3))
               AND date <= ?4",
            params![&name, &start, effective_start_time, &end],
        )?;

        partners.push(PartnerDistributionInfo {
            partner_name: name,
            profit_iqd,
            profit_usd,
            drawings_iqd,
            drawings_usd,
            // FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-1):
            // Placeholder zero values; will be overwritten after the per-partner
            // loop completes and the total expenses are known (the 50/50 split
            // needs the total expenses which are queried below the loop).
            expense_share_iqd: Money::zero(),
            expense_share_usd: Money::zero(),
            net_iqd: Money::zero(),
            net_usd: Money::zero(),
        });
    }

    // Phase 9: Only general expenses (not linked to a car)
    // Issue 8 + Audit fix #11: one unified time-aware query that also honors the
    // end date (a "00:00" start time is equivalent to `date >= start`).
    let expenses_iqd = sum_money_query(
        &db,
        "SELECT amount FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'IQD'
               AND (car_number IS NULL OR car_number = '')
               AND (date > ?1 OR (date = ?1 AND COALESCE(time, '00:00') >= ?2))
               AND date <= ?3",
        params![&start, effective_start_time, &end],
    )?;

    let expenses_usd = sum_money_query(
        &db,
        "SELECT amount FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'USD'
               AND (car_number IS NULL OR car_number = '')
               AND (date > ?1 OR (date = ?1 AND COALESCE(time, '00:00') >= ?2))
               AND date <= ?3",
        params![&start, effective_start_time, &end],
    )?;

    let mut undistributed_iqd = Money::zero();
    let mut undistributed_usd = Money::zero();
    for p in &partners {
        undistributed_iqd += p.profit_iqd - p.drawings_iqd;
        undistributed_usd += p.profit_usd - p.drawings_usd;
    }
    undistributed_iqd -= expenses_iqd;
    undistributed_usd -= expenses_usd;

    // FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-1):
    // Compute the per-partner 50/50 expense share + net profit here in the
    // backend so the frontend can be a pure renderer (§6.1). The split is
    // DETERMINISTIC: the remainder (at most one smallest unit of currency)
    // goes to the FIRST partner in the list, mirroring split_partner_amount_50.
    let (mut p0_exp_iqd, mut p1_exp_iqd) =
        split_partner_amount_50_by_currency(expenses_iqd.0, "IQD");
    let (mut p0_exp_usd, mut p1_exp_usd) =
        split_partner_amount_50_by_currency(expenses_usd.0, "USD");
    // split_partner_amount_50 returns (first_half, second_half) with the
    // remainder on the first half. The previous frontend code used
    // `partnerIndex === 0 ? half + remainder : half`, which matches.
    // The business contract permits at most two company partners. Fail closed
    // for a legacy/corrupt database rather than silently over-allocating
    // expenses through an unvalidated third-partner branch.
    if partners.len() > 2 {
        return Err(format!(
            "عدد الشركاء غير صالح لتوزيع 50/50: {}",
            partners.len()
        ));
    }
    // Defensive: if there are 0 partners, both shares stay 0; if 1 partner,
    // the single partner gets the entire expense (not 50%).
    if partners.is_empty() {
        p0_exp_iqd = rust_decimal::Decimal::ZERO;
        p1_exp_iqd = rust_decimal::Decimal::ZERO;
        p0_exp_usd = rust_decimal::Decimal::ZERO;
        p1_exp_usd = rust_decimal::Decimal::ZERO;
    } else if partners.len() == 1 {
        p0_exp_iqd = expenses_iqd.0;
        p0_exp_usd = expenses_usd.0;
        p1_exp_iqd = rust_decimal::Decimal::ZERO;
        p1_exp_usd = rust_decimal::Decimal::ZERO;
    }
    for (idx, p) in partners.iter_mut().enumerate() {
        let (exp_iqd, exp_usd) = if idx == 0 {
            (p0_exp_iqd, p0_exp_usd)
        } else {
            (p1_exp_iqd, p1_exp_usd)
        };
        p.expense_share_iqd = Money(exp_iqd);
        p.expense_share_usd = Money(exp_usd);
        p.net_iqd = Money(p.profit_iqd.0 - exp_iqd - p.drawings_iqd.0);
        p.net_usd = Money(p.profit_usd.0 - exp_usd - p.drawings_usd.0);
    }

    // Total net profit = sum(partner profits) − total general expenses.
    // This matches the previous frontend formula and is the single source of
    // truth displayed at the top of the profit-distribution tab.
    let total_profit_iqd: rust_decimal::Decimal = partners
        .iter()
        .map(|p| p.profit_iqd.0)
        .sum::<rust_decimal::Decimal>()
        - expenses_iqd.0;
    let total_profit_usd: rust_decimal::Decimal = partners
        .iter()
        .map(|p| p.profit_usd.0)
        .sum::<rust_decimal::Decimal>()
        - expenses_usd.0;

    Ok(ProfitDistributionSummary {
        undistributed_iqd,
        undistributed_usd,
        partners,
        expenses_iqd,
        expenses_usd,
        total_profit_iqd: Money(total_profit_iqd),
        total_profit_usd: Money(total_profit_usd),
    })
}

#[cfg(test)]
mod mutation_regression_tests {
    use super::*;

    #[test]
    fn sum_money_query_folds_text_decimals_exactly_and_with_the_correct_sign() {
        let db = Connection::open_in_memory().unwrap();
        db.execute("CREATE TABLE amounts (amount TEXT NOT NULL)", [])
            .unwrap();
        for amount in ["999999999999.99", "0.01", "-123456789.45"] {
            db.execute("INSERT INTO amounts(amount) VALUES (?1)", [amount])
                .unwrap();
        }
        let total = sum_money_query(&db, "SELECT amount FROM amounts ORDER BY rowid", []).unwrap();
        assert_eq!(total, Money(dec!(999876543210.55)));
    }

    #[test]
    fn sum_ledger_account_is_decimal_exact_in_both_normal_balance_directions() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE financial_ledger (
                account_type TEXT NOT NULL,
                currency TEXT NOT NULL,
                debit TEXT NOT NULL,
                credit TEXT NOT NULL
             );",
        )
        .unwrap();
        for (debit, credit) in [
            ("999999999999.99", "0"),
            ("0.01", "0"),
            ("0", "123456789.45"),
        ] {
            db.execute(
                "INSERT INTO financial_ledger VALUES ('inventory', 'USD', ?1, ?2)",
                params![debit, credit],
            )
            .unwrap();
        }
        assert_eq!(
            sum_ledger_account(&db, "inventory", "USD", true).unwrap(),
            Money(dec!(999876543210.55))
        );
        assert_eq!(
            sum_ledger_account(&db, "inventory", "USD", false).unwrap(),
            Money(dec!(-999876543210.55))
        );
    }
}
