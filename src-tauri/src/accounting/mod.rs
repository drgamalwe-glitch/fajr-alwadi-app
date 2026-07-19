//! Core accounting primitives: ledger entries, 50/50 partner split,
//! rebuild helpers, analytical profit calculation.
//!
//! Items are re-exported from `crate::legacy` where the implementation lives.
//! A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    append_audit_event, calculate_analytical_profit, calculate_partner_analytical_profit,
    delete_ledger_entries, delete_partner_transactions_by_source_with_ledger,
    distribute_to_partners_50_with_effects, recalculate_all_partners, record_ledger_entry,
    split_partner_amount_50,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
