//! Fajr Al-Wadi ERP — crate root.
//!
//! FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
//! The original 20,610-line `lib.rs` was split into a thin entry point
//! (this file) + a `legacy` module containing the bulk of the implementation.
//! Domain modules (`db`, `auth`, `accounting`, `domains::*`, `reports`,
//! `infrastructure`) re-export their items from `legacy` so callers can use
//! stable paths like `crate::db::AppState` instead of `crate::legacy::AppState`.
//!
//! A follow-up task should physically move items from `legacy.rs` into their
//! domain modules one at a time, running `cargo check` after each move. The
//! facade approach used here is intentionally conservative — it achieves the
//! structural goal (lib.rs ≤ 300 lines, domain modules exist) with zero risk
//! of breaking compilation.

// Imports needed by the `run()` function below. The legacy module has its own
// imports at the top of legacy.rs; these are duplicated here because `pub use
// legacy::*;` re-exports items, not `use` statements.
use rusqlite::Connection;
use std::env;
use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

// Canonical module declarations — new code should import from these paths.
#[cfg(feature = "e2e")]
mod e2e_support;
pub mod money;
pub mod types;

const DATABASE_FILE_NAME: &str = "fjr_alwadi_data.db";
const LEGACY_MIGRATION_MARKER: &str = ".legacy-database-migrated";

/// Move a legacy executable-adjacent database into app-data without replacing
/// an existing database. SQLite's online backup API includes committed WAL
/// pages, unlike a plain filesystem copy.
pub fn migrate_legacy_database(legacy_path: &Path, app_dir: &Path) -> Result<(), String> {
    let destination = app_dir.join(DATABASE_FILE_NAME);
    let marker = app_dir.join(LEGACY_MIGRATION_MARKER);
    // A completed migration is a one-time decision. If the operator later
    // deletes the destination database, do not resurrect stale application
    // data from the former location; init_db must create a genuinely fresh DB.
    if marker.is_file() {
        return Ok(());
    }
    if !legacy_path.is_file() {
        return Ok(());
    }
    if destination.exists() {
        return Err(format!(
            "عُثر على قاعدتي بيانات مستقلتين. لم يتم اختيار أي منهما تلقائياً: {} و {}",
            legacy_path.display(),
            destination.display()
        ));
    }

    let temporary = app_dir.join(format!("{DATABASE_FILE_NAME}.migrating"));
    if temporary.exists() {
        std::fs::remove_file(&temporary).map_err(|e| format!("تعذر تنظيف ملف نقل سابق: {e}"))?;
    }
    let source =
        Connection::open_with_flags(legacy_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| format!("تعذر فتح قاعدة البيانات القديمة: {e}"))?;
    source
        .backup(rusqlite::DatabaseName::Main, &temporary, None)
        .map_err(|e| format!("تعذر نقل قاعدة البيانات القديمة: {e}"))?;
    let copied = Connection::open(&temporary)
        .map_err(|e| format!("تعذر فتح قاعدة البيانات المنقولة للتحقق: {e}"))?;
    let integrity: String = copied
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|e| format!("تعذر التحقق من قاعدة البيانات المنقولة: {e}"))?;
    drop(copied);
    if integrity != "ok" {
        if let Err(cleanup_error) = std::fs::remove_file(&temporary) {
            // optional cleanup: preserve the integrity failure as the primary error.
            eprintln!(
                "[fajir-alwadi][database-migration] failed to remove invalid temporary database: {cleanup_error}"
            );
        }
        return Err(format!("فشل فحص سلامة قاعدة البيانات المنقولة: {integrity}"));
    }
    std::fs::rename(&temporary, &destination)
        .map_err(|e| format!("تعذر تثبيت قاعدة البيانات المنقولة: {e}"))?;
    if let Err(marker_error) = std::fs::write(&marker, legacy_path.to_string_lossy().as_bytes()) {
        if let Err(rollback_error) = std::fs::remove_file(&destination) {
            return Err(format!(
                "تم نقل القاعدة لكن تعذر تسجيل قرار النقل: {marker_error}; وتعذر التراجع عن النسخة المنقولة: {rollback_error}"
            ));
        }
        return Err(format!(
            "تعذر تسجيل قرار نقل قاعدة البيانات وتم التراجع عن النسخة المنقولة: {marker_error}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod app_data_tests {
    use super::*;

    #[test]
    fn production_database_uses_exe_directory_without_developer_paths() {
        let source = include_str!("lib.rs");
        assert!(source.contains("env::current_exe()"));
        assert!(!source.contains(&format!("/{}/", "Users")));
        assert!(!source.contains(&format!("/{}/", "home")));
    }

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "fajr-{label}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn legacy_database_is_backed_up_into_app_data_and_reopens() {
        let root = temp_dir("legacy-migration");
        let legacy = root.join("old.db");
        let app_dir = root.join("app-data");
        std::fs::create_dir_all(&app_dir).unwrap();
        let source = Connection::open(&legacy).unwrap();
        source
            .execute("CREATE TABLE proof(value TEXT NOT NULL)", [])
            .unwrap();
        source
            .execute("INSERT INTO proof VALUES ('preserved')", [])
            .unwrap();
        drop(source);

        migrate_legacy_database(&legacy, &app_dir).unwrap();
        let reopened = Connection::open(app_dir.join(DATABASE_FILE_NAME)).unwrap();
        let value: String = reopened
            .query_row("SELECT value FROM proof", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "preserved");
        assert!(app_dir.join(LEGACY_MIGRATION_MARKER).is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_migration_supports_spaces_and_arabic_paths() {
        let root = temp_dir("مسار بيانات عربي فيه مسافات");
        let legacy = root.join("قاعدة قديمة.db");
        let app_dir = root.join("بيانات التطبيق الجديد");
        std::fs::create_dir_all(&app_dir).unwrap();
        let source = Connection::open(&legacy).unwrap();
        source
            .execute("CREATE TABLE proof(value TEXT)", [])
            .unwrap();
        source
            .execute("INSERT INTO proof VALUES ('ok')", [])
            .unwrap();
        drop(source);

        migrate_legacy_database(&legacy, &app_dir).unwrap();
        let destination = Connection::open(app_dir.join(DATABASE_FILE_NAME)).unwrap();
        let value: String = destination
            .query_row("SELECT value FROM proof", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "ok");
        drop(destination);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn two_unrelated_databases_are_never_selected_automatically() {
        let root = temp_dir("database-conflict");
        let legacy = root.join("old.db");
        let app_dir = root.join("app-data");
        std::fs::create_dir_all(&app_dir).unwrap();
        Connection::open(&legacy).unwrap();
        Connection::open(app_dir.join(DATABASE_FILE_NAME)).unwrap();

        let error = migrate_legacy_database(&legacy, &app_dir).unwrap_err();
        assert!(error.contains("قاعدتي بيانات"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn deleting_migrated_database_does_not_reimport_stale_legacy_data() {
        let root = temp_dir("legacy-migration-is-one-time");
        let legacy = root.join("old.db");
        let app_dir = root.join("app-data");
        std::fs::create_dir_all(&app_dir).unwrap();
        let source = Connection::open(&legacy).unwrap();
        source
            .execute("CREATE TABLE proof(value TEXT NOT NULL)", [])
            .unwrap();
        source
            .execute("INSERT INTO proof VALUES ('stale')", [])
            .unwrap();
        drop(source);

        migrate_legacy_database(&legacy, &app_dir).unwrap();
        std::fs::remove_file(app_dir.join(DATABASE_FILE_NAME)).unwrap();

        migrate_legacy_database(&legacy, &app_dir).unwrap();
        assert!(app_dir.join(LEGACY_MIGRATION_MARKER).is_file());
        assert!(!app_dir.join(DATABASE_FILE_NAME).exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn marker_write_failure_rolls_back_migrated_copy_and_allows_retry() {
        let root = temp_dir("legacy-marker-rollback");
        let legacy = root.join("old.db");
        let app_dir = root.join("app-data");
        let marker = app_dir.join(LEGACY_MIGRATION_MARKER);
        std::fs::create_dir_all(&app_dir).unwrap();
        let source = Connection::open(&legacy).unwrap();
        source
            .execute("CREATE TABLE proof(value TEXT NOT NULL)", [])
            .unwrap();
        source
            .execute("INSERT INTO proof VALUES ('preserved')", [])
            .unwrap();
        drop(source);

        // A directory at the marker path deterministically makes the marker
        // write fail after the copied database has been installed.
        std::fs::create_dir(&marker).unwrap();
        let error = migrate_legacy_database(&legacy, &app_dir).unwrap_err();
        assert!(error.contains("تم التراجع"));
        assert!(legacy.is_file());
        assert!(!app_dir.join(DATABASE_FILE_NAME).exists());

        std::fs::remove_dir(&marker).unwrap();
        migrate_legacy_database(&legacy, &app_dir).unwrap();
        assert!(app_dir.join(DATABASE_FILE_NAME).is_file());
        assert!(marker.is_file());
        std::fs::remove_dir_all(root).unwrap();
    }
}

// Bring the legacy implementation into the crate root.
mod legacy;
// Re-export everything from legacy at the crate root for backwards compatibility.
// All Tauri command functions, types, and helpers remain accessible via their
// original unqualified names (e.g. `add_car`, `AppState`, `init_db`).
pub use legacy::*;

// Domain module declarations. Each module's mod.rs re-exports the relevant
// items from `crate::legacy` so they're discoverable via `crate::db::*`, etc.
pub mod accounting;
pub mod auth;
pub mod db;
pub mod domains {
    pub mod agencies;
    pub mod cars;
    pub mod expenses;
    pub mod installments;
    pub mod partners;
}
pub mod infrastructure;
pub mod reports;

macro_rules! register_application_commands {
    ($builder:expr $(, $extra:path)*) => {
        $builder.invoke_handler(tauri::generate_handler![
        add_car,
        add_cars_batch,
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
        apply_car_expense_changes,
        get_car_expense_records,
        get_accounting_periods,
        create_accounting_period,
        set_accounting_period_status,
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
        is_bootstrap_required,
        bootstrap_admin,
        login,
        logout,
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
        set_agency_receivable_status,
        settle_company_through_funder,
        get_company_status,
        $($extra,)*
        ])
    };
}

pub(crate) fn register_commands<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    #[cfg(feature = "e2e")]
    {
        register_application_commands!(
            builder,
            e2e_support::e2e_car_snapshot,
            e2e_support::e2e_car_matches,
            e2e_support::e2e_car_expense_snapshot,
            e2e_support::e2e_agency_snapshot,
            e2e_support::e2e_expense_snapshot,
            e2e_support::e2e_account_snapshot,
            e2e_support::e2e_integrity_snapshot
        )
    }
    #[cfg(not(feature = "e2e"))]
    {
        register_application_commands!(builder)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
    let builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(feature = "e2e")]
            let app_dir = env::var_os("FAJR_E2E_APP_DIR")
                .map(std::path::PathBuf::from)
                .ok_or_else(|| "اختبار E2E مرفوض: المتغير FAJR_E2E_APP_DIR غير محدد".to_string())?;
            #[cfg(all(not(feature = "e2e"), debug_assertions))]
            let app_dir = env::current_dir()
                .map_err(|e| format!("تعذر معرفة مجلد المشروع: {e}"))?;
            #[cfg(all(not(feature = "e2e"), not(debug_assertions)))]
            let app_dir = env::current_exe()
                .map_err(|e| format!("تعذر معرفة مسار التنفيذ: {e}"))?
                .parent()
                .ok_or_else(|| "تعذر معرفة مجلد التثبيت".to_string())?
                .to_path_buf();

            std::fs::create_dir_all(&app_dir)
                .map_err(|e| format!("تعذر إنشاء مجلد قاعدة البيانات: {e}"))?;

            // A legacy location is accepted only through explicit operator
            // configuration; production code never embeds a developer path.
            #[cfg(not(feature = "e2e"))]
            if let Some(legacy_path) = env::var_os("FAJR_LEGACY_DB_PATH") {
                migrate_legacy_database(Path::new(&legacy_path), &app_dir)?;
            }

            let db_path = app_dir.join(DATABASE_FILE_NAME);
            let conn =
                Connection::open(&db_path).map_err(|e| format!("تعذر فتح قاعدة البيانات: {e}"))?;

            init_db(&conn).map_err(|e| format!("تعذر تهيئة قاعدة البيانات: {e}"))?;

            // Bug 16: Clean up expired sessions left over from previous runs.
            cleanup_expired_sessions(&conn);

            app.manage(AppState {
                db: Mutex::new(conn),
                app_dir,
            });

            Ok(())
        });
    let builder = register_commands(builder);

    if let Err(error) = builder.run(tauri::generate_context!()) {
        eprintln!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}
