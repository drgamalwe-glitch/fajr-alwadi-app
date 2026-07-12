# نموذج الأمان — Fajr Al-Wadi Accounting ERP

> هذه الوثيقة تُفصّل نموذج الأمان الكامل: المصادقة، التفويض، التدقيق، حماية البيانات، وموانع الحزمة. كل آلية مرتبطة بالكود الذي يُنفّذها في `src-tauri/src/lib.rs`. الهدف هو أن يكون أي مُراجع أمني قادرًا على تتبّع كل قاعدة من النص إلى التنفيذ. مرجع القرار العام: §7 من التكليف التنفيذي، §19 من `Instructions.md`.

## 1. المصادقة (Authentication)

### 1.1 تخزين كلمات المرور — Argon2

كلمات المرور لا تُخزَّن نصية أبدًا. الدالة `hash_password(password: &str) -> Result<String, String>` في `lib.rs` (السطر 15652) تستخدم خوارزمية Argon2 (تبعية `argon2 = "0.5"` في `Cargo.toml`) مع Salt عشوائي لكل كلمة مرور. الناتج يُخزَّن في `users.password_hash` كنص Argon2 مُسلسل.

التحقق يتم عبر `verify_password(password, stored_hash)` (السطر 15663) الذي يستخدم `Argon2::verify_password` مباشرة. لا يوجد أي مسار "مختصر" يقبل كلمة مرور نصية.

### 1.2 Bootstrap — كلمة مرور عشوائية لمرة واحدة

القاعدة (SECURITY-1): قاعدة بيانات جديدة **لا** تُنشأ بـ `admin/admin`. بدلًا من ذلك:

1. `generate_one_time_admin_password()` (السطر 858) يولّد 24 حرفًا عشوائيًا من `OsRng` بأبجدية لا لبس فيها (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — بدون `0/O/1/I`) لتسهيل النسخ اليدوي.
2. كلمة المرور تُخزَّن كـ Argon2 hash في `users.password_hash` مع `must_change_password = 1`.
3. `announce_one_time_admin_password(username, password)` (السطر 874) تطبع الكلمة على `stderr` مرة واحدة فقط، بتنسيق واضح محاط بحدود. **لا تُكتب إلى أي ملف على القرص.**
4. عند أول دخول، يُجبر النظام المستخدم على تغيير كلمة المرور قبل أي عملية كتابة (بوابة `must_change_password` في `require_admin_session`).

ملاحظة للمنشئين (operators): **يجب التقاط كلمة المرور من `stderr` عند أول تشغيل**. لا يمكن استرجاعها لاحقًا لأنها hash. إن فاتت، يجب حذف قاعدة البيانات وإعادة التهيئة.

الـ legacy `admin/admin` لا يزال مُعرّفًا كلـ `LEGACY_INSECURE_ADMIN_PASSWORD` (السطر 849) لأغراض الكشف فقط: إن وُجد قاعدة قديمة بـ `must_change_password = 0` وhash يتطابق مع `admin/admin`، يُطبع `[SECURITY] WARNING` على `stderr` دون إعادة تعيين صامتة (لأن ذلك قد يُغلق مُشغّلًا اختار كلمة مرور حقيقية فعلًا). مرجع القرار الكامل: `docs/ADR/0002-secure-admin-bootstrap.md`.

### 1.3 Session Token — 64 حرف hex

بعد تسجيل الدخول الناجح، `create_session(conn, user_id)` (السطر 16255) يولّد token 64 حرفًا hex (32 بايت عشوائي من `OsRng` عبر `generate_session_token` في السطر 894) ويُخزّنه في جدول `sessions` مع `expires_at = now + 3600` ثانية (1 ساعة). الثابت `SESSION_LIFETIME_SECS = 3600` (السطر 832).

`cleanup_expired_sessions(conn)` (السطر 901) يُستدعى عند بدء التشغيل ويحذف كل الجلسات المنتهية: `DELETE FROM sessions WHERE expires_at <= ?1`.

### 1.4 Rate Limiting — 5 محاولات / 5 دقائق

`count_recent_login_attempts(conn, username)` (السطر 16222) يعدّ المحاولات الفاشلة في آخر `LOGIN_RATE_LIMIT_WINDOW_SECS = 300` ثانية (5 دقائق). `record_failed_login_attempt(conn, username)` (السطر 16234) يُدرج صفًا في `login_attempts` مع timestamp. عند `recent_failures >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5` (السطر 834)، تُرفض محاولة الدخول التالية بخطأ صريح.

`clear_login_attempts(conn, username)` يُستدعى بعد دخول ناجح لإزالة السجل.

## 2. التفويض (Authorization)

### 2.1 require_admin_session

كل أمر كتابة في Tauri يستدعي `require_admin_session(conn, session_token)?` في بداية معاملته. الدالة (السطر 917) تعمل بطريقتين:

- **`Some(token)` (النمط المُوصى به)**: تستعلم `SELECT user_id FROM sessions WHERE token = ?1 AND expires_at > ?2`. تتحقق أن `user_id == PRIMARY_ADMIN_USER_ID = 1`. تتحقق أن المستخدم لا يزال موجودًا. تُعيد `Ok(user_id)` أو خطأ عربي صريح.
- **`None` (النمط legacy)**: للتوافق مع الأوامر القديمة التي لم تُحدّث لتُمرر session_token. تستعلم `SELECT COUNT(*) FROM sessions WHERE user_id = 1 AND expires_at > now`. إن صفر، تُعيد خطأ "الجلسة مطلوبة أو منتهية الصلاحية". ثم تفحص `must_change_password`، فإن 1 تُعيد خطأ "يجب تغيير كلمة المرور الافتراضية قبل استخدام النظام".

**النمط legacy سيُلغى**: الهدف هو أن كل أمر كتابة يُمرّر `session_token` صراحةً. أي أمر جديد **يجب** يأخذ `session_token: Option<String>` كمعامل أول ويُمرّره إلى `require_admin_session`. الأوامر القديمة تُحدّث تباعًا. الثابت `PRIMARY_ADMIN_USER_ID = 1` (السطر 830) يُمثّل المدير الأساسي وحده المخوّل حاليًا.

### 2.2 مبدأ الصلاحية الأدنى

النظام لا يُطبّق بعد أدوارًا متعددة (roles) أو صلاحيات على مستوى العمليات. كل المستخدمين المُنشأين عبر `add_user` يُعامَلون كمستخدمين عاديين لا يستطيعون الكتابة. فقط `PRIMARY_ADMIN_USER_ID = 1` له صلاحية الكتابة الكاملة. هذا يُعدّ نموذج "single admin + audit readers" مقبولًا لتطبيق سطح مكتب محلي، لكنه يحتاج تطويرًا إن تطلّب النشر متعدد المستخدمين.

## 3. التدقيق (Audit Trail)

### 3.1 append_audit_event — هوية من الـ Backend فقط

الدالة `append_audit_event(conn, actor_user_id, entity_type, entity_id, action, session_token, creation_token)` في `lib.rs` (السطر 3313) هي الطريقة الرسمية الوحيدة لتسجيل حدث تدقيق بعد v35. القاعدة الصارمة (AUDIT-TRAIL-1):

- **`actor_user_id`** يأتي **من `require_admin_session` فقط**، أي من `sessions.user_id` الذي رُبط بـ token مُتحقَّق منه. لا تقبل الدالة اسمًا نصيًا من الواجهة. عمود `actor` النصي القديم يُملأ بـ `format!("user#{}", actor_user_id)` للتوافق مع الـ UI القديم، لكنه **ليس** مصدرًا للحقيقة.
- **`session_id`** يُخزَّن مقنّعًا (أول 8 أحرف فقط من الـ token الكامل + `…`) لتسجيل الجلسة دون تسريب الـ token الكامل القابل لإعادة الاستخدام.
- **`request_id`** معرّف فريد لكل طلب IPC — حاليًا يُعاد استخدام `creation_token` للتتبع، وسيُستبدل بـ request id مخصص عند توفره.
- **`creation_token`** الـ idempotency token إذا كان الأمر يحمله، لربط عمليات retry بالأصل.

الأعمدة الأربعة أُضيفت في v35 (انظر `docs/MIGRATIONS.md`). الجدول `audit_log` يحتفظ أيضًا بالأعمدة القديمة (`date`, `time`, `actor`, `action`, `entity_type`, `entity_id`, `description`, `notes`) للتوافق مع الـ UI و للتقارير التاريخية.

### 3.2 دوال القراءة لا تكتب (§1.3)

أي دالة قراءة (`get_financial_summary`, `get_cash_register_entries`, `get_profit_distribution_summary`, `get_partners_totals`, `get_unified_accounts`, `get_partner_transactions`, `get_cars`) **يجب ألا تكتب** إلى قاعدة البيانات. هذا يشمل `recalculate_all_partners`, `rebuild_*`, `migrate_*`. الـ caches المؤقتة في الذاكرة مسموحة، أما الكتابة إلى DB فممنوعة. `scripts/accounting_audit.py` يفحص هذا.

## 4. حماية البيانات (Data Protection)

### 4.1 حقن SQL — SQL Parameters دائمًا

كل استعلام SQL في `lib.rs` يستخدم `params![]` أو `params![...]` من `rusqlite`. **لا يوجد** أي استعلام يبني SQL بـ `format!()` أو `+` من مدخلات المستخدم. المدخلات تُمرَّر كـ bound parameters دائمًا. مثال:

```rust
conn.execute(
    "INSERT INTO audit_log (...) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    params![date, time, format!("user#{}", actor_user_id), action.trim(), ...],
)?;
```

الأسماء النصية (مثل `partner_name`, `description`) تُمرَّر كـ parameters. الدوال المساعدة `validate_required_text`, `validate_positive_amount`, `validate_currency` تفحص المدخلات قبل أي `INSERT`.

### 4.2 SQL Grouping — Transaction واضحة

كل أمر كتابة يفتح `let db = state.db.lock()?.transaction()?;` وينتهي بـ `db.commit()?` أو `ROLLBACK` تلقائي عند `Err`. هذا يضمن أن أي فشل في خطوة وسطى يلغي كل ما سبق. الـ Mutex يمنع التزامن بين أوامر Tauri المتعددة.

### 4.3 Money كنص (§6 of final.md — Money Is Text)

كل أعمدة المبالغ (`amount`, `purchase_price`, `selling_price`, `iqd_balance`, `usd_balance`, إلخ) من نوع `TEXT`، لا `REAL`. هذا يمنع فقدان الدقة في الأرقام الكبيرة (مثلًا `20,000,000.123456`). v20 حوّلت كل أعمدة `Money` من `REAL` إلى `TEXT` (`migrate_all_money_columns_to_text`). في الـ Rust، النوع `Money(Decimal)` من `rust_decimal` يُخزَّن وييُقرأ كنص. في الواجهة، `decimal.js` يُستخدم بدل `Number`.

## 5. أمان الواجهة (Frontend Security)

### 5.1 CSP مقيدة

ملف `src-tauri/tauri.conf.json` يحدّد سياسة أمان محتوى (CSP) مقيدة. الـ defaults:
- `default-src 'self'` — فقط موارد من نفس الأصل.
- `script-src 'self'` — لا scripts خارجية.
- `style-src 'self' 'unsafe-inline'` — Tailwind يحتاج inline styles.
- `img-src 'self' data: blob: tauri:` — صور محلية فقط + data URIs + tauri protocol.
- `connect-src 'self' ipc: http://ipc.localhost` — IPC فقط.

التغييرات على CSP تتطلب مراجعة أمنية لأنها تُضعف الحماية.

### 5.2 التحقق من مسار PDF

الدالة `open_temp_pdf` تُنشئ ملف PDF مؤقت في مجلد الـ temp، تتحقق من أن المسار داخل المجلد المُتوقع (لا path traversal)، ثم تفتحه عبر `open` crate. لا تقبل اسم ملف من المستخدم مباشرة. الـ PDFs المؤقتة تُحذف بعد العرض.

### 5.3 قدرات Tauri (Capabilities)

ملف `src-tauri/capabilities/default.json` يحدّد القدرات المسموحة للتطبيق:
- `tauri-plugin-fs` — وصول محدود للملفات (للنسخ الاحتياطي والتصدير).
- `tauri-plugin-opener` — فتح روابط WhatsApp وملفات PDF.

لا يوجد `shell:allow-execute` أو صلاحيات غير ضرورية. أي إضافة لقدرة جديدة يجب أن تُبرَّر وتُراجَع.

## 6. موانع الحزمة (Package Hygiene)

### 6.1 .gitignore

ملف `.gitignore` مُحدَّث ليتجاهل:
- `target/` (Rust build artifacts).
- `dist/` (Vite build output).
- `node_modules/`.
- `coverage/` (coverage reports).
- `*.db`, `*.sqlite`, `*.sqlite3`, `*.db-journal`, `*.db-wal`, `*.db-shm` (قواعد بيانات).
- `backups/` (مجلد النسخ الاحتياطية).
- `*.bak`, `*.log` (ملفات احتياطية و سجلات).
- `playwright-report/`, `test-results/` (تقارير Playwright).
- `.env`, `.env.*` (متغيرات بيئة).
- `.vscode/`, `.idea/` (إعدادات محرر).
- `initial_admin_password.txt` (ملف الاعتمادات القديم — ممنوع).
- `*password*.txt`, `*secret*.{txt,json,env}`, `*token*.{txt,json,env}`.
- `credentials.json`, `service-account*.json`, `*.pem`, `*.key`, `*.p12`.

### 6.2 scripts/check_artifact_hygiene.py

سكربت Python (مُنفّذ في `scripts/check_artifact_hygiene.py`) يفحص شجرة المشروع قبل كل حزمة إصدار. إن وُجد أي ملف ممنوع، يفشل البناء بـ exit 1. القوائم:

- **SQLite و sidecars**: `*.db`, `*.sqlite`, `*.sqlite3`, `*.db-journal`, `*.db-wal`, `*.db-shm`.
- **نسخ احتياطية**: `backups/`, `*.bak`.
- **اعتمادات قديمة**: `initial_admin_password.txt` (فحص خاص في `src-tauri/initial_admin_password.txt`).
- **أسرار**: `*password*.txt`, `*secret*.{txt,json,env}`, `*token*.{txt,json,env}`, `.env`, `.env.*`, `credentials.json`, `service-account*.json`, `*.pem`, `*.key`, `*.p12`.
- **سجلات**: `*.log`, `*.tap`, `*.lcov`, `coverage/`, `*.coverage`.
- **OS caches**: `.DS_Store`, `Thumbs.db`.
- **Editor config**: `.vscode/`, `.idea/`.
- **Build artifacts**: `target/`, `dist/`, `build/`, `node_modules/`, `.git/`.
- **Test reports**: `playwright-report/`, `test-results/`.

يستثني `test/fixtures/` (بيانات اختبار مقصودة) و `src-tauri/icons/` (أيقونات التطبيق).

### 6.3 npm audit و cargo audit

- `npm audit --audit-level=moderate` — يفحص ثغرات حزم npm. حاليًا صفر ثغرات معروفة.
- `cargo audit` — يفحص ثغرات crates Rust. حاليًا يُخرج exit 1 بسبب `quick-xml 0.39.4` (RUSTSEC-2026-0194 و0195 — ثغرتا DoS عاليتان في تبعية انتقالية). هذا **حظر** للـ Release Gate حتى تُحدَّث السلسلة المالكة لـ `quick-xml >= 0.41.0`.
- `cargo deny` — إعداد في `src-tauri/deny.toml` لفحص التراخيص والثغرات والاعتمادات المكررة.

## 7. نقاط الضعف المعروفة

يجب أن تكون شفافين بشأن ما لا يُغطّيه النموذج الأمني حاليًا:

1. **لا HTTPS/TLS** — التطبيق محلي سطح مكتب، IPC عبر Tauri، لا يوجد شبكة. إن طُلب نشر متعدد المستخدمين، يجب إضافة TLS لكل اتصال.
2. **لا تشفير للـ DB في القرص** — SQLite لا يُشفّر افتراضيًا. أي شخص يصل للقرص يقرأ البيانات. الحل المقترح: SQLCipher (تبديل rusqlite بـ rusqlite-sqlcipher) — لم يُنفَّذ.
3. **لا تدقيق وصول للقراءة** — `audit_log` يسجل عمليات الكتابة فقط. عمليات قراءة كشوف الحسابات لا تُسجَّل. إن طُلب تتبّع وصول، يجب إضافة `audit_log` entries لأوامر القراءة الحساسة.
4. **Session token في الذاكرة فقط** — لا يُخزَّن في الـ HTTP-only cookie لأنه تطبيق سطح مكتب. يُخزَّن في React state + `localStorage` (مؤقتًا حتى إعادة التشغيل). يجب تنظيفه عند logout.
5. **rate limiting محلي** — `login_attempts` في نفس الـ DB. مهاجم يصل للقرص يمكنه حذف السجل. هذا مقبول لتطبيق سطح مكتب منفرد، لكنه يحتاج مراجعة في نشر متعدد المستخدمين.
6. **`must_change_password` legacy path** — الأوامر التي لم تُحدّث لتمرير `session_token` لا تزال تسقط على النمط `None` الذي يفحص فقط وجود جلسة فعّالة. هذا أضعف من النمط `Some(token)` الذي يربط الطلب بـ token محدد. الحل: تحديث كل أوامر الكتابة لتمرير `session_token` صراحةً.

## 8. مراجع

- `Instructions.md` §19 (Ledger and Audit Rules), §1.3 (Read-Only).
- `final.md` — تقرير التدقيق الجنائي.
- `docs/ADR/0002-secure-admin-bootstrap.md` — قرار bootstrap الآمن.
- `docs/BUG_REGRESSIONS.md` — SECURITY-1, AUDIT-TRAIL-1, ARTIFACT-HYGIENE-1.
- `docs/TEST_STRATEGY.md` §1.11 — اختبارات الأمان.
- `src-tauri/src/lib.rs` الأسطر 830–976 (constants + session/auth), 3313–3359 (audit), 15652–15663 (Argon2), 16222–16280 (rate limiting + create_session).
- `scripts/check_artifact_hygiene.py` — فاحص الحزمة.
- `src-tauri/tauri.conf.json` — CSP وقدرات Tauri.
- `src-tauri/deny.toml` — إعداد cargo-deny.
