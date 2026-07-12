//! Database initialization, AppState, Connection, and PRAGMA settings.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{init_db, init_db_for_test, AppState};

// `init_db_for_test` is feature-gated behind `accounting-test-support` in
// legacy.rs. Re-export it conditionally so non-test builds don't fail.

// Items not yet enumerated are still accessible via `crate::legacy::*`.
