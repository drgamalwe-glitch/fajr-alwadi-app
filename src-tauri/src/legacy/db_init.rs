//! `db_init` — legacy/mod.rs lines 1148–3506
use super::*;

pub fn init_db(conn: &Connection) -> SqlResult<()> {
    // FORENSIC FIX (re-audit 2026-07-11, DB-INTEGRITY-1):
    // Enforce foreign keys, enable WAL for crash-safe writes and concurrent reads,
    // and set a busy timeout so that short lock contention does not surface as
    // SQLITE_BUSY to the user. PRAGMA foreign_keys is *per-connection* and MUST
    // be set every time we open a connection — the value is not persisted to the
    // database file. Without this, ON DELETE CASCADE silently no-ops and we leak
    // orphan rows in transaction_splits / financial_ledger when a car is deleted.
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;

    conn.execute_batch("BEGIN IMMEDIATE")?;
    MIGRATION_STEP_ERROR.with(|error| *error.borrow_mut() = None);
    let migration_conn = MigrationConnection::new(conn);
    let conn = &migration_conn;
    let init_result: SqlResult<()> = (|| {
        // FORENSIC FIX (re-audit 2026-07-11, ERROR-SWALLOW-6):
        // Idempotent ALTER TABLE helper: ignore the expected "duplicate column"
        // error from re-running schema setup on an already-migrated DB; surface
        // every other error (disk full, locked schema, etc.) so the init fails
        // loud instead of silently leaving the schema in a half-applied state.
        fn ignore_dup(res: rusqlite::Result<usize>) -> rusqlite::Result<()> {
            match res {
                Ok(_) => Ok(()),
                // FORENSIC FIX (re-audit 2026-07-11, PHASE-0-RUST-COMPILE):
                // rusqlite 0.32 removed `ErrorCode::DuplicateColumn`. Detect
                // by string-matching the SQLite error message.
                Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
                    if msg.contains("duplicate column name") =>
                {
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }

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
            monthly_payment TEXT,
            created_at TEXT
        )",
            [],
        )?;

        // إضافة الأعمدة الجديدة إذا كانت الجداول موجودة مسبقاً
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN chassis_number TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN car_plate_num TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN car_model TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN car_year TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN payment_type TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN cash_price TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN amount_paid TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN amount_remaining TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN installment_months INTEGER", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN monthly_payment TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN buyer_name TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN buyer_phone TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN purchase_date TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN sale_date TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN delivery_date TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN first_payment_date TEXT", []))?;
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN currency TEXT DEFAULT 'IQD'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN selling_currency TEXT DEFAULT 'IQD'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN paid_currency TEXT DEFAULT 'IQD'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN remaining_currency TEXT DEFAULT 'IQD'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN sale_currency TEXT DEFAULT 'IQD'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN purchase_payment_type TEXT DEFAULT 'قاصه'",
            [],
        ))?;

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
            currency TEXT DEFAULT 'IQD',
            source_type TEXT,
            source_id TEXT,
            source_role TEXT
        )",
            [],
        )?;

        // add time column if upgrading
        ignore_dup(conn.execute(
            "ALTER TABLE cash_register ADD COLUMN time TEXT DEFAULT '00:00'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE partner_transactions ADD COLUMN time TEXT DEFAULT '00:00'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE partner_transactions ADD COLUMN currency TEXT DEFAULT 'IQD'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE partner_transactions ADD COLUMN payment_type TEXT DEFAULT 'قاصه'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN purchase_time TEXT DEFAULT '00:00'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE expenses ADD COLUMN currency TEXT DEFAULT 'IQD'",
            [],
        ))?;
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN sale_time TEXT DEFAULT '00:00'",
            [],
        ))?;

        // new fields
        ignore_dup(conn.execute(
            "ALTER TABLE cars ADD COLUMN purchase_type TEXT DEFAULT 'كاش'",
            [],
        ))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN financer_name TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN commission_type TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN commission_value TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE expenses ADD COLUMN car_number TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE expenses ADD COLUMN car_id INTEGER", []))?;
        ignore_dup(conn.execute("ALTER TABLE expenses ADD COLUMN source_type TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE expenses ADD COLUMN source_id TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE expenses ADD COLUMN source_role TEXT", []))?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_source ON expenses(source_type, source_id, source_role)", [])?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS car_partners (
            car_id INTEGER,
            car_number TEXT NOT NULL,
            partner_name TEXT NOT NULL,
            amount TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'IQD',
            kind TEXT NOT NULL DEFAULT 'شريك',
            PRIMARY KEY (car_number, partner_name)
        )",
            [],
        )?;

        ignore_dup(conn.execute(
            "ALTER TABLE car_partners ADD COLUMN kind TEXT DEFAULT 'شريك'",
            [],
        ))?;

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
            payment_status TEXT NOT NULL DEFAULT 'واصل',
            date TEXT NOT NULL,
            time TEXT NOT NULL
        )",
            [],
        )?;
        ignore_dup(conn.execute("ALTER TABLE agencies ADD COLUMN creation_token TEXT", []))?;
        ignore_dup(conn.execute(
            "ALTER TABLE agencies ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'واصل'",
            [],
        ))?;
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_creation_token ON agencies(creation_token)",
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
            reference_entity_id INTEGER,
            type_ TEXT NOT NULL,
            description TEXT NOT NULL,
            notes TEXT
        )",
            [],
        )?;

        // Numeric accounting identity must exist before historical migration
        // helpers execute. Migration 49 completes the fail-closed backfill and
        // installs the final indexes and synchronization guards.
        for (table, column) in [
            ("partner_transactions", "source_entity_id INTEGER"),
            ("partner_transactions", "related_entity_id INTEGER"),
            ("financial_ledger", "reference_entity_id INTEGER"),
        ] {
            ignore_dup(conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column}"), []))?;
        }

        let version: i32 = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM db_version",
            [],
            |row| row.get(0),
        )?;

        if version < 1 {
            // الترحيل 1: مفتاح مركب (partner_name, kind) للجداول القديمة
            // إنشاء جدول مؤقت، نسخ البيانات، حذف القديم، إعادة التسمية
            conn.execute_batch(
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
            )?;
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN kind TEXT NOT NULL DEFAULT 'شريك'",
                [],
            ))?;
            conn.execute("INSERT INTO db_version (version) VALUES (1)", [])?;
        }

        if version < 2 {
            ignore_dup(conn.execute(
                "ALTER TABLE cars ADD COLUMN purchase_type TEXT DEFAULT 'كاش'",
                [],
            ))?;
            ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN financer_name TEXT", []))?;
            ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN commission_type TEXT", []))?;
            ignore_dup(conn.execute("ALTER TABLE cars ADD COLUMN commission_value TEXT", []))?;
            ignore_dup(conn.execute("ALTER TABLE expenses ADD COLUMN car_number TEXT", []))?;
            conn.execute(
                "CREATE TABLE IF NOT EXISTS car_partners (
                car_id INTEGER,
                car_number TEXT NOT NULL,
                partner_name TEXT NOT NULL,
                amount TEXT NOT NULL,
                currency TEXT NOT NULL DEFAULT 'IQD',
                kind TEXT NOT NULL DEFAULT 'شريك',
                PRIMARY KEY (car_number, partner_name)
            )",
                [],
            )?;
            ignore_dup(conn.execute(
                "ALTER TABLE car_partners ADD COLUMN kind TEXT DEFAULT 'شريك'",
                [],
            ))?;
            conn.execute("INSERT INTO db_version (version) VALUES (2)", [])?;
        }

        if version < 3 {
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
            conn.execute("INSERT INTO db_version (version) VALUES (3)", [])?;
        }

        if version < 4 {
            ignore_dup(conn.execute(
                "ALTER TABLE agencies ADD COLUMN car_type TEXT NOT NULL DEFAULT ''",
                [],
            ))?;
            conn.execute("INSERT INTO db_version (version) VALUES (4)", [])?;
        }

        if version < 5 {
            conn.execute(
            "DELETE FROM partner_transactions WHERE kind = 'شريك' AND type = 'ايداع دفعات زبائن'",
            [],
        )?;
            conn.execute(
            "DELETE FROM partner_transactions WHERE kind = 'شريك' AND type = 'ايداع ارباح سيارة' AND notes LIKE '%#بيع_سيارة_%' AND notes NOT LIKE '%رقم حركة دفعة:%'",
            [],
        )?;
            conn.execute("INSERT INTO db_version (version) VALUES (5)", [])?;
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
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN source_type TEXT",
                [],
            ))?;
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN source_id TEXT",
                [],
            ))?;
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN source_role TEXT",
                [],
            ))?;
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN affects_qasa INTEGER DEFAULT 1",
                [],
            ))?;
            ignore_dup(conn.execute("ALTER TABLE partner_transactions ADD COLUMN affects_partner_cash INTEGER DEFAULT 1", []))?;
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN affects_profit INTEGER DEFAULT 0",
                [],
            ))?;

            // Unique index for source deduplication (version 0)
            // FORENSIC FIX (re-audit 2026-07-11, RUNTIME-PANIC-1):
            // The original index referenced `related_source_id`, but that
            // column is only added in migration v11 (line ~1662). On a fresh
            // DB, this CREATE INDEX ran BEFORE the ALTER TABLE that adds the
            // column, causing a runtime panic: "no such column: related_source_id".
            // Fix: use a simpler index here that doesn't reference the not-yet-
            // existing column. Migration v15/v17 will recreate this index with
            // the full column set once `related_source_id` exists.
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind)
             WHERE source_type IS NOT NULL
               AND source_id IS NOT NULL
               AND source_role IS NOT NULL",
                [],
            )?;

            // Classify investor movements (unconditional — fix kind typo 'משקיע' → 'مستثمر')
            conn.execute(
            "UPDATE partner_transactions SET affects_qasa = 1, affects_partner_cash = 0, affects_profit = 0
             WHERE kind = 'مستثمر'",
            [],
        )?;

            // Classify funder/company movements (unconditional)
            conn.execute(
            "UPDATE partner_transactions SET affects_qasa = 0, affects_partner_cash = 0, affects_profit = 0
             WHERE kind IN ('ممول', 'شركة')",
            [],
        )?;

            // Classify partner profit rows (unconditional)
            conn.execute(
            "UPDATE partner_transactions SET affects_profit = 1, affects_qasa = 0, affects_partner_cash = 0
             WHERE kind = 'شريك' AND type IN ('ايداع ارباح سيارة', 'ايداع ارباح وكالة')",
            [],
        )?;

            // Classify old customer payment rows (unconditional)
            conn.execute(
                "UPDATE partner_transactions
             SET affects_qasa = 1, affects_partner_cash = 1, affects_profit = 0,
                 source_role = COALESCE(source_role, 'legacy_customer_payment_cash')
             WHERE kind = 'شريك' AND type = 'ايداع دفعات زبائن'",
                [],
            )?;

            // Clean wrong capital entries for customer payments
            conn.execute(
            "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND account_type = 'capital'
               AND reference_id IN (
                   SELECT CAST(id AS TEXT) FROM partner_transactions WHERE type = 'ايداع دفعات زبائن'
               )",
            [],
        )?;

            // Clean orphan car_expense ledger entries
            conn.execute(
                "DELETE FROM financial_ledger
             WHERE reference_type = 'car_expense'
               AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM car_expenses)",
                [],
            )?;

            conn.execute("INSERT INTO db_version (version) VALUES (6)", [])?;
        }

        // Version 7: Re-run classification fixes for databases that already ran v6 with bugs
        if version < 7 {
            // Fix investor classification (was 'משקיע' typo in v6)
            conn.execute(
            "UPDATE partner_transactions SET affects_qasa = 1, affects_partner_cash = 0, affects_profit = 0
             WHERE kind = 'مستثمر'",
            [],
        )?;
            // Fix funder/company (unconditional, not IS NULL)
            conn.execute(
            "UPDATE partner_transactions SET affects_qasa = 0, affects_partner_cash = 0, affects_profit = 0
             WHERE kind IN ('ممول', 'شركة')",
            [],
        )?;
            // Fix partner profit rows (unconditional)
            conn.execute(
            "UPDATE partner_transactions SET affects_profit = 1, affects_qasa = 0, affects_partner_cash = 0
             WHERE kind = 'شريك' AND type IN ('ايداع ارباح سيارة', 'ايداع ارباح وكالة')",
            [],
        )?;
            // Fix old customer payment rows (unconditional)
            conn.execute(
                "UPDATE partner_transactions
             SET affects_qasa = 1, affects_partner_cash = 1, affects_profit = 0,
                 source_role = COALESCE(source_role, 'legacy_customer_payment_cash')
             WHERE kind = 'شريك' AND type = 'ايداع دفعات زبائن'",
                [],
            )?;
            conn.execute("INSERT INTO db_version (version) VALUES (7)", [])?;
        }

        // Version 8: Fix car_expense ledger rows that used reference_type = 'expense'
        if version < 8 {
            // Delete wrong car_expense ledger entries (they used 'expense' instead of 'car_expense')
            conn.execute(
                "DELETE FROM financial_ledger
             WHERE reference_type = 'expense'
               AND reference_id IN (SELECT CAST(id AS TEXT) FROM car_expenses)",
                [],
            )?;
            // Also clean orphan car_expense entries
            conn.execute(
                "DELETE FROM financial_ledger
             WHERE reference_type = 'car_expense'
               AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM car_expenses)",
                [],
            )?;
            // Classify all direct INSERT rows that still have NULL source_type
            // (these were inserted by old code without source fields)
            conn.execute(
            "UPDATE partner_transactions
             SET source_type = 'legacy_unclassified',
                 source_role = 'legacy_account_movement',
                 affects_qasa = CASE WHEN kind IN ('ممول', 'شركة') THEN 0 ELSE 1 END,
                 affects_partner_cash = CASE WHEN kind IN ('ممول', 'شركة', 'مستثمر') THEN 0 ELSE 1 END,
                 affects_profit = 0
             WHERE source_type IS NULL AND kind IN ('ممول', 'شركة', 'مستثمر')",
            [],
        )?;
            conn.execute("INSERT INTO db_version (version) VALUES (8)", [])?;
        }

        // Version 9: Clean up double-counted receivable entries for customer payments
        if version < 9 {
            // Old code created Cr receivable for BOTH customer rows AND partner cash_movement rows.
            // The partner cash_movement rows should only create Dr cash (no receivable).
            // Delete Cr receivable entries that belong to partner cash_movement rows (type_ = 'ايداع مقدمة سيارة').
            conn.execute(
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
            )?;
            conn.execute("INSERT INTO db_version (version) VALUES (9)", [])?;
        }

        // Version 10: Clean old capital ledger entries from customer payment cash_movement rows
        // AND rebuild cash_movement for ALL customer payments (including those without car references)
        // AND create missing ledger entries for customer payment rows
        if version < 10 {
            conn.execute(
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
            )?;
            // Also clean capital entries from legacy 'ايداع دفعات زبائن' type rows
            conn.execute(
                "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND account_type = 'capital'
               AND reference_id IN (
                   SELECT CAST(id AS TEXT)
                   FROM partner_transactions
                   WHERE type = 'ايداع دفعات زبائن'
               )",
                [],
            )?;
            // Create missing ledger entries for existing customer payment rows
            // (Cr receivable for the original customer row)
            conn.execute(
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
        )?;
            conn.execute("INSERT INTO db_version (version) VALUES (10)", [])?;
        }

        // Version 11: Fix car_purchase rows incorrectly stored as car_sale
        if version < 11 {
            conn.execute(
                "UPDATE partner_transactions
             SET source_type = 'car_purchase'
             WHERE type = 'سحب شراء سيارة'
               AND source_type = 'car_sale'
               AND source_role = 'cash_payment'",
                [],
            )?;
            // Also add related_source_type and related_source_id columns for explicit car linkage
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN related_source_type TEXT",
                [],
            ))?;
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN related_source_id TEXT",
                [],
            ))?;
            // Populate related_source_id for existing car-linked customer payments
            conn.execute(
                "UPDATE partner_transactions
             SET related_source_type = 'car',
                 related_source_id = SUBSTR(notes, INSTR(notes, '#بيع_سيارة_') + 11)
             WHERE kind = 'زبون'
               AND notes LIKE '%#بيع_سيارة_%'
               AND related_source_type IS NULL",
                [],
            )?;
            conn.execute("INSERT INTO db_version (version) VALUES (11)", [])?;
        }

        // Version 12: Fix related_source_id cleanup and populate for generated rows
        if version < 12 {
            // 1. Ensure columns exist safely
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN related_source_type TEXT",
                [],
            ))?;
            ignore_dup(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN related_source_id TEXT",
                [],
            ))?;

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
                    conn.execute(
                        "UPDATE partner_transactions SET related_source_type = 'car', related_source_id = ?1 WHERE id = ?2",
                        params![car_num, id],
                    )?;
                }
            }
        }

            // 3. Repair rows with bad related_source_id containing spaces
            conn.execute(
            "UPDATE partner_transactions
             SET related_source_id = SUBSTR(related_source_id, 1, INSTR(related_source_id || ' ', ' ') - 1)
             WHERE related_source_id IS NOT NULL AND related_source_id LIKE '% %'",
            [],
        )?;

            // 4. Populate for generated customer_payment rows that have car reference in notes
            conn.execute(
            "UPDATE partner_transactions
             SET related_source_type = 'car',
                 related_source_id = SUBSTR(notes, INSTR(notes, '#بيع_سيارة_') + 11, INSTR(SUBSTR(notes, INSTR(notes, '#بيع_سيارة_') + 11) || ' ', ' ') - 1)
             WHERE source_type = 'customer_payment'
               AND source_role IN ('cash_movement', 'profit_recognition')
               AND notes LIKE '%#بيع_سيارة_%'
               AND (related_source_id IS NULL OR related_source_id = '')",
            [],
        )?;

            conn.execute("INSERT INTO db_version (version) VALUES (12)", [])?;
        }

        // Version 13: Fix partner transaction flags for profit recognition vs cash movement
        // Ensure ايداع بيع سيارة (car sale cash movement) has correct flags
        // Ensure ايداع ارباح سيارة (profit recognition) does not affect partner cash
        if version < 13 {
            // Fix cash sale deposit rows: ايداع بيع سيارة should affect qasa/cash only, not profit
            conn.execute(
                "UPDATE partner_transactions
             SET affects_qasa = 1,
                 affects_partner_cash = 1,
                 affects_profit = 0,
                 source_type = COALESCE(source_type, 'car_sale'),
                 source_role = 'cash_movement'
             WHERE kind = 'شريك'
               AND type = 'ايداع بيع سيارة'",
                [],
            )?;

            // Fix profit recognition rows: ايداع ارباح سيارة must NOT affect qasa/cash
            conn.execute(
                "UPDATE partner_transactions
             SET affects_qasa = 0,
                 affects_partner_cash = 0,
                 affects_profit = 1,
                 source_type = COALESCE(source_type, 'car_sale'),
                 source_role = 'profit_recognition'
             WHERE kind = 'شريك'
               AND type = 'ايداع ارباح سيارة'",
                [],
            )?;

            // Also fix agency profit rows (ايداع ارباح وكالة) — not a cash movement
            conn.execute(
                "UPDATE partner_transactions
             SET affects_qasa = 0,
                 affects_partner_cash = 0,
                 affects_profit = 1,
                 source_role = 'profit_recognition'
             WHERE kind = 'شريك'
               AND type IN ('ايداع ارباح وكالة', 'ارباح وكالة')",
                [],
            )?;

            // Recalculate all partners to reflect corrected balances
            if let Ok(mut partners_stmt) = conn.prepare("SELECT partner_name, kind FROM partners") {
                if let Ok(rows) = partners_stmt.query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                }) {
                    for (p_name, p_kind) in rows.flatten() {
                        recalculate_partner_total(conn, &p_name, &p_kind).map_err(|error| {
                            rusqlite::Error::ToSqlConversionFailure(Box::new(
                                std::io::Error::other(error),
                            ))
                        })?;
                    }
                }
            }

            conn.execute("INSERT INTO db_version (version) VALUES (13)", [])?;
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
        .collect::<Result<Vec<i64>, _>>()?;

            for pid in &profit_ids {
                conn.execute(
                    "DELETE FROM financial_ledger WHERE reference_type = 'partner_transaction' AND reference_id = ?1",
                    [pid],
                )?;
            }

            // Delete the hidden profit_recognition rows through the centralized ledger-safe path.
            delete_partner_transactions_by_source_with_ledger_for_role(
                conn,
                "customer_payment",
                "profit_recognition",
                Some("شريك"),
            )
            .map_err(|error| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(error)))
            })?;

            // Recalculate all partners to reflect corrected balances
            if let Ok(mut partners_stmt) = conn.prepare("SELECT partner_name, kind FROM partners") {
                if let Ok(rows) = partners_stmt.query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                }) {
                    for (p_name, p_kind) in rows.flatten() {
                        recalculate_partner_total(conn, &p_name, &p_kind).map_err(|error| {
                            rusqlite::Error::ToSqlConversionFailure(Box::new(
                                std::io::Error::other(error),
                            ))
                        })?;
                    }
                }
            }

            conn.execute("INSERT INTO db_version (version) VALUES (14)", [])?;
        }

        // Version 15: Normalize currencies and include currency in unique index for dual-currency support
        if version < 15 {
            conn.execute(
            "UPDATE partner_transactions SET currency = 'IQD' WHERE currency IS NULL OR TRIM(currency) = ''",
            [],
        )?;
            conn.execute("DROP INDEX IF EXISTS idx_partner_tx_source_unique", [])?;
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind, currency)
             WHERE source_type IS NOT NULL
               AND source_id IS NOT NULL
               AND source_role IS NOT NULL
               AND source_type != ''
               AND source_id != ''
               AND source_role != ''", [])?;
            conn.execute("INSERT INTO db_version (version) VALUES (15)", [])?;
        }

        // Version 16: Clean up old wrong partner split rows for investor repayments.
        // Previously, investor withdrawals incorrectly created partner cash rows with
        // source_type IN ('investor_payment', 'investor_transaction') AND source_role = 'partner_cash_payment'.
        // These rows must be removed so investor transactions affect Qasa only.
        if version < 16 {
            // Delete financial_ledger entries for the wrong partner rows
            conn.execute(
                "DELETE FROM financial_ledger
             WHERE reference_type = 'partner_transaction'
               AND CAST(reference_id AS INTEGER) IN (
                 SELECT id FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_role = 'partner_cash_payment'
                   AND source_type IN ('investor_payment', 'investor_transaction')
               )",
                [],
            )?;
            // Delete the wrong partner rows themselves
            conn.execute(
                "DELETE FROM partner_transactions
             WHERE kind = 'شريك'
               AND source_role = 'partner_cash_payment'
               AND source_type IN ('investor_payment', 'investor_transaction')",
                [],
            )?;
            // Recalculate all partner balances after cleanup
            recalculate_all_partners(conn).map_err(|error| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(error)))
            })?;
            conn.execute("INSERT INTO db_version (version) VALUES (16)", [])?;
        }

        // Version 17: Rebuild unique index with related_source_id
        if version < 17 {
            conn.execute("DROP INDEX IF EXISTS idx_partner_tx_source_unique", [])?;
            conn.execute(
            "CREATE UNIQUE INDEX idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind, COALESCE(related_source_id, ''))
             WHERE source_type IS NOT NULL
               AND source_id IS NOT NULL
               AND source_role IS NOT NULL
               AND source_type != ''
               AND source_id != ''
               AND source_role != ''",
            [],
        )?;
            conn.execute("INSERT INTO db_version (version) VALUES (17)", [])?;
        }

        // Version 18: Add expenses_at_sale column for frozen profit calculation
        if version < 18 {
            ignore_dup(conn.execute(
                "ALTER TABLE cars ADD COLUMN expenses_at_sale TEXT DEFAULT '0'",
                [],
            ))?;
            let sold_car_numbers = {
                let mut statement = conn
                    .prepare("SELECT car_number FROM cars WHERE status='مبيوعة' ORDER BY rowid")?;
                let rows = statement
                    .query_map([], |row| row.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                rows
            };
            for car_number in sold_car_numbers {
                let expenses_at_sale = sum_money_rows(
                    conn,
                    "SELECT amount FROM car_expenses WHERE car_number=?1",
                    [&car_number],
                )
                .map_err(|error| {
                    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(error)))
                })?;
                conn.execute(
                    "UPDATE cars SET expenses_at_sale=?1 WHERE car_number=?2",
                    params![expenses_at_sale, car_number],
                )?;
            }
            conn.execute("INSERT INTO db_version (version) VALUES (18)", [])?;
        }

        // Performance indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cars_purchase_type ON cars(purchase_type)",
            [],
        )?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner ON partner_transactions(partner_name, kind)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_partner_transactions_date ON partner_transactions(date)", [])?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cash_register_date ON cash_register(date)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cash_register_type ON cash_register(type)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_car_expenses_car ON car_expenses(car_number)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_car_partners_car ON car_partners(car_number)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cars_plate ON cars(car_plate_num)",
            [],
        )?;

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

        conn.execute("CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id)", [])?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_ledger_date ON financial_ledger(date)",
            [],
        )?;

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

        conn.execute("CREATE INDEX IF NOT EXISTS idx_profit_shares_distribution ON partner_profit_shares(distribution_id)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_profit_shares_partner ON partner_profit_shares(partner_name)", [])?;

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
        ignore_dup(conn.execute(
            "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
            [],
        ))?;
        ignore_dup(conn.execute("ALTER TABLE users ADD COLUMN last_login TEXT", []))?;

        // Bug 16: Create sessions and login_attempts tables for AU3 (session infra) and AU8 (rate limiting).
        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS login_attempts (
                username TEXT NOT NULL,
                attempted_at INTEGER NOT NULL
            )",
            [],
        )?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time ON login_attempts(username, attempted_at)", [])?;

        // Product decision: a fresh installation is immediately usable with
        // admin/admin and does not force password rotation. Existing custom
        // credentials are never overwritten here.
        let user_count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        if user_count == 0 {
            let password_hash = hash_password(LEGACY_INSECURE_ADMIN_PASSWORD).map_err(|error| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(error)))
            })?;
            conn.execute(
                "INSERT INTO users
                 (id,username,password_hash,display_name,profile_image,must_change_password)
                 VALUES (?1,?2,?3,'مدير النظام',NULL,0)",
                params![PRIMARY_ADMIN_USER_ID, DEFAULT_ADMIN_USERNAME, password_hash],
            )?;
        }
        conn.execute(
            "UPDATE users SET must_change_password=0 WHERE id=?1",
            [PRIMARY_ADMIN_USER_ID],
        )?;
        // NOTE: We never write initial_admin_password.txt to disk. The artifact
        // is forbidden in any release package (see scripts/check_artifact_hygiene.py).

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
            // AUD-003 FIX: Migration v19 previously deleted partner records based on
            // hardcoded names ('أمير', 'منتصر'). This was dangerous because:
            // 1. The names might not match actual partner names in a real database
            // 2. It silently deleted financial data without user confirmation
            // 3. Instructions.md §1.1 says "exactly two partners" but doesn't name them
            //
            // SAFE CHANGES ONLY: Normalize purchase_type values and payment_type values.
            // Do NOT delete any partner/partner_transactions/financial_ledger records
            // based on partner names. Those records belong to the user's data.
            log_migration_step(
                "normalize purchase_type 'دين' (v19)",
                conn.execute(
                    "UPDATE cars SET purchase_type = 'تمويل' WHERE purchase_type = 'دين'",
                    [],
                )
                .map(|_| ())
                .map_err(|e| e.to_string()),
            );
            log_migration_step(
                "normalize purchase_type (v19)",
                conn.execute("UPDATE cars SET purchase_type = 'كاش' WHERE purchase_type IN ('شراكه', 'شراكة', 'موجود')", [])
                    .map(|_| ()).map_err(|e| e.to_string()),
            );

            // Remove car_partners for cash-purchase cars (they shouldn't have partners)
            log_migration_step(
                "clean car_partners for cash cars (v19)",
                conn.execute("DELETE FROM car_partners WHERE car_number IN (SELECT car_number FROM cars WHERE purchase_type = 'كاش')", [])
                    .map(|_| ()).map_err(|e| e.to_string()),
            );

            // AUD-003: Do NOT delete partners/transactions/ledger by partner name.
            // The old code deleted records where partner_name NOT IN ('أمير', 'منتصر'),
            // which would destroy real user data if the partner names differ.
            // Instead, clean up orphaned ledger references (safe, non-destructive to user data).
            log_migration_step(
                "clean orphaned ledger refs (v19)",
                conn.execute(
                    "DELETE FROM financial_ledger
                 WHERE reference_type = 'partner_transaction'
                   AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions)",
                    [],
                )
                .map(|_| ())
                .map_err(|e| e.to_string()),
            );

            migrate_existing_data_to_ledger(conn)?;
            ensure_sales_cogs_entries(conn)?;

            log_migration_step(
                "clean duplicate ledger entries (v19)",
                conn.execute(
                    "DELETE FROM financial_ledger
                 WHERE reference_type = 'partner_transaction'
                   AND reference_id IN (
                       SELECT CAST(id AS TEXT)
                       FROM partner_transactions
                       WHERE type LIKE 'باقي%' OR type LIKE 'تحويل%'
                   )",
                    [],
                )
                .map(|_| ())
                .map_err(|e| e.to_string()),
            );
            log_migration_step(
                "clean orphaned agency ledger (v19)",
                conn.execute(
                    "DELETE FROM financial_ledger
                 WHERE reference_type = 'agency'
                   AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM agencies)",
                    [],
                )
                .map(|_| ())
                .map_err(|e| e.to_string()),
            );
            log_migration_step(
                "clean orphaned expense ledger (v19)",
                conn.execute(
                    "DELETE FROM financial_ledger
                 WHERE reference_type = 'expense'
                   AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM expenses)",
                    [],
                )
                .map(|_| ())
                .map_err(|e| e.to_string()),
            );

            ignore_dup(conn.execute(
                "ALTER TABLE partners ADD COLUMN iqd_balance TEXT DEFAULT '0'",
                [],
            ))?;
            ignore_dup(conn.execute(
                "ALTER TABLE partners ADD COLUMN usd_balance TEXT DEFAULT '0'",
                [],
            ))?;

            log_migration_step("recalculate partners (v19)", recalculate_all_partners(conn));

            log_migration_step(
                "normalize car purchase_payment_type (v19)",
                conn.execute(
                    "UPDATE cars SET purchase_payment_type = 'قاصه' WHERE purchase_payment_type IS NULL OR purchase_payment_type = '' OR purchase_payment_type = 'خارج القاصة'",
                    [],
                ).map(|_| ()).map_err(|e| e.to_string()),
            );
            log_migration_step(
                "normalize tx payment_type (v19)",
                conn.execute(
                    "UPDATE partner_transactions SET payment_type = 'قاصه' WHERE payment_type IS NULL OR payment_type = '' OR payment_type = 'خارج القاصة'",
                    [],
                ).map(|_| ()).map_err(|e| e.to_string()),
            );
            log_migration_step(
                "normalize ledger account_id (v19)",
                conn.execute(
                    "UPDATE financial_ledger SET account_id = 'قاصه' WHERE account_type = 'cash' AND (account_id IS NULL OR account_id = '' OR account_id = 'خارج القاصة')",
                    [],
                ).map(|_| ()).map_err(|e| e.to_string()),
            );

            log_migration_step(
                "normalize funder tx types (v19)",
                conn.execute(
                    "UPDATE partner_transactions SET type = 'استلام تمويل شراء سيارة', source_role = 'financing_liability', affects_qasa = 0, affects_partner_cash = 0, affects_profit = 0
                     WHERE kind = 'ممول' AND source_type = 'car_purchase' AND type LIKE 'سحب%'",
                    [],
                ).map(|_| ()).map_err(|e| e.to_string()),
            );
            log_migration_step(
                "normalize company tx types (v19)",
                conn.execute(
                    "UPDATE partner_transactions SET type = 'استلام شراء سيارة', source_role = 'company_purchase_liability', affects_qasa = 0, affects_partner_cash = 0, affects_profit = 0
                     WHERE kind = 'شركة' AND source_type = 'car_purchase' AND type LIKE 'سحب%'",
                    [],
                ).map(|_| ()).map_err(|e| e.to_string()),
            );
            log_migration_step(
                "update funder notes (v19)",
                conn.execute(
                    "UPDATE partner_transactions SET notes = replace(notes, 'سحب شراء سيارة', 'استلام تمويل شراء سيارة')
                     WHERE kind = 'ممول' AND source_type = 'car_purchase' AND notes LIKE 'سحب شراء سيارة%'",
                    [],
                ).map(|_| ()).map_err(|e| e.to_string()),
            );
            log_migration_step(
                "update company notes (v19)",
                conn.execute(
                    "UPDATE partner_transactions SET notes = replace(notes, 'سحب شراء سيارة', 'استلام شراء سيارة')
                     WHERE kind = 'شركة' AND source_type = 'car_purchase' AND notes LIKE 'سحب شراء سيارة%'",
                    [],
                ).map(|_| ()).map_err(|e| e.to_string()),
            );
            log_migration_step(
                "record version 19",
                conn.execute("INSERT INTO db_version (version) VALUES (19)", [])
                    .map(|_| ())
                    .map_err(|e| e.to_string()),
            );
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
        ignore_dup(conn.execute("ALTER TABLE audit_log ADD COLUMN field_name TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE audit_log ADD COLUMN old_value TEXT", []))?;
        ignore_dup(conn.execute("ALTER TABLE audit_log ADD COLUMN new_value TEXT", []))?;
        ensure_installment_event_schema(conn)?;

        if version < 20 {
            migrate_all_money_columns_to_text(conn)?;
            conn.execute("DROP INDEX IF EXISTS idx_partner_tx_source_unique", [])?;
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
             ON partner_transactions(source_type, source_id, source_role, partner_name, kind, COALESCE(related_source_id, ''))
             WHERE source_type IS NOT NULL
               AND source_id IS NOT NULL
               AND source_role IS NOT NULL
               AND source_type != ''
               AND source_id != ''
               AND source_role != ''", [])?;
            conn.execute("CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner ON partner_transactions(partner_name, kind)", [])?;
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id)", [])?;
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id)", [])?;
            conn.execute("INSERT INTO db_version (version) VALUES (20)", [])?;
        }

        if version < 21 {
            // Rebuild explicit installment-payment profit rows after the legacy analytical-profit detour.
            // Each customer payment keeps one cash movement and one non-cash profit recognition effect.
            conn.execute(
                "DELETE FROM financial_ledger
                 WHERE reference_type = 'partner_transaction'
                   AND reference_id NOT IN (SELECT CAST(id AS TEXT) FROM partner_transactions)",
                [],
            )?;
            log_migration_step("recalculate partners (v21)", recalculate_all_partners(conn));
            conn.execute("INSERT INTO db_version (version) VALUES (21)", [])?;
        }

        if version < 22 {
            // Agency profit rows used to affect Qasa/Cash and Profit in one row.
            // Split them into the same two effects used everywhere else:
            // cash_movement for Qasa/Cash, profit_recognition for distribution only.
            conn.execute("DROP INDEX IF EXISTS idx_partner_tx_source_unique", [])?;
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_source_unique
                 ON partner_transactions(source_type, source_id, source_role, partner_name, kind, currency, COALESCE(related_source_id, ''))
                 WHERE source_type IS NOT NULL
                   AND source_id IS NOT NULL
                   AND source_role IS NOT NULL
                   AND source_type != ''
                   AND source_id != ''
                   AND source_role != ''", [])?;
            conn.execute(
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
            )?;
            conn.execute(
                "UPDATE partner_transactions
                 SET source_role = 'profit_recognition',
                     affects_qasa = 0,
                     affects_partner_cash = 0,
                     affects_profit = 1
                 WHERE kind = 'شريك'
                   AND source_type IN ('agency', 'agency_transaction')
                   AND source_role = 'agency_profit'",
                [],
            )?;
            log_migration_step("recalculate partners (v22)", recalculate_all_partners(conn));
            conn.execute("INSERT INTO db_version (version) VALUES (22)", [])?;
        }

        // Version 23: Delete all profit_recognition rows (profit calculated analytically now)
        if version < 23 {
            conn.execute(
                "DELETE FROM financial_ledger
                 WHERE reference_type = 'partner_transaction'
                   AND reference_id IN (
                     SELECT CAST(id AS TEXT) FROM partner_transactions
                     WHERE source_role = 'profit_recognition' AND kind = 'شريك'
                   )",
                [],
            )?;
            conn.execute(
                "DELETE FROM partner_transactions
                 WHERE source_role = 'profit_recognition' AND kind = 'شريك'",
                [],
            )?;
            log_migration_step("recalculate partners (v23)", recalculate_all_partners(conn));
            conn.execute("INSERT INTO db_version (version) VALUES (23)", [])?;
        }

        // Version 24: Rename installment-payment cash movements without touching down payments.
        if version < 24 {
            conn.execute(
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
            )?;
            conn.execute(
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
            )?;
            conn.execute("INSERT INTO db_version (version) VALUES (24)", [])?;
        }

        // Version 25: Restore explicit customer-payment profit rows for installments/down payments.
        if version < 25 {
            log_migration_step(
                "إعادة احتساب أرصدة الشركاء (v25)",
                recalculate_all_partners(conn),
            );
            conn.execute("INSERT INTO db_version (version) VALUES (25)", [])?;
        }

        // Version 26: make sale down payments non-cash customer rows and restore explicit profit rows.
        if version < 26 {
            conn.execute(
                "UPDATE partner_transactions
                 SET affects_qasa = 0,
                     affects_partner_cash = 0,
                     affects_profit = 0
                 WHERE kind = 'زبون'
                   AND source_type = 'customer_sale_payment'
                   AND source_role = 'sale_down_payment'",
                [],
            )?;
            conn.execute(
                "DELETE FROM financial_ledger
                 WHERE reference_type = 'partner_transaction'
                   AND account_type = 'cash'
                   AND reference_id IN (
                     SELECT CAST(id AS TEXT)
                     FROM partner_transactions
                     WHERE kind = 'زبون'
                       AND source_type = 'customer_sale_payment'
                       AND source_role = 'sale_down_payment'
                   )",
                [],
            )?;
            // Audit fix #20: rebuild failures are logged, never silently swallowed.
            log_migration_step(
                "إعادة بناء أرباح البيع النقدي (v26)",
                rebuild_cash_sale_profit_recognitions(conn),
            );
            log_migration_step(
                "إعادة بناء حركات الوكالات (v26)",
                rebuild_all_agency_partner_entries(conn),
            );
            log_migration_step(
                "إعادة احتساب أرصدة الشركاء (v26)",
                recalculate_all_partners(conn),
            );
            conn.execute("INSERT INTO db_version (version) VALUES (26)", [])?;
        }

        // Version 27: Idempotency token for agency creation requests.
        if version < 27 {
            ignore_dup(conn.execute("ALTER TABLE agencies ADD COLUMN creation_token TEXT", []))?;
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_creation_token ON agencies(creation_token)", [])?;
            conn.execute("INSERT INTO db_version (version) VALUES (27)", [])?;
        }

        // Version 28: agency received/unreceived status.
        if version < 28 {
            ignore_dup(conn.execute(
                "ALTER TABLE agencies ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'واصل'",
                [],
            ))?;
            conn.execute(
                "UPDATE agencies SET payment_status = 'واصل'
                 WHERE payment_status IS NULL OR TRIM(payment_status) = ''",
                [],
            )?;
            conn.execute("INSERT INTO db_version (version) VALUES (28)", [])?;
        }

        // Version 29: agency receivable accounts are a dedicated "وكالة" account kind
        // and unreceived agencies must not recognize partner profit until received.
        if version < 29 {
            conn.execute(
                "UPDATE partner_transactions
                 SET kind = 'وكالة'
                 WHERE source_type = 'agency'
                   AND source_role = 'agency_receivable'
                   AND kind = 'زبون'",
                [],
            )?;
            conn.execute(
                "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind)
                 SELECT TRIM(new_agent_name), TRIM(phone), 0.0, 'وكالة'
                 FROM agencies
                 WHERE TRIM(new_agent_name) != ''
                   AND COALESCE(payment_status, 'واصل') = 'غير واصل'",
                [],
            )?;
            let agency_ids: Vec<i64> = conn
                .prepare("SELECT id FROM agencies")
                .and_then(|mut stmt| {
                    stmt.query_map([], |row| row.get::<_, i64>(0))?
                        .collect::<Result<Vec<_>, _>>()
                })
                .unwrap_or_default();
            for agency_id in agency_ids {
                log_migration_step(
                    &format!("record agency ledger entries for agency {agency_id} (v29)"),
                    record_agency_ledger_entries(conn, agency_id),
                );
            }
            log_migration_step(
                "إعادة بناء حركات الوكالات (v29)",
                rebuild_all_agency_partner_entries(conn),
            );
            log_migration_step(
                "إعادة احتساب أرصدة الشركاء (v29)",
                recalculate_all_partners(conn),
            );
            conn.execute("INSERT INTO db_version (version) VALUES (29)", [])?;
        }

        // Version 30 (Audit fixes): repair data produced by the bugs fixed in the
        // comprehensive accounting audit.
        if version < 30 {
            // Audit fix #1: customer cash-out projection rows were stored with
            // NEGATIVE amounts, which every reader double-negated (the type prefix
            // "سحب" already flips the sign). Normalize them to positive amounts.
            conn.execute(
                "UPDATE partner_transactions
                 SET amount = -amount
                 WHERE kind = 'شريك'
                   AND source_type = 'customer_payment'
                   AND source_role = 'cash_movement'
                   AND type LIKE 'سحب%'
                   AND amount < 0",
                [],
            )?;
            // Audit fix #2: related_source_type mistakenly held the car number
            // instead of the literal 'car'.
            conn.execute(
                "UPDATE partner_transactions
                 SET related_source_type = 'car'
                 WHERE kind = 'شريك'
                   AND source_type = 'customer_payment'
                   AND source_role = 'cash_movement'
                   AND COALESCE(related_source_type, '') != ''
                   AND related_source_type NOT IN ('car', 'customer_payment_event', 'partner_transaction', 'installment')
                   AND related_source_type = COALESCE(related_source_id, '')",
                [],
            )?;
            // Audit fix #17: rebuild sale ledger entries for all sold cars so that
            // installment/term sales use the installment-method entries (deferred
            // revenue = unearned profit only).
            let sold_cars: Vec<(i64, String)> = conn
                .prepare("SELECT id,car_number FROM cars WHERE status = 'مبيوعة'")
                .and_then(|mut stmt| {
                    stmt.query_map([], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    })?
                    .collect::<Result<Vec<_>, _>>()
                })
                .unwrap_or_default();
            for (car_id, car_number) in &sold_cars {
                log_migration_step(
                    "إعادة بناء قيود بيع السيارة (v30)",
                    delete_car_sale_ledger_entries(conn, car_number)
                        .and_then(|_| record_car_sale_ledger_entries(conn, *car_id)),
                );
            }
            log_migration_step(
                "إعادة بناء أرباح البيع النقدي (v30)",
                rebuild_cash_sale_profit_recognitions(conn),
            );
            // Audit fixes #12/#21: agency profit is recognized when recorded.
            let agency_ids_v30: Vec<i64> = conn
                .prepare("SELECT id FROM agencies")
                .and_then(|mut stmt| {
                    stmt.query_map([], |row| row.get::<_, i64>(0))?
                        .collect::<Result<Vec<_>, _>>()
                })
                .unwrap_or_default();
            for agency_id in agency_ids_v30 {
                log_migration_step(
                    "إعادة بناء قيود الوكالة (v30)",
                    record_agency_ledger_entries(conn, agency_id),
                );
            }
            log_migration_step(
                "إعادة بناء حركات الوكالات (v30)",
                rebuild_all_agency_partner_entries(conn),
            );
            log_migration_step(
                "إعادة احتساب أرصدة الشركاء (v30)",
                recalculate_all_partners(conn),
            );
            conn.execute("INSERT INTO db_version (version) VALUES (30)", [])?;
        }

        // Version 31: normalize VIN/chassis identifiers.
        //
        // FORENSIC FIX (re-audit 2026-07-11, FORENSIC-RUST-1-6):
        // The previous version of this migration would ABORT the entire migration
        // (and roll back) if it found two cars with the same chassis number.
        // This trapped v30 databases that legitimately had duplicate chassis
        // numbers (per §31.3, the same physical vehicle may be purchased, sold,
        // and re-purchased — each cycle has its own car_number but may share
        // the same chassis). The v33 migration drops the unique index, but if
        // a database is stuck at v30 with duplicates, it can NEVER reach v33
        // because v31 blocks the upgrade.
        //
        // Fix: normalize all chassis values but do NOT abort on duplicates.
        // Skip the unique index creation if duplicates exist (v33 will drop
        // it anyway). Log a warning so the operator knows duplicates exist.
        if version < 31 {
            let chassis_rows: Vec<(String, String)> = conn
                .prepare(
                    "SELECT car_number, COALESCE(chassis_number, '') FROM cars
                     WHERE TRIM(COALESCE(chassis_number, '')) != ''",
                )?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<Vec<_>, _>>()?;

            let mut seen_chassis: HashMap<String, Vec<String>> = HashMap::new();
            let mut normalized_rows: Vec<(String, String)> = Vec::new();
            let mut has_duplicates = false;
            for (car_number, chassis) in chassis_rows {
                let normalized = normalize_chassis_value(&chassis);
                seen_chassis
                    .entry(normalized.clone())
                    .or_default()
                    .push(car_number.clone());
                normalized_rows.push((normalized, car_number));
            }
            // Check for duplicates and log warnings (but do NOT abort).
            for (normalized, car_numbers) in &seen_chassis {
                if car_numbers.len() > 1 {
                    has_duplicates = true;
                    eprintln!(
                        "VIN migration warning: duplicate chassis '{}' shared by cars: {}",
                        normalized,
                        car_numbers.join(", ")
                    );
                }
            }

            for (normalized, car_number) in normalized_rows {
                conn.execute(
                    "UPDATE cars SET chassis_number = ?1 WHERE car_number = ?2",
                    params![normalized, car_number],
                )?;
            }
            // Only create the unique index if there are no duplicates.
            // If duplicates exist, skip the index — v33 will drop it anyway.
            if !has_duplicates {
                conn.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_chassis_unique
                     ON cars(chassis_number COLLATE NOCASE)
                     WHERE chassis_number IS NOT NULL AND TRIM(chassis_number) != ''",
                    [],
                )?;
            } else {
                eprintln!(
                    "VIN migration: skipping unique index creation due to duplicate chassis (will be handled by v33)"
                );
            }
            conn.execute("INSERT INTO db_version (version) VALUES (31)", [])?;
        }

        // Version 32: cleanup orphan partner_transaction split rows whose
        // source_id points to a deleted parent partner_transaction, AND
        // rebuild missing ledger entries for liability-side transactions
        // (funder/company/investor deposits and repayments).
        //
        // BUG-1 (forensic re-audit, 2026-07-10): production DB at v30 contained
        // 2 `funder_payment` split rows (229, 230) whose source_id='228' pointed
        // to a `funder_transaction` parent that had already been deleted (likely
        // via a pre-Audit-fix-#3 code path). The orphan splits kept reducing
        // partner cash by 52,050 IQD without the matching funder-liability
        // reduction, producing a -52,050 IQD overall ledger imbalance.
        //
        // BUG-1b (forensic re-audit, 2026-07-10): the same DB also contained
        // `funder_transaction` rows 231 and 232 (deposits of 52,050 and
        // 39,543,775 IQD) with NO ledger entries at all — `record_partner_ledger_entries`
        // used to bail out early for any row with `affects_qasa=0 AND
        // affects_partner_cash=0 AND source_role != "profit_recognition"`,
        // which incorrectly skipped the funder/company/investor liability
        // entries. The fix in this version restores the missing ledger entries
        // by re-running `record_partner_ledger_entries` for every non-reversed
        // liability-side row that currently has zero ledger entries.
        //
        // Both fixes are idempotent: the orphan cleanup only deletes splits
        // whose parent is missing; the ledger rebuild only writes entries for
        // rows that have zero entries (rows that already have entries are
        // untouched).
        if version < 32 {
            // 1) Orphan split cleanup.
            let cleanup_result = cleanup_orphan_partner_splits(conn);
            match cleanup_result {
                Ok(removed) => {
                    if removed > 0 {
                        log_migration_step(
                            &format!("تنظيف حركات الشركاء اليتيمة (v32): أزيل {removed} صف"),
                            Ok(()),
                        );
                    }
                }
                Err(e) => {
                    log_migration_step("تنظيف حركات الشركاء اليتيمة (v32)", Err(e));
                }
            }

            // 2) Rebuild missing ledger entries for liability-side REPAYMENT
            //    transactions only (funder_transaction / company_transaction
            //    with source_role='repayment_account_movement' and type
            //    starts with 'سحب'). These are the rows whose ledger entries
            //    were silently skipped by the pre-fix guard in
            //    record_partner_ledger_entries. We deliberately do NOT rebuild
            //    ledger entries for standalone funder/company DEPOSITS
            //    (type='ايداع', source_role='account_movement') because:
            //      - Their original ledger side was the funder/company credit
            //        (liability increase), which would need a matching cash
            //        debit to balance. But Instructions.md §15 says funder
            //        movements do not appear in Qasa/Cash by themselves, so
            //        there is no safe counterpart to write here.
            //      - The standalone-deposit case is typically a manual
            //        bookkeeping entry whose cash side was recorded through a
            //        different transaction (e.g. a car purchase or a separate
            //        partner deposit). Writing only the liability credit
            //        would corrupt the overall ledger balance.
            //    Repayments are safe to rebuild because their structure is:
            //      parent row (Dr funder, no cash) + 2 split rows (Cr cash each)
            //    — the parent's Dr funder entry is the missing piece.
            let repayment_tx_ids: Vec<i64> = conn
                .prepare(
                    "SELECT pt.id FROM partner_transactions pt
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
                )
                .and_then(|mut stmt| {
                    stmt.query_map([], |row| row.get::<_, i64>(0))?
                        .collect::<Result<Vec<_>, _>>()
                })
                .unwrap_or_default();
            let mut rebuilt = 0usize;
            for tx_id in &repayment_tx_ids {
                match record_partner_ledger_entries(conn, *tx_id) {
                    Ok(()) => rebuilt += 1,
                    Err(e) => {
                        log_migration_step(
                            &format!("إعادة بناء قيود الحركة {tx_id} (v32)"),
                            Err(e),
                        );
                    }
                }
            }
            if rebuilt > 0 {
                log_migration_step(
                    &format!(
                        "إعادة بناء قيود تسديدات الممول/الشركة (v32): أُعيد بناء {rebuilt} حركة"
                    ),
                    Ok(()),
                );
            }

            // 3) Recalculate partner balances after both fixes.
            log_migration_step(
                "إعادة احتساب أرصدة الشركاء (v32)",
                recalculate_all_partners(conn),
            );

            conn.execute("INSERT INTO db_version (version) VALUES (32)", [])?;
        }

        // Version 33: Drop the UNIQUE index on chassis_number.
        //
        // FORENSIC FIX (re-audit 2026-07-10, Instructions.md §31.3):
        // The same physical vehicle may be purchased, sold, and re-purchased
        // multiple times. Each cycle is an independent accounting event with
        // its own car_number and its own cost basis / sale price / profit.
        // The UNIQUE constraint added in v31 prevented this legitimate
        // business scenario. This migration drops the unique index and
        // replaces it with a non-unique index for lookup performance.
        //
        // The `ensure_unique_chassis` function in lib.rs was also updated
        // to no longer reject duplicates — it only validates non-empty.
        if version < 33 {
            conn.execute("DROP INDEX IF EXISTS idx_cars_chassis_unique", [])?;
            // Recreate as a non-unique index for lookup performance.
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_cars_chassis
                 ON cars(chassis_number COLLATE NOCASE)
                 WHERE chassis_number IS NOT NULL AND TRIM(chassis_number) != ''",
                [],
            )?;
            log_migration_step("إزالة قيد التفرد على رقم الشاصي (v33)", Ok(()));
            conn.execute("INSERT INTO db_version (version) VALUES (33)", [])?;
        }

        // Version 34: Add creation_token columns to all entities that support
        // idempotent creation (per Instructions.md §31.2).
        //
        // FORENSIC FIX (re-audit 2026-07-11, FORENSIC-RUST-1-2..5):
        // cars, expenses, car_expenses, partner_transactions, and agency_transactions
        // were missing the creation_token column. Without it, the frontend's
        // IdempotencyGuard cannot pass a token to the backend, and the backend
        // cannot detect duplicate creation requests.
        //
        // This migration adds the column with a UNIQUE index to each table.
        // The index is partial (WHERE creation_token IS NOT NULL) so that rows
        // without a token (legacy data or non-idempotent calls) don't conflict.
        if version < 34 {
            // FORENSIC FIX (re-audit 2026-07-11, ERROR-SWALLOW-3):
            // v34 originally discarded every ALTER/CREATE Result,
            // CREATE INDEX, which swallowed ALL errors — not just the expected
            // "duplicate column" error from re-running on an already-migrated DB.
            // A real failure (e.g. disk full, locked schema, syntax drift) would
            // be silently ignored and v34 would still be recorded as applied.
            //
            // Per §9.1 we cannot modify a published migration's behavior, but we
            // CAN tighten its error handling to match the v35 pattern: ignore
            // DuplicateColumn / "index already exists" (idempotent re-runs) and
            // surface every other error so the migration fails closed.
            //
            // The postcondition (index actually exists) is verified separately
            // by v35 below; this change just makes v34 itself fail loud.
            fn ignore_duplicate_column(res: rusqlite::Result<usize>) -> rusqlite::Result<()> {
                match res {
                    Ok(_) => Ok(()),
                    // FORENSIC FIX (re-audit 2026-07-11, PHASE-0-RUST-COMPILE):
                    // rusqlite 0.32 removed `ErrorCode::DuplicateColumn`. Detect
                    // by string-matching the SQLite error message.
                    Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
                        if msg.contains("duplicate column name") =>
                    {
                        Ok(())
                    }
                    Err(e) => Err(e),
                }
            }
            ignore_duplicate_column(
                conn.execute("ALTER TABLE cars ADD COLUMN creation_token TEXT", []),
            )?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_creation_token
                 ON cars(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;

            ignore_duplicate_column(
                conn.execute("ALTER TABLE expenses ADD COLUMN creation_token TEXT", []),
            )?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_creation_token
                 ON expenses(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;

            ignore_duplicate_column(conn.execute(
                "ALTER TABLE car_expenses ADD COLUMN creation_token TEXT",
                [],
            ))?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_car_expenses_creation_token
                 ON car_expenses(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;

            ignore_duplicate_column(conn.execute(
                "ALTER TABLE partner_transactions ADD COLUMN creation_token TEXT",
                [],
            ))?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_creation_token
                 ON partner_transactions(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;

            ignore_duplicate_column(conn.execute(
                "ALTER TABLE agency_transactions ADD COLUMN creation_token TEXT",
                [],
            ))?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_tx_creation_token
                 ON agency_transactions(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;

            log_migration_step("إضافة عمود creation_token للكيانات (v34)", Ok(()));
            conn.execute("INSERT INTO db_version (version) VALUES (34)", [])?;
        }

        // Version 35: Audit-trail completeness + creation_token postcondition repair.
        //
        // FORENSIC FIX (re-audit 2026-07-11, AUDIT-TRAIL-1 + IDEMPOTENCY-REPAIR):
        // Two parallel goals:
        //
        // 1. audit_log must carry actor_user_id / session_id / request_id /
        //    creation_token so every mutation can be traced back to the backend
        //    session that authorized it (see §10.4 of the executive prompt).
        //
        // 2. Fail-closed postconditions on the v34 creation_token indexes. v34
        //    discarded the ALTER + CREATE INDEX Results, which means
        //    a database that already existed at v34 with the columns missing
        //    could silently stay broken. v35 verifies each index actually exists
        //    and recreates it if missing. Per §9.1, we never modify a published
        //    migration; we add a repair migration on top.
        if version < 35 {
            // 1. audit_log new columns — fail-closed with explicit propagation.
            let alter_audit_user =
                conn.execute("ALTER TABLE audit_log ADD COLUMN actor_user_id INTEGER", []);
            // Ignore "duplicate column" because it means a previous v35 attempt
            // already added it; any other error is fatal.
            match alter_audit_user {
                Ok(_) => {}
                // FORENSIC FIX (re-audit 2026-07-11, PHASE-0-RUST-COMPILE):
                // rusqlite 0.32 removed `ErrorCode::DuplicateColumn`. Detect
                // by string-matching the SQLite error message.
                Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
                    if msg.contains("duplicate column name") => {}
                Err(e) => return Err(e),
            }
            let alter_audit_session =
                conn.execute("ALTER TABLE audit_log ADD COLUMN session_id TEXT", []);
            match alter_audit_session {
                Ok(_) => {}
                Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
                    if msg.contains("duplicate column name") => {}
                Err(e) => return Err(e),
            }
            let alter_audit_request =
                conn.execute("ALTER TABLE audit_log ADD COLUMN request_id TEXT", []);
            match alter_audit_request {
                Ok(_) => {}
                Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
                    if msg.contains("duplicate column name") => {}
                Err(e) => return Err(e),
            }
            let alter_audit_token =
                conn.execute("ALTER TABLE audit_log ADD COLUMN creation_token TEXT", []);
            match alter_audit_token {
                Ok(_) => {}
                Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
                    if msg.contains("duplicate column name") => {}
                Err(e) => return Err(e),
            }

            // 2. Postcondition repair: recreate creation_token indexes if missing.
            //    These are CREATE IF NOT EXISTS so they are idempotent and safe.
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_creation_token
                 ON cars(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_creation_token
                 ON expenses(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_car_expenses_creation_token
                 ON car_expenses(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_creation_token
                 ON partner_transactions(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_tx_creation_token
                 ON agency_transactions(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;

            // 3. Postcondition check: verify each index exists. Fail-closed.
            for idx_name in [
                "idx_cars_creation_token",
                "idx_expenses_creation_token",
                "idx_car_expenses_creation_token",
                "idx_partner_tx_creation_token",
                "idx_agency_tx_creation_token",
            ] {
                let exists: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
                    [idx_name],
                    |row| row.get(0),
                )?;
                if exists == 0 {
                    return Err(rusqlite::Error::ToSqlConversionFailure(
                        format!(
                            "v35 postcondition failed: index {} was not created",
                            idx_name
                        )
                        .into(),
                    ));
                }
            }

            log_migration_step(
                "audit_log columns + creation_token postconditions (v35)",
                Ok(()),
            );
            conn.execute("INSERT INTO db_version (version) VALUES (35)", [])?;
        }

        // ============================================================
        // FORENSIC FIX (re-audit 2026-07-11, CRITICAL-5 + §5 — MIGRATION 36):
        // Schema-strengthening migration. Adds idempotency_requests,
        // journal_entries/journal_lines, CHECK triggers, double-sell guard,
        // and car_expenses FK enforcement. FAIL-CLOSED: every statement uses
        // `?` so any error rolls back the transaction. Postconditions verify
        // each new object exists before committing the version bump.
        if version < 36 {
            // (1) idempotency_requests — request-level idempotency table.
            conn.execute(
                "CREATE TABLE IF NOT EXISTS idempotency_requests (
                    token TEXT NOT NULL,
                    command_name TEXT NOT NULL,
                    request_hash TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
                    result_reference TEXT,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
                    completed_at TEXT,
                    PRIMARY KEY (token)
                )",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_idempotency_command_status
                 ON idempotency_requests(command_name, status)",
                [],
            )?;

            // (2) journal_entries / journal_lines — structured accounting journal.
            conn.execute(
                "CREATE TABLE IF NOT EXISTS journal_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    journal_type TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    currency TEXT NOT NULL CHECK (currency IN ('IQD', 'USD')),
                    memo TEXT,
                    actor_id INTEGER,
                    creation_token TEXT,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
                    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
                )",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_journal_entries_source
                 ON journal_entries(source_type, source_id)",
                [],
            )?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_creation_token
                 ON journal_entries(creation_token)
                 WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
                [],
            )?;
            conn.execute(
                "CREATE TABLE IF NOT EXISTS journal_lines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    journal_entry_id INTEGER NOT NULL,
                    account TEXT NOT NULL,
                    debit TEXT NOT NULL DEFAULT '0',
                    credit TEXT NOT NULL DEFAULT '0',
                    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
                    CHECK (TRIM(debit) <> '' AND TRIM(credit) <> ''),
                    CHECK (debit NOT GLOB '-*' AND credit NOT GLOB '-*')
                )",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
                 ON journal_lines(journal_entry_id)",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_journal_lines_account
                 ON journal_lines(account)",
                [],
            )?;

            // (3) CHECK on affects_partner_cash — must be 0 or 1.
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_partner_tx_affects_partner_cash_check
                 BEFORE INSERT ON partner_transactions
                 FOR EACH ROW
                 WHEN NEW.affects_partner_cash NOT IN (0, 1)
                 BEGIN
                     SELECT RAISE(ABORT, 'affects_partner_cash must be 0 or 1');
                 END",
                [],
            )?;
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_partner_tx_affects_partner_cash_update_check
                 BEFORE UPDATE OF affects_partner_cash ON partner_transactions
                 FOR EACH ROW
                 WHEN NEW.affects_partner_cash NOT IN (0, 1)
                 BEGIN
                     SELECT RAISE(ABORT, 'affects_partner_cash must be 0 or 1');
                 END",
                [],
            )?;

            // (4) CHECK on currency via trigger (rejects anything not IQD/USD).
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_partner_tx_currency_check
                 BEFORE INSERT ON partner_transactions
                 FOR EACH ROW
                 WHEN COALESCE(NEW.currency, 'IQD') NOT IN ('IQD', 'USD')
                 BEGIN
                     SELECT RAISE(ABORT, 'currency must be IQD or USD');
                 END",
                [],
            )?;

            // (5) CHECK on cars.status via trigger.
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_cars_status_check
                 BEFORE INSERT ON cars
                 FOR EACH ROW
                 WHEN NEW.status NOT IN ('متوفرة', 'مبيوعة', 'محذوفة')
                 BEGIN
                     SELECT RAISE(ABORT, 'cars.status must be one of متوفرة / مبيوعة / محذوفة');
                 END",
                [],
            )?;
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_cars_status_update_check
                 BEFORE UPDATE OF status ON cars
                 FOR EACH ROW
                 WHEN NEW.status NOT IN ('متوفرة', 'مبيوعة', 'محذوفة')
                 BEGIN
                     SELECT RAISE(ABORT, 'cars.status must be one of متوفرة / مبيوعة / محذوفة');
                 END",
                [],
            )?;

            // (6) Prevent the same car from being sold twice without reversal.
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_cars_no_double_sell
                 BEFORE UPDATE OF status ON cars
                 FOR EACH ROW
                 WHEN OLD.status = 'مبيوعة' AND NEW.status = 'مبيوعة'
                 BEGIN
                     SELECT RAISE(ABORT, 'السيارة مبيوعة بالفعل — لا يجوز بيعها مرتين بدون عكس البيع أولاً');
                 END",
                [],
            )?;

            // (7) FK enforcement for car_expenses.car_number → cars.car_number.
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_car_expenses_fk_car_number
                 BEFORE INSERT ON car_expenses
                 FOR EACH ROW
                 WHEN NOT EXISTS (SELECT 1 FROM cars WHERE car_number = NEW.car_number)
                 BEGIN
                     SELECT RAISE(ABORT,
                         'لا يمكن إضافة مصروف لسيارة غير موجودة (FK car_expenses.car_number → cars.car_number)');
                 END",
                [],
            )?;
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_car_expenses_fk_car_number_update
                 BEFORE UPDATE OF car_number ON car_expenses
                 FOR EACH ROW
                 WHEN NOT EXISTS (SELECT 1 FROM cars WHERE car_number = NEW.car_number)
                 BEGIN
                     SELECT RAISE(ABORT,
                         'لا يمكن ربط مصروف بسيارة غير موجودة (FK car_expenses.car_number → cars.car_number)');
                 END",
                [],
            )?;

            // === POSTCONDITIONS (fail-closed) ===
            let postcondition_checks: [(&str, &str); 7] = [
                ("idempotency_requests", "SELECT name FROM sqlite_master WHERE type='table' AND name='idempotency_requests'"),
                ("journal_entries", "SELECT name FROM sqlite_master WHERE type='table' AND name='journal_entries'"),
                ("journal_lines", "SELECT name FROM sqlite_master WHERE type='table' AND name='journal_lines'"),
                ("trg_partner_tx_affects_partner_cash_check", "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_partner_tx_affects_partner_cash_check'"),
                ("trg_partner_tx_currency_check", "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_partner_tx_currency_check'"),
                ("trg_cars_status_check", "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_cars_status_check'"),
                ("trg_cars_no_double_sell", "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_cars_no_double_sell'"),
            ];
            for (obj_name, sql) in &postcondition_checks {
                let exists: bool = conn
                    .query_row(sql, [], |row| row.get::<_, String>(0))
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                if !exists {
                    return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                        std::io::Error::other(format!(
                            "v36 postcondition failed: object '{}' was not created",
                            obj_name
                        )),
                    )));
                }
            }

            log_migration_step("idempotency_requests + journal_entries/lines + CHECK triggers + double-sell guard + car_expenses FK (v36)", Ok(()));
            conn.execute("INSERT INTO db_version (version) VALUES (36)", [])?;
        }

        // AUD-013 FIX: Move runtime DDL to proper migration.
        if version < 37 {
            // Migration 37: Add reverses_ledger_id column to financial_ledger
            // (was previously done at runtime inside reverse_ledger_entries).
            // Some databases received the column from the former runtime DDL
            // before v37 existed. Treat that valid shape as already migrated,
            // while still creating and verifying the supporting index.
            let reversal_column_exists: bool = conn.query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM pragma_table_info('financial_ledger')
                    WHERE name = 'reverses_ledger_id'
                )",
                [],
                |row| row.get(0),
            )?;
            if !reversal_column_exists {
                conn.execute(
                    "ALTER TABLE financial_ledger
                     ADD COLUMN reverses_ledger_id INTEGER DEFAULT NULL",
                    [],
                )?;
            }
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_ledger_reverses
                 ON financial_ledger(reverses_ledger_id)
                 WHERE reverses_ledger_id IS NOT NULL",
                [],
            )?;

            let reversal_index_exists: bool = conn.query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM sqlite_master
                    WHERE type = 'index' AND name = 'idx_ledger_reverses'
                )",
                [],
                |row| row.get(0),
            )?;
            if !reversal_index_exists {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::other(
                        "v37 postcondition failed: idx_ledger_reverses was not created",
                    ),
                )));
            }

            conn.execute("INSERT INTO db_version (version) VALUES (37)", [])?;
        }

        // Migration 38: creation time is independent from the user-entered
        // purchase date. The latter is a business date and cannot safely back
        // the five-second double-click/idempotency window (§31.5.3).
        if version < 38 {
            let created_at_exists: bool = conn.query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM pragma_table_info('cars')
                    WHERE name = 'created_at'
                )",
                [],
                |row| row.get(0),
            )?;
            if !created_at_exists {
                conn.execute("ALTER TABLE cars ADD COLUMN created_at TEXT", [])?;
            }
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_cars_recent_duplicate
                 ON cars(chassis_number, purchase_price, purchase_date, created_at)
                 WHERE creation_token IS NULL",
                [],
            )?;
            conn.execute("INSERT INTO db_version (version) VALUES (38)", [])?;
        }

        // Migration 39: give every car an immutable numeric identity and bind
        // car expenses to that identity. Plate and chassis values are business
        // attributes and may legitimately be duplicated across purchase cycles.
        if version < 39 {
            let car_id_exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('cars') WHERE name = 'id')",
                [],
                |row| row.get(0),
            )?;
            if !car_id_exists {
                conn.execute("ALTER TABLE cars ADD COLUMN id INTEGER", [])?;
            }
            conn.execute("UPDATE cars SET id = rowid WHERE id IS NULL", [])?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_immutable_id ON cars(id)",
                [],
            )?;
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_cars_assign_immutable_id
                 AFTER INSERT ON cars
                 FOR EACH ROW WHEN NEW.id IS NULL
                 BEGIN
                     UPDATE cars SET id = NEW.rowid WHERE rowid = NEW.rowid;
                 END",
                [],
            )?;

            let expense_car_id_exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('car_expenses') WHERE name = 'car_id')",
                [],
                |row| row.get(0),
            )?;
            if !expense_car_id_exists {
                conn.execute("ALTER TABLE car_expenses ADD COLUMN car_id INTEGER", [])?;
            }
            conn.execute(
                "UPDATE car_expenses
                 SET car_id = (SELECT cars.id FROM cars WHERE cars.car_number = car_expenses.car_number)
                 WHERE car_id IS NULL",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_car_expenses_car_id ON car_expenses(car_id)",
                [],
            )?;
            conn.execute("DROP TRIGGER IF EXISTS trg_car_expenses_fk_car_number", [])?;
            conn.execute(
                "DROP TRIGGER IF EXISTS trg_car_expenses_fk_car_number_update",
                [],
            )?;
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_car_expenses_fk_car_id
                 BEFORE INSERT ON car_expenses
                 FOR EACH ROW
                 WHEN NEW.car_id IS NULL OR NOT EXISTS (SELECT 1 FROM cars WHERE id = NEW.car_id)
                 BEGIN
                     SELECT RAISE(ABORT, 'لا يمكن إضافة مصروف لسيارة غير موجودة (car_id)');
                 END",
                [],
            )?;
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS trg_car_expenses_fk_car_id_update
                 BEFORE UPDATE OF car_id ON car_expenses
                 FOR EACH ROW
                 WHEN NEW.car_id IS NULL OR NOT EXISTS (SELECT 1 FROM cars WHERE id = NEW.car_id)
                 BEGIN
                     SELECT RAISE(ABORT, 'لا يمكن ربط مصروف بسيارة غير موجودة (car_id)');
                 END",
                [],
            )?;

            conn.execute("INSERT INTO db_version (version) VALUES (39)", [])?;
        }

        // Migration 40: additive numeric identity foundation. Legacy text
        // columns remain available for display during the transition, but all
        // new relationships have stable IDs. Ambiguous normalized account
        // names fail the entire migration instead of being merged by guess.
        if version < 40 {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS operations (
                    id TEXT PRIMARY KEY,
                    operation_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','reversed','cancelled')),
                    creation_token TEXT UNIQUE,
                    request_hash TEXT,
                    actor_user_id INTEGER,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    reversed_at TEXT,
                    reversal_operation_id TEXT,
                    FOREIGN KEY (actor_user_id) REFERENCES users(id),
                    FOREIGN KEY (reversal_operation_id) REFERENCES operations(id)
                );

                CREATE TABLE IF NOT EXISTS accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    display_name TEXT NOT NULL,
                    normalized_name TEXT NOT NULL UNIQUE CHECK (TRIM(normalized_name) <> ''),
                    account_type TEXT NOT NULL CHECK (
                        account_type IN ('زبون','ممول','شركة','مستثمر','وكالة','شريك')
                    ),
                    phone TEXT,
                    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
                );

                CREATE TABLE IF NOT EXISTS car_sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    operation_id TEXT NOT NULL UNIQUE,
                    car_id INTEGER NOT NULL,
                    customer_account_id INTEGER,
                    sale_type TEXT NOT NULL CHECK (sale_type IN ('كاش','اقساط','موعد','اجل')),
                    selling_price TEXT NOT NULL,
                    currency TEXT NOT NULL CHECK (currency IN ('IQD','USD')),
                    sale_date TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','reversed','cancelled')),
                    creation_token TEXT UNIQUE,
                    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    FOREIGN KEY (operation_id) REFERENCES operations(id),
                    FOREIGN KEY (car_id) REFERENCES cars(id),
                    FOREIGN KEY (customer_account_id) REFERENCES accounts(id)
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_car_sales_one_active_per_car
                    ON car_sales(car_id) WHERE status = 'active';

                CREATE TABLE IF NOT EXISTS installments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    operation_id TEXT NOT NULL,
                    sale_id INTEGER NOT NULL,
                    customer_account_id INTEGER,
                    legacy_transaction_id INTEGER UNIQUE,
                    due_date TEXT NOT NULL,
                    currency TEXT NOT NULL CHECK (currency IN ('IQD','USD')),
                    original_amount TEXT NOT NULL,
                    current_amount TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'unpaid'
                        CHECK (status IN ('unpaid','paid','reversed','cancelled')),
                    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    FOREIGN KEY (operation_id) REFERENCES operations(id),
                    FOREIGN KEY (sale_id) REFERENCES car_sales(id),
                    FOREIGN KEY (customer_account_id) REFERENCES accounts(id),
                    FOREIGN KEY (legacy_transaction_id) REFERENCES partner_transactions(id)
                );
                CREATE INDEX IF NOT EXISTS idx_installments_sale_id ON installments(sale_id, status, due_date, id);

                CREATE TABLE IF NOT EXISTS accounting_periods (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
                    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
                    closed_by_user_id INTEGER,
                    closed_at TEXT,
                    reopened_by_user_id INTEGER,
                    reopened_at TEXT,
                    reason TEXT,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    CHECK (start_date <= end_date),
                    FOREIGN KEY (closed_by_user_id) REFERENCES users(id),
                    FOREIGN KEY (reopened_by_user_id) REFERENCES users(id)
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_period_range
                    ON accounting_periods(start_date, end_date);
                CREATE TRIGGER IF NOT EXISTS trg_accounting_period_no_overlap_insert
                BEFORE INSERT ON accounting_periods
                WHEN EXISTS (
                    SELECT 1 FROM accounting_periods
                    WHERE NOT (NEW.end_date < start_date OR NEW.start_date > end_date)
                ) BEGIN
                    SELECT RAISE(ABORT, 'الفترة المحاسبية متداخلة مع فترة موجودة');
                END;
                CREATE TRIGGER IF NOT EXISTS trg_accounting_period_no_overlap_update
                BEFORE UPDATE OF start_date, end_date ON accounting_periods
                WHEN EXISTS (
                    SELECT 1 FROM accounting_periods
                    WHERE id <> OLD.id
                      AND NOT (NEW.end_date < start_date OR NEW.start_date > end_date)
                ) BEGIN
                    SELECT RAISE(ABORT, 'الفترة المحاسبية متداخلة مع فترة موجودة');
                END;"
            )?;

            for (table, definition) in [
                ("partners", "account_id INTEGER"),
                ("partner_transactions", "account_id INTEGER"),
                ("partner_transactions", "operation_id TEXT"),
                ("partner_transactions", "sale_id INTEGER"),
                ("financial_ledger", "operation_id TEXT"),
                ("financial_ledger", "account_id_v2 INTEGER"),
                ("financial_ledger", "sale_id INTEGER"),
                ("audit_log", "operation_id TEXT"),
                ("audit_log", "account_id INTEGER"),
                ("audit_log", "version INTEGER"),
                ("cars", "purchase_operation_id TEXT"),
                ("cars", "active_sale_id INTEGER"),
                ("cars", "version INTEGER NOT NULL DEFAULT 1"),
                ("cars", "updated_at TEXT"),
                ("expenses", "operation_id TEXT"),
                ("expenses", "version INTEGER NOT NULL DEFAULT 1"),
                ("expenses", "updated_at TEXT"),
                ("car_expenses", "operation_id TEXT"),
                ("car_expenses", "version INTEGER NOT NULL DEFAULT 1"),
                ("car_expenses", "updated_at TEXT"),
                ("agencies", "operation_id TEXT"),
                ("agencies", "account_id INTEGER"),
                ("agencies", "version INTEGER NOT NULL DEFAULT 1"),
                ("agencies", "updated_at TEXT"),
                ("agency_transactions", "operation_id TEXT"),
                ("agency_transactions", "version INTEGER NOT NULL DEFAULT 1"),
                ("agency_transactions", "updated_at TEXT"),
                ("customer_installment_payment_events", "operation_id TEXT"),
                ("customer_installment_payment_events", "sale_id_v2 INTEGER"),
                ("customer_installment_payment_events", "account_id INTEGER"),
                (
                    "customer_installment_payment_events",
                    "version INTEGER NOT NULL DEFAULT 1",
                ),
                ("customer_installment_payment_events", "updated_at TEXT"),
            ] {
                let column = definition.split_whitespace().next().unwrap_or_default();
                let exists: bool = conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name=?2)",
                    params![table, column],
                    |row| row.get(0),
                )?;
                if !exists {
                    conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {definition}"), [])?;
                }
            }

            let legacy_accounts = {
                let mut stmt = conn.prepare(
                    "SELECT partner_name, kind, phone FROM partners ORDER BY partner_name, kind",
                )?;
                let rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, Option<String>>(2)?,
                        ))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                rows
            };
            let mut normalized_owners =
                std::collections::HashMap::<String, (String, String)>::new();
            for (display_name, account_type, phone) in legacy_accounts {
                let normalized_name = normalize_account_name(&display_name);
                if normalized_name.is_empty() {
                    return Err(rusqlite::Error::InvalidParameterName(
                        "تعذر ترحيل حساب ذي اسم فارغ".to_string(),
                    ));
                }
                if let Some((existing_name, existing_type)) =
                    normalized_owners.get(&normalized_name)
                {
                    return Err(rusqlite::Error::InvalidParameterName(format!(
                        "اسم حساب ملتبس بعد التطبيع: {display_name}/{account_type} يطابق {existing_name}/{existing_type}"
                    )));
                }
                normalized_owners.insert(
                    normalized_name.clone(),
                    (display_name.clone(), account_type.clone()),
                );
                conn.execute(
                    "INSERT OR IGNORE INTO accounts (display_name, normalized_name, account_type, phone)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![display_name, normalized_name, account_type, phone],
                )?;
                let account_id: i64 = conn.query_row(
                    "SELECT id FROM accounts WHERE normalized_name=?1",
                    [&normalized_name],
                    |row| row.get(0),
                )?;
                conn.execute(
                    "UPDATE partners SET account_id=?1 WHERE partner_name=?2 AND kind=?3",
                    params![account_id, display_name, account_type],
                )?;
            }
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_account_id ON partners(account_id)",
                [],
            )?;
            conn.execute(
                "UPDATE partner_transactions
                 SET account_id=(SELECT p.account_id FROM partners p
                                 WHERE p.partner_name=partner_transactions.partner_name
                                   AND p.kind=partner_transactions.kind)
                 WHERE account_id IS NULL",
                [],
            )?;

            conn.execute(
                "INSERT OR IGNORE INTO operations (id, operation_type, status)
                 SELECT 'legacy-car-purchase-' || id, 'car_purchase', 'active'
                 FROM cars",
                [],
            )?;
            conn.execute(
                "UPDATE cars
                 SET purchase_operation_id='legacy-car-purchase-' || id,
                     updated_at=COALESCE(updated_at, strftime('%Y-%m-%d %H:%M:%S','now','localtime'))",
                [],
            )?;
            conn.execute(
                "INSERT OR IGNORE INTO operations (id, operation_type, status)
                 SELECT 'legacy-car-sale-' || id, 'car_sale', 'active'
                 FROM cars WHERE status='مبيوعة'",
                [],
            )?;
            conn.execute(
                "INSERT OR IGNORE INTO car_sales
                 (operation_id, car_id, customer_account_id, sale_type, selling_price,
                  currency, sale_date, status, created_at, updated_at)
                 SELECT 'legacy-car-sale-' || c.id,
                        c.id,
                        (SELECT p.account_id FROM partners p
                         WHERE p.partner_name=c.buyer_name AND p.kind='زبون'),
                        CASE COALESCE(c.payment_type,'كاش')
                          WHEN 'اقساط' THEN 'اقساط'
                          WHEN 'موعد' THEN 'موعد'
                          ELSE 'كاش' END,
                        COALESCE(c.selling_price,'0'),
                        COALESCE(c.sale_currency,c.currency,'IQD'),
                        COALESCE(NULLIF(c.sale_date,''), NULLIF(c.purchase_date,''), date('now')),
                        'active',
                        COALESCE(c.created_at, strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                        strftime('%Y-%m-%d %H:%M:%S','now','localtime')
                 FROM cars c WHERE c.status='مبيوعة'",
                [],
            )?;
            conn.execute(
                "UPDATE cars
                 SET active_sale_id=(SELECT cs.id FROM car_sales cs
                                     WHERE cs.car_id=cars.id AND cs.status='active')
                 WHERE status='مبيوعة'",
                [],
            )?;

            conn.execute(
                "INSERT INTO installments
                 (operation_id, sale_id, customer_account_id, legacy_transaction_id,
                  due_date, currency, original_amount, current_amount, status)
                 SELECT cs.operation_id, cs.id, pt.account_id, pt.id,
                        COALESCE(pt.due_date,pt.date), COALESCE(pt.currency,'IQD'),
                        COALESCE(pt.original_amount,pt.amount),
                        COALESCE(pt.current_amount,pt.amount),
                        CASE WHEN COALESCE(pt.is_reversed,0)=1 THEN 'reversed'
                             WHEN COALESCE(pt.current_amount,pt.amount)='0' THEN 'paid'
                             ELSE 'unpaid' END
                 FROM partner_transactions pt
                 JOIN cars c ON c.car_number=pt.related_source_id
                 JOIN car_sales cs ON cs.car_id=c.id AND cs.status='active'
                 WHERE pt.source_type='customer_installment_schedule'
                   AND pt.source_role='installment_schedule'",
                [],
            )?;
            conn.execute(
                "UPDATE customer_installment_payment_events
                 SET sale_id_v2=(SELECT i.sale_id FROM installments i
                                WHERE i.legacy_transaction_id=customer_installment_payment_events.installment_id),
                     account_id=(SELECT i.customer_account_id FROM installments i
                                WHERE i.legacy_transaction_id=customer_installment_payment_events.installment_id),
                     operation_id=COALESCE(operation_id, event_uuid),
                     updated_at=COALESCE(updated_at,created_at)",
                [],
            )?;

            conn.execute("INSERT INTO db_version (version) VALUES (40)", [])?;
        }

        // Migration 41: complete the payment side of the numeric identity chain
        // without changing the already-defined v40 migration.
        if version < 41 {
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('customer_installment_payment_events')
                               WHERE name='installment_id_v2')",
                [], |row| row.get(0),
            )?;
            if !exists {
                conn.execute(
                    "ALTER TABLE customer_installment_payment_events ADD COLUMN installment_id_v2 INTEGER",
                    [],
                )?;
            }

            // Historical rows must resolve to exactly one numeric entity. A
            // missing match is just as unsafe as multiple matches: continuing
            // would bless a partially migrated database and future writes could
            // attach a payment to the wrong purchase cycle.
            let unresolved_schedule_ids: String = conn.query_row(
                "SELECT COALESCE(GROUP_CONCAT(pt.id), '')
                 FROM partner_transactions pt
                 WHERE pt.source_type='customer_installment_schedule'
                   AND pt.source_role='installment_schedule'
                   AND (SELECT COUNT(*) FROM installments i
                        WHERE i.legacy_transaction_id=pt.id) <> 1",
                [],
                |row| row.get(0),
            )?;
            if !unresolved_schedule_ids.is_empty() {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 41 stopped: installment rows have no unique numeric link: {unresolved_schedule_ids}"
                )));
            }

            let unresolved_payment_ids: String = conn.query_row(
                "SELECT COALESCE(GROUP_CONCAT(e.id), '')
                 FROM customer_installment_payment_events e
                 WHERE (SELECT COUNT(*) FROM installments i
                        WHERE i.legacy_transaction_id=e.installment_id) <> 1",
                [],
                |row| row.get(0),
            )?;
            if !unresolved_payment_ids.is_empty() {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 41 stopped: payment events have no unique installment link: {unresolved_payment_ids}"
                )));
            }

            conn.execute(
                "UPDATE customer_installment_payment_events
                 SET installment_id_v2=(SELECT i.id FROM installments i
                                        WHERE i.legacy_transaction_id=customer_installment_payment_events.installment_id)
                 WHERE installment_id_v2 IS NULL",
                [],
            )?;
            let incomplete_payment_links: i64 = conn.query_row(
                "SELECT COUNT(*) FROM customer_installment_payment_events
                 WHERE installment_id_v2 IS NULL OR sale_id_v2 IS NULL
                    OR account_id IS NULL OR operation_id IS NULL OR TRIM(operation_id)=''",
                [],
                |row| row.get(0),
            )?;
            if incomplete_payment_links != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 41 stopped: {incomplete_payment_links} payment events remain partially linked"
                )));
            }
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_payment_events_installment_v2
                 ON customer_installment_payment_events(installment_id_v2,status,id)",
                [],
            )?;
            conn.execute("INSERT INTO db_version (version) VALUES (41)", [])?;
        }

        // Migration 42: append-only reversal identity for financial deletes.
        if version < 42 {
            for (table, definition) in [
                ("expenses", "is_reversed INTEGER NOT NULL DEFAULT 0"),
                ("expenses", "reversal_operation_id TEXT"),
                ("expenses", "reverses_expense_id INTEGER"),
                ("partner_transactions", "reverses_transaction_id INTEGER"),
                ("operations", "reverses_operation_id TEXT"),
            ] {
                let column = definition.split_whitespace().next().unwrap_or_default();
                let exists: bool = conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name=?2)",
                    params![table, column],
                    |row| row.get(0),
                )?;
                if !exists {
                    conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {definition}"), [])?;
                }
            }
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_one_reversal
                 ON partner_transactions(reverses_transaction_id)
                 WHERE reverses_transaction_id IS NOT NULL",
                [],
            )?;
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_one_reversal
                 ON expenses(reverses_expense_id)
                 WHERE reverses_expense_id IS NOT NULL",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_expenses_active
                 ON expenses(is_reversed,id)",
                [],
            )?;
            conn.execute("INSERT INTO db_version (version) VALUES (42)", [])?;
        }

        // Migration 43: rebuild the payment-event table so the complete
        // operation/sale/account/installment chain is enforced by SQLite, not
        // merely by nullable metadata and application checks.
        if version < 43 {
            let operation_collision_count: i64 = conn.query_row(
                "SELECT COUNT(*)
                 FROM customer_installment_payment_events e
                 JOIN operations o ON o.id=e.operation_id
                 WHERE o.operation_type NOT IN ('customer_payment','customer_payment_reversal')",
                [],
                |row| row.get(0),
            )?;
            if operation_collision_count != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 43 stopped: {operation_collision_count} payment operation ids collide with another operation type"
                )));
            }
            conn.execute(
                "INSERT OR IGNORE INTO operations(id,operation_type,status)
                 SELECT DISTINCT operation_id,
                        CASE WHEN status='reversal' THEN 'customer_payment_reversal'
                             ELSE 'customer_payment' END,
                        CASE WHEN status='reversed' THEN 'reversed' ELSE 'active' END
                 FROM customer_installment_payment_events
                 WHERE operation_id IS NOT NULL AND TRIM(operation_id)<>''",
                [],
            )?;

            let invalid_chain_count: i64 = conn.query_row(
                "SELECT COUNT(*)
                 FROM customer_installment_payment_events e
                 LEFT JOIN operations o ON o.id=e.operation_id
                 LEFT JOIN car_sales s ON s.id=e.sale_id_v2
                 LEFT JOIN accounts a ON a.id=e.account_id
                 LEFT JOIN installments i ON i.id=e.installment_id_v2
                 WHERE o.id IS NULL OR s.id IS NULL OR a.id IS NULL OR i.id IS NULL
                    OR i.sale_id<>e.sale_id_v2 OR i.customer_account_id<>e.account_id",
                [],
                |row| row.get(0),
            )?;
            if invalid_chain_count != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 43 stopped: {invalid_chain_count} payment events have an invalid numeric identity chain"
                )));
            }

            conn.execute_batch(
                "DROP INDEX IF EXISTS idx_installment_events_installment;
                 DROP INDEX IF EXISTS idx_installment_events_sale;
                 DROP INDEX IF EXISTS idx_installment_one_active_event;
                 DROP INDEX IF EXISTS idx_payment_events_installment_v2;

                 CREATE TABLE customer_installment_payment_events_v43 (
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
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
                    reversed_at TEXT,
                    reversed_by_event_id INTEGER,
                    notes TEXT,
                    operation_id TEXT NOT NULL,
                    sale_id_v2 INTEGER NOT NULL,
                    account_id INTEGER NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
                    updated_at TEXT,
                    installment_id_v2 INTEGER NOT NULL,
                    FOREIGN KEY(operation_id) REFERENCES operations(id) ON DELETE RESTRICT,
                    FOREIGN KEY(sale_id_v2) REFERENCES car_sales(id) ON DELETE RESTRICT,
                    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
                    FOREIGN KEY(installment_id_v2) REFERENCES installments(id) ON DELETE RESTRICT,
                    FOREIGN KEY(reversed_by_event_id)
                        REFERENCES customer_installment_payment_events_v43(id) ON DELETE RESTRICT
                 );

                 INSERT INTO customer_installment_payment_events_v43
                 (id,event_uuid,customer_id,sale_id,installment_id,currency,
                  scheduled_amount_at_payment_time,actual_paid_amount,difference_amount,
                  status,ledger_batch_id,created_at,reversed_at,reversed_by_event_id,notes,
                  operation_id,sale_id_v2,account_id,version,updated_at,installment_id_v2)
                 SELECT id,event_uuid,customer_id,sale_id,installment_id,currency,
                        scheduled_amount_at_payment_time,actual_paid_amount,difference_amount,
                        status,ledger_batch_id,created_at,reversed_at,reversed_by_event_id,notes,
                        operation_id,sale_id_v2,account_id,version,updated_at,installment_id_v2
                 FROM customer_installment_payment_events ORDER BY id;

                 DROP TABLE customer_installment_payment_events;
                 ALTER TABLE customer_installment_payment_events_v43
                    RENAME TO customer_installment_payment_events;

                 CREATE INDEX idx_installment_events_installment
                    ON customer_installment_payment_events(installment_id,status);
                 CREATE INDEX idx_installment_events_sale
                    ON customer_installment_payment_events(sale_id,currency,status,created_at,id);
                 CREATE UNIQUE INDEX idx_installment_one_active_event
                    ON customer_installment_payment_events(installment_id) WHERE status='active';
                 CREATE INDEX idx_payment_events_installment_v2
                    ON customer_installment_payment_events(installment_id_v2,status,id);",
            )?;

            let integrity: String =
                conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
            if integrity != "ok" {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 43 integrity_check failed: {integrity}"
                )));
            }
            let foreign_key_violations: i64 =
                conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })?;
            if foreign_key_violations != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 43 foreign_key_check failed: {foreign_key_violations} violations"
                )));
            }
            conn.execute("INSERT INTO db_version(version) VALUES (43)", [])?;
        }

        // Migration 44: agency-transaction cancellation is append-only and all
        // runtime links are enforced by SQLite foreign keys.
        if version < 44 {
            let invalid_operation_ids: Option<String> = conn.query_row(
                "SELECT GROUP_CONCAT(id, ',') FROM (
                    SELECT at.id
                    FROM agency_transactions at
                    LEFT JOIN operations o ON o.id=at.operation_id
                    WHERE at.operation_id IS NULL OR TRIM(at.operation_id)='' OR o.id IS NULL
                    ORDER BY at.id LIMIT 20
                 )",
                [],
                |row| row.get(0),
            )?;
            if let Some(ids) = invalid_operation_ids {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 44 stopped: agency_transactions have missing or invalid operation_id values; ids={ids}"
                )));
            }
            let orphan_agency_ids: Option<String> = conn.query_row(
                "SELECT GROUP_CONCAT(id, ',') FROM (
                    SELECT at.id FROM agency_transactions at
                    LEFT JOIN agencies a ON a.id=at.agency_id
                    WHERE a.id IS NULL ORDER BY at.id LIMIT 20
                 )",
                [],
                |row| row.get(0),
            )?;
            if let Some(ids) = orphan_agency_ids {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 44 stopped: agency_transactions have orphan agency_id values; ids={ids}"
                )));
            }

            conn.execute_batch(
                "DROP INDEX IF EXISTS idx_agency_transactions_creation_token;
                 DROP INDEX IF EXISTS idx_agency_tx_creation_token;

                 CREATE TABLE agency_transactions_v44 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agency_id INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    time TEXT NOT NULL DEFAULT '00:00',
                    type_ TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    currency TEXT DEFAULT 'IQD',
                    notes TEXT,
                    creation_token TEXT,
                    operation_id TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
                    updated_at TEXT,
                    status TEXT NOT NULL DEFAULT 'active'
                        CHECK(status IN ('active','reversed','reversal','cancelled')),
                    reversed_at TEXT,
                    reverses_agency_transaction_id INTEGER UNIQUE,
                    reversal_operation_id TEXT,
                    FOREIGN KEY(operation_id) REFERENCES operations(id) ON DELETE RESTRICT,
                    FOREIGN KEY(agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
                    FOREIGN KEY(reverses_agency_transaction_id)
                        REFERENCES agency_transactions_v44(id) ON DELETE RESTRICT,
                    FOREIGN KEY(reversal_operation_id)
                        REFERENCES operations(id) ON DELETE RESTRICT
                 );

                 INSERT INTO agency_transactions_v44
                 (id,agency_id,date,time,type_,amount,currency,notes,creation_token,
                  operation_id,version,updated_at,status)
                 SELECT id,agency_id,date,time,type_,amount,currency,notes,creation_token,
                        operation_id,version,updated_at,'active'
                 FROM agency_transactions ORDER BY id;

                 DROP TABLE agency_transactions;
                 ALTER TABLE agency_transactions_v44 RENAME TO agency_transactions;
                 CREATE UNIQUE INDEX idx_agency_transactions_creation_token
                    ON agency_transactions(creation_token) WHERE creation_token IS NOT NULL;
                 CREATE INDEX idx_agency_transactions_active
                    ON agency_transactions(agency_id,status,id);",
            )?;

            for definition in [
                "is_reversed INTEGER NOT NULL DEFAULT 0",
                "reverses_car_expense_id INTEGER",
                "reversal_operation_id TEXT",
            ] {
                let column = definition.split_whitespace().next().unwrap_or_default();
                let exists: bool = conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_table_info('car_expenses') WHERE name=?1)",
                    [column],
                    |row| row.get(0),
                )?;
                if !exists {
                    conn.execute(
                        &format!("ALTER TABLE car_expenses ADD COLUMN {definition}"),
                        [],
                    )?;
                }
            }
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_car_expenses_one_reversal
                 ON car_expenses(reverses_car_expense_id)
                 WHERE reverses_car_expense_id IS NOT NULL",
                [],
            )?;

            let has_car_partner_car_id: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('car_partners') WHERE name='car_id')",
                [],
                |row| row.get(0),
            )?;
            if !has_car_partner_car_id {
                conn.execute("ALTER TABLE car_partners ADD COLUMN car_id INTEGER", [])?;
            }
            conn.execute(
                "UPDATE car_partners
                 SET car_id=(SELECT c.id FROM cars c WHERE c.car_number=car_partners.car_number)
                 WHERE car_id IS NULL",
                [],
            )?;
            let orphan_car_partners: Option<String> = conn.query_row(
                "SELECT GROUP_CONCAT(rowid, ',') FROM (
                    SELECT rowid FROM car_partners WHERE car_id IS NULL ORDER BY rowid LIMIT 20
                 )",
                [],
                |row| row.get(0),
            )?;
            if let Some(ids) = orphan_car_partners {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 44 stopped: car_partners have ambiguous or missing car links; rowids={ids}"
                )));
            }
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_car_partners_car_id ON car_partners(car_id)",
                [],
            )?;
            conn.execute(
                "UPDATE expenses
                 SET car_id=(SELECT c.id FROM cars c WHERE c.car_number=expenses.car_number)
                 WHERE car_id IS NULL AND TRIM(COALESCE(car_number,''))<>''",
                [],
            )?;
            let orphan_expense_car_links: Option<String> = conn.query_row(
                "SELECT GROUP_CONCAT(id, ',') FROM (
                    SELECT id FROM expenses
                    WHERE car_id IS NULL AND TRIM(COALESCE(car_number,''))<>''
                    ORDER BY id LIMIT 20
                 )",
                [],
                |row| row.get(0),
            )?;
            if let Some(ids) = orphan_expense_car_links {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 44 stopped: expenses have ambiguous car links; ids={ids}"
                )));
            }
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_expenses_car_id ON expenses(car_id)",
                [],
            )?;
            conn.execute_batch(
                "DROP TRIGGER IF EXISTS trg_cars_assign_numeric_id;
                 CREATE TRIGGER trg_cars_assign_numeric_id
                 AFTER INSERT ON cars
                 WHEN NEW.id IS NULL
                 BEGIN
                    UPDATE cars
                    SET id=(SELECT COALESCE(MAX(id),0)+1 FROM cars WHERE rowid<>NEW.rowid)
                    WHERE rowid=NEW.rowid;
                 END;",
            )?;

            let integrity: String =
                conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
            if integrity != "ok" {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 44 integrity_check failed: {integrity}"
                )));
            }
            let foreign_key_violations: i64 =
                conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })?;
            if foreign_key_violations != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 44 foreign_key_check failed: {foreign_key_violations} violations"
                )));
            }
            conn.execute("INSERT INTO db_version(version) VALUES (44)", [])?;
        }

        // Migration 45: rebuild the remaining car/expense ownership tables so
        // numeric links are enforced by SQLite rather than by indexes alone.
        if version < 45 {
            conn.execute(
                "INSERT OR IGNORE INTO operations(id,operation_type,status)
                 SELECT 'legacy-expense-' || id,'expense_creation',
                        CASE WHEN COALESCE(is_reversed,0)=1 THEN 'reversed' ELSE 'active' END
                 FROM expenses WHERE operation_id IS NULL OR TRIM(operation_id)=''",
                [],
            )?;
            conn.execute(
                "UPDATE expenses SET operation_id='legacy-expense-' || id
                 WHERE operation_id IS NULL OR TRIM(operation_id)=''",
                [],
            )?;
            conn.execute(
                "INSERT OR IGNORE INTO operations(id,operation_type,status)
                 SELECT 'legacy-car-expense-' || id,'car_expense_creation',
                        CASE WHEN COALESCE(is_reversed,0)=1 THEN 'reversed' ELSE 'active' END
                 FROM car_expenses WHERE operation_id IS NULL OR TRIM(operation_id)=''",
                [],
            )?;
            conn.execute(
                "UPDATE car_expenses SET operation_id='legacy-car-expense-' || id
                 WHERE operation_id IS NULL OR TRIM(operation_id)=''",
                [],
            )?;

            for (label, query) in [
                (
                    "car_expenses.car_id",
                    "SELECT GROUP_CONCAT(id, ',') FROM (
                        SELECT id FROM car_expenses ce
                        WHERE ce.car_id IS NULL OR NOT EXISTS(
                            SELECT 1 FROM cars c WHERE c.id=ce.car_id)
                        ORDER BY id LIMIT 20)",
                ),
                (
                    "car_partners.car_id",
                    "SELECT GROUP_CONCAT(rowid, ',') FROM (
                        SELECT rowid FROM car_partners cp
                        WHERE cp.car_id IS NULL OR NOT EXISTS(
                            SELECT 1 FROM cars c WHERE c.id=cp.car_id)
                        ORDER BY rowid LIMIT 20)",
                ),
                (
                    "expenses.car_id",
                    "SELECT GROUP_CONCAT(id, ',') FROM (
                        SELECT id FROM expenses e
                        WHERE e.car_id IS NOT NULL AND NOT EXISTS(
                            SELECT 1 FROM cars c WHERE c.id=e.car_id)
                        ORDER BY id LIMIT 20)",
                ),
            ] {
                let invalid: Option<String> = conn.query_row(query, [], |row| row.get(0))?;
                if let Some(ids) = invalid {
                    return Err(rusqlite::Error::InvalidParameterName(format!(
                        "Migration 45 stopped: invalid {label} links; ids={ids}"
                    )));
                }
            }

            conn.execute_batch(
                "CREATE TABLE expenses_v45 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    date TEXT NOT NULL,
                    time TEXT DEFAULT '00:00',
                    notes TEXT,
                    currency TEXT DEFAULT 'IQD',
                    source_type TEXT,
                    source_id TEXT,
                    source_role TEXT,
                    car_number TEXT,
                    car_id INTEGER,
                    creation_token TEXT,
                    operation_id TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
                    updated_at TEXT,
                    is_reversed INTEGER NOT NULL DEFAULT 0 CHECK(is_reversed IN (0,1)),
                    reversal_operation_id TEXT,
                    reverses_expense_id INTEGER UNIQUE,
                    FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE RESTRICT,
                    FOREIGN KEY(operation_id) REFERENCES operations(id) ON DELETE RESTRICT,
                    FOREIGN KEY(reversal_operation_id) REFERENCES operations(id) ON DELETE RESTRICT,
                    FOREIGN KEY(reverses_expense_id) REFERENCES expenses_v45(id) ON DELETE RESTRICT
                 );
                 INSERT INTO expenses_v45
                 (id,description,amount,date,time,notes,currency,source_type,source_id,
                  source_role,car_number,car_id,creation_token,operation_id,version,
                  updated_at,is_reversed,reversal_operation_id,reverses_expense_id)
                 SELECT id,description,amount,date,time,notes,currency,source_type,source_id,
                        source_role,car_number,car_id,creation_token,operation_id,version,
                        updated_at,is_reversed,reversal_operation_id,reverses_expense_id
                 FROM expenses ORDER BY id;
                 DROP TABLE expenses;
                 ALTER TABLE expenses_v45 RENAME TO expenses;
                 CREATE INDEX idx_expenses_source ON expenses(source_type,source_id,source_role);
                 CREATE UNIQUE INDEX idx_expenses_creation_token
                    ON expenses(creation_token) WHERE creation_token IS NOT NULL;
                 CREATE INDEX idx_expenses_active ON expenses(is_reversed,id);
                 CREATE INDEX idx_expenses_car_id ON expenses(car_id);

                 CREATE TABLE car_expenses_v45 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    car_number TEXT NOT NULL,
                    description TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    date TEXT NOT NULL,
                    currency TEXT DEFAULT 'IQD',
                    time TEXT DEFAULT (strftime('%H:%M','now','localtime')),
                    creation_token TEXT,
                    car_id INTEGER NOT NULL,
                    operation_id TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
                    updated_at TEXT,
                    is_reversed INTEGER NOT NULL DEFAULT 0 CHECK(is_reversed IN (0,1)),
                    reverses_car_expense_id INTEGER UNIQUE,
                    reversal_operation_id TEXT,
                    FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE RESTRICT,
                    FOREIGN KEY(operation_id) REFERENCES operations(id) ON DELETE RESTRICT,
                    FOREIGN KEY(reversal_operation_id) REFERENCES operations(id) ON DELETE RESTRICT,
                    FOREIGN KEY(reverses_car_expense_id)
                        REFERENCES car_expenses_v45(id) ON DELETE RESTRICT
                 );
                 INSERT INTO car_expenses_v45
                 (id,car_number,description,amount,date,currency,time,creation_token,
                  car_id,operation_id,version,updated_at,is_reversed,
                  reverses_car_expense_id,reversal_operation_id)
                 SELECT id,car_number,description,amount,date,currency,time,creation_token,
                        car_id,operation_id,version,updated_at,is_reversed,
                        reverses_car_expense_id,reversal_operation_id
                 FROM car_expenses ORDER BY id;
                 DROP TABLE car_expenses;
                 ALTER TABLE car_expenses_v45 RENAME TO car_expenses;
                 CREATE UNIQUE INDEX idx_car_expenses_creation_token
                    ON car_expenses(creation_token) WHERE creation_token IS NOT NULL;
                 CREATE UNIQUE INDEX idx_car_expenses_one_reversal
                    ON car_expenses(reverses_car_expense_id)
                    WHERE reverses_car_expense_id IS NOT NULL;
                 CREATE INDEX idx_car_expenses_car_id ON car_expenses(car_id,is_reversed,id);

                 CREATE TABLE car_partners_v45 (
                    car_id INTEGER NOT NULL,
                    car_number TEXT NOT NULL,
                    partner_name TEXT NOT NULL,
                    amount TEXT NOT NULL,
                    currency TEXT NOT NULL DEFAULT 'IQD',
                    kind TEXT NOT NULL DEFAULT 'شريك',
                    PRIMARY KEY(car_id,partner_name),
                    FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE RESTRICT
                 );
                 INSERT INTO car_partners_v45
                 (car_id,car_number,partner_name,amount,currency,kind)
                 SELECT car_id,car_number,partner_name,amount,currency,kind
                 FROM car_partners ORDER BY car_id,partner_name;
                 DROP TABLE car_partners;
                 ALTER TABLE car_partners_v45 RENAME TO car_partners;
                 CREATE INDEX idx_car_partners_car_id ON car_partners(car_id);",
            )?;

            let integrity: String =
                conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
            if integrity != "ok" {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 45 integrity_check failed: {integrity}"
                )));
            }
            let foreign_key_violations: i64 =
                conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })?;
            if foreign_key_violations != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 45 foreign_key_check failed: {foreign_key_violations} violations"
                )));
            }
            conn.execute("INSERT INTO db_version(version) VALUES (45)", [])?;
        }

        if version < 46 {
            // Runtime financial history is append-only from v46 onward. Reversal
            // rows remain queryable, while deduplication applies only to active
            // originals so a corrected projection can be posted after reversal.
            for (table, column) in [
                ("financial_ledger", "status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','reversed','superseded'))"),
                ("financial_ledger", "supersedes_ledger_id INTEGER"),
                ("financial_ledger", "reason TEXT"),
                ("financial_ledger", "created_at TEXT"),
                ("partner_transactions", "status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','reversed','superseded'))"),
                ("partner_transactions", "supersedes_transaction_id INTEGER"),
                ("partner_transactions", "reason TEXT"),
                ("partner_transactions", "created_at TEXT"),
                ("audit_log", "occurred_at TEXT"),
                ("audit_log", "entity_id_numeric INTEGER"),
                ("audit_log", "session_fingerprint TEXT"),
                ("audit_log", "request_id TEXT"),
                ("audit_log", "old_values_json TEXT"),
                ("audit_log", "new_values_json TEXT"),
                ("audit_log", "reason TEXT"),
                ("audit_log", "schema_version INTEGER NOT NULL DEFAULT 46"),
                ("audit_log", "legacy_payload TEXT"),
            ] {
                ignore_dup(conn.execute(
                    &format!("ALTER TABLE {table} ADD COLUMN {column}"),
                    [],
                ))?;
            }

            conn.execute_batch(
                "UPDATE partner_transactions
                    SET status=CASE WHEN COALESCE(is_reversed,0)=1 THEN 'reversed' ELSE 'active' END;
                 UPDATE financial_ledger SET status=COALESCE(status,'active');
                 DROP INDEX IF EXISTS idx_partner_tx_source_unique;
                 CREATE UNIQUE INDEX idx_partner_tx_source_unique
                    ON partner_transactions(source_type,source_id,source_role,partner_name,kind,currency,
                                            COALESCE(related_source_id,''))
                    WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND source_role IS NOT NULL
                      AND source_type!='' AND source_id!='' AND source_role!=''
                      AND COALESCE(is_reversed,0)=0 AND reverses_transaction_id IS NULL;
                 CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_supersedes_unique
                    ON financial_ledger(supersedes_ledger_id) WHERE supersedes_ledger_id IS NOT NULL;
                 CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_supersedes_unique
                    ON partner_transactions(supersedes_transaction_id)
                    WHERE supersedes_transaction_id IS NOT NULL;
                 CREATE TRIGGER IF NOT EXISTS trg_financial_ledger_no_delete
                    BEFORE DELETE ON financial_ledger
                    BEGIN SELECT RAISE(ABORT,'financial_ledger is append-only'); END;
                 CREATE TRIGGER IF NOT EXISTS trg_partner_transactions_no_delete
                    BEFORE DELETE ON partner_transactions
                    BEGIN SELECT RAISE(ABORT,'partner_transactions is append-only'); END;
                 CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_update
                    BEFORE UPDATE ON audit_log
                    BEGIN SELECT RAISE(ABORT,'audit_log is immutable'); END;
                 CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_delete
                    BEFORE DELETE ON audit_log
                    BEGIN SELECT RAISE(ABORT,'audit_log is append-only'); END;",
            )?;
            conn.execute("INSERT INTO db_version(version) VALUES (46)", [])?;
        }

        if version < 47 {
            // Preserve old audit rows exactly as legacy evidence, then require
            // every new row to use the authenticated structured writer. JSON
            // snapshots remain nullable because inventing unavailable history
            // would make the audit trail misleading.
            conn.execute_batch(
                "DROP TRIGGER IF EXISTS trg_audit_log_no_update;
                 UPDATE audit_log
                 SET legacy_payload=json_object(
                    'date',date,'time',time,'actor',actor,'action',action,
                    'entity_type',entity_type,'entity_id',entity_id,
                    'description',description,'notes',notes
                 )
                 WHERE legacy_payload IS NULL
                   AND old_values_json IS NULL AND new_values_json IS NULL;
                 UPDATE audit_log
                 SET occurred_at=COALESCE(occurred_at,date || 'T' || time),
                     entity_id_numeric=CASE
                        WHEN entity_id_numeric IS NOT NULL THEN entity_id_numeric
                        WHEN entity_id<>'' AND entity_id NOT GLOB '*[^0-9]*'
                            THEN CAST(entity_id AS INTEGER)
                        ELSE NULL
                     END;
                 DROP TRIGGER IF EXISTS trg_audit_log_structured_insert;
                 CREATE TRIGGER trg_audit_log_structured_insert
                 BEFORE INSERT ON audit_log
                 WHEN NEW.actor_user_id IS NULL
                   OR TRIM(COALESCE(NEW.entity_type,''))=''
                   OR TRIM(COALESCE(NEW.action,''))=''
                   OR TRIM(COALESCE(NEW.occurred_at,''))=''
                   OR (NEW.old_values_json IS NOT NULL AND json_valid(NEW.old_values_json)=0)
                   OR (NEW.new_values_json IS NOT NULL AND json_valid(NEW.new_values_json)=0)
                   OR (NEW.session_id IS NOT NULL AND (
                        length(NEW.session_id)<>64
                        OR lower(NEW.session_id) GLOB '*[^0-9a-f]*'
                   ))
                 BEGIN
                    SELECT RAISE(ABORT,'audit event is incomplete or contains a raw session');
                 END;
                 CREATE TRIGGER trg_audit_log_no_update
                 BEFORE UPDATE ON audit_log
                 BEGIN
                    SELECT RAISE(ABORT,'audit_log is immutable');
                 END;",
            )?;
            conn.execute("INSERT INTO db_version(version) VALUES (47)", [])?;
        }

        if version < 48 {
            // Posted ledger values and source identity are immutable. Runtime
            // may still enrich correlation metadata (operation/batch/numeric
            // account links) without rewriting the accounting fact itself.
            conn.execute_batch(
                "DROP TRIGGER IF EXISTS trg_financial_ledger_core_immutable;
                 CREATE TRIGGER trg_financial_ledger_core_immutable
                 BEFORE UPDATE OF date,time,account_type,debit,credit,currency,
                                  reference_type,reference_id,type_
                 ON financial_ledger
                 WHEN NEW.date<>OLD.date
                   OR NEW.time<>OLD.time
                   OR NEW.account_type<>OLD.account_type
                   OR NEW.debit<>OLD.debit
                   OR NEW.credit<>OLD.credit
                   OR NEW.currency<>OLD.currency
                   OR NEW.reference_type<>OLD.reference_type
                   OR NEW.reference_id<>OLD.reference_id
                   OR NEW.type_<>OLD.type_
                 BEGIN
                    SELECT RAISE(ABORT,'posted ledger core is immutable; append a reversal');
                 END;
                 DROP TRIGGER IF EXISTS trg_audit_log_structured_insert;
                 CREATE TRIGGER trg_audit_log_structured_insert
                 BEFORE INSERT ON audit_log
                 WHEN NEW.actor_user_id IS NULL
                   OR TRIM(COALESCE(NEW.entity_type,''))=''
                   OR TRIM(COALESCE(NEW.action,''))=''
                   OR TRIM(COALESCE(NEW.occurred_at,''))=''
                   OR NEW.schema_version<>48
                   OR (NEW.old_values_json IS NOT NULL AND json_valid(NEW.old_values_json)=0)
                   OR (NEW.new_values_json IS NOT NULL AND json_valid(NEW.new_values_json)=0)
                   OR (NEW.session_id IS NOT NULL AND (
                        length(NEW.session_id)<>64
                        OR lower(NEW.session_id) GLOB '*[^0-9a-f]*'
                   ))
                   OR (NEW.session_fingerprint IS NOT NULL AND (
                        length(NEW.session_fingerprint)<>64
                        OR lower(NEW.session_fingerprint) GLOB '*[^0-9a-f]*'
                   ))
                   OR COALESCE(NEW.session_id,'')<>COALESCE(NEW.session_fingerprint,'')
                 BEGIN
                    SELECT RAISE(ABORT,'audit event is incomplete or contains a raw session');
                 END;",
            )?;
            conn.execute("INSERT INTO db_version(version) VALUES (48)", [])?;
        }

        if version < 49 {
            // Canonical accounting identity is numeric from v49 onward. The old
            // TEXT columns remain only as legacy/display payloads; every active
            // accounting row is linked through the INTEGER mirror below.
            for (table, column) in [
                ("partner_transactions", "source_entity_id INTEGER"),
                ("partner_transactions", "related_entity_id INTEGER"),
                ("financial_ledger", "reference_entity_id INTEGER"),
            ] {
                ignore_dup(conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column}"), []))?;
            }

            conn.execute_batch(
                "UPDATE partner_transactions
                 SET source_entity_id=CASE
                    WHEN source_type='customer_installment_schedule' THEN
                        (SELECT i.id FROM installments i WHERE i.legacy_transaction_id=partner_transactions.id)
                    WHEN TRIM(COALESCE(source_id,''))<>''
                         AND source_id NOT GLOB '*[^0-9]*' THEN CAST(source_id AS INTEGER)
                    WHEN source_type IN ('car_purchase','car_sale') THEN
                        (SELECT c.id FROM cars c WHERE c.car_number=partner_transactions.source_id)
                    WHEN source_type='customer_sale_payment'
                         AND source_id GLOB '[0-9]*:down_payment' THEN
                        CAST(substr(source_id,1,instr(source_id,':')-1) AS INTEGER)
                    ELSE NULL
                 END
                 WHERE source_entity_id IS NULL;

                 UPDATE partner_transactions
                 SET related_entity_id=CASE
                    WHEN TRIM(COALESCE(related_source_id,''))<>''
                         AND related_source_id NOT GLOB '*[^0-9]*'
                        THEN CAST(related_source_id AS INTEGER)
                    WHEN related_source_type='car' THEN
                        (SELECT c.id FROM cars c WHERE c.car_number=partner_transactions.related_source_id)
                    ELSE NULL
                 END
                 WHERE related_entity_id IS NULL;

                 UPDATE financial_ledger
                 SET reference_entity_id=CASE
                    WHEN TRIM(COALESCE(reference_id,''))<>''
                         AND reference_id NOT GLOB '*[^0-9]*' THEN CAST(reference_id AS INTEGER)
                    WHEN reference_type='car' THEN
                        (SELECT c.id FROM cars c WHERE c.car_number=financial_ledger.reference_id)
                    ELSE NULL
                 END
                 WHERE reference_entity_id IS NULL;

                 DROP INDEX IF EXISTS idx_partner_tx_source_unique;
                 CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_numeric_source_unique
                    ON partner_transactions(
                        source_type,source_entity_id,source_role,partner_name,kind,currency,
                        COALESCE(related_entity_id,-1)
                    )
                    WHERE source_type IS NOT NULL AND source_entity_id IS NOT NULL
                      AND source_role IS NOT NULL AND source_type<>'' AND source_role<>''
                      AND COALESCE(is_reversed,0)=0 AND reverses_transaction_id IS NULL;
                 CREATE INDEX IF NOT EXISTS idx_partner_tx_numeric_source
                    ON partner_transactions(source_type,source_entity_id,source_role);
                 CREATE INDEX IF NOT EXISTS idx_partner_tx_numeric_related
                    ON partner_transactions(related_source_type,related_entity_id);
                 CREATE INDEX IF NOT EXISTS idx_ledger_numeric_reference
                    ON financial_ledger(reference_type,reference_entity_id);

                 DROP TRIGGER IF EXISTS trg_partner_tx_sync_numeric_identity_insert;
                 CREATE TRIGGER trg_partner_tx_sync_numeric_identity_insert
                 AFTER INSERT ON partner_transactions
                 BEGIN
                    UPDATE partner_transactions
                    SET source_entity_id=COALESCE(NEW.source_entity_id,CASE
                            WHEN TRIM(COALESCE(NEW.source_id,''))<>''
                                 AND NEW.source_id NOT GLOB '*[^0-9]*'
                                THEN CAST(NEW.source_id AS INTEGER)
                            WHEN NEW.source_type IN ('car_purchase','car_sale') THEN
                                (SELECT id FROM cars WHERE car_number=NEW.source_id)
                            WHEN NEW.source_type='customer_sale_payment'
                                 AND NEW.source_id GLOB '[0-9]*:down_payment' THEN
                                CAST(substr(NEW.source_id,1,instr(NEW.source_id,':')-1) AS INTEGER)
                            ELSE NULL END),
                        related_entity_id=COALESCE(NEW.related_entity_id,CASE
                            WHEN TRIM(COALESCE(NEW.related_source_id,''))<>''
                                 AND NEW.related_source_id NOT GLOB '*[^0-9]*'
                                THEN CAST(NEW.related_source_id AS INTEGER)
                            WHEN NEW.related_source_type='car' THEN
                                (SELECT id FROM cars WHERE car_number=NEW.related_source_id)
                            ELSE NULL END)
                    WHERE id=NEW.id;
                 END;

                 DROP TRIGGER IF EXISTS trg_partner_tx_sync_numeric_identity_update;
                 CREATE TRIGGER trg_partner_tx_sync_numeric_identity_update
                 AFTER UPDATE OF source_type,source_id,related_source_type,related_source_id
                 ON partner_transactions
                 BEGIN
                    UPDATE partner_transactions
                    SET source_entity_id=CASE
                            WHEN TRIM(COALESCE(NEW.source_id,''))<>''
                                 AND NEW.source_id NOT GLOB '*[^0-9]*'
                                THEN CAST(NEW.source_id AS INTEGER)
                            WHEN NEW.source_type IN ('car_purchase','car_sale') THEN
                                (SELECT id FROM cars WHERE car_number=NEW.source_id)
                            WHEN NEW.source_type='customer_sale_payment'
                                 AND NEW.source_id GLOB '[0-9]*:down_payment' THEN
                                CAST(substr(NEW.source_id,1,instr(NEW.source_id,':')-1) AS INTEGER)
                            ELSE source_entity_id END,
                        related_entity_id=CASE
                            WHEN TRIM(COALESCE(NEW.related_source_id,''))<>''
                                 AND NEW.related_source_id NOT GLOB '*[^0-9]*'
                                THEN CAST(NEW.related_source_id AS INTEGER)
                            WHEN NEW.related_source_type='car' THEN
                                (SELECT id FROM cars WHERE car_number=NEW.related_source_id)
                            ELSE related_entity_id END
                    WHERE id=NEW.id;
                 END;

                 DROP TRIGGER IF EXISTS trg_ledger_sync_numeric_identity_insert;
                 CREATE TRIGGER trg_ledger_sync_numeric_identity_insert
                 AFTER INSERT ON financial_ledger
                 BEGIN
                    UPDATE financial_ledger
                    SET reference_entity_id=COALESCE(NEW.reference_entity_id,CASE
                        WHEN TRIM(COALESCE(NEW.reference_id,''))<>''
                             AND NEW.reference_id NOT GLOB '*[^0-9]*'
                            THEN CAST(NEW.reference_id AS INTEGER)
                        WHEN NEW.reference_type='car' THEN
                            (SELECT id FROM cars WHERE car_number=NEW.reference_id)
                        ELSE NULL END)
                    WHERE id=NEW.id;
                 END;

                 DROP TRIGGER IF EXISTS trg_installments_sync_schedule_identity_insert;
                 CREATE TRIGGER trg_installments_sync_schedule_identity_insert
                 AFTER INSERT ON installments
                 BEGIN
                    UPDATE partner_transactions
                    SET source_entity_id=NEW.id,
                        source_id=CAST(NEW.id AS TEXT)
                    WHERE id=NEW.legacy_transaction_id
                      AND source_type='customer_installment_schedule';
                 END;

                 DROP TRIGGER IF EXISTS trg_installments_sync_schedule_identity_update;
                 CREATE TRIGGER trg_installments_sync_schedule_identity_update
                 AFTER UPDATE OF legacy_transaction_id ON installments
                 BEGIN
                    UPDATE partner_transactions
                    SET source_entity_id=NEW.id,
                        source_id=CAST(NEW.id AS TEXT)
                    WHERE id=NEW.legacy_transaction_id
                      AND source_type='customer_installment_schedule';
                 END;

                 UPDATE partner_transactions
                 SET source_id=CAST(source_entity_id AS TEXT)
                 WHERE source_type='customer_installment_schedule'
                   AND source_entity_id IS NOT NULL;

                 DROP TRIGGER IF EXISTS trg_financial_ledger_core_immutable;
                 CREATE TRIGGER trg_financial_ledger_core_immutable
                 BEFORE UPDATE OF date,time,account_type,debit,credit,currency,
                                  reference_type,reference_id,reference_entity_id,type_
                 ON financial_ledger
                 WHEN NEW.date<>OLD.date
                   OR NEW.time<>OLD.time
                   OR NEW.account_type<>OLD.account_type
                   OR NEW.debit<>OLD.debit
                   OR NEW.credit<>OLD.credit
                   OR NEW.currency<>OLD.currency
                   OR NEW.reference_type<>OLD.reference_type
                   OR NEW.reference_id<>OLD.reference_id
                   OR (OLD.reference_entity_id IS NOT NULL
                       AND NEW.reference_entity_id<>OLD.reference_entity_id)
                   OR NEW.type_<>OLD.type_
                 BEGIN
                    SELECT RAISE(ABORT,'posted ledger core is immutable; append a reversal');
                 END;

                 DROP TRIGGER IF EXISTS trg_audit_log_structured_insert;
                 CREATE TRIGGER trg_audit_log_structured_insert
                 BEFORE INSERT ON audit_log
                 WHEN NEW.actor_user_id IS NULL
                   OR TRIM(COALESCE(NEW.entity_type,''))=''
                   OR TRIM(COALESCE(NEW.action,''))=''
                   OR TRIM(COALESCE(NEW.occurred_at,''))=''
                   OR NEW.schema_version<>49
                   OR (NEW.old_values_json IS NOT NULL AND json_valid(NEW.old_values_json)=0)
                   OR (NEW.new_values_json IS NOT NULL AND json_valid(NEW.new_values_json)=0)
                   OR (NEW.session_id IS NOT NULL AND (
                        length(NEW.session_id)<>64 OR lower(NEW.session_id) GLOB '*[^0-9a-f]*'))
                   OR (NEW.session_fingerprint IS NOT NULL AND (
                        length(NEW.session_fingerprint)<>64
                        OR lower(NEW.session_fingerprint) GLOB '*[^0-9a-f]*'))
                   OR COALESCE(NEW.session_id,'')<>COALESCE(NEW.session_fingerprint,'')
                 BEGIN
                    SELECT RAISE(ABORT,'audit event is incomplete or contains a raw session');
                 END;"
            )?;

            for (label, query) in [
                (
                    "partner_transactions.source_entity_id",
                    "SELECT GROUP_CONCAT(id, ',') FROM (
                        SELECT id FROM partner_transactions
                        WHERE TRIM(COALESCE(source_type,''))<>''
                          AND COALESCE(is_reversed,0)=0
                          AND source_entity_id IS NULL ORDER BY id LIMIT 20)",
                ),
                (
                    "partner_transactions.related_entity_id",
                    "SELECT GROUP_CONCAT(id, ',') FROM (
                        SELECT id FROM partner_transactions
                        WHERE TRIM(COALESCE(related_source_type,''))<>''
                          AND COALESCE(is_reversed,0)=0
                          AND related_entity_id IS NULL ORDER BY id LIMIT 20)",
                ),
                (
                    "financial_ledger.reference_entity_id",
                    "SELECT GROUP_CONCAT(id, ',') FROM (
                        SELECT id FROM financial_ledger
                        WHERE TRIM(COALESCE(reference_type,''))<>''
                          AND COALESCE(status,'active')='active'
                          AND reference_entity_id IS NULL ORDER BY id LIMIT 20)",
                ),
            ] {
                let invalid: Option<String> = conn.query_row(query, [], |row| row.get(0))?;
                if let Some(ids) = invalid {
                    return Err(rusqlite::Error::InvalidParameterName(format!(
                        "Migration 49 stopped: unresolved numeric {label}; ids={ids}"
                    )));
                }
            }

            let integrity: String =
                conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
            if integrity != "ok" {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 49 integrity_check failed: {integrity}"
                )));
            }
            let foreign_key_violations: i64 =
                conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })?;
            if foreign_key_violations != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 49 foreign_key_check failed: {foreign_key_violations} violations"
                )));
            }
            conn.execute("INSERT INTO db_version(version) VALUES (49)", [])?;
        }

        // Migration 50: the v36 no-double-sell trigger fired on every update
        // that kept status='مبيوعة', which blocked legitimate edits to sold
        // vehicle specifications and purchase cost. A sale is identified by
        // active_sale_id/car_sales, not by reassigning the same status value.
        if version < 50 {
            conn.execute_batch(
                "DROP TRIGGER IF EXISTS trg_cars_no_double_sell;
                 CREATE TRIGGER trg_cars_no_double_sell
                 BEFORE UPDATE OF active_sale_id ON cars
                 FOR EACH ROW
                 WHEN OLD.status='مبيوعة'
                   AND NEW.status='مبيوعة'
                   AND OLD.active_sale_id IS NOT NULL
                   AND NEW.active_sale_id IS NOT OLD.active_sale_id
                 BEGIN
                    SELECT RAISE(ABORT,
                        'السيارة مبيوعة بالفعل — لا يجوز ربط بيع فعال ثانٍ بدون عكس البيع الأول');
                 END;

                 DROP TRIGGER IF EXISTS trg_audit_log_structured_insert;
                 CREATE TRIGGER trg_audit_log_structured_insert
                 BEFORE INSERT ON audit_log
                 WHEN NEW.actor_user_id IS NULL
                   OR TRIM(COALESCE(NEW.entity_type,''))=''
                   OR TRIM(COALESCE(NEW.action,''))=''
                   OR TRIM(COALESCE(NEW.occurred_at,''))=''
                   OR NEW.schema_version<>50
                   OR (NEW.old_values_json IS NOT NULL AND json_valid(NEW.old_values_json)=0)
                   OR (NEW.new_values_json IS NOT NULL AND json_valid(NEW.new_values_json)=0)
                   OR (NEW.session_id IS NOT NULL AND (
                        length(NEW.session_id)<>64 OR lower(NEW.session_id) GLOB '*[^0-9a-f]*'))
                   OR (NEW.session_fingerprint IS NOT NULL AND (
                        length(NEW.session_fingerprint)<>64
                        OR lower(NEW.session_fingerprint) GLOB '*[^0-9a-f]*'))
                   OR COALESCE(NEW.session_id,'')<>COALESCE(NEW.session_fingerprint,'')
                 BEGIN
                    SELECT RAISE(ABORT,'audit event is incomplete or contains a raw session');
                 END;",
            )?;

            let double_sell_trigger_sql: String = conn.query_row(
                "SELECT sql FROM sqlite_master
                 WHERE type='trigger' AND name='trg_cars_no_double_sell'",
                [],
                |row| row.get(0),
            )?;
            if !double_sell_trigger_sql.contains("active_sale_id") {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Migration 50 failed: sold-car guard does not use active_sale_id".to_string(),
                ));
            }

            let integrity: String =
                conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
            if integrity != "ok" {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 50 integrity_check failed: {integrity}"
                )));
            }
            let foreign_key_violations: i64 =
                conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })?;
            if foreign_key_violations != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Migration 50 foreign_key_check failed: {foreign_key_violations} violations"
                )));
            }
            conn.execute("INSERT INTO db_version(version) VALUES (50)", [])?;
        }

        Ok(())
    })();

    let deferred_error = migration_conn
        .take_error()
        .or_else(|| MIGRATION_STEP_ERROR.with(|error| error.borrow_mut().take()));
    let init_result = match (init_result, deferred_error) {
        (Ok(()), Some(error)) => Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
            std::io::Error::other(format!("migration failed closed: {error}")),
        ))),
        (result, _) => result,
    };

    match init_result {
        Ok(()) => {
            migration_conn.inner.execute_batch("COMMIT")?;
            Ok(())
        }
        Err(err) => {
            if let Err(rollback_error) = migration_conn.inner.execute_batch("ROLLBACK") {
                eprintln!("[fajir-alwadi][migration] rollback failed: {rollback_error}");
            }
            Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                std::io::Error::other(format!("migration failed closed: {err}")),
            )))
        }
    }
}
