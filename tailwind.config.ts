import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Cairo",
          "Tajawal",
          "IBM Plex Sans Arabic",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        arabic: [
          "Cairo",
          "Tajawal",
          "IBM Plex Sans Arabic",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        page: "#0d0f14",
        card: "rgba(16, 24, 39, 0.54)",
        input: "rgba(13, 15, 20, 0.58)",
        subtle: "rgba(255, 255, 255, 0.055)",
        border: "rgba(255, 255, 255, 0.10)",
        "border-light": "rgba(255, 255, 255, 0.065)",
        primary: {
          DEFAULT: "#61030b",
          dark: "#3d0207",
          deeper: "#100306",
        },
        gold: {
          DEFAULT: "#d8a85a",
          light: "#ffe0a3",
          pale: "rgba(216, 168, 90, 0.13)",
        },
        brand: {
          red: "#61030b",
          "red-soft": "#8b0713",
          wine: "#100306",
          black: "#090b10",
        },
        text: {
          primary: "#ffffff",
          secondary: "#dde3ec",
          muted: "#aab4c8",
        },
        status: {
          green: "#55f5aa",
          red: "#ff6b6b",
          amber: "#ffd27b",
          blue: "#3fcfff",
          slate: "#aab4c8",
        },
      },
      borderRadius: {
        xs: "8px",
        sm: "12px",
        md: "16px",
        lg: "20px",
        pill: "999px",
      },
      boxShadow: {
        soft: "0 18px 54px rgba(0, 0, 0, 0.18), inset 0 1px 1px rgba(255,255,255,0.10)",
        glass:
          "0 24px 80px rgba(0, 0, 0, 0.24), 0 0 44px rgba(97, 3, 11, 0.055), inset 0 1px 1px rgba(255,255,255,0.10)",
        glow: "0 34px 110px rgba(0, 0, 0, 0.34), inset 0 1px 1px rgba(255,255,255,0.12)",
        "focus-glow": "0 0 0 3px rgba(216, 168, 90, 0.20), 0 0 20px rgba(216, 168, 90, 0.10)",
      },
      backdropBlur: {
        glass: "20px",
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
      },
      animation: {
        "fade-up": "fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slide-down 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
