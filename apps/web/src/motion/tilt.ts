import { prefersReducedMotion } from ".";
import { onTick } from "./ticker";

// Card tilt and glare. Any element with data-tilt follows the pointer: up to
// 4 degrees of 3D tilt and a soft light glare, written as CSS variables by the
// shared ticker and eased each frame. It fades back to rest when the pointer
// leaves. Only for fine pointers (mouse, trackpad) with motion allowed.

const MAX_DEG = 4;
const EASE = 0.16; // share of the remaining distance covered per frame

type State = { el: HTMLElement; tx: number; ty: number; x: number; y: number; on: boolean };
let current: State | null = null;
const leaving = new Set<State>();
let stop: (() => void) | null = null;

function write(s: State) {
  s.el.style.setProperty("--rx", `${(-s.y * MAX_DEG).toFixed(2)}deg`);
  s.el.style.setProperty("--ry", `${(s.x * MAX_DEG).toFixed(2)}deg`);
  // Glare position in % of the card, and how strong it is.
  s.el.style.setProperty("--gx", `${((s.x + 1) * 50).toFixed(1)}%`);
  s.el.style.setProperty("--gy", `${((s.y + 1) * 50).toFixed(1)}%`);
}

function tick(): boolean {
  const all = current ? [current, ...leaving] : [...leaving];
  for (const s of all) {
    s.x += (s.tx - s.x) * EASE;
    s.y += (s.ty - s.y) * EASE;
    write(s);
    if (!s.on && Math.abs(s.x) < 0.01 && Math.abs(s.y) < 0.01) {
      s.el.style.removeProperty("--rx");
      s.el.style.removeProperty("--ry");
      delete s.el.dataset.tilting;
      leaving.delete(s);
    }
  }
  if (!current && leaving.size === 0) {
    stop = null;
    return false;
  }
  return true;
}

function ensureTicking() {
  if (!stop) stop = onTick(tick);
}

function release() {
  if (!current) return;
  current.on = false;
  current.tx = 0;
  current.ty = 0;
  leaving.add(current);
  current = null;
}

function onMove(e: PointerEvent) {
  if (e.pointerType !== "mouse" || prefersReducedMotion()) return release();
  const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-tilt]") ?? null;
  if (current && current.el !== el) release();
  if (!el) return;
  const r = el.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
  if (!current) {
    const back = [...leaving].find((s) => s.el === el);
    if (back) leaving.delete(back);
    current = back ?? { el, tx: 0, ty: 0, x: 0, y: 0, on: true };
    current.on = true;
    el.dataset.tilting = "";
  }
  current.tx = Math.max(-1, Math.min(1, nx));
  current.ty = Math.max(-1, Math.min(1, ny));
  ensureTicking();
}

let installed = false;

/** Installs the single page-wide listener (once). No-op on touch-only devices. */
export function installTilt(): void {
  if (installed || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  installed = true;
  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", release);
  window.addEventListener("blur", release);
}
