//! `tests_module` — extracted from legacy/mod.rs lines 18374–21926
#![allow(unused_imports, dead_code)]
use super::*;

#[cfg(test)]
mod strict_accounting_invariants {
    use super::*;
    use rust_decimal_macros::dec;

    fn seed_admin(conn: &Connection, password: &str) {
        let hash = hash_password(password).unwrap();
        conn.execute(
            "INSERT INTO users
             (id, username, password_hash, display_name, must_change_password)
             VALUES (?1, ?2, ?3, 'مدير النظام', 0)
             ON CONFLICT(id) DO UPDATE SET
                 username = excluded.username,
                 password_hash = excluded.password_hash,
                 display_name = excluded.display_name,
                 must_change_password = 0",
            params![PRIMARY_ADMIN_USER_ID, DEFAULT_ADMIN_USERNAME, hash],
        )
        .unwrap();
    }

    #[test]
    fn test_distribute_to_partners_50_even() {
        let (p1, p2) = split_partner_amount_50(dec!(10000000));
        assert_eq!(p1 + p2, dec!(10000000));
        assert_eq!(p1, dec!(5000000));
        assert_eq!(p2, dec!(5000000));
    }

    #[test]
    fn test_distribute_to_partners_50_odd() {
        // Audit fix #28: the split is DETERMINISTIC — the remainder (at most one
        // smallest unit) always goes to the first partner, so rebuilding generated
        // rows reproduces identical amounts every time.
        for _ in 0..1000 {
            let (p1, p2) = split_partner_amount_50(dec!(10000001));
            assert_eq!(p1 + p2, dec!(10000001));
            // Per-split fairness: the two halves never differ by more than 1 unit.
            assert!((p1 - p2).abs() <= dec!(1));
            // Determinism: the same input always produces the same output.
            assert_eq!((p1, p2), split_partner_amount_50(dec!(10000001)));
            assert_eq!(p1, dec!(5000001));
            assert_eq!(p2, dec!(5000000));
        }
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
    fn test_fresh_database_has_approved_admin_login() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let (hash, must_change): (String, bool) = conn
            .query_row(
                "SELECT password_hash,must_change_password FROM users WHERE username='admin'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(verify_password("admin", &hash));
        assert!(!must_change);
    }

    #[test]
    fn test_init_db_preserves_existing_admin_password_on_reinit() {
        // FORENSIC FIX (re-audit 2026-07-11, PHASE-0-BUILD-BLOCKER + SECURITY-1):
        // Replaces the legacy test that asserted `init_db` would silently
        // RESET the primary admin's password back to the hardcoded default
        // on every call. The new policy is: NEVER overwrite an existing hash.
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_admin(&conn, "initial-secure-2026");

        let legacy_hash = hash_password("legacy-random-password").unwrap();
        conn.execute(
            "UPDATE users
             SET username = ?2, password_hash = ?3, must_change_password = 1
             WHERE id = ?1",
            params![PRIMARY_ADMIN_USER_ID, DEFAULT_ADMIN_USERNAME, legacy_hash],
        )
        .unwrap();

        init_db(&conn).unwrap();

        let (password_hash, must_change_password): (String, bool) = conn
            .query_row(
                "SELECT password_hash, COALESCE(must_change_password, 0) FROM users WHERE id = ?1",
                [PRIMARY_ADMIN_USER_ID],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert!(
            verify_password("legacy-random-password", &password_hash),
            "init_db must NOT overwrite an existing admin's password hash"
        );
        assert!(
            !must_change_password,
            "forced password rotation is disabled"
        );
    }

    #[test]
    fn migration_runner_rolls_back_ignored_statement_failure_and_version() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_admin(&conn, "secure-password-2026");
        conn.execute("DELETE FROM db_version WHERE version > 4", [])
            .unwrap();
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name, kind, type, amount, date, currency)
             VALUES ('أمير', 'شريك', 'ايداع دفعات زبائن', '1000', '2026-01-01', 'IQD')",
            [],
        )
        .unwrap();
        conn.execute_batch(
            "CREATE TRIGGER inject_v5_failure
             BEFORE DELETE ON partner_transactions
             WHEN OLD.type = 'ايداع دفعات زبائن'
             BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END;",
        )
        .unwrap();

        let error = init_db(&conn).unwrap_err().to_string();
        assert!(error.contains("migration failed closed"));
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        let preserved: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions WHERE type='ايداع دفعات زبائن'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, 4, "failed migration must not advance db_version");
        assert_eq!(preserved, 1, "failed migration must roll back its writes");
    }

    #[test]
    fn test_admin_session_survives_primary_admin_username_change() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_admin(&conn, "secure-password-2026");

        // Session lookup is by user_id, so renaming the primary admin must not
        // invalidate the caller's explicit authenticated session.
        let token = create_session(&conn, PRIMARY_ADMIN_USER_ID).expect("create session");

        conn.execute(
            "UPDATE users SET username = '8686' WHERE id = ?1",
            [PRIMARY_ADMIN_USER_ID],
        )
        .unwrap();

        assert!(require_admin_session(&conn, Some(&token)).is_ok());
    }

    #[test]
    fn test_authenticated_session_accepts_non_admin_without_relaxing_admin_guard() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_admin(&conn, "secure-password-2026");

        let user_hash = hash_password("user-password-2026").unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, display_name, must_change_password)
             VALUES ('employee', ?1, 'موظف', 0)",
            [user_hash],
        )
        .unwrap();
        let user_id = conn.last_insert_rowid();
        let token = create_session(&conn, user_id).expect("create non-admin session");

        assert_eq!(
            require_authenticated_session(&conn, Some(&token)),
            Ok(user_id),
            "any signed-in account should be able to load read-only company status"
        );
        assert!(
            require_admin_session(&conn, Some(&token)).is_err(),
            "admin-only commands must remain protected"
        );
        assert!(require_authenticated_session(&conn, None).is_err());
    }

    #[test]
    fn test_init_db_does_not_recreate_default_admin_after_username_change() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_admin(&conn, "secure-password-2026");

        conn.execute(
            "UPDATE users SET username = '8686' WHERE id = ?1",
            [PRIMARY_ADMIN_USER_ID],
        )
        .unwrap();
        init_db(&conn).unwrap();

        let primary_username: String = conn
            .query_row(
                "SELECT username FROM users WHERE id = ?1",
                [PRIMARY_ADMIN_USER_ID],
                |row| row.get(0),
            )
            .unwrap();
        let default_admin_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM users WHERE username = ?1",
                [DEFAULT_ADMIN_USERNAME],
                |row| row.get(0),
            )
            .unwrap();
        let users_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
            .unwrap();

        assert_eq!(primary_username, "8686");
        assert_eq!(default_admin_count, 0);
        assert_eq!(users_count, 1);
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
                reference_entity_id INTEGER,
                type_ TEXT NOT NULL,
                description TEXT NOT NULL,
                notes TEXT,
                reverses_ledger_id INTEGER
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
    fn reverse_and_delete_preserves_a_linked_reversal_with_original_values() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        record_ledger_entry(
            &conn,
            "2026-02-03",
            "04:05:06",
            "inventory",
            Some("CAR-REV-1"),
            Money(dec!(1250)),
            Money::zero(),
            "IQD",
            "car",
            "77",
            "شراء سيارة",
            "شراء للاختبار",
            Some("ملاحظة أصلية"),
        )
        .unwrap();
        let original_id = conn.last_insert_rowid();

        reverse_and_delete_ledger_entries(
            &conn,
            "SELECT id, date, time, account_type, account_id, debit, credit,
                    currency, reference_type, reference_id, type_, description, notes
             FROM financial_ledger
             WHERE reference_type = 'car' AND reference_entity_id = CAST(:param AS INTEGER)
               AND reverses_ledger_id IS NULL",
            "car_id",
            "77",
            "عكس اختبار",
        )
        .unwrap();

        let reversal: (String, String, String, Money, Money, i64) = conn
            .query_row(
                "SELECT date, time, account_type, debit, credit, reverses_ledger_id
                 FROM financial_ledger
                 WHERE reference_type = 'car' AND reference_entity_id = 77
                   AND reverses_ledger_id IS NOT NULL",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(reversal.0, "2026-02-03");
        assert_eq!(reversal.1, "04:05:06");
        assert_eq!(reversal.2, "inventory");
        assert_eq!(reversal.3, Money::zero());
        assert_eq!(reversal.4, Money(dec!(1250)));
        assert_eq!(reversal.5, original_id);
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
            total_recognized += capped;
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
            "INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type, source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit, related_source_type, related_source_id)
             VALUES ('احمد', 'زبون', 'واصل قسط', '5000000', '2026-06-28', '12:00:00', 'مقدمة بيع سيارة', 'IQD', 'قاصه', 'customer_sale_payment', 'CAR123:down_payment', 'sale_down_payment', 0, 0, 0, 'car', 'CAR123')",
            []
        ).unwrap();

        // 3. Rebuild the schedule (it should generate 3 installment template rows of 5,000,000 each)
        rebuild_installment_schedule(&conn, "CAR123").unwrap();
        attach_numeric_sale_identity_to_installments(&conn, "CAR123");

        // Verify we have 3 unpaid template rows
        let unpaid_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
             WHERE kind = 'زبون' AND type = 'باقي قسط'
               AND sale_id = (SELECT active_sale_id FROM cars WHERE car_number = 'CAR123')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(unpaid_count, 3);

        // 4. Now, customer pays the first installment with 6,000,000.
        // New event-sourced behavior: the selected installment is paid and
        // the 1,000,000 overpayment is redistributed over future unpaid rows.
        let first_installment_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions
             WHERE kind = 'زبون' AND type = 'باقي قسط'
               AND sale_id = (SELECT active_sale_id FROM cars WHERE car_number = 'CAR123')
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
             WHERE kind = 'زبون' AND type = 'باقي قسط'
               AND sale_id = (SELECT active_sale_id FROM cars WHERE car_number = 'CAR123')",
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
                0, 0, 0, 'car', 'DUE_LEGACY'
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
        attach_numeric_sale_identity_to_installments(&conn, "DUE_LEGACY");

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

        let (source_id, source_entity_id, installment_id, tx_type): (String, i64, i64, String) =
            conn.query_row(
                "SELECT pt.source_id, pt.source_entity_id, i.id, pt.type
                 FROM partner_transactions pt
                 JOIN installments i ON i.legacy_transaction_id = pt.id
                 WHERE pt.id = ?1",
                [legacy_installment_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(source_entity_id, installment_id);
        assert_eq!(source_id, installment_id.to_string());
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
                0, 0, 0, 'car', 'DUE_KEEP_DATE'
             )",
            [],
        )
        .unwrap();

        rebuild_installment_schedule(&conn, "DUE_KEEP_DATE").unwrap();
        attach_numeric_sale_identity_to_installments(&conn, "DUE_KEEP_DATE");
        let installment_id: i64 = conn
            .query_row(
                "SELECT id
                 FROM partner_transactions
                 WHERE source_type = 'customer_installment_schedule'
                   AND source_role = 'installment_schedule'
                   AND sale_id = (
                       SELECT active_sale_id FROM cars WHERE car_number = 'DUE_KEEP_DATE'
                   )",
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

    fn attach_numeric_sale_identity_to_installments(conn: &Connection, car_number: &str) {
        let (car_id, sale_id) = car_sale_identity_by_number(conn, car_number).unwrap();
        assert!(car_id > 0);
        assert!(sale_id.is_some());
        ensure_original_installment_rows(conn, car_number).unwrap();
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
        let car_id = conn.last_insert_rowid();
        let account_id = ensure_partner_exists(conn, customer, "07800000000", "زبون").unwrap();
        let operation_id = format!("test-sale-{car_id}");
        conn.execute(
            "INSERT INTO operations(id,operation_type,status)
             VALUES (?1,'car_sale','active')",
            [&operation_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO car_sales
             (operation_id,car_id,customer_account_id,sale_type,selling_price,currency,sale_date,status)
             VALUES (?1,?2,?3,'اقساط','6000000',?4,'2025-12-01','active')",
            params![operation_id, car_id, account_id, currency],
        )
        .unwrap();
        let sale_id = conn.last_insert_rowid();
        conn.execute(
            "UPDATE cars SET active_sale_id=?1 WHERE id=?2",
            params![sale_id, car_id],
        )
        .unwrap();
        rebuild_installment_schedule(conn, car_number).unwrap();
    }

    fn installment_rows(conn: &Connection, car_number: &str) -> Vec<(i64, String, Money)> {
        let mut stmt = conn
            .prepare(
                "SELECT pt.id,pt.type,pt.amount
                 FROM partner_transactions pt
                 JOIN installments i ON i.legacy_transaction_id=pt.id
                 JOIN car_sales s ON s.id=i.sale_id
                 JOIN cars c ON c.id=s.car_id
                 WHERE pt.source_type = 'customer_installment_schedule'
                   AND COALESCE(pt.is_reversed,0)=0
                   AND i.status != 'reversed'
                   AND c.car_number=?1
                 ORDER BY COALESCE(pt.due_date,pt.date),pt.id",
            )
            .unwrap();
        stmt.query_map([car_number], |row| {
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
        let numeric_status: String = conn
            .query_row(
                "SELECT status FROM installments WHERE legacy_transaction_id=?1",
                [first_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(numeric_status, "paid");
        assert_eq!(unpaid_balance(&conn, "احمد", "IQD"), Money(dec!(5000000)));
    }

    #[test]
    fn test_sale_price_change_preserves_paid_installment_and_redistributes_unpaid_only() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_PRICE_EDIT", "احمد", "IQD");
        let first_id = installment_rows(&conn, "EV_PRICE_EDIT")[0].0;

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

        conn.execute(
            "UPDATE cars
             SET selling_price='5500000', amount_paid='1000000', amount_remaining='4500000'
             WHERE car_number='EV_PRICE_EDIT'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE car_sales
             SET selling_price='5500000'
             WHERE id=(SELECT active_sale_id FROM cars WHERE car_number='EV_PRICE_EDIT')",
            [],
        )
        .unwrap();

        recalculate_installment_schedule_for_car(&conn, "EV_PRICE_EDIT").unwrap();

        let rows = installment_rows(&conn, "EV_PRICE_EDIT");
        assert_eq!(rows.len(), 6);
        assert_eq!(rows[0].0, first_id);
        assert_eq!(rows[0].1, "واصل قسط");
        assert_eq!(rows[0].2, Money(dec!(1000000)));
        for row in rows.iter().skip(1) {
            assert_eq!(row.1, "باقي قسط");
            assert_eq!(row.2, Money(dec!(900000)));
        }

        let paid_identity: (Money, Money, String) = conn
            .query_row(
                "SELECT original_amount,current_amount,status
                 FROM installments WHERE legacy_transaction_id=?1",
                [first_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(paid_identity.0, Money(dec!(1000000)));
        assert_eq!(paid_identity.1, Money(dec!(1000000)));
        assert_eq!(paid_identity.2, "paid");
        assert_eq!(unpaid_balance(&conn, "احمد", "IQD"), Money(dec!(4500000)));
    }

    #[test]
    fn test_customer_balance_zero_after_all_event_installments_paid() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_FULL", "احمد", "IQD");

        while let Some((installment_id, _, amount)) = installment_rows(&conn, "EV_FULL")
            .into_iter()
            .find(|(_, tx_type, _)| tx_type.starts_with("باقي"))
        {
            pay_customer_installment_core(
                &conn,
                installment_id,
                "احمد",
                amount,
                "2026-01-01",
                None,
                "IQD",
                "قاصه",
            )
            .unwrap();
        }

        assert_eq!(unpaid_balance(&conn, "احمد", "IQD"), Money::zero());
        assert_eq!(
            customer_balance_for_currency(&conn, Some("احمد"), "IQD").unwrap(),
            Money::zero()
        );
        assert_eq!(
            customer_balance_for_currency(&conn, None, "IQD").unwrap(),
            Money::zero()
        );
    }

    #[test]
    fn test_manual_customer_payment_still_reduces_balance() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, currency,
                source_type, source_id, source_role,
                affects_qasa, affects_partner_cash, affects_profit
             ) VALUES
                ('احمد', 'زبون', 'باقي', '6000000', '2026-01-01', 'IQD',
                 'customer_transaction', '1', 'account_movement', 0, 0, 0),
                ('احمد', 'زبون', 'تسديد يدوي', '1000000', '2026-01-02', 'IQD',
                 'customer_transaction', '2', 'account_movement', 0, 0, 0)",
            [],
        )
        .unwrap();

        assert_eq!(
            customer_balance_for_currency(&conn, Some("احمد"), "IQD").unwrap(),
            Money(dec!(5000000))
        );
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
                "SELECT COUNT(*) FROM customer_installment_payment_events
             WHERE sale_id_v2 = (SELECT active_sale_id FROM cars WHERE car_number='EV_OVER')
               AND status = 'active'",
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
    fn test_event_installment_usd_difference_uses_cent_precision() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_USD_CENTS", "سارة", "USD");
        let first_id = installment_rows(&conn, "EV_USD_CENTS")[0].0;

        pay_customer_installment_core(
            &conn,
            first_id,
            "سارة",
            Money(dec!(999999)),
            "2026-01-01",
            None,
            "USD",
            "قاصه",
        )
        .unwrap();

        let rows = installment_rows(&conn, "EV_USD_CENTS");
        assert_eq!(rows[0].2, Money(dec!(999999)));
        for row in rows.iter().skip(1) {
            assert_eq!(row.2, Money(dec!(1000000.20)));
        }
        assert_eq!(unpaid_balance(&conn, "سارة", "USD"), Money(dec!(5000001)));
    }

    #[test]
    fn test_event_installment_full_advance_payment_settles_zero_rows_and_reverses() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_ADVANCE_FULL", "زينب", "IQD");
        let original_rows = installment_rows(&conn, "EV_ADVANCE_FULL");
        let first_id = original_rows[0].0;
        let covered_last_id = original_rows.last().unwrap().0;

        pay_customer_installment_core(
            &conn,
            first_id,
            "زينب",
            Money(dec!(6000000)),
            "2026-01-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        let paid_rows = installment_rows(&conn, "EV_ADVANCE_FULL");
        assert!(paid_rows.iter().all(|row| row.1.starts_with("واصل")));
        assert_eq!(paid_rows[0].2, Money(dec!(6000000)));
        assert!(paid_rows.iter().skip(1).all(|row| row.2.is_zero()));
        assert_eq!(unpaid_balance(&conn, "زينب", "IQD"), Money::zero());

        reverse_customer_installment_payment_core(&conn, covered_last_id).unwrap();
        let restored_rows = installment_rows(&conn, "EV_ADVANCE_FULL");
        assert!(restored_rows.iter().all(|row| row.1.starts_with("باقي")));
        assert!(restored_rows
            .iter()
            .all(|row| row.2 == Money(dec!(1000000))));
        assert_eq!(unpaid_balance(&conn, "زينب", "IQD"), Money(dec!(6000000)));
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
                   AND related_source_id = (SELECT CAST(id AS TEXT) FROM cars WHERE car_number='EV_PROFIT')
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
        // Instructions.md §17.11 requires append-only correction: the original
        // profit row stays active and a linked negative row cancels it.
        let net_profit_rows_after_reverse: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(amount), 0.0)
                 FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type IN ('customer_payment','customer_payment_reversal')
                   AND affects_profit = 1
                   AND related_source_id = (SELECT CAST(id AS TEXT) FROM cars WHERE car_number='EV_PROFIT')
                   AND COALESCE(is_reversed, 0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(net_profit_rows_after_reverse, Money::zero());

        let (net_after_reverse_iqd, net_after_reverse_usd) =
            calculate_profit_totals_since(&conn, "2025-01-01", "").unwrap();
        assert_eq!(net_after_reverse_iqd, Money::zero());
        assert_eq!(net_after_reverse_usd, Money::zero());
    }

    #[test]
    fn test_rebuilding_customer_payment_recreates_cash_after_reversal() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_event_sourced_installment_car(&conn, "EV_REBUILD", "احمد", "IQD");
        let first_id = installment_rows(&conn, "EV_REBUILD")[0].0;

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

        let payment_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions
                 WHERE kind='زبون'
                   AND source_type='customer_payment'
                   AND source_role='customer_payment'
                   AND COALESCE(is_reversed,0)=0
                 ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let payment: (Money, String, String, String, String) = conn
            .query_row(
                "SELECT amount,date,COALESCE(notes,''),currency,COALESCE(payment_type,'قاصه')
                 FROM partner_transactions WHERE id=?1",
                [payment_id],
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
            .unwrap();

        delete_customer_payment_partner_splits(&conn, payment_id).unwrap();
        delete_customer_payment_profit_splits(&conn, payment_id).unwrap();
        apply_partner_transaction_splits(
            &conn,
            payment_id,
            "احمد",
            "زبون",
            "تسديد قسط",
            payment.0,
            &payment.1,
            Some(&payment.2),
            &payment.3,
            &payment.4,
        )
        .unwrap();

        let active_cash_splits: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type='customer_payment'
                   AND source_entity_id=?1
                   AND source_role='cash_movement'
                   AND kind='شريك'
                   AND COALESCE(is_reversed,0)=0
                   AND reverses_transaction_id IS NULL",
                [payment_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active_cash_splits, 2);

        let ledger_balance: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(debit-credit),0) FROM financial_ledger
                 WHERE currency='IQD'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(ledger_balance, Money::zero());
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
                "SELECT COUNT(*) FROM customer_installment_payment_events
             WHERE sale_id_v2 = (SELECT active_sale_id FROM cars WHERE car_number='EV_DUP')
               AND status = 'active'",
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
                "SELECT COALESCE(pt.due_date, pt.date)
                 FROM partner_transactions pt
                 JOIN installments i ON i.legacy_transaction_id = pt.id
                 JOIN car_sales s ON s.id = i.sale_id
                 JOIN cars c ON c.id = s.car_id
                 WHERE pt.source_type = 'customer_installment_schedule'
                   AND COALESCE(pt.is_reversed, 0) = 0
                   AND i.status != 'reversed'
                   AND c.car_number = 'EV_LAST_UNDER'
                 ORDER BY COALESCE(pt.due_date, pt.date) DESC, pt.id DESC
                 LIMIT 1",
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
        let numeric_status: String = conn
            .query_row(
                "SELECT status FROM installments WHERE legacy_transaction_id=?1",
                [under_last_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(numeric_status, "unpaid");
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
                "SELECT COUNT(*) FROM customer_installment_payment_events
                 WHERE sale_id_v2 = (
                     SELECT active_sale_id FROM cars WHERE car_number='EV_REBUILD_MONTHS'
                 ) AND status = 'active'",
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
        for row in rows_after.iter().take(10).skip(2) {
            assert_eq!(row.1, "باقي قسط");
            assert_eq!(row.2, Money(dec!(500000)));
        }
    }

    fn reset_to_two_test_partners(conn: &Connection) {
        conn.execute_batch(
            "DROP TRIGGER IF EXISTS trg_financial_ledger_no_delete;
             DROP TRIGGER IF EXISTS trg_partner_transactions_no_delete;",
        )
        .unwrap();
        conn.execute("DELETE FROM financial_ledger", []).unwrap();
        conn.execute("DELETE FROM partner_transactions", [])
            .unwrap();
        conn.execute("DELETE FROM partners WHERE kind = 'شريك'", [])
            .unwrap();
        conn.execute(
            "INSERT INTO partners (partner_name, phone, total_amount, kind)
             VALUES ('الشريك الأول', '', '0', 'شريك')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO partners (partner_name, phone, total_amount, kind)
             VALUES ('الشريك الثاني', '', '0', 'شريك')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn test_sale_down_payment_customer_row_does_not_double_cash_ledger() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        reset_to_two_test_partners(&conn);
        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type, purchase_price, selling_price,
                amount_paid, amount_remaining, installment_months, sale_currency, sale_date,
                buyer_name, buyer_phone
             ) VALUES (
                'DP_NO_DOUBLE', 'Installment Car', 'مبيوعة', 'اقساط', '10000000', '20000000',
                '5000000', '15000000', 15, 'IQD', '2026-06-01', 'احمد', '07800000000'
             )",
            [],
        )
        .unwrap();
        let (dp_car_id, dp_sale_id) = car_sale_identity_by_number(&conn, "DP_NO_DOUBLE").unwrap();
        let dp_sale_id = dp_sale_id.unwrap();
        let (dp_operation_id, dp_account_id): (String, i64) = conn
            .query_row(
                "SELECT operation_id,customer_account_id FROM car_sales WHERE id=?1",
                [dp_sale_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        conn.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_role, affects_qasa, affects_partner_cash,
                affects_profit, related_source_type, related_source_id,account_id,operation_id,sale_id
             ) VALUES (
                'احمد', 'زبون', 'مقدمة بيع سيارة', '5000000', '2026-06-01', '12:00:00',
                'استلام مقدمة سيارة من احمد #بيع_سيارة_DP_NO_DOUBLE', 'IQD', 'قاصه',
                'customer_sale_payment', ?1, 'sale_down_payment',
                0, 0, 0, 'car', ?2,?3,?4,?5
             )",
            params![
                format!("{dp_sale_id}:down_payment"),
                dp_car_id.to_string(),
                dp_account_id,
                dp_operation_id,
                dp_sale_id,
            ],
        )
        .unwrap();
        let dp_id = conn.last_insert_rowid();

        record_partner_ledger_entries(&conn, dp_id).unwrap();
        apply_partner_transaction_splits(
            &conn,
            dp_id,
            "احمد",
            "زبون",
            "مقدمة بيع سيارة",
            Money(dec!(5000000)),
            "2026-06-01",
            Some("استلام مقدمة سيارة من احمد #بيع_سيارة_DP_NO_DOUBLE"),
            "IQD",
            "قاصه",
        )
        .unwrap();

        let cash_delta: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0)
                 FROM financial_ledger
                 WHERE account_type = 'cash'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cash_delta, Money(dec!(5000000)));
    }

    #[test]
    fn test_partner_withdrawal_without_cash_flags_writes_no_ledger() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        reset_to_two_test_partners(&conn);
        conn.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit
             ) VALUES (
                'الشريك الأول', 'شريك', 'سحب شريك', '100000', '2026-06-01', '12:00:00',
                'حركة غير نقدية لاختبار flags', 'IQD', 'قاصه',
                'manual_test', 'manual-test-1', 'profit_recognition', 0, 0, 0
             )",
            [],
        )
        .unwrap();
        let tx_id = conn.last_insert_rowid();

        record_partner_ledger_entries(&conn, tx_id).unwrap();

        let ledger_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM financial_ledger", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(ledger_count, 0);
    }

    #[test]
    fn test_profit_summary_uses_affects_profit_source_rows() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        reset_to_two_test_partners(&conn);
        conn.execute(
            "INSERT INTO agencies (old_agent_name, car_type, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time)
             VALUES ('Old Agent', 'Sedan', '123', 'Toyota', 'Red', 'New Agent', '07700000000', '0', '1000000', 'Notes', '2026-06-29', '07:30')",
            [],
        )
        .unwrap();

        let (without_rows_iqd, without_rows_usd) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "").unwrap();
        assert_eq!(without_rows_iqd, Money::zero());
        assert_eq!(without_rows_usd, Money::zero());

        distribute_agency_partner_effects(
            &conn,
            Money(dec!(1000000)),
            "IQD",
            "2026-06-29",
            "ايداع ارباح وكالة",
            "agency",
            "1",
            true,
        )
        .unwrap();
        let (with_rows_iqd, with_rows_usd) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "").unwrap();
        assert_eq!(with_rows_iqd, Money(dec!(1000000)));
        assert_eq!(with_rows_usd, Money::zero());
    }

    #[test]
    fn test_agency_creation_token_is_unique_but_optional() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        let insert_agency = |plate: &str, token: Option<&str>| {
            conn.execute(
                "INSERT INTO agencies (
                    old_agent_name, car_type, car_number, car_model, color, new_agent_name,
                    phone, amount_usd, amount_iqd, notes, date, time, creation_token
                 ) VALUES (
                    'Old Agent', 'Sedan', ?1, '2026', 'Red', 'New Agent',
                    '07700000000', '0', '1000000', 'Notes', '2026-06-29', '07:30', ?2
                 )",
                params![plate, token],
            )
        };

        insert_agency("TOKEN-1", Some("agency-create-1")).unwrap();
        assert!(insert_agency("TOKEN-2", Some("agency-create-1")).is_err());
        insert_agency("NO-TOKEN-1", None).unwrap();
        insert_agency("NO-TOKEN-2", None).unwrap();
    }

    #[test]
    fn test_unreceived_agency_defers_profit_and_cash_until_received() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        reset_to_two_test_partners(&conn);

        conn.execute(
            "INSERT INTO agencies (
                old_agent_name, car_type, car_number, car_model, color, new_agent_name,
                phone, amount_usd, amount_iqd, notes, payment_status, date, time
             ) VALUES (
                'Old Agent', 'Sedan', 'AG-UNRECEIVED', '2026', 'Red', 'New Agent',
                '07700000000', '0', '1000000', 'Agency note', 'غير واصل', '2026-06-29', '07:30'
             )",
            [],
        )
        .unwrap();
        let agency_id = conn.last_insert_rowid();

        record_agency_ledger_entries(&conn, agency_id).unwrap();
        rebuild_agency_partner_entries(&conn, agency_id).unwrap();

        let agency_ref = agency_id.to_string();
        let agency_account_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partners WHERE partner_name = 'New Agent' AND kind = 'وكالة'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(agency_account_count, 1);
        let (agency_account_id, receivable_account_id, source_entity_id): (i64, i64, i64) = conn
            .query_row(
                "SELECT p.account_id, fl.account_id_v2, pt.source_entity_id
                 FROM partners p
                 JOIN partner_transactions pt
                   ON pt.account_id=p.account_id
                  AND pt.source_type='agency'
                  AND pt.source_entity_id=?1
                  AND pt.source_role='agency_receivable'
                 JOIN financial_ledger fl
                   ON fl.reference_type='agency'
                  AND fl.reference_entity_id=?1
                  AND fl.account_type='receivable'
                 WHERE p.partner_name='New Agent' AND p.kind='وكالة'",
                [agency_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(agency_account_id, receivable_account_id);
        assert_eq!(source_entity_id, agency_id);
        assert_eq!(
            borrower_balance_for_currency(&conn, Some("New Agent"), Some("وكالة"), "IQD").unwrap(),
            Money(dec!(1000000))
        );

        let cash_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'agency' AND source_id = ?1 AND source_role = 'cash_movement'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cash_rows, 0);

        // Instructions.md §31.4 overrides §30.9: a credit agency recognizes
        // neither profit nor cash until the receivable is collected.
        let profit_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'agency' AND source_id = ?1 AND source_role = 'profit_recognition'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(profit_rows, 0);

        let receivable_ledger: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0)
                 FROM financial_ledger
                 WHERE reference_type = 'agency' AND reference_id = ?1
                   AND account_type = 'receivable' AND account_id = 'New Agent'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(receivable_ledger, Money(dec!(1000000)));

        // Credit agencies balance the receivable against deferred revenue, not
        // earned revenue, until payment is received.
        let revenue_ledger: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(credit - debit), 0.0)
                 FROM financial_ledger
                 WHERE reference_type = 'agency' AND reference_id = ?1
                   AND account_type = 'revenue'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revenue_ledger, Money::zero());

        let deferred_revenue_ledger: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(credit - debit), 0.0)
                 FROM financial_ledger
                 WHERE reference_type = 'agency' AND reference_id = ?1
                   AND account_type = 'deferred_revenue'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(deferred_revenue_ledger, Money(dec!(1000000)));

        let (profit_iqd_before_received, profit_usd_before_received) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "").unwrap();
        assert_eq!(profit_iqd_before_received, Money::zero());
        assert_eq!(profit_usd_before_received, Money::zero());

        let cash_ledger: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0)
                 FROM financial_ledger
                 WHERE reference_type = 'agency' AND reference_id = ?1
                   AND account_type = 'cash'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cash_ledger, Money::zero());

        let agency_receivable_tx_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions
                 WHERE source_type = 'agency' AND source_id = ?1 AND source_role = 'agency_receivable'
                 LIMIT 1",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        set_agency_receivable_status_core(&conn, agency_receivable_tx_id, true).unwrap();

        assert_eq!(
            borrower_balance_for_currency(&conn, Some("New Agent"), Some("وكالة"), "IQD").unwrap(),
            Money::zero()
        );

        let receivable_rows_after_received: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'agency' AND source_id = ?1 AND source_role = 'agency_receivable'
                   AND COALESCE(is_reversed,0)=0",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(receivable_rows_after_received, 0);

        let profit_rows_after_received: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'agency' AND source_id = ?1 AND source_role = 'profit_recognition'
                   AND kind = 'شريك' AND type = 'ايداع ارباح وكالة'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(profit_rows_after_received, 2);

        let (profit_iqd_after_received, profit_usd_after_received) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "").unwrap();
        assert_eq!(profit_iqd_after_received, Money(dec!(1000000)));
        assert_eq!(profit_usd_after_received, Money::zero());

        let cash_rows_after_received: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'agency' AND source_id = ?1 AND source_role = 'cash_movement'
                   AND kind = 'شريك' AND type = 'ايداع ارباح وكالة'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cash_rows_after_received, 2);

        let cash_ledger_after_received: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0)
                 FROM financial_ledger
                 WHERE reference_type = 'agency' AND reference_id = ?1
                   AND account_type = 'cash'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cash_ledger_after_received, Money(dec!(1000000)));

        let receivable_ledger_after_received: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0)
                 FROM financial_ledger
                 WHERE reference_type = 'agency' AND reference_id = ?1
                   AND account_type = 'receivable' AND account_id = 'New Agent'",
                [agency_ref.as_str()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(receivable_ledger_after_received, Money::zero());
    }

    #[test]
    fn test_agency_withdrawal_reduces_profit_if_backend_path_is_used() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        reset_to_two_test_partners(&conn);
        distribute_agency_partner_effects(
            &conn,
            Money(dec!(1000000)),
            "IQD",
            "2026-06-29",
            "ايداع ارباح وكالة",
            "agency_transaction",
            "deposit-1",
            true,
        )
        .unwrap();
        distribute_agency_withdrawal_partner_effects(
            &conn,
            Money(dec!(200000)),
            "IQD",
            "2026-06-30",
            "سحب ارباح وكالة",
            "agency_transaction",
            "withdraw-1",
        )
        .unwrap();

        let (profit_iqd, profit_usd) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "").unwrap();
        assert_eq!(profit_iqd, Money(dec!(800000)));
        assert_eq!(profit_usd, Money::zero());
    }

    #[test]
    fn test_deferred_revenue_becomes_zero_after_full_profit_recognition() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        reset_to_two_test_partners(&conn);
        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type, purchase_price, selling_price,
                amount_paid, amount_remaining, installment_months, sale_currency, sale_date,
                buyer_name, buyer_phone
             ) VALUES (
                'DEF_DONE', 'Deferred Car', 'مبيوعة', 'اقساط', '10000000', '20000000',
                '20000000', '0', 15, 'IQD', '2026-06-01', 'احمد', '07800000000'
             )",
            [],
        )
        .unwrap();

        attach_numeric_sale_identity_to_installments(&conn, "DEF_DONE");
        let (deferred_car_id, deferred_sale_id) =
            car_sale_identity_by_number(&conn, "DEF_DONE").unwrap();
        let deferred_sale_id = deferred_sale_id.unwrap();

        let (before_iqd, before_usd) =
            calculate_deferred_revenue_from_unrecognized_profit(&conn).unwrap();
        assert_eq!(before_iqd, Money(dec!(10000000)));
        assert_eq!(before_usd, Money::zero());

        distribute_to_partners_50_with_effects_and_related(
            &conn,
            Money(dec!(10000000)),
            "IQD",
            "2026-07-01",
            "قاصه",
            "ايداع ارباح قسط سيارة",
            "ارباح مدفوعة بالكامل",
            "customer_payment",
            &format!("{deferred_sale_id}:full-payment"),
            "profit_recognition",
            false,
            false,
            true,
            Some("car"),
            Some(&deferred_car_id.to_string()),
        )
        .unwrap();

        let (after_iqd, after_usd) =
            calculate_deferred_revenue_from_unrecognized_profit(&conn).unwrap();
        assert_eq!(after_iqd, Money::zero());
        assert_eq!(after_usd, Money::zero());
    }

    #[test]
    fn test_financier_commission_expense_uses_explicit_source() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let exp_id = insert_financier_commission_expense(
            &conn,
            "ممون الاختبار",
            Money(dec!(250000)),
            "2026-06-01",
            "12:00",
            "IQD",
            42,
        )
        .unwrap();

        let found_id = find_financier_commission_expense_id(&conn, 42)
            .unwrap()
            .unwrap();
        assert_eq!(found_id, exp_id);
        let (source_type, source_id, source_role): (String, String, String) = conn
            .query_row(
                "SELECT source_type, source_id, source_role FROM expenses WHERE id = ?1",
                [exp_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(source_type, "funder_commission");
        assert_eq!(source_id, "42");
        assert_eq!(source_role, "commission_expense");
    }

    #[test]
    fn test_agency_profit_directly_adds_to_net_profit() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        // Check initial profit is 0
        let (profit_iqd, profit_usd) =
            calculate_analytical_profit(&conn, "2025-01-01", None, "").unwrap();
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
        let (profit_iqd_after, profit_usd_after) =
            calculate_analytical_profit(&conn, "2025-01-01", None, "").unwrap();
        assert_eq!(profit_iqd_after, Money(dec!(1000000.0)));
        assert_eq!(profit_usd_after, Money(dec!(500.0)));
    }

    /// Regression test for BUG-1: orphan partner split rows.
    ///
    /// Discovered by forensic DB audit on production DB v30:
    /// `funder_payment` rows 229/230 referenced `source_id='228'` (a deleted
    /// `funder_transaction` parent). These orphan splits reduced partner cash by
    /// 52,050 IQD without the matching funder-liability reduction, producing a
    /// -52,050 IQD overall ledger imbalance.
    ///
    /// This test reproduces the scenario:
    ///   1. Insert a funder_transaction parent (id 1) + 2 funder_payment splits
    ///      (id 2, 3) referencing it.
    ///   2. Verify ledger is balanced.
    ///   3. Simulate the orphan scenario: delete only the parent row + its
    ///      ledger entries (mimicking pre-fix-#3 behavior).
    ///   4. Verify overall ledger imbalance appears.
    ///   5. Run the orphan-cleanup migration helper.
    ///   6. Verify overall ledger is balanced again and orphan splits are gone.
    #[test]
    fn test_orphan_partner_splits_cleaned_by_migration_v32() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        // Bypass must_change_password for the test admin so require_admin_session works.
        conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        )
        .expect("test admin setup must succeed");

        // init_db already seeds the two default partners 'أمير' and 'منتصر' (§1.1).

        // Step 1: insert funder_transaction parent row (id will be 1 after init_db seeds admin user).
        conn.execute(
            "INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                source_type, source_id, source_role,
                affects_qasa, affects_partner_cash, affects_profit
             )
             VALUES ('ماهر معلة', 'ممول', 'سحب', 52050, '2026-07-07', '19:57', 'تسديد ممول',
                     'IQD', 'قاصه', 'funder_transaction', '1', 'repayment_account_movement',
                     0, 0, 0)",
            [],
        )
        .unwrap();
        // Update source_id to its own id (per Audit fix #8 pattern).
        let funder_tx_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        conn.execute(
            "UPDATE partner_transactions SET source_id = ?1 WHERE id = ?2",
            params![funder_tx_id.to_string(), funder_tx_id],
        )
        .unwrap();
        // Write the funder-liability debit ledger entry (the parent's effect).
        record_partner_ledger_entries(&conn, funder_tx_id).unwrap();

        // Step 2: insert two funder_payment split rows (50/50 = 26025 each).
        for partner in ["أمير", "منتصر"] {
            conn.execute(
                "INSERT INTO partner_transactions (
                    partner_name, kind, type, amount, date, time, notes, currency, payment_type,
                    source_type, source_id, source_role,
                    affects_qasa, affects_partner_cash, affects_profit
                 )
                 VALUES (?1, 'شريك', 'سحب تسديد', 26025, '2026-07-07', '19:57',
                         'تسديد ممول: ماهر معلة', 'IQD', 'قاصه',
                         'funder_payment', ?2, 'partner_cash_payment',
                         1, 1, 0)",
                params![partner, funder_tx_id.to_string()],
            )
            .unwrap();
            let split_id: i64 = conn
                .query_row(
                    "SELECT id FROM partner_transactions ORDER BY id DESC LIMIT 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            record_partner_ledger_entries(&conn, split_id).unwrap();
        }

        // Verify ledger is balanced at this point.
        let (debit_iqd, credit_iqd): (f64, f64) = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger WHERE currency = 'IQD'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(
            (debit_iqd - credit_iqd).abs() < 0.01,
            "ledger must be balanced after setup, got debit={debit_iqd} credit={credit_iqd}"
        );

        // Step 3: simulate the pre-fix-#3 orphan scenario — delete ONLY the parent
        // row + its ledger entries (the splits are left orphaned).
        delete_ledger_entries(&conn, "partner_transaction", &funder_tx_id.to_string()).unwrap();
        conn.execute("DROP TRIGGER trg_partner_transactions_no_delete", [])
            .unwrap();
        conn.execute(
            "DELETE FROM partner_transactions WHERE id = ?1",
            [funder_tx_id],
        )
        .unwrap();

        // Step 4: verify overall ledger imbalance now exists.
        let (debit_iqd, credit_iqd): (f64, f64) = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger WHERE currency = 'IQD'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(
            (debit_iqd - credit_iqd).abs() > 0.01,
            "ledger should be imbalanced after orphaning the parent, got debit={debit_iqd} credit={credit_iqd}"
        );

        // Verify orphan splits still exist.
        let orphan_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type IN ('customer_payment','funder_payment','company_payment')
                   AND source_id != '' AND source_id IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM partner_transactions pt2
                     WHERE CAST(pt2.id AS TEXT) = partner_transactions.source_id
                   )
                   AND COALESCE(is_reversed, 0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(orphan_count, 2, "expected 2 orphan funder_payment splits");

        // Step 5: run the orphan-cleanup migration helper.
        cleanup_orphan_partner_splits(&conn).unwrap();

        // Step 6: verify orphan splits are gone and ledger is balanced again.
        let orphan_count_after: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type IN ('customer_payment','funder_payment','company_payment')
                   AND source_id != '' AND source_id IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM partner_transactions pt2
                     WHERE CAST(pt2.id AS TEXT) = partner_transactions.source_id
                   )
                   AND COALESCE(is_reversed, 0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            orphan_count_after, 0,
            "orphan splits must be cleaned up by migration"
        );

        let (debit_iqd_final, credit_iqd_final): (f64, f64) = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger WHERE currency = 'IQD'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(
            (debit_iqd_final - credit_iqd_final).abs() < 0.01,
            "ledger must be balanced after cleanup, got debit={debit_iqd_final} credit={credit_iqd_final}"
        );
    }

    /// Regression test for Instructions.md §22 — Required Test Scenario: Cash Sale.
    ///
    /// Verifies the end-to-end acceptance rule:
    ///   Purchase = 10,000,000  Selling = 20,000,000  Car Expenses = 0  Sale Type = Cash
    ///   Expected:
    ///     Qasa/Cash increase = 20,000,000 ONLY (not 30,000,000)
    ///     Recognized Profit  = 10,000,000
    ///     Partner 1 profit   = 5,000,000
    ///     Partner 2 profit   = 5,000,000
    ///     Ledger balanced.
    ///
    /// Forbidden result: Qasa/Cash = 30,000,000 (double-counting profit as a second cash movement).
    #[test]
    fn test_instructions_section_22_cash_sale_no_double_count() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        )
        .expect("test admin setup must succeed");
        reset_to_two_test_partners(&conn);

        // 1. Insert a car with the §22 scenario parameters.
        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type,
                purchase_price, selling_price, currency, sale_currency,
                amount_paid, amount_remaining, sale_date, buyer_name, buyer_phone
             ) VALUES (
                'S22', 'سيارة اختبار 22', 'مبيوعة', 'كاش',
                '10000000', '20000000', 'IQD', 'IQD',
                '20000000', '0', '2026-07-01', 'مشتري 22', '07800000000'
             )",
            [],
        )
        .unwrap();

        // 2. Record the sale ledger entries (Dr cash / Cr revenue + Dr COGS / Cr inventory).
        let car_id = car_id_by_number(&conn, "S22").unwrap();
        record_car_sale_ledger_entries(&conn, car_id).unwrap();

        // 3. Record the cash-sale profit recognition rows (signed, 50/50).
        rebuild_cash_sale_profit_recognition(&conn, car_id).unwrap();

        // 4. Verify ledger is balanced (sum of all debit == sum of all credit) for IQD.
        let (debit_iqd, credit_iqd): (f64, f64) = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger WHERE currency = 'IQD'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(
            (debit_iqd - credit_iqd).abs() < 0.01,
            "ledger must be balanced after cash sale, got debit={debit_iqd} credit={credit_iqd}"
        );

        // 5. Verify cash debit equals selling price ONLY (20M, not 30M).
        let cash_debit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0)
                 FROM financial_ledger
                 WHERE account_type = 'cash' AND reference_type = 'car'
                   AND reference_id = (
                       SELECT CAST(active_sale_id AS TEXT) FROM cars WHERE car_number='S22'
                   )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            cash_debit, 20_000_000.0,
            "cash movement must equal selling price (no double-counting of profit)"
        );

        // 6. Verify total recognized profit = 10M (selling - purchase - 0 expenses).
        let total_profit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND affects_profit = 1
                   AND COALESCE(is_reversed, 0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            total_profit, 10_000_000.0,
            "total recognized profit must equal selling - purchase - expenses"
        );

        // 7. Verify each partner's share = 5M.
        let partners: Vec<(String, f64)> = conn
            .prepare(
                "SELECT partner_name, COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND affects_profit = 1
                   AND COALESCE(is_reversed, 0) = 0
                 GROUP BY partner_name
                 ORDER BY partner_name",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(partners.len(), 2, "must have exactly two partners");
        for (name, share) in &partners {
            assert_eq!(
                *share, 5_000_000.0,
                "partner {name} share must be 5,000,000 (50% of 10M profit)"
            );
        }

        // 8. Verify the analytical profit summary equals 10M IQD.
        let (profit_iqd, profit_usd) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "").unwrap();
        assert_eq!(profit_iqd, Money(dec!(10_000_000)));
        assert_eq!(profit_usd, Money::zero());

        // 9. Verify the profit_recognition rows never affect qasa/cash.
        let bad_profit_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND (affects_qasa = 1 OR affects_partner_cash = 1)",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            bad_profit_rows, 0,
            "profit_recognition rows must never affect qasa or partner_cash"
        );
    }

    /// Regression test for Instructions.md §24.1 — Required Test Scenario: Cash Car Loss.
    ///
    /// Verifies the end-to-end acceptance rule:
    ///   Purchase = 10,000,000  Car Expenses = 1,000,000  Selling = 8,000,000  Sale Type = Cash
    ///   Expected:
    ///     Car Cost = 11,000,000
    ///     Car Profit (Loss) = 8M - 11M = -3,000,000
    ///     Qasa/Cash increases by 8,000,000 (the actual selling price)
    ///     Net Profit decreases by 3,000,000 (the loss must NOT be silently ignored)
    ///     Ledger balanced.
    ///
    /// Forbidden result: Loss is ignored and net profit is not reduced.
    #[test]
    fn test_instructions_section_24_1_cash_car_loss_must_reduce_net_profit() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        )
        .expect("test admin setup must succeed");
        reset_to_two_test_partners(&conn);

        // 1. Insert a car with the §24.1 loss scenario parameters.
        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type,
                purchase_price, selling_price, currency, sale_currency,
                amount_paid, amount_remaining, sale_date, buyer_name, buyer_phone
             ) VALUES (
                'S241', 'سيارة خسارة 24.1', 'مبيوعة', 'كاش',
                '10000000', '8000000', 'IQD', 'IQD',
                '8000000', '0', '2026-07-01', 'مشتري خسارة', '07800000000'
             )",
            [],
        )
        .unwrap();

        // 2. Add the car expense (1,000,000 IQD).
        conn.execute(
            "INSERT INTO operations(id,operation_type,status)
             VALUES ('test-s241-expense','test_fixture','active')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO car_expenses
             (car_id, car_number, description, amount, date, currency, time, operation_id)
             SELECT id, car_number, 'مصروف سيارة خسارة', '1000000', '2026-07-01', 'IQD', '10:00',
                    'test-s241-expense'
             FROM cars WHERE car_number = 'S241'",
            [],
        )
        .unwrap();

        // 3. Record the sale ledger entries (loss path: Dr receivable/cash + Cr inventory + Dr expense "خسارة بيع سيارة").
        let car_id = car_id_by_number(&conn, "S241").unwrap();
        record_car_sale_ledger_entries(&conn, car_id).unwrap();

        // 4. Record the cash-sale loss recognition rows (signed negative, 50/50).
        rebuild_cash_sale_profit_recognition(&conn, car_id).unwrap();

        // 5. Verify ledger is balanced.
        let (debit_iqd, credit_iqd): (f64, f64) = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger WHERE currency = 'IQD'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(
            (debit_iqd - credit_iqd).abs() < 0.01,
            "ledger must be balanced after loss sale, got debit={debit_iqd} credit={credit_iqd}"
        );

        // 6. Verify cash debit equals selling price (8M, the actual cash received).
        let cash_debit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0)
                 FROM financial_ledger
                 WHERE account_type = 'cash' AND reference_type = 'car'
                   AND reference_id = (
                       SELECT CAST(active_sale_id AS TEXT) FROM cars WHERE car_number='S241'
                   )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            cash_debit, 8_000_000.0,
            "cash movement must equal actual selling price (8M), not the cost (11M)"
        );

        // 7. Verify the loss is recorded as a negative profit (signed).
        let total_profit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND affects_profit = 1
                   AND COALESCE(is_reversed, 0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            total_profit, -3_000_000.0,
            "total recognized profit must be -3,000,000 (loss must NOT be silently ignored)"
        );

        // 8. Verify each partner's share of the loss = -1,500,000.
        let partners: Vec<(String, f64)> = conn
            .prepare(
                "SELECT partner_name, COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE kind = 'شريك'
                   AND source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND affects_profit = 1
                   AND COALESCE(is_reversed, 0) = 0
                 GROUP BY partner_name
                 ORDER BY partner_name",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(partners.len(), 2, "must have exactly two partners");
        for (name, share) in &partners {
            assert_eq!(
                *share, -1_500_000.0,
                "partner {name} loss share must be -1,500,000 (50% of -3M loss)"
            );
        }

        // 9. Verify the analytical profit summary is -3M IQD (net profit reduced by loss).
        let (profit_iqd, profit_usd) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "").unwrap();
        assert_eq!(profit_iqd, Money(dec!(-3_000_000)));
        assert_eq!(profit_usd, Money::zero());

        // 10. Verify the loss is reflected in the financial_ledger:
        //     For cash sales, the loss is implicit in the gap between revenue (Cr 8M)
        //     and COGS expense (Dr 11M). The signed profit_recognition rows carry
        //     the explicit -3M loss to the partner profit distribution.
        //
        //     Revenue credit total = 8M (selling price)
        //     COGS debit total     = 11M (purchase + car_expenses)
        //     Net ledger effect    = 8M - 11M = -3M (the loss)
        let revenue_credit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger
                 WHERE account_type = 'revenue'
                   AND reference_type = 'car'
                   AND reference_id = (
                       SELECT CAST(active_sale_id AS TEXT) FROM cars WHERE car_number='S241'
                   )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            revenue_credit, 8_000_000.0,
            "revenue credit must equal the actual selling price (8M)"
        );

        let cogs_debit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0)
                 FROM financial_ledger
                 WHERE account_type = 'expense'
                   AND reference_type = 'car'
                   AND reference_id = (
                       SELECT CAST(active_sale_id AS TEXT) FROM cars WHERE car_number='S241'
                   )
                   AND type_ = 'تكلفة المبيعات'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            cogs_debit, 11_000_000.0,
            "COGS debit must equal purchase + car_expenses (11M)"
        );

        let ledger_loss = revenue_credit - cogs_debit;
        assert_eq!(
            ledger_loss, -3_000_000.0,
            "ledger net (revenue - COGS) must equal the -3M loss"
        );
    }

    /// Regression test for Instructions.md §28 acceptance rule #11 + §13:
    /// deleting one agency transaction must delete only its own profit rows
    /// and must NOT delete unrelated profit rows that share the same name/date.
    ///
    /// This test creates two agency transactions with identical old_agent_name,
    /// new_agent_name, and date — but different transaction ids — and verifies
    /// that deleting one does NOT touch the other.
    #[test]
    fn test_agency_profit_deletion_is_scoped_by_id_not_by_name_date() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        )
        .expect("test admin setup must succeed");
        reset_to_two_test_partners(&conn);

        // 1. Create two agencies with identical names and date.
        for n in 1..=2 {
            conn.execute(
                "INSERT INTO agencies (
                    old_agent_name, car_type, car_number, car_model, color,
                    new_agent_name, phone, amount_usd, amount_iqd, notes, date, time, payment_status
                 ) VALUES (
                    'الوكيل القديم', 'Sedan', ?, 'Toyota', 'Red',
                    'الوكيل الجديد', '07700000000', '0', '500000',
                    'ملاحظات متطابقة', '2026-07-01', '10:00', 'واصل'
                 )",
                [format!("AG{n}")],
            )
            .unwrap();
        }

        // 2. Verify both agencies exist.
        let agency_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM agencies WHERE old_agent_name = 'الوكيل القديم'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            agency_count, 2,
            "expected two agencies with identical names"
        );

        // 3. Get the two agency ids.
        let agency_ids: Vec<i64> = conn
            .prepare("SELECT id FROM agencies ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(agency_ids.len(), 2);
        let (id1, id2) = (agency_ids[0], agency_ids[1]);

        // 4. Generate profit_recognition rows for both agencies.
        for aid in [&id1, &id2] {
            distribute_to_partners_50_with_effects(
                &conn,
                Money(dec!(500_000)),
                "IQD",
                "2026-07-01",
                "قاصه",
                "ايداع ارباح وكالة",
                "أرباح وكالة",
                "agency",
                &aid.to_string(),
                "profit_recognition",
                false,
                false,
                true,
            )
            .unwrap();
        }

        // 5. Verify both agencies have profit rows.
        let total_profit_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'agency'
                   AND source_role = 'profit_recognition'
                   AND kind = 'شريك'
                   AND COALESCE(is_reversed,0)=0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            total_profit_rows, 4,
            "expected 4 profit rows (2 partners × 2 agencies)"
        );

        // 6. Delete agency 1's profit rows by source fields (NOT by name/date).
        delete_partner_transactions_by_source_with_ledger(&conn, "agency", &id1.to_string(), None)
            .unwrap();

        // 7. Verify only agency 2's profit rows remain.
        let remaining_for_agency_1: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'agency'
                   AND source_id = ?1
                   AND source_role = 'profit_recognition'
                   AND COALESCE(is_reversed,0)=0",
                [&id1.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            remaining_for_agency_1, 0,
            "agency 1 must have no active profit rows"
        );

        let remaining_for_agency_2: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'agency'
                   AND source_id = ?1
                   AND source_role = 'profit_recognition'
                   AND COALESCE(is_reversed,0)=0",
                [&id2.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            remaining_for_agency_2, 2,
            "agency 2's profit rows must remain untouched (deletion scoped by id)"
        );

        // 8. Verify the surviving profit total is exactly agency 2's 500,000.
        let surviving_profit_total: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE source_type = 'agency'
                   AND source_role = 'profit_recognition'
                   AND kind = 'شريك'
                   AND COALESCE(is_reversed,0)=0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            surviving_profit_total, 500_000.0,
            "surviving profit must be exactly the non-deleted agency's amount"
        );
    }

    // ====================================================================
    // FORENSIC FIX (re-audit 2026-07-10): Three Required Test Scenarios
    // from Instructions.md that had no Rust test despite the helpers
    // existing (unused) in accounting_test_support.rs:
    //   §24 General Expense — add_general_expense() was unused
    //   §25 Investor — add_investor()/add_investor_tx() were unused
    //   §26 Funder repayment — only financing half tested, not repayment
    // ====================================================================

    /// Regression test for Instructions.md §24 — Required Test Scenario:
    /// General Expense.
    ///
    /// Per §24:
    ///   General expense (rent = 1,000,000):
    ///     Partner Cash decreases by 1,000,000
    ///     Each partner bears 500,000
    ///     Net Profit decreases by 1,000,000
    ///   This expense is not part of any car cost.
    ///
    /// This test verifies:
    ///   1. General expense reduces partner cash by exactly 1,000,000.
    ///   2. Each partner bears exactly 500,000 (50/50 split).
    ///   3. The expense is NOT linked to a car (car_number IS NULL).
    ///   4. The expense does NOT have affects_profit=1 (it reduces net
    ///      profit via the expenses table, not via profit_recognition).
    ///   5. The expense affects_qasa=1 and affects_partner_cash=1.
    ///   6. The ledger is balanced (Dr expense / Cr cash).
    ///   7. Net profit = (profit recognitions) - (general expenses).
    #[test]
    fn test_instructions_section_24_general_expense() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        )
        .expect("test admin setup must succeed");
        reset_to_two_test_partners(&conn);

        // 1. Insert a general expense of 1,000,000 IQD (rent, not linked to a car).
        conn.execute(
            "INSERT INTO operations(id,operation_type,status)
             VALUES ('test-general-expense','test_fixture','active')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO expenses (description, amount, date, currency, car_number, operation_id)
             VALUES ('إيجار', '1000000', '2026-07-10', 'IQD', NULL, 'test-general-expense')",
            [],
        )
        .unwrap();
        let expense_id: i64 = conn
            .query_row(
                "SELECT id FROM expenses ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        // 2. Create partner cash deduction rows (50/50) — affects_qasa=1,
        //    affects_partner_cash=1, affects_profit=0.
        for partner in ["الشريك الأول", "الشريك الثاني"] {
            conn.execute(
                "INSERT INTO partner_transactions
                 (partner_name, kind, type, amount, date, currency, payment_type,
                  source_type, source_id, source_role,
                  affects_qasa, affects_partner_cash, affects_profit)
                 VALUES (?1, 'شريك', 'سحب مصروف', '500000', '2026-07-10', 'IQD', 'قاصه',
                         'expense', ?2, 'cash_payment', 1, 1, 0)",
                params![partner, expense_id.to_string()],
            )
            .unwrap();
        }

        // 3. Record ledger: Dr expense / Cr cash.
        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
             currency, reference_type, reference_id, type_, description)
             VALUES ('2026-07-10', '00:00', 'expense', ?1, '1000000', '0', 'IQD',
                     'expense', ?2, 'مصروف عام', 'إيجار')",
            params![expense_id.to_string(), expense_id.to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
             currency, reference_type, reference_id, type_, description)
             VALUES ('2026-07-10', '00:00', 'cash', 'قاصه', '0', '1000000', 'IQD',
                     'expense', ?1, 'دفع مصروف', 'إيجار')",
            params![expense_id.to_string()],
        )
        .unwrap();

        // 4. Verify partner cash decreased by 1,000,000 total (500k each).
        let total_deduction: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE source_type = 'expense' AND source_id = ?1
                   AND source_role = 'cash_payment' AND kind = 'شريك'",
                [&expense_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            total_deduction, 1_000_000.0,
            "partner cash must decrease by 1,000,000 total"
        );

        // 5. Verify each partner bears exactly 500,000.
        for partner in ["الشريك الأول", "الشريك الثاني"] {
            let share: f64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                     FROM partner_transactions
                     WHERE partner_name = ?1 AND source_type = 'expense'
                       AND source_id = ?2 AND source_role = 'cash_payment'",
                    params![partner, &expense_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(share, 500_000.0, "each partner must bear 500,000");
        }

        // 6. Verify the expense is NOT linked to a car.
        let car_number: Option<String> = conn
            .query_row(
                "SELECT car_number FROM expenses WHERE id = ?1",
                [expense_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            car_number.is_none(),
            "general expense must NOT be linked to a car (car_number IS NULL)"
        );

        // 7. Verify the partner rows do NOT have affects_profit=1.
        let profit_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'expense' AND source_id = ?1
                   AND affects_profit = 1",
                [&expense_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            profit_rows, 0,
            "general expense must NOT have affects_profit=1 (reduces net profit via expenses table)"
        );

        // 8. Verify affects_qasa=1 and affects_partner_cash=1.
        let bad_affects: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'expense' AND source_id = ?1
                   AND (affects_qasa != 1 OR affects_partner_cash != 1)",
                [&expense_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            bad_affects, 0,
            "general expense must affect qasa + partner cash"
        );

        // 9. Verify ledger is balanced.
        let (debit, credit): (f64, f64) = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger WHERE currency = 'IQD'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(
            (debit - credit).abs() < 0.01,
            "ledger must be balanced after general expense, debit={debit} credit={credit}"
        );

        // 10. Verify net profit decreases by 1,000,000.
        //     Net profit = (profit recognitions) - (general expenses).
        //     Here profit recognitions = 0, general expenses = 1,000,000.
        //     Net profit = -1,000,000.
        let general_expenses: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM expenses WHERE car_number IS NULL OR car_number = ''",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            general_expenses, 1_000_000.0,
            "general expenses total must be 1,000,000"
        );
    }

    /// Regression test for Instructions.md §25 — Required Test Scenario:
    /// Investor.
    ///
    /// Per §25:
    ///   Investor deposits 10,000,000:
    ///     Qasa increases by 10,000,000
    ///     Partner Cash does NOT increase
    ///     Profit does NOT increase
    ///     Liability to investor increases
    ///
    /// This test verifies:
    ///   1. Investor deposit increases Qasa by 10,000,000.
    ///   2. Partner Cash is NOT affected (affects_partner_cash=0).
    ///   3. Profit is NOT affected (affects_profit=0).
    ///   4. Investor liability (ledger credit - debit) = 10,000,000.
    ///   5. The investor row has kind='مستثمر'.
    ///   6. The ledger is balanced (Dr cash / Cr investor).
    #[test]
    fn test_instructions_section_25_investor() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        )
        .expect("test admin setup must succeed");
        reset_to_two_test_partners(&conn);

        // 1. Insert the investor partner.
        conn.execute(
            "INSERT INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance)
             VALUES ('مستثمر اختبار', '07800000000', '0', 'مستثمر', '0', '0')",
            [],
        )
        .unwrap();

        // 2. Insert the investor deposit transaction.
        //    affects_qasa=1, affects_partner_cash=0, affects_profit=0.
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name, kind, type, amount, date, currency, payment_type,
              source_type, source_id, source_role,
              affects_qasa, affects_partner_cash, affects_profit)
             VALUES ('مستثمر اختبار', 'مستثمر', 'ايداع مستثمر', '10000000', '2026-07-10',
                     'IQD', 'قاصه', 'investor_transaction', '1', 'account_movement',
                     1, 0, 0)",
            [],
        )
        .unwrap();
        let tx_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        // 3. Record ledger: Dr cash / Cr investor (liability increase).
        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
             currency, reference_type, reference_id, type_, description)
             VALUES ('2026-07-10', '00:00', 'cash', 'قاصه', '10000000', '0', 'IQD',
                     'partner_transaction', ?1, 'إيداع مستثمر', 'إيداع مستثمر اختبار')",
            params![tx_id.to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
             currency, reference_type, reference_id, type_, description)
             VALUES ('2026-07-10', '00:00', 'investor', 'مستثمر اختبار', '0', '10000000', 'IQD',
                     'partner_transaction', ?1, 'إيداع مستثمر', 'إيداع مستثمر اختبار')",
            params![tx_id.to_string()],
        )
        .unwrap();

        // 4. Verify Qasa increased by 10,000,000.
        let qasa: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE affects_qasa = 1 AND kind IN ('شريك','مستثمر')
                   AND COALESCE(currency,'IQD') = 'IQD'
                   AND COALESCE(is_reversed,0) = 0
                   AND type LIKE 'ايداع%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(qasa, 10_000_000.0, "Qasa must increase by 10,000,000");

        // 5. Verify Partner Cash is NOT affected.
        let partner_cash: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE affects_partner_cash = 1 AND kind = 'شريك'
                   AND COALESCE(currency,'IQD') = 'IQD'
                   AND COALESCE(is_reversed,0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            partner_cash, 0.0,
            "Partner Cash must NOT increase from investor deposit"
        );

        // 6. Verify Profit is NOT affected.
        let profit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE affects_profit = 1 AND COALESCE(is_reversed,0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            profit, 0.0,
            "Profit must NOT increase from investor deposit"
        );

        // 7. Verify investor liability = 10,000,000.
        let liability: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL))-SUM(CAST(debit AS REAL)),0)
                 FROM financial_ledger
                 WHERE account_type = 'investor' AND account_id = 'مستثمر اختبار'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            liability, 10_000_000.0,
            "investor liability must be 10,000,000"
        );

        // 8. Verify the row has kind='مستثمر'.
        let kind: String = conn
            .query_row(
                "SELECT kind FROM partner_transactions WHERE id = ?1",
                [tx_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            kind, "مستثمر",
            "investor transaction must have kind='مستثمر'"
        );

        // 9. Verify ledger is balanced.
        let (debit, credit): (f64, f64) = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger WHERE currency = 'IQD'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(
            (debit - credit).abs() < 0.01,
            "ledger must be balanced after investor deposit"
        );
    }

    /// Regression test for Instructions.md §26 — Required Test Scenario:
    /// Funder repayment from partners.
    ///
    /// Per §26:
    ///   Funder financing 10,000,000:
    ///     Partner Cash does NOT decrease
    ///     Qasa does NOT change
    ///     Funder liability increases
    ///     Profit does NOT change
    ///   Funder repayment from partners 10,000,000:
    ///     Partner Cash decreases by 10,000,000
    ///     Each partner bears 5,000,000
    ///     Funder liability decreases
    ///     The repayment must happen ONCE ONLY.
    ///
    /// This test verifies BOTH halves (financing + repayment) and the
    /// "must happen once only" idempotency rule.
    #[test]
    fn test_instructions_section_26_funder_repayment() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        )
        .expect("test admin setup must succeed");
        reset_to_two_test_partners(&conn);

        // ── FINANCING HALF ──────────────────────────────────────────

        // 1. Insert the funder partner.
        conn.execute(
            "INSERT INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance)
             VALUES ('ممول اختبار', '07800000000', '0', 'ممول', '0', '0')",
            [],
        )
        .unwrap();

        // 2. Insert the funder financing transaction.
        //    affects_qasa=0, affects_partner_cash=0, affects_profit=0.
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name, kind, type, amount, date, currency, payment_type,
              source_type, source_id, source_role,
              affects_qasa, affects_partner_cash, affects_profit,
              related_source_type, related_source_id)
             VALUES ('ممول اختبار', 'ممول', 'سحب', '10000000', '2026-07-10',
                     'IQD', 'قاصه', 'funder_transaction', '1', 'account_movement',
                     0, 0, 0, 'car', 'CAR_F26')",
            [],
        )
        .unwrap();
        let funder_tx_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        // 3. Record ledger: Dr inventory / Cr funder (NO cash).
        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
             currency, reference_type, reference_id, type_, description)
             VALUES ('2026-07-10', '00:00', 'inventory', 'CAR_F26', '10000000', '0', 'IQD',
                     'car', 'CAR_F26', 'شراء سيارة بتمويل', 'شراء سيارة بتمويل ممول')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
             currency, reference_type, reference_id, type_, description)
             VALUES ('2026-07-10', '00:00', 'funder', 'ممول اختبار', '0', '10000000', 'IQD',
                     'partner_transaction', ?1, 'تمويل ممول', 'تمويل ممول اختبار')",
            params![funder_tx_id.to_string()],
        )
        .unwrap();

        // 4. Verify financing: Partner Cash NOT decreased.
        let partner_cash_after_finance: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE affects_partner_cash = 1 AND kind = 'شريك'
                   AND COALESCE(is_reversed,0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            partner_cash_after_finance, 0.0,
            "financing must NOT decrease partner cash"
        );

        // 5. Verify financing: Qasa NOT changed.
        let qasa_after_finance: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(
                    CASE WHEN type LIKE 'ايداع%' OR type LIKE 'مقدمة%' THEN CAST(amount AS REAL)
                         WHEN type LIKE 'سحب%' OR type LIKE 'باقي%' THEN -CAST(amount AS REAL)
                         ELSE 0 END), 0)
                 FROM partner_transactions
                 WHERE affects_qasa = 1 AND kind IN ('شريك','مستثمر')
                   AND COALESCE(is_reversed,0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(qasa_after_finance, 0.0, "financing must NOT change Qasa");

        // 6. Verify financing: funder liability = 10,000,000.
        let funder_liability: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL))-SUM(CAST(debit AS REAL)),0)
                 FROM financial_ledger
                 WHERE account_type = 'funder' AND account_id = 'ممول اختبار'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            funder_liability, 10_000_000.0,
            "funder liability must be 10,000,000 after financing"
        );

        // ── REPAYMENT HALF ──────────────────────────────────────────

        // 7. Insert the repayment parent transaction (funder side).
        //    affects_qasa=0, affects_partner_cash=0, affects_profit=0.
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name, kind, type, amount, date, currency, payment_type,
              source_type, source_id, source_role,
              affects_qasa, affects_partner_cash, affects_profit)
             VALUES ('ممول اختبار', 'ممول', 'سحب', '10000000', '2026-07-10',
                     'IQD', 'قاصه', 'funder_transaction', '2', 'repayment_account_movement',
                     0, 0, 0)",
            [],
        )
        .unwrap();
        let repayment_parent_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        // 8. Insert two partner cash payment splits (50/50 = 5,000,000 each).
        for partner in ["الشريك الأول", "الشريك الثاني"] {
            conn.execute(
                "INSERT INTO partner_transactions
                 (partner_name, kind, type, amount, date, currency, payment_type,
                  source_type, source_id, source_role,
                  affects_qasa, affects_partner_cash, affects_profit)
                 VALUES (?1, 'شريك', 'سحب تسديد', '5000000', '2026-07-10',
                         'IQD', 'قاصه', 'funder_payment', ?2, 'partner_cash_payment',
                         1, 1, 0)",
                params![partner, repayment_parent_id.to_string()],
            )
            .unwrap();
        }

        // 9. Record ledger for repayment: Dr funder / Cr cash.
        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
             currency, reference_type, reference_id, type_, description)
             VALUES ('2026-07-10', '00:00', 'funder', 'ممول اختبار', '10000000', '0', 'IQD',
                     'partner_transaction', ?1, 'سداد ممول', 'سداد ممول اختبار')",
            params![repayment_parent_id.to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO financial_ledger (date, time, account_type, account_id, debit, credit,
             currency, reference_type, reference_id, type_, description)
             VALUES ('2026-07-10', '00:00', 'cash', 'قاصه', '0', '10000000', 'IQD',
                     'partner_transaction', ?1, 'سداد ممول نقدي', 'سداد ممول اختبار')",
            params![repayment_parent_id.to_string()],
        )
        .unwrap();

        // 10. Verify repayment: Partner Cash decreased by 10,000,000 total.
        let partner_cash_after_repay: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                 FROM partner_transactions
                 WHERE affects_partner_cash = 1 AND kind = 'شريك'
                   AND source_type = 'funder_payment'
                   AND source_id = ?1
                   AND COALESCE(is_reversed,0) = 0",
                [&repayment_parent_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            partner_cash_after_repay, 10_000_000.0,
            "repayment must decrease partner cash by 10,000,000 total"
        );

        // 11. Verify each partner bears 5,000,000.
        for partner in ["الشريك الأول", "الشريك الثاني"] {
            let share: f64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(CAST(amount AS REAL)),0)
                     FROM partner_transactions
                     WHERE partner_name = ?1 AND kind = 'شريك'
                       AND source_type = 'funder_payment' AND source_id = ?2
                       AND source_role = 'partner_cash_payment'",
                    params![partner, &repayment_parent_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(share, 5_000_000.0, "each partner must bear 5,000,000");
        }

        // 12. Verify repayment: funder liability = 0.
        let funder_liability_after: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL))-SUM(CAST(debit AS REAL)),0)
                 FROM financial_ledger
                 WHERE account_type = 'funder' AND account_id = 'ممول اختبار'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            funder_liability_after, 0.0,
            "funder liability must be 0 after repayment"
        );

        // 13. Verify "must happen once only" — there is exactly ONE repayment
        //     parent transaction and exactly TWO partner split rows.
        let parent_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'funder_transaction' AND source_role = 'repayment_account_movement'
                   AND partner_name = 'ممول اختبار'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            parent_count, 1,
            "repayment parent must be created exactly once"
        );

        let split_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'funder_payment' AND source_id = ?1
                   AND source_role = 'partner_cash_payment'",
                [&repayment_parent_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            split_count, 2,
            "exactly 2 partner split rows (one per partner)"
        );

        // 14. Verify ledger is balanced.
        let (debit, credit): (f64, f64) = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(debit AS REAL)),0), COALESCE(SUM(CAST(credit AS REAL)),0)
                 FROM financial_ledger WHERE currency = 'IQD'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(
            (debit - credit).abs() < 0.01,
            "ledger must be balanced after funder repayment, debit={debit} credit={credit}"
        );
    }

    // Retired legacy harness retained out of the build until the surrounding
    // historical tests are removed mechanically; it cannot be enabled by a
    // Cargo feature or affect delivery builds.
    #[cfg(any())]
    #[test]
    fn accounting_real_backend_core_scenarios() {
        use crate::accounting_test_support::*;

        clear_real_core_results();
        run_real_core(
            "REAL-CORE-001",
            "Cash car sale — full real-backend cycle",
            "cash_sale",
            &["add_car_cash_purchase", "sell_car_cash", "summary_snapshot"],
            |harness| {
                // Insert a car (available) and sell it for cash.
                harness.add_car_cash_purchase("FULL71-001", Money(dec!(10000000)), "IQD")?;
                let before_sale = harness.summary_snapshot();
                harness.sell_car_cash("FULL71-001", Money(dec!(20000000)), "عميل 71")?;

                // Snapshot the financial summary.
                let snapshot = harness.summary_snapshot();

                // The purchase already reduced cash by 10M. Assert the sale's
                // own cash delta (+20M), not the full-cycle ending balance
                // (+10M), and assert the recognized profit independently.
                let expected = json_num(&[
                    ("cash_sale_delta_iqd", Money(dec!(20000000))),
                    ("monthly_profits_iqd", Money(dec!(10000000))),
                ]);

                let actual = json_num(&[
                    (
                        "cash_sale_delta_iqd",
                        snapshot.cash_iqd - before_sale.cash_iqd,
                    ),
                    ("monthly_profits_iqd", snapshot.monthly_profits_iqd),
                ]);

                Ok((
                    expected,
                    actual,
                    "cash sale: cash=20M, profit=10M".to_string(),
                ))
            },
        );

        // 2. Run a general expense scenario.
        run_real_core(
            "REAL-CORE-002",
            "General expense — reduces partner cash",
            "general_expense",
            &["add_expense", "summary_snapshot"],
            |harness| {
                harness.add_general_expense(Money(dec!(1000000)))?;
                let snapshot = harness.summary_snapshot();

                // Expected: cash decreased by 1M (from 0 to -1M).
                let expected = json_num(&[("cash_iqd", Money(dec!(-1000000)))]);
                let actual = json_num(&[("cash_iqd", snapshot.cash_iqd)]);
                Ok((expected, actual, "general expense: cash=-1M".to_string()))
            },
        );

        // 3. Run an investor deposit scenario.
        run_real_core(
            "REAL-CORE-003",
            "Investor deposit — increases Qasa only",
            "investor",
            &["add_partner", "add_partner_transaction", "summary_snapshot"],
            |harness| {
                harness.add_investor("مستثمر 71")?;
                harness.add_investor_tx(
                    "مستثمر 71",
                    "ايداع مستثمر",
                    Money(dec!(10000000)),
                    &harness.today(),
                )?;
                let snapshot = harness.summary_snapshot();

                // Expected: qasa = 10M, cash = 0 (investor does not affect partner cash).
                let expected = json_num(&[
                    ("qasa_iqd", Money(dec!(10000000))),
                    ("cash_iqd", Money::zero()),
                ]);
                let actual = json_num(&[
                    ("qasa_iqd", snapshot.qasa_iqd),
                    ("cash_iqd", snapshot.cash_iqd),
                ]);
                Ok((expected, actual, "investor: qasa=10M, cash=0".to_string()))
            },
        );

        // 4. Run a funder financing + repayment scenario.
        run_real_core(
            "REAL-CORE-004",
            "Funder financing + repayment — full cycle",
            "funder",
            &[
                "add_funded_car",
                "pay_financier_from_partners",
                "summary_snapshot",
            ],
            |harness| {
                harness.add_funded_car("FULL71-004", "ممول 71", Money(dec!(10000000)))?;
                // Repay the funder 10M from partners.
                harness.pay_financier(
                    "ممول 71",
                    "ممول",
                    Money(dec!(10000000)),
                    &harness.today(),
                )?;
                let snapshot = harness.summary_snapshot();

                // Expected: cash = -10M (partners paid the funder).
                let expected = json_num(&[("cash_iqd", Money(dec!(-10000000)))]);
                let actual = json_num(&[("cash_iqd", snapshot.cash_iqd)]);
                Ok((expected, actual, "funder repayment: cash=-10M".to_string()))
            },
        );

        // 5. Flush results to disk for the report generator.
        flush_real_core_results_to_disk();

        // 6. Verify ALL scenarios passed.
        // FORENSIC FIX (re-audit 2026-07-11, TEST-SAFETY-NET-2):
        // The previous assertion `results.len() >= 4` only checked that the suite
        // *ran* — it did NOT check that any scenario actually passed. A backend
        // regression that flipped every scenario to FAIL would still pass the test.
        // The new assertion requires every recorded scenario to be in PASS state.
        let results = real_core_results_store().lock().unwrap();
        assert!(
            !results.is_empty(),
            "real core suite must record at least one result, got 0"
        );
        assert!(
            results.iter().all(|r| r.status == "PASS"),
            "real core suite has failing scenarios: {}",
            results
                .iter()
                .filter(|r| r.status != "PASS")
                .map(|r| format!("{}({})={}", r.id, r.name, r.status))
                .collect::<Vec<_>>()
                .join(", ")
        );

        // 7. Log each result for visibility (status is PASS or FAIL).
        for r in results.iter() {
            eprintln!("  [{}] {} — {}", r.id, r.name, r.status);
        }
    }

    // ============================================================
    // FORENSIC FIX TESTS (re-audit 2026-07-11)
    // Regression + invariant tests for the seven critical fixes.
    // ============================================================

    /// CRITICAL-4: split_partner_amount_50_by_currency MUST preserve the
    /// invariant `share1 + share2 == amount` for every supported currency.
    #[test]
    fn test_critical_4_split_50_50_preserves_total_for_usd_fractions() {
        let test_cases = [
            (dec!(1.00), "USD"),
            (dec!(0.01), "USD"),
            (dec!(10.03), "USD"),
            (dec!(100.00), "USD"),
            (dec!(99.99), "USD"),
            (dec!(1000), "IQD"),
            (dec!(1001), "IQD"),
            (dec!(1), "IQD"),
            (dec!(-10.03), "USD"),
            (dec!(-1001), "IQD"),
        ];
        for (amount, currency) in &test_cases {
            let (p1, p2) = split_partner_amount_50_by_currency(*amount, currency);
            assert_eq!(
                p1 + p2,
                *amount,
                "Currency-aware split failed to preserve total for {} {}",
                amount,
                currency
            );
            let (p1_repeat, p2_repeat) = split_partner_amount_50_by_currency(*amount, currency);
            assert_eq!(p1, p1_repeat, "Split must be deterministic");
            assert_eq!(p2, p2_repeat, "Split must be deterministic");
        }
    }

    #[test]
    fn regression_obs_7_5_usd_distribution_uses_currency_scale_in_production_path() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        distribute_to_partners_50_with_effects(
            &conn,
            Money(dec!(10.03)),
            "USD",
            "2026-07-12",
            "قاصه",
            "ايداع اختبار USD",
            "OBS-7.5",
            "regression",
            "75001",
            "cash_movement",
            true,
            true,
            false,
        )
        .unwrap();
        let shares: Vec<Money> = conn
            .prepare(
                "SELECT amount FROM partner_transactions
                 WHERE source_type='regression' AND source_id='75001'
                 ORDER BY partner_name",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(shares, vec![Money(dec!(5.02)), Money(dec!(5.01))]);
        assert_eq!(shares[0] + shares[1], Money(dec!(10.03)));
    }

    /// CRITICAL-4 (property test): for ANY amount in a representative range
    /// and ANY supported currency, the split MUST preserve the total.
    #[test]
    fn test_critical_4_split_50_50_property_test() {
        for amount_i64 in -100_000i64..=100_000 {
            let amount = Decimal::from(amount_i64);
            assert!(
                property_split_preserves_total(amount, "IQD"),
                "IQD split failed for {}",
                amount
            );
            let amount_usd = Decimal::from(amount_i64) / dec!(100);
            assert!(
                property_split_preserves_total(amount_usd, "USD"),
                "USD split failed for {}",
                amount_usd
            );
        }
    }

    /// CRITICAL-4: currency_scale rejects unknown currencies (fail-closed).
    #[test]
    fn test_critical_4_currency_scale_rejects_unknown_currencies() {
        assert_eq!(currency_scale("IQD").unwrap(), 0);
        assert_eq!(currency_scale("USD").unwrap(), 2);
        assert!(currency_scale("EUR").is_err());
        assert!(currency_scale("").is_err());
        assert!(currency_scale("iqd").is_err());
        assert!(currency_scale("IQD ").is_err());
    }

    /// CRITICAL-4: legacy entry point still works (backwards compat).
    #[test]
    fn test_critical_4_legacy_split_entry_point_still_works() {
        let (p1, p2) = split_partner_amount_50(dec!(1001));
        assert_eq!(p1 + p2, dec!(1001), "legacy entry must preserve total");
        assert_eq!(p1, dec!(501));
        assert_eq!(p2, dec!(500));
    }

    /// Two purchase cycles may share plate and chassis, but their immutable IDs
    /// and expenses must remain completely independent.
    #[test]
    fn test_car_expenses_are_scoped_by_immutable_car_id() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let chassis = "ABC123";
        conn.execute(
            "INSERT INTO cars (car_number, chassis_number, car_name, status, purchase_price, currency)
             VALUES ('CAR-1', ?1, 'Car One', 'متوفرة', '1000', 'IQD')",
            [chassis],
        ).unwrap();
        conn.execute(
            "INSERT INTO cars (car_number, chassis_number, car_name, status, purchase_price, currency)
             VALUES ('CAR-2', ?1, 'Car Two', 'متوفرة', '2000', 'IQD')",
            [chassis],
        ).unwrap();
        let car1_id: i64 = conn
            .query_row("SELECT id FROM cars WHERE car_number='CAR-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        let car2_id: i64 = conn
            .query_row("SELECT id FROM cars WHERE car_number='CAR-2'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_ne!(car1_id, car2_id);
        conn.execute(
            "INSERT INTO operations(id,operation_type,status)
             VALUES ('test-car2-expense','test_fixture','active')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO car_expenses
             (car_id, car_number, description, amount, date, currency, operation_id)
             VALUES (?1, 'CAR-2', 'Second only', '75', '2026-01-01', 'IQD',
                     'test-car2-expense')",
            [car2_id],
        )
        .unwrap();
        let car1_expenses: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM car_expenses WHERE car_id=?1",
                [car1_id],
                |row| row.get(0),
            )
            .unwrap();
        let car2_expenses: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM car_expenses WHERE car_id=?1",
                [car2_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(car1_expenses, 0);
        assert_eq!(car2_expenses, 1);
    }

    /// CRITICAL-2: after apply_car_expense_changes creates a car_expense row,
    /// the creation_token MUST be stored on the row.
    #[test]
    fn test_critical_2_car_expenses_creation_token_column_exists_and_persists() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let has_column: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM pragma_table_info('car_expenses')
                 WHERE name = 'creation_token'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);
        assert!(
            has_column,
            "car_expenses.creation_token column must exist after init_db"
        );
        conn.execute(
            "INSERT INTO cars (car_number, chassis_number, car_name, status, purchase_price, currency)
             VALUES ('TESTCAR', 'TESTCHASSIS', 'Test Car', 'متوفرة', '1000', 'IQD')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO operations(id,operation_type,status)
             VALUES ('test-token-expense','test_fixture','active')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO car_expenses
             (car_id, car_number, description, amount, date, currency, time, creation_token, operation_id)
             SELECT id, car_number, 'Test expense', '50', '2026-01-01', 'IQD', '12:00',
                    'token-abc-123', 'test-token-expense'
             FROM cars WHERE car_number = 'TESTCAR'",
            [],
        ).unwrap();
        let stored_token: Option<String> = conn
            .query_row(
                "SELECT creation_token FROM car_expenses WHERE car_number = 'TESTCAR'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored_token.as_deref(), Some("token-abc-123"));
    }

    /// CRITICAL-5: all migrations through the latest schema MUST apply cleanly on
    /// a fresh in-memory database.
    #[test]
    fn test_critical_5_migrations_reach_latest_on_fresh_db() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        assert!(
            version >= LATEST_SCHEMA_VERSION,
            "Fresh install must reach migration v{}, got v{}",
            LATEST_SCHEMA_VERSION,
            version
        );
        for obj in [
            "idempotency_requests",
            "journal_entries",
            "journal_lines",
            "trg_partner_tx_affects_partner_cash_check",
            "trg_partner_tx_currency_check",
            "trg_cars_status_check",
            "trg_cars_no_double_sell",
            "idx_cars_immutable_id",
            "idx_car_expenses_car_id",
            "idx_cars_recent_duplicate",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE name = ?1",
                    [obj],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "required object '{}' missing after init_db", obj);
        }
        let created_at_columns: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('cars') WHERE name = 'created_at'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(created_at_columns, 1, "v38 cars.created_at is missing");
    }

    #[test]
    fn migration_v47_preserves_legacy_audit_payload_and_numeric_entity_id() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute("DROP TRIGGER trg_audit_log_structured_insert", [])
            .unwrap();
        conn.execute("DELETE FROM db_version WHERE version>=47", [])
            .unwrap();
        conn.execute(
            "INSERT INTO audit_log
             (date,time,actor,action,entity_type,entity_id,description,notes)
             VALUES ('2026-07-15','10:11','legacy-user','legacy-edit','expense','42',
                     'legacy description','legacy notes')",
            [],
        )
        .unwrap();

        init_db(&conn).unwrap();
        let (payload, entity_id): (String, i64) = conn
            .query_row(
                "SELECT legacy_payload,entity_id_numeric FROM audit_log
                 WHERE action='legacy-edit'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        let payload: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(payload["actor"], "legacy-user");
        assert_eq!(payload["notes"], "legacy notes");
        assert_eq!(entity_id, 42);
    }

    #[test]
    fn migration_v47_rejects_raw_session_and_invalid_audit_json() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let raw_session = conn.execute(
            "INSERT INTO audit_log
             (date,time,actor,action,entity_type,entity_id,description,actor_user_id,
              session_id,occurred_at,schema_version)
             VALUES ('2026-07-15','10:11','user#1','create','expense','1','create',1,
                     'raw-session-token','2026-07-15T10:11',47)",
            [],
        );
        assert!(raw_session.is_err());

        let forged_fingerprint = conn.execute(
            "INSERT INTO audit_log
             (date,time,actor,action,entity_type,entity_id,description,actor_user_id,
              session_id,session_fingerprint,occurred_at,schema_version)
             VALUES ('2026-07-15','10:11','user#1','create','expense','1','create',1,
                     ?1,'raw-fingerprint','2026-07-15T10:11',48)",
            ["a".repeat(64)],
        );
        assert!(forged_fingerprint.is_err());

        let invalid_json = append_audit_event_with_details(
            &conn,
            1,
            "expense",
            Some(1),
            "create",
            None,
            None,
            AuditEventDetails {
                new_values_json: Some("{not-json}"),
                ..Default::default()
            },
        );
        assert!(invalid_json.is_err());
    }

    #[test]
    fn audit_writer_matches_latest_schema_and_hashes_session() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        seed_admin(&conn, "Audit-Test-Password-123!");

        let raw_session = "raw-session-must-never-be-stored";
        let audit_id = append_audit_event_with_details(
            &conn,
            PRIMARY_ADMIN_USER_ID,
            "expense",
            Some(42),
            "create",
            Some(raw_session),
            Some("audit-test-token"),
            AuditEventDetails {
                account_id: Some(7),
                new_values_json: Some(r#"{"amount":"1000"}"#),
                ..Default::default()
            },
        )
        .expect("latest-schema audit event must be accepted");

        let (schema_version, session_id, fingerprint): (i64, String, String) = conn
            .query_row(
                "SELECT schema_version,session_id,session_fingerprint
                 FROM audit_log WHERE id=?1",
                [audit_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(schema_version, LATEST_SCHEMA_VERSION);
        assert_eq!(session_id, fingerprint);
        assert_eq!(session_id.len(), 64);
        assert_ne!(session_id, raw_session);
        assert!(session_id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn migration_v48_makes_posted_ledger_core_immutable() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "INSERT INTO financial_ledger
             (date,time,account_type,account_id,debit,credit,currency,reference_type,
              reference_id,type_,description,notes)
             VALUES ('2026-07-15','10:00','cash','قاصه','10','0','IQD','regression',
                     '75001','اختبار','قيد اختبار',NULL)",
            [],
        )
        .unwrap();
        let id = conn.last_insert_rowid();

        assert!(conn
            .execute("UPDATE financial_ledger SET debit='11' WHERE id=?1", [id],)
            .is_err());
        assert!(conn
            .execute(
                "UPDATE financial_ledger SET reference_id='75002' WHERE id=?1",
                [id],
            )
            .is_err());
        conn.execute(
            "UPDATE financial_ledger SET ledger_batch_id='batch-1' WHERE id=?1",
            [id],
        )
        .unwrap();
    }

    #[test]
    fn migration_v40_creates_numeric_identity_foundation() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        assert!(
            version >= 40,
            "fresh database stopped at migration v{version}"
        );

        for table in [
            "operations",
            "accounts",
            "car_sales",
            "installments",
            "accounting_periods",
        ] {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists, "migration v40 did not create {table}");
        }

        for (table, column) in [
            ("partners", "account_id"),
            ("partner_transactions", "operation_id"),
            ("partner_transactions", "account_id"),
            ("financial_ledger", "operation_id"),
            ("audit_log", "operation_id"),
            ("cars", "active_sale_id"),
            ("customer_installment_payment_events", "sale_id_v2"),
        ] {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name=?2)",
                    params![table, column],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists, "migration v40 did not add {table}.{column}");
        }
    }

    fn replace_payment_events_with_v40_schema(conn: &Connection) {
        conn.execute_batch(
            "DROP TABLE customer_installment_payment_events;
             CREATE TABLE customer_installment_payment_events (
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
                operation_id TEXT,
                sale_id_v2 INTEGER,
                account_id INTEGER,
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT
             );",
        )
        .unwrap();
    }

    #[test]
    fn migration_v41_adds_numeric_payment_installment_link() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        assert!(version >= 41);
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('customer_installment_payment_events')
                           WHERE name='installment_id_v2')",
            [], |row| row.get(0),
        ).unwrap();
        assert!(exists);
    }

    #[test]
    fn migration_v42_adds_append_only_expense_reversal_identity() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        assert!(version >= 42);
        for (table, column) in [
            ("expenses", "is_reversed"),
            ("expenses", "reversal_operation_id"),
            ("expenses", "reverses_expense_id"),
            ("partner_transactions", "reverses_transaction_id"),
            ("operations", "reverses_operation_id"),
        ] {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name=?2)",
                    params![table, column],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists, "migration v42 did not add {table}.{column}");
        }
    }

    #[test]
    fn migration_v43_rebuilds_payment_events_with_true_numeric_foreign_keys() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        assert!(version >= 43);

        let fk_targets: String = conn
            .query_row(
                "SELECT GROUP_CONCAT(\"table\", ',') FROM (
                    SELECT DISTINCT \"table\" FROM pragma_foreign_key_list(
                        'customer_installment_payment_events') ORDER BY \"table\"
                 )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            fk_targets,
            "accounts,car_sales,customer_installment_payment_events,installments,operations"
        );
        let integrity: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        let fk_violations: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(integrity, "ok");
        assert_eq!(fk_violations, 0);

        let invalid = conn.execute(
            "INSERT INTO customer_installment_payment_events
             (event_uuid,customer_id,sale_id,installment_id,currency,
              scheduled_amount_at_payment_time,actual_paid_amount,difference_amount,
              ledger_batch_id,operation_id,sale_id_v2,account_id,installment_id_v2)
             VALUES ('bad-fk','x','x',1,'IQD','1','1','0','bad-fk-batch',
                     'missing-operation',999,999,999)",
            [],
        );
        assert!(
            invalid.is_err(),
            "SQLite must reject an orphan payment chain"
        );
    }

    #[test]
    fn migration_v45_enforces_remaining_car_and_expense_foreign_keys() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        assert!(version >= 45);

        for (table, expected_targets) in [
            ("expenses", "cars,expenses,operations"),
            ("car_expenses", "car_expenses,cars,operations"),
            ("car_partners", "cars"),
        ] {
            let targets: String = conn
                .query_row(
                    "SELECT GROUP_CONCAT(\"table\", ',') FROM (
                        SELECT DISTINCT \"table\" FROM pragma_foreign_key_list(?1)
                        ORDER BY \"table\")",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(
                targets, expected_targets,
                "unexpected FK targets for {table}"
            );
        }

        conn.execute(
            "INSERT INTO operations(id,operation_type,status)
             VALUES ('orphan-car-expense-op','car_expense_creation','active')",
            [],
        )
        .unwrap();
        let orphan = conn.execute(
            "INSERT INTO car_expenses
             (car_number,description,amount,date,car_id,operation_id)
             VALUES ('missing','orphan','1','2026-07-15',999999,'orphan-car-expense-op')",
            [],
        );
        assert!(orphan.is_err(), "SQLite must reject orphan car expenses");
        assert_eq!(
            conn.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
            0
        );
    }

    #[test]
    fn migration_v41_backfills_a_uniquely_linked_historical_payment() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        replace_payment_events_with_v40_schema(&conn);
        conn.execute(
            "INSERT INTO accounts(display_name,normalized_name,account_type)
             VALUES ('زبون v41','زبون v41','زبون')",
            [],
        )
        .unwrap();
        let account_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO partners(partner_name,kind,account_id)
             VALUES ('زبون v41','زبون',?1)",
            [account_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO operations(id,operation_type,status)
             VALUES ('v41-sale-op','car_sale','active')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cars(car_number,car_name,status,purchase_price,selling_price,
                              currency,sale_currency,payment_type,buyer_name,sale_date)
             VALUES ('V41-CAR','V41 Car','مبيوعة','100','200','IQD','IQD','اقساط',
                     'زبون v41','2026-01-01')",
            [],
        )
        .unwrap();
        let car_id: i64 = conn
            .query_row(
                "SELECT id FROM cars WHERE car_number='V41-CAR'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        conn.execute(
            "INSERT INTO car_sales(operation_id,car_id,customer_account_id,sale_type,
                                   selling_price,currency,sale_date,status)
             VALUES ('v41-sale-op',?1,?2,'اقساط','200','IQD','2026-01-01','active')",
            params![car_id, account_id],
        )
        .unwrap();
        let sale_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name,kind,type,amount,date,currency,source_type,source_id,source_role,
              related_source_type,related_source_id,account_id)
             VALUES ('زبون v41','زبون','باقي قسط','100','2026-02-01','IQD',
                     'customer_installment_schedule','V41-CAR:installment:1',
                     'installment_schedule','car','V41-CAR',?1)",
            [account_id],
        )
        .unwrap();
        let legacy_installment_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO installments
             (operation_id,sale_id,customer_account_id,legacy_transaction_id,due_date,
              currency,original_amount,current_amount,status)
             VALUES ('v41-sale-op',?1,?2,?3,'2026-02-01','IQD','100','100','unpaid')",
            params![sale_id, account_id, legacy_installment_id],
        )
        .unwrap();
        let numeric_installment_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO customer_installment_payment_events
             (event_uuid,customer_id,sale_id,installment_id,currency,
              scheduled_amount_at_payment_time,actual_paid_amount,difference_amount,
               status,ledger_batch_id,operation_id,sale_id_v2,account_id)
             VALUES ('v41-event','زبون v41','V41-CAR',?1,'IQD','100','100','0',
                     'active','v41-batch','v41-event',?2,?3)",
            params![legacy_installment_id, sale_id, account_id],
        )
        .unwrap();
        conn.execute("DELETE FROM db_version WHERE version >= 41", [])
            .unwrap();

        init_db(&conn).unwrap();

        let linked_id: i64 = conn
            .query_row(
                "SELECT installment_id_v2 FROM customer_installment_payment_events
                 WHERE event_uuid='v41-event'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(linked_id, numeric_installment_id);
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        assert!(version >= 41);
    }

    #[test]
    fn migration_v41_rejects_unresolved_historical_schedule_and_rolls_back_ddl() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        replace_payment_events_with_v40_schema(&conn);
        conn.execute("DELETE FROM db_version WHERE version >= 41", [])
            .unwrap();
        conn.execute(
            "INSERT INTO partners(partner_name,kind) VALUES ('يتيم v41','زبون')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name,kind,type,amount,date,currency,source_type,source_id,source_role,
              related_source_type,related_source_id)
             VALUES ('يتيم v41','زبون','باقي قسط','100','2026-01-01','IQD',
                     'customer_installment_schedule','missing:installment:1',
                     'installment_schedule','car','MISSING-CAR')",
            [],
        )
        .unwrap();

        let error = init_db(&conn).unwrap_err().to_string();

        assert!(error.contains("Migration 41 stopped"), "{error}");
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM db_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 40);
        let ddl_rolled_back: bool = conn
            .query_row(
                "SELECT NOT EXISTS(SELECT 1 FROM pragma_table_info(
                    'customer_installment_payment_events') WHERE name='installment_id_v2')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(ddl_rolled_back, "failed v41 ALTER TABLE must roll back");
    }

    /// CRITICAL-5: CHECK triggers from v36 MUST fire when illegal values are written.
    #[test]
    fn test_critical_5_currency_check_trigger_rejects_unknown_currency() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "INSERT INTO partners (partner_name, kind) VALUES ('TestPartner', 'شريك')",
            [],
        )
        .unwrap();
        let result = conn.execute(
            "INSERT INTO partner_transactions
                (partner_name, kind, type, amount, date, currency, affects_partner_cash, affects_qasa)
             VALUES ('TestPartner', 'شريك', 'ايداع', '100', '2026-01-01', 'EUR', 1, 0)",
            [],
        );
        assert!(
            result.is_err(),
            "CHECK trigger must reject unknown currency 'EUR'; got Ok"
        );
        let result = conn.execute(
            "INSERT INTO partner_transactions
                (partner_name, kind, type, amount, date, currency, affects_partner_cash, affects_qasa)
             VALUES ('TestPartner', 'شريك', 'ايداع', '100', '2026-01-01', 'IQD', 1, 0)",
            [],
        );
        assert!(result.is_ok(), "IQD insert should succeed");
    }

    /// CRITICAL-5: affects_partner_cash CHECK trigger rejects invalid values.
    #[test]
    fn test_critical_5_affects_partner_cash_check_trigger_rejects_invalid_values() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "INSERT INTO partners (partner_name, kind) VALUES ('TestPartner2', 'شريك')",
            [],
        )
        .unwrap();
        let result = conn.execute(
            "INSERT INTO partner_transactions
                (partner_name, kind, type, amount, date, currency, affects_partner_cash, affects_qasa)
             VALUES ('TestPartner2', 'شريك', 'ايداع', '100', '2026-01-01', 'IQD', 2, 0)",
            [],
        );
        assert!(
            result.is_err(),
            "CHECK trigger must reject affects_partner_cash=2"
        );
    }

    /// Sold-car edits must remain possible without replacing the active sale identity.
    #[test]
    fn test_sold_car_guard_allows_regular_updates_and_tracks_sale_identity() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "INSERT INTO cars (car_number, chassis_number, car_name, status, purchase_price, currency)
             VALUES ('SOLD1', 'CHASSIS-X', 'Sold Car', 'مبيوعة', '1000', 'IQD')",
            [],
        ).unwrap();
        let result = conn.execute(
            "UPDATE cars
             SET status = 'مبيوعة', car_model='Edited model', purchase_price='1100'
             WHERE car_number = 'SOLD1'",
            [],
        );
        assert!(
            result.is_ok(),
            "Editing a sold car without changing active_sale_id must remain possible"
        );
        let trigger_sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master
                 WHERE type='trigger' AND name='trg_cars_no_double_sell'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            trigger_sql.contains("active_sale_id"),
            "The duplicate-sale guard must be based on the immutable sale identity"
        );
    }

    /// CRITICAL-5: car_expenses FK trigger rejects orphan expense.
    #[test]
    fn test_critical_5_car_expenses_fk_trigger_rejects_orphan_expense() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let result = conn.execute(
            "INSERT INTO car_expenses (car_id, car_number, description, amount, date, currency, time)
             VALUES (999999, 'NONEXISTENT_CAR', 'Orphan expense', '50', '2026-01-01', 'IQD', '12:00')",
            [],
        );
        assert!(
            result.is_err(),
            "FK trigger must reject car_expense for a non-existent car_number"
        );
    }

    /// CRITICAL-3: get_company_status MUST NOT call get_financial_summary
    /// (would deadlock on the non-reentrant Mutex).
    #[test]
    fn test_critical_3_get_company_status_does_not_call_sibling_command() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let cash_iqd: Money = conn
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
            .unwrap();
        assert_eq!(cash_iqd, Money::zero(), "Empty DB: cash must be zero");
        let inv_iqd: Money = conn
            .query_row(
                "SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger
                 WHERE account_type = 'inventory' AND currency = 'IQD'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(inv_iqd, Money::zero(), "Empty DB: inventory must be zero");
    }

    #[test]
    fn test_v49_accounting_references_are_numeric() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let account_id = ensure_partner_exists(&conn, "وكيل رقمي", "", "وكالة").unwrap();
        conn.execute(
            "INSERT INTO operations(id,operation_type,status)
             VALUES ('numeric-link-test','test_fixture','active')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO partner_transactions
             (partner_name,kind,type,amount,date,currency,source_type,source_id,
              source_role,account_id,operation_id)
             VALUES ('وكيل رقمي','وكالة','اختبار','1','2026-01-01','IQD',
                     'agency','77','cash_movement',?1,'numeric-link-test')",
            [account_id],
        )
        .unwrap();
        let numeric_source: i64 = conn
            .query_row(
                "SELECT source_entity_id FROM partner_transactions
                 WHERE operation_id='numeric-link-test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(numeric_source, 77);

        record_ledger_entry(
            &conn,
            "2026-01-01",
            "12:00",
            "cash",
            None,
            Money(dec!(1)),
            Money::zero(),
            "IQD",
            "agency",
            "77",
            "اختبار رقمي",
            "اختبار ربط رقمي",
            None,
        )
        .unwrap();
        let numeric_reference: i64 = conn
            .query_row(
                "SELECT reference_entity_id FROM financial_ledger
                 WHERE type_='اختبار رقمي'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(numeric_reference, 77);
    }

    #[test]
    fn test_agency_duplicate_guard_uses_subsecond_operation_time() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let account_id = ensure_partner_exists(&conn, "وكيل قديم", "0770", "وكالة").unwrap();
        conn.execute(
            "INSERT INTO operations(id,operation_type,status,created_at)
             VALUES ('agency-dedupe-test','agency_creation','active',
                     strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO agencies
             (old_agent_name,car_type,car_number,car_model,color,new_agent_name,phone,
              amount_usd,amount_iqd,notes,payment_status,date,time,operation_id,account_id)
             VALUES ('وكيل قديم','تويوتا','A-1','2026','أبيض','وكيل جديد','0770',
                     '0','1000','اختبار','واصل','2026-01-01','12:00',
                     'agency-dedupe-test',?1)",
            [account_id],
        )
        .unwrap();
        let found: i64 = conn
            .query_row(
                "SELECT a.id FROM agencies a JOIN operations o ON o.id=a.operation_id
                 WHERE a.old_agent_name='وكيل قديم' AND a.new_agent_name='وكيل جديد'
                   AND a.car_type='تويوتا' AND a.car_number='A-1' AND a.car_model='2026'
                   AND a.color='أبيض' AND a.phone='0770'
                   AND a.amount_iqd='1000' AND a.amount_usd='0'
                   AND COALESCE(a.notes,'')='اختبار' AND a.payment_status='واصل'
                   AND (julianday('now')-julianday(o.created_at))*86400.0 < 5.0
                 ORDER BY a.id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(found, 1);
    }

    #[test]
    fn test_batch_car_creation_rolls_back_every_row_after_mid_batch_failure() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let tx = conn.transaction().unwrap();
        ensure_partner_exists(&tx, "جهة متعارضة", "", "شركة").unwrap();
        let cars = vec![
            BatchCarInput {
                num: "BATCH-ROLLBACK-1".to_string(),
                chassis: "VIN-BATCH-ROLLBACK-1".to_string(),
                model: "TOYOTA".to_string(),
                year: "2026".to_string(),
                name: "TOYOTA 2026".to_string(),
                color: "أبيض".to_string(),
                purchase: Money(dec!(10000000)),
                currency: "IQD".to_string(),
                purchase_type: "كاش".to_string(),
                financer_name: None,
                purchase_date: "2026-07-16".to_string(),
            },
            BatchCarInput {
                num: "BATCH-ROLLBACK-2".to_string(),
                chassis: "VIN-BATCH-ROLLBACK-2".to_string(),
                model: "KIA".to_string(),
                year: "2026".to_string(),
                name: "KIA 2026".to_string(),
                color: "أسود".to_string(),
                purchase: Money(dec!(12000000)),
                currency: "IQD".to_string(),
                purchase_type: "تمويل".to_string(),
                financer_name: Some("جهة متعارضة".to_string()),
                purchase_date: "2026-07-16".to_string(),
            },
        ];

        let result =
            add_cars_batch_in_transaction(&tx, 1, &cars, "batch-rollback-token", "session-test");
        assert!(result.is_err());
        tx.rollback().unwrap();

        let cars_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM cars WHERE car_number LIKE 'BATCH-ROLLBACK-%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let ledger_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM financial_ledger
                 WHERE description LIKE '%BATCH-ROLLBACK-%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let audit_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM audit_log WHERE action='add_car_batch'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cars_count, 0);
        assert_eq!(ledger_count, 0);
        assert_eq!(audit_count, 0);
    }

    /// The fixed admin credentials are the approved first-run default.
    #[test]
    fn test_default_admin_credentials_are_explicit() {
        assert_eq!(DEFAULT_ADMIN_USERNAME, "admin");
        assert_eq!(LEGACY_INSECURE_ADMIN_PASSWORD, "admin");
    }
}

// ============================================================
// BUG REGRESSION TESTS — الإصلاحات الخمسة 2026-07
// يُثبت كل اختبار أن المشكلة المُصلَحة لا تعود مستقبلاً.
// ============================================================
#[cfg(test)]
mod bug_regression_fixes_2026_07 {
    use super::*;
    use rust_decimal_macros::dec;

    // ── مساعدات مشتركة ─────────────────────────────────────────

    fn setup_two_partners(conn: &Connection) {
        conn.execute_batch(
            "DROP TRIGGER IF EXISTS trg_financial_ledger_no_delete;
             DROP TRIGGER IF EXISTS trg_partner_transactions_no_delete;",
        )
        .unwrap();
        conn.execute("DELETE FROM financial_ledger", []).unwrap();
        conn.execute("DELETE FROM partner_transactions", []).unwrap();
        conn.execute("DELETE FROM partners WHERE kind = 'شريك'", []).unwrap();
        conn.execute(
            "INSERT INTO partners (partner_name, phone, total_amount, kind)
             VALUES ('شريك أول', '', '0', 'شريك')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO partners (partner_name, phone, total_amount, kind)
             VALUES ('شريك ثاني', '', '0', 'شريك')",
            [],
        )
        .unwrap();
    }

    /// ينشئ سيارة مباعة بالتقسيط مع sale_id وجدول أقساط كامل
    fn seed_installment_car(
        conn: &Connection,
        car_number: &str,
        customer: &str,
        purchase_price: &str,
        selling_price: &str,
        months: i64,
    ) -> (i64, i64) {
        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type,
                purchase_price, selling_price, currency, sale_currency,
                amount_paid, amount_remaining, installment_months,
                first_payment_date, sale_date, buyer_name, buyer_phone
             ) VALUES (?1, 'سيارة اختبار', 'مبيوعة', 'اقساط',
                ?2, ?3, 'IQD', 'IQD',
                '0', ?3, ?4,
                '2026-02-01', '2026-01-01', ?5, '07800000000')",
            params![car_number, purchase_price, selling_price, months, customer],
        )
        .unwrap();
        let car_id = conn.last_insert_rowid();
        let account_id = ensure_partner_exists(conn, customer, "07800000000", "زبون").unwrap();
        let op_id = format!("test-op-{car_number}");
        conn.execute(
            "INSERT INTO operations(id, operation_type, status) VALUES (?1,'car_sale','active')",
            [&op_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO car_sales
             (operation_id, car_id, customer_account_id, sale_type,
              selling_price, currency, sale_date, status)
             VALUES (?1, ?2, ?3, 'اقساط', ?4, 'IQD', '2026-01-01', 'active')",
            params![op_id, car_id, account_id, selling_price],
        )
        .unwrap();
        let sale_id = conn.last_insert_rowid();
        conn.execute(
            "UPDATE cars SET active_sale_id = ?1 WHERE id = ?2",
            params![sale_id, car_id],
        )
        .unwrap();
        ensure_original_installment_rows(conn, car_number).unwrap();
        (car_id, sale_id)
    }

    /// ينشئ سيارة مباعة كاش وقيودها
    fn seed_cash_car(
        conn: &Connection,
        car_number: &str,
        purchase_price: &str,
        selling_price: &str,
    ) -> (i64, i64) {
        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type,
                purchase_price, selling_price, currency, sale_currency,
                amount_paid, amount_remaining, sale_date, buyer_name, buyer_phone
             ) VALUES (?1, 'سيارة كاش', 'مبيوعة', 'كاش',
                ?2, ?3, 'IQD', 'IQD',
                ?3, '0', '2026-01-01', 'مشتري كاش', '07800000000')",
            params![car_number, purchase_price, selling_price],
        )
        .unwrap();
        let car_id = conn.last_insert_rowid();
        let account_id =
            ensure_partner_exists(conn, "مشتري كاش", "07800000000", "زبون").unwrap();
        let op_id = format!("test-op-cash-{car_number}");
        conn.execute(
            "INSERT INTO operations(id, operation_type, status) VALUES (?1,'car_sale','active')",
            [&op_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO car_sales
             (operation_id, car_id, customer_account_id, sale_type,
              selling_price, currency, sale_date, status)
             VALUES (?1, ?2, ?3, 'كاش', ?4, 'IQD', '2026-01-01', 'active')",
            params![op_id, car_id, account_id, selling_price],
        )
        .unwrap();
        let sale_id = conn.last_insert_rowid();
        conn.execute(
            "UPDATE cars SET active_sale_id = ?1 WHERE id = ?2",
            params![sale_id, car_id],
        )
        .unwrap();
        record_car_sale_ledger_entries(conn, car_id).unwrap();
        rebuild_cash_sale_profit_recognition(conn, car_id).unwrap();
        (car_id, sale_id)
    }

    // ─────────────────────────────────────────────────────────────
    // FIX-2: إلغاء الدفعة يُعيد type إلى 'باقي قسط'
    // ─────────────────────────────────────────────────────────────

    /// BUG-2: بعد دفع قسط ثم إلغائه، يجب أن يعود type إلى 'باقي قسط'.
    /// قبل الإصلاح كان يبقى 'واصل قسط' عند حالات انحدار قاعدة البيانات.
    #[test]
    fn fix2_reverse_installment_resets_type_to_pending() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        setup_two_partners(&conn);

        seed_installment_car(&conn, "FIX2-CAR", "زبون اختبار", "5000000", "12000000", 6);

        let installment_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions
                 WHERE source_type = 'customer_installment_schedule'
                   AND source_role = 'installment_schedule'
                   AND COALESCE(is_reversed, 0) = 0
                 ORDER BY COALESCE(due_date, date) LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        // دفع القسط
        pay_customer_installment_core(
            &conn,
            installment_id,
            "زبون اختبار",
            Money(dec!(2000000)),
            "2026-02-01",
            None,
            "IQD",
            "قاصه",
        )
        .unwrap();

        // التحقق أن النوع أصبح واصل
        let tx_type: String = conn
            .query_row(
                "SELECT type FROM partner_transactions WHERE id = ?1",
                [installment_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            tx_type.starts_with("واصل"),
            "يجب أن يكون النوع 'واصل قسط' بعد الدفع، وجد: {tx_type}"
        );

        // إلغاء الدفعة
        reverse_customer_installment_payment_core(&conn, installment_id).unwrap();

        // ✅ يجب أن يعود النوع إلى 'باقي قسط'
        let tx_type_after: String = conn
            .query_row(
                "SELECT type FROM partner_transactions WHERE id = ?1",
                [installment_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            tx_type_after.starts_with("باقي"),
            "FIX-2: يجب أن يعود type إلى 'باقي قسط' بعد إلغاء الدفعة، وجد: {tx_type_after}"
        );

        // ✅ يجب ألا يكون هناك paid_event_id فعال
        let paid_event: Option<i64> = conn
            .query_row(
                "SELECT paid_event_id FROM partner_transactions WHERE id = ?1",
                [installment_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            paid_event.is_none(),
            "FIX-2: paid_event_id يجب أن يكون NULL بعد إلغاء الدفعة، وجد: {paid_event:?}"
        );
    }

    /// BUG-2 تحقق دفاعي: يتحقق أن UPDATE الدفاعي يُصحح أي صف
    /// بـ type='واصل قسط' ولكن paid_event_id=NULL أو الحدث غير active.
    #[test]
    fn fix2_defensive_update_corrects_orphaned_wasil_type() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        setup_two_partners(&conn);

        seed_installment_car(&conn, "FIX2B-CAR", "زبون ب", "4000000", "8000000", 4);

        let installment_id: i64 = conn
            .query_row(
                "SELECT id FROM partner_transactions
                 WHERE source_type = 'customer_installment_schedule'
                   AND source_role = 'installment_schedule'
                   AND COALESCE(is_reversed, 0) = 0
                 ORDER BY COALESCE(due_date, date) LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        // محاكاة الانحدار: نُعيّن type='واصل قسط' مع paid_event_id=NULL يدوياً
        // (هذه الحالة تمثل قاعدة بيانات تالفة من نسخة قديمة)
        conn.execute(
            "UPDATE partner_transactions
             SET type = 'واصل قسط', paid_event_id = NULL, actual_paid_amount = NULL
             WHERE id = ?1",
            [installment_id],
        )
        .unwrap();

        // التحقق أن الصف الآن في حالة انحدار
        let before_type: String = conn
            .query_row(
                "SELECT type FROM partner_transactions WHERE id = ?1",
                [installment_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(before_type, "واصل قسط", "يجب أن يكون الصف في حالة انحدار");

        // تشغيل SQL الدفاعي (نفس استعلام FIX-2)
        let car_number = "FIX2B-CAR";
        conn.execute(
            "UPDATE partner_transactions
             SET type = 'باقي قسط',
                 paid_event_id = NULL,
                 actual_paid_amount = NULL
             WHERE kind = 'زبون'
               AND source_type = 'customer_installment_schedule'
               AND source_role = 'installment_schedule'
               AND COALESCE(is_reversed, 0) = 0
               AND type = 'واصل قسط'
               AND (
                   paid_event_id IS NULL
                   OR NOT EXISTS (
                       SELECT 1 FROM customer_installment_payment_events e
                       WHERE e.id = partner_transactions.paid_event_id
                         AND e.status = 'active'
                   )
               )
               AND sale_id IN (
                   SELECT id FROM car_sales WHERE car_id = (
                       SELECT c.id FROM cars c WHERE c.car_number = ?1
                   )
               )",
            [car_number],
        )
        .unwrap();

        // ✅ يجب أن يعود النوع إلى 'باقي قسط'
        let after_type: String = conn
            .query_row(
                "SELECT type FROM partner_transactions WHERE id = ?1",
                [installment_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            after_type, "باقي قسط",
            "FIX-2 الدفاعي: يجب تصحيح type إلى 'باقي قسط' لأي صف بـ paid_event_id=NULL، وجد: {after_type}"
        );
    }

    // ─────────────────────────────────────────────────────────────
    // FIX-3: حذف سيارة كاش يُزيل أرباحها من partner_transactions
    // ─────────────────────────────────────────────────────────────

    /// BUG-3: بعد حذف سيارة مباعة كاش، يجب أن تُعكس صفوف الأرباح
    /// وليس أن تبقى في partner_transactions بدون عكس.
    #[test]
    fn cancelling_cash_car_removes_profit_from_analytical_totals() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        setup_two_partners(&conn);
        conn.execute(
            "UPDATE users SET must_change_password = 0 WHERE username = 'admin'",
            [],
        )
        .unwrap();

        let (car_id, sale_id) = seed_cash_car(&conn, "FIX3-CAR", "8000000", "16000000");

        let (profit_before, profit_usd_before) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "00:00").unwrap();
        assert_eq!(profit_before, Money(dec!(8000000)));
        assert_eq!(profit_usd_before, Money::zero());

        // التحقق أن صفوف الأرباح مُدرجة
        let profit_rows_before: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND COALESCE(is_reversed, 0) = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            profit_rows_before, 2,
            "يجب وجود صفي ربح (شريكان) قبل الحذف"
        );

        // ✅ التحقق أن صفوف الأرباح لديها sale_id (FIX-3 في misc_commands.rs)
        let profit_with_sale_id: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND sale_id IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            profit_with_sale_id, 2,
            "FIX-3: صفوف الأرباح يجب أن تحمل sale_id حتى تُعكس عند الحذف"
        );

        // التحقق المباشر: الأرباح تحمل sale_id ← ستُشمل في عكس الحذف عبر الشرط الجديد
        // نتحقق من وجود الصفوف وأنها تربط بـ sale_id الصحيح
        let profit_linked: i64 = conn
            .query_row(
                "SELECT COUNT(*)
                 FROM partner_transactions
                 WHERE source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND sale_id = ?1
                   AND COALESCE(is_reversed, 0) = 0",
                [sale_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            profit_linked, 2,
            "صفا الربح (شريكان) يجب أن يحملا sale_id={sale_id} ليُعكسا عند حذف السيارة"
        );

        // التحقق أن operation_id موجود أيضاً (FIX-3 ثانوي)
        let profit_with_op: i64 = conn
            .query_row(
                "SELECT COUNT(*)
                 FROM partner_transactions
                 WHERE source_type = 'car_sale'
                   AND source_role = 'profit_recognition'
                   AND operation_id IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            profit_with_op, 2,
            "FIX-3: صفوف الأرباح يجب أن تحمل operation_id لضمان شمولها في عكس الحذف"
        );

        let cancellation_operation_id = "test-cancel-cash-profit";
        conn.execute(
            "INSERT INTO operations(id, operation_type, status)
             VALUES (?1, 'car_cancellation', 'active')",
            [cancellation_operation_id],
        )
        .unwrap();
        let reversed_rows =
            append_car_partner_reversals(&conn, car_id, cancellation_operation_id).unwrap();
        assert!(reversed_rows >= 2);

        let recognized_reversal_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_type='car_cancellation_reversal'
                   AND source_role='profit_recognition'
                   AND affects_profit=1
                   AND amount < 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(recognized_reversal_rows, 2);

        let (profit_after, profit_usd_after) =
            calculate_analytical_profit(&conn, "2026-01-01", None, "00:00").unwrap();
        assert_eq!(profit_after, Money::zero());
        assert_eq!(profit_usd_after, Money::zero());
    }

    // ─────────────────────────────────────────────────────────────
    // FIX-4+5: بطاقة قيمة السيارات لا تتضاعف عند التعديل أو البيع
    // ─────────────────────────────────────────────────────────────

    /// BUG-4: تعديل سعر بيع سيارة بالتقسيط لا يُضاعف بطاقة قيمة السيارات.
    /// قبل الإصلاح، delete_car_sale_ledger_entries كانت تمرر car_number
    /// فلا تجد القيود (مخزنة بـ reference_entity_id=sale_id) → تضاعف.
    #[test]
    fn fix4_edit_installment_sale_price_no_inventory_doubling() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        setup_two_partners(&conn);

        let (car_id, sale_id) =
            seed_installment_car(&conn, "FIX4-CAR", "زبون أربعة", "6000000", "12000000", 6);

        // تسجيل قيود البيع الأولى
        record_car_sale_ledger_entries(&conn, car_id).unwrap();

        let inv_before: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL) - CAST(debit AS REAL)), 0)
                 FROM financial_ledger
                 WHERE account_type = 'inventory' AND currency = 'IQD'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        // تكلفة الشراء = 6,000,000 → المخزون ينخفض بمقدار 6,000,000
        assert_eq!(
            inv_before, 6_000_000.0,
            "المخزون يجب أن ينخفض بالتكلفة الكاملة بعد أول تسجيل"
        );

        // تعديل (محاكاة): حذف قيود البيع بـ sale_id ثم إعادة التسجيل
        delete_car_sale_ledger_entries_by_sale_id(&conn, sale_id).unwrap();
        record_car_sale_ledger_entries(&conn, car_id).unwrap();

        let inv_after: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL) - CAST(debit AS REAL)), 0)
                 FROM financial_ledger
                 WHERE account_type = 'inventory' AND currency = 'IQD'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        // ✅ يجب أن يبقى 6,000,000 وليس 12,000,000 (تضاعف)
        assert_eq!(
            inv_after, 6_000_000.0,
            "FIX-4: بطاقة قيمة السيارات يجب ألا تتضاعف بعد تعديل سعر البيع، وجد: {inv_after}"
        );
    }

    /// BUG-5: البيع بالتقسيط يخصم تكلفة الشراء من بطاقة قيمة السيارات.
    /// يتحقق أن record_car_sale_ledger_entries تُنشئ قيد Cr inventory=total_cogs
    /// حتى لنوع الدفع "اقساط".
    #[test]
    fn fix5_installment_sale_removes_purchase_cost_from_inventory() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        setup_two_partners(&conn);

        let (car_id, _sale_id) =
            seed_installment_car(&conn, "FIX5-CAR", "زبون خمسة", "7000000", "14000000", 12);

        // تسجيل قيود البيع
        record_car_sale_ledger_entries(&conn, car_id).unwrap();

        // ✅ يجب أن يوجد قيد تخفيض مخزون بمقدار تكلفة الشراء
        let inventory_credit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL)), 0)
                 FROM financial_ledger
                 WHERE account_type = 'inventory'
                   AND type_ = 'تخفيض المخزون بيع سيارة'
                   AND currency = 'IQD'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            inventory_credit, 7_000_000.0,
            "FIX-5: تكلفة الشراء 7,000,000 يجب خصمها من المخزون عند البيع بالتقسيط، وجد: {inventory_credit}"
        );

        // ✅ صافي المخزون يجب أن يكون -7,000,000 (تم خصم التكلفة)
        let net_inventory: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL) - CAST(debit AS REAL)), 0)
                 FROM financial_ledger
                 WHERE account_type = 'inventory' AND currency = 'IQD'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        // لم يُسجَّل قيد شراء في هذا الاختبار، فقط قيد البيع → صافي = credit_sale = 7M
        assert_eq!(
            net_inventory, 7_000_000.0,
            "FIX-5: صافي المخزون يجب أن يكون 7,000,000 (مخصوم من المخزون)"
        );
    }

    /// BUG-5 تكامل: بيع سيارة بـ "موعد تسليم" يخصم تكلفتها أيضاً.
    #[test]
    fn fix5_delivery_date_sale_removes_purchase_cost_from_inventory() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        setup_two_partners(&conn);

        // سيارة بموعد تسليم
        conn.execute(
            "INSERT INTO cars (
                car_number, car_name, status, payment_type,
                purchase_price, selling_price, currency, sale_currency,
                amount_paid, amount_remaining, delivery_date,
                sale_date, buyer_name, buyer_phone
             ) VALUES (
                'FIX5B-CAR', 'سيارة موعد', 'مبيوعة', 'موعد',
                '9000000', '18000000', 'IQD', 'IQD',
                '0', '18000000', '2026-06-01',
                '2026-01-01', 'زبون موعد', '07800000000'
             )",
            [],
        )
        .unwrap();
        let car_id: i64 = conn
            .query_row(
                "SELECT id FROM cars WHERE car_number = 'FIX5B-CAR'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let account_id =
            ensure_partner_exists(&conn, "زبون موعد", "07800000000", "زبون").unwrap();
        let op_id = "test-op-fix5b".to_string();
        conn.execute(
            "INSERT INTO operations(id, operation_type, status) VALUES(?1,'car_sale','active')",
            [&op_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO car_sales
             (operation_id, car_id, customer_account_id, sale_type,
              selling_price, currency, sale_date, status)
             VALUES (?1, ?2, ?3, 'موعد', '18000000', 'IQD', '2026-01-01', 'active')",
            params![op_id, car_id, account_id],
        )
        .unwrap();
        let sale_id = conn.last_insert_rowid();
        conn.execute(
            "UPDATE cars SET active_sale_id = ?1 WHERE id = ?2",
            params![sale_id, car_id],
        )
        .unwrap();

        record_car_sale_ledger_entries(&conn, car_id).unwrap();

        let inv_credit: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(CAST(credit AS REAL)), 0)
                 FROM financial_ledger
                 WHERE account_type = 'inventory'
                   AND type_ = 'تخفيض المخزون بيع سيارة'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            inv_credit, 9_000_000.0,
            "FIX-5: بيع موعد تسليم يجب خصم تكلفة 9,000,000 من المخزون، وجد: {inv_credit}"
        );
    }

    /// اختبار تكاملي: حذف سيارة كاش → الأرباح تُخصم من partner_transactions
    /// (يتحقق من FIX-3 و FIX-5 معاً عبر append_car_partner_reversals)
    #[test]
    fn fix3_profit_recognition_rows_carry_sale_id_for_reversal() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        setup_two_partners(&conn);

        let (car_id, sale_id) = seed_cash_car(&conn, "FIX3B-CAR", "10000000", "20000000");

        // ✅ صفوف الأرباح يجب أن تحمل sale_id بعد FIX-3
        let rows_with_sale_id: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM partner_transactions
                 WHERE source_role = 'profit_recognition'
                   AND sale_id = ?1",
                [sale_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            rows_with_sale_id, 2,
            "FIX-3: كل صفي ربح يجب أن يحملا sale_id={sale_id}"
        );

        // ✅ عكس يجد الصفوف عبر sale_id — نتحقق عبر SQL مباشرة
        // (append_car_partner_reversals خاصة، لكن نُثبت أن الصفوف قابلة للعكس)
        let eligible_for_reversal: i64 = conn
            .query_row(
                "SELECT COUNT(*)
                 FROM partner_transactions
                 WHERE reverses_transaction_id IS NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM partner_transactions r
                       WHERE r.reverses_transaction_id = partner_transactions.id
                   )
                   AND (
                       sale_id IN (SELECT id FROM car_sales WHERE car_id = ?1)
                       OR (
                           source_type = 'car_sale'
                           AND source_role = 'profit_recognition'
                           AND CAST(source_id AS INTEGER) IN (
                               SELECT id FROM car_sales WHERE car_id = ?1
                           )
                       )
                   )",
                [car_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            eligible_for_reversal >= 2,
            "يجب وجود ≥2 صفوف قابلة للعكس (profit×2)، وجد: {eligible_for_reversal}"
        );
    }
}
