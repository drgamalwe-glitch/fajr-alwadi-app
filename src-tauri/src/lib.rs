use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Car {
    pub car_number: String,
    pub car_plate_num: String,
    pub car_province: String,
    pub chassis_number: Option<String>,
    pub car_model: String,
    pub car_year: String,
    pub car_name: String,
    pub color: String,
    pub details: String,
    pub purchase_price: f64,
    pub currency: Option<String>,
    pub sale_currency: Option<String>,
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
    pub purchase_payment_type: Option<String>,
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
    pub currency: Option<String>,
    pub payment_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExpenseEntry {
    pub id: i64,
    pub description: String,
    pub amount: f64,
    pub date: String,
    pub time: String,
    pub notes: Option<String>,
    pub currency: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct CashRegisterEntry {
    pub id: i64,
    pub date: String,
    pub time: String,
    pub type_: String,
    pub amount: f64,
    pub description: String,
    pub notes: Option<String>,
    pub balance: f64,
    pub currency: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct FinancialSummary {
    pub iqd_balance: f64,
    pub usd_balance: f64,
    pub inventory_value: f64,
    pub total_investments: f64,
    pub total_partner_capital: f64,
    pub total_debtors: f64,
    pub total_expenses: f64,
    pub net_capital: f64,
}

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cars (
            car_number TEXT PRIMARY KEY,
            car_plate_num TEXT,
            car_province TEXT,
            chassis_number TEXT,
            car_model TEXT,
            car_year TEXT,
            car_name TEXT NOT NULL,
            color TEXT,
            details TEXT,
            purchase_price REAL DEFAULT 0.0,
            currency TEXT DEFAULT 'IQD',
            sale_currency TEXT DEFAULT 'IQD',
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
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_plate_num TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_province TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_model TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_year TEXT", []);
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
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN currency TEXT DEFAULT 'IQD'", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN selling_currency TEXT DEFAULT 'IQD'", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN paid_currency TEXT DEFAULT 'IQD'", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN remaining_currency TEXT DEFAULT 'IQD'", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN sale_currency TEXT DEFAULT 'IQD'", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN purchase_payment_type TEXT DEFAULT 'قاصه'", []);

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
            notes TEXT,
            currency TEXT DEFAULT 'IQD',
            payment_type TEXT DEFAULT 'قاصه'
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cash_register (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            notes TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            time TEXT DEFAULT '00:00',
            notes TEXT,
            currency TEXT DEFAULT 'IQD'
        )",
        [],
    )?;

    // add time column if upgrading
    let _ = conn.execute("ALTER TABLE cash_register ADD COLUMN time TEXT DEFAULT '00:00'", []);
    let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN time TEXT DEFAULT '00:00'", []);
    let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN currency TEXT DEFAULT 'IQD'", []);
    let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN payment_type TEXT DEFAULT 'قاصه'", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN purchase_time TEXT DEFAULT '00:00'", []);
    let _ = conn.execute("ALTER TABLE expenses ADD COLUMN currency TEXT DEFAULT 'IQD'", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN sale_time TEXT DEFAULT '00:00'", []);

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
    province: String,
    chassis: String,
    model: String,
    year: String,
    name: String,
    color: String,
    details: String,
    purchase: f64,
    currency: Option<String>,
    sale_currency: Option<String>,
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
    purchase_payment_type: Option<String>,
    old_num: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let plate_num = num.trim();
    let province = province.trim();
    let car_number = if province.is_empty() {
        plate_num.to_string()
    } else {
        format!("{plate_num} {province}")
    };
    let old_num = old_num.unwrap_or_default();
    let old_num = old_num.trim();

    if !old_num.is_empty() && old_num != car_number {
        db.execute("DELETE FROM cars WHERE car_number = ?1", [old_num])
            .map_err(|e| e.to_string())?;
    }

    // INSERT with main fields
    db.execute(
        "INSERT OR REPLACE INTO cars (
            car_number, car_plate_num, car_province, chassis_number,
            car_model, car_year, car_name, color, details, 
            purchase_price, currency, sale_currency,
            selling_price, status,
            payment_type, cash_price, amount_paid, amount_remaining,
            installment_months, monthly_payment, purchase_payment_type
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            car_number.as_str(),
            plate_num,
            province,
            chassis.trim(),
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
        ],
    )
    .map_err(|e| e.to_string())?;

    // UPDATE extra fields
    db.execute(
        "UPDATE cars SET buyer_name = ?1, buyer_phone = ?2, purchase_date = ?3, sale_date = ?4, delivery_date = ?5, first_payment_date = ?6, purchase_payment_type = ?7 WHERE car_number = ?8",
        (buyer_name, buyer_phone, purchase_date, sale_date, delivery_date, first_payment_date, purchase_payment_type, car_number.as_str()),
    )
    .map_err(|e| e.to_string())?;

    // تسجيل وقت الشراء — مرة واحدة فقط عند الإضافة الأولى (لا يُعاد عند البيع أو التعديل)
    db.execute(
        "UPDATE cars SET purchase_time = strftime('%H:%M', 'now', 'localtime') WHERE car_number = ?1 AND purchase_date IS NOT NULL AND purchase_date != '' AND (purchase_time IS NULL OR purchase_time = '' OR purchase_time = '00:00')",
        [car_number.as_str()],
    )
    .map_err(|e| e.to_string())?;
    // تسجيل وقت البيع — يُحدَّث فقط عند وجود تاريخ البيع
    db.execute(
        "UPDATE cars SET sale_time = strftime('%H:%M', 'now', 'localtime') WHERE car_number = ?1 AND sale_date IS NOT NULL AND sale_date != ''",
        [car_number.as_str()],
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
                    purchase_price, currency,
                    sale_currency,
                    selling_price, status,
                    payment_type, cash_price, amount_paid, amount_remaining,
                    installment_months, monthly_payment,
                    buyer_name, buyer_phone, purchase_date, sale_date,
                    delivery_date, first_payment_date, purchase_payment_type,
                    COALESCE(car_plate_num, car_number), COALESCE(car_province, ''),
                    COALESCE(car_model, car_name), COALESCE(car_year, '')
             FROM cars ORDER BY car_name",
        )
        .map_err(|e| e.to_string())?;

    let cars = stmt
        .query_map([], |row| {
            Ok(Car {
                car_number: row.get(0)?,
                car_plate_num: row.get(23)?,
                car_province: row.get(24)?,
                chassis_number: row.get(1)?,
                car_model: row.get(25)?,
                car_year: row.get(26)?,
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
    currency: Option<String>,
    payment_type: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, ?8)",
        (
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            notes,
            currency,
            payment_type,
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
    currency: Option<String>,
    payment_type: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE partner_transactions
         SET type = ?1, amount = ?2, date = ?3, time = strftime('%H:%M', 'now', 'localtime'), notes = ?4, currency = ?5, payment_type = ?6
         WHERE id = ?7 AND partner_name = ?8 AND kind = ?9",
        (
            type_.trim(),
            amount,
            date.trim(),
            notes,
            currency,
            payment_type,
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
            "SELECT id, partner_name, kind, type, amount, date, notes, currency, COALESCE(payment_type, 'قاصه')
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
                currency: row.get(7)?,
                payment_type: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(transactions)
}

#[tauri::command]
fn get_cash_register_entries(
    state: State<AppState>,
    payment_type: Option<String>,
) -> Result<Vec<CashRegisterEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut entries: Vec<CashRegisterEntry> = Vec::new();

    let filter_sql = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                " AND (c.purchase_payment_type = 'قاصه' OR c.purchase_payment_type = 'قاصة' OR c.purchase_payment_type IS NULL OR c.purchase_payment_type = '')".to_string()
            } else {
                format!(" AND c.purchase_payment_type = '{}'", pt.replace('\'', "''"))
            }
        }
        None => String::new(),
    };

    // 1. شراء السيارات (outflow)
    {
        let sql = format!(
            "SELECT c.purchase_date, COALESCE(c.purchase_time, '00:00'), c.car_name, c.car_number, c.purchase_price, COALESCE(c.currency, 'IQD')
             FROM cars c
             WHERE c.purchase_date IS NOT NULL AND c.purchase_price > 0{}
             ORDER BY c.purchase_date ASC",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, car_name, car_number, price, currency) = row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "شراء سيارة".to_string(),
                amount: -price,
                description: format!("{} - {}", car_name, car_number),
                notes: None,
                balance: 0.0,
                currency,
            });
        }
    }

    // 2. بيع السيارات كاش (inflow = المبلغ المستلم)
    {
        let sql = format!(
            "SELECT c.sale_date, COALESCE(c.sale_time, '00:00'), c.car_name, c.car_number, c.selling_price, COALESCE(c.sale_currency, 'IQD')
             FROM cars c
             WHERE c.status = 'مبيوعة' AND c.payment_type = 'كاش'
               AND c.sale_date IS NOT NULL AND c.sale_date != ''{}
             ORDER BY c.sale_date ASC",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, car_name, car_number, price, currency) = row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "بيع سيارة كاش".to_string(),
                amount: price,
                description: format!("{} - {}", car_name, car_number),
                notes: None,
                balance: 0.0,
                currency,
            });
        }
    }

    // 3. بيع السيارات آجل (inflow = المبلغ المستلم)
    {
        let sql = format!(
            "SELECT c.sale_date, COALESCE(c.sale_time, '00:00'), c.car_name, c.car_number, c.amount_paid, COALESCE(c.sale_currency, 'IQD')
             FROM cars c
             WHERE c.status = 'مبيوعة' AND c.payment_type = 'موعد'
               AND c.sale_date IS NOT NULL AND c.sale_date != ''{}
             ORDER BY c.sale_date ASC",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, car_name, car_number, amount_paid, currency) = row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "بيع سيارة آجل".to_string(),
                amount: amount_paid.unwrap_or(0.0),
                description: format!("{} - {}", car_name, car_number),
                notes: None,
                balance: 0.0,
                currency,
            });
        }
    }

    // 4. مقدمات السيارات بالتقسيط (inflow = المقدمة)
    {
        let sql = format!(
            "SELECT c.sale_date, COALESCE(c.sale_time, '00:00'), c.car_name, c.car_number, c.amount_paid, COALESCE(c.sale_currency, 'IQD')
             FROM cars c
             WHERE c.status = 'مبيوعة' AND c.payment_type = 'اقساط'
               AND c.sale_date IS NOT NULL AND c.sale_date != ''{}
             ORDER BY c.sale_date ASC",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, car_name, car_number, amount_paid, currency) = row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "مقدمة سيارة اقساط".to_string(),
                amount: amount_paid.unwrap_or(0.0),
                description: format!("{} - {}", car_name, car_number),
                notes: None,
                balance: 0.0,
                currency,
            });
        }
    }

    let filter_pt_sql = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                " AND (pt.payment_type = 'قاصه' OR pt.payment_type = 'قاصة' OR pt.payment_type IS NULL OR pt.payment_type = '')".to_string()
            } else {
                format!(" AND pt.payment_type = '{}'", pt.replace('\'', "''"))
            }
        }
        None => String::new(),
    };

    // 5. معاملات الشركاء والمستثمرين والمديونيات (المدفوعات فقط)
    {
        let sql = format!(
            "SELECT pt.date, COALESCE(pt.time, '00:00'), pt.kind, pt.type, pt.amount, pt.partner_name, pt.notes, COALESCE(pt.currency, 'IQD')
             FROM partner_transactions pt
             WHERE NOT (pt.kind = 'مطلوب' AND pt.type = 'سحب'){}
             ORDER BY pt.date ASC, pt.id ASC",
            filter_pt_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (date, time, kind, tx_type, amount, partner_name, notes, currency) =
                row.map_err(|e| e.to_string())?;
            let (type_, signed_amount) = match (kind.as_str(), tx_type.as_str()) {
                ("شريك", "ايداع") => ("ايداع شريك", amount),
                ("شريك", "سحب") => ("سحب شريك", -amount),
                ("مستثمر", "ايداع") => ("ايداع مستثمر", amount),
                ("مستثمر", "سحب") => ("سحب مستثمر", -amount),
                ("مطلوب", "ايداع") => ("تسديد دين", amount),
                _ => ("" , 0.0),
            };
            if type_.is_empty() { continue; }
            entries.push(CashRegisterEntry {
                id: 0,
                date,
                time,
                type_: type_.to_string(),
                amount: signed_amount,
                description: partner_name,
                notes,
                balance: 0.0,
                currency,
            });
        }
    }

    let include_others = match &payment_type {
        Some(pt) => pt == "قاصه" || pt == "قاصة",
        None => true,
    };

    if include_others {
        // 6. المصروفات (outflow)
        {
            let mut stmt = db
                .prepare(
                    "SELECT e.date, COALESCE(e.time, '00:00'), e.description, e.amount, e.notes, COALESCE(e.currency, 'IQD')
                     FROM expenses e
                     ORDER BY e.date ASC, e.id ASC",
                )
                .map_err(|e| e.to_string())?;

            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, f64>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                })
                .map_err(|e| e.to_string())?;

            for row in rows {
                let (date, time, description, amount, notes, currency) = row.map_err(|e| e.to_string())?;
                entries.push(CashRegisterEntry {
                    id: 0,
                    date,
                    time,
                    type_: "مصروف".to_string(),
                    amount: -amount,
                    description,
                    notes,
                    balance: 0.0,
                    currency,
                });
            }
        }
    }

    // ترتيب تصاعدي (الأقدم أولاً) لحساب الرصيد
    entries.sort_by(|a, b| a.date.cmp(&b.date).then_with(|| a.time.cmp(&b.time)).then_with(|| a.id.cmp(&b.id)));

    // رصيد منفصل لكل عملة
    let mut iqd_running = 0.0;
    let mut usd_running = 0.0;
    for entry in entries.iter_mut() {
        if entry.currency == "USD" {
            usd_running += entry.amount;
            entry.balance = usd_running;
        } else {
            iqd_running += entry.amount;
            entry.balance = iqd_running;
        }
    }

    // إعادة ترقيم
    for (i, entry) in entries.iter_mut().enumerate() {
        entry.id = (i + 1) as i64;
    }

    Ok(entries)
}

#[tauri::command]
fn add_cash_register_entry(
    state: State<AppState>,
    date: String,
    time: String,
    type_: String,
    amount: f64,
    description: String,
    notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO cash_register (date, time, type, amount, description, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (date.trim(), time.trim(), type_.trim(), amount, description.trim(), notes),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_cash_register_entry(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM cash_register WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_cash_register_balance(state: State<AppState>) -> Result<f64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut balance = 0.0;

    // شراء السيارات (outflow)
    {
        let mut stmt = db
            .prepare(
                "SELECT c.purchase_price
                 FROM cars c
                 WHERE c.purchase_date IS NOT NULL AND c.purchase_price > 0",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get::<_, f64>(0)).map_err(|e| e.to_string())?;
        for row in rows {
            balance -= row.map_err(|e| e.to_string())?;
        }
    }

    // بيع السيارات (inflow)
    for payment_type in &["كاش", "موعد", "اقساط"] {
        let amount_col = if *payment_type == "كاش" { "selling_price" } else { "amount_paid" };
        let sql = format!(
            "SELECT {} FROM cars c
             WHERE c.status = 'مبيوعة' AND c.payment_type = ?1
               AND c.sale_date IS NOT NULL AND c.sale_date != ''",
            amount_col
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([*payment_type], |row| row.get::<_, Option<f64>>(0))
            .map_err(|e| e.to_string())?;
        for row in rows {
            balance += row.map_err(|e| e.to_string())?.unwrap_or(0.0);
        }
    }

    // معاملات الشركاء والمستثمرين والمديونيات (المدفوعات فقط)
    {
        let mut stmt = db
            .prepare(
                "SELECT pt.kind, pt.type, pt.amount
                 FROM partner_transactions pt
                 WHERE NOT (pt.kind = 'مطلوب' AND pt.type = 'سحب')",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (kind, tx_type, amount) = row.map_err(|e| e.to_string())?;
            match (kind.as_str(), tx_type.as_str()) {
                ("شريك", "ايداع") | ("مستثمر", "ايداع") | ("مطلوب", "ايداع") => balance += amount,
                ("شريك", "سحب") | ("مستثمر", "سحب") => balance -= amount,
                _ => {}
            }
        }
    }

    // المصروفات (outflow)
    {
        let mut stmt = db
            .prepare("SELECT COALESCE(SUM(amount), 0) FROM expenses")
            .map_err(|e| e.to_string())?;
        let total: f64 = stmt
            .query_row([], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        balance -= total;
    }

    Ok(balance)
}

#[tauri::command]
fn add_expense(
    state: State<AppState>,
    description: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO expenses (description, amount, date, time, notes, currency)
         VALUES (?1, ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5)",
        (description.trim(), amount, date.trim(), notes, currency),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_expenses(state: State<AppState>) -> Result<Vec<ExpenseEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, description, amount, date, COALESCE(time, '00:00'), notes, currency FROM expenses ORDER BY id ASC")
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
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(expenses)
}

#[tauri::command]
fn delete_expense(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM expenses WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_financial_summary(
    state: State<AppState>,
    payment_type: Option<String>,
) -> Result<FinancialSummary, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut iqd_balance = 0.0;
    let mut usd_balance = 0.0;

    let filter_sql = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                " AND (c.purchase_payment_type = 'قاصه' OR c.purchase_payment_type = 'قاصة' OR c.purchase_payment_type IS NULL OR c.purchase_payment_type = '')".to_string()
            } else {
                format!(" AND c.purchase_payment_type = '{}'", pt.replace('\'', "''"))
            }
        }
        None => String::new(),
    };

    let filter_pt_sql = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                " AND (pt.payment_type = 'قاصه' OR pt.payment_type = 'قاصة' OR pt.payment_type IS NULL OR pt.payment_type = '')".to_string()
            } else {
                format!(" AND pt.payment_type = '{}'", pt.replace('\'', "''"))
            }
        }
        None => String::new(),
    };

    // 1. رصيد القاصة (IQD & USD) - مشتريات السيارات
    {
        let sql = format!(
            "SELECT c.currency, c.purchase_price FROM cars c WHERE c.purchase_date IS NOT NULL AND c.purchase_price > 0{}",
            filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let purchase_rows: Vec<(String, f64)> = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (currency, price) in &purchase_rows {
            if currency == "USD" { usd_balance -= price; } else { iqd_balance -= price; }
        }
    }

    // بيع السيارات
    for (sale_type, amount_col) in [("كاش", "selling_price"), ("موعد", "amount_paid"), ("اقساط", "amount_paid")] {
        let sql = format!(
            "SELECT COALESCE(c.sale_currency, 'IQD'), c.{} FROM cars c WHERE c.status = 'مبيوعة' AND c.payment_type = ?1 AND c.sale_date IS NOT NULL AND c.sale_date != ''{}",
            amount_col, filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let sale_rows: Vec<(String, f64)> = stmt
            .query_map([sale_type], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (currency, amount) in &sale_rows {
            if currency == "USD" { usd_balance += amount; } else { iqd_balance += amount; }
        }
    }

    // معاملات الشركاء والمستثمرين
    {
        let sql = format!(
            "SELECT pt.kind, pt.type, pt.amount, COALESCE(pt.currency, 'IQD')
             FROM partner_transactions pt
             WHERE NOT (pt.kind = 'مطلوب' AND pt.type = 'سحب'){}",
            filter_pt_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let tx_rows: Vec<(String, String, f64, String)> = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?, row.get::<_, String>(3)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (kind, tx_type, amount, currency) in &tx_rows {
            let signed = match (kind.as_str(), tx_type.as_str()) {
                ("شريك", "ايداع") | ("مستثمر", "ايداع") | ("مطلوب", "ايداع") => *amount,
                ("شريك", "سحب") | ("مستثمر", "سحب") => -*amount,
                _ => 0.0,
            };
            if currency == "USD" { usd_balance += signed; } else { iqd_balance += signed; }
        }
    }

    // المصروفات
    let include_others = match &payment_type {
        Some(pt) => pt == "قاصه" || pt == "قاصة",
        None => true,
    };
    if include_others {
        let sql = "SELECT COALESCE(SUM(amount), 0), COALESCE(currency, 'IQD') FROM expenses GROUP BY currency";
        let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
        let exp_rows: Vec<(f64, String)> = stmt
            .query_map([], |row| Ok((row.get::<_, f64>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (total, currency) in &exp_rows {
            if currency == "USD" { usd_balance -= total; } else { iqd_balance -= total; }
        }
    }

    // 2. قيمة المخزون (مجموع سعر شراء السيارات المتوفرة)
    let inv_sql = format!(
        "SELECT COALESCE(SUM(purchase_price), 0) FROM cars WHERE status = 'متوفرة'{}",
        filter_sql
    );
    let inventory_value: f64 = db
        .query_row(&inv_sql, [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // 3. إجمالي استثمارات المستثمرين
    let total_investments: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total_amount), 0) FROM partners WHERE kind = 'مستثمر' AND total_amount > 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 4. رأس مال الشركاء
    let total_partner_capital: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total_amount), 0) FROM partners WHERE kind = 'شريك'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 5. إجمالي ديون العملاء
    let total_debtors: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total_amount), 0) FROM partners WHERE kind = 'مطلوب' AND total_amount > 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 6. إجمالي المصروفات
    let total_expenses: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM expenses",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 7. صافي رأس المال (النقد + المخزون + ديون العملاء - استثمارات المستثمرين)
    let net_capital = iqd_balance + inventory_value + total_debtors - total_investments;

    Ok(FinancialSummary {
        iqd_balance,
        usd_balance,
        inventory_value,
        total_investments,
        total_partner_capital,
        total_debtors,
        total_expenses,
        net_capital,
    })
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
            get_cash_register_entries,
            get_cash_register_balance,
            add_cash_register_entry,
            delete_cash_register_entry,
            add_expense,
            get_expenses,
            delete_expense,
            get_financial_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
