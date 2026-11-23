# M1.7: UI polish

PR [#12](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/12),
merged 2026-11-22.

## What we built and why

Small fixes found by looking closely: guide cards that line up row by row, a
fairer status row timing, share previews and icons (Open Graph image, web
manifest), a `noscript` message, one accessible value per animated stat, new
story photos and a dark-mode fix. No big features; the aim was that nothing
looks or reads wrong.

## How it works

- **Status row timing:** the first request also pays for DNS, TLS and
  connection setup, so it is now a warm-up. Then 3 timed requests run and
  the **median** is shown.
- **Stats:** the animated digits are `aria-hidden`; a visually hidden final
  value is what screen readers read.
- **Share previews:** `index.html` has Open Graph and Twitter tags pointing to
  `apps/web/public/og.jpg`.

## Key files to open

- `apps/web/src/components/StatusRow.tsx`: `median()` and the warm-up
- `apps/web/src/pages/landing/Stats.tsx`, `apps/web/src/components/Odometer.tsx`
- `apps/web/index.html`: the `og:` and `twitter:` meta tags
- `apps/web/public/manifest.webmanifest`
- `apps/web/src/pages/landing/Guides.tsx` and its CSS

## New terms

Median, warm-up request, Open Graph, web manifest, `aria-hidden`, visually
hidden text, `noscript`. See the [glossary](glossary.md).

## Mistakes and fixes

- **The status row looked slow.** It timed a single request that included
  DNS and TLS setup (hundreds of ms on the live site). Fix: one warm-up, then
  the median of 3.
- **Screen readers heard numbers twice.** A stat had both an `aria-label`
  and hidden text. Fix: drop the duplicate; tests check each stat's
  accessible text equals the final value only.
- **Cards melted into the page in dark mode.** A dark shadow cannot separate
  a dark card from a dark page. Fix: a lifted surface colour (`--raised`)
  with a deeper shadow.
- **Guide cards did not line up.** Fix: each card is a flex column with the
  price block pushed to the bottom.

## Try it yourself

1. Paste `https://roaamm.plinthwell.com` into a chat app that shows link
   previews and look at the image and title.
2. Turn on a screen reader (VoiceOver on macOS: Cmd+F5) and move over the
   stats on the landing page.
3. Switch to dark mode and look at the search bar and the final call to
   action card.

## Test yourself

1. Why show the median of 3 requests instead of one?
2. Why is the first request treated as a warm-up?
3. How do the animated stats stay accessible?

### Answers

1. One request can be an outlier; the median is steadier.
2. It includes DNS lookup, TLS and connection setup, which later requests
   reuse.
3. The moving digits are hidden from screen readers, which read one hidden
   final value instead.
