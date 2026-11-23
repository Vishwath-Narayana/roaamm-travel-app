// Token lint for the stylesheets (docs/design-system.md).
//   node scripts/check-tokens.mjs            # exits 1 on any problem
//   node scripts/check-tokens.mjs --update   # rewrite the site baseline (only ever lower it)
//
// Admin CSS (apps/web/src/admin/**.css) is strict:
//   - no raw colours: hex, rgb(), hsl() or named colours (white, black, ...)
//   - no raw px, except inside @media / @container conditions
//   - spacing (padding, margin, gap, inset) only from --sp-* and the layout
//     spacing tokens; font-size only --text-*; line-height only --leading-*;
//     font-weight only --weight-* (400 / 500 / 600); border-radius only --radius-*
//     (or 50% for 1:1 circles); every var() must be a defined token
// Every other stylesheet outside tokens.css is ratcheted: its count of raw hex
// colours and raw px may not grow past scripts/token-baseline.json. The
// marketing pages predate the UI system and are moved over file by file.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "apps/web/src");
const TOKENS = join(SRC, "styles/tokens.css");
const BASELINE = join(ROOT, "scripts/token-baseline.json");
const update = process.argv.includes("--update");

function walk(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".css") ? [p] : [];
  });
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const lineOf = (s, i) => s.slice(0, i).split("\n").length;

const tokenCss = readFileSync(TOKENS, "utf8");
const defined = new Set([...tokenCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

const SPACING = /^--(sp-\d+|ui-(page-pad|card-pad|card-gap|section-gap))$/;
const FAMILY = {
  "font-size": /^--text-(label|caption|dense|body|title|page|kpi)$/,
  "line-height": /^--leading-/,
  "font-weight": /^--weight-/,
  "border-radius": /^--radius-(sm|md|lg|xl|full)$/,
  "letter-spacing": /^--tracking-/,
};
const SPACING_PROPS = /^(padding|margin|gap|row-gap|column-gap|inset|scroll-padding|scroll-margin)(-|$)/;
const NAMED = /(?<![\w-])(white|black|red|green|blue|gray|grey|silver|orange|purple|yellow|pink)(?![\w-])/i;

const problems = [];
const say = (file, src, i, msg) => problems.push(`${relative(ROOT, file)}:${lineOf(src, i)}  ${msg}`);

/** Declarations outside @media/@container preludes: [prop, value, index]. */
function declarations(src) {
  const out = [];
  for (const m of src.matchAll(/([{;]\s*)(-?-?[a-z][\w-]*)\s*:\s*([^;{}]+)(?=[;}])/gi)) {
    out.push([m[2].toLowerCase(), m[3].trim(), m.index + m[1].length]);
  }
  return out;
}

function lintAdmin(file) {
  const src = stripComments(readFileSync(file, "utf8"));
  // Raw px anywhere except in @media / @container conditions.
  const noAt = src.replace(/@(media|container)[^{]*\{/g, (m) => m.replace(/[^\n{]/g, " "));
  for (const m of noAt.matchAll(/-?\b\d*\.?\d+px\b/g)) say(file, src, m.index, `raw px "${m[0]}": use a token`);
  for (const m of src.matchAll(/#[0-9a-f]{3,8}\b/gi)) say(file, src, m.index, `raw colour "${m[0]}": use a --ui-* token`);
  for (const m of src.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklch|oklab)\(/gi)) say(file, src, m.index, `raw colour function "${m[0]}": use a token`);

  for (const [prop, value, i] of declarations(src)) {
    if (prop.startsWith("--")) {
      say(file, src, i, `custom property ${prop} declared outside tokens.css`);
      continue;
    }
    const noVars = value.replace(/var\([^)]*\)/g, "");
    if (/color|background|border|fill|stroke|outline|shadow/.test(prop) && NAMED.test(noVars)) {
      say(file, src, i, `named colour in ${prop}: ${value}`);
    }
    const vars = [...value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
    for (const v of vars) if (!defined.has(v)) say(file, src, i, `undefined token ${v}`);
    if (SPACING_PROPS.test(prop)) {
      for (const v of vars) if (!SPACING.test(v)) say(file, src, i, `${prop} uses ${v}, not a spacing token`);
      const literals = noVars
        .replace(/env\([^)]*\)/g, " ")
        .replace(/\b(calc|max|min|clamp)\b/g, " ")
        .replace(/[()+*/,]/g, " ")
        .split(/\s+/)
        .filter((t) => t && t !== "-" && !/^(0|-?1|auto|-?\d+(\.\d+)?%)$/.test(t));
      if (literals.some((t) => /\d/.test(t))) say(file, src, i, `${prop}: off-scale value "${value}"`);
    }
    const family = FAMILY[prop];
    if (family) {
      const ok =
        /^(inherit|normal|0)$/.test(value) ||
        (prop === "border-radius" && /^(50%|0)$/.test(value)) ||
        (vars.length > 0 && vars.every((v) => family.test(v)) && value.replace(/var\([^)]*\)/g, "").replace(/[\s/0]/g, "") === "");
      if (!ok) say(file, src, i, `${prop}: "${value}" is not on the ${family.source.slice(3)}* scale`);
    }
    if (prop === "font" && value !== "inherit") say(file, src, i, `font shorthand: set font-size / line-height / font-weight tokens separately`);
  }
}

function countSite(file) {
  const src = stripComments(readFileSync(file, "utf8"));
  const noAt = src.replace(/@(media|container)[^{]*\{/g, "{");
  return {
    hex: (src.match(/#[0-9a-f]{3,8}\b/gi) ?? []).length,
    px: (noAt.match(/-?\b\d*\.?\d+px\b/g) ?? []).length,
  };
}

const files = walk(SRC).filter((f) => f !== TOKENS);
const admin = files.filter((f) => relative(SRC, f).startsWith("admin/"));
const site = files.filter((f) => !admin.includes(f));

admin.forEach(lintAdmin);

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const now = Object.fromEntries(site.map((f) => [relative(ROOT, f), countSite(f)]));
let siteHex = 0;
let sitePx = 0;
for (const [f, c] of Object.entries(now)) {
  siteHex += c.hex;
  sitePx += c.px;
  const b = baseline[f] ?? { hex: 0, px: 0 };
  if (c.hex > b.hex) problems.push(`${f}  raw hex colours went up: ${c.hex} (baseline ${b.hex})`);
  if (c.px > b.px) problems.push(`${f}  raw px went up: ${c.px} (baseline ${b.px})`);
}

if (update) {
  const lowered = Object.fromEntries(
    Object.entries(now).map(([f, c]) => {
      const b = baseline[f] ?? c;
      return [f, { hex: Math.min(b.hex, c.hex), px: Math.min(b.px, c.px) }];
    }),
  );
  writeFileSync(BASELINE, JSON.stringify(lowered, null, 2) + "\n");
  console.log(`baseline written: ${Object.keys(lowered).length} site stylesheets`);
}

console.log(`admin stylesheets: ${admin.length} checked strictly`);
console.log(`site stylesheets:  ${site.length} ratcheted (${siteHex} raw hex, ${sitePx} raw px in total)`);
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  console.error(`\n${problems.length} token problem(s).`);
  process.exit(1);
}
console.log("Tokens: no raw colours or off-scale values in admin CSS; site counts at or below baseline.");
