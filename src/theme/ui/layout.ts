import { COLORS } from "../tokens/colors";
import { RADIUS } from "../tokens/radius";

/**
 * Layout system — Centralized layout tokens for app shell, grid, and content areas.
 */
export const LAYOUT = {
  app: `
    position: relative;
    height: 100%;
    overflow: hidden;
    padding: 18px 22px 22px;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr auto;
    gap: 18px;
  `.trim(),

  sidebar: `
    position: relative;
    align-self: stretch;
    width: 340px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 12px;
    margin-bottom: 0px;
    border-radius: ${RADIUS.sm};
    border: 1px solid ${COLORS.border.DEFAULT};
    background: ${COLORS.glass.bgStrong};
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
    overflow: hidden;
    z-index: 10;
  `.trim(),

  content: `
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    overflow: hidden;
    flex: 1;
  `.trim(),

  footer: `
    grid-column: 1 / -1;
    margin-top: auto;
    padding: 10px 24px;
    border-radius: ${RADIUS.lg};
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: ${COLORS.primary.DEFAULT};
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.07);
    flex-wrap: wrap;
  `.trim(),
} as const;

export type LayoutToken = typeof LAYOUT;
