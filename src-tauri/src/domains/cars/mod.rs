//! Car lifecycle commands: add, sell (cash/installment), update, delete.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    add_car, delete_car, delete_car_purchase_ledger_entries, delete_car_sale_ledger_entries,
    get_cars, rebuild_cash_sale_profit_recognition, rebuild_sold_car_accounting_after_cost_change,
    record_car_sale_ledger_entries, save_and_sell_car_with_accounting, sell_car_with_accounting,
    update_sold_car_with_accounting,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
