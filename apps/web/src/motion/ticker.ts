// One shared requestAnimationFrame loop for every pointer-driven effect
// (card tilt, carousel momentum). It runs only while something is subscribed
// and stops while the tab is hidden, so idle pages do no per-frame work.

type Tick = (now: number, dt: number) => boolean | void; // return false to unsubscribe

const subscribers = new Set<Tick>();
let frame = 0;
let last = 0;

function loop(now: number) {
  const dt = last ? Math.min(64, now - last) : 16.7;
  last = now;
  for (const fn of [...subscribers]) {
    if (fn(now, dt) === false) subscribers.delete(fn);
  }
  frame = subscribers.size && document.visibilityState === "visible" ? requestAnimationFrame(loop) : 0;
  if (!frame) last = 0;
}

function start() {
  if (!frame && subscribers.size && document.visibilityState === "visible") {
    frame = requestAnimationFrame(loop);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", start);
}

/** Calls `fn` every frame until it returns false or the returned function is called. */
export function onTick(fn: Tick): () => void {
  subscribers.add(fn);
  start();
  return () => subscribers.delete(fn);
}

/** For tests: how many effects are currently ticking. */
export function activeTicks(): number {
  return subscribers.size;
}
