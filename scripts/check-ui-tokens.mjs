// Rendered UI check for the admin console (docs/design-system.md).
//   pnpm build && node scripts/check-ui-tokens.mjs [--only overview,users] [--verbose]
//
// Opens every admin screen and state (scripts/ui-harness.mjs: demo, real
// admin, empty and error, plus the drawers, the palette and the phone menu)
// at 390, 768 and 1440 px, in light and dark, with the same headless Chrome
// and API stub as check-console.mjs, and fails on:
//   - page-level horizontal overflow
//   - clipped text: content wider than its box that is cut off without an
//     ellipsis, or spills out of a nowrap box, outside the designated
//     sideways scrollers ([data-scroll])
//   - a tap target smaller than 44 x 44 px on phone (390), counting the
//     transparent ::before / ::after hit area
//   - an icon that renders at 0 px
//   - cumulative layout shift above 0.01 while the screen loads
//   - any computed font size, line height (checked as a size/line-height
//     pair), font weight, padding, gap, border width or corner radius that is
//     not on the token scale
// UI_CHECK_INJECT_CSS="<css>" adds a stylesheet to every page first: a way to
// prove the check catches a regression (it must then fail).
import { DIST, SCREENS, launch, open, serve } from "./ui-harness.mjs";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const only = (() => {
  const i = args.indexOf("--only");
  return i < 0 ? null : args[i + 1].split(",");
})();
const verbose = args.includes("--verbose");
const WIDTHS = [390, 768, 1440];
const THEMES = ["light", "dark"];
const CONCURRENCY = 6;

if (!existsSync(`${DIST}/index.html`)) {
  console.error("Build first: pnpm build");
  process.exit(2);
}

/** Runs inside the page. Returns a list of problems. */
function audit({ phone }) {
  const SPACE = new Set([0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
  const PAIRS = { 11: 16, 12: 16, 13: 20, 14: 20, 16: 24, 20: 28, 28: 36 };
  const WEIGHTS = new Set(["400", "500", "600"]);
  const RADII = new Set([0, 6, 8, 12, 16, 999]);
  const TAP = 44;
  const out = [];
  const px = (v) => parseFloat(v);
  if (window.__cls > 0.01) out.push({ kind: "cls", el: "page", detail: `layout shift ${window.__cls.toFixed(4)} (max 0.01): ${(window.__clsSources ?? []).slice(0, 4).join("; ")}` });

  const name = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    return el.tagName.toLowerCase() + cls.map((c) => "." + c).join("") + (el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "");
  };
  const add = (kind, el, detail) => out.push({ kind, el: name(el), detail });

  // Page-level overflow.
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) {
    add("overflow", doc, `page is ${doc.scrollWidth}px wide in a ${window.innerWidth}px viewport`);
    for (const el of document.querySelectorAll(".adm *")) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 && r.width > 0 && !el.closest("[data-scroll]") && getComputedStyle(el).position !== "fixed") {
        add("overflow", el, `right edge at ${Math.round(r.right)}px`);
        break;
      }
    }
  }

  const hiddenByClip = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.clip === "rect(0px, 0px, 0px, 0px)" || (cs.position === "absolute" && n.offsetWidth <= 1 && n.offsetHeight <= 1)) return true;
    }
    return false;
  };
  const visible = (el) => {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
    return !hiddenByClip(el);
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

  const roots = [...document.querySelectorAll(".adm")];
  const els = roots.flatMap((r) => [r, ...r.querySelectorAll("*")]).filter(visible);

  for (const el of els) {
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    if (tag === "svg") continue;
    const text = ownText(el);

    // Type: size, line height (as a pair), weight.
    if (text || ["input", "textarea", "button"].includes(tag)) {
      const size = px(cs.fontSize);
      const lh = cs.lineHeight === "normal" ? null : px(cs.lineHeight);
      if (!(size in PAIRS)) add("type", el, `font-size ${cs.fontSize}`);
      else if (lh !== PAIRS[size] && !(tag === "input" && cs.type === "checkbox")) add("type", el, `font-size ${size}px with line-height ${cs.lineHeight} (scale: ${PAIRS[size]}px)`);
      if (!WEIGHTS.has(cs.fontWeight)) add("type", el, `font-weight ${cs.fontWeight}`);
    }

    // Spacing: padding and gaps on the 4 px scale.
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const v = Math.round(px(cs[`padding${side}`]) * 100) / 100;
      if (!SPACE.has(v)) add("spacing", el, `padding-${side.toLowerCase()} ${v}px`);
    }
    if (/flex|grid/.test(cs.display)) {
      for (const g of ["rowGap", "columnGap"]) {
        if (cs[g] === "normal") continue;
        const v = px(cs[g]);
        if (!SPACE.has(v)) add("spacing", el, `${g === "rowGap" ? "row-gap" : "column-gap"} ${v}px`);
      }
    }

    // Borders: 0 or 1 px. Radius: on the scale, or a 50% circle.
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (cs[`border${side}Style`] === "none") continue;
      const w = px(cs[`border${side}Width`]);
      if (w !== 0 && w !== 1) add("border", el, `border-${side.toLowerCase()}-width ${w}px`);
    }
    for (const corner of ["TopLeft", "TopRight", "BottomRight", "BottomLeft"]) {
      const v = cs[`border${corner}Radius`];
      if (v.endsWith("%")) {
        if (v !== "50%") add("radius", el, `radius ${v}`);
        continue;
      }
      const r = px(v);
      if (!RADII.has(r)) add("radius", el, `border-radius ${v}`);
    }

    // Clipped text: cut off without an ellipsis, or spilling out of a nowrap box.
    if (!el.closest("[data-scroll]") && cs.display !== "inline" && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
      const clips = /hidden|clip/.test(cs.overflowX);
      const scrolls = /auto|scroll/.test(cs.overflowX);
      const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
      if (clips && cs.textOverflow !== "ellipsis" && !clamped && el.textContent.trim()) add("clipped", el, `content ${el.scrollWidth}px in a ${el.clientWidth}px box`);
      else if (scrolls && !el.matches(".adm-sidebar__inner, .adm-sheet__body, .adm-palette__list")) add("clipped", el, `scrolls sideways: ${el.scrollWidth}px in ${el.clientWidth}px`);
      else if (!clips && !scrolls && cs.whiteSpace === "nowrap" && text) add("clipped", el, `text spills: ${el.scrollWidth}px in a ${el.clientWidth}px box`);
    }
  }

  // Icons that collapsed to nothing (e.g. max-width: 100% in a 0-wide box).
  for (const svg of roots.flatMap((r) => [...r.querySelectorAll("svg[width]")])) {
    const parent = svg.parentElement;
    if (!parent || !visible(parent) || getComputedStyle(svg).display === "none") continue;
    const r = svg.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) add("icon", parent, `a ${svg.getAttribute("width")} px icon renders ${Math.round(r.width)} x ${Math.round(r.height)} px`);
  }

  // Tap targets on phone.
  if (phone) {
    const targets = els.filter((el) =>
      el.matches('a[href], button, input:not([type="hidden"]), textarea, [role="tab"], [role="option"], [role="menuitem"], label:has(> input)'),
    );
    for (const el of targets) {
      if (el.matches("label > input")) continue; // the label is the target
      if (el.closest('[aria-hidden="true"]') || el.matches(".skip-link")) continue;
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.position !== "absolute" || ps.display === "none") continue;
        const pw = px(ps.width);
        const ph = px(ps.height);
        if (pw > 0 && ph > 0) {
          w = Math.max(w, pw);
          h = Math.max(h, ph);
        }
      }
      if (w < TAP - 0.5 || h < TAP - 0.5) add("tap", el, `${Math.round(w)} x ${Math.round(h)} px (${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)})`);
    }
  }
  return out;
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launch();

const jobs = [];
for (const s of SCREENS) {
  if (only && !only.includes(s.name)) continue;
  for (const width of WIDTHS) {
    if (s.widths && !s.widths.includes(width)) continue;
    for (const theme of THEMES) jobs.push({ s, width, theme });
  }
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    const { page, close } = await open(browser, origin, job.s.route, { width: job.width, theme: job.theme, mode: job.s.mode ?? "demo", scale: 1 });
    try {
      if (process.env.UI_CHECK_INJECT_CSS) await page.addStyleTag({ content: process.env.UI_CHECK_INJECT_CSS });
      if (job.s.action) await job.s.action(page);
      const problems = await page.evaluate(audit, { phone: job.width === 390 });
      const cls = await page.evaluate(() => window.__cls);
      results.push({ ...job, problems, cls });
    } finally {
      await close();
    }
  }
}
try {
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
} finally {
  await browser.close();
  server.close();
}

results.sort((a, b) => SCREENS.indexOf(a.s) - SCREENS.indexOf(b.s) || a.width - b.width || a.theme.localeCompare(b.theme));
let failed = 0;
const kinds = {};
for (const r of results) {
  const unique = [...new Map(r.problems.map((p) => [`${p.kind} ${p.el} ${p.detail}`, p])).values()];
  for (const p of unique) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
  const label = `${r.s.name} @${r.width} ${r.theme}`;
  if (unique.length === 0) {
    if (verbose) console.log(`ok   ${label}`);
    continue;
  }
  failed++;
  console.log(`FAIL ${label}`);
  for (const p of unique.slice(0, verbose ? 999 : 12)) console.log(`     ${p.kind.padEnd(8)} ${p.el}: ${p.detail}`);
  if (!verbose && unique.length > 12) console.log(`     ... ${unique.length - 12} more`);
}
console.log(`\n${results.length} screen states checked (${SCREENS.length} screens x ${WIDTHS.join("/")} px x light/dark).`);
console.log("Checks: page overflow, clipped text, collapsed icons, tap targets >= 44 px on phone, layout shift <= 0.01, font size/line height pairs, weights, padding, gap, border width, radius.");
const worstCls = Math.max(...results.map((r) => r.cls ?? 0));
console.log(`Worst layout shift across all states: ${worstCls.toFixed(4)}`);
if (failed) {
  console.error(`${failed} screen state(s) failed: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  process.exit(1);
}
console.log("Every screen state is on the token scale, with no overflow, clipping or small tap targets.");
