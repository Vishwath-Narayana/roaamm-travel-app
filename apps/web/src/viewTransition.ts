import { flushSync } from "react-dom";
import { prefersReducedMotion } from "./motion";

type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type DocWithVT = Document & { startViewTransition?: (update: () => void) => ViewTransition };

/**
 * Runs a DOM-changing update inside a View Transition when the browser
 * supports it and motion is allowed; otherwise runs it straight away.
 * React state set inside `update` is flushed synchronously so the new DOM is
 * ready when the browser takes its "after" snapshot.
 */
export function withViewTransition(update: () => void): ViewTransition | null {
  const doc = document as DocWithVT;
  if (typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
    update();
    return null;
  }
  return doc.startViewTransition(() => flushSync(update));
}

/** Theme switch: the new theme spreads as a circle from the toggle button. */
export function themeTransition(origin: HTMLElement, update: () => void) {
  const root = document.documentElement;
  // Colours switch in one go: no per-element colour fades during a theme
  // change (they would lag behind the rest of the page).
  root.classList.add("theme-switching");
  const done = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  root.classList.add("theme-transition");
  const vt = withViewTransition(update);
  if (!vt) {
    root.classList.remove("theme-transition");
    done();
    return;
  }
  const r = origin.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  vt.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 600, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    )
    .catch(() => {});
  vt.finished
    .finally(() => {
      root.classList.remove("theme-transition");
      done();
    })
    .catch(() => {});
}
