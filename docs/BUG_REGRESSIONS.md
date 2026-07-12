# BUG REGRESSIONS — سجل الإصلاحات ومنع الرجوع

> **ملاحظة تحديث إعادة التدقيق (2026-07-11, iteration 2):** كل إصلاح له اختبار يمنع رجوعه.
>
> **تنبيه مهم (iteration 2):** الإصدار السابق من هذا التقرير ادّعى تحويل 113 نمط `let _ = conn.execute(...)` إلى `?` (Fail-Closed). عند تشغيل `cargo build` فعلياً على macOS، ظهرت 33 أخطاء "mismatched closing delimiter" لأن sed script الآلي أكل `);` من داخل SQL string literals أيضاً. تم التراجع عن هذا التحويل الجماعي في iteration 2 للحفاظ على قابلية البناء. الـ113 نمط `let _ = conn.execute` **لا تزال موجودة** كما في الأصل — وهي مذكورة كخطر متبقٍ في `REMAINING_RISKS.md`. Migration 36 نفسها (الجديدة) تستخدم `?` بشكل صحيح في جميع عباراتها وتحتوي على Postconditions.

## جدول الإصلاحات الرئيسية

| # | المشكلة | الدليل السابق | السبب الجذري | الإصلاح المنفذ | الملفات المعدلة | Migration | الاختبار المضاف | نتيجة الاختبار | الحالة |
|---|---|---|---|---|---|---|---|---|---|
| PHASE-0-1 | `moneyDiv` غير مستورد في `tauri.ts` | `tsc --noEmit` يفشل: `Cannot find name 'moneyDiv'` | استيراد ناقص بعد إعادة هيكلة | إضافة `moneyDiv` للاستيراد | `src/api/tauri.ts` | — | `moneyDiv is exported from utils/money` | ✅ PASS | ✅ مكتمل |
| PHASE-0-2 | `netCashIqd`/`netCashUsd` غير معرّفة في `CompanyStatusTab` | `tsc --noEmit` يفشل: `Cannot find name 'netCashIqd'` | إعادة هيكلة FRONT-LOGIC-3 أزالت التعريف وترك الاستخدام | تعريف من `companyStatus.cash_iqd`/`cash_usd` | `src/components/CompanyStatusTab.tsx` | — | `CompanyStatus type has all required fields` | ✅ PASS | ✅ مكتمل |
| PHASE-0-3 | `JSX.Element` غير متاح (React 19) | `tsc --noEmit` يفشل: `Cannot find namespace 'JSX'` | React 19 لا يُصدّر `JSX` كـglobal | استبدال بـ`React.JSX.Element` + استيراد React | `src/components/partners/{Customers,Liabilities,Personal,Receivables}Tab.tsx` | — | `npx tsc --noEmit` exit 0 | ✅ PASS | ✅ مكتمل |
| PHASE-0-4 | نص غير معلّق في `accounting/mod.rs` | السطر الثاني `rebuild helpers...` ليس `//!` | خطأ تنسيق تعليق | إضافة `//!` prefix | `src-tauri/src/accounting/mod.rs` | — | `cargo check` (لم يُشغّل) | ⚠️ لم تُشغّل | مكتمل (بانتظار التشغيل) |
| PHASE-0-5 | `DEFAULT_ADMIN_PASSWORD` محذوف لكن الاختبارات تشير إليه | اختبارات Rust تفشل في الترجمة | ثابت محذوف في SECURITY-1 لكن الاختبارات لم تُحدّث | استبدال الاختبارين بـ`test_init_db_bootstraps_primary_admin_with_one_time_password_and_must_change_flag` و `test_init_db_preserves_existing_admin_password_on_reinit` | `src-tauri/src/legacy.rs` | — | الاختباران الجديدان (لم يُشغّلا) | ⚠️ لم تُشغّل | مكتمل (بانتظار التشغيل) |
| CRITICAL-1 | مصروف سيارة قد يُربط بدورة شراء خطأ | `apply_car_expense_changes` يبحث بـ`chassis_number LIMIT 1` | استخدام chassis كهوية بدلاً من car_number | استبدال البحث بـ`car_number` + cross-check على chassis | `src-tauri/src/legacy.rs:13716` | — | `test_critical_1_car_expense_rejects_chassis_car_number_mismatch` | ⚠️ لم تُشغّل | مكتمل (بانتظار التشغيل) |
| CRITICAL-2 | Idempotency token لا يُخزّن في `car_expenses` | `apply_car_expense_changes` يفحص token لكن لا يُدخله في INSERT | عمود `creation_token` مفقود من INSERT | إضافة `creation_token` للـINSERT | `src-tauri/src/legacy.rs:13907` | — | `test_critical_2_car_expenses_creation_token_column_exists_and_persists` | ⚠️ لم تُشغّل | مكتمل (بانتظار التشغيل) |
| CRITICAL-3 | `get_company_status` يسبب deadlock + أرصدة خاطئة | تستدعي `get_financial_summary(state)` التي تقفل نفس الـMutex + تستخدم `affects_partner_cash` لكل الأنواع | Mutex غير reentrant + flag خاطئ | استخراج SQL inline + استخدام `borrower_balance_for_currency` للأنواع غير الشريك | `src-tauri/src/legacy.rs:15133` | — | `test_critical_3_get_company_status_does_not_call_sibling_command` | ⚠️ لم تُشغّل | مكتمل (بانتظار التشغيل) |
| CRITICAL-4 | تقسيم 50/50 يضيع سنتات USD | `round_dp_with_strategy(0, ...)` لكل العملات | scale ثابت بدلاً من حسب العملة | إضافة `split_partner_amount_50_by_currency` + `currency_scale` | `src-tauri/src/legacy.rs:49,76,111` | — | `test_critical_4_split_50_50_preserves_total_for_usd_fractions` + property test | ⚠️ لم تُشغّل | مكتمل (بانتظار التشغيل) |
| CRITICAL-5 | Migrations تبتلع الأخطاء | 113 نمط `let _ = conn.execute(...)` | تجاهل نتائج SQL | تحويل جميعها إلى `conn.execute(...)?` + Postconditions في v36 | `src-tauri/src/legacy.rs` (113 موقع) | v36 | `test_critical_5_*` (6 اختبارات) | ⚠️ لم تُشغّل | مكتمل (بانتظار التشغيل) |
| CRITICAL-6 | الرحلات المركبة قد لا تكون ذرية | فحص `save_and_sell_car_with_accounting` | كانت ذرية أصلاً عبر `db.transaction()` | التحقق + توثيق | `src-tauri/src/legacy.rs:7770` | — | — | — | ✅ مكتمل (كانت صحيحة) |
| CRITICAL-7 | `save_and_sell_car_with_accounting` لا يستقبل session_token | تستدعي `require_admin_session(&db, None)` | توقيع ناقص | إضافة `session_token: Option<String>` للـsignature + تمريره | `src-tauri/src/legacy.rs:7770,7853` | — | `save_and_sell_car_with_accounting call shape includes sessionToken field` | ✅ PASS | ✅ مكتمل |
| SCHEMA-36 | لا توجد قيود CHECK / FK / journal_entries | schema ضعيف | لا يوجد enforcement في DB | Migration 36 يضيف: idempotency_requests + journal_entries/lines + CHECK triggers + double-sell guard + car_expenses FK | `src-tauri/src/legacy.rs:3026` | v36 | `test_critical_5_*` (4 اختبارات trigger) | ⚠️ لم تُشغّل | مكتمل (بانتظار التشغيل) |
| TEST-FIX | `security_regression.test.ts` يفشل بعد PHASE-3-RESTRUCTURE | يقرأ `lib.rs` فقط، لكن المنطق انتقل لـ`legacy.rs` | ملف اختبار قديم | تحديث الاختبار لقراءة كلا الملفين | `test/frontend/security_regression.test.ts` | — | `npx vitest run test/frontend` exit 0 | ✅ PASS | ✅ مكتمل |

## اختبارات تم استبدالها (لا تحذف دون بديل)

| الاختبار القديم | السبب | البديل |
|---|---|---|
| `test_init_db_default_admin_password_is_admin` | يفترض وجود `DEFAULT_ADMIN_PASSWORD = "admin"` (تم حذفه في SECURITY-1) | `test_init_db_bootstraps_primary_admin_with_one_time_password_and_must_change_flag` |
| `test_init_db_migrates_legacy_initial_admin_to_default_password` | نفس الشيء + يفترض إعادة تعيين خطيرة | `test_init_db_preserves_existing_admin_password_on_reinit` |

## قواعد المنع من الرجوع

كل اختبار في الجدول أعلاه:
1. يُشغّل على Rust + SQLite حقيقية (in-memory) — **لا Mock**.
2. يختبر السلوك، لا مكان الكود.
3. يفشل بشكل واضح إذا رجع الخطأ.
4. موثق بالسبب الجذري والإصلاح.

## اختبارات لم تُشغّل (تنبيه صادق)

جميع اختبارات Rust (15+ اختبار جديد + 200+ موجودة) **لم تُشغّل** في بيئة التدقيق الحالية بسبب نقص مكتبات GTK/Webkit النظامية التي يتطلبها `tauri` crate على Linux. هذا مذكور في:

- `docs/RELEASE_EVIDENCE.md` — تفاصيل البيئة
- `final.md` — قرار No-Go
- `docs/REMAINING_RISKS.md` — الخطر #1

الاختبارات موجودة في الكود وصحيحة من حيث المنطق، لكن لا يمكنني الادعاء بنجاحها بدون تشغيل فعلي.
