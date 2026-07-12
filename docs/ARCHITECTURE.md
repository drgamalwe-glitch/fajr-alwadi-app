# ARCHITECTURE — فجر الوادي ERP

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** هذا الملف يصف التنفيذ الفعلي بعد إصلاحات إعادة التدقيق، لا التصميم الشكلي.

## 1. نظرة عامة

نظام ERP محلي لإدارة تجارة السيارات والحسابات، مبني على:

| الطبقة | التقنية | الحجم الفعلي |
|---|---|---|
| تطبيق سطح المكتب | Tauri 2.11 | — |
| الواجهة | React 19 + TypeScript 5 | 71 ملف TS/TSX |
| البناء | Vite 8 | — |
| التنسيق | Tailwind CSS + CSS مخصص | — |
| الباك إند | Rust 1.97 (edition 2021) | `legacy.rs` ≈ 21,500 سطر |
| قاعدة البيانات | SQLite عبر `rusqlite 0.32` (bundled) | 36 migration |
| الدقة المالية | `rust_decimal` (Rust) + `decimal.js` (TS) | — |
| اختبارات الواجهة | Vitest 4 | 9 ملفات، 69 اختبار |
| اختبارات الرحلات | Playwright (يعتمد Backend Bridge) | — |
| اختبارات Rust | `cargo test` (لا يمكن تشغيلها في بيئة التدقيق لغياب مكتبات GTK) | 9 اختبارات جديدة لـCRITICAL-1..7 + 200+ اختبار موجود |

## 2. بنية الكود (الفعلية بعد إعادة التدقيق)

```
src-tauri/src/
├── lib.rs              — نقطة الدخول (155 سطر): تهيئة Tauri + تسجيل الـcommands
├── legacy.rs           — التنفيذ الفعلي (21,500+ سطر) — ملف واحد ضخم يحتوي كل المنطق
├── main.rs             — main() التي تستدعي lib::run()
├── accounting/
│   └── mod.rs          — re-exports من legacy (لم ينقل المنطق فعلياً بعد)
├── auth/mod.rs         — re-exports
├── db/mod.rs           — re-exports
├── domains/            — مجلدات شكلية (re-exports فقط)
│   ├── cars/mod.rs
│   ├── partners/mod.rs
│   ├── installments/mod.rs
│   ├── agencies/mod.rs
│   └── expenses/mod.rs
├── reports/mod.rs      — re-exports
├── infrastructure/     — re-exports
│   ├── mod.rs
│   ├── commands.rs
│   └── backup.rs
└── accounting_test_support.rs — اختبارات Backend حقيقية (1,209 سطر)
```

### 2.1 اعتراف صادق بحدود إعادة الهيكلة الحالية

تقرير التدقيق طلب نقل المنطق فعلياً من `legacy.rs` إلى الـDomains. **التنفيذ الحالي لم يفعل ذلك** — `lib.rs` مُقسم شكلياً لكن `legacy.rs` لا يزال 21,500+ سطر. هذا قرض تقني معروف مُدرج في `REMAINING_RISKS.md` كخطر عالٍ. تم تطبيق الإصلاحات الجذرية السبعة **داخل** `legacy.rs` بدون نقل فعلي.

## 3. مصادر الحقيقة (Source of Truth)

| المفهوم | المصدر | الموقع |
|---|---|---|
| قواعد العمل | `Instructions.md` | جذر المشروع |
| هيكل قاعدة البيانات | `init_db()` + الـ36 migrations | `legacy.rs:1113` |
| حسابات الكاش والذمم | SQL مباشرة في `get_company_status` | `legacy.rs:15133` (تم إصلاحها) |
| تقسيم الشريكين 50/50 | `split_partner_amount_50_by_currency` | `legacy.rs:76` |
| سياسة المنازل العشرية | `currency_scale` | `legacy.rs:111` |
| رفض JSON Float | `Money::deserialize` | `legacy.rs` (visit_f64 → Err) |
| الإيراد المؤجل للوكالات | `Instructions.md` §31 (القاعدة الأحدث) | — |
| الدقة المالية | `rust_decimal` (Rust) و `decimal.js` (TS) | — |

## 4. حدود الطبقات (المطبقة فعلياً)

| الحد | الحالة |
|---|---|
| Command يستقبل الطلب ويتحقق من Session | ✅ مطبق في الـ50+ command |
| Service يتولى قواعد العمل | ⚠️ غير مفصول فعلياً — مدمج في `legacy.rs` |
| Repository مسؤول عن SQL فقط | ⚠️ غير مفصول فعلياً — SQL مدمج في دوال الأعمال |
| Accounting Journal مسار واحد لكتابة القيود | ⚠️ `financial_ledger` قائم + `journal_entries/journal_lines` جداول جديدة (Migration 36) لم تُكتب إليها بعد |
| React لا يقرر القواعد المحاسبية | ✅ مطبق (CompanyStatusTab أصبح pure renderer) |
| لا مجلد utils عام يحتوي منطق أعمال حساس | ⚠️ `src/utils/finance.ts` يحتوي بعض المنطق |

## 5. التدفق الفعلي لطلب كتابة

```
React Component
    ↓ callTauri("command_name", args)
    ↓ invoke() عبر Tauri IPC
    ↓ serializeTauriMoneyArgs (يحوّل المبالغ لـstring)
Tauri Command (legacy.rs)
    ↓ state.db.lock()  ← Mutex غير reentrant
    ↓ db.transaction()
    ↓ require_admin_session(&db, session_token)
    ↓ validate_*()
    ↓ SQL + record_ledger_entry + distribute_to_partners_50
    ↓ append_audit_event
    ↓ db.commit()
    ↓ Result<T, String>
React Component
    ↓ تحديث UI
```

## 6. الفجوات المعمارية المعروفة (مدرجة في REMAINING_RISKS.md)

1. `legacy.rs` 21,500+ سطر — يجب تقسيمه فعلياً إلى Domains.
2. SQL مدمج في دوال الأعمال — يجب فصله إلى Repository layer.
3. `financial_ledger` و `journal_entries/journal_lines` يعيشان معاً — يجب التوحيد.
4. بعض الأوامر تستخدم `require_admin_session(&db, None)` — يجب ربطها بـsession_token صريح.
5. أسماء الشركاء (مثل "أمير"، "منتصر") مدمجة في logic الواجهة (CompanyStatusTab) — يجب استخدام IDs.

## 7. المراجع التقنية

- `Cargo.toml` — قائمة الاعتماديات وم profiles البناء
- `tauri.conf.json` — إعداد Tauri
- `capabilities/default.json` — صلاحيات Tauri IPC
- `package.json` — scripts البناء والاختبار
- `vitest.config.ts`, `playwright.config.ts` — إعداد الاختبارات
