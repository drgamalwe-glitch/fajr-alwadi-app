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
    pub car_type: String,
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
    pub cash_iqd: f64,
    pub cash_usd: f64,
    pub inventory_value_iqd: f64,
    pub inventory_value_usd: f64,
    pub total_investments_iqd: f64,
    pub total_investments_usd: f64,
    pub total_partner_capital_iqd: f64,
    pub total_partner_capital_usd: f64,
    pub total_debtors_iqd: f64,
    pub total_debtors_usd: f64,
    pub total_expenses_iqd: f64,
    pub total_expenses_usd: f64,
    pub net_capital_iqd: f64,
    pub net_capital_usd: f64,
    pub monthly_profits_iqd: f64,
    pub monthly_profits_usd: f64,
}

#[derive(Serialize, Debug, Clone)]
pub struct PartnerDistributionInfo {
    pub partner_name: String,
    pub capital_iqd: f64,
    pub capital_usd: f64,
    pub drawings_iqd: f64,
    pub drawings_usd: f64,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProfitDistributionSummary {
    pub undistributed_iqd: f64,
    pub undistributed_usd: f64,
    pub partners: Vec<PartnerDistributionInfo>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PartnerProfitShareInput {
    pub partner_name: String,
    pub profit_share: f64,
    pub drawings_deducted: f64,
    pub amount_reinvested: f64,
    pub amount_paid: f64,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProfitDistribution {
    pub id: i64,
    pub date: String,
    pub time: String,
    pub total_profit: f64,
    pub currency: String,
    pub notes: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct PartnerProfitShare {
    pub id: i64,
    pub distribution_id: i64,
    pub partner_name: String,
    pub profit_share: f64,
    pub drawings_deducted: f64,
    pub amount_reinvested: f64,
    pub amount_paid: f64,
    pub currency: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProfitDistributionDetail {
    pub distribution: ProfitDistribution,
    pub shares: Vec<PartnerProfitShare>,
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

    if version < 4 {
        let _ = conn.execute(
            "ALTER TABLE agencies ADD COLUMN car_type TEXT NOT NULL DEFAULT ''",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (4)", []);
    }

    // Performance indexes
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cars_purchase_type ON cars(purchase_type)",
        [],
    );
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner ON partner_transactions(partner_name, kind)", []);
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_partner_transactions_date ON partner_transactions(date)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cash_register_date ON cash_register(date)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cash_register_type ON cash_register(type)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_car_expenses_car ON car_expenses(car_number)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_car_partners_car ON car_partners(car_number)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cars_plate ON cars(car_plate_num)",
        [],
    );

    // تنظيف: حذف جميع سجلات 'ايداع ارباح وكالة' القديمة من حسابات الشركاء
    let _ = conn.execute(
        "DELETE FROM partner_transactions WHERE type = 'ايداع ارباح وكالة'",
        [],
    );

    // إنشاء جدول دفتر الأستاذ المالي (financial_ledger)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS financial_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            account_type TEXT NOT NULL,
            account_id TEXT,
            debit REAL NOT NULL,
            credit REAL NOT NULL,
            currency TEXT NOT NULL,
            reference_type TEXT NOT NULL,
            reference_id TEXT NOT NULL,
            type_ TEXT NOT NULL,
            description TEXT NOT NULL,
            notes TEXT
        )",
        [],
    )?;

    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ledger_date ON financial_ledger(date)",
        [],
    );

    // إنشاء جداول توزيع الأرباح ورأس المال
    conn.execute(
        "CREATE TABLE IF NOT EXISTS profit_distributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            total_profit REAL NOT NULL,
            currency TEXT NOT NULL,
            notes TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS partner_profit_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            distribution_id INTEGER NOT NULL,
            partner_name TEXT NOT NULL,
            profit_share REAL NOT NULL,
            drawings_deducted REAL NOT NULL,
            amount_reinvested REAL NOT NULL,
            amount_paid REAL NOT NULL,
            currency TEXT NOT NULL,
            FOREIGN KEY (distribution_id) REFERENCES profit_distributions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_profit_shares_distribution ON partner_profit_shares(distribution_id)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_profit_shares_partner ON partner_profit_shares(partner_name)",
        [],
    );

    migrate_existing_data_to_ledger(conn)?;

    // تنظيف الحركات الخاطئة الناتجة عن نسخ سابقة من البرنامج
    let _ = conn.execute(
        "DELETE FROM financial_ledger 
         WHERE reference_type = 'partner_transaction' 
           AND reference_id IN (
               SELECT CAST(id AS TEXT) 
               FROM partner_transactions 
               WHERE type LIKE 'باقي%' OR type LIKE 'تحويل%'
           )",
        [],
    );

    let _ = conn.execute(
        "DELETE FROM financial_ledger 
         WHERE reference_type = 'partner_transaction'
           AND type_ = 'سحب مدين نقدي'
           AND reference_id IN (
               SELECT CAST(id AS TEXT) 
               FROM partner_transactions 
               WHERE kind = 'مقترض'
           )",
        [],
    );

    let _ = recalculate_all_partners(conn);

    Ok(())
}

fn record_ledger_entry(
    conn: &Connection,
    date: &str,
    time: &str,
    account_type: &str,
    account_id: Option<&str>,
    debit: f64,
    credit: f64,
    currency: &str,
    reference_type: &str,
    reference_id: &str,
    type_: &str,
    description: &str,
    notes: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO financial_ledger (
            date, time, account_type, account_id, debit, credit, currency, 
            reference_type, reference_id, type_, description, notes
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            date.trim(),
            time.trim(),
            account_type.trim(),
            account_id.map(|s| s.trim()),
            debit,
            credit,
            currency.trim(),
            reference_type.trim(),
            reference_id.trim(),
            type_.trim(),
            description.trim(),
            notes.map(|s| s.trim()),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn reverse_ledger_entries(
    conn: &Connection,
    reference_type: &str,
    reference_id: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT date, time, account_type, account_id, debit, credit, currency, type_, description, notes 
             FROM financial_ledger 
             WHERE reference_type = ?1 AND reference_id = ?2"
        )
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map([reference_type.trim(), reference_id.trim()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, Option<String>>(9)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    for (
        orig_date,
        orig_time,
        account_type,
        account_id,
        debit,
        credit,
        currency,
        type_,
        description,
        notes,
    ) in entries
    {
        let rev_debit = credit;
        let rev_credit = debit;
        let rev_type = format!("عكس: {}", type_);
        let rev_desc = format!("عكس: {}", description);

        conn.execute(
            "INSERT INTO financial_ledger (
                date, time, account_type, account_id, debit, credit, currency, 
                reference_type, reference_id, type_, description, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                orig_date,
                orig_time,
                account_type,
                account_id.as_deref(),
                rev_debit,
                rev_credit,
                currency,
                reference_type,
                reference_id,
                rev_type,
                rev_desc,
                notes.as_deref(),
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn record_partner_ledger_entries(conn: &Connection, tx_id: i64) -> Result<(), String> {
    let tx_info: Result<(String, String, String, f64, String, Option<String>, Option<String>, String, String), rusqlite::Error> = conn.query_row(
        "SELECT partner_name, kind, type, amount, date, notes, currency, COALESCE(payment_type, 'قاصه'), COALESCE(time, '00:00')
         FROM partner_transactions WHERE id = ?1",
        [tx_id],
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
                row.get(8)?,
            ))
        }
    );

    let (p_name, kind, tx_type, amount, tx_date, notes_opt, curr_opt, payment_type, tx_time) =
        match tx_info {
            Ok(info) => info,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };

    let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());
    let notes = notes_opt.unwrap_or_default();

    let is_deposit = tx_type.starts_with("ايداع")
        || tx_type.starts_with("مقدمة")
        || tx_type.starts_with("تسديد")
        || tx_type.starts_with("استلام");

    if tx_type.starts_with("سحب شراء سيارة")
        || tx_type.starts_with("ايداع بيع سيارة")
        || tx_type.starts_with("مقدمة بيع سيارة")
        || tx_type.starts_with("سحب مصروف")
        || tx_type.starts_with("ايداع ارباح وكالة")
        || tx_type.starts_with("باقي")
        || tx_type.starts_with("تحويل")
        || notes.starts_with("ارجاع (رأس المال")
        || notes.contains("شراكة سيارة")
        || ((kind == "ممول" || kind == "شركة") && is_deposit)
        || tx_type.starts_with("توزيع أرباح")
        || tx_type.starts_with("سحب أرباح")
        || tx_type.starts_with("تسوية مسحوبات")
        || tx_type.starts_with("إعادة استثمار")
        || notes.contains("توزيع أرباح")
    {
        return Ok(());
    }

    let ref_id = tx_id.to_string();

    match kind.as_str() {
        "شريك" => {
            if is_deposit {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع شريك",
                    &format!("إيداع شريك: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "capital",
                    Some(&p_name),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع شريك رأس مال",
                    &format!("إيداع رأس مال الشريك {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "drawings",
                    Some(&p_name),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب شريك مصروف",
                    &format!("مسحوبات الشريك {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب شريك",
                    &format!("سحب نقدي شريك: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "مستثمر" => {
            if is_deposit {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع مستثمر",
                    &format!("إيداع مستثمر: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "investor",
                    Some(&p_name),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع مستثمر اموال",
                    &format!("إيداع أموال المستثمر {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "investor",
                    Some(&p_name),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب مستثمر اموال",
                    &format!("سحب أموال المستثمر {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب مستثمر",
                    &format!("سحب نقدي مستثمر: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "ممول" => {
            if is_deposit {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع ممول",
                    &format!("إيداع ممول: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "funder",
                    Some(&p_name),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "تمويل ممول اموال",
                    &format!("استلام تمويل من الممول {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "funder",
                    Some(&p_name),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سداد ممول اموال",
                    &format!("تسديد تمويل للممول {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سداد ممول نقدي",
                    &format!("سداد نقدي للممول: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "شركة" => {
            if is_deposit {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع شركة",
                    &format!("إيداع شركة: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "payable",
                    Some(&p_name),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ايداع شركة اموال",
                    &format!("إيداع حساب شركة {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "payable",
                    Some(&p_name),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب شركة اموال",
                    &format!("سحب حساب شركة {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب شركة نقدي",
                    &format!("سداد نقدي لحساب الشركة: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "مطلوب" | "مقترض" => {
            if is_deposit {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "cash",
                    Some(&payment_type),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "تسديد قسط",
                    &format!("تسديد قسط من {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "receivable",
                    Some(&p_name),
                    0.0,
                    amount,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "تسديد قسط",
                    &format!("تخفيض ذمة مدين {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            } else {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "receivable",
                    Some(&p_name),
                    amount,
                    0.0,
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "ذمة مدينة جديدة",
                    &format!("زيادة ذمة مدين {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                if kind != "مقترض" {
                    record_ledger_entry(
                        conn,
                        &tx_date,
                        &tx_time,
                        "cash",
                        Some(&payment_type),
                        0.0,
                        amount,
                        &curr,
                        "partner_transaction",
                        &ref_id,
                        "سحب مدين نقدي",
                        &format!("سحب نقدي مدين: {}", p_name),
                        Some(&notes),
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        _ => {}
    }

    Ok(())
}

fn record_agency_ledger_entries(conn: &Connection, agency_id: i64) -> Result<(), String> {
    reverse_ledger_entries(conn, "agency", &agency_id.to_string())?;

    let agency_info: Result<(String, String, f64, f64, String, String), rusqlite::Error> = conn.query_row(
        "SELECT old_agent_name, new_agent_name, amount_usd, amount_iqd, date, time FROM agencies WHERE id = ?1",
        [agency_id],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        }
    );

    let (old_agent_name, new_agent_name, amount_usd, amount_iqd, date, time) = match agency_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    let agency_desc = format!("وكالة {} {}", old_agent_name.trim(), new_agent_name.trim());
    let ref_id = agency_id.to_string();

    if amount_usd > 0.0 {
        record_ledger_entry(
            conn,
            &date,
            &time,
            "cash",
            Some("قاصه"),
            amount_usd,
            0.0,
            "USD",
            "agency",
            &ref_id,
            "أرباح وكالة",
            &agency_desc,
            None,
        )
        .map_err(|e| e.to_string())?;
        record_ledger_entry(
            conn,
            &date,
            &time,
            "revenue",
            Some("agency"),
            0.0,
            amount_usd,
            "USD",
            "agency",
            &ref_id,
            "أرباح وكالة إيراد",
            &agency_desc,
            None,
        )
        .map_err(|e| e.to_string())?;
    }

    if amount_iqd > 0.0 {
        record_ledger_entry(
            conn,
            &date,
            &time,
            "cash",
            Some("قاصه"),
            amount_iqd,
            0.0,
            "IQD",
            "agency",
            &ref_id,
            "أرباح وكالة",
            &agency_desc,
            None,
        )
        .map_err(|e| e.to_string())?;
        record_ledger_entry(
            conn,
            &date,
            &time,
            "revenue",
            Some("agency"),
            0.0,
            amount_iqd,
            "IQD",
            "agency",
            &ref_id,
            "أرباح وكالة إيراد",
            &agency_desc,
            None,
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn record_agency_transaction_ledger_entries(conn: &Connection, tx_id: i64) -> Result<(), String> {
    reverse_ledger_entries(conn, "agency_transaction", &tx_id.to_string())?;

    let tx_info: Result<(i64, String, String, String, f64, Option<String>, Option<String>), rusqlite::Error> = conn.query_row(
        "SELECT agency_id, date, time, type_, amount, currency, notes FROM agency_transactions WHERE id = ?1",
        [tx_id],
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
        }
    );

    let (agency_id, date, time, type_, amount, curr_opt, notes_opt) = match tx_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());
    let notes = notes_opt.unwrap_or_default();
    let ref_id = tx_id.to_string();

    let is_deposit = type_.trim() == "ايداع";

    if is_deposit {
        record_ledger_entry(
            conn,
            &date,
            &time,
            "cash",
            Some("قاصه"),
            amount,
            0.0,
            &curr,
            "agency_transaction",
            &ref_id,
            "إيداع وكالة",
            &format!("إيداع حركة وكالة رقم {}", agency_id),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;
        record_ledger_entry(
            conn,
            &date,
            &time,
            "revenue",
            Some("agency"),
            0.0,
            amount,
            &curr,
            "agency_transaction",
            &ref_id,
            "إيداع وكالة إيراد",
            &format!("إيراد حركة وكالة رقم {}", agency_id),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;
    } else {
        record_ledger_entry(
            conn,
            &date,
            &time,
            "revenue",
            Some("agency"),
            amount,
            0.0,
            &curr,
            "agency_transaction",
            &ref_id,
            "سحب وكالة إيراد",
            &format!("تخفيض إيراد حركة وكالة رقم {}", agency_id),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;
        record_ledger_entry(
            conn,
            &date,
            &time,
            "cash",
            Some("قاصه"),
            0.0,
            amount,
            &curr,
            "agency_transaction",
            &ref_id,
            "سحب وكالة",
            &format!("سحب نقدي حركة وكالة رقم {}", agency_id),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn migrate_existing_data_to_ledger(conn: &Connection) -> SqlResult<()> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM financial_ledger", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);

    if count > 0 {
        return Ok(());
    }

    let today = "2026-06-12".to_string();
    let get_valid_date = |d: Option<String>| {
        let val = d.unwrap_or_default().trim().to_string();
        if val.is_empty() {
            today.clone()
        } else {
            val
        }
    };
    let get_valid_time = |t: Option<String>| {
        let val = t.unwrap_or_default().trim().to_string();
        if val.is_empty() {
            "00:00".to_string()
        } else {
            val
        }
    };

    // 1. Cars Purchase & Sale
    let mut cars_stmt = conn.prepare(
        "SELECT car_number, car_name, purchase_price, currency, purchase_type, financer_name, purchase_date, purchase_time,
                status, selling_price, sale_currency, payment_type, amount_paid, amount_remaining, sale_date, sale_time, buyer_name
         FROM cars"
    )?;

    let mut car_partners_stmt = conn.prepare(
        "SELECT partner_name, amount, currency, kind FROM car_partners WHERE car_number = ?1",
    )?;

    let mut car_expenses_stmt =
        conn.prepare("SELECT amount FROM car_expenses WHERE car_number = ?1")?;

    let cars_rows = cars_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, f64>(9)?,
            row.get::<_, Option<String>>(10)?,
            row.get::<_, Option<String>>(11)?,
            row.get::<_, Option<f64>>(12)?,
            row.get::<_, Option<f64>>(13)?,
            row.get::<_, Option<String>>(14)?,
            row.get::<_, Option<String>>(15)?,
            row.get::<_, Option<String>>(16)?,
        ))
    })?;

    for car_res in cars_rows {
        let (
            car_number,
            car_name,
            purchase_price,
            currency_opt,
            purchase_type_opt,
            financer_name_opt,
            purchase_date_opt,
            purchase_time_opt,
            status,
            selling_price,
            sale_currency_opt,
            payment_type_opt,
            amount_paid_opt,
            amount_remaining_opt,
            sale_date_opt,
            sale_time_opt,
            buyer_name_opt,
        ) = car_res?;

        let currency = currency_opt.unwrap_or_else(|| "IQD".to_string());
        let purchase_type = purchase_type_opt.unwrap_or_else(|| "كاش".to_string());
        let purchase_date = get_valid_date(purchase_date_opt);
        let purchase_time = get_valid_time(purchase_time_opt);

        if purchase_price > 0.0 {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'inventory', ?3, ?4, 0.0, ?5, 'car', ?6, 'شراء سيارة', ?7, NULL)",
                params![
                    purchase_date,
                    purchase_time,
                    car_number,
                    purchase_price,
                    currency,
                    car_number,
                    format!("شراء سيارة: {} ({})", car_name, car_number)
                ],
            )?;

            if purchase_type == "دين" || purchase_type == "شركة" {
                let financer_name = financer_name_opt.unwrap_or_default().trim().to_string();
                let acc_id = if financer_name.is_empty() {
                    "ممول عام".to_string()
                } else {
                    financer_name
                };
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'funder', ?3, 0.0, ?4, ?5, 'car', ?6, 'تمويل شراء سيارة', ?7, NULL)",
                    params![
                        purchase_date,
                        purchase_time,
                        acc_id,
                        purchase_price,
                        currency,
                        car_number,
                        format!("تمويل شراء سيارة: {} ({}) من قبل {}", car_name, car_number, acc_id)
                    ],
                )?;
            } else if purchase_type == "شراكه" {
                let partner_rows = car_partners_stmt.query_map([&car_number], |p_row| {
                    Ok((
                        p_row.get::<_, String>(0)?,
                        p_row.get::<_, f64>(1)?,
                        p_row.get::<_, String>(2)?,
                        p_row.get::<_, String>(3)?,
                    ))
                })?;
                let mut partners = Vec::new();
                for r in partner_rows {
                    partners.push(r?);
                }

                if partners.is_empty() {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'capital', 'شريك عام', 0.0, ?3, ?4, 'car', ?5, 'شراء سيارة شراكة', ?6, NULL)",
                        params![
                            purchase_date,
                            purchase_time,
                            purchase_price,
                            currency,
                            car_number,
                            format!("شراء سيارة شراكة (بدون شركاء محددين): {} ({})", car_name, car_number)
                        ],
                    )?;
                } else {
                    for (p_name, amount, p_curr, p_kind) in partners {
                        let acc_type = match p_kind.as_str() {
                            "مستثمر" => "investor",
                            "ممول" => "funder",
                            "شركة" => "payable",
                            _ => "capital",
                        };
                        conn.execute(
                            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                             VALUES (?1, ?2, ?3, ?4, 0.0, ?5, ?6, 'car', ?7, 'شراكة شراء سيارة', ?8, NULL)",
                            params![
                                purchase_date,
                                purchase_time,
                                acc_type,
                                p_name,
                                amount,
                                p_curr,
                                car_number,
                                format!("مساهمة الشريك {} في شراء سيارة {} ({})", p_name, car_name, car_number)
                            ],
                        )?;
                    }
                }
            } else {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'car', ?5, 'شراء سيارة كاش', ?6, NULL)",
                    params![
                        purchase_date,
                        purchase_time,
                        purchase_price,
                        currency,
                        car_number,
                        format!("سحب نقدي لشراء سيارة: {} ({})", car_name, car_number)
                    ],
                )?;
            }
        }

        if status == "مبيوعة" {
            let sale_currency = sale_currency_opt.unwrap_or_else(|| "IQD".to_string());
            let payment_type = payment_type_opt.unwrap_or_else(|| "كاش".to_string());
            let sale_date = get_valid_date(sale_date_opt);
            let sale_time = get_valid_time(sale_time_opt);
            let buyer_name = buyer_name_opt.unwrap_or_else(|| "مشتري مجهول".to_string());
            let amount_paid = amount_paid_opt.unwrap_or(selling_price);
            let amount_remaining = amount_remaining_opt.unwrap_or(0.0);

            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'revenue', ?3, 0.0, ?4, ?5, 'car', ?6, 'بيع سيارة', ?7, NULL)",
                params![
                    sale_date,
                    sale_time,
                    car_number,
                    selling_price,
                    sale_currency,
                    car_number,
                    format!("إيراد بيع سيارة {} ({}) إلى {}", car_name, car_number, buyer_name)
                ],
            )?;

            if payment_type == "كاش" {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'cash', 'قاصه', ?3, 0.0, ?4, 'car', ?5, 'بيع سيارة كاش', ?6, NULL)",
                    params![
                        sale_date,
                        sale_time,
                        selling_price,
                        sale_currency,
                        car_number,
                        format!("استلام نقدي بيع سيارة {} ({})", car_name, car_number)
                    ],
                )?;
            } else {
                if amount_paid > 0.0 {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', 'قاصه', ?3, 0.0, ?4, 'car', ?5, 'مقدمة سيارة', ?6, NULL)",
                        params![
                            sale_date,
                            sale_time,
                            amount_paid,
                            sale_currency,
                            car_number,
                            format!("دفعة نقدية مستلمة بيع سيارة {} ({})", car_name, car_number)
                        ],
                    )?;
                }
                if amount_remaining > 0.0 {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'receivable', ?3, ?4, 0.0, ?5, 'car', ?6, 'مدينون بيع سيارة', ?7, NULL)",
                        params![
                            sale_date,
                            sale_time,
                            buyer_name,
                            amount_remaining,
                            sale_currency,
                            car_number,
                            format!("ذمة مدينة متبقية بيع سيارة {} ({}) على {}", car_name, car_number, buyer_name)
                        ],
                    )?;
                }
            }

            let mut exp_amount_sum = 0.0;
            let mut exp_rows = car_expenses_stmt.query([&car_number])?;
            while let Some(r) = exp_rows.next()? {
                exp_amount_sum += r.get::<_, f64>(0)?;
            }
            let total_cogs = purchase_price + exp_amount_sum;

            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'expense', 'cogs', ?3, 0.0, ?4, 'car', ?5, 'تكلفة المبيعات', ?6, NULL)",
                params![
                    sale_date,
                    sale_time,
                    total_cogs,
                    currency,
                    car_number,
                    format!("تكلفة البضاعة المباعة سيارة {} ({})", car_name, car_number)
                ],
            )?;

            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'inventory', ?3, 0.0, ?4, ?5, 'car', ?6, 'تخفيض المخزون بيع سيارة', ?7, NULL)",
                params![
                    sale_date,
                    sale_time,
                    car_number,
                    total_cogs,
                    currency,
                    car_number,
                    format!("إخراج سيارة {} ({}) من المخزون", car_name, car_number)
                ],
            )?;
        }
    }

    // 2. Car Expenses
    let mut ce_stmt = conn.prepare(
        "SELECT id, car_number, description, amount, date, currency, time FROM car_expenses",
    )?;
    let ce_rows = ce_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, f64>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, String>(6)?,
        ))
    })?;
    for ce in ce_rows {
        let (id, car_number, description, amount, ce_date, ce_curr_opt, ce_time) = ce?;
        let ce_curr = ce_curr_opt.unwrap_or_else(|| "IQD".to_string());

        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             VALUES (?1, ?2, 'inventory', ?3, ?4, 0.0, ?5, 'expense', ?6, 'مصروف سيارة', ?7, NULL)",
            params![
                ce_date,
                ce_time,
                car_number,
                amount,
                ce_curr,
                id.to_string(),
                format!("مصروف سيارة {} - {}", car_number, description)
            ],
        )?;

        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'expense', ?5, 'مصروف سيارة نقدي', ?6, NULL)",
            params![
                ce_date,
                ce_time,
                amount,
                ce_curr,
                id.to_string(),
                format!("دفع نقدي مصروف سيارة {} - {}", car_number, description)
            ],
        )?;
    }

    // 3. General Expenses
    let mut exp_stmt = conn.prepare("SELECT id, description, amount, date, time, notes, currency FROM expenses WHERE car_number IS NULL OR car_number = ''")?;
    let exp_rows = exp_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
        ))
    })?;
    for exp in exp_rows {
        let (id, desc, amount, exp_date, exp_time, notes, curr_opt) = exp?;
        let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());

        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             VALUES (?1, ?2, 'expense', ?3, ?4, 0.0, ?5, 'expense', ?6, 'مصروف عام', ?7, ?8)",
            params![
                exp_date,
                exp_time,
                desc,
                amount,
                curr,
                id.to_string(),
                desc,
                notes
            ],
        )?;

        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'expense', ?5, 'دفع مصروف', ?6, ?7)",
            params![
                exp_date,
                exp_time,
                amount,
                curr,
                id.to_string(),
                format!("سحب نقدي مصروف: {}", desc),
                notes
            ],
        )?;
    }

    // 4. Partner Transactions (Manual Only)
    let mut pt_stmt = conn.prepare(
        "SELECT id, partner_name, kind, type, amount, date, notes, currency, COALESCE(payment_type, 'قاصه'), COALESCE(time, '00:00')
         FROM partner_transactions"
    )?;
    let pt_rows = pt_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, f64>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
        ))
    })?;

    for pt in pt_rows {
        let (
            id,
            p_name,
            kind,
            tx_type,
            amount,
            tx_date,
            notes_opt,
            curr_opt,
            payment_type,
            tx_time,
        ) = pt?;
        let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());
        let notes = notes_opt.unwrap_or_default();

        let is_deposit = tx_type.starts_with("ايداع")
            || tx_type.starts_with("مقدمة")
            || tx_type.starts_with("تسديد")
            || tx_type.starts_with("استلام");

        if tx_type.starts_with("سحب شراء سيارة")
            || tx_type.starts_with("ايداع بيع سيارة")
            || tx_type.starts_with("سحب مصروف")
            || tx_type.starts_with("ايداع ارباح وكالة")
            || tx_type.starts_with("باقي")
            || tx_type.starts_with("تحويل")
            || notes.starts_with("ارجاع (رأس المال")
            || notes.contains("شراكة سيارة")
            || ((kind == "ممول" || kind == "شركة") && is_deposit)
            || tx_type.starts_with("توزيع أرباح")
            || tx_type.starts_with("سحب أرباح")
            || tx_type.starts_with("تسوية مسحوبات")
            || tx_type.starts_with("إعادة استثمار")
            || notes.contains("توزيع أرباح")
        {
            continue;
        }

        match kind.as_str() {
            "شريك" => {
                if is_deposit {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'ايداع شريك', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("إيداع شريك: {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'capital', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'ايداع شريك رأس مال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("إيداع رأس مال الشريك {}", p_name), notes],
                    )?;
                } else {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'capital', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سحب شريك رأس مال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("سحب رأس مال الشريك {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سحب شريك', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سحب نقدي شريك: {}", p_name), notes],
                    )?;
                }
            }
            "مستثمر" => {
                if is_deposit {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'ايداع مستثمر', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("إيداع مستثمر: {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'investor', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'ايداع مستثمر اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("إيداع أموال المستثمر {}", p_name), notes],
                    )?;
                } else {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'investor', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سحب مستثمر اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("سحب أموال المستثمر {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سحب مستثمر', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سحب نقدي مستثمر: {}", p_name), notes],
                    )?;
                }
            }
            "ممول" => {
                if is_deposit {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'ايداع ممول', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("إيداع ممول: {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'funder', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'تمويل ممول اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("استلام تمويل من الممول {}", p_name), notes],
                    )?;
                } else {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'funder', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سداد ممول اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("تسديد تمويل للممول {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سداد ممول نقدي', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سداد نقدي للممول: {}", p_name), notes],
                    )?;
                }
            }
            "شركة" => {
                if is_deposit {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'ايداع شركة', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("إيداع شركة: {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'payable', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'ايداع شركة اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("إيداع حساب شركة {}", p_name), notes],
                    )?;
                } else {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'payable', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سحب شركة اموال', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("سحب حساب شركة {}", p_name), notes],
                    )?;
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سحب شركة نقدي', ?7, ?8)",
                        params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سداد نقدي لحساب الشركة: {}", p_name), notes],
                    )?;
                }
            }
            "مطلوب" | "مقترض" => {
                if is_deposit {
                    let is_actual_payment =
                        tx_type.starts_with("تسديد") || tx_type.starts_with("استلام");
                    let is_muqtarib_advance = kind == "مقترض"
                        && (tx_type.starts_with("مقدمة") || tx_type.starts_with("ايداع"));

                    let should_insert_cash = kind == "مطلوب"
                        || is_muqtarib_advance
                        || (kind == "مقترض"
                            && is_actual_payment
                            && tx_type.starts_with("تسديد قسط سيارة"));

                    if should_insert_cash {
                        conn.execute(
                            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                             VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'تسديد مدين نقدي', ?7, ?8)",
                            params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("تسديد نقدي من {}", p_name), notes],
                        )?;
                    }
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'receivable', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'تسديد مدين', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("تخفيض ذمة مدين {}", p_name), notes],
                    )?;
                } else {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'receivable', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'ذمة مدينة جديدة', ?7, ?8)",
                        params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("زيادة ذمة مدين {}", p_name), notes],
                    )?;
                    if kind != "مقترض" {
                        conn.execute(
                            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                             VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سحب مدين نقدي', ?7, ?8)",
                            params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سحب نقدي مدين: {}", p_name), notes],
                        )?;
                    }
                }
            }
            _ => {}
        }
    }

    // 5. Agencies & Agency Transactions
    let mut ag_stmt = conn.prepare("SELECT id, old_agent_name, new_agent_name, amount_usd, amount_iqd, date, time FROM agencies")?;
    let ag_rows = ag_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, f64>(3)?,
            row.get::<_, f64>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
        ))
    })?;
    for ag in ag_rows {
        let (id, old_name, new_name, amount_usd, amount_iqd, ag_date, ag_time) = ag?;

        if amount_usd > 0.0 {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'cash', 'قاصه', ?3, 0.0, 'USD', 'agency', ?4, 'أرباح وكالة', ?5, NULL)",
                params![ag_date, ag_time, amount_usd, id.to_string(), format!("إيداع أرباح وكالة من {} إلى {}", old_name, new_name)],
            )?;
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'revenue', 'agency', 0.0, ?3, 'USD', 'agency', ?4, 'أرباح وكالة إيراد', ?5, NULL)",
                params![ag_date, ag_time, amount_usd, id.to_string(), format!("إيراد أرباح وكالة من {} إلى {}", old_name, new_name)],
            )?;
        }

        if amount_iqd > 0.0 {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'cash', 'قاصه', ?3, 0.0, 'IQD', 'agency', ?4, 'أرباح وكالة', ?5, NULL)",
                params![ag_date, ag_time, amount_iqd, id.to_string(), format!("إيداع أرباح وكالة من {} إلى {}", old_name, new_name)],
            )?;
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'revenue', 'agency', 0.0, ?3, 'IQD', 'agency', ?4, 'أرباح وكالة إيراد', ?5, NULL)",
                params![ag_date, ag_time, amount_iqd, id.to_string(), format!("إيراد أرباح وكالة من {} إلى {}", old_name, new_name)],
            )?;
        }
    }

    let mut agt_stmt = conn.prepare(
        "SELECT id, agency_id, date, time, type_, amount, currency, notes FROM agency_transactions",
    )?;
    let agt_rows = agt_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, f64>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
        ))
    })?;
    for agt in agt_rows {
        let (id, agency_id, date, time, type_, amount, curr_opt, notes) = agt?;
        let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());

        if type_ == "ايداع" {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'cash', 'قاصه', ?3, 0.0, ?4, 'agency_transaction', ?5, 'إيداع وكالة', ?6, ?7)",
                params![date, time, amount, curr, id.to_string(), format!("إيداع حركة وكالة رقم {}", agency_id), notes],
            )?;
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'revenue', 'agency', 0.0, ?3, ?4, 'agency_transaction', ?5, 'إيداع وكالة إيراد', ?6, ?7)",
                params![date, time, amount, curr, id.to_string(), format!("إيراد حركة وكالة رقم {}", agency_id), notes],
            )?;
        } else {
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'revenue', 'agency', ?3, 0.0, ?4, 'agency_transaction', ?5, 'سحب وكالة إيراد', ?6, ?7)",
                params![date, time, amount, curr, id.to_string(), format!("تخفيض إيراد حركة وكالة رقم {}", agency_id), notes],
            )?;
            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'agency_transaction', ?5, 'سحب وكالة', ?6, ?7)",
                params![date, time, amount, curr, id.to_string(), format!("سحب نقدي حركة وكالة رقم {}", agency_id), notes],
            )?;
        }
    }

    Ok(())
}

fn record_car_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    let car_number = car_number.trim();

    let car_info: Result<(String, f64, String, String, Option<String>, String, String, String, f64, String, Option<String>, Option<f64>, Option<f64>, String, String, Option<String>), rusqlite::Error> = db.query_row(
        "SELECT car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(purchase_type, 'كاش'), financer_name,
                COALESCE(purchase_date, ''), COALESCE(purchase_time, '00:00'), status, selling_price, COALESCE(sale_currency, 'IQD'),
                payment_type, amount_paid, amount_remaining, COALESCE(sale_date, ''), COALESCE(sale_time, '00:00'), buyer_name
         FROM cars WHERE car_number = ?1",
        [car_number],
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
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
                row.get(11)?,
                row.get(12)?,
                row.get(13)?,
                row.get(14)?,
                row.get(15)?,
            ))
        }
    );

    let (
        car_name,
        purchase_price,
        currency,
        purchase_type,
        financer_name_opt,
        purchase_date,
        purchase_time,
        status,
        selling_price,
        sale_currency,
        payment_type_opt,
        amount_paid_opt,
        amount_remaining_opt,
        sale_date,
        sale_time,
        buyer_name_opt,
    ) = match car_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    let p_date = if purchase_date.is_empty() {
        "2026-06-12".to_string()
    } else {
        purchase_date
    };
    let p_time = purchase_time;

    if purchase_price > 0.0 {
        record_ledger_entry(
            db,
            &p_date,
            &p_time,
            "inventory",
            Some(car_number),
            purchase_price,
            0.0,
            &currency,
            "car",
            car_number,
            "شراء سيارة",
            &format!("شراء سيارة: {} ({})", car_name, car_number),
            None,
        )
        .map_err(|e| e.to_string())?;

        if purchase_type == "دين" || purchase_type == "شركة" {
            let f_name = financer_name_opt.unwrap_or_default().trim().to_string();
            let acc_id = if f_name.is_empty() {
                "ممول عام".to_string()
            } else {
                f_name
            };
            record_ledger_entry(
                db,
                &p_date,
                &p_time,
                "funder",
                Some(&acc_id),
                0.0,
                purchase_price,
                &currency,
                "car",
                car_number,
                "تمويل شراء سيارة",
                &format!(
                    "تمويل شراء سيارة: {} ({}) من قبل {}",
                    car_name, car_number, acc_id
                ),
                None,
            )
            .map_err(|e| e.to_string())?;
        } else if purchase_type == "شراكه" {
            let mut p_stmt = db.prepare(
                "SELECT partner_name, amount, currency, kind FROM car_partners WHERE car_number = ?1"
            ).map_err(|e| e.to_string())?;

            let partners = p_stmt
                .query_map([car_number], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, f64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, rusqlite::Error>>()
                .map_err(|e| e.to_string())?;

            if partners.is_empty() {
                record_ledger_entry(
                    db,
                    &p_date,
                    &p_time,
                    "capital",
                    Some("شريك عام"),
                    0.0,
                    purchase_price,
                    &currency,
                    "car",
                    car_number,
                    "شراء سيارة شراكة",
                    &format!(
                        "شراء سيارة شراكة (بدون شركاء محددين): {} ({})",
                        car_name, car_number
                    ),
                    None,
                )
                .map_err(|e| e.to_string())?;
            } else {
                for (p_name, amount, p_curr, p_kind) in partners {
                    let acc_type = match p_kind.as_str() {
                        "مستثمر" => "investor",
                        "ممول" => "funder",
                        "شركة" => "payable",
                        _ => "capital",
                    };
                    record_ledger_entry(
                        db,
                        &p_date,
                        &p_time,
                        acc_type,
                        Some(&p_name),
                        0.0,
                        amount,
                        &p_curr,
                        "car",
                        car_number,
                        "شراكة شراء سيارة",
                        &format!(
                            "مساهمة الشريك {} في شراء سيارة {} ({})",
                            p_name, car_name, car_number
                        ),
                        None,
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        } else if purchase_type == "موجود" {
            // السيارة موجودة مسبقاً — لا يتم سحب أي مبلغ
        } else {
            let mut p_stmt = db.prepare("SELECT COALESCE(purchase_payment_type, 'قاصه') FROM cars WHERE car_number = ?1").map_err(|e| e.to_string())?;
            let register: String = p_stmt
                .query_row([car_number], |row| row.get(0))
                .unwrap_or_else(|_| "قاصه".to_string());
            let register = if register.trim().is_empty() {
                "قاصه".to_string()
            } else {
                register
            };

            record_ledger_entry(
                db,
                &p_date,
                &p_time,
                "cash",
                Some(&register),
                0.0,
                purchase_price,
                &currency,
                "car",
                car_number,
                "شراء سيارة كاش",
                &format!(
                    "سحب نقدي لشراء سيارة: {} ({}) من {}",
                    car_name, car_number, register
                ),
                None,
            )
            .map_err(|e| e.to_string())?;
        }
    }

    if status == "مبيوعة" {
        let s_date = if sale_date.is_empty() {
            "2026-06-12".to_string()
        } else {
            sale_date
        };
        let s_time = sale_time;
        let buyer_name = buyer_name_opt.unwrap_or_else(|| "مشتري مجهول".to_string());
        let payment_type = payment_type_opt.unwrap_or_else(|| "كاش".to_string());
        let amount_paid = amount_paid_opt.unwrap_or(selling_price);
        let amount_remaining = amount_remaining_opt.unwrap_or(0.0);

        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "revenue",
            Some(car_number),
            0.0,
            selling_price,
            &sale_currency,
            "car",
            car_number,
            "بيع سيارة",
            &format!(
                "إيراد بيع سيارة {} ({}) إلى {}",
                car_name, car_number, buyer_name
            ),
            None,
        )
        .map_err(|e| e.to_string())?;

        if payment_type == "كاش" {
            record_ledger_entry(
                db,
                &s_date,
                &s_time,
                "cash",
                Some("قاصه"),
                selling_price,
                0.0,
                &sale_currency,
                "car",
                car_number,
                "بيع سيارة كاش",
                &format!("استلام نقدي بيع سيارة {} ({})", car_name, car_number),
                None,
            )
            .map_err(|e| e.to_string())?;
        } else {
            if amount_paid > 0.0 {
                record_ledger_entry(
                    db,
                    &s_date,
                    &s_time,
                    "cash",
                    Some("قاصه"),
                    amount_paid,
                    0.0,
                    &sale_currency,
                    "car",
                    car_number,
                    "مقدمة سيارة",
                    &format!("مقدمة سيارة {} ({})", car_name, car_number),
                    None,
                )
                .map_err(|e| e.to_string())?;
            }
            if amount_remaining > 0.0 {
                record_ledger_entry(
                    db,
                    &s_date,
                    &s_time,
                    "receivable",
                    Some(&buyer_name),
                    amount_remaining,
                    0.0,
                    &sale_currency,
                    "car",
                    car_number,
                    "مدينون بيع سيارة",
                    &format!(
                        "ذمة مدينة متبقية بيع سيارة {} ({}) على {}",
                        car_name, car_number, buyer_name
                    ),
                    None,
                )
                .map_err(|e| e.to_string())?;
            }
        }

        let expenses_sum: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let total_cogs = purchase_price + expenses_sum;

        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "expense",
            Some("cogs"),
            total_cogs,
            0.0,
            &currency,
            "car",
            car_number,
            "تكلفة المبيعات",
            &format!("تكلفة البضاعة المباعة سيارة {} ({})", car_name, car_number),
            None,
        )
        .map_err(|e| e.to_string())?;

        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "inventory",
            Some(car_number),
            0.0,
            total_cogs,
            &currency,
            "car",
            car_number,
            "تخفيض المخزون بيع سيارة",
            &format!("إخراج سيارة {} ({}) من المخزون", car_name, car_number),
            None,
        )
        .map_err(|e| e.to_string())?;
    }

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

    // الاستعلام عن وقت الشراء ووقت البيع الحاليين لحفظهما قبل حذف أو استبدال السجل، وكذلك الاسم ورقم الشاصي والشركاء القديمين للتحديث
    let query_num = if !old_num.is_empty() {
        old_num
    } else {
        car_number.as_str()
    };
    let (existing_purchase_time, existing_sale_time, old_name, old_chassis, old_model, old_year): (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = db
        .query_row(
            "SELECT purchase_time, sale_time, car_name, chassis_number, car_model, car_year FROM cars WHERE car_number = ?1",
            [query_num],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .unwrap_or((None, None, None, None, None, None));

    if !old_num.is_empty() {
        // نقوم بحذف قيود دفتر الأستاذ القديمة للسيارة لتجنب التكرار والعكس في القاصة وسجل المعاملات
        db.execute(
            "DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1",
            [old_num],
        )
        .map_err(|e| e.to_string())?;

        if old_num != car_number {
            db.execute(
                "UPDATE car_expenses SET car_number = ?1 WHERE car_number = ?2",
                params![car_number.as_str(), old_num],
            )
            .map_err(|e| e.to_string())?;
            db.execute(
                "UPDATE financial_ledger SET account_id = ?1 WHERE account_type = 'inventory' AND account_id = ?2 AND reference_type = 'expense'",
                params![car_number.as_str(), old_num]
            ).map_err(|e| e.to_string())?;
            db.execute("DELETE FROM cars WHERE car_number = ?1", [old_num])
                .map_err(|e| e.to_string())?;
            db.execute("DELETE FROM car_partners WHERE car_number = ?1", [old_num])
                .map_err(|e| e.to_string())?;
        }
    } else {
        // حذف القيود القديمة للسيارة لتحديثها بالجديدة دون تكرار وعكس في سجل القاصة وسجل المعاملات
        db.execute(
            "DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1",
            [car_number.as_str()],
        )
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

        // Front-end generated notes for old specs
        let old_model_str = old_model.unwrap_or_default();
        let old_year_str = old_year.unwrap_or_default();
        let old_front_note = format!(
            "استلام تمويل لشراء سيارة {} {} {}",
            old_model_str.trim(),
            old_year_str.trim(),
            o_chassis.trim()
        )
        .trim()
        .replace("  ", " ");

        let new_front_note = format!(
            "استلام تمويل لشراء سيارة {} {} {}",
            model.trim(),
            year.trim(),
            clean_chassis
        )
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

        if old_front_note != new_front_note {
            db.execute(
                "UPDATE partner_transactions SET notes = ?1 WHERE notes = ?2",
                [&new_front_note, &old_front_note],
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

    // حذف حركات الشراء القديمة (الخلفية والواجهة) ثم إعادة إنشائها حسب نوع الشراء الحالي
    let new_front_note = format!(
        "استلام تمويل لشراء سيارة {} {} {}",
        model.trim(),
        year.trim(),
        clean_chassis
    )
    .trim()
    .replace("  ", " ");

    db.execute(
        "DELETE FROM partner_transactions WHERE notes = ?1 OR notes = ?2 OR notes = ?3",
        params![&new_purchase_note, &new_debt_note, &new_front_note],
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
        // لا يتم تسجيل حركات سحب للشركاء عند شراء سيارة كاش (تُسحب من القاصة مباشرةً)
    } else if purchase_type.as_deref() == Some("دين") || purchase_type.as_deref() == Some("شركة")
    {
        let p_kind = if purchase_type.as_deref() == Some("دين") {
            "ممول"
        } else {
            "شركة"
        };
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
            // لا يتم تسجيل حركات إيداع للشركاء عند بيع سيارة كاش (تدخل القاصة مباشرةً)
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

    record_car_ledger_entries(&db, car_number.as_str())?;

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
    let (car_name, chassis_number, car_model, car_year): (
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = db
        .query_row(
            "SELECT car_name, chassis_number, car_model, car_year FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap_or((String::new(), None, None, None));
    let chassis_str = chassis_number.unwrap_or_default();
    let clean_name = car_name.trim();
    let clean_chassis = chassis_str.trim();

    // عكس حركات القيود المالي في دفتر الأستاذ للسيارة ومصاريفها قبل الحذف
    reverse_ledger_entries(&db, "car", car_number)?;

    let mut ce_stmt = db
        .prepare("SELECT id FROM car_expenses WHERE car_number = ?1")
        .map_err(|e| e.to_string())?;
    let ce_ids = ce_stmt
        .query_map([car_number], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;
    for ce_id in ce_ids {
        reverse_ledger_entries(&db, "expense", &ce_id.to_string())?;
    }

    let mut ge_stmt = db
        .prepare("SELECT id FROM expenses WHERE car_number = ?1")
        .map_err(|e| e.to_string())?;
    let ge_ids = ge_stmt
        .query_map([car_number], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;
    for ge_id in ge_ids {
        reverse_ledger_entries(&db, "expense", &ge_id.to_string())?;
    }

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
    db.execute("DELETE FROM expenses WHERE car_number = ?1", [car_number])
        .map_err(|e| e.to_string())?;

    // Also delete any partner transactions associated with it using notes matching the formats
    let purchase_note = format!("سحب شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");
    let debt_note = format!("تمويل شراء سيارة {} {}", clean_name, clean_chassis)
        .trim()
        .replace("  ", " ");

    let model_str = car_model.unwrap_or_default();
    let year_str = car_year.unwrap_or_default();
    let frontend_debt_note = format!(
        "استلام تمويل لشراء سيارة {} {} {}",
        model_str.trim(),
        year_str.trim(),
        clean_chassis
    )
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
        "DELETE FROM partner_transactions WHERE notes = ?1 OR notes = ?2 OR notes = ?3 OR notes = ?4",
        params![purchase_note, debt_note, frontend_debt_note, sale_note],
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

    // إعادة احتساب الأرصدة تلقائياً لجميع الحسابات لضمان التحديث الفوري
    let _ = recalculate_all_partners(&db);

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
        "SELECT partner_name, phone, kind FROM partners WHERE kind = 'مطلوب' OR kind = 'ممول' OR kind = 'شركة' OR kind = 'مستثمر' OR kind = 'مقترض' ORDER BY partner_name"
    ).map_err(|e| e.to_string())?;

    let partners_list = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    let mut accounts = Vec::new();

    for (name, phone, kind) in partners_list {
        let mut tx_stmt = db.prepare(
            "SELECT type, amount, currency, notes FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2"
        ).map_err(|e| e.to_string())?;

        let rows = tx_stmt
            .query_map(params![name, kind], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut iqd_balance = 0.0;
        let mut usd_balance = 0.0;

        for r in rows {
            let (tx_type, amount, currency_opt, notes_opt) = r.map_err(|e| e.to_string())?;
            let curr = currency_opt.unwrap_or_else(|| "IQD".to_string());
            let notes = notes_opt.unwrap_or_default();
            let is_usd = curr == "USD";

            let signed = match kind.as_str() {
                "مقترض" | "مطلوب" => {
                    if tx_type.starts_with("سحب") || tx_type.starts_with("باقي") {
                        amount
                    } else if tx_type.starts_with("ايداع") || tx_type.starts_with("إيداع")
                    {
                        if (notes.contains("دفعة أولى")
                            || notes.contains("مؤجل"))
                            && !tx_type.starts_with("تسديد")
                        {
                            continue;
                        }
                        -amount
                    } else {
                        continue;
                    }
                }
                _ => {
                    if tx_type.starts_with("ايداع") || tx_type.starts_with("إيداع") {
                        amount
                    } else if tx_type.starts_with("سحب") {
                        -amount
                    } else {
                        continue;
                    }
                }
            };

            if is_usd {
                usd_balance += signed;
            } else {
                iqd_balance += signed;
            }
        }

        accounts.push(UnifiedAccount {
            partner_name: name,
            phone,
            iqd_balance,
            usd_balance,
            kind,
        });
    }

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
    let balance: f64 = if kind == "مطلوب" || kind == "مقترض" {
        db.query_row(
            "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'receivable' AND account_id = ?1",
            params![partner_name.trim()],
            |row| row.get(0),
        ).unwrap_or(0.0)
    } else {
        let deposits: f64 = db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE partner_name = ?1 AND kind = ?2
             AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%' OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%' OR type LIKE 'تسوية%')
             AND type NOT LIKE 'تحويل%'",
            params![partner_name.trim(), kind.trim()],
            |row| row.get(0),
        ).unwrap_or(0.0);
        let withdrawals: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE partner_name = ?1 AND kind = ?2
             AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
             AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim(), kind.trim()],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        deposits - withdrawals
    };

    db.execute(
        "UPDATE partners SET total_amount = ?1 WHERE partner_name = ?2 AND kind = ?3",
        params![balance, partner_name.trim(), kind.trim()],
    )
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
            && notes.as_deref().unwrap_or("").contains("ممول"));
    let tx_payment_type = if is_financier_repayment {
        Some(payment_type.as_deref().unwrap_or("قاصه"))
    } else {
        payment_type.as_deref()
    };

    let time_str = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        (
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            &time_str,
            notes.as_deref(),
            currency.as_deref(),
            tx_payment_type,
        ),
    )
    .map_err(|e| e.to_string())?;

    let tx_id = db.last_insert_rowid();

    // Ledger record
    record_partner_ledger_entries(&db, tx_id)?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;
    if is_financier_repayment {
        distribute_financier_repayment_to_partners(
            &db,
            partner_name.trim(),
            amount,
            date.trim(),
            currency.as_deref().unwrap_or("IQD"),
            notes.as_deref(),
            tx_id,
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
    tx_id: i64,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Ok(());
    }

    let commission_amount = parse_financier_commission(amount, notes);
    if commission_amount > 0.0 {
        let current_time = db
            .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
                row.get::<_, String>(0)
            })
            .unwrap_or_else(|_| "00:00".to_string());
        db.execute(
            "INSERT INTO expenses (description, amount, date, time, notes, currency, car_number)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
            params![
                "عمولة تسديد تمويل".to_string(),
                commission_amount,
                date,
                &current_time,
                Some(format!(
                    "عمولة تسديد الممول {} (رقم الحركة: {})",
                    financier_name, tx_id
                )),
                currency,
            ],
        )
        .map_err(|e| e.to_string())?;

        let exp_id = db.last_insert_rowid();

        record_ledger_entry(
            db,
            date,
            &current_time,
            "expense",
            Some("عمولة تسديد تمويل"),
            commission_amount,
            0.0,
            currency,
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
            db,
            date,
            &current_time,
            "cash",
            Some("قاصه"),
            0.0,
            commission_amount,
            currency,
            "expense",
            &exp_id.to_string(),
            "دفع مصروف",
            &format!("دفع مصروف: عمولة تسديد الممول {}", financier_name),
            None,
        )?;
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

    let time_str = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'قاصه')",
        params![
            financier_name,
            financier_kind,
            financier_tx_type,
            amount,
            date,
            &time_str,
            notes.as_deref(),
            currency.as_str(),
        ],
    )
    .map_err(|e| e.to_string())?;

    let tx_id = db.last_insert_rowid();

    // Ledger record
    record_partner_ledger_entries(&db, tx_id)?;

    recalculate_partner_total(&db, financier_name, financier_kind)?;

    if commission_amount > 0.0 {
        let commission_currency = commission_currency.unwrap_or_else(|| "IQD".to_string());
        db.execute(
            "INSERT INTO expenses (description, amount, date, time, notes, currency, car_number)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
            params![
                "عمولة تسديد تمويل".to_string(),
                commission_amount,
                date,
                &time_str,
                Some(format!(
                    "عمولة تسديد الممول {} (رقم الحركة: {})",
                    financier_name, tx_id
                )),
                commission_currency.as_str(),
            ],
        )
        .map_err(|e| e.to_string())?;

        let exp_id = db.last_insert_rowid();

        record_ledger_entry(
            &db,
            date,
            &time_str,
            "expense",
            Some("عمولة تسديد تمويل"),
            commission_amount,
            0.0,
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
            0.0,
            commission_amount,
            &commission_currency,
            "expense",
            &exp_id.to_string(),
            "دفع مصروف",
            &format!("دفع مصروف: عمولة تسديد الممول {}", financier_name),
            None,
        )?;
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

    // 1. Reverse old ledger entries for this partner transaction
    reverse_ledger_entries(&db, "partner_transaction", &id.to_string())?;

    let time_str = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    db.execute(
        "UPDATE partner_transactions
         SET type = ?1, amount = ?2, date = ?3, time = ?4, notes = ?5, currency = ?6, payment_type = ?7
         WHERE id = ?8 AND partner_name = ?9 AND kind = ?10",
        (
            type_.trim(),
            amount,
            date.trim(),
            &time_str,
            notes.as_deref(),
            currency.as_deref(),
            payment_type.as_deref(),
            id,
            partner_name.trim(),
            kind.trim(),
        ),
    )
    .map_err(|e| e.to_string())?;

    // Write new ledger entries
    record_partner_ledger_entries(&db, id)?;

    // Handle commission expense updating/deleting for financier repayments
    let is_financier_repayment = (kind.trim() == "ممول" && type_.trim().starts_with("سحب"))
        || (kind.trim() == "مطلوب"
            && type_.trim().starts_with("ايداع")
            && notes.as_deref().unwrap_or("").contains("ممول"));

    if is_financier_repayment {
        let commission_amount = parse_financier_commission(amount, notes.as_deref());
        let target_note_pattern = format!("%رقم الحركة: {}%", id);
        let existing_expense_id: Option<i64> = match db.query_row(
            "SELECT id FROM expenses WHERE notes LIKE ?1 LIMIT 1",
            [&target_note_pattern],
            |row| row.get(0),
        ) {
            Ok(val) => Some(val),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(e.to_string()),
        };

        if commission_amount > 0.0 {
            let expense_notes = format!(
                "عمولة تسديد الممول {} (رقم الحركة: {})",
                partner_name.trim(),
                id
            );
            match existing_expense_id {
                Some(exp_id) => {
                    // Reverse old ledger entries for this expense
                    reverse_ledger_entries(&db, "expense", &exp_id.to_string())?;

                    db.execute(
                        "UPDATE expenses SET amount = ?1, date = ?2, notes = ?3, currency = ?4 WHERE id = ?5",
                        params![
                            commission_amount,
                            date.trim(),
                            Some(expense_notes.clone()),
                            currency.as_deref().unwrap_or("IQD"),
                            exp_id
                        ],
                    )
                    .map_err(|e| e.to_string())?;

                    // Record new ledger entries for this expense
                    record_ledger_entry(
                        &db,
                        date.trim(),
                        &time_str,
                        "expense",
                        Some("عمولة تسديد تمويل"),
                        commission_amount,
                        0.0,
                        currency.as_deref().unwrap_or("IQD"),
                        "expense",
                        &exp_id.to_string(),
                        "مصروف عام",
                        &expense_notes,
                        None,
                    )?;

                    record_ledger_entry(
                        &db,
                        date.trim(),
                        &time_str,
                        "cash",
                        Some("قاصه"),
                        0.0,
                        commission_amount,
                        currency.as_deref().unwrap_or("IQD"),
                        "expense",
                        &exp_id.to_string(),
                        "دفع مصروف",
                        &format!("دفع مصروف: عمولة تسديد الممول {}", partner_name.trim()),
                        None,
                    )?;
                }
                None => {
                    db.execute(
                        "INSERT INTO expenses (description, amount, date, time, notes, currency, car_number)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
                        params![
                            "عمولة تسديد تمويل".to_string(),
                            commission_amount,
                            date.trim(),
                            &time_str,
                            Some(expense_notes.clone()),
                            currency.as_deref().unwrap_or("IQD"),
                        ],
                    )
                    .map_err(|e| e.to_string())?;

                    let exp_id = db.last_insert_rowid();

                    record_ledger_entry(
                        &db,
                        date.trim(),
                        &time_str,
                        "expense",
                        Some("عمولة تسديد تمويل"),
                        commission_amount,
                        0.0,
                        currency.as_deref().unwrap_or("IQD"),
                        "expense",
                        &exp_id.to_string(),
                        "مصروف عام",
                        &expense_notes,
                        None,
                    )?;

                    record_ledger_entry(
                        &db,
                        date.trim(),
                        &time_str,
                        "cash",
                        Some("قاصه"),
                        0.0,
                        commission_amount,
                        currency.as_deref().unwrap_or("IQD"),
                        "expense",
                        &exp_id.to_string(),
                        "دفع مصروف",
                        &format!("دفع مصروف: عمولة تسديد الممول {}", partner_name.trim()),
                        None,
                    )?;
                }
            }
        } else if let Some(exp_id) = existing_expense_id {
            reverse_ledger_entries(&db, "expense", &exp_id.to_string())?;
            db.execute("DELETE FROM expenses WHERE id = ?1", [exp_id])
                .map_err(|e| e.to_string())?;
        }
    } else {
        // If it was modified to not be a financier repayment, delete its linked expense if any
        let target_note_pattern = format!("%رقم الحركة: {}%", id);
        if let Ok(exp_id) = db.query_row(
            "SELECT id FROM expenses WHERE notes LIKE ?1 LIMIT 1",
            [&target_note_pattern],
            |row| row.get::<_, i64>(0),
        ) {
            reverse_ledger_entries(&db, "expense", &exp_id.to_string())?;
            let _ = db.execute("DELETE FROM expenses WHERE id = ?1", [exp_id]);
        }
    }

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

    // Delete corresponding commission expense if it exists
    let target_note = format!("%رقم الحركة: {}%", id);
    if let Ok(exp_id) = db.query_row(
        "SELECT id FROM expenses WHERE notes LIKE ?1 LIMIT 1",
        [&target_note],
        |row| row.get::<_, i64>(0),
    ) {
        reverse_ledger_entries(&db, "expense", &exp_id.to_string())?;
        let _ = db.execute("DELETE FROM expenses WHERE id = ?1", [exp_id]);
    }

    // Reverse ledger entries for this partner transaction
    reverse_ledger_entries(&db, "partner_transaction", &id.to_string())?;

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

    let mut query = "SELECT id, date, time, type_, (debit - credit) AS amount, description, notes, currency, account_id 
                     FROM financial_ledger 
                     WHERE account_type = 'cash'".to_string();

    let mut params: Vec<String> = Vec::new();

    if let Some(pt) = &payment_type {
        if pt == "قاصه" || pt == "قاصة" {
            query.push_str(" AND (account_id = 'قاصه' OR account_id = 'قاصة' OR account_id IS NULL OR account_id = '')");
        } else {
            query.push_str(" AND account_id = ?1");
            params.push(pt.trim().to_string());
        }
    }

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
        let amount: f64 = row.get(4).map_err(|e| e.to_string())?;
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
            balance: 0.0,
            currency,
        });
    }

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
    let currency_val = currency.unwrap_or_else(|| "IQD".to_string());
    let (_current_date, current_time) = now_datetime();

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
                    &currency_val,
                ),
            )
            .map_err(|e| e.to_string())?;

            let exp_id = db.last_insert_rowid();

            // 2. تسجيل القيد في دفتر الأستاذ
            record_ledger_entry(
                &db,
                date.trim(),
                &current_time,
                "inventory",
                Some(car_num),
                amount,
                0.0,
                &currency_val,
                "expense",
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
                0.0,
                amount,
                &currency_val,
                "expense",
                &exp_id.to_string(),
                "دفع مصروف سيارة",
                &format!("دفع مصروف سيارة: {} - {}", car_num, description.trim()),
                notes.as_deref(),
            )?;

            // 3. إذا كانت السيارة مبيوعة، نقوم بتحديث تكلفة المبيعات (COGS)
            let is_sold: bool = db
                .query_row(
                    "SELECT COUNT(1) FROM cars WHERE car_number = ?1 AND status = 'مبيوعة'",
                    [car_num],
                    |row| row.get(0),
                )
                .unwrap_or(0)
                > 0;

            if is_sold {
                reverse_ledger_entries(&db, "car", car_num)?;
                record_car_ledger_entries(&db, car_num)?;
            }

            return Ok(());
        }
    }

    // مصروف عام
    db.execute(
        "INSERT INTO expenses (description, amount, date, time, notes, currency, car_number)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            description.trim(),
            amount,
            date.trim(),
            &current_time,
            notes.as_deref(),
            &currency_val,
            &car_number,
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
        0.0,
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
        0.0,
        amount,
        &currency_val,
        "expense",
        &exp_id.to_string(),
        "دفع مصروف",
        &format!("دفع مصروف: {}", description.trim()),
        notes.as_deref(),
    )?;

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

    // عكس حركات القيد في دفتر الأستاذ
    reverse_ledger_entries(&db, "expense", &id.to_string())?;

    // حذف سجل المصروف
    db.execute("DELETE FROM expenses WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn update_expense(
    state: State<AppState>,
    id: i64,
    description: String,
    amount: f64,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let currency_val = currency.unwrap_or_else(|| "IQD".to_string());
    let (_, current_time) = now_datetime();

    // 1. عكس القيد القديم
    reverse_ledger_entries(&db, "expense", &id.to_string())?;

    // 2. تحديث جدول المصروفات
    db.execute(
        "UPDATE expenses SET description = ?1, amount = ?2, date = ?3, notes = ?4, currency = ?5 WHERE id = ?6",
        params![
            description.trim(),
            amount,
            date.trim(),
            notes.as_deref().map(|s| s.trim()),
            &currency_val,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    // 3. كتابة القيد الجديد في دفتر الأستاذ
    record_ledger_entry(
        &db,
        date.trim(),
        &current_time,
        "expense",
        Some(description.trim()),
        amount,
        0.0,
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
        0.0,
        amount,
        &currency_val,
        "expense",
        &id.to_string(),
        "دفع مصروف",
        &format!("دفع مصروف: {}", description.trim()),
        notes.as_deref(),
    )?;

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
    let currency_val = currency.unwrap_or_else(|| "IQD".to_string());
    let (_, current_time) = now_datetime();

    db.execute(
        "INSERT INTO car_expenses (car_number, description, amount, date, currency)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            car_number.trim(),
            description.trim(),
            amount,
            date.trim(),
            &currency_val,
        ),
    )
    .map_err(|e| e.to_string())?;
    let id = db.last_insert_rowid();

    // Record ledger entries
    record_ledger_entry(
        &db,
        date.trim(),
        &current_time,
        "inventory",
        Some(car_number.trim()),
        amount,
        0.0,
        &currency_val,
        "expense",
        &id.to_string(),
        "مصروف سيارة",
        &format!("مصروف سيارة {} - {}", car_number.trim(), description.trim()),
        None,
    )?;

    record_ledger_entry(
        &db,
        date.trim(),
        &current_time,
        "cash",
        Some("قاصه"),
        0.0,
        amount,
        &currency_val,
        "expense",
        &id.to_string(),
        "دفع مصروف سيارة",
        &format!(
            "دفع مصروف سيارة: {} - {}",
            car_number.trim(),
            description.trim()
        ),
        None,
    )?;

    let is_sold: bool = db
        .query_row(
            "SELECT COUNT(1) FROM cars WHERE car_number = ?1 AND status = 'مبيوعة'",
            [car_number.trim()],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if is_sold {
        reverse_ledger_entries(&db, "car", car_number.trim())?;
        record_car_ledger_entries(&db, car_number.trim())?;
    }

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
        // 2. عكس حركات القيد في دفتر الأستاذ
        reverse_ledger_entries(&db, "expense", &id.to_string())?;

        // 3. حذف سجل المصروف
        db.execute("DELETE FROM car_expenses WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;

        // 4. إذا كانت السيارة مبيوعة، نقوم بتحديث تكلفة المبيعات (COGS)
        let is_sold: bool = db
            .query_row(
                "SELECT COUNT(1) FROM cars WHERE car_number = ?1 AND status = 'مبيوعة'",
                [&car_number],
                |row| row.get(0),
            )
            .unwrap_or(0)
            > 0;

        if is_sold {
            reverse_ledger_entries(&db, "car", &car_number)?;
            record_car_ledger_entries(&db, &car_number)?;
        }
    } else {
        db.execute("DELETE FROM car_expenses WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn now_datetime() -> (String, String) {
    if let Ok(conn) = rusqlite::Connection::open_in_memory() {
        if let Ok(res) = conn.query_row(
            "SELECT strftime('%Y-%m-%d', 'now', 'localtime'), strftime('%H:%M', 'now', 'localtime')",
            [],
            |row| Ok((row.get::<_, String>(0).unwrap_or_default(), row.get::<_, String>(1).unwrap_or_default()))
        ) {
            return res;
        }
    }
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
        let days_in_year = if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 {
            366
        } else {
            365
        };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let month_days: [u64; 12] = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut m = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if days < md {
            m = i;
            break;
        }
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
            "SELECT id, old_agent_name, car_type, car_number, car_model, color, new_agent_name, phone,
                    amount_usd, amount_iqd, notes, date, time
             FROM agencies ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;

    let agencies = stmt
        .query_map([], |row| {
            Ok(Agency {
                id: row.get(0)?,
                old_agent_name: row.get(1)?,
                car_type: row.get(2)?,
                car_number: row.get(3)?,
                car_model: row.get(4)?,
                color: row.get(5)?,
                new_agent_name: row.get(6)?,
                phone: row.get(7)?,
                amount_usd: row.get(8)?,
                amount_iqd: row.get(9)?,
                notes: row.get(10)?,
                date: row.get(11)?,
                time: row.get(12)?,
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
    car_type: String,
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
    let (date, time): (String, String) = db
        .query_row(
            "SELECT strftime('%Y-%m-%d', 'now', 'localtime'), strftime('%H:%M', 'now', 'localtime')",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or_else(|_| now_datetime());

    db.execute(
        "INSERT INTO agencies (old_agent_name, car_type, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        (
            old_agent_name.trim(),
            car_type.trim(),
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

    // Record setup entries in ledger
    record_agency_ledger_entries(&db, new_id)?;

    Ok(new_id)
}

#[tauri::command]
fn update_agency(
    state: State<AppState>,
    id: i64,
    old_agent_name: String,
    car_type: String,
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

    // تحديث جدول الوكالات بالبيانات الجديدة
    db.execute(
        "UPDATE agencies SET old_agent_name = ?1, car_type = ?2, car_number = ?3, car_model = ?4, color = ?5, new_agent_name = ?6, phone = ?7, amount_usd = ?8, amount_iqd = ?9, notes = ?10 WHERE id = ?11",
        (
            old_agent_name.trim(),
            car_type.trim(),
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

    // Record setup entries in ledger
    record_agency_ledger_entries(&db, id)?;

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

    let tx_agency_note = format!("وكالة {} {}", old_agent_name.trim(), new_agent_name.trim())
        .trim()
        .replace("  ", " ");

    // Reverse agency setup entries
    reverse_ledger_entries(&db, "agency", &id.to_string())?;

    // Get agency transactions to reverse them
    let mut stmt = db
        .prepare("SELECT id FROM agency_transactions WHERE agency_id = ?1")
        .map_err(|e| e.to_string())?;
    let tx_ids: Vec<i64> = stmt
        .query_map([id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<i64>, _>>()
        .map_err(|e| e.to_string())?;
    for tx_id in tx_ids {
        reverse_ledger_entries(&db, "agency_transaction", &tx_id.to_string())?;
    }

    db.execute(
        "DELETE FROM partner_transactions WHERE type IN ('ايداع وكالة', 'سحب وكالة') AND notes = ?1",
        [&tx_agency_note],
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
    let time: String = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get(0)
        })
        .unwrap_or_else(|_| {
            let (_, t) = now_datetime();
            t
        });

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

    let tx_id = db.last_insert_rowid();

    // Record ledger entry
    record_agency_transaction_ledger_entries(&db, tx_id)?;

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

    let agency_note = format!("وكالة {} {}", old_agent_name.trim(), new_agent_name.trim())
        .trim()
        .replace("  ", " ");

    let partner_tx_type = if tx_type.trim() == "ايداع" {
        "ايداع وكالة"
    } else {
        "سحب وكالة"
    };

    // Reverse ledger entry
    reverse_ledger_entries(&db, "agency_transaction", &id.to_string())?;

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

    // 1. Cash Balance (separated by register/payment_type if provided)
    let (cash_iqd, cash_usd) = match &payment_type {
        Some(pt) => {
            if pt == "قاصه" || pt == "قاصة" {
                let iqd: f64 = db.query_row(
                    "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'cash' AND currency = 'IQD' AND (account_id = 'قاصه' OR account_id = 'قاصة' OR account_id IS NULL OR account_id = '')",
                    [],
                    |row| row.get(0),
                ).unwrap_or(0.0);
                let usd: f64 = db.query_row(
                    "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'cash' AND currency = 'USD' AND (account_id = 'قاصه' OR account_id = 'قاصة' OR account_id IS NULL OR account_id = '')",
                    [],
                    |row| row.get(0),
                ).unwrap_or(0.0);
                (iqd, usd)
            } else {
                let iqd: f64 = db.query_row(
                    "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'cash' AND currency = 'IQD' AND account_id = ?1",
                    [pt.trim()],
                    |row| row.get(0),
                ).unwrap_or(0.0);
                let usd: f64 = db.query_row(
                    "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'cash' AND currency = 'USD' AND account_id = ?1",
                    [pt.trim()],
                    |row| row.get(0),
                ).unwrap_or(0.0);
                (iqd, usd)
            }
        }
        None => {
            let iqd: f64 = db.query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'cash' AND currency = 'IQD'",
                [],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let usd: f64 = db.query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'cash' AND currency = 'USD'",
                [],
                |row| row.get(0),
            ).unwrap_or(0.0);
            (iqd, usd)
        }
    };

    // 2. Inventory Value
    let inventory_value_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let inventory_value_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // 3. Total Investments
    let total_investments_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'investor' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let total_investments_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'investor' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // 4. Total Partner Capital
    let total_partner_capital_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'capital' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let total_partner_capital_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'capital' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // 5. Total Debtors
    let total_debtors_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'receivable' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let total_debtors_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'receivable' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // 6. Total Expenses
    let total_expenses_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'expense' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let total_expenses_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'expense' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // 7. Net Capital (Assets - Liabilities = (cash + inventory + receivable) - (investor + funder + payable))
    let total_funders_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'funder' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let total_funders_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'funder' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let total_payables_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'payable' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let total_payables_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'payable' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let net_capital_iqd = (cash_iqd + inventory_value_iqd + total_debtors_iqd)
        - (total_investments_iqd + total_funders_iqd + total_payables_iqd);
    let net_capital_usd = (cash_usd + inventory_value_usd + total_debtors_usd)
        - (total_investments_usd + total_funders_usd + total_payables_usd);

    // 8. Monthly Profits
    let (current_date, _) = now_datetime();
    let current_month = &current_date[0..7];
    let current_month_like = format!("{}%", current_month);

    let revenue_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'revenue' AND currency = 'IQD' AND date LIKE ?1",
        [&current_month_like],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let revenue_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'revenue' AND currency = 'USD' AND date LIKE ?1",
        [&current_month_like],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let expenses_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'expense' AND currency = 'IQD' AND date LIKE ?1",
        [&current_month_like],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let expenses_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'expense' AND currency = 'USD' AND date LIKE ?1",
        [&current_month_like],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let monthly_profits_iqd = revenue_iqd - expenses_iqd;
    let monthly_profits_usd = revenue_usd - expenses_usd;

    Ok(FinancialSummary {
        cash_iqd,
        cash_usd,
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
        net_capital_iqd,
        net_capital_usd,
        monthly_profits_iqd,
        monthly_profits_usd,
    })
}

#[tauri::command]
fn get_partners_totals(state: State<AppState>, kind: String) -> Result<(f64, f64), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let filter_kind = match kind.as_str() {
        "partners-financial" => vec!["شريك", "مستثمر", "ممول", "مقترض", "شركة"],
        "partners-only" => vec!["شريك"],
        "customers-only" => vec!["مستثمر", "ممول", "مقترض", "شركة"],
        "مطلوب" => vec!["مطلوب"],
        "مقترض" => vec!["مقترض"],
        _ => vec![kind.as_str()],
    };

    let mut iqd_total = 0.0;
    let mut usd_total = 0.0;

    for k in &filter_kind {
        if *k == "مطلوب" || *k == "مقترض" {
            let balance: f64 = db.query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'receivable'",
                [],
                |row| row.get(0),
            ).unwrap_or(0.0);
            iqd_total += balance;
        } else {
            let mut stmt = db.prepare(
                "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%' OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%' OR type LIKE 'تسوية%' THEN amount
                        WHEN type LIKE 'سحب%' OR type LIKE 'باقي%' THEN -amount
                        ELSE 0
                    END), 0.0),
                    COALESCE(currency, 'IQD')
                 FROM partner_transactions
                 WHERE kind = ?1 AND type NOT LIKE 'تحويل%'
                 GROUP BY currency"
            ).map_err(|e| e.to_string())?;

            let rows = stmt
                .query_map([k], |row| {
                    Ok((row.get::<_, f64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;

            for row in rows {
                let (total, currency) = row.map_err(|e| e.to_string())?;
                if currency == "USD" {
                    usd_total += total;
                } else {
                    iqd_total += total;
                }
            }
        }
    }

    Ok((iqd_total, usd_total))
}

#[tauri::command]
fn get_profit_distribution_summary(
    state: State<AppState>,
) -> Result<ProfitDistributionSummary, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let revenue_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'revenue' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let revenue_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'revenue' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let expenses_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'expense' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let expenses_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'expense' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let distributed_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'retained_earnings' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let distributed_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'retained_earnings' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let undistributed_iqd = (revenue_iqd - expenses_iqd) - distributed_iqd;
    let undistributed_usd = (revenue_usd - expenses_usd) - distributed_usd;

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
        let capital_iqd: f64 = db.query_row(
            "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'capital' AND account_id = ?1 AND currency = 'IQD'",
            [&name],
            |row| row.get(0),
        ).unwrap_or(0.0);
        let capital_usd: f64 = db.query_row(
            "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'capital' AND account_id = ?1 AND currency = 'USD'",
            [&name],
            |row| row.get(0),
        ).unwrap_or(0.0);

        let drawings_iqd: f64 = db.query_row(
            "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'drawings' AND account_id = ?1 AND currency = 'IQD'",
            [&name],
            |row| row.get(0),
        ).unwrap_or(0.0);
        let drawings_usd: f64 = db.query_row(
            "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'drawings' AND account_id = ?1 AND currency = 'USD'",
            [&name],
            |row| row.get(0),
        ).unwrap_or(0.0);

        partners.push(PartnerDistributionInfo {
            partner_name: name,
            capital_iqd,
            capital_usd,
            drawings_iqd,
            drawings_usd,
        });
    }

    Ok(ProfitDistributionSummary {
        undistributed_iqd,
        undistributed_usd,
        partners,
    })
}

#[tauri::command]
fn distribute_profits(
    state: State<AppState>,
    total_profit: f64,
    currency: String,
    notes: Option<String>,
    shares: Vec<PartnerProfitShareInput>,
    _payment_type: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = &mut *db_guard;

    let tx = db.transaction().map_err(|e| e.to_string())?;

    let (current_date, current_time) = now_datetime();

    tx.execute(
        "INSERT INTO profit_distributions (date, time, total_profit, currency, notes)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![current_date, current_time, total_profit, currency, notes],
    )
    .map_err(|e| e.to_string())?;

    let distribution_id = tx.last_insert_rowid();
    let ref_id = distribution_id.to_string();

    for share in shares {
        tx.execute(
            "INSERT INTO partner_profit_shares (
                distribution_id, partner_name, profit_share, drawings_deducted, amount_reinvested, amount_paid, currency
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                distribution_id,
                share.partner_name,
                share.profit_share,
                share.drawings_deducted,
                share.amount_reinvested,
                share.amount_paid,
                currency,
            ],
        ).map_err(|e| e.to_string())?;

        record_ledger_entry(
            &tx,
            &current_date,
            &current_time,
            "retained_earnings",
            Some(&share.partner_name),
            share.profit_share,
            0.0,
            &currency,
            "profit_distribution",
            &ref_id,
            "توزيع أرباح",
            &format!("توزيع أرباح الشريك {}", share.partner_name),
            None,
        )?;

        if share.drawings_deducted > 0.0 {
            record_ledger_entry(
                &tx,
                &current_date,
                &current_time,
                "drawings",
                Some(&share.partner_name),
                0.0,
                share.drawings_deducted,
                &currency,
                "profit_distribution",
                &ref_id,
                "تسوية مسحوبات أرباح",
                &format!("تسوية مسحوبات الشريك {}", share.partner_name),
                None,
            )?;

            tx.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                 VALUES (?1, 'شريك', 'إعادة استثمار', ?2, ?3, ?4, ?5, ?6, 'خارج القاصة')",
                params![
                    share.partner_name,
                    share.drawings_deducted,
                    current_date,
                    current_time,
                    format!("تسوية مسحوبات الشريك من الأرباح: {}", share.partner_name),
                    currency,
                ]
            ).map_err(|e| e.to_string())?;
        }

        if share.amount_reinvested > 0.0 {
            record_ledger_entry(
                &tx,
                &current_date,
                &current_time,
                "capital",
                Some(&share.partner_name),
                0.0,
                share.amount_reinvested,
                &currency,
                "profit_distribution",
                &ref_id,
                "إعادة استثمار أرباح",
                &format!("إعادة استثمار أرباح الشريك {}", share.partner_name),
                None,
            )?;

            tx.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                 VALUES (?1, 'شريك', 'إعادة استثمار', ?2, ?3, ?4, ?5, ?6, 'خارج القاصة')",
                params![
                    share.partner_name,
                    share.amount_reinvested,
                    current_date,
                    current_time,
                    format!("إعادة استثمار أرباح دورية الشريك {}", share.partner_name),
                    currency,
                ]
            ).map_err(|e| e.to_string())?;
        }

        if share.amount_paid > 0.0 {
            // ── الخطوة 1: إيداع الأرباح في حساب رأس مال الشريك (Capital Credit) ──
            record_ledger_entry(
                &tx,
                &current_date,
                &current_time,
                "capital",
                Some(&share.partner_name),
                0.0,
                share.amount_paid,
                &currency,
                "profit_distribution",
                &ref_id,
                "إيداع أرباح",
                &format!("إيداع أرباح مستحقة لحساب الشريك {}", share.partner_name),
                None,
            )?;

            tx.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
                 VALUES (?1, 'شريك', 'إيداع أرباح', ?2, ?3, ?4, ?5, ?6, 'خارج القاصة')",
                params![
                    share.partner_name,
                    share.amount_paid,
                    current_date,
                    current_time,
                    format!("إيداع أرباح دورية الشريك {}", share.partner_name),
                    currency,
                ]
            ).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    recalculate_all_partners(db)?;

    Ok(())
}

#[tauri::command]
fn get_profit_distributions(
    state: State<AppState>,
) -> Result<Vec<ProfitDistributionDetail>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT id, date, time, total_profit, currency, notes FROM profit_distributions ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let dists = stmt
        .query_map([], |row| {
            Ok(ProfitDistribution {
                id: row.get(0)?,
                date: row.get(1)?,
                time: row.get(2)?,
                total_profit: row.get(3)?,
                currency: row.get(4)?,
                notes: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<ProfitDistribution>, _>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    let mut details = Vec::new();

    for dist in dists {
        let mut s_stmt = db.prepare(
            "SELECT id, distribution_id, partner_name, profit_share, drawings_deducted, amount_reinvested, amount_paid, currency
             FROM partner_profit_shares WHERE distribution_id = ?1"
        ).map_err(|e| e.to_string())?;

        let shares = s_stmt
            .query_map([dist.id], |row| {
                Ok(PartnerProfitShare {
                    id: row.get(0)?,
                    distribution_id: row.get(1)?,
                    partner_name: row.get(2)?,
                    profit_share: row.get(3)?,
                    drawings_deducted: row.get(4)?,
                    amount_reinvested: row.get(5)?,
                    amount_paid: row.get(6)?,
                    currency: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<PartnerProfitShare>, _>>()
            .map_err(|e| e.to_string())?;

        details.push(ProfitDistributionDetail {
            distribution: dist,
            shares,
        });
    }

    Ok(details)
}

#[tauri::command]
fn delete_profit_distribution(state: State<AppState>, id: i64) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = &mut *db_guard;

    let tx = db.transaction().map_err(|e| e.to_string())?;

    reverse_ledger_entries(&tx, "profit_distribution", &id.to_string())?;

    let mut stmt = tx
        .prepare(
            "SELECT partner_name, currency, drawings_deducted, amount_reinvested, amount_paid 
         FROM partner_profit_shares WHERE distribution_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let shares = stmt
        .query_map([id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, f64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    for (p_name, curr, _drawings, _reinvested, _paid) in shares {
        let notes_reinvest = format!("إعادة استثمار أرباح دورية الشريك {}", p_name);
        let notes_paid = format!("صرف نقدي أرباح دورية الشريك {}", p_name);
        let notes_deposit = format!("إيداع أرباح دورية الشريك {}", p_name);
        let notes_drawings = format!("تسوية مسحوبات الشريك من الأرباح: {}", p_name);

        tx.execute(
            "DELETE FROM partner_transactions 
             WHERE partner_name = ?1 AND currency = ?2 AND (notes = ?3 OR notes = ?4 OR notes = ?5 OR notes = ?6)",
            params![p_name, curr, notes_reinvest, notes_paid, notes_deposit, notes_drawings]
        ).map_err(|e| e.to_string())?;
    }

    tx.execute("DELETE FROM profit_distributions WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    recalculate_all_partners(db)?;

    Ok(())
}

#[tauri::command]
fn get_backgrounds() -> Result<Vec<String>, String> {
    let base_dir = if cfg!(debug_assertions) {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .parent()
            .ok_or_else(|| "تعذر العثور على المجلد الأب لمشروع Rust".to_string())?
            .join("public")
            .join("backgrounds")
    } else {
        let exe_path = env::current_exe().map_err(|e| format!("تعذر معرفة مسار البرنامج: {e}"))?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| "تعذر معرفة مجلد البرنامج".to_string())?;

        let path1 = exe_dir.join("public").join("backgrounds");
        if path1.exists() {
            path1
        } else {
            exe_dir.join("backgrounds")
        }
    };

    if !base_dir.exists() {
        return Ok(Vec::new());
    }

    let mut bgs = Vec::new();
    let entries =
        std::fs::read_dir(base_dir).map_err(|e| format!("فشل قراءة مجلد الخلفيات: {e}"))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "jpg"
                        || ext_lower == "jpeg"
                        || ext_lower == "png"
                        || ext_lower == "webp"
                        || ext_lower == "gif"
                        || ext_lower == "bmp"
                    {
                        if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                            if !filename.to_lowercase().contains("logo") {
                                bgs.push(format!("/backgrounds/{}", filename));
                            }
                        }
                    }
                }
            }
        }
    }

    bgs.sort();
    Ok(bgs)
}

#[tauri::command]
fn rename_background(file_path: String) -> Result<String, String> {
    let base_dir = if cfg!(debug_assertions) {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .parent()
            .ok_or_else(|| "تعذر العثور على المجلد الأب لمشروع Rust".to_string())?
            .join("public")
            .join("backgrounds")
    } else {
        let exe_path = env::current_exe().map_err(|e| format!("تعذر معرفة مسار البرنامج: {e}"))?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| "تعذر معرفة مجلد البرنامج".to_string())?;

        let path1 = exe_dir.join("public").join("backgrounds");
        if path1.exists() {
            path1
        } else {
            exe_dir.join("backgrounds")
        }
    };

    if !base_dir.exists() {
        return Err("مجلد الخلفيات غير موجود".to_string());
    }

    let path = std::path::Path::new(&file_path);
    let filename = path
        .file_name()
        .ok_or_else(|| "اسم ملف غير صالح".to_string())?
        .to_str()
        .ok_or_else(|| "فشل تحويل اسم الملف".to_string())?;

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "الملف لا يحتوي على امتداد صالح".to_string())?;

    let source_file = base_dir.join(filename);
    if !source_file.exists() {
        return Err(format!("الملف غير موجود في المسار: {:?}", source_file));
    }

    let entries = std::fs::read_dir(&base_dir).map_err(|e| format!("فشل قراءة المجلد: {e}"))?;

    let mut bg_exists = false;
    let mut max_num = -1;

    for entry in entries {
        if let Ok(entry) = entry {
            let p = entry.path();
            if p.is_file() {
                if let Some(fname) = p.file_stem().and_then(|s| s.to_str()) {
                    let fname_lower = fname.to_lowercase();
                    if fname_lower == "bg" {
                        bg_exists = true;
                    } else if fname_lower.starts_with("bg") {
                        let num_str = &fname_lower[2..];
                        if let Ok(num) = num_str.parse::<i32>() {
                            if num > max_num {
                                max_num = num;
                            }
                        }
                    }
                }
            }
        }
    }

    let new_stem = if !bg_exists {
        "bg".to_string()
    } else if max_num == -1 {
        "bg1".to_string()
    } else {
        format!("bg{}", max_num + 1)
    };

    let new_filename = format!("{}.{}", new_stem, ext);
    let dest_file = base_dir.join(&new_filename);

    if dest_file.exists() {
        return Err(format!("اسم الملف الجديد {} موجود بالفعل!", new_filename));
    }

    std::fs::rename(&source_file, &dest_file).map_err(|e| format!("فشل إعادة تسمية الملف: {e}"))?;

    Ok(format!("/backgrounds/{}", new_filename))
}

#[tauri::command]
fn delete_background(file_path: String) -> Result<(), String> {
    let base_dir = if cfg!(debug_assertions) {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .parent()
            .ok_or_else(|| "تعذر العثور على المجلد الأب لمشروع Rust".to_string())?
            .join("public")
            .join("backgrounds")
    } else {
        let exe_path = env::current_exe().map_err(|e| format!("تعذر معرفة مسار البرنامج: {e}"))?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| "تعذر معرفة مجلد البرنامج".to_string())?;

        let path1 = exe_dir.join("public").join("backgrounds");
        if path1.exists() {
            path1
        } else {
            exe_dir.join("backgrounds")
        }
    };

    let path = std::path::Path::new(&file_path);
    let filename = path
        .file_name()
        .ok_or_else(|| "اسم ملف غير صالح".to_string())?
        .to_str()
        .ok_or_else(|| "فشل تحويل اسم الملف".to_string())?;

    let source_file = base_dir.join(filename);
    if !source_file.exists() {
        return Err(format!("الملف غير موجود: {:?}", source_file));
    }

    trash::delete(&source_file).map_err(|e| format!("فشل نقل الملف إلى سلة المهملات: {e}"))?;

    Ok(())
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
            update_expense,
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
            get_profit_distribution_summary,
            distribute_profits,
            get_profit_distributions,
            delete_profit_distribution,
            open_whatsapp,
            rename_background,
            delete_background,
            get_backgrounds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
