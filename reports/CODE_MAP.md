# CODE_MAP — خريطة الكود الحالية

> آخر تحديث: 2026-07-15. تعتمد الخريطة على أسماء الملفات/الدوال بدل أرقام أسطر هشة؛ استخدم `rg -n "fn NAME|function NAME|const NAME" PATH` للوصول الدقيق.

## Backend

| المجال | الملف | الحجم التقريبي | المسؤولية |
|---|---|---:|---|
| تهيئة وترحيلات | `src-tauri/src/legacy/db_init.rs` | 3389 | `init_db` وMigrations 1–45 |
| السيارات | `src-tauri/src/legacy/cars.rs` | 3102 | add/sell/update/delete، دفاتر الشراء والبيع |
| الأقساط | `src-tauri/src/legacy/installments.rs` | 4566 | الجداول، الدفع، العكس، الربح المؤجل |
| دفتر الأستاذ | `src-tauri/src/legacy/ledger.rs` | 2863 | القيود والعمليات والعكس والتوزيع |
| الوكالات | `src-tauri/src/legacy/agencies.rs` | 1368 | CRUD، الحركات، العكس الإلحاقي |
| الشركاء | `src-tauri/src/legacy/partners.rs` | 1062 | الحسابات والحركات وإعادة الحساب |
| المصروفات | `src-tauri/src/legacy/expenses.rs` | 998 | المصروف العام ومصروف السيارة |
| التقارير | `src-tauri/src/legacy/reports.rs` | 944 | الملخص المالي وتوزيع الربح |
| الحماية والمساعدات | `src-tauri/src/legacy/helpers.rs` | 609 | validation/audit/identity/idempotency helpers |
| الاختبارات الصارمة | `src-tauri/src/legacy/tests_module.rs` | 4080 | migrations/invariants |
| الاختبارات العشوائية | `src-tauri/src/legacy/randomized_tests.rs` | 457 | property/stateful model |

## Frontend

| المجال | الملف | الحجم التقريبي |
|---|---|---:|
| السيارات | `src/components/CarsTab.tsx` | 1939 |
| نموذج السيارة/المصروفات | `src/components/CarFormPanel.tsx` | 1295 |
| الشركاء والحسابات | `src/components/PartnersTab.tsx` | 3887 |
| الوكالات | `src/components/AgenciesTab.tsx` | 1065 |
| تحويل بيانات السيارة | `src/components/carHelpers.ts` | — |
| تحويل بيانات الشريك | `src/components/partnerHelpers.ts` | — |
| IPC | `src/api/tauri.ts` | — |
| الأنواع | `src/types.ts` | — |
| tokens | `src/utils/idempotency.ts` | — |

## نقاط الدخول والبوابات

- تسجيل أوامر Tauri: `src-tauri/src/lib.rs`.
- CI: `.github/workflows/ci.yml`.
- بوابة الإصدار: `npm run test:release`.
- سلامة البيانات: `scripts/data_integrity_check.py`.
- منع الحذف المالي: `scripts/check_no_hard_financial_deletes.py`.
- منع الهوية النصية في الكتابة: `scripts/check_numeric_write_identity.py`.
