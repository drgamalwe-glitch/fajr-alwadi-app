# سجل ترحيلات قاعدة البيانات (Migration Log)

> توثّق هذه الوثيقة الترحيلات حتى **v49** المطبّقة عبر `init_db()` في `src-tauri/src/legacy/db_init.rs`. القاعدة الذهبية §9.1: **"لا تعدّل Migration منشورة، أضف Migration جديدة فقط"**. كل ترحيلة ضمن معاملة؛ أي فشل يلغيها ويبقي `db_version` عند آخر نسخة ناجحة.

## الجدول الزمني للترحيلات

| الإصدار | الملخص                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1      | مفتاح مركّب `(partner_name, kind)` لجدول `partners`. إضافة عمود `kind` إلى `partner_transactions`.                                                                                                                                                                                                                                                                                                                       |
| v2      | إضافة أعمدة الشراء بالتمويل إلى `cars` (`purchase_type`, `financer_name`, `commission_type`, `commission_value`). إنشاء `car_partners`. إضافة `car_number` إلى `expenses`.                                                                                                                                                                                                                                               |
| v3      | إنشاء جدول `car_expenses`.                                                                                                                                                                                                                                                                                                                                                                                               |
| v4      | إضافة عمود `car_type` إلى `agencies`.                                                                                                                                                                                                                                                                                                                                                                                    |
| v5      | تنظيف: حذف صفوف `partner_transactions` من نوع `'ايداع دفعات زبائن'` القديمة وأرباح السيارات غير المرتبطة برقم حركة دفعة.                                                                                                                                                                                                                                                                                                 |
| v6      | إضافة أعمدة التصنيف المحاسبي إلى `partner_transactions` (`source_type`, `source_id`, `source_role`, `affects_qasa`, `affects_partner_cash`, `affects_profit`). تصنيف حركات المستثمرين/الممولين/الشركات. تنظيف قيود `capital` الزائدة.                                                                                                                                                                                    |
| v7      | إعادة تطبيق تصنيفات v6 لقواعد بيانات كانت قد طبّقت v6 بـ bugs.                                                                                                                                                                                                                                                                                                                                                           |
| v8      | إصلاح قيود `car_expense` في `financial_ledger` (كانت تستخدم `reference_type='expense'` بدلًا من `'car_expense'`). تنظيف الأيتام. تصنيف الصفوف بدون `source_type` بـ `'legacy_unclassified'`.                                                                                                                                                                                                                             |
| v9      | تنظيف قيود `Cr receivable` المكررة لصفوف `cash_movement` الخاصة بدفعات الزبائن.                                                                                                                                                                                                                                                                                                                                          |
| v10     | حذف قيود `capital` من صفوف `cash_movement` لزبائن + إعادة بناء القيود الناقصة لصفوف دفعات الزبائن (`Cr receivable`).                                                                                                                                                                                                                                                                                                     |
| v11     | (تفاصيل في الكود السطر 1565–1683) — تنظيف وتصنيف إضافي.                                                                                                                                                                                                                                                                                                                                                                  |
| v12     | إصلاحات متعلقة بـ `transaction_splits` والتوثيق المحاسبي.                                                                                                                                                                                                                                                                                                                                                                |
| v13     | إصلاحات إضافية على القيود.                                                                                                                                                                                                                                                                                                                                                                                               |
| v14     | تنظيف legacy لصفوف أرباح دفعات الزبائن المكررة.                                                                                                                                                                                                                                                                                                                                                                          |
| v15     | إضافة أعمدة/فهارس.                                                                                                                                                                                                                                                                                                                                                                                                       |
| v16     | إصلاحات.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| v17     | إصلاحات.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| v18     | إصلاحات.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| v19     | **ترحيل كبير**: تحديث قيم `purchase_type` (`'دين'` → `'تمويل'`, `'شراكه'`/`'شراكة'`/`'موجود'` → `'كاش'`). حذف `car_partners`/`partners`/`partner_transactions`/`partner_profit_shares`/`financial_ledger` القديمة لشركاء غير أساسيين. `migrate_existing_data_to_ledger` (إنشاء قيود لكل البيانات التاريخية). `ensure_sales_cogs_entries`. إضافة `iqd_balance`/`usd_balance` إلى `partners`. تطبيع `payment_type='قاصه'`. |
| v20     | تحويل كل أعمدة `Money` من `REAL` إلى `TEXT` لمنع فقدان الدقة (`migrate_all_money_columns_to_text`). إعادة بناء فهرس `idx_partner_tx_source_unique` بشكل صحيح. إضافة فهارس `idx_partner_transactions_partner`, `idx_ledger_reference`, `idx_ledger_account`.                                                                                                                                                              |
| v21     | حذف قيود `financial_ledger` لصفوف `partner_transactions` محذوفة (يتيمة). `recalculate_all_partners`.                                                                                                                                                                                                                                                                                                                     |
| v22     | فصل أرباح الوكالات: كان صف واحد يحمل `affects_qasa=1, affects_partner_cash=1, affects_profit=1` معًا — يُقسَّم إلى صفين: `cash_movement` (qasa+cash) و`profit_recognition` (profit only). إعادة بناء فهرس `idx_partner_tx_source_unique` ليشمل `currency`.                                                                                                                                                               |
| v23     | حذف كل صفوف `profit_recognition` (لأن الربح يُحسب تحليليًا الآن من `affects_profit=1` rows).                                                                                                                                                                                                                                                                                                                             |
| v24     | إعادة تسمية دفعات الأقساط من `'ايداع مقدمة سيارة'` إلى `'ايداع قسط سيارة'` لتمييزها عن المقدمات.                                                                                                                                                                                                                                                                                                                         |
| v25     | إعادة بناء أرباح دفعات الزبائن (`rebuild_customer_payment_profit_recognitions`) + `recalculate_all_partners`.                                                                                                                                                                                                                                                                                                            |
| v26     | جعل صفوف مقدمة البيع للزبون `affects_qasa=0, affects_partner_cash=0, affects_profit=0` (الحركة النقدية للشركاء فقط). إعادة بناء أرباح البيع النقدي + حركات الوكالات + أرباح دفعات الزبائن.                                                                                                                                                                                                                               |
| v27     | إضافة عمود `creation_token` إلى `agencies` + `idx_agencies_creation_token` (UNIQUE). أول كيان يدعم idempotency.                                                                                                                                                                                                                                                                                                          |
| v28     | إضافة عمود `payment_status` إلى `agencies` (افتراضي `'واصل'`).                                                                                                                                                                                                                                                                                                                                                           |
| v29     | تحويل ذمم الوكالات إلى `kind='وكالة'` بدلًا من `'زبون'`. إنشاء حسابات `kind='وكالة'` للوكلاء الآجلين. إعادة بناء قيود الوكالات.                                                                                                                                                                                                                                                                                          |
| v30     | **Audit fixes الكبرى**: تسوية صفوف `cash_movement` ذات المبالغ السالبة الخاطئة. تصحيح `related_source_type='car'` بدلًا من رقم السيارة. إعادة بناء قيود بيع السيارات (لترحيل المبيعات القديمة إلى installment method). `rebuild_customer_payment_profit_recognitions` و`rebuild_cash_sale_profit_recognitions`. إعادة بناء قيود وحركات الوكالات. `recalculate_all_partners`.                                             |
| v31     | تطبيع قيم `chassis_number` عبر `normalize_chassis_value`. إنشاء فهرس فريد `idx_cars_chassis_unique` (إلا إذا كانت تكرارات موجودة — يُتخطَّى الإنشاء في تلك الحالة).                                                                                                                                                                                                                                                      |
| v32     | **تنظيف الأيتام**: `cleanup_orphan_partner_splits` يحذف صفوف `partner_transactions` التي `source_id` يشير إلى صف محذوف. إعادة بناء قيود تسديدات الممول/الشركة (`funder_transaction`/`company_transaction` مع `source_role='repayment_account_movement'` و`type LIKE 'سحب%'`) الناقصة. `recalculate_all_partners`.                                                                                                        |
| v33     | **إزالة قيد التفرد على `chassis_number`** (§31.3): `DROP INDEX idx_cars_chassis_unique` وإنشاء `idx_cars_chassis` غير فريد بدلًا منه.                                                                                                                                                                                                                                                                                    |
| v34     | **إضافة `creation_token` لكل الكيانات** (§31.2): `cars`, `expenses`, `car_expenses`, `partner_transactions`, `agency_transactions` — كل واحد مع فهرس UNIQUE PARTIAL.                                                                                                                                                                                                                                                     |
| v35     | **أعمدة `audit_log` الجديدة + postconditions fail-closed**: إضافة `actor_user_id`, `session_id`, `request_id`, `creation_token` إلى `audit_log`. إعادة إنشاء فهارس `creation_token` الناقصة من v34 (بسبب `let _ = ...` الذي ابتلع الأخطاء). فحص fail-closed: إن لم يُنشأ فهرس، تفشل الترقية بـ `"v35 postcondition failed: index X was not created"`.                                                                    |
| v36     | جداول اليومية الجديدة، قيود CHECK، حارس منع البيع المزدوج، وقيود سلامة مصروفات السيارات.                                                                                                                                                                                                                                                                                                                                 |
| v37     | إضافة `financial_ledger.reverses_ledger_id` وفهرسه لدعم قيود العكس المرتبطة.                                                                                                                                                                                                                                                                                                                                             |
| v38     | إضافة `cars.created_at` وفهرس منع التكرار؛ فصل نافذة الخمس ثوانٍ عن `purchase_date` الذي يدخله المستخدم.                                                                                                                                                                                                                                                                                                                 |
| v39     | إضافة `cars.id` غير القابل للتغير وربط مصروفات السيارة بـ`car_id` بدل حقول العرض. |
| v40     | تأسيس `operations` والهويات الرقمية للحساب/البيع/القسط وروابطها، مع فشل الترحيل عند غموض الأسماء المطبّعة. |
| v41     | إكمال رابط الدفع الرقمي `installment_id_v2` مع فحوص cardinality وpostconditions fail-closed. |
| v42     | أعمدة وروابط العكس الإلحاقي للمصروفات وحركات الشركاء والعمليات. |
| v43     | إعادة بناء أحداث دفع الأقساط بمفاتيح خارجية حقيقية لسلسلة operation/sale/account/installment. |
| v44     | إلغاء حركة الوكالة إلحاقيًا؛ إضافة النسخ والعمليات والروابط الرقمية اللازمة لمسارات الوكالة والسيارة. |
| v45     | إعادة بناء `expenses` و`car_expenses` و`car_partners` بمفاتيح خارجية حقيقية، backfill للعمليات القديمة، وفحوص integrity/FK قبل التسجيل. |
| v46     | حالات `active/reversed/superseded` وروابط supersede، ومنع DELETE للدفتر وحركات الشركاء ومنع UPDATE/DELETE لسجل التدقيق. |
| v47     | نقل حقول التدقيق التاريخية إلى `legacy_payload` كما هي، والتحقق من بنية الأحداث الجديدة وJSON وبصمة الجلسة. |
| v48     | منع تعديل جوهر القيد المنشور: التاريخ والوقت والحساب والمبلغ والعملة ونوع/معرّف المرجع ونوع القيد؛ التصحيح يكون بقيد عكسي. |
| v49     | إضافة المراجع الرقمية `source_entity_id` و`related_entity_id` و`reference_entity_id`، وتحويل هويات الأقساط إلى `installments.id`، مع backfill مغلق عند الغموض وفهارس وحراس مزامنة. |

## التركيز على v30–v35

### v30 — تنظيف ومراجعة شاملة (Audit Fixes)

طبّقت v30 تصحيحات الإعادة بناء التي تلت التدقيق المحاسبي الشامل. الأهم:

1. **تصحيح المبالغ السالبة في صفوف `cash_movement` لزبائن**: كانت صفوف `partner_transactions` من نوع `سحب` تحمل `amount < 0` بالخطأ، مما يجعل القارئ ينطبق إشارة السالب مرتين. الحل: `UPDATE partner_transactions SET amount = -amount WHERE ... AND amount < 0`.
2. **تصحيح `related_source_type`**: كانت تحتوي على رقم السيارة بدلًا من القيمة الحرفية `'car'`. الحل: `UPDATE ... SET related_source_type = 'car' WHERE related_source_type NOT IN ('car', 'customer_payment_event', 'partner_transaction', 'installment') AND related_source_type = COALESCE(related_source_id, '')`.
3. **إعادة بناء قيود بيع السيارات المبيوعة**: كل سيارة `status='مبيوعة'` تُحذف قيود بيعها القديمة ويُعاد بناؤها عبر `record_car_sale_ledger_entries` لضمان استخدام installment method (`Dr receivable / Cr inventory / Cr deferred_revenue`).
4. **`rebuild_customer_payment_profit_recognitions`**: إعادة بناء كل صفوف اعتراف الربح للدفعات بعمليات حسابية آمنة للعملات.
5. **`rebuild_cash_sale_profit_recognitions`**: إعادة بناء كل صفوف اعتراف الربح للمبيعات النقدية (موجبة للربح، سالبة للخسارة — §30.1).
6. **إعادة بناء قيود وحركات الوكالات**: كل `agencies.id` يُعاد بناء قيوده (`record_agency_ledger_entries`) ثم `rebuild_all_agency_partner_entries`.
7. **`recalculate_all_partners`**: إعادة حساب كل أرصدة الشركاء في النهاية.

### v31 — فهرس `chassis_number` (ثم أُلغي في v33)

طبّقت v31 تطبيع قيم `chassis_number` عبر `normalize_chassis_value` وحاولت إنشاء فهرس فريد `idx_cars_chassis_unique`. **المشكلة**: إن وُجدت سيارتان بنفس الـ chassis (وهو سيناريو مشروع وفق §31.3)، كانت v31 القديمة تُحبط الترقية بالكامل، فتحبس القاعدة عند v30 وتمنعها من الوصول إلى v33 التي تُصلح المشكلة. **الإصلاح الحالي**: v31 لا تُحبط عند التكرار، بل تتخطّى إنشاء الفهرس الفريد (logging warning على `stderr`) وتترك v33 تُصلحه. هذا يضمن أن أي قاعدة بيانات يمكنها الوصول إلى v35.

### v32 — تنظيف الأيتام في `partner_transactions` و`financial_ledger`

طبّقت v32 إصلاحين لعلة الإنتاج (BUG-1 من إعادة التدقيق 2026-07-10):

1. **`cleanup_orphan_partner_splits`**: يحذف صفوف `partner_transactions` التي `source_id` يشير إلى صف محذوف. على قاعدة الإنتاج عند v30، كان هناك صفّان يتيمان (229, 230) بـ `source_id='228'` يشيران إلى `funder_transaction` محذوف — كانا يخفضان كاش الشركاء بمقدار 52,050 IQD دون مقابل، منتجةً imbalance في الـ ledger بمقدار −52,050 IQD.
2. **إعادة بناء قيود التسديدات الناقصة**: `record_partner_ledger_entries` القديم كان يتخطّى مبكرًا أي صف بـ `affects_qasa=0 AND affects_partner_cash=0 AND source_role != "profit_recognition"`، فأسقط خطأً قيود تسديدات الممول/الشركة (التي يحملها الصف الأصلي). v32 يعيد بناء قيود كل صف `funder_transaction`/`company_transaction` بـ `source_role='repayment_account_movement'` و`type LIKE 'سحب%'` ليس له قيود حالية.
3. **`recalculate_all_partners`** في النهاية.

**Idempotency**: كلا الإصلاحين idempotent — تنظيف الأيتام يحذف فقط ما ليس له أصل، وإعادة بناء القيود تكتب فقط للصفوف التي ليس لها قيود حالية. اختبار `test_orphan_partner_splits_cleaned_by_migration_v32` يغطي هذا.

### v33 — إزالة قيد التفرد على `chassis_number` (§31.3)

§31.3 تنص على أن نفس المركبة الفيزيائية قد تُشترى وتُباع وتُعاد عدة مرات، وكل دورة هي حدث محاسبي مستقل بـ `car_number` خاص. القيد الفريد على `chassis_number` (المضاف في v31) منع هذا السيناريو المشروع. v33 تحل المشكلة:

```sql
DROP INDEX IF EXISTS idx_cars_chassis_unique;
CREATE INDEX IF NOT EXISTS idx_cars_chassis
ON cars(chassis_number COLLATE NOCASE)
WHERE chassis_number IS NOT NULL AND TRIM(chassis_number) != '';
```

الفهرس الجديد غير فريد (لاستخدامات البحث) لكنه لا يمنع التكرار. الدالة `ensure_unique_chassis` في `lib.rs` أُعيد كتابتها لتقبل التكرار (تتحقق فقط من عدم كون القيمة فارغة).

### v34 — إضافة `creation_token` لكل الكيانات (§31.2)

§31.2 تنص على أن كل عملية إنشاء يجب أن تقبل `creation_token` اختياريًا. الكيانات الناقصة كانت: `cars`, `expenses`, `car_expenses`, `partner_transactions`, `agency_transactions`. v34 تضيف لكل جدول:

```sql
ALTER TABLE <table> ADD COLUMN creation_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_<table>_creation_token
ON <table>(creation_token)
WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '';
```

الفهرس PARTIAL UNIQUE: الصفوف بدون `creation_token` (NULL أو فارغ) لا تتعارض، فقط الصفوف التي تحمل `creation_token` فعليًا. هذا يسمح بتعايش البيانات القديمة (بدون token) مع البيانات الجديدة (مع token).

**ملاحظة**: v34 استخدم `let _ = conn.execute(...)` لكلا الاستعلامين، مما يعني أن أي فشل في `ALTER` أو `CREATE INDEX` يُبتلع بصمت. قاعدة بيانات علقت عند v34 بأعمدة مفقودة لن تُكتشف إلا في v35.

### v35 — أعمدة `audit_log` الجديدة + Postconditions Fail-Closed

v35 تخدم هدفين متوازيين:

#### 1. إكمال تدقيق الأفعال (audit trail completeness — §10.4)

إضافة 4 أعمدة جديدة إلى `audit_log`:

```sql
ALTER TABLE audit_log ADD COLUMN actor_user_id INTEGER;
ALTER TABLE audit_log ADD COLUMN session_id TEXT;
ALTER TABLE audit_log ADD COLUMN request_id TEXT;
ALTER TABLE audit_log ADD COLUMN creation_token TEXT;
```

كل عمود يُضاف بمعالجة `DuplicateColumn` متسامحة (إذا كانت v35 طُبّقت جزئيًا من قبل)، لكن أي خطأ آخر قاتل. الأعمدة الجديدة تجعل كل طفرة في قاعدة البيانات قابلة للتتبع حتى:

- **`actor_user_id`**: المستخدم الذي فعّل الأمر (يكمل `actor` النصي القديم).
- **`session_id`**: الجلسة (`sessions.token`) التي أرسلت الأمر.
- **`request_id`**: معرّف فريد لكل طلب IPC (للتمييز بين الطلبات المتعددة في نفس الجلسة).
- **`creation_token`**: الـ idempotency token (لربط عمليات retry بالأصل).

#### 2. إصلاح فهارس `creation_token` الناقصة (postconditions fail-closed)

v34 استخدم `let _ = ...` للـ `ALTER` و`CREATE INDEX`، مما يعني أن قاعدة بيانات وصلت إلى v34 لكنها لم تُنشئ بعض الأعمدة/الفهارس (مثلًا بسبب race condition أو خطأ SQLite). v35 يعيد إنشاء كل فهارس `creation_token` عبر `CREATE UNIQUE INDEX IF NOT EXISTS` (idempotent) ثم يتحقق من وجودها:

```rust
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
            format!("v35 postcondition failed: index {} was not created", idx_name).into(),
        ));
    }
}
```

هذا النمط **fail-closed** يضمن أن الترقية لا تنجح ظاهريًا بينما تترك القاعدة في حالة ناقصة. هذا يطيع قاعدة §9.1: لا نعدّل v34 المنشورة، بل نضيف v35 فوقها.

## القاعدة الذهبية: لا تعدّل Migration منشورة

كل ترحيلة منشورة (طبّقتها قاعدة بيانات إنتاج واحدة على الأقل) **لا تُعدَّل**. إن وُجد خطأ في v34، الإصلاح يكون في v35 — لا في تعديل v34. الأسباب:

1. **حتمية الترقية**: قاعدة بيانات طبّقت v34 من قبل ستحتوي `db_version = 34`، فلن تُعيد تطبيق v34 المعدّلة. يجب أن يكون الإصلاح في v35 التي ستحاول القاعدة القديمة تطبيقها.
2. **قابلية التتبع**: تعديل v34 يكسر سجل الترقيات — لا يمكن للمُراجع معرفة ما طبّقته قاعدة بيانات معينة فعلًا.
3. **التوافق مع الإصدارات السابقة**: قاعدة بيانات جديدة يجب أن تصل إلى نفس الحالة النهائية بصرف النظر عن المسار (v1→v35 مباشرة، أو v1→v30 ثم توقف ثم v31→v35).
4. **Postconditions كشبكة أمان**: v35 تستخدم فحص `sqlite_master` بعد `CREATE INDEX IF NOT EXISTS` لضمان أن الفهرس موجود فعلًا. هذا النمط يجب أن يُعتمد لكل Migration مستقبلية حساسة.

## اختبارات الترحيل

- `test_orphan_partner_splits_cleaned_by_migration_v32` (السطر 18695 في `lib.rs`) — يبني fixture حتمي على نسخة v30، يطبق v32، ويتحقق من إزالة الأيتام وتوازن الـ ledger.
- `test_money_columns_migrate_to_text_affinity` و`test_money_migration_preserves_expression_defaults` — يغطيان v20 (تحويل `REAL` إلى `TEXT`).

## أوامر التشغيل

```bash
# تشغيل اختبارات الترحيل
cargo test --lib migration

# التحقق من إصدار قاعدة البيانات
python3 -c "import sqlite3; print(sqlite3.connect('src-tauri/fjr_alwadi_data.db').execute('SELECT COALESCE(MAX(version), 0) FROM db_version').fetchone()[0])"

# فحص سلامة المخطط
python3 -c "import sqlite3; c = sqlite3.connect('src-tauri/fjr_alwadi_data.db'); print(c.execute('PRAGMA integrity_check').fetchone()[0]); print(c.execute('PRAGMA foreign_key_check').fetchall())"
```
