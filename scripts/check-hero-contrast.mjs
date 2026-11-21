// Checks that white hero text stays readable (WCAG AA) on every hero photo.
//
// Reads the overlay gradients from apps/web/src/styles/tokens.css, composites
// them over each hero photo at desktop and phone frame sizes, and measures the
// contrast of white text against the brightest pixels behind each text area.
//
// Usage: node scripts/check-hero-contrast.mjs        (exits 1 if any area fails)
//
// Thresholds: large text (the headline) >= 3:1, everything else >= 4.5:1.
// "worst" uses the 99th-percentile brightest pixel in the area, so a single
// stray highlight does not decide the result; "max" is the single brightest.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const css = readFileSync(join(ROOT, "apps/web/src/styles/tokens.css"), "utf8");
const HEROES = ["hero-1", "hero-2", "hero-3"];

function token(name) {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
}

/** rgba(r,g,b,a) p% stops -> [{ a, p }] (all stops use the same ink colour). */
function stops(gradient) {
  return [...gradient.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)\s*([\d.]+)%/g)].map((m) => ({
    a: Number(m[1]),
    p: Number(m[2]) / 100,
  }));
}

function interpolate(list, t) {
  if (t <= list[0].p) return list[0].a;
  for (let i = 1; i < list.length; i++) {
    if (t <= list[i].p) {
      const [s0, s1] = [list[i - 1], list[i]];
      return s0.a + ((s1.a - s0.a) * (t - s0.p)) / (s1.p - s0.p);
    }
  }
  return list[list.length - 1].a;
}

const linear = stops(token("effect-overlay-hero"));
const focusCss = token("effect-overlay-focus");
const [, rx, ry, cx, cy] = focusCss.match(/ellipse ([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%/).map(Number);
const focus = stops(focusCss);

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (r, g, b) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const contrastWithWhite = (L) => 1.05 / (L + 0.05);

// Text areas as fractions of the hero frame [x0, x1, y0, y1, large, backing],
// measured in the browser at each size. "large" areas only need 3:1. "backing"
// is the alpha of the ink-coloured pill behind that text (eyebrow pill), if any.
// Dark glass behind the eyebrow, wordmark, nav links, glass buttons and tags
// (rgba(11, 11, 15, PILL) in Hero.css and TopNav.css).
const PILL = 0.5;

const LAYOUTS = {
  "desktop 1416x876": {
    size: [1416, 876],
    areas: {
      wordmark: [0.02, 0.12, 0.015, 0.06, false, PILL],
      "nav links": [0.38, 0.62, 0.015, 0.06, false, PILL],
      eyebrow: [0.4, 0.6, 0.12, 0.17, false, PILL],
      headline: [0.25, 0.75, 0.19, 0.46, true],
      body: [0.32, 0.68, 0.47, 0.56, false],
      buttons: [0.38, 0.62, 0.6, 0.67, false, PILL],
      bottom: [0.02, 0.98, 0.83, 0.92, false],
    },
  },
  "phone 366x820": {
    size: [366, 820],
    areas: {
      wordmark: [0.05, 0.42, 0.025, 0.065, false, PILL],
      eyebrow: [0.1, 0.9, 0.15, 0.2, false, PILL],
      headline: [0.12, 0.88, 0.22, 0.36, true],
      body: [0.06, 0.94, 0.38, 0.53, false],
      buttons: [0.25, 0.75, 0.59, 0.66, false, PILL],
      bottom: [0.06, 0.94, 0.8, 0.92, false],
    },
  },
};

let failed = false;
for (const [layout, { size, areas }] of Object.entries(LAYOUTS)) {
  const [W, H] = size;
  console.log(`\n${layout}`);
  for (const slot of HEROES) {
    const { data } = await sharp(join(ROOT, `apps/web/public/images/${slot}-1280.jpg`))
      .resize(W, H, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cells = [];
    for (const [name, [x0, x1, y0, y1, large, backing = 0]] of Object.entries(areas)) {
      const lums = [];
      for (let y = Math.floor(y0 * H); y < y1 * H; y++) {
        for (let x = Math.floor(x0 * W); x < x1 * W; x++) {
          const i = (y * W + x) * 3;
          const dx = (x / W - cx / 100) / (rx / 100);
          const dy = (y / H - cy / 100) / (ry / 100);
          const aFocus = interpolate(focus, Math.sqrt(dx * dx + dy * dy));
          const aLinear = interpolate(linear, y / H);
          const keep = (1 - aFocus) * (1 - aLinear) * (1 - backing);
          const ink = 11 / 255;
          const c = [0, 1, 2].map((k) => (data[i + k] / 255) * keep + ink * (1 - keep));
          lums.push(luminance(c[0], c[1], c[2]));
        }
      }
      lums.sort((a, b) => a - b);
      const worst = contrastWithWhite(lums[Math.floor(lums.length * 0.99)]);
      const max = contrastWithWhite(lums[lums.length - 1]);
      const need = large ? 3 : 4.5;
      const ok = worst >= need;
      if (!ok) failed = true;
      cells.push(`${name} ${worst.toFixed(2)}${ok ? "" : ` FAIL(<${need})`} (max ${max.toFixed(2)})`);
    }
    console.log(`  ${slot}: ${cells.join(" | ")}`);
  }
}
console.log(failed ? "\nSome hero text fails WCAG AA." : "\nAll hero text passes WCAG AA.");
process.exit(failed ? 1 : 0);
