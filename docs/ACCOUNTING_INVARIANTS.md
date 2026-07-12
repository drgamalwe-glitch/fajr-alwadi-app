# الثوابت المحاسبية الإلزامية (Accounting Invariants)

> هذه الوثيقة توثّق الثوابت المحاسبية الإلزامية الـ20 من المرحلة السادسة §11.5 من البرومبت الأصلي. كل ثابت له: النص العربي، المرجع من `Instructions.md`, الدالة/المسار الذي يطبّقه، والاختبار الذي يغطيه (إن وُجد). الهدف هو أن تكون هذه الوثيقة المرجع الأوّل عند مراجعة أي تغيير محاسبي.

## الثوابت الـ20

### 1. توازن دفتر الأستاذ (Debit = Credit)

**النص**: لكل عملة، `SUM(debit) == SUM(credit)` في `financial_ledger`. لا توجد قيود أحادية الجانب.

**المرجع**: §3 (Cash Movement vs Profit Recognition), §28 (Final Acceptance — ضمنًا).

**التطبيق**: `validate_ledger_amounts(debit, credit)` يرفض أي قيد بـ `debit > 0 AND credit > 0` (يجب أن يكون أحد الطرفين صفرًا في كل قيد ثنائي). كل قيد يُكتب عبر `record_ledger_entry` الذي يأخذ `debit: Money, credit: Money`. كل عملية محاسبية تكتب قيدين متوازنين (مثلًا `Dr cash 5M / Cr receivable 5M` + `Dr deferred_revenue 2.5M / Cr revenue 2.5M`).

**الاختبار**: `test_instructions_section_22_cash_sale_no_double_count` (السطر 18864) — يتحقق من `(debit_iqd - credit_iqd).abs() < 0.01` بعد بيع نقدي. `test_instructions_section_24_1_cash_car_loss_must_reduce_net_profit` (السطر 19004) — نفس الفحص بعد خسارة.

### 2. لا ازدواج في احتساب القيمة (No Double Counting)

**النص**: نفس الحدث المحاسبي قد يظهر في عدة شاشات للعرض، لكن يجب ألا يُحسب أكثر من مرة.

**المرجع**: §1.2 (No Double Counting), §28.5, §28.6, §28.14.

**التطبيق**: الأعلام `affects_qasa`, `affects_partner_cash`, `affects_profit` تميّز كل صف. كل قراءة (Qasa/Cash/Profit) تستخدم هذه الأعلام كفلاتر، فلا يمكن للصف الواحد أن يُحسب في بطاقتين مختلفتين إلا إذا كان يحمل علميهما صراحة (وهذا نادر ومقصود — مثلًا `cash_movement` يحمل `affects_qasa=1, affects_partner_cash=1` لكنه لا يحمل `affects_profit=1`).

**الاختبار**: `test_profit_summary_uses_affects_profit_source_rows` (السطر 18287) — يتحقق أن بطاقة الربح تقرأ فقط `affects_profit=1` rows، لا `cash_movement` rows.

### 3. Cash ≠ Profit (الربح لا يخلق كاشًا)

**النص**: اعتراف الربح لا يُنشئ حركة كاش جديدة. حركة الكash شيء، واعتراف الربح شيء آخر.

**المرجع**: §3.1, §3.2, §3.3 (Critical Example), §28.5, §28.6.

**التطبيق**: كل دفعة زبون تُنشئ صفّين: `cash_movement` (`affects_qasa=1, affects_partner_cash=1, affects_profit=0`) و`profit_recognition` (`affects_qasa=0, affects_partner_cash=0, affects_profit=1`). الـ cash_movement يزيد Qasa/Cash بمبلغ الدفعة. الـ profit_recognition يزيد الربح بمبلغ الربح فقط. لا يُضاف الربح إلى Qasa/Cash مرة ثانية.

**الاختبار**: `test_instructions_section_22_cash_sale_no_double_count` — يتحقق أن `cash_debit == 20_000_000` (سعر البيع) وليس `30_000_000` (سعر البيع + الربح). `test_installment_payment_profit_recognition_and_reverse` (السطر 17870).

### 4. Cash Car Sale = Cash == Profit (للربح الموجب)

**النص**: في البيع النقدي بدون مصاريف، الربح المُعترف به = سعر البيع − سعر الشراء، والكاش المُستلم = سعر البيع. لا يُضاف الربح إلى الكاش.

**المرجع**: §9 (Cash Car Sales), §22 (Required Test Scenario: Cash Sale), §30.1 (Cash Movement + Signed Profit Recognition Rows).

**التطبيق**: `rebuild_cash_sale_profit_recognition(car_number)` يُنشئ صفّي `profit_recognition` للشريكين بـ `amount = (selling_price - purchase_price - car_expenses) / 2`. الـ cash_movement موجود مسبقًا في صفوف البيع. الربح موجب للربح وسالب للخسارة (§30.1).

**الاختبار**: `test_instructions_section_22_cash_sale_no_double_count` — `total_profit == 10_000_000`, كل شريك `5_000_000`, `cash_debit == 20_000_000`, `profit_iqd == 10_000_000` في `calculate_analytical_profit`.

### 5. Cash Car Loss Must Reduce Net Profit (الخسارة لا تُتجاهل)

**النص**: إن بِيعت السيارة بأقل من تكلفتها، الخسارة (ربح سالب) يجب أن تخصم من صافي الربح. لا يجوز تجاهلها بصمت.

**المرجع**: §24.1 (Required Test Scenario: Cash Car Loss), §5 ("Losses must reduce net profit"), §30.1 (Signed Profit Recognition).

**التطبيق**: `rebuild_cash_sale_profit_recognition` يكتب صفوف `profit_recognition` بمبالغ سالبة للخسارة (مثلًا `-1,500,000` لكل شريك). `record_car_sale_ledger_entries` يستخدم `Dr expense "خسارة بيع سيارة"` بدلًا من `Cr deferred_revenue`. `calculate_analytical_profit` يجمع هذه القيم السالبة فيصبح الربح الصافي أقل.

**الاختبار**: `test_instructions_section_24_1_cash_car_loss_must_reduce_net_profit` — `total_profit == -3_000_000`, كل شريك `-1_500_000`, `cash_debit == 8_000_000` (سعر البيع الفعلي), `profit_iqd == -3_000_000` في `calculate_analytical_profit`.

### 6. Installment Profit Cap (لا يتجاوز ربح السيارة الكامل)

**النص**: مجموع الربح المُعترف به من كل دفعات الأقساط لا يتجاوز ربح السيارة الكامل (`selling_price - purchase_price - car_expenses`).

**المرجع**: §7.4 (Profit Cap), §28.7.

**التطبيق**: `calculate_customer_payment_profit` يحسب `raw_profit = payment_amount * profit_ratio`, ثم `remaining = full_profit - already_recognized`, ثم `recognized = min(raw_profit, remaining)`. إن كان `remaining <= 0`, لا يُعترف بمزيد من الربح.

**الاختبار**: `test_installment_profit_never_exceeds_full_profit` (السطر 17389) — يحاكي 16 دفعة (مقدمة 5M + 15 قسط 1M)، يتحقق أن `total_recognized <= full_profit` في كل خطوة و`total_recognized == full_profit` في النهاية.

### 7. Last Installment Doesn't Re-create Full Profit

**النص**: القسط الأخير لا يُنشئ ربح السيارة الكامل مرة ثانية. يعترف فقط بربح القسط نفسه (المتبقي من الـ cap).

**المرجع**: §7.3 (Last Installment), §28.8.

**التطبيق**: نفس منطق `calculate_customer_payment_profit` — الـ cap يضمن عدم الاعتراف بأكثر من المتبقي.

**الاختبار**: `test_event_installment_last_installment_rules` (السطر 18017), `test_installment_profit_never_exceeds_full_profit`.

### 8. Down Payment Gets Same Two-Effect Treatment

**النص**: مقدمة البيع (`sale_down_payment`) تحصل على نفس معالجة الدفعة العادية: cash_movement + profit_recognition.

**المرجع**: §7.1 (At Sale Time), §30.2 (Down Payment — Full Two-Effect Treatment), §30.8 (Down Payment Cap — Must Include Existing Down Payments).

**التطبيق**: `apply_partner_transaction_splits` يكتشف النوع `"مقدمة"` ويستدعي `create_customer_payment_accounting_effects` التي تنشئ نفس الصفّين. تحقق cap: `new_amount + paid_installments + existing_down_payments <= selling_price` (§30.8).

**الاختبار**: `test_sale_down_payment_customer_row_does_not_double_cash_ledger` (السطر 18198), `test_due_delivery_date_survives_payment_when_first_payment_date_is_blank` (السطر 17585).

### 9. Deferred Revenue = Unearned Profit Only (يصل إلى صفر عند اكتمال الدفعات)

**النص**: في البيع بالأقساط، حساب `deferred_revenue` في الـ ledger يحمل فقط الربح الكامل غير المُعترف به. مع كل دفعة، يُحوَّل جزء إلى `revenue`. عند اكتمال كل الدفعات، يجب أن يصل `deferred_revenue` إلى صفر.

**المرجع**: §30.10 (Deferred Revenue Ledger Account).

**التطبيق**: `record_car_sale_ledger_entries` يكتب `Cr deferred_revenue (full car profit only)`. `create_customer_payment_accounting_effects` يكتب `Dr deferred_revenue / Cr revenue` لكل دفعة. `calculate_deferred_revenue_from_unrecognized_profit` يحسب القيمة المتوقعة.

**الاختبار**: `test_deferred_revenue_becomes_zero_after_full_profit_recognition` (السطر 18569).

### 10. General Expenses Reduce Net Profit Only

**النص**: المصاريف العامة (غير مرتبطة بسيارة) تخفض صافي الربح. لا تخفض ربح سيارة معينة.

**المرجع**: §11 (General Expenses), §28.9.

**التطبيق**: `add_expense` مع `car_number IS NULL` يُدرج في `expenses` (وليس `car_expenses`) بـ `affects_qasa=1, affects_partner_cash=1, affects_profit=0`. `calculate_analytical_profit` يطرح `SUM(expenses.amount WHERE car_number IS NULL OR car_number = '')` من الربح الإجمالي.

**الاختبار**: `test_instructions_section_24_general_expense` (السطر 19345) — يتحقق أن مصروف 1M يخفض كاش الشريكين بـ 500K لكل واحد، ويخفض صافي الربح بـ 1M.

### 11. Car Expenses Are Part of Car Cost (Not Direct Net Profit Reduction)

**النص**: مصاريف السيارات جزء من تكلفة السيارة، تخفض ربح السيارة عبر التكلفة، لا تخفض الربح الصافي مباشرة، لا تُحسب مرتين.

**المرجع**: §12 (Car Expenses), §5.1 (Car Expenses Source of Truth for Cash Sales), §28.10.

**التطبيق**: `add_expense` مع `car_number` يُدرج في `car_expenses` بـ `Dr inventory / Cr cash` (لا `Dr expense`). `car_expenses_for_profit(car_number)` يحسب `SUM(car_expenses.amount WHERE car_number = ?)`. `calculate_analytical_profit` يستخدم `car_expenses` كمصدر رسمي، يقع إلى `COALESCE(expenses_at_sale, 0)` فقط للسيارات القديمة.

**الاختبار**: `test_instructions_section_23_car_expense` ضمن `accounting_test_support.rs`. `test_financier_commission_expense_uses_explicit_source` (السطر 18617).

### 12. Agency Profit Split 50/50

**النص**: ربح الوكالة يُقسَّم 50/50 بين الشريكين، مثل كل أرباح السيارات.

**المرجع**: §13 (Agencies), §28.15.

**التطبيق**: `distribute_agency_partner_effects` يستدعي `distribute_to_partners_50_with_effects` لـ `profit_recognition` و`distribute_to_partners_50_with_effects` لـ `cash_movement` (للنقدي فقط).

**الاختبار**: `test_agency_profit_directly_adds_to_net_profit` (السطر 18648), `test_unreceived_agency_defers_profit_and_cash_until_received` (السطر 18345).

### 13. Agency Profit Linked by ID (Not by Name/Date)

**النص**: أرباح الوكالات يجب أن تُربط بـ `agency_id` أو `agency_transaction_id`، لا بـ `name`/`date`/`notes`. حذف وكالة لا يحذف أرباح وكالة أخرى تحمل نفس الاسم والتاريخ.

**المرجع**: §13 (Agency Linking Rule), §19 (Ledger and Audit Rules), §20 (Editing and Deleting), §27 (Required Test Scenario: Agency), §28.11, §28.12.

**التطبيق**: `delete_agency` و`delete_agency_transaction` يستخدمان `delete_partner_transactions_by_source_with_ledger("agency", &id.to_string(), None)` الذي يطابق فقط بـ `source_type`/`source_id`، لا بـ `notes` أو `date`.

**الاختبار**: `test_agency_profit_deletion_is_scoped_by_id_not_by_name_date` (السطر 19178) — ينشئ وكالتين بنفس الأسماء والتاريخ، يحذف واحدة، يتحقق أن أرباح الأخرى ما زالت موجودة.

### 14. Read-Only Functions Never Write to Database

**النص**: الدوال التي تقرأ فقط (`get_financial_summary`, `get_cash_register_entries`, `get_profit_distribution_summary`, `get_partners_totals`, `get_unified_accounts`, `get_partner_transactions`, `get_cars`) يجب ألا تنشئ أو تعدّل أو تحذف أو تعكس أو تعيد بناء سجلات محاسبية.

**المرجع**: §1.3 (Read-Only Means Read-Only), §28.13.

**التطبيق**: هذه الدوال تستخدم `state.db.lock()` مباشرة (بدون `transaction()`) وكل استعلاماتها `SELECT`. لا تستدعي `recalculate_all_partners`, `rebuild_*`, `migrate_*`, `INSERT`, `UPDATE`, `DELETE`.

**الاختبار**: لا يوجد اختبار صريح في `lib.rs` يتحقق من هذا، لكن `scripts/accounting_audit.py` يفحص أن دوال القراءة لا تغيّر hash قاعدة البيانات قبل/بعد استدعائها.

### 15. Two Fixed Partners, 50/50 Split

**النص**: النظام فيه شريكان فقط، ثابتان في الكود (`'أمير'` و`'منتصر'`). كل حصة ربح/خسارة/كاش/تكلفة تُقسَّم 50/50.

**المرجع**: §1.1 (Partners), §30.4 (Fixed Two Partners), §30.11 (Deterministic 50/50 Split Remainder).

**التطبيق**: `split_partner_amount_50(amount) -> (Decimal, Decimal)` — يقسّم بـ 2. إن كان المبلغ فرديًا (لا يقبل القسمة على 2)، الباقي (وحدة واحدة فقط) يذهب للشريك الأول ترتيبًا أبجديًا (`'أمير'` قبل `'منتصر'`). هذا يضمن حتمية إعادة البناء.

**الاختبار**: `test_distribute_to_partners_50_even` (السطر 17079), `test_distribute_to_partners_50_odd` (السطر 17087), `test_distribute_to_partners_50_zero` (السطر 17104), `test_distribute_to_partners_50_negative` (السطر 17111), `test_instructions_section_22_cash_sale_no_double_count` (يتحقق من تقسيم 10M إلى 5M/5M).

### 16. Money Is Text (Precision Preservation)

**النص**: كل المبالغ تُخزَّن كـ `TEXT` في SQLite (وليس `REAL`) لمنع فقدان الدقة. التسلسل عبر JSON يكون كنص (string) أيضًا، لا كـ float.

**المرجع**: v20 (Migration), Money type in lib.rs.

**التطبيق**: `Money(pub Decimal)` type. `impl Serialize for Money` يكتب القيمة كـ string. `impl FromSql for Money` يقرأ من `TEXT`. `migrate_all_money_columns_to_text` (v20) يحوّل كل الأعمدة من `REAL` إلى `TEXT` مع `CAST(... AS TEXT)` للحفاظ على القيم. الـ frontend في `tauri.ts` يمرر `Money` كنص عبر `serializeTauriMoneyArgs` ويمنع تحويلها إلى JS number.

**الاختبار**: `test_money_arithmetic`, `test_money_zero_is_zero`, `test_money_abs`, `test_money_serialization_roundtrip`, `test_money_serialization_large_amount` (يتحقق من `9999999999999.99` دون فقدان دقة), `test_money_deserialization_rejects_json_float` (يرفض `12345.67` كـ float، يقبل `"12345.67"` كـ string), `test_money_columns_migrate_to_text_affinity`, `test_money_migration_preserves_expression_defaults`.

### 17. Qasa Tab = Qasa Card

**النص**: تبويب Qasa في الواجهة يساوي بطاقة Qasa في الـ Dashboard. كلاهما يستخدم `affects_qasa = 1 AND kind IN ('شريك', 'مستثمر')`.

**المرجع**: §2.1, §17.1 (Qasa Card), §28.1, §30.6.

**التطبيق**: `get_financial_summary` و`get_cash_register_entries` يستخدمان نفس الفلاتر. كلاهما يقرأ من `partner_transactions WHERE affects_qasa = 1 AND kind IN ('شريك', 'مستثمر')`.

**الاختبار**: `test_instructions_section_22_cash_sale_no_double_count` يفحص `cash_debit == selling_price` (يغطي Qasa بشكل ضمني).

### 18. Cash Tab = Cash Card (Partners Only, No Investors)

**النص**: تبويب Cash (داخل Qasa) = حركات الشركاء فقط (`affects_partner_cash = 1 AND kind = 'شريك'`). لا يشمل المستثمرين.

**المرجع**: §2.2, §17.2 (Cash Card), §28.2, §28.4, §30.6.

**التطبيق**: `get_financial_summary` و`get_cash_register_entries` يستخدمان `affects_partner_cash = 1 AND kind = 'شريك'` للتبويب Cash. حركات المستثمرين تحمل `affects_qasa = 1, affects_partner_cash = 0` فلا تظهر هنا.

**الاختبار**: `test_instructions_section_25_investor` (السطر 19526) — يتحقق أن إيداع مستثمر 10M يزيد Qasa ولا يزيد Cash.

### 19. Funders and Companies Don't Appear in Qasa/Cash

**النص**: حركات الممولين والشركات لا تظهر في Qasa أو Cash. فقط التسديد من كاش الشركاء يظهر (كحركة شريك منفصلة).

**المرجع**: §15 (Funders), §16 (Companies), §28.3.

**التطبيق**: حركات الممول/الشركة بـ `source_type='funder_transaction'`/`'company_transaction'` و`source_role='account_movement'` تحمل `affects_qasa=0, affects_partner_cash=0`. التسديد من الكاش (`pay_financier_from_partners`) يُنشئ صفًا منفصلًا بـ `source_type='funder_payment'`/`'company_payment'`, `source_role='partner_cash_payment'`, `affects_qasa=1, affects_partner_cash=1`.

**الاختبار**: `test_instructions_section_26_funder_repayment` (السطر 19690) — يتحقق أن تمويل الممول 10M لا يخفض كاش الشريك ولا يغيّر Qasa، لكن تسديد الممول 10M من الكاش يخفض كاش الشريكين بـ 5M لكل واحد.

### 20. Customer Balance Zero After All Installments Paid

**النص**: عند سداد كل الأقساط، رصيد الزبون يصبح صفرًا. لا يبقى مدينًا بعد سداد كل شيء.

**المرجع**: §10.3 (Fully Paid Customer), §28 (ضمنيًا).

**التطبيق**: عند دفع كل الأقساط، صفوف `باقي قسط` تتحول إلى `واصل قسط`. `customer_balance_for_currency` يحسب الرصيد من صفوف `kind='زبون'` — صفوف `باقي` تزيد الرصيد، صفوف `واصل`/`تسديد`/`ايداع`/`مقدمة` تخفضه. بعد كل السداد، يجب أن يكون المجموع صفرًا. **إصلاح مهم** (Bug 2 في `final.md`): كان قارئ الرصيد يحتسب صف الدفع الحدثي `customer_payment` مرة ثانية بعد تحويل القسط إلى `واصل`، فينتج رصيد سالب `-6,000,000` بدل `0`. الإصلاح: استبعاد صفوف `source_type='customer_payment', source_role='customer_payment', related_source_type='car'` من خصم الرصيد، مع إبقاء `customer_transaction` اليدوي محتسبًا.

**الاختبار**: `test_customer_balance_zero_after_all_event_installments_paid` (السطر 17742) — يتحقق أن الرصيد الكلي والجزئي = 0 بعد سداد كل الأقساط. `test_manual_customer_payment_still_reduces_balance` (السطر 17776) — اختبار الحماية: الدفعات اليدوية تستمر بخفض الرصيد (6,000,000 مستحق − 1,000,000 دفعة يدوية = 5,000,000).

---

## ملخص التغطية

| #  | الثابت                                                | الاختبار الرئيسي                                                                                                                  |
| -- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Debit = Credit                                       | `test_instructions_section_22_cash_sale_no_double_count`, `test_instructions_section_24_1_cash_car_loss_must_reduce_net_profit` |
| 2  | No Double Counting                                   | `test_profit_summary_uses_affects_profit_source_rows`                                                                            |
| 3  | Cash ≠ Profit                                        | `test_instructions_section_22_cash_sale_no_double_count`, `test_installment_payment_profit_recognition_and_reverse`              |
| 4  | Cash Car Sale = Cash == Profit (موجب)                 | `test_instructions_section_22_cash_sale_no_double_count`                                                                         |
| 5  | Cash Car Loss Reduces Net Profit                     | `test_instructions_section_24_1_cash_car_loss_must_reduce_net_profit`                                                            |
| 6  | Installment Profit Cap                               | `test_installment_profit_never_exceeds_full_profit`                                                                              |
| 7  | Last Installment ≠ Full Profit                       | `test_event_installment_last_installment_rules`                                                                                  |
| 8  | Down Payment Two-Effect Treatment                    | `test_sale_down_payment_customer_row_does_not_double_cash_ledger`                                                                |
| 9  | Deferred Revenue → Zero                              | `test_deferred_revenue_becomes_zero_after_full_profit_recognition`                                                               |
| 10 | General Expenses Reduce Net Profit                   | `test_instructions_section_24_general_expense`                                                                                   |
| 11 | Car Expenses = Car Cost                              | `test_instructions_section_23_car_expense`, `test_financier_commission_expense_uses_explicit_source`                             |
| 12 | Agency Profit 50/50                                  | `test_agency_profit_directly_adds_to_net_profit`, `test_unreceived_agency_defers_profit_and_cash_until_received`                 |
| 13 | Agency Profit Linked by ID                           | `test_agency_profit_deletion_is_scoped_by_id_not_by_name_date`                                                                   |
| 14 | Read-Only Never Writes                               | `scripts/accounting_audit.py` (لا يوجد `#[test]` صريح)                                                                            |
| 15 | Two Fixed Partners, 50/50                            | `test_distribute_to_partners_50_*` (4 اختبارات), `test_instructions_section_22_cash_sale_no_double_count`                       |
| 16 | Money Is Text (Precision)                            | `test_money_*` (7 اختبارات), `test_money_columns_migrate_to_text_affinity`                                                       |
| 17 | Qasa Tab = Qasa Card                                 | `test_instructions_section_22_cash_sale_no_double_count` (ضمنيًا)                                                                  |
| 18 | Cash Tab = Cash Card (No Investors)                  | `test_instructions_section_25_investor`                                                                                          |
| 19 | Funders/Companies Not in Qasa/Cash                   | `test_instructions_section_26_funder_repayment`                                                                                  |
| 20 | Customer Balance Zero After Full Payment             | `test_customer_balance_zero_after_all_event_installments_paid`, `test_manual_customer_payment_still_reduces_balance`             |

## مخاطر التغطية

- **الثابت 14** (Read-Only Never Writes) لا يوجد له `#[test]` صريح في `lib.rs`. التحقق يتم عبر `scripts/accounting_audit.py` الذي يقارن hash قاعدة البيانات قبل/بعد استدعاء دوال القراءة. إن تعطّل السكربت أو تغيّر، فقد لا يُكتشف انتهاك هذا الثابت. التوصية: إضافة `#[test] fn test_read_only_functions_dont_write()` يفتح قاعدة بيانات في الذاكرة، يستدعي كل دوال القراءة، ويتحقق من `PRAGMA data_version` لم يتغير.
- **الثوابت 17 و 18** (Qasa/Cash tabs = cards) مغطاة بشكل ضمني فقط. التوصية: إضافة اختبار صريح يُنشئ سيارة، يبيعها نقدي، ثم يستدعي `get_financial_summary` و`get_cash_register_entries` ويتحقق من تطابق القيم.
- **التغطية الشاملة**: حسب `final.md`، Rust coverage = 37.54% regions, 26.38% functions, 45.14% lines. هذا أقل من المستهدف. مسارات الأخطاء (error paths) في أوامر Tauri غير منفذة جيدًا بالاختبارات.

## مراجع

- `Instructions.md` — المصدر #1, خاصة §1.1, §1.2, §1.3, §3, §5, §6, §7, §9, §11, §12, §13, §17, §19, §20, §22, §24, §24.1, §25, §26, §27, §28, §30, §31.
- `final.md` — تقرير التدقيق, يوثّق الأخطاء التسعة المعالجة وكل اختبار مرتبط.
- `src-tauri/src/lib.rs` — الكود الإنتاجي, خاصة `#[cfg(test)] mod strict_accounting_invariants` (الأسطر 17074–20093).
- `src-tauri/src/accounting_test_support.rs` — حاضنة الاختبارات (`reset_to_two_test_partners`, `apply_full_scenario_71`, إلخ).
- `test/accounting/oracle/` — اختبارات Vitest الـ 53 (Accounting Oracle).
- `test/frontend/idempotency.test.ts` — اختبارات Frontend لـ `IdempotencyGuard`.
- `scripts/accounting_audit.py` — سكربت Python يفحص سلامة قاعدة البيانات (يغطي الثابت 14 بشكل ضمني).
