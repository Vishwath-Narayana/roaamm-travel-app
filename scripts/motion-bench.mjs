// Motion benchmark: does the site stay smooth while it moves?
//
// Serves apps/web/dist, opens it in Chrome (puppeteer-core, your installed
// Chrome), scrolls top to bottom at a steady speed with real wheel input,
// clicks every "See it live" tab, opens and closes FAQ items and drags the
// destination carousel, while a requestAnimationFrame probe records every
// frame. Runs twice: desktop (no throttling) and with the CPU slowed 4x.
//
// Usage: pnpm --filter @roaamm/web build && node scripts/motion-bench.mjs
//        CHROME_PATH=/path/to/chrome node scripts/motion-bench.mjs
// Not run in CI (timing depends on the machine).
//
// Prints per profile: % of frames on time (within one 60 Hz frame, 16.7 ms
// plus 0.8 ms timer jitter), p95 frame time, worst long animation frame,
// total layout shift.

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "apps/web/dist");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ON_TIME_MS = 16.7 + 0.8;

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

/** Static server for dist with the same SPA fallback as Cloudflare. */
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
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

/** Installed before any page script: frame probe and performance observers. */
function probe() {
  const w = window;
  w.__bench = { frames: [], loaf: [], cls: 0, on: false, marks: [] };
  let last = 0;
  const tick = (t) => {
    if (w.__bench.on && last) w.__bench.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (w.__bench.on) w.__bench.loaf.push(e.duration);
    }).observe({ type: "long-animation-frame", buffered: false });
  } catch {
    /* older Chrome */
  }
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) w.__bench.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browser, url, { name, cpu }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.evaluateOnNewDocument(probe);
  await page.goto(url, { waitUntil: "load" });
  // Experiments: BENCH_CSS="..." injects extra CSS (e.g. to switch an effect off).
  if (process.env.BENCH_CSS) await page.addStyleTag({ content: process.env.BENCH_CSS });
  await sleep(1500);
  await page.evaluate(() => (window.__bench.on = true));

  await page.evaluate(() => window.__bench.marks.push(["scroll", window.__bench.frames.length]));
  // 1. Scroll to the bottom at a steady ~1500 px/s with real wheel events.
  await page.mouse.move(720, 450);
  for (let i = 0; i < 400; i++) {
    await page.mouse.wheel({ deltaY: 60 });
    await sleep(40);
    const done = await page.evaluate(
      () => scrollY + innerHeight >= document.documentElement.scrollHeight - 2,
    );
    if (done) break;
  }

  await page.evaluate(() => window.__bench.marks.push(["tabs", window.__bench.frames.length]));
  // 2. Every "See it live" tab.
  await page.evaluate(() => document.getElementById("live")?.scrollIntoView({ block: "start" }));
  await sleep(600);
  for (const tab of await page.$$("#live [role=tab]")) {
    await tab.click();
    await sleep(1500);
  }

  await page.evaluate(() => window.__bench.marks.push(["faq", window.__bench.frames.length]));
  // 3. FAQ: open and close three items.
  await page.evaluate(() => document.getElementById("faq")?.scrollIntoView({ block: "center" }));
  await sleep(600);
  for (const summary of (await page.$$("#faq summary")).slice(0, 3)) {
    await summary.click();
    await sleep(500);
    await summary.click();
    await sleep(500);
  }

  await page.evaluate(() => window.__bench.marks.push(["drag", window.__bench.frames.length]));
  // 4. Drag the destination carousel left and back.
  await page.evaluate(() => document.getElementById("dest-track")?.scrollIntoView({ block: "center" }));
  await sleep(600);
  const box = await (await page.$("#dest-track"))?.boundingBox();
  if (box) {
    const y = box.y + box.height / 2;
    for (const [from, to] of [
      [box.x + 900, box.x + 200],
      [box.x + 200, box.x + 900],
    ]) {
      await page.mouse.move(from, y);
      await page.mouse.down();
      await page.mouse.move(to, y, { steps: 30 });
      await page.mouse.up();
      await sleep(800);
    }
  }

  const data = await page.evaluate(() => {
    window.__bench.on = false;
    return window.__bench;
  });
  await page.close();

  // Per phase: share of on-time frames and p95, to see where any jank comes from.
  const phases = {};
  data.marks.forEach(([name, start], i) => {
    const end = data.marks[i + 1]?.[1] ?? data.frames.length;
    const f = data.frames.slice(start, end).filter((d) => d > 0 && d < 1000);
    const sortedF = [...f].sort((a, b) => a - b);
    phases[name] = `${((f.filter((d) => d <= ON_TIME_MS).length / Math.max(1, f.length)) * 100).toFixed(1)}% / p95 ${(sortedF[Math.floor(sortedF.length * 0.95)] ?? 0).toFixed(1)} ms`;
  });
  const frames = data.frames.filter((d) => d > 0 && d < 1000);
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const onTime = frames.filter((d) => d <= ON_TIME_MS).length / Math.max(1, frames.length);
  return {
    profile: name,
    frames: frames.length,
    onTime: `${(onTime * 100).toFixed(1)}%`,
    p95: `${p95.toFixed(1)} ms`,
    worstLongFrame: `${Math.round(Math.max(0, ...data.loaf))} ms`,
    longFrames: data.loaf.length,
    cls: data.cls.toFixed(4),
    phases,
  };
}

const server = await serve();
const url = `http://localhost:${server.address().port}/`;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--window-size=1440,900", "--hide-scrollbars"],
});
try {
  const rows = [];
  const profiles = [
    { name: "desktop (1x CPU)", cpu: 1 },
    { name: "4x CPU throttle", cpu: 4 },
  ].filter((p) => !process.env.BENCH_ONLY || p.cpu === Number(process.env.BENCH_ONLY));
  for (const profile of profiles) {
    rows.push(await run(browser, url, profile));
  }
  console.table(rows.map(({ phases, ...r }) => r));
  for (const r of rows) console.log(r.profile, "by phase (on time / p95):", r.phases);
  console.log(
    "| Profile | Frames | On time (<=16.7 ms) | p95 frame | Worst long frame | Long frames | Layout shift |\n|---|---|---|---|---|---|---|\n" +
      rows
        .map((r) => `| ${r.profile} | ${r.frames} | ${r.onTime} | ${r.p95} | ${r.worstLongFrame} | ${r.longFrames} | ${r.cls} |`)
        .join("\n"),
  );
} finally {
  await browser.close();
  server.close();
}
