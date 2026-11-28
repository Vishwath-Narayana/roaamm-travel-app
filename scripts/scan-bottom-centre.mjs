// Hunts for anything drawn at the bottom centre of the viewport on desktop
// widths (the "pill" report from M4b.2). For each viewport, theme, device
// pixel ratio and condition it prints every element, and every ::before /
// ::after with content, whose box touches the bottom 80 px and is centred
// within +-40 px, plus document.elementFromPoint at the bottom centre.
//
//   pnpm build && node scripts/scan-bottom-centre.mjs           (headless)
//   HEADED=1 node scripts/scan-bottom-centre.mjs                (a real window)
//
// Uses the same local stub API as check-ui-tokens.mjs.
import puppeteer from "puppeteer-core";
import { open, serve } from "./ui-harness.mjs";

const SIZES = [
  [1440, 900],
  [1512, 982],
  [1920, 1080],
];
const ROUTES = [
  ["overview (taller than viewport)", "/app/admin"],
  ["audit", "/app/admin/audit"],
  ["users", "/app/admin/users"],
  ["trips (shorter)", "/app/admin/trips"],
  ["verification", "/app/admin/verification"],
  ["traveller", "/app/traveller"],
  ["guide", "/app/guide"],
];
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function scan() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cx = W / 2;
  const hits = [];
  // Fixed or sticky itself or through an ancestor: it stays put while the page scrolls.
  const pinned = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return n;
    }
    return null;
  };
  const inZone = (r) =>
    r.width > 0 && r.height > 0 && r.width < W * 0.5 && Math.abs(r.left + r.width / 2 - cx) <= 40 && r.bottom > H - 80 && r.top < H;
  const name = (el) => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : ""}`;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const anchor = pinned(el);
    const r = el.getBoundingClientRect();
    if (anchor && inZone(r)) {
      hits.push({ el: name(el), position: cs.position, pinnedBy: name(anchor), z: cs.zIndex, opacity: cs.opacity, rect: [r.x, r.y, r.width, r.height].map(Math.round) });
    }
    for (const p of ["::before", "::after"]) {
      const ps = getComputedStyle(el, p);
      if (ps.content === "none" || ps.content === "normal" || ps.display === "none") continue;
      if (ps.position === "fixed") hits.push({ el: name(el) + p, position: "fixed" });
    }
  }
  const fixed = [...document.querySelectorAll("body *")]
    .filter((el) => ["fixed", "sticky"].includes(getComputedStyle(el).position))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${name(el)} ${getComputedStyle(el).position} z${getComputedStyle(el).zIndex} [${[r.x, r.y, r.width, r.height].map(Math.round).join(",")}]`;
    });
  const at = document.elementFromPoint(cx, H - 12);
  return {
    hits,
    fixed,
    atPoint: at ? name(at) : "nothing",
    atPinned: at ? Boolean(pinned(at)) : false,
    grabbers: document.querySelectorAll(".adm-sheet__handle").length,
  };
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: process.env.HEADED ? false : true,
  args: ["--no-sandbox"],
});

let found = 0;
for (const [w, h] of SIZES) {
  for (const theme of ["light", "dark"]) {
    for (const dpr of [1, 2]) {
      for (const reduced of [false, true]) {
        for (const [name, route] of ROUTES) {
          const { page, close } = await open(browser, origin, route, {
            viewport: { width: w, height: h, deviceScaleFactor: dpr, isMobile: false, hasTouch: false },
            theme,
            reducedMotion: reduced,
          });
          const label = `${w}x${h} ${theme} dpr${dpr}${reduced ? " reduced" : ""} ${name}`;
          const results = [["loaded", await page.evaluate(scan)]];
          // Scrolled to the end of the page.
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await new Promise((r) => setTimeout(r, 150));
          results.push(["scrolled", await page.evaluate(scan)]);
          // A drawer opened then closed (admin lists with rows that open one).
          const row = await page.$(".adm-table tbody tr, .adm-appcard .adm-stretch");
          if (row) {
            await row.click();
            await new Promise((r) => setTimeout(r, 400));
            await page.keyboard.press("Escape");
            await new Promise((r) => setTimeout(r, 400));
            results.push(["drawer closed", await page.evaluate(scan)]);
          }
          for (const [when, r] of results) {
            const bad = r.hits.length > 0 || r.grabbers > 0 || r.atPinned;
            if (bad) found++;
            if (bad || process.env.VERBOSE) {
              console.log(`${bad ? "HIT " : "ok  "} ${label} [${when}] at bottom centre: ${r.atPoint}; grabbers: ${r.grabbers}`);
              for (const x of r.hits) console.log("      ", JSON.stringify(x));
            }
          }
          if (process.env.VERBOSE) console.log("      fixed/sticky:", results[0][1].fixed.join(" | "));
          await close();
        }
      }
    }
  }
}
console.log(found === 0 ? "No element at the bottom centre in any case." : `${found} case(s) with something at the bottom centre.`);
await browser.close();
server.close();
