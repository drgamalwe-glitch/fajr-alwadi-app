//! `auth_users` — extracted from legacy/mod.rs lines 17422–17859
use super::*;

#[derive(Serialize, Debug, Clone)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub profile_image: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct LoginResult {
    pub success: bool,
    pub user: Option<UserInfo>,
    pub error: Option<String>,
    pub password_change_required: bool,
    /// Bug 3 (AU3): Session token for authenticated admin operations.
    /// Populated on successful login. The frontend should pass this to admin
    /// commands that accept `session_token: Option<String>`.
    pub session_token: Option<String>,
}

/// Return the count of failed login attempts within the rate-limiting window.
/// Database failures are surfaced instead of silently disabling rate limiting.
pub fn count_recent_login_attempts(conn: &Connection, username: &str) -> Result<i64, String> {
    let now = Local::now().timestamp();
    let since = now - LOGIN_RATE_LIMIT_WINDOW_SECS;
    conn.query_row(
        "SELECT COUNT(*) FROM login_attempts WHERE username = ?1 AND attempted_at >= ?2",
        params![username, since],
        |row| row.get(0),
    )
    .map_err(|e| format!("تعذر التحقق من محاولات تسجيل الدخول: {e}"))
}

/// Record a failed login attempt and surface any write failure.
pub fn record_failed_login_attempt(conn: &Connection, username: &str) -> Result<(), String> {
    let now = Local::now().timestamp();
    conn.execute(
        "INSERT INTO login_attempts (username, attempted_at) VALUES (?1, ?2)",
        params![username, now],
    )
    .map_err(|e| format!("تعذر تسجيل محاولة الدخول الفاشلة: {e}"))?;
    Ok(())
}

/// Clear failed login attempts after a successful login.
pub fn clear_login_attempts(conn: &Connection, username: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM login_attempts WHERE username = ?1",
        params![username],
    )
    .map_err(|e| format!("تعذر تنظيف محاولات تسجيل الدخول: {e}"))?;
    Ok(())
}

/// Bug 3 (AU3): Create a new session for the given user_id and return the token.
pub fn create_session(conn: &Connection, user_id: i64) -> Result<String, String> {
    let token = generate_session_token();
    let now = Local::now().timestamp();
    let expires_at = now + SESSION_LIFETIME_SECS;
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?1", [now])
        .map_err(|e| format!("تعذر تنظيف الجلسات المنتهية: {e}"))?;
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
        params![token, user_id, now, expires_at],
    )
    .map_err(|e| format!("فشل إنشاء الجلسة: {e}"))?;
    Ok(token)
}

#[tauri::command]
pub fn is_bootstrap_required(state: State<AppState>) -> Result<bool, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "قاعدة البيانات مشغولة".to_string())?;
    let users: i64 = db
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| format!("تعذر التحقق من إعداد النظام: {e}"))?;
    Ok(users == 0)
}

pub(super) fn validate_admin_password(username: &str, password: &str) -> Result<(), String> {
    if password.trim().is_empty() {
        return Err("كلمة المرور مطلوبة".to_string());
    }
    if password != password.trim() {
        return Err("لا يجوز أن تبدأ كلمة المرور أو تنتهي بمسافات".to_string());
    }
    if password.chars().count() < 12 {
        return Err("يجب ألا تقل كلمة المرور عن 12 محرفاً".to_string());
    }
    let normalized = password.to_lowercase();
    let normalized_username = username.trim().to_lowercase();
    if !normalized_username.is_empty() && normalized.contains(&normalized_username) {
        return Err("يجب ألا تحتوي كلمة المرور على اسم المستخدم".to_string());
    }
    const COMMON_PASSWORDS: &[&str] = &[
        "adminadminadmin",
        "password1234",
        "123456789012",
        "qwerty123456",
        "fajralwadi123",
    ];
    if COMMON_PASSWORDS.contains(&normalized.as_str())
        || normalized == LEGACY_INSECURE_ADMIN_PASSWORD
    {
        return Err("كلمة المرور شائعة أو غير آمنة".to_string());
    }
    let has_letter = password.chars().any(char::is_alphabetic);
    let has_number = password.chars().any(char::is_numeric);
    let has_symbol = password
        .chars()
        .any(|ch| !ch.is_alphanumeric() && !ch.is_whitespace());
    if !has_letter || (!has_number && !has_symbol) {
        return Err("يجب أن تحتوي كلمة المرور على حروف ورقم أو رمز".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn bootstrap_admin(
    state: State<AppState>,
    password: String,
    password_confirmation: String,
) -> Result<LoginResult, String> {
    let mut db = state
        .db
        .lock()
        .map_err(|_| "قاعدة البيانات مشغولة".to_string())?;
    bootstrap_admin_on_connection(&mut db, &password, &password_confirmation)
}

pub fn bootstrap_admin_on_connection(
    db: &mut Connection,
    password: &str,
    password_confirmation: &str,
) -> Result<LoginResult, String> {
    if password != password_confirmation {
        return Err("كلمتا المرور غير متطابقتين".to_string());
    }
    validate_admin_password(DEFAULT_ADMIN_USERNAME, password)?;
    let hash = hash_password(password)?;
    let tx = db
        .transaction()
        .map_err(|e| format!("تعذر بدء الإعداد الأولي: {e}"))?;
    let users: i64 = tx
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| format!("تعذر التحقق من المستخدمين: {e}"))?;
    if users != 0 {
        return Err("تم إعداد مدير النظام مسبقاً".to_string());
    }
    tx.execute(
        "INSERT INTO users
         (id, username, password_hash, display_name, profile_image, must_change_password)
         VALUES (?1, ?2, ?3, 'مدير النظام', NULL, 0)",
        params![PRIMARY_ADMIN_USER_ID, DEFAULT_ADMIN_USERNAME, hash],
    )
    .map_err(|e| format!("تعذر إنشاء مدير النظام: {e}"))?;
    let token = generate_session_token();
    let now = chrono::Utc::now().timestamp();
    let expires_at = now + SESSION_LIFETIME_SECS;
    tx.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![token, PRIMARY_ADMIN_USER_ID, now, expires_at],
    )
    .map_err(|e| format!("تعذر إنشاء جلسة المدير: {e}"))?;
    tx.commit()
        .map_err(|e| format!("تعذر إكمال الإعداد الأولي: {e}"))?;

    Ok(LoginResult {
        success: true,
        user: Some(UserInfo {
            id: PRIMARY_ADMIN_USER_ID,
            username: DEFAULT_ADMIN_USERNAME.to_string(),
            display_name: "مدير النظام".to_string(),
            profile_image: None,
        }),
        error: None,
        password_change_required: false,
        session_token: Some(token),
    })
}

#[tauri::command]
pub fn login(
    state: State<AppState>,
    username: String,
    password: String,
) -> Result<LoginResult, String> {
    let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let username = username.trim();
    let password = password.as_str();

    // Bug 6 (AU8): Rate-limit login attempts. If there have been >= 5 failed
    // attempts for this username in the last 5 minutes, refuse the attempt.
    let recent_failures = count_recent_login_attempts(&db_guard, username)?;
    if recent_failures >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS {
        return Ok(LoginResult {
            success: false,
            user: None,
            error: Some(
                "تم قفل الحساب مؤقتاً بسبب محاولات فاشلة متعددة، حاول بعد 5 دقائق".to_string(),
            ),
            password_change_required: false,
            session_token: None,
        });
    }

    let result = db_guard.query_row(
        "SELECT id, username, display_name, profile_image, password_hash, COALESCE(must_change_password, 0) FROM users WHERE username = ?1",
        [username],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, bool>(5)?,
            ))
        },
    );

    // Bug 4 (AU4): Use a single generic error message for both "no such user" and
    // "wrong password" to prevent user enumeration.
    const GENERIC_LOGIN_ERROR: &str = "اسم المستخدم أو كلمة المرور غير صحيحة";

    match result {
        Ok((id, uname, display_name, profile_image, stored_hash, must_change_password)) => {
            // Bug 5 (AU5): Track whether the stored hash was a legacy SHA-256 hash.
            // If so, re-hash with Argon2 after successful verification.
            let is_legacy_sha256 = PasswordHash::new(&stored_hash).is_err();
            if verify_password(password, &stored_hash) {
                // FORENSIC FIX (re-audit 2026-07-11, LOGIN-ATOMICITY-1):
                // Wrap the four post-verification mutations (last_login update,
                // password_hash upgrade, login_attempts cleanup, session insert) in
                // a single transaction so a crash mid-login cannot leave a
                // "half-logged-in" state (e.g. session created but last_login not
                // updated, or password hash upgraded but login_attempts not cleared).
                // Any failure rolls everything back.
                //
                // Compute token material OUTSIDE the transaction closure so we can
                // return the same token to the caller after commit() consumes tx.
                let now = chrono::Utc::now().timestamp();
                let expires_at = now + SESSION_LIFETIME_SECS;
                let session_token = generate_session_token();

                let tx_result: rusqlite::Result<()> = (|| {
                    let tx = db_guard.transaction()?;
                    tx.execute(
                        "UPDATE users SET last_login = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?1",
                        [id],
                    )?;
                    if is_legacy_sha256 {
                        // hash_password returns Result<String, String>; convert
                        // to rusqlite::Error for use inside this tx_result block.
                        let new_hash = hash_password(password).map_err(|e| {
                            rusqlite::Error::ToSqlConversionFailure(Box::new(
                                std::io::Error::other(e),
                            ))
                        })?;
                        tx.execute(
                            "UPDATE users SET password_hash = ?1, updated_at = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?2",
                            params![new_hash, id],
                        )?;
                    }
                    tx.execute("DELETE FROM login_attempts WHERE username = ?1", [username])?;
                    tx.execute("DELETE FROM sessions WHERE expires_at <= ?1", params![now])?;
                    tx.execute(
                        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
                        params![&session_token, id, now, expires_at],
                    )?;
                    tx.commit()?;
                    Ok::<(), rusqlite::Error>(())
                })();
                tx_result.map_err(|e| format!("فشل إكمال معاملة تسجيل الدخول: {e}"))?;

                Ok(LoginResult {
                    success: true,
                    user: Some(UserInfo {
                        id,
                        username: uname,
                        display_name,
                        profile_image,
                    }),
                    error: None,
                    password_change_required: must_change_password,
                    session_token: Some(session_token),
                })
            } else {
                // Bug 6 (AU8): Record the failed attempt.
                record_failed_login_attempt(&db_guard, username)?;
                Ok(LoginResult {
                    success: false,
                    user: None,
                    error: Some(GENERIC_LOGIN_ERROR.to_string()),
                    password_change_required: false,
                    session_token: None,
                })
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Bug 6 (AU8): Record the failed attempt even when the username doesn't
            // exist (so an attacker can't enumerate usernames by observing whether
            // the attempt count increases).
            record_failed_login_attempt(&db_guard, username)?;
            Ok(LoginResult {
                success: false,
                user: None,
                error: Some(GENERIC_LOGIN_ERROR.to_string()),
                password_change_required: false,
                session_token: None,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Bug 3 (AU3): Logout command. Deletes the session token from the database.
#[tauri::command]
pub fn logout(state: State<AppState>, session_token: Option<String>) -> Result<(), String> {
    if let Some(token) = session_token {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM sessions WHERE token = ?1", params![token])
            .map_err(|e| format!("تعذر إنهاء الجلسة: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_users(state: State<AppState>, session_token: String) -> Result<Vec<UserInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    require_admin_session(&db, Some(&session_token))?;
    let mut stmt = db
        .prepare("SELECT id, username, display_name, profile_image FROM users ORDER BY id")
        .map_err(|e| e.to_string())?;

    let users = stmt
        .query_map([], |row| {
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                display_name: row.get(2)?,
                profile_image: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(users)
}

#[tauri::command]
pub fn add_user(
    state: State<AppState>,
    username: String,
    password: String,
    display_name: String,
    profile_image: Option<String>,
    // CRITICAL-7: mandatory session token for user management
    session_token: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    require_admin_session(&db, Some(&session_token))?;
    let username = username.trim();
    let display_name = display_name.trim();

    if username.is_empty() {
        return Err("اسم المستخدم مطلوب".to_string());
    }
    validate_admin_password(username, &password)?;

    let hash = hash_password(&password).map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))?;

    db.execute(
        "INSERT INTO users (username, password_hash, display_name, profile_image) VALUES (?1, ?2, ?3, ?4)",
        params![username, hash, display_name, profile_image],
    )
    .map_err(|e| format!("فشل إنشاء المستخدم: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn update_user(
    state: State<AppState>,
    id: i64,
    username: String,
    display_name: String,
    profile_image: Option<String>,
    session_token: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    require_admin_session(&db, Some(&session_token))?;
    let username = username.trim();
    let display_name = display_name.trim();

    if username.is_empty() {
        return Err("اسم المستخدم مطلوب".to_string());
    }

    let affected = db.execute(
        "UPDATE users SET username = ?1, display_name = ?2, profile_image = ?3, updated_at = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?4",
        params![username, display_name, profile_image, id],
    )
    .map_err(|e| format!("فشل تحديث المستخدم: {}", e))?;

    if affected == 0 {
        return Err("المستخدم غير موجود".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn change_password(
    state: State<AppState>,
    id: i64,
    new_password: String,
    // CRITICAL-7: mandatory session token for password change
    session_token: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let actor_id = require_admin_session_for_password_change(&db, &session_token)?;
    let (username, actor_must_change): (String, bool) = db
        .query_row(
            "SELECT target.username,
                    COALESCE((SELECT must_change_password FROM users WHERE id=?2),0)
             FROM users target WHERE target.id=?1",
            params![id, actor_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "المستخدم غير موجود".to_string())?;
    if actor_must_change && id != actor_id {
        return Err("يجب تغيير كلمة مرور المدير أولاً".to_string());
    }
    validate_admin_password(&username, &new_password)?;

    let hash = hash_password(&new_password).map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))?;
    let affected = db.execute(
        "UPDATE users SET password_hash = ?1, must_change_password = 0, updated_at = strftime('%Y-%m-%d %H:%M', 'now', 'localtime') WHERE id = ?2",
        params![hash, id],
    )
    .map_err(|e| format!("فشل تغيير كلمة المرور: {}", e))?;

    if affected == 0 {
        return Err("المستخدم غير موجود".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn delete_user(
    state: State<AppState>,
    id: i64,
    // CRITICAL-7: mandatory session token for user deletion
    session_token: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    require_admin_session(&db, Some(&session_token))?;

    // Prevent deleting the protected primary admin user, even after username changes.
    if id == PRIMARY_ADMIN_USER_ID {
        return Err("لا يمكن حذف مستخدم المدير الرئيسي".to_string());
    }

    db.execute("DELETE FROM users WHERE id = ?1", [id])
        .map_err(|e| format!("فشل حذف المستخدم: {}", e))?;

    Ok(())
}
