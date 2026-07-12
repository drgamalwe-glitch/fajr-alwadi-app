//! Partner and customer commands.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    add_partner, add_partner_transaction, delete_partner, delete_partner_transaction,
    get_cash_register_entries, get_partner_transactions, get_partners, get_partners_totals,
    get_unified_accounts, pay_financier_from_partners, settle_company_through_funder,
    update_partner, update_partner_transaction,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
