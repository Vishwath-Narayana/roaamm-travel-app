# ADR 0009: One CSS tokens file, enforced by checks

Status: accepted (M4b.1).

## Context
The M4b admin console set its own colours, spacing and type inline in
`admin.css` (37 raw hex colours, 380 raw px, weights such as 550 and 650). The
result looked unfinished: uneven spacing, a bluish dark theme, opaque status
blocks. `packages/design-tokens/index.ts` was called the single source of truth,
but stylesheets read `apps/web/src/styles/tokens.css`, and nothing stopped a
stylesheet from bypassing both.

## Options
1. **One CSS tokens file that every stylesheet reads**, documented in
   `docs/design-system.md`, with checks in CI that reject values off the scale.
2. Generate CSS from the TypeScript package at build time.
3. A CSS framework or utility classes (Tailwind and similar).

## Decision
Option 1. `apps/web/src/styles/tokens.css` is the one file that holds raw
values. Three checks keep it that way:

- `scripts/check-tokens.mjs` (static): admin CSS may not contain a raw colour,
  a raw px outside a media query, or a spacing, type, weight or radius value
  that is not one of the scale's tokens. Site CSS is ratcheted: its counts of
  raw hex and raw px may only go down (`scripts/token-baseline.json`).
- `scripts/check-contrast.mjs`: every token pair, in both themes, composited
  over every surface it can appear on, meets its WCAG minimum; the table in
  `docs/design-system.md` must match.
- `scripts/check-ui-tokens.mjs` (rendered): in headless Chrome, every admin
  screen at 390, 768 and 1440 px, light and dark, has no overflow, clipping or
  layout shift, phone tap targets of at least 44 px, and computed sizes on the
  scale.

The TypeScript package keeps mirroring the site palette and scales for code
that needs them in JavaScript (a test checks the two agree).

Why not option 2: a build step for values that change a few times a year, and
the CSS file would no longer be readable on its own. Why not option 3: a new
dependency and a rewrite of every component, against a 100 kB first-load
budget, for rules three small scripts already enforce.

## Consequences
- A value outside the scale fails CI with the file and line, so the design
  cannot drift one pixel at a time.
- The marketing pages still hold older raw values (32 hex, 401 px when this
  was written). They can only shrink; moving them over is follow-up work.
