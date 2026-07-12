# TEST MATRIX — مصفوفة الاختبارات

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** تصنيف صادق لكل اختبار حسب نوعه الحقيقي.

## 1. اختبارات الواجهة (Frontend) — مُشغّلة ✅

| الاسم | المسار | النوع الحقيقي | السلوك المغطى | الجداول المتأثرة | Invariants | Rust+SQLite حقيقية؟ | Mock؟ | شرط Go؟ | النتيجة |
|---|---|---|---|---|---|---|---|---|---|
| `does not inherit JavaScript floating point drift` | `test/frontend/money.test.ts` | Unit (TS) | moneyAdd لا يضيع الدقة | لا (pure function) | 0.1+0.2=0.3 | لا | لا | لا | ✅ PASS |
| `normalizes Arabic digits and separators` | `test/frontend/money.test.ts` | Unit (TS) | toMoney يطبع أرقام عربية | لا | normalize | لا | لا | لا | ✅ PASS |
| `keeps subtraction and division deterministic` | `test/frontend/money.test.ts` | Unit (TS) | moneySub/moneyDiv | لا | deterministic | لا | لا | لا | ✅ PASS |
| `formatMoney uses 0/2 decimal places for IQD/USD` | `test/frontend/forensic_reaudit_2026_07_11.test.ts` | Unit (TS) | CRITICAL-4 mirror | لا | matches Rust currency_scale | لا | لا | لا | ✅ PASS |
| `moneyToStorage serializes USD fractions without losing precision` | `test/frontend/forensic_reaudit_2026_07_11.test.ts` | Unit (TS) | CRITICAL-4 | لا | no precision loss | لا | لا | لا | ✅ PASS |
| `moneyDiv does not introduce floating-point drift on USD fractions` | `test/frontend/forensic_reaudit_2026_07_11.test.ts` | Unit (TS) | CRITICAL-4 | لا | no drift | لا | لا | لا | ✅ PASS |
| `apply_car_expense_changes call shape includes car_number` | `test/frontend/forensic_reaudit_2026_07_11.test.ts` | Contract (TS) | CRITICAL-1 | لا | shape | لا | لا | لا | ✅ PASS |
| `CompanyStatus type has all required fields` | `test/frontend/forensic_reaudit_2026_07_11.test.ts` | Contract (TS) | CRITICAL-3 | لا | shape | لا | لا | لا | ✅ PASS |
| `save_and_sell_car_with_accounting call shape includes sessionToken` | `test/frontend/forensic_reaudit_2026_07_11.test.ts` | Contract (TS) | CRITICAL-7 | لا | shape | لا | لا | لا | ✅ PASS |
| `moneyDiv/moneyToStorage/toMoney/formatMoney are exported` | `test/frontend/forensic_reaudit_2026_07_11.test.ts` | Regression (TS) | PHASE-0 build blockers | لا | exports exist | لا | لا | لا | ✅ PASS |
| `lib.rs/legacy.rs must not contain DEFAULT_ADMIN_PASSWORD` | `test/frontend/security_regression.test.ts` | Regression (file scan) | SECURITY-1 | لا | no hardcoded pwd | لا | لا | نعم | ✅ PASS |
| `lib.rs/legacy.rs may only reference 'admin' as username or legacy-insecure` | `test/frontend/security_regression.test.ts` | Regression (file scan) | SECURITY-1 | لا | controlled consts | لا | لا | نعم | ✅ PASS |
| `initial_admin_password.txt must never ship` | `test/frontend/security_regression.test.ts` | Regression (file system) | SECURITY-1 | لا | file absent | لا | لا | نعم | ✅ PASS |
| `.gitignore forbids initial_admin_password.txt` | `test/frontend/security_regression.test.ts` | Regression (file scan) | SECURITY-1 | لا | gitignore rules | لا | لا | نعم | ✅ PASS |
| `callTauri throws in PROD when Tauri is not detected` | `test/frontend/security_regression.test.ts` | Regression (file scan) | MOCK-ISOLATION-1 | لا | PROD guard | لا | لا | نعم | ✅ PASS |
| `add_partner_transaction signature includes creation_token + session_token` | `test/frontend/security_regression.test.ts` | Contract (file scan) | IDEMPOTENCY-1 | لا | signature | لا | لا | نعم | ✅ PASS |
| `append_audit_event writes actor_user_id from backend session` | `test/frontend/security_regression.test.ts` | Contract (file scan) | AUDIT-TRAIL-1 | لا | audit shape | لا | لا | نعم | ✅ PASS |
| اختبارات `pagination.test.ts` | `test/frontend/pagination.test.ts` | Unit (TS) | ترقيم الصفحات | لا | — | لا | لا | لا | ✅ PASS |
| اختبارات `vehicle.test.ts` | `test/frontend/vehicle.test.ts` | Unit (TS) | تسوية هوية السيارة | لا | — | لا | لا | لا | ✅ PASS |
| اختبارات `layoutSafety.test.ts` | `test/frontend/layoutSafety.test.ts` | Unit (TS) | سلامة التخطيط | لا | — | لا | لا | لا | ✅ PASS |
| اختبارات `accounting_rules.test.ts` | `test/frontend/accounting_rules.test.ts` | Unit (TS) | قواعد محاسبية | لا | — | لا | لا | لا | ✅ PASS |
| اختبارات `idempotency.test.ts` | `test/frontend/idempotency.test.ts` | Unit (TS) | idempotency | لا | — | لا | لا | لا | ✅ PASS |
| اختبارات `forensic_front_2_2.test.ts` | `test/frontend/forensic_front_2_2.test.ts` | Unit (TS) | فحص جنائي | لا | — | لا | لا | لا | ✅ PASS |

**مجموع الواجهة:** 69 اختبار، جميعها PASS.

## 2. اختبارات Rust — موجودة لكن **لم تُشغّل** ⚠️

| الاسم | المسار | النوع الحقيقي | السلوك المغطى | الجداول المتأثرة | Invariants | Rust+SQLite حقيقية؟ | Mock؟ | شرط Go؟ | النتيجة |
|---|---|---|---|---|---|---|---|---|---|
| `test_critical_4_split_50_50_preserves_total_for_usd_fractions` | `legacy.rs::mod tests` | Unit (Rust) | CRITICAL-4 | لا | sum=preserved | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_4_split_50_50_property_test` | `legacy.rs::mod tests` | Property (Rust) | CRITICAL-4 invariant | لا | sum=preserved على 200K قيمة | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_4_currency_scale_rejects_unknown_currencies` | `legacy.rs::mod tests` | Unit (Rust) | CRITICAL-4 fail-closed | لا | rejects unknown | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_4_legacy_split_entry_point_still_works` | `legacy.rs::mod tests` | Regression (Rust) | CRITICAL-4 backwards compat | لا | legacy still works | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_1_car_expense_rejects_chassis_car_number_mismatch` | `legacy.rs::mod tests` | Regression (Rust) | CRITICAL-1 cross-cycle contamination | cars | car_number primary | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_2_car_expenses_creation_token_column_exists_and_persists` | `legacy.rs::mod tests` | Regression (Rust) | CRITICAL-2 token persistence | car_expenses | token stored | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_5_migrations_reach_v36_on_fresh_db` | `legacy.rs::mod tests` | Integration (Rust+SQLite) | CRITICAL-5 v36 | all | db_version>=36 + objects exist | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_5_currency_check_trigger_rejects_unknown_currency` | `legacy.rs::mod tests` | Integration (Rust+SQLite) | CRITICAL-5 CHECK trigger | partner_transactions | rejects EUR | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_5_affects_partner_cash_check_trigger_rejects_invalid_values` | `legacy.rs::mod tests` | Integration (Rust+SQLite) | CRITICAL-5 CHECK trigger | partner_transactions | rejects 2 | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_5_no_double_sell_trigger_rejects_resale_without_reversal` | `legacy.rs::mod tests` | Integration (Rust+SQLite) | CRITICAL-5 double-sell | cars | rejects resale | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_5_car_expenses_fk_trigger_rejects_orphan_expense` | `legacy.rs::mod tests` | Integration (Rust+SQLite) | CRITICAL-5 FK trigger | car_expenses | rejects orphan | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_critical_3_get_company_status_does_not_call_sibling_command` | `legacy.rs::mod tests` | Regression (Rust+SQLite) | CRITICAL-3 deadlock | partner_transactions, financial_ledger | no deadlock | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_security_1_legacy_insecure_admin_password_constant_is_renamed` | `legacy.rs::mod tests` | Regression (Rust) | SECURITY-1 | لا | const renamed | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_init_db_bootstraps_primary_admin_with_one_time_password_and_must_change_flag` | `legacy.rs::mod tests` | Regression (Rust+SQLite) | SECURITY-1 | users | must_change=1 | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_init_db_preserves_existing_admin_password_on_reinit` | `legacy.rs::mod tests` | Regression (Rust+SQLite) | SECURITY-1 | users | no overwrite | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_money_deserialization_rejects_json_float` | `legacy.rs::mod tests` | Unit (Rust) | money invariant | لا | rejects f64 | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `test_admin_session_survives_primary_admin_username_change` | `legacy.rs::mod tests` | Integration (Rust+SQLite) | sessions | sessions | session by user_id | نعم | لا | نعم | ⚠️ لم تُشغّل |
| `migration_v32_prod` | `src-tauri/tests/migration_v32_prod.rs` | Integration (Rust+SQLite) | v32 على قاعدة إنتاج | all | schema correct | نعم | لا | نعم | ⚠️ لم تُشغّل |
| اختبارات Backend Bridge | `test/accounting/backend/bridge.backend.test.ts` | **Mock** (TS) | ⚠️ لا يصل Rust | — | — | ❌ لا | ✅ نعم | نعم | ⚠️ يستخدم Mock |
| اختبارات E2E | `test/accounting/e2e/*.spec.ts` | **E2E via Mock Bridge** (TS) | ⚠️ لا يصل Rust | — | — | ❌ لا | ✅ نعم | نعم | ⚠️ يستخدم Mock |
| اختبارات Oracle | `test/accounting/oracle/*.test.ts` | Unit (TS) | pure logic | لا | — | لا | لا | لا | ⚠️ لم تُشغّل |

## 3. اختبارات Scripts Python — موجودة لكن **لم تُشغّل** ⚠️

| الاسم | المسار | النوع | يصل Rust؟ | النتيجة |
|---|---|---|---|---|
| `test_comprehensive_scenarios.py` | `scripts/` | Script (Python) | ❌ يفتح DB مباشرة | ⚠️ لم تُشغّل |
| `test_scenarios_s28_s61.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `test_vin_integrity.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `test_migration_v32_orphan_cleanup.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `test_forensic_rust_1_11.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `check_installment_profit.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `accounting_runtime_scenarios.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `test_session_gate.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `accounting_audit.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `test_agency_cash_vs_credit.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `test_duplicate_prevention.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `smoke_test_real_db.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |
| `data_integrity_check.py` | `scripts/` | Script (Python) | ❌ | ⚠️ لم تُشغّل |

## 4. ملخص

| الفئة | العدد | مُشغّلة | ناجحة | Mock | شرط Go |
|---|---|---|---|---|---|
| Unit (TS) | 26 | ✅ 26 | ✅ 26 | لا | لا |
| Contract (TS) | 3 | ✅ 3 | ✅ 3 | لا | لا |
| Regression (TS file scan) | 8 | ✅ 8 | ✅ 8 | لا | نعم |
| Unit (Rust) | 3 | ❌ 0 | — | لا | نعم |
| Property (Rust) | 1 | ❌ 0 | — | لا | نعم |
| Regression (Rust) | 6 | ❌ 0 | — | لا | نعم |
| Integration (Rust+SQLite) | 6 | ❌ 0 | — | لا | نعم |
| **Mock (TS Backend Bridge)** | 1 | ❌ 0 | — | ✅ **نعم** | نعم |
| **Mock (TS E2E)** | 2 | ❌ 0 | — | ✅ **نعم** | نعم |
| Script (Python) | 13 | ❌ 0 | — | لا | لا |

## 5. خطة الترقية

لتحويل الاختبارات إلى Rust+SQLite حقيقية:

1. تثبيت GTK/Webkit في بيئة كاملة.
2. تشغيل `cargo test --features accounting-test-support`.
3. استبدال `bridge.backend.test.ts` بـRust integration tests.
4. تحويل E2E إلى Playwright + Tauri real (تتطلب تطبيق مُعبأ).

بعد ذلك، تختفي جميع إدخالات "Mock" من الجدول.
