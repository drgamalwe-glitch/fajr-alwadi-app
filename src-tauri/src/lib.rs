use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::Local;
use rand_core::RngCore;
use rusqlite::{params, types::ValueRef, Connection, Result as SqlResult};
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::{Decimal, RoundingStrategy};
use rust_decimal_macros::dec;
use rust_xlsxwriter::{Format, FormatAlign, FormatBorder, Workbook, Worksheet};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{Manager, State};

const MAX_FINANCIAL_AMOUNT: Decimal = dec!(1_000_000_000_000);
const MONEY_EPSILON: Money = Money(dec!(0.01));
const MONEY_STRICT_EPSILON: Money = Money(dec!(0.001));
const SELECTED_BACKGROUND_FILE: &str = "selected-background.json";
static SPLIT_COUNTER: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn open_temp_pdf(path: String) -> Result<(), String> {
    let candidate = PathBuf::from(path);
    let canonical_file = candidate
        .canonicalize()
        .map_err(|e| format!("تعذر الوصول إلى ملف PDF: {e}"))?;
    let canonical_temp = env::temp_dir()
        .canonicalize()
        .map_err(|e| format!("تعذر معرفة مجلد الملفات المؤقتة: {e}"))?;

    if !canonical_file.starts_with(&canonical_temp) {
        return Err("لا يمكن فتح ملف خارج مجلد الملفات المؤقتة".to_string());
    }

    let is_pdf = canonical_file
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);

    if !is_pdf {
        return Err("نوع الملف غير مسموح للطباعة".to_string());
    }

    open::that(&canonical_file).map_err(|e| format!("تعذر فتح ملف PDF: {e}"))
}

fn split_partner_amount_50(amount: Decimal) -> (Decimal, Decimal) {
    let half = (amount / dec!(2)).round_dp_with_strategy(0, RoundingStrategy::ToZero);
    let remainder = amount - (half * dec!(2));
    if remainder.is_zero() {
        return (half, half);
    }
    if SPLIT_COUNTER
        .fetch_add(1, Ordering::Relaxed)
        .is_multiple_of(2)
    {
        (half + remainder, half)
    } else {
        (half, half + remainder)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Money(pub Decimal);

impl Money {
    pub fn zero() -> Self {
        Money(Decimal::ZERO)
    }
    pub fn from_i64(v: i64) -> Self {
        Money(Decimal::from(v))
    }
    pub fn from_usize(v: usize) -> Self {
        Money(Decimal::from(v as u64))
    }
    pub fn is_zero(&self) -> bool {
        self.0.is_zero()
    }
    pub fn is_positive(&self) -> bool {
        self.0.is_sign_positive() && !self.0.is_zero()
    }
    pub fn is_negative(&self) -> bool {
        self.0.is_sign_negative()
    }
    pub fn abs(&self) -> Self {
        Money(self.0.abs())
    }
    pub fn min(self, other: Self) -> Self {
        Money(self.0.min(other.0))
    }
    pub fn max(self, other: Self) -> Self {
        Money(self.0.max(other.0))
    }
    pub fn trunc(&self) -> Self {
        Money(self.0.trunc())
    }
    pub fn floor(&self) -> Self {
        Money(self.0.floor())
    }
    pub fn round_dp(&self, dp: u32) -> Self {
        Money(self.0.round_dp(dp))
    }
}
impl std::fmt::Display for Money {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}
impl Serialize for Money {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        if s.is_human_readable() {
            s.serialize_str(&self.0.normalize().to_string())
        } else {
            let mut state = s.serialize_struct("Money", 1)?;
            state.serialize_field("value", &self.0.normalize().to_string())?;
            state.end()
        }
    }
}
impl<'de> Deserialize<'de> for Money {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct MoneyVisitor;
        impl<'de> serde::de::Visitor<'de> for MoneyVisitor {
            type Value = Money;
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a monetary amount as a decimal string or integer")
            }
            fn visit_str<E: serde::de::Error>(self, value: &str) -> Result<Money, E> {
                value
                    .parse::<Decimal>()
                    .map(Money)
                    .map_err(serde::de::Error::custom)
            }
            fn visit_i64<E: serde::de::Error>(self, value: i64) -> Result<Money, E> {
                Ok(Money(Decimal::from(value)))
            }
            fn visit_u64<E: serde::de::Error>(self, value: u64) -> Result<Money, E> {
                Ok(Money(Decimal::from(value)))
            }
            fn visit_f64<E: serde::de::Error>(self, _value: f64) -> Result<Money, E> {
                Err(serde::de::Error::custom(
                    "monetary values must be serialized as strings or integers, not floats",
                ))
            }
        }
        if d.is_human_readable() {
            d.deserialize_any(MoneyVisitor)
        } else {
            d.deserialize_struct("Money", &["value"], MoneyVisitor)
        }
    }
}
impl std::ops::Add for Money {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Money(self.0 + rhs.0)
    }
}
impl std::ops::Sub for Money {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Money(self.0 - rhs.0)
    }
}
impl std::ops::Mul for Money {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        Money(self.0 * rhs.0)
    }
}
impl std::ops::Div for Money {
    type Output = Self;
    fn div(self, rhs: Self) -> Self {
        if rhs.is_zero() {
            Money::zero()
        } else {
            Money(self.0 / rhs.0)
        }
    }
}
impl std::ops::AddAssign for Money {
    fn add_assign(&mut self, rhs: Self) {
        self.0 += rhs.0;
    }
}
impl std::ops::SubAssign for Money {
    fn sub_assign(&mut self, rhs: Self) {
        self.0 -= rhs.0;
    }
}
impl rusqlite::types::FromSql for Money {
    fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
        match value {
            rusqlite::types::ValueRef::Real(f) => Decimal::from_f64(f)
                .map(Money)
                .ok_or(rusqlite::types::FromSqlError::InvalidType),
            rusqlite::types::ValueRef::Integer(i) => Ok(Money(Decimal::from(i))),
            rusqlite::types::ValueRef::Text(s) => {
                let str_val = std::str::from_utf8(s)
                    .map_err(|_| rusqlite::types::FromSqlError::InvalidType)?;
                str_val
                    .parse::<Decimal>()
                    .map(Money)
                    .map_err(|_| rusqlite::types::FromSqlError::InvalidType)
            }
            _ => Err(rusqlite::types::FromSqlError::InvalidType),
        }
    }
}
impl std::ops::Neg for Money {
    type Output = Self;
    fn neg(self) -> Self {
        Money(-self.0)
    }
}
impl std::str::FromStr for Money {
    type Err = rust_decimal::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Money(s.parse::<Decimal>()?))
    }
}
impl std::iter::Sum for Money {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        Money(iter.map(|m| m.0).sum())
    }
}
impl rusqlite::types::ToSql for Money {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        Ok(rusqlite::types::ToSqlOutput::Owned(
            rusqlite::types::Value::Text(self.0.to_string()),
        ))
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CarPartner {
    pub car_number: String,
    pub partner_name: String,
    pub amount: Money,
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
    pub purchase_price: Money,
    pub currency: Option<String>,
    pub sale_currency: Option<String>,
    pub selling_price: Money,
    pub status: String,
    pub payment_type: Option<String>,
    pub cash_price: Option<Money>,
    pub amount_paid: Option<Money>,
    pub amount_remaining: Option<Money>,
    pub installment_months: Option<i32>,
    pub monthly_payment: Option<Money>,
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
    pub commission_value: Option<Money>,
    pub car_partners: Option<Vec<CarPartner>>,
    pub expenses_sum: Option<Money>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Partner {
    pub partner_name: String,
    pub phone: String,
    pub total_amount: Money,
    pub kind: String,
    pub total_withdrawals: Money,
    pub iqd_balance: Money,
    pub usd_balance: Money,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UnifiedAccount {
    pub partner_name: String,
    pub phone: Option<String>,
    pub iqd_balance: Money,
    pub usd_balance: Money,
    pub kind: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PartnerTransaction {
    pub id: i64,
    pub partner_name: String,
    pub kind: String,
    pub type_: String,
    pub amount: Money,
    pub date: String,
    pub notes: Option<String>,
    pub currency: Option<String>,
    pub payment_type: Option<String>,
    pub time: Option<String>,
    pub source_type: Option<String>,
    pub source_id: Option<String>,
    pub source_role: Option<String>,
    pub affects_qasa: i32,
    pub affects_partner_cash: i32,
    pub affects_profit: i32,
    pub related_source_type: Option<String>,
    pub related_source_id: Option<String>,
    pub original_amount: Option<Money>,
    pub current_amount: Option<Money>,
    pub actual_paid_amount: Option<Money>,
    pub paid_event_id: Option<i64>,
    pub due_date: Option<String>,
    pub ledger_batch_id: Option<String>,
    pub is_reversed: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CustomerInstallment {
    pub id: i64,
    pub customer_id: String,
    pub sale_id: String,
    pub due_date: String,
    pub currency: String,
    pub original_amount: Money,
    pub current_amount: Money,
    pub actual_paid_amount: Option<Money>,
    pub status: String,
    pub paid_event_id: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InstallmentPreviewRow {
    pub installment_id: i64,
    pub due_date: String,
    pub old_amount: Money,
    pub new_amount: Money,
    pub currency: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InstallmentPaymentPreview {
    pub installment_id: i64,
    pub current_amount: Money,
    pub actual_paid_amount: Money,
    pub difference_amount: Money,
    pub affected_count: usize,
    pub redistribution_direction: String,
    pub preview_installments: Vec<InstallmentPreviewRow>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExpenseEntry {
    pub id: i64,
    pub description: String,
    pub amount: Money,
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
    pub amount: Money,
    pub date: String,
    pub currency: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct CashRegisterEntry {
    pub id: i64,
    pub date: String,
    pub time: String,
    pub type_: String,
    pub amount: Money,
    pub description: String,
    pub notes: Option<String>,
    pub balance: Money,
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
    pub amount_usd: Money,
    pub amount_iqd: Money,
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
    pub amount: Money,
    pub currency: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct FinancialSummary {
    pub cash_iqd: Money,
    pub cash_usd: Money,
    pub qasa_iqd: Money,
    pub qasa_usd: Money,
    pub inventory_value_iqd: Money,
    pub inventory_value_usd: Money,
    pub total_investments_iqd: Money,
    pub total_investments_usd: Money,
    pub total_partner_capital_iqd: Money,
    pub total_partner_capital_usd: Money,
    pub total_debtors_iqd: Money,
    pub total_debtors_usd: Money,
    pub total_expenses_iqd: Money,
    pub total_expenses_usd: Money,
    pub deferred_revenue_iqd: Money,
    pub deferred_revenue_usd: Money,
    pub deferred_expense_iqd: Money,
    pub deferred_expense_usd: Money,
    pub net_capital_iqd: Money,
    pub net_capital_usd: Money,
    pub monthly_profits_iqd: Money,
    pub monthly_profits_usd: Money,
}

#[derive(Serialize, Debug, Clone)]
pub struct PartnerDistributionInfo {
    pub partner_name: String,
    pub profit_iqd: Money,
    pub profit_usd: Money,
    pub drawings_iqd: Money,
    pub drawings_usd: Money,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProfitDistributionSummary {
    pub undistributed_iqd: Money,
    pub undistributed_usd: Money,
    pub partners: Vec<PartnerDistributionInfo>,
    pub expenses_iqd: Money,
    pub expenses_usd: Money,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PartnerProfitShareInput {
    pub partner_name: String,
    pub profit_share: Money,
    pub drawings_deducted: Money,
    pub amount_reinvested: Money,
    pub amount_paid: Money,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProfitDistribution {
    pub id: i64,
    pub date: String,
    pub time: String,
    pub total_profit: Money,
    pub currency: String,
    pub notes: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct PartnerProfitShare {
    pub id: i64,
    pub distribution_id: i64,
    pub partner_name: String,
    pub profit_share: Money,
    pub drawings_deducted: Money,
    pub amount_reinvested: Money,
    pub amount_paid: Money,
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

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn sqlite_column_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn sqlite_default_clause(default_value: &str) -> String {
    let value = default_value.trim();
    let needs_parentheses = value.contains('(')
        && value.contains(')')
        && !(value.starts_with('(') && value.ends_with(')'));
    if needs_parentheses {
        format!("({value})")
    } else {
        value.to_string()
    }
}

fn migrate_money_columns_to_text(
    conn: &Connection,
    table_name: &str,
    money_columns: &[&str],
) -> SqlResult<()> {
    let mut info_stmt = conn.prepare(&format!("PRAGMA table_info({})", quote_ident(table_name)))?;
    let columns = info_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i32>(5)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(info_stmt);

    if columns.is_empty() {
        return Ok(());
    }

    let money_set: std::collections::HashSet<&str> = money_columns.iter().copied().collect();
    let needs_migration = columns.iter().any(|(name, col_type, _, _, _)| {
        money_set.contains(name.as_str()) && !col_type.eq_ignore_ascii_case("TEXT")
    });
    if !needs_migration {
        return Ok(());
    }

    let tmp_table = format!("__{}_money_text_migration", table_name);
    conn.execute(
        &format!("DROP TABLE IF EXISTS {}", quote_ident(&tmp_table)),
        [],
    )?;

    let pk_columns: Vec<(i32, String)> = columns
        .iter()
        .filter_map(|(name, _, _, _, pk)| {
            if *pk > 0 {
                Some((*pk, name.clone()))
            } else {
                None
            }
        })
        .collect();
    let single_pk = pk_columns.len() == 1;

    let mut defs = Vec::new();
    for (name, col_type, not_null, default_value, pk) in &columns {
        let mut col_def = quote_ident(name).to_string();
        let target_type = if money_set.contains(name.as_str()) || col_type.trim().is_empty() {
            "TEXT".to_string()
        } else {
            col_type.clone()
        };
        col_def.push(' ');
        col_def.push_str(&target_type);
        if single_pk && *pk > 0 {
            col_def.push_str(" PRIMARY KEY");
            if name == "id" && target_type.eq_ignore_ascii_case("INTEGER") {
                col_def.push_str(" AUTOINCREMENT");
            }
        }
        if *not_null != 0 {
            col_def.push_str(" NOT NULL");
        }
        if let Some(default_value) = default_value {
            col_def.push_str(" DEFAULT ");
            if money_set.contains(name.as_str()) {
                col_def.push_str(&sqlite_column_literal(
                    default_value.trim_matches('\'').trim_matches('"'),
                ));
            } else {
                col_def.push_str(&sqlite_default_clause(default_value));
            }
        }
        defs.push(col_def);
    }

    if pk_columns.len() > 1 {
        let mut ordered = pk_columns;
        ordered.sort_by_key(|(order, _)| *order);
        defs.push(format!(
            "PRIMARY KEY ({})",
            ordered
                .iter()
                .map(|(_, name)| quote_ident(name))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    conn.execute(
        &format!(
            "CREATE TABLE {} ({})",
            quote_ident(&tmp_table),
            defs.join(", ")
        ),
        [],
    )?;

    let column_names: Vec<String> = columns
        .iter()
        .map(|(name, _, _, _, _)| name.clone())
        .collect();
    let select_exprs: Vec<String> = column_names
        .iter()
        .map(|name| {
            if money_set.contains(name.as_str()) {
                format!(
                    "CASE WHEN {0} IS NULL THEN NULL ELSE CAST({0} AS TEXT) END",
                    quote_ident(name)
                )
            } else {
                quote_ident(name)
            }
        })
        .collect();

    conn.execute(
        &format!(
            "INSERT INTO {} ({}) SELECT {} FROM {}",
            quote_ident(&tmp_table),
            column_names
                .iter()
                .map(|name| quote_ident(name))
                .collect::<Vec<_>>()
                .join(", "),
            select_exprs.join(", "),
            quote_ident(table_name)
        ),
        [],
    )?;
    conn.execute(&format!("DROP TABLE {}", quote_ident(table_name)), [])?;
    conn.execute(
        &format!(
            "ALTER TABLE {} RENAME TO {}",
            quote_ident(&tmp_table),
            quote_ident(table_name)
        ),
        [],
    )?;
    Ok(())
}

fn migrate_all_money_columns_to_text(conn: &Connection) -> SqlResult<()> {
    let tables: &[(&str, &[&str])] = &[
        (
            "cars",
            &[
                "purchase_price",
                "selling_price",
                "cash_price",
                "amount_paid",
                "amount_remaining",
                "monthly_payment",
                "commission_value",
                "expenses_at_sale",
            ],
        ),
        ("partners", &["total_amount", "iqd_balance", "usd_balance"]),
        ("partner_transactions", &["amount"]),
        ("cash_register", &["amount"]),
        ("expenses", &["amount"]),
        ("car_partners", &["amount"]),
        ("car_expenses", &["amount"]),
        ("agency_transactions", &["amount"]),
        ("agencies", &["amount_usd", "amount_iqd"]),
        ("financial_ledger", &["debit", "credit"]),
        (
            "partner_profit_shares",
            &[
                "profit_share",
                "drawings_deducted",
                "amount_reinvested",
                "amount_paid",
            ],
        ),
        ("profit_distributions", &["total_profit"]),
    ];
    for (table, columns) in tables {
        migrate_money_columns_to_text(conn, table, columns)?;
    }
    Ok(())
}

fn ensure_installment_event_schema(conn: &Connection) -> SqlResult<()> {
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN original_amount TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN current_amount TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN actual_paid_amount TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN paid_event_id INTEGER",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN due_date TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN ledger_batch_id TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN is_reversed INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE financial_ledger ADD COLUMN ledger_batch_id TEXT",
        [],
    );
    let _ = conn.execute("ALTER TABLE audit_log ADD COLUMN ledger_batch_id TEXT", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS customer_installment_payment_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_uuid TEXT NOT NULL UNIQUE,
            customer_id TEXT NOT NULL,
            sale_id TEXT NOT NULL,
            installment_id INTEGER NOT NULL,
            currency TEXT NOT NULL,
            scheduled_amount_at_payment_time TEXT NOT NULL,
            actual_paid_amount TEXT NOT NULL,
            difference_amount TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            ledger_batch_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            reversed_at TEXT,
            reversed_by_event_id INTEGER,
            notes TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_installment_events_installment
         ON customer_installment_payment_events(installment_id, status)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_installment_events_sale
         ON customer_installment_payment_events(sale_id, currency, status, created_at, id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_partner_transactions_installment_batch
         ON partner_transactions(ledger_batch_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_financial_ledger_batch
         ON financial_ledger(ledger_batch_id)",
        [],
    )?;
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_installment_one_active_event
         ON customer_installment_payment_events(installment_id)
         WHERE status = 'active'",
        [],
    )?;

    conn.execute(
        "UPDATE partner_transactions
         SET original_amount = COALESCE(original_amount, amount),
             current_amount = COALESCE(current_amount, amount),
             due_date = COALESCE(due_date, date),
             is_reversed = COALESCE(is_reversed, 0)
         WHERE source_type = 'customer_installment_schedule'
           AND source_role = 'installment_schedule'",
        [],
    )?;

    Ok(())
}

fn require_admin_session(conn: &Connection) -> Result<(), String> {
    let row: Result<(bool, bool), rusqlite::Error> = conn.query_row(
        "SELECT COUNT(*) > 0, COALESCE(must_change_password, 0) FROM users WHERE username = 'admin'",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );
    match row {
        Ok((exists, must_change)) => {
            if !exists {
                return Err("Session invalid: admin account not found".to_string());
            }
            if must_change {
                return Err("يجب تغيير كلمة المرور الافتراضية قبل استخدام النظام".to_string());
            }
            Ok(())
        }
        Err(_) => Err("Session invalid: admin account not found".to_string()),
    }
}

fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch("BEGIN IMMEDIATE")?;
    let init_result: SqlResult<()> = (|| {
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
            purchase_price TEXT DEFAULT '0',
            currency TEXT DEFAULT 'IQD',
            sale_currency TEXT DEFAULT 'IQD',
            selling_price TEXT DEFAULT '0',
            status TEXT NOT NULL,
            payment_type TEXT,
            cash_price TEXT,
            amount_paid TEXT,
            amount_remaining TEXT,
            installment_months INTEGER,
            monthly_payment TEXT
        )",
            [],
        )?;

        // إضافة الأعمدة الجديدة إذا كانت الجداول موجودة مسبقاً
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN chassis_number TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_plate_num TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_model TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN car_year TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN payment_type TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN cash_price TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN amount_paid TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN amount_remaining TEXT", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN installment_months INTEGER", []);
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN monthly_payment TEXT", []);
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
            total_amount TEXT DEFAULT '0',
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
            amount TEXT NOT NULL,
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
            amount TEXT NOT NULL,
            description TEXT,
            notes TEXT
        )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount TEXT NOT NULL,
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
        let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_value TEXT", []);
        let _ = conn.execute("ALTER TABLE expenses ADD COLUMN car_number TEXT", []);

        conn.execute(
            "CREATE TABLE IF NOT EXISTS car_partners (
            car_number TEXT NOT NULL,
            partner_name TEXT NOT NULL,
            amount TEXT NOT NULL,
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
            amount TEXT NOT NULL,
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
            amount_usd TEXT NOT NULL DEFAULT '0',
            amount_iqd TEXT NOT NULL DEFAULT '0',
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
            amount TEXT NOT NULL,
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

        conn.execute(
            "CREATE TABLE IF NOT EXISTS financial_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            account_type TEXT NOT NULL,
            account_id TEXT,
            debit TEXT NOT NULL,
            credit TEXT NOT NULL,
            currency TEXT NOT NULL,
            reference_type TEXT NOT NULL,
            reference_id TEXT NOT NULL,
            type_ TEXT NOT NULL,
            description TEXT NOT NULL,
            notes TEXT
        )",
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
                total_amount TEXT DEFAULT '0',
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
            let _ = conn.execute("ALTER TABLE cars ADD COLUMN commission_value TEXT", []);
            let _ = conn.execute("ALTER TABLE expenses ADD COLUMN car_number TEXT", []);
            let _ = conn.execute(
                "CREATE TABLE IF NOT EXISTS car_partners (
                car_number TEXT NOT NULL,
                partner_name TEXT NOT NULL,
                amount TEXT NOT NULL,
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
                amount TEXT NOT NULL,
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
        }

        // Ensure financial_ledger table exists before any migration that touches it
        conn.execute(
            "CREATE TABLE IF NOT EXISTS financial_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            account_type TEXT NOT NULL,
            account_id TEXT,
            debit TEXT NOT NULL,
            credit TEXT NOT NULL,
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
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN source_type TEXT",
                [],
            );
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN source_id TEXT",
                [],
            );
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN source_role TEXT",
                [],
            );
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN affects_qasa INTEGER DEFAULT 1",
                [],
            );
            let _ = conn.execute(
            "ALTER TABLE partner_transactions ADD COLUMN affects_partner_cash INTEGER DEFAULT 1",
            [],
        );
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN affects_profit INTEGER DEFAULT 0",
                [],
            );

            // Unique index for source deduplication (version 0)
            let _ = conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind, COALESCE(related_source_id, ''))
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
            // Delete Cr receivable entries that belong to partner cash_movement rows (type_ = 'ايداع مقدمة سيارة').
            let _ = conn.execute(
                "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND account_type = 'receivable'
               AND type_ = 'ايداع مقدمة سيارة'
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
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN related_source_type TEXT",
                [],
            );
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN related_source_id TEXT",
                [],
            );
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
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN related_source_type TEXT",
                [],
            );
            let _ = conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN related_source_id TEXT",
                [],
            );

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

        // Version 13: Fix partner transaction flags for profit recognition vs cash movement
        // Ensure ايداع بيع سيارة (car sale cash movement) has correct flags
        // Ensure ايداع ارباح سيارة (profit recognition) does not affect partner cash
        if version < 13 {
            // Fix cash sale deposit rows: ايداع بيع سيارة should affect qasa/cash only, not profit
            let _ = conn.execute(
                "UPDATE partner_transactions
             SET affects_qasa = 1,
                 affects_partner_cash = 1,
                 affects_profit = 0,
                 source_type = COALESCE(source_type, 'car_sale'),
                 source_role = 'cash_movement'
             WHERE kind = 'شريك'
               AND type = 'ايداع بيع سيارة'",
                [],
            );

            // Fix profit recognition rows: ايداع ارباح سيارة must NOT affect qasa/cash
            let _ = conn.execute(
                "UPDATE partner_transactions
             SET affects_qasa = 0,
                 affects_partner_cash = 0,
                 affects_profit = 1,
                 source_type = COALESCE(source_type, 'car_sale'),
                 source_role = 'profit_recognition'
             WHERE kind = 'شريك'
               AND type = 'ايداع ارباح سيارة'",
                [],
            );

            // Also fix agency profit rows (ايداع ارباح وكالة) — not a cash movement
            let _ = conn.execute(
                "UPDATE partner_transactions
             SET affects_qasa = 0,
                 affects_partner_cash = 0,
                 affects_profit = 1,
                 source_role = 'profit_recognition'
             WHERE kind = 'شريك'
               AND type IN ('ايداع ارباح وكالة', 'ارباح وكالة')",
                [],
            );

            // Recalculate all partners to reflect corrected balances
            if let Ok(mut partners_stmt) = conn.prepare("SELECT partner_name, kind FROM partners") {
                if let Ok(rows) = partners_stmt.query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                }) {
                    for (p_name, p_kind) in rows.flatten() {
                        let _ = recalculate_partner_total(conn, &p_name, &p_kind);
                    }
                }
            }

            let _ = conn.execute("INSERT INTO db_version (version) VALUES (13)", []);
        }

        if version < 14 {
            // Migration 14: Legacy cleanup for duplicate customer-payment profit rows.
            // Version 21 rebuilds explicit non-cash profit_recognition rows required by Instructions.md.

            // First, delete ledger entries for the profit rows we're about to remove
            let profit_ids: Vec<i64> = conn.prepare(
            "SELECT id FROM partner_transactions WHERE source_type = 'customer_payment' AND source_role = 'profit_recognition' AND kind = 'شريك'"
        ).map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string())))?
        .query_map([], |row| row.get(0))
        .map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string())))?
        .collect::<Result<Vec<i64>, _>>()
        .unwrap_or_default();

            for pid in &profit_ids {
                let _ = conn.execute(
                    "DELETE FROM financial_ledger WHERE reference_type = 'partner_transaction' AND reference_id = ?1",
                    [pid],
                );
            }

            // Delete the hidden profit_recognition rows through the centralized ledger-safe path.
            let _ = delete_partner_transactions_by_source_with_ledger_for_role(
                conn,
                "customer_payment",
                "profit_recognition",
                Some("شريك"),
            );

            // Recalculate all partners to reflect corrected balances
            if let Ok(mut partners_stmt) = conn.prepare("SELECT partner_name, kind FROM partners") {
                if let Ok(rows) = partners_stmt.query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                }) {
                    for (p_name, p_kind) in rows.flatten() {
                        let _ = recalculate_partner_total(conn, &p_name, &p_kind);
                    }
                }
            }

            let _ = conn.execute("INSERT INTO db_version (version) VALUES (14)", []);
        }

        // Version 15: Normalize currencies and include currency in unique index for dual-currency support
        if version < 15 {
            let _ = conn.execute(
            "UPDATE partner_transactions SET currency = 'IQD' WHERE currency IS NULL OR TRIM(currency) = ''",
            [],
        );
            let _ = conn.execute("DROP INDEX IF EXISTS idx_partner_tx_source_unique", []);
            let _ = conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind, currency)
             WHERE source_type IS NOT NULL
               AND source_id IS NOT NULL
               AND source_role IS NOT NULL
               AND source_type != ''
               AND source_id != ''
               AND source_role != ''",
            [],
        );
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (15)", []);
        }

        // Version 16: Clean up old wrong partner split rows for investor repayments.
        // Previously, investor withdrawals incorrectly created partner cash rows with
        // source_type IN ('investor_payment', 'investor_transaction') AND source_role = 'partner_cash_payment'.
        // These rows must be removed so investor transactions affect Qasa only.
        if version < 16 {
            // Delete financial_ledger entries for the wrong partner rows
            let _ = conn.execute(
                "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND CAST(reference_id AS INTEGER) IN (
                 SELECT id FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_role = 'partner_cash_payment'
                   AND source_type IN ('investor_payment', 'investor_transaction')
               )",
                [],
            );
            // Delete the wrong partner rows themselves
            let _ = conn.execute(
                "DELETE FROM partner_transactions
             WHERE kind = 'شريك'
               AND source_role = 'partner_cash_payment'
               AND source_type IN ('investor_payment', 'investor_transaction')",
                [],
            );
            // Recalculate all partner balances after cleanup
            let _ = recalculate_all_partners(conn);
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (16)", []);
        }

        // Version 17: Rebuild unique index with related_source_id
        if version < 17 {
            let _ = conn.execute("DROP INDEX IF EXISTS idx_partner_tx_source_unique", []);
            let _ = conn.execute(
            "CREATE UNIQUE INDEX idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind, COALESCE(related_source_id, ''))
             WHERE source_type IS NOT NULL
               AND source_id IS NOT NULL
               AND source_role IS NOT NULL
               AND source_type != ''
               AND source_id != ''
               AND source_role != ''",
            [],
        );
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (17)", []);
        }

        // Version 18: Add expenses_at_sale column for frozen profit calculation
        if version < 18 {
            let _ = conn.execute(
                "ALTER TABLE cars ADD COLUMN expenses_at_sale TEXT DEFAULT '0'",
                [],
            );
            let _ = conn.execute(
            "UPDATE cars SET expenses_at_sale = (
                SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_expenses.car_number = cars.car_number
            ) WHERE status = 'مبيوعة'",
            [],
        );
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (18)", []);
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
            debit TEXT NOT NULL,
            credit TEXT NOT NULL,
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
            total_profit TEXT NOT NULL,
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
            profit_share TEXT NOT NULL,
            drawings_deducted TEXT NOT NULL,
            amount_reinvested TEXT NOT NULL,
            amount_paid TEXT NOT NULL,
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
            must_change_password INTEGER NOT NULL DEFAULT 0,
            last_login TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M', 'now', 'localtime'))
        )",
            [],
        )?;

        // إضافة عمود must_change_password للجداول الموجودة مسبقاً
        let _ = conn.execute(
            "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = conn.execute("ALTER TABLE users ADD COLUMN last_login TEXT", []);

        // إنشاء المستخدم الافتراضي admin/admin إذا لم يكن موجوداً
        if let Ok(count) = conn.query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM users WHERE username = 'admin'",
            [],
            |row| row.get(0),
        ) {
            if count == 0 {
                let hash = hash_password("admin").unwrap_or_default();
                conn.execute(
                "INSERT INTO users (username, password_hash, display_name, profile_image, must_change_password) VALUES (?1, ?2, 'مدير النظام', NULL, 0)",
                params!["admin", hash],
            )?;
            }
        }
        // تعطيل شرط تغيير كلمة المرور الافتراضية للمستخدم admin
        let _ = conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        );

        // إنشاء حسابات الشركاء الافتراضية
        conn.execute(
        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES ('أمير', '07808425228', '0', 'شريك')",
        [],
    )?;
        conn.execute(
        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES ('منتصر', '07812541714', '0', 'شريك')",
        [],
    )?;

        if version < 19 {
            // ترحيل وهجرة بيانات طرق الشراء وحسابات الشركاء القديمة — مرة واحدة فقط.
            let _ = conn.execute(
                "UPDATE cars SET purchase_type = 'تمويل' WHERE purchase_type = 'دين'",
                [],
            );
            let _ = conn.execute(
            "UPDATE cars SET purchase_type = 'كاش' WHERE purchase_type IN ('شراكه', 'شراكة', 'موجود')",
            [],
        );
            let _ = conn.execute("DELETE FROM car_partners WHERE car_number IN (SELECT car_number FROM cars WHERE purchase_type = 'كاش')", []);
            let _ = conn.execute(
            "DELETE FROM car_partners WHERE kind = 'شريك' AND partner_name NOT IN ('أمير', 'منتصر')",
            [],
        );
            let _ = conn.execute(
            "DELETE FROM partners WHERE kind = 'شريك' AND partner_name NOT IN ('أمير', 'منتصر')",
            [],
        );
            let _ = conn.execute("DELETE FROM partner_transactions WHERE kind = 'شريك' AND partner_name NOT IN ('أمير', 'منتصر')", []);
            let _ = conn.execute(
                "DELETE FROM partner_profit_shares WHERE partner_name NOT IN ('أمير', 'منتصر')",
                [],
            );
            let _ = conn.execute("DELETE FROM financial_ledger WHERE account_type = 'capital' AND account_id NOT IN ('أمير', 'منتصر')", []);
            let _ = conn.execute(
                "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions)",
                [],
            );

            migrate_existing_data_to_ledger(conn)?;
            ensure_sales_cogs_entries(conn)?;

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
                "ALTER TABLE partners ADD COLUMN iqd_balance TEXT DEFAULT '0'",
                [],
            );
            let _ = conn.execute(
                "ALTER TABLE partners ADD COLUMN usd_balance TEXT DEFAULT '0'",
                [],
            );

            let _ = recalculate_all_partners(conn);

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

            let _ = conn.execute(
            "UPDATE partner_transactions SET type = 'استلام تمويل شراء سيارة', source_role = 'financing_liability', affects_qasa = 0, affects_partner_cash = 0, affects_profit = 0
             WHERE kind = 'ممول' AND source_type = 'car_purchase' AND type LIKE 'سحب%'",
            [],
        );
            let _ = conn.execute(
            "UPDATE partner_transactions SET type = 'استلام شراء سيارة', source_role = 'company_purchase_liability', affects_qasa = 0, affects_partner_cash = 0, affects_profit = 0
             WHERE kind = 'شركة' AND source_type = 'car_purchase' AND type LIKE 'سحب%'",
            [],
        );
            let _ = conn.execute(
            "UPDATE partner_transactions SET notes = replace(notes, 'سحب شراء سيارة', 'استلام تمويل شراء سيارة')
             WHERE kind = 'ممول' AND source_type = 'car_purchase' AND notes LIKE 'سحب شراء سيارة%'",
            [],
        );
            let _ = conn.execute(
            "UPDATE partner_transactions SET notes = replace(notes, 'سحب شراء سيارة', 'استلام شراء سيارة')
             WHERE kind = 'شركة' AND source_type = 'car_purchase' AND notes LIKE 'سحب شراء سيارة%'",
            [],
        );
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (19)", []);
        }

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
            field_name TEXT,
            old_value TEXT,
            new_value TEXT,
            description TEXT,
            notes TEXT
        )",
            [],
        )?;
        let _ = conn.execute("ALTER TABLE audit_log ADD COLUMN field_name TEXT", []);
        let _ = conn.execute("ALTER TABLE audit_log ADD COLUMN old_value TEXT", []);
        let _ = conn.execute("ALTER TABLE audit_log ADD COLUMN new_value TEXT", []);
        ensure_installment_event_schema(conn)?;

        if version < 20 {
            migrate_all_money_columns_to_text(conn)?;
            let _ = conn.execute("DROP INDEX IF EXISTS idx_partner_tx_source_unique", []);
            let _ = conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind, COALESCE(related_source_id, ''))
             WHERE source_type IS NOT NULL
               AND source_id IS NOT NULL
               AND source_role IS NOT NULL
               AND source_type != ''
               AND source_id != ''
               AND source_role != ''",
            [],
        );
            let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner ON partner_transactions(partner_name, kind)",
            [],
        );
            let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id)",
            [],
        );
            let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id)",
            [],
        );
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (20)", []);
        }

        if version < 21 {
            // Rebuild explicit installment-payment profit rows after the legacy analytical-profit detour.
            // Each customer payment keeps one cash movement and one non-cash profit recognition effect.
            let _ = conn.execute(
                "DELETE FROM financial_ledger
                 WHERE reference_type = 'partner_transaction'
                   AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions)",
                [],
            );
            let _ = recalculate_all_partners(conn);
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (21)", []);
        }

        if version < 22 {
            // Agency profit rows used to affect Qasa/Cash and Profit in one row.
            // Split them into the same two effects used everywhere else:
            // cash_movement for Qasa/Cash, profit_recognition for distribution only.
            let _ = conn.execute("DROP INDEX IF EXISTS idx_partner_tx_source_unique", []);
            let _ = conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
                 ON partner_transactions(source_type, source_id, source_role, partner_name, kind, currency, COALESCE(related_source_id, ''))
                 WHERE source_type IS NOT NULL
                   AND source_id IS NOT NULL
                   AND source_role IS NOT NULL
                   AND source_type != ''
                   AND source_id != ''
                   AND source_role != ''",
                [],
            );
            let _ = conn.execute(
                "INSERT OR IGNORE INTO partner_transactions (
                    partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                    source_type, source_id, source_role,
                    affects_qasa, affects_partner_cash, affects_profit,
                    related_source_type, related_source_id
                 )
                 SELECT
                    partner_name, kind, type, amount, date, COALESCE(time, '00:00'), notes,
                    COALESCE(currency, 'IQD'), COALESCE(payment_type, 'قاصه'),
                    source_type, source_id, 'cash_movement',
                    1, 1, 0,
                    COALESCE(related_source_type, ''), COALESCE(related_source_id, '')
                 FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type IN ('agency', 'agency_transaction')
                   AND source_role = 'agency_profit'",
                [],
            );
            let _ = conn.execute(
                "UPDATE partner_transactions
                 SET source_role = 'profit_recognition',
                     affects_qasa = 0,
                     affects_partner_cash = 0,
                     affects_profit = 1
                 WHERE kind = 'شريك'
                   AND source_type IN ('agency', 'agency_transaction')
                   AND source_role = 'agency_profit'",
                [],
            );
            let _ = recalculate_all_partners(conn);
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (22)", []);
        }

        // Version 23: Delete all profit_recognition rows (profit calculated analytically now)
        if version < 23 {
            let _ = conn.execute(
                "DELETE FROM financial_ledger
                 WHERE reference_type = 'partner_transaction'
                   AND reference_id IN (
                     SELECT CAST(id AS TEXT) FROM partner_transactions
                     WHERE source_role = 'profit_recognition' AND kind = 'شريك'
                   )",
                [],
            );
            let _ = conn.execute(
                "DELETE FROM transaction_splits
                 WHERE transaction_id IN (
                   SELECT id FROM partner_transactions
                   WHERE source_role = 'profit_recognition' AND kind = 'شريك'
                 )",
                [],
            );
            let _ = conn.execute(
                "DELETE FROM partner_transactions
                 WHERE source_role = 'profit_recognition' AND kind = 'شريك'",
                [],
            );
            let _ = recalculate_all_partners(conn);
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (23)", []);
        }

        // Version 24: Rename installment-payment cash movements without touching down payments.
        if version < 24 {
            let _ = conn.execute(
                "UPDATE partner_transactions
                 SET type = 'ايداع قسط سيارة'
                 WHERE id IN (
                   SELECT cash.id
                   FROM partner_transactions cash
                   JOIN partner_transactions pay
                     ON CAST(pay.id AS TEXT) = cash.source_id
                   WHERE cash.kind = 'شريك'
                     AND cash.source_type = 'customer_payment'
                     AND cash.source_role = 'cash_movement'
                     AND cash.type = 'ايداع مقدمة سيارة'
                     AND pay.kind = 'زبون'
                     AND (pay.type LIKE '%قسط%' OR COALESCE(pay.notes, '') LIKE '%قسط#%')
                 )",
                [],
            );
            let _ = conn.execute(
                "UPDATE financial_ledger
                 SET type_ = 'ايداع قسط سيارة'
                 WHERE reference_type = 'partner_transaction'
                   AND reference_id IN (
                     SELECT CAST(id AS TEXT)
                     FROM partner_transactions
                     WHERE kind = 'شريك'
                       AND source_type = 'customer_payment'
                       AND source_role = 'cash_movement'
                       AND type = 'ايداع قسط سيارة'
                   )",
                [],
            );
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (24)", []);
        }

        // Version 25: Restore explicit customer-payment profit rows for installments/down payments.
        if version < 25 {
            let _ = rebuild_customer_payment_profit_recognitions(conn);
            let _ = recalculate_all_partners(conn);
            let _ = conn.execute("INSERT INTO db_version (version) VALUES (25)", []);
        }

        Ok(())
    })();

    match init_result {
        Ok(()) => {
            conn.execute_batch("COMMIT")?;
            Ok(())
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(err)
        }
    }
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

// ============================================================
// CENTRAL VALIDATION HELPERS
// ============================================================

fn validate_required_text(value: &str, field_name: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{} مطلوب ولا يمكن أن يكون فارغاً", field_name));
    }
    Ok(())
}

fn normalize_phone_digits(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter_map(|ch| match ch {
            '\u{0660}'..='\u{0669}' => char::from_digit(ch as u32 - 0x0660, 10),
            '\u{06f0}'..='\u{06f9}' => char::from_digit(ch as u32 - 0x06f0, 10),
            '\u{200e}' | '\u{200f}' | '\u{202a}' | '\u{202b}' | '\u{202c}' | '\u{202d}'
            | '\u{202e}' | '\u{2066}' | '\u{2067}' | '\u{2068}' | '\u{2069}'
            | '\u{feff}' => None,
            _ => Some(ch),
        })
        .collect()
}

fn validate_finite_amount(value: Money, field_name: &str) -> Result<(), String> {
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

fn validate_positive_amount(value: Money, field_name: &str) -> Result<(), String> {
    validate_finite_amount(value, field_name)?;
    if value <= Money::zero() {
        return Err(format!("{} يجب أن يكون أكبر من صفر", field_name));
    }
    Ok(())
}

fn validate_non_negative_amount(value: Money, field_name: &str) -> Result<(), String> {
    validate_finite_amount(value, field_name)?;
    if value < Money::zero() {
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

fn validate_ledger_amounts(debit: Money, credit: Money) -> Result<(), String> {
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

fn validate_sale_amounts(
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

fn validate_profit_cap_for_car(_db: &Connection, _car_number: &str) -> Result<(), String> {
    // No-op: profit_recognition rows removed entirely
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
            if type_ == "ايداع ارباح سيارة" || type_ == "ايداع ارباح وكالة"
            {
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
    debit: Money,
    credit: Money,
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
             WHERE reference_type = ?1 AND reference_id = ?2
               AND type_ NOT LIKE 'عكس:%'
               AND type_ NOT LIKE 'عكس: %'"
        )
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map([reference_type.trim(), reference_id.trim()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Money>(4)?,
                row.get::<_, Money>(5)?,
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
        let already_reversed: bool = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM financial_ledger
                    WHERE reference_type = ?1 AND reference_id = ?2
                      AND account_type = ?3
                      AND COALESCE(account_id, '') = COALESCE(?4, '')
                      AND debit = ?5 AND credit = ?6
                      AND currency = ?7
                      AND type_ = ?8
                )",
                params![
                    reference_type,
                    reference_id,
                    account_type,
                    account_id.as_deref(),
                    rev_debit,
                    rev_credit,
                    currency,
                    rev_type
                ],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if already_reversed {
            continue;
        }

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

fn new_ledger_token(prefix: &str) -> String {
    let mut bytes = [0u8; 16];
    rand_core::OsRng.fill_bytes(&mut bytes);
    format!("{}_{}", prefix, hex::encode(bytes))
}

fn set_ledger_batch_for_partner_transaction(
    conn: &Connection,
    tx_id: i64,
    ledger_batch_id: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE partner_transactions SET ledger_batch_id = ?1 WHERE id = ?2",
        params![ledger_batch_id, tx_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE financial_ledger
         SET ledger_batch_id = ?1
         WHERE reference_type = 'partner_transaction' AND reference_id = ?2",
        params![ledger_batch_id, tx_id.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn set_customer_payment_batch(
    conn: &Connection,
    payment_tx_id: i64,
    ledger_batch_id: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE partner_transactions
         SET ledger_batch_id = ?1
         WHERE id = ?2
            OR (source_type = 'customer_payment' AND source_id = ?3)",
        params![ledger_batch_id, payment_tx_id, payment_tx_id.to_string()],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id FROM partner_transactions
             WHERE id = ?1
                OR (source_type = 'customer_payment' AND source_id = ?2)",
        )
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map(params![payment_tx_id, payment_tx_id.to_string()], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for id in ids {
        conn.execute(
            "UPDATE financial_ledger
             SET ledger_batch_id = ?1
             WHERE reference_type = 'partner_transaction' AND reference_id = ?2",
            params![ledger_batch_id, id.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn reverse_ledger_batch_entries(
    conn: &Connection,
    original_batch_id: &str,
    reversal_batch_id: &str,
) -> Result<(), String> {
    let existing_reversal_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM financial_ledger WHERE ledger_batch_id = ?1",
            [reversal_batch_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if existing_reversal_count > 0 {
        return Ok(());
    }

    let mut stmt = conn
        .prepare(
            "SELECT date, time, account_type, account_id, debit, credit, currency,
                    reference_type, reference_id, type_, description, notes
             FROM financial_ledger
             WHERE ledger_batch_id = ?1
               AND type_ NOT LIKE 'عكس:%'
               AND type_ NOT LIKE 'عكس: %'
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([original_batch_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Money>(4)?,
                row.get::<_, Money>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, Option<String>>(11)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for (
        date,
        time,
        account_type,
        account_id,
        debit,
        credit,
        currency,
        reference_type,
        reference_id,
        type_,
        description,
        notes,
    ) in entries
    {
        conn.execute(
            "INSERT INTO financial_ledger (
                date, time, account_type, account_id, debit, credit, currency,
                reference_type, reference_id, type_, description, notes, ledger_batch_id
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                date,
                time,
                account_type,
                account_id.as_deref(),
                credit,
                debit,
                currency,
                reference_type,
                reference_id,
                format!("عكس: {}", type_),
                format!("عكس: {}", description),
                notes.as_deref(),
                reversal_batch_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn mark_partner_batch_reversed(conn: &Connection, ledger_batch_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE partner_transactions
         SET is_reversed = 1,
             affects_qasa = 0,
             affects_partner_cash = 0,
             affects_profit = 0,
             notes = CASE
                 WHEN notes IS NULL OR notes = '' THEN 'ملغاة ضمن عكس دفعة قسط'
                 WHEN notes LIKE '%ملغاة ضمن عكس دفعة قسط%' THEN notes
                 ELSE notes || ' | ملغاة ضمن عكس دفعة قسط'
             END
         WHERE ledger_batch_id = ?1",
        [ledger_batch_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_ledger_entries(
    conn: &Connection,
    reference_type: &str,
    reference_id: &str,
) -> Result<(), String> {
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
        let query_rows = stmt
            .query_map(params![source_type, source_id, role], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in query_rows.flatten() {
            rows.push(row);
        }
    } else {
        let query_rows = stmt
            .query_map(params![source_type, source_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in query_rows.flatten() {
            rows.push(row);
        }
    }
    drop(stmt);

    let mut partners_to_recalc: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();
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

/// Central helper: delete generated partner rows by source_type/source_role when the
/// source_id intentionally varies across many original records.
fn delete_partner_transactions_by_source_with_ledger_for_role(
    db: &Connection,
    source_type: &str,
    source_role: &str,
    kind: Option<&str>,
) -> Result<(), String> {
    let sql = match kind {
        Some(_) => {
            "SELECT id, partner_name, kind FROM partner_transactions
             WHERE source_type = ?1 AND source_role = ?2 AND kind = ?3"
        }
        None => {
            "SELECT id, partner_name, kind FROM partner_transactions
             WHERE source_type = ?1 AND source_role = ?2"
        }
    };
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;

    let rows = if let Some(kind) = kind {
        stmt.query_map(params![source_type, source_role, kind], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect::<Vec<_>>()
    } else {
        stmt.query_map(params![source_type, source_role], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect::<Vec<_>>()
    };
    drop(stmt);

    let mut partners_to_recalc: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();
    for (id, partner_name, kind) in rows {
        delete_ledger_entries(db, "partner_transaction", &id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        partners_to_recalc.insert((partner_name, kind));
    }

    for (partner_name, kind) in partners_to_recalc {
        recalculate_partner_total(db, &partner_name, &kind)?;
    }

    Ok(())
}

/// Removes 50/50 partner deposit entries created for a customer payment (e.g. تسديد قسط).
fn delete_customer_payment_partner_splits(
    db: &Connection,
    payment_tx_id: i64,
) -> Result<(), String> {
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

fn delete_customer_payment_profit_splits(
    db: &Connection,
    payment_tx_id: i64,
) -> Result<(), String> {
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
    let tx_info: Result<(String, String, String, Money, String, Option<String>, Option<String>, String, String, i32, i32, i32, String, String), rusqlite::Error> = conn.query_row(
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

    let (
        p_name,
        kind,
        tx_type,
        amount,
        tx_date,
        notes_opt,
        curr_opt,
        payment_type,
        tx_time,
        affects_qasa,
        affects_partner_cash,
        _affects_profit,
        source_type,
        source_role,
    ) = match tx_info {
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
        let source_id_val: i64 = conn
            .query_row(
                "SELECT CAST(source_id AS INTEGER) FROM partner_transactions WHERE id = ?1",
                [tx_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let customer_name: String = if source_id_val > 0 {
            conn.query_row(
                "SELECT partner_name FROM partner_transactions WHERE id = ?1 AND kind = 'زبون'",
                [source_id_val],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| p_name.clone())
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
            Money::zero(),
            &curr,
            "partner_transaction",
            &ref_id,
            &tx_type,
            &format!("إيداع دفعة زبون: {}", customer_name),
            Some(&notes),
        )
        .map_err(|e| e.to_string())?;

        return Ok(());
    }

    // Issue 1: Handle customer_payment profit_recognition rows (kind="شريك", source_type="customer_payment", source_role="profit_recognition")
    // Recognize deferred revenue: Dr deferred_revenue, Cr revenue
    if kind == "شريك" && source_type == "customer_payment" && source_role == "profit_recognition"
    {
        if amount > Money::zero() {
            record_ledger_entry(
                conn,
                &tx_date,
                &tx_time,
                "deferred_revenue",
                Some(&p_name),
                amount,
                Money::zero(),
                &curr,
                "partner_transaction",
                &ref_id,
                "إيراد مؤجل",
                &format!("تخفيض الإيراد المؤجل - دفعة زبون: {}", p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
            record_ledger_entry(
                conn,
                &tx_date,
                &tx_time,
                "revenue",
                Some(&p_name),
                Money::zero(),
                amount,
                &curr,
                "partner_transaction",
                &ref_id,
                "إيراد مكتسب",
                &format!("إثبات الإيراد المكتسب - دفعة زبون: {}", p_name),
                Some(&notes),
            )
            .map_err(|e| e.to_string())?;
        }
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
                    Money::zero(),
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
                Money::zero(),
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
                Money::zero(),
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
                Money::zero(),
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

    // Agency rows are projection rows for Qasa/Cash and Profit Distribution.
    // The agency/agency_transaction ledger functions own the real cash/revenue entries.
    if kind == "شريك"
        && (source_type == "agency" || source_type == "agency_transaction")
        && matches!(source_role.as_str(), "cash_movement" | "profit_recognition")
    {
        return Ok(());
    }

    // Legacy agency_profit rows are also projection rows. Version 22 splits them, but this keeps
    // older databases from writing duplicate cash/capital ledger entries before migration finishes.
    if (source_type == "agency" || source_type == "agency_transaction")
        && source_role == "agency_profit"
        && should_create_cash_entry
    {
        return Ok(());
    }

    let has_dedicated_ledger = matches!(
        source_type.as_str(),
        "car_purchase" | "car_sale" | "car_expense" | "expense" | "profit_distribution"
    );
    let is_non_cash_schedule_or_transfer = tx_type.starts_with("باقي")
        || tx_type.starts_with("تحويل")
        || (!should_create_cash_entry && source_role != "profit_recognition");
    if has_dedicated_ledger || is_non_cash_schedule_or_transfer {
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
                Money::zero(),
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
                    Money::zero(),
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
                    Money::zero(),
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
                    Money::zero(),
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
                    Money::zero(),
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
                    Money::zero(),
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
                    Money::zero(),
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
                    Money::zero(),
                    &curr,
                    "partner_transaction",
                    &ref_id,
                    "سحب مستثمر اموال",
                    &format!("سحب أموال المستثمر {}", p_name),
                    Some(&notes),
                )
                .map_err(|e| e.to_string())?;
                if should_create_cash_entry {
                    record_ledger_entry(
                        conn,
                        &tx_date,
                        &tx_time,
                        "cash",
                        Some(&payment_type),
                        Money::zero(),
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
        }
        "ممول" => {
            if is_deposit {
                record_ledger_entry(
                    conn,
                    &tx_date,
                    &tx_time,
                    "funder",
                    Some(&p_name),
                    Money::zero(),
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
                    Money::zero(),
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
                        Money::zero(),
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
                    Money::zero(),
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
                    Money::zero(),
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
                        Money::zero(),
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

    let agency_info: Result<(String, String, Money, Money, String, String), rusqlite::Error> = conn.query_row(
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

    if amount_usd > Money::zero() {
        record_ledger_entry(
            conn,
            &date,
            &time,
            "cash",
            Some("قاصه"),
            amount_usd,
            Money::zero(),
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
            Money::zero(),
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

    if amount_iqd > Money::zero() {
        record_ledger_entry(
            conn,
            &date,
            &time,
            "cash",
            Some("قاصه"),
            amount_iqd,
            Money::zero(),
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
            Money::zero(),
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

    let tx_info: Result<(i64, String, String, String, Money, Option<String>, Option<String>), rusqlite::Error> = conn.query_row(
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
            Money::zero(),
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
            Money::zero(),
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
            Money::zero(),
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
            Money::zero(),
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

    let today = Local::now().format("%Y-%m-%d").to_string();
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
            row.get::<_, Money>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, Money>(9)?,
            row.get::<_, Option<String>>(10)?,
            row.get::<_, Option<String>>(11)?,
            row.get::<_, Option<Money>>(12)?,
            row.get::<_, Option<Money>>(13)?,
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

        if purchase_price > Money::zero() {
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
            let _amount_remaining = amount_remaining_opt.unwrap_or(Money::zero());

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
                if amount_paid > Money::zero() {
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

            let mut exp_amount_sum = Money::zero();
            let mut exp_rows = car_expenses_stmt.query([&car_number])?;
            while let Some(r) = exp_rows.next()? {
                exp_amount_sum += r.get::<_, Money>(0)?;
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
            row.get::<_, Money>(3)?,
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
            row.get::<_, Money>(2)?,
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
            row.get::<_, Money>(4)?,
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
            || tx_type == "ايداع وكالة"
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
            row.get::<_, Money>(3)?,
            row.get::<_, Money>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
        ))
    })?;
    for ag in ag_rows {
        let (id, old_name, new_name, amount_usd, amount_iqd, ag_date, ag_time) = ag?;

        if amount_usd > Money::zero() {
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

        if amount_iqd > Money::zero() {
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
            row.get::<_, Money>(5)?,
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

    let car_info: Result<(String, Money, String, String, Option<String>, String, String), rusqlite::Error> = db.query_row(
        "SELECT car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(purchase_type, 'كاش'), financer_name,
                COALESCE(purchase_date, ''), COALESCE(purchase_time, '00:00')
         FROM cars WHERE car_number = ?1",
        [car_number],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
    );

    let (
        car_name,
        purchase_price,
        currency,
        purchase_type,
        financer_name_opt,
        purchase_date,
        purchase_time,
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

    if purchase_price > Money::zero() {
        record_ledger_entry(
            db,
            &p_date,
            &p_time,
            "inventory",
            Some(car_number),
            purchase_price,
            Money::zero(),
            &currency,
            "car",
            car_number,
            "شراء سيارة",
            &format!("شراء سيارة: {} ({})", car_name, car_number),
            None,
        )
        .map_err(|e| e.to_string())?;

        if purchase_type == "تمويل" || purchase_type == "دين" {
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
                Money::zero(),
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
        } else if purchase_type == "شركة" {
            let f_name = financer_name_opt.unwrap_or_default().trim().to_string();
            let acc_id = if f_name.is_empty() {
                "شركة عامة".to_string()
            } else {
                f_name
            };
            record_ledger_entry(
                db,
                &p_date,
                &p_time,
                "payable",
                Some(&acc_id),
                Money::zero(),
                purchase_price,
                &currency,
                "car",
                car_number,
                "شراء سيارة عن طريق شركة",
                &format!(
                    "شراء سيارة: {} ({}) عن طريق شركة {}",
                    car_name, car_number, acc_id
                ),
                None,
            )
            .map_err(|e| e.to_string())?;
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
                Money::zero(),
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

    Ok(())
}

#[allow(clippy::type_complexity)]
fn record_car_sale_ledger_entries(db: &Connection, car_number: &str) -> Result<(), String> {
    let car_number = car_number.trim();

    let car_info: Result<(String, Money, String, String, String, Money, String, Option<String>, Option<Money>, Option<Money>, String, String, Option<String>), rusqlite::Error> = db.query_row(
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

    let (
        car_name,
        purchase_price,
        currency,
        sale_currency,
        sale_date,
        selling_price,
        status,
        payment_type_opt,
        amount_paid_opt,
        amount_remaining_opt,
        sale_time,
        _purchase_date,
        buyer_name_opt,
    ) = match car_info {
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
    let _amount_remaining = amount_remaining_opt.unwrap_or(Money::zero());

    let expenses_sum: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());
    let total_cogs = purchase_price + expenses_sum;
    let _total_profit = selling_price - total_cogs;

    if payment_type == "كاش" {
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "revenue",
            Some(car_number),
            Money::zero(),
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
        )?;

        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "cash",
            Some("قاصه"),
            selling_price,
            Money::zero(),
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
            Money::zero(),
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
            Money::zero(),
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

    if total_cogs > Money::zero() {
        record_ledger_entry(
            db,
            &s_date,
            &s_time,
            "expense",
            Some(car_number),
            total_cogs,
            Money::zero(),
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
        Money::zero(),
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
    purchase_type: Option<String>,
    financer_name: Option<String>,
    commission_type: Option<String>,
    commission_value: Option<Money>,
    car_partners: Option<Vec<CarPartner>>,
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
    require_admin_session(&db)?;

    let buyer_phone = buyer_phone.map(|phone| normalize_phone_digits(&phone));
    let car_number = num.trim().to_string();
    let old_num = old_num.unwrap_or_default();
    let old_num = old_num.trim();

    // الاستعلام عن وقت الشراء ووقت البيع الحاليين لحفظهما قبل حذف أو استبدال السجل، وكذلك الاسم ورقم الشاصي والشركاء القديمين للتحديث
    let query_num = if !old_num.is_empty() {
        old_num
    } else {
        car_number.as_str()
    };
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
             FROM cars WHERE car_number = ?1",
            [query_num],
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
        if should_rebuild_sale_ledger && !effective_skip_sale {
            delete_car_sale_ledger_entries(&db, car_number.as_str())?;
        }
    }
    // New car: no existing ledger to delete

    // Preserve existing car_plate_num if not provided, or use car_number for new cars
    let plate_num = existing_plate_num
        .map(|s| {
            if s.trim().is_empty() {
                car_number.clone()
            } else {
                s
            }
        })
        .unwrap_or_else(|| car_number.clone());

    // INSERT with main fields — use ON CONFLICT to avoid silently overwriting columns not in the INSERT list
    db.execute(
        "INSERT INTO cars (car_number, car_plate_num, chassis_number, car_model, car_year, car_name, color, details, purchase_price, currency, sale_currency, selling_price, status, payment_type, cash_price, amount_paid, amount_remaining, installment_months, monthly_payment, purchase_payment_type, purchase_type, financer_name, commission_type, commission_value)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)
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
            commission_value=excluded.commission_value",
        params![
            car_number.as_str(),
            plate_num.as_str(),
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

    // Insert car_partners if provided
    if let Some(ref partners) = car_partners {
        for p in partners {
            if p.amount > Money::zero() {
                let p_kind = p.kind.as_deref().unwrap_or("شريك");
                let currency = p.currency.as_str();
                db.execute(
                    "INSERT INTO car_partners (car_number, partner_name, amount, currency, kind) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![car_number.as_str(), p.partner_name.trim(), p.amount, currency, p_kind],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // Profit cap validation: block sold-cost changes that would make recognized profit exceed full profit
    if sold_cost_changed {
        validate_profit_cap_for_car(&db, &car_number)?;
    }

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
        )
        .map_err(|e| e.to_string())?;

        // Update sale rows by source_type/source_id
        db.execute(
            "UPDATE partner_transactions SET notes = ?1
             WHERE source_type = 'car_sale' AND source_id = ?2 AND source_role = 'cash_movement'",
            params![new_sale_note, car_number],
        )
        .map_err(|e| e.to_string())?;

        // Update profit rows by source_type/source_id
        db.execute(
            "UPDATE partner_transactions SET notes = ?1
             WHERE source_type = 'car_sale' AND source_id = ?2 AND source_role = 'profit_recognition'",
            params![new_profit_note, car_number],
        ).map_err(|e| e.to_string())?;

        // Update car number reference in customer payment notes if car_number changed
        if old_num != car_number {
            // NOTE: migrate_car_number_references already changed related_source_id from old_num to car_number
            // So we must use car_number (new) in the WHERE clause
            db.execute(
                "UPDATE partner_transactions SET notes = REPLACE(notes, ?1, ?2)
                 WHERE related_source_type = 'car' AND related_source_id = ?3",
                params![
                    format!("#بيع_سيارة_{}", old_num),
                    format!("#بيع_سيارة_{}", car_number),
                    car_number,
                ],
            )
            .map_err(|e| e.to_string())?;
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
        let expenses_sum: Money = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());
        let total_amount = purchase + expenses_sum;
        if let Some(f_name) = &financer_name {
            let f_name = f_name.trim();
            if !f_name.is_empty() {
                let note = format!("{} {} (شاصي: {})", p_type, name.trim(), chassis.trim())
                    .trim()
                    .replace("  ", " ");

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit)
                     VALUES (?1, ?2, ?3, ?4, ?5, strftime('%H:%M', 'now', 'localtime'), ?6, ?7, ?8, 'car_purchase', ?9, ?10, 0, 0, 0)",
                    params![
                        f_name,
                        p_kind,
                        p_type,
                        total_amount,
                        purchase_date.as_deref().unwrap_or(""),
                        note,
                        currency.as_deref().unwrap_or("IQD"),
                        purchase_payment_type.as_deref().unwrap_or("قاصه"),
                        car_number.as_str(),
                        role,
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

    if should_rebuild_sale_ledger && !effective_skip_sale {
        // Delete only car sale generated rows (not purchase rows)
        delete_generated_car_sale_partner_transactions(&db, &car_number)?;

        // Only delete and recreate customer sale-generated rows when actual sale terms changed.
        // For cost-only or car-number-only edits, preserve existing customer rows (down payment,
        // installment schedule, due-date) to avoid data loss — add_car does not recreate them.
        if sale_changed {
            let sale_gen_customer_ids: Vec<(i64, String)> = db
                .prepare("SELECT id, partner_name FROM partner_transactions WHERE kind = 'زبون' AND related_source_type = 'car' AND related_source_id = ?1 AND (source_type = 'customer_sale_payment' OR source_type = 'customer_installment_schedule')")
                .map_err(|e| e.to_string())?
                .query_map(params![car_number], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            let mut buyers_to_recalc_for_splits: std::collections::HashSet<String> =
                std::collections::HashSet::new();
            for (pid, buyer_name_str) in &sale_gen_customer_ids {
                delete_customer_payment_partner_splits(&db, *pid)?;
                delete_customer_payment_profit_splits(&db, *pid)?;
                delete_ledger_entries(&db, "partner_transaction", &pid.to_string())?;
                db.execute("DELETE FROM partner_transactions WHERE id = ?1", [pid])
                    .map_err(|e| e.to_string())?;
                buyers_to_recalc_for_splits.insert(buyer_name_str.clone());
            }
            for buyer_name_recalc in buyers_to_recalc_for_splits {
                recalculate_partner_total(&db, &buyer_name_recalc, "زبون")?;
            }

            // Legacy rows (source_type IS NULL) with notes LIKE — scope is narrow, only for migration completeness
            let legacy_ids: Vec<i64> = db
                .prepare("SELECT id FROM partner_transactions WHERE kind = 'زبون' AND related_source_type IS NULL AND source_type IS NULL AND notes LIKE ?1")
                .map_err(|e| e.to_string())?
                .query_map(params![format!("%#بيع_سيارة_{}%", car_number)], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for pid in legacy_ids {
                delete_customer_payment_partner_splits(&db, pid)?;
                delete_customer_payment_profit_splits(&db, pid)?;
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

        let expenses_sum_for_profit: Money = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
                [car_number.as_str()],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());
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
                if profit > Money::zero() {
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
        "UPDATE cars SET sale_time = strftime('%H:%M:%S', 'now', 'localtime') WHERE car_number = ?1 AND sale_date IS NOT NULL AND sale_date != '' AND (sale_time IS NULL OR sale_time = '' OR sale_time = '00:00')",
        [car_number.as_str()],
    )
    .map_err(|e| e.to_string())?;

    if should_rebuild_purchase {
        record_car_purchase_ledger_entries(&db, car_number.as_str())?;
    }
    if should_rebuild_sale_ledger && !effective_skip_sale {
        record_car_sale_ledger_entries(&db, car_number.as_str())?;
    }

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Add a partner if not exists (inside transaction).
fn ensure_partner_exists(
    tx: &rusqlite::Transaction,
    name: &str,
    phone: &str,
    kind: &str,
) -> Result<(), String> {
    let phone = normalize_phone_digits(phone);
    tx.execute(
        "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?1, ?2, 0.0, ?3)",
        params![name.trim(), phone.as_str(), kind.trim()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn resolve_existing_customer_phone(
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
fn sell_car_with_accounting(
    state: State<AppState>,
    car_number: String,
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
) -> Result<(), String> {
    // ============================================================
    // VALIDATION (before any write)
    // ============================================================
    validate_required_text(&car_number, "رقم السيارة")?;
    validate_required_text(&buyer_name, "اسم المشتري")?;
    validate_currency(&sale_currency)?;
    validate_required_text(&sale_date, "تاريخ البيع")?;

    // Sale amounts validation (Issue 6)
    if payment_type == "كاش" {
        validate_sale_amounts(selling_price, amount_paid, amount_remaining, &payment_type)?;
    } else {
        validate_non_negative_amount(selling_price, "سعر البيع")?;
        validate_non_negative_amount(amount_paid, "المقدمة المستلمة")?;
        validate_non_negative_amount(amount_remaining, "المبلغ المتبقي")?;
    }

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
    require_admin_session(&db)?;

    let car_exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM cars WHERE car_number = ?1)",
            [&car_number],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !car_exists {
        return Err(format!("السيارة رقم {} غير موجودة", car_number));
    }

    let car_label = db
        .query_row(
            "SELECT car_name FROM cars WHERE car_number = ?1",
            [&car_number],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "سيارة".to_string());

    let chassis_label = chassis_number.clone().unwrap_or_default();
    let clean_chassis = chassis_label.trim();
    let clean_buyer_phone = normalize_phone_digits(&buyer_phone);

    // Mixed currency check
    let purchase_currency: String = db
        .query_row(
            "SELECT COALESCE(currency, 'IQD') FROM cars WHERE car_number = ?1",
            [&car_number],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "IQD".to_string());

    if purchase_currency != sale_currency {
        return Err("لا يمكن بيع السيارة بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت".to_string());
    }

    // ============================================================
    // STEP 1: Check car exists, then update sale fields
    // ============================================================
    let existing_status: String = db
        .query_row(
            "SELECT status FROM cars WHERE car_number = ?1",
            [&car_number],
            |row| row.get(0),
        )
        .map_err(|_| format!("السيارة رقم {} غير موجودة", car_number))?;
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
        .unwrap_or_else(|_| "00:00".to_string());

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
         WHERE car_number = ?13",
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
                car_number,
            ],
        )
        .map_err(|e| e.to_string())?;
    if rows_affected == 0 {
        return Err(format!("السيارة رقم {} غير موجودة", car_number));
    }

    // Store total car expenses at sale time for accurate profit calculation
    db.execute(
        "UPDATE cars SET expenses_at_sale = (
            SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_expenses.car_number = ?1
        ) WHERE car_number = ?1",
        [&car_number],
    )
    .map_err(|e| e.to_string())?;

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
    )
    .map_err(|e| e.to_string())?;

    // ============================================================
    // STEP 3a: Installment/Due-date: Create customer account + payment + schedule
    // ============================================================
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";
    if is_installments_or_due {
        ensure_partner_exists(&db, &buyer_name, &clean_buyer_phone, "زبون")?;

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
                    related_source_type, related_source_id
                 )
                 VALUES (?1, 'زبون', 'مقدمة بيع سيارة', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_sale_payment', ?7, 'sale_down_payment', 1, 1, 0, 'car', ?8)",
                params![
                    buyer_name.trim(),
                    amount_paid,
                    sale_date,
                    &now_time,
                    &dp_notes,
                    sale_currency,
                    format!("{}:down_payment", car_number),
                    car_number,
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
            &car_number,
            "cash_movement",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
            Some("car"),
            Some(&car_number),
        )?;
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
        let expenses_sum: Money = exp_stmt
            .query_row([&car.car_number], |row| row.get(0))
            .unwrap_or(Money::zero());
        car.expenses_sum = Some(expenses_sum);

        cars_with_partners.push(car);
    }

    Ok(cars_with_partners)
}

#[tauri::command]
fn delete_car(
    state: State<AppState>,
    num: String,
    admin_name: Option<String>,
) -> Result<(), String> {
    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;
    let car_number = num.trim();

    let admin = admin_name.unwrap_or_else(|| "الإدارة".to_string());

    // Get car details before deleting it
    let (car_name, chassis_number, status): (String, Option<String>, String) = db
        .query_row(
            "SELECT car_name, chassis_number, status FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| format!("السيارة رقم {} غير موجودة", car_number))?;
    let chassis_str = chassis_number.unwrap_or_default();
    let clean_name = car_name.trim();
    let clean_chassis = chassis_str.trim();

    let has_partner_rows: bool = db
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM partner_transactions
                WHERE (source_type IN ('car_purchase', 'car_sale') AND source_id = ?1)
                   OR (related_source_type = 'car' AND related_source_id = ?1)
                   OR (source_type = 'car_expense' AND source_id IN (
                       SELECT CAST(id AS TEXT) FROM car_expenses WHERE car_number = ?1
                   ))
            )",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(false);
    let has_ledger_rows: bool = db
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM financial_ledger
                WHERE (reference_type = 'car' AND reference_id = ?1)
                   OR (reference_type = 'car_expense' AND reference_id IN (
                       SELECT CAST(id AS TEXT) FROM car_expenses WHERE car_number = ?1
                   ))
                   OR (reference_type = 'expense' AND reference_id IN (
                       SELECT CAST(id AS TEXT) FROM expenses WHERE car_number = ?1
                   ))
            )",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(false);
    let has_car_expenses: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM car_expenses WHERE car_number = ?1)",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(false);
    let has_linked_expenses: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM expenses WHERE car_number = ?1)",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if status == "مبيوعة"
        || has_partner_rows
        || has_ledger_rows
        || has_car_expenses
        || has_linked_expenses
    {
        return Err(format!(
            "لا يمكن حذف السيارة {} لأن لها تاريخ مالي مرتبط. استخدم التعديل أو قيود التسوية بدل حذف السجل المحاسبي.",
            car_number
        ));
    }

    // تسجيل عملية الحذف في سجل التدقيق (ليس في دفتر الأستاذ المالي)
    let deletion_desc = format!(
        "حذف سيارة {} {} بواسطة {}",
        clean_name, clean_chassis, admin
    );
    record_audit_event(
        &db,
        Some(&admin),
        "حذف سيارة",
        "car",
        car_number,
        &deletion_desc,
        Some(&format!("تم حذف السيارة {} ({})", clean_name, car_number)),
    )?;

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

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// update_sold_car_with_accounting: Atomic sold-car financial field edit.
/// Preserves manual customer payments, rebuilds only sale-generated rows.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
#[allow(clippy::type_complexity)]
fn update_sold_car_with_accounting(
    state: State<AppState>,
    car_number: String,
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
    require_admin_session(&db)?;

    // Load existing car data
    let old_car: Result<(String, Money, String, String, Money, String, Option<String>, Option<Money>, Option<Money>, Option<i32>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>), rusqlite::Error> = db.query_row(
        "SELECT car_name, purchase_price, COALESCE(currency, 'IQD'), COALESCE(sale_currency, 'IQD'),
                selling_price, status, payment_type, amount_paid, amount_remaining,
                installment_months, buyer_name, buyer_phone, sale_date, delivery_date, first_payment_date
         FROM cars WHERE car_number = ?1",
        [&car_number],
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

    let existing_down_payment_sum: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_source_id = ?1
               AND source_type = 'customer_sale_payment'
               AND source_role = 'sale_down_payment'
               AND COALESCE(is_reversed, 0) = 0",
            [&car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());

    // Calculate already-collected manual payments (non-sale-generated customer payments)
    let collected_manual: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
         WHERE kind = 'زبون'
           AND related_source_type = 'car' AND related_source_id = ?1
           AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'تسديد%')
           AND source_type IS DISTINCT FROM 'customer_sale_payment'
           AND source_type IS DISTINCT FROM 'customer_installment_schedule'",
            [&car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());

    let active_installment_payment_sum: Money = db
        .query_row(
            "SELECT COALESCE(SUM(actual_paid_amount), 0.0)
             FROM customer_installment_payment_events
             WHERE sale_id = ?1 AND status = 'active'",
            [&car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());

    let active_installment_payment_count: i64 = db
        .query_row(
            "SELECT COUNT(*)
             FROM customer_installment_payment_events
             WHERE sale_id = ?1 AND status = 'active'",
            [&car_number],
            |row| row.get(0),
        )
        .unwrap_or(0);

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

    // Validate that new selling_price >= already collected
    if selling_price < committed_customer_cash {
        return Err(format!(
            "لا يمكن تعديل سعر البيع إلى مبلغ أقل من المبالغ المستلمة (تم استلام {:.0})",
            committed_customer_cash
        ));
    }

    let chassis_label: String = db
        .query_row(
            "SELECT COALESCE(chassis_number, '') FROM cars WHERE car_number = ?1",
            [&car_number],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let clean_chassis = chassis_label.trim();
    let clean_buyer_phone = normalize_phone_digits(&buyer_phone);
    let now_time = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

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
            delivery_date = ?12, first_payment_date = ?13
         WHERE car_number = ?14",
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
            car_number,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ============================================================
    let mut buyers_to_recalc: std::collections::HashSet<String> = std::collections::HashSet::new();

    // STEP 2: Delete only sale-generated customer rows (preserve manual payments)
    // ============================================================
    if preserve_customer_schedule {
        ensure_partner_exists(&db, &buyer_name, &clean_buyer_phone, "زبون")?;
        db.execute(
            "UPDATE partner_transactions
             SET partner_name = ?1,
                 currency = ?2,
                 related_source_type = 'car',
                 related_source_id = ?3
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_source_id = ?3
               AND source_type IN ('customer_sale_payment', 'customer_installment_schedule')",
            params![buyer_name.trim(), &sale_currency, &car_number],
        )
        .map_err(|e| e.to_string())?;
        buyers_to_recalc.insert(buyer_name.trim().to_string());

        // Manage down payment transaction
        let dp_tx_id: Option<i64> = match db.query_row(
            "SELECT id FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_source_id = ?1
               AND source_type = 'customer_sale_payment'
               AND source_role = 'sale_down_payment'",
            [&car_number],
            |row| row.get(0)
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
                         date = ?3
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
                        related_source_type, related_source_id
                     )
                     VALUES (?1, 'زبون', 'مقدمة بيع سيارة', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                        'customer_sale_payment', ?7, 'sale_down_payment', 1, 1, 0, 'car', ?8)",
                    params![
                        buyer_name.trim(),
                        amount_paid,
                        sale_date,
                        &now_time,
                        &dp_notes,
                        sale_currency,
                        format!("{}:down_payment", car_number),
                        car_number,
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
            delete_ledger_entries(&db, "partner_transaction", &dp_id.to_string())?;
            db.execute("DELETE FROM partner_transactions WHERE id = ?1", [dp_id])
                .map_err(|e| e.to_string())?;
        }
    } else {
        // Delete sale-generated down payment and installment schedule rows
        let sale_gen_ids: Vec<(i64, String)> = {
            let mut stmt = db.prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car' AND related_source_id = ?1
               AND (source_type = 'customer_sale_payment' OR source_type = 'customer_installment_schedule')"
        ).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([&car_number], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            rows
        };

        for (cust_id, buyer_name_str) in &sale_gen_ids {
            delete_customer_payment_partner_splits(&db, *cust_id)?;
            delete_customer_payment_profit_splits(&db, *cust_id)?;
            delete_ledger_entries(&db, "partner_transaction", &cust_id.to_string())?;
            db.execute("DELETE FROM partner_transactions WHERE id = ?1", [cust_id])
                .map_err(|e| e.to_string())?;
            buyers_to_recalc.insert(buyer_name_str.clone());
        }
    }

    // Delete sale partner rows (source_type = 'car_sale')
    delete_generated_car_sale_partner_transactions(&db, &car_number)?;

    // Delete sale ledger entries (but preserve purchase entries)
    delete_car_sale_ledger_entries(&db, &car_number)?;

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
                    related_source_type, related_source_id
                 )
                 VALUES (?1, 'زبون', 'مقدمة بيع سيارة', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_sale_payment', ?7, 'sale_down_payment', 1, 1, 0, 'car', ?8)",
                params![
                    buyer_name.trim(),
                    amount_paid,
                    sale_date,
                    &now_time,
                    &dp_notes,
                    sale_currency,
                    format!("{}:down_payment", car_number),
                    car_number,
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
            &car_number,
            "cash_movement",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
            Some("car"),
            Some(&car_number),
        )?;
    }

    // ============================================================
    // STEP 5: Rebuild sale ledger entries
    // ============================================================
    record_car_sale_ledger_entries(&db, &car_number)?;
    rebuild_customer_payment_profit_recognitions_for_car(&db, &car_number)?;

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
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

    let car_number = num.trim().to_string();
    let clean_name = name.trim();
    let clean_chassis = chassis.trim();
    let clean_buyer_phone = resolve_existing_customer_phone(&db, &buyer_name, &buyer_phone);
    let now_time = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());
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
            first_payment_date, purchase_time, sale_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            car_number, car_number, clean_chassis,
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
        ],
    ).map_err(|e| e.to_string())?;

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
            &car_number,
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
                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'car_purchase', ?10, ?11, 0, 0, 0)",
                    params![f_name, p_kind, p_type, purchase, p_date, &purchase_time, &purchase_note, curr,
                        purchase_payment_type.as_deref().unwrap_or("قاصه"), car_number, role],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // ============================================================
    // STEP 3: Record purchase ledger entries
    // ============================================================
    record_car_purchase_ledger_entries(&db, &car_number)?;

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
                    source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                    related_source_type, related_source_id
                 )
                 VALUES (?1, 'زبون', 'مقدمة بيع سيارة', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                    'customer_sale_payment', ?7, 'sale_down_payment', 1, 1, 0, 'car', ?8)",
                params![
                    buyer_name.trim(),
                    amount_paid,
                    sale_date_str,
                    &now_time,
                    &dp_notes,
                    sale_curr,
                    format!("{}:down_payment", car_number),
                    car_number,
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
                    split_remaining_evenly(amount_remaining, months);

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
                let due_notes = format!(
                    "باقي مجموع قسط على {} رقم الشاصي {}",
                    buyer_name.trim(),
                    clean_chassis
                );

                db.execute(
                    "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id)
                     VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, 'قاصه',
                        'customer_installment_schedule', ?7, 'installment_schedule', 0, 0, 0, 'car', ?8)",
                    params![buyer_name.trim(), amount_remaining, due_date, &now_time, &due_notes, sale_curr,
                        format!("{}:installment:1", car_number), car_number],
                ).map_err(|e| e.to_string())?;
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
            &car_number,
            "cash_movement",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
            Some("car"),
            Some(&car_number),
        )?;
    }

    // ============================================================
    // STEP 7: Record sale ledger entries
    // ============================================================
    record_car_sale_ledger_entries(&db, &car_number)?;

    // ============================================================
    // STEP 8: Recalculate and commit
    // ============================================================
    if is_installments_or_due {
        recalculate_partner_total(&db, buyer_name.trim(), "زبون")?;
    }
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
    require_admin_session(&db)?;
    let name = name.trim();
    let phone = normalize_phone_digits(&phone);
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
            (phone.as_str(), name, kind),
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
            (name, phone.as_str(), kind),
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
                    COALESCE((SELECT SUM(amount) FROM partner_transactions WHERE partner_name = p.partner_name AND kind = p.kind AND type LIKE 'سحب%'), '0') AS total_withdrawals,
                    COALESCE(p.iqd_balance, '0'),
                    COALESCE(p.usd_balance, '0')
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
            // Customer: balance = sum of unpaid remaining rows only
            // Paid rows (واصل, تسديد, etc) never create negative balance
            let iqd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'زبون' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'باقي%' OR type LIKE 'سحب%') AND type NOT LIKE 'تحويل%'",
                    params![name],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let usd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'زبون' AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'باقي%' OR type LIKE 'سحب%') AND type NOT LIKE 'تحويل%'",
                    params![name],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
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
                        row.get::<_, Money>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                })
                .map_err(|e| e.to_string())?;

            let mut iqd_balance = Money::zero();
            let mut usd_balance = Money::zero();

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
    require_admin_session(&db)?;

    // Bug Q: Block deleting customer only when customer-account logic still shows debt.
    // Some legacy receivable ledger rows can remain after all installments are marked "واصل".
    // In that case the account is settled and deletion should clean those stale receivable rows.
    if kind == "زبون" {
        let customer_remaining: Money = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1
                   AND kind = 'زبون'
                   AND (type LIKE 'باقي%' OR type LIKE 'سحب%')
                   AND type NOT LIKE 'تحويل%'",
                [&name],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());
        if customer_remaining.abs() > MONEY_STRICT_EPSILON {
            return Err("لا يمكن حذف حساب زبون لديه رصيد مستحق".to_string());
        }

        let receivable: Money = db
            .query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
             WHERE account_type = 'receivable' AND account_id = ?1",
                [&name],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());
        if receivable.abs() > MONEY_STRICT_EPSILON {
            db.execute(
                "DELETE FROM financial_ledger
                 WHERE account_type = 'receivable' AND account_id = ?1",
                [&name],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Bug S: Block deleting investor with active balance (net balance)
    if kind == "مستثمر" {
        let balance: Money = db
            .query_row(
                "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger
             WHERE account_type = 'investor' AND account_id = ?1",
                [&name],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());
        if balance.abs() > MONEY_STRICT_EPSILON {
            return Err("لا يمكن حذف حساب مستثمر لديه رصيد مستحق في دفتر الأستاذ".to_string());
        }
    }

    // Bug R: Block deleting funder/company with active payable (net balance)
    if kind == "ممول" || kind == "شركة" {
        let account_type = if kind == "ممول" {
            "funder"
        } else {
            "payable"
        };
        let ledger_balance: Money = db
            .query_row(
                "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger
             WHERE account_type = ?1 AND account_id = ?2",
                params![account_type, &name],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());
        let tx_balance: Money = db
            .query_row(
                "SELECT COALESCE(SUM(CASE
                    WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                          OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                          OR type LIKE 'تسوية%' OR type LIKE 'تسديد%') THEN -amount
                    WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%') THEN amount
                    ELSE 0
                END), 0.0)
                 FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND type NOT LIKE 'تحويل%'",
                params![&name, &kind],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());
        if ledger_balance.abs() > MONEY_STRICT_EPSILON || tx_balance.abs() > MONEY_STRICT_EPSILON {
            let msg = if kind == "ممول" {
                "لا يمكن حذف حساب ممول لديه رصيد مستحق في دفتر الأستاذ"
            } else {
                "لا يمكن حذف حساب شركة لديه رصيد مستحق في دفتر الأستاذ"
            };
            return Err(msg.to_string());
        }
    }

    // Find all transaction IDs for this partner to delete corresponding ledger entries
    let mut stmt = db
        .prepare("SELECT id FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2")
        .map_err(|e| e.to_string())?;
    let tx_ids: Vec<i64> = stmt
        .query_map([&name, &kind], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<i64>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    for tx_id in tx_ids {
        db.execute("DELETE FROM financial_ledger WHERE reference_type = 'partner_transaction' AND reference_id = ?1", [tx_id.to_string()]).map_err(|e| e.to_string())?;
    }

    db.execute(
        "DELETE FROM partner_transactions WHERE partner_name = ?1 AND kind = ?2",
        (&name, &kind),
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM partners WHERE partner_name = ?1 AND kind = ?2",
        (&name, &kind),
    )
    .map_err(|e| e.to_string())?;

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
            // Customer: balance = sum of unpaid remaining rows only
            // Paid rows (واصل, تسديد, etc) never create negative balance
            let iqd_balance: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'زبون' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'باقي%' OR type LIKE 'سحب%') AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let usd_balance: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'زبون' AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'باقي%' OR type LIKE 'سحب%') AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            (iqd_balance, usd_balance)
        } else if kind == "شريك" {
            // Partner: use affects_partner_cash = 1 only
            let deposits_iqd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND affects_partner_cash = 1
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let withdrawals_iqd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND affects_partner_cash = 1
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let deposits_usd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'USD'
                 AND affects_partner_cash = 1
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let withdrawals_usd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'شريك' AND COALESCE(currency, 'IQD') = 'USD'
                 AND affects_partner_cash = 1
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            (
                deposits_iqd - withdrawals_iqd,
                deposits_usd - withdrawals_usd,
            )
        } else if kind == "مستثمر" {
            // Investor: deposits increase liability, withdrawals decrease it
            let deposits_iqd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'مستثمر' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let withdrawals_iqd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'مستثمر' AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let deposits_usd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'مستثمر' AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let withdrawals_usd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = 'مستثمر' AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            (
                withdrawals_iqd - deposits_iqd,
                withdrawals_usd - deposits_usd,
            )
        } else {
            // ممول, شركة: withdrawals - deposits (liability logic)
            let deposits_iqd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim(), kind.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let withdrawals_iqd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND COALESCE(currency, 'IQD') = 'IQD'
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim(), kind.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let deposits_usd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                      OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                      OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim(), kind.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            let withdrawals_usd: Money = db
                .query_row(
                    "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE partner_name = ?1 AND kind = ?2 AND COALESCE(currency, 'IQD') = 'USD'
                 AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                 AND type NOT LIKE 'تحويل%'",
                    params![partner_name.trim(), kind.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(Money::zero());
            (
                withdrawals_iqd - deposits_iqd,
                withdrawals_usd - deposits_usd,
            )
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
    require_admin_session(&tx)?;

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
    amount: Money,
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
    require_admin_session(&db)?;

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
    let classification = classify_partner_transaction(kind.trim(), type_.trim(), 0);

    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_role, affects_qasa, affects_partner_cash, affects_profit
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            partner_name.trim(),
            kind.trim(),
            type_.trim(),
            amount,
            date.trim(),
            &time_str,
            notes.as_deref(),
            currency.as_deref(),
            tx_payment_type,
            classification.source_type,
            classification.source_role,
            classification.affects_qasa,
            classification.affects_partner_cash,
            classification.affects_profit,
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
        curr,
        tx_payment_type.unwrap_or("قاصه"),
    )?;

    recalculate_partner_total(&db, partner_name.trim(), kind.trim())?;

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn distribute_financier_repayment_to_partners(
    db: &Connection,
    financier_name: &str,
    amount: Money,
    date: &str,
    currency: &str,
    notes: Option<&str>,
    tx_id: i64,
) -> Result<(), String> {
    if amount <= Money::zero() {
        return Ok(());
    }

    let commission_amount = parse_financier_commission(amount, notes)?;
    if commission_amount > Money::zero() {
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
                Some(format!("عمولة ممول: {} ({})", financier_name, tx_id)),
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
            Money::zero(),
            currency,
            "expense",
            &exp_id.to_string(),
            "مصروف عام",
            &format!("عمولة ممول: {} ({})", financier_name, tx_id),
            None,
        )?;

        record_ledger_entry(
            db,
            date,
            &current_time,
            "cash",
            Some("قاصه"),
            Money::zero(),
            commission_amount,
            currency,
            "expense",
            &exp_id.to_string(),
            "دفع مصروف",
            &format!("عمولة ممول: {}", financier_name),
            None,
        )?;

        let commission_partner_note = format!("عمولة ممول: {}", financier_name);
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
        let marker_end = rest.find(" | ").unwrap_or(rest.len());
        let value = rest[..marker_end].trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

/// Delete generated car PURCHASE partner transactions by source fields.
/// Only deletes source_type = 'car_purchase' AND source_id = car_number.
fn delete_generated_car_purchase_partner_transactions(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
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
fn delete_generated_car_sale_partner_transactions(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
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
    )
    .map_err(|e| e.to_string())?;
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
    )
    .map_err(|e| e.to_string())?;

    // 2. expenses.car_number
    db.execute(
        "UPDATE expenses SET car_number = ?1 WHERE car_number = ?2",
        params![new, old],
    )
    .map_err(|e| e.to_string())?;

    // 3. car_partners.car_number
    db.execute(
        "UPDATE car_partners SET car_number = ?1 WHERE car_number = ?2",
        params![new, old],
    )
    .map_err(|e| e.to_string())?;

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

fn delete_sale_generated_customer_rows_for_car(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car' AND related_source_id = ?1
               AND source_type IN ('customer_sale_payment', 'customer_installment_schedule')",
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

fn split_remaining_evenly(total: Money, count: usize) -> (Money, Money) {
    if count == 0 {
        return (Money::zero(), Money::zero());
    }
    let base = (total / Money::from_usize(count)).floor();
    let last = if count == 1 {
        total
    } else {
        total - base * Money::from_usize(count - 1)
    };
    (base, last)
}

#[derive(Debug, Clone)]
struct InstallmentTemplate {
    index: usize,
    amount: Money,
    date: String,
    notes: String,
}

#[derive(Debug, Clone)]
struct InstallmentScheduleState {
    id: i64,
    partner_name: String,
    source_id: String,
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

fn first_non_empty_date(values: &[&str]) -> String {
    values
        .iter()
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
        .unwrap_or("")
        .to_string()
}

fn build_installment_templates(
    db: &Connection,
    car_number: &str,
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
            "SELECT buyer_name, selling_price, installment_months, first_payment_date,
                    sale_currency, payment_type, car_name, COALESCE(chassis_number, ''),
                    COALESCE(sale_date, ''), delivery_date
             FROM cars WHERE car_number = ?1",
            [car_number],
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
                format!("السيارة رقم {} غير موجودة", car_number)
            }
            other => other.to_string(),
        })?;

    let down_payment_sum: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_source_id = ?1
               AND source_role = 'sale_down_payment'
               AND COALESCE(is_reversed, 0) = 0",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());

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
            index: 1,
            amount: initial_remaining,
            date: due_date,
            notes: format!("باقي قسط {} {}", car_name.trim(), clean_chassis)
                .trim()
                .replace("  ", " "),
        });
    } else {
        let months = installment_months.unwrap_or(1).max(1) as usize;
        let (monthly_amount, last_amount) = split_remaining_evenly(initial_remaining, months);
        let base_date =
            first_non_empty_date(&[first_payment_date.as_deref().unwrap_or(""), sale_date.as_str()]);
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
                index: i + 1,
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

fn insert_installment_template_rows(
    db: &Connection,
    car_number: &str,
    buyer_name: &str,
    sale_currency: &str,
    payment_type: &str,
    templates: &[InstallmentTemplate],
) -> Result<(), String> {
    let now_time = db
        .query_row(
            "SELECT strftime('%H:%M:%S', 'now', 'localtime')",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "00:00:00".to_string());

    for template in templates {
        db.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                related_source_type, related_source_id, original_amount, current_amount, due_date, is_reversed
             )
             VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, ?7,
                'customer_installment_schedule', ?8, 'installment_schedule', 0, 0, 0,
                'car', ?9, ?2, ?2, ?3, 0)",
            params![
                buyer_name.trim(),
                template.amount,
                &template.date,
                &now_time,
                &template.notes,
                sale_currency,
                payment_type,
                format!("{}:installment:{}", car_number, template.index),
                car_number,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn ensure_original_installment_rows(db: &Connection, car_number: &str) -> Result<(), String> {
    let (buyer_name, selling_price, sale_currency, payment_type, templates) =
        build_installment_templates(db, car_number)?;
    let is_installments_or_due = payment_type == "اقساط" || payment_type == "موعد";
    if !is_installments_or_due {
        db.execute(
            "DELETE FROM partner_transactions
             WHERE kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND (source_id LIKE ?1 OR source_id = ?2)",
            params![format!("{}:%", car_number), car_number],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let active_events: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM customer_installment_payment_events
             WHERE sale_id = ?1 AND status = 'active'",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if payment_type == "موعد" && templates.len() == 1 {
        let legacy_source_id = format!("{}:due:1", car_number);
        let desired_source_id = format!("{}:installment:1", car_number);
        if active_events == 0 {
            db.execute(
                "DELETE FROM partner_transactions
                 WHERE kind = 'زبون'
                   AND source_type = 'customer_installment_schedule'
                   AND source_role = 'installment_schedule'
                   AND source_id = ?1
                   AND EXISTS (
                       SELECT 1 FROM partner_transactions legacy
                       WHERE legacy.kind = 'زبون'
                         AND legacy.source_type = 'customer_installment_schedule'
                         AND legacy.source_role = 'installment_schedule'
                         AND legacy.source_id = ?2
                   )",
                params![desired_source_id.as_str(), legacy_source_id.as_str()],
            )
            .map_err(|e| e.to_string())?;
        }
        db.execute(
            "UPDATE partner_transactions
             SET source_id = ?1
             WHERE kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'
               AND source_id = ?2",
            params![desired_source_id.as_str(), legacy_source_id.as_str()],
        )
        .map_err(|e| e.to_string())?;
    }

    let mut stmt = db
        .prepare(
            "SELECT id, source_id FROM partner_transactions
             WHERE kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'
               AND source_id LIKE ?1
             ORDER BY COALESCE(due_date, date), id",
        )
        .map_err(|e| e.to_string())?;
    let existing = stmt
        .query_map([format!("{}:%", car_number)], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let desired_ids: Vec<String> = templates
        .iter()
        .map(|t| format!("{}:installment:{}", car_number, t.index))
        .collect();
    let existing_ids: Vec<String> = existing.iter().map(|(_, sid)| sid.clone()).collect();
    let installment_prefix = format!("{}:installment:", car_number);
    let base_rows_match = existing_ids.len() >= desired_ids.len()
        && existing_ids
            .iter()
            .take(desired_ids.len())
            .eq(desired_ids.iter());
    let has_only_deferred_extensions =
        existing_ids
            .iter()
            .skip(desired_ids.len())
            .all(|source_id| {
                source_id
                    .strip_prefix(&installment_prefix)
                    .and_then(|value| value.parse::<usize>().ok())
                    .is_some_and(|index| index > templates.len())
            });
    let has_safe_deferred_extensions =
        active_events > 0 && base_rows_match && has_only_deferred_extensions;

    if existing.is_empty() {
        insert_installment_template_rows(
            db,
            car_number,
            &buyer_name,
            &sale_currency,
            &payment_type,
            &templates,
        )?;
    } else if (existing.len() != templates.len() || existing_ids != desired_ids)
        && active_events == 0
    {
        db.execute(
            "DELETE FROM partner_transactions
             WHERE kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'
               AND source_id LIKE ?1",
            [format!("{}:%", car_number)],
        )
        .map_err(|e| e.to_string())?;
        insert_installment_template_rows(
            db,
            car_number,
            &buyer_name,
            &sale_currency,
            &payment_type,
            &templates,
        )?;
    } else if (existing.len() != templates.len() || existing_ids != desired_ids)
        && active_events > 0
        && !has_safe_deferred_extensions
    {
        // Recalculate and rebuild schedule rows with active events
        struct ActiveEvent {
            id: i64,
            actual_paid_amount: Money,
            _currency: String,
        }
        let mut stmt = db.prepare(
            "SELECT id, actual_paid_amount, currency
             FROM customer_installment_payment_events
             WHERE sale_id = ?1 AND status = 'active'
             ORDER BY created_at ASC, id ASC"
        ).map_err(|e| e.to_string())?;
        let active_events_list = stmt.query_map([car_number], |row| {
            Ok(ActiveEvent {
                id: row.get(0)?,
                actual_paid_amount: row.get(1)?,
                _currency: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?
          .collect::<Result<Vec<_>, _>>()
          .map_err(|e| e.to_string())?;
        drop(stmt);

        let p_count = active_events_list.len();
        let mut m_months = templates.len();
        if m_months < p_count {
            m_months = p_count;
        }
        let r_months = m_months - p_count;
        let total_paid_installments = active_events_list.iter().map(|e| e.actual_paid_amount).sum::<Money>();
        let down_payment_sum: Money = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                 WHERE kind = 'زبون'
                   AND related_source_type = 'car'
                   AND related_source_id = ?1
                   AND source_role = 'sale_down_payment'
                   AND COALESCE(is_reversed, 0) = 0",
                [car_number],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());
        let remaining_balance = (selling_price - down_payment_sum - total_paid_installments).max(Money::zero());

        let (monthly_amount, last_amount) = if r_months > 0 {
            split_remaining_evenly(remaining_balance, r_months)
        } else {
            (Money::zero(), Money::zero())
        };

        let (car_name, chassis_number): (String, String) = db.query_row(
            "SELECT COALESCE(car_name, ''), COALESCE(chassis_number, '') FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).map_err(|e| e.to_string())?;
        let clean_chassis = chassis_number.trim();

        let (first_payment_date, sale_date): (Option<String>, String) = db.query_row(
            "SELECT first_payment_date, COALESCE(sale_date, '') FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).map_err(|e| e.to_string())?;

        let base_date = first_non_empty_date(&[
            first_payment_date.as_deref().unwrap_or(""),
            sale_date.as_str()
        ]);

        for i in 1..=m_months {
            let desired_source_id = format!("{}:installment:{}", car_number, i);
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
            }.trim().replace("  ", " ");

            if i - 1 < existing.len() {
                let row_id = existing[i - 1].0;
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
                             related_source_id = ?7,
                             source_id = ?8,
                             is_reversed = 0
                         WHERE id = ?9",
                        params![
                            event.actual_paid_amount,
                            event.id,
                            template_date,
                            notes_paid,
                            sale_currency,
                            payment_type,
                            event.id.to_string(),
                            desired_source_id,
                            row_id,
                        ]
                    ).map_err(|e| e.to_string())?;

                    db.execute(
                        "UPDATE customer_installment_payment_events
                         SET installment_id = ?1
                         WHERE id = ?2",
                        params![row_id, event.id]
                    ).map_err(|e| e.to_string())?;
                } else {
                    let inst_amount = if i == m_months { last_amount } else { monthly_amount };
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
                             related_source_id = ?6,
                             source_id = ?7,
                             is_reversed = 0
                         WHERE id = ?8",
                        params![
                            inst_amount,
                            template_date,
                            template_notes,
                            sale_currency,
                            payment_type,
                            car_number,
                            desired_source_id,
                            row_id,
                        ]
                    ).map_err(|e| e.to_string())?;
                }
            } else {
                let inst_amount = if i == m_months { last_amount } else { monthly_amount };
                db.execute(
                    "INSERT INTO partner_transactions (
                        partner_name, kind, type, amount, original_amount, current_amount,
                        actual_paid_amount, paid_event_id, date, due_date, notes, currency, payment_type,
                        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                        related_source_type, related_source_id
                     )
                     VALUES (?1, 'زبون', 'باقي قسط', ?2, ?2, ?2, NULL, NULL, ?3, ?3, ?4, ?5, ?6,
                        'customer_installment_schedule', ?7, 'installment_schedule', 0, 0, 0, 'car', ?8)",
                    params![
                        buyer_name.trim(),
                        inst_amount,
                        template_date,
                        template_notes,
                        sale_currency,
                        payment_type,
                        desired_source_id,
                        car_number,
                    ]
                ).map_err(|e| e.to_string())?;
            }
        }

        if existing.len() > m_months {
            for k in m_months..existing.len() {
                let row_id = existing[k].0;
                db.execute("DELETE FROM partner_transactions WHERE id = ?1", [row_id])
                    .map_err(|e| e.to_string())?;
            }
        }
    } else if active_events == 0 {
        for ((id, _), template) in existing.iter().zip(templates.iter()) {
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
                     related_source_id = ?6,
                     is_reversed = 0
                 WHERE id = ?7",
                params![
                    template.amount,
                    &template.date,
                    &template.notes,
                    &sale_currency,
                    &payment_type,
                    car_number,
                    id,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        for ((id, _), template) in existing.iter().zip(templates.iter()) {
            db.execute(
                "UPDATE partner_transactions
                 SET original_amount = ?1,
                     date = ?2,
                     due_date = ?2,
                     notes = ?3,
                     currency = ?4,
                     payment_type = ?5,
                     related_source_type = 'car',
                     related_source_id = ?6,
                     is_reversed = 0
                 WHERE id = ?7",
                params![
                    template.amount,
                    &template.date,
                    &template.notes,
                    &sale_currency,
                    &payment_type,
                    car_number,
                    id,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    db.execute(
        "UPDATE partner_transactions
         SET original_amount = COALESCE(original_amount, amount),
             current_amount = COALESCE(current_amount, amount),
             due_date = COALESCE(due_date, date),
             is_reversed = COALESCE(is_reversed, 0)
         WHERE source_type = 'customer_installment_schedule'
           AND source_role = 'installment_schedule'
           AND source_id LIKE ?1",
        [format!("{}:%", car_number)],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn load_installment_schedule_states(
    db: &Connection,
    car_number: &str,
) -> Result<Vec<InstallmentScheduleState>, String> {
    let mut stmt = db
        .prepare(
            "SELECT id, partner_name, COALESCE(source_id, ''),
                    COALESCE(due_date, date), COALESCE(currency, 'IQD'),
                    COALESCE(payment_type, 'قاصه'), COALESCE(notes, ''),
                    COALESCE(original_amount, amount), COALESCE(current_amount, amount), amount,
                    actual_paid_amount, paid_event_id, type
             FROM partner_transactions
             WHERE kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'
               AND source_id LIKE ?1
               AND COALESCE(is_reversed, 0) = 0
             ORDER BY COALESCE(due_date, date), id",
        )
        .map_err(|e| e.to_string())?;
    let states = stmt
        .query_map([format!("{}:%", car_number)], |row| {
            let tx_type: String = row.get(12)?;
            Ok(InstallmentScheduleState {
                id: row.get(0)?,
                partner_name: row.get(1)?,
                source_id: row.get(2)?,
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

fn next_installment_index(states: &[InstallmentScheduleState], car_number: &str) -> usize {
    let prefix = format!("{}:installment:", car_number);
    states
        .iter()
        .filter_map(|state| {
            state
                .source_id
                .strip_prefix(&prefix)
                .and_then(|value| value.parse::<usize>().ok())
        })
        .max()
        .unwrap_or(0)
        + 1
}

fn append_deferred_installment_state(
    states: &mut Vec<InstallmentScheduleState>,
    car_number: &str,
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
    let next_index = next_installment_index(states, car_number);
    let source_id = format!("{}:installment:{}", car_number, next_index);
    if states.iter().any(|state| state.source_id == source_id) {
        return Err("تعذر إنشاء قسط لاحق لأن رقم القسط مستخدم مسبقاً".to_string());
    }

    let base_note = paid_state
        .notes
        .replace("واصل ", "باقي ")
        .replace("واصل", "باقي");
    states.push(InstallmentScheduleState {
        id: 0,
        partner_name: paid_state.partner_name,
        source_id,
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

fn materialize_deferred_installment_states(
    db: &Connection,
    car_number: &str,
    states: &mut [InstallmentScheduleState],
) -> Result<(), String> {
    let now_time = db
        .query_row(
            "SELECT strftime('%H:%M:%S', 'now', 'localtime')",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "00:00:00".to_string());

    for state in states.iter_mut().filter(|state| state.id == 0) {
        db.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
                related_source_type, related_source_id, original_amount, current_amount, due_date, is_reversed
             )
             VALUES (?1, 'زبون', 'باقي قسط', ?2, ?3, ?4, ?5, ?6, ?7,
                'customer_installment_schedule', ?8, 'installment_schedule', 0, 0, 0,
                'car', ?9, ?10, ?11, ?3, 0)",
            params![
                state.partner_name.trim(),
                state.display_amount,
                &state.due_date,
                &now_time,
                &state.notes,
                &state.currency,
                &state.payment_type,
                &state.source_id,
                car_number,
                state.original_amount,
                state.current_amount,
            ],
        )
        .map_err(|e| e.to_string())?;
        state.id = db.last_insert_rowid();
    }

    Ok(())
}

fn distribute_installment_difference(
    states: &mut Vec<InstallmentScheduleState>,
    car_number: &str,
    paid_index: usize,
    difference: Money,
) -> Result<(), String> {
    if difference == Money::zero() {
        return Ok(());
    }
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
            return append_deferred_installment_state(
                states,
                car_number,
                paid_index,
                difference.abs(),
            );
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
    let base = (abs_diff / Money::from_usize(count)).floor();
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
    Ok(())
}

fn update_car_installment_totals(db: &Connection, car_number: &str) -> Result<(), String> {
    let selling_price: Money = db
        .query_row(
            "SELECT selling_price FROM cars WHERE car_number = ?1",
            [car_number],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let down_payment_sum: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE kind = 'زبون'
               AND related_source_type = 'car'
               AND related_source_id = ?1
               AND source_role = 'sale_down_payment'
               AND COALESCE(is_reversed, 0) = 0",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());
    let active_payment_sum: Money = db
        .query_row(
            "SELECT COALESCE(SUM(actual_paid_amount), 0.0)
             FROM customer_installment_payment_events
             WHERE sale_id = ?1 AND status = 'active'",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());
    let total_paid = down_payment_sum + active_payment_sum;
    db.execute(
        "UPDATE cars SET amount_paid = ?1, amount_remaining = ?2 WHERE car_number = ?3",
        params![total_paid, selling_price - total_paid, car_number],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn recalculate_installment_schedule_for_car(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
    ensure_original_installment_rows(db, car_number)?;
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
             WHERE sale_id = ?1 AND status = 'active'
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let events = stmt
        .query_map([car_number], |row| {
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
        distribute_installment_difference(&mut states, car_number, idx, difference)?;
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
            ("car", car_number.to_string())
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
                 is_reversed = 0
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
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    update_car_installment_totals(db, car_number)?;
    Ok(())
}

fn rebuild_installment_schedule(db: &Connection, car_number: &str) -> Result<(), String> {
    recalculate_installment_schedule_for_car(db, car_number)
}

fn extract_linked_installment_id(notes: &str) -> Option<i64> {
    let marker = "قسط#";
    let start = notes.find(marker)? + marker.len();
    let digits: String = notes[start..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    digits.parse::<i64>().ok()
}

fn is_installment_schedule_id(db: &Connection, id: i64) -> bool {
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

fn resolve_installment_schedule_id(db: &Connection, tx_id: i64) -> Result<i64, String> {
    if is_installment_schedule_id(db, tx_id) {
        return Ok(tx_id);
    }

    let notes: Option<String> = db
        .query_row(
            "SELECT notes FROM partner_transactions WHERE id = ?1",
            [tx_id],
            |row| row.get(0),
        )
        .ok()
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

fn resolve_car_number_for_installment(
    db: &Connection,
    installment_id: i64,
) -> Result<String, String> {
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

fn calculate_installment_payment_preview(
    db: &Connection,
    installment_id: i64,
    actual_paid_amount: Money,
    currency: Option<&str>,
) -> Result<InstallmentPaymentPreview, String> {
    validate_positive_amount(actual_paid_amount, "المبلغ المدفوع فعلياً")?;
    let installment_id = resolve_installment_schedule_id(db, installment_id)?;
    let car_number = resolve_car_number_for_installment(db, installment_id)?;
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
    distribute_installment_difference(&mut states, &car_number, idx, difference)?;
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
fn pay_customer_installment_core(
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
        .unwrap_or(false);
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
    let time_str = db
        .query_row(
            "SELECT strftime('%H:%M:%S', 'now', 'localtime')",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "00:00:00".to_string());
    let effective_notes = notes
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| format!("تسديد قسط {}", source_id));

    db.execute(
        "INSERT INTO customer_installment_payment_events (
            event_uuid, customer_id, sale_id, installment_id, currency,
            scheduled_amount_at_payment_time, actual_paid_amount, difference_amount,
            status, ledger_batch_id, notes
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?10)",
        params![
            &event_uuid,
            customer_name.trim(),
            &car_number,
            installment_id,
            currency,
            scheduled_amount,
            actual_paid_amount,
            preview.difference_amount,
            &ledger_batch_id,
            &effective_notes,
        ],
    )
    .map_err(|e| e.to_string())?;
    let event_id = db.last_insert_rowid();

    let customer_payment_notes = format!(
        "{} | قسط#{} | حدث#{} #بيع_سيارة_{}",
        effective_notes, installment_id, event_id, car_number
    );
    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_role, affects_qasa, affects_partner_cash, affects_profit,
            related_source_type, related_source_id, ledger_batch_id, is_reversed
         )
         VALUES (?1, 'زبون', 'تسديد قسط', ?2, ?3, ?4, ?5, ?6, ?7,
            'customer_payment', 'customer_payment', 0, 0, 0,
            'customer_payment_event', ?8, ?9, 0)",
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

    recalculate_installment_schedule_for_car(db, &car_number)?;
    recalculate_partner_total(db, customer_name.trim(), "زبون")?;
    recalculate_all_partners(db)?;
    Ok(())
}

fn reverse_customer_installment_payment_core(
    db: &Connection,
    installment_id: i64,
) -> Result<(), String> {
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
    let (status, ledger_batch_id): (String, String) = db
        .query_row(
            "SELECT status, ledger_batch_id
             FROM customer_installment_payment_events
             WHERE id = ?1 AND installment_id = ?2",
            params![event_id, installment_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "لم يتم العثور على حدث الدفع المرتبط بالقسط".to_string())?;
    if status != "active" {
        return Err("حدث الدفع ملغى مسبقاً".to_string());
    }

    let reversal_batch_id = new_ledger_token("installment_reversal");
    let reversal_uuid = new_ledger_token("installment_reversal_event");
    let (date, time) = now_datetime();
    db.execute(
        "INSERT INTO customer_installment_payment_events (
            event_uuid, customer_id, sale_id, installment_id, currency,
            scheduled_amount_at_payment_time, actual_paid_amount, difference_amount,
            status, ledger_batch_id, created_at, notes
         )
         SELECT ?1, customer_id, sale_id, installment_id, currency,
                scheduled_amount_at_payment_time, actual_paid_amount, difference_amount,
                'reversal', ?2, ?3, 'عكس حدث دفع قسط'
         FROM customer_installment_payment_events
         WHERE id = ?4",
        params![
            &reversal_uuid,
            &reversal_batch_id,
            format!("{} {}", date, time),
            event_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let reversal_event_id = db.last_insert_rowid();

    db.execute(
        "UPDATE customer_installment_payment_events
         SET status = 'reversed',
             reversed_at = ?1,
             reversed_by_event_id = ?2
         WHERE id = ?3",
        params![format!("{} {}", date, time), reversal_event_id, event_id],
    )
    .map_err(|e| e.to_string())?;

    reverse_ledger_batch_entries(db, &ledger_batch_id, &reversal_batch_id)?;
    mark_partner_batch_reversed(db, &ledger_batch_id)?;
    recalculate_installment_schedule_for_car(db, &car_number)?;

    let customer_name: Option<String> = db
        .query_row(
            "SELECT partner_name FROM partner_transactions WHERE id = ?1",
            [installment_id],
            |row| row.get(0),
        )
        .ok();
    if let Some(customer_name) = customer_name {
        recalculate_partner_total(db, &customer_name, "زبون")?;
    }
    recalculate_all_partners(db)?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn update_customer_sale_down_payment(
    state: State<AppState>,
    transaction_id: i64,
    customer_name: String,
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
) -> Result<(), String> {
    validate_required_text(&customer_name, "اسم الزبون")?;
    validate_positive_amount(amount, "المقدمة")?;
    validate_required_text(&date, "التاريخ")?;
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    validate_currency(&currency)?;
    let payment_type = payment_type.unwrap_or_else(|| "قاصه".to_string());

    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

    let (row_customer, row_currency, related_source_id, source_id, existing_notes): (
        String,
        String,
        String,
        String,
        Option<String>,
    ) = db
        .query_row(
            "SELECT partner_name, COALESCE(currency, 'IQD'), COALESCE(related_source_id, ''),
                    COALESCE(source_id, ''), notes
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

    let car_number = if !related_source_id.trim().is_empty() {
        related_source_id.trim().to_string()
    } else {
        source_id.split(':').next().unwrap_or("").trim().to_string()
    };
    if car_number.is_empty() {
        return Err("لم يتم العثور على السيارة المرتبطة بالمقدمة".to_string());
    }

    let (selling_price, sale_currency, car_payment_type): (Money, String, String) = db
        .query_row(
            "SELECT selling_price, COALESCE(sale_currency, 'IQD'), COALESCE(payment_type, '')
             FROM cars WHERE car_number = ?1",
            [&car_number],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "السيارة المرتبطة بالمقدمة غير موجودة".to_string())?;

    if sale_currency != currency {
        return Err("عملة المقدمة لا تطابق عملة بيع السيارة".to_string());
    }
    if car_payment_type != "اقساط" && car_payment_type != "موعد" {
        return Err("تعديل المقدمة من حساب الزبون متاح لبيع التقسيط أو الموعد فقط".to_string());
    }

    let paid_installments_sum: Money = db
        .query_row(
            "SELECT COALESCE(SUM(actual_paid_amount), 0.0)
             FROM customer_installment_payment_events
             WHERE sale_id = ?1 AND status = 'active'",
            [&car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());
    if amount + paid_installments_sum > selling_price {
        return Err("المقدمة مع الأقساط المسددة أكبر من سعر البيع".to_string());
    }

    let time_str = db
        .query_row(
            "SELECT strftime('%H:%M:%S', 'now', 'localtime')",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "00:00:00".to_string());
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
             affects_qasa = 1,
             affects_partner_cash = 1,
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
            &car_number,
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

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn car_expenses_for_profit(db: &Connection, car_number: &str) -> Money {
    let recorded_expenses: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?1",
            [car_number],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());
    if recorded_expenses > Money::zero() {
        return recorded_expenses;
    }
    db.query_row(
        "SELECT COALESCE(expenses_at_sale, 0.0) FROM cars WHERE car_number = ?1",
        [car_number],
        |row| row.get(0),
    )
    .unwrap_or(Money::zero())
}

fn calculate_customer_payment_profit(
    db: &Connection,
    payment_tx_id: i64,
    car_number: &str,
    payment_amount: Money,
) -> Result<Money, String> {
    let (purchase_price, selling_price): (Money, Money) = db
        .query_row(
            "SELECT purchase_price, selling_price FROM cars WHERE car_number = ?1",
            [car_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    if payment_amount <= Money::zero() || selling_price <= Money::zero() {
        return Ok(Money::zero());
    }

    let full_profit = selling_price - purchase_price - car_expenses_for_profit(db, car_number);
    if full_profit <= Money::zero() {
        return Ok(Money::zero());
    }

    let already_recognized: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0)
             FROM partner_transactions
             WHERE kind = 'شريك'
               AND source_type = 'customer_payment'
               AND source_role = 'profit_recognition'
               AND affects_profit = 1
               AND related_source_type = 'car'
               AND related_source_id = ?1
               AND COALESCE(source_id, '') != ?2
               AND COALESCE(is_reversed, 0) = 0",
            params![car_number, payment_tx_id.to_string()],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());
    let remaining_profit = full_profit - already_recognized;
    if remaining_profit <= Money::zero() {
        return Ok(Money::zero());
    }

    let payment_profit = payment_amount * (full_profit / selling_price);
    Ok(payment_profit.min(remaining_profit))
}

fn create_customer_payment_profit_recognition(
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
               AND source_id = ?1
               AND source_role = 'profit_recognition'
               AND kind = 'شريك'
               AND COALESCE(is_reversed, 0) = 0",
            [&source_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if profit_exists {
        return Ok(());
    }

    let payment_profit =
        calculate_customer_payment_profit(db, payment_tx_id, car_number, payment_amount)?;
    if payment_profit <= Money::zero() {
        return Ok(());
    }

    let profit_note = format!(
        "ارباح قسط سيارة: {} (رقم حركة دفعة: {}) #بيع_سيارة_{}",
        notes, payment_tx_id, car_number
    );
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
        Some(car_number),
    )
}

fn create_customer_payment_accounting_effects(
    db: &Connection,
    payment_tx_id: i64,
    amount: Money,
    currency: &str,
    date: &str,
    payment_type: &str,
    notes: &str,
) -> Result<(), String> {
    let car_num = extract_car_number_from_notes(notes);

    if let Some(ref cn) = car_num {
        db.execute(
            "UPDATE partner_transactions SET related_source_type = 'car', related_source_id = ?1
             WHERE id = ?2 AND (related_source_type IS NULL OR related_source_id IS NULL OR related_source_id = '')",
            params![cn, payment_tx_id],
        )
        .map_err(|e| e.to_string())?;
    }

    let source_id = payment_tx_id.to_string();
    let cash_exists: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM partner_transactions
             WHERE source_type = 'customer_payment'
               AND source_id = ?1
               AND source_role = 'cash_movement'
               AND kind = 'شريك'",
            [&source_id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !cash_exists {
        let cash_note = match car_num.as_deref() {
            Some(cn) => format!(
                "دفعة زبون: {} (رقم حركة دفعة: {}) #بيع_سيارة_{}",
                notes, payment_tx_id, cn
            ),
            None => format!("دفعة زبون: {} (رقم حركة دفعة: {})", notes, payment_tx_id),
        };
        let cash_movement_type = db
            .query_row(
                "SELECT COALESCE(type, ''), COALESCE(source_role, '')
                 FROM partner_transactions WHERE id = ?1",
                [payment_tx_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map(|(payment_type_name, source_role)| {
                if source_role == "sale_down_payment" || payment_type_name.starts_with("مقدمة")
                {
                    "ايداع مقدمة سيارة"
                } else if payment_type_name.contains("قسط") || notes.contains("قسط#") {
                    "ايداع قسط سيارة"
                } else {
                    "ايداع مقدمة سيارة"
                }
            })
            .unwrap_or("ايداع مقدمة سيارة");

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
            car_num.as_deref().map(|_| "car"),
            car_num.as_deref(),
        )?;
    }

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

    Ok(())
}

fn rebuild_customer_payment_profit_recognitions(db: &Connection) -> Result<(), String> {
    let existing_profit_ids: Vec<i64> = {
        let mut stmt = db
            .prepare(
                "SELECT id FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'customer_payment'
                   AND source_role = 'profit_recognition'",
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
        delete_ledger_entries(db, "partner_transaction", &tx_id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [tx_id])
            .map_err(|e| e.to_string())?;
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
                   AND COALESCE(related_source_id, '') != ''
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

fn rebuild_customer_payment_profit_recognitions_for_car(
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
                   AND related_source_id = ?1",
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
        delete_ledger_entries(db, "partner_transaction", &tx_id.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [tx_id])
            .map_err(|e| e.to_string())?;
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
                   AND related_source_id = ?1
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
fn apply_partner_transaction_splits(
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
        .unwrap_or(None);
    if source_type.as_deref() == Some("car_purchase") {
        return Ok(());
    }

    // === 2. Company Cash Withdrawal (سحب شركة) ===
    let is_company_cash_withdrawal =
        kind == "شركة" && type_.starts_with("سحب") && notes.unwrap_or("").contains("سحب نقدي");
    if is_company_cash_withdrawal {
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
    let is_customer_payment = kind == "زبون"
        && (type_.starts_with("ايداع")
            || type_.starts_with("إيداع")
            || type_.starts_with("مقدمة")
            || type_.starts_with("استلام")
            || type_.starts_with("إستلام")
            || type_.starts_with("تسديد"));
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

fn parse_financier_commission(amount: Money, notes: Option<&str>) -> Result<Money, String> {
    let Some(notes) = notes else {
        return Ok(Money::zero());
    };
    let Some(raw_commission) = notes.split("عمولة:").nth(1) else {
        return Ok(Money::zero());
    };
    let raw_commission = raw_commission.trim();
    if raw_commission.contains('%') {
        let percent_str = raw_commission
            .split('%')
            .next()
            .unwrap_or("")
            .trim();
        let clean: String = percent_str.chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == '+' ).collect();
        if clean.is_empty() || clean == "." || clean == "-" || clean == "+" || clean == "-." || clean == "+." {
            return Err("صيغة عمولة الممول غير صحيحة".to_string());
        }
        let percent = clean
            .parse::<Money>()
            .map_err(|_| "صيغة عمولة الممول غير صحيحة".to_string())?;
        return Ok((amount * percent) / Money(dec!(100)));
    }
    let clean: String = raw_commission.chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == '+' ).collect();
    if clean.is_empty() || clean == "." || clean == "-" || clean == "+" || clean == "-." || clean == "+." {
        return Err("صيغة عمولة الممول غير صحيحة".to_string());
    }
    clean
        .parse::<Money>()
        .map_err(|_| "صيغة عمولة الممول غير صحيحة".to_string())
}

#[tauri::command]
fn preview_installment_payment_redistribution(
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
fn pay_customer_installment(
    state: State<AppState>,
    installment_id: i64,
    customer_name: String,
    actual_paid_amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    payment_type: Option<String>,
) -> Result<(), String> {
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    let payment_type = payment_type.unwrap_or_else(|| "قاصه".to_string());
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;
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
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reverse_customer_installment_payment(
    state: State<AppState>,
    installment_id: i64,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;
    reverse_customer_installment_payment_core(&db, installment_id)?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn recalculate_installment_schedule(
    state: State<AppState>,
    car_number: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;
    recalculate_installment_schedule_for_car(&db, car_number.trim())?;
    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_customer_installments(
    state: State<AppState>,
    customer_name: String,
    car_number: Option<String>,
) -> Result<Vec<CustomerInstallment>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let car_filter = car_number.unwrap_or_default();
    let mut sql =
        "SELECT id, partner_name, source_id, COALESCE(due_date, date), COALESCE(currency, 'IQD'),
                          COALESCE(original_amount, amount), COALESCE(current_amount, amount),
                          actual_paid_amount, type, paid_event_id, notes
                   FROM partner_transactions
                   WHERE kind = 'زبون'
                     AND partner_name = ?1
                     AND source_type = 'customer_installment_schedule'
                     AND source_role = 'installment_schedule'
                     AND COALESCE(is_reversed, 0) = 0"
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
fn set_customer_installment_status(
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
) -> Result<(), String> {
    if kind != "زبون" {
        return Err("نوع الحساب يجب أن يكون زبون".to_string());
    }
    let currency = currency.unwrap_or_else(|| "IQD".to_string());
    let payment_type = payment_type.unwrap_or_else(|| "قاصه".to_string());
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;
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

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn pay_financier_from_partners(
    state: State<AppState>,
    financier_name: String,
    financier_kind: String,
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
    commission_amount: Option<Money>,
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
    let commission_amount = commission_amount.unwrap_or(Money::zero());
    if commission_amount > Money::zero() {
        validate_positive_amount(commission_amount, "العمولة")?;
    }

    // ============================================================
    // ATOMIC TRANSACTION
    // ============================================================
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;
    let financier_name = financier_name.trim();
    let financier_kind = financier_kind.trim();
    let date = date.trim();

    let financier_tx_type = "سحب";

    let time_str = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    let (src_type, src_role, aq, apc, apr) = match financier_kind {
        "مستثمر" => ("investor_transaction", "account_movement", 1, 0, 0),
        "شركة" => ("company_transaction", "repayment_account_movement", 0, 0, 0),
        _ => ("funder_transaction", "repayment_account_movement", 0, 0, 0),
    };

    db.execute(
        "INSERT INTO partner_transactions (
            partner_name, kind, type, amount, date, time, notes, currency, payment_type,
            source_type, source_role, affects_qasa, affects_partner_cash, affects_profit
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'قاصه', ?9, ?10, ?11, ?12, ?13)",
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

    db.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn find_car_number_for_transaction(db: &Connection, tx_id: i64) -> Option<String> {
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
fn update_partner_transaction(
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
    require_admin_session(&db)?;

    let pre_car_number = find_car_number_for_transaction(&db, id);

    // 1. Reverse old ledger entries for this partner transaction
    reverse_ledger_entries(&db, "partner_transaction", &id.to_string())?;

    delete_customer_payment_partner_splits(&db, id)?;
    delete_customer_payment_profit_splits(&db, id)?;

    // Clean up linked split transactions using source fields instead of notes LIKE
    let linked_ids: Vec<i64> = {
        let original_st: Option<String> = db
            .query_row(
                "SELECT source_type FROM partner_transactions WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap_or(None);
        if let Some(ref st) = original_st {
            let mut stmt = db
                .prepare("SELECT id FROM partner_transactions WHERE source_type = ?1 AND source_id = ?2 AND id != ?3")
                .map_err(|e| e.to_string())?;
            let ids: Vec<i64> = stmt
                .query_map(params![st, id.to_string(), id], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            drop(stmt);
            ids
        } else {
            Vec::new()
        }
    };

    for lid in &linked_ids {
        reverse_ledger_entries(&db, "partner_transaction", &lid.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [lid])
            .map_err(|e| e.to_string())?;
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
        curr,
        payment_type.as_deref().unwrap_or("قاصه"),
    )?;

    // Handle commission expense updating/deleting for financier repayments
    let is_financier_repayment = kind.trim() == "ممول" && type_.trim().starts_with("سحب");

    if is_financier_repayment {
        let commission_amount = parse_financier_commission(amount, notes.as_deref())?;
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

        if commission_amount > Money::zero() {
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
                        Money::zero(),
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
                        Money::zero(),
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
                        Money::zero(),
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
                        Money::zero(),
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
            db.execute("DELETE FROM expenses WHERE id = ?1", [exp_id])
                .map_err(|e| e.to_string())?;
        }
    }

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
    require_admin_session(&db)?;

    let pre_car_number = find_car_number_for_transaction(&db, id);

    // Determine the source_type of the original transaction to find linked rows properly
    let original_source_type: Option<String> = db
        .query_row(
            "SELECT source_type FROM partner_transactions WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .unwrap_or(None);

    // Delete corresponding commission expense if it exists
    let target_note = format!("%رقم الحركة: {}%", id);
    if let Ok(exp_id) = db.query_row(
        "SELECT id FROM expenses WHERE notes LIKE ?1 LIMIT 1",
        [&target_note],
        |row| row.get::<_, i64>(0),
    ) {
        delete_ledger_entries(&db, "expense", &exp_id.to_string())?;
        db.execute("DELETE FROM expenses WHERE id = ?1", [exp_id])
            .map_err(|e| e.to_string())?;
    }

    // Clean up linked split transactions using source fields instead of notes LIKE
    let linked_ids: Vec<i64> = if let Some(ref st) = original_source_type {
        // Use source_type + source_id for safe matching
        let mut stmt = db
            .prepare("SELECT id FROM partner_transactions WHERE source_type = ?1 AND source_id = ?2 AND id != ?3")
            .map_err(|e| e.to_string())?;
        let ids: Vec<i64> = stmt
            .query_map(params![st, id.to_string(), id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        ids
    } else {
        Vec::new()
    };

    for lid in &linked_ids {
        delete_ledger_entries(&db, "partner_transaction", &lid.to_string())?;
        db.execute("DELETE FROM partner_transactions WHERE id = ?1", [lid])
            .map_err(|e| e.to_string())?;
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

    if let Some(ref cn) = pre_car_number {
        rebuild_installment_schedule(&db, cn)?;
    }

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
             "SELECT id, partner_name, kind, type, amount, date, notes, currency,
                     COALESCE(payment_type, 'قاصه'), COALESCE(time, '00:00'),
                     source_type, source_id, source_role,
                     COALESCE(affects_qasa, 1), COALESCE(affects_partner_cash, 1), COALESCE(affects_profit, 0),
                     related_source_type, related_source_id,
                     original_amount, current_amount, actual_paid_amount, paid_event_id,
                     due_date, ledger_batch_id, COALESCE(is_reversed, 0)
              FROM partner_transactions
              WHERE partner_name = ?1 AND kind = ?2
                AND COALESCE(source_role, '') != 'profit_recognition'
                AND COALESCE(is_reversed, 0) = 0
              ORDER BY id ASC",
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
                    // Phase 3 path: rows with affects_qasa/affects_partner_cash are already
                    // known cash movements by flag. Default to positive if not a known withdrawal.
                    raw_amount
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

fn car_expense_partner_note(
    db: &Connection,
    car_number: &str,
    description: &str,
    expense_id: i64,
) -> String {
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

/// Rebuild sold-car accounting after cost change (expense add/delete).
/// - Enforces profit cap.
/// - Rebuilds sale ledger entries (COGS, receivable, deferred_revenue, revenue, inventory).
/// - For cash sales: rebuilds partner profit_recognition splits to reflect updated costs.
/// - For installment/due sales: only rebuilds ledger; does NOT touch customer payments or splits.
fn rebuild_sold_car_accounting_after_cost_change(
    db: &Connection,
    car_number: &str,
) -> Result<(), String> {
    let car_info = db.query_row(
        "SELECT status, COALESCE(payment_type, '') FROM cars WHERE car_number = ?1",
        [car_number],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );
    let (status, payment_type) = match car_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    if status != "مبيوعة" {
        return Ok(());
    }

    // 1. Enforce profit cap before any changes
    validate_profit_cap_for_car(db, car_number)?;

    // 2. Rebuild sale ledger entries (COGS, receivable, deferred_revenue, revenue, inventory credit)
    delete_car_sale_ledger_entries(db, car_number)?;
    record_car_sale_ledger_entries(db, car_number)?;

    // 3. For cash sales: rebuild car_sale cash_movement only
    if payment_type == "كاش" {
        // Delete old car_sale partner rows (cash_movement + any legacy profit_recognition)
        delete_generated_car_sale_partner_transactions(db, car_number)?;

        // Also clean up any legacy customer_sale_payment rows from the old bug
        let legacy_ids: Vec<i64> = {
            let mut stmt = db
                .prepare(
                    "SELECT id FROM partner_transactions
                 WHERE kind = 'زبون'
                   AND source_type = 'customer_sale_payment'
                   AND related_source_type = 'car'
                   AND related_source_id = ?1",
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
        for pid in &legacy_ids {
            delete_customer_payment_partner_splits(db, *pid)?;
            delete_customer_payment_profit_splits(db, *pid)?;
            delete_ledger_entries(db, "partner_transaction", &pid.to_string())?;
            db.execute("DELETE FROM partner_transactions WHERE id = ?1", [pid])
                .map_err(|e| e.to_string())?;
        }

        let car_data: Result<(Money, Money, String, String, String), _> = db.query_row(
            "SELECT purchase_price, selling_price,
                    COALESCE(car_name, ''), COALESCE(sale_currency, 'IQD'),
                    COALESCE(sale_date, '')
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
            car_number,
            "cash_movement",
            true,  // affects_qasa
            true,  // affects_partner_cash
            false, // affects_profit
            Some("car"),
            Some(car_number),
        )?;
    } else {
        // Rebuild profit recognitions for installments/term sales at new cost/profit ratio
        rebuild_customer_payment_profit_recognitions_for_car(db, car_number)?;
    }
    recalculate_all_partners(db)?;

    Ok(())
}

#[tauri::command]
fn add_expense(
    state: State<AppState>,
    description: String,
    amount: Money,
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
    require_admin_session(&db)?;
    let (_current_date, current_time) = now_datetime();

    if let Some(ref car_num) = car_number {
        let car_num = car_num.trim();
        if !car_num.is_empty() {
            // 1. تسجيل المصروف في جدول car_expenses أولاً
            db.execute(
                "INSERT INTO car_expenses (car_number, description, amount, date, currency, time)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                (
                    car_num,
                    description.trim(),
                    amount,
                    date.trim(),
                    &currency_val,
                    &current_time,
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
                Money::zero(),
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
                Money::zero(),
                amount,
                &currency_val,
                "car_expense",
                &exp_id.to_string(),
                "دفع مصروف سيارة",
                &format!("دفع مصروف سيارة: {} - {}", car_num, description.trim()),
                notes.as_deref(),
            )?;

            if amount > Money::zero() {
                let expense_note =
                    car_expense_partner_note(&db, car_num, description.trim(), exp_id);
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
                // Phase 3: Use comprehensive rebuild that also updates partner profit splits for cash sales
                rebuild_sold_car_accounting_after_cost_change(&db, car_num)?;
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
        Money::zero(),
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
        Money::zero(),
        amount,
        &currency_val,
        "expense",
        &exp_id.to_string(),
        "دفع مصروف",
        &format!("دفع مصروف: {}", description.trim()),
        notes.as_deref(),
    )?;

    // Phase 13: Use source fields for partner transactions
    if amount > Money::zero() {
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
    require_admin_session(&db)?;

    // Delete partner transactions WITH their ledger entries (prevents orphan ledger rows)
    delete_partner_transactions_by_source_with_ledger(
        &db,
        "expense",
        &id.to_string(),
        Some("cash_payment"),
    )?;

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
    amount: Money,
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
    require_admin_session(&db)?;
    let (_, current_time) = now_datetime();

    // 1. Delete old partner transactions WITH their ledger entries
    delete_partner_transactions_by_source_with_ledger(
        &db,
        "expense",
        &id.to_string(),
        Some("cash_payment"),
    )?;

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
        Money::zero(),
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
        Money::zero(),
        amount,
        &currency_val,
        "expense",
        &id.to_string(),
        "دفع مصروف",
        &format!("دفع مصروف: {}", description.trim()),
        notes.as_deref(),
    )?;

    // 5. إعادة توزيع 50% من المصروف على حسابات الشركاء
    if amount > Money::zero() {
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
    amount: Money,
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
    require_admin_session(&db)?;
    let (_, current_time) = now_datetime();

    db.execute(
        "INSERT INTO car_expenses (car_number, description, amount, date, currency, time)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            car_number.trim(),
            description.trim(),
            amount,
            date.trim(),
            &currency_val,
            &current_time,
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
        Money::zero(),
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
        Money::zero(),
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

    if amount > Money::zero() {
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
        let payment_type: String = db
            .query_row(
                "SELECT COALESCE(payment_type, '') FROM cars WHERE car_number = ?1",
                [car_number.trim()],
                |row| row.get(0),
            )
            .unwrap_or_default();

        // Installment/term sales: rebuild ledger at new cost ratio.
        if payment_type != "كاش" {
            rebuild_sold_car_accounting_after_cost_change(&db, car_number.trim())?;
        }
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
    require_admin_session(&db)?;

    // 1. جلب معلومات المصروف
    let row_result = db.query_row(
        "SELECT car_number, amount FROM car_expenses WHERE id = ?1",
        [id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Money>(1)?)),
    );

    if let Ok((car_number, _expense_amount)) = row_result {
        // Delete partner transactions WITH their ledger entries (prevents orphan ledger rows)
        delete_partner_transactions_by_source_with_ledger(
            &db,
            "car_expense",
            &id.to_string(),
            Some("cash_payment"),
        )?;

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
            // Phase 3: Use comprehensive rebuild that also updates partner profit splits for cash sales
            rebuild_sold_car_accounting_after_cost_change(&db, &car_number)?;
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
    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M").to_string();
    (date, time)
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

fn distribute_agency_partner_effects(
    db: &Connection,
    amount: Money,
    currency: &str,
    date: &str,
    note: &str,
    source_type: &str,
    source_id: &str,
) -> Result<(), String> {
    distribute_to_partners_50_with_effects(
        db,
        amount,
        currency,
        date,
        "قاصه",
        "ايداع ارباح وكالة",
        note,
        source_type,
        source_id,
        "cash_movement",
        true,
        true,
        false,
    )?;
    distribute_to_partners_50_with_effects(
        db,
        amount,
        currency,
        date,
        "قاصه",
        "ايداع ارباح وكالة",
        note,
        source_type,
        source_id,
        "profit_recognition",
        false,
        false,
        true,
    )
}

fn rebuild_agency_partner_entries(db: &Connection, agency_id: i64) -> Result<(), String> {
    let agency_info: Result<(String, String, Money, Money, String), rusqlite::Error> = db.query_row(
        "SELECT old_agent_name, new_agent_name, amount_usd, amount_iqd, date FROM agencies WHERE id = ?1",
        [agency_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    );

    let (old_agent_name, new_agent_name, amount_usd, amount_iqd, date) = match agency_info {
        Ok(info) => info,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    // Delete ALL old partner rows for this agency
    // Handles legacy cash_movement, profit_recognition, and current agency_profit rows
    delete_partner_transactions_by_source_with_ledger(db, "agency", &agency_id.to_string(), None)?;

    let note = agency_profit_note(&old_agent_name, &new_agent_name);

    if amount_usd > Money::zero() {
        distribute_agency_partner_effects(
            db,
            amount_usd,
            "USD",
            &date,
            &note,
            "agency",
            &agency_id.to_string(),
        )?;
    }

    if amount_iqd > Money::zero() {
        distribute_agency_partner_effects(
            db,
            amount_iqd,
            "IQD",
            &date,
            &note,
            "agency",
            &agency_id.to_string(),
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
    amount_usd: Money,
    amount_iqd: Money,
    notes: String,
) -> Result<i64, String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

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
    rebuild_agency_partner_entries(&db, new_id)?;

    db.commit().map_err(|e| e.to_string())?;

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
    amount_usd: Money,
    amount_iqd: Money,
    notes: String,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

    // Phase 14: Delete all partner rows by agency_id (cash_movement + profit_recognition)
    delete_partner_transactions_by_source_with_ledger(&db, "agency", &id.to_string(), None)?;

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
    rebuild_agency_partner_entries(&db, id)?;

    db.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_agency(state: State<AppState>, id: i64) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

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
        delete_partner_transactions_by_source_with_ledger(
            &db,
            "agency_transaction",
            &tx_id.to_string(),
            None,
        )?;
        delete_ledger_entries(&db, "agency_transaction", &tx_id.to_string())?;
    }

    // 4. Delete agency transactions and agency record
    db.execute("DELETE FROM agency_transactions WHERE agency_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM agencies WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

    db.commit().map_err(|e| e.to_string())?;

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
    amount: Money,
    date: String,
    notes: Option<String>,
    currency: Option<String>,
) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

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

    // Split agency deposits into cash movement and non-cash profit recognition rows.
    if type_.trim() == "ايداع" && amount > Money::zero() {
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
        distribute_agency_partner_effects(
            &db,
            amount,
            &curr,
            date.trim(),
            &agency_note,
            "agency_transaction",
            &tx_id.to_string(),
        )?;
    }

    db.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_agency_transaction(state: State<AppState>, id: i64) -> Result<(), String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

    // Issue 9: Delete only by source fields, not by names/notes
    // 1. Delete ledger entries for this transaction
    delete_ledger_entries(&db, "agency_transaction", &id.to_string())?;

    // 2. Delete profit rows for this specific transaction by source fields with ledger entries
    delete_partner_transactions_by_source_with_ledger(
        &db,
        "agency_transaction",
        &id.to_string(),
        None,
    )?;

    // 3. Delete the agency transaction record itself
    db.execute("DELETE FROM agency_transactions WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    recalculate_all_partners(&db)?;

    db.commit().map_err(|e| e.to_string())?;

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
    let qasa_iqd: Money = db.query_row(
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
    ).unwrap_or(Money::zero());
    let qasa_usd: Money = db.query_row(
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
    ).unwrap_or(Money::zero());

    let cash_iqd: Money = db
        .query_row(
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
        )
        .unwrap_or(Money::zero());
    let cash_usd: Money = db
        .query_row(
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
        )
        .unwrap_or(Money::zero());

    // 2. Inventory Value — from ledger entries. Car purchases, including cash purchases,
    // are recorded via record_car_purchase_ledger_entries(), so adding cars.purchase_price here
    // would count the same vehicle twice.
    let ledger_inventory_iqd: Money = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let ledger_inventory_usd: Money = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let inventory_value_iqd = ledger_inventory_iqd;
    let inventory_value_usd = ledger_inventory_usd;

    // 3. Total Investments
    let total_investments_iqd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'investor' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let total_investments_usd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'investor' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());

    // 4. Total Partner Capital
    let total_partner_capital_iqd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'capital' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let total_partner_capital_usd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'capital' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());

    // 5. Total Debtors
    let total_debtors_iqd: Money = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'receivable' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let total_debtors_usd: Money = db.query_row(
        "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'receivable' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());

    // 6. Total Expenses — only general expenses from Expenses tab, not COGS or car expenses
    let total_expenses_iqd: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
         WHERE COALESCE(currency, 'IQD') = 'IQD'
           AND (car_number IS NULL OR car_number = '')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());
    let total_expenses_usd: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
         WHERE COALESCE(currency, 'IQD') = 'USD'
           AND (car_number IS NULL OR car_number = '')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());

    // 7. Net Capital (Assets - Liabilities = (cash + inventory + receivable) - (investor + funder + payable))
    let total_funders_iqd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'funder' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let total_funders_usd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'funder' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());

    let total_payables_iqd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'payable' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let total_payables_usd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'payable' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());

    // 7b. Deferred Revenue — credit balance from installment/term sales (account_type = 'deferred_revenue')
    let deferred_revenue_iqd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'deferred_revenue' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let deferred_revenue_usd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'deferred_revenue' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());

    // 7c. Deferred Expenses — reserved for future use
    let deferred_expense_iqd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'deferred_expense' AND currency = 'IQD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());
    let deferred_expense_usd: Money = db.query_row(
        "SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'deferred_expense' AND currency = 'USD'",
        [],
        |row| row.get(0),
    ).unwrap_or(Money::zero());

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

#[tauri::command]
fn get_partners_totals(state: State<AppState>, kind: String) -> Result<(Money, Money), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let filter_kind = match kind.as_str() {
        "partners-financial" => vec!["شريك", "مستثمر", "ممول", "شركة"],
        "partners-only" => vec!["شريك"],
        "customers-only" => vec!["مستثمر", "ممول", "شركة", "زبون"],
        _ => vec![kind.as_str()],
    };

    let mut iqd_total = Money::zero();
    let mut usd_total = Money::zero();

    for k in &filter_kind {
        // Task 7: Use affects_* flags for partner/investor, keep debt logic for customers
        let (sql, use_param): (&str, bool) = if *k == "شريك" {
            (
                "SELECT
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
             GROUP BY currency",
                false,
            )
        } else if *k == "مستثمر" {
            (
                "SELECT
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
             GROUP BY currency",
                false,
            )
        } else if *k == "زبون" {
            // Customer: balance = sum of unpaid remaining rows across all customers
            (
                "SELECT COALESCE(SUM(amount), 0.0), COALESCE(currency, 'IQD')
             FROM partner_transactions
             WHERE kind = 'زبون'
             AND (type LIKE 'باقي%' OR type LIKE 'سحب%')
             AND type NOT LIKE 'تحويل%'
             GROUP BY COALESCE(currency, 'IQD')",
                false,
            )
        } else {
            (
                "SELECT
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
             GROUP BY currency",
                true,
            )
        };

        let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
        let mut row_pairs: Vec<(Money, String)> = Vec::new();
        if use_param {
            let mut rows = stmt.query([k]).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                row_pairs.push((
                    row.get(0).map_err(|e| e.to_string())?,
                    row.get(1).map_err(|e| e.to_string())?,
                ));
            }
        } else {
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                row_pairs.push((
                    row.get(0).map_err(|e| e.to_string())?,
                    row.get(1).map_err(|e| e.to_string())?,
                ));
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

fn calculate_analytical_profit(
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
    let use_time = end_date.is_none() && !start_time.trim().is_empty();
    let date_filter = if let Some(end) = end_date {
        format!("(sale_date >= '{}' AND sale_date <= '{}')", start_date, end)
    } else {
        format!(
            "(sale_date > '{}' OR (sale_date = '{}' AND COALESCE(sale_time, '00:00') >= '{}'))",
            start_date, start_date, effective_time
        )
    };
    let pt_date_filter = if let Some(end) = end_date {
        format!("(pt.date >= '{}' AND pt.date <= '{}')", start_date, end)
    } else {
        format!(
            "(pt.date > '{}' OR (pt.date = '{}' AND COALESCE(pt.time, '00:00') >= '{}'))",
            start_date, start_date, effective_time
        )
    };
    let agency_date_filter = if let Some(end) = end_date {
        format!("(date >= '{}' AND date <= '{}')", start_date, end)
    } else if use_time {
        format!(
            "(date > '{}' OR (date = '{}' AND COALESCE(time, '00:00') >= '{}'))",
            start_date, start_date, effective_time
        )
    } else {
        format!("date >= '{}'", start_date)
    };

    // 1. Cash car profits
    let cash_sql = format!(
        "SELECT purchase_price, selling_price, COALESCE(expenses_at_sale, 0),
                COALESCE(sale_currency, 'IQD')
         FROM cars
         WHERE status = 'مبيوعة'
           AND COALESCE(payment_type, 'كاش') = 'كاش'
           AND {}",
        date_filter
    );
    let mut cash_stmt = db.prepare(&cash_sql).map_err(|e| e.to_string())?;
    let cash_rows: Vec<(Money, Money, Money, String)> = cash_stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(cash_stmt);

    let mut profit_iqd = Money::zero();
    let mut profit_usd = Money::zero();
    for (purchase_price, selling_price, expenses, sale_currency) in cash_rows {
        let car_profit = selling_price - purchase_price - expenses;
        if car_profit > Money::zero() {
            if sale_currency == "IQD" {
                profit_iqd += car_profit;
            } else {
                profit_usd += car_profit;
            }
        }
    }

    // 2. Installment/down-payment profits explicitly recognized from customer payments
    let install_sql = format!(
        "SELECT COALESCE(SUM(pt.amount), 0.0), COALESCE(pt.currency, 'IQD')
         FROM partner_transactions pt
         WHERE pt.kind = 'شريك'
           AND pt.source_type = 'customer_payment'
           AND pt.source_role = 'profit_recognition'
           AND COALESCE(pt.affects_profit, 0) = 1
           AND pt.related_source_type = 'car'
           AND COALESCE(pt.is_reversed, 0) = 0
           AND {}
         GROUP BY COALESCE(pt.currency, 'IQD')",
        pt_date_filter
    );
    let mut install_stmt = db.prepare(&install_sql).map_err(|e| e.to_string())?;
    let install_rows: Vec<(Money, String)> = install_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(install_stmt);

    for (payment_profit, currency) in install_rows {
        if currency == "IQD" {
            profit_iqd += payment_profit;
        } else {
            profit_usd += payment_profit;
        }
    }

    // 3. Agency profits
    let agency_iqd_sql = format!(
        "SELECT COALESCE(SUM(amount), 0) FROM agency_transactions
         WHERE COALESCE(currency, 'IQD') = 'IQD' AND {}",
        agency_date_filter
    );
    let agency_iqd: Money = db
        .query_row(&agency_iqd_sql, [], |row| row.get(0))
        .unwrap_or(Money::zero());
    let agency_usd_sql = format!(
        "SELECT COALESCE(SUM(amount), 0) FROM agency_transactions
         WHERE COALESCE(currency, 'IQD') = 'USD' AND {}",
        agency_date_filter
    );
    let agency_usd: Money = db
        .query_row(&agency_usd_sql, [], |row| row.get(0))
        .unwrap_or(Money::zero());

    // Also include initial agency amounts from agencies table
    let agencies_iqd_sql = format!(
        "SELECT COALESCE(SUM(amount_iqd), 0) FROM agencies
         WHERE {}",
        agency_date_filter
    );
    let agencies_iqd: Money = db
        .query_row(&agencies_iqd_sql, [], |row| row.get(0))
        .unwrap_or(Money::zero());
    let agencies_usd_sql = format!(
        "SELECT COALESCE(SUM(amount_usd), 0) FROM agencies
         WHERE {}",
        agency_date_filter
    );
    let agencies_usd: Money = db
        .query_row(&agencies_usd_sql, [], |row| row.get(0))
        .unwrap_or(Money::zero());

    profit_iqd += agency_iqd + agencies_iqd;
    profit_usd += agency_usd + agencies_usd;

    Ok((profit_iqd, profit_usd))
}

fn calculate_profit_totals_since(
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
    let general_expenses_iqd: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'IQD'
               AND (car_number IS NULL OR car_number = '')
               AND (date > ?1 OR (date = ?1 AND COALESCE(time, '00:00') >= ?2))",
            params![start_date, effective_time],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());
    let general_expenses_usd: Money = db
        .query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'USD'
               AND (car_number IS NULL OR car_number = '')
               AND (date > ?1 OR (date = ?1 AND COALESCE(time, '00:00') >= ?2))",
            params![start_date, effective_time],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero());

    Ok((
        profit_iqd - general_expenses_iqd,
        profit_usd - general_expenses_usd,
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
    let latest_reset = db
        .query_row(
            "SELECT date, time FROM profit_distributions
         WHERE notes LIKE 'manual-reset:%' AND date >= ?1
         ORDER BY date DESC, time DESC, id DESC
         LIMIT 1",
            params![&month_start],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .ok();

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

    // Calculate total analytical profit for the period, split 50/50 per partner
    let end_ref: Option<&str> = if use_time { None } else { Some(&end) };
    let (total_profit_iqd, total_profit_usd) =
        calculate_analytical_profit(&db, &start, end_ref, effective_start_time)?;
    let half_iqd = total_profit_iqd / Money::from_i64(2);
    let half_usd = total_profit_usd / Money::from_i64(2);

    let mut partners = Vec::new();
    for name in partners_list {
        let profit_iqd = half_iqd;
        let profit_usd = half_usd;

        // Query IQD drawings (only type = 'سحب شريك', excluding expenses)
        let drawings_iqd: Money = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'IQD'
               AND type = 'سحب شريك'
               AND date >= ?2 AND date <= ?3",
                params![&name, &start, &end],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());

        // Query USD drawings (only type = 'سحب شريك', excluding expenses)
        let drawings_usd: Money = db
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE kind = 'شريك' AND partner_name = ?1 AND COALESCE(currency, 'IQD') = 'USD'
               AND type = 'سحب شريك'
               AND date >= ?2 AND date <= ?3",
                params![&name, &start, &end],
                |row| row.get(0),
            )
            .unwrap_or(Money::zero());

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
    let expenses_iqd: Money = if use_time {
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
        )
        .unwrap_or(Money::zero())
    } else {
        db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'IQD'
               AND (car_number IS NULL OR car_number = '')
               AND date >= ?1 AND date <= ?2",
            params![&start, &end],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero())
    };

    let expenses_usd: Money = if use_time {
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
        )
        .unwrap_or(Money::zero())
    } else {
        db.query_row(
            "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
             WHERE COALESCE(currency, 'IQD') = 'USD'
               AND (car_number IS NULL OR car_number = '')
               AND date >= ?1 AND date <= ?2",
            params![&start, &end],
            |row| row.get(0),
        )
        .unwrap_or(Money::zero())
    };

    let mut undistributed_iqd = Money::zero();
    let mut undistributed_usd = Money::zero();
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
    let base_dir = backgrounds_base_dir()?;

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
                if is_background_image_extension(&ext_lower) {
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

#[derive(Serialize, Deserialize)]
struct BackgroundSelection {
    selected_background: String,
}

fn project_backgrounds_dir() -> Result<PathBuf, String> {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    Ok(manifest_dir
        .parent()
        .ok_or_else(|| "تعذر العثور على المجلد الأب لمشروع Rust".to_string())?
        .join("public")
        .join("backgrounds"))
}

fn bundled_backgrounds_dir() -> Result<PathBuf, String> {
    let exe_path = env::current_exe().map_err(|e| format!("تعذر معرفة مسار البرنامج: {e}"))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "تعذر معرفة مجلد البرنامج".to_string())?;

    let public_path = exe_dir.join("public").join("backgrounds");
    if public_path.exists() {
        Ok(public_path)
    } else {
        Ok(exe_dir.join("backgrounds"))
    }
}

fn backgrounds_base_dir() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        project_backgrounds_dir()
    } else {
        bundled_backgrounds_dir()
    }
}

fn is_background_image_extension(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp")
}

fn normalize_background_path(value: &str) -> Result<String, String> {
    let normalized = value.trim().replace('\\', "/");
    let path_part = normalized.split(['?', '#']).next().unwrap_or("").trim();
    let filename = path_part
        .rsplit('/')
        .next()
        .ok_or_else(|| "مسار الخلفية غير صالح".to_string())?
        .trim();

    if filename.is_empty() || filename.contains('/') || filename.contains('\\') {
        return Err("اسم ملف الخلفية غير صالح".to_string());
    }

    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .ok_or_else(|| "الخلفية لا تحتوي على امتداد صورة صالح".to_string())?;

    if !is_background_image_extension(&ext) || filename.to_lowercase().contains("logo") {
        return Err("نوع ملف الخلفية غير مدعوم".to_string());
    }

    Ok(format!("/backgrounds/{filename}"))
}

fn read_selected_background_file(path: &std::path::Path) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;

    if let Ok(selection) = serde_json::from_str::<BackgroundSelection>(&contents) {
        return normalize_background_path(&selection.selected_background).ok();
    }

    if let Ok(selection) = serde_json::from_str::<String>(&contents) {
        return normalize_background_path(&selection).ok();
    }

    normalize_background_path(contents.trim()).ok()
}

fn write_selected_background_file(path: &std::path::Path, background: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("تعذر إنشاء مجلد إعداد الخلفية: {e}"))?;
    }

    let selection = BackgroundSelection {
        selected_background: background.to_string(),
    };
    let json = serde_json::to_string_pretty(&selection)
        .map_err(|e| format!("تعذر تجهيز إعداد الخلفية: {e}"))?;
    std::fs::write(path, json).map_err(|e| format!("تعذر حفظ الخلفية المختارة: {e}"))
}

#[tauri::command]
fn get_selected_background(state: State<AppState>) -> Result<Option<String>, String> {
    let bundled_path = backgrounds_base_dir()?.join(SELECTED_BACKGROUND_FILE);
    let runtime_path = if cfg!(debug_assertions) {
        bundled_path.clone()
    } else {
        state.app_dir.join(SELECTED_BACKGROUND_FILE)
    };

    if let Some(background) = read_selected_background_file(&runtime_path) {
        return Ok(Some(background));
    }

    if runtime_path != bundled_path {
        if let Some(background) = read_selected_background_file(&bundled_path) {
            return Ok(Some(background));
        }
    }

    Ok(None)
}

#[tauri::command]
fn set_selected_background(state: State<AppState>, background: String) -> Result<String, String> {
    let normalized = normalize_background_path(&background)?;
    let target_path = if cfg!(debug_assertions) {
        backgrounds_base_dir()?.join(SELECTED_BACKGROUND_FILE)
    } else {
        state.app_dir.join(SELECTED_BACKGROUND_FILE)
    };

    write_selected_background_file(&target_path, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
fn rename_background(file_path: String) -> Result<String, String> {
    let base_dir = backgrounds_base_dir()?;

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
    let base_dir = backgrounds_base_dir()?;

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

/// hash_password: Memory-hard Argon2id password hashing with a random salt.
fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Password hashing failed: {e}"))
}

/// verify_password: Verify a password against a stored hash.
/// Supports both Argon2 PHC strings (new) and legacy SHA-256 hex strings.
fn verify_password(password: &str, stored_hash: &str) -> bool {
    match PasswordHash::new(stored_hash) {
        Ok(parsed_hash) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok(),
        Err(_) => {
            let mut hasher = Sha256::new();
            hasher.update(password.as_bytes());
            hex::encode(hasher.finalize()) == stored_hash
        }
    }
}

#[allow(dead_code)]
fn get_partner_names_for_distribution(db: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك'")
        .map_err(|e| e.to_string())?;

    let names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(names)
}

// ==================== PHASE 2: CENTRALIZED PARTNER TRANSACTION HELPERS ====================

#[allow(clippy::too_many_arguments)]
fn insert_partner_transaction_with_effects(
    db: &Connection,
    partner_name: &str,
    kind: &str,
    type_: &str,
    amount: Money,
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
        db,
        partner_name,
        kind,
        type_,
        amount,
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
        None,
        None,
    )
}

#[allow(clippy::too_many_arguments)]
fn insert_partner_transaction_with_effects_and_related(
    db: &Connection,
    partner_name: &str,
    kind: &str,
    type_: &str,
    amount: Money,
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
    if amount <= Money::zero() {
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
    amount: Money,
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
    if amount <= Money::zero() {
        return Ok(());
    }
    let partners: Vec<String> = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    if partners.len() != 2 {
        return Err(format!(
            "يجب أن يكون هناك شريكان بالضبط، وجد {}",
            partners.len()
        ));
    }
    let (share1, share2) = split_partner_amount_50(amount.0);
    insert_partner_transaction_with_effects(
        db,
        &partners[0],
        "شريك",
        tx_type,
        Money(share1),
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
    insert_partner_transaction_with_effects(
        db,
        &partners[1],
        "شريك",
        tx_type,
        Money(share2),
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
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn distribute_to_partners_50_with_effects_and_related(
    db: &Connection,
    amount: Money,
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
    if amount <= Money::zero() {
        return Ok(());
    }
    let partners: Vec<String> = db
        .prepare("SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    if partners.len() != 2 {
        return Err(format!(
            "يجب أن يكون هناك شريكان بالضبط، وجد {}",
            partners.len()
        ));
    }
    let (share1, share2) = split_partner_amount_50(amount.0);
    insert_partner_transaction_with_effects_and_related(
        db,
        &partners[0],
        "شريك",
        tx_type,
        Money(share1),
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
    insert_partner_transaction_with_effects_and_related(
        db,
        &partners[1],
        "شريك",
        tx_type,
        Money(share2),
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
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn deduct_from_partners_5050_with_effects(
    db: &Connection,
    amount: Money,
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
        db,
        amount,
        currency,
        date,
        payment_type,
        tx_type,
        notes,
        source_type,
        source_id,
        source_role,
        affects_qasa,
        affects_partner_cash,
        affects_profit,
    )
}

// ==================== COMPANY SETTLEMENT THROUGH FUNDER ====================

#[tauri::command]
fn settle_company_through_funder(
    state: State<AppState>,
    company_name: String,
    funder_name: String,
    amount: Money,
    date: String,
    currency: Option<String>,
) -> Result<(), String> {
    validate_positive_amount(amount, "المبلغ")?;
    validate_required_text(&company_name, "اسم الشركة")?;
    validate_required_text(&funder_name, "اسم الممول")?;
    validate_required_text(&date, "التاريخ")?;
    let curr = currency.as_deref().unwrap_or("IQD");
    validate_currency(curr)?;

    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;
    let time_str = db
        .query_row("SELECT strftime('%H:%M', 'now', 'localtime')", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "00:00".to_string());

    // 1. Create company withdrawal with special note
    let note = format!(
        "تسديد {} من قبل {}",
        company_name.trim(),
        funder_name.trim()
    );
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

    db.commit().map_err(|e| e.to_string())?;
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
    pub password_change_required: bool,
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
        "SELECT id, username, display_name, profile_image, password_hash, COALESCE(must_change_password, 0) FROM users WHERE username = ?1",
        [username],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, bool>(5)?,
            ))
        },
    );

    match result {
        Ok((id, uname, display_name, profile_image, stored_hash, must_change_password)) => {
            if verify_password(password, &stored_hash) {
                // تحديث آخر تسجيل دخول
                let _ = db.execute(
                    "UPDATE users SET last_login = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?1",
                    [id],
                );
                Ok(LoginResult {
                    success: true,
                    user: Some(UserInfo {
                        id,
                        username: uname,
                        display_name,
                        profile_image,
                    }),
                    error: None,
                    password_change_required: must_change_password,
                })
            } else {
                Ok(LoginResult {
                    success: false,
                    user: None,
                    error: Some("كلمة المرور غير صحيحة".to_string()),
                    password_change_required: false,
                })
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(LoginResult {
            success: false,
            user: None,
            error: Some("اسم المستخدم غير موجود".to_string()),
            password_change_required: false,
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
    require_admin_session(&db)?;
    let username = username.trim();
    let display_name = display_name.trim();

    if username.is_empty() {
        return Err("اسم المستخدم مطلوب".to_string());
    }
    if password.len() < 3 {
        return Err("كلمة المرور يجب أن تكون 3 أحرف على الأقل".to_string());
    }

    let hash =
        hash_password(password.trim()).map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))?;

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
    require_admin_session(&db)?;

    db.execute(
        "UPDATE users SET username = ?1, display_name = ?2, profile_image = ?3, updated_at = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?4",
        params![username.trim(), display_name.trim(), profile_image, id],
    )
    .map_err(|e| format!("فشل تحديث المستخدم: {}", e))?;

    Ok(())
}

#[tauri::command]
fn change_password(state: State<AppState>, id: i64, new_password: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

    if new_password.trim().len() < 3 {
        return Err("كلمة المرور يجب أن تكون 3 أحرف على الأقل".to_string());
    }

    let hash =
        hash_password(new_password.trim()).map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))?;
    db.execute(
        "UPDATE users SET password_hash = ?1, must_change_password = 0, updated_at = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?2",
        params![hash, id],
    )
    .map_err(|e| format!("فشل تغيير كلمة المرور: {}", e))?;

    Ok(())
}

#[tauri::command]
fn delete_user(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    require_admin_session(&db)?;

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
            table_name: "partner_transactions",
            sheet_name: "القاصة",
            title: "قسم القاصة (حركات القاصة من حركات الشركاء)",
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
    worksheet
        .set_freeze_panes(4, 0)
        .map_err(|e| e.to_string())?;

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
    worksheet.set_row_height(0, 26).map_err(|e| e.to_string())?;
    worksheet.set_row_height(1, 21).map_err(|e| e.to_string())?;

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
        .query_row(
            "SELECT strftime('%d-%m-%Y', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
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

fn perform_hourly_backup(db_path: &str) -> Result<(), String> {
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_path = format!("{}.backup_{}", db_path, timestamp);

    let source = Connection::open(db_path).map_err(|e| format!("فشل فتح قاعدة البيانات: {}", e))?;

    source
        .backup(rusqlite::DatabaseName::Main, &backup_path, None)
        .map_err(|e| format!("فشل إنشاء النسخة الاحتياطية: {}", e))?;

    // Cleanup old backups - keep last 24
    let dir = std::path::Path::new(db_path)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut backups: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name().to_string_lossy().starts_with(&format!(
                    "{}.backup_",
                    std::path::Path::new(db_path)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                ))
            })
            .collect();
        backups.sort_by_key(|entry| std::cmp::Reverse(entry.file_name()));
        for entry in &backups[24.min(backups.len())..] {
            let _ = std::fs::remove_file(entry.path());
        }
    }

    Ok(())
}

fn run_backup_loop(db_path: PathBuf) {
    // Wait 5 minutes before the first backup after program startup
    std::thread::sleep(std::time::Duration::from_secs(300));

    loop {
        let _ = perform_hourly_backup(db_path.to_str().unwrap_or("."));
        // Sleep for 1 hour
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}

#[cfg(feature = "accounting-test-support")]
pub mod accounting_test_support;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
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
            open_temp_pdf,
            rename_background,
            delete_background,
            get_backgrounds,
            get_selected_background,
            set_selected_background,
            login,
            get_users,
            add_user,
            update_user,
            change_password,
            delete_user,
            export_database_to_excel,
            update_customer_sale_down_payment,
            pay_customer_installment,
            reverse_customer_installment_payment,
            preview_installment_payment_redistribution,
            recalculate_installment_schedule,
            get_customer_installments,
            set_customer_installment_status,
            settle_company_through_funder,
        ]);

    if let Err(error) = builder.run(tauri::generate_context!()) {
        eprintln!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod strict_accounting_invariants {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_distribute_to_partners_50_even() {
        let (p1, p2) = split_partner_amount_50(dec!(10000000));
        assert_eq!(p1 + p2, dec!(10000000));
        assert_eq!(p1, dec!(5000000));
        assert_eq!(p2, dec!(5000000));
    }

    #[test]
    fn test_distribute_to_partners_50_odd() {
        let mut p1_total = Decimal::ZERO;
        let mut p2_total = Decimal::ZERO;
        for _ in 0..1000 {
            let (p1, p2) = split_partner_amount_50(dec!(10000001));
            assert_eq!(p1 + p2, dec!(10000001));
            p1_total += p1;
            p2_total += p2;
        }
        assert!((p1_total - p2_total).abs() <= dec!(1));
    }

    #[test]
    fn test_distribute_to_partners_50_zero() {
        let (p1, p2) = split_partner_amount_50(dec!(0));
        assert_eq!(p1, dec!(0));
        assert_eq!(p2, dec!(0));
    }

    #[test]
    fn test_distribute_to_partners_50_negative() {
        let (p1, p2) = split_partner_amount_50(dec!(-1000));
        assert_eq!(p1 + p2, dec!(-1000));
    }

    #[test]
    fn test_money_arithmetic() {
        let a = Money(dec!(1000));
        let b = Money(dec!(300));
        assert_eq!(a - b, Money(dec!(700)));
        assert_eq!(a + b, Money(dec!(1300)));
        assert_eq!(a / Money(dec!(2)), Money(dec!(500)));
        assert_eq!(-a, Money(dec!(-1000)));
    }

    #[test]
    fn test_money_zero_is_zero() {
        assert!(Money::zero().is_zero());
        assert!(!Money(dec!(1)).is_zero());
    }

    #[test]
    fn test_money_abs() {
        assert_eq!(Money(dec!(-5)).abs(), Money(dec!(5)));
        assert_eq!(Money(dec!(5)).abs(), Money(dec!(5)));
    }

    #[test]
    fn test_money_serialization_roundtrip() {
        let m = Money(dec!(12345.67));
        let json = serde_json::to_string(&m).unwrap();
        assert!(
            json.contains("12345.67"),
            "Expected string serialization, got: {}",
            json
        );
        let back: Money = serde_json::from_str(&json).unwrap();
        assert_eq!(m, back);
    }

    #[test]
    fn test_money_serialization_large_amount() {
        let m = Money(dec!(9999999999999.99));
        let json = serde_json::to_string(&m).unwrap();
        let back: Money = serde_json::from_str(&json).unwrap();
        assert_eq!(
            m, back,
            "Precision lost in serialization roundtrip for large amount"
        );
    }

    #[test]
    fn test_money_deserialization_rejects_json_float() {
        let string_money: Money = serde_json::from_str("\"12345.67\"").unwrap();
        assert_eq!(string_money, Money(dec!(12345.67)));

        let float_result = serde_json::from_str::<Money>("12345.67");
        assert!(
            float_result.is_err(),
            "JSON floats must not be accepted for monetary values"
        );
    }

    #[test]
    fn test_extract_car_number_preserves_spaces() {
        let extracted = extract_car_number_from_notes("دفعة #بيع_سيارة_CAR 123 A | قسط#9");
        assert_eq!(extracted.as_deref(), Some("CAR 123 A"));
    }

    #[test]
    fn test_reverse_ledger_entries_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE financial_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                account_type TEXT NOT NULL,
                account_id TEXT,
                debit TEXT NOT NULL,
                credit TEXT NOT NULL,
                currency TEXT NOT NULL,
                reference_type TEXT NOT NULL,
                reference_id TEXT NOT NULL,
                type_ TEXT NOT NULL,
                description TEXT NOT NULL,
                notes TEXT
            )",
            [],
        )
        .unwrap();
        record_ledger_entry(
            &conn,
            "2026-01-01",
            "00:00",
            "cash",
            Some("قاصه"),
            Money(dec!(100)),
            Money::zero(),
            "IQD",
            "partner_transaction",
            "1",
            "اختبار",
            "اختبار",
            None,
        )
        .unwrap();
        reverse_ledger_entries(&conn, "partner_transaction", "1").unwrap();
        reverse_ledger_entries(&conn, "partner_transaction", "1").unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM financial_ledger WHERE reference_type = 'partner_transaction' AND reference_id = '1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_money_columns_migrate_to_text_affinity() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL NOT NULL DEFAULT 0.0)", []).unwrap();
        conn.execute("INSERT INTO sample (amount) VALUES (1234567.89)", [])
            .unwrap();
        migrate_money_columns_to_text(&conn, "sample", &["amount"]).unwrap();
        let col_type: String = conn
            .query_row(
                "SELECT type FROM pragma_table_info('sample') WHERE name = 'amount'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(col_type.to_uppercase(), "TEXT");
        let value: Money = conn
            .query_row("SELECT amount FROM sample WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(value, Money(dec!(1234567.89)));
    }

    #[test]
    fn test_money_migration_preserves_expression_defaults() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE sample (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL NOT NULL,
                time TEXT DEFAULT (strftime('%H:%M', 'now', 'localtime'))
            )",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO sample (amount) VALUES (42.5)", [])
            .unwrap();

        migrate_money_columns_to_text(&conn, "sample", &["amount"]).unwrap();

        let amount_type: String = conn
            .query_row(
                "SELECT type FROM pragma_table_info('sample') WHERE name = 'amount'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let time_default: String = conn
            .query_row(
                "SELECT dflt_value FROM pragma_table_info('sample') WHERE name = 'time'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(amount_type.to_uppercase(), "TEXT");
        assert!(time_default.contains("strftime"));
    }

    #[test]
    fn test_installment_profit_never_exceeds_full_profit() {
        let purchase = Money(dec!(10000000));
        let selling = Money(dec!(20000000));
        let car_expenses = Money::zero();
        let full_profit = selling - purchase - car_expenses;
        let profit_ratio = full_profit / selling;

        // Simulate payments that sum to selling price: 5M down + 15x 1M installments
        let mut payments: Vec<Money> = vec![Money(dec!(5000000))];
        for _ in 0..15 {
            payments.push(Money(dec!(1000000)));
        }

        let mut total_recognized = Money::zero();
        for payment in &payments {
            let raw_profit = *payment * profit_ratio;
            let remaining = full_profit - total_recognized;
            let capped = if raw_profit < remaining {
                raw_profit
            } else {
                remaining
            };
            total_recognized = total_recognized + capped;
            assert!(total_recognized <= full_profit, "Exceeded full profit!");
        }
        assert_eq!(total_recognized, full_profit);
    }

    #[test]
    fn test_rebuild_installment_schedule_flow() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        // 1. Insert a sold car
        conn.execute(
            "INSERT INTO cars (car_number, car_name, status, payment_type, selling_price, amount_paid, amount_remaining, installment_months, first_payment_date, sale_currency, sale_date, buyer_name, buyer_phone)
             VALUES ('CAR123', 'Toyota Camry', 'مبيوعة', 'اقساط', '20000000', '5000000', '15000000', 3, '2026-07-01', 'IQD', '2026-06-28', 'احمد', '07800000000')",
            []
        ).unwrap();

        // 2. Insert down payment row
        conn.execute(
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id)
             VALUES ('احمد', 'زبون', 'واصل قسط', '5000000', '2026-06-28', '12:00:00', 'مقدمة بيع سيارة', 'IQD', 'قاصه', 'car_sale', 'sale_down_payment', 1, 1, 0, 'car', 'CAR123')",
            []
        ).unwrap();

        // 3. Rebuild the schedule (it should generate 3 installment template rows of 5,000,000 each)
        rebuild_installment_schedule(&conn, "CAR123").unwrap();

        // Verify we have 3 unpaid template rows
        let unpaid_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM partner_transactions WHERE kind = 'زبون' AND type = 'باقي قسط' AND related_source_id = 'CAR123'",
            [],
            |row| row.get(0)
        ).unwrap();
        assert_eq!(unpaid_count, 3);

        // 4. Now, customer pays the first installment with 6,000,000.
        // New event-sourced behavior: the selected installment is paid and
        // the 1,000,000 overpayment is redistributed over future unpaid rows.
        let first_installment_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions
             WHERE kind = 'زبون' AND type = 'باقي قسط' AND related_source_id = 'CAR123'
             ORDER BY COALESCE(due_date, date), id LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        pay_customer_installment_core(
            &conn,
            first_installment_id,
            "احمد",
            Money(dec!(6000000)),
            "2026-07-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let paid_full: i64 = conn.query_row(
            "SELECT COUNT(*) FROM partner_transactions WHERE kind = 'زبون' AND type = 'واصل قسط' AND notes NOT LIKE '%جزئي%' AND source_type = 'customer_installment_schedule'",
            [],
            |row| row.get(0)
        ).unwrap();
        assert_eq!(paid_full, 1);

        let unpaid: i64 = conn.query_row(
            "SELECT COUNT(*) FROM partner_transactions WHERE kind = 'زبون' AND type = 'باقي قسط'",
            [],
            |row| row.get(0)
        ).unwrap();
        assert_eq!(unpaid, 2);

        let unpaid_sum: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
             WHERE kind = 'زبون' AND type = 'باقي قسط' AND related_source_id = 'CAR123'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(unpaid_sum, Money(dec!(9000000)));
    }

    #[test]
    fn test_legacy_due_installment_source_id_can_be_paid() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type, selling_price, amount_paid,
                amount_remaining, installment_months, delivery_date, sale_currency,
                sale_date, buyer_name, buyer_phone
             ) VALUES ('DUE_LEGACY', 'Due Car', 'مبيوعة', 'موعد', '20000000', '5000000',
                '15000000', 1, '2026-07-01', 'IQD', '2026-06-01', 'احمد', '07800000000')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_role, affects_qasa, affects_partner_cash,
                affects_profit, related_source_type, related_source_id
             ) VALUES (
                'احمد', 'زبون', 'مقدمة بيع سيارة', '5000000', '2026-06-01', '12:00:00',
                'مقدمة بيع سيارة', 'IQD', 'قاصه',
                'customer_sale_payment', 'DUE_LEGACY:down_payment', 'sale_down_payment',
                1, 1, 0, 'car', 'DUE_LEGACY'
             )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_role, affects_qasa, affects_partner_cash,
                affects_profit, related_source_type, related_source_id
             ) VALUES (
                'احمد', 'زبون', 'باقي قسط', '15000000', '2026-07-01', '12:00:00',
                'باقي موعد تسليم', 'IQD', 'قاصه',
                'customer_installment_schedule', 'DUE_LEGACY:due:1', 'installment_schedule',
                0, 0, 0, 'car', 'DUE_LEGACY'
             )",
            [],
        )
        .unwrap();
        let legacy_installment_id = conn.last_insert_rowid();

        pay_customer_installment_core(
            &conn,
            legacy_installment_id,
            "احمد",
            Money(dec!(15000000)),
            "2026-07-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let (source_id, tx_type): (String, String) = conn
            .query_row(
                "SELECT source_id, type
                 FROM partner_transactions
                 WHERE id = ?1",
                [legacy_installment_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(source_id, "DUE_LEGACY:installment:1");
        assert!(tx_type.starts_with("واصل"));
    }

    #[test]
    fn test_direct_sale_uses_existing_customer_phone_when_form_phone_is_empty() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let tx = conn.transaction().unwrap();
        tx.execute(
            "INSERT INTO partners (partner_name, phone, total_amount, kind)
             VALUES ('احمد', '٠٧٨١٢٣٤٥٦٧٨', '0', 'زبون')",
            [],
        )
        .unwrap();

        let phone = resolve_existing_customer_phone(&tx, "احمد", "");

        assert_eq!(phone, "07812345678");
        tx.rollback().unwrap();
    }

    #[test]
    fn test_due_delivery_date_survives_payment_when_first_payment_date_is_blank() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type, selling_price, amount_paid,
                amount_remaining, installment_months, delivery_date, first_payment_date,
                sale_currency, sale_date, buyer_name, buyer_phone
             ) VALUES (
                'DUE_KEEP_DATE', 'Due Date Car', 'مبيوعة', 'موعد', '20000000', '5000000',
                '15000000', 1, '2026-08-15', '', 'IQD', '2026-06-01', 'احمد', '07800000000'
             )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_role, affects_qasa, affects_partner_cash,
                affects_profit, related_source_type, related_source_id
             ) VALUES (
                'احمد', 'زبون', 'مقدمة بيع سيارة', '5000000', '2026-06-01', '12:00:00',
                'مقدمة بيع سيارة', 'IQD', 'قاصه',
                'customer_sale_payment', 'DUE_KEEP_DATE:down_payment', 'sale_down_payment',
                1, 1, 0, 'car', 'DUE_KEEP_DATE'
             )",
            [],
        )
        .unwrap();

        rebuild_installment_schedule(&conn, "DUE_KEEP_DATE").unwrap();
        let installment_id: i64 = conn
            .query_row(
                "SELECT id
                 FROM partner_transactions
                 WHERE source_type = 'customer_installment_schedule'
                   AND source_role = 'installment_schedule'
                   AND related_source_id = 'DUE_KEEP_DATE'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let before_date: String = conn
            .query_row(
                "SELECT COALESCE(due_date, date)
                 FROM partner_transactions
                 WHERE id = ?1",
                [installment_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(before_date, "2026-08-15");

        pay_customer_installment_core(
            &conn,
            installment_id,
            "احمد",
            Money(dec!(15000000)),
            "2026-08-15",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let (after_date, tx_type): (String, String) = conn
            .query_row(
                "SELECT COALESCE(due_date, date), type
                 FROM partner_transactions
                 WHERE id = ?1",
                [installment_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(after_date, "2026-08-15");
        assert!(tx_type.starts_with("واصل"));
    }

    fn seed_event_sourced_installment_car(
        conn: &Connection,
        car_number: &str,
        customer: &str,
        currency: &str,
    ) {
        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type, selling_price, amount_paid,
                amount_remaining, installment_months, first_payment_date, sale_currency,
                sale_date, buyer_name, buyer_phone
             ) VALUES (?1, 'Test Car', 'مبيوعة', 'اقساط', '6000000', '0',
                '6000000', 6, '2026-01-01', ?2, '2025-12-01', ?3, '07800000000')",
            params![car_number, currency, customer],
        )
        .unwrap();
        rebuild_installment_schedule(conn, car_number).unwrap();
    }

    fn installment_rows(conn: &Connection, car_number: &str) -> Vec<(i64, String, Money)> {
        let mut stmt = conn
            .prepare(
                "SELECT id, type, amount
                 FROM partner_transactions
                 WHERE source_type = 'customer_installment_schedule'
                   AND source_id LIKE ?1
                 ORDER BY COALESCE(due_date, date), id",
            )
            .unwrap();
        stmt.query_map([format!("{}:%", car_number)], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    }

    fn unpaid_balance(conn: &Connection, customer: &str, currency: &str) -> Money {
        conn.query_row(
            "SELECT COALESCE(SUM(amount), 0.0)
             FROM partner_transactions
             WHERE partner_name = ?1
               AND kind = 'زبون'
               AND COALESCE(currency, 'IQD') = ?2
               AND type LIKE 'باقي%'",
            params![customer, currency],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn test_event_installment_exact_payment() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_EXACT", "احمد", "IQD");
        let first_id = installment_rows(&conn, "EV_EXACT")[0].0;

        pay_customer_installment_core(
            &conn,
            first_id,
            "احمد",
            Money(dec!(1000000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let rows = installment_rows(&conn, "EV_EXACT");
        assert!(rows[0].1.starts_with("واصل"));
        assert_eq!(rows[0].2, Money(dec!(1000000)));
        assert_eq!(rows[1].2, Money(dec!(1000000)));
        assert_eq!(unpaid_balance(&conn, "احمد", "IQD"), Money(dec!(5000000)));
    }

    #[test]
    fn test_event_installment_overpayment_and_reverse() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_OVER", "احمد", "IQD");
        let first_id = installment_rows(&conn, "EV_OVER")[0].0;

        pay_customer_installment_core(
            &conn,
            first_id,
            "احمد",
            Money(dec!(2000000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let rows = installment_rows(&conn, "EV_OVER");
        assert!(rows[0].1.starts_with("واصل"));
        for row in rows.iter().skip(1) {
            assert_eq!(row.2, Money(dec!(800000)));
        }
        assert_eq!(unpaid_balance(&conn, "احمد", "IQD"), Money(dec!(4000000)));

        reverse_customer_installment_payment_core(&conn, first_id).unwrap();
        let rows = installment_rows(&conn, "EV_OVER");
        for row in rows {
            assert!(row.1.starts_with("باقي"));
            assert_eq!(row.2, Money(dec!(1000000)));
        }
        assert_eq!(unpaid_balance(&conn, "احمد", "IQD"), Money(dec!(6000000)));
        let active_events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM customer_installment_payment_events WHERE sale_id = 'EV_OVER' AND status = 'active'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active_events, 0);
    }

    #[test]
    fn test_event_installment_underpayment() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_UNDER", "احمد", "IQD");
        let first_id = installment_rows(&conn, "EV_UNDER")[0].0;

        pay_customer_installment_core(
            &conn,
            first_id,
            "احمد",
            Money(dec!(500000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let rows = installment_rows(&conn, "EV_UNDER");
        assert_eq!(rows[0].2, Money(dec!(500000)));
        for row in rows.iter().skip(1) {
            assert_eq!(row.2, Money(dec!(1100000)));
        }
        assert_eq!(unpaid_balance(&conn, "احمد", "IQD"), Money(dec!(5500000)));
    }

    #[test]
    fn test_installment_payment_profit_recognition_and_reverse() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_PROFIT", "احمد", "IQD");
        conn.execute(
            "UPDATE cars SET purchase_price = '3000000' WHERE car_number = 'EV_PROFIT'",
            [],
        )
        .unwrap();
        let first_id = installment_rows(&conn, "EV_PROFIT")[0].0;

        pay_customer_installment_core(
            &conn,
            first_id,
            "احمد",
            Money(dec!(1000000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let recognized_profit: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0)
                 FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'customer_payment'
                   AND source_role = 'profit_recognition'
                   AND affects_profit = 1
                   AND related_source_id = 'EV_PROFIT'
                   AND COALESCE(is_reversed, 0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(recognized_profit, Money(dec!(500000)));

        let (net_profit_iqd, net_profit_usd) =
            calculate_profit_totals_since(&conn, "2025-01-01", "").unwrap();
        assert_eq!(net_profit_iqd, Money(dec!(500000)));
        assert_eq!(net_profit_usd, Money::zero());

        let customer_payment_row_id: i64 = conn
            .query_row(
                "SELECT id
                 FROM partner_transactions
                 WHERE kind = 'زبون'
                   AND source_type = 'customer_payment'
                   AND source_role = 'customer_payment'
                   AND notes LIKE ?1",
                [format!("%قسط#{}%", first_id)],
                |row| row.get(0),
            )
            .unwrap();
        reverse_customer_installment_payment_core(&conn, customer_payment_row_id).unwrap();
        let active_profit_after_reverse: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0)
                 FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'customer_payment'
                   AND source_role = 'profit_recognition'
                   AND affects_profit = 1
                   AND related_source_id = 'EV_PROFIT'
                   AND COALESCE(is_reversed, 0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active_profit_after_reverse, Money::zero());

        let (net_after_reverse_iqd, net_after_reverse_usd) =
            calculate_profit_totals_since(&conn, "2025-01-01", "").unwrap();
        assert_eq!(net_after_reverse_iqd, Money::zero());
        assert_eq!(net_after_reverse_usd, Money::zero());
    }

    #[test]
    fn test_event_installment_currency_separation() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_IQD", "احمد", "IQD");
        seed_event_sourced_installment_car(&conn, "EV_USD", "احمد", "USD");
        let iqd_first_id = installment_rows(&conn, "EV_IQD")[0].0;

        pay_customer_installment_core(
            &conn,
            iqd_first_id,
            "احمد",
            Money(dec!(2000000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let usd_rows = installment_rows(&conn, "EV_USD");
        for row in usd_rows {
            assert!(row.1.starts_with("باقي"));
            assert_eq!(row.2, Money(dec!(1000000)));
        }
        assert_eq!(unpaid_balance(&conn, "احمد", "USD"), Money(dec!(6000000)));
    }

    #[test]
    fn test_event_installment_duplicate_payment_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_DUP", "احمد", "IQD");
        let first_id = installment_rows(&conn, "EV_DUP")[0].0;

        pay_customer_installment_core(
            &conn,
            first_id,
            "احمد",
            Money(dec!(1000000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();
        let second_attempt = pay_customer_installment_core(
            &conn,
            first_id,
            "احمد",
            Money(dec!(1000000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        );
        assert!(second_attempt.is_err());
        let active_events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM customer_installment_payment_events WHERE sale_id = 'EV_DUP' AND status = 'active'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active_events, 1);
    }

    #[test]
    fn test_event_installment_last_installment_rules() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_LAST_EXACT", "احمد", "IQD");
        let exact_last_id = installment_rows(&conn, "EV_LAST_EXACT").last().unwrap().0;
        pay_customer_installment_core(
            &conn,
            exact_last_id,
            "احمد",
            Money(dec!(1000000)),
            "2026-06-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        seed_event_sourced_installment_car(&conn, "EV_LAST_UNDER", "علي", "IQD");
        let under_last_id = installment_rows(&conn, "EV_LAST_UNDER").last().unwrap().0;
        let preview = calculate_installment_payment_preview(
            &conn,
            under_last_id,
            Money(dec!(500000)),
            Some("IQD"),
        )
        .unwrap();
        assert_eq!(preview.affected_count, 1);
        assert_eq!(preview.preview_installments[0].installment_id, 0);
        assert_eq!(preview.preview_installments[0].old_amount, Money::zero());
        assert_eq!(
            preview.preview_installments[0].new_amount,
            Money(dec!(500000))
        );

        pay_customer_installment_core(
            &conn,
            under_last_id,
            "علي",
            Money(dec!(500000)),
            "2026-06-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();
        let under_rows = installment_rows(&conn, "EV_LAST_UNDER");
        assert_eq!(under_rows.len(), 7);
        assert!(under_rows[5].1.starts_with("واصل"));
        assert_eq!(under_rows[5].2, Money(dec!(500000)));
        assert!(under_rows[6].1.starts_with("باقي"));
        assert_eq!(under_rows[6].2, Money(dec!(500000)));
        assert_eq!(unpaid_balance(&conn, "علي", "IQD"), Money(dec!(5500000)));

        let deferred_due_date: String = conn
            .query_row(
                "SELECT COALESCE(due_date, date)
                 FROM partner_transactions
                 WHERE source_type = 'customer_installment_schedule'
                   AND source_id = 'EV_LAST_UNDER:installment:7'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(deferred_due_date, "2026-07-01");

        recalculate_installment_schedule_for_car(&conn, "EV_LAST_UNDER").unwrap();
        let recalculated_rows = installment_rows(&conn, "EV_LAST_UNDER");
        assert_eq!(recalculated_rows.len(), 7);
        assert_eq!(recalculated_rows[6].2, Money(dec!(500000)));
        assert_eq!(unpaid_balance(&conn, "علي", "IQD"), Money(dec!(5500000)));

        reverse_customer_installment_payment_core(&conn, under_last_id).unwrap();
        let reversed_rows = installment_rows(&conn, "EV_LAST_UNDER");
        assert_eq!(reversed_rows.len(), 6);
        assert_eq!(unpaid_balance(&conn, "علي", "IQD"), Money(dec!(6000000)));

        seed_event_sourced_installment_car(&conn, "EV_LAST_OVER", "حسن", "IQD");
        let over_last_id = installment_rows(&conn, "EV_LAST_OVER").last().unwrap().0;
        let over = pay_customer_installment_core(
            &conn,
            over_last_id,
            "حسن",
            Money(dec!(1500000)),
            "2026-06-01",
            None,
            "IQD",
            "قاصه",
        );
        assert!(over.is_err());
    }

    #[test]
    fn test_rebuild_schedule_on_months_change_with_paid_installments() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_REBUILD_MONTHS", "احمد", "IQD");

        let rows_before = installment_rows(&conn, "EV_REBUILD_MONTHS");
        assert_eq!(rows_before.len(), 6);

        // Pay the first 2 installments
        pay_customer_installment_core(
            &conn,
            rows_before[0].0,
            "احمد",
            Money(dec!(1000000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();
        pay_customer_installment_core(
            &conn,
            rows_before[1].0,
            "احمد",
            Money(dec!(1000000)),
            "2026-02-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        // Check paid count is 2
        let active_events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM customer_installment_payment_events WHERE sale_id = 'EV_REBUILD_MONTHS' AND status = 'active'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active_events, 2);

        // Change months to 10 in cars table
        conn.execute(
            "UPDATE cars SET installment_months = 10, monthly_payment = 500000 WHERE car_number = 'EV_REBUILD_MONTHS'",
            [],
        )
        .unwrap();

        // Rebuild schedule
        recalculate_installment_schedule_for_car(&conn, "EV_REBUILD_MONTHS").unwrap();

        let rows_after = installment_rows(&conn, "EV_REBUILD_MONTHS");
        assert_eq!(rows_after.len(), 10);

        // First 2 must be paid (واصل قسط) with amount 1,000,000
        assert_eq!(rows_after[0].1, "واصل قسط");
        assert_eq!(rows_after[0].2, Money(dec!(1000000)));
        assert_eq!(rows_after[1].1, "واصل قسط");
        assert_eq!(rows_after[1].2, Money(dec!(1000000)));

        // Next 8 must be unpaid (باقي قسط) with amount 500,000
        for i in 2..10 {
            assert_eq!(rows_after[i].1, "باقي قسط");
            assert_eq!(rows_after[i].2, Money(dec!(500000)));
        }
    }

    #[test]
    fn test_agency_profit_directly_adds_to_net_profit() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        // Check initial profit is 0
        let (profit_iqd, profit_usd) = calculate_analytical_profit(&conn, "2025-01-01", None, "").unwrap();
        assert_eq!(profit_iqd, Money::zero());
        assert_eq!(profit_usd, Money::zero());

        // Insert an agency
        conn.execute(
            "INSERT INTO agencies (old_agent_name, car_type, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time)
             VALUES ('Old Agent', 'Sedan', '123', 'Toyota', 'Red', 'New Agent', '07700000000', 500.0, 1000000.0, 'Notes', '2026-06-29', '07:30')",
            [],
        )
        .unwrap();
        let new_id = conn.last_insert_rowid();

        // Rebuild partner entries for the agency
        rebuild_agency_partner_entries(&conn, new_id).unwrap();

        // Calculate profit again
        let (profit_iqd_after, profit_usd_after) = calculate_analytical_profit(&conn, "2025-01-01", None, "").unwrap();
        assert_eq!(profit_iqd_after, Money(dec!(1000000.0)));
        assert_eq!(profit_usd_after, Money(dec!(500.0)));
    }
}
