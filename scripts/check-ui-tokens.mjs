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
//   - cumulative layout shift above 0.01 while the screen loads, with web
//     fonts answered 500 ms late (UI_FONT_DELAY_MS)
//   - any computed font size, line height (checked as a size/line-height
//     pair), font weight, padding, gap, border width or corner radius that is
//     not on the token scale
// and, since M4b.2:
//   - not exactly one h1 on the page (every state, every width)
//   - a visible drag handle, or any other small pill-shaped bar outside a
//     dialog, at 768 px and above
//   - KPI numbers in one row of the Overview not on the same baseline (phone)
//   - the top-bar avatar's right edge not on the content's right edge
//   - a Sample chip anywhere in the console (the banner says it once)
//   - a table header cell that moves when a tab or filter changes (every
//     table screen, every tab and filter option, at 768, 1024 and 1440 px)
//   - an Audit Subject cell that is clipped at 1024 or 1440 px
// UI_CHECK_INJECT_CSS="<css>" adds a stylesheet to every page first: a way to
// prove the check catches a regression (it must then fail).
import { DIST, SCREENS, TABLE_SCREENS, launch, open, serve } from "./ui-harness.mjs";

// Fonts arrive 500 ms late by default (the worst case on a slow CI runner):
// a layout that only holds once the web font has loaded fails here, every time.
process.env.UI_FONT_DELAY_MS ??= "500";
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
function audit({ phone, width }) {
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

  // Exactly one h1 per page, at every width (the top bar's title on phones).
  const h1s = document.querySelectorAll("h1");
  if (h1s.length !== 1) out.push({ kind: "h1", el: "page", detail: `${h1s.length} h1 elements (${[...h1s].map((h) => JSON.stringify(h.textContent.trim())).join(", ")}); expected exactly 1` });

  // From 768 px: no drag handle, and no other small pill-shaped bar outside a
  // dialog (a stray handle-like element at the bottom of every screen).
  if (width >= 768) {
    for (const el of document.querySelectorAll(".adm-sheet__handle")) if (visible(el)) add("handle", el, "a sheet drag handle is visible at 768 px or wider");
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest('[role="dialog"]') || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 8 || r.width < 3 * r.height || r.width > 96) continue;
      const cs = getComputedStyle(el);
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none";
      if (filled && px(cs.borderTopLeftRadius) >= r.height / 2) add("handle", el, `a ${Math.round(r.width)} x ${Math.round(r.height)} px pill at ${Math.round(r.left)},${Math.round(r.top)}`);
    }
  }

  // KPI numbers in one visual row share a baseline (phone, Overview).
  if (phone) {
    const rows = new Map();
    for (const n of document.querySelectorAll(".adm-kpi__number")) {
      const card = n.closest(".adm-kpi").getBoundingClientRect();
      const key = Math.round(card.top);
      rows.set(key, [...(rows.get(key) ?? []), n.getBoundingClientRect().bottom]);
    }
    for (const [top, bottoms] of rows) {
      if (Math.max(...bottoms) - Math.min(...bottoms) > 0.5) out.push({ kind: "kpi", el: ".adm-kpi__number", detail: `numbers in the row at y=${top} sit at ${bottoms.map((b) => b.toFixed(1)).join(" / ")}` });
    }
  }

  // The top-bar avatar ends where the content ends.
  const avatar = document.querySelector(".adm-topbar .adm-avatar--btn");
  const main = document.querySelector(".adm-main");
  if (avatar && main) {
    const mr = main.getBoundingClientRect();
    const contentRight = mr.right - px(getComputedStyle(main).paddingRight);
    const ar = avatar.getBoundingClientRect().right;
    if (Math.abs(ar - contentRight) > 0.5) add("avatar", avatar, `right edge at ${ar.toFixed(1)}px, content ends at ${contentRight.toFixed(1)}px`);
  }

  // No Sample chip: the demo banner is the one place that says "simulated".
  for (const el of document.querySelectorAll(".adm .adm-chip, .adm .adm-pill, .adm-chip--sample")) {
    if (el.matches(".adm-chip--sample") || /^sample$/i.test(el.textContent.trim())) add("sample", el, "a Sample chip is rendered");
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
      const problems = await page.evaluate(audit, { phone: job.width === 390, width: job.width });
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

// ---- table layout: header cells never move; the audit subject is never clipped.

/** Left edge and width of every header cell of the table, to 0.1 px. */
const headerBoxes = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".adm-table thead tr > *")].map((c) => {
      const r = c.getBoundingClientRect();
      return `${(c.textContent.trim() || "·").slice(0, 12)}@${r.left.toFixed(1)}+${r.width.toFixed(1)}`;
    }),
  );

const layout = [];
if (!only || only.some((n) => TABLE_SCREENS.some((t) => t.name === n))) {
  const server2 = await serve();
  const origin2 = `http://127.0.0.1:${server2.address().port}`;
  const browser2 = await launch();
  try {
    for (const t of TABLE_SCREENS) {
      if (only && !only.includes(t.name)) continue;
      for (const width of [768, 1024, 1440]) {
        const { page, close } = await open(browser2, origin2, t.route, { width, mode: t.mode ?? "demo", scale: 1 });
        const problems = [];
        try {
          const first = await headerBoxes(page);
          if (first.length === 0) problems.push("no table header rendered");
          const controls = await page.$$('.adm-toolbar [role="tab"], .adm-toolbar .adm-seg__btn');
          for (let i = 0; i < controls.length; i++) {
            const label = (await controls[i].evaluate((b) => b.textContent.trim())) || `option ${i + 1}`;
            await controls[i].click();
            await new Promise((r) => setTimeout(r, 350));
            const now = await headerBoxes(page);
            if (now.join("|") !== first.join("|")) problems.push(`after "${label}": ${now.join(" ")} (was ${first.join(" ")})`);
          }
          if (t.name === "audit" && width >= 1024) {
            const clipped = await page.evaluate(() => {
              const heads = [...document.querySelectorAll(".adm-table thead tr > *")];
              const col = heads.findIndex((h) => h.textContent.trim() === "Subject");
              if (col < 0) return ["no Subject column"];
              return [...document.querySelectorAll(".adm-table tbody tr")].flatMap((tr) => {
                const cell = tr.children[col];
                const name = cell?.querySelector(".adm-subject__name");
                return [cell, name]
                  .filter((el) => el && el.scrollWidth > el.clientWidth)
                  .map((el) => `Subject "${cell.textContent.trim()}" clipped (${el.scrollWidth}px in ${el.clientWidth}px)`);
              });
            });
            problems.push(...clipped);
          }
        } finally {
          await close();
        }
        layout.push({ name: t.name, width, problems });
      }
    }
  } finally {
    await browser2.close();
    server2.close();
  }
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
for (const l of layout) {
  if (l.problems.length === 0) {
    if (verbose) console.log(`ok   table ${l.name} @${l.width}`);
    continue;
  }
  failed++;
  kinds.table = (kinds.table ?? 0) + l.problems.length;
  console.log(`FAIL table ${l.name} @${l.width}`);
  for (const p of l.problems.slice(0, verbose ? 999 : 6)) console.log(`     table    ${p}`);
}
console.log(`\n${results.length} screen states checked (${SCREENS.length} screens x ${WIDTHS.join("/")} px x light/dark).`);
console.log("Checks: page overflow, clipped text, collapsed icons, tap targets >= 44 px on phone, layout shift <= 0.01, font size/line height pairs, weights, padding, gap, border width, radius,");
console.log("        one h1, no drag handle or stray pill from 768 px, KPI baselines (phone), avatar on the content edge, no Sample chip.");
console.log(`${layout.length} table layouts checked (${TABLE_SCREENS.length} screens x 768/1024/1440 px, every tab and filter): header cells never move; audit Subject never clipped at 1024/1440.`);
const worstCls = Math.max(...results.map((r) => r.cls ?? 0));
console.log(`Worst layout shift across all states: ${worstCls.toFixed(4)}`);
if (failed) {
  console.error(`${failed} screen state(s) failed: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  process.exit(1);
}
console.log("Every screen state is on the token scale, with no overflow, clipping or small tap targets.");
