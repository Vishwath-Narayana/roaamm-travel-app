# M1.5: Landing redesign, real photos, console error fix

PR [#10](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/10),
merged 2026-11-21.

## What we built and why

An editorial landing page with real Unsplash photos, a floating pill nav and
photo carousels. A script turns large photos into small AVIF and WebP files
in several widths. Lower photos load only when they come near the screen.
The live site also had one console error, and this milestone removed it and
made CI fail on any future console error.

## How it works

1. `scripts/optimise-images.mjs` reads source photos and writes resized
   AVIF and WebP files to `apps/web/public/images/`, plus
   `apps/web/src/images.gen.ts`, which lists the widths for the code.
2. Pages use `<picture>` with a `srcset`, so the browser picks the right
   width for the screen.
3. Photos below the fold use lazy loading tied to when their carousel nears
   the screen.
4. `apps/web/public/_headers` sends `Cache-Control: ... no-transform`, which
   tells Cloudflare not to rewrite the HTML.

## Key files to open

- `scripts/optimise-images.mjs`
- `apps/web/src/images.gen.ts` (generated)
- `apps/web/src/components/Photo.tsx`
- `apps/web/src/pages/landing/Hero.tsx`, `apps/web/src/pages/landing/Destinations.tsx`
- `apps/web/public/_headers`: read the comment at the top
- `apps/web/lighthouserc.json`: the `errors-in-console` assertion

## New terms

AVIF, WebP, `srcset`, lazy loading, `_headers`, `no-transform`, console
error, LCP. See the [glossary](glossary.md).

## Mistakes and fixes

- **Cloudflare added a script we did not write.** Cloudflare injected its
  Web Analytics beacon into our HTML at the edge. Content blockers block
  that script, which showed as `net::ERR_BLOCKED_BY_CLIENT` in the console.
  Fix: `Cache-Control: no-transform` in `_headers`, and Lighthouse CI now
  asserts there are no console errors (commit "stop Cloudflare injecting its
  analytics beacon, fail CI on console errors").
- **Photos started loading too early.** A follow-up commit made destination
  photos start loading when the card track, not the whole section, nears the
  screen.

## Try it yourself

1. Open the live site, open DevTools, and in the Network tab filter by
   "avif". Resize the window and reload to see a different width chosen.
2. Run `curl -sI https://roaamm.plinthwell.com/ | grep -i cache-control` and
   find `no-transform`.
3. Open `apps/web/src/images.gen.ts` and match a width to a file in
   `apps/web/public/images/`.

## Test yourself

1. Why ship several widths of the same photo?
2. What did `no-transform` stop?
3. Why make CI fail on console errors?

### Answers

1. A phone downloads a small file and a big screen gets a sharp one; the
   browser picks from `srcset`.
2. Cloudflare rewriting our HTML to inject its analytics beacon.
3. So a new error is caught in the pull request, not by a visitor.
