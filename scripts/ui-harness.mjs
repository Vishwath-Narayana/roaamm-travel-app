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
import { MEMBER_MODES, memberMe, memberStub } from "./member-stub.mjs";

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
  if (MEMBER_MODES.has(mode)) {
    if (path === "/v1/me") return [200, { ...memberMe(mode), needsNewPasskey: false }];
    const member = memberStub(path, params, mode);
    if (member) return member;
    if (!path.startsWith("/v1/admin/")) return [200, { status: "none" }];
    return [200, adminStub(path, params, { scope: "demo" }) ?? { items: [], page: 0, hasMore: false }];
  }
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
export async function open(
  browser,
  origin,
  route,
  { width = 1440, theme = "light", mode = "demo", scale, viewport, reducedMotion = false } = {},
) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const vp = { ...(viewport ?? VIEWPORTS[width]) };
  if (scale) vp.deviceScaleFactor = scale;
  await page.setViewport(vp);
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: theme },
    { name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" },
  ]);
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
const TRIP = "00000000-0000-4000-8000-000000000402";

/** Waits for the click's effect: lazy layers start their entrance late, so
 * wait until every finite animation has finished (nothing is shot mid-fade). */
const settle = async (page) => {
  await new Promise((r) => setTimeout(r, 450));
  await page.evaluate(() => {
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    return Promise.race([Promise.allSettled(finite.map((a) => a.finished)), new Promise((r) => setTimeout(r, 2000))]);
  });
};

const click = (sel) => async (page) => {
  await page.click(sel);
  await settle(page);
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
  { name: "drawer-trip", route: `${A}/trips?id=${TRIP}` },
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

const T = "/app/traveller";
const G = "/app/guide";
const REAL_TRIP = "00000000-0000-4000-8000-000000000601";
const SAMPLE_TRIP = "00000000-0000-4000-8000-000000000402";

/** Clicks the first button or link whose text is `text`, then waits like click(). */
const clickText = (text) => async (page) => {
  // A real pointer click: layout shift right after input does not count, as in Lighthouse.
  for (const h of await page.$$("main button, main a")) {
    if ((await h.evaluate((b) => b.textContent.trim())) === text) {
      await h.click();
      break;
    }
  }
  await settle(page);
};

/** The traveller and guide apps (M4c): every page and state. */
export const MEMBER_SCREENS = [
  { name: "traveller-overview", route: T, mode: "traveller" },
  { name: "traveller-trips", route: `${T}/trips`, mode: "traveller" },
  { name: "traveller-trips-real", route: `${T}/trips`, mode: "traveller-real" },
  { name: "traveller-trips-empty", route: `${T}/trips`, mode: "traveller-empty" },
  { name: "traveller-trips-error", route: `${T}/trips`, mode: "traveller-error" },
  { name: "traveller-trip-new", route: `${T}/trips/new`, mode: "traveller-real" },
  { name: "traveller-trip-new-invalid", route: `${T}/trips/new`, mode: "traveller-real", action: clickText("Create trip") },
  { name: "traveller-trip-new-demo", route: `${T}/trips/new`, mode: "traveller" },
  { name: "traveller-trip-detail", route: `${T}/trips/${REAL_TRIP}`, mode: "traveller-real" },
  { name: "traveller-trip-detail-sample", route: `${T}/trips/${SAMPLE_TRIP}`, mode: "traveller" },
  { name: "traveller-trip-edit", route: `${T}/trips/${REAL_TRIP}/edit`, mode: "traveller-real" },
  { name: "traveller-trip-cancel", route: `${T}/trips/${REAL_TRIP}`, mode: "traveller-real", action: clickText("Cancel trip") },
  { name: "become-guide-form", route: `${T}/become-a-guide`, mode: "traveller-real" },
  { name: "become-guide-demo", route: `${T}/become-a-guide`, mode: "traveller" },
  { name: "become-guide-unverified", route: `${T}/become-a-guide`, mode: "app-unverified" },
  { name: "become-guide-submitted", route: `${T}/become-a-guide`, mode: "app-submitted" },
  { name: "become-guide-in-review", route: `${T}/become-a-guide`, mode: "app-in_review" },
  { name: "become-guide-approved", route: `${T}/become-a-guide`, mode: "app-approved" },
  { name: "become-guide-rejected", route: `${T}/become-a-guide`, mode: "app-rejected" },
  { name: "become-guide-resubmit", route: `${T}/become-a-guide`, mode: "app-rejected", action: clickText("Edit and resubmit") },
  { name: "traveller-viewas-admin", route: `${T}/trips`, mode: "admin-viewas" },
  { name: "no-access-traveller", route: `${T}/trips`, mode: "guide" },
  { name: "no-access-guide", route: G, mode: "traveller" },
  { name: "guide-overview", route: G, mode: "guide" },
  { name: "guide-overview-real", route: G, mode: "guide-real" },
  { name: "guide-profile", route: `${G}/profile`, mode: "guide" },
  { name: "guide-profile-real", route: `${G}/profile`, mode: "guide-real" },
  { name: "guide-availability", route: `${G}/availability`, mode: "guide" },
  { name: "guide-bookings", route: `${G}/bookings`, mode: "guide" },
  { name: "traveller-menu-sheet", route: T, mode: "traveller", action: click(".adm-topbar__menu"), widths: [390] },
  { name: "traveller-palette", route: T, mode: "traveller", action: click(".adm-cmdk") },
];
SCREENS.push(...MEMBER_SCREENS);

/** Table screens whose header must not move when any tab or filter changes. */
export const TABLE_SCREENS = [
  { name: "verification", route: `${A}/verification` },
  { name: "real-verification", route: `${A}/verification`, mode: "real" },
  { name: "guides-list", route: `${A}/guide-applications?view=list` },
  { name: "users", route: `${A}/users` },
  { name: "trips", route: `${A}/trips` },
  { name: "audit", route: `${A}/audit` },
  { name: "traveller-trips-real", route: "/app/traveller/trips", mode: "traveller-real" },
];
