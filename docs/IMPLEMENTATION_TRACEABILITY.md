# Implementation Traceability

| بند التدقيق | الحالة | الإصلاح/الدليل |
|---|---|---|
| مسار قاعدة الإنتاج | مغلق | `src-tauri/src/lib.rs`; App Data + اختبار reopen |
| نقل قاعدة executable القديمة | مغلق جزئياً | Online Backup + quick_check + conflict fail-closed؛ يحتاج اختبار منصات مثبتة |
| session token المتوقع/تواريخ TEXT | مغلق | `login` يستخدم OsRng وUnix INTEGER؛ Rust tests |
| migrations fail-closed لكل النسخ | مفتوح حرج | `legacy.rs` ما زال يحوي تجاهل أخطاء؛ fixture v31 فقط |
| token إلزامي لكل write | مفتوح حرج | توجد استدعاءات `require_admin_session(..., None)` وتواقيع Option |
| audit actor غير قابل للتزوير | مفتوح عالٍ | بعض المسارات محسنة، لا يوجد Request Context شامل |
| backup/restore + WAL ذري | مفتوح حرج | نقل legacy آمن؛ restore العام لم يُثبت ذرياً |
| onboarding أول مستخدم | مفتوح عالٍ | stderr bootstrap ما زال موجوداً |
| idempotency شاملة | مفتوح حرج | تغطية جزئية فقط |
| مصدر محاسبي واحد/reconciliation | مفتوح عالٍ | اختبارات invariants ناجحة، التوحيد غير منفذ |
| IDs وعلاقات ثابتة | مفتوح عالٍ | car_number/names ما زالت مستخدمة في مواضع |
| منع Float المالي | مفتوح عالٍ | Money tests موجودة، SQL حساس ما زال يستخدم CAST AS REAL |
| AppError موحد | مفتوح | الأخطاء تتحول إلى String في نطاق واسع |
| تفكيك legacy.rs | مفتوح عالٍ | 21,285 سطراً؛ domain files re-export فقط |
| E2E حقيقي | مفتوح حرج | Playwright/bridge الحاليان لا يثبتان المسار الحقيقي |
| اعتماديات بلا vulnerabilities معروفة | مغلق جزئياً | cargo audit: صفر vulnerabilities؛ 17 warnings انتقالية باقية |
| بوابات frontend/Rust | مغلق | typecheck/lint/frontend/build و65 Rust tests وClippy ناجحة |

لا توجد commits لأن مجلد التسليم ليس Git repository.
