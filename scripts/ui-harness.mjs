// Shared browser harness for the admin UI checks and screenshots.
//
// Serves apps/web/dist with the same SPA fallback as check-console.mjs and
// answers API calls locally from scripts/admin-stub.mjs, so nothing depends on
// the live services. Four API modes:
//   demo   the demo admin with simulated sample data (what visitors see)
//   real   a real (non-demo) admin; fictional rows, write controls enabled
//   empty  the demo admin, every list empty
//   error  the demo admin, every admin read fails with 503
//
// Used by scripts/check-ui-tokens.mjs and scripts/shoot-admin.mjs.

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";
import { adminStub } from "./admin-stub.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
// UI_DIST: check another build (e.g. main's, to prove a new check fails there).
export const DIST = process.env.UI_DIST ?? join(ROOT, "apps/web/dist");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const API = "https://roaamm-api.plinthwell.com";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
};

export function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    let file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(DIST, "index.html");
    }
    const send = () => {
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    };
    // UI_FONT_DELAY_MS: answer web fonts late, so the first paint uses the
    // fallback font and any layout that depends on the font shows up as shift.
    const delay = Number(process.env.UI_FONT_DELAY_MS ?? 0);
    if (delay > 0 && file.endsWith(".woff2")) setTimeout(send, delay);
    else send();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

export function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
}

const cors = (origin) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type, x-roaamm-csrf",
});

/** [status, body] the stub API answers in `mode`. */
function answer(path, params, mode) {
  if (path === "/v1/me") {
    return [
      200,
      mode === "real"
        ? { role: "admin", displayName: "Avery Admin", isDemo: false, needsNewPasskey: false }
        : { role: "admin", displayName: "Demo admin", isDemo: true, needsNewPasskey: false },
    ];
  }
  if (!path.startsWith("/v1/admin/")) return [200, { status: "none" }];
  if (mode === "error") return [503, { error: "unavailable" }];
  return [200, adminStub(path, params, { scope: mode === "real" ? "real" : "demo", empty: mode === "empty" }) ?? { items: [], page: 0, hasMore: false }];
}

export const VIEWPORTS = {
  1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  1024: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  768: { width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/**
 * A new page at `route` in its own browser context.
 * theme: "light" | "dark" (stored choice and OS preference both set).
 */
export async function open(browser, origin, route, { width = 1440, theme = "light", mode = "demo", scale } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const vp = { ...VIEWPORTS[width] };
  if (scale) vp.deviceScaleFactor = scale;
  await page.setViewport(vp);
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem("roaamm-theme", t);
    } catch {}
  }, theme);
  // Cumulative layout shift, as Lighthouse counts it (shifts right after input excluded).
  await page.evaluateOnNewDocument(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls += e.value;
        window.__clsSources = (window.__clsSources ?? []).concat(
          e.sources.map((x) => `${x.node?.getAttribute?.("class") || x.node?.nodeName || "?"} y${Math.round(x.previousRect.y)}->${Math.round(x.currentRect.y)} h${Math.round(x.previousRect.height)}->${Math.round(x.currentRect.height)} @${Math.round(e.startTime)}ms`),
        );
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin === origin || url.protocol === "data:") return void req.continue();
    if (req.method() === "OPTIONS") return void req.respond({ status: 204, headers: cors(origin) });
    if (url.origin !== API) return void req.abort();
    const [status, body] = answer(url.pathname, url.searchParams, mode);
    void req.respond({ status, contentType: "application/json", headers: cors(origin), body: JSON.stringify(body) });
  });
  await page.goto(origin + route, { waitUntil: "networkidle0" });
  // Fonts and the first data render.
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 250));
  return { page, close: () => context.close() };
}

const A = "/app/admin";
const V_PENDING = "00000000-0000-4000-8000-000000000201";
const APP_APPROVED = "00000000-0000-4000-8000-000000000503";
const USER = "00000000-0000-4000-8000-000000000903";

const click = (sel) => async (page) => {
  await page.click(sel);
  await new Promise((r) => setTimeout(r, 450));
  // Lazy layers (the palette) start their entrance late: wait until every
  // finite animation has finished, so nothing is shot mid-fade.
  await page.evaluate(() => {
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    return Promise.race([Promise.allSettled(finite.map((a) => a.finished)), new Promise((r) => setTimeout(r, 2000))]);
  });
};

/**
 * Every admin screen and state: name, route, API mode, an optional action
 * after load, and the widths it exists at (default: all).
 */
export const SCREENS = [
  { name: "overview", route: A },
  { name: "verification", route: `${A}/verification` },
  { name: "verification-rejected", route: `${A}/verification`, action: click('.adm-toolbar [role="tab"]:nth-child(3)') },
  { name: "drawer-verification", route: `${A}/verification?id=${V_PENDING}` },
  { name: "guides-board", route: `${A}/guide-applications` },
  { name: "guides-list", route: `${A}/guide-applications?view=list` },
  { name: "drawer-application", route: `${A}/guide-applications?id=${APP_APPROVED}` },
  { name: "users", route: `${A}/users` },
  { name: "drawer-user", route: `${A}/users?id=${USER}` },
  { name: "trips", route: `${A}/trips` },
  { name: "audit", route: `${A}/audit` },
  { name: "palette", route: A, action: click(".adm-cmdk") },
  { name: "menu-sheet", route: A, action: click(".adm-topbar__menu"), widths: [390] },
  { name: "real-overview", route: A, mode: "real" },
  { name: "real-verification", route: `${A}/verification`, mode: "real" },
  { name: "real-drawer-verification", route: `${A}/verification?id=${V_PENDING}`, mode: "real" },
  { name: "real-guides-list", route: `${A}/guide-applications?view=list`, mode: "real" },
  { name: "empty-overview", route: A, mode: "empty" },
  { name: "empty-verification", route: `${A}/verification`, mode: "empty" },
  { name: "empty-users", route: `${A}/users`, mode: "empty" },
  { name: "error-overview", route: A, mode: "error" },
  { name: "error-users", route: `${A}/users`, mode: "error" },
  { name: "real-users", route: `${A}/users`, mode: "real" },
  { name: "real-drawer-application", route: `${A}/guide-applications?id=${APP_APPROVED}`, mode: "real" },
];

/** Table screens whose header must not move when any tab or filter changes. */
export const TABLE_SCREENS = [
  { name: "verification", route: `${A}/verification` },
  { name: "real-verification", route: `${A}/verification`, mode: "real" },
  { name: "guides-list", route: `${A}/guide-applications?view=list` },
  { name: "users", route: `${A}/users` },
  { name: "trips", route: `${A}/trips` },
  { name: "audit", route: `${A}/audit` },
];
