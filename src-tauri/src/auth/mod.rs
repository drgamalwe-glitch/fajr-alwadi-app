//! Authentication, sessions, and user management.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    add_user, change_password, cleanup_expired_sessions, clear_login_attempts,
    count_recent_login_attempts, create_session, delete_user, get_users, hash_password, login,
    logout, record_failed_login_attempt, require_admin_session, update_user, verify_password,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
