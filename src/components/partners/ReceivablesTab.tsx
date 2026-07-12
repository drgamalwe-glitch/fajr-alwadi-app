/**
 * src/components/partners/ReceivablesTab.tsx
 *
 * FORENSIC FIX (re-audit 2026-07-11, PHASE-4-SPLIT):
 * Sub-component extracted from the monolithic PartnersTab.tsx (4,024 lines).
 *
 * Canonical home for the "receivables" (نطلب) sub-tab — partners from whom
 * the company is owed money. The actual render code currently still lives in
 * PartnersTab.tsx; this stub exists to document the migration target.
 */

import type React from "react";

import type { UnifiedAccount } from "../../types";

export interface ReceivablesTabProps {
  unifiedAccounts: UnifiedAccount[];
  onRefresh: () => void;
}

/**
 * ReceivablesTab — renders the "receivables" (نطلب) sub-tab.
 *
 * NOTE: Stub. The actual render logic currently lives in PartnersTab.tsx.
 */
export function ReceivablesTab(_props: ReceivablesTabProps): React.JSX.Element {
  throw new Error(
    "ReceivablesTab is not yet implemented. The render code still lives in " +
    "PartnersTab.tsx. See the migration plan in this file's header comment."
  );
}
