// Optimises the landing-page stock photos.
//
// Input:  design/stock-originals/<slot>.jpg   (git-ignored full-size downloads,
//                                             sources listed in CREDITS.md)
// Output: apps/web/public/images/<slot>-<width>.{avif,webp,jpg}
//         apps/web/src/images.gen.ts           (sizes for <picture>, committed)
//
// Usage:  node scripts/optimise-images.mjs              (photos + share images)
//         node scripts/optimise-images.mjs --share-only (og.jpg and icons only)
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

// ---------------------------------------------------------------- share images

const PUBLIC = join(ROOT, "apps/web/public");
const OG_BUDGET = 150 * KB;

/** The ROAAMM mark (route line inside a compass ring) on a full-bleed ink square. */
function iconSvg(size) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#0B0B0F"/>
  <g fill="none" stroke="#FAFAFA" stroke-width="1.6" stroke-linecap="round">
    <circle cx="16" cy="16" r="8"/><path d="M12.4 19.6c1.6-5.2 5.6-2.4 7.2-7.2"/>
  </g>
  <circle cx="12.4" cy="19.6" r="1.3" fill="#FAFAFA"/><circle cx="19.6" cy="12.4" r="1.3" fill="#FAFAFA"/>
</svg>`);
}

/** Text and shading for the 1200x630 share card, drawn over the hero photo. */
function ogOverlaySvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#0B0B0F" stop-opacity="0.82"/>
      <stop offset="0.55" stop-color="#0B0B0F" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#0B0B0F" stop-opacity="0.1"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <g transform="translate(72 64)" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round">
    <circle cx="20" cy="20" r="17"/><path d="M12 28c3.4-11 11.8-5 15.2-15.2"/>
  </g>
  <circle cx="84" cy="92" r="2.6" fill="#FFFFFF"/><circle cx="99.2" cy="76.8" r="2.6" fill="#FFFFFF"/>
  <text x="130" y="97" fill="#FFFFFF" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="34" font-weight="700" letter-spacing="6">ROAAMM</text>
  <text x="72" y="330" fill="#FFFFFF" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="96" font-weight="600" letter-spacing="-3">Travel solo.</text>
  <text x="72" y="430" fill="#FFFFFF" font-family="Georgia, Times New Roman, serif"
    font-size="104" font-style="italic">Never alone.</text>
  <text x="74" y="520" fill="#FFFFFF" fill-opacity="0.9" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="30">ID-verified travellers, licensed local guides, safety built in.</text>
</svg>`);
}

/** og.jpg (1200x630), apple-touch-icon (180) and manifest icons (192, 512). */
async function shareImages() {
  const og = sharp(join(IN, "hero-1.jpg"))
    .rotate()
    .resize(1200, 630, { fit: "cover", position: "centre" })
    .composite([{ input: ogOverlaySvg() }]);
  // Shared on social sites, so start at high quality and step down to the budget.
  let buf;
  let q = 86;
  for (; q >= 50; q -= 4) {
    buf = await og.clone().jpeg({ quality: q, mozjpeg: true, progressive: true }).toBuffer();
    if (buf.length <= OG_BUDGET) break;
  }
  if (buf.length > OG_BUDGET) throw new Error("og.jpg does not fit its budget");
  writeFileSync(join(PUBLIC, "og.jpg"), buf);
  console.log(`og.jpg 1200x630 ${(buf.length / KB).toFixed(0)}k q${q} (budget ${OG_BUDGET / KB}k)`);

  for (const [file, size] of [
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ]) {
    const png = await sharp(iconSvg(size)).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(join(PUBLIC, file), png);
    console.log(`${file} ${size}x${size} ${(png.length / KB).toFixed(1)}k`);
  }
}

async function main() {
  if (process.argv.includes("--share-only")) {
    await shareImages();
    return;
  }
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
  await shareImages();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
