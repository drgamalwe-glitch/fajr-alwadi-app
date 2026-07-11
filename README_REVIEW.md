# مراجعة جنائية شاملة — ملاحظات التسليم (الجولة الثانية)

## قاعدة بيانات الإنتاج

تم حذف `src-tauri/fjr_alwadi_data.db` من ملف ZIP لأنها قاعدة بيانات إنتاج
تحتوي على بيانات حساسة. ضع نسختك الأصلية في `src-tauri/` لاستعادة الفحوصات.

## التحديثات الجديدة (الجولة الثانية)

### قواعد جديدة في Instructions.md §31:

1. **§31.1 التصميم المبني على المُعرِّفات**: كل كيان يُحدَّد بمُعرِّف رقمي فريد.
2. **§31.2 رموز Idempotency**: كل عملية إنشاء تقبل `creation_token` (UUID).
3. **§31.3 السماح بتكرار الشاصي**: نفس السيارة يمكن شراؤها/بيعها مرات متعددة.
4. **§31.4 وكالات النقد vs الآجل**:
   - نقدية (واصل): ربح + كاش فوراً.
   - آجلة (غير واصل): لا ربح حتى الاستلام.
5. **§31.5 منع الإضافة المكررة**: اكتشاف المكرر بـ `creation_token` أو بيانات متطابقة.
6. **§31.6 اكتمال البيانات الوصفية**: كل صف له `source_type`/`source_id`/`source_role`.

### تعديلات كود Rust (lib.rs):

- `distribute_agency_partner_effects`: أرباح الوكالة الآجلة لا تُحتسب حتى الاستلام.
- `ensure_unique_chassis`: السماح بتكرار الشاصي.
- `record_agency_ledger_entries`: استخدام `deferred_revenue` للوكالات الآجلة.
- إضافة الترتيب v33 لإسقاط القيد الفريد على الشاصي.

### اختبارات جديدة:

- `scripts/test_agency_cash_vs_credit.py` — 24 تأكيداً.
- `scripts/test_duplicate_prevention.py` — 16 تأكيداً.
- `scripts/test_comprehensive_scenarios.py` — 186 سيناريو شامل.
- `test/frontend/idempotency.test.ts` — 26 اختباراً TypeScript.
- فحصان جديدان في `accounting_audit.py`: [82] + [83].

## تشغيل جميع الاختبارات

```bash
# Frontend
npm install
npm run test           # 46 اختبار TypeScript
npm run typecheck

# Backend / DB / Accounting (Python)
python3 scripts/check_rust_structure.py
python3 scripts/accounting_runtime_scenarios.py
python3 scripts/check_installment_profit.py
python3 scripts/runtime_test.py
python3 scripts/smoke_test_real_db.py
python3 scripts/accounting_audit.py src-tauri/fjr_alwadi_data.db
python3 scripts/test_migration_v32_orphan_cleanup.py
python3 scripts/test_agency_cash_vs_credit.py        # جديد
python3 scripts/test_duplicate_prevention.py          # جديد
python3 scripts/test_comprehensive_scenarios.py       # جديد (196 سيناريو)
python3 scripts/test_vin_integrity.py src-tauri/fjr_alwadi_data.db
python3 scripts/test_session_gate.py src-tauri/fjr_alwadi_data.db
```

## الاختبارات التي تتطلب Rust/Cargo

```bash
cd src-tauri && cargo test --features accounting-test-support
cd src-tauri && cargo test --features accounting-test-support --test migration_v32_prod -- --ignored
```

## تقرير المراجعة الكامل

راجع `final.md` للحصول على التقرير الكامل باللغة العربية.
