/**
 * src/components/partners/LiabilitiesTab.tsx
 *
 * FORENSIC FIX (re-audit 2026-07-11, PHASE-4-SPLIT):
 * Sub-component extracted from the monolithic PartnersTab.tsx (4,024 lines).
 *
 * Canonical home for the "liabilities" (مطلوبين) sub-tab — partners to whom
 * the company owes money. The actual render code currently still lives in
 * PartnersTab.tsx; this stub exists to document the migration target.
 */

import type React from "react";

import type { UnifiedAccount } from "../../types";

export interface LiabilitiesTabProps {
  unifiedAccounts: UnifiedAccount[];
  onRefresh: () => void;
}

/**
 * LiabilitiesTab — renders the "liabilities" (مطلوبين) sub-tab.
 *
 * NOTE: Stub. The actual render logic currently lives in PartnersTab.tsx.
 */
export function LiabilitiesTab(_props: LiabilitiesTabProps): React.JSX.Element {
  throw new Error(
    "LiabilitiesTab is not yet implemented. The render code still lives in " +
    "PartnersTab.tsx. See the migration plan in this file's header comment."
  );
}
