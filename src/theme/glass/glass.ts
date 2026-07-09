import { COLORS } from "../tokens/colors";
import { SHADOWS } from "../tokens/shadows";

/**
 * Glassmorphism system — Pre-composed glass effect styles for cards, modals, sidebars, tables, and overlays.
 */
export const GLASS = {
  card: `
    background: ${COLORS.glass.bg};
    backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    -webkit-backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    border: 1px solid ${COLORS.glass.border};
    box-shadow: ${SHADOWS.glass};
  `.trim(),

  cardStrong: `
    background: ${COLORS.glass.bgStrong};
    backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    -webkit-backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    border: 1px solid ${COLORS.glass.border};
    box-shadow: ${SHADOWS.glassStrong};
  `.trim(),

  cardSubtle: `
    background: ${COLORS.glass.bgSubtle};
    backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    -webkit-backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    border: 1px solid ${COLORS.glass.borderLight};
    box-shadow: ${SHADOWS.glass};
  `.trim(),

  sidebar: `
    background: ${COLORS.glass.bgStrong};
    backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    -webkit-backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    border-right: 1px solid ${COLORS.glass.border};
    box-shadow: ${SHADOWS.sidebar};
  `.trim(),

  modal: `
    background: ${COLORS.glass.bgStrong};
    backdrop-filter: blur(24px) saturate(${COLORS.glass.saturation});
    -webkit-backdrop-filter: blur(24px) saturate(${COLORS.glass.saturation});
    border: 1px solid ${COLORS.glass.border};
    box-shadow: ${SHADOWS.modal};
  `.trim(),

  input: `
    background: ${COLORS.background.input};
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid ${COLORS.border.DEFAULT};
  `.trim(),

  toolbar: `
    background: ${COLORS.glass.bgSubtle};
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid ${COLORS.glass.borderLight};
    box-shadow: ${SHADOWS.glass};
  `.trim(),

  table: `
    background: ${COLORS.glass.bg};
    backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
    -webkit-backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
  `.trim(),

  overlay: `
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  `.trim(),
} as const;

export type GlassToken = typeof GLASS;
