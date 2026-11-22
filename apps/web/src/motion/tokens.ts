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

// The same damped spring as scripts/gen-spring.mjs (damping ratio 0.72), for
// JavaScript animations that cannot use the CSS linear() curve directly.
const ZETA = 0.72;
const WD = Math.sqrt(1 - ZETA * ZETA);
const raw = (t: number) => 1 - Math.exp(-ZETA * t) * (Math.cos(WD * t) + (ZETA / WD) * Math.sin(WD * t));
// Time (in spring units) after which it stays within 0.1% of rest.
const SETTLE = (() => {
  let end = 0;
  for (let t = 0; t < 40; t += 0.01) if (Math.abs(raw(t) - 1) > 0.001) end = t;
  return end;
})();

/** Spring progress for p in [0, 1]: 0 at the start, 1 at rest, about 1.038 at its peak. */
export function springAt(p: number): number {
  return p >= 1 ? 1 : p <= 0 ? 0 : raw(p * SETTLE);
}
