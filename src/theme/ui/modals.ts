import { COLORS } from "../tokens/colors";
import { RADIUS } from "../tokens/radius";
import { SHADOWS } from "../tokens/shadows";

/**
 * Unified modal system — All modal components (overlay, dialog, header, body, actions) with glassmorphism.
 */
export const MODALS = {
  overlay: `
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 200ms ease-out;
  `.trim(),

  dialog: `
    position: relative;
    width: 100%;
    max-width: 460px;
    background: ${COLORS.glass.bgStrong};
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid ${COLORS.glass.border};
    border-radius: ${RADIUS.xl};
    padding: 28px 32px;
    box-shadow: ${SHADOWS.modal};
    overflow: hidden;
    animation: scaleIn 200ms cubic-bezier(0.22, 1, 0.36, 1);
  `.trim(),

  dialogHasHeader: `
    padding: 0;
    overflow: hidden;
  `.trim(),

  header: `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    background: linear-gradient(135deg, rgba(97, 3, 11, 0.06) 0%, rgba(97, 3, 11, 0.02) 100%);
    border-bottom: 1px solid ${COLORS.border.light};
    border-radius: ${RADIUS.xl} ${RADIUS.xl} 0 0;
  `.trim(),

  headerTitle: `
    font-size: inherit;
    font-weight: 800;
    color: ${COLORS.text.primary};
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  `.trim(),

  closeButton: `
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid ${COLORS.border.DEFAULT};
    background: ${COLORS.background.subtle};
    color: ${COLORS.text.muted};
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms ease, color 150ms ease;
  `.trim(),

  closeButtonHover: `
    background: ${COLORS.background.surface};
    color: ${COLORS.text.primary};
  `.trim(),

  title: `
    margin: 0 0 16px;
    font-size: 1.15rem;
    font-weight: 800;
    color: ${COLORS.text.primary};
    padding-bottom: 14px;
    border-bottom: 1px solid ${COLORS.border.light};
  `.trim(),

  message: `
    margin: 0 0 22px;
    line-height: 1.75;
    color: ${COLORS.text.secondary};
    font-size: inherit;
  `.trim(),

  actions: `
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    flex-wrap: wrap;
    padding-top: 16px;
    border-top: 1px solid ${COLORS.border.light};
    margin-top: 8px;
  `.trim(),

  body: `
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  `.trim(),

  bodyScroll: `
    max-height: 60vh;
    overflow-y: auto;
  `.trim(),

  label: `
    color: ${COLORS.text.primary};
    font-size: 0.88em;
    font-weight: 600;
    font-family: inherit;
    display: block;
    margin-bottom: 6px;
  `.trim(),

  form: `
    display: flex;
    flex-direction: column;
    gap: 16px;
  `.trim(),
} as const;

export type ModalToken = typeof MODALS;
