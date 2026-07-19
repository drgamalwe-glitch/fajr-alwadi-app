//! Misc Tauri commands: Excel export, WhatsApp, PDF, backgrounds.
//!
// FORENSIC FIX (re-audit 2026-07-11, PHASE-3-RESTRUCTURE):
// These items currently live in `crate::legacy`. They are re-exported here
// so callers can use the canonical domain path (e.g. `crate::db::AppState`).
// A follow-up task should physically move each item into this file.

pub use crate::legacy::{
    delete_background, export_database_to_excel, get_backgrounds, get_selected_background,
    open_temp_pdf, open_whatsapp, rename_background, set_selected_background,
};

// Items not yet enumerated are still accessible via `crate::legacy::*`.
