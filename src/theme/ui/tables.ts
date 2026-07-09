import { COLORS } from "../tokens/colors";
import { RADIUS } from "../tokens/radius";

/**
 * Table system — Centralized table styles with glass backgrounds, premium borders, sticky headers, zebra rows, and hover effects.
 */
export const TABLES = {
  wrapper: `
    background: transparent;
    border: 1px solid ${COLORS.border.DEFAULT};
    border-radius: ${RADIUS.lg};
    overflow: hidden;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  `.trim(),

  container: `
    background: ${COLORS.glass.bg};
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  `.trim(),

  table: `
    width: 100%;
    border-collapse: collapse;
    background: transparent;
  `.trim(),

  th: `
    background: ${COLORS.primary.DEFAULT};
    color: ${COLORS.text.inverse};
    font-weight: 700;
    padding: 12px 14px;
    text-align: center;
    border-bottom: 1px solid ${COLORS.border.DEFAULT};
    position: sticky;
    top: 0;
    z-index: 1;
  `.trim(),

  thSorted: `
    background: rgba(97, 3, 11, 0.9);
    color: ${COLORS.financial.receivable};
  `.trim(),

  td: `
    color: ${COLORS.text.primary};
    padding: 10px 14px;
    text-align: center;
    border-bottom: 1px solid ${COLORS.border.light};
    transition: background 150ms ease;
  `.trim(),

  trHover: `
    background: ${COLORS.background.subtle};
  `.trim(),

  trEven: `
    background: rgba(0, 0, 0, 0.015);
  `.trim(),

  cellNum: `
    direction: ltr;
    unicode-bidi: embed;
    text-align: left;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  `.trim(),

  cellBold: `
    font-weight: 800;
    color: ${COLORS.text.primary};
  `.trim(),

  cellSub: `
    font-size: 0.78em;
    color: ${COLORS.text.muted};
    margin-top: 2px;
    direction: ltr;
    unicode-bidi: embed;
  `.trim(),

  pagination: `
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 12px 0;
    background: transparent;
  `.trim(),

  paginationDot: `
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.15);
    border: none;
    cursor: pointer;
    transition: all 200ms ease;
    padding: 0;
  `.trim(),

  paginationDotActive: `
    background: ${COLORS.primary.DEFAULT};
    transform: scale(1.3);
  `.trim(),

  emptyState: `
    text-align: center;
    padding: 48px 24px;
    color: ${COLORS.text.muted};
    font-size: inherit;
  `.trim(),
} as const;

export type TableToken = typeof TABLES;
