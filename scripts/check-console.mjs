// Console check: every route loads with a clean browser console.
//
// Serves apps/web/dist with the same SPA fallback as Cloudflare, opens each
// route in headless Chrome (puppeteer-core) and fails on any console warning or
// error, including browser-generated ones such as "preloaded using link preload
// but not used" (those arrive through the CDP Log domain, not console.*).
// Requests to the API are answered locally as a signed-in demo session (the
// state in which visitors reach /account and /app/*), so the check never
// depends on the live services. Any other off-site request fails the check.
//
// Usage: pnpm build && node scripts/check-console.mjs
//        CHROME_PATH=/usr/bin/google-chrome node scripts/check-console.mjs
// Runs in CI after the web build.

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";
import { adminStub } from "./admin-stub.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "apps/web/dist");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROUTES = [
  "/",
  "/demo",
  "/login",
  "/signup",
  "/account",
  "/app/traveller",
  "/app/guide",
  "/app/admin",
  // The admin console (M4b), signed in as the demo admin with simulated data.
  "/app/admin/verification",
  "/app/admin/verification?id=00000000-0000-4000-8000-000000000204",
  "/app/admin/guide-applications",
  "/app/admin/guide-applications?view=list",
  "/app/admin/guide-applications?id=00000000-0000-4000-8000-000000000503",
  "/app/admin/users",
  "/app/admin/trips",
  "/app/admin/audit",
];
// Chrome reports an unused preload about 3 s after the load event.
const SETTLE_MS = 4500;

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

function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    let file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(DIST, "index.html");
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const API = "https://roaamm-api.plinthwell.com";
const cors = (origin) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type, x-roaamm-csrf",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EMPTY_PAGE = { items: [], page: 0, hasMore: false };

/** What the API answers a signed-in demo user of `role`; null means unknown endpoint. */
function apiStub(path, role, params) {
  if (path === "/v1/me")
    return { role, displayName: `Demo ${role}`, isDemo: true, needsNewPasskey: false };
  if (path === "/v1/verification/me") return { status: "none" };
  if (path.startsWith("/v1/admin/")) return adminStub(path, params) ?? EMPTY_PAGE;
  return null;
}

async function check(browser, origin, route) {
  const role = /^\/app\/([a-z]+)/.exec(route)?.[1] ?? "traveller";
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const problems = [];
  const offsite = [];
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin === origin || url.protocol === "data:") return void req.continue();
    if (req.method() === "OPTIONS") return void req.respond({ status: 204, headers: cors(origin) });
    const body = url.origin === API ? apiStub(url.pathname, role, url.searchParams) : null;
    if (body === null) {
      offsite.push(req.url());
      return void req.abort();
    }
    void req.respond({
      status: 200,
      contentType: "application/json",
      headers: cors(origin),
      body: JSON.stringify(body),
    });
  });
  page.on("console", (m) => {
    if (m.type() === "warn" || m.type() === "error")
      problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  const cdp = await page.createCDPSession();
  await cdp.send("Log.enable");
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "warning" || entry.level === "error")
      problems.push(`${entry.source} ${entry.level}: ${entry.text}`);
  });
  await page.goto(origin + route, { waitUntil: "load" });
  await sleep(SETTLE_MS);
  await context.close();
  return { problems: [...new Set(problems)], offsite };
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
let failed = 0;
try {
  const results = await Promise.all(ROUTES.map((r) => check(browser, origin, r)));
  ROUTES.forEach((route, i) => {
    const { problems, offsite } = results[i];
    for (const u of new Set(offsite)) problems.push(`unexpected off-site request: ${u}`);
    if (problems.length === 0) {
      console.log(`ok   ${route}`);
    } else {
      failed++;
      console.log(`FAIL ${route}`);
      for (const p of problems) console.log(`     ${p}`);
    }
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) {
  console.error(`\n${failed} route(s) logged console warnings or errors.`);
  process.exit(1);
}
console.log("\nConsole is clean on every route.");
