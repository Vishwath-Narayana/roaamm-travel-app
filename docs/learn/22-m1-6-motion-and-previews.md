# M1.6: Motion, simulated product previews and a live status row

PR [#11](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/11),
merged 2026-11-21.

## What we built and why

A brighter hero checked for readable contrast, a motion system that respects
reduced motion, and "See it live" previews that act out chat, the AI
assistant and safety tools with simulated data. Also guide cards with a price
stepper, stories, an FAQ, and a "How it's built" band with a status row that
times the real services from your browser. The goal: show what the product
will do before the back end exists, honestly labelled.

## How it works

- **Previews:** `apps/web/src/live/` plays a script on a timeline. The panels
  are a separate lazy chunk that loads only when the section nears the
  screen. Under reduced motion, the final state shows at once.
- **Status row:** `apps/web/src/components/StatusRow.tsx` calls each
  service's health URL from `apps/web/src/services.ts`, only when the page
  runs on the live hostname, and shows the time.
- **CORS on the edge:** the Rust Worker's `/health` now sends
  `Access-Control-Allow-Origin` for the web origin only, so the browser may
  read the answer.
- **Hero contrast:** `scripts/check-hero-contrast.mjs` composites the overlay
  on each hero photo and checks WCAG AA contrast for the white text.

## Key files to open

- `apps/web/src/live/LiveSection.tsx`, `apps/web/src/live/script.ts`
- `apps/web/src/components/StatusRow.tsx`, `apps/web/src/services.ts`
- `edge/src/lib.rs`: `cors_allow_origin` and its test
- `scripts/check-hero-contrast.mjs`
- `apps/web/src/pages/landing/Faq.tsx`, `apps/web/src/pages/landing/Guides.tsx`

## New terms

CORS, `Access-Control-Allow-Origin`, `Vary: Origin`, AA contrast, reduced
motion, IntersectionObserver, lazy chunk, tablist. See the
[glossary](glossary.md).

## Mistakes and fixes

- **Sideways scroll on phones.** A browser review found layout problems at
  390 px wide. Fix commit "responsive fixes from the browser review": the
  tab strip scrolls inside itself, cards go 1, then 2x2, then 4 across.
- **Crawlers got the app shell.** Every unknown path returns `index.html`,
  so a crawler asking for `/robots.txt` got the SPA page. Fix: a real
  `apps/web/public/robots.txt`.
- **Honest status.** At this point the Core API was not deployed, so the
  status row showed "Not deployed yet" and never called it. That changed in
  M1.9.

## Try it yourself

1. Open the live landing page, scroll to "How it's built" and watch the
   status row times. Then turn on "Reduce motion" in the footer and look at
   "See it live" again.
2. Run `node scripts/check-hero-contrast.mjs` (after `pnpm install`) and read
   the contrast table.
3. Run `curl -sI -H "Origin: https://roaamm.plinthwell.com" https://roaamm-rt.plinthwell.com/health`
   and find the `access-control-allow-origin` header. Try another origin and
   see it disappear.

## Test yourself

1. Why does the edge `/health` need a CORS header for the status row?
2. Why does the status row only run on the live hostname?
3. What does the preview show when reduced motion is on?
4. Why is the preview code a lazy chunk?

### Answers

1. The browser blocks a page from reading a cross-origin response unless
   the server allows that origin.
2. So local dev, tests and Lighthouse do not make network calls to
   production.
3. The final state, with no animation.
4. To keep the first download of the landing page small; it loads only
   when you scroll near it.
