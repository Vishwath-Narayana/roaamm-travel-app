// Optimises the landing-page stock photos.
//
// Input:  design/stock-originals/<slot>.jpg   (git-ignored full-size downloads,
//                                             sources listed in CREDITS.md)
// Output: apps/web/public/images/<slot>-<width>.{avif,webp,jpg}
//         apps/web/src/images.gen.ts           (sizes for <picture>, committed)
//
// Usage:  node scripts/optimise-images.mjs
//
// Budgets (the script fails if one is exceeded):
//   hero AVIF at 2048 px <= 180 kB, card AVIF <= 60 kB, whole folder <= 4.5 MB.
//
// AVIF and WebP are written at every width. JPEG is only the fallback for
// browsers that support neither (pre-2020 Safari, IE), so it skips the
// largest width to keep the folder inside its budget.

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const IN = join(ROOT, "design/stock-originals");
const OUT = join(ROOT, "apps/web/public/images");
const MANIFEST = join(ROOT, "apps/web/src/images.gen.ts");

const KB = 1024;
const BUDGET = { heroAvif2048: 180 * KB, cardAvif: 60 * KB, folder: 4.5 * 1024 * KB };

/** hero: wide photos, 16:9. card: portrait photos, 4:5. */
const KINDS = {
  hero: { ratio: 16 / 9, widths: [640, 960, 1280, 2048], jpegWidths: [640, 1280] },
  card: { ratio: 4 / 5, widths: [480, 960], jpegWidths: [480] },
};

/** Starting quality per format; lowered step by step only when a budget needs it. */
const QUALITY = { avif: 50, webp: 52, jpeg: 50 };

// position: which part of the photo to keep when cropping (sharp gravity).
const SLOTS = {
  "hero-1": { kind: "hero", position: "centre" },
  "hero-2": { kind: "hero", position: "centre" },
  "hero-3": { kind: "hero", position: "centre" },
  "cta-bleed": { kind: "hero", position: "south" },
  "dest-kyoto": { kind: "card", position: "centre" },
  "dest-lisbon": { kind: "card", position: "centre" },
  "dest-hanoi": { kind: "card", position: "centre" },
  "dest-cusco": { kind: "card", position: "centre" },
  "dest-marrakech": { kind: "card", position: "centre" },
  "dest-reykjavik": { kind: "card", position: "south" },
  "bento-solo-traveller": { kind: "card", position: "centre" },
  "feature-guide": { kind: "card", position: "centre" },
};

const ENCODERS = {
  avif: (q) => ({ quality: q, effort: 6, chromaSubsampling: "4:2:0" }),
  webp: (q) => ({ quality: q, effort: 6 }),
  jpeg: (q) => ({ quality: q, mozjpeg: true, progressive: true }),
};
const EXT = { avif: "avif", webp: "webp", jpeg: "jpg" };

/** Encodes at decreasing quality until the file fits `maxBytes` (if given). */
async function encode(pipeline, format, maxBytes) {
  for (let q = QUALITY[format]; q >= 24; q -= 3) {
    const buf = await pipeline.clone().toFormat(format, ENCODERS[format](q)).toBuffer();
    if (!maxBytes || buf.length <= maxBytes) return { buf, q };
  }
  throw new Error(`cannot fit ${format} under ${maxBytes / KB} kB`);
}

async function main() {
  const missing = Object.keys(SLOTS).filter((s) => !existsSync(join(IN, `${s}.jpg`)));
  if (missing.length) {
    console.error(`missing originals in design/stock-originals/: ${missing.join(", ")}`);
    console.error("Download them first (sources in apps/web/public/images/CREDITS.md).");
    process.exit(1);
  }

  // Start clean so removed widths or slots do not linger.
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (/\.(avif|webp|jpg)$/.test(f)) rmSync(join(OUT, f));

  const manifest = {};
  for (const [slot, { kind, position }] of Object.entries(SLOTS)) {
    const { ratio, widths, jpegWidths } = KINDS[kind];
    const src = sharp(join(IN, `${slot}.jpg`)).rotate(); // honour EXIF orientation
    const meta = await src.metadata();
    const largest = widths[widths.length - 1];
    if (Math.min(meta.width, meta.height * ratio) < largest) {
      throw new Error(`${slot}: original is too small for ${largest} px at this aspect ratio`);
    }

    for (const w of widths) {
      const h = Math.round(w / ratio);
      const base = src.clone().resize(w, h, { fit: "cover", position });
      const avifCap = kind === "hero" ? (w === 2048 ? BUDGET.heroAvif2048 : undefined) : BUDGET.cardAvif;
      const formats = { avif: avifCap, webp: undefined };
      if (jpegWidths.includes(w)) formats.jpeg = undefined;
      const line = [`${slot}-${w}`.padEnd(28)];
      for (const [format, cap] of Object.entries(formats)) {
        const { buf, q } = await encode(base, format, cap);
        writeFileSync(join(OUT, `${slot}-${w}.${EXT[format]}`), buf);
        line.push(`${format} ${(buf.length / KB).toFixed(0)}k q${q}`.padEnd(17));
      }
      console.log(line.join(""));
    }
    // Blur-up placeholder: a 20 px wide, pre-blurred WebP inlined as base64.
    // The browser stretches it smoothly behind the photo until it loads.
    const tiny = await src
      .clone()
      .resize(20, Math.round(20 / ratio), { fit: "cover", position })
      .blur(1)
      .webp({ quality: 40 })
      .toBuffer();
    const placeholder = `data:image/webp;base64,${tiny.toString("base64")}`;
    manifest[slot] = { widths, jpegWidths, width: largest, height: Math.round(largest / ratio), placeholder };
  }

  const total = readdirSync(OUT).reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
  console.log(`\nimages folder: ${(total / KB).toFixed(0)} kB (budget ${BUDGET.folder / KB} kB)`);
  if (total > BUDGET.folder) {
    console.error("images folder budget exceeded");
    process.exit(1);
  }

  writeFileSync(
    MANIFEST,
    `// Generated by scripts/optimise-images.mjs. Do not edit by hand.\n` +
      `export const IMAGES = ${JSON.stringify(manifest, null, 2)} as const;\n\n` +
      `export type ImageSlot = keyof typeof IMAGES;\n`,
  );
  console.log(`wrote ${MANIFEST.replace(ROOT, "")}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
