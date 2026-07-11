/**
 * Shadow system — Centralized box-shadow values for all elevation levels.
 */
export const SHADOWS = {
  none: "none",
  sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
  DEFAULT: "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
  md: "0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)",
  "2xl": "0 25px 50px rgba(0, 0, 0, 0.25)",
  glass: "0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
  glassStrong: "0 16px 48px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
  glow: "0 0 20px rgba(97, 3, 11, 0.15)",
  focus: "0 0 0 3px rgba(97, 3, 11, 0.15)",
  card: "0 4px 24px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
  modal: "0 24px 64px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
  sidebar: "4px 0 24px rgba(0, 0, 0, 0.06)",
} as const;

export type ShadowToken = typeof SHADOWS;
