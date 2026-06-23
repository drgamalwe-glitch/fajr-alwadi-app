//! Real Rust/Tauri accounting verification — calls production command handlers only.

use fajir_alwadi_lib::accounting_test_support::{
    clear_results, flush_results_to_disk, run_and_record, TestHarness,
};

fn setup() {
    clear_results();
}

fn delete_partner_blocked(h: &TestHarness, name: &str) -> bool {
    h.try_delete_partner(name, "مستثمر").is_err()
}

#[test]
fn accounting_real_backend_all() {
    setup();
    real_s04_usd_inventory();
    real_s13_installment_profit_cap();
    real_s15_installment_car_expense();
    real_s19_car_expense_after_cash_sale();
    real_s24_edit_general_expense();
    real_s26_investor_liability();
    real_s31_funder_repayment();
    real_s36_company_repayment();
    real_s51_edit_available_car_purchase();
    real_s55_delete_sold_installment_car();
    real_s42_agency_delete_by_id();
    regression_smoke_checks();
    flush_results_to_disk();

    let results = fajir_alwadi_lib::accounting_test_support::results_store()
        .lock()
        .unwrap()
        .clone();
    let failed: Vec<_> = results.iter().filter(|r| r.status == "FAIL").collect();
    assert!(
        failed.is_empty(),
        "Real verification failures: {:?}",
        failed.iter().map(|r| &r.id).collect::<Vec<_>>()
    );
}

fn real_s04_usd_inventory() {
    run_and_record(
        "REAL-S04",
        "USD inventory by currency",
        &["S04"],
        &["add_car", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S04", 10_000.0, "USD")?;
            let s = h.summary_snapshot();
            let expected = serde_json::json!({
                "inventory_value_usd": 10_000.0,
                "qasa_usd": -10_000.0,
                "qasa_iqd": 0.0,
                "inventory_value_iqd": 0.0,
            });
            let actual = serde_json::json!({
                "inventory_value_usd": s.inventory_value_usd,
                "qasa_usd": s.qasa_usd,
                "qasa_iqd": s.qasa_iqd,
                "inventory_value_iqd": s.inventory_value_iqd,
            });
            Ok((expected, actual, "USD purchase moves USD qasa/inventory only".into()))
        },
    );
}

fn real_s13_installment_profit_cap() {
    run_and_record(
        "REAL-S13",
        "Installment profit cap",
        &["S13"],
        &[
            "add_car",
            "add_partner_transaction",
            "calculate_customer_payment_profit_capped",
            "get_financial_summary",
            "get_profit_distribution_summary",
        ],
        |h| {
            h.add_car_installment_sale(
                "CAR-S13",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S13",
            )?;
            for i in 0..16 {
                h.add_customer_installment_payment(
                    "زبون S13",
                    "CAR-S13",
                    1_000_000.0,
                    &h.date_plus_days(i as i64 + 1),
                )?;
            }
            let s = h.summary_snapshot();
            let pd = h.profit_dist();
            let total_profit: f64 = pd.partners.iter().map(|p| p.profit_iqd).sum();
            let amir = h.partner_profit_iqd("أمير");
            let muntasir = h.partner_profit_iqd("منتصر");
            if total_profit > 10_000_000.0 + 0.01 {
                return Err(format!("profit cap exceeded: {total_profit}"));
            }
            let expected = serde_json::json!({
                "monthly_profits_iqd": 10_000_000.0,
                "qasa_iqd": 11_000_000.0,
                "total_partner_profit_iqd": 10_000_000.0,
                "amir_profit_iqd": 5_000_000.0,
                "muntasir_profit_iqd": 5_000_000.0,
            });
            let actual = serde_json::json!({
                "monthly_profits_iqd": s.monthly_profits_iqd,
                "qasa_iqd": s.qasa_iqd,
                "total_partner_profit_iqd": total_profit,
                "amir_profit_iqd": amir,
                "muntasir_profit_iqd": muntasir,
            });
            Ok((expected, actual, "Overpayment caps profit at full car profit".into()))
        },
    );
}

fn real_s15_installment_car_expense() {
    run_and_record(
        "REAL-S15",
        "Installment profit after car expense",
        &["S15"],
        &[
            "add_car",
            "add_car_expense_record",
            "add_partner_transaction",
            "get_financial_summary",
        ],
        |h| {
            h.add_car_installment_sale(
                "CAR-S15",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S15",
            )?;
            h.add_car_expense("CAR-S15", 2_000_000.0, &h.today())?;
            h.add_customer_installment_payment(
                "زبون S15",
                "CAR-S15",
                1_000_000.0,
                &h.date_plus_days(1),
            )?;
            let s = h.summary_snapshot();
            let amir = h.partner_profit_iqd("أمير");
            let muntasir = h.partner_profit_iqd("منتصر");
            let expected = serde_json::json!({
                "monthly_profits_iqd": 2_400_000.0,
                "qasa_iqd": -6_000_000.0,
                "amir_profit_iqd": 1_200_000.0,
                "muntasir_profit_iqd": 1_200_000.0,
            });
            let actual = serde_json::json!({
                "monthly_profits_iqd": s.monthly_profits_iqd,
                "qasa_iqd": s.qasa_iqd,
                "amir_profit_iqd": amir,
                "muntasir_profit_iqd": muntasir,
            });
            Ok((expected, actual, "40% profit ratio after 2M car expense".into()))
        },
    );
}

fn real_s19_car_expense_after_cash_sale() {
    run_and_record(
        "REAL-S19",
        "Car expense after cash sale",
        &["S19"],
        &[
            "add_car",
            "sell_car_with_accounting",
            "add_car_expense_record",
            "rebuild_sold_car_accounting_after_cost_change",
            "get_financial_summary",
        ],
        |h| {
            h.add_car_cash_purchase("CAR-S19", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S19", 18_000_000.0, "زبون S19")?;
            let before = h.summary_snapshot();
            h.add_car_expense("CAR-S19", 1_000_000.0, &h.today())?;
            let after = h.summary_snapshot();
            let expected = serde_json::json!({
                "profit_before": 8_000_000.0,
                "profit_after": 8_000_000.0,
                "qasa_after": 7_000_000.0,
            });
            let actual = serde_json::json!({
                "profit_before": before.monthly_profits_iqd,
                "profit_after": after.monthly_profits_iqd,
                "qasa_after": after.qasa_iqd,
            });
            Ok((expected, actual, "Post-sale car expense reduces qasa only".into()))
        },
    );
}

fn real_s24_edit_general_expense() {
    run_and_record(
        "REAL-S24",
        "Edit general expense rebuild",
        &["S24"],
        &["add_expense", "update_expense", "get_financial_summary"],
        |h| {
            let exp_id = h.add_general_expense(1_000_000.0)?;
            h.update_general_expense(exp_id, 2_000_000.0)?;
            let s = h.summary_snapshot();
            let stale = h.stale_expense_partner_rows(exp_id, 1_000_000.0);
            let expected = serde_json::json!({
                "qasa_iqd": -2_000_000.0,
                "cash_iqd": -2_000_000.0,
                "monthly_profits_iqd": -2_000_000.0,
                "stale_1m_rows": 0.0,
            });
            let actual = serde_json::json!({
                "qasa_iqd": s.qasa_iqd,
                "cash_iqd": s.cash_iqd,
                "monthly_profits_iqd": s.monthly_profits_iqd,
                "stale_1m_rows": stale as f64,
            });
            Ok((expected, actual, "Expense edit rebuilds partner rows".into()))
        },
    );
}

fn real_s26_investor_liability() {
    run_and_record(
        "REAL-S26",
        "Investor liability / investments",
        &["S26", "S27", "S28", "S29", "S71"],
        &[
            "add_partner",
            "add_partner_transaction",
            "delete_partner",
            "get_financial_summary",
            "recalculate_partner_total",
        ],
        |h| {
            h.add_investor("مستثمر واحد")?;
            h.add_investor_tx("مستثمر واحد", "ايداع", 10_000_000.0, &h.month_start())?;
            let after_deposit = h.summary_snapshot();

            h.add_investor_tx("مستثمر واحد", "سحب", 4_000_000.0, &h.date_plus_days(5))?;
            let after_withdraw = h.summary_snapshot();

            h.add_investor("مستثمر ثلاثة")?;
            h.add_investor_tx("مستثمر ثلاثة", "ايداع", 20_000_000.0, &h.month_start())?;
            h.add_car_cash_purchase("CAR-S28", 10_000_000.0, "IQD")?;
            let after_car = h.summary_snapshot();

            let delete_h = TestHarness::new();
            delete_h.add_investor("مستثمر للحذف")?;
            delete_h.add_investor_tx("مستثمر للحذف", "ايداع", 5_000_000.0, &h.month_start())?;
            let blocked = delete_partner_blocked(&delete_h, "مستثمر للحذف");

            let expected = serde_json::json!({
                "deposit_qasa": 10_000_000.0,
                "deposit_investments": 10_000_000.0,
                "deposit_cash": 0.0,
                "deposit_profit": 0.0,
                "withdraw_qasa": 6_000_000.0,
                "withdraw_investments": 6_000_000.0,
                "mixed_qasa": 16_000_000.0,
                "mixed_inventory": 10_000_000.0,
                "delete_blocked": 1.0,
            });
            let actual = serde_json::json!({
                "deposit_qasa": after_deposit.qasa_iqd,
                "deposit_investments": after_deposit.total_investments_iqd,
                "deposit_cash": after_deposit.cash_iqd,
                "deposit_profit": after_deposit.monthly_profits_iqd,
                "withdraw_qasa": after_withdraw.qasa_iqd,
                "withdraw_investments": after_withdraw.total_investments_iqd,
                "mixed_qasa": after_car.qasa_iqd,
                "mixed_inventory": after_car.inventory_value_iqd,
                "delete_blocked": if blocked { 1.0 } else { 0.0 },
            });
            Ok((expected, actual, "Investor affects qasa/investments only".into()))
        },
    );
}

fn real_s31_funder_repayment() {
    run_and_record(
        "REAL-S31",
        "Funder repayment from partners",
        &["S31", "S32", "S33", "S69"],
        &[
            "add_car",
            "pay_financier_from_partners",
            "deduct_from_partners_5050_with_effects",
            "get_financial_summary",
        ],
        |h| {
            h.add_funded_car("CAR-S31", "ممول S31", 10_000_000.0)?;
            let before = h.summary_snapshot();
            h.pay_financier("ممول S31", "ممول", 10_000_000.0, &h.date_plus_days(1))?;
            let after = h.summary_snapshot();
            let expected = serde_json::json!({
                "qasa_before": 0.0,
                "cash_before": 0.0,
                "profit_before": 0.0,
                "qasa_after": -10_000_000.0,
                "cash_after": -10_000_000.0,
                "profit_after": 0.0,
                "inventory_after": 10_000_000.0,
            });
            let actual = serde_json::json!({
                "qasa_before": before.qasa_iqd,
                "cash_before": before.cash_iqd,
                "profit_before": before.monthly_profits_iqd,
                "qasa_after": after.qasa_iqd,
                "cash_after": after.cash_iqd,
                "profit_after": after.monthly_profits_iqd,
                "inventory_after": after.inventory_value_iqd,
            });
            Ok((expected, actual, "Funder financing silent; partner repayment hits qasa/cash".into()))
        },
    );
}

fn real_s36_company_repayment() {
    run_and_record(
        "REAL-S36",
        "Company repayment from partners",
        &["S36", "S37", "S70"],
        &["add_car", "pay_financier_from_partners", "get_financial_summary"],
        |h| {
            h.add_company_car("CAR-S36", "شركة S36", 10_000_000.0)?;
            let before = h.summary_snapshot();
            h.pay_financier("شركة S36", "شركة", 10_000_000.0, &h.date_plus_days(1))?;
            let after = h.summary_snapshot();
            let expected = serde_json::json!({
                "qasa_before": 0.0,
                "cash_before": 0.0,
                "profit_before": 0.0,
                "qasa_after": -10_000_000.0,
                "cash_after": -10_000_000.0,
                "profit_after": 0.0,
            });
            let actual = serde_json::json!({
                "qasa_before": before.qasa_iqd,
                "cash_before": before.cash_iqd,
                "profit_before": before.monthly_profits_iqd,
                "qasa_after": after.qasa_iqd,
                "cash_after": after.cash_iqd,
                "profit_after": after.monthly_profits_iqd,
            });
            Ok((expected, actual, "Company purchase silent until partner repayment".into()))
        },
    );
}

fn real_s51_edit_available_car_purchase() {
    run_and_record(
        "REAL-S51",
        "Edit available car purchase",
        &["S51"],
        &["add_car", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S51", 10_000_000.0, "IQD")?;
            let before = h.summary_snapshot();
            h.edit_car_purchase("CAR-S51", 15_000_000.0)?;
            let after = h.summary_snapshot();
            let purchase_rows = h.partner_tx_count("أمير", "شريك", "car_purchase");
            let expected = serde_json::json!({
                "inventory_before": 10_000_000.0,
                "qasa_before": -10_000_000.0,
                "inventory_after": 15_000_000.0,
                "qasa_after": -15_000_000.0,
                "purchase_rows_per_partner": 1.0,
            });
            let actual = serde_json::json!({
                "inventory_before": before.inventory_value_iqd,
                "qasa_before": before.qasa_iqd,
                "inventory_after": after.inventory_value_iqd,
                "qasa_after": after.qasa_iqd,
                "purchase_rows_per_partner": purchase_rows as f64,
            });
            Ok((expected, actual, "Purchase price edit rebuilds qasa/inventory".into()))
        },
    );
}

fn real_s55_delete_sold_installment_car() {
    run_and_record(
        "REAL-S55",
        "Delete sold installment car",
        &["S55"],
        &[
            "add_car",
            "add_partner_transaction",
            "delete_car",
            "delete_sale_generated_customer_rows_for_car",
            "get_financial_summary",
        ],
        |h| {
            h.add_car_installment_sale(
                "CAR-S55",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S55",
            )?;
            h.add_customer_installment_payment(
                "زبون S55",
                "CAR-S55",
                1_000_000.0,
                &h.date_plus_days(1),
            )?;
            let before = h.summary_snapshot();
            h.delete_car("CAR-S55")?;
            let after = h.summary_snapshot();
            let orphan_profit = h.partner_tx_count("أمير", "شريك", "profit_recognition");
            let expected = serde_json::json!({
                "qasa_before": -4_000_000.0,
                "qasa_after": 0.0,
                "profit_after": 0.0,
                "inventory_after": 0.0,
                "debtors_after": 0.0,
                "orphan_profit_rows": 0.0,
            });
            let actual = serde_json::json!({
                "qasa_before": before.qasa_iqd,
                "qasa_after": after.qasa_iqd,
                "profit_after": after.monthly_profits_iqd,
                "inventory_after": after.inventory_value_iqd,
                "debtors_after": after.total_debtors_iqd,
                "orphan_profit_rows": orphan_profit as f64,
            });
            Ok((expected, actual, "Delete sold installment car cleans generated rows".into()))
        },
    );
}

fn real_s42_agency_delete_by_id() {
    run_and_record(
        "REAL-S42",
        "Agency delete by ID",
        &["S42"],
        &[
            "add_agency",
            "delete_agency",
            "get_agencies",
            "delete_partner_transactions_by_source_with_ledger",
        ],
        |h| {
            let id1 = h.add_agency_iqd("وكيل مشترك", "وكيل جديد أ", 1_000_000.0)?;
            let id2 = h.add_agency_iqd("وكيل مشترك", "وكيل جديد ب", 2_000_000.0)?;
            h.delete_agency(id1)?;
            let agencies = h.agencies();
            let remaining = agencies.iter().filter(|a| a.id == id2).count();
            let deleted_gone = agencies.iter().any(|a| a.id == id1);
            let expected = serde_json::json!({
                "remaining_count": 1.0,
                "deleted_gone": 0.0,
                "distinct_ids": 1.0,
            });
            let actual = serde_json::json!({
                "remaining_count": remaining as f64,
                "deleted_gone": if deleted_gone { 1.0 } else { 0.0 },
                "distinct_ids": if id1 != id2 { 1.0 } else { 0.0 },
            });
            Ok((expected, actual, "Agency delete by ID removes only target agency".into()))
        },
    );
}

fn regression_smoke_checks() {
    run_and_record(
        "REAL-REG-S01",
        "Regression: cash car purchase",
        &["S01"],
        &["add_car", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-REG01", 10_000_000.0, "IQD")?;
            let s = h.summary_snapshot();
            let expected = serde_json::json!({
                "inventory_value_iqd": 10_000_000.0,
                "qasa_iqd": -10_000_000.0,
                "monthly_profits_iqd": 0.0,
            });
            let actual = serde_json::json!({
                "inventory_value_iqd": s.inventory_value_iqd,
                "qasa_iqd": s.qasa_iqd,
                "monthly_profits_iqd": s.monthly_profits_iqd,
            });
            Ok((expected, actual, "Regression S01".into()))
        },
    );

    run_and_record(
        "REAL-REG-S05",
        "Regression: cash sale after cash purchase",
        &["S05"],
        &["add_car", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-REG05", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-REG05", 20_000_000.0, "زبون REG05")?;
            let s = h.summary_snapshot();
            let expected = serde_json::json!({
                "qasa_iqd": 10_000_000.0,
                "monthly_profits_iqd": 10_000_000.0,
                "inventory_value_iqd": 0.0,
            });
            let actual = serde_json::json!({
                "qasa_iqd": s.qasa_iqd,
                "monthly_profits_iqd": s.monthly_profits_iqd,
                "inventory_value_iqd": s.inventory_value_iqd,
            });
            Ok((expected, actual, "Regression S05".into()))
        },
    );

    run_and_record(
        "REAL-REG-READONLY",
        "Regression: read-only safety",
        &["S63"],
        &["get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-REGRO", 5_000_000.0, "IQD")?;
            let before = h.summary_snapshot();
            let _ = h.summary();
            let after = h.summary_snapshot();
            let expected = serde_json::json!({
                "qasa_unchanged": before.qasa_iqd,
                "inventory_unchanged": before.inventory_value_iqd,
            });
            let actual = serde_json::json!({
                "qasa_unchanged": after.qasa_iqd,
                "inventory_unchanged": after.inventory_value_iqd,
            });
            Ok((expected, actual, "Regression read-only".into()))
        },
    );
}
