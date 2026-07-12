# Traceability

| النتيجة | الحالة | الدليل |
|---|---|---|
| Restore مع اتصال مفتوح/WAL | أُصلحت | `infrastructure/backup.rs` واختبارا restore |
| Actor ثابت في restore | أُصلحت | actor من `require_admin_session` |
| Migration تسجل نجاحاً جزئياً | أُصلح السبب العام جزئياً | `MigrationConnection` + failure injection |
| First Run عبر stderr | أُصلحت | `bootstrap_admin` و`LoginScreen.tsx` واختبار one-time |
| FULL-71 cash sale | أُعيد تصميم الاختبار | قياس دلتا البيع بدل تجاهل كلفة الشراء |
| Commands كتابة بلا token صريح | مفتوح حرج | 23 مسارًا ما زالت تستدعي `None` |
| E2E React→Tauri→Rust→SQLite | مفتوح | Contract Rust حقيقي، لكن E2E UI غير مثبت |
| God Module | مفتوح عالٍ | `legacy.rs` ما زال يتجاوز 21 ألف سطر |
| مصدر محاسبي موحد | مفتوح عالٍ | لا تزال جداول متعددة بلا reconciliation شامل |
