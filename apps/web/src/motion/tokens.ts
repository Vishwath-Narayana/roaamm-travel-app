import { SPRING_LINEAR, motion } from "@roaamm/design-tokens";

// The motion language in numbers, for JavaScript (Web Animations API, timers).
// The same values are CSS variables in styles/tokens.css; tokens.test.ts
// checks they agree. Rules are in docs/motion.md.

const ms = (v: string) => Number.parseFloat(v);

/** Durations in ms. Exits use EXIT_RATIO of the entrance. */
export const DUR = {
  press: ms(motion["dur-press"]),
  hover: ms(motion["dur-hover"]),
  ui: ms(motion["dur-ui"]),
  content: ms(motion["dur-content"]),
  section: ms(motion["dur-section"]),
  hero: ms(motion["dur-hero"]),
} as const;

export const EASE = {
  out: motion["ease-out"],
  inOut: motion["ease-in-out"],
  in: motion["ease-in"],
  /** CSS linear() spring; use springEasing() to fall back where unsupported. */
  spring: SPRING_LINEAR,
  springFallback: motion["ease-spring"],
} as const;

/** Choreography limits. */
export const STAGGER_MS = ms(motion.stagger);
export const MAX_STAGGER_MS = 600;
export const EXIT_RATIO = 0.6;
export const TRAVEL_PX = { min: 12, max: 24 } as const;
export const MIN_SCALE = 0.96;

/** Delay for item i of a staggered group, capped so the whole group stays under 600 ms. */
export function staggerDelay(i: number, count: number, step = STAGGER_MS): number {
  const capped = count > 1 ? Math.min(step, MAX_STAGGER_MS / (count - 1)) : step;
  return Math.round(i * capped);
}

/** The spring easing if this browser understands linear(), else the cubic-bezier fallback. */
export function springEasing(): string {
  return typeof CSS !== "undefined" && CSS.supports?.("transition-timing-function", "linear(0, 1)")
    ? EASE.spring
    : EASE.springFallback;
}
