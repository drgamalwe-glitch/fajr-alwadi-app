# ADR-0004 — كل Migration يجب أن تكون Fail-Closed

- **التاريخ**: 2026-07-15
- **الحالة**: مقبول (Accepted)
- **المُقرّر**: فريق التدقيق الجنائي — جولة 11-B
- **المعرّف في `docs/BUG_REGRESSIONS.md`**: MIGRATION-V35
- **المراجع**: `Instructions.md` §9.1, `reports/FINAL_REPORT.md` (v34 swallowed errors), `src-tauri/src/lib.rs` v35 implementation

## السياق

الترحيلات (migrations) في `init_db` تُطبّق بشكل تسلسلي من v1 إلى v35. كل ترحيلة مسؤولة عن نقل قاعدة البيانات من حالة معروفة إلى حالة معروفة تالية. القاعدة §9.1: **لا تُعدَّل migration منشورة، أضف migration جديدة فقط**.

### الحادثة — v34 ابتلعت الأخطاء

في v34 (إضافة `creation_token` لكل الكيانات)، استخدم الكود النمط التالي:

```rust
let _ = conn.execute("ALTER TABLE cars ADD COLUMN creation_token TEXT", []);
let _ = conn.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_creation_token
     ON cars(creation_token) WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
    [],
);
```

الـ `let _ = ...` يُلقي أي خطأ. النتيجة: قاعدة بيانات قد تصل إلى `db_version = 34` لكن:

- بدون عمود `creation_token` (إن فشل `ALTER`).
- بدون فهرس `idx_cars_creation_token` (إن فشل `CREATE INDEX`).
- مع عمود لكن بدون فهرس (إن نجح الأول وفشل الثاني).

هذا يعني أن idempotency عبر `creation_token` (§31.2, ADR-0003) **لا يعمل** على تلك القاعدة. الـ `SELECT ... WHERE creation_token = ?1` يفحص كل الصفوف بدلاً من الفهرس، وقد لا يُنشأ قيد التفرد، فيُسمح بصفّين بنفس الـ token.

### لماذا حدث هذا؟

المبرمج استخدم `let _ = ...` لأن:

- `ALTER TABLE ... ADD COLUMN` يفشل إن كان العمود موجودًا (مثلاً إن طُبّقت v34 جزئيًا من قبل). النمط الشائع: تجاهل `DuplicateColumn` لمواصلة الترقية.
- لكن `let _ = ...` يتجاهل **كل** الأخطاء، ليس فقط `DuplicateColumn`. إن فشل `ALTER` لسبب آخر (قرص ممتلئ، صلاحية، SQL syntax)، يُبتلع الصمت وتستمر الترقية.

### الأثر

القاعدة المرتبطة بـ v34 (idempotency) قد تكون معطلة على قواعد بيانات وصلت إلى v34 دون إنشاء الأعمدة/الفهارس. لا يمكن اكتشاف هذا بعد فوات الأوان إلا بفحص `sqlite_master` يدويًا — وهو ما لا يفعله الكود.

## القرار

كل migration جديدة يجب أن تكون **fail-closed**:

1. **Transaction واضحة**: كل migration تُنفّذ ضمن `BEGIN`/`COMMIT`/`ROLLBACK`. أي خطأ يُلغي الترقية بالكامل.
2. **معالجة صريحة للأخطاء المتوقعة**: الأخطاء المتوقعة (مثل `DuplicateColumn`) تُعالَج بـ `match` صريح، لا `let _ = ...`.
3. **Postconditions**: بعد كل عملية حساسة (`ALTER`, `CREATE INDEX`, `CREATE TABLE`)، تُفحص `sqlite_master` للتأكد من النتيجة.
4. **Rollback عند الفشل**: أي فشل في postcondition يُلغي الـ migration كاملة. `db_version` لا يُحدَّث.
5. **لا تسجيل version إلا بعد النجاح الكامل**: `INSERT INTO db_version (version) VALUES (?)` يحدث فقط بعد نجاح كل العمليات + postconditions.

### نمط v35 كنموذج

v35 تُطبّق هذا القرار بالكامل. هي تخدم هدفين:

#### 1. إضافة أعمدة `audit_log` الجديدة

```rust
let audit_cols = [
    ("actor_user_id", "INTEGER"),
    ("session_id", "TEXT"),
    ("request_id", "TEXT"),
    ("creation_token", "TEXT"),
];
for (col, ty) in &audit_cols {
    match conn.execute(
        &format!("ALTER TABLE audit_log ADD COLUMN {} {}", col, ty),
        [],
    ) {
        Ok(_) => {}
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            // Column already exists — idempotent, continue.
        }
        Err(e) => return Err(e), // Any other error: fail-closed.
    }
}
```

هذا يُميّز صراحةً `DuplicateColumn` (ConstraintViolation في SQLite) عن أي خطأ آخر. الأخطاء الأخرى تُعيد `Err` فورًا، مما يُلغي الـ transaction.

#### 2. إعادة إنشاء فهارس `creation_token` + Postconditions

```rust
for stmt in &[
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_creation_token ON cars(creation_token) WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_creation_token ON expenses(creation_token) WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_car_expenses_creation_token ON car_expenses(creation_token) WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_tx_creation_token ON partner_transactions(creation_token) WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_tx_creation_token ON agency_transactions(creation_token) WHERE creation_token IS NOT NULL AND TRIM(creation_token) != ''",
] {
    conn.execute(stmt, [])?; // Fail-closed: any error aborts the migration.
}

// Postconditions: verify each index exists.
for idx_name in [
    "idx_cars_creation_token",
    "idx_expenses_creation_token",
    "idx_car_expenses_creation_token",
    "idx_partner_tx_creation_token",
    "idx_agency_tx_creation_token",
] {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
        [idx_name],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Err(rusqlite::Error::ToSqlConversionFailure(
            format!("v35 postcondition failed: index {} was not created", idx_name).into(),
        ));
    }
}
```

الـ postcondition يفحص `sqlite_master` بعد `CREATE INDEX IF NOT EXISTS`. حتى لو نجح الاستعلام دون خطأ لكن الفهرس لم يُنشأ (مثلاً بسبب race condition أو SQLite bug نادر)، يفشل الـ migration بخطأ صريح.

## العواقب

### إيجابية

- **حتمية الترقية**: قاعدة بيانات تصل إلى `db_version = N` مضمونة أن تكون في الحالة التي توقعها الـ migration N. لا حالة ناقصة صامتة.
- **كشف الأخطاء مبكرًا**: فشل `ALTER` أو `CREATE INDEX` يُكتشف فورًا، لا بعد أسابيع عند حدوث bug غامض.
- **توافق مع §9.1**: لا نُعدّل v34 المنشورة (التي ابتلعت الأخطاء). الإصلاح في v35 الجديدة.
- **استعادة آمنة**: أي فشل يُلغي الـ transaction بالكامل. `db_version` يبقى عند آخر قيمة ناجحة. يمكن إعادة المحاولة بعد إصلاح السبب.
- **قابلية التدقيق**: الـ postconditions تترك أثرًا واضحًا في الكود عن ما يجب أن يكون موجودًا بعد كل migration.
- **حماية idempotency**: فهارس `creation_token` مضمونة الوجود بعد v35، فيعمل ADR-0003 بشكل صحيح.

### سلبية

- **بطء الترقية**: فحص `sqlite_master` بعد كل `CREATE INDEX` يُضيف استعلامًا. التأثير ضئيل (millisecond) لكنه غير صفري.
- **تعقيد الكود**: كل migration تحتاج `match` صريح للأخطاء المتوقعة + postconditions. هذا 10–20 سطرًا إضافيًا لكل migration حساسة.
- **صعوبة التراجع**: إن فشلت v35 على قاعدة في الإنتاج، الـ transaction يتراجع وتبقى القاعدة على v34. لكن v34 نفسها قد تكون ناقصة (ابتلعت الأخطاء). الحل: فحص `sqlite_master` يدويًا لمعرفة حالة v34، ثم تطبيق v35 بعد إصلاح السبب.
- **توافق غير كامل**: قواعد بيانات وصلت إلى v34 قبل إصدار v35 لا تزال تحمل النقص. v35 تُصلح هذا عند تطبيقها، لكن إن عُلِّقت قاعدة على v34 (مثلاً نظام قديم لم يُحدّث)، يبقى النقص. لا حل رجعي تلقائي.

### نمط مستقبلي مُلزم

كل migration جديدة (v36 فأحدث) يجب أن تتبع النمط التالي:

```rust
fn migrate_v36(conn: &Connection) -> SqlResult<()> {
    // 1. ALTER with explicit DuplicateColumn handling
    match conn.execute("ALTER TABLE ... ADD COLUMN ...", []) {
        Ok(_) => {}
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.code == rusqlite::ErrorCode::ConstraintViolation => {}
        Err(e) => return Err(e),
    }

    // 2. CREATE INDEX/TABLE with fail-closed (no `let _ =`)
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ...", [])?;

    // 3. Postconditions: verify sqlite_master
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
        ["idx_name"],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Err(rusqlite::Error::ToSqlConversionFailure(
            "v36 postcondition failed: index idx_name was not created".into(),
        ));
    }

    // 4. INSERT INTO db_version only after all postconditions pass
    conn.execute("INSERT INTO db_version (version, applied_at) VALUES (36, ?1)", params![now])?;
    Ok(())
}
```

## بدائل مُعتبرة ومرفوضة

### بديل 1: الاستمرار في `let _ = ...` لكن مع logging

مرفوض. logging الأخطاء لا يُصلح المشكلة — الترقية ما زالت تنجح ظاهريًا. الـ operator قد لا يرى الـ log. الحل يجب أن يكون **fail-closed**، لا fail-open-with-log.

### بديل 2: تعديل v34 لإصلاح `let _ = ...`

مرفوض. §9.1 تمنع تعديل migrations المنشورة. قاعدة بيانات وصلت إلى v34 من قبل لن تُعيد تطبيق v34 المعدّلة. الإصلاح يجب أن يكون في v35.

### بديل 3: فحص `sqlite_master` في `init_db` قبل كل migration

مرفوض. هذا يُضيف تعقيدًا ويُنقل مسؤولية الفحص من الـ migration إلى `init_db`. الـ migration نفسها يجب أن تضمن نتائجها.

### بديل 4: rollback تلقائي عبر `DROP` للأعمدة/الفهارس عند الفشل

مرفوض. SQLite لا يدعم `DROP COLUMN` بسهولة (قبل v3.35) ولا يدعم transactional DDL بشكل كامل في كل الإصدارات. الـ transaction على DDL تعمل في SQLite لكنها قد لا تتراجع عن كل التغييرات الهيكلية. الأكثر أمانًا: فحص postcondition + فشل صريح + ترك الـ transaction تتراجع طبيعيًا.

### بديل 5: إزالة `let _ = ...` فقط دون postconditions

مرفوض. إزالة `let _ = ...` تجعل `ALTER` و`CREATE INDEX` يفشلان صراحةً، لكن `CREATE INDEX IF NOT EXISTS` قد "ينجح" دون إنشاء الفهرس (مثلاً إن كان هناك typo في اسم الفهرس). الـ postcondition ضروري للتأكد من النتيجة الفعلية.

## مراجع

- `Instructions.md` §9.1 (لا تعدّل Migration منشورة).
- `reports/FINAL_REPORT.md` — حادثة v34 المبتلعة للأخطاء.
- `src-tauri/src/lib.rs` — تنفيذ v35 مع postconditions (مذكور في `docs/MIGRATIONS.md` §v35).
- `docs/MIGRATIONS.md` — سجل الترحيلات v1–v35، خاصة §v34 و§v35.
- `docs/ADR/0003-idempotency-tokens.md` — القرار الذي يستفيد من postconditions على فهارس `creation_token`.
- `docs/BUG_REGRESSIONS.md` MIGRATION-V35 — سجل الإصلاح.
- `docs/AGENTS.md` §3.1 — قاعدة "لا تعدّل Migration قديمة".
- `docs/ADR/0001-source-of-truth.md` — المصدر الأعلى (§9.1) الذي يستند إليه هذا القرار.
