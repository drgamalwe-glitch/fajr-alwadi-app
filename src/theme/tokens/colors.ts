/**
 * System color tokens — Single source of truth for all colors in the application.
 * Every color value is derived from these 6 core master colors.
 */

export const COMPANY_STATUS_CARD_COLORS = {
  cash: "#00ffe1ff",
  inventory: "#38bdf8",
  receivables: "#a78bfa",
  liabilities: "#f43f5e",
  qasa: "#ffffffff",
  expenses: "#f97316",
  profit: "#22c55e",
  companyValue: "#eab308",
} as const;

export const MASTER_COLORS = {
  border: "#a3a3a318",
  lable_bg: "#ffffff55",
  lable_opacity_inactive: 0.3,
  lable_opacity_hover: 0.5,
  labletext: "#ffffffff",
  textinputlabletext: "#ffffffff",

  textinputbg: "#00000050",
  textinputtext: "#ffffffff",
  textinputborder: "#ffffff4e",
  textinputfocusborder: "#ffffffff",

  sharikahname: "#ec0000",
  red: "#a00101ff",
  red2: "#960000ff",
  gold: "#d7a538ff",

  bg2: "#ffffff0d",
  bg2blur: "32px",
  bg2saturation: "160%",

  black: "#000000cb",
  white: "#ffffff",
  green: "#03ca4cff",
  monsadilahbg: "#1b1b1bcb",
} as const;

/**
 * Converts a hex color string to rgba format with the specified opacity.
 * Supports #rgb, #rrggbb, and #rrggbbaa formats.
 */
export function toRgba(hex: string, alpha: number): string {
  let cleanHex = hex.replace("#", "").trim();

  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map(char => char + char).join("");
  }

  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hexToRgb(hex: string): string {
  let cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map(char => char + char).join("");
  }
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export const COLORS = {
  // Expose the 6 master colors directly at the root
  ...MASTER_COLORS,
  red2: MASTER_COLORS.red2,
  companyStatusCards: COMPANY_STATUS_CARD_COLORS,

  background: {
    page: toRgba(MASTER_COLORS.bg2, 0.1),
    surface: MASTER_COLORS.bg2,
    surfaceSolid: MASTER_COLORS.bg2,
    input: toRgba(MASTER_COLORS.white, 0.12),
    subtle: toRgba(MASTER_COLORS.black, 0.03),
    card: MASTER_COLORS.bg2,
  },

  text: {
    primary: MASTER_COLORS.white,
    secondary: toRgba(MASTER_COLORS.white, 0.7),
    muted: toRgba(MASTER_COLORS.white, 0.55),
    inverse: MASTER_COLORS.white,
  },

  border: {
    DEFAULT: toRgba(MASTER_COLORS.black, 0.08),
    light: toRgba(MASTER_COLORS.black, 0.04),
    strong: toRgba(MASTER_COLORS.black, 0.15),
    focus: toRgba(MASTER_COLORS.red, 0.4),
  },

  primary: {
    DEFAULT: MASTER_COLORS.red,
    light: toRgba(MASTER_COLORS.red, 0.8),
    dark: toRgba(MASTER_COLORS.red, 0.65),
    deeper: toRgba(MASTER_COLORS.red, 0.3),
    gradient: `linear-gradient(135deg, ${MASTER_COLORS.red} 0%, ${toRgba(MASTER_COLORS.red, 0.6)} 100%)`,
  },

  status: {
    success: MASTER_COLORS.green,
    successBg: toRgba(MASTER_COLORS.green, 0.08),
    successBorder: toRgba(MASTER_COLORS.green, 0.2),
    danger: MASTER_COLORS.red,
    dangerBg: toRgba(MASTER_COLORS.red, 0.08),
    dangerBorder: toRgba(MASTER_COLORS.red, 0.2),
    warning: MASTER_COLORS.gold,
    warningBg: toRgba(MASTER_COLORS.gold, 0.08),
    warningBorder: toRgba(MASTER_COLORS.gold, 0.2),
    info: MASTER_COLORS.bg2,
    infoBg: toRgba(MASTER_COLORS.bg2, 0.08),
    infoBorder: toRgba(MASTER_COLORS.bg2, 0.2),
  },

  financial: {
    capital: MASTER_COLORS.gold,
    capitalBg: toRgba(MASTER_COLORS.gold, 0.08),
    cash: MASTER_COLORS.green,
    cashBg: toRgba(MASTER_COLORS.green, 0.08),
    profit: MASTER_COLORS.green,
    profitBg: toRgba(MASTER_COLORS.green, 0.08),
    expense: MASTER_COLORS.red,
    expenseBg: toRgba(MASTER_COLORS.red, 0.08),
    receivable: MASTER_COLORS.gold,
    receivableBg: toRgba(MASTER_COLORS.gold, 0.08),
    payable: MASTER_COLORS.red,
    payableBg: toRgba(MASTER_COLORS.red, 0.08),
    inventory: MASTER_COLORS.bg2,
    inventoryBg: toRgba(MASTER_COLORS.bg2, 0.08),
    investor: MASTER_COLORS.gold,
    investorBg: toRgba(MASTER_COLORS.gold, 0.08),
    partner: MASTER_COLORS.gold,
    partnerBg: toRgba(MASTER_COLORS.gold, 0.08),
  },

  glass: {
    bg: "color-mix(in srgb, var(--white) 5%, transparent)",
    bgStrong: "color-mix(in srgb, var(--white) 5%, transparent)",
    bgSubtle: "color-mix(in srgb, var(--white) 5%, transparent)",
    border: "color-mix(in srgb, var(--white) 10%, transparent)",
    borderLight: toRgba(MASTER_COLORS.white, 0.06),
    blur: MASTER_COLORS.bg2blur,
    saturation: MASTER_COLORS.bg2saturation,
  },
} as const;

export type ColorToken = typeof COLORS;
