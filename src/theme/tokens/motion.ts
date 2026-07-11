/**
 * Motion system — All animation durations, easings, transitions, and keyframes.
 */
export const MOTION = {
  duration: {
    fast: "150ms",
    normal: "200ms",
    slow: "300ms",
    slower: "400ms",
    slowest: "500ms",
  },
  easing: {
    DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
    linear: "linear",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    elastic: "cubic-bezier(0.22, 1, 0.36, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  transition: {
    colors: "color 200ms, background-color 200ms, border-color 200ms",
    opacity: "opacity 200ms",
    shadow: "box-shadow 200ms",
    transform: "transform 200ms",
    all: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
    fast: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
    slow: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
  },
  keyframes: {
    fadeIn: "fadeIn 200ms ease-out",
    fadeInUp: "fadeInUp 300ms cubic-bezier(0.22, 1, 0.36, 1)",
    fadeInDown: "fadeInDown 300ms cubic-bezier(0.22, 1, 0.36, 1)",
    slideInRight: "slideInRight 300ms cubic-bezier(0.22, 1, 0.36, 1)",
    slideInLeft: "slideInLeft 300ms cubic-bezier(0.22, 1, 0.36, 1)",
    scaleIn: "scaleIn 200ms cubic-bezier(0.22, 1, 0.36, 1)",
    scaleOut: "scaleOut 200ms cubic-bezier(0.22, 1, 0.36, 1)",
    pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
    spin: "spin 1s linear infinite",
  },
} as const;

export type MotionToken = typeof MOTION;
