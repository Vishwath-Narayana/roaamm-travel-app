import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";

function query(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(REDUCE) : null;
}

export function prefersReducedMotion(): boolean {
  return query()?.matches ?? false;
}

function subscribe(cb: () => void) {
  const mq = query();
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}

/** True while the visitor asks for reduced motion; updates live. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/**
 * Fades an element up (24px, 500ms) when it first scrolls into view.
 * Does nothing under reduced motion or without IntersectionObserver.
 * Runs before paint so content never flashes visible and then hides.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    // Already on screen when the page loads: leave it alone.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add("reveal");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
