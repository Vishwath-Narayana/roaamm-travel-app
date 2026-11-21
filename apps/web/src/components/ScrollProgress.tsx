import { useEffect, useRef } from "react";
import "./ScrollProgress.css";

function supportsScrollTimeline() {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function"
    ? CSS.supports("animation-timeline: scroll()")
    : false;
}

/**
 * A 2px bar at the very top showing how far down the page you are.
 * CSS scroll-driven animation where supported; otherwise a tiny scroll
 * listener sets the scale directly (no React re-render).
 */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || supportsScrollTimeline()) return;
    let queued = false;
    const draw = () => {
      queued = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(draw);
      }
    };
    draw();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return <div ref={ref} className="scroll-progress" aria-hidden="true" />;
}
