# استراتيجية النسخ الاحتياطي والاستعادة — Fajr Al-Wadi Accounting ERP

> هذه الوثيقة تُحدّد سياسة النسخ الاحتياطي الكاملة ومتطلبات اختبار الاستعادة (Restore Drill). النسخ الاحتياطي متطلب إلزامي من §10 من التكليف التنفيذي، واختبار restore drill إلزامي قبل إعلان Go. الحالة الحالية: **منفّذ جزئيًا** — الكود يستخدم `rusqlite::backup` API في `perform_hourly_backup` لكن استراتيجية الاستعادة الكاملة والـ manifest والـ rotation مكتملة فقط على الورق، والـ drill الاختباري لم يُنفَّذ بعد.

## 1. متطلبات §10 من التكليف

§10 يلزم بالنقاط التالية:

1. النسخ الاحتياطي يجب أن يكون متاحًا وقابل التنفيذ من داخل التطبيق، لا يدويًا من سطر الأوامر فقط.
2. النسخ تُخزَّن في مجلد App Data المنفصل عن الـ executable، لا بجانبه.
3. كل نسخة تحوي: timestamp, schema_version, application_version, hash/checksum, manifest, size, integrity_check result.
4. Restore workflow: verify → backup current → restore to temp → integrity/migration check → atomic swap → rollback on failure.
5. سياسة rotation موثقة (مثلاً: 7 يومية + 4 أسبوعية + 12 شهرية).
6. يجب توفير backup يدوي قبل كل migration.
7. **اختبار restore drill إلزامي قبل Go**.

## 2. الحالة الحالية — ما هو منفّذ

### 2.1 rusqlite Backup API — مُمكَّن في Cargo.toml

في `src-tauri/Cargo.toml` (السطر 29):

```toml
rusqlite = { version = "0.32", features = ["bundled", "backup"] }
```

Feature `backup` مُمكَّنة، ما يعني أن `Connection::backup(DatabaseName::Main, ...)` متاحة. هذه الـ API تستخدم SQLite Online Backup API الرسمي، الذي يُنشئ نسخة متسقة من قاعدة البيانات حتى أثناء الكتابة النشطة (عبر page-level locking).

### 2.2 perform_hourly_backup في lib.rs

الدالة `perform_hourly_backup(db_path: &str) -> Result<(), String>` في `lib.rs` (السطر 16918) تنفّذ:

1. توليد timestamp بصيغة `%Y%m%d_%H%M%S`.
2. بناء مسار النسخة: `{db_path}.backup_{timestamp}` — **هذا الموقع خاطئ**، يجب أن يكون في App Data لا بجانب الـ db (انظر §3.2).
3. فتح اتصال source عبر `Connection::open(db_path)`.
4. استدعاء `source.backup(DatabaseName::Main, &backup_path, None)`.
5. تنظيف النسخ القديمة: يبقي آخر 24 نسخة، يحذف الباقي. **هذا rotation غير مُصنَّف (يومي/أسبوعي/شهري)**.

### 2.3 run_backup_loop في lib.rs

الدالة `run_backup_loop(db_path: PathBuf)` (السطر 16954) تشغّل backup كل ساعة في thread منفصل:

1. تنتظر 5 دقائق بعد بدء التشغيل قبل أول نسخة.
2. تستدعي `perform_hourly_backup` كل 3600 ثانية (1 ساعة).
3. أي خطأ يُبتلع بصمت (`let _ = ...`) — **هذا خطر**، يجب تسجيل الأخطاء على الأقل.

### 2.4 سكربتات Python تستخدم sqlite3

سكربتات في `scripts/` تستخدم وحدة `sqlite3` في Python لإنشاء نسخ احتياطية للاختبار اليدوي (مثل `scripts/create_test_db.py`). هذه السكربتات تستخدم `conn.backup()` من Python لكنها ليست للإنتاج.

## 3. الفجوات (Gaps) — ما هو ناقص

### 3.1 نسخ من داخل Tauri يحتاج تنفيذًا كاملًا

الكود الحالي ينشئ نسخة `.backup` بجانب الـ db الأصلي. هذا لا يحقق متطلب §10.2 (App Data منفصل). كما أن النسخة لا تحوي manifest أو hash أو schema_version. الفجوات الكاملة:

- **الموقع**: يجب نقل النسخ إلى `app_data_dir/backups/` (عبر `tauri::api::path::app_data_dir`).
- **Manifest**: يجب إنشاء ملف JSON جانبي لكل نسخة يحوي الـ metadata المطلوبة.
- **Hash**: يجب حساب SHA-256 للنسخة وتخزينه في الـ manifest.
- **Integrity check**: يجب تشغيل `PRAGMA integrity_check` على النسخة وتسجيل النتيجة في الـ manifest.
- **Schema version**: يجب قراءة `MAX(version) FROM db_version` وتسجيله في الـ manifest.
- **Application version**: يجب قراءة `env!("CARGO_PKG_VERSION")` وتسجيله.

### 3.2 استراتيجية Rotation الكاملة

الكود الحالي يبقي آخر 24 نسخة فقط، بدون تمييز بين يومي وأسبوعي وشهري. **السياسة المطلوبة** (مثال، يجب اعتمادها رسميًا):

| النوع      | العدد | مدة الاحتفاظ       | التكرار            |
| ---------- | ----- | ------------------- | ------------------ |
| يومي       | 7     | آخر 7 أيام          | كل ساعة، يُحتفظ بأحدث نسخة في اليوم |
| أسبوعي     | 4     | آخر 4 أسابيع        | كل يوم أحد، يُحتفظ بأحدث نسخة في الأسبوع |
| شهري       | 12    | آخر 12 شهرًا        | أول كل شهر         |
| قبل الترحيل | غير محدود | دائم (لا يُحذف)    | قبل كل `init_db` migration |

### 3.3 backup يدوي قبل كل Migration

يجب إضافة خطوة في `init_db`: قبل تطبيق أي migration جديدة (أي قبل `if version < N` block)، يجب إنشاء نسخة احتياطية باسم `pre_migration_v{N}_{timestamp}.db` في `app_data_dir/backups/pre_migration/`. هذه النسخة لا تُحذف أبدًا من rotation. إن فشل الترحيل، يمكن استعادة هذه النسخة يدويًا.

### 3.4 Restore Workflow لم يُنفَّذ

لا يوجد أمر Tauri للاستعادة. الـ workflow المطلوب (§10.4):

```
[verify backup manifest]
  ↓
[verify hash SHA-256 of backup file matches manifest]
  ↓
[backup current DB to safety slot]
  ↓
[restore backup to temp file]
  ↓
[open temp file, run PRAGMA integrity_check]
  ↓
[run migrate_* to bring temp up to current schema_version]
  ↓
[integrity check on migrated temp]
  ↓
[atomic swap: rename current → .pre_restore, rename temp → current]
  ↓
[on any failure: rollback swap, restore from safety slot, return error]
  ↓
[on success: log to audit_log, delete safety slot after 24h]
```

يجب تنفيذ هذا كأمر Tauri `restore_from_backup(backup_path: String, session_token: Option<String>)` يتطلّب `require_admin_session` ويسجّل في `audit_log` بـ `action="restore_from_backup"`.

### 3.5 اختبار Restore Drill لم يُنفَّذ

متطلب §10.7 — **اختبار restore drill إلزامي قبل Go**. الاختبار المطلوب:

1. إنشاء قاعدة بيانات اختبار ببيانات واقعية (10 سيارات، 50 حركة شريك، 5 وكالات، 20 مصروف).
2. إنشاء نسخة احتياطية عبر `perform_backup`.
3. التحقق من الـ manifest (hash, schema_version, integrity_check).
4. إتلاف القاعدة الأصلية (حذفها).
5. الاستعادة من النسخة عبر `restore_from_backup`.
6. التحقق من تطابق البيانات (count كل جدول + checksum صفوف معينة).
7. التحقق من `PRAGMA integrity_check = ok` بعد الاستعادة.
8. التحقق من `db_version` بعد الاستعادة يطابق الـ manifest.

هذا الاختبار **لم يُنفَّذ بعد**. يجب إضافته إلى `scripts/test_restore_drill.py` و`src-tauri/tests/restore_drill.rs`.

## 4. تصميم الـ Manifest

كل نسخة احتياطية `*.db` لها ملف `*.manifest.json` جانبي يحوي:

```json
{
  "backup_version": 1,
  "timestamp": "2026-07-15T14:30:22+03:00",
  "source_db_path": "/home/user/.fajr-alwadi/fjr_alwadi_data.db",
  "backup_db_path": "/home/user/.fajr-alwadi/backups/hourly_20260715_143022.db",
  "size_bytes": 1048576,
  "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "schema_version": 35,
  "application_version": "1.0.0",
  "integrity_check": "ok",
  "backup_type": "hourly | daily | weekly | monthly | pre_migration",
  "migrated_from_schema_version": null,
  "migration_applied": null,
  "created_by_user_id": 1,
  "created_by_session": "abc12345…"
}
```

الـ manifest نفسه يجب أن يُخزَّن في نفس المجلد، واسمه `{backup_name}.manifest.json`. أي نسخة بدون manifest تُرفض في الاستعادة.

## 5. تصميم Atomic Swap

الـ swap بين القاعدة الحالية والمستعادة يجب أن يكون ذريًا على مستوى نظام الملفات:

1. `rename(current, current + ".pre_restore")` — atomic on POSIX.
2. `rename(temp_restored, current)` — atomic on POSIX.
3. إن نجح الاثنان: فتح الـ connection الجديد، التحقق.
4. إن فشل أي خطوة: `rename(current + ".pre_restore", current)` للتراجع.
5. إن نجح الـ swap لكن فشل التحقق: التراجع أيضًا.

على Windows، `rename` يتطلب أن الهدف غير موجود. لذا الـ workflow على Windows يستخدم `MoveFileEx` مع `MOVEFILE_REPLACE_EXISTING` عبر `std::fs::rename` (الذي يستدعي `MoveFileEx` داخليًا).

## 6. أوامر Tauri المطلوبة

يجب إضافة الأوامر التالية (لم تُنفَّذ بعد):

| الأمر                          | الوصف                                                       | الصلاحية     |
| ------------------------------ | ----------------------------------------------------------- | ------------ |
| `list_backups(session_token)`  | قائمة بكل النسخ في `app_data_dir/backups/` مع manifest    | admin        |
| `create_backup_now(session_token, backup_type)` | إنشاء نسخة فورية يدوية                       | admin        |
| `restore_from_backup(session_token, backup_path)` | استعادة نسخة مع workflow atomic swap       | admin        |
| `verify_backup(session_token, backup_path)` | فحص manifest + hash + integrity دون استعادة     | admin        |
| `delete_backup(session_token, backup_path)` | حذف نسخة (لا يحذف pre_migration)              | admin        |
| `export_backup_to_path(session_token, backup_path, export_path)` | تصدير نسخة إلى مسار خارجي | admin        |

كل أمر يستدعي `require_admin_session` ويسجّل في `audit_log`.

## 7. اختبار Restore Drill — قالب

الاختبار يجب أن يغطي السيناريوهات التالية:

1. **Happy path**: نسخة سليمة → استعادة → بيانات مطابقة.
2. **نسخة تالفة**: تعديل بايت في النسخة → `verify_backup` يرفضها بسبب hash mismatch.
3. **manifest مفقود**: نسخة بدون manifest → `restore_from_backup` يرفض.
4. **schema mismatch**: نسخة بـ v30 على تطبيق بـ v35 → الاستعادة تشغّل migrations ثم تتحقق.
5. **فشل mid-restore**: محاكاة فشل `rename` → التراجع التلقائي إلى القاعدة الأصلية.
6. **قاعدة مقفولة**: قاعدة مفتوحة في connection آخر → `restore_from_backup` يرفض (لا يمكن swap أثناء الاستخدام).
7. **استعادة بعد حذف**: حذف القاعدة الأصلية فعلًا → الاستعادة تنجح.
8. **تطابق checksum**: مقارنة `SELECT COUNT(*)`, `SUM(amount)`, `MAX(id)` لكل جدول قبل النسخ وبعد الاستعادة.

## 8. سياسة احتفاظ إضافية

- **pre_migration backups**: لا تُحذف أبدًا تلقائيًا. تحتاج حذفًا يدويًا مع تسجيل في `audit_log`.
- **النسخة الأحدث دائمًا محمية**: حتى لو انتهت سياسة rotation، لا تُحذف النسخة الأحدث.
- **مساحة القرص**: إن قاربت المساحة على الحد (مثلاً < 1GB حر)، يُسجَّل تحذير على `stderr` ولا تُحذف نسخ تلقائيًا. الإدارة اليدوية فقط.

## 9. النسخ عبر السحابة (مستقبلي)

غير مُنفَّذ. إن طُلب، يجب أن:

1. يُشفّر الـ DB قبل الرفع (SQLCipher أو AES-256 خارجي).
2. لا يُرفع manifest كامل (يحوي session token مقنّع) — نسخة مُصفّاة فقط.
3. يُسجّل في `audit_log` بـ `action="cloud_backup_upload"`.
4. لا يُخزَّن token التخزين السحابي في الـ DB — عبر متغيرات بيئة النظام فقط.

## 10. مراجع

- `Instructions.md` §10 (Customer Accounts Printing — لا تغيير للبيانات)، §1.3 (Read-Only).
- التكليف التنفيذي §10 — متطلبات النسخ الاحتياطي.
- `src-tauri/Cargo.toml` (السطر 29) — feature `backup` مُمكَّنة.
- `src-tauri/src/lib.rs` الأسطر 16918–16963 — `perform_hourly_backup` و`run_backup_loop`.
- `scripts/create_test_db.py` — سكربت اختبار يدوي.
- `docs/TEST_STRATEGY.md` §1.10 — Backup/Restore Tests.
- `docs/SECURITY_MODEL.md` §6.2 — `check_artifact_hygiene.py` يحظر وجود `*.db` في الشجرة (لا يتعارض مع `app_data_dir` المنفصل).
- `docs/BUG_REGRESSIONS.md` — لم يُسجَّل bug backup بعد (الفجوات موثقة هنا لأول مرة).
