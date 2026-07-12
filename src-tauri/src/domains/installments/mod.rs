//! Customer installment commands.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    get_customer_installments, pay_customer_installment, pay_customer_installment_core,
    preview_installment_payment_redistribution, recalculate_installment_schedule,
    reverse_customer_installment_payment, set_customer_installment_status,
    update_customer_sale_down_payment,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
