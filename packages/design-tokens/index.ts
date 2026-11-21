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
  display: '"Inter Tight Variable", "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
  sans: '"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: '"Instrument Serif", "Iowan Old Style", Georgia, serif',
  mono: '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace',
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
} as const;

/** Type scale. Display and h2 use Inter Tight; one italic serif phrase per heading. */
export const type = {
  display: "clamp(48px, 8vw, 120px)",
  h2: "clamp(36px, 4.6vw, 64px)",
  h3: "clamp(22px, 1.8vw, 24px)",
  body: "clamp(16px, 1.25vw, 18px)",
  small: "14px",
  stat: "clamp(48px, 6vw, 88px)",
  "track-display": "-0.045em",
  "track-h2": "-0.035em",
  "track-h3": "-0.02em",
  "track-stat": "-0.04em",
} as const;

export const radius = {
  button: "999px",
  input: "12px",
  card: "24px",
  photo: "24px",
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

/** Spacing scale in px: space[1] = 4px ... space[10] = 144px. Base unit 8px. */
export const space = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 144] as const;

/** 12-column grid. */
export const layout = {
  container: "1280px",
  "page-pad": "clamp(16px, 4vw, 48px)",
  gutter: "24px",
  "gutter-mobile": "16px",
  "section-pad": "clamp(72px, 10vw, 144px)",
} as const;

/** CSS expressions that depend on the active theme's ink colour. */
export const effect = {
  hairline: "color-mix(in srgb, var(--ink) 10%, transparent)",
  /** Light bands at the top (nav) and bottom (controls) of the hero photo. */
  "overlay-hero":
    "linear-gradient(180deg, rgba(11, 11, 15, 0.45) 0%, rgba(11, 11, 15, 0.15) 12%, rgba(11, 11, 15, 0) 24%, rgba(11, 11, 15, 0) 62%, rgba(11, 11, 15, 0.7) 100%)",
  /** Soft dark halo behind the hero headline only; the photo edges stay bright. */
  "overlay-focus":
    "radial-gradient(ellipse 75% 40% at 50% 38%, rgba(11, 11, 15, 0.62) 0%, rgba(11, 11, 15, 0.47) 55%, rgba(11, 11, 15, 0) 100%)",
} as const;

/** Motion. Animate only transform, opacity, clip-path and filter. */
export const motion = {
  "ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "dur-1": "200ms",
  "dur-2": "400ms",
  "dur-3": "700ms",
  "dur-4": "1100ms",
} as const;

export const tokens = { color, font, type, radius, size, shadow, space, layout, effect, motion } as const;
export type ThemeName = keyof typeof color;
