/**
 * System color tokens — Single source of truth for all colors in the application.
 * Every color value is derived from these 6 core master colors.
 */

export const MASTER_COLORS = {
  border: "#ffffff4e",
  lable_bg: "#f6f6f6af",
  lable_opacity_inactive: 0.3,
  lable_opacity_hover: 0.5,
  labletext: "#303030ff",
  textinputlabletext: "#262626ff",

  textinputbg: "#ffffff50",
  textinputtext: "#303030ff",
  textinputborder: "#ffffff4e",
  textinputfocusborder: "#ffffffff",

  sharikahname: "#ec0000",
  red: "#ec0000",
  red2: "#960000ff",
  gold: "#ffae00ff",

  bg2: "#ffffff1a",
  bg2blur: "20px",
  bg2saturation: "180%",

  black: "#000000cb",
  white: "#ffffff",
  green: "#22c55e",
  monsadilahbg: "#ffffffcb",
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
    bg: toRgba(MASTER_COLORS.bg2, 0.65),
    bgStrong: toRgba(MASTER_COLORS.bg2, 0.75),
    bgSubtle: toRgba(MASTER_COLORS.bg2, 0.45),
    border: toRgba(MASTER_COLORS.white, 0.12),
    borderLight: toRgba(MASTER_COLORS.white, 0.06),
    blur: "20px",
    saturation: "180%",
  },
} as const;

export type ColorToken = typeof COLORS;
