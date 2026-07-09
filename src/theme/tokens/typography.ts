/**
 * Typography system — Centralized font families, weights, sizes, line heights, and letter spacing.
 * All text styling must derive from these tokens.
 */
export const TYPOGRAPHY = {
  fontFamily: {
    sans: ["Cairo", "Tajawal", "IBM Plex Sans Arabic", "Segoe UI", "system-ui", "sans-serif"],
    mono: ["Tajawal"],
  },
  fontWeight: {
    normal: 400,
    medium: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
  fontSize: {
    xs: "0.78em",
    sm: "0.88em",
    base: "1.3rem",
    md: "1.1em",
    lg: "1.29em",
    xl: "1.57em",
    xxl: "2.1em",
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.65,
    loose: 1.85,
  },
  letterSpacing: {
    tight: "-0.02em",
    normal: "0",
    wide: "0.02em",
    wider: "0.05em",
  },
} as const;

export type TypographyToken = typeof TYPOGRAPHY;
