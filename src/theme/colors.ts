export const colors = {
  background: "#0d0f14",
  surface: "rgba(16, 24, 39, 0.54)",
  surfaceSolid: "#101827",
  input: "rgba(13, 15, 20, 0.58)",
  subtle: "rgba(255, 255, 255, 0.055)",
  border: "rgba(255, 255, 255, 0.10)",
  borderLight: "rgba(255, 255, 255, 0.065)",
  text: {
    primary: "#ffffff",
    secondary: "#dde3ec",
    muted: "#aab4c8",
  },
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
    green: "#1a5c38",
    greenSoft: "#22c55e",
    red: "#61030b",
    redSoft: "#8b0713",
    wine: "#100306",
    black: "#090b10",
    slate: "#141c1a",
  },
  status: {
    green: "#55f5aa",
    greenBg: "rgba(85, 245, 170, 0.12)",
    red: "#ff6b6b",
    redBg: "rgba(255, 59, 59, 0.13)",
    amber: "#ffd27b",
    amberBg: "rgba(216, 168, 90, 0.13)",
    blue: "#22c55e",
    blueBg: "rgba(34, 197, 94, 0.16)",
    slate: "#aab4c8",
    slateBg: "rgba(170, 180, 200, 0.10)",
  },
  car: {
    cash: "#059669",
    delivery: "#7c3aed",
    installment: "#9b6f00",
    delete: "#ef4444",
  },
  partner: {
    sharik: "#006241",
    mumuol: "#3B82F6",
    moqtarid: "#F59E0B",
    mustathmir: "#8B5CF6",
  },
  glass: {
    blur: "20px",
    saturation: "180%",
  },
} as const;

export type ThemeColor = keyof typeof colors;
