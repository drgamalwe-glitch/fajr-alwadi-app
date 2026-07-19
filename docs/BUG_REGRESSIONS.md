# BUG REGRESSIONS — سجل الإصلاحات ومنع الرجوع

> آخر تحقق فعلي: 2026-07-15. المسارات أدناه مغطاة باختبارات Rust/SQLite حقيقية ضمن `cargo test --all-features`.

## المسارات المحاسبية الحرجة

| المعرّف | الخطر الذي مُنع | الضمان الحالي | اختبار المنع من الرجوع | الحالة |
|---|---|---|---|---|
| IDEM-CENTRAL | إعادة استخدام `creation_token` لبيانات مختلفة أو إنشاء آثار مكررة | بصمة payload مركزية و`operation_id` واحد للسيارة/البيع/المصروف/الشريك/مقدمة الزبون/تسديد الممول/الوكالة | `central_creation_token_rejects_different_payload_and_cross_command_reuse` واختبارات replay لكل مجال | ✅ مكتمل |
| OPT-LOCK | الكتابة فوق تعديل أحدث | `version` و`expected_version` على المصروف والسيارة والبيع والوكالة وحركتها ومصروف السيارة وحساب الشريك والقسط | `stale_version_is_rejected_for_*` + اختبارات المصروف والبيع | ✅ مكتمل |
| REV-APPEND | حذف سجل مالي أو آثاره ماديًا | صفوف عكس مترابطة وعمليات/Audit للسيارة والوكالة وحركتها والمصروف العام ومصروف السيارة ودفعات الأقساط | اختبارات `deleting_*_appends_*` و`installment_reversal_is_append_only_*` | ✅ مكتمل |
| FK-IDENTITY | الربط بواسطة اسم/رقم عرض أو FK nullable | هويات `car_id/sale_id/account_id/installment_id/operation_id` ومفاتيح خارجية حقيقية حتى v45 | اختبارات v41/v43/v45 و`stale_version_and_text_identity_are_rejected` | ✅ مكتمل |
| PERIOD-GATE | الكتابة أو العكس داخل فترة مغلقة | فحص الفترة داخل المعاملة قبل كل أثر | `closed_accounting_period_blocks_mutation_*` و`closed_period_blocks_installment_reversal_*` | ✅ مكتمل |
| MONEY-EXACT | فقد الكسور أو تحويل Decimal إلى SQLite REAL | `Money` نصي دقيق وتقريب حسب العملة | اختبارات split/property/backend decimal duplicate | ✅ مكتمل |
| CAR-CYCLE | خلط دورتين تشتركان في اللوحة أو الشاصي | هوية سيارة رقمية غير قابلة للالتباس | `scenario_13_three_purchase_cycles_are_fully_isolated` واختبارات ownership | ✅ مكتمل |
| FAIL-CLOSED | ابتلاع أخطاء SQL أو تسجيل migration ناجحة جزئيًا | معاملات، postconditions، وفحوص integrity/FK | اختبارات rollback وbackup التاريخي + بوابة `check_rust_structure.py` | ✅ مكتمل |

## اختبارات الاستبدال الملزمة

| الافتراض القديم | البديل الصحيح |
|---|---|
| كلمة مرور admin ثابتة | bootstrap لمرة واحدة مع `must_change_password` والحفاظ على كلمة المرور عند إعادة التهيئة |
| بيع `موعد` يولد 12 قسطًا | استحقاق واحد بكامل المتبقي؛ الأقساط المتعددة خاصة بنوع `اقساط` |
| حذف مصروف السيارة بـ`DELETE` | صف عكس + وسم الأصل + عكس ledger/partner داخل معاملة واحدة |
| Trigger نصي لمفتاح مصروف السيارة | FK حقيقي في Migration 45 |

## حالة التشغيل

- Rust `--all-features`: ‏133/133، وintegration ‏1/1.
- Frontend: ‏90/90.
- Backend bridge الحقيقي: ‏8/8.
- Playwright: ‏5/5.
- `npm run test:release`: ناجح.
- سلامة قاعدة الاختبار: `PASS` لـintegrity/FK/ledger/source identity.

لا توجد حالة «جزئي» أو «مستمر» في مسارات الخطة المحاسبية. المخاطر غير البرمجية المتبقية موثقة في [REMAINING_RISKS.md](REMAINING_RISKS.md).
