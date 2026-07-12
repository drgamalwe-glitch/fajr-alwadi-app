//! Reporting and aggregation commands.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    get_financial_summary, get_partners_totals, get_profit_distribution_summary,
    get_unified_accounts,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
