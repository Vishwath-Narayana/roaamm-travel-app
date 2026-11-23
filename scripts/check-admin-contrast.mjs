// Checks that every admin pill and chip colour pair (text on its pastel
// background) has a WCAG contrast of at least 4.5:1, in light and dark.
//   node scripts/check-admin-contrast.mjs
// Reads the values from apps/web/src/admin/admin.css and, for the "good"
// pair, the verified colours from apps/web/src/styles/tokens.css.
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const css = readFileSync(`${ROOT}apps/web/src/admin/admin.css`, "utf8");
const tokens = readFileSync(`${ROOT}apps/web/src/styles/tokens.css`, "utf8");

/** The custom properties declared in the first block that starts with `selector`. */
function block(source, selector) {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`missing ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    if (source[end] === "}" && --depth === 0) break;
  }
  const vars = {};
  for (const m of source.slice(open, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

function luminance(hex) {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? [...n].map((c) => c + c).join("") : n;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const light = { ...block(tokens, ":root {"), ...block(css, ".adm {") };
const dark = {
  ...light,
  ...block(tokens, ':root[data-theme="dark"]'),
  ...block(css, ':root[data-theme="dark"] .adm'),
};

function resolve(vars, value) {
  const m = /^var\((--[\w-]+)\)$/.exec(value);
  return m ? resolve(vars, vars[m[1]]) : value;
}

const PAIRS = ["neutral", "info", "violet", "warn", "good", "bad", "sample"];
let failed = 0;
for (const [theme, vars] of [
  ["light", light],
  ["dark", dark],
]) {
  for (const p of PAIRS) {
    const bg = resolve(vars, vars[`--pill-${p}-bg`]);
    const fg = resolve(vars, vars[`--pill-${p}-fg`]);
    const r = ratio(bg, fg);
    const ok = r >= 4.5;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${theme.padEnd(5)} ${p.padEnd(8)} ${fg} on ${bg}: ${r.toFixed(2)}:1`);
  }
}
if (failed) {
  console.error(`\n${failed} pill colour pair(s) below 4.5:1.`);
  process.exit(1);
}
