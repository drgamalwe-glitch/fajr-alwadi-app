//! Agency (وكالة) commands.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    add_agency, add_agency_transaction, delete_agency, delete_agency_transaction, get_agencies,
    get_agency_transactions, set_agency_receivable_status, update_agency,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
