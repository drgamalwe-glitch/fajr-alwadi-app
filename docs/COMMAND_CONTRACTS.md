# COMMAND CONTRACTS — عقود أوامر Tauri IPC

> **تنبيه:** هذا الملف يصف التوقيعات الفعلية بعد إعادة التدقيق. لأغراض الصيانة، اقرأ الكود الفعلي في `src-tauri/src/legacy.rs`.

## 1. قواعد عامة لكل command

- كل command يستقبل `state: State<AppState>` كأول معامل.
- أوامر الكتابة المالية تستقبل `session_token: Option<String>` (بعضها لم يُحدّث بعد — مدرج في REMAINING_RISKS).
- المبالغ تُرسل كـ**string** (عبر `moneyToStorage`) وتُستقبل كـ`Money` في Rust.
- كل command يُرجع `Result<T, String>` — الخطأ نص عربي للمستخدم.
- Tauri يحوّل `camelCase` (TS) ↔ `snake_case` (Rust) تلقائياً.

## 2. الأوامر حسب المجال

### 2.1 السيارات (Cars)

| Command | التوقيع (Rust) | التأثير | اختبار Regression |
|---|---|---|---|
| `add_car` | `(state, num, chassis, model, year, name, color, details, purchase, currency, ...)` | إضافة/تعديل سيارة. ذرية عبر `db.transaction()`. | CRITICAL-1, CRITICAL-2 |
| `sell_car_with_accounting` | `(state, car_number, buyer_name, ...)` | بيع سيارة متوفرة | — |
| `update_sold_car_with_accounting` | `(state, car_number, ...)` | تعديل بيانات بيع | — |
| `save_and_sell_car_with_accounting` | `(state, ..., session_token: Option<String>)` | إنشاء سيارة + بيعها في transaction واحدة | CRITICAL-7 |
| `get_cars` | `(state)` | قائمة السيارات | — |
| `delete_car` | `(state, car_number)` | حذف سيارة (يعكس القيود أولاً) | — |

### 2.2 مصروفات السيارة (Car Expenses)

| Command | التوقيع | التأثير | اختبار Regression |
|---|---|---|---|
| `apply_car_expense_changes` | `(state, car_number, chassis, delete_ids, additions, creation_token, session_token)` | حذف وإضافة مصروفات سيارة. **استخدام car_number كهوية أساسية**. | CRITICAL-1 (تطابق chassis), CRITICAL-2 (تخزين creation_token) |
| `get_car_expense_records` | `(state, car_number)` | قائمة مصروفات سيارة | — |

#### 2.2.1 عقد `apply_car_expense_changes` (بعد الإصلاح)

```ts
// Frontend call shape (CamelCase):
await callTauri("apply_car_expense_changes", {
  carNumber: "12345",              // ← PRIMARY lookup key (إلزامي بعد CRITICAL-1)
  chassis: "ABC123",               // ← cross-check only (يرفض إذا لا يطابق)
  deleteIds: [1, 2, 3],
  additions: [
    { description: "كراج", amount: "50000", date: "2026-01-01", currency: "IQD" }
  ],
  creationToken: "uuid-v4",        // ← idempotency token (يُخزّن في car_expenses.creation_token)
  sessionToken: null,              // ← TODO: thread من App.tsx
});
```

### 2.3 الشركاء (Partners)

| Command | التوقيع | التأثير |
|---|---|---|
| `add_partner` | `(state, name, kind, phone, ...)` | إضافة شريك |
| `update_partner` | `(state, original_name, original_kind, ...)` | تعديل |
| `delete_partner` | `(state, name, kind)` | حذف |
| `get_partners` | `(state)` | قائمة الشركاء |
| `add_partner_transaction` | `(state, ..., creation_token, session_token)` | حركة شريك + قيد محاسبي |
| `update_partner_transaction` | `(state, ...)` | تعديل حركة |
| `delete_partner_transaction` | `(state, id)` | حذف + عكس القيد |
| `get_partner_transactions` | `(state, ...)` | قائمة الحركات |

### 2.4 الوكالات (Agencies)

| Command | التوقيع | التأثير |
|---|---|---|
| `add_agency` | `(state, old_agent_name, new_agent_name, ..., creation_token, session_token)` | إضافة وكالة |
| `update_agency` | `(state, id, ...)` | تعديل |
| `delete_agency` | `(state, id)` | حذف بالـID (لا بالاسم والتاريخ) |
| `get_agencies` | `(state)` | قائمة الوكالات |
| `add_agency_transaction` | `(state, agency_id, ...)` | تحصيل/سداد وكالة |
| `delete_agency_transaction` | `(state, id)` | حذف حركة وكالة |
| `set_agency_receivable_status` | `(state, ...)` | تحديث حالة التحصيل |

### 2.5 الأقساط (Installments)

| Command | التوقيع | التأثير |
|---|---|---|
| `update_customer_sale_down_payment` | `(state, ...)` | تحديث المقدمة |
| `pay_customer_installment` | `(state, ..., session_token)` | سداد قسط |
| `reverse_customer_installment_payment` | `(state, payment_id, session_token)` | عكس دفعة قسط |
| `preview_installment_payment_redistribution` | `(state, ...)` | معاينة إعادة التوزيع |
| `recalculate_installment_schedule` | `(state, ...)` | إعادة حساب الجدول |
| `get_customer_installments` | `(state, ...)` | قائمة الأقساط |
| `set_customer_installment_status` | `(state, ...)` | تحديث حالة القسط |

### 2.6 المصروفات العامة (Expenses)

| Command | التوقيع | التأثير |
|---|---|---|
| `add_expense` | `(state, description, amount, date, ...)` | إضافة مصروف عام |
| `update_expense` | `(state, id, ...)` | تعديل |
| `delete_expense` | `(state, id)` | حذف |
| `get_expenses` | `(state)` | قائمة المصروفات |

### 2.7 المستخدمين والجلسات (Users & Sessions)

| Command | التوقيع | التأثير |
|---|---|---|
| `login` | `(state, username, password)` | إنشاء جلسة + إرجاع token |
| `logout` | `(state, session_token)` | إنهاء جلسة |
| `get_users` | `(state, session_token)` | قائمة المستخدمين |
| `add_user` | `(state, ..., session_token)` | إضافة مستخدم |
| `update_user` | `(state, ..., session_token)` | تعديل |
| `change_password` | `(state, ..., session_token)` | تغيير كلمة المرور |
| `delete_user` | `(state, id, session_token)` | حذف مستخدم |

### 2.8 التقارير والحالة (Reports & Status)

| Command | التوقيع | التأثير | اختبار Regression |
|---|---|---|---|
| `get_financial_summary` | `(state, payment_type: Option<String>)` | الملخص المالي | — |
| `get_company_status` | `(state, session_token)` | حالة الشركة (تم إصلاحها في CRITICAL-3) | CRITICAL-3 |
| `get_unified_accounts` | `(state)` | الذمم الموحدة | — |
| `get_partners_totals` | `(state, kind)` | مجاميع الشركاء | — |
| `get_profit_distribution_summary` | `(state)` | توزيع الأرباح | — |
| `get_cash_register_entries` | `(state, ...)` | حركات الكاش | — |

### 2.9 البنية التحتية (Infrastructure)

| Command | التوقيع | التأثير |
|---|---|---|
| `restore_from_backup` | `(state, backup_path)` | استعادة من نسخة احتياطية |
| `export_database_to_excel` | `(state)` | تصدير Excel |
| `open_temp_pdf` | `(path)` | فتح PDF مؤقت (مقيد بـtemp dir) |
| `open_whatsapp` | `(phone)` | فتح واتساب |
| `rename_background` / `delete_background` / `get_backgrounds` / `set_selected_background` | الخلفيات | إدارة خلفية التطبيق |
| `settle_company_through_funder` | `(state, ...)` | تسوية عبر ممول |

## 3. CommandContext (موحّد مقترح)

> **غير مطبق بعد** — مقترح للمرحلة التالية. مذكور في REMAINING_RISKS.

```rust
pub struct CommandContext {
    pub session_token: Option<String>,
    pub actor_user_id: Option<i64>,
    pub request_id: String,           // UUID لكل طلب
    pub idempotency_token: Option<String>,
    pub timestamp: Option<String>,
}
```

كل أوامر الكتابة يجب أن تستقبل `CommandContext` بدلاً من معاملات منفصلة.

## 4. Audit Trail

كل عملية كتابة تستدعي `append_audit_event`:

```rust
append_audit_event(
    &db,
    actor_user_id,           // من session_token
    entity_type,             // "car", "car_expense", "agency", ...
    entity_id: Option<i64>,
    action: &str,            // "add_car", "apply_car_expense_changes", ...
    session_token: Option<&str>,
    creation_token: Option<&str>,
)?;
```

تكتب إلى `audit_log` مع `actor_user_id`, `created_at`, إلخ.
