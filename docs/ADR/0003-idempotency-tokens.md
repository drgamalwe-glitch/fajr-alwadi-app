# ADR-0003 — تبنّي creation_token (UUID v4) لكل عملية إنشاء قابلة للإعادة

- **التاريخ**: 2026-07-15
- **الحالة**: مقبول (Accepted)
- **المُقرّر**: فريق التدقيق الجنائي — جولة 11-B
- **المعرّف في `docs/BUG_REGRESSIONS.md`**: IDEMPOTENCY-1
- **المراجع**: `Instructions.md` §31.2 و§31.5، `reports/FINAL_REPORT.md`، `docs/BUG_REGRESSIONS.md`

## السياق

تطبيقات سطح المكتب المحاسبية تواجه خطر "double-click": المستخدم يضغط زر "حفظ" مرتين بسرعة، فيُنشأ النظام صفّين مكررين. في المحاسبة، هذا يعني مبلغًا مزدوجًا في القاصة، ربحًا مزدوجًا، ذمة مدينة مزدوجة. الأخطاء من هذا النوع صعبة الكشف لأن كل صف يبدو صحيحًا بمفرده.

### الحالة قبل القرار

قبل §31.2 وv34، كان النظام يفتقر إلى idempotency صريح:

- `add_agency` كان الوحيد مع `creation_token` (مُضاف في v27).
- `add_car`, `add_expense`, `add_car_expense`, `add_partner_transaction`, `add_agency_transaction` لم تقبل `creation_token`. كل ضغطة زر تُنشئ صفًا جديدًا.
- كشف التكرار ضمن 5 ثوانٍ (نمط `julianday('now') - julianday(date) < 0.00006` على نفس الحقول) كان موجودًا، لكنه هش:
  - إن تغيّر أي حقل (مثلًا notes)، يفشل الكشف.
  - إن جاء الطلب الثاني بعد 6 ثوانٍ، يفشل الكشف.
  - إن جاء الطلب من عملية متوازية (race condition)، قد يفشل الكشف.
- كان التدقيق السابق قد صنّف idempotency كمسار غير مكتمل؛ أُغلق ذلك لاحقًا بالمطالبة المركزية وبصمة payload واختبارات replay/رفض الاختلاف.

### المشكلة الجوهرية

الـ double-click ليس خطأ المستخدم — هو واقع واجهات الويب. الحلول من نوع "تعطيل الزر بعد الضغط" (disable on click) هشة لأن:

- قد يفشل الطلب الأول، فيبقى الزر معطّلًا والمستخدم لا يستطيع إعادة المحاولة.
- قد ينجح الطلب الأول لكن الـ UI يُعاد تحميله قبل استلام الرد، فيُرسل المستخدم الطلب ثانية.
- في Tauri IPC، قد يحدث timeout فيُرسل المستخدم طلبًا ثانيًا بينما الأول ما زال يُنفّذ.

الحل الصحيح: **idempotency على مستوى الـ backend** عبر `creation_token` فريد لكل عملية منطقية. الـ backend يضمن أن نفس الـ token لا يُنشئ صفّين.

## القرار

نتبنّي نمط `creation_token` (UUID v4) لكل عملية إنشاء قابلة للإعادة. §31.2 من `Instructions.md` تُلزم بهذا، وهذا القرار يُطبّقه.

### 1. الكيانات الست الإلزامية

كل عملية إنشاء للكيانات التالية تقبل `creation_token: Option<String>`:

| الكيان                  | الأمر المسؤول               | Migration  | اختبار الانحدار                              |
| ----------------------- | --------------------------- | ---------- | -------------------------------------------- |
| `agencies`              | `add_agency`                | v27 + §31.2.1 | `test_agency_creation_token_is_unique_but_optional` |
| `cars`                  | `add_car`                   | v34        | `test_orphan_partner_splits_cleaned_by_migration_v32` (يغطي نمط creation_token ضمنيًا) |
| `expenses`              | `add_expense`               | v34        | `scripts/test_duplicate_prevention.py` (16/16) |
| `car_expenses`          | `apply_car_expense_changes` (فردي) | v34        | (نقص — راجع "مخاطر متبقية" أدناه)             |
| `partner_transactions`  | `add_partner_transaction`   | v34        | `test_agency_creation_token_is_unique_but_optional` (نفس النمط) |
| `agency_transactions`   | `add_agency_transaction`    | v34        | (نقص — كشف 5 ثوانٍ غير مُطبَّق بعد)            |

### 2. توليد الـ token في العميل

الـ token يُولّد في الواجهة الأمامية عبر `crypto.randomUUID()` (متاح في كل المتصفحات الحديثة وTauri WebView). يُولّد **مرة واحدة** لكل عملية منطقية (مثلًا: فتح نموذج "إضافة سيارة" يُولّد token جديدًا عند الإرسال). يُمرّر إلى الـ backend عبر حقل `creation_token` في الـ invoke payload.

```typescript
// src/utils/idempotency.ts
export function newCreationToken(): string {
  return crypto.randomUUID();
}
```

عند الـ retry (مثلاً timeout ثم إعادة المحاولة)، **نفس الـ token** يُمرّر. الـ backend يفحص ويُعيد الصف الأصلي.

### 3. الفحص في الـ backend

كل أمر إنشاء يُنفّذ النمط التالي في بداية المعاملة:

```rust
if let Some(token) = &creation_token {
    if !token.trim().is_empty() {
        let existing_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM <table> WHERE creation_token = ?1",
                params![token],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = existing_id {
            // Idempotent retry — return original ID without creating a new row.
            append_audit_event(
                &db, user_id, "<entity_type>", Some(id),
                "<entity>_command.idempotent_retry",
                session_token.as_deref(), Some(token),
            )?;
            db.commit()?;
            return Ok(id);
        }
    }
}
// Proceed with INSERT...
```

### 4. الفهرس في قاعدة البيانات

كل جدول يحوي عمود `creation_token TEXT` (NULL مسموح للصفوف القديمة) مع فهرس `UNIQUE PARTIAL`:

```sql
ALTER TABLE <table> ADD COLUMN creation_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_<table>_creation_token
ON <table>(creation_token)
WHERE creation_token IS NOT NULL AND TRIM(creation_token) != '';
```

الـ PARTIAL UNIQUE يسمح بتعايش الصفوف القديمة (NULL أو فارغ) مع الصفوف الجديدة (UUID). فقط الصفوف التي تحمل `creation_token` فعليًا تخضع لقيد التفرد.

### 5. كشف 5 ثوانٍ احتياطي

إن لم يُمرّر `creation_token` (مثلاً من عميل قديم لم يُحدّث)، يُطبَّق كشف تكرار خلال 5 ثوانٍ على نفس الحقول الجوهرية:

```sql
SELECT id FROM <table>
WHERE <same essential fields>
  AND julianday('now') - julianday(date || ' ' || COALESCE(time, '00:00')) < 0.00006
LIMIT 1
```

إن وُجد، يُعاد معرّفه دون إنشاء جديد. هذا يحمي من double-click حتى دون `creation_token`. §31.5 تُلزم بهذا النمط.

### 6. التدقيق

كل عملية idempotent retry تُسجّل في `audit_log` بـ `action="<entity>_command.idempotent_retry"` و`creation_token` المُمرّر. هذا يسمح بتتبّع عدد retries لكل عملية منطقية. راجع `docs/SECURITY_MODEL.md` §3.

## العواقب

### إيجابية

- **منع الازدواج الكامل**: نفس `creation_token` لا يُنشئ صفّين. هذا يحمي من double-click، retry، وrace conditions.
- **استرداد آمن بعد timeout**: العميل يمكنه إعادة إرسال نفس الطلب دون خطر الازدواج. الـ backend يُعيد الصف الأصلي.
- **تتبّع العمليات المنطقية**: كل صف يحمل `creation_token` يُربط بعملية منطقية واحدة. هذا يُسهّل التدقيق ("هذا القسط نتيجة أي محاولة إدخال؟").
- **توافق مع §31.2**: القاعدة مُطبّقة بالكامل (باستثناء `apply_car_expense_changes` — راجع أدناه).
- **توافق مع §31.5**: كشف 5 ثوانٍ احتياطي موجود لكل الكيانات (ما عدا `agency_transactions` — راجع أدناه).

### سلبية

- **عبء على العميل**: الواجهة يجب أن تولّد `creation_token` لكل عملية. هذا يتطلب تعديل كل `invoke()` في `src/api/tauri.ts`. الأوامر التي لم تُحدّث بعد تُمرّر `undefined`، فيسقط الـ backend على كشف 5 ثوانٍ.
- **تخزين إضافي**: عمود `creation_token TEXT` + فهرس لكل جدول. الحجم ضئيل (UUID v4 = 36 بايت لكل صف) لكنه غير صفري.
- **تعقيد الكود**: كل أمر إنشاء يحتاج فحص `creation_token` أولًا. هذا 5–10 أسطر إضافية لكل أمر.
- **`apply_car_expense_changes` غير مُغطى بالكامل**: هذا الأمر يُضيف مصاريف سيارة متعددة دفعة واحدة. كل عنصر في المصفوفة يجب أن يحصل على `creation_token` خاص به. لم يُنفّذ بعد. مخاطرة: double-click على زر "حفظ مصاريف" قد يُضيف كل المصاريف مرتين.
- **`agency_transactions` بدون كشف 5 ثوانٍ**: `add_agency_transaction` يقبل `creation_token` (v34) لكن لا يُطبّق كشف 5 ثوانٍ احتياطي. مخاطرة منخفضة لأن الإضافة تكون من داخل صفحة وكالة موجودة (معرّف الوكالة يُقلّل خطر double-click العرضي)، لكنه ليس كاملاً.

### مخاطر متبقية موثقة

- **`apply_car_expense_changes`**: يحتاج تحديث ليقبل مصفوفة `creation_token` لكل عنصر، أو يولّد UUID لكل عنصر داخليًا (أضعف لأنه لا يربط بعملية منطقية للعميل).
- **`agency_transactions` 5-second dedup**: يحتاج إضافة كشف 5 ثوانٍ على نفس النمط.
- **العملاء القدامى**: أي عميل لم يُحدّث لإرسال `creation_token` يعتمد على كشف 5 ثوانٍ فقط. هذا هش. الحل: تحديث كل العملاء لإرسال `creation_token`.

## بدائل مُعتبرة ومرفوضة

### بديل 1: كشف 5 ثوانٍ فقط دون creation_token

مرفوض. هش: يتطلب نفس الحقول بالضبط، يفشل بعد 6 ثوانٍ، لا يحمي من race conditions حقيقية. §31.5 تطلبه كاحتياطي لكن ليس كحل وحيد.

### بديل 2: تعطيل الزر بعد الضغط في الواجهة

مرفوض. هش: يفشل عند timeout، يفشل عند إعادة تحميل الواجهة، لا يحمي من الـ programmatic retries. هذا إصلاح UI، لا إصلاح backend.

### بديل 3: قيد UNIQUE على كل الحقول الجوهرية

مرفوض. لا يسمح بصفّين متطابقين في أوقات مختلفة (مثلاً: مصروف بنفس المبلغ والوصف في يومين مختلفين — مشروع). أيضاً يكسر الحالات المشروعة مثل §31.3 (تكرار `chassis_number`).

### بديل 4: تسلسل عمومي (global sequence) لكل عملية

مرفوض. يتطلب جدول `operations` مركزي يربط كل طلب بـ ID. هذا يُضيف تعقيدًا ويُبطئ الأداء. `creation_token` يحقق نفس الهدف دون جدول مركزي.

### بديل 5: database-level CHECK constraint

مرفوض. SQLite لا يدعم CHECK معقد يفحص `creation_token` عبر الجداول. يجب أن يكون في كود Rust.

## مراجع

- `Instructions.md` §31.2 (Idempotency Tokens), §31.5 (Duplicate Addition Prevention).
- `reports/FINAL_REPORT.md` — دليل إغلاق مسار idempotency ونتائج اختباره.
- `src-tauri/src/lib.rs` — تنفيذ `creation_token` في كل أمر إنشاء (الأسطر مذكورة في `docs/COMMAND_CATALOG.md`).
- `src/utils/idempotency.ts` — `newCreationToken()` للواجهة.
- `docs/SCHEMA.md` — عمود `creation_token` في كل جدول (cars, expenses, car_expenses, partner_transactions, agency_transactions, agencies).
- `docs/MIGRATIONS.md` — v27 (agencies), v34 (بقية الكيانات), v35 (postconditions fail-closed على الفهارس).
- `docs/COMMAND_CATALOG.md` — تفاصيل Idempotency لكل أمر.
- `docs/SECURITY_MODEL.md` §3 — `append_audit_event` يُسجّل `creation_token`.
- `docs/BUG_REGRESSIONS.md` IDEMPOTENCY-1 — سجل الإصلاح.
- `docs/ADR/0001-source-of-truth.md` — المصدر الأعلى (§31.2) الذي يستند إليه هذا القرار.
- `docs/ADR/0004-fail-closed-migrations.md` — postconditions على فهارس `creation_token`.
