import { COLORS } from "../tokens/colors";
import { RADIUS } from "../tokens/radius";
import { SHADOWS } from "../tokens/shadows";

/**
 * Card system — Centralized card variants (base, dashboard, financial, inventory) with glass backgrounds.
 */
const base = `
  background: ${COLORS.glass.bg};
  backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
  -webkit-backdrop-filter: blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation});
  border: 1px solid ${COLORS.glass.border};
  border-radius: ${RADIUS.lg};
  box-shadow: ${SHADOWS.card};
  transition: filter 200ms ease, box-shadow 200ms ease;
`.trim();

export const CARDS = {
  base,

  hover: `
    filter: brightness(1.03);
    box-shadow: ${SHADOWS.lg};
  `.trim(),

  stat: `
    ${base}
    padding: 24px 20px;
    text-align: center;
  `.trim(),

  statHover: `
    filter: brightness(1.05);
    box-shadow: ${SHADOWS.lg};
  `.trim(),

  panel: `
    ${base}
    padding: 26px;
  `.trim(),

  panelHover: `
    filter: brightness(1.02);
  `.trim(),

  form: `
    ${base}
    padding: 24px;
  `.trim(),

  formHover: `
    filter: brightness(1.02);
  `.trim(),

  toolbar: `
    background: ${COLORS.glass.bgSubtle};
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid ${COLORS.glass.borderLight};
    border-radius: ${RADIUS.lg};
    box-shadow: ${SHADOWS.glass};
  `.trim(),

  table: `
    background: transparent;
    border: 1px solid ${COLORS.border.DEFAULT};
    border-radius: ${RADIUS.lg};
    overflow: hidden;
  `.trim(),

  detail: `
    ${base}
    padding: 24px;
    position: sticky;
    top: 22px;
  `.trim(),

  accentCapital: `
    ${base}
    border-top: 3px solid ${COLORS.financial.capital};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.capitalBg} 100%);
  `.trim(),

  accentCash: `
    ${base}
    border-top: 3px solid ${COLORS.financial.cash};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.cashBg} 100%);
  `.trim(),

  accentProfit: `
    ${base}
    border-top: 3px solid ${COLORS.financial.profit};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.profitBg} 100%);
  `.trim(),

  accentExpense: `
    ${base}
    border-top: 3px solid ${COLORS.financial.expense};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.expenseBg} 100%);
  `.trim(),

  accentReceivable: `
    ${base}
    border-top: 3px solid ${COLORS.financial.receivable};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.receivableBg} 100%);
  `.trim(),

  accentPayable: `
    ${base}
    border-top: 3px solid ${COLORS.financial.payable};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.payableBg} 100%);
  `.trim(),

  accentInventory: `
    ${base}
    border-top: 3px solid ${COLORS.financial.inventory};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.inventoryBg} 100%);
  `.trim(),

  accentInvestor: `
    ${base}
    border-top: 3px solid ${COLORS.financial.investor};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.investorBg} 100%);
  `.trim(),

  accentPartner: `
    ${base}
    border-top: 3px solid ${COLORS.financial.partner};
    background: linear-gradient(145deg, ${COLORS.glass.bg} 0%, ${COLORS.financial.partnerBg} 100%);
  `.trim(),
} as const;

export type CardToken = typeof CARDS;
