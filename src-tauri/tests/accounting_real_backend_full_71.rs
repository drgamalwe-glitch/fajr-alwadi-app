//! REAL_TAURI_RUST_FULL_71 — one real Rust verification per scenario S01–S71.

use fajir_alwadi_lib::accounting_test_support::{
    clear_full_71_results, flush_full_71_results_to_disk, full_71_results_store, json_num,
    run_full_71, snapshot_json, TestHarness,
};

macro_rules! s {
    ($id:expr, $group:expr, $name:expr, $fns:expr, |$h:ident| $body:expr) => {
        run_full_71($id, $name, $group, $fns, |$h| $body);
    };
}

type HarnessResult = Result<(serde_json::Value, serde_json::Value, String), String>;

fn ok(exp: serde_json::Value, act: serde_json::Value, notes: &str) -> HarnessResult {
    Ok((exp, act, notes.to_string()))
}

fn pay_installments(h: &TestHarness, buyer: &str, car: &str, count: usize, amount: f64) -> Result<(), String> {
    for i in 0..count {
        h.add_customer_installment_payment(buyer, car, amount, &h.date_plus_days(i as i64 + 1))?;
    }
    Ok(())
}

#[test]
fn accounting_real_backend_full_71() {
    clear_full_71_results();
    real_s01_cash_car_purchase();
    real_s02_funded_car_purchase();
    real_s03_company_car_purchase();
    real_s04_usd_cash_car_purchase();
    real_s05_cash_sale_after_cash_purchase();
    real_s06_cash_sale_after_funded_purchase();
    real_s07_cash_sale_after_company_purchase();
    real_s08_cash_sale_with_car_expense();
    real_s09_cash_sale_at_loss();
    real_s10_installment_after_down_payment();
    real_s11_installment_after_one_installment();
    real_s12_installment_after_all_payments();
    real_s13_installment_overpayment();
    real_s14_final_installment_exact_close();
    real_s15_installment_with_car_expense();
    real_s16_term_sale_with_down_payment();
    real_s17_term_sale_final_payment();
    real_s18_car_expense_before_sale();
    real_s19_car_expense_after_sale();
    real_s20_edit_car_expense();
    real_s21_delete_car_expense();
    real_s22_general_expense();
    real_s23_general_expense_after_car_profit();
    real_s24_edit_general_expense();
    real_s25_delete_general_expense();
    real_s26_investor_deposit();
    real_s27_investor_withdrawal();
    real_s28_investor_plus_car_purchase();
    real_s29_delete_investor_with_balance();
    real_s30_funder_financing();
    real_s31_funder_repayment();
    real_s32_partial_funder_repayment();
    real_s33_funder_repayment_with_commission();
    real_s34_delete_funder_with_balance();
    real_s35_company_purchase();
    real_s36_company_repayment();
    real_s37_partial_company_repayment();
    real_s38_delete_company_with_balance();
    real_s39_agency_profit_iqd();
    real_s40_agency_profit_usd();
    real_s41_two_agencies_same_names_date();
    real_s42_delete_one_agency_transaction();
    real_s43_customer_balance_after_installment();
    real_s44_customer_pays_one_installment();
    real_s45_customer_pays_all_installments();
    real_s46_print_customer_statement();
    real_s47_partner_deposits();
    real_s48_partner_withdrawal();
    real_s49_block_third_partner();
    real_s50_block_partner_deletion();
    real_s51_edit_available_car_purchase();
    real_s52_edit_sold_car_sale_price();
    real_s53_delete_available_car();
    real_s54_delete_sold_cash_car();
    real_s55_delete_sold_installment_car();
    real_s56_company_status_mixed_operations();
    real_s57_qasa_tab_equals_qasa_card();
    real_s58_cash_tab_equals_partner_cash_card();
    real_s59_profit_tab_equals_profit_card();
    real_s60_iqd_usd_separation();
    real_s61_usd_general_expense();
    real_s62_mixed_currency_blocked();
    real_s63_read_only_safety();
    real_s64_print_partner_statement();
    real_s65_print_customer_statement();
    real_s66_export_database();
    real_s67_full_cash_business_cycle();
    real_s68_full_installment_cycle();
    real_s69_funder_cycle();
    real_s70_company_cycle();
    real_s71_investor_cycle();
    flush_full_71_results_to_disk();

    let results = full_71_results_store().lock().unwrap().clone();
    let failed: Vec<_> = results.iter().filter(|r| r.status == "FAIL").collect();
    assert!(
        failed.is_empty(),
        "REAL_TAURI_RUST_FULL_71 failures: {:?}",
        failed.iter().map(|r| &r.id).collect::<Vec<_>>()
    );
    assert_eq!(results.len(), 71, "expected 71 scenario results, got {}", results.len());
}

fn real_s01_cash_car_purchase() {
    s!("S01", "CAR_PURCHASE", "Cash car purchase", &["add_car", "get_financial_summary"], |h| {
        h.add_car_cash_purchase("CAR-S01", 10_000_000.0, "IQD")?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("inventory_value_iqd", 10_000_000.0),
                ("qasa_iqd", -10_000_000.0),
                ("cash_iqd", -10_000_000.0),
                ("monthly_profits_iqd", 0.0),
            ]),
            json_num(&[
                ("inventory_value_iqd", s.inventory_value_iqd),
                ("qasa_iqd", s.qasa_iqd),
                ("cash_iqd", s.cash_iqd),
                ("monthly_profits_iqd", s.monthly_profits_iqd),
            ]),
            "Cash car purchase",
        )
    });
}

fn real_s02_funded_car_purchase() {
    s!("S02", "CAR_PURCHASE", "Funded car purchase", &["add_car", "get_financial_summary"], |h| {
        h.add_funded_car("CAR-S02", "ممول S02", 10_000_000.0)?;
        let s = h.summary_snapshot();
        let purchase_rows = h.partner_tx_count("أمير", "شريك", "car_purchase");
        ok(
            json_num(&[
                ("inventory_value_iqd", 10_000_000.0),
                ("qasa_iqd", 0.0),
                ("total_partner_capital_iqd", 0.0),
                ("monthly_profits_iqd", 0.0),
                ("purchase_rows", 0.0),
            ]),
            json_num(&[
                ("inventory_value_iqd", s.inventory_value_iqd),
                ("qasa_iqd", s.qasa_iqd),
                ("total_partner_capital_iqd", s.total_partner_capital_iqd),
                ("monthly_profits_iqd", s.monthly_profits_iqd),
                ("purchase_rows", purchase_rows as f64),
            ]),
            "Funded purchase — no partner cash movement",
        )
    });
}

fn real_s03_company_car_purchase() {
    s!("S03", "CAR_PURCHASE", "Company car purchase", &["add_car", "get_financial_summary"], |h| {
        h.add_company_car_plain("CAR-S03", 10_000_000.0)?;
        let s = h.summary_snapshot();
        let purchase_rows = h.partner_tx_count("أمير", "شريك", "car_purchase");
        ok(
            json_num(&[
                ("inventory_value_iqd", 10_000_000.0),
                ("qasa_iqd", 0.0),
                ("total_partner_capital_iqd", 0.0),
                ("monthly_profits_iqd", 0.0),
                ("purchase_rows", 0.0),
            ]),
            json_num(&[
                ("inventory_value_iqd", s.inventory_value_iqd),
                ("qasa_iqd", s.qasa_iqd),
                ("total_partner_capital_iqd", s.total_partner_capital_iqd),
                ("monthly_profits_iqd", s.monthly_profits_iqd),
                ("purchase_rows", purchase_rows as f64),
            ]),
            "Company purchase — silent on qasa/cash",
        )
    });
}

fn real_s04_usd_cash_car_purchase() {
    s!("S04", "CAR_PURCHASE", "USD cash car purchase", &["add_car", "get_financial_summary"], |h| {
        h.add_car_cash_purchase("CAR-S04", 10_000.0, "USD")?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("inventory_value_usd", 10_000.0),
                ("qasa_usd", -10_000.0),
                ("qasa_iqd", 0.0),
                ("inventory_value_iqd", 0.0),
            ]),
            json_num(&[
                ("inventory_value_usd", s.inventory_value_usd),
                ("qasa_usd", s.qasa_usd),
                ("qasa_iqd", s.qasa_iqd),
                ("inventory_value_iqd", s.inventory_value_iqd),
            ]),
            "USD purchase moves USD qasa/inventory only",
        )
    });
}

fn real_s05_cash_sale_after_cash_purchase() {
    s!(
        "S05",
        "CASH_SALES",
        "Cash sale after cash purchase",
        &["add_car", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S05", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S05", 16_000_000.0, "زبون S05")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 6_000_000.0),
                    ("monthly_profits_iqd", 6_000_000.0),
                    ("amir_profit_iqd", 3_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("amir_profit_iqd", h.partner_profit_iqd("أمير")),
                ]),
                "Purchase 10M / sell 16M",
            )
        }
    );
}

fn real_s06_cash_sale_after_funded_purchase() {
    s!(
        "S06",
        "CASH_SALES",
        "Cash sale after funded purchase",
        &["add_car", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_funded_car("CAR-S06", "ممول S06", 10_000_000.0)?;
            h.sell_car_cash("CAR-S06", 16_000_000.0, "زبون S06")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 16_000_000.0),
                    ("monthly_profits_iqd", 6_000_000.0),
                    ("inventory_value_iqd", 0.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("inventory_value_iqd", s.inventory_value_iqd),
                ]),
                "Funded purchase then cash sale",
            )
        }
    );
}

fn real_s07_cash_sale_after_company_purchase() {
    s!(
        "S07",
        "CASH_SALES",
        "Cash sale after company purchase",
        &["add_car", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_company_car_plain("CAR-S07", 10_000_000.0)?;
            h.sell_car_cash("CAR-S07", 16_000_000.0, "زبون S07")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 16_000_000.0),
                    ("monthly_profits_iqd", 6_000_000.0),
                    ("cash_iqd", 16_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("cash_iqd", s.cash_iqd),
                ]),
                "Company purchase then cash sale",
            )
        }
    );
}

fn real_s08_cash_sale_with_car_expense() {
    s!(
        "S08",
        "CASH_SALES",
        "Cash sale with car expense",
        &["add_car", "add_car_expense_record", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S08", 10_000_000.0, "IQD")?;
            h.add_car_expense("CAR-S08", 2_000_000.0, &h.today())?;
            h.sell_car_cash("CAR-S08", 18_000_000.0, "زبون S08")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", 6_000_000.0), ("monthly_profits_iqd", 6_000_000.0)]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Purchase 10M / expense 2M / sell 18M",
            )
        }
    );
}

fn real_s09_cash_sale_at_loss() {
    s!(
        "S09",
        "CASH_SALES",
        "Cash sale at loss",
        &["add_car", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S09", 20_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S09", 17_000_000.0, "زبون S09")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", -3_000_000.0),
                    ("monthly_profits_iqd", 0.0),
                    ("inventory_value_iqd", 0.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("inventory_value_iqd", s.inventory_value_iqd),
                ]),
                "Purchase 20M / sell 17M — no positive profit",
            )
        }
    );
}

fn real_s10_installment_after_down_payment() {
    s!(
        "S10",
        "INSTALLMENTS",
        "Installment - after down payment",
        &["add_car", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S10",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S10",
            )?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", -5_000_000.0),
                    ("monthly_profits_iqd", 2_500_000.0),
                    ("amir_profit_iqd", 1_250_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("amir_profit_iqd", h.partner_profit_iqd("أمير")),
                ]),
                "Down payment 5M on 10M/20M installment sale",
            )
        }
    );
}

fn real_s11_installment_after_one_installment() {
    s!(
        "S11",
        "INSTALLMENTS",
        "Installment - after one installment",
        &["add_car", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S11",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S11",
            )?;
            h.add_customer_installment_payment(
                "زبون S11",
                "CAR-S11",
                1_000_000.0,
                &h.date_plus_days(1),
            )?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", -4_000_000.0), ("monthly_profits_iqd", 3_000_000.0)]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Down 5M + one installment 1M",
            )
        }
    );
}

fn real_s12_installment_after_all_payments() {
    s!(
        "S12",
        "INSTALLMENTS",
        "Installment - after all payments",
        &["add_car", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S12",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S12",
            )?;
            pay_installments(h, "زبون S12", "CAR-S12", 15, 1_000_000.0)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 10_000_000.0),
                    ("monthly_profits_iqd", 10_000_000.0),
                    ("amir_profit_iqd", 5_000_000.0),
                    ("muntasir_profit_iqd", 5_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("amir_profit_iqd", h.partner_profit_iqd("أمير")),
                    ("muntasir_profit_iqd", h.partner_profit_iqd("منتصر")),
                ]),
                "All 15 installments paid — full profit recognized",
            )
        }
    );
}

fn real_s13_installment_overpayment() {
    s!(
        "S13",
        "INSTALLMENTS",
        "Installment overpayment",
        &[
            "add_car",
            "add_partner_transaction",
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
            pay_installments(h, "زبون S13", "CAR-S13", 16, 1_000_000.0)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 10_000_000.0),
                    ("qasa_iqd", 11_000_000.0),
                    ("amir_profit_iqd", 5_000_000.0),
                    ("muntasir_profit_iqd", 5_000_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                    ("amir_profit_iqd", h.partner_profit_iqd("أمير")),
                    ("muntasir_profit_iqd", h.partner_profit_iqd("منتصر")),
                ]),
                "Overpayment caps profit at full car profit",
            )
        }
    );
}

fn real_s14_final_installment_exact_close() {
    s!(
        "S14",
        "INSTALLMENTS",
        "Final installment exact close",
        &["add_car", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S14",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S14",
            )?;
            pay_installments(h, "زبون S14", "CAR-S14", 15, 1_000_000.0)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 10_000_000.0),
                    ("qasa_iqd", 10_000_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                ]),
                "Exact 15 installments — no extra profit on last payment",
            )
        }
    );
}

fn real_s15_installment_with_car_expense() {
    s!(
        "S15",
        "INSTALLMENTS",
        "Installment with car expense",
        &["add_car", "add_car_expense_record", "add_partner_transaction", "get_financial_summary"],
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
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 2_400_000.0),
                    ("qasa_iqd", -6_000_000.0),
                    ("amir_profit_iqd", 1_200_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                    ("amir_profit_iqd", h.partner_profit_iqd("أمير")),
                ]),
                "40% profit ratio after 2M car expense",
            )
        }
    );
}

fn real_s16_term_sale_with_down_payment() {
    s!("S16", "TERM_SALES", "Term sale with down payment", &["add_car", "sell_car_with_accounting", "get_financial_summary"], |h| {
        h.add_term_sale(
            "CAR-S16",
            10_000_000.0,
            20_000_000.0,
            5_000_000.0,
            15_000_000.0,
            "زبون S16",
            3,
        )?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("monthly_profits_iqd", 2_500_000.0),
                ("qasa_iqd", -5_000_000.0),
            ]),
            json_num(&[
                ("monthly_profits_iqd", s.monthly_profits_iqd),
                ("qasa_iqd", s.qasa_iqd),
            ]),
            "Term sale down payment",
        )
    });
}

fn real_s17_term_sale_final_payment() {
    s!(
        "S17",
        "TERM_SALES",
        "Term sale final payment",
        &["add_car", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_term_sale(
                "CAR-S17",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S17",
                3,
            )?;
            for i in 0..3 {
                h.add_customer_installment_payment(
                    "زبون S17",
                    "CAR-S17",
                    5_000_000.0,
                    &h.date_plus_days(i as i64 + 1),
                )?;
            }
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 10_000_000.0),
                    ("qasa_iqd", 10_000_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                ]),
                "Term sale — all payments complete",
            )
        }
    );
}

fn real_s18_car_expense_before_sale() {
    s!(
        "S18",
        "CAR_EXPENSES",
        "Car expense before sale",
        &["add_car", "add_car_expense_record", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S18", 10_000_000.0, "IQD")?;
            h.add_car_expense("CAR-S18", 1_000_000.0, &h.today())?;
            h.sell_car_cash("CAR-S18", 18_000_000.0, "زبون S18")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 7_000_000.0),
                    ("qasa_iqd", 7_000_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                ]),
                "Car expense before sale increases cost",
            )
        }
    );
}

fn real_s19_car_expense_after_sale() {
    s!(
        "S19",
        "CAR_EXPENSES",
        "Car expense after sale",
        &[
            "add_car",
            "sell_car_with_accounting",
            "add_car_expense_record",
            "get_financial_summary",
        ],
        |h| {
            h.add_car_cash_purchase("CAR-S19", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S19", 18_000_000.0, "زبون S19")?;
            h.add_car_expense("CAR-S19", 1_000_000.0, &h.today())?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 8_000_000.0),
                    ("qasa_iqd", 7_000_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                ]),
                "Post-sale car expense reduces qasa only",
            )
        }
    );
}

fn real_s20_edit_car_expense() {
    s!(
        "S20",
        "CAR_EXPENSES",
        "Edit car expense",
        &["add_car", "add_car_expense_record", "delete_car_expense_record", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S20", 10_000_000.0, "IQD")?;
            h.add_car_expense("CAR-S20", 1_000_000.0, &h.today())?;
            let exp_id = h.last_car_expense_id("CAR-S20")?;
            h.delete_car_expense(exp_id)?;
            h.add_car_expense("CAR-S20", 2_000_000.0, &h.today())?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("inventory_value_iqd", 12_000_000.0),
                    ("qasa_iqd", -12_000_000.0),
                ]),
                json_num(&[
                    ("inventory_value_iqd", s.inventory_value_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                ]),
                "Delete 1M expense then add 2M",
            )
        }
    );
}

fn real_s21_delete_car_expense() {
    s!(
        "S21",
        "CAR_EXPENSES",
        "Delete car expense",
        &["add_car", "add_car_expense_record", "delete_car_expense_record", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S21", 10_000_000.0, "IQD")?;
            h.add_car_expense("CAR-S21", 1_000_000.0, &h.today())?;
            let exp_id = h.last_car_expense_id("CAR-S21")?;
            h.delete_car_expense(exp_id)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("inventory_value_iqd", 10_000_000.0),
                    ("qasa_iqd", -10_000_000.0),
                ]),
                json_num(&[
                    ("inventory_value_iqd", s.inventory_value_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                ]),
                "Delete car expense restores original inventory/qasa",
            )
        }
    );
}

fn real_s22_general_expense() {
    s!("S22", "GENERAL_EXPENSES", "General expense", &["add_expense", "get_financial_summary"], |h| {
        h.add_general_expense(1_000_000.0)?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("qasa_iqd", -1_000_000.0),
                ("monthly_profits_iqd", -1_000_000.0),
            ]),
            json_num(&[
                ("qasa_iqd", s.qasa_iqd),
                ("monthly_profits_iqd", s.monthly_profits_iqd),
            ]),
            "Rent 1M general expense",
        )
    });
}

fn real_s23_general_expense_after_car_profit() {
    s!(
        "S23",
        "GENERAL_EXPENSES",
        "General expense after car profit",
        &["add_car", "sell_car_with_accounting", "add_expense", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S23", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S23", 18_000_000.0, "زبون S23")?;
            h.add_general_expense(1_000_000.0)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 7_000_000.0),
                    ("qasa_iqd", 7_000_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                ]),
                "Sell 18M then expense 1M",
            )
        }
    );
}

fn real_s24_edit_general_expense() {
    s!(
        "S24",
        "GENERAL_EXPENSES",
        "Edit general expense",
        &["add_expense", "update_expense", "get_financial_summary"],
        |h| {
            let exp_id = h.add_general_expense(1_000_000.0)?;
            h.update_general_expense(exp_id, 2_000_000.0)?;
            let s = h.summary_snapshot();
            let stale = h.stale_expense_partner_rows(exp_id, 1_000_000.0);
            ok(
                json_num(&[
                    ("qasa_iqd", -2_000_000.0),
                    ("monthly_profits_iqd", -2_000_000.0),
                    ("stale_1m_rows", 0.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("stale_1m_rows", stale as f64),
                ]),
                "Expense edit rebuilds partner rows",
            )
        }
    );
}

fn real_s25_delete_general_expense() {
    s!(
        "S25",
        "GENERAL_EXPENSES",
        "Delete general expense",
        &["add_expense", "delete_expense", "get_financial_summary"],
        |h| {
            let exp_id = h.add_general_expense(1_000_000.0)?;
            h.delete_general_expense(exp_id)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", 0.0)]),
                json_num(&[("qasa_iqd", s.qasa_iqd)]),
                "Delete general expense returns qasa to zero",
            )
        }
    );
}

fn real_s26_investor_deposit() {
    s!(
        "S26",
        "INVESTORS",
        "Investor deposit",
        &["add_partner", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_investor("مستثمر واحد")?;
            h.add_investor_tx("مستثمر واحد", "ايداع", 10_000_000.0, &h.month_start())?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 10_000_000.0),
                    ("total_investments_iqd", 10_000_000.0),
                    ("total_partner_capital_iqd", 0.0),
                    ("monthly_profits_iqd", 0.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("total_investments_iqd", s.total_investments_iqd),
                    ("total_partner_capital_iqd", s.total_partner_capital_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Investor deposit — qasa and investments only",
            )
        }
    );
}

fn real_s27_investor_withdrawal() {
    s!(
        "S27",
        "INVESTORS",
        "Investor withdrawal",
        &["add_partner", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_investor("مستثمر اثنان")?;
            h.add_investor_tx("مستثمر اثنان", "ايداع", 10_000_000.0, &h.month_start())?;
            h.add_investor_tx("مستثمر اثنان", "سحب", 4_000_000.0, &h.date_plus_days(5))?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 6_000_000.0),
                    ("total_investments_iqd", 6_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("total_investments_iqd", s.total_investments_iqd),
                ]),
                "Deposit 10M withdraw 4M",
            )
        }
    );
}

fn real_s28_investor_plus_car_purchase() {
    s!(
        "S28",
        "INVESTORS",
        "Investor + car purchase",
        &["add_partner", "add_partner_transaction", "add_car", "get_financial_summary"],
        |h| {
            h.add_investor("مستثمر ثلاثة")?;
            h.add_investor_tx("مستثمر ثلاثة", "ايداع", 20_000_000.0, &h.month_start())?;
            h.add_car_cash_purchase("CAR-S28", 10_000_000.0, "IQD")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 10_000_000.0),
                    ("inventory_value_iqd", 10_000_000.0),
                    ("total_investments_iqd", 20_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("inventory_value_iqd", s.inventory_value_iqd),
                    ("total_investments_iqd", s.total_investments_iqd),
                ]),
                "Investor 20M + car purchase 10M",
            )
        }
    );
}

fn real_s29_delete_investor_with_balance() {
    s!(
        "S29",
        "INVESTORS",
        "Delete investor with balance",
        &["add_partner", "add_partner_transaction", "delete_partner", "get_financial_summary"],
        |h| {
            h.add_investor("مستثمر اربعة")?;
            h.add_investor_tx("مستثمر اربعة", "ايداع", 5_000_000.0, &h.month_start())?;
            let blocked = h.try_delete_partner("مستثمر اربعة", "مستثمر").is_err();
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("delete_blocked", 1.0),
                    ("total_investments_iqd", 5_000_000.0),
                    ("qasa_iqd", 5_000_000.0),
                ]),
                json_num(&[
                    ("delete_blocked", if blocked { 1.0 } else { 0.0 }),
                    ("total_investments_iqd", s.total_investments_iqd),
                    ("qasa_iqd", s.qasa_iqd),
                ]),
                "Delete investor with balance is blocked",
            )
        }
    );
}

fn real_s30_funder_financing() {
    s!("S30", "FUNDERS", "Funder financing", &["add_car", "get_financial_summary"], |h| {
        h.add_funded_car("CAR-S30", "ممول S30", 10_000_000.0)?;
        let s = h.summary_snapshot();
        let purchase_rows = h.partner_tx_count("أمير", "شريك", "car_purchase");
        ok(
            json_num(&[
                ("qasa_iqd", 0.0),
                ("inventory_value_iqd", 10_000_000.0),
                ("purchase_rows", 0.0),
            ]),
            json_num(&[
                ("qasa_iqd", s.qasa_iqd),
                ("inventory_value_iqd", s.inventory_value_iqd),
                ("purchase_rows", purchase_rows as f64),
            ]),
            "Funder financing — silent on qasa/cash",
        )
    });
}

fn real_s31_funder_repayment() {
    s!(
        "S31",
        "FUNDERS",
        "Funder repayment",
        &["add_car", "pay_financier_from_partners", "get_financial_summary"],
        |h| {
            h.add_funded_car("CAR-S31", "ممول S31", 10_000_000.0)?;
            h.pay_financier("ممول S31", "ممول", 10_000_000.0, &h.date_plus_days(1))?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", -10_000_000.0),
                    ("cash_iqd", -10_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("cash_iqd", s.cash_iqd),
                ]),
                "Funder repay 10M from partners",
            )
        }
    );
}

fn real_s32_partial_funder_repayment() {
    s!(
        "S32",
        "FUNDERS",
        "Partial funder repayment",
        &["add_car", "pay_financier_from_partners", "get_financial_summary"],
        |h| {
            h.add_funded_car("CAR-S32", "ممول S32", 10_000_000.0)?;
            h.pay_financier("ممول S32", "ممول", 4_000_000.0, &h.date_plus_days(1))?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", -4_000_000.0)]),
                json_num(&[("qasa_iqd", s.qasa_iqd)]),
                "Partial funder repayment 4M",
            )
        }
    );
}

fn real_s33_funder_repayment_with_commission() {
    s!(
        "S33",
        "FUNDERS",
        "Funder repayment with commission",
        &["add_car", "pay_financier_from_partners", "get_financial_summary"],
        |h| {
            h.add_funded_car("CAR-S33", "ممول S33", 10_000_000.0)?;
            h.pay_financier("ممول S33", "ممول", 10_500_000.0, &h.date_plus_days(1))?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", -10_500_000.0)]),
                json_num(&[("qasa_iqd", s.qasa_iqd)]),
                "Funder repayment with commission 10.5M",
            )
        }
    );
}

fn real_s34_delete_funder_with_balance() {
    s!(
        "S34",
        "FUNDERS",
        "Delete funder with balance",
        &["add_partner", "add_partner_transaction", "delete_partner", "get_financial_summary"],
        |h| {
            h.add_funder_partner("ممول للحذف")?;
            h.add_funder_tx("ممول للحذف", "سحب", 5_000_000.0, &h.month_start())?;
            let blocked = h.try_delete_partner("ممول للحذف", "ممول").is_err();
            let still_exists = h
                .partners()
                .iter()
                .any(|p| p.partner_name == "ممول للحذف");
            ok(
                json_num(&[("delete_blocked", 1.0), ("funder_still_exists", 1.0)]),
                json_num(&[
                    ("delete_blocked", if blocked { 1.0 } else { 0.0 }),
                    ("funder_still_exists", if still_exists { 1.0 } else { 0.0 }),
                ]),
                "Delete funder with balance is blocked",
            )
        }
    );
}

fn real_s35_company_purchase() {
    s!("S35", "COMPANIES", "Company purchase", &["add_car", "get_financial_summary"], |h| {
        h.add_company_car_plain("CAR-S35", 10_000_000.0)?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("qasa_iqd", 0.0),
                ("inventory_value_iqd", 10_000_000.0),
            ]),
            json_num(&[
                ("qasa_iqd", s.qasa_iqd),
                ("inventory_value_iqd", s.inventory_value_iqd),
            ]),
            "Company purchase — silent on qasa",
        )
    });
}

fn real_s36_company_repayment() {
    s!(
        "S36",
        "COMPANIES",
        "Company repayment",
        &["add_car", "pay_financier_from_partners", "get_financial_summary"],
        |h| {
            h.add_company_car("CAR-S36", "شركة S36", 10_000_000.0)?;
            h.pay_financier("شركة S36", "شركة", 10_000_000.0, &h.date_plus_days(1))?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", -10_000_000.0)]),
                json_num(&[("qasa_iqd", s.qasa_iqd)]),
                "Company repay 10M from partners",
            )
        }
    );
}

fn real_s37_partial_company_repayment() {
    s!(
        "S37",
        "COMPANIES",
        "Partial company repayment",
        &["add_car", "pay_financier_from_partners", "get_financial_summary"],
        |h| {
            h.add_company_car_plain("CAR-S37", 10_000_000.0)?;
            h.pay_financier("شركة", "شركة", 3_000_000.0, &h.date_plus_days(1))?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", -3_000_000.0)]),
                json_num(&[("qasa_iqd", s.qasa_iqd)]),
                "Partial company repayment 3M",
            )
        }
    );
}

fn real_s38_delete_company_with_balance() {
    s!(
        "S38",
        "COMPANIES",
        "Delete company with balance",
        &["add_partner", "add_partner_transaction", "delete_partner", "get_financial_summary"],
        |h| {
            h.add_company_partner("شركة للحذف")?;
            h.add_company_tx("شركة للحذف", "سحب", 3_000_000.0, &h.month_start())?;
            let blocked = h.try_delete_partner("شركة للحذف", "شركة").is_err();
            let s = h.summary_snapshot();
            let still_exists = h
                .partners()
                .iter()
                .any(|p| p.partner_name == "شركة للحذف");
            ok(
                json_num(&[("qasa_iqd", 0.0), ("delete_blocked", 1.0), ("company_still_exists", 1.0)]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("delete_blocked", if blocked { 1.0 } else { 0.0 }),
                    ("company_still_exists", if still_exists { 1.0 } else { 0.0 }),
                ]),
                "Delete company with balance is blocked",
            )
        }
    );
}

fn real_s39_agency_profit_iqd() {
    s!("S39", "AGENCIES", "Agency profit IQD", &["add_agency", "get_financial_summary"], |h| {
        h.add_agency_iqd("وكيل قديم", "وكيل جديد", 2_000_000.0)?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("monthly_profits_iqd", 2_000_000.0),
                ("amir_profit_iqd", 1_000_000.0),
                ("muntasir_profit_iqd", 1_000_000.0),
            ]),
            json_num(&[
                ("monthly_profits_iqd", s.monthly_profits_iqd),
                ("amir_profit_iqd", h.partner_profit_iqd("أمير")),
                ("muntasir_profit_iqd", h.partner_profit_iqd("منتصر")),
            ]),
            "Agency profit 2M IQD split 50/50",
        )
    });
}

fn real_s40_agency_profit_usd() {
    s!("S40", "AGENCIES", "Agency profit USD", &["add_agency", "get_financial_summary"], |h| {
        h.add_agency_usd("وكيل USD قديم", "وكيل USD جديد", 5_000.0)?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[("monthly_profits_usd", 5_000.0)]),
            json_num(&[("monthly_profits_usd", s.monthly_profits_usd)]),
            "Agency profit 5K USD",
        )
    });
}

fn real_s41_two_agencies_same_names_date() {
    s!("S41", "AGENCIES", "Two agencies same names/date", &["add_agency", "get_agencies"], |h| {
        let id1 = h.add_agency_iqd("وكيل مشترك", "وكيل جديد أ", 1_000_000.0)?;
        let id2 = h.add_agency_iqd("وكيل مشترك", "وكيل جديد ب", 2_000_000.0)?;
        ok(
            json_num(&[("distinct_ids", 1.0)]),
            json_num(&[("distinct_ids", if id1 != id2 { 1.0 } else { 0.0 })]),
            "Two agencies with distinct IDs",
        )
    });
}

fn real_s42_delete_one_agency_transaction() {
    s!(
        "S42",
        "AGENCIES",
        "Delete one agency transaction",
        &["add_agency", "delete_agency", "get_agencies"],
        |h| {
            let id1 = h.add_agency_iqd("وكيل مشترك", "وكيل جديد أ", 1_000_000.0)?;
            let id2 = h.add_agency_iqd("وكيل مشترك", "وكيل جديد ب", 2_000_000.0)?;
            h.delete_agency(id1)?;
            let agencies = h.agencies();
            let remaining = agencies.iter().filter(|a| a.id == id2).count();
            let deleted_gone = agencies.iter().any(|a| a.id == id1);
            ok(
                json_num(&[
                    ("remaining_count", 1.0),
                    ("deleted_gone", 0.0),
                ]),
                json_num(&[
                    ("remaining_count", remaining as f64),
                    ("deleted_gone", if deleted_gone { 1.0 } else { 0.0 }),
                ]),
                "Agency delete by ID removes only target agency",
            )
        }
    );
}

fn real_s43_customer_balance_after_installment() {
    s!(
        "S43",
        "CUSTOMERS",
        "Customer balance after installment",
        &["add_car", "get_partners"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S43",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S43",
            )?;
            let balance = h.customer_balance_iqd("زبون S43");
            ok(
                json_num(&[("customer_remaining_iqd", 15_000_000.0)]),
                json_num(&[("customer_remaining_iqd", balance)]),
                "Customer remaining 15M after installment sale",
            )
        }
    );
}

fn real_s44_customer_pays_one_installment() {
    s!(
        "S44",
        "CUSTOMERS",
        "Customer pays one installment",
        &["add_car", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S44",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S44",
            )?;
            h.add_customer_installment_payment(
                "زبون S44",
                "CAR-S44",
                1_000_000.0,
                &h.date_plus_days(1),
            )?;
            let s = h.summary_snapshot();
            let cash_rows = h.partner_tx_by_role("أمير", "customer_payment", "cash_movement");
            let profit_rows =
                h.partner_tx_by_role("أمير", "customer_payment", "profit_recognition");
            ok(
                json_num(&[
                    ("qasa_iqd", -4_000_000.0),
                    ("monthly_profits_iqd", 3_000_000.0),
                    ("cash_rows", 2.0),
                    ("profit_rows", 2.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("cash_rows", cash_rows as f64),
                    ("profit_rows", profit_rows as f64),
                ]),
                "One installment payment — cash and profit rows once each",
            )
        }
    );
}

fn real_s45_customer_pays_all_installments() {
    s!(
        "S45",
        "CUSTOMERS",
        "Customer pays all installments",
        &["add_car", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S45",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S45",
            )?;
            pay_installments(h, "زبون S45", "CAR-S45", 15, 1_000_000.0)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 10_000_000.0),
                    ("monthly_profits_iqd", 10_000_000.0),
                    ("total_debtors_iqd", 0.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("total_debtors_iqd", s.total_debtors_iqd),
                ]),
                "All installments paid — debtors zero",
            )
        }
    );
}

fn real_s46_print_customer_statement() {
    s!(
        "S46",
        "CUSTOMERS",
        "Print customer statement",
        &["add_car", "export_database_to_excel", "get_financial_summary"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S46",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S46",
            )?;
            let before = h.summary_snapshot();
            h.export_database()?;
            let after = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", before.qasa_iqd),
                    ("monthly_profits_iqd", before.monthly_profits_iqd),
                ]),
                json_num(&[
                    ("qasa_iqd", after.qasa_iqd),
                    ("monthly_profits_iqd", after.monthly_profits_iqd),
                ]),
                "Export/print does not mutate summary",
            )
        }
    );
}

fn real_s47_partner_deposits() {
    s!(
        "S47",
        "PARTNERS",
        "Partner deposits",
        &["add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_partner_tx("أمير", "شريك", "ايداع شريك", 5_000_000.0, &h.month_start())?;
            h.add_partner_tx("منتصر", "شريك", "ايداع شريك", 5_000_000.0, &h.month_start())?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", 10_000_000.0)]),
                json_num(&[("qasa_iqd", s.qasa_iqd)]),
                "Deposits 5M+5M",
            )
        }
    );
}

fn real_s48_partner_withdrawal() {
    s!(
        "S48",
        "PARTNERS",
        "Partner withdrawal",
        &["add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_partner_tx("أمير", "شريك", "سحب شريك", 3_000_000.0, &h.month_start())?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", -3_000_000.0)]),
                json_num(&[("qasa_iqd", s.qasa_iqd)]),
                "Withdrawal 3M",
            )
        }
    );
}

fn real_s49_block_third_partner() {
    s!("S49", "PARTNERS", "Block third partner", &["add_partner", "get_partners"], |h| {
        let blocked = h.try_add_shuraka("شريك ثالث").is_err();
        let count = h.shuraka_count();
        ok(
            json_num(&[("blocked", 1.0), ("partner_count", 2.0)]),
            json_num(&[
                ("blocked", if blocked { 1.0 } else { 0.0 }),
                ("partner_count", count as f64),
            ]),
            "Third partner creation blocked",
        )
    });
}

fn real_s50_block_partner_deletion() {
    s!("S50", "PARTNERS", "Block partner deletion", &["delete_partner", "get_partners"], |h| {
        let blocked = h.try_delete_partner("أمير", "شريك").is_err();
        let count = h.shuraka_count();
        ok(
            json_num(&[("blocked", 1.0), ("partner_count", 2.0)]),
            json_num(&[
                ("blocked", if blocked { 1.0 } else { 0.0 }),
                ("partner_count", count as f64),
            ]),
            "Partner deletion blocked",
        )
    });
}

fn real_s51_edit_available_car_purchase() {
    s!("S51", "DELETE_EDIT", "Edit available car purchase", &["add_car", "get_financial_summary"], |h| {
        h.add_car_cash_purchase("CAR-S51", 10_000_000.0, "IQD")?;
        h.edit_car_purchase("CAR-S51", 15_000_000.0)?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("inventory_value_iqd", 15_000_000.0),
                ("qasa_iqd", -15_000_000.0),
            ]),
            json_num(&[
                ("inventory_value_iqd", s.inventory_value_iqd),
                ("qasa_iqd", s.qasa_iqd),
            ]),
            "Edit purchase 10M→15M",
        )
    });
}

fn real_s52_edit_sold_car_sale_price() {
    s!(
        "S52",
        "DELETE_EDIT",
        "Edit sold car sale price",
        &["add_car", "sell_car_with_accounting", "update_sold_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S52", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S52", 18_000_000.0, "زبون S52")?;
            h.update_sold_car("CAR-S52", 20_000_000.0, "زبون S52")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 10_000_000.0),
                    ("monthly_profits_iqd", 10_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Edit sold price 18M→20M",
            )
        }
    );
}

fn real_s53_delete_available_car() {
    s!("S53", "DELETE_EDIT", "Delete available car", &["add_car", "delete_car", "get_financial_summary"], |h| {
        h.add_car_cash_purchase("CAR-S53", 10_000_000.0, "IQD")?;
        h.delete_car("CAR-S53")?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("inventory_value_iqd", 0.0),
                ("qasa_iqd", 0.0),
            ]),
            json_num(&[
                ("inventory_value_iqd", s.inventory_value_iqd),
                ("qasa_iqd", s.qasa_iqd),
            ]),
            "Delete available car resets to zero",
        )
    });
}

fn real_s54_delete_sold_cash_car() {
    s!(
        "S54",
        "DELETE_EDIT",
        "Delete sold cash car",
        &["add_car", "sell_car_with_accounting", "delete_car", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S54", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S54", 18_000_000.0, "زبون S54")?;
            h.delete_car("CAR-S54")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 0.0),
                    ("monthly_profits_iqd", 0.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Delete sold cash car resets to zero",
            )
        }
    );
}

fn real_s55_delete_sold_installment_car() {
    s!(
        "S55",
        "DELETE_EDIT",
        "Delete sold installment car",
        &["add_car", "add_partner_transaction", "delete_car", "get_financial_summary"],
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
            h.delete_car("CAR-S55")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 0.0),
                    ("monthly_profits_iqd", 0.0),
                    ("inventory_value_iqd", 0.0),
                    ("total_debtors_iqd", 0.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("inventory_value_iqd", s.inventory_value_iqd),
                    ("total_debtors_iqd", s.total_debtors_iqd),
                ]),
                "Delete sold installment car cleans all generated rows",
            )
        }
    );
}

fn real_s56_company_status_mixed_operations() {
    s!(
        "S56",
        "DASHBOARD",
        "Company status mixed operations",
        &[
            "add_partner_transaction",
            "add_car",
            "sell_car_with_accounting",
            "add_expense",
            "get_financial_summary",
        ],
        |h| {
            h.add_partner_tx("أمير", "شريك", "ايداع شريك", 15_000_000.0, &h.month_start())?;
            h.add_partner_tx("منتصر", "شريك", "ايداع شريك", 15_000_000.0, &h.month_start())?;
            h.add_car_cash_purchase("CAR-S56", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S56", 18_000_000.0, "زبون S56")?;
            h.add_general_expense(500_000.0)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 37_500_000.0),
                    ("monthly_profits_iqd", 7_500_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Deposits 30M, buy 10M, sell 18M, expense 500K",
            )
        }
    );
}

fn real_s57_qasa_tab_equals_qasa_card() {
    s!(
        "S57",
        "DASHBOARD",
        "Qasa tab = Qasa card",
        &["add_partner_transaction", "get_financial_summary", "get_cash_register_entries"],
        |h| {
            h.add_partner_tx("أمير", "شريك", "ايداع شريك", 10_000_000.0, &h.month_start())?;
            let s = h.summary_snapshot();
            let register = h.cash_register_total("قاصه");
            ok(
                json_num(&[("qasa_iqd", 10_000_000.0), ("register_total", 10_000_000.0)]),
                json_num(&[("qasa_iqd", s.qasa_iqd), ("register_total", register)]),
                "Qasa summary equals register total",
            )
        }
    );
}

fn real_s58_cash_tab_equals_partner_cash_card() {
    s!(
        "S58",
        "DASHBOARD",
        "Cash tab = partner cash card",
        &["add_partner_transaction", "get_financial_summary", "get_cash_register_entries"],
        |h| {
            h.add_partner_tx("أمير", "شريك", "ايداع شريك", 5_000_000.0, &h.month_start())?;
            h.add_partner_tx("منتصر", "شريك", "ايداع شريك", 5_000_000.0, &h.month_start())?;
            let s = h.summary_snapshot();
            let register = h.cash_register_total("الكاش");
            ok(
                json_num(&[
                    ("total_partner_capital_iqd", 10_000_000.0),
                    ("register_total", 10_000_000.0),
                ]),
                json_num(&[
                    ("total_partner_capital_iqd", s.total_partner_capital_iqd),
                    ("register_total", register),
                ]),
                "Partner capital equals cash register",
            )
        }
    );
}

fn real_s59_profit_tab_equals_profit_card() {
    s!(
        "S59",
        "DASHBOARD",
        "Profit tab = profit card",
        &["add_car", "sell_car_with_accounting", "get_financial_summary", "get_profit_distribution_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S59", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S59", 20_000_000.0, "زبون S59")?;
            let s = h.summary_snapshot();
            let dist = h.total_partner_profit_iqd();
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 10_000_000.0),
                    ("distribution_total", 10_000_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("distribution_total", dist),
                ]),
                "Profit card equals distribution total 10M",
            )
        }
    );
}

fn real_s60_iqd_usd_separation() {
    s!(
        "S60",
        "CURRENCY",
        "IQD/USD separation",
        &["add_car", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S60-IQD", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S60-IQD", 18_000_000.0, "زبون IQD")?;
            h.add_car_cash_purchase("CAR-S60-USD", 8_000.0, "USD")?;
            h.sell_car_usd("CAR-S60-USD", 12_000.0, "زبون USD")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("monthly_profits_iqd", 8_000_000.0),
                    ("monthly_profits_usd", 4_000.0),
                ]),
                json_num(&[
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("monthly_profits_usd", s.monthly_profits_usd),
                ]),
                "IQD car 8M profit + USD car 4K profit separated",
            )
        }
    );
}

fn real_s61_usd_general_expense() {
    s!("S61", "CURRENCY", "USD general expense", &["add_expense", "get_financial_summary"], |h| {
        h.add_usd_expense(500.0)?;
        let s = h.summary_snapshot();
        ok(
            json_num(&[
                ("monthly_profits_usd", -500.0),
                ("monthly_profits_iqd", 0.0),
            ]),
            json_num(&[
                ("monthly_profits_usd", s.monthly_profits_usd),
                ("monthly_profits_iqd", s.monthly_profits_iqd),
            ]),
            "USD expense 500",
        )
    });
}

fn real_s62_mixed_currency_blocked() {
    s!(
        "S62",
        "CURRENCY",
        "Mixed currency blocked",
        &["add_car", "sell_car_with_accounting", "get_financial_summary"],
        |h| {
            h.add_car_cash_purchase("CAR-S62", 10_000_000.0, "IQD")?;
            let _ = h.try_sell_mixed_currency("CAR-S62", 10_000.0, "USD", "زبون S62");
            let after = h.summary_snapshot();
            ok(
                json_num(&[("inventory_value_iqd", 10_000_000.0)]),
                json_num(&[("inventory_value_iqd", after.inventory_value_iqd)]),
                "Mixed currency sell blocked — inventory unchanged",
            )
        }
    );
}

fn real_s63_read_only_safety() {
    s!(
        "S63",
        "READ_ONLY",
        "Read-only safety",
        &[
            "get_financial_summary",
            "get_profit_distribution_summary",
            "get_cars",
            "get_partners",
        ],
        |h| {
            h.add_car_cash_purchase("CAR-S63", 5_000_000.0, "IQD")?;
            let before = snapshot_json(&h.summary_snapshot());
            h.read_only_roundtrip()?;
            let after = snapshot_json(&h.summary_snapshot());
            ok(before, after, "Read-only 10x calls no change")
        }
    );
}

fn real_s64_print_partner_statement() {
    s!(
        "S64",
        "PRINT",
        "Print partner statement",
        &["add_partner_transaction", "export_database_to_excel", "get_financial_summary"],
        |h| {
            h.add_partner_tx("أمير", "شريك", "ايداع شريك", 5_000_000.0, &h.month_start())?;
            let before = h.summary_snapshot();
            h.export_database()?;
            let after = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", before.qasa_iqd)]),
                json_num(&[("qasa_iqd", after.qasa_iqd)]),
                "Print partner statement — export does not change summary",
            )
        }
    );
}

fn real_s65_print_customer_statement() {
    s!(
        "S65",
        "PRINT",
        "Print customer statement",
        &["add_car", "export_database_to_excel", "get_financial_summary"],
        |h| {
            h.add_car_installment_sale(
                "CAR-S65",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S65",
            )?;
            let before = h.summary_snapshot();
            h.export_database()?;
            let after = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", before.qasa_iqd)]),
                json_num(&[("qasa_iqd", after.qasa_iqd)]),
                "Print customer statement — export does not change summary",
            )
        }
    );
}

fn real_s66_export_database() {
    s!(
        "S66",
        "PRINT",
        "Export database",
        &["export_database_to_excel", "get_financial_summary"],
        |h| {
            let before = h.summary_snapshot();
            h.export_database()?;
            let after = h.summary_snapshot();
            ok(
                json_num(&[("qasa_iqd", before.qasa_iqd)]),
                json_num(&[("qasa_iqd", after.qasa_iqd)]),
                "Export database does not change summary",
            )
        }
    );
}

fn real_s67_full_cash_business_cycle() {
    s!(
        "S67",
        "FULL_FLOWS",
        "Full cash business cycle",
        &[
            "add_partner_transaction",
            "add_car",
            "sell_car_with_accounting",
            "add_expense",
            "get_financial_summary",
        ],
        |h| {
            h.add_partner_tx("أمير", "شريك", "ايداع شريك", 10_000_000.0, &h.month_start())?;
            h.add_partner_tx("منتصر", "شريك", "ايداع شريك", 10_000_000.0, &h.month_start())?;
            h.add_car_cash_purchase("CAR-S67", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S67", 18_000_000.0, "زبون S67")?;
            h.add_general_expense(500_000.0)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 27_500_000.0),
                    ("monthly_profits_iqd", 7_500_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Full cash cycle",
            )
        }
    );
}

fn real_s68_full_installment_cycle() {
    s!(
        "S68",
        "FULL_FLOWS",
        "Full installment cycle",
        &["add_partner_transaction", "add_car", "add_partner_transaction", "get_financial_summary"],
        |h| {
            h.add_partner_tx("أمير", "شريك", "ايداع شريك", 10_000_000.0, &h.month_start())?;
            h.add_partner_tx("منتصر", "شريك", "ايداع شريك", 10_000_000.0, &h.month_start())?;
            h.add_car_installment_sale(
                "CAR-S68",
                10_000_000.0,
                20_000_000.0,
                5_000_000.0,
                15_000_000.0,
                "زبون S68",
            )?;
            pay_installments(h, "زبون S68", "CAR-S68", 15, 1_000_000.0)?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 30_000_000.0),
                    ("monthly_profits_iqd", 10_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Full installment cycle",
            )
        }
    );
}

fn real_s69_funder_cycle() {
    s!(
        "S69",
        "FULL_FLOWS",
        "Funder cycle",
        &["add_car", "sell_car_with_accounting", "pay_financier_from_partners", "get_financial_summary"],
        |h| {
            h.add_funded_car("CAR-S69", "ممول S69", 10_000_000.0)?;
            h.sell_car_cash("CAR-S69", 18_000_000.0, "زبون S69")?;
            h.pay_financier("ممول S69", "ممول", 10_000_000.0, &h.date_plus_days(1))?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 8_000_000.0),
                    ("monthly_profits_iqd", 8_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Funder cycle",
            )
        }
    );
}

fn real_s70_company_cycle() {
    s!(
        "S70",
        "FULL_FLOWS",
        "Company cycle",
        &["add_car", "sell_car_with_accounting", "pay_financier_from_partners", "get_financial_summary"],
        |h| {
            h.add_company_car("CAR-S70", "شركة S70", 10_000_000.0)?;
            h.sell_car_cash("CAR-S70", 18_000_000.0, "زبون S70")?;
            h.pay_financier("شركة S70", "شركة", 10_000_000.0, &h.date_plus_days(1))?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 8_000_000.0),
                    ("monthly_profits_iqd", 8_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                ]),
                "Company cycle with شركة S70",
            )
        }
    );
}

fn real_s71_investor_cycle() {
    s!(
        "S71",
        "FULL_FLOWS",
        "Investor cycle",
        &[
            "add_partner",
            "add_partner_transaction",
            "add_car",
            "sell_car_with_accounting",
            "get_financial_summary",
        ],
        |h| {
            h.add_investor("مستثمر دورة")?;
            h.add_investor_tx("مستثمر دورة", "ايداع", 20_000_000.0, &h.month_start())?;
            h.add_car_cash_purchase("CAR-S71", 10_000_000.0, "IQD")?;
            h.sell_car_cash("CAR-S71", 18_000_000.0, "زبون S71")?;
            let s = h.summary_snapshot();
            ok(
                json_num(&[
                    ("qasa_iqd", 28_000_000.0),
                    ("monthly_profits_iqd", 8_000_000.0),
                    ("total_investments_iqd", 20_000_000.0),
                ]),
                json_num(&[
                    ("qasa_iqd", s.qasa_iqd),
                    ("monthly_profits_iqd", s.monthly_profits_iqd),
                    ("total_investments_iqd", s.total_investments_iqd),
                ]),
                "Investor cycle",
            )
        }
    );
}
