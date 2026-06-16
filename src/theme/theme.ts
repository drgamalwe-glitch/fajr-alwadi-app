import { COLORS, MASTER_COLORS, toRgba, hexToRgb } from "./tokens/colors";
import { TYPOGRAPHY } from "./tokens/typography";
import { RADIUS } from "./tokens/radius";
import { SPACING } from "./tokens/spacing";
import { SHADOWS } from "./tokens/shadows";
import { MOTION } from "./tokens/motion";
import { GLASS } from "./glass/glass";
import { BUTTON_MOTION } from "./ui/buttons";
import { CARDS } from "./ui/cards";
import { INPUTS } from "./ui/inputs";
import { TABLES } from "./ui/tables";
import { MODALS } from "./ui/modals";
import { SIDEBAR } from "./ui/sidebar";

/**
 * Theme engine — Aggregates all design tokens into a single source of truth.
 * Changing a token here updates the entire application's visual identity.
 */
export const THEME = {
  colors: COLORS,
  typography: TYPOGRAPHY,
  radius: RADIUS,
  spacing: SPACING,
  shadows: SHADOWS,
  motion: MOTION,
  glass: GLASS,
  buttons: BUTTON_MOTION,
  cards: CARDS,
  inputs: INPUTS,
  tables: TABLES,
  modals: MODALS,
  sidebar: SIDEBAR,
} as const;

export type Theme = typeof THEME;

/**
 * Dynamically synchronizes theme tokens to CSS custom properties on :root.
 * This ensures the theme system remains the absolute single source of truth.
 */
export function syncThemeToCSS() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  // Sync Master Colors
  root.style.setProperty("--red", THEME.colors.red);
  root.style.setProperty("--gold", THEME.colors.gold);
  root.style.setProperty("--bg2", THEME.colors.bg2);
  root.style.setProperty("--black", THEME.colors.black);
  root.style.setProperty("--white", THEME.colors.white);
  root.style.setProperty("--green", THEME.colors.green);
  root.style.setProperty("--red2", THEME.colors.red2);
  root.style.setProperty("--border-master", MASTER_COLORS.border);
  root.style.setProperty("--lable-bg", MASTER_COLORS.lable_bg);
  root.style.setProperty("--labletext", MASTER_COLORS.labletext);
  root.style.setProperty("--lable-opacity-inactive", String(MASTER_COLORS.lable_opacity_inactive));
  root.style.setProperty("--lable-opacity-hover", String(MASTER_COLORS.lable_opacity_hover));
  root.style.setProperty("--monsadilahbg", MASTER_COLORS.monsadilahbg);

  // Sync Status Colors
  root.style.setProperty("--red-600", THEME.colors.status.danger);
  root.style.setProperty("--red-bg", THEME.colors.status.dangerBg);
  root.style.setProperty("--red-bd", THEME.colors.status.dangerBorder);
  root.style.setProperty("--green-bg", THEME.colors.status.successBg);
  root.style.setProperty("--green-bd", THEME.colors.status.successBorder);
  root.style.setProperty("--amber", THEME.colors.status.warning);
  root.style.setProperty("--amber-bg", THEME.colors.status.warningBg);
  root.style.setProperty("--amber-bd", THEME.colors.status.warningBorder);
  root.style.setProperty("--blue", THEME.colors.status.info);
  root.style.setProperty("--blue-bg", THEME.colors.status.infoBg);
  root.style.setProperty("--blue-bd", THEME.colors.status.infoBorder);

  // Sync Typography Text Colors
  root.style.setProperty("--text-primary", THEME.colors.text.primary);
  root.style.setProperty("--text-secondary", THEME.colors.text.secondary);
  root.style.setProperty("--text-muted", THEME.colors.text.muted);

  // Sync Financial Colors
  root.style.setProperty("--fin-capital", THEME.colors.financial.capital);
  root.style.setProperty("--fin-cash", THEME.colors.financial.cash);
  root.style.setProperty("--fin-profit", THEME.colors.financial.profit);
  root.style.setProperty("--fin-expense", THEME.colors.financial.expense);
  root.style.setProperty("--fin-receivable", THEME.colors.financial.receivable);
  root.style.setProperty("--fin-payable", THEME.colors.financial.payable);
  root.style.setProperty("--fin-inventory", THEME.colors.financial.inventory);
  root.style.setProperty("--fin-investor", THEME.colors.financial.investor);
  root.style.setProperty("--fin-partner", THEME.colors.financial.partner);

  // Sync Border Radius Values
  root.style.setProperty("--all-radius", THEME.radius.md);
  root.style.setProperty("--base-radius", THEME.radius.md);
  root.style.setProperty("--input-border-radius", THEME.radius.md);
  root.style.setProperty("--btn-radius", THEME.radius.md);
  root.style.setProperty("--r-xs", THEME.radius.sm);
  root.style.setProperty("--r-sm", THEME.radius.md);
  root.style.setProperty("--r-md", THEME.radius.lg);
  root.style.setProperty("--r-lg", THEME.radius.xl);

  // Sync Shadows
  root.style.setProperty("--shadow-sm", THEME.shadows.sm);
  root.style.setProperty("--shadow-md", THEME.shadows.md);
  root.style.setProperty("--shadow-lg", THEME.shadows.lg);
  root.style.setProperty("--shadow-xl", THEME.shadows.xl);
  root.style.setProperty("--shadow-glass", THEME.shadows.glass);
  root.style.setProperty("--shadow-card", THEME.shadows.card);
  root.style.setProperty("--shadow-modal", THEME.shadows.modal);
  root.style.setProperty("--shadow-sidebar", THEME.shadows.sidebar);

  // Sync Monbathiqa (Popup/Modal) Colors from MASTER_COLORS
  root.style.setProperty("--mb-accent", MASTER_COLORS.gold);
  root.style.setProperty("--mb-accent-rgb", hexToRgb(MASTER_COLORS.gold));
  root.style.setProperty("--mb-danger", MASTER_COLORS.red);
  root.style.setProperty("--mb-danger-rgb", hexToRgb(MASTER_COLORS.red));
  root.style.setProperty("--mb-success", MASTER_COLORS.green);
  root.style.setProperty("--mb-success-rgb", hexToRgb(MASTER_COLORS.green));
  root.style.setProperty("--mb-text", MASTER_COLORS.white);
  root.style.setProperty("--mb-text-secondary", toRgba(MASTER_COLORS.white, 0.7));
  root.style.setProperty("--mb-text-muted", toRgba(MASTER_COLORS.white, 0.45));
  root.style.setProperty("--mb-text-label", toRgba(MASTER_COLORS.white, 0.55));
  root.style.setProperty("--mb-overlay-bg", MASTER_COLORS.bg2);
  root.style.setProperty("--mb-overlay-blur", "12px");
  root.style.setProperty("--mb-dialog-bg", toRgba(MASTER_COLORS.black, 0.36));
  root.style.setProperty("--mb-dialog-bg-gradient-1", toRgba(MASTER_COLORS.white, 0.04));
  root.style.setProperty("--mb-dialog-bg-gradient-2", toRgba(MASTER_COLORS.white, 0.01));
  root.style.setProperty("--mb-dialog-border", `1px solid ${toRgba(MASTER_COLORS.white, 0.1)}`);
  root.style.setProperty("--mb-dialog-radius", "20px");
  root.style.setProperty("--mb-dialog-shadow", `0 32px 80px rgba(0,0,0,0.6), 0 0 50px ${toRgba(MASTER_COLORS.gold, 0.08)}, inset 0 1px 0 ${toRgba(MASTER_COLORS.white, 0.06)}`);
  root.style.setProperty("--mb-dialog-blur", "24px");
  root.style.setProperty("--mb-dialog-padding", "28px 32px");
  root.style.setProperty("--mb-dialog-max-width", "520px");
  root.style.setProperty("--mb-dialog-max-height", "85vh");
  root.style.setProperty("--mb-header-bg", `linear-gradient(135deg, ${toRgba(MASTER_COLORS.gold, 0.06)} 0%, ${toRgba(MASTER_COLORS.gold, 0.01)} 100%)`);
  root.style.setProperty("--mb-header-border", `1px solid ${toRgba(MASTER_COLORS.white, 0.06)}`);
  root.style.setProperty("--mb-header-padding", "18px 28px");
  root.style.setProperty("--mb-header-radius", "20px 20px 0 0");
  root.style.setProperty("--mb-title-color", MASTER_COLORS.gold);
  root.style.setProperty("--mb-title-size", "1.15rem");
  root.style.setProperty("--mb-title-weight", "800");
  root.style.setProperty("--mb-close-bg", toRgba(MASTER_COLORS.white, 0.04));
  root.style.setProperty("--mb-close-border", `1px solid ${toRgba(MASTER_COLORS.white, 0.08)}`);
  root.style.setProperty("--mb-close-color", toRgba(MASTER_COLORS.white, 0.5));
  root.style.setProperty("--mb-close-hover-bg", toRgba(MASTER_COLORS.white, 0.1));
  root.style.setProperty("--mb-close-hover-color", MASTER_COLORS.white);
  root.style.setProperty("--mb-body-padding", "24px 28px");
  root.style.setProperty("--mb-section-bg", toRgba(MASTER_COLORS.white, 0.02));
  root.style.setProperty("--mb-section-border", `1px solid ${toRgba(MASTER_COLORS.white, 0.05)}`);
  root.style.setProperty("--mb-section-radius", "14px");
  root.style.setProperty("--mb-section-padding", "22px 24px");
  root.style.setProperty("--mb-section-title-size", "0.82rem");
  root.style.setProperty("--mb-section-title-weight", "700");
  root.style.setProperty("--mb-field-label-size", "0.8rem");
  root.style.setProperty("--mb-field-label-color", MASTER_COLORS.textinputlabletext);
  root.style.setProperty("--mb-field-label-weight", "700");
  root.style.setProperty("--mb-field-height", "44px");
  root.style.setProperty("--mb-field-bg", toRgba(MASTER_COLORS.white, 0.04));
  root.style.setProperty("--mb-field-border", `1px solid ${toRgba(MASTER_COLORS.white, 0.08)}`);
  root.style.setProperty("--mb-field-radius", "12px");
  root.style.setProperty("--mb-field-text-color", MASTER_COLORS.textinputtext);
  root.style.setProperty("--mb-field-focus-border", MASTER_COLORS.gold);
  root.style.setProperty("--mb-field-focus-shadow", `0 0 0 3px ${toRgba(MASTER_COLORS.gold, 0.15)}, 0 4px 12px rgba(0,0,0,0.2)`);
  root.style.setProperty("--mb-btn-height", "48px");
  root.style.setProperty("--mb-btn-radius", "12px");
  root.style.setProperty("--mb-btn-font-weight", "700");
  root.style.setProperty("--mb-btn-gap", "8px");
  root.style.setProperty("--mb-btn-confirm-bg", MASTER_COLORS.green);
  root.style.setProperty("--mb-btn-confirm-text", MASTER_COLORS.white);
  root.style.setProperty("--mb-btn-confirm-border", `1px solid ${toRgba(MASTER_COLORS.green, 0.3)}`);
  root.style.setProperty("--mb-btn-confirm-shadow", `0 4px 16px ${toRgba(MASTER_COLORS.green, 0.25)}`);
  root.style.setProperty("--mb-btn-danger-bg", MASTER_COLORS.red);
  root.style.setProperty("--mb-btn-danger-text", MASTER_COLORS.white);
  root.style.setProperty("--mb-btn-danger-border", `1px solid ${toRgba(MASTER_COLORS.red, 0.3)}`);
  root.style.setProperty("--mb-btn-danger-shadow", `0 4px 16px ${toRgba(MASTER_COLORS.red, 0.25)}`);
  root.style.setProperty("--mb-btn-cancel-bg", toRgba(MASTER_COLORS.white, 0.06));
  root.style.setProperty("--mb-btn-cancel-text", toRgba(MASTER_COLORS.white, 0.7));
  root.style.setProperty("--mb-btn-cancel-border", `1px solid ${toRgba(MASTER_COLORS.white, 0.1)}`);
  root.style.setProperty("--mb-btn-cancel-hover-bg", toRgba(MASTER_COLORS.white, 0.1));
  root.style.setProperty("--mb-search-width", "600px");
  root.style.setProperty("--mb-search-input-height", "52px");
  root.style.setProperty("--mb-search-result-hover", toRgba(MASTER_COLORS.gold, 0.08));
  root.style.setProperty("--mb-search-result-active", toRgba(MASTER_COLORS.gold, 0.14));
  root.style.setProperty("--mb-search-result-border", "3px solid transparent");
  root.style.setProperty("--mb-search-result-active-border", MASTER_COLORS.gold);
  root.style.setProperty("--mb-search-mark-bg", MASTER_COLORS.gold);
  root.style.setProperty("--mb-search-mark-color", MASTER_COLORS.white);
  root.style.setProperty("--mb-anim-duration", "0.3s");
  root.style.setProperty("--mb-anim-ease", "cubic-bezier(0.22, 1, 0.36, 1)");
  root.style.setProperty("--textinputbg", MASTER_COLORS.textinputbg);
  root.style.setProperty("--textinputtext", MASTER_COLORS.textinputtext);
  root.style.setProperty("--textinputlabletext", MASTER_COLORS.textinputlabletext);
  root.style.setProperty("--textinputborder", MASTER_COLORS.textinputborder);
  root.style.setProperty("--textinputfocusborder", MASTER_COLORS.textinputfocusborder);
}
