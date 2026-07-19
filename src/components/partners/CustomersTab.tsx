/**
 * src/components/partners/CustomersTab.tsx
 *
 * FORENSIC FIX (re-audit 2026-07-11, PHASE-4-SPLIT):
 * Sub-component extracted from the monolithic PartnersTab.tsx (4,024 lines).
 *
 * The original PartnersTab renders four sub-tabs (customers / personal /
 * receivables / liabilities) all inside one mega-component. This file is the
 * canonical home for the "customers" sub-tab (الزبائن). The actual render
 * code currently still lives in PartnersTab.tsx; this stub exists to:
 *   1. Document the eventual migration target.
 *   2. Provide a stable import path so other files can `import { CustomersTab }
 *      from "./partners/CustomersTab"` today (it just throws until the actual
 *      code is moved).
 *
 * Migration plan (follow-up task):
 *   - Move the `accountsTab === "customers"` JSX block from PartnersTab.tsx
 *     into this file's CustomersTab function.
 *   - Move all customer-specific state and effects (search, page, dialog
 *     state) along with the JSX.
 *   - Pass shared props (unifiedAccounts, onRefresh, etc.) from PartnersTab.
 *   - Run `npm run typecheck` after the move.
 *
 * Until then, PartnersTab.tsx remains the source of truth for rendering.
 */

import type React from "react";

import type { Partner, UnifiedAccount, Car, PartnerTransaction } from "../../types";

export interface CustomersTabProps {
  partners: Partner[];
  unifiedAccounts: UnifiedAccount[];
  transactions: PartnerTransaction[];
  cars: Car[];
  onRefresh: () => void;
  onNavigateToCar?: (carNumber: string) => void;
}

/**
 * CustomersTab — renders the "customers" (زبائن) sub-tab.
 *
 * NOTE: This is a stub. The actual render logic currently lives in
 * PartnersTab.tsx. When you migrate the code here, remove the throw and
 * replace it with the JSX from PartnersTab.
 */
export function CustomersTab(_props: CustomersTabProps): React.JSX.Element {
  throw new Error(
    "CustomersTab is not yet implemented. The render code still lives in " +
    "PartnersTab.tsx. See the migration plan in this file's header comment."
  );
}
