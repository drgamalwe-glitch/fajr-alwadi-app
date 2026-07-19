//! Expense (general + car-specific) commands.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    add_expense, apply_car_expense_changes, delete_expense, get_car_expense_records, get_expenses,
    update_expense,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
