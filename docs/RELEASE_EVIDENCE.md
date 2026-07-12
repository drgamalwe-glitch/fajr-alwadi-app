# Release Evidence — 2026-07-12

البيئة: macOS، timezone Asia/Baghdad، Rust 2021، Tauri 2.11، Node/Vite من lockfile الحالي.

الحكم: **No-Go**.

## الأدلة الناجحة

- `npm run typecheck && npm run lint && npm run test && npm run build`
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`: 65 ناجحة، صفر فشل.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- `npm audit --omit=dev`: صفر ثغرات.
- `cargo audit --file src-tauri/Cargo.lock`: صفر vulnerabilities بعد ترقية `plist`/`quick-xml` في lockfile؛ 17 warnings انتقالية.

## الأدلة الفاشلة/غير المكتملة

- لا يوجد release E2E حقيقي يصل إلى Rust وSQLite؛ bridge الحالي لا يكفي.
- لا توجد fixtures وترقيات وفشل متعمد لكل schema version.
- لم يُعتمد Tauri production package أو smoke test ما دامت بوابة الأمن والتفويض تفشل.

لا يجوز استخدام نجاح الاختبارات الحالية وحده كدليل جاهزية.
