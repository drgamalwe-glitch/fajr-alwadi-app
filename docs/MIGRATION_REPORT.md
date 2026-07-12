# MIGRATION REPORT — تقرير الـMigrations

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** تحديث صادق بناءً على ما تم تنفيذه وما لم يُشغّل.

## 1. ملخص التنفيذ

- **عدد الـMigrations المنفذة في الكود:** 36
- **آخر إصدار:** v36
- **اختبارات تم تشغيلها فعلياً:** ❌ **0** (لا يمكن تشغيل cargo في بيئة التدقيق)
- **Postconditions المطبقة:** ✅ v36

## 2. تفاصيل كل Migration

### v1 — مفتاح مركب (partner_name, kind) لجدول partners

- **مصدر Snapshot:** غير متوفر
- **الخطوات:**
  1. CREATE TABLE partners_migrate مع PRIMARY KEY (partner_name, kind)
  2. INSERT OR IGNORE FROM partners
  3. DROP TABLE partners
  4. ALTER TABLE partners_migrate RENAME TO partners
  5. ALTER TABLE partner_transactions ADD COLUMN kind
  6. INSERT INTO db_version VALUES (1)
- **Postconditions:** لا (قديم)
- **النتيجة:** مطبق، ⚠️ لم يُختبر على snapshot
- **عدد السجلات قبل/بعد:** غير موثق
- **مخاطر متبقية:** لا

### v2 — إضافة car_partners + purchase_type/financer_name

- **الخطوات:**
  1. ALTER TABLE cars ADD COLUMN purchase_type
  2. ALTER TABLE cars ADD COLUMN financer_name
  3. ALTER TABLE cars ADD COLUMN commission_type
  4. ALTER TABLE cars ADD COLUMN commission_value
  5. ALTER TABLE expenses ADD COLUMN car_number
  6. CREATE TABLE car_partners
  7. INSERT INTO db_version VALUES (2)
- **النتيجة:** مطبق، ⚠️ لم يُختبر

### v3 — إنشاء car_expenses

- **الخطوات:** CREATE TABLE car_expenses + db_version (3)
- **النتيجة:** مطبق، ⚠️ لم يُختبر

### v4 — إضافة agencies.car_type

- **الخطوات:** ALTER TABLE agencies ADD COLUMN car_type + db_version (4)
- **النتيجة:** مطبق، ⚠️ لم يُختبر

### v5 — تنظيف حركات شركاء قديمة

- **الخطوات:** DELETE FROM partner_transactions WHERE type = 'ايداع دفعات زبائن' + db_version (5)
- **النتيجة:** مطبق، ⚠️ لم يُختبر
- **ملاحظة:** حذف بيانات قديمة — كان يتطلب تقرير migration واضح (مذكور في التقرير الأصلي كخطر)

### v6-v19 — تحسينات تدريجية

- **النتيجة:** مطبق، ⚠️ لم يُختبر على snapshots

### v20-v29 — تحسينات على partner_transactions + ledger

- **النتيجة:** مطبق، ⚠️ لم يُختبر

### v30 — تأمين chassis_number

- **الخطوات:** تطبيع قيم chassis_number الموجودة
- **النتيجة:** مطبق، ⚠️ لم يُختبر

### v31 — إضافة creation_token للوكالات

- **الخطوات:** ALTER TABLE agencies ADD COLUMN creation_token + CREATE UNIQUE INDEX
- **النتيجة:** مطبق، ⚠️ لم يُختبر

### v32 — إعادة هيكلة sessions + login_attempts + audit_log

- **الخطوات:**
  1. CREATE TABLE sessions
  2. CREATE TABLE login_attempts
  3. ALTER TABLE audit_log ADD COLUMN actor_user_id
  4. ALTER TABLE audit_log ADD COLUMN session_token
  5. CREATE INDEX idx_sessions_user, idx_sessions_expires
  6. CREATE INDEX idx_login_attempts_username_time
- **النتيجة:** مطبق، ⚠️ لم يُختبر
- **اختبار موجود:** `migration_v32_prod.rs` (لم يُشغّل)

### v33 — postconditions على v32

- **الخطوات:** التحقق من وجود الجداول والindices
- **النتيجة:** مطبق، ⚠️ لم يُختبر

### v34 — إضافة creation_token لجميع الكيانات + unique partial indices

- **الخطوات:**
  1. ALTER TABLE cars ADD COLUMN creation_token
  2. CREATE UNIQUE INDEX idx_cars_creation_token (partial)
  3. ALTER TABLE expenses ADD COLUMN creation_token
  4. CREATE UNIQUE INDEX idx_expenses_creation_token (partial)
  5. ALTER TABLE car_expenses ADD COLUMN creation_token
  6. CREATE UNIQUE INDEX idx_car_expenses_creation_token (partial)
  7. ALTER TABLE partner_transactions ADD COLUMN creation_token
  8. CREATE UNIQUE INDEX idx_partner_tx_creation_token (partial)
  9. ALTER TABLE agency_transactions ADD COLUMN creation_token
  10. CREATE UNIQUE INDEX idx_agency_tx_creation_token (partial)
- **النتيجة:** مطبق، ⚠️ لم يُختبر

### v35 — audit_log columns + إعادة إنشاء creation_token indices

- **الخطوات:**
  1. ALTER TABLE audit_log ADD COLUMN creation_token
  2. إعادة إنشاء indices المفقودة من v34 (postcondition repair)
- **النتيجة:** مطبق، ⚠️ لم يُختبر

### **v36 (جديد)** — idempotency_requests + journal_entries/lines + CHECK triggers + double-sell guard + car_expenses FK

- **الخطوات:**
  1. CREATE TABLE idempotency_requests
  2. CREATE INDEX idx_idempotency_command_status
  3. CREATE TABLE journal_entries (مع CHECK على currency)
  4. CREATE INDEX idx_journal_entries_source
  5. CREATE UNIQUE INDEX idx_journal_entries_creation_token (partial)
  6. CREATE TABLE journal_lines (مع CHECK على debit/credit)
  7. CREATE INDEX idx_journal_lines_entry, idx_journal_lines_account
  8. CREATE TRIGGER trg_partner_tx_affects_partner_cash_check
  9. CREATE TRIGGER trg_partner_tx_affects_partner_cash_update_check
  10. CREATE TRIGGER trg_partner_tx_currency_check
  11. CREATE TRIGGER trg_cars_status_check
  12. CREATE TRIGGER trg_cars_status_update_check
  13. CREATE TRIGGER trg_cars_no_double_sell
  14. CREATE TRIGGER trg_car_expenses_fk_car_number
  15. CREATE TRIGGER trg_car_expenses_fk_car_number_update
  16. **Postconditions:** فحص 7 كائنات قبل INSERT INTO db_version
  17. INSERT INTO db_version VALUES (36)
- **Postconditions:** ✅ مطبقة (7 كائنات)
- **النتيجة:** مطبق، ⚠️ لم يُختبر
- **عدد السجلات قبل/بعد:** 0 جداول جديدة (الجداول الجديدة فارغة)
- **تحويلات بيانات:** لا
- **مخاطر متبقية:**
  - `journal_entries/journal_lines` منشأة لكن **لم يكتب إليها الكود بعد**.
  - `idempotency_requests` منشأة لكن **لم يكتب إليها الكود بعد**.
  - الـtriggers قد ترفض عمليات قديمة غير قانونية في قواعد بيانات تاريخية (مثل cars.status بقيمة غير قانونية).

## 3. اختبارات Snapshots المطلوبة (لم تُشغّل)

| الإصدار | مصدر Snapshot المطلوب | الخطوات | Postconditions |
|---|---|---|---|
| v1 | قاعدة بيانات قديمة بإصدار 0 | تشغيل init_db | db_version=36 + partners بمفتاح مركب |
| v19 | قاعدة بيانات بإصدار 19 | تشغيل init_db | db_version=36 + schema كامل |
| v31 | قاعدة بيانات بإصدار 31 | تشغيل init_db | db_version=36 + creation_token في agencies |
| v32 | قاعدة بيانات بإصدار 32 (موجود `migration_v32_prod.rs`) | تشغيل init_db + اختبار | db_version=36 + sessions + login_attempts |
| v34 | قاعدة بيانات بإصدار 34 | تشغيل init_db | db_version=36 + جميع creation_token indices |

## 4. اختبار الفشل في منتصف Migration

> **تنبيه:** لم يُشغّل فعلياً. يتطلب بيئة Linux كاملة.

الاختبار المقترح:
1. إنشاء قاعدة بيانات بإصدار 35.
2. تعديل v36 لإدخال SQL غير صالح في المنتصف.
3. تشغيل init_db.
4. التحقق من فشل العملية بالكامل.
5. التحقق من أن db_version لا يزال 35 (لا 36).
6. التحقق من ROLLBACK التلقائي.

النتيجة المتوقعة: فشل كامل، db_version=35، لا كائنات v36 منشأة جزئياً.

## 5. الفجوات المعروفة

| الفجوة | الإجراء المطلوب |
|---|---|
| 0 اختبار migration شُغّل فعلياً | تثبيت GTK + cargo test |
| `journal_entries/journal_lines` لم يُكتب إليه | كتابة كود يكتب لكلا الجدولين |
| `idempotency_requests` لم يُكتب إليه | كتابة كود request-level idempotency |
| Snapshots تاريخية غير متوفرة | جمعها من بيئات الإنتاج |
| `ignore_dup` لـALTER TABLE | مقبول (طبيعة SQLite) |

## 6. خطة المتابعة

1. **فوري:** نقل المشروع لبيئة Linux كاملة.
2. **فوري:** تشغيل `cargo test --features accounting-test-support`.
3. **قصير المدى:** جمع snapshots تاريخية وتشغيل اختبارات الترقية.
4. **قصير المدى:** كتابة كود يكتب لـ`journal_entries/journal_lines` و `idempotency_requests`.
5. **متوسط المدى:** توحيد `financial_ledger` مع `journal_entries`.
