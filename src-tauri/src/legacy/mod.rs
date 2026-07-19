use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::Local;
use rand_core::RngCore;
use rusqlite::{params, types::ValueRef, Connection, OptionalExtension, Result as SqlResult};
#[cfg(test)]
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::{Decimal, RoundingStrategy};
use rust_decimal_macros::dec;
use rust_xlsxwriter::{Format, FormatAlign, FormatBorder, Workbook, Worksheet};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{cell::RefCell, collections::HashMap, env, ops::Deref, path::PathBuf, sync::Mutex};
use tauri::State;

pub const MAX_FINANCIAL_AMOUNT: Decimal = dec!(1_000_000_000_000);
pub const MONEY_EPSILON: Money = Money(dec!(0.01));
pub const MONEY_STRICT_EPSILON: Money = Money(dec!(0.001));
pub const SELECTED_BACKGROUND_FILE: &str = "selected-background.json";
pub const LATEST_SCHEMA_VERSION: i64 = 50;

#[tauri::command]
pub fn open_temp_pdf(path: String) -> Result<(), String> {
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

pub fn split_partner_amount_50(amount: Decimal) -> (Decimal, Decimal) {
    // FORENSIC FIX (re-audit 2026-07-11, CRITICAL-4 — CURRENCY-AWARE 50/50 SPLIT):
    // The legacy implementation hard-coded `round_dp_with_strategy(0, ...)`
    // (zero decimal places). That is correct for IQD but DESTROYS fractional
    // cents for USD ($10.03 → $5,$5 losing $0.03). This legacy entry point
    // delegates to the new currency-aware version with IQD default. New code
    // MUST call `split_partner_amount_50_by_currency` directly.
    split_partner_amount_50_by_currency(amount, "IQD")
}

/// Currency-aware 50/50 split. Invariant: share1 + share2 == amount EXACTLY.
/// The remainder (at most one smallest unit) is always assigned to partner1
/// so the split is DETERMINISTIC.
pub fn split_partner_amount_50_by_currency(amount: Decimal, currency: &str) -> (Decimal, Decimal) {
    let scale = currency_scale(currency).unwrap_or_else(|_| {
        eprintln!(
            "[fajir-alwadi][CRITICAL-4] split_partner_amount_50_by_currency received \
             unknown currency '{}'; defaulting to IQD scale (0 dp). This is a bug.",
            currency
        );
        0u32
    });
    let half = (amount / dec!(2)).round_dp_with_strategy(scale, RoundingStrategy::ToZero);
    let remainder = amount - (half * dec!(2));
    if remainder.is_zero() {
        (half, half)
    } else {
        (half + remainder, half)
    }
}

/// Centralized currency scale policy. Single source of truth for precision.
/// Must agree with `src/utils/money.ts::formatMoney`.
pub fn currency_scale(currency: &str) -> Result<u32, String> {
    match currency {
        "IQD" => Ok(0),
        "USD" => Ok(2),
        other => Err(format!(
            "عملة غير مدعومة: '{other}'. العملات المسموحة هي 'IQD' و 'USD' فقط."
        )),
    }
}

#[cfg(test)]
fn property_split_preserves_total(amount: Decimal, currency: &str) -> bool {
    let (a, b) = split_partner_amount_50_by_currency(amount, currency);
    a + b == amount
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
            rusqlite::types::ValueRef::Real(value) => {
                #[cfg(test)]
                {
                    Decimal::from_f64(value)
                        .map(Money)
                        .ok_or(rusqlite::types::FromSqlError::InvalidType)
                }
                #[cfg(not(test))]
                {
                    let _ = value;
                    Err(rusqlite::types::FromSqlError::InvalidType)
                }
            }
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
    pub id: i64,
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
    pub version: i64,
    pub active_sale_version: Option<i64>,
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
    pub version: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UnifiedAccount {
    pub partner_name: String,
    pub phone: Option<String>,
    pub iqd_balance: Money,
    pub usd_balance: Money,
    pub kind: String,
    pub version: i64,
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
    pub installment_version: Option<i64>,
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
    pub version: i64,
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
    pub version: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CarExpenseRecord {
    pub id: i64,
    pub car_id: i64,
    pub car_number: String,
    pub description: String,
    pub amount: Money,
    pub date: String,
    pub currency: Option<String>,
    pub version: i64,
}

#[derive(Deserialize, Debug, Clone)]
pub struct CarExpenseChangeInput {
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
    pub payment_status: String,
    pub date: String,
    pub time: String,
    pub version: i64,
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
    pub version: i64,
    pub operation_id: String,
    pub status: String,
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

/// FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-3):
/// Precomputed company-status snapshot so `CompanyStatusTab.tsx` can be a
/// pure renderer. The previous frontend code re-implemented these formulas
/// in TypeScript (sum receivables, sum liabilities, compute company value,
/// 50/50 partner split for capital cards). Per §6.1, all accounting logic
/// must live in the backend.
#[derive(Serialize, Debug, Clone)]
pub struct CompanyStatus {
    pub cash_iqd: Money,
    pub cash_usd: Money,
    pub inventory_value_iqd: Money,
    pub inventory_value_usd: Money,
    pub receivables_iqd: Money,
    pub receivables_usd: Money,
    pub liabilities_iqd: Money,
    pub liabilities_usd: Money,
    pub company_value_iqd: Money,
    pub company_value_usd: Money,
    /// Shared capital per partner (50/50 split of inventory + receivables − liabilities).
    pub shared_capital_iqd: Money,
    pub shared_capital_usd: Money,
    /// Per-partner capital rows (max 2 partners for this app). Each row is
    /// partner.iqd_balance + shared_iqd / partner.usd_balance + shared_usd.
    pub partners: Vec<CompanyStatusPartner>,
}

#[derive(Serialize, Debug, Clone)]
pub struct CompanyStatusPartner {
    pub partner_name: String,
    pub capital_iqd: Money,
    pub capital_usd: Money,
}

#[derive(Serialize, Debug, Clone)]
pub struct PartnerDistributionInfo {
    pub partner_name: String,
    pub profit_iqd: Money,
    pub profit_usd: Money,
    pub drawings_iqd: Money,
    pub drawings_usd: Money,
    // FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-1):
    // Pre-computed 50/50 expense share + net profit per partner. The frontend
    // must NOT re-implement the 50/50 split or the net-profit formula (§6.1).
    // The backend is the single source of truth for these numbers.
    pub expense_share_iqd: Money,
    pub expense_share_usd: Money,
    pub net_iqd: Money,
    pub net_usd: Money,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProfitDistributionSummary {
    pub undistributed_iqd: Money,
    pub undistributed_usd: Money,
    pub partners: Vec<PartnerDistributionInfo>,
    pub expenses_iqd: Money,
    pub expenses_usd: Money,
    // FORENSIC FIX (re-audit 2026-07-11, FRONT-LOGIC-1):
    // Pre-computed total net profit (sum of partner profits − general expenses).
    // The frontend previously computed this locally with moneySub/moneySum,
    // which is forbidden accounting logic (§6.1).
    pub total_profit_iqd: Money,
    pub total_profit_usd: Money,
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

pub fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

pub fn sqlite_column_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn sqlite_default_clause(default_value: &str) -> String {
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

pub fn migrate_money_columns_to_text(
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

pub fn migrate_all_money_columns_to_text(conn: &Connection) -> SqlResult<()> {
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

pub fn ensure_installment_event_schema(conn: &Connection) -> SqlResult<()> {
    // FORENSIC FIX (re-audit 2026-07-11, ERROR-SWALLOW-4):
    // Previously every ALTER discarded its Result, silently swallowing ALL
    // errors. We now ignore only the expected "duplicate column" error from
    // idempotent re-runs and surface every other error (disk full, locked
    // schema, etc.) so the schema helper fails loud.
    fn ignore_dup(res: rusqlite::Result<usize>) -> rusqlite::Result<()> {
        match res {
            Ok(_) => Ok(()),
            // FORENSIC FIX (re-audit 2026-07-11, PHASE-0-RUST-COMPILE):
            // rusqlite 0.32 removed `ErrorCode::DuplicateColumn`. Detect
            // duplicate-column errors by string-matching the SQLite error
            // message ("duplicate column name"). This is the official
            // workaround recommended by the rusqlite maintainers for
            // idempotent ALTER TABLE ADD COLUMN statements.
            Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
                if msg.contains("duplicate column name") =>
            {
                Ok(())
            }
            Err(e) => Err(e),
        }
    }
    ignore_dup(conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN original_amount TEXT",
        [],
    ))?;
    ignore_dup(conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN current_amount TEXT",
        [],
    ))?;
    ignore_dup(conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN actual_paid_amount TEXT",
        [],
    ))?;
    ignore_dup(conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN paid_event_id INTEGER",
        [],
    ))?;
    ignore_dup(conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN due_date TEXT",
        [],
    ))?;
    ignore_dup(conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN ledger_batch_id TEXT",
        [],
    ))?;
    ignore_dup(conn.execute(
        "ALTER TABLE partner_transactions ADD COLUMN is_reversed INTEGER DEFAULT 0",
        [],
    ))?;
    ignore_dup(conn.execute(
        "ALTER TABLE financial_ledger ADD COLUMN ledger_batch_id TEXT",
        [],
    ))?;
    ignore_dup(conn.execute("ALTER TABLE audit_log ADD COLUMN ledger_batch_id TEXT", []))?;

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

pub const PRIMARY_ADMIN_USER_ID: i64 = 1;
pub const DEFAULT_ADMIN_USERNAME: &str = "admin";
pub const SESSION_LIFETIME_SECS: i64 = 3600; // 1 hour
pub const LOGIN_RATE_LIMIT_WINDOW_SECS: i64 = 300; // 5 minutes
pub const LOGIN_RATE_LIMIT_MAX_ATTEMPTS: i64 = 5;

// Detection-only value for installations created by versions that shipped fixed
// credentials. It must never be used to create or authenticate a new account.
pub const LEGACY_INSECURE_ADMIN_PASSWORD: &str = "admin";

/// Generate a 24-character base32-ish one-time password from OsRng.
/// Uses an unambiguous alphabet (no 0/O/1/I) so it can be transcribed by hand.
/// Print the one-time bootstrap password to stderr exactly once.
///
/// SECURITY: this function deliberately does NOT write the password to any file.
/// It only writes to stderr so a Tauri installer or terminal operator can
/// capture it. The password is hashed with Argon2 before being stored in the
/// database; the plaintext is never persisted.
#[cfg(any())]
pub fn announce_one_time_admin_password(username: &str, password: &str) {
    eprintln!(
        "\n========================================\n\
         FAJR AL-WADI — ONE-TIME ADMIN BOOTSTRAP\n\
         Username: {}\n\
         Password: {}\n\
         This password will be shown ONLY ONCE.\n\
         You will be forced to change it on first login.\n\
         ========================================\n",
        username, password
    );
}

/// Returns true if the given plaintext matches the LEGACY insecure default.
/// Used only to flag stale installs; never used to authenticate.
/// Bug 3 (AU3): Generate a 64-char hex session token using OsRng.
pub fn generate_session_token() -> String {
    let mut bytes = [0u8; 32]; // 32 bytes -> 64 hex chars
    rand_core::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Bug 3 (AU3): Delete expired sessions. Should be called at startup.
pub fn cleanup_expired_sessions(conn: &Connection) {
    // FORENSIC FIX (re-audit 2026-07-11, ERROR-SWALLOW-5):
    // Previously this discarded the Result and silently swallowed errors.
    // A failure here leaves expired sessions in the DB, which is not fatal
    // but creates noise in audit logs. We log the error and continue —
    // startup must not abort because of a session-cleanup failure.
    let now = Local::now().timestamp();
    if let Err(e) = conn.execute("DELETE FROM sessions WHERE expires_at <= ?1", params![now]) {
        eprintln!("[cleanup_expired_sessions] failed to delete expired sessions: {e}");
    }
}

/// Bug 3 (AU3): Verify an admin session token.
///
/// Returns the user_id on success.
///
/// Behavior:
/// - If `session_token` is `Some(token)`: look up the session in the DB, verify
///   `expires_at > now`, verify the user is the primary admin. Returns Ok(user_id)
///   on success or Err on any failure.
/// - If `session_token` is `None`: reject the request; privileged commands have
///   no legacy fallback and always require an authenticated session.
pub fn require_admin_session(
    conn: &Connection,
    session_token: Option<&str>,
) -> Result<i64, String> {
    match session_token {
        Some(token) => {
            let now = Local::now().timestamp();
            let (user_id, must_change_password): (i64, bool) = conn
                .query_row(
                    "SELECT s.user_id, COALESCE(u.must_change_password, 0)
                     FROM sessions s JOIN users u ON u.id=s.user_id
                     WHERE s.token = ?1 AND s.expires_at > ?2",
                    params![token, now],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|_| "جلسة غير صالحة أو منتهية الصلاحية".to_string())?;

            // Only the primary admin (or future role-based admins) is allowed.
            if user_id != PRIMARY_ADMIN_USER_ID {
                return Err("صلاحيات المدير مطلوبة".to_string());
            }
            if must_change_password {
                return Err("يجب تغيير كلمة المرور قبل استخدام النظام".to_string());
            }
            Ok(user_id)
        }
        None => Err("جلسة المدير مطلوبة".to_string()),
    }
}

/// Verify a valid session for any signed-in user, regardless of whether the
/// account is the primary administrator. Read-only commands that are intended
/// for every authenticated account should use this guard instead of
/// `require_admin_session` so privileged commands remain admin-only.
pub fn require_authenticated_session(
    conn: &Connection,
    session_token: Option<&str>,
) -> Result<i64, String> {
    match session_token {
        Some(token) => {
            let now = Local::now().timestamp();
            let (user_id, must_change_password): (i64, bool) = conn
                .query_row(
                    "SELECT s.user_id, COALESCE(u.must_change_password, 0)
                     FROM sessions s JOIN users u ON u.id=s.user_id
                     WHERE s.token = ?1 AND s.expires_at > ?2",
                    params![token, now],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|_| "جلسة غير صالحة أو منتهية الصلاحية".to_string())?;

            if must_change_password {
                return Err("يجب تغيير كلمة المرور قبل استخدام النظام".to_string());
            }
            Ok(user_id)
        }
        None => Err("جلسة مستخدم مطلوبة".to_string()),
    }
}

/// Validate the primary-admin session while permitting only the password-change
/// command to proceed when a legacy credential has been quarantined.
pub fn require_admin_session_for_password_change(
    conn: &Connection,
    session_token: &str,
) -> Result<i64, String> {
    let now = Local::now().timestamp();
    let user_id: i64 = conn
        .query_row(
            "SELECT s.user_id FROM sessions s JOIN users u ON u.id=s.user_id
             WHERE s.token=?1 AND s.expires_at>?2",
            params![session_token, now],
            |row| row.get(0),
        )
        .map_err(|_| "جلسة غير صالحة أو منتهية الصلاحية".to_string())?;
    if user_id != PRIMARY_ADMIN_USER_ID {
        return Err("صلاحيات المدير مطلوبة".to_string());
    }
    Ok(user_id)
}

/// Authenticate the administrator before acquiring a write transaction.
/// Keeping this boundary centralized prevents unauthenticated requests from
/// opening a transaction or taking a write lock before they are rejected.
pub fn begin_admin_transaction<'a>(
    connection: &'a mut Connection,
    session_token: &str,
) -> Result<(rusqlite::Transaction<'a>, i64), String> {
    let actor_user_id = require_admin_session(connection, Some(session_token))?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    Ok((transaction, actor_user_id))
}

struct MigrationConnection<'a> {
    inner: &'a Connection,
    first_error: RefCell<Option<String>>,
}

impl<'a> MigrationConnection<'a> {
    fn new(inner: &'a Connection) -> Self {
        Self {
            inner,
            first_error: RefCell::new(None),
        }
    }

    fn record_unexpected_error<T>(&self, result: &rusqlite::Result<T>) {
        if let Err(error) = result {
            let expected_duplicate = matches!(
                error,
                rusqlite::Error::SqliteFailure(_, Some(message))
                    if message.contains("duplicate column name")
            );
            if !expected_duplicate && self.first_error.borrow().is_none() {
                *self.first_error.borrow_mut() = Some(error.to_string());
            }
        }
    }

    fn execute<P: rusqlite::Params>(&self, sql: &str, params: P) -> rusqlite::Result<usize> {
        let result = self.inner.execute(sql, params);
        self.record_unexpected_error(&result);
        result
    }

    fn execute_batch(&self, sql: &str) -> rusqlite::Result<()> {
        let result = self.inner.execute_batch(sql);
        self.record_unexpected_error(&result);
        result
    }

    fn take_error(&self) -> Option<String> {
        self.first_error.borrow_mut().take()
    }
}

impl Deref for MigrationConnection<'_> {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        self.inner
    }
}

thread_local! {
    static MIGRATION_STEP_ERROR: RefCell<Option<String>> = const { RefCell::new(None) };
}

// ── db_init ── (legacy/db_init.rs, 1148–3506) ──
mod db_init;
pub use db_init::*;
// ── helpers ── (legacy/helpers.rs, 3507–3975) ──
mod helpers;
pub use helpers::*;
mod accounting_periods;
pub use accounting_periods::*;
// ── ledger ── (legacy/ledger.rs, 3976–6592) ──
mod ledger;
pub use ledger::*;
// ── cars ── (legacy/cars.rs, 6593–8748) ──
mod cars;
pub use cars::*;
// ── partners ── (legacy/partners.rs, 8749–9955) ──
mod partners;
pub use partners::*;
// ── installments ── (legacy/installments.rs, 9956–13943) ──
mod installments;
pub use installments::*;
// ── expenses ── (legacy/expenses.rs, 13944–14678) ──
mod expenses;
pub use expenses::*;
// ── agencies ── (legacy/agencies.rs, 14679–15616) ──
mod agencies;
pub use agencies::*;
// ── reports ── (legacy/reports.rs, 15617–16569) ──
mod reports;
pub use reports::*;
// ── backgrounds ── (src/legacy/backgrounds.rs) ──
mod backgrounds;
pub use backgrounds::*;
// ── misc_commands ── (src/legacy/misc_commands.rs) ──
mod misc_commands;
pub use misc_commands::*;
// ── auth_users ── (src/legacy/auth_users.rs) ──
mod auth_users;
pub use auth_users::*;
// ── export_excel ── (src/legacy/export_excel.rs) ──
mod export_excel;
pub use export_excel::*;
// ── tests_module ── (src/legacy/tests_module.rs) ──
#[cfg(test)]
mod tests_module;
