/**
 * src/components/partners/index.ts
 *
 * Barrel export for the partners sub-component directory.
 *
 * FORENSIC FIX (re-audit 2026-07-11, PHASE-4-SPLIT):
 * The four sub-tabs of PartnersTab are being migrated here one at a time.
 * Until the migration is complete, PartnersTab.tsx remains the source of
 * truth for rendering. After migration, PartnersTab.tsx will be a thin
 * shell that delegates to these four sub-components.
 */

export { CustomersTab } from "./CustomersTab";
export type { CustomersTabProps } from "./CustomersTab";
export { PersonalTab } from "./PersonalTab";
export type { PersonalTabProps } from "./PersonalTab";
export { ReceivablesTab } from "./ReceivablesTab";
export type { ReceivablesTabProps } from "./ReceivablesTab";
export { LiabilitiesTab } from "./LiabilitiesTab";
export type { LiabilitiesTabProps } from "./LiabilitiesTab";
