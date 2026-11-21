// Fails when the gzipped JavaScript in a build directory exceeds a budget (in kB).
// Usage: node scripts/check-bundle-size.mjs apps/web/dist 250
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const [dir, budgetKb] = process.argv.slice(2);
if (!dir || !budgetKb) {
  console.error("usage: check-bundle-size.mjs <dir> <budgetKb>");
  process.exit(2);
}

function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const js = walk(dir).filter((f) => f.endsWith(".js"));
const total = js.reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);
const kb = total / 1024;
console.log(`gzipped JS: ${kb.toFixed(1)} kB (budget ${budgetKb} kB) across ${js.length} file(s)`);
if (kb > Number(budgetKb)) {
  console.error("bundle size budget exceeded");
  process.exit(1);
}
