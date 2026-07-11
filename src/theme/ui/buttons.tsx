import { motion, type HTMLMotionProps, type Transition } from "motion/react";
import { forwardRef, type ReactNode } from "react";

// ── Unified Button Motion Config ───────────────────────────────────────────
// All button animations are defined here. Change values to update ALL buttons.

export const BUTTON_MOTION = {
  spring: {
    type: "spring" as const,
    stiffness: 300,
    damping: 20,
    mass: 0.4,
  } satisfies Transition,

  hoverScale: {
    scale: 1.02,
    y: -1,
  },

  tapScale: {
    scale: 0.98,
  },

  tapPress: {
    scale: 0.97,
    filter: "brightness(0.92)",
  },

  sidebarHover: {
    translateX: -4,
  },

  sidebarTap: {
    scale: 0.98,
  },

  goldFxTap: {
    scale: 0.97,
  },
} as const;

export type ButtonMotionToken = typeof BUTTON_MOTION;

// ── ButtonMotion Component ─────────────────────────────────────────────────
// Wraps motion.button with unified hover/tap animations.

export type ButtonMotionProps = HTMLMotionProps<"button"> & {
  children?: ReactNode;
};

const ButtonMotion = forwardRef<HTMLButtonElement, ButtonMotionProps>(
  ({ children, whileHover, whileTap, transition, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileHover={props.disabled ? undefined : (whileHover ?? BUTTON_MOTION.hoverScale)}
      whileTap={props.disabled ? undefined : (whileTap ?? BUTTON_MOTION.tapScale)}
      transition={transition ?? BUTTON_MOTION.spring}
      {...props}
    >
      {children}
    </motion.button>
  ),
);

ButtonMotion.displayName = "ButtonMotion";
export { ButtonMotion };
