use rusqlite::{Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Car {
    pub car_number: String,
    pub chassis_number: Option<String>,
    pub car_name: String,
    pub color: String,
    pub details: String,
    pub purchase_price: f64,
    pub selling_price: f64,
    pub status: String,
    pub payment_type: Option<String>,
    pub cash_price: Option<f64>,
    pub amount_paid: Option<f64>,
    pub amount_remaining: Option<f64>,
    pub installment_months: Option<i32>,
    pub monthly_payment: Option<f64>,
    pub buyer_name: Option<String>,
    pub buyer_phone: Option<String>,
    pub purchase_date: Option<String>,
    pub sale_date: Option<String>,
    pub delivery_date: Option<String>,
    pub first_payment_date: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Partner {
    pub partner_name: String,
    pub phone: String,
    pub total_amount: f64,
    pub kind: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PartnerTransaction {
    pub id: i64,
    pub partner_name: String,
    pub kind: String,
    pub type_: String,
    pub amount: f64,
    pub date: String,
    pub notes: Option<String>,
}

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cars (
            car_number TEXT PRIMARY KEY,
            chassis_number TEXT,
            car_name TEXT NOT NULL,
            color TEXT,
            details TEXT,
            purchase_price REAL DEFAULT 0.0,
            selling_price REAL DEFAULT 0.0,
            status TEXT NOT NULL,
            payment_type TEXT,
            cash_price REAL,
            amount_paid REAL,
            amount_remaining REAL,
            installment_months INTEGER,
            monthly_payment REAL
        )",
        [],
    )?;

    // إضافة الأعمدة الجديدة إذا كانت الجداول موجودة مسبقاً
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN chassis_number TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN payment_type TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN cash_price REAL", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN amount_paid REAL", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN amount_remaining REAL", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN installment_months INTEGER", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN monthly_payment REAL", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN buyer_name TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN buyer_phone TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN purchase_date TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN sale_date TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN delivery_date TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN first_payment_date TEXT", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS partners (
            partner_name TEXT NOT NULL,
            phone TEXT,
            total_amount REAL DEFAULT 0.0,
            kind TEXT NOT NULL DEFAULT 'شريك',
            PRIMARY KEY (partner_name, kind)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS partner_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partner_name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'شريك',
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            notes TEXT
        )",
        [],
    )?;

    // ترقيم قاعدة البيانات للترحيل
    conn.execute(
        "CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY)",
        [],
    )?;

    let version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM db_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if version < 1 {
        // الترحيل 1: مفتاح مركب (partner_name, kind) للجداول القديمة
        // إنشاء جدول مؤقت، نسخ البيانات، حذف القديم، إعادة التسمية
        let _ = conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS partners_migrate (
                partner_name TEXT NOT NULL,
                phone TEXT,
                total_amount REAL DEFAULT 0.0,
                kind TEXT NOT NULL DEFAULT 'شريك',
                PRIMARY KEY (partner_name, kind)
            );
            INSERT OR IGNORE INTO partners_migrate (partner_name, phone, total_amount, kind)
            SELECT partner_name, phone, total_amount, COALESCE(kind, 'شريك') FROM partners;
            DROP TABLE IF EXISTS partners;
            ALTER TABLE partners_migrate RENAME TO partners;",
        );
        let _ = conn.execute(
            "ALTER TABLE partner_transactions ADD COLUMN kind TEXT NOT NULL DEFAULT 'شريك'",
            [],
        );
        conn.execute("INSERT INTO db_version (version) VALUES (1)", [])?;
    }

    Ok(())
}

#[tauri::command]
fn add_car(
    state: State<AppState>,
    num: String,
    chassis: String,
    name: String,
    color: String,
    details: String,
    purchase: f64,
    selling: f64,
    status: String,
    payment_type: Option<String>,
    cash_price: Option<f64>,
    amount_paid: Option<f64>,
    amount_remaining: Option<f64>,
    installment_months: Option<i32>,
    monthly_payment: Option<f64>,
    buyer_name: Option<String>,
    buyer_phone: Option<String>,
    purchase_date: Option<String>,
    sale_date: Option<String>,
    delivery_date: Option<String>,
    first_payment_date: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // INSERT with main fields
    db.execute(
        "INSERT OR REPLACE INTO cars (
            car_number, chassis_number, car_name, color, details, 
            purchase_price, selling_price, status,
            payment_type, cash_price, amount_paid, amount_remaining,
            installment_months, monthly_payment
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        (
            num.trim(),
            chassis.trim(),
            name.trim(),
            color.trim(),
            details.trim(),
            purchase,
            selling,
            status,
            payment_type,
            cash_price,
            amount_paid,
            amount_remaining,
            installment_months,
            monthly_payment,
        ),
    )
    .map_err(|e| e.to_string())?;

    // UPDATE extra fields
    db.execute(
        "UPDATE cars SET buyer_name = ?1, buyer_phone = ?2, purchase_date = ?3, sale_date = ?4, delivery_date = ?5, first_payment_date = ?6 WHERE car_number = ?7",
        (buyer_name, buyer_phone, purchase_date, sale_date, delivery_date, first_payment_date, num.trim()),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_cars(state: State<AppState>) -> Result<Vec<Car>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT car_number, chassis_number, car_name, color, details, 
                    purchase_price, selling_price, status,
                    payment_type, cash_price, amount_paid, amount_remaining,
                    installment_months, monthly_payment,
                    buyer_name, buyer_phone, purchase_date, sale_date,
                    delivery_date, first_payment_date
             FROM cars ORDER BY car_name",
        )
        .map_err(|e| e.to_string())?;

    let cars = stmt
        .query_map([], |row| {
            Ok(Car {
                car_number: row.get(0)?,
                chassis_number: row.get(1)?,
                car_name: row.get(2)?,
                color: row.get(3)?,
                details: row.get(4)?,
                purchase_price: row.get(5)?,
                selling_price: row.get(6)?,
                status: row.get(7)?,
                payment_type: row.get(8)?,
                cash_price: row.get(9)?,
                amount_paid: row.get(10)?,
                amount_remaining: row.get(11)?,
                installment_months: row.get(12)?,
                monthly_payment: row.get(13)?,
                buyer_name: row.get(14)?,
                buyer_phone: row.get(15)?,
                purchase_date: row.get(16)?,
                sale_date: row.get(17)?,
                delivery_date: row.get(18)?,
                first_payment_date: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(cars)
}

#[tauri::command]
fn delete_car(state: State<AppState>, num: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM cars WHERE car_number = ?1", [num.trim()])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_partner(
    state: State<AppState>,
    name: String,
    phone: String,
    kind: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT OR REPLACE INTO partners (partner_name, phone, total_amount, kind)
         VALUES (?1, ?2, COALESCE((SELECT total_amount FROM partners WHERE partner_name = ?1 AND kind = ?3), 0.0), ?3)",
        (name.trim(), phone.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_partners(state: State<AppState>) -> Result<Vec<Partner>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT partner_name, phone, total_amount, kind FROM partners ORDER BY partner_name")
        .map_err(|e| e.to_string())?;

    let partners = stmt
        .query_map([], |row| {
            Ok(Partner {
                partner_name: row.get(0)?,
                phone: row.get(1)?,
                total_amount: row.get(2)?,
                kind: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(partners)
}

#[tauri::command]
fn delete_partner(state: State<AppState>, name: String, kind: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2",
        (name.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM partners WHERE partner_name = ?1 AND kind = ?2",
        (name.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn recalculate_partner_total(db: &Connection, partner_name: &str, kind: &str) -> Result<(), String> {
    db.execute(
        "UPDATE partners
         SET total_amount = COALESCE((
             SELECT SUM(CASE WHEN type = 'ايداع' THEN amount WHEN type = 'سحب' THEN -amount ELSE 0 END)
             FROM partner_transactions
             WHERE partner_name = ?1 AND kind = ?2
         ), 0.0)
         WHERE partner_name = ?1 AND kind = ?2",
        (partner_name.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn days_in_month(year: i32, month: i32) -> i32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        _ => 30,
    }
}

fn add_months_to_date(date: &str, months_to_add: i32) -> String {
    let parts: Vec<i32> = date
        .split('-')
        .filter_map(|part| part.parse::<i32>().ok())
        .collect();
    if parts.len() != 3 {
        return date.to_string();
    }

    let year = parts[0];
    let month = parts[1];
    let day = parts[2];
    let total_months = year * 12 + (month - 1) + months_to_add;
    let next_year = total_months.div_euclid(12);
    let next_month = total_months.rem_euclid(12) + 1;
    let next_day = day.min(days_in_month(next_year, next_month));

    format!("{next_year:04}-{next_month:02}-{next_day:02}")
}

#[tauri::command]
fn sync_customer_debt_from_car_sale(
    state: State<AppState>,
    buyer_name: String,
    phone: String,
    car_label: String,
    payment_type: String,
    amount_paid: f64,
    amount_remaining: f64,
    installment_months: i32,
    sale_date: String,
    delivery_date: Option<String>,
    first_payment_date: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let buyer_name = buyer_name.trim();
    if buyer_name.is_empty() || payment_type.trim() == "كاش" {
        return Ok(());
    }

    let phone = phone.trim();
    let car_label = if car_label.trim().is_empty() {
        "سيارة"
    } else {
        car_label.trim()
    };
    let sale_date = if sale_date.trim().is_empty() {
        "1970-01-01".to_string()
    } else {
        sale_date.trim().to_string()
    };
    let sale_key = format!("بيع {car_label}");
    let customer_note = if phone.is_empty() {
        format!(" - {buyer_name}")
    } else {
        format!(" - {buyer_name} - {phone}")
    };

    db.execute(
        "INSERT OR REPLACE INTO partners (partner_name, phone, total_amount, kind)
         VALUES (?1, ?2, COALESCE((SELECT total_amount FROM partners WHERE partner_name = ?1 AND kind = 'مطلوب'), 0.0), 'مطلوب')",
        (buyer_name, phone),
    )
    .map_err(|e| e.to_string())?;

    let linked_sale_debts: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM partner_transactions
             WHERE partner_name = ?1 AND kind = 'مطلوب' AND type = 'سحب' AND notes LIKE ?2",
            (buyer_name, format!("%{sale_key}%")),
            |row| row.get(0),
        )
        .unwrap_or(0);
    if linked_sale_debts > 0 {
        return Ok(());
    }

    if amount_paid > 0.0 {
        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes)
             VALUES (?1, 'مطلوب', 'ايداع', ?2, ?3, ?4)",
            (
                buyer_name,
                amount_paid,
                sale_date.as_str(),
                format!("دفعة أولى - {sale_key}{customer_note}"),
            ),
        )
        .map_err(|e| e.to_string())?;
    }

    if amount_remaining > 0.0 {
        if payment_type.trim() == "اقساط" {
            let months = installment_months.max(1);
            let per_month = (amount_remaining / months as f64).floor();
            let remainder = amount_remaining - per_month * months as f64;
            let base_date = first_payment_date
                .filter(|date| !date.trim().is_empty())
                .unwrap_or_else(|| sale_date.clone());

            for i in 0..months {
                let amount = if i == months - 1 {
                    per_month + remainder
                } else {
                    per_month
                };
                let date = add_months_to_date(&base_date, i);
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes)
                     VALUES (?1, 'مطلوب', 'سحب', ?2, ?3, ?4)",
                    (
                        buyer_name,
                        amount,
                        date,
                        format!("قسط {}/{} - {sale_key}{customer_note}", i + 1, months),
                    ),
                )
                .map_err(|e| e.to_string())?;
            }
        } else if payment_type.trim() == "موعد" {
            let due_date = delivery_date
                .filter(|date| !date.trim().is_empty())
                .unwrap_or_else(|| sale_date.clone());
            db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes)
                 VALUES (?1, 'مطلوب', 'سحب', ?2, ?3, ?4)",
                (
                    buyer_name,
                    amount_remaining,
                    due_date,
                    format!("مؤجل - {sale_key}{customer_note}"),
                ),
            )
            .map_err(|e| e.to_string())?;
        }
    }

    recalculate_partner_total(&db, buyer_name, "مطلوب")?;
    Ok(())
}

#[tauri::command]
fn update_partner(
    state: State<AppState>,
    old_name: String,
    old_kind: String,
    name: String,
    phone: String,
    kind: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let name = name.trim().to_string();
    let old_name = old_name.trim().to_string();
    let old_kind = old_kind.trim().to_string();
    let kind = kind.trim().to_string();

    if old_name == name && old_kind == kind {
        db.execute(
            "UPDATE partners SET phone = ?1 WHERE partner_name = ?2 AND kind = ?3",
            (phone.trim(), &old_name, &old_kind),
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    db.execute(
        "UPDATE partners SET partner_name = ?1, phone = ?2, kind = ?3 WHERE partner_name = ?4 AND kind = ?5",
        (&name, phone.trim(), &kind, &old_name, &old_kind),
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE partner_transactions SET partner_name = ?1, kind = ?2 WHERE partner_name = ?3 AND kind = ?4",
        (&name, &kind, &old_name, &old_kind),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_partner_transaction(
    state: State<AppState>,
    partner_name: String,
    kind: String,
    type_: String,
    amount: f64,
    date: String,
    notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            notes,
        ),
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    Ok(())
}

#[tauri::command]
fn update_partner_transaction(
    state: State<AppState>,
    id: i64,
    partner_name: String,
    kind: String,
    type_: String,
    amount: f64,
    date: String,
    notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE partner_transactions
         SET type = ?1, amount = ?2, date = ?3, notes = ?4
         WHERE id = ?5 AND partner_name = ?6 AND kind = ?7",
        (
            type_.trim(),
            amount,
            date.trim(),
            notes,
            id,
            partner_name.trim(),
            kind.trim(),
        ),
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    Ok(())
}

#[tauri::command]
fn delete_partner_transaction(
    state: State<AppState>,
    id: i64,
    partner_name: String,
    kind: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM partner_transactions WHERE id = ?1 AND partner_name = ?2 AND kind = ?3",
        (id, partner_name.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    Ok(())
}

#[tauri::command]
fn get_partner_transactions(
    state: State<AppState>,
    partner_name: String,
    kind: String,
) -> Result<Vec<PartnerTransaction>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name, kind, type, amount, date, notes
             FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2 ORDER BY id ASC",
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
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(transactions)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("تعذر الوصول لمجلد البيانات: {e}"))?;

            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("تعذر إنشاء مجلد البيانات: {e}"))?;

            let db_path = app_data_dir.join("fjr_alwadi_data.db");
            let conn = Connection::open(&db_path)
                .map_err(|e| format!("تعذر فتح قاعدة البيانات: {e}"))?;

            init_db(&conn).map_err(|e| format!("تعذر تهيئة قاعدة البيانات: {e}"))?;

            app.manage(AppState {
                db: Mutex::new(conn),
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_car,
            get_cars,
            delete_car,
            add_partner,
            update_partner,
            get_partners,
            delete_partner,
            add_partner_transaction,
            update_partner_transaction,
            delete_partner_transaction,
            get_partner_transactions,
            sync_customer_debt_from_car_sale,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
