//! Reproducible integration test for migration v32. It deliberately avoids a
//! checked-in application/customer database: a v31 fixture is generated from
//! the production schema, seeded with the historical orphan shape, and then
//! upgraded through the real migration runner.

use rusqlite::Connection;
use std::fs;

#[test]
fn test_migration_v32_resolves_prod_ledger_imbalance() {
    let tmp = std::env::temp_dir().join(format!(
        "fajr_migration_v32_test_{}_{}.db",
        std::process::id(),
        std::thread::current().name().unwrap_or("migration")
    ));
    fs::remove_file(&tmp).ok();
    let conn = Connection::open(&tmp).expect("open tmp db");
    fajir_alwadi_lib::init_db_for_test(&conn).expect("create deterministic schema fixture");
    conn.execute("DELETE FROM db_version WHERE version > 31", [])
        .expect("rewind fixture version");
    conn.execute(
        "INSERT INTO partner_transactions
         (partner_name, kind, type, amount, date, currency, source_type, source_id, source_role,
          affects_qasa, affects_partner_cash, affects_profit)
         VALUES ('أمير', 'شريك', 'سحب', '52050', '2026-01-01', 'IQD',
                 'funder_payment', '999999', 'partner_split', 1, 1, 0)",
        [],
    )
    .expect("seed v31 orphan fixture");

    // Snapshot pre-migration imbalance.
    let (pre_debit, pre_credit): (f64, f64) = conn
        .query_row(
            "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
             FROM financial_ledger WHERE currency='IQD'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    eprintln!(
        "Pre-migration IQD ledger: debit={pre_debit} credit={pre_credit} diff={}",
        pre_debit - pre_credit
    );

    // Count pre-migration orphans and liability rows without ledger.
    let pre_orphans: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM partner_transactions
             WHERE source_type IN ('customer_payment','funder_payment','company_payment')
               AND source_id IS NOT NULL AND source_id != ''
               AND NOT EXISTS (
                 SELECT 1 FROM partner_transactions pt2
                 WHERE CAST(pt2.id AS TEXT) = partner_transactions.source_id
               )
               AND COALESCE(is_reversed, 0) = 0",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let pre_missing_ledger: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM partner_transactions pt
             WHERE pt.kind IN ('ممول','شركة')
               AND pt.source_type IN ('funder_transaction','company_transaction')
               AND pt.source_role = 'repayment_account_movement'
               AND pt.type LIKE 'سحب%'
               AND COALESCE(pt.is_reversed, 0) = 0
               AND NOT EXISTS (
                 SELECT 1 FROM financial_ledger fl
                 WHERE fl.reference_type='partner_transaction'
                   AND fl.reference_id = CAST(pt.id AS TEXT)
               )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    eprintln!("Pre-migration orphan splits: {pre_orphans}");
    eprintln!("Pre-migration repayment rows without ledger: {pre_missing_ledger}");

    // Run init_db — this runs migration v32 (orphan split cleanup + ledger rebuild).
    fajir_alwadi_lib::init_db_for_test(&conn).expect("init_db");

    // Snapshot post-migration imbalance.
    let (post_debit, post_credit): (f64, f64) = conn
        .query_row(
            "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
             FROM financial_ledger WHERE currency='IQD'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    eprintln!(
        "Post-migration IQD ledger: debit={post_debit} credit={post_credit} diff={}",
        post_debit - post_credit
    );

    assert!(
        (post_debit - post_credit).abs() < 0.01,
        "ledger must be balanced after migration, got diff={}",
        post_debit - post_credit
    );

    // Verify orphan splits are gone.
    let orphan_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM partner_transactions
             WHERE source_type IN ('customer_payment','funder_payment','company_payment')
               AND source_id IS NOT NULL AND source_id != ''
               AND NOT EXISTS (
                 SELECT 1 FROM partner_transactions pt2
                 WHERE CAST(pt2.id AS TEXT) = partner_transactions.source_id
               )
               AND COALESCE(is_reversed, 0) = 0",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(orphan_count, 0, "orphan splits must be cleaned up");

    // Verify repayment liability rows now have ledger entries.
    // (Standalone funder/company deposits are intentionally NOT rebuilt —
    // see migration v32 comment in lib.rs.)
    let missing_repayment_ledger: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM partner_transactions pt
             WHERE pt.kind IN ('ممول','شركة')
               AND pt.source_type IN ('funder_transaction','company_transaction')
               AND pt.source_role = 'repayment_account_movement'
               AND pt.type LIKE 'سحب%'
               AND COALESCE(pt.is_reversed, 0) = 0
               AND NOT EXISTS (
                 SELECT 1 FROM financial_ledger fl
                 WHERE fl.reference_type='partner_transaction'
                   AND fl.reference_id = CAST(pt.id AS TEXT)
               )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        missing_repayment_ledger, 0,
        "all repayment liability rows must have ledger entries after migration v32"
    );

    drop(conn);
    fs::remove_file(tmp).ok();
}
