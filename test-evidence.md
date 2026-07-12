# أدلة الاختبار — 12 يوليو 2026

- `cargo test --manifest-path src-tauri/Cargo.toml`: ناجح، 68 وحدة + اختبار migration خارجي.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: ناجح.
- `npm run test:contract`: ناجح؛ أربع رحلات على Commands الإنتاج وSQLite حقيقية.
- `npm run test:release`: ناجح.
- Frontend: 69 اختباراً ناجحاً.
- Restore: WAL committed data، اتصال صالح بعد الاستعادة، ورفض backup تالف دون لمس live DB.
- Migration failure injection: rollback وبقاء `db_version` والبيانات.
- lint: صفر errors و25 warnings؛ ليست نتيجة نظيفة بالكامل.
- build: ناجح مع تحذير bundle أكبر من 500KB.

الحكم: الأدلة تحسنت لكنها لا تكفي لقرار Go.
