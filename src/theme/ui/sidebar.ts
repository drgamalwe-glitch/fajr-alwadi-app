import { COLORS } from "../tokens/colors";
import { RADIUS } from "../tokens/radius";
import { SHADOWS } from "../tokens/shadows";

/**
 * Sidebar system — Centralized sidebar styles with glass appearance, red active indicator, and soft hover states.
 */
export const SIDEBAR = {
  container: `
    position: relative;
    width: 300px;
    display: flex;
    flex-direction: column;
    padding: 20px 12px;
    background: ${COLORS.glass.bgStrong};
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-right: 1px solid ${COLORS.glass.border};
    border-radius: ${RADIUS.lg};
    box-shadow: ${SHADOWS.sidebar};
    overflow: hidden;
  `.trim(),

  header: `
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: center;
    padding-bottom: 14px;
    margin-bottom: 10px;
    border-bottom: 1px solid ${COLORS.border.light};
  `.trim(),

  nav: `
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
  `.trim(),

  item: `
    position: relative;
    width: 100%;
    height: 46px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border-radius: ${RADIUS.md};
    background: transparent;
    border: 1px solid transparent;
    color: ${COLORS.text.muted};
    font-size: inherit;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: all 200ms ease;
    text-align: right;
    direction: rtl;
    overflow: hidden;
  `.trim(),

  itemHover: `
    background: ${COLORS.background.subtle};
    color: ${COLORS.text.primary};
    border-color: ${COLORS.border.light};
  `.trim(),

  itemActive: `
    background: linear-gradient(135deg, rgba(97, 3, 11, 0.08) 0%, rgba(97, 3, 11, 0.03) 100%);
    color: ${COLORS.text.inverse};
    border-color: rgba(97, 3, 11, 0.2);
  `.trim(),

  itemActiveBar: `
    position: absolute;
    right: 0;
    top: 20%;
    height: 60%;
    width: 3px;
    border-radius: var(--all-radius) 0 0 var(--all-radius);
    background: ${COLORS.primary.DEFAULT};
  `.trim(),

  icon: `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--all-radius);
    font-size: 18px;
    flex-shrink: 0;
    background: ${COLORS.background.subtle};
    transition: background 200ms ease, color 200ms ease;
  `.trim(),

  iconActive: `
    background: rgba(97, 3, 11, 0.12);
    color: ${COLORS.primary.DEFAULT};
  `.trim(),

  label: `
    flex: 1;
    text-align: right;
    letter-spacing: 0.01em;
  `.trim(),

  divider: `
    height: 1px;
    background: ${COLORS.border.light};
    margin: 12px 8px;
  `.trim(),

  quickActions: `
    margin-top: auto;
    padding: 20px 0 10px;
    border-top: 1px solid ${COLORS.border.light};
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  `.trim(),
} as const;

export type SidebarToken = typeof SIDEBAR;
