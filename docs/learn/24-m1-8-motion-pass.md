# M1.8: The motion pass

PR [#13](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/13),
merged 2026-11-22.

## What we built and why

A full motion language: named easings and durations, a generated spring
curve, tactile buttons and inputs, page and theme transitions, hero
choreography, scroll effects, an inertial carousel and a "Reduce motion"
switch. Plus a benchmark that measures frame timing. The goal was a site that
feels smooth without animation libraries and without losing speed
(Lighthouse 92, 99% of frames on time, per the PR).

## How it works

1. **Tokens:** easings and durations live in `packages/design-tokens`, are
   mirrored in `tokens.css` and `apps/web/src/motion/tokens.ts`, and tests
   keep all three equal.
2. **Spring:** `scripts/gen-spring.mjs` simulates a damped spring and writes a
   CSS `linear()` curve to `packages/design-tokens/spring.gen.ts`.
3. **Only cheap properties move:** `transform`, `opacity`, `clip-path`,
   `filter`. These run on the GPU compositor without re-layout.
4. **One ticker:** a single `requestAnimationFrame` loop
   (`apps/web/src/motion/ticker.ts`) drives pointer effects.
5. **Reduce motion:** the OS setting or the footer switch sets every duration
   to zero, so final states show at once.

## Key files to open

- `docs/motion.md`: the rules, every effect, and an "add an animation"
  checklist
- `scripts/gen-spring.mjs`, `packages/design-tokens/spring.gen.ts`
- `apps/web/src/motion/index.tsx`, `apps/web/src/motion/preference.ts`,
  `apps/web/src/motion/ticker.ts`
- `apps/web/src/components/MotionToggle.tsx`
- `scripts/motion-bench.mjs`
- `apps/web/src/viewTransition.ts`

## New terms

Easing, duration token, spring animation, `linear()`, compositor,
`requestAnimationFrame`, View Transitions, scroll-driven animation, FLIP,
frame timing, long animation frame. See the [glossary](glossary.md).

## Mistakes and fixes

- **Heading reveals repainted every frame.** The benchmark showed they
  animated `clip-path` on text. Fix: a static mask with an inner wrapper that
  moves with `translate` and `opacity`. Scrolling went from 88% to 98-99%
  of frames on time (from the commit message).
- **Measuring tabs during load cost 2-3 Lighthouse points.** Fix: measure
  after paint and only near the screen.
- **Review fixes** (commit "motion review: footer switch shows every reveal,
  no colour lag on theme change, no sticky lift on touch"):
  - turning on Reduce motion left unrevealed content hidden;
  - buttons faded behind the page on theme change;
  - tapping on a phone left cards "lifted" (`:focus-within` changed to
    `:has(:focus-visible)`).

## Try it yourself

1. Build and run the benchmark: `pnpm build` then
   `node scripts/motion-bench.mjs` (needs Chrome installed). Read the
   on-time frame percentage.
2. Open the live site, toggle "Reduce motion" in the footer, and scroll.
3. Run `node scripts/gen-spring.mjs` and compare its output to
   `packages/design-tokens/spring.gen.ts` (then discard any change with
   `git checkout -- packages`).

## Test yourself

1. Why animate `transform` and `opacity` instead of `width` or `top`?
2. What does the Reduce motion switch do to durations?
3. Where are motion values defined, and how many copies exist?
4. Why is the benchmark not run in CI?

### Answers

1. The compositor can move them without re-layout or repaint, so frames
   stay on time.
2. Sets them all to zero; animations do not run.
3. In `packages/design-tokens`, mirrored in `tokens.css` and
   `src/motion/tokens.ts`; tests keep the three equal.
4. Frame timing depends on the machine, so results would be noisy
   (`scripts/motion-bench.mjs` says so at the top).
