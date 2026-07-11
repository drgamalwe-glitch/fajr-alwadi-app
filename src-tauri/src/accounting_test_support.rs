//! In-process harness for REAL_TAURI_RUST accounting verification.
//! Calls the same Tauri command handlers as production — no E2E bridge.

use crate::Money;
use crate::{
    add_agency, add_car, add_expense, add_partner, add_partner_transaction,
    apply_car_expense_changes, delete_agency, delete_car, delete_expense, delete_partner,
    export_database_to_excel, get_agencies, get_cars, get_cash_register_entries,
    get_financial_summary, get_partner_transactions, get_partners, get_profit_distribution_summary,
    init_db, pay_financier_from_partners, set_customer_installment_status, update_expense,
    update_sold_car_with_accounting, AppState, CarExpenseChangeInput, FinancialSummary,
    ProfitDistributionSummary,
};
use rusqlite::Connection;
use rust_decimal_macros::dec;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{Manager, State};

static RESULTS: OnceLock<Mutex<Vec<RealVerificationResult>>> = OnceLock::new();
static FULL_71_RESULTS: OnceLock<Mutex<Vec<RealVerificationResult>>> = OnceLock::new();

pub fn results_store() -> &'static Mutex<Vec<RealVerificationResult>> {
    RESULTS.get_or_init(|| Mutex::new(Vec::new()))
}

pub fn full_71_results_store() -> &'static Mutex<Vec<RealVerificationResult>> {
    FULL_71_RESULTS.get_or_init(|| Mutex::new(Vec::new()))
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SummarySnapshot {
    pub qasa_iqd: Money,
    pub qasa_usd: Money,
    pub cash_iqd: Money,
    pub cash_usd: Money,
    pub inventory_value_iqd: Money,
    pub inventory_value_usd: Money,
    pub monthly_profits_iqd: Money,
    pub monthly_profits_usd: Money,
    pub total_investments_iqd: Money,
    pub total_investments_usd: Money,
    pub total_debtors_iqd: Money,
    pub total_debtors_usd: Money,
    pub total_partner_capital_iqd: Money,
    pub total_partner_capital_usd: Money,
    pub total_expenses_iqd: Money,
    pub total_expenses_usd: Money,
    pub deferred_revenue_iqd: Money,
    pub deferred_revenue_usd: Money,
    pub deferred_expense_iqd: Money,
    pub deferred_expense_usd: Money,
    pub net_capital_iqd: Money,
    pub net_capital_usd: Money,
}

impl From<&FinancialSummary> for SummarySnapshot {
    fn from(s: &FinancialSummary) -> Self {
        Self {
            qasa_iqd: s.qasa_iqd,
            qasa_usd: s.qasa_usd,
            cash_iqd: s.cash_iqd,
            cash_usd: s.cash_usd,
            inventory_value_iqd: s.inventory_value_iqd,
            inventory_value_usd: s.inventory_value_usd,
            monthly_profits_iqd: s.monthly_profits_iqd,
            monthly_profits_usd: s.monthly_profits_usd,
            total_investments_iqd: s.total_investments_iqd,
            total_investments_usd: s.total_investments_usd,
            total_debtors_iqd: s.total_debtors_iqd,
            total_debtors_usd: s.total_debtors_usd,
            total_partner_capital_iqd: s.total_partner_capital_iqd,
            total_partner_capital_usd: s.total_partner_capital_usd,
            total_expenses_iqd: s.total_expenses_iqd,
            total_expenses_usd: s.total_expenses_usd,
            deferred_revenue_iqd: s.deferred_revenue_iqd,
            deferred_revenue_usd: s.deferred_revenue_usd,
            deferred_expense_iqd: s.deferred_expense_iqd,
            deferred_expense_usd: s.deferred_expense_usd,
            net_capital_iqd: s.net_capital_iqd,
            net_capital_usd: s.net_capital_usd,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealVerificationResult {
    pub id: String,
    pub name: String,
    pub related_scenarios: Vec<String>,
    #[serde(default)]
    pub group: String,
    pub status: String,
    pub expected: serde_json::Value,
    pub actual: serde_json::Value,
    pub rust_functions: Vec<String>,
    pub notes: String,
}

pub struct TestHarness {
    app: tauri::App<tauri::test::MockRuntime>,
}

impl Default for TestHarness {
    fn default() -> Self {
        Self::new()
    }
}

impl TestHarness {
    pub fn new() -> Self {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        init_db(&conn).expect("init_db");
        // Test-only: bypass must_change_password for test admin. NEVER do this in production code.
        let _ = conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        );
        let app = tauri::test::mock_builder()
            .manage(AppState {
                db: Mutex::new(conn),
                app_dir: std::env::temp_dir(),
            })
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("build test app");
        Self { app }
    }

    pub fn today(&self) -> String {
        self.st()
            .inner()
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT strftime('%Y-%m-%d', 'now', 'localtime')",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "2026-06-23".to_string())
    }

    pub fn month_start(&self) -> String {
        self.st()
            .inner()
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT strftime('%Y-%m-01', 'now', 'localtime')",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "2026-06-01".to_string())
    }

    pub fn date_plus_days(&self, days: i64) -> String {
        self.st()
            .inner()
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT date('now', ?1, 'localtime')",
                [format!("{days} days")],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| self.today())
    }

    fn st(&self) -> State<'_, AppState> {
        self.app.state::<AppState>()
    }

    pub fn summary(&self) -> FinancialSummary {
        get_financial_summary(self.st(), None).expect("get_financial_summary")
    }

    pub fn summary_snapshot(&self) -> SummarySnapshot {
        SummarySnapshot::from(&self.summary())
    }

    pub fn profit_dist(&self) -> ProfitDistributionSummary {
        get_profit_distribution_summary(self.st(), None, None)
            .expect("get_profit_distribution_summary")
    }

    pub fn partner_profit_iqd(&self, name: &str) -> Money {
        self.profit_dist()
            .partners
            .iter()
            .find(|p| p.partner_name == name)
            .map(|p| p.profit_iqd)
            .unwrap_or(Money::zero())
    }

    pub fn add_car_cash_purchase(
        &self,
        num: &str,
        purchase: Money,
        currency: &str,
    ) -> Result<(), String> {
        add_car(
            self.st(),
            num.to_string(),
            format!("CH-{num}"),
            "Toyota".to_string(),
            "2024".to_string(),
            format!("سيارة {num}"),
            "أبيض".to_string(),
            String::new(),
            purchase,
            Some(currency.to_string()),
            None,
            Money::zero(),
            "متوفرة".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(self.month_start()),
            None,
            None,
            None,
            Some("قاصه".to_string()),
            None,
            Some("كاش".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
        )
    }

    pub fn add_car_installment_sale(
        &self,
        num: &str,
        purchase: Money,
        selling: Money,
        down: Money,
        remaining: Money,
        buyer: &str,
    ) -> Result<(), String> {
        self.add_car_cash_purchase(num, purchase, "IQD")?;
        crate::sell_car_with_accounting(
            self.st(),
            num.to_string(),
            buyer.to_string(),
            "07800000000".to_string(),
            selling,
            "IQD".to_string(),
            self.today(),
            "اقساط".to_string(),
            down,
            remaining,
            Some(15),
            Some(self.date_plus_days(14)),
            None,
            Some(format!("CH-{num}")),
        )
    }

    pub fn add_customer_installment_payment(
        &self,
        buyer: &str,
        car_num: &str,
        amount: Money,
        date: &str,
    ) -> Result<(), String> {
        add_partner_transaction(
            self.st(),
            buyer.to_string(),
            "زبون".to_string(),
            "تسديد قسط سيارة".to_string(),
            amount,
            date.to_string(),
            Some(format!("تسديد قسط سيارة #بيع_سيارة_{car_num}")),
            Some("IQD".to_string()),
            Some("قاصه".to_string()),
        )
    }

    pub fn set_installment_status(
        &self,
        installment_id: i64,
        partner_name: &str,
        paid: bool,
        amount: Money,
        date: &str,
    ) -> Result<(), String> {
        set_customer_installment_status(
            self.st(),
            installment_id,
            partner_name.to_string(),
            "زبون".to_string(),
            paid,
            amount,
            date.to_string(),
            None,
            Some("IQD".to_string()),
            Some("قاصه".to_string()),
        )
    }

    pub fn sell_car_cash(
        &self,
        car_num: &str,
        selling_price: Money,
        buyer: &str,
    ) -> Result<(), String> {
        self.sell_car_with_currency(car_num, selling_price, buyer, "IQD")
    }

    pub fn sell_car_usd(
        &self,
        car_num: &str,
        selling_price: Money,
        buyer: &str,
    ) -> Result<(), String> {
        self.sell_car_with_currency(car_num, selling_price, buyer, "USD")
    }

    pub fn sell_car_with_currency(
        &self,
        car_num: &str,
        selling_price: Money,
        buyer: &str,
        currency: &str,
    ) -> Result<(), String> {
        crate::sell_car_with_accounting(
            self.st(),
            car_num.to_string(),
            buyer.to_string(),
            format!("078{buyer}"),
            selling_price,
            currency.to_string(),
            self.today(),
            "كاش".to_string(),
            selling_price,
            Money::zero(),
            None,
            None,
            None,
            None,
        )
    }

    pub fn try_sell_mixed_currency(
        &self,
        car_num: &str,
        selling_price: Money,
        currency: &str,
        buyer: &str,
    ) -> Result<(), String> {
        self.sell_car_with_currency(car_num, selling_price, buyer, currency)
    }

    pub fn add_car_expense(&self, car_num: &str, amount: Money, date: &str) -> Result<(), String> {
        // Route through the new atomic apply_car_expense_changes command, the
        // same path used in production. We look up the chassis from car_number
        // so existing tests that operate on car_number keep working.
        let chassis: String = {
            let db = self.st().inner().db.lock().map_err(|e| e.to_string())?;
            db.query_row(
                "SELECT COALESCE(chassis_number, '') FROM cars WHERE car_number = ?1",
                [car_num],
                |row| row.get(0),
            )
            .map_err(|e| format!("تعذر قراءة رقم الشاصي للسيارة {car_num}: {e}"))?
        };
        apply_car_expense_changes(
            self.st(),
            car_num.to_string(),
            chassis,
            Vec::new(),
            vec![CarExpenseChangeInput {
                description: "اصلاح".to_string(),
                amount,
                date: date.to_string(),
                currency: Some("IQD".to_string()),
            }],
        )
    }

    pub fn add_general_expense(&self, amount: Money) -> Result<i64, String> {
        add_expense(
            self.st(),
            "ايجار".to_string(),
            amount,
            self.today(),
            None,
            Some("IQD".to_string()),
            None,
            None,
        )?;
        let db = self.st().inner().db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT id FROM expenses ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }

    pub fn update_general_expense(&self, id: i64, amount: Money) -> Result<(), String> {
        update_expense(
            self.st(),
            id,
            "ايجار معدل".to_string(),
            amount,
            self.today(),
            None,
            Some("IQD".to_string()),
        )
    }

    pub fn add_investor(&self, name: &str) -> Result<(), String> {
        add_partner(
            self.st(),
            name.to_string(),
            "07800000000".to_string(),
            "مستثمر".to_string(),
        )
    }

    pub fn add_investor_tx(
        &self,
        name: &str,
        type_: &str,
        amount: Money,
        date: &str,
    ) -> Result<(), String> {
        add_partner_transaction(
            self.st(),
            name.to_string(),
            "مستثمر".to_string(),
            type_.to_string(),
            amount,
            date.to_string(),
            None,
            Some("IQD".to_string()),
            Some("قاصه".to_string()),
        )
    }

    pub fn add_funded_car(&self, num: &str, funder: &str, purchase: Money) -> Result<(), String> {
        add_car(
            self.st(),
            num.to_string(),
            format!("CH-{num}"),
            "Toyota".to_string(),
            "2024".to_string(),
            format!("سيارة {num}"),
            "أبيض".to_string(),
            String::new(),
            purchase,
            Some("IQD".to_string()),
            None,
            Money::zero(),
            "متوفرة".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(self.month_start()),
            None,
            None,
            None,
            Some("قاصه".to_string()),
            None,
            Some("تمويل".to_string()),
            Some(funder.to_string()),
            None,
            None,
            None,
            None,
            None,
        )
    }

    pub fn add_company_car(&self, num: &str, company: &str, purchase: Money) -> Result<(), String> {
        add_car(
            self.st(),
            num.to_string(),
            format!("CH-{num}"),
            "Toyota".to_string(),
            "2024".to_string(),
            format!("سيارة {num}"),
            "أبيض".to_string(),
            String::new(),
            purchase,
            Some("IQD".to_string()),
            None,
            Money::zero(),
            "متوفرة".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(self.month_start()),
            None,
            None,
            None,
            Some("قاصه".to_string()),
            None,
            Some("شركة".to_string()),
            Some(company.to_string()),
            None,
            None,
            None,
            None,
            None,
        )
    }

    pub fn pay_financier(
        &self,
        name: &str,
        kind: &str,
        amount: Money,
        date: &str,
    ) -> Result<(), String> {
        pay_financier_from_partners(
            self.st(),
            name.to_string(),
            kind.to_string(),
            amount,
            date.to_string(),
            None,
            Some("IQD".to_string()),
            None,
            None,
            None,
        )
    }

    pub fn edit_car_purchase(&self, num: &str, new_purchase: Money) -> Result<(), String> {
        add_car(
            self.st(),
            num.to_string(),
            format!("CH-{num}"),
            "Toyota".to_string(),
            "2024".to_string(),
            format!("سيارة {num}"),
            "أبيض".to_string(),
            String::new(),
            new_purchase,
            Some("IQD".to_string()),
            None,
            Money::zero(),
            "متوفرة".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(self.month_start()),
            None,
            None,
            None,
            Some("قاصه".to_string()),
            Some(num.to_string()),
            Some("كاش".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
        )
    }

    pub fn delete_car(&self, num: &str) -> Result<(), String> {
        delete_car(self.st(), num.to_string(), None)
    }

    pub fn car_count(&self, num: &str) -> i64 {
        get_cars(self.st())
            .unwrap_or_default()
            .iter()
            .filter(|car| car.car_number == num)
            .count() as i64
    }

    pub fn add_agency_iqd(&self, old: &str, new: &str, amount: Money) -> Result<i64, String> {
        add_agency(
            self.st(),
            old.to_string(),
            "تويوتا".to_string(),
            String::new(),
            String::new(),
            String::new(),
            new.to_string(),
            String::new(),
            Money::zero(),
            amount,
            String::new(),
            None,
            None,
        )
    }

    pub fn delete_agency(&self, id: i64) -> Result<(), String> {
        delete_agency(self.st(), id)
    }

    pub fn try_delete_partner(&self, name: &str, kind: &str) -> Result<(), String> {
        delete_partner(self.st(), name.to_string(), kind.to_string())
    }

    pub fn agencies(&self) -> Vec<crate::Agency> {
        get_agencies(self.st()).expect("get_agencies")
    }

    pub fn partner_tx_count(&self, name: &str, kind: &str, source_type: &str) -> i64 {
        let txs = get_partner_transactions(self.st(), name.to_string(), kind.to_string())
            .unwrap_or_default();
        txs.iter()
            .filter(|tx| tx.source_type.as_deref() == Some(source_type))
            .count() as i64
    }

    pub fn stale_expense_partner_rows(&self, expense_id: i64, stale_amount: Money) -> i64 {
        let txs = get_partner_transactions(self.st(), "أمير".to_string(), "شريك".to_string())
            .unwrap_or_default();
        txs.iter()
            .filter(|tx| {
                tx.source_type.as_deref() == Some("expense")
                    && tx.source_id.as_deref() == Some(&expense_id.to_string())
                    && (tx.amount - stale_amount / Money(dec!(2))).abs() < Money(dec!(0.01))
            })
            .count() as i64
    }

    pub fn add_partner_tx(
        &self,
        name: &str,
        kind: &str,
        type_: &str,
        amount: Money,
        date: &str,
    ) -> Result<(), String> {
        add_partner_transaction(
            self.st(),
            name.to_string(),
            kind.to_string(),
            type_.to_string(),
            amount,
            date.to_string(),
            None,
            Some("IQD".to_string()),
            Some("قاصه".to_string()),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_term_sale(
        &self,
        num: &str,
        purchase: Money,
        selling: Money,
        down: Money,
        remaining: Money,
        buyer: &str,
        months: i32,
    ) -> Result<(), String> {
        self.add_car_cash_purchase(num, purchase, "IQD")?;
        crate::sell_car_with_accounting(
            self.st(),
            num.to_string(),
            buyer.to_string(),
            "07800000000".to_string(),
            selling,
            "IQD".to_string(),
            self.today(),
            "موعد".to_string(),
            down,
            remaining,
            Some(months),
            Some(self.date_plus_days(14)),
            None,
            None,
        )
    }

    pub fn sell_funded_car_cash(
        &self,
        num: &str,
        selling: Money,
        buyer: &str,
    ) -> Result<(), String> {
        self.sell_car_cash(num, selling, buyer)
    }

    pub fn delete_general_expense(&self, id: i64) -> Result<(), String> {
        delete_expense(self.st(), id)
    }

    pub fn delete_car_expense(&self, id: i64) -> Result<(), String> {
        // Route through the atomic apply_car_expense_changes command. We need
        // the car's chassis + car_number for the expense being deleted.
        let (car_number, chassis): (String, String) = {
            let db = self.st().inner().db.lock().map_err(|e| e.to_string())?;
            db.query_row(
                "SELECT ce.car_number, COALESCE(c.chassis_number, '')
                 FROM car_expenses ce
                 JOIN cars c ON c.car_number = ce.car_number
                 WHERE ce.id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("تعذر العثور على مصروف السيارة رقم {id}: {e}"))?
        };
        apply_car_expense_changes(self.st(), car_number, chassis, vec![id], Vec::new())
    }

    pub fn last_car_expense_id(&self, car_num: &str) -> Result<i64, String> {
        let db = self.st().inner().db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT id FROM car_expenses WHERE car_number = ?1 ORDER BY id DESC LIMIT 1",
            [car_num],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }

    pub fn update_sold_car(
        &self,
        car_num: &str,
        selling_price: Money,
        buyer: &str,
    ) -> Result<(), String> {
        update_sold_car_with_accounting(
            self.st(),
            car_num.to_string(),
            buyer.to_string(),
            format!("078{buyer}"),
            selling_price,
            "IQD".to_string(),
            self.today(),
            "كاش".to_string(),
            selling_price,
            Money::zero(),
            None,
            None,
            None,
            None,
        )
    }

    pub fn add_funder_partner(&self, name: &str) -> Result<(), String> {
        add_partner(
            self.st(),
            name.to_string(),
            "07800000000".to_string(),
            "ممول".to_string(),
        )
    }

    pub fn add_company_partner(&self, name: &str) -> Result<(), String> {
        add_partner(
            self.st(),
            name.to_string(),
            "07800000000".to_string(),
            "شركة".to_string(),
        )
    }

    pub fn add_funder_tx(
        &self,
        name: &str,
        type_: &str,
        amount: Money,
        date: &str,
    ) -> Result<(), String> {
        add_partner_transaction(
            self.st(),
            name.to_string(),
            "ممول".to_string(),
            type_.to_string(),
            amount,
            date.to_string(),
            None,
            Some("IQD".to_string()),
            Some("قاصه".to_string()),
        )
    }

    pub fn add_company_tx(
        &self,
        name: &str,
        type_: &str,
        amount: Money,
        date: &str,
    ) -> Result<(), String> {
        add_partner_transaction(
            self.st(),
            name.to_string(),
            "شركة".to_string(),
            type_.to_string(),
            amount,
            date.to_string(),
            None,
            Some("IQD".to_string()),
            Some("قاصه".to_string()),
        )
    }

    pub fn add_agency_usd(&self, old: &str, new: &str, amount: Money) -> Result<i64, String> {
        add_agency(
            self.st(),
            old.to_string(),
            "هوندا".to_string(),
            String::new(),
            String::new(),
            String::new(),
            new.to_string(),
            String::new(),
            amount,
            Money::zero(),
            String::new(),
            None,
            None,
        )
    }

    pub fn try_add_shuraka(&self, name: &str) -> Result<(), String> {
        add_partner(
            self.st(),
            name.to_string(),
            "07800000000".to_string(),
            "شريك".to_string(),
        )
    }

    pub fn partners(&self) -> Vec<crate::Partner> {
        get_partners(self.st()).unwrap_or_default()
    }

    pub fn shuraka_count(&self) -> i64 {
        self.partners().iter().filter(|p| p.kind == "شريك").count() as i64
    }

    pub fn customer_balance_iqd(&self, name: &str) -> Money {
        self.partners()
            .iter()
            .find(|p| p.partner_name == name)
            .map(|p| p.iqd_balance)
            .unwrap_or(Money::zero())
    }

    pub fn cash_register_total(&self, payment_type: &str) -> Money {
        get_cash_register_entries(self.st(), Some(payment_type.to_string()))
            .unwrap_or_default()
            .iter()
            .map(|e| e.amount)
            .sum()
    }

    pub fn add_usd_expense(&self, amount: Money) -> Result<(), String> {
        add_expense(
            self.st(),
            "مصروف USD".to_string(),
            amount,
            self.today(),
            None,
            Some("USD".to_string()),
            None,
            None,
        )
    }

    pub fn export_database(&self) -> Result<String, String> {
        // Bug 3 (AU3): Pass None for the new optional session_token argument
        // (the test harness doesn't establish a session).
        export_database_to_excel(self.st(), None)
    }

    pub fn read_only_roundtrip(&self) -> Result<(), String> {
        for _ in 0..10 {
            let _ = get_financial_summary(self.st(), None)?;
            let _ = get_profit_distribution_summary(self.st(), None, None)?;
            let _ = get_cars(self.st())?;
            let _ = get_partners(self.st())?;
        }
        Ok(())
    }

    pub fn total_partner_profit_iqd(&self) -> Money {
        self.profit_dist()
            .partners
            .iter()
            .map(|p| p.profit_iqd)
            .sum()
    }

    pub fn partner_tx_by_role(&self, name: &str, source_type: &str, source_role: &str) -> i64 {
        let txs = get_partner_transactions(self.st(), name.to_string(), "شريك".to_string())
            .unwrap_or_default();
        txs.iter()
            .filter(|tx| {
                tx.source_type.as_deref() == Some(source_type)
                    && tx.source_role.as_deref() == Some(source_role)
            })
            .count() as i64
    }

    pub fn get_partner_transactions(
        &self,
        name: &str,
        kind: &str,
    ) -> Vec<crate::PartnerTransaction> {
        get_partner_transactions(self.st(), name.to_string(), kind.to_string()).unwrap_or_default()
    }

    pub fn add_company_car_plain(&self, num: &str, purchase: Money) -> Result<(), String> {
        add_car(
            self.st(),
            num.to_string(),
            format!("CH-{num}"),
            "Toyota".to_string(),
            "2024".to_string(),
            format!("سيارة {num}"),
            "أبيض".to_string(),
            String::new(),
            purchase,
            Some("IQD".to_string()),
            None,
            Money::zero(),
            "متوفرة".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(self.month_start()),
            None,
            None,
            None,
            Some("قاصه".to_string()),
            None,
            Some("شركة".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
        )
    }
}

pub fn near(a: Money, b: Money) -> bool {
    (a - b).abs() < Money(dec!(0.01))
}

pub fn exact(a: Money, b: Money) -> bool {
    (a - b).abs() < Money(dec!(0.001))
}

pub fn flush_results_to_disk() {
    let path = results_json_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let results = results_store().lock().unwrap().clone();
    let json = serde_json::to_string_pretty(&results).unwrap_or_else(|_| "[]".to_string());
    let _ = fs::write(&path, json);
}

pub fn clear_results() {
    results_store().lock().unwrap().clear();
    let path = results_json_path();
    let _ = fs::remove_file(path);
}

pub fn record_result(result: RealVerificationResult) {
    results_store().lock().unwrap().push(result);
    flush_results_to_disk();
}

pub fn results_json_path() -> PathBuf {
    // Prefer CARGO_TARGET_TMPDIR (a per-crate temp dir provided by cargo to
    // integration tests) so test runs don't write into the source tree. Fall
    // back to CARGO_MANIFEST_DIR for older toolchains / non-cargo invocations.
    let base = std::env::var("CARGO_TARGET_TMPDIR")
        .unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").to_string());
    PathBuf::from(base).join("../test/accounting/state/TAURI_REAL_VERIFICATION_RESULTS.json")
}

pub fn full_71_results_json_path() -> PathBuf {
    let base = std::env::var("CARGO_TARGET_TMPDIR")
        .unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").to_string());
    PathBuf::from(base).join("../test/accounting/state/TAURI_REAL_FULL_71_RESULTS.json")
}

pub fn clear_full_71_results() {
    full_71_results_store().lock().unwrap().clear();
    let _ = fs::remove_file(full_71_results_json_path());
}

pub fn flush_full_71_results_to_disk() {
    let path = full_71_results_json_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let results = full_71_results_store().lock().unwrap().clone();
    let json = serde_json::to_string_pretty(&results).unwrap_or_else(|_| "[]".to_string());
    let _ = fs::write(&path, json);
}

pub fn record_full_71_result(result: RealVerificationResult) {
    full_71_results_store().lock().unwrap().push(result);
    flush_full_71_results_to_disk();
}

pub fn json_num(fields: &[(&str, Money)]) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (k, v) in fields {
        map.insert((*k).to_string(), serde_json::json!(v));
    }
    serde_json::Value::Object(map)
}

pub fn run_full_71<F>(id: &str, name: &str, group: &str, rust_fns: &[&str], f: F)
where
    F: FnOnce(&TestHarness) -> Result<(serde_json::Value, serde_json::Value, String), String>,
{
    let harness = TestHarness::new();
    match f(&harness) {
        Ok((expected, actual, notes)) => {
            let status = if verify_json_match(&expected, &actual) {
                "PASS"
            } else {
                "FAIL"
            };
            record_full_71_result(RealVerificationResult {
                id: id.to_string(),
                name: name.to_string(),
                related_scenarios: vec![id.to_string()],
                group: group.to_string(),
                status: status.to_string(),
                expected,
                actual,
                rust_functions: rust_fns.iter().map(|s| s.to_string()).collect(),
                notes,
            });
        }
        Err(err) => {
            record_full_71_result(RealVerificationResult {
                id: id.to_string(),
                name: name.to_string(),
                related_scenarios: vec![id.to_string()],
                group: group.to_string(),
                status: "FAIL".to_string(),
                expected: serde_json::json!({}),
                actual: serde_json::json!({ "error": err.clone() }),
                rust_functions: rust_fns.iter().map(|s| s.to_string()).collect(),
                notes: err,
            });
        }
    }
}

pub fn run_and_record<F>(id: &str, name: &str, related: &[&str], rust_fns: &[&str], f: F)
where
    F: FnOnce(&TestHarness) -> Result<(serde_json::Value, serde_json::Value, String), String>,
{
    let harness = TestHarness::new();
    match f(&harness) {
        Ok((expected, actual, notes)) => {
            let status = if verify_json_match(&expected, &actual) {
                "PASS"
            } else {
                "FAIL"
            };
            record_result(RealVerificationResult {
                id: id.to_string(),
                name: name.to_string(),
                related_scenarios: related.iter().map(|s| s.to_string()).collect(),
                group: String::new(),
                status: status.to_string(),
                expected,
                actual,
                rust_functions: rust_fns.iter().map(|s| s.to_string()).collect(),
                notes,
            });
        }
        Err(err) => {
            record_result(RealVerificationResult {
                id: id.to_string(),
                name: name.to_string(),
                related_scenarios: related.iter().map(|s| s.to_string()).collect(),
                group: String::new(),
                status: "FAIL".to_string(),
                expected: serde_json::json!({}),
                actual: serde_json::json!({ "error": err.clone() }),
                rust_functions: rust_fns.iter().map(|s| s.to_string()).collect(),
                notes: err,
            });
        }
    }
}

fn verify_json_match(expected: &serde_json::Value, actual: &serde_json::Value) -> bool {
    match (expected, actual) {
        (serde_json::Value::Object(exp), serde_json::Value::Object(act)) => exp
            .iter()
            .all(|(k, v)| act.get(k).map(|a| values_near(v, a)).unwrap_or(false)),
        _ => values_near(expected, actual),
    }
}

fn values_near(expected: &serde_json::Value, actual: &serde_json::Value) -> bool {
    match (expected, actual) {
        (serde_json::Value::Number(e), serde_json::Value::Number(a)) => {
            let expected_money = e
                .to_string()
                .parse::<Money>()
                .unwrap_or_else(|_| Money::zero());
            let actual_money = a
                .to_string()
                .parse::<Money>()
                .unwrap_or_else(|_| Money::zero());
            near(expected_money, actual_money)
        }
        (serde_json::Value::String(e), serde_json::Value::String(a)) => e == a,
        (serde_json::Value::Bool(e), serde_json::Value::Bool(a)) => e == a,
        _ => expected == actual,
    }
}

pub fn snapshot_json(s: &SummarySnapshot) -> serde_json::Value {
    serde_json::json!({
        "qasa_iqd": s.qasa_iqd,
        "qasa_usd": s.qasa_usd,
        "cash_iqd": s.cash_iqd,
        "cash_usd": s.cash_usd,
        "inventory_value_iqd": s.inventory_value_iqd,
        "inventory_value_usd": s.inventory_value_usd,
        "monthly_profits_iqd": s.monthly_profits_iqd,
        "monthly_profits_usd": s.monthly_profits_usd,
        "total_investments_iqd": s.total_investments_iqd,
        "total_investments_usd": s.total_investments_usd,
        "total_debtors_iqd": s.total_debtors_iqd,
        "total_debtors_usd": s.total_debtors_usd,
        "total_partner_capital_iqd": s.total_partner_capital_iqd,
        "total_partner_capital_usd": s.total_partner_capital_usd,
        "total_expenses_iqd": s.total_expenses_iqd,
        "total_expenses_usd": s.total_expenses_usd,
        "deferred_revenue_iqd": s.deferred_revenue_iqd,
        "deferred_revenue_usd": s.deferred_revenue_usd,
        "deferred_expense_iqd": s.deferred_expense_iqd,
        "deferred_expense_usd": s.deferred_expense_usd,
        "net_capital_iqd": s.net_capital_iqd,
        "net_capital_usd": s.net_capital_usd,
    })
}
