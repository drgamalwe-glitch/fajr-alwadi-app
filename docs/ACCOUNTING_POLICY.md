# ACCOUNTING POLICY — السياسة المحاسبية لنظام فجر الوادي

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** تم تحديث هذا الملف ليعكس الإصلاحات الجذرية السبعة.

## 1. مبادئ عامة

### 1.1 الدقة المالية

- **ممنوع** استخدام `f64` أو JavaScript Number في الحسابات المالية الحساسة.
- **مطلوب** استخدام `rust_decimal::Decimal` في Rust و `decimal.js` في TypeScript.
- JSON يحمل المبالغ كـ**string**، لا كـnumber.
- `Money::deserialize` يرفض `visit_f64` بشكل قاطع (انظر الاختبار `test_money_deserialization_rejects_json_float`).
- الحد الأقصى للمبلغ: `MAX_FINANCIAL_AMOUNT = 1,000,000,000,000` (ترليون).

### 1.2 فصل العملات

| العملة | Scale (منازل عشرية) | المصدر |
|---|---|---|
| IQD (دينار عراقي) | 0 | `currency_scale("IQD")` → `Ok(0)` |
| USD (دولار أمريكي) | 2 | `currency_scale("USD")` → `Ok(2)` |
| أي عملة أخرى | مرفوضة | `currency_scale(other)` → `Err(...)` |

- `formatMoney` في الواجهة يجب أن يطابق `currency_scale` (IQD=0, USD=2).
- Migration 36 يضيف CHECK trigger يرفض أي عملة غير IQD/USD في `partner_transactions`.

## 2. تقسيم الشريكين 50/50

### 2.1 السياسة المطبقة

```rust
pub fn split_partner_amount_50_by_currency(amount: Decimal, currency: &str) -> (Decimal, Decimal)
```

- يقسم المبلغ على 2 مع التقريب بالاستراتيجية `RoundingStrategy::ToZero` عند المنازل العشرية المحددة بواسطة `currency_scale`.
- الباقي (وحد صغير واحد على الأكثر) يذهب دائماً إلى **الشريك الأول**.
- النتيجة **حتمية** (deterministic) — إعادة تشغيل نفس التقسيم تعطي نفس الناتج.
- **Invariant:** `partner1_share + partner2_share == amount` (دائماً، بلا استثناء).

### 2.2 الاختبارات

- `test_critical_4_split_50_50_preserves_total_for_usd_fractions` — حالات صريحة.
- `test_critical_4_split_50_50_property_test` — sweep على 200,001 قيمة لكل عملة.
- `test_critical_4_currency_scale_rejects_unknown_currencies` — فشل مغلق للعملات غير المعروفة.
- `test_critical_4_legacy_split_entry_point_still_works` — توافق مع الإصدارات السابقة.

### 2.3 السلوك السابق (الخطأ)

كان `split_partner_amount_50` يستخدم `round_dp_with_strategy(0, ...)` لكل العملات. لـUSD الكسرية، كان هذا يضيع السنتات:
- `$10.03` → `($5, $5)` بدلاً من `($5.02, $5.01)` — ضياع `$0.03`.

## 3. الإيراد المؤجل للوكالات الآجلة

### 3.1 القاعدة

> الوكالات الآجلة (التي لم يصل دفعها بعد) **لا يعترف بربحها** حتى التحصيل الفعلي.

- المصدر: `Instructions.md` §31 (القاعدة الأحدث).
- الإيراد المؤجل = الربح غير المعترف به من الأقساط/الوكالات الآجلة.
- الدالة: `calculate_deferred_revenue_from_unrecognized_profit(&db)`.

### 3.2 الاختبارات

- اختبار `test_agency_cash_vs_credit` (في scripts) — يفصل الوكالات النقدية عن الآجلة.
- اختبار رفض الاعتراف بالربح قبل التحصيل.

## 4. القيود المحاسبية

### 4.1 الهيكل (Migration 36)

```sql
CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('IQD', 'USD')),
    memo TEXT,
    actor_id INTEGER,
    creation_token TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_entry_id INTEGER NOT NULL,
    account TEXT NOT NULL,
    debit TEXT NOT NULL DEFAULT '0',
    credit TEXT NOT NULL DEFAULT '0',
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
    CHECK (CAST(debit AS REAL) >= 0 AND CAST(credit AS REAL) >= 0),
    CHECK (NOT (CAST(debit AS REAL) > 0 AND CAST(credit AS REAL) > 0))
);
```

### 4.2 Invariants

- مجموع المدين = مجموع الدائن لكل قيد ولكل عملة.
- لا يوجد سطر مدين ودائن معاً (CHECK trigger).
- كل قيد له `source_type` و `source_id` لربطه بالعملية الأصلية.
- الإلغاء ينشئ قيداً عكسياً ولا يحذف التاريخ المحاسبي.

### 4.3 حالة الانتقال (Transitional State)

- `financial_ledger` لا يزال يستخدم كـsource of truth للقراءة.
- `journal_entries`/`journal_lines` تم إنشاؤهما (Migration 36) لكن **لم يكتب إليهما بعد**.
- الكود المستقبلي يجب أن يكتب إلى **كلا** الجدولين خلال فترة الانتقال، ثم يتم إيقاف `financial_ledger`.

## 5. حسابات حالة الشركة (get_company_status)

### 5.1 الإصلاح الجذري (CRITICAL-3)

- **لا** تستدعي `get_financial_summary` من داخل `get_company_status` (تجنب deadlock).
- تستخدم `borrower_balance_for_currency` لأنواع: ممول/شركة/زبون/وكالة.
- تستخدم SQL مباشرة مع sign convention صحيح لـمستثمر.
- لا تعتمد على `affects_partner_cash` لأنواع غير الشريك.

### 5.2 الصيغة

```
company_value = cash + inventory + receivables - liabilities
shared_capital = (inventory + receivables - liabilities) / 2
partner.capital = partner.iqd_balance + shared_capital_iqd (وUSD بالتوازي)
```

## 6. ممنوعات محاسبية (مذكورة في §6 من التقرير)

- ممنوع الاعتماد على Prefix عربي مثل `LIKE 'ايداع%'` للاستدلال على نوع الحركة. **ملاحظة**: الكود الحالي لا يزال يستخدمها في `get_financial_summary` و `get_partners_totals` — هذه مخاطرة معروفة مذكورة في `REMAINING_RISKS.md`.
- ممنوع وجود صيغ متعددة للربح موزعة بين React و SQL و reports.
- ممنوع استخدام Float أو JavaScript Number في حساب مالي.

## 7. سقف الربح للأقساط

- ربح الأقساط **لا يتجاوز** الربح الكامل للبيع.
- الاختبار: `check_installment_profit.py` (في scripts/).
- الدالة: `check_and_distribute_installment_profits`.

## 8. الخسائر

- الخسارة يجب أن تبقى **سالبة** دائماً في العرض والحساب.
- `formatMoney` يحافظ على الإشارة.
- تقسيم الخسارة 50/50 يستخدم نفس `split_partner_amount_50_by_currency` مع مبالغ سالبة.

## 9. العملات المختلطة

- ممنوع بيع سيارة بعملة مختلفة عن عملة الشراء بدون سعر صرف مثبت (تتحقق `add_car`).
- القيود المحاسبية تفصل العملات: لا تجمع IQD مع USD في نفس القيد.
- `journal_entries` يحتوي على `currency` واحد لكل قيد.
