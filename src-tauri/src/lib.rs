use rusqlite::{params, types::ValueRef, Connection, Result as SqlResult};
use rust_xlsxwriter::{Format, FormatAlign, FormatBorder, Workbook, Worksheet};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, path::PathBuf, sync::Mutex};
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
    pub iqd_balance: f64,
    pub usd_balance: f64,
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
    pub qasa_iqd: f64,
    pub qasa_usd: f64,
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
    pub profit_iqd: f64,
    pub profit_usd: f64,
    pub drawings_iqd: f64,
    pub drawings_usd: f64,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProfitDistributionSummary {
    pub undistributed_iqd: f64,
    pub undistributed_usd: f64,
    pub partners: Vec<PartnerDistributionInfo>,
    pub expenses_iqd: f64,
    pub expenses_usd: f64,
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
    pub app_dir: PathBuf,
}

fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cars (
            car_number TEXT PRIMARY KEY,
            car_plate_num TEXT,
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

    if version < 5 {
        let _ = conn.execute(
            "DELETE FROM partner_transactions WHERE kind = 'شريك' AND type = 'ايداع دفعات زبائن'",
            [],
        );
        let _ = conn.execute(
            "DELETE FROM partner_transactions WHERE kind = 'شريك' AND type = 'ايداع ارباح سيارة' AND notes LIKE '%#بيع_سيارة_%' AND notes NOT LIKE '%رقم حركة دفعة:%'",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (5)", []);
        let _ = rebuild_customer_payment_profit_splits(conn);
    }

    // Ensure financial_ledger table exists before any migration that touches it
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

    if version < 6 {
        // Phase 1: Add accounting classification columns
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN source_type TEXT", []);
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN source_id TEXT", []);
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN source_role TEXT", []);
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN affects_qasa INTEGER DEFAULT 1", []);
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN affects_partner_cash INTEGER DEFAULT 1", []);
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN affects_profit INTEGER DEFAULT 0", []);

        // Unique index for source deduplication
        let _ = conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind)
             WHERE source_type IS NOT NULL
               AND source_id IS NOT NULL
               AND source_role IS NOT NULL",
            [],
        );

        // Classify investor movements (unconditional — fix kind typo 'משקיע' → 'مستثمر')
        let _ = conn.execute(
            "UPDATE partner_transactions SET affects_qasa = 1, affects_partner_cash = 0, affects_profit = 0
             WHERE kind = 'مستثمر'",
            [],
        );

        // Classify funder/company movements (unconditional)
        let _ = conn.execute(
            "UPDATE partner_transactions SET affects_qasa = 0, affects_partner_cash = 0, affects_profit = 0
             WHERE kind IN ('ممول', 'شركة')",
            [],
        );

        // Classify partner profit rows (unconditional)
        let _ = conn.execute(
            "UPDATE partner_transactions SET affects_profit = 1, affects_qasa = 0, affects_partner_cash = 0
             WHERE kind = 'شريك' AND type IN ('ايداع ارباح سيارة', 'ايداع ارباح وكالة')",
            [],
        );

        // Classify old customer payment rows (unconditional)
        let _ = conn.execute(
            "UPDATE partner_transactions
             SET affects_qasa = 1, affects_partner_cash = 1, affects_profit = 0,
                 source_role = COALESCE(source_role, 'legacy_customer_payment_cash')
             WHERE kind = 'شريك' AND type = 'ايداع دفعات زبائن'",
            [],
        );

        // Clean wrong capital entries for customer payments
        let _ = conn.execute(
            "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND account_type = 'capital'
               AND reference_id IN (
                   SELECT CAST(id AS TEXT) FROM partner_transactions WHERE type = 'ايداع دفعات زبائن'
               )",
            [],
        );

        // Clean orphan car_expense ledger entries
        let _ = conn.execute(
            "DELETE FROM financial_ledger
             WHERE reference_type = 'car_expense'
               AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM car_expenses)",
            [],
        );

        let _ = conn.execute("INSERT INTO db_version (version) VALUES (6)", []);
    }

    // Version 7: Re-run classification fixes for databases that already ran v6 with bugs
    if version < 7 {
        // Fix investor classification (was 'משקיע' typo in v6)
        let _ = conn.execute(
            "UPDATE partner_transactions SET affects_qasa = 1, affects_partner_cash = 0, affects_profit = 0
             WHERE kind = 'مستثمر'",
            [],
        );
        // Fix funder/company (unconditional, not IS NULL)
        let _ = conn.execute(
            "UPDATE partner_transactions SET affects_qasa = 0, affects_partner_cash = 0, affects_profit = 0
             WHERE kind IN ('ممول', 'شركة')",
            [],
        );
        // Fix partner profit rows (unconditional)
        let _ = conn.execute(
            "UPDATE partner_transactions SET affects_profit = 1, affects_qasa = 0, affects_partner_cash = 0
             WHERE kind = 'شريك' AND type IN ('ايداع ارباح سيارة', 'ايداع ارباح وكالة')",
            [],
        );
        // Fix old customer payment rows (unconditional)
        let _ = conn.execute(
            "UPDATE partner_transactions
             SET affects_qasa = 1, affects_partner_cash = 1, affects_profit = 0,
                 source_role = COALESCE(source_role, 'legacy_customer_payment_cash')
             WHERE kind = 'شريك' AND type = 'ايداع دفعات زبائن'",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (7)", []);
    }

    // Version 8: Fix car_expense ledger rows that used reference_type = 'expense'
    if version < 8 {
        // Delete wrong car_expense ledger entries (they used 'expense' instead of 'car_expense')
        let _ = conn.execute(
            "DELETE FROM financial_ledger
             WHERE reference_type = 'expense'
               AND reference_id IN (SELECT CAST(id AS TEXT) FROM car_expenses)",
            [],
        );
        // Also clean orphan car_expense entries
        let _ = conn.execute(
            "DELETE FROM financial_ledger
             WHERE reference_type = 'car_expense'
               AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM car_expenses)",
            [],
        );
        // Classify all direct INSERT rows that still have NULL source_type
        // (these were inserted by old code without source fields)
        let _ = conn.execute(
            "UPDATE partner_transactions
             SET source_type = 'legacy_unclassified',
                 source_role = 'legacy_account_movement',
                 affects_qasa = CASE WHEN kind IN ('ممول', 'شركة') THEN 0 ELSE 1 END,
                 affects_partner_cash = CASE WHEN kind IN ('ممول', 'شركة', 'مستثمر') THEN 0 ELSE 1 END,
                 affects_profit = 0
             WHERE source_type IS NULL AND kind IN ('ممول', 'شركة', 'مستثمر')",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (8)", []);
    }

    // Version 9: Clean up double-counted receivable entries for customer payments
    if version < 9 {
        // Old code created Cr receivable for BOTH customer rows AND partner cash_movement rows.
        // The partner cash_movement rows should only create Dr cash (no receivable).
        // Delete Cr receivable entries that belong to partner cash_movement rows (type_ = 'ايداع دفعة زبون').
        let _ = conn.execute(
            "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND account_type = 'receivable'
               AND type_ = 'ايداع دفعة زبون'
               AND reference_id IN (
                   SELECT CAST(pt.id AS TEXT) FROM partner_transactions pt
                   WHERE pt.source_type = 'customer_payment'
                     AND pt.source_role = 'cash_movement'
                     AND pt.kind = 'شريك'
               )",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (9)", []);
    }

    // Version 10: Clean old capital ledger entries from customer payment cash_movement rows
    // AND rebuild cash_movement for ALL customer payments (including those without car references)
    // AND create missing ledger entries for customer payment rows
    if version < 10 {
        let _ = conn.execute(
            "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND account_type = 'capital'
               AND reference_id IN (
                   SELECT CAST(id AS TEXT)
                   FROM partner_transactions
                   WHERE source_type = 'customer_payment'
                     AND source_role = 'cash_movement'
                     AND kind = 'شريك'
               )",
            [],
        );
        // Also clean capital entries from legacy 'ايداع دفعات زبائن' type rows
        let _ = conn.execute(
            "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND account_type = 'capital'
               AND reference_id IN (
                   SELECT CAST(id AS TEXT)
                   FROM partner_transactions
                   WHERE type = 'ايداع دفعات زبائن'
               )",
            [],
        );
        // Create missing ledger entries for existing customer payment rows
        // (Cr receivable for the original customer row)
        let _ = conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
             SELECT
                 pt.date,
                 COALESCE(pt.time, '00:00'),
                 'receivable',
                 pt.partner_name,
                 0.0,
                 pt.amount,
                 COALESCE(pt.currency, 'IQD'),
                 'partner_transaction',
                 CAST(pt.id AS TEXT),
                 'ايداع زبون مديونية',
                 'تخفيض مديونية الزبون ' || pt.partner_name,
                 pt.notes
             FROM partner_transactions pt
             WHERE pt.kind = 'زبون'
               AND (pt.type LIKE 'ايداع%' OR pt.type LIKE 'إيداع%' OR pt.type LIKE 'مقدمة%'
                    OR pt.type LIKE 'استلام%' OR pt.type LIKE 'إستلام%' OR pt.type LIKE 'تسديد%')
               AND NOT EXISTS (
                   SELECT 1 FROM financial_ledger fl
                   WHERE fl.reference_type = 'partner_transaction'
                     AND fl.reference_id = CAST(pt.id AS TEXT)
                     AND fl.account_type = 'receivable'
               )",
            [],
        );
        // Rebuild cash_movement for ALL customer payments (including without car references)
        let _ = rebuild_customer_payment_profit_splits(conn);
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (10)", []);
    }

    // Version 11: Fix car_purchase rows incorrectly stored as car_sale
    if version < 11 {
        let _ = conn.execute(
            "UPDATE partner_transactions
             SET source_type = 'car_purchase'
             WHERE type = 'سحب شراء سيارة'
               AND source_type = 'car_sale'
               AND source_role = 'cash_payment'",
            [],
        );
        // Also add related_source_type and related_source_id columns for explicit car linkage
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN related_source_type TEXT", []);
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN related_source_id TEXT", []);
        // Populate related_source_id for existing car-linked customer payments
        let _ = conn.execute(
            "UPDATE partner_transactions
             SET related_source_type = 'car',
                 related_source_id = SUBSTR(notes, INSTR(notes, '#بيع_سيارة_') + 11)
             WHERE kind = 'زبون'
               AND notes LIKE '%#بيع_سيارة_%'
               AND related_source_type IS NULL",
            [],
        );
        let _ = conn.execute("INSERT INTO db_version (version) VALUES (11)", []);
    }

    // Version 12: Fix related_source_id cleanup and populate for generated rows
    if version < 12 {
        // 1. Ensure columns exist safely
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN related_source_type TEXT", []);
        let _ = conn.execute("ALTER TABLE partner_transactions ADD COLUMN related_source_id TEXT", []);

        // 2. Populate related_source_id for ALL car-linked rows using Rust-side extraction
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, notes FROM partner_transactions WHERE notes LIKE '%#بيع_سيارة_%' AND (related_source_id IS NULL OR related_source_id = '' OR related_source_id LIKE '% %')"
        ) {
            let rows: Vec<(i64, String)> = {
                let mut result = Vec::new();
                if let Ok(mut rows) = stmt.query([]) {
                    while let Ok(Some(row)) = rows.next() {
                        if let (Ok(id), Ok(notes)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                            result.push((id, notes));
                        }
                    }
                }
                result
            };
            drop(stmt);

            for (id, notes) in rows {
                if let Some(car_num) = extract_car_number_from_notes(&notes) {
                    let _ = conn.execute(
                        "UPDATE partner_transactions SET related_source_type = 'car', related_source_id = ?1 WHERE id = ?2",
                        params![car_num, id],
                    );
                }
            }
        }

        // 3. Repair rows with bad related_source_id containing spaces
        let _ = conn.execute(
            "UPDATE partner_transactions
             SET related_source_id = SUBSTR(related_source_id, 1, INSTR(related_source_id || ' ', ' ') - 1)
             WHERE related_source_id IS NOT NULL AND related_source_id LIKE '% %'",
            [],
        );

        // 4. Populate for generated customer_payment rows that have car reference in notes
        let _ = conn.execute(
            "UPDATE partner_transactions
             SET related_source_type = 'car',
                 related_source_id = SUBSTR(notes, INSTR(notes, '#بيع_سيارة_') + 11, INSTR(SUBSTR(notes, INSTR(notes, '#بيع_سيارة_') + 11) || ' ', ' ') - 1)
             WHERE source_type = 'customer_payment'
               AND source_role IN ('cash_movement', 'profit_recognition')
               AND notes LIKE '%#بيع_سيارة_%'
               AND (related_source_id IS NULL OR related_source_id = '')",
            [],
        );

        let _ = conn.execute("INSERT INTO db_version (version) VALUES (12)", []);
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

    // تنظيف: لا نحذف سجلات أرباح الوكالات تلقائياً — تُحذف فقط عند حذف الوكالة المعنية
    // (الحذف القديم WHERE type = 'ايداع ارباح وكالة' كان خاطئاً因为它 يحذف أرباح وكالات صالحة)

    // إنشاء جدول دفتر الأستاذ المالي (financial_ledger) — safety net, already created before migrations
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

    // إنشاء جداول توزيع الأرباح والكاش
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

    // إنشاء جدول المستخدمين للمصادقة
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            profile_image TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime'))
        )",
        [],
    )?;

    // إنشاء المستخدم الافتراضي admin/admin إذا لم يكن موجوداً
    if let Ok(count) = conn.query_row::<i64, _, _>(
        "SELECT COUNT(*) FROM users WHERE username = 'admin'",
        [],
        |row| row.get(0),
    ) {
        if count == 0 {
            let hash = hash_password("admin");
            conn.execute(
                "INSERT INTO users (username, password_hash, display_name, profile_image) VALUES (?1, ?2, 'مدير النظام', NULL)",
                params!["admin", hash],
            )?;
        }
    }

    // إنشاء حسابات الشركاء الافتراضية
    conn.execute(
        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES ('أمير', '07808425228', 0.0, 'شريك')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES ('منتصر', '07812541714', 0.0, 'شريك')",
        [],
    )?;

    // ترحيل وهجرة بيانات طرق الشراء وحسابات الشركاء القديمة
    let _ = conn.execute("UPDATE cars SET purchase_type = 'تمويل' WHERE purchase_type = 'دين'", []);
    let _ = conn.execute("UPDATE cars SET purchase_type = 'كاش' WHERE purchase_type IN ('شراكه', 'شراكة', 'موجود')", []);
    let _ = conn.execute("DELETE FROM car_partners WHERE car_number IN (SELECT car_number FROM cars WHERE purchase_type = 'كاش')", []);
    let _ = conn.execute("DELETE FROM car_partners WHERE kind = 'شريك' AND partner_name NOT IN ('أمير', 'منتصر')", []);
    let _ = conn.execute("DELETE FROM partners WHERE kind = 'شريك' AND partner_name NOT IN ('أمير', 'منتصر')", []);
    let _ = conn.execute("DELETE FROM partner_transactions WHERE kind = 'شريك' AND partner_name NOT IN ('أمير', 'منتصر')", []);
    let _ = conn.execute("DELETE FROM partner_profit_shares WHERE partner_name NOT IN ('أمير', 'منتصر')", []);
    let _ = conn.execute("DELETE FROM financial_ledger WHERE account_type = 'capital' AND account_id NOT IN ('أمير', 'منتصر')", []);
    let _ = conn.execute(
        "DELETE FROM financial_ledger 
         WHERE reference_type = 'partner_transaction' 
           AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions)",
        [],
    );

    migrate_existing_data_to_ledger(conn)?;
    ensure_sales_cogs_entries(conn)?;

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

    // تنظيف القيود اليتيمة للوكالات والمصروفات المحذوفة
    let _ = conn.execute(
        "DELETE FROM financial_ledger
         WHERE reference_type = 'agency'
           AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM agencies)",
        [],
    );
    let _ = conn.execute(
        "DELETE FROM financial_ledger
         WHERE reference_type = 'expense'
           AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM expenses)",
        [],
    );

    let _ = conn.execute(
        "ALTER TABLE partners ADD COLUMN iqd_balance REAL DEFAULT 0.0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partners ADD COLUMN usd_balance REAL DEFAULT 0.0",
        [],
    );

    // Phase 16: Old capital entry logic removed — customer payments are not partner capital.
    // The cleanup is handled in the version 6 migration above.

    let _ = recalculate_all_partners(conn);

    // Migration: تحويل أي قيمة "خارج القاصة" إلى "قاصه"
    let _ = conn.execute(
        "UPDATE cars SET purchase_payment_type = 'قاصه' WHERE purchase_payment_type IS NULL OR purchase_payment_type = '' OR purchase_payment_type = 'خارج القاصة'",
        [],
    );
    let _ = conn.execute(
        "UPDATE cars SET sale_payment_type = 'قاصه' WHERE sale_payment_type IS NULL OR sale_payment_type = '' OR sale_payment_type = 'خارج القاصة'",
        [],
    );
    let _ = conn.execute(
        "UPDATE partner_transactions SET payment_type = 'قاصه' WHERE payment_type IS NULL OR payment_type = '' OR payment_type = 'خارج القاصة'",
        [],
    );
    let _ = conn.execute(
        "UPDATE financial_ledger SET account_id = 'قاصه' WHERE account_type = 'cash' AND (account_id IS NULL OR account_id = '' OR account_id = 'خارج القاصة')",
        [],
    );

    // audit_log: non-financial administrative events (deletions, etc.)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            actor TEXT,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            description TEXT,
            notes TEXT
        )",
        [],
    )?;

    Ok(())
}

fn is_deposit_type(tx_type: &str) -> bool {
    tx_type.starts_with("ايداع")
        || tx_type.starts_with("إيداع")
        || tx_type.starts_with("مقدمة")
        || tx_type.starts_with("استلام")
        || tx_type.starts_with("إستلام")
        || tx_type.starts_with("إعادة استثمار")
        || tx_type.starts_with("تسوية")
        || tx_type.starts_with("تسديد")
}

fn is_customer_remaining_type(tx_type: &str) -> bool {
    !tx_type.starts_with("تحويل")
        && !tx_type.starts_with("واصل")
        && (tx_type.starts_with("باقي") || tx_type.starts_with("سحب"))
}

// ============================================================
// CENTRAL VALIDATION HELPERS
// ============================================================

fn validate_required_text(value: &str, field_name: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{} مطلوب ولا يمكن أن يكون فارغاً", field_name));
    }
    Ok(())
}

fn validate_finite_amount(value: f64, field_name: &str) -> Result<(), String> {
    if !value.is_finite() {
        return Err(format!("{} يجب أن يكون رقماً صالحاً", field_name));
    }
    Ok(())
}

fn validate_positive_amount(value: f64, field_name: &str) -> Result<(), String> {
    validate_finite_amount(value, field_name)?;
    if value <= 0.0 {
        return Err(format!("{} يجب أن يكون أكبر من صفر", field_name));
    }
    Ok(())
}

fn validate_non_negative_amount(value: f64, field_name: &str) -> Result<(), String> {
    validate_finite_amount(value, field_name)?;
    if value < 0.0 {
        return Err(format!("{} لا يمكن أن يكون سالباً", field_name));
    }
    Ok(())
}

fn validate_currency(currency: &str) -> Result<(), String> {
    let c = currency.trim();
    if c != "IQD" && c != "USD" {
        return Err(format!("العملة غير مدعومة: {}. يجب أن تكون IQD أو USD", c));
    }
    Ok(())
}

fn validate_ledger_amounts(debit: f64, credit: f64) -> Result<(), String> {
    validate_finite_amount(debit, "المدين")?;
    validate_finite_amount(credit, "الدائن")?;
    if debit < 0.0 {
        return Err("المدين لا يمكن أن يكون سالباً".to_string());
    }
    if credit < 0.0 {
        return Err("الدائن لا يمكن أن يكون سالباً".to_string());
    }
    if debit == 0.0 && credit == 0.0 {
        return Err("المدين والدائن لا يمكن أن يكونا صفر معاً".to_string());
    }
    if debit > 0.0 && credit > 0.0 {
        return Err("المدين والدائن لا يمكن أن يكونا موجبين معاً في نفس القيد".to_string());
    }
    Ok(())
}

fn validate_sale_amounts(
    selling_price: f64,
    amount_paid: f64,
    amount_remaining: f64,
    payment_type: &str,
) -> Result<(), String> {
    validate_positive_amount(selling_price, "سعر البيع")?;
    validate_non_negative_amount(amount_paid, "المبلغ المدفوع")?;
    validate_non_negative_amount(amount_remaining, "المبلغ المتبقي")?;

    if payment_type == "كاش" {
        if (amount_paid - selling_price).abs() > 0.01 {
            return Err("في البيع النقدي: المبلغ المدفوع يجب أن يساوي سعر البيع".to_string());
        }
        if amount_remaining > 0.01 {
            return Err("في البيع النقدي: المبلغ المتبقي يجب أن يكون صفر".to_string());
        }
    } else {
        // Installment / term sale
        let diff = ((amount_paid + amount_remaining) - selling_price).abs();
        if diff > 0.01 {
            return Err("المقدمة + الباقي يجب أن يساوي سعر البيع".to_string());
        }
    }
    Ok(())
}

/// Record a non-financial administrative event (deletions, etc.) into audit_log.
fn record_audit_event(
    conn: &Connection,
    actor: Option<&str>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    description: &str,
    notes: Option<&str>,
) -> Result<(), String> {
    let (date, time) = now_datetime();
    conn.execute(
        "INSERT INTO audit_log (date, time, actor, action, entity_type, entity_id, description, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            date,
            time,
            actor.unwrap_or("النظام"),
            action.trim(),
            entity_type.trim(),
            entity_id.trim(),
            description.trim(),
            notes.map(|s| s.trim()),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// Issue 3: Classification helper for partner transactions
struct TransactionClassification {
    source_type: String,
    source_id: String,
    source_role: String,
    affects_qasa: i32,
    affects_partner_cash: i32,
    affects_profit: i32,
}

fn classify_partner_transaction(kind: &str, type_: &str, tx_id: i64) -> TransactionClassification {
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
            affects_qasa: 0,
            affects_partner_cash: 0,
            affects_profit: 0,
        },
        "شركة" => TransactionClassification {
            source_type: "company_transaction".to_string(),
            source_id: tx_id.to_string(),
            source_role: "account_movement".to_string(),
            affects_qasa: 0,
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
            if type_ == "ايداع ارباح سيارة" || type_ == "ايداع ارباح وكالة" {
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

#[allow(clippy::too_many_arguments)]
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
    validate_ledger_amounts(debit, credit)?;
    validate_currency(currency)?;
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

fn delete_ledger_entries(conn: &Connection, reference_type: &str, reference_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM financial_ledger WHERE reference_type = ?1 AND reference_id = ?2",
        params![reference_type.trim(), reference_id.trim()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Central helper: Delete partner_transactions by source fields WITH their ledger entries.
/// This prevents orphan financial_ledger rows.
fn delete_partner_transactions_by_source_with_ledger(
    db: &Connection,
    source_type: &str,
    source_id: &str,
    source_role: Option<&str>,
) -> Result<(), String> {
    let sql = match source_role {
        Some(_) => "SELECT id, partner_name, kind FROM partner_transactions WHERE source_type = ?1 AND source_id = ?2 AND source_role = ?3",
        None => "SELECT id, partner_name, kind FROM partner_transactions WHERE source_type = ?1 AND source_id = ?2",
    };
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;

    let mut rows: Vec<(i64, String, String)> = Vec::new();
    if let Some(role) = source_role {
        let mut query_rows = stmt.query_map(params![source_type, source_id, role], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        }).map_err(|e| e.to_string())?;
        while let Some(r) = query_rows.next() {
            if let Ok(row) = r {
                rows.push(row);
            }
        }
    } else {
        let mut query_rows = stmt.query_map(params![source_type, source_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        }).map_err(|e| e.to_string())?;
        while let Some(r) = query_rows.next() {
            if let Ok(row) = r {
                rows.push(row);
            }
        }
    }
    drop(stmt);

    let mut partners_to_recalc: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    for (id, partner_name, kind) in &rows {
        delete_ledger_entries(db, "partner_transaction", &id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        partners_to_recalc.insert((partner_name.clone(), kind.clone()));
    }

    for (p_name, p_kind) in partners_to_recalc {
        recalculate_partner_total(db, &p_name, &p_kind)?;
    }

    Ok(())
}

/// Removes 50/50 partner deposit entries created for a customer payment (e.g. تسديد قسط).
fn delete_customer_payment_partner_splits(db: &Connection, payment_tx_id: i64) -> Result<(), String> {
    // Issue 6: Use source fields instead of notes LIKE
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE source_type = 'customer_payment' AND source_id = ?1 AND source_role = 'cash_movement' AND kind = 'شريك'",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([payment_tx_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut partners_to_recalc = std::collections::HashSet::new();
    for (split_id, partner_name) in rows {
        delete_ledger_entries(db, "partner_transaction", &split_id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [split_id])
            .map_err(|e| e.to_string())?;
        partners_to_recalc.insert(partner_name);
    }

    for p_name in partners_to_recalc {
        recalculate_partner_total(db, &p_name, "شريك")?;
    }

    Ok(())
}

fn delete_customer_payment_profit_splits(db: &Connection, payment_tx_id: i64) -> Result<(), String> {
    // Issue 6: Use source fields instead of notes LIKE
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE source_type = 'customer_payment' AND source_id = ?1 AND source_role = 'profit_recognition' AND kind = 'شريك'",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([payment_tx_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut partners_to_recalc = std::collections::HashSet::new();
    for (split_id, partner_name) in rows {
        delete_ledger_entries(db, "partner_transaction", &split_id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [split_id])
            .map_err(|e| e.to_string())?;
        partners_to_recalc.insert(partner_name);
    }

    for p_name in partners_to_recalc {
        recalculate_partner_total(db, &p_name, "شريك")?;
    }

    Ok(())
}

#[allow(clippy::type_complexity)]
fn record_partner_ledger_entries(conn: &Connection, tx_id: i64) -> Result<(), String> {
    // Issue 11: Read affects_* flags to decide whether to create cash ledger entries
    // Issue 1: Also read source_type and source_role for proper classification
    let tx_info: Result<(String, String, String, f64, String, Option<String>, Option<String>, String, String, i32, i32, i32, String, String), rusqlite::Error> = conn.query_row(
        "SELECT partner_name, kind, type, amount, date, notes, currency, COALESCE(payment_type, 'قاصه'), COALESCE(time, '00:00'),
                COALESCE(affects_qasa, 1), COALESCE(affects_partner_cash, 1), COALESCE(affects_profit, 0),
                COALESCE(source_type, ''), COALESCE(source_role, '')
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
                row.get(9)?,
                row.get(10)?,
                row.get(11)?,
                row.get(12)?,
                row.get(13)?,
            ))
        }
    );

    let (p_name, kind, tx_type, amount, tx_date, notes_opt, curr_opt, payment_type, tx_time, affects_qasa, affects_partner_cash, _affects_profit, source_type, source_role) =
        match tx_info {
            Ok(info) => info,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };

    let curr = curr_opt.unwrap_or_else(|| "IQD".to_string());
    let notes = notes_opt.unwrap_or_default();
    let ref_id = tx_id.to_string();

    let is_deposit = is_deposit_type(&tx_type);

    // Issue 11: Skip cash ledger entries for rows that don't affect Qasa/Cash
    let should_create_cash_entry = affects_qasa == 1 || affects_partner_cash == 1;

    // Issue 1: Handle customer_payment cash_movement rows (kind="شريك", source_type="customer_payment", source_role="cash_movement")
    // These should record Dr cash only. Cr receivable is handled by the original customer row (kind="زبون").
    if kind == "شريك" && source_type == "customer_payment" && source_role == "cash_movement" {
        // Look up the original customer payment row to get the customer name for receivable
        let source_id_val: i64 = conn.query_row(
            "SELECT CAST(source_id AS INTEGER) FROM partner_transactions WHERE id = ?1",
            [tx_id],
            |row| row.get(0),
        ).unwrap_or(0);

        let customer_name: String = if source_id_val > 0 {
            conn.query_row(
                "SELECT partner_name FROM partner_transactions WHERE id = ?1 AND kind = 'زبون'",
                [source_id_val],
                |row| row.get(0),
            ).unwrap_or_else(|_| p_name.clone())
        } else {
            p_name.clone()
        };

        // Record Dr cash only (cash increases)
        // Cr receivable is handled by the original customer row (kind="زبون")
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
            "ايداع دفعة زبون",
            &format!("إيداع دفعة زبون: {}", customer_name),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;

        return Ok(());
    }

    // Issue 1: Handle customer_payment profit_recognition rows (kind="شريك", source_type="customer_payment", source_role="profit_recognition")
    // These should not create any ledger entries (profit recognition only)
    if kind == "شريك" && source_type == "customer_payment" && source_role == "profit_recognition" {
        return Ok(());
    }

    if kind == "زبون" {
        // Issue 2: For customer payment rows, always record receivable reduction
        // Even if affects_qasa=0, the receivable must still decrease
        if is_deposit {
            // Only record cash entry if the row affects Qasa/Cash
            if should_create_cash_entry {
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
                    "ايداع زبون",
                    &format!("إيداع زبون: {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
            }
            // Always record receivable reduction for customer payments
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
                "ايداع زبون مديونية",
                &format!("تخفيض مديونية الزبون {}", p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
        } else if tx_type.starts_with("سحب") {
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
                "سحب زبون مديونية",
                &format!("زيادة مديونية الزبون {}", p_name),
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
                "سحب زبون",
                &format!("سحب نقدي زبون: {}", p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    if tx_type.starts_with("سحب شراء سيارة")
        || tx_type.starts_with("ايداع بيع سيارة")
        || tx_type.starts_with("مقدمة بيع سيارة")
        || tx_type.starts_with("سحب مصروف")
        || tx_type.starts_with("ايداع ارباح وكالة")
        || tx_type.starts_with("ايداع ارباح سيارة")
        || tx_type.starts_with("تسديد قسط")
        || tx_type.starts_with("باقي")
        || tx_type.starts_with("تحويل")
        || notes.starts_with("ارجاع (الكاش")
        || notes.contains("شراكة سيارة")
        || tx_type.starts_with("توزيع أرباح")
        || tx_type.starts_with("سحب أرباح")
        || tx_type.starts_with("تسوية مسحوبات")
        || tx_type.starts_with("إعادة استثمار")
        || notes.contains("توزيع أرباح")
    {
        return Ok(());
    }

    // Issue 3: For "سحب تسديد" rows — only process if it's a partner_cash_payment
    if tx_type.starts_with("سحب تسديد") {
        if kind == "شريك" && source_role == "partner_cash_payment" && should_create_cash_entry {
            // Record cash outflow for partner repayment
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
                "سحب شريك نقدي",
                &format!("سحب نقدي شريك: {} — {}", p_name, notes),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    match kind.as_str() {
        "شريك" => {
            // Issue 11: Only create cash entries if the row affects Qasa/Cash
            if is_deposit && should_create_cash_entry {
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
            } else if tx_type.starts_with("سحب شريك") {
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
            } else {
                return Ok(());
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
                // Issue 11: Only create cash entry if the row affects Qasa/Cash
                if should_create_cash_entry {
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
        }
        "شركة" => {
            if is_deposit {
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
                // Issue 11: Only create cash entry if the row affects Qasa/Cash
                if should_create_cash_entry {
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

#[allow(clippy::type_complexity)]
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

            if purchase_type == "تمويل" || purchase_type == "دين" {
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
            } else if purchase_type == "شركة" {
                let financer_name = financer_name_opt.unwrap_or_default().trim().to_string();
                let acc_id = if financer_name.is_empty() {
                    "شركة عامة".to_string()
                } else {
                    financer_name
                };
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'payable', ?3, 0.0, ?4, ?5, 'car', ?6, 'شراء سيارة عن طريق شركة', ?7, NULL)",
                    params![
                        purchase_date,
                        purchase_time,
                        acc_id,
                        purchase_price,
                        currency,
                        car_number,
                        format!("شراء سيارة: {} ({}) عن طريق شركة {}", car_name, car_number, acc_id)
                    ],
                )?;
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
            let _amount_remaining = amount_remaining_opt.unwrap_or(0.0);

            // Issue 7: For installment/term sales, only record amount_paid as realized revenue
            if payment_type == "كاش" {
                // Cash sale: full selling price as revenue
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
            } else {
                // Installment/term sale: only amount_paid as realized revenue
                if amount_paid > 0.0 {
                    conn.execute(
                        "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                         VALUES (?1, ?2, 'revenue', ?3, 0.0, ?4, ?5, 'car', ?6, 'بيع سيارة - جزئي', ?7, NULL)",
                        params![
                            sale_date,
                            sale_time,
                            car_number,
                            amount_paid,
                            sale_currency,
                            car_number,
                            format!("إيراد جزئي بيع سيارة {} ({})", car_name, car_number)
                        ],
                    )?;
                }
            }

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
                // Installment/term sale: cash is recorded through customer_payment rows
                // to avoid double-counting. Record receivable for full selling price.
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'receivable', ?3, ?4, 0.0, ?5, 'car', ?6, 'مدينون بيع سيارة', ?7, NULL)",
                    params![
                        sale_date,
                        sale_time,
                        buyer_name,
                        selling_price,
                        sale_currency,
                        car_number,
                        format!("ذمة مدينة كاملة بيع سيارة {} ({}) على {}", car_name, car_number, buyer_name)
                    ],
                )?;
                // Matching credit: deferred revenue (balances the receivable debit)
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'deferred_revenue', ?3, 0.0, ?4, ?5, 'car', ?6, 'إيراد مؤجل بيع سيارة', ?7, NULL)",
                    params![
                        sale_date,
                        sale_time,
                        car_number,
                        selling_price,
                        sale_currency,
                        car_number,
                        format!("إيراد مؤجل بيع سيارة {} ({}) إلى {}", car_name, car_number, buyer_name)
                    ],
                )?;
            }

            let mut exp_amount_sum = 0.0;
            let mut exp_rows = car_expenses_stmt.query([&car_number])?;
            while let Some(r) = exp_rows.next()? {
                exp_amount_sum += r.get::<_, f64>(0)?;
            }
            let total_cogs = purchase_price + exp_amount_sum;

            conn.execute(
                "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                 VALUES (?1, ?2, 'expense', ?3, ?4, 0.0, ?5, 'car', ?6, 'تكلفة المبيعات', ?7, NULL)",
                params![
                    sale_date,
                    sale_time,
                    car_number,
                    total_cogs,
                    currency,
                    car_number,
                    format!("تكلفة بيع سيارة {} ({})", car_name, car_number)
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

    // 2. Car Expenses (Issue 6: use reference_type = 'car_expense')
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
             VALUES (?1, ?2, 'inventory', ?3, ?4, 0.0, ?5, 'car_expense', ?6, 'مصروف سيارة', ?7, NULL)",
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
             VALUES (?1, ?2, 'cash', 'قاصه', 0.0, ?3, ?4, 'car_expense', ?5, 'مصروف سيارة نقدي', ?6, NULL)",
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

        if kind == "زبون" {
            if is_deposit {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'cash', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'ايداع زبون', ?7, ?8)",
                    params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("إيداع زبون: {}", p_name), notes],
                )?;
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'receivable', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'ايداع زبون مديونية', ?7, ?8)",
                    params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("تخفيض مديونية الزبون {}", p_name), notes],
                )?;
        } else if tx_type.starts_with("سحب") {
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'receivable', ?3, ?4, 0.0, ?5, 'partner_transaction', ?6, 'سحب زبون مديونية', ?7, ?8)",
                    params![tx_date, tx_time, p_name, amount, curr, id.to_string(), format!("زيادة مديونية الزبون {}", p_name), notes],
                )?;
                conn.execute(
                    "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit, currency, reference_type, reference_id, type_, description, notes)
                     VALUES (?1, ?2, 'cash', ?3, 0.0, ?4, ?5, 'partner_transaction', ?6, 'سحب زبون', ?7, ?8)",
                    params![tx_date, tx_time, payment_type, amount, curr, id.to_string(), format!("سحب نقدي زبون: {}", p_name), notes],
                )?;
            }
            continue;
        }

        if tx_type.starts_with("سحب شراء سيارة")
            || tx_type.starts_with("ايداع بيع سيارة")
            || tx_type.starts_with("مقدمة بيع سيارة")
            || tx_type.starts_with("سحب مصروف")
            || tx_type.starts_with("سحب تسديد")
            || tx_type.starts_with("ايداع ارباح وكالة")
            || tx_type.starts_with("ايداع ارباح سيارة")
            || tx_type.starts_with("تسديد قسط")
            || tx_type.starts_with("باقي")
            || tx_type.starts_with("تحويل")
            || notes.starts_with("ارجاع (الكاش")
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
            } else if tx_type.starts_with("سحب شريك") {
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

fn ensure_sales_cogs_entries(conn: &Connection) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO financial_ledger (
            date, time, account_type, account_id, debit, credit, currency,
            reference_type, reference_id, type_, description, notes
        )
        SELECT
            COALESCE(NULLIF(c.sale_date, ''), '2026-06-12'),
            COALESCE(NULLIF(c.sale_time, ''), '00:00'),
            'expense',
            c.car_number,
            c.purchase_price + COALESCE((SELECT SUM(ce.amount) FROM car_expenses ce WHERE ce.car_number = c.car_number), 0.0),
            0.0,
            COALESCE(c.currency, 'IQD'),
            'car',
            c.car_number,
            'تكلفة المبيعات',
            'تكلفة بيع سيارة ' || c.car_name || ' (' || c.car_number || ')',
            NULL
        FROM cars c
        WHERE c.status = 'مبيوعة'
          AND (c.purchase_price + COALESCE((SELECT SUM(ce.amount) FROM car_expenses ce WHERE ce.car_number = c.car_number), 0.0)) > 0
          AND NOT EXISTS (
              SELECT 1
              FROM financial_ledger fl
              WHERE fl.reference_type = 'car'
                AND fl.reference_id = c.car_number
                AND fl.account_type = 'expense'
                AND fl.type_ = 'تكلفة المبيعات'
          )",
        [],
    )?;
    Ok(())
}

#[allow(clippy::type_complexity)]
fn record_car_purchase_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    let car_number = car_number.trim();

    let car_info: Result<(String, f64, String, String, Option<String>, String, String), rusqlite::Error> = db.query_row(
        "SELECT car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(purchase_type, 'كاش'), financer_name,
                COALESCE(purchase_date, ''), COALESCE(purchase_time, '00:00')
         FROM cars WHERE car_number = ?1",
        [car_number],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
    );

    let (car_name, purchase_price, currency, purchase_type, financer_name_opt, purchase_date, purchase_time) = match car_info {
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
        record_ledger_entry(db, &p_date, &p_time, "inventory", Some(car_number), purchase_price, 0.0, &currency, "car", car_number, "شراء سيارة", &format!("شراء سيارة: {} ({})", car_name, car_number), None).map_err(|e| e.to_string())?;

        if purchase_type == "تمويل" || purchase_type == "دين" {
            let f_name = financer_name_opt.unwrap_or_default().trim().to_string();
            let acc_id = if f_name.is_empty() { "ممول عام".to_string() } else { f_name };
            record_ledger_entry(db, &p_date, &p_time, "funder", Some(&acc_id), 0.0, purchase_price, &currency, "car", car_number, "تمويل شراء سيارة", &format!("تمويل شراء سيارة: {} ({}) من قبل {}", car_name, car_number, acc_id), None).map_err(|e| e.to_string())?;
        } else if purchase_type == "شركة" {
            let f_name = financer_name_opt.unwrap_or_default().trim().to_string();
            let acc_id = if f_name.is_empty() { "شركة عامة".to_string() } else { f_name };
            record_ledger_entry(db, &p_date, &p_time, "payable", Some(&acc_id), 0.0, purchase_price, &currency, "car", car_number, "شراء سيارة عن طريق شركة", &format!("شراء سيارة: {} ({}) عن طريق شركة {}", car_name, car_number, acc_id), None).map_err(|e| e.to_string())?;
        } else {
            let mut p_stmt = db.prepare("SELECT COALESCE(purchase_payment_type, 'قاصه') FROM cars WHERE car_number = ?1").map_err(|e| e.to_string())?;
            let register: String = p_stmt.query_row([car_number], |row| row.get(0)).unwrap_or_else(|_| "قاصه".to_string());
            let register = if register.trim().is_empty() { "قاصه".to_string() } else { register };
            record_ledger_entry(db, &p_date, &p_time, "cash", Some(&register), 0.0, purchase_price, &currency, "car", car_number, "شراء سيارة كاش", &format!("سحب نقدي لشراء سيارة: {} ({}) من {}", car_name, car_number, register), None).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn record_car_sale_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    let car_number = car_number.trim();

    let car_info: Result<(String, f64, String, String, String, f64, String, Option<String>, Option<f64>, Option<f64>, String, String, Option<String>), rusqlite::Error> = db.query_row(
        "SELECT car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(sale_currency, 'IQD'),
                COALESCE(sale_date, ''), selling_price, status, payment_type, amount_paid, amount_remaining,
                COALESCE(sale_time, '00:00'), COALESCE(purchase_date, ''), buyer_name
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
            ))
        },
    );

    let (car_name, purchase_price, currency, sale_currency, sale_date, selling_price, status, payment_type_opt, amount_paid_opt, amount_remaining_opt, sale_time, _purchase_date, buyer_name_opt) = match car_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    if status != "مبيوعة" {
        return Ok(());
    }

    let s_date = if sale_date.is_empty() {
        "2026-06-12".to_string()
    } else {
        sale_date
    };
    let s_time = sale_time;
    let buyer_name = buyer_name_opt.unwrap_or_else(|| "مشتري مجهول".to_string());
    let payment_type = payment_type_opt.unwrap_or_else(|| "كاش".to_string());
    let _amount_paid = amount_paid_opt.unwrap_or(selling_price);
    let _amount_remaining = amount_remaining_opt.unwrap_or(0.0);

    let expenses_sum: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(0.0);
    let total_cogs = purchase_price + expenses_sum;
    let _total_profit = selling_price - total_cogs;

    if payment_type == "كاش" {
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
            &format!("إيراد بيع سيارة {} ({}) إلى {}", car_name, car_number, buyer_name),
            None,
        )?;

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
        )?;
    } else {
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "receivable",
            Some(&buyer_name),
            selling_price,
            0.0,
            &sale_currency,
            "car",
            car_number,
            "مدينون بيع سيارة",
            &format!(
                "ذمة مدينة كاملة بيع سيارة {} ({}) على {}",
                car_name, car_number, buyer_name
            ),
            None,
        )?;

        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "deferred_revenue",
            Some(car_number),
            0.0,
            selling_price,
            &sale_currency,
            "car",
            car_number,
            "إيراد مؤجل بيع سيارة",
            &format!(
                "إيراد مؤجل بيع سيارة {} ({}) إلى {}",
                car_name, car_number, buyer_name
            ),
            None,
        )?;
    }

    if total_cogs > 0.0 {
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "expense",
            Some(car_number),
            total_cogs,
            0.0,
            &currency,
            "car",
            car_number,
            "تكلفة المبيعات",
            &format!("تكلفة بيع سيارة {} ({})", car_name, car_number),
            None,
        )?;
    }

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
    )?;

    Ok(())
}

/// Safe coordinator: delegates to purchase-only and sale-only ledger recorders.
/// Do NOT add direct record_ledger_entry calls here — they belong in the specific functions.
fn record_car_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    record_car_purchase_ledger_entries(db, car_number)?;
    record_car_sale_ledger_entries(db, car_number)?;
    Ok(())
}

fn record_car_sale_ledger_entries_from_vars(
    db: &Connection,
    car_number: &str,
    car_name: &str,
    purchase_price: f64,
    currency: &str,
    selling_price: &f64,
    sale_currency: &str,
    sale_date: &str,
    sale_time: &str,
    payment_type_opt: &Option<String>,
    amount_paid_opt: &Option<f64>,
    amount_remaining_opt: &Option<f64>,
    buyer_name_opt: &Option<String>,
) -> Result<(), String> {
    let s_date = if sale_date.is_empty() {
        "2026-06-12".to_string()
    } else {
        sale_date.to_string()
    };
    let s_time = sale_time.to_string();
    let buyer_name = buyer_name_opt.clone().unwrap_or_else(|| "مشتري مجهول".to_string());
    let payment_type = payment_type_opt.clone().unwrap_or_else(|| "كاش".to_string());
    let _amount_paid = amount_paid_opt.unwrap_or(*selling_price);
    let _amount_remaining = amount_remaining_opt.unwrap_or(0.0);

    let expenses_sum: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(0.0);
    let total_cogs = purchase_price + expenses_sum;

    if payment_type == "كاش" {
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "revenue",
            Some(car_number),
            0.0,
            *selling_price,
            sale_currency,
            "car",
            car_number,
            "بيع سيارة",
            &format!("إيراد بيع سيارة {} ({}) إلى {}", car_name, car_number, buyer_name),
            None,
        )?;

        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "cash",
            Some("قاصه"),
            *selling_price,
            0.0,
            sale_currency,
            "car",
            car_number,
            "بيع سيارة كاش",
            &format!("استلام نقدي بيع سيارة {} ({})", car_name, car_number),
            None,
        )?;
    } else {
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "receivable",
            Some(&buyer_name),
            *selling_price,
            0.0,
            sale_currency,
            "car",
            car_number,
            "مدينون بيع سيارة",
            &format!(
                "ذمة مدينة كاملة بيع سيارة {} ({}) على {}",
                car_name, car_number, buyer_name
            ),
            None,
        )?;

        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "deferred_revenue",
            Some(car_number),
            0.0,
            *selling_price,
            sale_currency,
            "car",
            car_number,
            "إيراد مؤجل بيع سيارة",
            &format!(
                "إيراد مؤجل بيع سيارة {} ({}) إلى {}",
                car_name, car_number, buyer_name
            ),
            None,
        )?;
    }

    if total_cogs > 0.0 {
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "expense",
            Some(car_number),
            total_cogs,
            0.0,
            currency,
            "car",
            car_number,
            "تكلفة المبيعات",
            &format!("تكلفة بيع سيارة {} ({})", car_name, car_number),
            None,
        )?;
    }

    record_ledger_entry(
        db,
        &s_date,
        &s_time,
        "inventory",
        Some(car_number),
        0.0,
        total_cogs,
        currency,
        "car",
        car_number,
        "تخفيض المخزون بيع سيارة",
        &format!("إخراج سيارة {} ({}) من المخزون", car_name, car_number),
        None,
    )?;

    Ok(())
}

#[allow(clippy::too_many_arguments, clippy::type_complexity)]
#[tauri::command]
fn add_car(
    state: State<AppState>,
    num: String,
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
    _car_partners: Option<Vec<CarPartner>>,
    skip_sale_accounting: Option<bool>,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&num, "رقم السيارة")?;
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

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    let car_number = num.trim().to_string();
    let old_num = old_num.unwrap_or_default();
    let old_num = old_num.trim();

    // الاستعلام عن وقت الشراء ووقت البيع الحاليين لحفظهما قبل حذف أو استبدال السجل، وكذلك الاسم ورقم الشاصي والشركاء القديمين للتحديث
    let query_num = if !old_num.is_empty() {
        old_num
    } else {
        car_number.as_str()
    };
    let old_car_data: (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<f64>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>,
                       Option<f64>, Option<String>, Option<String>, Option<f64>, Option<f64>, Option<i32>, Option<f64>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = db
        .query_row(
            "SELECT purchase_time, sale_time, car_name, chassis_number, car_model, car_year, status,
                    purchase_price, COALESCE(purchase_type, 'كاش'), financer_name, currency,
                    COALESCE(purchase_date, ''), purchase_payment_type,
                    selling_price, sale_currency, payment_type,
                    amount_paid, amount_remaining, installment_months, monthly_payment,
                    buyer_name, buyer_phone, sale_date, delivery_date, first_payment_date
             FROM cars WHERE car_number = ?1",
            [query_num],
            |row| Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
                row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?,
                row.get(10)?, row.get(11)?, row.get(12)?,
                row.get(13)?, row.get(14)?, row.get(15)?, row.get(16)?, row.get(17)?,
                row.get(18)?, row.get(19)?, row.get(20)?, row.get(21)?, row.get(22)?,
                row.get(23)?, row.get(24)?,
            )),
        )
        .unwrap_or((None, None, None, None, None, None, None, None, None, None, None, None, None,
                    None, None, None, None, None, None, None, None, None, None, None, None));
    let (
        existing_purchase_time, existing_sale_time, old_name, _old_chassis, _old_model, _old_year,
        old_status, old_purchase_price, old_purchase_type, old_financer_name, old_currency,
        _old_purchase_date, _old_purchase_payment_type,
        _old_selling_price, _old_sale_currency, _old_payment_type,
        _old_amount_paid, _old_amount_remaining, _old_installment_months, _old_monthly_payment,
        _old_buyer_name, _old_buyer_phone, _old_sale_date, _old_delivery_date, _old_first_payment_date,
    ) = old_car_data;
    let is_existing_car = old_name.is_some();
    let should_create_purchase_transactions = !is_existing_car;
    let _should_create_sale_transactions = status == "مبيوعة" && old_status.as_deref() != Some("مبيوعة");

    let skip_sale = skip_sale_accounting.unwrap_or(false);
    let has_old_num = !old_num.is_empty();
    let car_number_changed = has_old_num && old_num != car_number;
    let same_car_edit = is_existing_car && (!has_old_num || old_num == car_number);

    let purchase_changed = is_existing_car && (
        old_purchase_price.map_or(true, |v| (v - purchase).abs() > 0.001)
        || old_purchase_type.as_deref() != purchase_type.as_deref()
        || old_financer_name.as_deref() != financer_name.as_deref()
        || old_currency.as_deref() != currency.as_deref()
    );
    let force_rebuild_due_to_number_change = car_number_changed;
    let should_rebuild_purchase = should_create_purchase_transactions || purchase_changed || force_rebuild_due_to_number_change;

    let sale_changed = is_existing_car && status == "مبيوعة" && (
        old_status.as_deref() != Some("مبيوعة")
        || _old_selling_price.map_or(true, |v| (v - selling).abs() > 0.001)
        || _old_sale_currency.as_deref() != sale_currency.as_deref()
        || _old_payment_type.as_deref() != payment_type.as_deref()
        || _old_amount_paid.map_or(true, |v| amount_paid.map_or(true, |a| (v - a).abs() > 0.001))
        || _old_amount_remaining.map_or(true, |v| amount_remaining.map_or(true, |a| (v - a).abs() > 0.001))
        || _old_installment_months != installment_months
        || _old_monthly_payment.map_or(true, |v| monthly_payment.map_or(true, |m| (v - m).abs() > 0.001))
        || _old_buyer_name.as_deref() != buyer_name.as_deref()
        || _old_buyer_phone.as_deref() != buyer_phone.as_deref()
        || _old_sale_date.as_deref() != sale_date.as_deref()
        || _old_delivery_date.as_deref() != delivery_date.as_deref()
        || _old_first_payment_date.as_deref() != first_payment_date.as_deref()
    );
    let should_rebuild_sale_ledger = sale_changed || (force_rebuild_due_to_number_change && status == "مبيوعة");

    if car_number_changed {
        // Car number actually changed — old number is being replaced entirely.
        // Delete all ledger for the old number (safe since old number will be removed).
        db.execute(
            "DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1",
            [old_num],
        )
        .map_err(|e| e.to_string())?;

        // Migrate all source references to new number
        migrate_car_number_references(&db, old_num, &car_number)?;
    } else if same_car_edit {
        // Normal edit of same car — use precise type-filtered deletion only
        if should_rebuild_purchase {
            delete_car_purchase_ledger_entries(&db, car_number.as_str())?;
        }
        if should_rebuild_sale_ledger && !skip_sale {
            delete_car_sale_ledger_entries(&db, car_number.as_str())?;
        }
    }
    // New car: no existing ledger to delete

    // INSERT with main fields
    db.execute(
        "INSERT OR REPLACE INTO cars (
            car_number, car_plate_num, chassis_number,
            car_model, car_year, car_name, color, details, 
            purchase_price, currency, sale_currency,
            selling_price, status,
            payment_type, cash_price, amount_paid, amount_remaining,
            installment_months, monthly_payment, purchase_payment_type,
            purchase_type, financer_name, commission_type, commission_value
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
        params![
            car_number.as_str(),
            car_number.as_str(),
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



    let clean_name = name.trim();
    let clean_chassis = chassis.trim();
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
             WHERE source_type = 'car_purchase' AND source_id = ?2",
            params![new_purchase_note, car_number],
        ).map_err(|e| e.to_string())?;

        // Update sale rows by source_type/source_id
        db.execute(
            "UPDATE partner_transactions SET notes = ?1
             WHERE source_type = 'car_sale' AND source_id = ?2 AND source_role = 'cash_movement'",
            params![new_sale_note, car_number],
        ).map_err(|e| e.to_string())?;

        // Update profit rows by source_type/source_id
        db.execute(
            "UPDATE partner_transactions SET notes = ?1
             WHERE source_type = 'car_sale' AND source_id = ?2 AND source_role = 'profit_recognition'",
            params![new_profit_note, car_number],
        ).map_err(|e| e.to_string())?;

        // Update car number reference in customer payment notes if car_number changed
        if old_num != car_number {
            db.execute(
                "UPDATE partner_transactions SET notes = REPLACE(notes, ?1, ?2)
                 WHERE related_source_type = 'car' AND related_source_id = ?3",
                params![
                    format!("#بيع_سيارة_{}", old_num),
                    format!("#بيع_سيارة_{}", car_number),
                    old_num,
                ],
            )
            .map_err(|e| e.to_string())?;
            // Update related_source_id (NOT source_id — source_id is the payment transaction ID)
            db.execute(
                "UPDATE partner_transactions SET related_source_id = ?1
                 WHERE related_source_type = 'car' AND related_source_id = ?2",
                params![car_number, old_num],
            ).map_err(|e| e.to_string())?;
        }
    }

    // حذف حركات الشراء القديمة ثم إعادة إنشائها حسب نوع الشراء الحالي (باستخدام حقول المصدر)
    // Only rebuild when purchase-impacting fields actually change
    if should_rebuild_purchase {
        // Delete only car purchase generated rows (not sale rows)
        delete_generated_car_purchase_partner_transactions(&db, &car_number)?;
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
            &car_number,
            "cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    } else if should_rebuild_purchase && (purchase_type.as_deref() == Some("تمويل") || purchase_type.as_deref() == Some("شركة") || purchase_type.as_deref() == Some("دين")) {
        let p_kind = if purchase_type.as_deref() == Some("تمويل") || purchase_type.as_deref() == Some("دين") {
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
                let note = format!("سحب شراء سيارة {} (شاصي: {})", name.trim(), chassis.trim())
                    .trim()
                    .replace("  ", " ");

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit)
                     VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, strftime('%H:%M', 'now', 'localtime'), ?5, ?6, ?7, 'car_purchase', ?8, 'funder_or_company_account_movement', 0, 0, 0)",
                    params![
                        f_name,
                        p_kind,
                        total_amount,
                        purchase_date.as_deref().unwrap_or(""),
                        note,
                        currency.as_deref().unwrap_or("IQD"),
                        purchase_payment_type.as_deref().unwrap_or("قاصه"),
                        car_number.as_str(),
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // حذف وإعادة توزيع الأرباح والكاش عند البيع
    let sale_note = format!("ايداع بيع سيارة {} {}", name.trim(), chassis.trim())
        .trim()
        .replace("  ", " ");
    let profit_note = format!("ايداع ارباح سيارة {} {}", name.trim(), chassis.trim())
        .trim()
        .replace("  ", " ");

    if should_rebuild_sale_ledger && !skip_sale {
        // Delete only car sale generated rows (not purchase rows)
        delete_generated_car_sale_partner_transactions(&db, &car_number)?;

        // Also delete customer payment splits for payments linked to this car
        // Use related_source_id first, fallback to notes LIKE for legacy rows
        let car_payment_ids: Vec<i64> = db
            .prepare("SELECT id FROM partner_transactions WHERE kind = 'زبون' AND ((related_source_type = 'car' AND related_source_id = ?1) OR (related_source_type IS NULL AND notes LIKE ?2))")
            .map_err(|e| e.to_string())?
            .query_map(params![car_number, format!("%#بيع_سيارة_{}%", car_number)], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for pid in car_payment_ids {
            delete_customer_payment_partner_splits(&db, pid)?;
            delete_customer_payment_profit_splits(&db, pid)?;
        }
    }

    if should_rebuild_sale_ledger && !skip_sale {
        // Currency policy: block mixed-currency sales without explicit fx_rate
        let purchase_curr = currency.as_deref().unwrap_or("IQD");
        let sale_curr = sale_currency.as_deref().unwrap_or("IQD");
        if purchase_curr != sale_curr {
            return Err("لا يمكن بيع السيارة بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string());
        }

        let expenses_sum_for_profit: f64 = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        let total_cost_for_profit = purchase + expenses_sum_for_profit;

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
                &car_number,
                "cash_movement",
                true,  // affects_qasa
                true,  // affects_partner_cash
                false, // affects_profit
            )?;

            // Effect 2: Profit recognition (does not increase Qasa/Cash)
            if purchase_curr == sale_curr {
                let profit = selling - total_cost_for_profit;
                if profit > 0.0 {
                    distribute_to_partners_50_with_effects(
                        &db,
                        profit,
                        sale_curr,
                        sale_date_str,
                        sale_payment_type,
                        "ايداع ارباح سيارة",
                        &profit_note,
                        "car_sale",
                        &car_number,
                        "profit_recognition",
                        false, // affects_qasa
                        false, // affects_partner_cash
                        true,  // affects_profit
                    )?;
                }
            }
        } else {
            // لا نوزع الأرباح هنا لأن السيارة بيعت بالتقسيط أو بموعد تسليم والأرباح لم تقبض بالكامل بعد
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

    if should_rebuild_purchase {
        record_car_purchase_ledger_entries(&db, car_number.as_str())?;
    }
    if should_rebuild_sale_ledger && !skip_sale {
        record_car_sale_ledger_entries(&db, car_number.as_str())?;
    }

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Add a partner if not exists (inside transaction).
fn ensure_partner_exists(tx: &rusqlite::Transaction, name: &str, phone: &str, kind: &str) -> Result<(), String> {
    tx.execute(
        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, ?2, 0.0, ?3)",
        params![name.trim(), phone.trim(), kind.trim()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// sell_car_with_accounting: Atomic car sale workflow.
/// Creates customer account, down payment, installment rows, and car ledger entries in one transaction.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn sell_car_with_accounting(
    state: State<AppState>,
    car_number: String,
    buyer_name: String,
    buyer_phone: String,
    selling_price: f64,
    sale_currency: String,
    sale_date: String,
    payment_type: String,
    amount_paid: f64,
    amount_remaining: f64,
    installment_months: Option<i32>,
    first_payment_date: Option<String>,
    delivery_date: Option<String>,
    chassis_number: Option<String>,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&car_number, "رقم السيارة")?;
    validate_required_text(&buyer_name, "اسم المشتري")?;
    validate_currency(&sale_currency)?;
    validate_required_text(&sale_date, "تاريخ البيع")?;

    // Sale amounts validation (Issue 6)
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
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    let car_label = db.query_row(
        "SELECT car_name FROM cars WHERE car_number = ?1",
        [&car_number],
        |row| row.get::<_, String>(0),
    ).unwrap_or_else(|_| "سيارة".to_string());

    let chassis_label = chassis_number.clone().unwrap_or_default();
    let clean_chassis = chassis_label.trim();

    // Mixed currency check
    let purchase_currency: String = db.query_row(
        "SELECT COALESCE(currency, 'IQD') FROM cars WHERE car_number = ?1",
        [&car_number],
        |row| row.get(0),
    ).unwrap_or_else(|_| "IQD".to_string());

    if purchase_currency != sale_currency {
        return Err("لا يمكن بيع السيارة بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string());
    }

    // ============================================================
    // STEP 1: Check car exists, then update sale fields
    // ============================================================
    let car_exists: bool = db
        .query_row(
            "SELECT COUNT(*) FROM cars WHERE car_number = ?1",
            [&car_number],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;
    if !car_exists {
        return Err(format!("السيارة رقم {} غير موجودة", car_number));
    }

    let now_time = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    let rows_affected = db.execute(
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
         WHERE car_number = ?13",
        params![
            selling_price,
            sale_currency,
            payment_type,
            amount_paid,
            amount_remaining,
            installment_months.unwrap_or(1),
            buyer_name.trim(),
            buyer_phone.trim(),
            sale_date,
            now_time,
            delivery_date,
            first_payment_date,
            car_number,
        ],
    ).map_err(|e| e.to_string())?;
    if rows_affected == 0 {
        return Err(format!("السيارة رقم {} غير موجودة", car_number));
    }

    // ============================================================
    // STEP 2: Delete existing sale-related customer rows, partner rows, splits, and ledger entries before rebuilding
    // ============================================================
    // Delete customer rows and their splits linked to this car (down payment, installment schedule)
    delete_sale_generated_customer_rows_for_car(&db, &car_number)?;

    // Delete sale partner rows (not purchase rows)
    delete_generated_car_sale_partner_transactions(&db, &car_number)?;

    // Delete sale-related car ledger entries (receivable, deferred_revenue, revenue, COGS, inventory credit)
    // But keep purchase entries
    db.execute(
        "DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1
         AND account_type IN ('receivable', 'deferred_revenue', 'revenue', 'expense', 'cash')
         AND (type_ LIKE '%بيع%' OR type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%' OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%')",
        [&car_number],
    ).map_err(|e| e.to_string())?;

    // Also delete inventory credit entries for sale (the COGS offset)
    db.execute(
        "DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1
         AND account_type = 'inventory' AND credit > 0 AND type_ LIKE '%تخفيض%'",
        [&car_number],
    ).map_err(|e| e.to_string())?;

    // ============================================================
    // STEP 3: Create customer account if not exists
    // ============================================================
    ensure_partner_exists(&db, &buyer_name, &buyer_phone, "زبون")?;

    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";

    // ============================================================
    // STEP 4: Create down payment transaction if amount_paid > 0
    // ============================================================
    if amount_paid > 0.0 {
        let dp_type = if is_installments_or_due { "مقدمة بيع سيارة" } else { "ايداع" };
        let dp_notes = if is_installments_or_due {
            format!("استلام مقدمة سيارة من {} رقم الشاصي {} #بيع_سيارة_{}", buyer_name, clean_chassis, car_number)
        } else {
            format!("دفعة أولى مستلمة - بيع {} #بيع_سيارة_{}", car_label, car_number)
        };

        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'زبون', ?2, ?3, ?4, ?5, ?6, ?7, 'قاصه')",
            params![buyer_name.trim(), dp_type, amount_paid, sale_date, &now_time, &dp_notes, sale_currency],
        ).map_err(|e| e.to_string())?;

        let dp_id = db.last_insert_rowid();

        // Classify the down payment as a sale-generated customer payment
        db.execute(
            "UPDATE partner_transactions SET
             source_type = 'customer_sale_payment',
             source_id = ?1,
             source_role = 'sale_down_payment',
             affects_qasa = 1,
             affects_partner_cash = 1,
             affects_profit = 0,
             related_source_type = 'car',
             related_source_id = ?2
             WHERE id = ?3",
            params![format!("{}:down_payment", car_number), car_number, dp_id],
        ).map_err(|e| e.to_string())?;

        // Record ledger entries for the down payment
        record_partner_ledger_entries(&db, dp_id)?;

        // Apply splits (creates cash_movement and profit_recognition)
        apply_partner_transaction_splits(&db, dp_id, buyer_name.trim(), "زبون", dp_type, amount_paid, &sale_date, Some(&dp_notes), &sale_currency)?;

        recalculate_partner_total(&db, buyer_name.trim(), "زبون")?;
    }

    // ============================================================
    // STEP 5: Create remaining installment rows if needed (with source fields — Issue 3)
    // ============================================================
    if amount_remaining > 0.0 {
        if payment_type == "اقساط" {
            let base_date = first_payment_date.as_deref().unwrap_or(&sale_date);
            let months = installment_months.unwrap_or(1);
            let monthly_amount = (amount_remaining / months as f64).floor();
            let last_amount = amount_remaining - (monthly_amount * (months - 1) as f64);

            for i in 0..months {
                let installment_amount = if i == months - 1 { last_amount } else { monthly_amount };
                if installment_amount <= 0.0 { continue; }

                let inst_date = add_months_to_date(base_date, i);
                let inst_notes = if months > 1 {
                    format!("باقي قسط شهر {} من {} على {} رقم الشاصي {}", i + 1, months, buyer_name, clean_chassis)
                } else {
                    format!("باقي مجموع قسط على {} رقم الشاصي {}", buyer_name, clean_chassis)
                };

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id)
                     VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                        'customer_installment_schedule', ?7, 'installment_schedule', 0, 0, 0, 'car', ?8)",
                    params![buyer_name.trim(), installment_amount, inst_date, &now_time, &inst_notes, sale_currency,
                        format!("{}:installment:{}", car_number, i + 1), car_number],
                ).map_err(|e| e.to_string())?;
            }
        } else if payment_type == "موعد" {
            let due_date = delivery_date.as_deref().unwrap_or(&sale_date);
            let due_notes = format!("باقي مجموع قسط على {} رقم الشاصي {}", buyer_name, clean_chassis);

            db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                    source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                    related_source_type, related_source_id)
                 VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_installment_schedule', ?7, 'installment_schedule', 0, 0, 0, 'car', ?8)",
                params![buyer_name.trim(), amount_remaining, due_date, &now_time, &due_notes, sale_currency,
                    format!("{}:due:1", car_number), car_number],
            ).map_err(|e| e.to_string())?;
        }

        recalculate_partner_total(&db, buyer_name.trim(), "زبون")?;
    }

    // ============================================================
    // STEP 6: Record car sale ledger entries only (old entries already deleted above)
    // ============================================================
    record_car_sale_ledger_entries(&db, &car_number)?;

    // ============================================================
    // STEP 7: Recalculate and commit
    // ============================================================
    recalculate_all_partners(&db)?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn days_in_month(year: i32, month: i32) -> i32 {
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

fn add_months_to_date(date_str: &str, months: i32) -> String {
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
                    COALESCE(car_plate_num, car_number),
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

/// Delete partner transactions by related_source fields with ledger cleanup.
fn delete_partner_transactions_by_related_source_with_ledger(
    db: &Connection,
    related_source_type: &str,
    related_source_id: &str,
) -> Result<(), String> {
    let rows: Vec<(i64, String, String)> = {
        let mut stmt = db
            .prepare("SELECT id, partner_name, kind FROM partner_transactions WHERE related_source_type = ?1 AND related_source_id = ?2")
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        let mut query_rows = stmt.query_map(params![related_source_type, related_source_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        }).map_err(|e| e.to_string())?;
        while let Some(r) = query_rows.next() {
            if let Ok(row) = r {
                result.push(row);
            }
        }
        result
    };

    let mut partners_to_recalc: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    for (id, partner_name, kind) in &rows {
        delete_ledger_entries(db, "partner_transaction", &id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        partners_to_recalc.insert((partner_name.clone(), kind.clone()));
    }

    for (p_name, p_kind) in partners_to_recalc {
        recalculate_partner_total(db, &p_name, &p_kind)?;
    }

    Ok(())
}

#[tauri::command]
fn delete_car(state: State<AppState>, num: String, admin_name: Option<String>) -> Result<(), String> {
    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    let car_number = num.trim();
    let admin = admin_name.unwrap_or_else(|| "الإدارة".to_string());

    // Get car details before deleting it
    let (car_name, chassis_number): (
        String,
        Option<String>,
    ) = db
        .query_row(
            "SELECT car_name, chassis_number FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((String::new(), None));
    let chassis_str = chassis_number.unwrap_or_default();
    let clean_name = car_name.trim();
    let clean_chassis = chassis_str.trim();

    // تسجيل عملية الحذف في سجل التدقيق (ليس في دفتر الأستاذ المالي)
    let deletion_desc = format!("حذف سيارة {} {} بواسطة {}", clean_name, clean_chassis, admin);
    record_audit_event(
        &db,
        Some(&admin),
        "حذف سيارة",
        "car",
        car_number,
        &deletion_desc,
        Some(&format!("تم حذف السيارة {} ({})", clean_name, car_number)),
    )?;

    // حذف جميع القيود المالية المرتبطة بالسيارة من دفتر الأستاذ (بدون عكس)
    db.execute(
        "DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1",
        [car_number],
    ).map_err(|e| e.to_string())?;

    // حذف قيود مصاريف السيارة من دفتر الأستاذ (reference_type = 'car_expense')
    let ce_ids: Vec<i64> = {
        let mut ce_stmt = db
            .prepare("SELECT id FROM car_expenses WHERE car_number = ?1")
            .map_err(|e| e.to_string())?;
        let x = ce_stmt
            .query_map([car_number], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| e.to_string())?;
        x
    };
    for ce_id in &ce_ids {
        delete_ledger_entries(&db, "car_expense", &ce_id.to_string())?;
        delete_partner_transactions_by_source_with_ledger(&db, "car_expense", &ce_id.to_string(), Some("cash_payment"))?;
    }

    let ge_ids: Vec<i64> = {
        let mut ge_stmt = db
            .prepare("SELECT id FROM expenses WHERE car_number = ?1")
            .map_err(|e| e.to_string())?;
        let x = ge_stmt
            .query_map([car_number], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| e.to_string())?;
        x
    };
    for ge_id in &ge_ids {
        db.execute(
            "DELETE FROM financial_ledger WHERE reference_type = 'expense' AND reference_id = ?1",
            [ge_id.to_string()],
        ).map_err(|e| e.to_string())?;
    }

    // حذف حركات الشراء والمبيعات المولدة للسيارة (باستخدام حقول المصدر فقط)
    delete_partner_transactions_by_source_with_ledger(&db, "car_purchase", car_number, None)?;
    delete_partner_transactions_by_source_with_ledger(&db, "car_sale", car_number, None)?;

    // حذف حركات الدفعات المرتبطة بالسيارة (باستخدام related_source_id)
    delete_partner_transactions_by_related_source_with_ledger(&db, "car", car_number)?;

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

    recalculate_all_partners(&db)?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// update_sold_car_with_accounting: Atomic sold-car financial field edit.
/// Preserves manual customer payments, rebuilds only sale-generated rows.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn update_sold_car_with_accounting(
    state: State<AppState>,
    car_number: String,
    buyer_name: String,
    buyer_phone: String,
    selling_price: f64,
    sale_currency: String,
    sale_date: String,
    payment_type: String,
    amount_paid: f64,
    amount_remaining: f64,
    installment_months: Option<i32>,
    first_payment_date: Option<String>,
    delivery_date: Option<String>,
    _monthly_payment: Option<f64>,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION
    // ============================================================
    validate_required_text(&car_number, "رقم السيارة")?;
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
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    // Load existing car data
    let old_car: Result<(String, f64, String, String, f64, String, Option<String>, Option<f64>, Option<f64>, Option<i32>, Option<String>, Option<String>, Option<String>, Option<String>), rusqlite::Error> = db.query_row(
        "SELECT car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(sale_currency, 'IQD'),
                selling_price, status, payment_type, amount_paid, amount_remaining,
                installment_months, buyer_name, buyer_phone, sale_date, delivery_date
         FROM cars WHERE car_number = ?1",
        [&car_number],
        |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
            row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
            row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?,
            row.get(12)?, row.get(13)?,
        )),
    );
    let (car_name, purchase_price, currency, _old_sale_currency,
         _old_selling_price, status, _old_payment_type,
         _old_amount_paid, _old_amount_remaining, _old_installment_months,
         _old_buyer_name, _old_buyer_phone, _old_sale_date, _old_delivery_date) = match old_car {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Err(format!("السيارة رقم {} غير موجودة", car_number)),
        Err(e) => return Err(e.to_string()),
    };

    if status != "مبيوعة" {
        return Err("السيارة غير مباعة، استخدم sell_car_with_accounting".to_string());
    }

    // Mixed currency check
    if currency != sale_currency {
        return Err("لا يمكن تعديل البيع بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string());
    }

    // Calculate already-collected manual payments (non-sale-generated customer payments)
    let collected_manual: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
         WHERE kind = 'زبون'
           AND related_source_type = 'car' AND related_source_id = ?1
           AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
           AND source_type IS DISTINCT FROM 'customer_sale_payment'
           AND source_type IS DISTINCT FROM 'customer_installment_schedule'",
        [&car_number],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Validate that new selling_price >= already collected
    if selling_price < collected_manual {
        return Err(format!(
            "لا يمكن تعديل سعر البيع إلى مبلغ أقل من المبالغ المستلمة (تم استلام {:.0})",
            collected_manual
        ));
    }

    // Calculate recognized profit so far
    let recognized_profit: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
         WHERE affects_profit = 1 AND related_source_type = 'car' AND related_source_id = ?1",
        [&car_number],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Calculate new full profit
    let expenses_sum: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
        [&car_number],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let new_full_profit = selling_price - purchase_price - expenses_sum;

    // Profit cap validation
    if recognized_profit > 0.0 && new_full_profit < recognized_profit {
        return Err(format!(
            "لا يمكن تعديل البيع لأن الأرباح المعترف بها سابقاً ({:.0}) تتجاوز الربح الجديد ({:.0})",
            recognized_profit, new_full_profit
        ));
    }

    let chassis_label: String = db.query_row(
        "SELECT COALESCE(chassis_number, '') FROM cars WHERE car_number = ?1",
        [&car_number],
        |row| row.get(0),
    ).unwrap_or_default();
    let clean_chassis = chassis_label.trim();
    let now_time = db.query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
        row.get::<_, String>(0)
    }).unwrap_or_else(|_| "00:00".to_string());

    // ============================================================
    // STEP 1: Update sale fields
    // ============================================================
    db.execute(
        "UPDATE cars SET
            selling_price = ?1, sale_currency = ?2, payment_type = ?3,
            amount_paid = ?4, amount_remaining = ?5,
            installment_months = ?6, buyer_name = ?7, buyer_phone = ?8,
            sale_date = ?9, delivery_date = ?11, first_payment_date = ?12,
            sale_time = ?10
         WHERE car_number = ?13",
        params![
            selling_price, sale_currency, payment_type,
            amount_paid, amount_remaining,
            installment_months.unwrap_or(1),
            buyer_name.trim(), buyer_phone.trim(),
            sale_date, now_time, delivery_date, first_payment_date,
            car_number,
        ],
    ).map_err(|e| e.to_string())?;

    // ============================================================
    // STEP 2: Delete only sale-generated customer rows (preserve manual payments)
    // ============================================================
    // Delete sale-generated down payment and installment schedule rows
    let sale_gen_ids: Vec<(i64, String)> = {
        let mut stmt = db.prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car' AND related_source_id = ?1
               AND (source_type = 'customer_sale_payment' OR source_type = 'customer_installment_schedule')"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&car_number], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };

    let mut buyers_to_recalc: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (cust_id, buyer_name_str) in &sale_gen_ids {
        delete_customer_payment_partner_splits(&db, *cust_id)?;
        delete_customer_payment_profit_splits(&db, *cust_id)?;
        delete_ledger_entries(&db, "partner_transaction", &cust_id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [cust_id])
            .map_err(|e| e.to_string())?;
        buyers_to_recalc.insert(buyer_name_str.clone());
    }

    // Delete sale partner rows (source_type = 'car_sale')
    delete_generated_car_sale_partner_transactions(&db, &car_number)?;

    // Delete sale ledger entries (but preserve purchase entries)
    delete_car_sale_ledger_entries(&db, &car_number)?;

    // ============================================================
    // STEP 3: Recreate down payment row if amount_paid > 0
    // ============================================================
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";

    if amount_paid > 0.0 {
        let dp_type = if is_installments_or_due { "مقدمة بيع سيارة" } else { "ايداع" };
        let dp_notes = if is_installments_or_due {
            format!("استلام مقدمة سيارة من {} رقم الشاصي {} #بيع_سيارة_{}", buyer_name.trim(), clean_chassis, car_number)
        } else {
            format!("دفعة أولى مستلمة - بيع {} #بيع_سيارة_{}", car_name, car_number)
        };

        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'زبون', ?2, ?3, ?4, ?5, ?6, ?7, 'قاصه')",
            params![buyer_name.trim(), dp_type, amount_paid, sale_date, &now_time, &dp_notes, sale_currency],
        ).map_err(|e| e.to_string())?;

        let dp_id = db.last_insert_rowid();

        db.execute(
            "UPDATE partner_transactions SET
             source_type = 'customer_sale_payment',
             source_id = ?1,
             source_role = 'sale_down_payment',
             affects_qasa = 1,
             affects_partner_cash = 1,
             affects_profit = 0,
             related_source_type = 'car',
             related_source_id = ?2
             WHERE id = ?3",
            params![format!("{}:down_payment", car_number), car_number, dp_id],
        ).map_err(|e| e.to_string())?;

        record_partner_ledger_entries(&db, dp_id)?;
        apply_partner_transaction_splits(&db, dp_id, buyer_name.trim(), "زبون", dp_type, amount_paid, &sale_date, Some(&dp_notes), &sale_currency)?;

        buyers_to_recalc.insert(buyer_name.trim().to_string());
    }

    // ============================================================
    // STEP 4: Recreate installment rows if amount_remaining > 0
    // ============================================================
    if amount_remaining > 0.0 {
        if payment_type == "اقساط" {
            let base_date = first_payment_date.as_deref().unwrap_or(&sale_date);
            let months = installment_months.unwrap_or(1);
            let monthly_amount = (amount_remaining / months as f64).floor();
            let last_amount = amount_remaining - (monthly_amount * (months - 1) as f64);

            for i in 0..months {
                let inst_amount = if i == months - 1 { last_amount } else { monthly_amount };
                if inst_amount <= 0.0 { continue; }

                let inst_date = add_months_to_date(base_date, i);
                let inst_notes = if months > 1 {
                    format!("باقي قسط شهر {} من {} على {} رقم الشاصي {}", i + 1, months, buyer_name.trim(), clean_chassis)
                } else {
                    format!("باقي مجموع قسط على {} رقم الشاصي {}", buyer_name.trim(), clean_chassis)
                };

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id)
                     VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                        'customer_installment_schedule', ?7, 'installment_schedule', 0, 0, 0, 'car', ?8)",
                    params![buyer_name.trim(), inst_amount, inst_date, &now_time, &inst_notes, sale_currency,
                        format!("{}:installment:{}", car_number, i + 1), car_number],
                ).map_err(|e| e.to_string())?;
            }
        } else if payment_type == "موعد" {
            let due_date = delivery_date.as_deref().unwrap_or(&sale_date);
            let due_notes = format!("باقي مجموع قسط على {} رقم الشاصي {}", buyer_name.trim(), clean_chassis);

            db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                    source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                    related_source_type, related_source_id)
                 VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_installment_schedule', ?7, 'installment_schedule', 0, 0, 0, 'car', ?8)",
                params![buyer_name.trim(), amount_remaining, due_date, &now_time, &due_notes, sale_currency,
                    format!("{}:due:1", car_number), car_number],
            ).map_err(|e| e.to_string())?;
        }

        buyers_to_recalc.insert(buyer_name.trim().to_string());
    }

    // ============================================================
    // STEP 5: Rebuild sale ledger entries
    // ============================================================
    record_car_sale_ledger_entries(&db, &car_number)?;

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
fn save_and_sell_car_with_accounting(
    state: State<AppState>,
    num: String,
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
    payment_type: String,
    amount_paid: f64,
    amount_remaining: f64,
    installment_months: Option<i32>,
    monthly_payment: Option<f64>,
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
    commission_value: Option<f64>,
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&num, "رقم السيارة")?;
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
    validate_required_text(&sale_date.as_deref().unwrap_or(""), "تاريخ البيع")?;

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
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    let car_number = num.trim().to_string();
    let clean_name = name.trim();
    let clean_chassis = chassis.trim();
    let now_time = db.query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
        row.get::<_, String>(0)
    }).unwrap_or_else(|_| "00:00".to_string());
    let purchase_time = if purchase_date.as_deref().unwrap_or("").is_empty() { "00:00".to_string() } else { now_time.clone() };

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
            first_payment_date, purchase_time, sale_time
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'مبيوعة',
            ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24,
            ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32)",
        params![
            car_number, car_number, clean_chassis,
            model.trim(), year.trim(), clean_name, color.trim(), details.trim(),
            purchase, curr, sale_curr,
            selling,
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
            buyer_name.trim(), buyer_phone.trim(),
            purchase_date.as_deref().unwrap_or(""),
            sale_date.as_deref().unwrap_or(""),
            delivery_date.as_deref().unwrap_or(""),
            first_payment_date.as_deref().unwrap_or(""),
            purchase_time,
            now_time,
        ],
    ).map_err(|e| e.to_string())?;

    // ============================================================
    // STEP 2: Record purchase accounting (partner rows)
    // ============================================================
    let purchase_note = format!("سحب شراء سيارة {} (شاصي: {})", clean_name, clean_chassis)
        .trim().replace("  ", " ");
    let p_date = purchase_date.as_deref().unwrap_or("");

    if purchase_type.as_deref() == Some("كاش") || purchase_type.is_none() || purchase_type.as_deref() == Some("") {
        distribute_to_partners_50_with_effects(
            &db, purchase, curr, p_date,
            purchase_payment_type.as_deref().unwrap_or("قاصه"),
            "سحب شراء سيارة", &purchase_note,
            "car_purchase", &car_number, "cash_payment",
            true, true, false,
        )?;
    } else if purchase_type.as_deref() == Some("تمويل") || purchase_type.as_deref() == Some("دين") || purchase_type.as_deref() == Some("شركة") {
        let p_kind = if purchase_type.as_deref() == Some("تمويل") || purchase_type.as_deref() == Some("دين") { "ممول" } else { "شركة" };
        if let Some(f_name) = &financer_name {
            let f_name = f_name.trim();
            if !f_name.is_empty() {
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit)
                     VALUES (?1, ?2, 'سحب شراء سيارة', ?3, ?4, ?5, ?6, ?7, ?8, 'car_purchase', ?9, 'funder_or_company_account_movement', 0, 0, 0)",
                    params![f_name, p_kind, purchase, p_date, &purchase_time, &purchase_note, curr,
                        purchase_payment_type.as_deref().unwrap_or("قاصه"), car_number],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // ============================================================
    // STEP 3: Record purchase ledger entries
    // ============================================================
    record_car_purchase_ledger_entries(&db, &car_number)?;

    // ============================================================
    // STEP 4: Create customer account
    // ============================================================
    ensure_partner_exists(&db, &buyer_name, &buyer_phone, "زبون")?;

    // ============================================================
    // STEP 5: Create down payment row
    // ============================================================
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";
    let sale_date_str = sale_date.as_deref().unwrap_or("");

    if amount_paid > 0.0 {
        let dp_type = if is_installments_or_due { "مقدمة بيع سيارة" } else { "ايداع" };
        let dp_notes = if is_installments_or_due {
            format!("استلام مقدمة سيارة من {} رقم الشاصي {} #بيع_سيارة_{}", buyer_name.trim(), clean_chassis, car_number)
        } else {
            format!("دفعة أولى مستلمة - بيع {} #بيع_سيارة_{}", clean_name, car_number)
        };

        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
             VALUES (?1, 'زبون', ?2, ?3, ?4, ?5, ?6, ?7, 'قاصه')",
            params![buyer_name.trim(), dp_type, amount_paid, sale_date_str, &now_time, &dp_notes, sale_curr],
        ).map_err(|e| e.to_string())?;

        let dp_id = db.last_insert_rowid();

        db.execute(
            "UPDATE partner_transactions SET
             source_type = 'customer_sale_payment',
             source_id = ?1,
             source_role = 'sale_down_payment',
             affects_qasa = 1,
             affects_partner_cash = 1,
             affects_profit = 0,
             related_source_type = 'car',
             related_source_id = ?2
             WHERE id = ?3",
            params![format!("{}:down_payment", car_number), car_number, dp_id],
        ).map_err(|e| e.to_string())?;

        record_partner_ledger_entries(&db, dp_id)?;
        apply_partner_transaction_splits(&db, dp_id, buyer_name.trim(), "زبون", dp_type, amount_paid, sale_date_str, Some(&dp_notes), sale_curr)?;
    }

    // ============================================================
    // STEP 6: Create installment rows
    // ============================================================
    if amount_remaining > 0.0 {
        if payment_type == "اقساط" {
            let base_date = first_payment_date.as_deref().unwrap_or(sale_date_str);
            let months = installment_months.unwrap_or(1);
            let monthly_amount = (amount_remaining / months as f64).floor();
            let last_amount = amount_remaining - (monthly_amount * (months - 1) as f64);

            for i in 0..months {
                let inst_amount = if i == months - 1 { last_amount } else { monthly_amount };
                if inst_amount <= 0.0 { continue; }

                let inst_date = add_months_to_date(base_date, i);
                let inst_notes = if months > 1 {
                    format!("باقي قسط شهر {} من {} على {} رقم الشاصي {}", i + 1, months, buyer_name.trim(), clean_chassis)
                } else {
                    format!("باقي مجموع قسط على {} رقم الشاصي {}", buyer_name.trim(), clean_chassis)
                };

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id)
                     VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                        'customer_installment_schedule', ?7, 'installment_schedule', 0, 0, 0, 'car', ?8)",
                    params![buyer_name.trim(), inst_amount, inst_date, &now_time, &inst_notes, sale_curr,
                        format!("{}:installment:{}", car_number, i + 1), car_number],
                ).map_err(|e| e.to_string())?;
            }
        } else if payment_type == "موعد" {
            let due_date = delivery_date.as_deref().unwrap_or(sale_date_str);
            let due_notes = format!("باقي مجموع قسط على {} رقم الشاصي {}", buyer_name.trim(), clean_chassis);

            db.execute(
                "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                    source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                    related_source_type, related_source_id)
                 VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_installment_schedule', ?7, 'installment_schedule', 0, 0, 0, 'car', ?8)",
                params![buyer_name.trim(), amount_remaining, due_date, &now_time, &due_notes, sale_curr,
                    format!("{}:due:1", car_number), car_number],
            ).map_err(|e| e.to_string())?;
        }
    }

    // ============================================================
    // STEP 7: Record sale ledger entries
    // ============================================================
    record_car_sale_ledger_entries(&db, &car_number)?;

    // ============================================================
    // STEP 8: Recalculate and commit
    // ============================================================
    recalculate_partner_total(&db, buyer_name.trim(), "زبون")?;
    recalculate_all_partners(&db)?;

    db.commit().map_err(|e| e.to_string())?;
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

    if kind == "شريك" {
        return Err("لا يمكن إنشاء حساب شريك جديد".to_string());
    }

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
    // NOTE: Read-only function — must NOT call recalculate_all_partners or any write operation

    let mut stmt = db
        .prepare(
            "SELECT p.partner_name, p.phone, p.total_amount, p.kind,
                    COALESCE((SELECT SUM(amount) FROM partner_transactions WHERE partner_name = p.partner_name AND kind = p.kind AND type LIKE 'سحب%'), 0.0) AS total_withdrawals,
                    COALESCE(p.iqd_balance, 0.0),
                    COALESCE(p.usd_balance, 0.0)
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
                iqd_balance: row.get(5)?,
                usd_balance: row.get(6)?,
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
        "SELECT partner_name, phone, kind FROM partners WHERE kind = 'ممول' OR kind = 'شركة' OR kind = 'مستثمر' OR kind = 'زبون' ORDER BY partner_name"
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
        let (iqd_balance, usd_balance) = if kind == "زبون" {
            // Customer: use financial_ledger receivable net as single source of truth
            let iqd: f64 = db.query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
                 WHERE account_type = 'receivable' AND account_id = ?1 AND currency = 'IQD'",
                params![name],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let usd: f64 = db.query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
                 WHERE account_type = 'receivable' AND account_id = ?1 AND currency = 'USD'",
                params![name],
                |row| row.get(0),
            ).unwrap_or(0.0);
            (iqd, usd)
        } else {
            // Non-customer: use partner_transactions logic
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
        });
    }

    Ok(accounts)
}

#[tauri::command]
fn delete_partner(state: State<AppState>, name: String, kind: String) -> Result<(), String> {
    let kind = kind.trim().to_string();
    let name = name.trim().to_string();
    if kind == "شريك" {
        return Err("لا يمكن حذف حساب شريك".to_string());
    }
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    // Bug Q: Block deleting customer with active receivable
    if kind == "زبون" {
        let receivable: f64 = db.query_row(
            "SELECT COALESCE(SUM(ABS(debit - credit)), 0.0) FROM financial_ledger
             WHERE account_type = 'receivable' AND account_id = ?1",
            [&name],
            |row| row.get(0),
        ).unwrap_or(0.0);
        if receivable > 0.001 {
            return Err("لا يمكن حذف حساب زبون لديه رصيد مستحق في دفتر الأستاذ".to_string());
        }
    }

    // Bug R: Block deleting funder/company with active payable
    if kind == "ممول" || kind == "شركة" {
        let account_type = if kind == "ممول" { "funder" } else { "payable" };
        let balance: f64 = db.query_row(
            "SELECT COALESCE(SUM(ABS(debit - credit)), 0.0) FROM financial_ledger
             WHERE account_type = ?1 AND account_id = ?2",
            params![account_type, &name],
            |row| row.get(0),
        ).unwrap_or(0.0);
        if balance > 0.001 {
            let msg = if kind == "ممول" {
                "لا يمكن حذف حساب ممول لديه رصيد مستحق في دفتر الأستاذ"
            } else {
                "لا يمكن حذف حساب شركة لديه رصيد مستحق في دفتر الأستاذ"
            };
            return Err(msg.to_string());
        }
    }

    // Find all transaction IDs for this partner to delete corresponding ledger entries
    let mut stmt = db.prepare("SELECT id FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2").map_err(|e| e.to_string())?;
    let tx_ids: Vec<i64> = stmt.query_map([&name, &kind], |row| row.get(0)).map_err(|e| e.to_string())?
        .collect::<Result<Vec<i64>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);

    for tx_id in tx_ids {
        db.execute("DELETE FROM financial_ledger WHERE reference_type = 'partner_transaction' AND reference_id = ?1", [tx_id.to_string()]).map_err(|e| e.to_string())?;
    }

    db.execute("DELETE FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2", (&name, &kind)).map_err(|e| e.to_string())?;
    db.execute("DELETE FROM partners WHERE partner_name = ?1 AND kind = ?2", (&name, &kind)).map_err(|e| e.to_string())?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn recalculate_partner_total(
    db: &Connection,
    partner_name: &str,
    kind: &str,
) -> Result<(), String> {
    let (iqd_balance, usd_balance) = {
        if kind == "زبون" {
            // Customer: use financial_ledger receivable net as single source of truth
            let iqd_balance: f64 = db.query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
                 WHERE account_type = 'receivable' AND account_id = ?1 AND currency = 'IQD'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let usd_balance: f64 = db.query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
                 WHERE account_type = 'receivable' AND account_id = ?1 AND currency = 'USD'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            (iqd_balance, usd_balance)
        } else if kind == "شريك" {
            // Partner: use affects_partner_cash = 1 only
            let deposits_iqd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND affects_partner_cash = 1
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let withdrawals_iqd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND affects_partner_cash = 1
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let deposits_usd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'USD'
                 AND affects_partner_cash = 1
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let withdrawals_usd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'USD'
                 AND affects_partner_cash = 1
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            (deposits_iqd - withdrawals_iqd, deposits_usd - withdrawals_usd)
        } else if kind == "مستثمر" {
            // Investor: deposits increase liability, withdrawals decrease it
            let deposits_iqd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'مستثمر' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let withdrawals_iqd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'مستثمر' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let deposits_usd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'مستثمر' AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let withdrawals_usd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'مستثمر' AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            (withdrawals_iqd - deposits_iqd, withdrawals_usd - deposits_usd)
        } else {
            // ممول, شركة: withdrawals - deposits (liability logic)
            let deposits_iqd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim(), kind.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let withdrawals_iqd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim(), kind.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let deposits_usd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim(), kind.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            let withdrawals_usd: f64 = db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                params![partner_name.trim(), kind.trim()],
                |row| row.get(0),
            ).unwrap_or(0.0);
            (withdrawals_iqd - deposits_iqd, withdrawals_usd - deposits_usd)
        }
    };

    db.execute(
        "UPDATE partners SET total_amount = ?1, iqd_balance = ?2, usd_balance = ?3 WHERE partner_name = ?4 AND kind = ?5",
        params![
            iqd_balance + usd_balance,
            iqd_balance,
            usd_balance,
            partner_name.trim(),
            kind.trim()
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[allow(dead_code)]
fn check_and_distribute_installment_profits(db: &Connection) -> Result<(), String> {
    // DEPRECATED: Installment profits are now recognized per customer payment according to Instructions.md.
    // Never add full car profit at the last installment.
    // This function is intentionally a no-op.
    let _ = db;
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

fn ledger_account_type_for_kind(kind: &str) -> Option<&'static str> {
    match kind {
        "زبون" => Some("receivable"),
        "ممول" => Some("funder"),
        "شركة" => Some("payable"),
        "مستثمر" => Some("investor"),
        _ => None, // شريك does not map to a single ledger account type
    }
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
    let tx = db_guard.transaction().map_err(|e| e.to_string())?;

    // Block kind change if ledger history exists
    if old_kind != kind {
        let old_account_type = ledger_account_type_for_kind(&old_kind);
        if let Some(acc_type) = old_account_type {
            let ledger_count: i64 = tx
                .query_row(
                    "SELECT COUNT(*) FROM financial_ledger WHERE account_id = ?1 AND account_type = ?2",
                    params![&old_name, acc_type],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0);
            if ledger_count > 0 {
                return Err("لا يمكن تغيير نوع حساب لديه قيود مالية".to_string());
            }
        }
    }

    if old_name == name && old_kind == kind {
        tx.execute(
            "UPDATE partners SET phone = ?1 WHERE partner_name = ?2 AND kind = ?3",
            (phone.trim(), &old_name, &old_kind),
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let target_exists: bool = tx
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

    tx.execute(
        "UPDATE partners SET partner_name = ?1, phone = ?2, kind = ?3 WHERE partner_name = ?4 AND kind = ?5",
        (&name, phone.trim(), &kind, &old_name, &old_kind),
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE partner_transactions SET partner_name = ?1, kind = ?2 WHERE partner_name = ?3 AND kind = ?4",
        (&name, &kind, &old_name, &old_kind),
    )
    .map_err(|e| e.to_string())?;
    if old_name != name {
        // Scope the ledger rename by mapped account_type
        if let Some(acc_type) = ledger_account_type_for_kind(&kind) {
            tx.execute(
                "UPDATE financial_ledger SET account_id = ?1 WHERE account_id = ?2 AND account_type = ?3",
                params![&name, &old_name, acc_type],
            )
            .map_err(|e| e.to_string())?;
        }
        // Bug P: Update cars.buyer_name for sold cars linked to renamed customer
        if kind == "زبون" {
            tx.execute(
                "UPDATE cars SET buyer_name = ?1 WHERE buyer_name = ?2 AND status = 'مبيوعة'",
                params![&name, &old_name],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
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
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    let is_financier_repayment = kind.trim() == "ممول" && type_.trim().starts_with("سحب");
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

    // Issue 3: Use classification helper
    let classification = classify_partner_transaction(kind.trim(), type_.trim(), tx_id);
    db.execute(
        "UPDATE partner_transactions SET source_type = ?1, source_id = ?2, source_role = ?3, affects_qasa = ?4, affects_partner_cash = ?5, affects_profit = ?6 WHERE id = ?7",
        params![classification.source_type, classification.source_id, classification.source_role, classification.affects_qasa, classification.affects_partner_cash, classification.affects_profit, tx_id],
    ).map_err(|e| e.to_string())?;

    // Ledger record
    record_partner_ledger_entries(&db, tx_id)?;

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
        &curr,
    )?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    db.commit().map_err(|e| e.to_string())?;
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
                    "عمولة ممول: {} ({})",
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
                "عمولة ممول: {} ({})",
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
            &format!("عمولة ممول: {}", financier_name),
            None,
        )?;

        let commission_partner_note =
            format!("عمولة ممول: {}", financier_name);
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

fn extract_car_number_from_notes(notes: &str) -> Option<String> {
    if let Some(pos) = notes.find("#بيع_سيارة_") {
        let start = pos + "#بيع_سيارة_".len();
        let rest = &notes[start..];
        let end = rest.find(' ').unwrap_or(rest.len());
        return Some(rest[..end].trim().to_string());
    }
    None
}

/// Delete generated car PURCHASE partner transactions by source fields.
/// Only deletes source_type = 'car_purchase' AND source_id = car_number.
fn delete_generated_car_purchase_partner_transactions(db: &Connection, car_number: &str) -> Result<(), String> {
    let mut stmt = db
        .prepare(
            "SELECT id FROM partner_transactions
             WHERE source_type = 'car_purchase'
               AND source_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map([car_number], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for tx_id in ids {
        delete_ledger_entries(db, "partner_transaction", &tx_id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [tx_id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Delete generated car SALE partner transactions by source fields.
/// Only deletes source_type = 'car_sale' AND source_id = car_number.
fn delete_generated_car_sale_partner_transactions(db: &Connection, car_number: &str) -> Result<(), String> {
    let mut stmt = db
        .prepare(
            "SELECT id FROM partner_transactions
             WHERE source_type = 'car_sale'
               AND source_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map([car_number], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for tx_id in ids {
        delete_ledger_entries(db, "partner_transaction", &tx_id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [tx_id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn delete_car_purchase_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1
         AND (type_ IN ('شراء سيارة', 'شراء سيارة كاش', 'تمويل شراء سيارة', 'شراء سيارة عن طريق شركة')
              OR (type_ NOT LIKE '%بيع%' AND type_ NOT LIKE '%مدينون%' AND type_ NOT LIKE '%إيراد%'
                  AND type_ NOT LIKE '%تكلفة%' AND type_ NOT LIKE '%تخفيض%'
                  AND type_ NOT LIKE '%مخزون%' AND type_ NOT LIKE '%ارباح%'))",
        [car_number],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_car_sale_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM financial_ledger WHERE reference_type = 'car' AND reference_id = ?1
         AND (type_ IN ('بيع سيارة', 'بيع سيارة كاش', 'مدينون بيع سيارة', 'إيراد مؤجل بيع سيارة',
                         'تكلفة المبيعات', 'تخفيض المخزون بيع سيارة')
              OR (type_ LIKE '%بيع%' OR type_ LIKE '%مدينون%' OR type_ LIKE '%إيراد%'
                  OR type_ LIKE '%تكلفة%' OR type_ LIKE '%تخفيض%'
                  OR type_ LIKE '%ارباح%'))",
        [car_number],
    ).map_err(|e| e.to_string())?;
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
fn migrate_car_number_references(
    db: &Connection,
    old_car_number: &str,
    new_car_number: &str,
) -> Result<(), String> {
    let old = old_car_number.trim();
    let new = new_car_number.trim();
    if old == new || old.is_empty() || new.is_empty() {
        return Ok(());
    }

    // 1. car_expenses.car_number
    db.execute(
        "UPDATE car_expenses SET car_number = ?1 WHERE car_number = ?2",
        params![new, old],
    ).map_err(|e| e.to_string())?;

    // 2. expenses.car_number
    db.execute(
        "UPDATE expenses SET car_number = ?1 WHERE car_number = ?2",
        params![new, old],
    ).map_err(|e| e.to_string())?;

    // 3. car_partners.car_number
    db.execute(
        "UPDATE car_partners SET car_number = ?1 WHERE car_number = ?2",
        params![new, old],
    ).map_err(|e| e.to_string())?;

    // 4. partner_transactions.source_id for car_purchase / car_sale (source_id = car_number)
    db.execute(
        "UPDATE partner_transactions SET source_id = ?1 WHERE source_type IN ('car_purchase', 'car_sale') AND source_id = ?2",
        params![new, old],
    ).map_err(|e| e.to_string())?;

    // 5. partner_transactions.related_source_id where related_source_type = 'car'
    db.execute(
        "UPDATE partner_transactions SET related_source_id = ?1 WHERE related_source_type = 'car' AND related_source_id = ?2",
        params![new, old],
    ).map_err(|e| e.to_string())?;

    // 6. customer_sale_payment source_id: format "{old}:down_payment" -> "{new}:down_payment"
    db.execute(
        "UPDATE partner_transactions SET source_id = ?1 WHERE source_type = 'customer_sale_payment' AND source_role = 'sale_down_payment' AND source_id = ?2",
        params![format!("{}:down_payment", new), format!("{}:down_payment", old)],
    ).map_err(|e| e.to_string())?;

    // 7. customer_installment_schedule source_id: "{old}:installment:N" -> "{new}:installment:N", "{old}:due:1" -> "{new}:due:1"
    db.execute(
        "UPDATE partner_transactions SET source_id = ?1 WHERE source_type = 'customer_installment_schedule' AND source_id = ?2",
        params![
            format!("{}:installment:", new),
            format!("{}:installment:", old),
        ],
    ).map_err(|e| e.to_string())?;
    // Also update the source_id prefix for installment schedule rows (starts-with match)
    db.execute(
        "UPDATE partner_transactions SET source_id = REPLACE(source_id, ?1, ?2) WHERE source_type = 'customer_installment_schedule' AND source_id LIKE ?3",
        params![
            format!("{}:installment:", old),
            format!("{}:installment:", new),
            format!("{}:installment:%", old),
        ],
    ).map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE partner_transactions SET source_id = REPLACE(source_id, ?1, ?2) WHERE source_type = 'customer_installment_schedule' AND source_id LIKE ?3",
        params![
            format!("{}:due:", old),
            format!("{}:due:", new),
            format!("{}:due:%", old),
        ],
    ).map_err(|e| e.to_string())?;

    // 8. financial_ledger account_id referencing old car number
    //    - account_type = 'inventory' and reference_type IN ('expense', 'car_expense')
    db.execute(
        "UPDATE financial_ledger SET account_id = ?1 WHERE account_type = 'inventory' AND account_id = ?2 AND reference_type IN ('expense', 'car_expense')",
        params![new, old],
    ).map_err(|e| e.to_string())?;

    // 9. financial_ledger reference_id = old car number
    db.execute(
        "UPDATE financial_ledger SET reference_id = ?1 WHERE reference_type = 'car' AND reference_id = ?2",
        params![new, old],
    ).map_err(|e| e.to_string())?;

    // 10. Delete old car row (no longer needed — will be handled by caller or here)
    db.execute("DELETE FROM cars WHERE car_number = ?1", [old])
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn delete_sale_generated_customer_rows_for_car(db: &Connection, car_number: &str) -> Result<(), String> {
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car' AND related_source_id = ?1",
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
        delete_ledger_entries(db, "partner_transaction", &cust_id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [cust_id])
            .map_err(|e| e.to_string())?;
        buyers_to_recalc.insert(buyer_name.clone());
    }

    for buyer_name in buyers_to_recalc {
        recalculate_partner_total(db, &buyer_name, "زبون")?;
    }

    Ok(())
}

fn calculate_customer_payment_profit(
    db: &Connection,
    car_number: &str,
    payment_amount: f64,
    payment_currency: &str,
) -> Result<f64, String> {
    if car_number.is_empty() || payment_amount <= 0.0 {
        return Ok(0.0);
    }

    let car_info: Result<(f64, String, String, f64), rusqlite::Error> = db.query_row(
        "SELECT purchase_price, COALESCE(currency, 'IQD'), COALESCE(sale_currency, 'IQD'), selling_price
         FROM cars WHERE car_number = ?1",
        [car_number],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    );

    let (purchase_price, purchase_currency, sale_currency, selling_price) = match car_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(0.0),
        Err(e) => return Err(e.to_string()),
    };

    if purchase_currency != sale_currency {
        return Err("لا يمكن حساب ربح الدفعة: عملة الشراءختلف عن عملة البيع بدون سعر صرف مثبت".to_string());
    }
    if payment_currency != sale_currency {
        return Err("لا يمكن تسجيل دفعة بعملة مختلفة عن عملة البيع بدون سعر صرف مثبت".to_string());
    }

    let expenses_sum: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
        [car_number],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let total_cost = purchase_price + expenses_sum;
    let total_profit = selling_price - total_cost;

    if total_profit <= 0.0 || selling_price <= 0.0 {
        return Ok(0.0);
    }

    let profit_ratio = total_profit / selling_price;
    let payment_profit = payment_amount * profit_ratio;

    if payment_profit < 0.0 {
        return Ok(0.0);
    }

    Ok(payment_profit)
}

fn rebuild_customer_payment_profit_splits(db: &Connection) -> Result<(), String> {
    let mut stmt = db
        .prepare(
            "SELECT id, amount, COALESCE(currency, 'IQD'), COALESCE(notes, ''), date
             FROM partner_transactions
             WHERE kind = 'زبون'
               AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                    OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')",
        )
        .map_err(|e| e.to_string())?;

    struct PaymentRow {
        id: i64,
        amount: f64,
        currency: String,
        notes: String,
        date: String,
    }

    let rows: Vec<PaymentRow> = stmt
        .query_map([], |row| {
            Ok(PaymentRow {
                id: row.get(0)?,
                amount: row.get(1)?,
                currency: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "IQD".to_string()),
                notes: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                date: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for row in rows {
        let car_num = extract_car_number_from_notes(&row.notes);

        // Set related_source fields on the original customer payment row if car-linked
        if let Some(ref cn) = car_num {
            let _ = db.execute(
                "UPDATE partner_transactions SET related_source_type = 'car', related_source_id = ?1
                 WHERE id = ?2 AND (related_source_type IS NULL OR related_source_id IS NULL OR related_source_id = '')",
                params![cn, row.id],
            );
        }

        // Always create cash_movement for every customer payment
        let cash_exists: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM partner_transactions
                 WHERE source_type = 'customer_payment' AND source_id = ?1 AND source_role = 'cash_movement' AND kind = 'شريك'",
                [row.id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !cash_exists {
            let cash_note = if let Some(ref cn) = car_num {
                format!(
                    "دفعة زبون: {} (رقم حركة دفعة: {}) #بيع_سيارة_{}",
                    row.notes, row.id, cn
                )
            } else {
                format!(
                    "دفعة زبون: {} (رقم حركة دفعة: {})",
                    row.notes, row.id
                )
            };
            distribute_to_partners_50_with_effects_and_related(
                db,
                row.amount,
                &row.currency,
                &row.date,
                "قاصه",
                "ايداع دفعة زبون",
                &cash_note,
                "customer_payment",
                &row.id.to_string(),
                "cash_movement",
                true,  // affects_qasa
                true,  // affects_partner_cash
                false, // affects_profit
                car_num.as_deref().map(|_| "car"),
                car_num.as_deref(),
            )?;
        }

        // Only create profit_recognition when payment is linked to a car
        if let Some(ref car_num) = car_num {
            let profit_exists: bool = db
                .query_row(
                    "SELECT COUNT(*) > 0 FROM partner_transactions
                     WHERE source_type = 'customer_payment' AND source_id = ?1 AND source_role = 'profit_recognition' AND kind = 'شريك'",
                    [row.id],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !profit_exists {
                let payment_profit = calculate_customer_payment_profit_capped(db, car_num, row.amount, &row.currency)?;
                if payment_profit > 0.0 {
                    let profit_note = format!(
                        "ربح دفعة زبون: {} (رقم حركة دفعة: {}) #بيع_سيارة_{}",
                        row.notes, row.id, car_num
                    );
                    distribute_to_partners_50_with_effects_and_related(
                        db,
                        payment_profit,
                        &row.currency,
                        &row.date,
                        "قاصه",
                        "ايداع ارباح سيارة",
                        &profit_note,
                        "customer_payment",
                        &row.id.to_string(),
                        "profit_recognition",
                        false, // affects_qasa
                        false, // affects_partner_cash
                        true,  // affects_profit
                        Some("car"),
                        Some(car_num),
                    )?;
                }
            }
        }
    }

    Ok(())
}

fn apply_partner_transaction_splits(
    db: &Connection,
    tx_id: i64,
    partner_name: &str,
    kind: &str,
    type_: &str,
    amount: f64,
    date: &str,
    notes: Option<&str>,
    currency: &str,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Ok(());
    }

    // === 1. Investor Repayment (سحب مستثمر) ===
    // Issue 2: Do NOT auto-deduct partners for investor withdrawals.
    // The investor row itself already has affects_qasa=1 which handles the Qasa movement.
    // Creating partner cash movements would double-count the Qasa reduction.

    // === 2. Company Cash Withdrawal (سحب شركة) ===
    let is_company_cash_withdrawal = kind == "شركة"
        && type_.starts_with("سحب")
        && notes.unwrap_or("").contains("سحب نقدي");
    if is_company_cash_withdrawal {
        let partner_note = format!("تسديد شركة: {} ({})", partner_name, tx_id);
        deduct_from_partners_5050_with_effects(
            db, amount, currency, date, "قاصه", "سحب تسديد", &partner_note,
            "company_payment", &tx_id.to_string(), "partner_cash_payment",
            true, true, false,
        )?;
    }

    // === 3. Funder Deposit (تمويل ممول) — Phase 15: Do NOT deduct from partners ===
    // Financing means the funder provided financing, not that partners paid.
    // Funder records do not affect Qasa/Cash.

    // === 4. Funder Repayment (سحب ممول) ===
    let is_financier_repayment = kind == "ممول" && type_.starts_with("سحب");
    if is_financier_repayment {
        let partner_note = format!("تسديد ممول: {} ({})", partner_name, tx_id);
        deduct_from_partners_5050_with_effects(
            db, amount, currency, date, "قاصه", "سحب تسديد", &partner_note,
            "funder_payment", &tx_id.to_string(), "partner_cash_payment",
            true, true, false,
        )?;
        distribute_financier_repayment_to_partners(db, partner_name, amount, date, currency, notes, tx_id)?;
    }

    // === 5. Customer Payments (دفعات الزبائن) — Two separate effects ===
    let is_customer_payment = kind == "زبون" && (
        type_.starts_with("ايداع")
        || type_.starts_with("إيداع")
        || type_.starts_with("مقدمة")
        || type_.starts_with("استلام")
        || type_.starts_with("إستلام")
        || type_.starts_with("تسديد")
    );
    if is_customer_payment {
        let notes_str = notes.unwrap_or("");
        let car_num = extract_car_number_from_notes(notes_str);

        // Set related_source fields on the original customer payment row if car-linked
        if let Some(ref cn) = car_num {
            let _ = db.execute(
                "UPDATE partner_transactions SET related_source_type = 'car', related_source_id = ?1
                 WHERE id = ?2 AND (related_source_type IS NULL OR related_source_id IS NULL OR related_source_id = '')",
                params![cn, tx_id],
            );
        }

        // Always create cash_movement for real customer payments
        let cash_exists: bool = db.query_row(
            "SELECT COUNT(*) > 0 FROM partner_transactions WHERE source_type = 'customer_payment' AND source_id = ?1 AND source_role = 'cash_movement' AND kind = 'شريك'",
            [tx_id],
            |row| row.get(0),
        ).unwrap_or(false);

        if !cash_exists {
            let cash_note = if let Some(ref cn) = car_num {
                format!(
                    "دفعة زبون: {} (رقم حركة دفعة: {}) #بيع_سيارة_{}",
                    notes_str, tx_id, cn
                )
            } else {
                format!(
                    "دفعة زبون: {} (رقم حركة دفعة: {})",
                    notes_str, tx_id
                )
            };
            distribute_to_partners_50_with_effects_and_related(
                db,
                amount,
                currency,
                date,
                "قاصه",
                "ايداع دفعة زبون",
                &cash_note,
                "customer_payment",
                &tx_id.to_string(),
                "cash_movement",
                true,  // affects_qasa
                true,  // affects_partner_cash
                false, // affects_profit
                car_num.as_deref().map(|_| "car"),
                car_num.as_deref(),
            )?;
        }

        // Only create profit_recognition when payment is linked to a car
        if let Some(ref car_num) = car_num {
            let profit_exists: bool = db.query_row(
                "SELECT COUNT(*) > 0 FROM partner_transactions WHERE source_type = 'customer_payment' AND source_id = ?1 AND source_role = 'profit_recognition' AND kind = 'شريك'",
                [tx_id],
                |row| row.get(0),
            ).unwrap_or(false);

            if !profit_exists {
                let payment_profit = calculate_customer_payment_profit_capped(db, car_num, amount, currency)?;
                if payment_profit > 0.0 {
                    let profit_note = format!(
                        "ربح دفعة زبون: {} (رقم حركة دفعة: {}) #بيع_سيارة_{}",
                        notes_str, tx_id, car_num
                    );
                    distribute_to_partners_50_with_effects_and_related(
                        db,
                        payment_profit,
                        currency,
                        date,
                        "قاصه",
                        "ايداع ارباح سيارة",
                        &profit_note,
                        "customer_payment",
                        &tx_id.to_string(),
                        "profit_recognition",
                        false, // affects_qasa
                        false, // affects_partner_cash
                        true,  // affects_profit
                        Some("car"),
                        Some(car_num),
                    )?;
                }
            }
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
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&financier_name, "اسم الممول")?;
    validate_required_text(&financier_kind, "نوع الممول")?;
    validate_positive_amount(amount, "مبلغ التسديد")?;
    validate_required_text(&date, "التاريخ")?;
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency)?;
    let commission_amount = commission_amount.unwrap_or(0.0);
    if commission_amount > 0.0 {
        validate_positive_amount(commission_amount, "العمولة")?;
    }

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    let financier_name = financier_name.trim();
    let financier_kind = financier_kind.trim();
    let date = date.trim();

    let financier_tx_type = "سحب";

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

    // Issue 4: Classify the original repayment row based on financier_kind
    let (src_type, src_role, aq, apc, apr) = match financier_kind {
        "مستثمر" => ("investor_transaction", "repayment_account_movement", 1, 0, 0),
        "شركة" => ("company_transaction", "repayment_account_movement", 0, 0, 0),
        _ => ("funder_transaction", "repayment_account_movement", 0, 0, 0),
    };
    db.execute(
        "UPDATE partner_transactions SET source_type = ?1, source_id = ?2, source_role = ?3, affects_qasa = ?4, affects_partner_cash = ?5, affects_profit = ?6 WHERE id = ?7",
        params![src_type, tx_id.to_string(), src_role, aq, apc, apr, tx_id],
    ).map_err(|e| e.to_string())?;

    // Ledger record
    record_partner_ledger_entries(&db, tx_id)?;

    recalculate_partner_total(&db, financier_name, financier_kind)?;

    let account_label = match financier_kind {
        "مستثمر" => "المستثمر",
        "شركة" => "الشركة",
        _ => "الممول",
    };
    let partner_note = format!("سحب لتسديد {} {}", account_label, financier_name);
    // Task 6: Use source-aware helper
    let source_type = match financier_kind {
        "مستثمر" => "investor_transaction",
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

        let commission_partner_note =
            format!("سحب مصروف عمولة تسديد الممول {}", financier_name);
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

    db.commit().map_err(|e| e.to_string())?;
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
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    // 1. Reverse old ledger entries for this partner transaction
    reverse_ledger_entries(&db, "partner_transaction", &id.to_string())?;

    delete_customer_payment_partner_splits(&db, id)?;
    delete_customer_payment_profit_splits(&db, id)?;

    // Clean up old split transactions and profit distributions for this ID, with ledger reversing
    let target_pattern = format!("%(رقم الحركة: {})%", id);
    let mut stmt = db.prepare("SELECT id FROM partner_transactions WHERE notes LIKE ?1").map_err(|e| e.to_string())?;
    let linked_ids: Vec<i64> = stmt
        .query_map([&target_pattern], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<i64>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for lid in linked_ids {
        reverse_ledger_entries(&db, "partner_transaction", &lid.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [lid]).map_err(|e| e.to_string())?;
    }

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

    // Issue 3: Recalculate source/affects classification after update
    let classification = classify_partner_transaction(kind.trim(), type_.trim(), id);
    db.execute(
        "UPDATE partner_transactions SET source_type = ?1, source_id = ?2, source_role = ?3, affects_qasa = ?4, affects_partner_cash = ?5, affects_profit = ?6 WHERE id = ?7",
        params![classification.source_type, classification.source_id, classification.source_role, classification.affects_qasa, classification.affects_partner_cash, classification.affects_profit, id],
    ).map_err(|e| e.to_string())?;

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
        &curr,
    )?;

    // Handle commission expense updating/deleting for financier repayments
    let is_financier_repayment = kind.trim() == "ممول" && type_.trim().starts_with("سحب");

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

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_partner_transaction(
    state: State<AppState>,
    id: i64,
    partner_name: String,
    kind: String,
) -> Result<(), String> {
    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    // Delete corresponding commission expense if it exists
    let target_note = format!("%رقم الحركة: {}%", id);
    if let Ok(exp_id) = db.query_row(
        "SELECT id FROM expenses WHERE notes LIKE ?1 LIMIT 1",
        [&target_note],
        |row| row.get::<_, i64>(0),
    ) {
        delete_ledger_entries(&db, "expense", &exp_id.to_string())?;
        let _ = db.execute("DELETE FROM expenses WHERE id = ?1", [exp_id]);
    }

    // Clean up old split transactions and profit distributions for this ID, with ledger deleting
    let target_pattern = format!("%(رقم الحركة: {})%", id);
    let mut stmt = db.prepare("SELECT id FROM partner_transactions WHERE notes LIKE ?1").map_err(|e| e.to_string())?;
    let linked_ids: Vec<i64> = stmt
        .query_map([&target_pattern], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<i64>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for lid in &linked_ids {
        delete_ledger_entries(&db, "partner_transaction", &lid.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [lid]).map_err(|e| e.to_string())?;
    }

    delete_customer_payment_partner_splits(&db, id)?;
    delete_customer_payment_profit_splits(&db, id)?;

    // Delete ledger entries for this partner transaction
    delete_ledger_entries(&db, "partner_transaction", &id.to_string())?;

    db.execute(
        "DELETE FROM partner_transactions WHERE id = ?1 AND partner_name = ?2 AND kind = ?3",
        (id, partner_name.trim(), kind.trim()),
    )
    .map_err(|e| e.to_string())?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    db.commit().map_err(|e| e.to_string())?;
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

    if let Some(pt) = &payment_type {
        if pt == "الكاش" || pt == "قاصه" || pt == "قاصة" {
            // Phase 3: Use affects_qasa / affects_partner_cash flags
            let query = if pt == "الكاش" {
                "SELECT id, date, COALESCE(time, '00:00'), type, amount, partner_name, notes, COALESCE(currency, 'IQD'), kind
                 FROM partner_transactions
                 WHERE affects_partner_cash = 1 AND kind = 'شريك' AND type NOT LIKE '%تحويل%'
                 ORDER BY date ASC, time ASC, id ASC"
            } else {
                "SELECT id, date, COALESCE(time, '00:00'), type, amount, partner_name, notes, COALESCE(currency, 'IQD'), kind
                 FROM partner_transactions
                 WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر') AND type NOT LIKE '%تحويل%'
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
                let raw_amount: f64 = row.get(4).map_err(|e| e.to_string())?;
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
                    0.0
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

fn car_expense_partner_note(db: &Connection, car_number: &str, description: &str, expense_id: i64) -> String {
    let car_info: Option<(String, Option<String>)> = db
        .query_row(
            "SELECT car_name, chassis_number FROM cars WHERE car_number = ?1",
            [car_number.trim()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .ok();

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
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&description, "وصف المصروف")?;
    validate_positive_amount(amount, "المبلغ")?;
    validate_required_text(&date, "التاريخ")?;
    let currency_val = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency_val)?;

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
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

            // Phase 12: Use reference_type = "car_expense"
            record_ledger_entry(
                &db,
                date.trim(),
                &current_time,
                "inventory",
                Some(car_num),
                amount,
                0.0,
                &currency_val,
                "car_expense",
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
                "car_expense",
                &exp_id.to_string(),
                "دفع مصروف سيارة",
                &format!("دفع مصروف سيارة: {} - {}", car_num, description.trim()),
                notes.as_deref(),
            )?;

            if amount > 0.0 {
                let expense_note = car_expense_partner_note(&db, car_num, description.trim(), exp_id);
                distribute_to_partners_50_with_effects(
                    &db,
                    amount,
                    &currency_val,
                    date.trim(),
                    "قاصه",
                    "سحب مصروف",
                    &expense_note,
                    "car_expense",
                    &exp_id.to_string(),
                    "cash_payment",
                    true,  // affects_qasa
                    true,  // affects_partner_cash
                    false, // affects_profit
                )?;
            }

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
                // Issue 10: Use delete instead of reverse for clean rebuild
                delete_ledger_entries(&db, "car", car_num)?;
                record_car_ledger_entries(&db, car_num)?;
            }

            db.commit().map_err(|e| e.to_string())?;
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

    // Phase 13: Use source fields for partner transactions
    if amount > 0.0 {
        let expense_note = format!("سحب مصروف {} (رقم المصروف: {})", description.trim(), exp_id);
        distribute_to_partners_50_with_effects(
            &db,
            amount,
            &currency_val,
            date.trim(),
            "قاصه",
            "سحب مصروف",
            &expense_note,
            "expense",
            &exp_id.to_string(),
            "cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    }

    db.commit().map_err(|e| e.to_string())?;
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
    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    // Delete partner transactions WITH their ledger entries (prevents orphan ledger rows)
    delete_partner_transactions_by_source_with_ledger(&db, "expense", &id.to_string(), Some("cash_payment"))?;

    // حذف حركات القيد في دفتر الأستاذ
    delete_ledger_entries(&db, "expense", &id.to_string())?;

    // حذف سجل المصروف
    db.execute("DELETE FROM expenses WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

    db.commit().map_err(|e| e.to_string())?;
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
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&description, "وصف المصروف")?;
    validate_positive_amount(amount, "المبلغ")?;
    validate_required_text(&date, "التاريخ")?;
    let currency_val = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency_val)?;

    // ============================================================
    // ATOMIC TRANSACTION — Delete and Rebuild policy
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    let (_, current_time) = now_datetime();

    // 1. Delete old partner transactions WITH their ledger entries
    delete_partner_transactions_by_source_with_ledger(&db, "expense", &id.to_string(), Some("cash_payment"))?;

    // 2. Delete old expense ledger entries (clean rebuild, not reverse)
    delete_ledger_entries(&db, "expense", &id.to_string())?;

    // 3. تحديث جدول المصروفات
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

    // 4. كتابة القيد الجديد في دفتر الأستاذ
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

    // 5. إعادة توزيع 50% من المصروف على حسابات الشركاء
    if amount > 0.0 {
        let expense_note = format!("سحب مصروف {} (رقم المصروف: {})", description.trim(), id);
        distribute_to_partners_50_with_effects(
            &db,
            amount,
            &currency_val,
            date.trim(),
            "قاصه",
            "سحب مصروف",
            &expense_note,
            "expense",
            &id.to_string(),
            "cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    }

    db.commit().map_err(|e| e.to_string())?;
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
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&car_number, "رقم السيارة")?;
    validate_required_text(&description, "وصف المصروف")?;
    validate_positive_amount(amount, "المبلغ")?;
    validate_required_text(&date, "التاريخ")?;
    let currency_val = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency_val)?;

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
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

    // Phase 12: Use reference_type = "car_expense"
    record_ledger_entry(
        &db,
        date.trim(),
        &current_time,
        "inventory",
        Some(car_number.trim()),
        amount,
        0.0,
        &currency_val,
        "car_expense",
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
        "car_expense",
        &id.to_string(),
        "دفع مصروف سيارة",
        &format!(
            "دفع مصروف سيارة: {} - {}",
            car_number.trim(),
            description.trim()
        ),
        None,
    )?;

    if amount > 0.0 {
        let expense_note = car_expense_partner_note(&db, car_number.trim(), description.trim(), id);
        distribute_to_partners_50_with_effects(
            &db,
            amount,
            &currency_val,
            date.trim(),
            "قاصه",
            "سحب مصروف",
            &expense_note,
            "car_expense",
            &id.to_string(),
            "cash_payment",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
        )?;
    }

    let is_sold: bool = db
        .query_row(
            "SELECT COUNT(1) FROM cars WHERE car_number = ?1 AND status = 'مبيوعة'",
            [car_number.trim()],
            |row| row.get(0),
        )
        .unwrap_or(0)
        > 0;

    if is_sold {
        // Issue 10: Use delete instead of reverse for clean rebuild
        delete_ledger_entries(&db, "car", car_number.trim())?;
        record_car_ledger_entries(&db, car_number.trim())?;
    }

    db.commit().map_err(|e| e.to_string())?;
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
    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;

    // 1. جلب معلومات المصروف
    let row_result = db.query_row(
        "SELECT car_number, amount FROM car_expenses WHERE id = ?1",
        [id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)),
    );

    if let Ok((car_number, _expense_amount)) = row_result {
        // Delete partner transactions WITH their ledger entries (prevents orphan ledger rows)
        delete_partner_transactions_by_source_with_ledger(&db, "car_expense", &id.to_string(), Some("cash_payment"))?;

        // Phase 12: Use "car_expense" reference type
        delete_ledger_entries(&db, "car_expense", &id.to_string())?;

        db.execute("DELETE FROM car_expenses WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;

        let is_sold: bool = db
            .query_row(
                "SELECT COUNT(1) FROM cars WHERE car_number = ?1 AND status = 'مبيوعة'",
                [&car_number],
                |row| row.get(0),
            )
            .unwrap_or(0)
            > 0;

        if is_sold {
            // Issue 10: Use delete instead of reverse for clean rebuild
            delete_ledger_entries(&db, "car", &car_number)?;
            record_car_ledger_entries(&db, &car_number)?;
        }
    } else {
        db.execute("DELETE FROM car_expenses WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
    }

    recalculate_all_partners(&db)?;

    db.commit().map_err(|e| e.to_string())?;
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
        let days_in_year = if is_leap_year(y) {
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
    let leap = is_leap_year(y);
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

fn is_leap_year(year: u64) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

fn distribute_to_partners_50(
    db: &Connection,
    amount: f64,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Ok(());
    }

    let partner_names = vec!["أمير".to_string(), "منتصر".to_string()];
    let per_partner = amount / 2.0;

    let time_str = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    for p_name in &partner_names {
        db.execute(
            "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, 'شريك')",
            [p_name],
        )
        .map_err(|e| e.to_string())?;

        // Issue 5: Use unique source_id to prevent collisions
        let unique_source_id = format!("legacy_{}_{}_{}_{}", p_name, date, &time_str, tx_type.len());
        db.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit)
             VALUES (?1, 'شريك', ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'legacy_distribution', ?9, 'legacy_cash_movement', 1, 1, 0)",
            params![
                p_name,
                tx_type,
                per_partner,
                date,
                &time_str,
                notes,
                currency,
                payment_type,
                unique_source_id,
            ],
        )
        .map_err(|e| e.to_string())?;

        recalculate_partner_total(db, p_name, "شريك")?;
    }

    Ok(())
}

fn agency_profit_note(old_agent_name: &str, new_agent_name: &str) -> String {
    format!(
        "ايداع ارباح وكالة {} {} رئيسي",
        old_agent_name.trim(),
        new_agent_name.trim()
    )
    .trim()
    .replace("  ", " ")
}

fn delete_agency_profit_distributions(
    db: &Connection,
    agency_id: i64,
) -> Result<(), String> {
    // Phase 14: Delete by source fields instead of name/date/notes
    delete_partner_transactions_by_source_with_ledger(db, "agency", &agency_id.to_string(), Some("profit_recognition"))?;
    Ok(())
}

fn distribute_agency_base_profit(db: &Connection, agency_id: i64) -> Result<(), String> {
    let agency_info: Result<(String, String, f64, f64, String), rusqlite::Error> = db.query_row(
        "SELECT old_agent_name, new_agent_name, amount_usd, amount_iqd, date FROM agencies WHERE id = ?1",
        [agency_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    );

    let (old_agent_name, new_agent_name, amount_usd, amount_iqd, date) = match agency_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    // Phase 14: Delete by agency_id
    delete_agency_profit_distributions(db, agency_id)?;
    let note = agency_profit_note(&old_agent_name, &new_agent_name);

    if amount_usd > 0.0 {
        distribute_to_partners_50_with_effects(
            db,
            amount_usd,
            "USD",
            &date,
            "قاصه",
            "ايداع ارباح وكالة",
            &note,
            "agency",
            &agency_id.to_string(),
            "profit_recognition",
            false, // affects_qasa
            false, // affects_partner_cash
            true,  // affects_profit
        )?;
    }
    if amount_iqd > 0.0 {
        distribute_to_partners_50_with_effects(
            db,
            amount_iqd,
            "IQD",
            &date,
            "قاصه",
            "ايداع ارباح وكالة",
            &note,
            "agency",
            &agency_id.to_string(),
            "profit_recognition",
            false, // affects_qasa
            false, // affects_partner_cash
            true,  // affects_profit
        )?;
    }

    Ok(())
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

#[allow(clippy::too_many_arguments)]
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
    distribute_agency_base_profit(&db, new_id)?;

    Ok(new_id)
}

#[allow(clippy::too_many_arguments)]
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

    // Phase 14: Delete by agency_id
    delete_agency_profit_distributions(&db, id)?;

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
    distribute_agency_base_profit(&db, id)?;

    Ok(())
}

#[tauri::command]
fn delete_agency(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Issue 9: Delete only by source fields, not by names/notes
    // 1. Delete agency base profit rows with their ledger entries
    delete_partner_transactions_by_source_with_ledger(&db, "agency", &id.to_string(), None)?;

    // 2. Delete ledger entries for the agency itself
    delete_ledger_entries(&db, "agency", &id.to_string())?;

    // 3. Get all agency transactions and delete their partner rows + ledger entries
    let mut stmt = db
        .prepare("SELECT id FROM agency_transactions WHERE agency_id = ?1")
        .map_err(|e| e.to_string())?;
    let tx_ids: Vec<i64> = stmt
        .query_map([id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<i64>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    for tx_id in &tx_ids {
        delete_partner_transactions_by_source_with_ledger(&db, "agency_transaction", &tx_id.to_string(), None)?;
        delete_ledger_entries(&db, "agency_transaction", &tx_id.to_string())?;
    }

    // 4. Delete agency transactions and agency record
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

    // توزيع 50% من أرباح الوكالة على حسابات الشركاء (فائدة الإيداع فقط)
    if type_.trim() == "ايداع" && amount > 0.0 {
        let curr = currency.unwrap_or_else(|| "IQD".to_string());
        let (old_agent_name, new_agent_name): (String, String) = db
            .query_row(
                "SELECT old_agent_name, new_agent_name FROM agencies WHERE id = ?1",
                [agency_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or_default();
        let agency_note = format!(
            "ايداع ارباح وكالة {} {}",
            old_agent_name.trim(),
            new_agent_name.trim()
        )
        .trim()
        .replace("  ", " ");
        // Phase 14: Use source fields for transaction profit
        distribute_to_partners_50_with_effects(
            &db,
            amount,
            &curr,
            date.trim(),
            "قاصه",
            "ايداع ارباح وكالة",
            &agency_note,
            "agency_transaction",
            &tx_id.to_string(),
            "profit_recognition",
            false, // affects_qasa
            false, // affects_partner_cash
            true,  // affects_profit
        )?;
    }

    Ok(())
}

#[tauri::command]
fn delete_agency_transaction(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Issue 9: Delete only by source fields, not by names/notes
    // 1. Delete ledger entries for this transaction
    delete_ledger_entries(&db, "agency_transaction", &id.to_string())?;

    // 2. Delete profit rows for this specific transaction by source fields with ledger entries
    delete_partner_transactions_by_source_with_ledger(&db, "agency_transaction", &id.to_string(), None)?;

    // 3. Delete the agency transaction record itself
    db.execute("DELETE FROM agency_transactions WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

    Ok(())
}

#[tauri::command]
#[allow(unused_variables)]
fn get_financial_summary(
    state: State<AppState>,
    payment_type: Option<String>,
) -> Result<FinancialSummary, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    // NOTE: Read-only function — must NOT call recalculate_all_partners or any write operation
    let payment_type = payment_type.map(|pt| pt.trim().to_string());

    // Phase 4: Calculate qasa (partners + investors) and cash (partners only) using affects_* flags
    let qasa_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'تحويل%' THEN -amount
                ELSE 0
            END
         ), 0.0)
         FROM partner_transactions
         WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر') AND COALESCE(currency, 'IQD') = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let qasa_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'تحويل%' THEN -amount
                ELSE 0
            END
         ), 0.0)
         FROM partner_transactions
         WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر') AND COALESCE(currency, 'IQD') = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let cash_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'تحويل%' THEN -amount
                ELSE 0
            END
         ), 0.0)
         FROM partner_transactions
         WHERE affects_partner_cash = 1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let cash_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(
            CASE
                WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                     AND type NOT LIKE 'تحويل%' THEN amount
                WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                     AND type NOT LIKE 'تحويل%' THEN -amount
                ELSE 0
            END
         ), 0.0)
         FROM partner_transactions
         WHERE affects_partner_cash = 1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // 2. Inventory Value — from ledger entries. Car purchases, including cash purchases,
    // are recorded in record_car_ledger_entries(), so adding cars.purchase_price here
    // would count the same vehicle twice.
    let ledger_inventory_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let ledger_inventory_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(0.0);
    let inventory_value_iqd = ledger_inventory_iqd;
    let inventory_value_usd = ledger_inventory_usd;

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

    // Issue 4: Company Value = Cash + Inventory + Receivables - Investors - Funders - Payables
    let net_capital_iqd = cash_iqd
        + inventory_value_iqd
        + total_debtors_iqd
        - total_investments_iqd
        - total_funders_iqd
        - total_payables_iqd;
    let net_capital_usd = cash_usd
        + inventory_value_usd
        + total_debtors_usd
        - total_investments_usd
        - total_funders_usd
        - total_payables_usd;

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
        "partners-financial" => vec!["شريك", "مستثمر", "ممول", "شركة"],
        "partners-only" => vec!["شريك"],
        "customers-only" => vec!["مستثمر", "ممول", "شركة", "زبون"],
        _ => vec![kind.as_str()],
    };

    let mut iqd_total = 0.0;
    let mut usd_total = 0.0;

    for k in &filter_kind {
        // Task 7: Use affects_* flags for partner/investor, keep debt logic for customers
        let (sql, use_param): (&str, bool) = if *k == "شريك" {
            ("SELECT
                COALESCE(SUM(CASE
                    WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                          OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                          OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                         AND type NOT LIKE 'تحويل%' THEN amount
                    WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                         AND type NOT LIKE 'تحويل%' THEN -amount
                    ELSE 0
                END), 0.0),
                COALESCE(currency, 'IQD')
             FROM partner_transactions
             WHERE kind = 'شريك' AND affects_partner_cash = 1 AND type NOT LIKE 'تحويل%'
             GROUP BY currency", false)
        } else if *k == "مستثمر" {
            ("SELECT
                COALESCE(SUM(CASE
                    WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                          OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                          OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                         AND type NOT LIKE 'تحويل%' THEN -amount
                    WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                         AND type NOT LIKE 'تحويل%' THEN amount
                    ELSE 0
                END), 0.0),
                COALESCE(currency, 'IQD')
             FROM partner_transactions
             WHERE kind = 'مستثمر' AND type NOT LIKE 'تحويل%'
             GROUP BY currency", false)
        } else if *k == "زبون" {
            // Customer: use financial_ledger receivable net as single source of truth
            ("SELECT COALESCE(SUM(debit - credit), 0.0), currency
             FROM financial_ledger
             WHERE account_type = 'receivable'
             GROUP BY currency", false)
        } else {
            ("SELECT
                COALESCE(SUM(CASE
                    WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                          OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                          OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                         AND type NOT LIKE 'تحويل%' THEN -amount
                    WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                         AND type NOT LIKE 'تحويل%' THEN amount
                    ELSE 0
                END), 0.0),
                COALESCE(currency, 'IQD')
             FROM partner_transactions
             WHERE kind = ?1 AND type NOT LIKE 'تحويل%'
             GROUP BY currency", true)
        };

        let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
        let mut row_pairs: Vec<(f64, String)> = Vec::new();
        if use_param {
            let mut rows = stmt.query([k]).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                row_pairs.push((row.get(0).map_err(|e| e.to_string())?, row.get(1).map_err(|e| e.to_string())?));
            }
        } else {
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                row_pairs.push((row.get(0).map_err(|e| e.to_string())?, row.get(1).map_err(|e| e.to_string())?));
            }
        }

        for (total, currency) in row_pairs {
            if currency == "USD" {
                usd_total += total;
            } else {
                iqd_total += total;
            }
        }
    }

    Ok((iqd_total, usd_total))
}

fn calculate_profit_totals_since(
    db: &Connection,
    start_date: &str,
    start_time: &str,
) -> Result<(f64, f64), String> {
    // Task 8: Use date + time filtering together
    let time_filter = start_time.trim();
    let effective_time = if time_filter.is_empty() { "00:00" } else { time_filter };

    let realized_profit_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
         WHERE kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
           AND affects_profit = 1
           AND (
             date > ?1
             OR (date = ?1 AND COALESCE(time, '00:00') >= ?2)
           )",
        params![start_date, effective_time],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let realized_profit_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
         WHERE kind = 'شريك' AND COALESCE(currency, 'IQD') = 'USD'
           AND affects_profit = 1
           AND (
             date > ?1
             OR (date = ?1 AND COALESCE(time, '00:00') >= ?2)
           )",
        params![start_date, effective_time],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Only general expenses (not linked to a car)
    let general_expenses_iqd: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
         WHERE COALESCE(currency, 'IQD') = 'IQD'
           AND (car_number IS NULL OR car_number = '')
           AND (
             date > ?1
             OR (date = ?1 AND COALESCE(time, '00:00') >= ?2)
           )",
        params![start_date, effective_time],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let general_expenses_usd: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
         WHERE COALESCE(currency, 'IQD') = 'USD'
           AND (car_number IS NULL OR car_number = '')
           AND (
             date > ?1
             OR (date = ?1 AND COALESCE(time, '00:00') >= ?2)
           )",
        params![start_date, effective_time],
        |row| row.get(0),
    ).unwrap_or(0.0);

    Ok((
        realized_profit_iqd - general_expenses_iqd,
        realized_profit_usd - general_expenses_usd,
    ))
}

fn parse_ymd(date: &str) -> Option<(i32, u32, u32)> {
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

fn profit_period_month_start(current_date: &str, _current_time: &str) -> String {
    let (year, month, _) = parse_ymd(current_date).unwrap_or((2025, 1, 1));
    format!("{:04}-{:02}-01", year, month)
}

fn current_profit_period_start(
    db: &Connection,
    current_date: &str,
    current_time: &str,
) -> Result<(String, String), String> {
    let month_start = profit_period_month_start(current_date, current_time);
    let latest_reset = db.query_row(
        "SELECT date, time FROM profit_distributions
         WHERE notes LIKE 'manual-reset:%' AND date >= ?1
         ORDER BY date DESC, time DESC, id DESC
         LIMIT 1",
        params![&month_start],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ).ok();

    Ok(latest_reset.unwrap_or((month_start, String::new())))
}

#[tauri::command]
fn get_profit_distribution_summary(
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
    let effective_start_time = if use_time { period_start_time.as_str() } else { "00:00" };

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
        // Phase 9: Use affects_profit = 1 instead of type names
        // Issue 8: Use time-aware filtering
        let profit_iqd: f64 = if use_time {
            db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'IQD'
                   AND affects_profit = 1
                   AND (
                     date > ?2
                     OR (date = ?2 AND COALESCE(time, '00:00') >= ?3)
                   )",
                params![&name, &start, effective_start_time],
                |row| row.get(0),
            ).unwrap_or(0.0)
        } else {
            db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'IQD'
                   AND affects_profit = 1
                   AND date >= ?2 AND date <= ?3",
                params![&name, &start, &end],
                |row| row.get(0),
            ).unwrap_or(0.0)
        };

        let profit_usd: f64 = if use_time {
            db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'USD'
                   AND affects_profit = 1
                   AND (
                     date > ?2
                     OR (date = ?2 AND COALESCE(time, '00:00') >= ?3)
                   )",
                params![&name, &start, effective_start_time],
                |row| row.get(0),
            ).unwrap_or(0.0)
        } else {
            db.query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'USD'
                   AND affects_profit = 1
                   AND date >= ?2 AND date <= ?3",
                params![&name, &start, &end],
                |row| row.get(0),
            ).unwrap_or(0.0)
        };

        // Query IQD drawings (only type = 'سحب شريك', excluding expenses)
        let drawings_iqd: f64 = db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'IQD'
               AND type = 'سحب شريك'
               AND date >= ?2 AND date <= ?3",
            params![&name, &start, &end],
            |row| row.get(0),
        ).unwrap_or(0.0);

        // Query USD drawings (only type = 'سحب شريك', excluding expenses)
        let drawings_usd: f64 = db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'USD'
               AND type = 'سحب شريك'
               AND date >= ?2 AND date <= ?3",
            params![&name, &start, &end],
            |row| row.get(0),
        ).unwrap_or(0.0);

        partners.push(PartnerDistributionInfo {
            partner_name: name,
            profit_iqd,
            profit_usd,
            drawings_iqd,
            drawings_usd,
        });
    }

    // Phase 9: Only general expenses (not linked to a car)
    // Issue 8: Use time-aware filtering for consistency
    let expenses_iqd: f64 = if use_time {
        db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'IQD'
               AND (car_number IS NULL OR car_number = '')
               AND (
                 date > ?1
                 OR (date = ?1 AND COALESCE(time, '00:00') >= ?2)
               )",
            params![&start, effective_start_time],
            |row| row.get(0),
        ).unwrap_or(0.0)
    } else {
        db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'IQD'
               AND (car_number IS NULL OR car_number = '')
               AND date >= ?1 AND date <= ?2",
            params![&start, &end],
            |row| row.get(0),
        ).unwrap_or(0.0)
    };

    let expenses_usd: f64 = if use_time {
        db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'USD'
               AND (car_number IS NULL OR car_number = '')
               AND (
                 date > ?1
                 OR (date = ?1 AND COALESCE(time, '00:00') >= ?2)
               )",
            params![&start, effective_start_time],
            |row| row.get(0),
        ).unwrap_or(0.0)
    } else {
        db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'USD'
               AND (car_number IS NULL OR car_number = '')
               AND date >= ?1 AND date <= ?2",
            params![&start, &end],
            |row| row.get(0),
        ).unwrap_or(0.0)
    };

    let mut undistributed_iqd = 0.0;
    let mut undistributed_usd = 0.0;
    for p in &partners {
        undistributed_iqd += p.profit_iqd - p.drawings_iqd;
        undistributed_usd += p.profit_usd - p.drawings_usd;
    }
    undistributed_iqd -= expenses_iqd;
    undistributed_usd -= expenses_usd;

    Ok(ProfitDistributionSummary {
        undistributed_iqd,
        undistributed_usd,
        partners,
        expenses_iqd,
        expenses_usd,
    })
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

    for entry in entries.flatten() {
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

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() {
            if let Some(fname) = p.file_stem().and_then(|s| s.to_str()) {
                let fname_lower = fname.to_lowercase();
                if fname_lower == "bg" {
                    bg_exists = true;
                } else if let Some(num_str) = fname_lower.strip_prefix("bg") {
                    if let Ok(num) = num_str.parse::<i32>() {
                        if num > max_num {
                            max_num = num;
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

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

#[allow(dead_code)]
fn get_partner_names_for_distribution(db: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = db
        .prepare(
            "SELECT partner_name FROM partners WHERE kind = 'شريك'",
        )
        .map_err(|e| e.to_string())?;

    let names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(names)
}

fn deduct_from_partners_5050(
    db: &Connection,
    amount: f64,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
) -> Result<(), String> {
    distribute_to_partners_50(db, amount, currency, date, payment_type, tx_type, notes)
}

// ==================== PHASE 2: CENTRALIZED PARTNER TRANSACTION HELPERS ====================

#[allow(clippy::too_many_arguments)]
fn insert_partner_transaction_with_effects(
    db: &Connection,
    partner_name: &str,
    kind: &str,
    type_: &str,
    amount: f64,
    date: &str,
    payment_type: &str,
    notes: &str,
    currency: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
) -> Result<i64, String> {
    insert_partner_transaction_with_effects_and_related(
        db, partner_name, kind, type_, amount, date, payment_type, notes, currency,
        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
        None, None,
    )
}

#[allow(clippy::too_many_arguments)]
fn insert_partner_transaction_with_effects_and_related(
    db: &Connection,
    partner_name: &str,
    kind: &str,
    type_: &str,
    amount: f64,
    date: &str,
    payment_type: &str,
    notes: &str,
    currency: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
    related_source_type: Option<&str>,
    related_source_id: Option<&str>,
) -> Result<i64, String> {
    if amount <= 0.0 {
        return Ok(0);
    }

    db.execute(
        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, '', 0.0, ?2)",
        params![partner_name.trim(), kind.trim()],
    )
    .map_err(|e| e.to_string())?;

    let time_str = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            &time_str,
            notes.trim(),
            currency.trim(),
            payment_type.trim(),
            source_type.trim(),
            source_id.trim(),
            source_role.trim(),
            affects_qasa as i32,
            affects_partner_cash as i32,
            affects_profit as i32,
            related_source_type.unwrap_or(""),
            related_source_id.unwrap_or(""),
        ],
    )
    .map_err(|e| e.to_string())?;

    let tx_id = db.last_insert_rowid();

    // Ledger entry for partner/investor transactions
    record_partner_ledger_entries(db, tx_id)?;
    recalculate_partner_total(db, partner_name.trim(), kind.trim())?;

    Ok(tx_id)
}

#[allow(clippy::too_many_arguments)]
fn distribute_to_partners_50_with_effects(
    db: &Connection,
    amount: f64,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Ok(());
    }
    let per_partner = amount / 2.0;
    for p_name in &["أمير".to_string(), "منتصر".to_string()] {
        insert_partner_transaction_with_effects(
            db,
            p_name,
            "شريك",
            tx_type,
            per_partner,
            date,
            payment_type,
            notes,
            currency,
            source_type,
            source_id,
            source_role,
            affects_qasa,
            affects_partner_cash,
            affects_profit,
        )?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn distribute_to_partners_50_with_effects_and_related(
    db: &Connection,
    amount: f64,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
    related_source_type: Option<&str>,
    related_source_id: Option<&str>,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Ok(());
    }
    let per_partner = amount / 2.0;
    for p_name in &["أمير".to_string(), "منتصر".to_string()] {
        insert_partner_transaction_with_effects_and_related(
            db,
            p_name,
            "شريك",
            tx_type,
            per_partner,
            date,
            payment_type,
            notes,
            currency,
            source_type,
            source_id,
            source_role,
            affects_qasa,
            affects_partner_cash,
            affects_profit,
            related_source_type,
            related_source_id,
        )?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn deduct_from_partners_5050_with_effects(
    db: &Connection,
    amount: f64,
    currency: &str,
    date: &str,
    payment_type: &str,
    tx_type: &str,
    notes: &str,
    source_type: &str,
    source_id: &str,
    source_role: &str,
    affects_qasa: bool,
    affects_partner_cash: bool,
    affects_profit: bool,
) -> Result<(), String> {
    distribute_to_partners_50_with_effects(
        db, amount, currency, date, payment_type, tx_type, notes,
        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
    )
}

// ==================== PHASE 6: PROFIT CAP FUNCTIONS ====================

fn calculate_car_total_profit(db: &Connection, car_number: &str) -> Result<f64, String> {
    let car_info: Result<(f64, f64, String, String), rusqlite::Error> = db.query_row(
        "SELECT purchase_price, selling_price, COALESCE(currency, 'IQD'), COALESCE(sale_currency, 'IQD')
         FROM cars WHERE car_number = ?1",
        [car_number],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    );

    let (purchase_price, selling_price, purchase_currency, sale_currency) = match car_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(0.0),
        Err(e) => return Err(e.to_string()),
    };

    if purchase_currency != sale_currency {
        return Ok(0.0);
    }

    let expenses_sum: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
        [car_number],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let total_cost = purchase_price + expenses_sum;
    Ok(selling_price - total_cost)
}

fn get_recognized_profit_for_car(db: &Connection, car_number: &str) -> Result<f64, String> {
    // Use related_source_id for new rows (source_id is payment ID, not car number)
    let recognized_new: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
         WHERE kind = 'شريك' AND affects_profit = 1
           AND source_role = 'profit_recognition'
           AND related_source_type = 'car'
           AND related_source_id = ?1",
        [car_number],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Legacy fallback for old rows without related_source_id
    let pattern = format!("%#بيع_سيارة_{}%", car_number);
    let recognized_legacy: f64 = db.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
         WHERE kind = 'شريك' AND affects_profit = 1
           AND source_role = 'profit_recognition'
           AND (related_source_id IS NULL OR related_source_id = '')
           AND notes LIKE ?1",
        [&pattern],
        |row| row.get(0),
    ).unwrap_or(0.0);

    Ok(recognized_new + recognized_legacy)
}

fn calculate_customer_payment_profit_capped(
    db: &Connection,
    car_number: &str,
    payment_amount: f64,
    payment_currency: &str,
) -> Result<f64, String> {
    let theoretical_profit = calculate_customer_payment_profit(db, car_number, payment_amount, payment_currency)?;
    if theoretical_profit <= 0.0 {
        return Ok(0.0);
    }

    let total_profit = calculate_car_total_profit(db, car_number)?;
    if total_profit <= 0.0 {
        return Ok(0.0);
    }

    // recognized profit from both partners combined = company profit
    let recognized = get_recognized_profit_for_car(db, car_number)?;
    let remaining = total_profit - recognized;

    if remaining <= 0.0 {
        return Ok(0.0);
    }

    Ok(theoretical_profit.min(remaining))
}

// ==================== COMPANY SETTLEMENT THROUGH FUNDER ====================

#[tauri::command]
fn settle_company_through_funder(
    state: State<AppState>,
    company_name: String,
    funder_name: String,
    amount: f64,
    date: String,
    currency: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let curr = currency.as_deref().unwrap_or("IQD");
    let time_str = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    // 1. Create company withdrawal with special note
    let note = format!("تسديد {} من قبل {}", company_name.trim(), funder_name.trim());
    let company_note = note.clone();
    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit)
         VALUES (?1, 'شركة', 'سحب', ?2, ?3, ?4, ?5, ?6, 'نقدا', 'company_funder_settlement', ?7, 'company_account_movement', 0, 0, 0)",
        params![
            company_name.trim(),
            amount,
            date.trim(),
            &time_str,
            &company_note,
            curr,
            format!("settlement_{}", company_name.trim()),
        ],
    )
    .map_err(|e| e.to_string())?;
    let company_tx_id = db.last_insert_rowid();
    record_partner_ledger_entries(&db, company_tx_id)?;
    recalculate_partner_total(&db, company_name.trim(), "شركة")?;

    // 2. Create funder deposit (funder pays out to cover the company)
    let funder_note = note.clone();
    db.execute(
        "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit)
         VALUES (?1, 'ممول', 'ايداع', ?2, ?3, ?4, ?5, ?6, 'قاصه', 'company_funder_settlement', ?7, 'funder_account_movement', 0, 0, 0)",
        params![
            funder_name.trim(),
            amount,
            date.trim(),
            &time_str,
            &funder_note,
            curr,
            format!("settlement_{}", funder_name.trim()),
        ],
    )
    .map_err(|e| e.to_string())?;
    let funder_tx_id = db.last_insert_rowid();
    record_partner_ledger_entries(&db, funder_tx_id)?;
    recalculate_partner_total(&db, funder_name.trim(), "ممول")?;

    Ok(())
}

// ==================== AUTHENTICATION COMMANDS ====================

#[derive(Serialize, Debug, Clone)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub profile_image: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct LoginResult {
    pub success: bool,
    pub user: Option<UserInfo>,
    pub error: Option<String>,
}

#[tauri::command]
fn login(
    state: State<AppState>,
    username: String,
    password: String,
) -> Result<LoginResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let username = username.trim();
    let password = password.trim();

    let result = db.query_row(
        "SELECT id, username, display_name, profile_image, password_hash FROM users WHERE username = ?1",
        [username],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
            ))
        },
    );

    match result {
        Ok((id, uname, display_name, profile_image, stored_hash)) => {
            let input_hash = hash_password(password);
            if input_hash == stored_hash {
                Ok(LoginResult {
                    success: true,
                    user: Some(UserInfo {
                        id,
                        username: uname,
                        display_name,
                        profile_image,
                    }),
                    error: None,
                })
            } else {
                Ok(LoginResult {
                    success: false,
                    user: None,
                    error: Some("كلمة المرور غير صحيحة".to_string()),
                })
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(LoginResult {
            success: false,
            user: None,
            error: Some("اسم المستخدم غير موجود".to_string()),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_users(state: State<AppState>) -> Result<Vec<UserInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, username, display_name, profile_image FROM users ORDER BY id")
        .map_err(|e| e.to_string())?;

    let users = stmt
        .query_map([], |row| {
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                display_name: row.get(2)?,
                profile_image: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(users)
}

#[tauri::command]
fn add_user(
    state: State<AppState>,
    username: String,
    password: String,
    display_name: String,
    profile_image: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let username = username.trim();
    let display_name = display_name.trim();

    if username.is_empty() {
        return Err("اسم المستخدم مطلوب".to_string());
    }
    if password.len() < 3 {
        return Err("كلمة المرور يجب أن تكون 3 أحرف على الأقل".to_string());
    }

    let hash = hash_password(password.trim());

    db.execute(
        "INSERT INTO users (username, password_hash, display_name, profile_image) VALUES (?1, ?2, ?3, ?4)",
        params![username, hash, display_name, profile_image],
    )
    .map_err(|e| format!("فشل إنشاء المستخدم: {}", e))?;

    Ok(())
}

#[tauri::command]
fn update_user(
    state: State<AppState>,
    id: i64,
    username: String,
    display_name: String,
    profile_image: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.execute(
        "UPDATE users SET username = ?1, display_name = ?2, profile_image = ?3, updated_at = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?4",
        params![username.trim(), display_name.trim(), profile_image, id],
    )
    .map_err(|e| format!("فشل تحديث المستخدم: {}", e))?;

    Ok(())
}

#[tauri::command]
fn change_password(
    state: State<AppState>,
    id: i64,
    new_password: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    if new_password.trim().len() < 3 {
        return Err("كلمة المرور يجب أن تكون 3 أحرف على الأقل".to_string());
    }

    let hash = hash_password(new_password.trim());
    db.execute(
        "UPDATE users SET password_hash = ?1, updated_at = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?2",
        params![hash, id],
    )
    .map_err(|e| format!("فشل تغيير كلمة المرور: {}", e))?;

    Ok(())
}

#[tauri::command]
fn delete_user(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Prevent deleting the default admin user (id == 1)
    if id == 1 {
        return Err("لا يمكن حذف مستخدم admin الافتراضي".to_string());
    }

    db.execute("DELETE FROM users WHERE id = ?1", [id])
        .map_err(|e| format!("فشل حذف المستخدم: {}", e))?;

    Ok(())
}

struct ExportSection {
    table_name: &'static str,
    sheet_name: &'static str,
    title: &'static str,
    order_by: Option<&'static str>,
}

enum ExcelValue {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(usize),
}

fn export_sections() -> Vec<ExportSection> {
    vec![
        ExportSection {
            table_name: "cars",
            sheet_name: "السيارات",
            title: "قسم السيارات",
            order_by: Some("COALESCE(purchase_date, ''), car_number"),
        },
        ExportSection {
            table_name: "car_partners",
            sheet_name: "شركاء السيارات",
            title: "قسم شركاء السيارات",
            order_by: Some("car_number, partner_name"),
        },
        ExportSection {
            table_name: "car_expenses",
            sheet_name: "مصاريف السيارات",
            title: "قسم مصاريف السيارات",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "partners",
            sheet_name: "الشركاء والحسابات",
            title: "قسم الشركاء والحسابات",
            order_by: Some("kind, partner_name"),
        },
        ExportSection {
            table_name: "partner_transactions",
            sheet_name: "حركات الشركاء",
            title: "قسم حركات الشركاء",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "cash_register",
            sheet_name: "القاصة",
            title: "قسم القاصة",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "expenses",
            sheet_name: "المصاريف العامة",
            title: "قسم المصاريف العامة",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "agencies",
            sheet_name: "الوكالات",
            title: "قسم الوكالات",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "agency_transactions",
            sheet_name: "حركات الوكالات",
            title: "قسم حركات الوكالات",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "financial_ledger",
            sheet_name: "الدفتر المالي",
            title: "قسم الدفتر المالي",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "profit_distributions",
            sheet_name: "توزيع الأرباح",
            title: "قسم توزيع الأرباح",
            order_by: Some("date, time, id"),
        },
        ExportSection {
            table_name: "partner_profit_shares",
            sheet_name: "حصص الأرباح",
            title: "قسم حصص الأرباح",
            order_by: Some("distribution_id, partner_name"),
        },
        ExportSection {
            table_name: "users",
            sheet_name: "المستخدمون",
            title: "قسم المستخدمين",
            order_by: Some("id"),
        },
        ExportSection {
            table_name: "db_version",
            sheet_name: "إصدارات القاعدة",
            title: "قسم إصدارات قاعدة البيانات",
            order_by: Some("version"),
        },
    ]
}

fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table_name],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .map_err(|e| e.to_string())
}

fn table_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
    let pragma = format!("PRAGMA table_info({})", quote_identifier(table_name));
    let mut stmt = conn.prepare(&pragma).map_err(|e| e.to_string())?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(columns)
}

fn table_rows(
    conn: &Connection,
    table_name: &str,
    columns: &[String],
    order_by: Option<&str>,
) -> Result<Vec<Vec<ExcelValue>>, String> {
    if columns.is_empty() {
        return Ok(Vec::new());
    }

    let column_sql = columns
        .iter()
        .map(|column| quote_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let order_sql = order_by
        .map(|order| format!(" ORDER BY {order}"))
        .unwrap_or_default();
    let query = format!(
        "SELECT {column_sql} FROM {}{order_sql}",
        quote_identifier(table_name)
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut output = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut values = Vec::with_capacity(columns.len());
        for index in 0..columns.len() {
            let value = match row.get_ref(index).map_err(|e| e.to_string())? {
                ValueRef::Null => ExcelValue::Null,
                ValueRef::Integer(value) => ExcelValue::Integer(value),
                ValueRef::Real(value) => ExcelValue::Real(value),
                ValueRef::Text(value) => {
                    ExcelValue::Text(String::from_utf8_lossy(value).into_owned())
                }
                ValueRef::Blob(value) => ExcelValue::Blob(value.len()),
            };
            values.push(value);
        }
        output.push(values);
    }

    Ok(output)
}

fn write_excel_value(
    worksheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: &ExcelValue,
    text_format: &Format,
    integer_format: &Format,
    number_format: &Format,
) -> Result<(), String> {
    match value {
        ExcelValue::Null => worksheet
            .write_blank(row, col, text_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        ExcelValue::Integer(value) => worksheet
            .write_number_with_format(row, col, *value as f64, integer_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        ExcelValue::Real(value) => worksheet
            .write_number_with_format(row, col, *value, number_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        ExcelValue::Text(value) => worksheet
            .write_string_with_format(row, col, value, text_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        ExcelValue::Blob(size) => worksheet
            .write_string_with_format(row, col, format!("ملف مرفق ({size} بايت)"), text_format)
            .map(|_| ())
            .map_err(|e| e.to_string()),
    }
}

fn column_width(column: &str, rows: &[Vec<ExcelValue>], column_index: usize) -> f64 {
    let mut width = column.chars().count().max(10);
    for row in rows.iter().take(200) {
        let value_width = match row.get(column_index) {
            Some(ExcelValue::Text(value)) => value.chars().count(),
            Some(ExcelValue::Integer(value)) => value.to_string().len(),
            Some(ExcelValue::Real(value)) => format!("{value:.2}").len(),
            Some(ExcelValue::Blob(size)) => format!("ملف مرفق ({size} بايت)").chars().count(),
            _ => 0,
        };
        width = width.max(value_width);
    }
    (width as f64 + 4.0).clamp(12.0, 42.0)
}

#[allow(clippy::too_many_arguments)]
fn write_section_sheet(
    workbook: &mut Workbook,
    section: &ExportSection,
    columns: &[String],
    rows: &[Vec<ExcelValue>],
    exported_at: &str,
    title_format: &Format,
    meta_format: &Format,
    header_format: &Format,
    text_format: &Format,
    integer_format: &Format,
    number_format: &Format,
) -> Result<(), String> {
    let worksheet = workbook
        .add_worksheet()
        .set_name(section.sheet_name)
        .map_err(|e| e.to_string())?;
    worksheet.set_right_to_left(true);
    worksheet.set_freeze_panes(4, 0).map_err(|e| e.to_string())?;

    let last_col = columns.len().saturating_sub(1) as u16;
    worksheet
        .merge_range(0, 0, 0, last_col.max(1), section.title, title_format)
        .map_err(|e| e.to_string())?;
    let meta_text = format!(
        "شركة فجر الوادي | تاريخ التصدير: {exported_at} | عدد السجلات: {}",
        rows.len()
    );
    worksheet
        .merge_range(1, 0, 1, last_col.max(1), &meta_text, meta_format)
        .map_err(|e| e.to_string())?;
    worksheet
        .set_row_height(0, 26)
        .map_err(|e| e.to_string())?;
    worksheet
        .set_row_height(1, 21)
        .map_err(|e| e.to_string())?;

    if columns.is_empty() {
        worksheet
            .write_string_with_format(3, 0, "لا توجد أعمدة في هذا القسم", text_format)
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    for (index, column) in columns.iter().enumerate() {
        let col = index as u16;
        worksheet
            .write_string_with_format(3, col, column, header_format)
            .map_err(|e| e.to_string())?;
        worksheet
            .set_column_width(col, column_width(column, rows, index))
            .map_err(|e| e.to_string())?;
    }

    for (row_index, values) in rows.iter().enumerate() {
        let excel_row = row_index as u32 + 4;
        for (column_index, value) in values.iter().enumerate() {
            write_excel_value(
                worksheet,
                excel_row,
                column_index as u16,
                value,
                text_format,
                integer_format,
                number_format,
            )?;
        }
    }

    let last_data_row = if rows.is_empty() {
        4
    } else {
        rows.len() as u32 + 3
    };
    worksheet
        .autofilter(3, 0, last_data_row, last_col)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn export_database_to_excel(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let exported_at: String = db
        .query_row(
            "SELECT strftime('%Y-%m-%d %H:%M', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let file_date: String = db
        .query_row("SELECT strftime('%d-%m-%Y', 'now', 'localtime')", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    let output_path = state.app_dir.join(format!("{file_date}.xlsx"));
    let mut workbook = Workbook::new();
    let title_format = Format::new()
        .set_bold()
        .set_font_size(16)
        .set_font_color("FFFFFF")
        .set_background_color("2D2417")
        .set_align(FormatAlign::Center)
        .set_reading_direction(2);
    let meta_format = Format::new()
        .set_font_color("6B4A1D")
        .set_background_color("F7F2E8")
        .set_align(FormatAlign::Center)
        .set_reading_direction(2);
    let header_format = Format::new()
        .set_bold()
        .set_font_color("FFFFFF")
        .set_background_color("B88746")
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_reading_direction(2);
    let text_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Right)
        .set_reading_direction(2);
    let integer_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0")
        .set_align(FormatAlign::Center);
    let number_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0.00")
        .set_align(FormatAlign::Center);

    for section in export_sections() {
        if !table_exists(&db, section.table_name)? {
            continue;
        }

        let columns = table_columns(&db, section.table_name)?;
        let rows = table_rows(&db, section.table_name, &columns, section.order_by)?;
        write_section_sheet(
            &mut workbook,
            &section,
            &columns,
            &rows,
            &exported_at,
            &title_format,
            &meta_format,
            &header_format,
            &text_format,
            &integer_format,
            &number_format,
        )?;
    }

    workbook
        .save(&output_path)
        .map_err(|e| format!("فشل إنشاء ملف Excel: {e}"))?;

    Ok(output_path.to_string_lossy().into_owned())
}

fn find_backup_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    
    #[cfg(target_os = "windows")]
    {
        for letter in b'D'..=b'Z' {
            let path_str = format!("{}:\\FajrAlwadiBackups", letter as char);
            let path = PathBuf::from(path_str);
            if path.is_dir() {
                dirs.push(path);
            }
        }
    }
    
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let search_roots = if cfg!(target_os = "macos") {
            vec!["/Volumes"]
        } else {
            vec!["/media", "/run/media"]
        };
        
        for root in search_roots {
            if let Ok(entries) = std::fs::read_dir(root) {
                for entry in entries.flatten() {
                    let backup_dir = entry.path().join("FajrAlwadiBackups");
                    if backup_dir.is_dir() {
                        dirs.push(backup_dir);
                    }
                }
            }
        }
    }
    
    dirs
}

fn perform_hourly_backup(db_path: &std::path::Path) -> Result<(), String> {
    let backup_dirs = find_backup_dirs();
    if backup_dirs.is_empty() {
        return Ok(());
    }

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let timestamp: String = conn
        .query_row("SELECT strftime('%Y%m%d%H%M%S', 'now', 'localtime')", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    for backup_dir in backup_dirs {
        let backup_path = backup_dir.join(format!("fjr_alwadi_{}.db", timestamp));
        for _ in 0..3 {
            if std::fs::copy(db_path, &backup_path).is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
    
    Ok(())
}

fn run_backup_loop(db_path: PathBuf) {
    // Wait 5 minutes before the first backup after program startup
    std::thread::sleep(std::time::Duration::from_secs(300));
    
    loop {
        let _ = perform_hourly_backup(&db_path);
        // Sleep for 1 hour
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
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

            let db_path_clone = db_path.clone();
            std::thread::spawn(move || {
                run_backup_loop(db_path_clone);
            });

            app.manage(AppState {
                db: Mutex::new(conn),
                app_dir,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_car,
            sell_car_with_accounting,
            update_sold_car_with_accounting,
            save_and_sell_car_with_accounting,
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
            open_whatsapp,
            rename_background,
            delete_background,
            get_backgrounds,
            login,
            get_users,
            add_user,
            update_user,
            change_password,
            delete_user,
            export_database_to_excel,
            settle_company_through_funder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
