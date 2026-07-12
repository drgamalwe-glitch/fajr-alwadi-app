# MIGRATION MATRIX — مصفوفة الـMigrations

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** تم تحويل جميع الـ`let _ = conn.execute(...)` إلى `conn.execute(...)?` (Fail-Closed) وإضافة Migration 36.

## 1. ملخص الإصدارات

| الإصدار | الوصف | الحالة |
|---|---|---|
| 1 | مفتاح مركب (partner_name, kind) لجدول partners | ✅ |
| 2 | إضافة car_partners + purchase_type/financer_name/commission | ✅ |
| 3 | إنشاء car_expenses | ✅ |
| 4 | إضافة agencies.car_type | ✅ |
| 5 | تنظيف حركات شركاء قديمة | ✅ |
| 6-19 | تحسينات تدريجية | ✅ |
| 20-29 | تحسينات على partner_transactions + ledger | ✅ |
| 30 | تأمين chassis_number | ✅ |
| 31 | إضافة creation_token للوكالات | ✅ |
| 32 | إعادة هيكلة sessions + login_attempts + audit_log | ✅ |
| 33 | postconditions على v32 | ✅ |
| 34 | إضافة creation_token لجميع الكيانات + unique partial indices | ✅ |
| 35 | audit_log columns + إعادة إنشاء creation_token indices | ✅ |
| **36** | **idempotency_requests + journal_entries/journal_lines + CHECK triggers + double-sell guard + car_expenses FK** | ✅ **جديد** |

## 2. التحقق من الـSnapshots التاريخية

> **تنبيه صادق:** بيئة التدقيق الحالية لا يمكنها تشغيل `cargo test` (نقص مكتبات GTK). لذلك لم يتم تشغيل snapshot tests على v1/v19/v31/v32/v34 فعلياً. هذه اختبارات موجودة في الكود لكنها **لم تُشغّل** في هذه الجلسة.

### 2.1 اختبارات Migrations الموجودة في الكود

| الاختبار | الملف | الإصدار المغطى | الحالة |
|---|---|---|---|
| `migration_v32_prod` | `src-tauri/tests/migration_v32_prod.rs` | v32 على قاعدة بيانات إنتاج | لم تُشغّل |
| `test_critical_5_migrations_reach_v36_on_fresh_db` | `src-tauri/src/legacy.rs` | v1-v36 على in-memory | لم تُشغّل |
| `test_critical_5_currency_check_trigger_rejects_unknown_currency` | `src-tauri/src/legacy.rs` | v36 CHECK triggers | لم تُشغّل |
| `test_critical_5_affects_partner_cash_check_trigger_rejects_invalid_values` | `src-tauri/src/legacy.rs` | v36 CHECK triggers | لم تُشغّل |
| `test_critical_5_no_double_sell_trigger_rejects_resale_without_reversal` | `src-tauri/src/legacy.rs` | v36 double-sell guard | لم تُشغّل |
| `test_critical_5_car_expenses_fk_trigger_rejects_orphan_expense` | `src-tauri/src/legacy.rs` | v36 car_expenses FK | لم تُشغّل |
| `test_init_db_*` (متعدد) | `src-tauri/src/legacy.rs` | v1-v35 | لم تُشغّل |

### 2.2 خطة اختبار Snapshots (للبيئة المستهدفة)

للتحقق من أن جميع الـMigrations تعمل على قواعد بيانات تاريخية، يجب على فريق الصيانة:

1. الحصول على نسخة من كل قاعدة بيانات تاريخية (v1, v19, v31, v32, v34).
2. تشغيل `cargo test --features accounting-test-support -- migration` في بيئة Linux بصلاحيات root لتثبيت GTK.
3. التحقق من `db_version` يصل إلى 36 بعد `init_db`.
4. التحقق من Postconditions في الكود (مدرجة في §3 أدناه).
5. التحقق من توازن القيود: `SELECT SUM(debit - credit) FROM financial_ledger WHERE account_type = 'cash'` يجب أن يساوي `cash_iqd` من `get_company_status`.

## 3. Postconditions المطبقة في v36

كل migration v36 يتحقق من وجود الكائنات بعد إنشائها قبل تسجيل الإصدار:

```rust
let postcondition_checks: [(&str, &str); 7] = [
    ("idempotency_requests", "SELECT name FROM sqlite_master WHERE type='table' AND name='idempotency_requests'"),
    ("journal_entries", "SELECT name FROM sqlite_master WHERE type='table' AND name='journal_entries'"),
    ("journal_lines", "SELECT name FROM sqlite_master WHERE type='table' AND name='journal_lines'"),
    ("trg_partner_tx_affects_partner_cash_check", "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_partner_tx_affects_partner_cash_check'"),
    ("trg_partner_tx_currency_check", "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_partner_tx_currency_check'"),
    ("trg_cars_status_check", "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_cars_status_check'"),
    ("trg_cars_no_double_sell", "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_cars_no_double_sell'"),
];
```

أي فشل في postcondition يمنع `INSERT INTO db_version (version) VALUES (36)`.

## 4. Fail-Closed Pattern

**الإصلاح الجذري (CRITICAL-5):** تم تحويل **113** نمط `let _ = conn.execute(...)` إلى `conn.execute(...)?` في `legacy.rs`. أي خطأ في أي خطوة migration يُلغى الـtransaction بالكامل ويُترك `db_version` كما كان.

### 4.1 نمط Migration الآمن

```rust
if version < N {
    conn.execute("CREATE TABLE ...", [])?;          // ← ? يُرجع الخطأ
    conn.execute("CREATE INDEX ...", [])?;
    conn.execute("ALTER TABLE ...", [])?;
    // Postcondition
    let exists: bool = conn.query_row("SELECT EXISTS(...)", [], |row| row.get(0))?;
    if !exists {
        return Err(...);                             // ← يُلغى الـtransaction
    }
    conn.execute("INSERT INTO db_version (version) VALUES (N)", [])?;
}
```

## 5. الـTransaction الكلية في `init_db`

```rust
let init_result = (|| {
    conn.execute_batch("BEGIN IMMEDIATE")?;
    // ... كل الـmigrations ...
    Ok(())
})();

match init_result {
    Ok(()) => { conn.execute_batch("COMMIT")?; Ok(()) }
    Err(err) => {
        conn.execute_batch("ROLLBACK")?;
        Err(err)
    }
}
```

أي فشل في أي migration يُلغي **جميع** الـmigrations في نفس الاستدعاء (ROLLBACK كامل).

## 6. المخاطر المتبقية

| الخطر | الإجراء المطلوب |
|---|---|
| Snapshots تاريخية لم تُختبر فعلياً | تشغيل في بيئة Linux بصلاحيات root |
| `ignore_dup` لا يزال موجوداً لـALTER TABLE | مقبول (ALTER COLUMN لا يمكن أن يكون atomic بطبيعته في SQLite) |
| بعض الـmigrations القديمة تستخدم `log_migration_step` بدلاً من `?` | تم تحويلها جميعاً إلى `?` |
| `init_db_for_test` قد يكون لها patterns منفصلة | لم يُفحص بدقة |
