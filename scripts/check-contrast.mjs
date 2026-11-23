// Contrast check for the design tokens, both themes (docs/design-system.md).
//   node scripts/check-contrast.mjs              # exits 1 on any miss
//   node scripts/check-contrast.mjs --markdown   # print the table
//   node scripts/check-contrast.mjs --write-doc  # refresh the table in docs/design-system.md
// The default run also fails if the table in docs/design-system.md is stale.
//
// Every pair is computed from apps/web/src/styles/tokens.css, never eyeballed.
// Translucent status tints are composited over every surface a pill can sit
// on (page, card, raised, row hover, row selected) and the worst case counts.
// Thresholds (WCAG 2.2 ratios):
//   body text >= 7, secondary and tertiary/placeholder text >= 4.5,
//   pill and chip text on its own fill >= 4.5, primary button text >= 7,
//   UI component borders (form controls) and the focus ring >= 3.
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const css = readFileSync(`${ROOT}apps/web/src/styles/tokens.css`, "utf8");
const markdown = process.argv.includes("--markdown");
const writeDoc = process.argv.includes("--write-doc");
const DOC = `${ROOT}docs/design-system.md`;
const [START, END] = ["<!-- contrast:start -->", "<!-- contrast:end -->"];

/** Custom properties declared directly in the first block whose selector is `selector`. */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing block ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === "{") depth++;
    if (css[end] === "}" && --depth === 0) break;
  }
  const vars = {};
  for (const m of css.slice(open + 1, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

// The OS-preference dark block must match the explicit one exactly.
const osDark = block(':root:not([data-theme="light"])');
const explicitDark = block(':root[data-theme="dark"]');
for (const k of new Set([...Object.keys(osDark), ...Object.keys(explicitDark)])) {
  if (osDark[k] !== explicitDark[k]) {
    console.error(`dark blocks differ on ${k}: ${osDark[k]} vs ${explicitDark[k]}`);
    process.exit(1);
  }
}

function resolve(vars, name) {
  let v = vars[name];
  if (v === undefined) throw new Error(`unknown token ${name}`);
  for (let i = 0; i < 10; i++) {
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    if (!m) return v;
    v = vars[m[1]];
  }
  return v;
}

/** #rgb, #rrggbb, rgb(r g b / a) or rgba(r, g, b, a) -> [r, g, b, a] with r,g,b 0..255. */
function parse(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/.exec(value);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  throw new Error(`cannot parse colour ${value}`);
}

/** `top` (maybe translucent) over the opaque `under`. */
function over(top, under) {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

const SURFACES = ["page", "card", "raised", "hover", "selected"];
const STATUSES = ["neutral", "success", "warning", "review", "danger", "sample", "info"];

/**
 * Each check: a label, the foreground token, the background (a token, or a
 * tint over a surface), and the minimum ratio. The worst surface is reported.
 */
function checks(vars) {
  const c = (name) => parse(resolve(vars, name));
  const surface = (s) => c(`--ui-${s}`);
  const out = [];
  const add = (group, label, min, fg, bgs) => {
    const results = bgs.map(([bgLabel, bg]) => ({ bgLabel, bg, r: ratio(fg, bg) }));
    const worst = results.reduce((a, b) => (b.r < a.r ? b : a));
    out.push({ group, label, min, fg: hex(fg), worst, ok: worst.r >= min });
  };
  const onSurfaces = SURFACES.map((s) => [s, surface(s)]);

  add("Text", "Body text `--ui-text`", 7, c("--ui-text"), onSurfaces);
  add("Text", "Secondary text `--ui-text-2`", 4.5, c("--ui-text-2"), onSurfaces);
  add("Text", "Tertiary / placeholder `--ui-text-3`", 4.5, c("--ui-text-3"), onSurfaces);
  add("Text", "Primary button text `--ui-on-primary` on `--ui-primary`", 7, c("--ui-on-primary"), [["primary", c("--ui-primary")]]);
  add("Text", "Site body `--ink` on `--bg` / `--surface`", 7, c("--ink"), [["bg", c("--bg")], ["surface", c("--surface")]]);
  add("Text", "Site muted `--muted` on `--bg` / `--surface`", 4.5, c("--muted"), [["bg", c("--bg")], ["surface", c("--surface")]]);

  for (const s of STATUSES) {
    const tint = c(`--ui-${s}-tint`);
    const fg = s === "neutral" ? c("--ui-text-2") : c(`--ui-${s}`);
    const fgName = s === "neutral" ? "--ui-text-2" : `--ui-${s}`;
    add("Pills and chips", `${s}: \`${fgName}\` on \`--ui-${s}-tint\``, 4.5, fg, SURFACES.map((x) => [x, over(tint, surface(x))]));
  }
  for (const s of STATUSES.filter((x) => x !== "neutral")) {
    add("Status text", `${s} text \`--ui-${s}\` on surfaces (errors, timeline)`, 4.5, c(`--ui-${s}`), onSurfaces);
  }
  for (const s of ["warning", "review", "success", "danger"]) {
    const tint = c(`--ui-${s}-tint`);
    add("Kanban headers", `${s} column title \`--ui-text\` on \`--ui-${s}-tint\``, 7, c("--ui-text"), [["card", over(tint, surface("card"))]]);
  }
  add("Components", "Form control border `--ui-border-control`", 3, c("--ui-border-control"), onSurfaces);
  add("Components", "Focus ring `--ui-focus`", 3, c("--ui-focus"), onSurfaces);
  return out;
}

const results = { light: checks(light), dark: checks(dark) };
let failed = 0;

function table() {
  const lines = ["| Pair | Min | Light (worst surface) | Dark (worst surface) |", "|---|---:|---|---|"];
  results.light.forEach((l, i) => {
    const d = results.dark[i];
    const cell = (x) => `${x.worst.r.toFixed(2)}:1 ${x.ok ? "pass" : "**FAIL**"} (${x.fg} on ${hex(x.worst.bg)}, ${x.worst.bgLabel})`;
    lines.push(`| ${l.label} | ${l.min}:1 | ${cell(l)} | ${cell(d)} |`);
  });
  return lines.join("\n");
}

if (markdown) {
  console.log(table());
} else {
  for (const theme of ["light", "dark"]) {
    for (const x of results[theme]) {
      console.log(
        `${x.ok ? "ok  " : "FAIL"} ${theme.padEnd(5)} ${x.worst.r.toFixed(2).padStart(5)}:1 (min ${x.min}) ${x.label.replace(/`/g, "")}  [worst: ${x.fg} on ${hex(x.worst.bg)} ${x.worst.bgLabel}]`,
      );
    }
  }
}

const doc = readFileSync(DOC, "utf8");
const [a, b] = [doc.indexOf(START), doc.indexOf(END)];
if (a < 0 || b < 0) throw new Error(`docs/design-system.md needs ${START} and ${END}`);
const fresh = `${START}\n${table()}\n${END}`;
if (writeDoc) {
  writeFileSync(DOC, doc.slice(0, a) + fresh + doc.slice(b + END.length));
  console.log("docs/design-system.md contrast table refreshed.");
} else if (doc.slice(a, b + END.length) !== fresh) {
  console.error("\nThe contrast table in docs/design-system.md is stale: run node scripts/check-contrast.mjs --write-doc");
  process.exit(1);
}

for (const theme of ["light", "dark"]) failed += results[theme].filter((x) => !x.ok).length;
if (failed) {
  console.error(`\n${failed} contrast pair(s) below their minimum.`);
  process.exit(1);
}
if (!markdown) console.log("\nEvery token pair meets its contrast minimum in both themes.");
