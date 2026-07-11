# التقرير الجنائي النهائي — مشروع فجر الوادي

تاريخ الفحص: 2026-07-11  
بيئة الفحص: macOS / Asia-Baghdad  
المصدر الوحيد للحقيقة: `Instructions.md` (قُرئ كاملًا: 1393 سطرًا قبل بدء التعديل)

## الخلاصة التنفيذية

أُعيد الفحص من الصفر، وشُغّلت اختبارات Rust وTypeScript وVitest وPlaywright وسيناريوهات SQLite/Python والطباعة. عولجت أعطال كانت تمنع بناء اختبارات Rust، وخطأ رصيد عميل فعلي، واختبار وكالة قديم يخالف §31.4، واختبار ترحيل غير حتمي، وحاضنة Playwright غير قابلة للعمل، وعيبان في تخزين المحاكاة، ونقص تبعيات الطباعة والتغطية، وتقارير اختبار كانت تعرض `UNKNOWN` رغم التشغيل.

النتيجة الحالية ليست إثباتًا أن المشروع خالٍ من الأخطاء. توجد مخاطر معمارية عالية موثقة في قسم «حدود الفحص والمخاطر المتبقية»، أهمها عدم اكتمال الانتقال إلى معرفات مصدر رقمية وفق §31.6، وعدم دعم `creation_token` في جميع عمليات الإنشاء المطلوبة، وكون قاعدة البيانات المرفقة فارغة، وعدم توفر E2E حقيقي يربط Chromium بعملية Tauri/Rust.

## خريطة النظام التي بُني عليها الفحص

1. الواجهة React تحفظ حالة النموذج وتستدعي `callTauri`.
2. في Tauri، تنتقل الأوامر إلى دوال Rust المسجلة في `src-tauri/src/lib.rs`.
3. أوامر الكتابة تفتح Transaction في SQLite وتتحقق من الجلسة والمدخلات.
4. العملية الأصلية تُكتب في جدولها، ثم تُنشأ الإسقاطات المحاسبية في `partner_transactions` والقيود في `financial_ledger`.
5. Qasa/Cash/Profit تقرأ أعلام `affects_qasa` و`affects_partner_cash` و`affects_profit`.
6. التعديل والحذف والعكس يستخدم حقول المصدر والدفعات المحاسبية، ثم يعيد حساب الأرصدة المتأثرة.
7. التقارير والطباعة تقرأ النتائج ولا يفترض أن تكتب إلى قاعدة البيانات.
8. وضع المتصفح غير Tauri يستخدم محاكاة `localStorage`، وهو ليس بديلًا عن Backend المحاسبي الحقيقي.

الجداول الرئيسية التي جرى فحصها: `cars`, `partners`, `partner_transactions`, `cash_register`, `expenses`, `car_expenses`, `car_partners`, `agencies`, `agency_transactions`, `financial_ledger`, `customer_installment_payment_events`, `profit_distributions`, `partner_profit_shares`, `users`, `sessions`, `login_attempts`, `audit_log`, `db_version`.

## الأخطاء المكتشفة والمعالجة

### الخطأ 1 — مجموعة Rust المحاسبية لا تُبنى

- التصنيف: اختبارات/تكامل/تراجع واجهات داخلية.
- الخطورة: عالية؛ منعت تشغيل أهم اختبارات المحاسبة.
- إعادة الإنتاج: `cargo test --features accounting-test-support`.
- النتيجة قبل الإصلاح: exit 101 وأخطاء Rust `E0061`؛ استدعاءات `add_car` و`add_expense` لم تمرر `creation_token`، وسيناريو 71 لم يمرر اسم المشتري إلى `sell_car_cash`.
- السبب الجذري: تغير تواقيع أوامر Backend دون تحديث `accounting_test_support.rs` وسيناريو Full-71.
- النمط المماثل: سبعة استدعاءات مباشرة قديمة.
- السلوك المحمي: القيم الاختيارية السابقة بقيت `None` ولم تتغير قواعد العمليات.
- الملفات المعدلة: `src-tauri/src/accounting_test_support.rs`, `src-tauri/src/lib.rs`.
- الإصلاح: تحديث جميع الاستدعاءات للتوقيع الفعلي وإضافة مشتري صريح للسيناريو.
- اختبار الانحدار: بناء وتشغيل مجموعة Rust نفسها.
- بعد الإصلاح: 50 اختبار Rust داخلي + اختبار تكامل واحد نجحت؛ أُعيد التشغيل مرتين متتاليتين بالنتيجة نفسها.
- Refactoring: لا؛ مواءمة حاضنة الاختبار.
- المخاطر المتبقية: الاستدعاءات المباشرة كثيرة الوسائط وما زالت حساسة لتغير التواقيع مستقبلًا.

### الخطأ 2 — السداد الكامل يترك رصيد العميل سالبًا

- التصنيف: محاسبي/رصيد عميل/ازدواج احتساب.
- الخطورة: حرجة.
- إعادة الإنتاج: `test_customer_balance_zero_after_all_event_installments_paid`؛ سيارة بمبلغ متبقٍ 6,000,000 وستة أقساط، ثم سدادها جميعًا.
- النتيجة قبل الإصلاح: الرصيد الفعلي `-6,000,000` بدل `0`.
- الصحيح وفق §10.3 و§21: عند سداد جميع الأقساط يصبح رصيد العميل صفرًا.
- السبب الجذري: صفوف الجدول تغيّرت من `باقي قسط` إلى `واصل قسط`، وفي الوقت نفسه احتسب قارئ الرصيد صف الدفع `customer_payment` مرة ثانية. كان الاستثناء يعتمد على `related_source_type='customer_payment_event'`، لكن مسار إعادة بناء الربح يحوله عمدًا إلى `car`.
- الأماكن المماثلة: قارئ الرصيد الموحد وإعادة حساب رصيد الشريك/العميل يستخدمان الدالة نفسها، لذلك أصلح السبب مركزيًا.
- السلوك الصحيح المحمي: الدفعات اليدوية يجب أن تستمر بخفض الرصيد.
- اختبار الحماية قبل الإصلاح: `test_manual_customer_payment_still_reduces_balance` نجح: 6,000,000 مستحق − 1,000,000 دفعة يدوية = 5,000,000.
- الملفات المعدلة: `src-tauri/src/lib.rs`.
- الإصلاح: استبعاد صف الدفع الحدثي المحدد بـ `source_type='customer_payment'`, `source_role='customer_payment'`, `related_source_type='car'` من خصم الرصيد، مع إبقاء `customer_transaction` اليدوي محتسبًا.
- اختبار الانحدار: `test_customer_balance_zero_after_all_event_installments_paid`.
- إثبات النجاح: الرصيد الخاص بالعميل والإجمالي كلاهما صفر؛ اختبار الحماية اليدوي ما زال ناجحًا.
- السيناريو المحاسبي: صفوف الاستحقاق المتبقية = صفر، صفوف الدفع النقدي لا تخصم الذمة مرة ثانية، وحركات الكاش/الربح المولدة بقيت منفصلة.
- Idempotency: الدفع المكرر مغطى بـ `test_event_installment_duplicate_payment_rejected`.
- Undo/Rollback/Edit: العكس وإعادة بناء الجدول مغطاة باختبارات Rust الحالية وسيناريوهات Python؛ لا يوجد قياس أداء منفصل لأن التعديل شرط إضافي داخل استعلام واحد.

### الخطأ 3 — اختبار الوكالة الآجلة يخالف المصدر الوحيد للحقيقة

- التصنيف: اختبار محاسبي خاطئ.
- الخطورة: عالية؛ كان يفرض سلوك §30.9 الملغى بدل §31.4 الناسخ له.
- النتيجة قبل الإصلاح: الاختبار توقع صفّي ربح فور تسجيل وكالة `غير واصل`، بينما Backend أنشأ صفرًا؛ الفشل `left: 0, right: 2`.
- الصحيح وفق §31.4: لا ربح ولا Cash/Qasa قبل التحصيل؛ ذمة مدينة مقابل إيراد مؤجل.
- السبب الجذري: توقعات وتعليقات الاختبار لم تُحدّث بعد إضافة القاعدة الناسخة.
- الملفات المعدلة: `src-tauri/src/lib.rs`.
- الإصلاح/الاختبار: إعادة تسمية السيناريو إلى `test_unreceived_agency_defers_profit_and_cash_until_received` والتحقق من:
  - ذمة = 1,000,000 قبل التحصيل.
  - صفوف الربح = 0 وصفوف الكاش = 0.
  - Dr receivable = 1,000,000 وCr deferred_revenue = 1,000,000.
  - revenue والربح التحليلي = صفر قبل التحصيل.
  - بعد التحصيل: الذمة صفر، صفا ربح 50/50، صفا كاش 50/50، والكاش/الربح = 1,000,000.
- النتيجة: نجح منفردًا وضمن مجموعتي Rust الكاملتين.

### الخطأ 4 — اختبار Migration v32 يعتمد على حالة قاعدة متغيرة

- التصنيف: Migration/حتمية/سلامة بيانات.
- الخطورة: عالية.
- إعادة الإنتاج: `python3 scripts/test_migration_v32_orphan_cleanup.py`.
- قبل الإصلاح: 3 إخفاقات؛ توقع يتيمين وانحراف IQD بقيمة -52,050 في قاعدة v30، لكن القاعدة الحالية v34 سليمة وفارغة.
- السبب الجذري: نسخ قاعدة التطبيق الحالية والادعاء أنها دائمًا لقطة تاريخية محددة.
- الملفات المعدلة: `scripts/test_migration_v32_orphan_cleanup.py`, `src-tauri/tests/migration_v32_prod.rs`.
- الإصلاح: إنشاء fixture حتمي v30 يحتوي أصلًا صالحًا، split صالحًا، ويتيمين 229/230 بقيود دائنة 26,025 لكل منهما؛ ثم تطبيق SQL التنظيف مرتين.
- الاختبارات:
  - قبل الترحيل: يتيمان وانحراف -52,050.
  - بعده: صفر أيتام، IQD/USD متوازنان.
  - الإعادة: لا حذف إضافي ولا تغير في التوازن.
  - السجلات الصحيحة محفوظة بالمعرف.
  - اختبار Rust لم يعد يستخدم مسار `/home/z/...` ولا ينجح عبر “SKIPPED”؛ يستخدم `CARGO_MANIFEST_DIR` ونسخة مؤقتة فريدة.
- النتيجة: Python 10/10، وRust integration 1/1.
- حدود: fixture التاريخي ممثل للخطأ المعروف وليس نسخة مجهولة من إنتاج حقيقي.

### الخطأ 5 — اختبار A4 غير قابل للتنفيذ

- التصنيف: طباعة/بنية اختبار.
- الخطورة: متوسطة.
- قبل الإصلاح: `sh: esbuild: command not found`، exit 127.
- السبب الجذري: الأمر يستخدم `esbuild` دون تبعية مباشرة في المشروع.
- الملفات المعدلة: `package.json`, `package-lock.json`.
- الإصلاح: إضافة `esbuild` كتَبعية تطوير مثبتة.
- النتيجة: fixture يحوي 96 حركة، ناتجه 4 صفحات A4 portrait، 604,193 بايت؛ MediaBox لكل صفحة ضمن تفاوت 0.2 نقطة.
- حدود: تحقق بنيوي للـPDF، وليس مراجعة بشرية لكل سطر أو اختبار طابعة فعلية.

### الخطأ 6 — Playwright موجّه إلى Bridge لا يمكنه النجاح ومحدداته وهمية

- التصنيف: E2E/UI/بنية اختبار.
- الخطورة: عالية.
- قبل الإصلاح:
  - `VITE_E2E=1` وجّه كل `callTauri` إلى Bridge يعلن أنه stub ويرد 503 لكل invoke.
  - اختبار تسجيل الدخول توقع URL يحوي dashboard رغم أن التطبيق SPA ويبقى على `/`.
  - اختبارات استخدمت `input[name=...]` غير موجودة.
  - تشغيل أولي: 4 من 5 حالات فشلت، وبعضها استنفد 120 ثانية.
- السبب الجذري: خلط اختبار UI المحلي مع Backend bridge غير منفذ، وكتابة specs قبل مطابقتها مع DOM الحقيقي.
- الملفات المعدلة: `package.json`, `playwright.config.ts`, `test/accounting/e2e/accounting-ui.spec.ts`, `test/accounting/e2e/comprehensive-ui.spec.ts`, `e2e-bridge/server.mjs`, `test/accounting/backend/bridge.backend.test.ts`, `vitest.config.ts`.
- الإصلاح:
  - Playwright يشغل Vite في وضع المتصفح المحلي ولا يدعي استخدام Backend Rust.
  - استخدام `data-testid` ومعرفات الحقول الحقيقية.
  - التحقق من دخول المستخدم، إنشاء بيع نقدي وحفظ حقوله مرة واحدة، وكالة آجلة، والتنقل عند 900×650 دون overflow أفقي.
  - Bridge يعلن `mode: stub`؛ حالات Backend الحقيقية لا تُنفذ كأنها حقيقية، بل تُعلّم skipped، بينما يغطي Rust Backend داخل العملية.
- بعد الإصلاح: 5/5 Playwright نجحت مرتين منفصلتين، ثم ضمن `test:accounting:full`.
- حدود: هذا UI E2E على mock محلي، وليس Chromium → Tauri IPC → Rust → SQLite.

### الخطأ 7 — محاكاة المتصفح تفسد نوع البيع وتخلط الوكالات بحركاتها

- التصنيف: منطق Frontend mock/سلامة بيانات اختبار.
- الخطورة: متوسطة للإنتاج (المسار غير Tauri)، عالية لموثوقية اختبارات UI.
- قبل الإصلاح:
  - السيارة المباعـة مباشرة حُفظت دون `payment_type` لأن `mapMockCar` رآها `متوفرة` ثم غُير status بعد الحساب.
  - `get_agencies` و`get_agency_transactions` استخدما `mock_default` نفسه.
- السبب الجذري: ترتيب تهيئة خاطئ ومفتاح تخزين عام لا يميز الكيانات.
- الملفات المعدلة: `src/api/tauri.ts`.
- الإصلاح: تمرير `status: مبيوعة` قبل mapping، وفصل `mock_agencies` عن `mock_agency_transactions`.
- اختبارات الانحدار: رحلتا Playwright للبيع والوكالة تتحققان من القيم المخزنة الفعلية.
- النتيجة: 5/5 Playwright، و52/52 Unit Frontend.

### الخطأ 8 — تقرير المحاسبة يعرض UNKNOWN بعد اختبارات ناجحة

- التصنيف: تقارير اختبار/صدق النتائج.
- الخطورة: متوسطة.
- قبل الإصلاح: `Overall: UNKNOWN`, `Total: 0 tests` لأن ملفات JSON المتوقعة لم تُنتج.
- السبب الجذري: أوامر Vitest/Playwright لا تحتوي reporters متوافقة مع `generate-accounting-report.ts`، وقارئ Playwright يستخدم حقولًا غير صحيحة.
- الملفات المعدلة: `package.json`, `playwright.config.ts`, `test/accounting/runners/generate-accounting-report.ts`.
- الإصلاح: JSON reporters فعلية وقراءة `expected/flaky/unexpected/skipped`.
- النتيجة: `Overall: PASS`, 64 مكتشفة، 59 ناجحة، 0 فاشلة، 5 skipped معلنة (Backend bridge الحقيقي).

### الخطأ 9 — Lint غير مهيأ وClippy/format غير نظيفين

- التصنيف: جودة/صيانة.
- الخطورة: متوسطة.
- قبل الإصلاح:
  - ESLint 10: لا يوجد `eslint.config.js`.
  - `cargo fmt --check` عرض فروقات كثيرة.
  - Clippy الصارم فشل بـ12 ملاحظة (io_other_error، loops، type complexity، too_many_arguments، وغيرها).
- الملفات المعدلة: `eslint.config.js`, `package.json`, `package-lock.json`, `src-tauri/src/lib.rs`, `src-tauri/src/accounting_test_support.rs` وبعض ملفات الاختبار لتنظيف unused code.
- الإصلاح: إعداد ESLint flat، إضافة React Hooks plugin، تنسيق Rust، وإصلاح ملاحظات Clippy أو توثيق الاستثناءات المقصودة لتواقيع أوامر Tauri.
- النتيجة:
  - Clippy `-D warnings`: ناجح.
  - `cargo fmt --check`: ناجح بعد التنسيق.
  - ESLint: صفر أخطاء، 25 تحذير `react-hooks/exhaustive-deps`.
- المخاطر المتبقية: تحذيرات hooks لم تُصلح آليًا لأن ذلك يحتاج إعادة تصميم callbacks واختبارات UI لكل مكون.

## ملخص الاختبارات المنفذة

### النتائج

- Rust: 50/50 داخل `lib.rs` + 1/1 Integration Migration؛ أُعيدت المجموعة الكاملة مرتين متتاليتين ونجحت بنفس النتائج.
- Frontend Vitest: 52/52 في 7 ملفات.
- Accounting Oracle: 53/53.
- Backend bridge: 1 health pass، و5 حالات real-backend skipped لأن Bridge stub؛ Backend الحقيقي مغطى باختبارات Rust داخل العملية.
- Playwright UI: 5/5.
- التقرير المحاسبي المجمع: 64 مكتشفة، 59 pass، 0 fail، 5 skip.
- Runtime accounting scenarios: 27 سيناريو، 148 assertion، صفر فشل.
- Comprehensive Python: أبلغ السكربت 186 pass وصفر fail مع عبارة “ALL 196”; يوجد تناقض عددي داخل السكربت نفسه ويجب عدم جمعه كناتج دقيق.
- S28–S61: 169 assertion، صفر فشل.
- Agency cash/credit: 24/24.
- Duplicate prevention: 16/16.
- Migration v32 deterministic: 10/10.
- Forensic reversal/profit rebuild: 5/5 و6/6.
- Session gate: 5/5؛ hash قاعدة المصدر لم يتغير.
- VIN integrity: 4/4.
- A4 print fixture: 4 صفحات A4، ناجح.
- TypeScript: ناجح.
- Vite production build: ناجح؛ تحذير bundle كبير (JS 2,273.78 KiB، gzip 721.34 KiB).
- Clippy الصارم وRust fmt: ناجحان.
- ESLint: صفر أخطاء، 25 تحذير hooks.
- npm audit: صفر ثغرات معروفة.
- cargo-audit 0.22.2: نُفذ فعليًا وأعاد exit 1 بعد اكتشاف ثغرتين عاليتين في `quick-xml 0.39.4` (`RUSTSEC-2026-0194` و`RUSTSEC-2026-0195`) و18 تحذيرًا مسموحًا متعلقًا بحزم غير مصانة أو ملاحظات soundness.

### التغطية

- Frontend statements: 32.14% (54/168).
- branches: 20.95% (22/105).
- functions: 48.57% (17/35).
- lines: 36.11% (52/144).
- Rust coverage عبر cargo-llvm-cov 0.8.7: regions 37.54% (8569/22829)، functions 26.38% (415/1573)، lines 45.14% (7645/16936). Branch coverage لم تعرضه أداة LLVM لهذه البنية.
- المسارات غير المغطاة جيدًا: معظم مكونات React الكبيرة، حالات خطأ UI، Tauri IPC الحقيقي، export/backup عبر واجهة حقيقية، وطباعة جميع أنواع الحسابات.

### أوامر التشغيل الرئيسية

```text
npm test
npm run typecheck
npm run build
npm run lint
npm audit --audit-level=moderate
npx vitest run test/frontend --coverage --coverage.reporter=text-summary
npm run test:oracle
npm run test:backend
npm run test:e2e
npm run test:accounting:full
npm run test:accounting:available
npm run test:print-fixture
cargo test --features accounting-test-support
cargo test --features accounting-test-support --test migration_v32_prod -- --nocapture
cargo clippy --all-targets --features accounting-test-support -- -D warnings
cargo fmt --all -- --check
cargo audit
cargo llvm-cov --features accounting-test-support --summary-only
python3 scripts/test_migration_v32_orphan_cleanup.py
python3 scripts/test_duplicate_prevention.py
python3 scripts/test_agency_cash_vs_credit.py
python3 scripts/test_comprehensive_scenarios.py
python3 scripts/test_scenarios_s28_s61.py
python3 scripts/test_forensic_rust_1_8.py
python3 scripts/test_forensic_rust_1_11.py
python3 scripts/accounting_audit.py src-tauri/fjr_alwadi_data.db
python3 scripts/test_vin_integrity.py src-tauri/fjr_alwadi_data.db
python3 scripts/test_session_gate.py src-tauri/fjr_alwadi_data.db
```

### إصدارات البيئة

- Node v22.22.3.
- npm 10.9.8.
- rustc 1.95.0.
- cargo 1.95.0.
- Python 3.9.6.
- SQLite 3.51.0.
- Vitest 4.1.10.
- Playwright 1.61.x.

## سلامة قاعدة البيانات المرفقة

- `PRAGMA integrity_check`: `ok`.
- `PRAGMA foreign_key_check`: لا مخالفات.
- db_version: 34.
- Orphan partner-transaction ledger rows: صفر.
- Missing source metadata في `partner_transactions` و`financial_ledger`: صفر.
- nonnumeric source/reference IDs في البيانات الحالية: صفر.
- Ledger imbalance: لا صفوف عملات غير متوازنة.
- Currency mixing / duplicate COGS / duplicate sale ledger / invalid dates: فحص التدقيق نجح.
- Orphan Records / Broken References / Duplicate Ledger Entries / Partial Transactions: لم يكتشف السكربت شيئًا.
- Inventory corruption: لم يكتشف شيء.
- Data repair مطلوب للقاعدة المرفقة: لا دليل على ذلك.

تنبيه حاسم: أعداد `cars`, `partner_transactions`, `financial_ledger`, `agencies`, `expenses` في القاعدة المرفقة كلها صفر. لذلك هذه النتائج تثبت سلامة مخطط فارغ، لا سلامة بيانات إنتاج حقيقية.

## الملفات المعدلة

- Backend واختباراته: `src-tauri/src/lib.rs`, `src-tauri/src/accounting_test_support.rs`, `src-tauri/tests/migration_v32_prod.rs`.
- Frontend mock: `src/api/tauri.ts`.
- UI/E2E: `test/accounting/e2e/accounting-ui.spec.ts`, `test/accounting/e2e/comprehensive-ui.spec.ts`, `playwright.config.ts`.
- Bridge/Backend tests: `e2e-bridge/server.mjs`, `test/accounting/backend/bridge.backend.test.ts`, `vitest.config.ts`.
- Migrations/forensic tests: `scripts/test_migration_v32_orphan_cleanup.py`.
- Reporting: `test/accounting/runners/generate-accounting-report.ts`.
- تنظيف lint للاختبارات: `test/accounting/oracle/cash-sale.oracle.test.ts`, `test/accounting/runners/fast-scan-no-fix.ts`, `test/frontend/idempotency.test.ts`.
- Tooling: `eslint.config.js`, `package.json`, `package-lock.json`.
- التقرير: `final.md`.

## حدود الفحص والمخاطر المتبقية

1. **مخالفة §31.6 — خطورة عالية:** الكود ما زال يصرح بأن `car_purchase` و`car_sale` يستخدمان `source_id = car_number`، وجداول الأقساط تستخدم معرفات مركبة مثل `car:installment:n`. هذا ليس معرفًا رقميًا كما يطلب §31.6، رغم أن قاعدة الاختبار الفارغة لا تكشفه. الإصلاح الصحيح يحتاج ID رقمي دائم للسيارة وترحيل كل المراجع القديمة وإعادة بناء القيود، ولا يجوز تنفيذه دون fixture بيانات قديمة واقعية.
2. **Idempotency غير مكتمل — خطورة عالية:** `add_partner_transaction` اليدوي لا يقبل `creation_token` في توقيعه الحالي، كما أن مسار تعديل مصاريف السيارة الجماعي يحتاج مراجعة لضمان token لكل إنشاء حسب §31.2. لا تُعتبر متطلبات §31.2 مكتملة.
3. قاعدة البيانات المتاحة فارغة؛ لم تُختبر ترحيلات حقيقية على نسخة إنتاج ممثلة ولا يمكن نفي تلف بيانات تاريخية.
4. لا يوجد E2E حقيقي Chromium → Tauri IPC → Rust → SQLite. Bridge الحالي stub، والخمس حالات Backend عبره skipped بوضوح.
5. **تبعيات Rust — خطورة عالية:** `cargo audit` اكتشف ثغرتي DoS في `quick-xml 0.39.4`: تخصيص غير محدود لتعريفات namespaces وتشغيلًا تربيعيًا عند فحص السمات المكررة. الإصلاح المقترح من RustSec هو `quick-xml >= 0.41.0`، لكنها تبعية انتقالية وتحتاج ترقية السلسلة المالكة واختبارات build متعددة المنصات.
6. تغطية Rust المقاسة ما زالت منخفضة: 37.54% regions و26.38% functions و45.14% lines؛ أجزاء كبيرة من أوامر Tauri ومسارات الخطأ غير منفذة بالاختبارات.
7. 25 تحذير React Hooks dependency باقية وتحتاج إعادة هيكلة واختبارات مكونات قبل الإصلاح.
8. bundle الواجهة كبير وقد يؤثر في زمن البدء والذاكرة؛ لم يُنفذ profiler حقيقي للـCPU/heap.
9. اختبارات الضغط/التزامن والذاكرة في Python محاكاة SQLite/منطقية؛ لا تمثل حملًا متعدد العمليات على تطبيق Tauri الفعلي.
10. اختبار PDF بنيوي؛ لم تُجر مراجعة بصرية بشرية لكل صفحة أو اختبار طابعات فعلية وهوامشها.
11. لم يُختبر WhatsApp، فتح الملفات، Excel، النسخ الاحتياطي، وسلة المهملات على جميع أنظمة التشغيل المستهدفة.
12. مجلد العمل لا يحتوي `.git`، لذلك تعذر إنتاج diff موثوق أو فصل تعديلات سابقة عن تعديلات هذه الجولة عبر Git.

## الحكم النهائي

الإصلاحات المنفذة اجتازت مجموعات الاختبار القابلة للتشغيل، وأصبحت الحاضنات والتقارير أكثر صدقًا وحتمية. لكن شروط الإنهاء الكاملة في التكليف لم تتحقق بسبب مخاطر الهوية الرقمية/idempotency، غياب بيانات إنتاج ممثلة، غياب Tauri E2E، انخفاض التغطية، وثغرتي RustSec العاليتين في تبعية انتقالية. مستوى الثقة مرتفع في الأخطاء التسعة المعالجة واختبارات الانحدار الخاصة بها، متوسط في سلامة المسارات المغطاة بالسيناريوهات، ومنخفض في نفي المخاطر على بيانات إنتاج قديمة أو أحمال وتكاملات خارجية غير متاحة.
