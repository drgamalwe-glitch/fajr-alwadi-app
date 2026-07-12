# SCHEMA — مخطط قاعدة بيانات فجر الوادي

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** يصف الحالة بعد Migration 36.

## 1. قاعدة البيانات

- **النوع:** SQLite عبر `rusqlite 0.32` (bundled).
- **المسار:** `{app_dir}/fjr_alwadi_data.db`.
- **PRAGMA:** `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL`.
- **آخر migration:** v36.

## 2. الجداول الرئيسية

### 2.1 `cars` — السيارات

| العمود | النوع | القيد | ملاحظات |
|---|---|---|---|
| `car_number` | TEXT | **PRIMARY KEY** | المعرّف الداخلي الثابت (يُضاف `#N` عند تكرار اللوحة) |
| `car_plate_num` | TEXT | — | رقم اللوحة (ممكن يتكرر) |
| `chassis_number` | TEXT | — | رقم الشاصي (ممكن يتكرر عبر دورات شراء) |
| `car_model` | TEXT | — | — |
| `car_year` | TEXT | — | — |
| `car_name` | TEXT | NOT NULL | — |
| `color` | TEXT | — | — |
| `details` | TEXT | — | — |
| `purchase_price` | TEXT | DEFAULT '0' | Decimal كنص |
| `currency` | TEXT | DEFAULT 'IQD' | IQD أو USD |
| `sale_currency` | TEXT | DEFAULT 'IQD' | — |
| `selling_price` | TEXT | DEFAULT '0' | — |
| `status` | TEXT | NOT NULL | 'متوفرة' / 'مبيوعة' / 'محذوفة' — CHECK trigger من v36 |
| `payment_type` | TEXT | — | 'كاش' / 'موعد' / 'اقساط' |
| `cash_price` | TEXT | — | — |
| `amount_paid` | TEXT | — | — |
| `amount_remaining` | TEXT | — | — |
| `installment_months` | INTEGER | — | — |
| `monthly_payment` | TEXT | — | — |
| `purchase_payment_type` | TEXT | DEFAULT 'قاصه' | — |
| `purchase_type` | TEXT | DEFAULT 'كاش' | 'كاش' / 'دين' |
| `financer_name` | TEXT | — | — |
| `commission_type` | TEXT | — | — |
| `commission_value` | TEXT | — | — |
| `buyer_name` | TEXT | — | — |
| `buyer_phone` | TEXT | — | — |
| `purchase_date` | TEXT | — | YYYY-MM-DD |
| `sale_date` | TEXT | — | — |
| `delivery_date` | TEXT | — | — |
| `first_payment_date` | TEXT | — | — |
| `purchase_time` | TEXT | — | HH:MM |
| `sale_time` | TEXT | — | HH:MM |
| `creation_token` | TEXT | UNIQUE partial | v34 — idempotency |

**Triggers (v36):**
- `trg_cars_status_check` — يرفض `status` غير قانوني عند INSERT.
- `trg_cars_status_update_check` — نفس الشيء عند UPDATE.
- `trg_cars_no_double_sell` — يرفض `UPDATE cars SET status='مبيوعة' WHERE status='مبيوعة'`.

### 2.2 `car_expenses` — مصروفات السيارة

| العمود | النوع | القيد |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `car_number` | TEXT | NOT NULL — **FK** إلى `cars.car_number` (عبر trigger من v36) |
| `description` | TEXT | NOT NULL |
| `amount` | TEXT | NOT NULL (Decimal كنص) |
| `date` | TEXT | NOT NULL |
| `currency` | TEXT | DEFAULT 'IQD' |
| `time` | TEXT | DEFAULT strftime('%H:%M', 'now', 'localtime') |
| `creation_token` | TEXT | UNIQUE partial (v34) |

**Triggers (v36):**
- `trg_car_expenses_fk_car_number` — يرفض INSERT لـcar_number غير موجود.
- `trg_car_expenses_fk_car_number_update` — نفس الشيء عند UPDATE.

### 2.3 `car_partners` — شركاء السيارة

| العمود | النوع |
|---|---|
| `car_number` | TEXT NOT NULL |
| `partner_name` | TEXT NOT NULL |
| `amount` | TEXT NOT NULL |
| `currency` | TEXT NOT NULL DEFAULT 'IQD' |
| `kind` | TEXT NOT NULL DEFAULT 'شريك' |
| **PRIMARY KEY** | (car_number, partner_name) |

### 2.4 `partners` — الشركاء

| العمود | النوع | القيد |
|---|---|---|
| `partner_name` | TEXT | NOT NULL |
| `phone` | TEXT | — |
| `total_amount` | TEXT | DEFAULT '0' |
| `kind` | TEXT | NOT NULL DEFAULT 'شريك' ('شريك'/'مستثمر'/'ممول'/'زبون'/'وكالة'/'شركة') |
| **PRIMARY KEY** | (partner_name, kind) | — |

### 2.5 `partner_transactions` — حركات الشركاء

| العمود | النوع | القيد |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `partner_name` | TEXT | NOT NULL |
| `kind` | TEXT | NOT NULL DEFAULT 'شريك' |
| `type` | TEXT | NOT NULL (نص عربي مثل "ايداع", "سحب") |
| `amount` | TEXT | NOT NULL (Decimal) |
| `date` | TEXT | NOT NULL |
| `notes` | TEXT | — |
| `currency` | TEXT | DEFAULT 'IQD' — CHECK trigger من v36 (IQD/USD فقط) |
| `payment_type` | TEXT | DEFAULT 'قاصه' |
| `affects_partner_cash` | INTEGER | CHECK trigger من v36 (0 أو 1 فقط) |
| `affects_qasa` | INTEGER | — |
| `original_amount` | TEXT | — |
| `current_amount` | TEXT | — |
| `actual_paid_amount` | TEXT | — |
| `paid_event_id` | INTEGER | — |
| `due_date` | TEXT | — |
| `ledger_batch_id` | TEXT | — |
| `creation_token` | TEXT | UNIQUE partial (v34) |

### 2.6 `cash_register` — الكاش

| العمود | النوع |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `date` | TEXT NOT NULL |
| `time` | TEXT DEFAULT '00:00' |
| `type` | TEXT NOT NULL |
| `amount` | TEXT NOT NULL |
| `description` | TEXT |
| `notes` | TEXT |

### 2.7 `expenses` — المصروفات العامة

| العمود | النوع |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `description` | TEXT NOT NULL |
| `amount` | TEXT NOT NULL |
| `date` | TEXT NOT NULL |
| `time` | TEXT DEFAULT (strftime('%H:%M', 'now', 'localtime')) |
| `notes` | TEXT |
| `currency` | TEXT DEFAULT 'IQD' |
| `car_number` | TEXT (لربط مصروف بسيارة محددة) |
| `creation_token` | TEXT UNIQUE partial (v34) |

### 2.8 `agencies` — الوكالات

| العمود | النوع | القيد |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `old_agent_name` | TEXT | NOT NULL |
| `car_number` | TEXT | NOT NULL DEFAULT '' |
| `car_model` | TEXT | NOT NULL DEFAULT '' |
| `color` | TEXT | NOT NULL DEFAULT '' |
| `new_agent_name` | TEXT | NOT NULL |
| `phone` | TEXT | NOT NULL DEFAULT '' |
| `amount_usd` | TEXT | NOT NULL DEFAULT '0' |
| `amount_iqd` | TEXT | NOT NULL DEFAULT '0' |
| `notes` | TEXT | NOT NULL DEFAULT '' |
| `payment_status` | TEXT | NOT NULL DEFAULT 'واصل' |
| `date` | TEXT | NOT NULL |
| `time` | TEXT | NOT NULL |
| `creation_token` | TEXT | UNIQUE (v34) |
| `car_type` | TEXT | NOT NULL DEFAULT '' |

### 2.9 `agency_transactions` — حركات الوكالات

| العمود | النوع |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `agency_id` | INTEGER NOT NULL (FK → agencies.id ON DELETE CASCADE) |
| `date` | TEXT NOT NULL |
| `time` | TEXT NOT NULL DEFAULT '00:00' |
| `type_` | TEXT NOT NULL |
| `amount` | TEXT NOT NULL |
| `currency` | TEXT DEFAULT 'IQD' |
| `notes` | TEXT |
| `creation_token` | TEXT UNIQUE partial (v34) |

### 2.10 `financial_ledger` — دفتر الأستاذ (موجود)

| العمود | النوع |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `date` | TEXT |
| `time` | TEXT |
| `account_type` | TEXT ('inventory'/'cash'/'receivable'/'payable'/'investor'/'funder'/'capital'/'deferred_expense'/...) |
| `account_id` | TEXT |
| `debit` | TEXT |
| `credit` | TEXT |
| `currency` | TEXT |
| `source_type` | TEXT |
| `source_id` | TEXT |
| `description` | TEXT |
| `notes` | TEXT |
| `creation_token` | TEXT |

### 2.11 `journal_entries` — قيود محاسبية (جديد v36)

أنظر `docs/ACCOUNTING_POLICY.md` §4.1.

### 2.12 `journal_lines` — سطور القيد (جديد v36)

أنظر `docs/ACCOUNTING_POLICY.md` §4.1.

### 2.13 `idempotency_requests` — طلبات Idempotency (جديد v36)

| العمود | النوع | القيد |
|---|---|---|
| `token` | TEXT | NOT NULL PRIMARY KEY |
| `command_name` | TEXT | NOT NULL |
| `request_hash` | TEXT | NOT NULL (SHA-256 للـpayload) |
| `status` | TEXT | NOT NULL CHECK IN ('in_progress', 'completed', 'failed') |
| `result_reference` | TEXT | — (JSON reference للنتيجة) |
| `created_at` | TEXT | NOT NULL DEFAULT now |
| `completed_at` | TEXT | — |

> **ملاحظة:** الجدول منشأ لكن **لم يُكتب إليه بعد**. مذكور في REMAINING_RISKS.

### 2.14 `users` — المستخدمون

| العمود | النوع | القيد |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY |
| `username` | TEXT | UNIQUE NOT NULL |
| `password_hash` | TEXT | NOT NULL (Argon2 PHC string) |
| `display_name` | TEXT | — |
| `profile_image` | TEXT | — |
| `must_change_password` | INTEGER | NOT NULL DEFAULT 0 |
| `created_at` | TEXT | — |
| `updated_at` | TEXT | — |

### 2.15 `sessions` — الجلسات

| العمود | النوع |
|---|---|
| `token` | TEXT PRIMARY KEY |
| `user_id` | INTEGER NOT NULL (FK → users.id) |
| `created_at` | INTEGER NOT NULL (unix timestamp) |
| `expires_at` | INTEGER NOT NULL |

**Indices:** `idx_sessions_user`, `idx_sessions_expires`.

### 2.16 `login_attempts` — محاولات تسجيل الدخول

| العمود | النوع |
|---|---|
| `username` | TEXT NOT NULL |
| `attempted_at` | INTEGER NOT NULL |

**Indices:** `idx_login_attempts_username_time`.

### 2.17 `audit_log` — سجل التدقيق

| العمود | النوع |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `entity_type` | TEXT NOT NULL |
| `entity_id` | INTEGER |
| `action` | TEXT NOT NULL |
| `actor_user_id` | INTEGER |
| `session_token` | TEXT |
| `creation_token` | TEXT |
| `created_at` | TEXT NOT NULL DEFAULT now |

### 2.18 `db_version` — إصدار قاعدة البيانات

| العمود | النوع |
|---|---|
| `version` | INTEGER PRIMARY KEY |

**آخر إصدار:** 36.

## 3. الـIndices

| الاسم | الجدول | الأعمدة | الإصدار |
|---|---|---|---|
| `idx_cars_creation_token` | cars | creation_token (partial) | v34 |
| `idx_car_expenses_creation_token` | car_expenses | creation_token (partial) | v34 |
| `idx_partner_tx_creation_token` | partner_transactions | creation_token (partial) | v34 |
| `idx_agencies_creation_token` | agencies | creation_token | v1+ |
| `idx_agency_tx_creation_token` | agency_transactions | creation_token (partial) | v34 |
| `idx_expenses_creation_token` | expenses | creation_token (partial) | v34 |
| `idx_sessions_user` | sessions | user_id | v32 |
| `idx_sessions_expires` | sessions | expires_at | v32 |
| `idx_login_attempts_username_time` | login_attempts | username, attempted_at | v32 |
| `idx_journal_entries_source` | journal_entries | source_type, source_id | v36 |
| `idx_journal_entries_creation_token` | journal_entries | creation_token (partial UNIQUE) | v36 |
| `idx_journal_lines_entry` | journal_lines | journal_entry_id | v36 |
| `idx_journal_lines_account` | journal_lines | account | v36 |
| `idx_idempotency_command_status` | idempotency_requests | command_name, status | v36 |

## 4. الـTriggers (v36)

| الاسم | الجدول | الحدث | الوظيفة |
|---|---|---|---|
| `trg_partner_tx_affects_partner_cash_check` | partner_transactions | BEFORE INSERT | يرفض affects_partner_cash ∉ {0,1} |
| `trg_partner_tx_affects_partner_cash_update_check` | partner_transactions | BEFORE UPDATE OF affects_partner_cash | نفس الشيء |
| `trg_partner_tx_currency_check` | partner_transactions | BEFORE INSERT | يرفض currency ∉ {IQD, USD} |
| `trg_cars_status_check` | cars | BEFORE INSERT | يرفض status ∉ {متوفرة, مبيوعة, محذوفة} |
| `trg_cars_status_update_check` | cars | BEFORE UPDATE OF status | نفس الشيء |
| `trg_cars_no_double_sell` | cars | BEFORE UPDATE OF status | يرفض إعادة بيع سيارة مبيوعة بدون عكس |
| `trg_car_expenses_fk_car_number` | car_expenses | BEFORE INSERT | يرفض car_number غير موجود في cars |
| `trg_car_expenses_fk_car_number_update` | car_expenses | BEFORE UPDATE OF car_number | نفس الشيء |
