const BASE_FONT_SIZE = 1.3; // rem — يطابق --font-size: 1.3rem في colors.css

export const typography = {
  fontFamily: {
    sans: ["Cairo", "Tajawal", "IBM Plex Sans Arabic", "Segoe UI", "system-ui", "sans-serif"],
    mono: "Tajawal",
  },
  fontWeight: {
    normal: 400,
    medium: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
  fontSize: {
    xs: `${BASE_FONT_SIZE * 0.78}rem`,
    sm: `${BASE_FONT_SIZE * 0.88}rem`,
    base: `${BASE_FONT_SIZE}rem`,
    md: `${BASE_FONT_SIZE * 1.1}rem`,
    lg: `${BASE_FONT_SIZE * 1.29}rem`,
    xl: `${BASE_FONT_SIZE * 1.57}rem`,
    xxl: `${BASE_FONT_SIZE * 2.1}rem`,
  },
  lineHeight: {
    relaxed: 1.65,
  },
} as const;
