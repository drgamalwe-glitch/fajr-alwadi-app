//! Domain data types shared across all modules.

use crate::money::Money;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

// ---------------------------------------------------------------------------
// Car types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Partner types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Installment types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Expense types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Agency types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Financial summary / company status
// ---------------------------------------------------------------------------

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
    pub shared_capital_iqd: Money,
    pub shared_capital_usd: Money,
    pub partners: Vec<CompanyStatusPartner>,
}

#[derive(Serialize, Debug, Clone)]
pub struct CompanyStatusPartner {
    pub partner_name: String,
    pub capital_iqd: Money,
    pub capital_usd: Money,
}

// ---------------------------------------------------------------------------
// Profit distribution types
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug, Clone)]
pub struct PartnerDistributionInfo {
    pub partner_name: String,
    pub profit_iqd: Money,
    pub profit_usd: Money,
    pub drawings_iqd: Money,
    pub drawings_usd: Money,
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

// ---------------------------------------------------------------------------
// AppState
// ---------------------------------------------------------------------------

pub struct AppState {
    pub db: Mutex<Connection>,
    pub app_dir: PathBuf,
}

// ---------------------------------------------------------------------------
// Transaction classification (used by audit / partner split logic)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct TransactionClassification {
    pub affects_qasa: bool,
    pub affects_partner_cash: bool,
    pub affects_profit: bool,
}

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug, Clone)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub profile_image: Option<String>,
    pub must_change_password: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct LoginResult {
    pub session_token: String,
    pub user_id: i64,
    pub must_change_password: bool,
    pub display_name: String,
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug, Clone)]
pub struct ExportSection {
    pub title: String,
    pub table_name: String,
    pub columns: Vec<String>,
}

#[derive(Serialize, Debug, Clone)]
pub enum ExcelValue {
    Text(String),
    Integer(i64),
    Number(f64),
    Empty,
}

// ---------------------------------------------------------------------------
// Installment template types (used by installment schedule builders)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct InstallmentTemplate {
    pub due_date: String,
    pub amount: Money,
    pub currency: String,
}

#[derive(Debug, Clone)]
pub struct InstallmentScheduleState {
    pub installment_id: i64,
    pub status: String,
    pub original_amount: Money,
    pub current_amount: Money,
    pub paid_amount: Money,
    pub currency: String,
    pub due_date: String,
}

// ---------------------------------------------------------------------------
// Background selection
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug, Clone)]
pub struct BackgroundSelection {
    pub background: Option<String>,
}

// ---------------------------------------------------------------------------
// SQL helpers (used across modules)
// ---------------------------------------------------------------------------

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

pub fn now_datetime() -> (String, String) {
    let now = chrono::Local::now();
    (
        now.format("%Y-%m-%d").to_string(),
        now.format("%H:%M:%S").to_string(),
    )
}
