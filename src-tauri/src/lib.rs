use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::{env, sync::Mutex};
use tauri::{Manager, State};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CarPartner {
    pub car_number: String,
    pub partner_name: String,
    pub amount: f64,
    pub currency: String,
    pub kind: Option<String>,
}

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
    pub purchase_type: Option<String>,
    pub financer_name: Option<String>,
    pub commission_type: Option<String>,
    pub commission_value: Option<f64>,
    pub car_partners: Option<Vec<CarPartner>>,
    pub expenses_sum: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Partner {
    pub partner_name: String,
    pub phone: String,
    pub total_amount: f64,
    pub kind: String,
    pub total_withdrawals: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UnifiedAccount {
    pub partner_name: String,
    pub phone: Option<String>,
    pub iqd_balance: f64,
    pub usd_balance: f64,
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
    pub time: Option<String>,
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
    pub car_number: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CarExpenseRecord {
    pub id: i64,
    pub car_number: String,
    pub description: String,
    pub amount: f64,
    pub date: String,
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Agency {
    pub id: i64,
    pub old_agent_name: String,
    pub car_number: String,
    pub car_model: String,
    pub color: String,
    pub new_agent_name: String,
    pub phone: String,
    pub amount_usd: f64,
    pub amount_iqd: f64,
    pub notes: String,
    pub date: String,
    pub time: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgencyTransaction {
    pub id: i64,
    pub agency_id: i64,
    pub date: String,
    pub time: String,
    #[serde(rename = "type_")]
    pub type_: String,
    pub amount: f64,
    pub currency: Option<String>,
    pub notes: Option<String>,
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
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN selling_currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN paid_currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN remaining_currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN sale_currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN purchase_payment_type TEXT DEFAULT 'قاصه'",
        [],
    );

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
    let _ = conn.execute(
        "ALTER TABLE cash_register ADD COLUMN time TEXT DEFAULT '00:00'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN time TEXT DEFAULT '00:00'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN payment_type TEXT DEFAULT 'قاصه'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN purchase_time TEXT DEFAULT '00:00'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN currency TEXT DEFAULT 'IQD'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN sale_time TEXT DEFAULT '00:00'",
        [],
    );

    // new fields
    let _ = conn.execute(
        "ALTER TABLE cars ADD COLUMN purchase_type TEXT DEFAULT 'كاش'",
        [],
    );
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN financer_name TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_type TEXT", []);
    let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_value REAL", []);
    let _ = conn.execute("ALTER TABLE expenses ADD COLUMN car_number TEXT", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS car_partners (
            car_number TEXT NOT NULL,
            partner_name TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'IQD',
            kind TEXT NOT NULL DEFAULT 'شريك',
            PRIMARY KEY (car_number, partner_name)
        )",
        [],
    )?;

    let _ = conn.execute(
        "ALTER TABLE car_partners ADD COLUMN kind TEXT DEFAULT 'شريك'",
        [],
    );

    conn.execute(
        "CREATE TABLE IF NOT EXISTS car_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_number TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            currency TEXT DEFAULT 'IQD',
            time TEXT DEFAULT (strftime('%H:%M', 'now', 'localtime'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            old_agent_name TEXT NOT NULL,
            car_number TEXT NOT NULL DEFAULT '',
            car_model TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            new_agent_name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            amount_usd REAL NOT NULL DEFAULT 0.0,
            amount_iqd REAL NOT NULL DEFAULT 0.0,
            notes TEXT NOT NULL DEFAULT '',
            date TEXT NOT NULL,
            time TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agency_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agency_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL DEFAULT '00:00',
            type_ TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'IQD',
            notes TEXT,
            FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
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

    if version < 2 {
        let _ = conn.execute(
            "ALTER TABLE cars ADD COLUMN purchase_type TEXT DEFAULT 'كاش'",
            [],
        );
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN financer_name TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_type TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_value REAL", []);
        let _ = conn.execute("ALTER TABLE expenses ADD COLUMN car_number TEXT", []);
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS car_partners (
                car_number TEXT NOT NULL,
                partner_name TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'IQD',
                kind TEXT NOT NULL DEFAULT 'شريك',
                PRIMARY KEY (car_number, partner_name)
            )",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE car_partners ADD COLUMN kind TEXT DEFAULT 'شريك'",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (2)", []);
    }

    if version < 3 {
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS car_expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                car_number TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                date TEXT NOT NULL,
                currency TEXT DEFAULT 'IQD',
                time TEXT DEFAULT (strftime('%H:%M', 'now', 'localtime'))
            )",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (3)", []);
    }

    // Performance indexes
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cars_purchase_type ON cars(purchase_type)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner ON partner_transactions(partner_name, kind)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_partner_transactions_date ON partner_transactions(date)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cash_register_date ON cash_register(date)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cash_register_type ON cash_register(type)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_car_expenses_car ON car_expenses(car_number)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_car_partners_car ON car_partners(car_number)", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cars_plate ON cars(car_plate_num)", []);

    Ok(())
}

#[allow(clippy::too_many_arguments)]
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
    purchase_type: Option<String>,
    financer_name: Option<String>,
    commission_type: Option<String>,
    commission_value: Option<f64>,
    car_partners: Option<Vec<CarPartner>>,
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

    // الاستعلام عن وقت الشراء ووقت البيع الحاليين لحفظهما قبل حذف أو استبدال السجل، وكذلك الاسم ورقم الشاصي القديمين للتحديث
    let query_num = if !old_num.is_empty() {
        old_num
    } else {
        car_number.as_str()
    };
    let (existing_purchase_time, existing_sale_time, old_name, old_chassis): (Option<String>, Option<String>, Option<String>, Option<String>) = db
        .query_row(
            "SELECT purchase_time, sale_time, car_name, chassis_number FROM cars WHERE car_number = ?1",
            [query_num],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap_or((None, None, None, None));

    if !old_num.is_empty() && old_num != car_number {
        db.execute("DELETE FROM cars WHERE car_number = ?1", [old_num])
            .map_err(|e| e.to_string())?;
        db.execute("DELETE FROM car_partners WHERE car_number = ?1", [old_num])
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
            installment_months, monthly_payment, purchase_payment_type,
            purchase_type, financer_name, commission_type, commission_value
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)",
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
            purchase_type.as_deref().unwrap_or("كاش"),
            financer_name,
            commission_type,
            commission_value,
        ],
    )
    .map_err(|e| e.to_string())?;

    // تحديث الشركاء المساهمين
    db.execute(
        "DELETE FROM car_partners WHERE car_number = ?1",
        [car_number.as_str()],
    )
    .map_err(|e| e.to_string())?;

    if purchase_type.as_deref() == Some("شراكه") {
        if let Some(partners) = &car_partners {
            for partner in partners {
                let p_kind = partner.kind.as_deref().unwrap_or("شريك");
                db.execute(
                    "INSERT INTO car_partners (car_number, partner_name, amount, currency, kind) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        car_number.as_str(),
                        partner.partner_name.trim(),
                        partner.amount,
                        partner.currency.trim(),
                        p_kind,
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // جلب قائمة الشركاء الفعليين من نوع 'شريك' باستثناء 'فجر الوادي'
    let mut partners_stmt = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'")
        .map_err(|e| e.to_string())?;
    let mut partners_list = partners_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;

    if partners_list.is_empty() {
        partners_list.push("فجر الوادي".to_string());
    }
    let n_partners = partners_list.len() as f64;

    let clean_name = name.trim();
    let clean_chassis = chassis.trim();
    let new_purchase_note = format!("سحب شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let new_debt_note = format!("تمويل شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let new_sale_note = format!("ايداع بيع سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let new_expense_prefix = format!("سحب مصروف سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");

    if let Some(ref o_name) = old_name {
        let o_chassis = old_chassis.unwrap_or_default();
        let old_purchase_note = format!("سحب شراء سيارة {} {}", o_name.trim(), o_chassis.trim())
            .trim()
            .replace("  ", " ");
        let old_debt_note = format!("تمويل شراء سيارة {} {}", o_name.trim(), o_chassis.trim())
            .trim()
            .replace("  ", " ");
        let old_sale_note = format!("ايداع بيع سيارة {} {}", o_name.trim(), o_chassis.trim())
            .trim()
            .replace("  ", " ");
        let old_expense_prefix = format!("سحب مصروف سيارة {} {}", o_name.trim(), o_chassis.trim())
            .trim()
            .replace("  ", " ");

        if old_purchase_note != new_purchase_note {
            db.execute(
                "UPDATE partner_transactions SET notes = ?1 WHERE notes = ?2",
                [&new_purchase_note, &old_purchase_note],
            )
            .map_err(|e| e.to_string())?;
        }

        if old_debt_note != new_debt_note {
            db.execute(
                "UPDATE partner_transactions SET notes = ?1 WHERE notes = ?2",
                [&new_debt_note, &old_debt_note],
            )
            .map_err(|e| e.to_string())?;
        }

        if old_sale_note != new_sale_note {
            db.execute(
                "UPDATE partner_transactions SET notes = ?1 WHERE notes = ?2",
                [&new_sale_note, &old_sale_note],
            )
            .map_err(|e| e.to_string())?;
        }

        if old_expense_prefix != new_expense_prefix {
            db.execute(
                "UPDATE partner_transactions 
                 SET notes = ?1 || SUBSTR(notes, LENGTH(?2) + 1)
                 WHERE notes LIKE ?3",
                params![
                    &new_expense_prefix,
                    &old_expense_prefix,
                    format!("{}%", old_expense_prefix)
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // حذف حركات الشراء القديمة ثم إعادة إنشائها حسب نوع الشراء الحالي
    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1 OR notes = ?2",
        params![&new_purchase_note, &new_debt_note],
    )
    .map_err(|e| e.to_string())?;

    if purchase_type.as_deref() == Some("شراكه") {
        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let total_amount = purchase + expenses_sum;
        let total_partner_amounts: f64 = car_partners
            .as_ref()
            .map(|p| p.iter().map(|x| x.amount).sum())
            .unwrap_or(0.0);
        if let Some(partners) = &car_partners {
            for partner in partners {
                let p_name = partner.partner_name.trim();
                let share = if total_partner_amounts > 0.0 {
                    (partner.amount / total_partner_amounts) * total_amount
                } else {
                    total_amount / partners.len() as f64
                };
                if p_name == "فجر الوادي" {
                    let amount_per_partner = share / n_partners;
                    for sub_p in &partners_list {
                        db.execute(
                        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                        [sub_p],
                    )
                    .map_err(|e| e.to_string())?;

                        let note = format!("سحب شراء سيارة {} {}", name.trim(), chassis.trim())
                            .trim()
                            .replace("  ", " ");

                        db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                         VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
                        params![
                            sub_p,
                            amount_per_partner,
                            purchase_date.as_deref().unwrap_or(""),
                            note,
                            partner.currency.trim(),
                            purchase_payment_type.as_deref().unwrap_or("قاصه"),
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                    }
                } else {
                    let p_kind = partner.kind.as_deref().unwrap_or("شريك");
                    db.execute(
                    "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                    params![p_name, p_kind],
                )
                .map_err(|e| e.to_string())?;

                    let note = format!("سحب شراء سيارة {} {}", name.trim(), chassis.trim())
                        .trim()
                        .replace("  ", " ");

                    db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, ?7)",
                    params![
                        p_name,
                        p_kind,
                        share,
                        purchase_date.as_deref().unwrap_or(""),
                        note,
                        partner.currency.trim(),
                        purchase_payment_type.as_deref().unwrap_or("قاصه"),
                    ],
                )
                .map_err(|e| e.to_string())?;
                }
            }
        }
    } else if purchase_type.as_deref() == Some("كاش") {
        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let total_amount = purchase + expenses_sum;
        let amount_per_partner = total_amount / n_partners;
        for sub_p in &partners_list {
            db.execute(
            "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
            [sub_p],
        )
        .map_err(|e| e.to_string())?;

            let note = format!("سحب شراء سيارة {} {}", name.trim(), chassis.trim())
                .trim()
                .replace("  ", " ");

            db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
            params![
                sub_p,
                amount_per_partner,
                purchase_date.as_deref().unwrap_or(""),
                note,
                currency.as_deref().unwrap_or("IQD"),
                purchase_payment_type.as_deref().unwrap_or("قاصه"),
            ],
        )
        .map_err(|e| e.to_string())?;
        }
    } else if purchase_type.as_deref() == Some("دين") || purchase_type.as_deref() == Some("شركة") {
        let p_kind = if purchase_type.as_deref() == Some("دين") { "ممول" } else { "شركة" };
        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let total_amount = purchase + expenses_sum;
        if let Some(f_name) = &financer_name {
            let f_name = f_name.trim();
            if !f_name.is_empty() {
                // أدخل المعاملة مباشرة بالاسم والنوع الحالي الصحيح.
                // الحذف تمّ أعلاه بـ notes، فلا حاجة لمس جدول partners.
                let note = format!("سحب شراء سيارة {} {}", name.trim(), chassis.trim())
                    .trim()
                    .replace("  ", " ");

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, ?7)",
                    params![
                        f_name,
                        p_kind,
                        total_amount,
                        purchase_date.as_deref().unwrap_or(""),
                        note,
                        currency.as_deref().unwrap_or("IQD"),
                        purchase_payment_type.as_deref().unwrap_or("قاصه"),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // حذف وإعادة توزيع الأرباح ورأس المال عند البيع
    let sale_note = format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
        .trim()
        .replace("  ", " ");
    let debt_sale_prefix = format!("ارجاع (رأس المال + الأرباح) لشراكة سيارة {}", name.trim())
        .trim()
        .replace("  ", " ");

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1 OR notes LIKE ?2",
        params![&sale_note, format!("{}%", debt_sale_prefix)],
    )
    .map_err(|e| e.to_string())?;

    if status == "مبيوعة" {
        if purchase_type.as_deref() == Some("شراكه") {
            let profit = selling - purchase;
            if let Some(partners) = &car_partners {
                for partner in partners {
                    let p_name = partner.partner_name.trim();
                    let mut partner_profit = 0.0;
                    if purchase > 0.0 {
                        partner_profit = (partner.amount / purchase) * profit;
                    }
                    let total_return = partner.amount + partner_profit;

                    if p_name == "فجر الوادي" {
                        let return_per_partner = total_return / n_partners;
                        for sub_p in &partners_list {
                            let note =
                                format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
                                    .trim()
                                    .replace("  ", " ");

                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'ايداع بيع سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
                                params![
                                    sub_p,
                                    return_per_partner,
                                    sale_date.as_deref().unwrap_or(""),
                                    note,
                                    sale_currency.as_deref().unwrap_or("IQD"),
                                    payment_type.as_deref().unwrap_or("قاصه"),
                                ],
                            )
                            .map_err(|e| e.to_string())?;
                        }
                    } else {
                        let p_kind = partner.kind.as_deref().unwrap_or("شريك");

                        let tx_type = if p_kind == "مطلوب" {
                            "سحب ارباح"
                        } else {
                            "ايداع بيع سيارة"
                        };
                        let note = if p_kind == "مطلوب" {
                            format!(
                                "ارجاع (رأس المال + الأرباح) لشراكة سيارة {} (رأس المال: {}, الأرباح: {})",
                                name.trim(),
                                partner.amount,
                                partner_profit
                            ).trim().replace("  ", " ")
                        } else {
                            format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
                                .trim()
                                .replace("  ", " ")
                        };

                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, ?8)",
                            params![
                                p_name,
                                p_kind,
                                tx_type,
                                total_return,
                                sale_date.as_deref().unwrap_or(""),
                                note,
                                sale_currency.as_deref().unwrap_or("IQD"),
                                payment_type.as_deref().unwrap_or("قاصه"),
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                }
            }
        } else if purchase_type.as_deref() == Some("كاش") {
            let total_return = selling;
            let return_per_partner = total_return / n_partners;
            for sub_p in &partners_list {
                let note = format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
                    .trim()
                    .replace("  ", " ");

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, 'شريك', 'ايداع بيع سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
                    params![
                        sub_p,
                        return_per_partner,
                        sale_date.as_deref().unwrap_or(""),
                        note,
                        sale_currency.as_deref().unwrap_or("IQD"),
                        payment_type.as_deref().unwrap_or("قاصه"),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
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
        "UPDATE cars SET buyer_name = ?1, buyer_phone = ?2, purchase_date = ?3, sale_date = ?4, delivery_date = ?5, first_payment_date = ?6, purchase_payment_type = ?7, purchase_time = ?8, sale_time = ?9 WHERE car_number = ?10",
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
            car_number.as_str(),
        ),
    )
    .map_err(|e| e.to_string())?;

    // تسجيل وقت الشراء — مرة واحدة فقط عند الإضافة الأولى (لا يُعاد عند البيع أو التعديل)
    db.execute(
        "UPDATE cars SET purchase_time = strftime('%H:%M', 'now', 'localtime') WHERE car_number = ?1 AND purchase_date IS NOT NULL AND purchase_date != '' AND (purchase_time IS NULL OR purchase_time = '' OR purchase_time = '00:00')",
        [car_number.as_str()],
    )
    .map_err(|e| e.to_string())?;
    // تسجيل وقت البيع — يُحدَّث فقط عند وجود تاريخ البيع ولم يكن مسجلاً سابقاً
    db.execute(
        "UPDATE cars SET sale_time = strftime('%H:%M', 'now', 'localtime') WHERE car_number = ?1 AND sale_date IS NOT NULL AND sale_date != '' AND (sale_time IS NULL OR sale_time = '' OR sale_time = '00:00')",
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
                    COALESCE(car_model, car_name), COALESCE(car_year, ''),
                    purchase_type, financer_name, commission_type, commission_value
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
                purchase_type: row.get(27)?,
                financer_name: row.get(28)?,
                commission_type: row.get(29)?,
                commission_value: row.get(30)?,
                car_partners: None,
                expenses_sum: None,
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

        // Fetch sum of expenses for this car
        let mut exp_stmt = db
            .prepare("SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1")
            .map_err(|e| e.to_string())?;
        let expenses_sum: f64 = exp_stmt
            .query_row([&car.car_number], |row| row.get(0))
            .unwrap_or(0.0);
        car.expenses_sum = Some(expenses_sum);

        cars_with_partners.push(car);
    }

    Ok(cars_with_partners)
}

#[tauri::command]
fn delete_car(state: State<AppState>, num: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let car_number = num.trim();

    // Get car details before deleting it
    let (car_name, chassis_number): (String, Option<String>) = db
        .query_row(
            "SELECT car_name, chassis_number FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((String::new(), None));
    let chassis_str = chassis_number.unwrap_or_default();
    let clean_name = car_name.trim();
    let clean_chassis = chassis_str.trim();

    db.execute("DELETE FROM cars WHERE car_number = ?1", [car_number])
        .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM car_partners WHERE car_number = ?1",
        [car_number],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM car_expenses WHERE car_number = ?1",
        [car_number],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM expenses WHERE car_number = ?1",
        [car_number],
    )
    .map_err(|e| e.to_string())?;

    // Also delete any partner transactions associated with it using notes matching the formats
    let purchase_note = format!("سحب شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let debt_note = format!("تمويل شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let sale_note = format!("ايداع بيع سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let expense_prefix = format!("سحب مصروف سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let debt_sale_prefix = format!("ارجاع (رأس المال + الأرباح) لشراكة سيارة {}", clean_name)
        .trim()
        .replace("  ", " ");

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1",
        [purchase_note],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1",
        [debt_note],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1",
        [sale_note],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE notes LIKE ?1",
        [format!("{}%", expense_prefix)],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE notes LIKE ?1",
        [format!("{}%", debt_sale_prefix)],
    )
    .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;
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
    let name = name.trim();
    let phone = phone.trim();
    let kind = kind.trim();

    let exists: bool = db
        .query_row(
            "SELECT COUNT(*) FROM partners WHERE partner_name = ?1 AND kind = ?2",
            (name, kind),
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if exists {
        db.execute(
            "UPDATE partners SET phone = ?1 WHERE partner_name = ?2 AND kind = ?3",
            (phone, name, kind),
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let exists_with_other_kind: bool = db
        .query_row(
            "SELECT COUNT(*) FROM partners WHERE partner_name = ?1 AND kind = ?2",
            [name, kind],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if !exists_with_other_kind {
        db.execute(
            "INSERT INTO partners (partner_name, phone, total_amount, kind)
             VALUES (?1, ?2, 0.0, ?3)",
            (name, phone, kind),
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn get_partners(state: State<AppState>) -> Result<Vec<Partner>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT p.partner_name, p.phone, p.total_amount, p.kind,
                    COALESCE((SELECT SUM(amount) FROM partner_transactions WHERE partner_name = p.partner_name AND kind = p.kind AND type LIKE 'سحب%'), 0.0) AS total_withdrawals
             FROM partners p ORDER BY p.partner_name",
        )
        .map_err(|e| e.to_string())?;

    let partners = stmt
        .query_map([], |row| {
            Ok(Partner {
                partner_name: row.get(0)?,
                phone: row.get(1)?,
                total_amount: row.get(2)?,
                kind: row.get(3)?,
                total_withdrawals: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(partners)
}

#[tauri::command]
fn get_unified_accounts(state: State<AppState>) -> Result<Vec<UnifiedAccount>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT 
            p.partner_name,
            p.phone,
            COALESCE(SUM(CASE 
                WHEN (t.currency = 'IQD' OR t.currency IS NULL OR t.currency = '') 
                     AND (t.type LIKE 'سحب%') THEN t.amount 
                WHEN (t.currency = 'IQD' OR t.currency IS NULL OR t.currency = '') 
                     AND (t.type LIKE 'ايداع%') 
                     AND (p.kind = 'ممول' OR t.notes IS NULL OR (t.notes NOT LIKE '%دفعة أولى%' AND t.notes NOT LIKE '%قسط%' AND t.notes NOT LIKE '%مؤجل%')) THEN -t.amount 
                ELSE 0.0 END), 0.0) AS iqd_balance,
            COALESCE(SUM(CASE 
                WHEN t.currency = 'USD' 
                     AND (t.type LIKE 'سحب%') THEN t.amount 
                WHEN t.currency = 'USD' 
                     AND (t.type LIKE 'ايداع%') 
                     AND (p.kind = 'ممول' OR t.notes IS NULL OR (t.notes NOT LIKE '%دفعة أولى%' AND t.notes NOT LIKE '%قسط%' AND t.notes NOT LIKE '%مؤجل%')) THEN -t.amount 
                ELSE 0.0 END), 0.0) AS usd_balance,
            p.kind
         FROM partners p
         LEFT JOIN partner_transactions t ON p.partner_name = t.partner_name AND p.kind = t.kind
         WHERE p.kind = 'مطلوب' OR p.kind = 'ممول' OR p.kind = 'شركة'
         GROUP BY p.partner_name, p.phone, p.kind
         ORDER BY p.partner_name"
    ).map_err(|e| e.to_string())?;

    let accounts = stmt
        .query_map([], |row| {
            Ok(UnifiedAccount {
                partner_name: row.get(0)?,
                phone: row.get(1)?,
                iqd_balance: row.get(2)?,
                usd_balance: row.get(3)?,
                kind: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(accounts)
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

fn recalculate_partner_total(
    db: &Connection,
    partner_name: &str,
    kind: &str,
) -> Result<(), String> {
    let query = if kind.trim() == "مطلوب" {
        "UPDATE partners
         SET total_amount = COALESCE((
             SELECT SUM(CASE 
                 WHEN (type LIKE 'سحب%') THEN amount 
                 WHEN (type LIKE 'ايداع%') AND (notes IS NULL OR (notes NOT LIKE '%دفعة أولى%' AND notes NOT LIKE '%قسط%' AND notes NOT LIKE '%مؤجل%')) THEN -amount 
                 ELSE 0.0 
             END)
             FROM partner_transactions
             WHERE partner_name = ?1 AND kind = ?2
         ), 0.0)
         WHERE partner_name = ?1 AND kind = ?2"
    } else {
        "UPDATE partners
         SET total_amount = COALESCE((
             SELECT SUM(CASE WHEN type LIKE 'ايداع%' THEN amount WHEN type LIKE 'سحب%' THEN -amount ELSE 0 END)
             FROM partner_transactions
             WHERE partner_name = ?1 AND kind = ?2
         ), 0.0)
         WHERE partner_name = ?1 AND kind = ?2"
    };

    db.execute(query, (partner_name.trim(), kind.trim()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn recalculate_all_partners(db: &Connection) -> Result<(), String> {
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

    let target_exists: bool = db
        .query_row(
            "SELECT COUNT(*) FROM partners WHERE partner_name = ?1 AND kind = ?2",
            (&name, &kind),
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if target_exists {
        return Err(format!("يوجد حساب بالفعل باسم '{}' ونوع '{}'", name, kind));
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

#[allow(clippy::too_many_arguments)]
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
    let is_financier_repayment = (kind.trim() == "ممول" && type_.trim().starts_with("سحب"))
        || (kind.trim() == "مطلوب"
            && type_.trim().starts_with("ايداع")
            && notes
                .as_deref()
                .unwrap_or("")
                .contains("ممول"));
    let tx_payment_type = if is_financier_repayment {
        Some("ممول")
    } else {
        payment_type.as_deref()
    };

    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, ?8)",
        (
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            notes.as_deref(),
            currency.as_deref(),
            tx_payment_type,
        ),
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;
    if is_financier_repayment {
        distribute_financier_repayment_to_partners(
            &db,
            partner_name.trim(),
            amount,
            date.trim(),
            currency.as_deref().unwrap_or("IQD"),
            notes.as_deref(),
        )?;
    }

    Ok(())
}

fn distribute_financier_repayment_to_partners(
    db: &Connection,
    financier_name: &str,
    amount: f64,
    date: &str,
    currency: &str,
    notes: Option<&str>,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Ok(());
    }

    let mut stmt = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name ASC")
        .map_err(|e| e.to_string())?;
    let partners = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if partners.is_empty() {
        return Err("لا يوجد شركاء لتوزيع تسديد الممول عليهم".to_string());
    }

    let commission_amount = parse_financier_commission(amount, notes);
    let partner_share = amount / partners.len() as f64;
    for partner in &partners {
        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'شريك', 'سحب تسديد ممول', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
            params![
                partner.as_str(),
                partner_share,
                date,
                format!("حصة الشريك من تسديد الممول {}", financier_name),
                currency,
            ],
        )
        .map_err(|e| e.to_string())?;
        recalculate_partner_total(db, partner, "شريك")?;
    }

    // Distribute commission as partner withdrawal only (no separate expense)
    if commission_amount > 0.0 {
        let commission_share = commission_amount / partners.len() as f64;
        for partner in &partners {
            db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                 VALUES (?1, 'شريك', 'سحب عمولة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                params![
                    partner.as_str(),
                    commission_share,
                    date,
                    format!("حصة الشريك من عمولة تسديد الممول {}", financier_name),
                    currency,
                ],
            )
            .map_err(|e| e.to_string())?;
            recalculate_partner_total(db, partner, "شريك")?;
        }
    }

    Ok(())
}

fn parse_financier_commission(amount: f64, notes: Option<&str>) -> f64 {
    let Some(notes) = notes else {
        return 0.0;
    };
    let Some(raw_commission) = notes.split("عمولة:").nth(1) else {
        return 0.0;
    };
    let raw_commission = raw_commission.trim();
    if raw_commission.contains('%') {
        let percent = raw_commission
            .split('%')
            .next()
            .unwrap_or("")
            .trim()
            .parse::<f64>()
            .unwrap_or(0.0);
        return (amount * percent) / 100.0;
    }
    raw_commission.parse::<f64>().unwrap_or(0.0)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn pay_financier_from_partners(
    state: State<AppState>,
    financier_name: String,
    financier_kind: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    commission_amount: Option<f64>,
    commission_currency: Option<String>,
    _commission_notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let financier_name = financier_name.trim();
    let financier_kind = financier_kind.trim();
    let date = date.trim();
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    let commission_amount = commission_amount.unwrap_or(0.0);

    if financier_name.is_empty() {
        return Err("اسم الممول مطلوب".to_string());
    }
    if amount <= 0.0 {
        return Err("مبلغ التسديد يجب أن يكون أكبر من صفر".to_string());
    }

    let financier_tx_type = if financier_kind == "مطلوب" {
        "ايداع"
    } else {
        "سحب"
    };

    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, 'ممول')",
        params![
            financier_name,
            financier_kind,
            financier_tx_type,
            amount,
            date,
            notes.as_deref(),
            currency.as_str(),
        ],
    )
    .map_err(|e| e.to_string())?;
    recalculate_partner_total(&db, financier_name, financier_kind)?;

    let mut stmt = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name ASC")
        .map_err(|e| e.to_string())?;
    let partners = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if partners.is_empty() {
        return Err("لا يوجد شركاء لتوزيع تسديد الممول عليهم".to_string());
    }

    // Distribute the amount equally among partners
    let partner_share = amount / partners.len() as f64;
    for partner in &partners {
        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'شريك', 'سحب تسديد ممول', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
            params![
                partner.as_str(),
                partner_share,
                date,
                format!("حصة الشريك من تسديد الممول {}", financier_name),
                currency.as_str(),
            ],
        )
        .map_err(|e| e.to_string())?;
        recalculate_partner_total(&db, partner, "شريك")?;
    }

    // Distribute commission as partner withdrawal only (no separate expense)
    if commission_amount > 0.0 {
        let commission_currency = commission_currency.unwrap_or_else(|| "IQD".to_string());
        let commission_share = commission_amount / partners.len() as f64;
        for partner in &partners {
            db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                 VALUES (?1, 'شريك', 'سحب عمولة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                params![
                    partner.as_str(),
                    commission_share,
                    date,
                    format!("حصة الشريك من عمولة تسديد الممول {}", financier_name),
                    commission_currency.as_str(),
                ],
            )
            .map_err(|e| e.to_string())?;
            recalculate_partner_total(&db, partner, "شريك")?;
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
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
            "SELECT id, partner_name, kind, type, amount, date, notes, currency, COALESCE(payment_type, 'قاصه'), COALESCE(time, '00:00')
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
                time: row.get(9)?,
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
            } else if pt == "ممول" {
                " AND 1=0".to_string()
            } else {
                format!(
                    " AND c.purchase_payment_type = '{}'",
                    pt.replace('\'', "''")
                )
            }
        }
        None => String::new(),
    };

    // 1. مشتريات السيارات (outflow = سعر الشراء)
    {
        let sql = format!(
            "SELECT c.purchase_date, COALESCE(c.purchase_time, '00:00'), c.car_name, c.car_number, c.purchase_price, COALESCE(c.currency, 'IQD')
             FROM cars c
             WHERE c.purchase_price > 0 AND c.purchase_date IS NOT NULL AND c.purchase_date != ''{}
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
            let (date, time, car_name, car_number, price, currency) =
                row.map_err(|e| e.to_string())?;
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
            let (date, time, car_name, car_number, price, currency) =
                row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "بيع سيارة".to_string(),
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
            let (date, time, car_name, car_number, amount_paid, currency) =
                row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "بيع سيارة".to_string(),
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
            let (date, time, car_name, car_number, amount_paid, currency) =
                row.map_err(|e| e.to_string())?;
            entries.push(CashRegisterEntry {
                id: 0,
                date: date.unwrap_or_default(),
                time,
                type_: "بيع سيارة".to_string(),
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
            } else if pt == "ممول" {
                " AND pt.kind = 'ممول'".to_string()
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
             WHERE NOT (pt.kind = 'مطلوب' AND pt.type LIKE 'سحب%'){}
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
            let (type_, signed_amount) = match kind.as_str() {
                "شريك" if tx_type.starts_with("ايداع") => {
                    if tx_type.starts_with("ايداع بيع سيارة") {
                        ("", 0.0)
                    } else {
                        ("ايداع شريك", amount)
                    }
                }
                "شريك" if tx_type.starts_with("سحب") => {
                    if tx_type.starts_with("سحب شراء سيارة") || tx_type.starts_with("سحب مصروف")
                    {
                        ("", 0.0)
                    } else {
                        ("سحب شريك", -amount)
                    }
                }
                "مستثمر" if tx_type.starts_with("ايداع") => {
                    if tx_type.starts_with("ايداع بيع سيارة") {
                        ("", 0.0)
                    } else {
                        ("ايداع مستثمر", amount)
                    }
                }
                "مستثمر" if tx_type.starts_with("سحب") => {
                    if tx_type.starts_with("سحب شراء سيارة") || tx_type.starts_with("سحب مصروف")
                    {
                        ("", 0.0)
                    } else {
                        ("سحب مستثمر", -amount)
                    }
                }
                "مطلوب" if tx_type.starts_with("ايداع") => ("تسديد دين", amount),
                "مقترض" if tx_type.starts_with("ايداع") => ("ايداع مقترض", amount),
                "مقترض" if tx_type.starts_with("سحب") => ("سحب مقترض", -amount),
                "ممول" if tx_type.starts_with("ايداع")
                    && payment_type.as_deref() == Some("ممول") => {
                        ("ايداع ممول", amount)
                    }
                "ممول" if tx_type.starts_with("سحب") => {
                    let commission = match &notes {
                        Some(n) => {
                            if let Some(parts) = n.split("عمولة:").nth(1) {
                                if parts.contains('%') {
                                    if let Some(percent_part) = parts.split('%').next() {
                                        let pct = percent_part.trim().parse::<f64>().unwrap_or(0.0);
                                        (amount * pct) / 100.0
                                    } else {
                                        0.0
                                    }
                                } else {
                                    parts.trim().parse::<f64>().unwrap_or(0.0)
                                }
                            } else {
                                0.0
                            }
                        }
                        None => 0.0,
                    };
                    let total_amount = if payment_type.as_deref() == Some("ممول") {
                        amount
                    } else {
                        amount + commission
                    };
                    ("سحب ممول", -total_amount)
                }
                _ => ("", 0.0),
            };
            if type_.is_empty() {
                continue;
            }
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
                let (date, time, description, amount, notes, currency) =
                    row.map_err(|e| e.to_string())?;
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
    entries.sort_by(|a, b| {
        a.date
            .cmp(&b.date)
            .then_with(|| a.time.cmp(&b.time))
            .then_with(|| a.id.cmp(&b.id))
    });

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
fn add_expense(
    state: State<AppState>,
    description: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    car_number: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // إذا كان المصروف خاص بسيارة: يُسجل في car_expenses ثم يُحدّث
    // سحب شراء السيارة ليشمل المبلغ الكلي (الشراء + جميع المصاريف)
    if let Some(ref car_num) = car_number {
        let car_num = car_num.trim();
        if !car_num.is_empty() {
            // 1. تسجيل المصروف في جدول car_expenses أولاً
            db.execute(
                "INSERT INTO car_expenses (car_number, description, amount, date, currency)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                (
                    car_num,
                    description.trim(),
                    amount,
                    date.trim(),
                    &currency,
                ),
            )
            .map_err(|e| e.to_string())?;

            // 2. جلب معلومات السيارة — إذا لم توجد السيارة بعد، نكتفي بتسجيل المصروف
            let car_exists: bool = db
                .query_row(
                    "SELECT COUNT(1) FROM cars WHERE car_number = ?1",
                    [car_num],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0) > 0;
            if !car_exists {
                return Ok(());
            }
            let (car_name, chassis_number, purchase_price, purchase_type, financer_name): (String, Option<String>, f64, Option<String>, Option<String>) = db
                .query_row(
                    "SELECT car_name, chassis_number, purchase_price, purchase_type, financer_name FROM cars WHERE car_number = ?1",
                    [car_num],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
                )
                .unwrap_or((String::new(), None, 0.0, None, None));
            let chassis_str = chassis_number.unwrap_or_default();

            // 3. حساب مجموع المصاريف بعد إضافة المصروف الجديد
            let expenses_sum: f64 = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                    [car_num],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            // 4. المبلغ الكلي = سعر الشراء + مجموع المصاريف
            let total_amount = purchase_price + expenses_sum;

            // 5. حذف حركات سحب شراء السيارة القديمة
            let purchase_note = format!("سحب شراء سيارة {} {}", car_name.trim(), chassis_str.trim())
                .trim()
                .replace("  ", " ");
            db.execute(
                "DELETE FROM partner_transactions WHERE notes = ?1",
                [&purchase_note],
            )
            .map_err(|e| e.to_string())?;

            // 6. إنشاء حركات جديدة بالمبلغ الكلي
            let expense_currency = currency.as_deref().unwrap_or("IQD");
            let expense_date = date.trim();

            if purchase_type.as_deref() == Some("شراكه") {
                // شراكه: جلب شركاء السيارة وتوزيع المبلغ الكلي بنسبة مساهمتهم
                let mut stmt = db
                    .prepare(
                        "SELECT cp.partner_name, cp.kind, cp.amount
                         FROM car_partners cp
                         WHERE cp.car_number = ?1",
                    )
                    .map_err(|e| e.to_string())?;

                let car_partner_rows: Vec<(String, String, f64)> = stmt
                    .query_map([car_num], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?))
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                let total_partner_amounts: f64 = car_partner_rows.iter().map(|(_, _, a)| a).sum();

                // قائمة الشركاء الفعليين لتوزيع حصة فجر الوادي
                let mut stmt2 = db
                    .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'")
                    .map_err(|e| e.to_string())?;
                let partner_list: Vec<String> = stmt2
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                for (p_name, p_kind, p_amount) in &car_partner_rows {
                    let share = if total_partner_amounts > 0.0 {
                        (p_amount / total_partner_amounts) * total_amount
                    } else {
                        total_amount / car_partner_rows.len() as f64
                    };

                    if p_name == "فجر الوادي" {
                        let sub_partners: Vec<&String> = partner_list.iter().filter(|s| *s != "فجر الوادي").collect();
                        if sub_partners.is_empty() {
                            db.execute(
                                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                                ["فجر الوادي"],
                            ).map_err(|e| e.to_string())?;
                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                params!["فجر الوادي", share, expense_date, purchase_note, expense_currency],
                            ).map_err(|e| e.to_string())?;
                        } else {
                            let sub_share = share / sub_partners.len() as f64;
                            for sub in sub_partners {
                                db.execute(
                                    "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                                    [sub],
                                ).map_err(|e| e.to_string())?;
                                db.execute(
                                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                     VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                    params![sub.as_str(), sub_share, expense_date, purchase_note, expense_currency],
                                ).map_err(|e| e.to_string())?;
                            }
                        }
                    } else {
                        let p_kind_str = p_kind.as_str();
                        let exists: bool = db
                            .query_row(
                                "SELECT COUNT(*) FROM partners WHERE partner_name = ?1 AND kind = ?2",
                                params![p_name.as_str(), p_kind_str],
                                |row| row.get::<_, i64>(0),
                            )
                            .unwrap_or(0) > 0;

                        if !exists {
                            db.execute(
                                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                                params![p_name.as_str(), p_kind_str],
                            ).map_err(|e| e.to_string())?;
                        }

                        let tx_type = if p_kind_str == "مطلوب" { "ايداع" } else { "سحب شراء سيارة" };
                        let note = if p_kind_str == "مطلوب" {
                            format!("تمويل شراء سيارة {} {}", car_name.trim(), chassis_str.trim())
                                .trim().replace("  ", " ")
                        } else {
                            purchase_note.clone()
                        };

                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, 'قاصه')",
                            params![
                                p_name.as_str(),
                                p_kind_str,
                                tx_type,
                                share,
                                expense_date,
                                note,
                                expense_currency,
                            ],
                        ).map_err(|e| e.to_string())?;
                    }
                }
        } else if purchase_type.as_deref() == Some("دين") || purchase_type.as_deref() == Some("شركة") {
            let p_kind = if purchase_type.as_deref() == Some("دين") { "ممول" } else { "شركة" };
                if let Some(f_name) = &financer_name {
                    if !f_name.trim().is_empty() {
                        let exists = db
                            .query_row(
                                "SELECT 1 FROM partners WHERE partner_name = ?1 AND kind = ?2",
                                params![f_name.trim(), p_kind],
                                |_| Ok(()),
                            )
                            .is_ok();
                        if !exists {
                            db.execute(
                                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                                params![f_name.trim(), p_kind],
                            ).map_err(|e| e.to_string())?;
                        }

                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, 'قاصه')",
                            params![
                                f_name.trim(),
                                p_kind,
                                total_amount,
                                expense_date,
                                purchase_note,
                                expense_currency,
                            ],
                        ).map_err(|e| e.to_string())?;
                    }
                }
            } else {
                // كاش أو غيره: توزيع بالتساوي على جميع الشركاء
                let mut stmt = db
                    .prepare(
                        "SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'"
                    )
                    .map_err(|e| e.to_string())?;
                let mut partners: Vec<String> = stmt
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;

                if partners.is_empty() {
                    partners.push("فجر الوادي".to_string());
                }

                let n = partners.len() as f64;
                let per_partner = total_amount / n;

                for p in &partners {
                    db.execute(
                        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                        [p.as_str()],
                    ).map_err(|e| e.to_string())?;

                    if p == "فجر الوادي" {
                        // توزيع حصة فجر الوادي على بقية الشركاء
                        let sub_partners: Vec<String> = partners.iter()
                            .filter(|s| *s != "فجر الوادي")
                            .cloned()
                            .collect();
                        if sub_partners.is_empty() {
                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                params!["فجر الوادي", per_partner, expense_date, purchase_note, expense_currency],
                            ).map_err(|e| e.to_string())?;
                        } else {
                            let sub_share = per_partner / sub_partners.len() as f64;
                            for sub in &sub_partners {
                                db.execute(
                                    "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
                                    [sub.as_str()],
                                ).map_err(|e| e.to_string())?;
                                db.execute(
                                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                     VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                    params![sub.as_str(), sub_share, expense_date, purchase_note, expense_currency],
                                ).map_err(|e| e.to_string())?;
                            }
                        }
                    } else {
                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                            params![p.as_str(), per_partner, expense_date, purchase_note, expense_currency],
                        ).map_err(|e| e.to_string())?;
                    }
                }
            }

            recalculate_all_partners(&db)?;
            return Ok(());
        }
    }

    // إذا لم يكن مصروف سيارة → سجل في جدول المصروفات كالمعتاد
    db.execute(
        "INSERT INTO expenses (description, amount, date, time, notes, currency, car_number)
         VALUES (?1, ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, ?6)",
        (
            description.trim(),
            amount,
            date.trim(),
            &notes,
            &currency,
            &car_number,
        ),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_expenses(state: State<AppState>) -> Result<Vec<ExpenseEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, description, amount, date, COALESCE(time, '00:00'), notes, currency, car_number FROM expenses ORDER BY id ASC")
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

    // 1. Fetch expense info before deleting
    let row_result = db.query_row(
        "SELECT description, date FROM expenses WHERE id = ?1",
        [id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );

    if let Ok((description, expense_date)) = row_result {
        // 2. Construct note pattern and delete corresponding transactions
        let pattern = format!("سحب مصروف بقيمة % لـ {}", description.trim());
        db.execute(
            "DELETE FROM partner_transactions WHERE notes LIKE ?1 AND type = 'سحب مصروف' AND date = ?2",
            params![pattern, expense_date.trim()],
        )
        .map_err(|e| e.to_string())?;
    }

    // 3. Delete from expenses table
    db.execute("DELETE FROM expenses WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    // 4. Recalculate totals
    recalculate_all_partners(&db)?;

    Ok(())
}

#[tauri::command]
fn add_car_expense_record(
    state: State<AppState>,
    car_number: String,
    description: String,
    amount: f64,
    date: String,
    currency: Option<String>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO car_expenses (car_number, description, amount, date, currency)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            car_number.trim(),
            description.trim(),
            amount,
            date.trim(),
            &currency,
        ),
    )
    .map_err(|e| e.to_string())?;
    let id = db.last_insert_rowid();
    Ok(id)
}

#[tauri::command]
fn get_car_expense_records(
    state: State<AppState>,
    car_number: String,
) -> Result<Vec<CarExpenseRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, car_number, description, amount, date, currency
             FROM car_expenses
             WHERE car_number = ?1
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let records = stmt
        .query_map([car_number.trim()], |row| {
            Ok(CarExpenseRecord {
                id: row.get(0)?,
                car_number: row.get(1)?,
                description: row.get(2)?,
                amount: row.get(3)?,
                date: row.get(4)?,
                currency: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(records)
}

#[tauri::command]
fn delete_car_expense_record(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // 1. جلب معلومات المصروف
    let row_result = db.query_row(
        "SELECT car_number, amount FROM car_expenses WHERE id = ?1",
        [id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)),
    );

    if let Ok((car_number, _expense_amount)) = row_result {
        // 2. حذف سجل المصروف أولاً
        db.execute("DELETE FROM car_expenses WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;

        // 3. جلب معلومات السيارة
        let (car_name, chassis_number, purchase_price, purchase_type, financer_name): (String, Option<String>, f64, Option<String>, Option<String>) = db
            .query_row(
                "SELECT car_name, chassis_number, purchase_price, purchase_type, financer_name FROM cars WHERE car_number = ?1",
                [&car_number],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap_or((String::new(), None, 0.0, None, None));
        let chassis_str = chassis_number.unwrap_or_default();

        // 4. حساب مجموع المصاريف المتبقية
        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [&car_number],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        // 5. المبلغ الكلي = سعر الشراء + المصاريف المتبقية
        let total_amount = purchase_price + expenses_sum;

        // 6. حذف حركات سحب شراء السيارة القديمة
        let purchase_note = format!("سحب شراء سيارة {} {}", car_name.trim(), chassis_str.trim())
            .trim()
            .replace("  ", " ");
        db.execute(
            "DELETE FROM partner_transactions WHERE notes = ?1",
            [&purchase_note],
        )
        .map_err(|e| e.to_string())?;

        // 7. إعادة إنشاء الحركات بالمبلغ الكلي الجديد
        let date = db
            .query_row(
                "SELECT COALESCE(MIN(date), '') FROM partner_transactions WHERE notes = ?1",
                [&purchase_note],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_default();

        if purchase_type.as_deref() == Some("شراكه") {
            let mut stmt = db
                .prepare(
                    "SELECT cp.partner_name, cp.kind, cp.amount
                     FROM car_partners cp WHERE cp.car_number = ?1",
                )
                .map_err(|e| e.to_string())?;

            let car_partner_rows: Vec<(String, String, f64)> = stmt
                .query_map([&car_number], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            let total_partner_amounts: f64 = car_partner_rows.iter().map(|(_, _, a)| a).sum();

            let mut stmt2 = db
                .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'")
                .map_err(|e| e.to_string())?;
            let partner_list: Vec<String> = stmt2
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            for (p_name, p_kind, p_amount) in &car_partner_rows {
                let share = if total_partner_amounts > 0.0 {
                    (p_amount / total_partner_amounts) * total_amount
                } else {
                    total_amount / car_partner_rows.len() as f64
                };

                if p_name == "فجر الوادي" {
                    let sub_partners: Vec<&String> = partner_list.iter().filter(|s| *s != "فجر الوادي").collect();
                    if sub_partners.is_empty() {
                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                            params!["فجر الوادي", share, date, purchase_note, "IQD"],
                        ).map_err(|e| e.to_string())?;
                    } else {
                        let sub_share = share / sub_partners.len() as f64;
                        for sub in sub_partners {
                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                params![sub.as_str(), sub_share, date, purchase_note, "IQD"],
                            ).map_err(|e| e.to_string())?;
                        }
                    }
                } else {
                    let p_kind_str = p_kind.as_str();
                    let tx_type = if p_kind_str == "مطلوب" { "ايداع" } else { "سحب شراء سيارة" };
                    let note = if p_kind_str == "مطلوب" {
                        format!("تمويل شراء سيارة {} {}", car_name.trim(), chassis_str.trim())
                            .trim().replace("  ", " ")
                    } else {
                        purchase_note.clone()
                    };

                    db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, 'قاصه')",
                        params![p_name.as_str(), p_kind_str, tx_type, share, date, note, "IQD"],
                    ).map_err(|e| e.to_string())?;
                }
            }
        } else if purchase_type.as_deref() == Some("دين") || purchase_type.as_deref() == Some("شركة") {
            let p_kind = if purchase_type.as_deref() == Some("دين") { "ممول" } else { "شركة" };
            if let Some(f_name) = &financer_name {
                if !f_name.trim().is_empty() {
                    let exists = db
                        .query_row(
                            "SELECT 1 FROM partners WHERE partner_name = ?1 AND kind = ?2",
                            params![f_name.trim(), p_kind],
                            |_| Ok(()),
                        )
                        .is_ok();
                    if !exists {
                        db.execute(
                            "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                            params![f_name.trim(), p_kind],
                        ).map_err(|e| e.to_string())?;
                    }

                    db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                         VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, 'قاصه')",
                        params![
                            f_name.trim(),
                            p_kind,
                            total_amount,
                            date,
                            purchase_note,
                            "IQD",
                        ],
                    ).map_err(|e| e.to_string())?;
                }
            }
        } else {
            let mut stmt = db
                .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'")
                .map_err(|e| e.to_string())?;
            let mut partners: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            if partners.is_empty() {
                partners.push("فجر الوادي".to_string());
            }

            let n = partners.len() as f64;
            let per_partner = total_amount / n;

            for p in &partners {
                if p == "فجر الوادي" {
                    let sub_partners: Vec<String> = partners.iter()
                        .filter(|s| *s != "فجر الوادي")
                        .cloned()
                        .collect();
                    if sub_partners.is_empty() {
                        db.execute(
                            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                             VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                            params!["فجر الوادي", per_partner, date, purchase_note, "IQD"],
                        ).map_err(|e| e.to_string())?;
                    } else {
                        let sub_share = per_partner / sub_partners.len() as f64;
                        for sub in &sub_partners {
                            db.execute(
                                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                                 VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                                params![sub.as_str(), sub_share, date, purchase_note, "IQD"],
                            ).map_err(|e| e.to_string())?;
                        }
                    }
                } else {
                    db.execute(
                        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                         VALUES (?1, 'شريك', 'سحب شراء سيارة', ?2, ?3, strftime('%H:%M', 'now', 'localtime'), ?4, ?5, 'قاصه')",
                        params![p.as_str(), per_partner, date, purchase_note, "IQD"],
                    ).map_err(|e| e.to_string())?;
                }
            }
        }

        recalculate_all_partners(&db)?;
    } else {
        // إذا لم يتم العثور على المصروف، فقط احذف السجل إن وُجد
        db.execute("DELETE FROM car_expenses WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn now_datetime() -> (String, String) {
    use std::time::SystemTime;
    let now = SystemTime::now();
    let epoch = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // simple UTC-based calculation (no chrono dependency)
    let secs_per_day = 86400u64;
    let total_days = epoch / secs_per_day;
    let time_of_day = epoch % secs_per_day;
    let hh = time_of_day / 3600;
    let mm = (time_of_day % 3600) / 60;
    // days since 1970-01-01
    let mut y = 1970u64;
    let mut days = total_days;
    loop {
        let days_in_year = if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 { 366 } else { 365 };
        if days < days_in_year { break; }
        days -= days_in_year;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let month_days: [u64; 12] = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if days < md { m = i; break; }
        days -= md;
    }
    let d = days + 1;
    let date = format!("{:04}-{:02}-{:02}", y, m + 1, d);
    let time = format!("{:02}:{:02}", hh, mm);
    (date, time)
}

#[tauri::command]
fn get_agencies(state: State<AppState>) -> Result<Vec<Agency>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, old_agent_name, car_number, car_model, color, new_agent_name, phone,
                    amount_usd, amount_iqd, notes, date, time
             FROM agencies ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;

    let agencies = stmt
        .query_map([], |row| {
            Ok(Agency {
                id: row.get(0)?,
                old_agent_name: row.get(1)?,
                car_number: row.get(2)?,
                car_model: row.get(3)?,
                color: row.get(4)?,
                new_agent_name: row.get(5)?,
                phone: row.get(6)?,
                amount_usd: row.get(7)?,
                amount_iqd: row.get(8)?,
                notes: row.get(9)?,
                date: row.get(10)?,
                time: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(agencies)
}

#[tauri::command]
fn add_agency(
    state: State<AppState>,
    old_agent_name: String,
    car_number: String,
    car_model: String,
    color: String,
    new_agent_name: String,
    phone: String,
    amount_usd: f64,
    amount_iqd: f64,
    notes: String,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (date, time) = now_datetime();

    db.execute(
        "INSERT INTO agencies (old_agent_name, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        (
            old_agent_name.trim(),
            car_number.trim(),
            car_model.trim(),
            color.trim(),
            new_agent_name.trim(),
            phone.trim(),
            amount_usd,
            amount_iqd,
            notes.trim(),
            date.clone(),
            time,
        ),
    )
    .map_err(|e| e.to_string())?;

    let new_id = db.last_insert_rowid();

    // توزيع ارباح الوكالة على حسابات الشركاء
    if amount_iqd > 0.0 || amount_usd > 0.0 {
        let mut stmt = db
            .prepare(
                "SELECT partner_name, kind FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'",
            )
            .map_err(|e| e.to_string())?;

        let partner_rows: Vec<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        drop(stmt);

        let n = partner_rows.len() as f64;
        let agency_note = format!(
            "ارباح وكالة {} {}",
            old_agent_name.trim(),
            new_agent_name.trim()
        )
        .trim()
        .replace("  ", " ");

        for (p_name, p_kind) in &partner_rows {
            db.execute(
                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                params![p_name, p_kind],
            )
            .map_err(|e| e.to_string())?;

            if amount_iqd > 0.0 && n > 0.0 {
                let share = amount_iqd / n;
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'ايداع ارباح وكالة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, 'IQD', 'قاصه')",
                    params![p_name, p_kind, share, date.trim(), agency_note],
                )
                .map_err(|e| e.to_string())?;
            }

            if amount_usd > 0.0 && n > 0.0 {
                let share = amount_usd / n;
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'ايداع ارباح وكالة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, 'USD', 'قاصه')",
                    params![p_name, p_kind, share, date.trim(), agency_note],
                )
                .map_err(|e| e.to_string())?;
            }

            recalculate_partner_total(&db, p_name, p_kind)?;
        }
    }

    Ok(new_id)
}

#[tauri::command]
fn update_agency(
    state: State<AppState>,
    id: i64,
    old_agent_name: String,
    car_number: String,
    car_model: String,
    color: String,
    new_agent_name: String,
    phone: String,
    amount_usd: f64,
    amount_iqd: f64,
    notes: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (old_amount_usd, old_amount_iqd): (f64, f64) = db
        .query_row(
            "SELECT amount_usd, amount_iqd FROM agencies WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((0.0, 0.0));

    db.execute(
        "UPDATE agencies SET old_agent_name = ?1, car_number = ?2, car_model = ?3, color = ?4, new_agent_name = ?5, phone = ?6, amount_usd = ?7, amount_iqd = ?8, notes = ?9 WHERE id = ?10",
        (
            old_agent_name.trim(),
            car_number.trim(),
            car_model.trim(),
            color.trim(),
            new_agent_name.trim(),
            phone.trim(),
            amount_usd,
            amount_iqd,
            notes.trim(),
            id,
        ),
    )
    .map_err(|e| e.to_string())?;

    let diff_usd = amount_usd - old_amount_usd;
    let diff_iqd = amount_iqd - old_amount_iqd;

    if diff_usd > 0.0 || diff_iqd > 0.0 {
        let (date, _time) = now_datetime();

        let mut stmt = db
            .prepare(
                "SELECT partner_name, kind FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'",
            )
            .map_err(|e| e.to_string())?;

        let partner_rows: Vec<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        drop(stmt);

        let n = partner_rows.len() as f64;
        let agency_note = format!(
            "ارباح وكالة {} {}",
            old_agent_name.trim(),
            new_agent_name.trim()
        )
        .trim()
        .replace("  ", " ");

        for (p_name, p_kind) in &partner_rows {
            db.execute(
                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
                params![p_name, p_kind],
            )
            .map_err(|e| e.to_string())?;

            if diff_iqd > 0.0 && n > 0.0 {
                let share = diff_iqd / n;
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'ايداع ارباح وكالة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, 'IQD', 'قاصه')",
                    params![p_name, p_kind, share, date.trim(), agency_note],
                )
                .map_err(|e| e.to_string())?;
            }

            if diff_usd > 0.0 && n > 0.0 {
                let share = diff_usd / n;
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                     VALUES (?1, ?2, 'ايداع ارباح وكالة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, 'USD', 'قاصه')",
                    params![p_name, p_kind, share, date.trim(), agency_note],
                )
                .map_err(|e| e.to_string())?;
            }

            recalculate_partner_total(&db, p_name, p_kind)?;
        }
    }

    Ok(())
}

#[tauri::command]
fn delete_agency(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let (old_agent_name, new_agent_name): (String, String) = db
        .query_row(
            "SELECT old_agent_name, new_agent_name FROM agencies WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or_default();

    let agency_note = format!(
        "ارباح وكالة {} {}",
        old_agent_name.trim(),
        new_agent_name.trim()
    )
    .trim()
    .replace("  ", " ");

    db.execute(
        "DELETE FROM partner_transactions WHERE type = 'ايداع ارباح وكالة' AND notes = ?1",
        [&agency_note],
    )
    .map_err(|e| e.to_string())?;

    db.execute("DELETE FROM agency_transactions WHERE agency_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM agencies WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

    Ok(())
}

#[tauri::command]
fn get_agency_transactions(
    state: State<AppState>,
    agency_id: i64,
) -> Result<Vec<AgencyTransaction>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, agency_id, date, time, type_, amount, currency, notes
             FROM agency_transactions WHERE agency_id = ?1 ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let transactions = stmt
        .query_map([agency_id], |row| {
            Ok(AgencyTransaction {
                id: row.get(0)?,
                agency_id: row.get(1)?,
                date: row.get(2)?,
                time: row.get(3)?,
                type_: row.get(4)?,
                amount: row.get(5)?,
                currency: row.get(6)?,
                notes: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(transactions)
}

#[tauri::command]
fn add_agency_transaction(
    state: State<AppState>,
    agency_id: i64,
    type_: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (_, time) = now_datetime();

    db.execute(
        "INSERT INTO agency_transactions (agency_id, date, time, type_, amount, currency, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            agency_id,
            date.trim(),
            time,
            type_.trim(),
            amount,
            currency.as_deref(),
            notes.as_deref(),
        ),
    )
    .map_err(|e| e.to_string())?;

    // توزيع المبلغ على حسابات الشركاء
    let (old_agent_name, new_agent_name): (String, String) = db
        .query_row(
            "SELECT old_agent_name, new_agent_name FROM agencies WHERE id = ?1",
            [agency_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let agency_note = format!(
        "وكالة {} {}",
        old_agent_name.trim(),
        new_agent_name.trim()
    )
    .trim()
    .replace("  ", " ");

    let mut stmt = db
        .prepare(
            "SELECT partner_name, kind FROM partners WHERE kind = 'شريك' AND partner_name != 'فجر الوادي'",
        )
        .map_err(|e| e.to_string())?;

    let partner_rows: Vec<(String, String)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    let n = partner_rows.len() as f64;
    let share = if n > 0.0 { amount / n } else { 0.0 };
    let partner_tx_type = if type_.trim() == "ايداع" {
        "ايداع وكالة"
    } else {
        "سحب وكالة"
    };

    for (p_name, p_kind) in &partner_rows {
        db.execute(
            "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
            params![p_name, p_kind],
        )
        .map_err(|e| e.to_string())?;

        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, 'قاصه')",
            params![
                p_name,
                p_kind,
                partner_tx_type,
                share,
                date.trim(),
                agency_note,
                currency.as_deref(),
            ],
        )
        .map_err(|e| e.to_string())?;

        recalculate_partner_total(&db, p_name, p_kind)?;
    }

    Ok(())
}

#[tauri::command]
fn delete_agency_transaction(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let (agency_id, tx_date, tx_type): (i64, String, String) = db
        .query_row(
            "SELECT agency_id, date, type_ FROM agency_transactions WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let (old_agent_name, new_agent_name): (String, String) = db
        .query_row(
            "SELECT old_agent_name, new_agent_name FROM agencies WHERE id = ?1",
            [agency_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let agency_note = format!(
        "وكالة {} {}",
        old_agent_name.trim(),
        new_agent_name.trim()
    )
    .trim()
    .replace("  ", " ");

    let partner_tx_type = if tx_type.trim() == "ايداع" {
        "ايداع وكالة"
    } else {
        "سحب وكالة"
    };

    db.execute(
        "DELETE FROM partner_transactions WHERE type = ?1 AND notes = ?2 AND date = ?3",
        params![partner_tx_type, agency_note, tx_date.trim()],
    )
    .map_err(|e| e.to_string())?;

    db.execute("DELETE FROM agency_transactions WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

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
                format!(
                    " AND c.purchase_payment_type = '{}'",
                    pt.replace('\'', "''")
                )
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
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (currency, price) in &purchase_rows {
            if currency == "USD" {
                usd_balance -= price;
            } else {
                iqd_balance -= price;
            }
        }
    }

    // بيع السيارات
    for (sale_type, amount_col) in [
        ("كاش", "selling_price"),
        ("موعد", "amount_paid"),
        ("اقساط", "amount_paid"),
    ] {
        let sql = format!(
            "SELECT COALESCE(c.sale_currency, 'IQD'), c.{} FROM cars c WHERE c.status = 'مبيوعة' AND c.payment_type = ?1 AND c.sale_date IS NOT NULL AND c.sale_date != ''{}",
            amount_col, filter_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let sale_rows: Vec<(String, f64)> = stmt
            .query_map([sale_type], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (currency, amount) in &sale_rows {
            if currency == "USD" {
                usd_balance += amount;
            } else {
                iqd_balance += amount;
            }
        }
    }

    // معاملات الشركاء والمستثمرين
    {
        let sql = format!(
            "SELECT pt.kind, pt.type, pt.amount, COALESCE(pt.currency, 'IQD'), pt.notes
             FROM partner_transactions pt
             WHERE NOT (pt.kind = 'مطلوب' AND pt.type LIKE 'سحب%'){}",
            filter_pt_sql
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let tx_rows: Vec<(String, String, f64, String, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (kind, tx_type, amount, currency, notes) in &tx_rows {
            let signed = match kind.as_str() {
                "شريك" | "مستثمر" | "مطلوب" | "مقترض" if tx_type.starts_with("ايداع") => {
                    if tx_type.starts_with("ايداع بيع سيارة") {
                        0.0
                    } else {
                        *amount
                    }
                }
                "شريك" | "مستثمر" | "مقترض" if tx_type.starts_with("سحب") => {
                    if tx_type.starts_with("سحب شراء سيارة") || tx_type.starts_with("سحب مصروف")
                    {
                        0.0
                    } else {
                        -*amount
                    }
                }
                "ممول" if tx_type.starts_with("سحب") => {
                    let commission = match notes {
                        Some(ref n) => {
                            if let Some(parts) = n.split("عمولة:").nth(1) {
                                if parts.contains('%') {
                                    if let Some(percent_part) = parts.split('%').next() {
                                        let pct = percent_part.trim().parse::<f64>().unwrap_or(0.0);
                                        (amount * pct) / 100.0
                                    } else {
                                        0.0
                                    }
                                } else {
                                    parts.trim().parse::<f64>().unwrap_or(0.0)
                                }
                            } else {
                                0.0
                            }
                        }
                        None => 0.0,
                    };
                    let total_amount = amount + commission;
                    -total_amount
                }
                _ => 0.0,
            };
            if currency == "USD" {
                usd_balance += signed;
            } else {
                iqd_balance += signed;
            }
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
            .query_map([], |row| {
                Ok((row.get::<_, f64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (total, currency) in &exp_rows {
            if currency == "USD" {
                usd_balance -= total;
            } else {
                iqd_balance -= total;
            }
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
        .query_row("SELECT COALESCE(SUM(amount), 0) FROM expenses", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    // 7. صافي رأس المال (النقد + المخزون + ديون العملاء - استثمارات المستثمرين - ديون المقترضين)
    let total_borrowers: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total_amount), 0) FROM partners WHERE kind = 'مقترض' AND total_amount < 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let net_capital =
        iqd_balance + inventory_value + total_debtors - total_investments - total_borrowers;

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

#[tauri::command]
fn get_partners_totals(state: State<AppState>, kind: String) -> Result<(f64, f64), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let query_iqd = if kind == "partners-financial" {
        "SELECT COALESCE(SUM(CASE 
            WHEN kind = 'ممول' AND type LIKE 'ايداع%' THEN -amount 
            WHEN kind = 'ممول' AND type LIKE 'سحب%' THEN amount 
            WHEN kind != 'ممول' AND type LIKE 'ايداع%' THEN amount 
            WHEN kind != 'ممول' AND type LIKE 'سحب%' THEN -amount 
            ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind IN ('شريك', 'مستثمر', 'ممول', 'مقترض') AND (currency IS NULL OR currency = 'IQD' OR currency = '')"
    } else if kind == "مطلوب" {
        "SELECT COALESCE(SUM(CASE WHEN type LIKE 'سحب%' THEN amount WHEN type LIKE 'ايداع%' THEN -amount ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind = ?1 AND (currency IS NULL OR currency = 'IQD' OR currency = '') 
           AND (notes IS NULL OR (notes NOT LIKE '%دفعة أولى%' AND notes NOT LIKE '%قسط%' AND notes NOT LIKE '%مؤجل%'))"
    } else {
        "SELECT COALESCE(SUM(CASE WHEN type LIKE 'ايداع%' THEN amount WHEN type LIKE 'سحب%' THEN -amount ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind = ?1 AND (currency IS NULL OR currency = 'IQD' OR currency = '')"
    };

    let query_usd = if kind == "partners-financial" {
        "SELECT COALESCE(SUM(CASE 
            WHEN kind = 'ممول' AND type LIKE 'ايداع%' THEN -amount 
            WHEN kind = 'ممول' AND type LIKE 'سحب%' THEN amount 
            WHEN kind != 'ممول' AND type LIKE 'ايداع%' THEN amount 
            WHEN kind != 'ممول' AND type LIKE 'سحب%' THEN -amount 
            ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind IN ('شريك', 'مستثمر', 'ممول', 'مقترض') AND currency = 'USD'"
    } else if kind == "مطلوب" {
        "SELECT COALESCE(SUM(CASE WHEN type LIKE 'سحب%' THEN amount WHEN type LIKE 'ايداع%' THEN -amount ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind = ?1 AND currency = 'USD' 
           AND (notes IS NULL OR (notes NOT LIKE '%دفعة أولى%' AND notes NOT LIKE '%قسط%' AND notes NOT LIKE '%مؤجل%'))"
    } else {
        "SELECT COALESCE(SUM(CASE WHEN type LIKE 'ايداع%' THEN amount WHEN type LIKE 'سحب%' THEN -amount ELSE 0.0 END), 0.0)
         FROM partner_transactions
         WHERE kind = ?1 AND currency = 'USD'"
    };

    let iqd_total: f64 = if kind == "partners-financial" {
        db.query_row(query_iqd, [], |row| row.get(0))
            .map_err(|e| e.to_string())?
    } else {
        db.query_row(query_iqd, [&kind], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };
    let usd_total: f64 = if kind == "partners-financial" {
        db.query_row(query_usd, [], |row| row.get(0))
            .map_err(|e| e.to_string())?
    } else {
        db.query_row(query_usd, [&kind], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };

    Ok((iqd_total, usd_total))
}

#[tauri::command]
fn open_whatsapp(phone: String, text: String) -> Result<(), String> {
    let url = format!("whatsapp://send?phone={}&text={}", phone, text);
    open::that(&url).map_err(|e| format!("فشل فتح واتساب: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            } else {
                env::current_exe()
                    .map_err(|e| format!("تعذر معرفة مسار البرنامج: {e}"))?
                    .parent()
                    .ok_or_else(|| "تعذر معرفة مجلد البرنامج".to_string())?
                    .to_path_buf()
            };

            std::fs::create_dir_all(&app_dir)
                .map_err(|e| format!("تعذر إنشاء مجلد قاعدة البيانات: {e}"))?;

            let db_path = app_dir.join("fjr_alwadi_data.db");
            let conn =
                Connection::open(&db_path).map_err(|e| format!("تعذر فتح قاعدة البيانات: {e}"))?;

            init_db(&conn).map_err(|e| format!("تعذر تهيئة قاعدة البيانات: {e}"))?;

            app.manage(AppState {
                db: Mutex::new(conn),
            });

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
            pay_financier_from_partners,
            update_partner_transaction,
            delete_partner_transaction,
            get_partner_transactions,
            get_cash_register_entries,
            add_expense,
            get_expenses,
            delete_expense,
            add_car_expense_record,
            get_car_expense_records,
            delete_car_expense_record,
            get_financial_summary,
            get_partners_totals,
            get_unified_accounts,
            get_agencies,
            add_agency,
            update_agency,
            delete_agency,
            get_agency_transactions,
            add_agency_transaction,
            delete_agency_transaction,
            open_whatsapp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
