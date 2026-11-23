// JavaScript size budgets for a Vite build, gzipped.
//   node scripts/check-bundle-size.mjs apps/web/dist --initial 110 --total 130
//
// --initial: what a first visit to the landing page downloads: the entry
//            module in index.html plus every chunk it preloads.
// --total:   every .js file in the build, lazy chunks included.
// Prints a per-chunk breakdown so a regression is easy to place.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const dir = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? null : Number(args[i + 1]);
};
const initialBudget = flag("--initial");
const totalBudget = flag("--total");
if (!dir || (initialBudget === null && totalBudget === null)) {
  console.error("usage: check-bundle-size.mjs <dist> --initial <kB> --total <kB>");
  process.exit(2);
}

function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const kb = (bytes) => bytes / 1024;
const files = walk(dir).filter((f) => f.endsWith(".js"));
const sizes = new Map(files.map((f) => [basename(f), gzipSync(readFileSync(f)).length]));

// Entry and preloaded chunks, as index.html references them.
const html = readFileSync(join(dir, "index.html"), "utf8");
const initial = new Set(
  [...html.matchAll(/<(?:script[^>]*type="module"[^>]*src|link[^>]*rel="modulepreload"[^>]*href)="([^"]+\.js)"/g)]
    .map((m) => basename(m[1])),
);

const total = [...sizes.values()].reduce((a, b) => a + b, 0);
const initialBytes = [...initial].reduce((a, f) => a + (sizes.get(f) ?? 0), 0);

console.log("chunk                                   gzip kB   loaded");
for (const [name, size] of [...sizes].sort((a, b) => b[1] - a[1])) {
  console.log(`${name.padEnd(40)}${kb(size).toFixed(1).padStart(7)}   ${initial.has(name) ? "first visit" : "lazy"}`);
}
console.log(`initial JS (landing page): ${kb(initialBytes).toFixed(1)} kB` +
  (initialBudget === null ? "" : ` (budget ${initialBudget} kB)`));
console.log(`total JS (all chunks):     ${kb(total).toFixed(1)} kB` +
  (totalBudget === null ? "" : ` (ceiling ${totalBudget} kB)`));

let failed = false;
if (initial.size === 0) {
  console.error("no entry module found in index.html");
  failed = true;
}
if (initialBudget !== null && kb(initialBytes) > initialBudget) {
  console.error("initial JS budget exceeded");
  failed = true;
}
if (totalBudget !== null && kb(total) > totalBudget) {
  console.error("total JS ceiling exceeded");
  failed = true;
}
process.exit(failed ? 1 : 0);
