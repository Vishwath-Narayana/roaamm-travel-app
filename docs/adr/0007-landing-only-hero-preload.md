# ADR 0007: Preload the hero image on the landing page only

Status: accepted (M3 polish).

## Context
`index.html` is the single page Cloudflare serves for every route (SPA
fallback). It held a static `<link rel="preload" as="image">` for the first
hero photo, the landing page's LCP image. Every other route (`/demo`, `/login`,
`/signup`, `/account`, `/app/*`) never shows that photo, so Chrome logged
"was preloaded using link preload but not used within a few seconds" there.

The planned strict CSP (docs/security.md section 6, M12) allows scripts from
`'self'` only and requires Trusted Types.

## Options
1. **Inline head script, CSP-hashed:** adds the preload `<link>` only when
   `location.pathname === "/"`.
2. **`Link:` response header for `/` only** in `public/_headers`.
3. Preload from the app bundle, or an external `'self'` script.

## Decision
Option 1. The script is the only inline script in `index.html`, runs during
head parsing (before the stylesheet, so it never waits on CSS), and sets
attributes with `setAttribute` only, which are not Trusted Types sinks.

Its CSP source, to add to `script-src` when the strict CSP ships:

`'sha256-BoFPKj7QMslAzHcP3+SodSaPBTxnkrmRZ/TRn7c71PM='`

`src/heroPreload.test.ts` recomputes the hash from `index.html` and fails if
it no longer matches the line above. It also checks the preload is added on
`/` and not on the other routes.

Why not option 2: `_headers` is not applied by Lighthouse CI's static server,
`vite preview` or local dev, so CI would measure a landing page without the
preload. Support for `imagesrcset` in `Link` headers also differs by browser,
and a browser that ignored it would fetch a second copy of the photo. Why not
option 3: the bundle or an extra script request finds the image no earlier
than the `<img>` itself, so the preload would stop helping LCP.

## Consequences
- Measured on the built site, Lighthouse mobile, 5 runs each: performance 91
  before and after; median LCP 3098 ms before, 3096 ms after. The hero is still
  fetched once, at High priority. It starts about 20 ms later on an
  unthrottled local run because the preload scanner can't see a link that a
  script inserts. That made no measurable difference to LCP.
- `scripts/check-console.mjs` runs in CI and fails on any console warning or
  error on `/`, `/demo`, `/login`, `/signup`, `/account` and `/app/*`. On main
  it reproduces this warning on 7 routes.
- Changing the script means updating the hash here; the test says so.
