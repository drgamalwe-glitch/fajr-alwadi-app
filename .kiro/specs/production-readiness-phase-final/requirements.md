# وثيقة المتطلبات — الجاهزية الإنتاجية النهائية لفجر الوادي

## المقدمة

مشروع فجر الوادي هو نظام ERP محاسبي محلي لإدارة تجارة السيارات. النظام حاليًا في حالة **"صالح كمرشح إصدار محليًا"** مع حكم تشغيلي **"No-Go"** بسبب عوائق GitHub والتوزيع متعدد المنصات. تهدف هذه الوثيقة إلى تحديد المتطلبات الشاملة لإغلاق جميع الثغرات المتبقية وتحويل المشروع إلى حالة **GO** كاملة جاهزة للتسليم الإنتاجي.

### الحالة الحالية (من FINAL_REPORT.md)

**النجاحات:**
- ✅ جميع الاختبارات ناجحة: Frontend 90/90، Rust 133/133+1، Backend Bridge 8/8، Playwright 5/5
- ✅ جميع الثوابت المحاسبية الـ20 مغطاة باختبارات
- ✅ العكس الإلحاقي مطبق على كل العمليات الحرجة
- ✅ Idempotency مركزية مع `creation_token` و`operation_id`
- ✅ Optimistic locking على كل الكيانات المالية
- ✅ Migration 45 ينفذ Fail-Closed مع مفاتيح خارجية حقيقية
- ✅ تقسيم حزم Vite (أكبر chunk: 385.54 KB)
- ✅ RustSec نظيف: صفر vulnerabilities

**المخاطر المتبقية:**
1. **GitHub**: لا يوجد remote origin، لا branch protection، لا CI إلزامي
2. **المعمارية**: ملفات Rust كبيرة تتجاوز الحد الإرشادي
3. **تبعيات Linux**: إشعارات GTK3/unic-* غير حرجة لكن معلقة
4. **التوزيع**: لا اختبار `.dmg/.msi/.AppImage` على أنظمة تشغيل حقيقية
5. **تغطية اختبار**: بعض الثوابت مغطاة ضمنيًا فقط (الثابت 14، 17، 18)

## المسرد (Glossary)

- **System**: نظام فجر الوادي ERP
- **Admin**: المستخدم الإداري ذو صلاحية كاملة
- **User**: أي مستخدم للنظام
- **CI_Pipeline**: خط أنابيب التكامل المستمر على GitHub Actions
- **Release_Package**: حزمة التثبيت النهائية (.dmg, .msi, .AppImage)
- **Remote_Repository**: مستودع GitHub البعيد
- **Branch_Protection**: سياسات حماية الفروع على GitHub
- **Coverage_Report**: تقرير تغطية الاختبارات بالنسبة المئوية
- **Module**: وحدة Rust مستقلة في المشروع
- **Invariant**: ثابت محاسبي إلزامي من الثوابت الـ20
- **Test_Artifact**: نتائج الاختبارات المحفوظة
- **Dependency_Audit**: تدقيق أمان التبعيات
- **Distribution_Matrix**: مصفوفة أنظمة التشغيل المدعومة

---

## المتطلبات

### المتطلب 1: إعداد GitHub وحوكمة الكود

**قصة المستخدم:** كمطور، أريد مستودع GitHub محمي بسياسات صارمة، حتى أضمن أن كل تغيير يمر بـCI والمراجعة قبل الدمج.

#### معايير القبول

1. THE System SHALL connect to a GitHub remote repository with valid credentials
2. WHEN a developer attempts to push to main or master branch directly, THE Branch_Protection SHALL reject the push
3. THE Branch_Protection SHALL require CI_Pipeline checks to pass before merge
4. THE Branch_Protection SHALL require at least one code review approval before merge
5. WHEN CI_Pipeline runs, THE System SHALL execute all test suites and report results
6. THE CI_Pipeline SHALL fail if any test suite fails
7. THE CI_Pipeline SHALL fail if `cargo clippy` produces warnings
8. THE CI_Pipeline SHALL fail if `cargo fmt --check` detects formatting issues
9. THE CI_Pipeline SHALL fail if `npm run typecheck` detects TypeScript errors
10. THE CI_Pipeline SHALL upload test artifacts after each run

---

### المتطلب 2: إعادة هيكلة معمارية نهائية

**قصة المستخدم:** كمطور، أريد ملفات Rust مفصلة حسب المجال بحجم معقول، حتى يسهل صيانة الكود وتقليل خطر الانحدار.

#### معايير القبول

1. WHEN measuring Rust module sizes, THE System SHALL report no single module exceeding 2,000 lines
2. THE System SHALL organize domain logic into separate modules under `src-tauri/src/legacy/`
3. WHEN running `scripts/check_rust_structure.py`, THE System SHALL pass all structural checks
4. THE Module separation SHALL maintain all existing test coverage
5. THE Module separation SHALL not introduce new compilation warnings
6. WHEN a module is split, THE System SHALL add contract tests between modules
7. THE System SHALL document each large module split with traceability to original line ranges
8. WHEN integration tests run after restructuring, THE System SHALL pass all 134 Rust tests
9. THE System SHALL ensure no module contains mixed domain concerns
10. THE Module interfaces SHALL use explicit types, not string-based identifiers

---

### المتطلب 3: تغطية صريحة للثوابت المحاسبية المتبقية

**قصة المستخدم:** كمطور، أريد اختبارات صريحة لكل ثابت محاسبي، حتى أضمن أن أي تغيير مستقبلي لا ينتهك القواعد المحاسبية.

#### معايير القبول

1. THE System SHALL add explicit Rust test `test_read_only_functions_dont_write` for Invariant 14
2. WHEN `test_read_only_functions_dont_write` runs, THE System SHALL verify `PRAGMA data_version` unchanged after calling read-only functions
3. THE System SHALL add explicit Rust test `test_qasa_tab_equals_qasa_card` for Invariant 17
4. WHEN `test_qasa_tab_equals_qasa_card` runs, THE System SHALL compare `get_financial_summary` Qasa value with `get_cash_register_entries` filtered by Qasa
5. THE System SHALL add explicit Rust test `test_cash_tab_equals_cash_card` for Invariant 18
6. WHEN `test_cash_tab_equals_cash_card` runs, THE System SHALL compare `get_financial_summary` Cash value with `get_cash_register_entries` filtered by Cash (partners only)
7. THE System SHALL update `docs/ACCOUNTING_INVARIANTS.md` with new test references
8. WHEN all invariant tests run, THE System SHALL achieve 100% explicit test coverage for all 20 invariants
9. THE System SHALL document any implicit coverage with justification
10. THE Rust test suite SHALL continue to pass 133/133 + new tests

---

### المتطلب 4: اختبار التوزيع متعدد المنصات

**قصة المستخدم:** كمدير إصدار، أريد حزم تثبيت مختبرة على أنظمة التشغيل الثلاثة، حتى أضمن أن المستخدمين يمكنهم تثبيت التطبيق بنجاح.

#### معايير القبول

1. THE System SHALL build `.dmg` package for macOS using `tauri build`
2. THE System SHALL build `.msi` package for Windows using `tauri build`
3. THE System SHALL build `.AppImage` package for Linux using `tauri build`
4. WHEN installing on macOS, THE Release_Package SHALL open without security warnings after code signing
5. WHEN installing on Windows, THE Release_Package SHALL install without SmartScreen warnings after code signing
6. WHEN running on Linux, THE Release_Package SHALL execute without missing GTK3 dependencies
7. THE System SHALL document minimum OS versions: macOS 11+, Windows 10+, Ubuntu 20.04+
8. WHEN running post-install smoke test, THE Release_Package SHALL initialize database successfully
9. WHEN running post-install smoke test, THE Release_Package SHALL authenticate admin user successfully
10. THE System SHALL create automated VM-based tests for each platform

---

### المتطلب 5: تدقيق ومتابعة التبعيات

**قصة المستخدم:** كمطور، أريد سياسة واضحة لإدارة تبعيات Linux والإشعارات غير الحرجة، حتى أضمن أمان المشروع طويل المدى.

#### معايير القبول

1. THE System SHALL maintain `src-tauri/.cargo/audit.toml` with documented exceptions
2. WHEN running `cargo audit`, THE System SHALL return zero critical vulnerabilities
3. THE System SHALL document GTK3 unmaintained warnings as accepted risk with justification
4. THE System SHALL document `unic-*` unmaintained warnings as accepted transitive dependencies
5. THE System SHALL monitor Tauri upstream for GTK3 migration path
6. WHEN Tauri releases GTK4 support, THE System SHALL create migration plan within 30 days
7. THE System SHALL update `RUSTSEC-2024-0429` exception annually or when patch available
8. THE System SHALL fail CI_Pipeline if new critical vulnerabilities introduced
9. THE System SHALL document dependency update policy in `docs/DEPENDENCY_POLICY.md`
10. THE System SHALL pin all production dependencies to exact versions

---

### المتطلب 6: تقرير تغطية الاختبارات الشامل

**قصة المستخدم:** كمدير جودة، أريد تقرير تغطية كود دقيق، حتى أحدد المناطق التي تحتاج مزيدًا من الاختبارات.

#### معايير القبول

1. THE System SHALL generate Rust code coverage report using `cargo-tarpaulin`
2. THE System SHALL generate TypeScript code coverage report using Vitest built-in coverage
3. WHEN generating coverage, THE System SHALL exclude test support files from coverage calculation
4. WHEN generating coverage, THE System SHALL exclude migration files from coverage calculation
5. THE System SHALL report line coverage percentage for Rust codebase
6. THE System SHALL report line coverage percentage for TypeScript codebase
7. THE System SHALL achieve minimum 80% line coverage for Rust accounting modules
8. THE System SHALL achieve minimum 75% line coverage for TypeScript UI components
9. THE System SHALL publish coverage reports to CI_Pipeline artifacts
10. THE System SHALL fail CI_Pipeline if coverage drops below threshold

---

### المتطلب 7: توثيق الجاهزية الإنتاجية الشامل

**قصة المستخدم:** كمراجع، أريد وثيقة جاهزية شاملة تثبت استيفاء كل المتطلبات، حتى أوافق على النشر الإنتاجي.

#### معايير القبول

1. THE System SHALL create `docs/PRODUCTION_READINESS_CHECKLIST.md` with all Go/No-Go criteria
2. THE Production_Readiness_Checklist SHALL include evidence links for each criterion
3. WHEN all criteria are met, THE System SHALL update FINAL_REPORT.md operational verdict to "GO"
4. THE System SHALL document all accepted risks with mitigation plans
5. THE System SHALL document rollback procedure for each deployment step
6. THE System SHALL document data backup and restore procedures
7. THE System SHALL document disaster recovery plan
8. THE System SHALL create runbook for common operational issues
9. THE System SHALL define success metrics for production monitoring
10. THE System SHALL obtain stakeholder sign-off on readiness checklist

---

### المتطلب 8: تحسينات الأمان والمراجعة

**قصة المستخدم:** كمستخدم، أريد نظام آمن بسياسات مراجعة قوية، حتى أثق في حماية بياناتي المالية.

#### معايير القبول

1. THE System SHALL log all authentication attempts with timestamp and result
2. WHEN admin password is changed, THE System SHALL invalidate all existing sessions
3. THE System SHALL enforce password minimum length of 8 characters
4. THE System SHALL prevent admin password from being empty or whitespace only
5. WHEN audit_log query executes, THE System SHALL return events in chronological order
6. THE System SHALL prevent deletion of audit_log entries through UI
7. THE System SHALL backup audit_log before database restore operations
8. THE System SHALL encrypt database file at rest using SQLCipher (optional feature)
9. WHEN exporting financial reports, THE System SHALL watermark with export timestamp and user
10. THE System SHALL document security best practices in `docs/SECURITY_GUIDE.md`

---

### المتطلب 9: تحسينات الأداء والمراقبة

**قصة المستخدم:** كمستخدم، أريد نظام سريع الاستجابة مع مراقبة أداء، حتى أعمل بكفاءة مع بيانات كثيرة.

#### معايير القبول

1. WHEN querying financial summary with 10,000+ transactions, THE System SHALL respond within 2 seconds
2. WHEN loading car inventory with 500+ cars, THE System SHALL render initial view within 1 second
3. THE System SHALL add database indexes on frequently queried columns
4. THE System SHALL profile slow queries and document optimization plan
5. WHEN database size exceeds 1 GB, THE System SHALL recommend periodic vacuum
6. THE System SHALL implement pagination for large data tables
7. THE System SHALL lazy-load non-critical UI components
8. THE System SHALL measure and log command execution time in development mode
9. THE System SHALL optimize Vite bundle size to keep largest chunk under 300 KB
10. THE System SHALL document performance benchmarks in `docs/PERFORMANCE.md`

---

### المتطلب 10: تحسينات قابلية الاستخدام والتوثيق

**قصة المستخدم:** كمستخدم نهائي، أريد واجهة واضحة مع توثيق شامل، حتى أستخدم النظام بدون ارتباك.

#### معايير القبول

1. THE System SHALL provide user manual in Arabic with screenshots
2. THE System SHALL provide video tutorials for core workflows
3. WHEN an error occurs, THE System SHALL display user-friendly Arabic error message
4. THE System SHALL validate user input and show validation errors immediately
5. THE System SHALL provide keyboard shortcuts for common operations
6. THE System SHALL support RTL layout consistently across all screens
7. THE System SHALL provide tooltips for all icon-only buttons
8. THE System SHALL implement undo capability for accidental deletions (via reversal)
9. THE System SHALL export data in multiple formats: PDF, Excel, CSV
10. THE System SHALL provide contextual help links in complex forms

---

### المتطلب 11: خطة الترقية والهجرة

**قصة المستخدم:** كمطور، أريد استراتيجية ترقية آمنة، حتى يمكن للمستخدمين الحاليين الانتقال للإصدار الجديد بدون فقدان بيانات.

#### معايير القبول

1. THE System SHALL detect database schema version on startup
2. WHEN database version is older than current, THE System SHALL run migrations automatically
3. WHEN migration starts, THE System SHALL create automatic backup
4. IF migration fails, THEN THE System SHALL rollback and restore from backup
5. THE System SHALL test migration path from all previous versions
6. THE System SHALL document breaking changes in `CHANGELOG.md`
7. THE System SHALL provide migration guide for users upgrading from legacy version
8. THE System SHALL preserve all audit_log entries during migration
9. THE System SHALL verify data integrity after migration using checksum
10. THE System SHALL support downgrade to previous version if upgrade fails

---

### المتطلب 12: خطة النشر والتسليم

**قصة المستخدم:** كمدير مشروع، أريد خطة نشر مفصلة، حتى يتم التسليم للعميل بسلاسة.

#### معايير القبول

1. THE System SHALL create release notes for version 1.0 in Arabic and English
2. THE System SHALL tag release in Git with semantic version
3. WHEN creating release, THE System SHALL generate checksums for all artifacts
4. THE System SHALL publish release artifacts to GitHub Releases
5. THE System SHALL provide installation guide for end users
6. THE System SHALL provide training materials for administrators
7. THE System SHALL define support plan for post-release issues
8. THE System SHALL create FAQ document for common questions
9. THE System SHALL obtain final acceptance from stakeholders
10. THE System SHALL celebrate successful delivery

---

## قواعد إضافية

### قواعد المتطلبات الفنية

1. جميع المتطلبات تتبع أنماط EARS الصارمة
2. لا يوجد متطلب يحتوي على مصطلحات غامضة ("quickly", "adequate", "user-friendly")
3. جميع الشروط قابلة للقياس والتحقق
4. لا يوجد متطلب يحتوي على جملة هروب ("where possible", "if feasible")
5. جميع المصطلحات الفنية معرّفة في المسرد

### قواعد الاختبار

1. كل معيار قبول يجب أن يكون له اختبار مقابل (unit, integration, أو E2E)
2. الاختبارات يجب أن تكون حتمية (deterministic) وقابلة للتكرار
3. الاختبارات يجب أن تستخدم قواعد بيانات معزولة، لا قاعدة المستخدم الحية
4. كل اختبار يفشل يجب أن يوقف عملية البناء
5. نتائج الاختبارات يجب أن تُحفظ كـartifacts في CI

### قواعد التوثيق

1. كل تغيير معماري يجب توثيقه في `docs/ARCHITECTURE.md`
2. كل متطلب أمان يجب توثيقه في `docs/SECURITY_GUIDE.md`
3. كل خطر مقبول يجب توثيقه مع خطة تخفيف
4. كل تبعية unmaintained يجب توثيقها مع مبرر القبول
5. التوثيق يجب أن يُحدّث مع كل release

---

## الأولويات

### P0 (حرجة - تمنع GO)
- المتطلب 1: إعداد GitHub (معايير 1-5)
- المتطلب 3: تغطية الثوابت الصريحة (معايير 1-6)
- المتطلب 7: توثيق الجاهزية (معايير 1-4)

### P1 (عالية - تحسين الجودة)
- المتطلب 2: إعادة الهيكلة (معايير 1-5)
- المتطلب 4: التوزيع متعدد المنصات (معايير 1-7)
- المتطلب 6: تقرير التغطية (معايير 1-7)

### P2 (متوسطة - تحسين الإنتاجية)
- المتطلب 5: تدقيق التبعيات (معايير 1-6)
- المتطلب 8: الأمان (معايير 1-7)
- المتطلب 9: الأداء (معايير 1-7)

### P3 (منخفضة - تحسين التجربة)
- المتطلب 10: قابلية الاستخدام (معايير 1-7)
- المتطلب 11: خطة الترقية (معايير 1-7)
- المتطلب 12: خطة النشر (معايير 1-7)

---

## الملاحظات الختامية

هذه الوثيقة تمثل **خارطة طريق شاملة** لتحويل مشروع فجر الوادي من حالة "مرشح إصدار محلي" إلى **حالة GO كاملة** جاهزة للإنتاج. تركز المتطلبات على:

1. **الحوكمة**: إعداد GitHub بسياسات صارمة
2. **الجودة**: تغطية اختبار صريحة 100% للثوابت المحاسبية
3. **التوزيع**: اختبار حزم التثبيت على منصات حقيقية
4. **الأمان**: تدقيق التبعيات وسياسات مراجعة قوية
5. **الأداء**: استجابة سريعة مع بيانات كبيرة
6. **القابلية للصيانة**: معمارية نظيفة مع ملفات معقولة الحجم
7. **التوثيق**: وثائق شاملة للمطورين والمستخدمين
8. **الاستمرارية**: خطط ترقية وهجرة آمنة

**الهدف النهائي**: تسليم نظام إنتاجي موثوق، آمن، قابل للصيانة، ومدعوم بوثائق شاملة، مع **حكم GO دون شروط**.
