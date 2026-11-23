// Screenshot matrix for the admin console: every screen x light/dark x widths.
//   pnpm build && node scripts/shoot-admin.mjs <out-dir> [--widths 1440,390] [--only overview,users]
// Simulated data only (scripts/admin-stub.mjs). Not run in CI; the PNGs go to a
// pr-assets/* branch, never to main.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SCREENS as SHOTS, launch, open, serve } from "./ui-harness.mjs";

const args = process.argv.slice(2);
const out = args[0];
if (!out) {
  console.error("usage: shoot-admin.mjs <out-dir> [--widths 1440,390] [--only a,b]");
  process.exit(2);
}
const flag = (n) => {
  const i = args.indexOf(n);
  return i < 0 ? null : args[i + 1];
};
const widths = (flag("--widths") ?? "1440,390").split(",").map(Number);
const only = flag("--only")?.split(",");

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launch();
mkdirSync(out, { recursive: true });
let n = 0;
try {
  for (const shot of SHOTS) {
    if (only && !only.includes(shot.name)) continue;
    for (const width of widths) {
      if (shot.widths && !shot.widths.includes(width)) continue;
      for (const theme of ["light", "dark"]) {
        const { page, close } = await open(browser, origin, shot.route, { width, theme, mode: shot.mode ?? "demo" });
        if (shot.action) await shot.action(page);
        const file = join(out, `${shot.name}-${width}-${theme}.png`);
        // Drawers, sheets and the palette are fixed layers: shoot the viewport.
        const layered = /drawer|palette|menu-sheet/.test(shot.name);
        await page.screenshot({ path: file, fullPage: !layered });
        await close();
        n++;
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`${n} screenshots in ${out}`);
