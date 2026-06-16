/**
 * Unified radius system — Controls all border radius values across buttons, cards, inputs, modals, and containers.
 */

// Single master variable for all border radius values in the program
export const MASTER_RADIUS = "8px";

export const RADIUS = {
  none: "0",
  sm: MASTER_RADIUS,
  md: MASTER_RADIUS,
  lg: MASTER_RADIUS,
  xl: MASTER_RADIUS,
  "2xl": MASTER_RADIUS,
  full: "999px",
} as const;

export type RadiusToken = typeof RADIUS;
