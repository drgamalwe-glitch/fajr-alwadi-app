
# تقرير الأخطاء المحاسبية والبرمجية الشامل

> تاريخ التقرير: 21 يونيو 2026  
> المشروع: فجر الوادي لتجارة السيارات

---

## ملخص الأخطاء المكتشفة (مرتبة حسب الخطورة)

| الرقم | الخطورة | الملف | الوصف |
|-------|---------|-------|-------|
| H1 | **حرج** | `lib.rs:2879-2892` | فقدان أرباح بيع السيارات بعملات مختلفة |
| H2 | **حرج** | `lib.rs:5945-5959` | تضخم المصروفات في توزيع الأرباح (قد يضاعف مصروفات السيارات) |
| H3 | **حرج** | `lib.rs:2446-2480` | عدم توازن قيود الأستاذ عند اختلاف عملة الشراء عن البيع |
| H4 | **متوسط** | `lib.rs:5119-5120` | أسماء الشركاء مقسّمة بشكل ثابت (hardcoded) |
| H5 | **متوسط** | `lib.rs:5606,5696` | `cash_iqd` و `net_capital_iqd` متطابقان تماماً (payment_type غير مستخدم) |
| H6 | **متوسط** | `ProfitDistributionTab.tsx:55-57` | تقسيم المصروفات على جميع الشركاء بالتساوي (وليس 50/50) |
| H7 | **متوسط** | `lib.rs:4320-4494` | دمج غير صحيح لعملتي IQD و USD في نفس الرصيد الجاري للقاصة |
| H8 | **متوسط** | `CashRegisterTab.tsx:9-57` | تحليل العمولة يعتمد على نص ثابت "عمولة:" بشكل هش |
| H9 | **متوسط** | `tauri.ts` | دالة `get_profit_distribution_summary` مفقودة من طبقة mock |
| H10 | **طفيف** | `CompanyStatusTab.tsx:93` | الكاش مستبعد من قاعدة الأصول المشتركة للشركاء |
| H11 | **طفيف** | `finance.ts:44` | معادلة `netCapital` غير مكتملة (لا تشمل الكاش والذمم) |
| H12 | **طفيف** | `lib.rs:4549-4644` | إدخال `car_number` في جدول `expenses` للمصروف العام يسبب التباساً |
| H13 | **طفيف** | `3_verify_project.py:689` | استعلام فحص 18 لا يعكس الحساب الصحيح لصافي رأس المال |
| H14 | **طفيف** | `lib.rs:5784-5825` | استثناء أرباح التقسيط قد لا يعمل مع السيارات المسددة جزئياً |

---

## ❌ أخطاء حرجة (Critical)

### H1: فقدان أرباح بيع السيارات بعملات مختلفة
**الملف:** `src-tauri/src/lib.rs:2879-2892`

**السبب:** عند بيع سيارة كاش، كتلة توزيع أرباح السيارة محاطة بشرط:
```rust
if purchase_curr == sale_curr {  // ← السطر 2879
    let profit = selling - total_cost;
    if profit > 0.0 {
        distribute_to_partners_50(&db, profit, sale_curr, ...); // توزيع الربح
    }
}
```

عندما تشترى السيارة بعملة (مثلاً IQD) وتباع بعملة أخرى (مثلاً USD)، الشرط يكون `false` وبالتالي:
- لا يتم حساب الربح (`profit`) أبداً
- لا يتم استدعاء `distribute_to_partners_50()` للربح مطلقاً
- الربح يختفي تماماً ولا يذهب لحسابات الشركاء

**التأثير:** أي سيارة يتم شراؤها بعملة وبيعها بعملة أخرى (IQD ↔ USD) سيتم فقدان ربحها بالكامل. فقط التكلفة تعود للشركاء. في سوق السيارات العراقي حيث التعامل بالعملتين شائع جداً، هذا خطأ محاسبي جسيم.

**مخالفة للتعليمات:** المادة 2 تنص على أن أرباح السيارات المباعة كاش تدخل مباشرة في الأرباح.

---

### H2: تضخم المصروفات في توزيع الأرباح
**الملف:** `src-tauri/src/lib.rs:5945-5959`

**السبب:** دالة `get_profit_distribution_summary` تستعلم عن المصروفات:
```sql
SELECT COALESCE(SUM(amount), 0.0) FROM expenses
WHERE COALESCE(currency, 'IQD') = 'IQD' AND date >= ?1 AND date <= ?2
```
بدون شرط `WHERE car_number IS NULL`.

**التأثير:** إذا تم تسجيل أي مصروف عام وربطه برقم سيارة (car_number غير فارغ)، فسيتم احتسابه مرتين:
1. مرة ضمن `car_expenses` (عبر مسار مصروف السيارة)
2. مرة أخرى ضمن `expenses` في توزيع الأرباح

هذا يضخم المصروفات ويقلل صافي الربح المعروض في شاشة توزيع الأرباح.

**ملاحظة:** حالياً مسار `add_expense` مع `car_number` يخزن في `car_expenses` (وليس `expenses`)، لكن دعم `car_number` في جدول `expenses` (السطر 4632) يسمح بإدخال مستقبلي قد يسبب المشكلة.

---

### H3: عدم توازن القيود عند اختلاف عملة الشراء عن البيع
**الملف:** `src-tauri/src/lib.rs:2437-2480`

**السبب:** في `record_car_ledger_entries`:
- قيد الإيراد (revenue) يُسجل بعملة البيع `sale_currency`
- قيد تكلفة المبيعات (COGS) يُسجل بعملة الشراء `currency`
- قيد تخفيض المخزون يُسجل بعملة الشراء `currency`

نظام `financial_ledger` يتتبع الأرصدة لكل عملة بشكل منفصل. لذلك عند اختلاف العملة:
- USD: revenue = selling_price (صحيح) ولكن expense = 0 (خطأ!)
- IQD: revenue = 0 (خطأ!) ولكن expense = total_cost (صحيح)

**التأثير:** دالة `calculate_profit_totals_since` تحسب الربح كالتالي:
```rust
Ok((revenue_iqd - expenses_iqd, revenue_usd - expenses_usd))
```
للسيارة بعملات مختلفة: `IQD_result = 0 - total_cost` (سلبي) و `USD_result = selling_price - 0` (موجب) — وهذا غير صحيح محاسبياً.

---

## ⚠️ أخطاء متوسطة (Medium)

### H4: أسماء الشركاء مقسّمة بشكل ثابت (Hardcoded)
**الملف:** `src-tauri/src/lib.rs:5119-5120`

```rust
let partner_names = vec!["أمير".to_string(), "منتصر".to_string()];
let per_partner = amount / 2.0;
```

**التأثير:** لا يمكن إضافة شركاء جدد أو تغيير أسمائهم. إذا تم تعديل اسم أحد الشركاء في قاعدة البيانات، لن يستقبل التوزيعات. التعليمات (المادة 1) تنص على أن النسبة 50% لكل شريك، وهذا يعمل حالياً لكنه غير مرن.

---

### H5: `cash_iqd` و `net_capital_iqd` متطابقان تماماً
**الملف:** `src-tauri/src/lib.rs:5606` و `5696`

كلاهما يستخدم نفس الاستعلام:
```rust
let cash_iqd = partner_balance("IQD", false);       // سطر 5606
let net_capital_iqd = partner_balance("IQD", false);  // سطر 5696
```

المعامل `payment_type` يُستقبل في الدالة (سطر 5576) لكنه **لا يُستخدم أبداً** في أي query. وهذا يعني أن:
- **"قاصه"** و **"الكاش"** في `FinancialAccountsTab.tsx:27-34` يظهران نفس الرقم
- مخالف للتعليمات المادة 9 التي تنص: "الكاش ← قسم القاصة → تبويب الكاش" (يجب أن يكون مختلفاً عن القاصة العامة)

---

### H6: تقسيم المصروفات على كل الشركاء وليس 50/50
**الملف:** `ProfitDistributionTab.tsx:55-57`

```typescript
const partnerExpensesIQD = totalExpensesIQD / Math.max(1, partners.length);
const partnerExpensesUSD = totalExpensesUSD / Math.max(1, partners.length);
```

**التأثير:** هذا يفترض أن كل شريك يتحمل حصة متساوية من المصروفات. مع شريكين (2) يكون `total/2` وهو 50/50 صحيح. لكن إذا زاد عدد الشركاء عن 2 لأي سبب (مثلاً خطأ في البيانات)، سيصبح التقسيم خاطئاً.

---

### H7: دمج عملتَين في الرصيد الجاري للقاصة
**الملف:** `src-tauri/src/lib.rs:4320-4494`

دالة `get_cash_register_entries` تحسب رصيداً جارياً واحداً لكل عملة:
```rust
for entry in entries.iter_mut() {
    if entry.currency == "USD" {
        usd_running += entry.amount;
        entry.balance = usd_running;
    } else {
        iqd_running += entry.amount;
        entry.balance = iqd_running;
    }
}
```

**التأثير:** الرصيد الجاري (balance) يعرض رصيد العملة فقط وليس رصيداً موحداً. هذا صحيح من الناحية المحاسبية لكنه قد يربك المستخدم الذي يريد رؤية الرصيد الكلي. كما أن `entry.id` يُعاد تعيينه (سطر 4404) مما يفقد الربط بالسجلات الأصلية.

---

### H8: تحليل العمولة يعتمد على نص ثابت
**الملف:** `CashRegisterTab.tsx:9-57`

دالتا `parseCommissionText` و `parseCommissionNumeric` تقسمان النص على `"عمولة:"`. إذا اختلفت صيغة النص (مثلاً من عمليات تمويلية أو تسديدات)، ستعيد الدالتان `"—"` أو `0` بصمت.

**التأثير:** العمولات قد لا تُعرض أو تُحسب بشكل صحيح لبعض أنواع المعاملات.

---

### H9: دالة `get_profit_distribution_summary` مفقودة من Mock API
**الملف:** `src/api/tauri.ts` (لا يوجد معالج لهذه الدالة)

**التأثير:** عند تشغيل التطبيق بوضع Web (dev/mock)، شاشة توزيع الأرباح `ProfitDistributionTab` ستفشل لأنها تستدعي `callTauri<ProfitDistributionSummary>("get_profit_distribution_summary", ...)` ولا يوجد معالج mock لها.

---

## 📝 أخطاء طفيفة (Minor)

### H10: الكاش مستبعد من قاعدة الأصول المشتركة
**الملف:** `CompanyStatusTab.tsx:93-94`

```typescript
const sharedIqd = (summary.inventory_value_iqd + receivablesIqd - liabilitiesIqd) / 2;
const sharedUsd = (summary.inventory_value_usd + receivablesUsd - liabilitiesUsd) / 2;
```

**التأثير:** قيمة الشركة = كاش + مخزون + نطلب - مطلوبين (سطر 73). لكن `sharedIqd` لا يشمل الكاش. رأس مال الشريك = رصيده الشخصي + `sharedIqd`. هذا يعني أن توزيع الكاش ليس متماثلاً بين الشريكين في شاشة وضع الشركة.

---

### H11: معادلة netCapital في Dashboard غير مكتملة
**الملف:** `src/utils/finance.ts:44`

```typescript
const netCapital = totalInventoryValue + partnersTotal - investorsTotal;
```

**التأثير:** لا تشمل الكاش أو الذمم المدينة أو الدائنة. هذه معادلة مبسطة تُستخدم فقط لبطاقات Dashboard ولا تتطابق مع حساب `get_financial_summary` في الـ Rust.

---

### H12: إدخال car_number في جدول `expenses` للمصروف العام
**الملف:** `src-tauri/src/lib.rs:4631-4644`

```rust
INSERT INTO expenses (description, amount, date, time, notes, currency, car_number)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
```

حتى المصروف العام (بدون سيارة) يمرر `&car_number` (قيمته `None` أو `Some("")`). هذا يسبب التباساً لأن جدول `expenses` يحتوي على:
- صفوف بمصروفات عامة (car_number = NULL)
- يمكن أن يحتوي على car_number مرتبط بسيارة

---

### H13: استعلام فحص 18 في اختبارات المحاسبة
**الملف:** `accounting_tests/3_verify_project.py:689`

```python
cursor.execute("SELECT COALESCE(SUM(CASE WHEN ? = 'IQD' THEN iqd_balance ELSE usd_balance END), 0.0) FROM partners WHERE kind = 'شريك'", (curr,))
```

**التأثير:** `COALESCE(SUM(CASE WHEN ...), 0.0)` تجمع إما كل أرصدة IQD أو كل أرصدة USD في استعلام واحد. لكن الـ CASE WHEN تُقيَّم مرة واحدة لكل الاستعلام وليس لكل صف، مما قد يعطي نتائج غير صحيحة. الأصح هو استخدام استعلامين منفصلين:
```python
cursor.execute("SELECT COALESCE(SUM(iqd_balance), 0.0) FROM partners WHERE kind = 'شريك'")
```

---

### H14: استثناء أرباح التقسيط قد لا يعمل للسيارات المسددة جزئياً
**الملف:** `src-tauri/src/lib.rs:5784-5825`

استعلام استثناء أرباح التقسيط:
```sql
AND (SELECT COUNT(*) FROM partner_transactions WHERE notes LIKE '%#بيع_سيارة_' || cars.car_number || '%' AND type LIKE 'باقي%') > 0
```

**التأثير:** إذا كانت سيارة التقسيط مسددة بالكامل ولكن لا توجد حركات "باقي" (مثلاً تم شطبها بطريقة مختلفة)، لن يعمل الاستثناء. أيضاً النمط `'%باقي%'` قد يطابق أنواع حركات أخرى تحتوي على "باقي" في اسمها.

---

## ✅ نقاط صحيحة (مطابقة للتعليمات)

للتوثيق، النقاط التالية مطبقة بشكل صحيح:

1. **تقسيم 50/50 للشركاء** — يعمل عبر `distribute_to_partners_50` (صحيح)
2. **فصل مصروفات السيارة عن المصروفات العامة** — `car_expenses` جدول منفصل (صحيح)
3. **توزيع أرباح الوكالات** — تذهب فوراً إلى الشركاء 50/50 (صحيح)
4. **الدفعات والأقساط تذهب فوراً للشركاء** — عبر مسار partner_transactions (صحيح)
5. **القيد المزدوج في دفتر الأستاذ** — جميع العمليات تسجل قيدين (صحيح)

---

## التوصيات

1. **H1/H3 (عاجل):** تعديل `add_car` في `lib.rs` لدعم توزيع أرباح السيارات بعملات مختلفة. يمكن استخدام سعر صرف وسطي لحساب الربح بعملة واحدة أو تسجيل أرباح منفصلة للعملتين.

2. **H4 (عاجل):** تعديل `distribute_to_partners_50` لقراءة أسماء الشركاء من قاعدة البيانات بدلاً من hardcoding.

3. **H2 (مهم):** إضافة `WHERE car_number IS NULL` إلى استعلام المصروفات في `get_profit_distribution_summary` لتجنب الازدواجية.

4. **H5 (مهم):** تصميم آلية لتمييز الكاش عن القاصة — يمكن استخدام حقل `payment_type` للتمييز.

5. **H7 (مهم):** فصل رصيد IQD عن USD في شاشة القاصة وعدم دمجها في رصيد جارٍ واحد.

6. **H6 (تحسين):** استخدام `0.5` (نسبة ثابتة) بدلاً من `partners.length` لتقسيم المصروفات.
