// ROAAMM design tokens: the single source of truth.
// apps/web/src/styles/tokens.css mirrors these values as CSS variables, and a
// test in apps/web keeps the two in sync.
// Monochrome: black ink is the accent. SOS is the only red and is always solid.

export const color = {
  light: {
    bg: "#FAFAFA",
    surface: "#F1F1F2",
    ink: "#0B0B0F",
    muted: "#5F5F66",
    border: "#EAEAEB",
    "verified-bg": "#E7F6EE",
    "verified-fg": "#0B7A43",
    sos: "#D92D20",
  },
  dark: {
    bg: "#0B0B0F",
    surface: "#17171B",
    ink: "#F4F4F5",
    muted: "#A1A1A6",
    border: "#2A2A2E",
    "verified-bg": "#0F2A1C",
    "verified-fg": "#4ADE80",
    sos: "#F97066",
  },
} as const;

export const font = {
  sans: '"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace',
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
} as const;

export const radius = {
  button: "12px",
  input: "12px",
  card: "20px",
  hero: "32px",
  pill: "999px",
} as const;

export const size = {
  button: "40px",
  "button-lg": "48px",
} as const;

export const shadow = {
  elevated: "0 20px 50px rgba(11, 11, 15, 0.16)",
} as const;

/** Spacing scale in px: space[1] = 4px ... space[9] = 96px. */
export const space = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

export const tokens = { color, font, radius, size, shadow, space } as const;
export type ThemeName = keyof typeof color;
