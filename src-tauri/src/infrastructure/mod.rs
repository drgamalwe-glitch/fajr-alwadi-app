//! Infrastructure: backup, restore, export, file ops.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

// Items not yet enumerated are still accessible via `crate::legacy::*`.

pub mod backup;
pub mod commands;
