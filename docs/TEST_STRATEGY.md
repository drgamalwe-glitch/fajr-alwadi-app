# TEST STRATEGY — استراتيجية الاختبارات

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** يصف الاستراتيجية الفعلية + الفجوات المعروفة.

## 1. طبقات الاختبارات

| الطبقة | الأداة | النوع | الموقع | الحالة |
|---|---|---|---|---|
| وحدة (Unit) — TypeScript | Vitest 4 | Frontend helpers | `test/frontend/*.test.ts` | ✅ 69 اختبار ناجح |
| وحدة (Unit) — Rust | `cargo test` | Backend helpers | `src-tauri/src/legacy.rs::mod tests` | ⚠️ 9 اختبارات جديدة + 200+ موجودة، **لم تُشغّل** في بيئة التدقيق |
| Backend Integration | `cargo test --features accounting-test-support` | Rust + SQLite in-memory | `src-tauri/src/accounting_test_support.rs` | ⚠️ **لم تُشغّل** |
| Backend Bridge (موجود) | Vitest + Node HTTP bridge | Frontend → Backend Bridge (mock) | `test/accounting/backend/` | ⚠️ يعتمد على Mock — لا يصل إلى Rust/SQLite |
| Oracle | Vitest (pure logic) | Frontend-only oracle | `test/accounting/oracle/` | ✅ |
| E2E | Playwright | UI + Tauri real | `test/accounting/e2e/` | ⚠️ يعتمد على Backend Bridge |

## 2. اختبارات إعادة التدقيق الجديدة (CRITICAL-1..7)

### 2.1 اختبارات Rust (في `src-tauri/src/legacy.rs::mod tests`)

| الاختبار | النوع | يغطي | هل يعمل على Rust+SQLite حقيقية؟ | هل يستخدم Mock؟ | شرط Go؟ | النتيجة المتوقعة |
|---|---|---|---|---|---|---|
| `test_critical_4_split_50_50_preserves_total_for_usd_fractions` | Unit | CRITICAL-4: تقسيم 50/50 حسب العملة | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_4_split_50_50_property_test` | Property | CRITICAL-4: invariant على 200K قيمة | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_4_currency_scale_rejects_unknown_currencies` | Unit | CRITICAL-4: fail-closed للعملات | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_4_legacy_split_entry_point_still_works` | Regression | CRITICAL-4: backwards compat | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_1_car_expense_rejects_chassis_car_number_mismatch` | Regression | CRITICAL-1: منع تلوث الدورات | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_2_car_expenses_creation_token_column_exists_and_persists` | Regression | CRITICAL-2: تخزين token | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_5_migrations_reach_v36_on_fresh_db` | Integration | CRITICAL-5: 36 migrations | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_5_currency_check_trigger_rejects_unknown_currency` | Integration | CRITICAL-5: CHECK trigger | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_5_affects_partner_cash_check_trigger_rejects_invalid_values` | Integration | CRITICAL-5: CHECK trigger | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_5_no_double_sell_trigger_rejects_resale_without_reversal` | Integration | CRITICAL-5: double-sell guard | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_5_car_expenses_fk_trigger_rejects_orphan_expense` | Integration | CRITICAL-5: FK trigger | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_critical_3_get_company_status_does_not_call_sibling_command` | Regression | CRITICAL-3: deadlock fix | نعم | لا | نعم | PASS (لم تُشغّل) |
| `test_security_1_legacy_insecure_admin_password_constant_is_renamed` | Regression | SECURITY-1 | نعم | لا | نعم | PASS (لم تُشغّل) |

### 2.2 اختبارات TypeScript (في `test/frontend/forensic_reaudit_2026_07_11.test.ts`)

| الاختبار | النوع | يغطي | النتيجة |
|---|---|---|---|
| `formatMoney uses 0 decimal places for IQD and 2 for USD` | Unit | CRITICAL-4: mirror | ✅ PASS |
| `moneyToStorage serializes USD fractions without losing precision` | Unit | CRITICAL-4 | ✅ PASS |
| `moneyDiv does not introduce floating-point drift on USD fractions` | Unit | CRITICAL-4 | ✅ PASS |
| `apply_car_expense_changes call shape includes car_number as required field` | Contract | CRITICAL-1 | ✅ PASS |
| `CompanyStatus type has all required fields for CompanyStatusTab rendering` | Contract | CRITICAL-3 | ✅ PASS |
| `save_and_sell_car_with_accounting call shape includes sessionToken field` | Contract | CRITICAL-7 | ✅ PASS |
| `moneyDiv is exported from utils/money` | Regression | PHASE-0 build blocker | ✅ PASS |
| `moneyToStorage is exported from utils/money` | Regression | PHASE-0 | ✅ PASS |
| `toMoney is exported from utils/money` | Regression | PHASE-0 | ✅ PASS |
| `formatMoney is exported from utils/money` | Regression | PHASE-0 | ✅ PASS |

## 3. اختبارات قوية موجودة (يجب الحفاظ عليها)

| الاختبار | الموقع | الغرض |
|---|---|---|
| `test_money_deserialization_rejects_json_float` | `legacy.rs` | رفض JSON Float |
| `test_init_db_bootstraps_primary_admin_with_one_time_password_and_must_change_flag` | `legacy.rs` | SECURITY-1 (جديد) |
| `test_init_db_preserves_existing_admin_password_on_reinit` | `legacy.rs` | SECURITY-1 (جديد) |
| `test_admin_session_survives_primary_admin_username_change` | `legacy.rs` | الجلسات |
| اختبارات رفض الدفعات المكررة | `legacy.rs` | Idempotency |
| اختبارات سقف ربح الأقساط | `accounting_test_support.rs` | Profit cap |
| اختبارات فصل العملات | `accounting_test_support.rs` | Currency separation |
| Backend Bridge Tests | `test/accounting/backend/` | ⚠️ تعتمد Mock — يجب إعادة تصميمها |
| E2E Tests | `test/accounting/e2e/` | ⚠️ تعتمد Backend Bridge — ليست E2E حقيقية |

## 4. اختبارات تحتاج إعادة تصميم

| الاختبار الحالي | المشكلة | الإجراء المطلوب |
|---|---|---|
| `bridge.backend.test.ts` | يعتمد على Node HTTP bridge يـmock الـTauri | استبدال بـRust integration حقيقي |
| `accounting-ui.spec.ts` | Playwright يعتمد Backend Bridge | تصنيف كـUI smoke test، لا E2E |
| `comprehensive-ui.spec.ts` | نفس الشيء | نفس الشيء |
| اختبارات regex الأمن | تفحص مكان الكود بدلاً من سلوكه | استبدال بـruntime security tests |

## 5. قواعد إلزامية للـPipeline

Pipeline يجب أن يفشل إذا:

| الشرط | الحالة في بيئتنا |
|---|---|
| Backend mode = stub | غير مطبق (الـbackend bridge موجود كـmock) |
| Backend mode = mock | ⚠️ موجود في `bridge.backend.test.ts` |
| Rust tests المنفذة = 0 | ⚠️ لم تُشغّل أي Rust test في هذه الجلسة |
| توجد اختبارات حرجة skipped | لا |
| Test Suite اكتفت بـHealth check | لا |
| فشل بناء التطبيق | ✅ Frontend يبنى بنجاح |
| لم تنفذ Migration tests | ⚠️ لم تُشغّل |
| لم تنفذ Accounting invariant tests | ⚠️ لم تُشغّل |

> **لذلك قرار No-Go مفروض** — انظر `final.md` و `RELEASE_EVIDENCE.md`.

## 6. خطة اختبار البيئة المستهدفة

عند نقل المشروع إلى بيئة Linux بصلاحيات root كاملة:

```bash
# 1. تثبيت اعتماديات Tauri
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev libglib2.0-dev \
  libgdk-pixbuf2.0-dev libpango1.0-dev libcairo2-dev \
  libsoup-3.0-dev libjavascriptcoregtk-4.1-dev pkg-config build-essential

# 2. تشغيل Rust tests
cd src-tauri
cargo test --features accounting-test-support -- --nocapture

# 3. تشغيل Frontend tests
cd ..
npm run test

# 4. تشغيل Migration tests على snapshots تاريخية
cargo test --features accounting-test-support -- migration
# (يتطلب وجود snapshot DBs في مجلد محدد)

# 5. بناء التطبيق
npm run build
cd src-tauri && cargo build --release
```

## 7. السيناريوهات الإلزامية الـ37

مذكورة في `Instructions.md` §9 من برومت التنفيذ. **لم يتم تشغيلها فعلياً** في هذه الجلسة. مذكورة في `final.md` جدول السيناريوهات.
