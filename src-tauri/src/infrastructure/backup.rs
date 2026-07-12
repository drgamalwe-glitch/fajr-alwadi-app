//! Backup/restore infrastructure operating on real SQLite connections.

use rusqlite::{Connection, DatabaseName, OpenFlags};
use std::path::{Path, PathBuf};

pub use crate::legacy::{perform_hourly_backup, run_backup_loop};

fn verify_database(conn: &Connection) -> Result<(), String> {
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("تعذر فحص سلامة قاعدة البيانات: {e}"))?;
    if integrity != "ok" {
        return Err("قاعدة البيانات المراد استعادتها تالفة".to_string());
    }
    let foreign_key_violations: i64 = conn
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("تعذر فحص العلاقات المرجعية: {e}"))?;
    if foreign_key_violations != 0 {
        return Err(format!(
            "قاعدة البيانات تحتوي {foreign_key_violations} مخالفة علاقات مرجعية"
        ));
    }
    Ok(())
}

/// Restore through SQLite's Online Backup API while the caller holds the
/// application's exclusive connection mutex. The source is first copied to a
/// staging database, migrated and verified. The live database is backed up
/// before replacement and automatically restored if a postcondition fails.
pub fn restore_database_locked(
    live: &mut Connection,
    backup_path: &Path,
    app_dir: &Path,
) -> Result<PathBuf, String> {
    let nonce = format!(
        "{}_{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let staging = app_dir.join(format!(".restore-staging-{nonce}.db"));
    let safety = app_dir.join(format!("fjr_alwadi_data.db.pre_restore_{nonce}"));

    let result = (|| {
        let source = Connection::open_with_flags(backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|_| "تعذر فتح ملف النسخة الاحتياطية".to_string())?;
        verify_database(&source)?;
        source
            .backup(DatabaseName::Main, &staging, None)
            .map_err(|e| format!("تعذر تجهيز النسخة للاستعادة: {e}"))?;

        let staged = Connection::open(&staging)
            .map_err(|e| format!("تعذر فتح نسخة الاستعادة المؤقتة: {e}"))?;
        crate::legacy::init_db(&staged).map_err(|e| format!("تعذر ترقية نسخة الاستعادة: {e}"))?;
        verify_database(&staged)?;
        drop(staged);

        // Includes all committed WAL pages and gives us a durable rollback
        // image before changing the live connection.
        live.execute_batch("PRAGMA wal_checkpoint(FULL);")
            .map_err(|e| format!("تعذر تثبيت سجل WAL قبل الاستعادة: {e}"))?;
        live.backup(DatabaseName::Main, &safety, None)
            .map_err(|e| format!("تعذر إنشاء نسخة الرجوع قبل الاستعادة: {e}"))?;

        if let Err(restore_error) = live.restore(
            DatabaseName::Main,
            &staging,
            None::<fn(rusqlite::backup::Progress)>,
        ) {
            let rollback = live.restore(
                DatabaseName::Main,
                &safety,
                None::<fn(rusqlite::backup::Progress)>,
            );
            return match rollback {
                Ok(()) => Err(format!(
                    "فشلت الاستعادة وتمت إعادة القاعدة السابقة: {restore_error}"
                )),
                Err(rollback_error) => Err(format!(
                    "فشلت الاستعادة وفشل الرجوع الآمن أيضاً: {restore_error}; {rollback_error}"
                )),
            };
        }

        if let Err(validation_error) = verify_database(live) {
            live.restore(
                DatabaseName::Main,
                &safety,
                None::<fn(rusqlite::backup::Progress)>,
            )
            .map_err(|e| format!("فشل فحص الاستعادة وفشل الرجوع: {validation_error}; {e}"))?;
            return Err(format!(
                "فشل فحص قاعدة البيانات المستعادة وتمت إعادة القاعدة السابقة: {validation_error}"
            ));
        }
        Ok(safety.clone())
    })();

    if staging.exists() {
        if let Err(error) = std::fs::remove_file(&staging) {
            eprintln!("[restore] failed to remove staging file: {error}");
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "fajr-restore-{label}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    fn database_with_marker(path: &Path, marker: &str) -> Connection {
        let conn = Connection::open(path).unwrap();
        crate::legacy::init_db(&conn).unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS restore_proof(value TEXT NOT NULL)",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM restore_proof", []).unwrap();
        conn.execute("INSERT INTO restore_proof VALUES (?1)", [marker])
            .unwrap();
        conn
    }

    #[test]
    fn online_restore_includes_committed_wal_and_keeps_connection_usable() {
        let dir = temp_dir("wal");
        let live_path = dir.join("fjr_alwadi_data.db");
        let source_path = dir.join("source.db");
        let backup_path = dir.join("source.backup");
        let mut live = database_with_marker(&live_path, "old");
        let source = database_with_marker(&source_path, "from-wal");
        source.pragma_update(None, "journal_mode", "WAL").unwrap();
        source
            .execute("INSERT INTO restore_proof VALUES ('latest-commit')", [])
            .unwrap();
        source
            .backup(DatabaseName::Main, &backup_path, None)
            .unwrap();

        let safety = restore_database_locked(&mut live, &backup_path, &dir).unwrap();
        let values: Vec<String> = live
            .prepare("SELECT value FROM restore_proof ORDER BY rowid")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(values, vec!["from-wal", "latest-commit"]);
        assert!(safety.is_file());
        live.execute("INSERT INTO restore_proof VALUES ('after-restore')", [])
            .unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn corrupt_backup_is_rejected_without_touching_live_database() {
        let dir = temp_dir("corrupt");
        let live_path = dir.join("fjr_alwadi_data.db");
        let corrupt = dir.join("corrupt.backup");
        let mut live = database_with_marker(&live_path, "must-survive");
        std::fs::write(&corrupt, b"not a sqlite database").unwrap();

        assert!(restore_database_locked(&mut live, &corrupt, &dir).is_err());
        let value: String = live
            .query_row("SELECT value FROM restore_proof", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "must-survive");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
