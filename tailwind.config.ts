import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { COLORS } from "./src/theme/tokens/colors";
import { RADIUS } from "./src/theme/tokens/radius";
import { SHADOWS } from "./src/theme/tokens/shadows";

export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Tajawal",
        ],
        arabic: [
          "Tajawal",
        ],
      },
      colors: {
        page: COLORS.background.page,
        card: COLORS.background.card,
        input: COLORS.background.input,
        subtle: COLORS.background.subtle,
        border: COLORS.border.DEFAULT,
        "border-light": COLORS.border.light,
        primary: {
          DEFAULT: COLORS.primary.DEFAULT,
          light: COLORS.primary.light,
          dark: COLORS.primary.dark,
          deeper: COLORS.primary.deeper,
        },
        gold: {
          DEFAULT: "#d8a85a",
          light: "#ffe0a3",
          pale: "rgba(216, 168, 90, 0.13)",
        },
        brand: {
          red: COLORS.primary.DEFAULT,
          "red-soft": COLORS.primary.light,
          wine: COLORS.primary.deeper,
          black: "#090b10",
        },
        text: {
          primary: COLORS.text.primary,
          secondary: COLORS.text.secondary,
          muted: COLORS.text.muted,
        },
        status: {
          success: COLORS.status.success,
          danger: COLORS.status.danger,
          warning: COLORS.status.warning,
          info: COLORS.status.info,
        },
      },
      borderRadius: {
        xs: RADIUS.sm,
        sm: RADIUS.md,
        md: RADIUS.lg,
        lg: RADIUS.xl,
        xl: RADIUS["2xl"],
        "2xl": "28px",
        pill: RADIUS.full,
      },
      boxShadow: {
        soft: SHADOWS.sm,
        glass: SHADOWS.glass,
        glow: SHADOWS.glow,
        "focus-glow": SHADOWS.focus,
        card: SHADOWS.card,
        modal: SHADOWS.modal,
        sidebar: SHADOWS.sidebar,
      },
      backdropBlur: {
        glass: COLORS.glass.blur,
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "slide-up": {
          "0%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-6px) scale(0.98)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slide-down 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities, addComponents }) {
      addUtilities({
        ".bg-glass": {
          background: COLORS.glass.bg,
          "backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          "-webkit-backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          border: `1px solid ${COLORS.glass.border}`,
        },
        ".card-glass": {
          background: COLORS.glass.bg,
          "backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          "-webkit-backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          border: `1px solid ${COLORS.glass.border}`,
          "box-shadow": SHADOWS.card,
        },
        ".modal-glass": {
          background: COLORS.glass.bgStrong,
          "backdrop-filter": `blur(24px) saturate(${COLORS.glass.saturation})`,
          "-webkit-backdrop-filter": `blur(24px) saturate(${COLORS.glass.saturation})`,
          border: `1px solid ${COLORS.glass.border}`,
          "box-shadow": SHADOWS.modal,
        },
        ".sidebar-glass": {
          background: COLORS.glass.bgStrong,
          "backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          "-webkit-backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          "border-right": `1px solid ${COLORS.glass.border}`,
          "box-shadow": SHADOWS.sidebar,
        },
        ".table-glass": {
          background: COLORS.glass.bg,
          "backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          "-webkit-backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
        },
      });
      addComponents({
        ".financial-card": {
          background: COLORS.glass.bg,
          "backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          "-webkit-backdrop-filter": `blur(${COLORS.glass.blur}) saturate(${COLORS.glass.saturation})`,
          border: `1px solid ${COLORS.glass.border}`,
          "border-radius": RADIUS.lg,
          "box-shadow": SHADOWS.card,
          transition: "filter 200ms ease, box-shadow 200ms ease",
        },
      });
    }),
  ],
} satisfies Config;

