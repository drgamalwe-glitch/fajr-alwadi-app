use super::*;

#[derive(Serialize, Debug)]
pub struct AccountingPeriod {
    pub id: i64,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub version: i64,
    pub reason: Option<String>,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_accounting_periods(state: State<AppState>) -> Result<Vec<AccountingPeriod>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id,start_date,end_date,status,version,reason,updated_at
         FROM accounting_periods ORDER BY start_date DESC,id DESC",
        )
        .map_err(|e| e.to_string())?;
    let periods = stmt
        .query_map([], |row| {
            Ok(AccountingPeriod {
                id: row.get(0)?,
                start_date: row.get(1)?,
                end_date: row.get(2)?,
                status: row.get(3)?,
                version: row.get(4)?,
                reason: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(periods)
}

#[tauri::command]
pub fn create_accounting_period(
    state: State<AppState>,
    start_date: String,
    end_date: String,
    session_token: String,
) -> Result<i64, String> {
    validate_required_text(&start_date, "بداية الفترة")?;
    validate_required_text(&end_date, "نهاية الفترة")?;
    if start_date > end_date {
        return Err("بداية الفترة يجب ألا تكون بعد نهايتها".to_string());
    }
    let mut guard = state.db.lock().map_err(|e| e.to_string())?;
    let (tx, actor) = begin_admin_transaction(&mut guard, &session_token)?;
    tx.execute(
        "INSERT INTO accounting_periods(start_date,end_date,status) VALUES (?1,?2,'open')",
        params![start_date.trim(), end_date.trim()],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    append_audit_event(
        &tx,
        actor,
        "accounting_period",
        Some(id),
        "create",
        Some(&session_token),
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn set_accounting_period_status(
    state: State<AppState>,
    period_id: i64,
    expected_version: i64,
    status: String,
    reason: String,
    session_token: String,
) -> Result<(), String> {
    if status != "open" && status != "closed" {
        return Err("حالة الفترة يجب أن تكون open أو closed".to_string());
    }
    validate_required_text(&reason, "سبب تغيير حالة الفترة")?;
    let mut guard = state.db.lock().map_err(|e| e.to_string())?;
    let (tx, actor) = begin_admin_transaction(&mut guard, &session_token)?;
    let affected = if status == "closed" {
        tx.execute(
            "UPDATE accounting_periods SET status='closed',version=version+1,reason=?1,
             closed_by_user_id=?2,closed_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
             updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
             WHERE id=?3 AND version=?4 AND status<>'closed'",
            params![reason.trim(), actor, period_id, expected_version],
        )
    } else {
        tx.execute(
            "UPDATE accounting_periods SET status='open',version=version+1,reason=?1,
             reopened_by_user_id=?2,reopened_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
             updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
             WHERE id=?3 AND version=?4 AND status='closed'",
            params![reason.trim(), actor, period_id, expected_version],
        )
    }
    .map_err(|e| e.to_string())?;
    if affected != 1 {
        return Err("تعارض إصدار الفترة أو أن حالتها لم تتغير؛ أعد تحميل البيانات".to_string());
    }
    append_audit_event(
        &tx,
        actor,
        "accounting_period",
        Some(period_id),
        if status == "closed" {
            "close"
        } else {
            "reopen"
        },
        Some(&session_token),
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
