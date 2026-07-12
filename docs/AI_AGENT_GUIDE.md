# AI AGENT GUIDE — دليل وكيل الذكاء الاصطناعي للصيانة

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** دليل عملي للوكيل القادم.

## 1. ما الذي يجب أن يعرفه الوكيل فوراً

### 1.1 بنية المشروع الفعلية (لا الشكلية)

- **`legacy.rs` هو المصدر الفعلي.** رغم وجود `accounting/mod.rs` و `domains/` و `reports/`، فإنها جميعاً re-exports من `legacy.rs`. لا تبحث عن المنطق في ملفات الـDomains — ابحث في `legacy.rs`.
- **`lib.rs` مجرد نقطة دخول** (155 سطر) تسجل الـTauri commands وتستدعي `legacy::run()`.
- **`Instructions.md` هو المصدر الأعلى** لقواعد العمل. عند التعارض، اعتمد القاعدة الأحدث الأكثر تفصيلاً.

### 1.2 قواعد صارمة (ممنوعات)

- ممنوع `let _ = conn.execute(...)` في migrations أو عمليات الكتابة. استخدم `?`.
- ممنوع استخدام `f64` أو JS Number في حسابات مالية. استخدم `Decimal` / `decimal.js`.
- ممنوع البحث عن سيارة بـ`chassis_number LIMIT 1`. استخدم `car_number` كهوية أساسية.
- ممنوع استدعاء Tauri Command من Tauri Command آخر (deadlock على `std::sync::Mutex`).
- ممنوع `require_admin_session(&db, None)` في أوامر الكتابة الجديدة. مرر `session_token`.
- ممنوع حذف اختبار فاشل دون بديل أقوى.
- ممنوع الادعاء بنجاح اختبار لم يُشغّل.

### 1.3 ما يجب على الوكيل فعله قبل أي تعديل

1. اقرأ `Instructions.md` كاملاً (خاصة §31 حول تكرار الشاصي والإيراد المؤجل).
2. اقرأ `docs/ACCOUNTING_POLICY.md`.
3. اقرأ `docs/SCHEMA.md` لمعرفة الـtriggers الجديدة (v36) التي قد ترفض عملياتك.
4. ابحث في `legacy.rs` عن الدالة المعنية (استخدم `grep -n "fn function_name" src-tauri/src/legacy.rs`).
5. اقرأ سياق الدالة كاملاً قبل التعديل.
6. بعد التعديل: شغّل `npx tsc --noEmit` (واجهة) + `cargo check` (خلفية، يتطلب GTK).

## 2. مواقع الدوال المهمة في `legacy.rs`

| الدالة | السطر التقريبي | الغرض |
|---|---|---|
| `split_partner_amount_50` | 49 | تقسيم 50/50 (IQD legacy) |
| `split_partner_amount_50_by_currency` | 76 | تقسيم 50/50 حسب العملة (جديد) |
| `currency_scale` | 111 | سياسة المنازل العشرية |
| `Money` struct | 130 | النوع المالي الأساسي |
| `require_admin_session` | 1024 | التحقق من الجلسة |
| `init_db` | 1153 | تهيئة قاعدة البيانات + 36 migrations |
| `record_ledger_entry` | 3450 | كتابة قيد في financial_ledger |
| `add_car` | 5991 | إضافة/تعديل سيارة |
| `sell_car_with_accounting` | 6705 | بيع سيارة متوفرة |
| `delete_car` | 7114 | حذف سيارة |
| `update_sold_car_with_accounting` | 7258 | تعديل بيع |
| `save_and_sell_car_with_accounting` | 7824 | إنشاء+بيع في transaction |
| `add_partner_transaction` | 8873 | حركة شريك |
| `pay_customer_installment_core` | 10700 | منطق سداد القسط |
| `reverse_customer_installment_payment_core` | 10870 | عكس دفعة |
| `apply_car_expense_changes` | 13913 | مصروفات السيارة |
| `add_agency` | 14723 | إضافة وكالة |
| `get_company_status` | 15133 | حالة الشركة (مُصلحة) |
| `get_financial_summary` | 14915 | الملخص المالي |
| `borrower_balance_for_currency` | 14012 | رصيد ذمة حسب العملة |

> **تنبيه:** أرقام الأسطر قابلة للتقادم. استخدم `grep` دائماً.

## 3. قواعد التعديل الآمن

### 3.1 عند إضافة Migration جديدة

```rust
if version < 37 {
    conn.execute("CREATE TABLE ...", [])?;
    // ... خطواتك ...
    
    // Postcondition (إلزامي)
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = '...')",
        [], |row| row.get(0)
    )?;
    if !exists {
        return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
            std::io::Error::other("v37 postcondition failed")
        )));
    }
    
    conn.execute("INSERT INTO db_version (version) VALUES (37)", [])?;
}
```

### 3.2 عند تعديل أمر كتابة

```rust
#[tauri::command]
pub fn my_write_command(
    state: State<AppState>,
    // ... معاملات ...
    session_token: Option<String>,  // ← دائماً
    creation_token: Option<String>, // ← للأوامر التي تنشئ سجلات
) -> Result<MyResult, String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_guard.transaction().map_err(|e| e.to_string())?;
    let actor_user_id = require_admin_session(&db, session_token.as_deref())?;
    
    // ... validation ...
    // ... SQL writes ...
    // ... record_ledger_entry ...
    // ... distribute_to_partners_50 ...
    
    append_audit_event(&db, actor_user_id, "entity", id, "my_write_command", 
                       session_token.as_deref(), creation_token.as_deref())?;
    
    db.commit().map_err(|e| e.to_string())?;
    Ok(result)
}
```

### 3.3 عند إضافة اختبار

```rust
#[test]
fn test_my_feature_invariant() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();
    
    // ... setup ...
    // ... call function ...
    // ... assert invariant ...
}
```

> **تنبيه:** الاختبارات في `legacy.rs::mod tests` لا تحتاج Tauri runtime — يمكن تشغيلها بـ`cargo test --lib`.

## 4. الأخطاء الشائعة وكيفية تجنبها

| الخطأ | العرض | الحل |
|---|---|---|
| Deadlock | استدعاء Tauri command من Tauri command | استخرج المنطق كـ`fn` عادية تستقبل `&Connection` |
| ضياع سنتات USD | استخدام `split_partner_amount_50` للـUSD | استخدم `split_partner_amount_50_by_currency` |
| ربط مصروف بدورة خطأ | البحث بـ`chassis LIMIT 1` | استخدم `car_number` + cross-check chassis |
| تكرار إنشاء سجل | نسيان `creation_token` | مرره وافحصه قبل INSERT |
| تجاهل خطأ migration | `let _ = conn.execute(...)` | استخدم `?` |

## 5. الأوامر المفيدة

```bash
# فحص TypeScript
npx tsc --noEmit

# بناء الواجهة
npx vite build

# اختبارات الواجهة
npx vitest run test/frontend

# فحص Rust (يتطلب GTK)
cd src-tauri && cargo check --lib
cd src-tauri && cargo test --features accounting-test-support -- --nocapture

# تشغيل Backend Bridge (للاختبارات القديمة)
node e2e-bridge/server.mjs

# بحث في legacy.rs
grep -n "fn function_name" src-tauri/src/legacy.rs
```

## 6. ملفات يجب قراءتها قبل أي مهمة كبيرة

1. `Instructions.md` — قواعد العمل
2. `docs/ARCHITECTURE.md` — البنية الفعلية
3. `docs/ACCOUNTING_POLICY.md` — السياسة المحاسبية
4. `docs/SCHEMA.md` — مخطط قاعدة البيانات (مع v36 triggers)
5. `docs/COMMAND_CONTRACTS.md` — عقود الأوامر
6. `docs/BUG_REGRESSIONS.md` — الإصلاحات السابقة (حتى لا تكررها)
7. `docs/REMAINING_RISKS.md` — ما لم يُحل بعد

## 7. ما يجب على الوكيل فعله عند الانتهاء

1. شغّل `npx tsc --noEmit` — يجب أن يخرج 0.
2. شغّل `npx vitest run test/frontend` — يجب أن pass.
3. شغّل `cargo check --lib` في `src-tauri/` (يتطلب GTK).
4. شغّل `cargo test --features accounting-test-support` (يتطلب GTK).
5. حدّث `docs/BUG_REGRESSIONS.md` بإصلاحك.
6. حدّث `docs/REMAINING_RISKS.md` إذا أصلحت خطراً.
7. لا تدّعي نجاحاً بدون تشغيل فعلي.

## 8. حدود البيئة

في بيئات Linux بدون صلاحيات root:

- لا يمكن تثبيت `libgtk-3-dev` و `libwebkit2gtk-4.1-dev` (مطلوبة من `tauri`).
- لا يمكن `cargo check` أو `cargo test` لـ`src-tauri/`.
- يمكن `npx tsc --noEmit`, `npx vite build`, `npx vitest run`.
- يمكن تشغيل scripts Python في `scripts/`.

الحل: استخدم بيئة Docker كاملة أو VM بصلاحيات root.
