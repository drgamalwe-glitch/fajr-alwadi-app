# مصادر الحقيقة (Sources of Truth)

> هذه الوثيقة تُحدّد الترتيب الرسمي للمصادر عند التعارض. أي مهندس أو مدقّق يجب أن يرجع إلى هذا الترتيب قبل تغيير السلوك أو إعلان خطأ. القاعدة المختصرة: **الكلام للـ `Instructions.md`، لا للكود**.

## 1. الترتيب الرسمي للمصادر

| الترتيب | المصدر                         | المسار                                       | الخلاصة                                                                                                                                                |
| ------- | ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1**   | `Instructions.md`              | `/Instructions.md` (1,393 سطرًا)              | **الأعلى**. أي تعارض معه يعني أن الكود خطأ ويجب تغييره. يحتوي على القواعد المحاسبية الإلزامية + سيناريوهات الاختبار المطلوبة + السلوكيات المؤكدة (§30) + القواعد الناسخة (§31). |
| **2**   | تقرير التدقيق الجنائي          | `/final.md` (291 سطرًا)                       | **الثاني**. يوثّق الأخطاء المكتشفة والمعالجة + المخاطر المتبقية. لا يُناقش `Instructions.md` لكن يُفسّر كيف طُبّقت قواعده. عند التعارض بين `final.md` والكود، يُقدَّم `final.md`. |
| **3**   | كود الإنتاج                     | `/src-tauri/src/lib.rs` + `/src/api/tauri.ts` + React components | **الثالث**. يمثل السلوك الفعلي. إن تعارض مع `Instructions.md` أو `final.md`، يُعدّ bug ويُصلَح.                                                          |
| **4**   | الاختبارات                      | `#[cfg(test)] mod strict_accounting_invariants` في `lib.rs` + `accounting_test_support.rs` + `test/accounting/` (Vitest, Playwright, Oracle) + `scripts/test_*.py` | **الرابع**. يثبت أن السلوك مطابق للمصادر الأعلى. إن نجح الاختبار لكن تعارض مع `Instructions.md`، فالاختبار نفسه خاطئ ويجب تصحيحه (مثلما حدث في `test_unreceived_agency_defers_profit_and_cash_until_received`). |

## 2. لماذا هذا الترتيب؟

`Instructions.md` هو العقد بين المحاسب والمهندس. المحاسب يصف القواعد المحاسبية بلغة الأعمال، والمهندس يُترجمها إلى كود. عند التعارض:

- إن قدّمنا الكود على `Instructions.md`، فالمحاسبة تتبع الأخطاء البرمجية بدلًا من قواعد الأعمال. هذا يُسبّب خسائر مالية.
- إن قدّمنا `final.md` على `Instructions.md`، فالتدقيق يصبح المصدر الوحيد، لكن `final.md` نفسه يستند إلى `Instructions.md` — لا يحق له تغيير قاعدة محاسبية بل فقط تفسيرها.
- إن قدّمنا الاختبارات على `Instructions.md`، فأي خطأ في توقعات الاختبار يصبح "صحيحًا" بالتعريف — وهذا ما حدث قبل التصحيح في `test_unreceived_agency_defers_profit_and_cash_until_received` (كان الاختبار يتوقع سلوك §30.9 الملغى بدل §31.4 الناسخ).

## 3. القواعد الناسخة في §31

§31 ("ID-Based Design and Agency Cash vs Credit Rules") تُضيف قواعد إلزامية جديدة تنسخ بعض سلوكيات §30 المؤكدة. التعارض الداخلي بين §30 و§31 يُحلّ دائمًا لصالح §31.

### §31.2 — Idempotency Tokens (`creation_token`)

**القاعدة**: كل عملية إنشاء يجب أن تقبل `creation_token` اختياريًا (UUID v4). إن وُجد، يُفحص أولاً. إن كان هناك صف بنفس الـ token، يُعاد معرّفه دون إنشاء جديد.

**الكيانات المطلوبة**: `agencies` (مُطبَّق في v27 — §31.2.1), `cars`, `expenses`, `car_expenses`, `partner_transactions` (الإدخال اليدوي), `agency_transactions`. جميعها مُطبَّقة في v34.

**الحالة الحالية**:
- ✅ `agencies` (v27 + §31.5.1 كشف 5 ثوانٍ إضافي).
- ✅ `cars` (v34 + §31.5.3 كشف 5 ثوانٍ).
- ✅ `expenses` و`car_expenses` (v34 + §31.5.2 كشف 5 ثوانٍ).
- ✅ `partner_transactions` (v34 + كشف 5 ثوانٍ — أول أمر يمرر `session_token` فعليًا).
- ✅ `agency_transactions` (v34 — كشف 5 ثوانٍ غير مُطبَّق بعد، مخاطر منخفضة لأن الإضافة تكون من داخل صفحة وكالة موجودة).
- ⚠️ `apply_car_expense_changes` (لإضافة مصاريف السيارة دفعة واحدة) — لا يدعم `creation_token` لكل عنصر إضافة فردي. مخاطر موثقة في `final.md` §2.

### §31.3 — `chassis_number` مسموح بتكراره

**القاعدة**: نفس المركبة الفيزيائية قد تُشترى وتُباع وتُعاد عدة مرات. كل دورة حدث محاسبي مستقل بـ `car_number` خاص، لكن قد يشارك نفس `chassis_number`. النظام **يجب أن يقبل** الإضافة المكررة.

**التطبيق**:
- v31 أضافت فهرس فريد على `chassis_number` (خطأ).
- v33 حذفت الفهرس الفريد وأنشأت فهرسًا غير فريد بدلًا منه.
- `resolve_unique_car_number` تضيف `#2`, `#3`, إلخ. إلى `car_number` عند التعارض (لكن `chassis_number` يُقبل دون تعديل).
- `ensure_unique_chassis` تتحقق فقط من عدم كون القيمة فارغة، لا من التفرد.

**الاستثناء المهم**: §31.5.3 (منع الإضافة المتكررة) لا يتعارض مع §31.3. كشف التكرار خلال 5 ثوانٍ يحمي من double-click فقط (نفس البيانات بالضبط)، لا من إعادة شراء نفس السيارة (الذي قد يكون مقصودًا).

### §31.4 — قاعدة الوكالة الآجلة الناسخة لـ §30.9

**§30.9** قالت: "agency profit is recognized when recorded, even when payment_status='غير واصل'. The cash_movement rows are created only when status='واصل'. While unpaid, a receivable row tracks the amount owed." — أي أن الربح يُعترف به فورًا، والكاش فقط عند التحصيل.

**§31.4** تنسخ هذا وتستبدله بقاعدة أصرم:

- **وكالة `واصل` (نقدي)**: ربح + كاش فورًا (مثل §30.9 لكن أوضح).
- **وكالة `غير واصل` (آجل)**: **لا ربح ولا كاش**. فقط صف `agency_receivable` (`kind='وكالة'`, `source_type='agency'`, `source_role='agency_receivable'`) + قيد `Dr receivable / Cr deferred_revenue` (وليس `Cr revenue` — حتى لا يظهر في `calculate_analytical_profit` الذي يقرأ `affects_profit=1` rows من `partner_transactions` فقط).
- **عند التحصيل** (`set_agency_receivable_status`): عكس صف `agency_receivable` + إدراج `profit_recognition` + `cash_movement` + قيود `Dr cash / Cr receivable` و`Dr deferred_revenue / Cr revenue`.

**لماذا**؟ `calculate_analytical_profit` لا يقرأ `financial_ledger.revenue` بل يقرأ `partner_transactions WHERE affects_profit=1`. فلو اعترفنا بالربح عبر `Cr revenue` فقط في الـ ledger دون إنشاء صف `profit_recognition` في `partner_transactions`، لظهر الربح في Profit Card لكن ليس في Profit Distribution، وهذا يكسر §28.14 (Dashboard profit = Profit Distribution). لذا الربح يجب أن يُعترف به فقط عبر صف `profit_recognition` في `partner_transactions`، وهذا لا يحدث إلا عند التحصيل.

**الاختبار**: `test_unreceived_agency_defers_profit_and_cash_until_received` (السطر 18345 في `lib.rs`) يغطي المسار الكامل.

### §31.6 — Source Metadata Completeness (إلزامية `source_type`/`source_id`/`source_role`)

**القاعدة**: كل صف في `partner_transactions` وكل صف في `financial_ledger` يجب أن يحمل:
- `source_type` (لـ `partner_transactions`) أو `reference_type` (لـ `financial_ledger`) — غير NULL، غير فارغ.
- `source_id` أو `reference_id` — غير NULL، غير فارغ، **يُشير إلى معرّف رقمي**.
- `source_role` — غير NULL، غير فارغ.

الصفوف التي لا تحقق هذا تُعدّ "corrupt" ويجب أن يكشفها التدقيق.

**الحالة الحالية** (مخاطر موثقة في `final.md` §1):
- ✅ الصفوف الجديدة (المُنشأة بعد v6) تحمل `source_*` كاملة.
- ⚠️ بعض الصفوف القديمة (قبل v6) صُنِّفت بـ `source_type='legacy_unclassified'` في v8 — هذا يُعتبر "مصدر" صالح لكنه ليس معرّفًا رقميًا حقيقيًا.
- ⚠️ `car_purchase` و`car_sale` يستخدمان `source_id = car_number` (نصي، ليس رقميًا) — `final.md` §1 يصنّف هذا كمخالفة §31.6. الإصلاح يتطلب معرّفًا رقميًا دائمًا للسيارة (مثل `cars.id` AUTOINCREMENT بدلًا من `car_number` كـ PRIMARY KEY) وترحيل كل المراجع، وهو عمل كبير لم يُنفَّذ بعد.
- ⚠️ جداول الأقساط تستخدم معرّفات مركبة مثل `car:installment:n` في `source_id` — ليست رقمية بحتة.

الإصلاح الصحيح يحتاج:
1. إضافة `cars.id INTEGER PRIMARY KEY AUTOINCREMENT` (مع الحفاظ على `car_number` كـ UNIQUE constraint).
2. ترحيل كل `partner_transactions.source_id` من `car_number` إلى `cars.id`.
3. ترحيل كل `financial_ledger.reference_id` من `car_number` إلى `cars.id`.
4. إعادة بناء قيود الـ ledger القديمة.
5. اختبارات شاملة على fixture بيانات إنتاج واقعية.

حتى يُنفَّذ هذا، يجب توثيق الاستثناء بوضوح في كل مكان يستخدم `car_number` كـ `source_id`.

## 4. قواعد التشغيل المهمة من `Instructions.md`

فيما يلي ملخص سريع للقواعد الأكثر استخدامًا عند مراجعة الكود. التفاصيل في `Instructions.md` نفسها.

### §1.3 — Read-Only Means Read-Only

أي دالة قراءة (`get_financial_summary`, `get_cash_register_entries`, `get_profit_distribution_summary`, `get_partners_totals`, `get_unified_accounts`, `get_partner_transactions`, `get_cars`) **يجب ألا تكتب** إلى قاعدة البيانات. هذا يشمل `recalculate_all_partners`، `rebuild_*`, `migrate_*`. إن احتاجت دالة قراءة لتحديث caches أو أرصدة مؤقتة، يجب أن تكون في الذاكرة فقط لا في DB.

### §3 — Cash Movement ≠ Profit Recognition

حركة الكash شيء، واعتراف الربح شيء آخر. اعتراف الربح لا يخلق كاشًا جديدًا. مثال: دفعة زبون 5M → Qasa يزيد 5M (cash_movement), الربح يزيد 2.5M (profit_recognition) — لكن Qasa لا يزيد بـ 2.5M إضافية. هذا أهم ثابت في النظام (§3.3 يسميه "the most important rule").

### §5 — Profit Formula

```
Total Profit = Cash Car Sale Profits + Agency Profits + Installment/Term Sale Profits (gradually from payments) - General Expenses Only
```

- ربح البيع النقدي يُعترف به فورًا عند البيع.
- ربح الوكالة يُعترف به عند التسجيل (§13) — لكن §31.4 تنسخه: يُعترف به عند التحصيل فقط للوكالات الآجلة.
- ربح البيع بالأقساط يُعترف به تدريجيًا مع كل دفعة.
- المصاريف العامة فقط تخفض صافي الربح. مصاريف السيارات جزء من تكلفة السيارة (§12).

### §17 — Dashboard Rules

- Qasa Card = `affects_qasa = 1 AND kind IN ('شريك', 'مستثمر')`.
- Cash Card = `affects_partner_cash = 1 AND kind = 'شريك'` (بدون مستثمرين).
- Profit Card = `affects_profit = 1` ثم طرح المصاريف العامة فقط.
- Inventory Card = قيمة السيارات المتاحة فقط (لا المبيوعة).
- Receivables = ذمم مدينة (من منطق الزبائن، لا من Qasa).
- Liabilities = ذمم دائنة (مستثمرون، ممولون، شركات).

### §28 — Final Acceptance Rules

الـ 15 قاعدة النهائية التي يجب أن يجتازها النظام:
1. Qasa tab = Qasa card.
2. Cash tab = Cash card.
3. Funders/Companies لا يظهرون في Qasa/Cash.
4. Investors في Qasa لا في Cash.
5. دفعات الزبائن تزيد Qasa/Cash بمبلغ الدفعة فقط.
6. ربح الدفعة يزيد الربح فقط، لا Qasa/Cash.
7. مجموع ربح الأقساط لا يتجاوز ربح السيارة الكامل.
8. القسط الأخير لا يُنشئ ربح السيارة الكامل مرة ثانية.
9. المصاريف العامة تخفض صافي الربح.
10. مصاريف السيارات تخفض ربح السيارة عبر التكلفة فقط.
11. أرباح الوكالات مربوطة بـ id لا بـ name/date.
12. حذف صف لا يحذف صفوفًا غير مرتبطة.
13. دوال القراءة لا تكتب إلى DB.
14. Dashboard profit = Profit Distribution.
15. كل حصص الشركاء 50/50.

## 5. سير العمل عند التعارض

1. **اكتشف التعارض**: وثّق بالضبط ما الذي يتعارض (ملف, سطر, قاعدة محاسبية).
2. **ارجع إلى الترتيب**: هل `Instructions.md` واضح في هذه النقطة؟ إن نعم، فالكود خطأ. إن لا، انتقل إلى الخطوة 3.
3. **ارجع إلى `final.md`**: هل وثّق التدقيق السابق هذه الحالة؟ إن نعم، اتبع تفسيره. إن لا، انتقل إلى الخطوة 4.
4. **افحص الكود الحالي**: هل يوجد أكثر من مسار ينفّذ نفس القاعدة بشكل مختلف؟ إن نعم، اعتبره bug.
5. **افحص الاختبارات**: هل يوجد اختبار يغطي الحالة؟ إن نجح الاختبار لكن تعارض مع `Instructions.md`, فالاختبار خطأ. إن لم يوجد اختبار، اكتب واحدًا يثبت السلوك الصحيح.
6. **الأخطاء الغامضة**: إن لم يكن أي مصدر واضحًا، ارفع المسألة إلى المحاسب قبل تغيير السلوك. لا تخمّن.

## 6. مراجع

- `Instructions.md` — المصدر #1.
- `final.md` — المصدر #2.
- `src-tauri/src/lib.rs` — المصدر #3.
- `docs/ACCOUNTING_INVARIANTS.md` — قائمة الثوابت المحاسبية الـ20 من المرحلة السادسة §11.5.
- `docs/FEATURE_MAP.md` — ربط الميزات بالملفات والاختبارات.
- `docs/COMMAND_CATALOG.md` — تفاصيل أوامر Tauri الحساسة.
- `docs/SCHEMA.md` — مخطط قاعدة البيانات.
- `docs/MIGRATIONS.md` — سجل الترحيلات v1–v35.
- `docs/ARCHITECTURE.md` — المعمارية وخطة الانتقال إلى Modular Monolith.
