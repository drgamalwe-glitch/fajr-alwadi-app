/**
 * src/components/partners/PersonalTab.tsx
 *
 * FORENSIC FIX (re-audit 2026-07-11, PHASE-4-SPLIT):
 * Sub-component extracted from the monolithic PartnersTab.tsx (4,024 lines).
 *
 * Canonical home for the "personal" (الشركاء) sub-tab. The actual render
 * code currently still lives in PartnersTab.tsx; this stub exists to
 * document the migration target and provide a stable import path.
 *
 * Migration plan (follow-up task):
 *   - Move the `accountsTab === "personal"` (sharikListView === true)
 *     JSX block from PartnersTab.tsx into this file.
 *   - Move all partner-specific state (sharikPage, partnersSearch,
 *     partnerToView) and effects along with the JSX.
 *   - Pass shared props from PartnersTab.
 *
 * Until then, PartnersTab.tsx remains the source of truth for rendering.
 */

import type React from "react";

import type { Partner, PartnerTransaction } from "../../types";

export interface PersonalTabProps {
  partners: Partner[];
  transactions: PartnerTransaction[];
  onRefresh: () => void;
}

/**
 * PersonalTab — renders the "personal" (الشركاء) sub-tab.
 *
 * NOTE: Stub. The actual render logic currently lives in PartnersTab.tsx.
 */
export function PersonalTab(_props: PersonalTabProps): React.JSX.Element {
  throw new Error(
    "PersonalTab is not yet implemented. The render code still lives in " +
    "PartnersTab.tsx. See the migration plan in this file's header comment."
  );
}
