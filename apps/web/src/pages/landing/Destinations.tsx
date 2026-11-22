import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Badge } from "../../components/Badge";
import { ArrowLeftIcon, ArrowRightIcon } from "../../components/icons";
import { Photo } from "../../components/Photo";
import { Link } from "../../router";
import { prefersReducedMotion, Reveal } from "../../motion";
import { onTick } from "../../motion/ticker";
import { DUR, springAt, springEasing } from "../../motion/tokens";
import { DESTINATIONS } from "./data";
import { SectionHead } from "./SectionHead";
import "./Destinations.css";

/** Pixels a press must move before it counts as a drag (and not a click). */
const DRAG_THRESHOLD = 6;
/** Momentum keeps this share of its speed per 60 Hz frame. */
const FRICTION = 0.94;
/** Below this speed (px/ms) momentum stops and the track settles on a card. */
const MIN_SPEED = 0.05;
/** How much of a drag past either end is shown (rubber band). */
const EDGE_RESISTANCE = 0.3;

export function Destinations() {
  const trackRef = useRef<HTMLUListElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{
    x: number;
    left: number;
    moved: boolean;
    samples: { t: number; x: number }[];
  } | null>(null);
  const stopMotion = useRef<(() => void) | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [dragging, setDragging] = useState(false);

  const update = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    const max = t.scrollWidth - t.clientWidth;
    setAtStart(t.scrollLeft <= 4);
    setAtEnd(t.scrollLeft >= max - 4);
    // Progress bar: written straight to the DOM so scrolling never re-renders.
    const p = max > 0 ? t.scrollLeft / max : 1;
    barRef.current?.style.setProperty("--progress", String(Math.min(1, Math.max(0, p))));
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  /** Scrolls by one card (plus the gap) in the given direction. */
  function step(dir: 1 | -1) {
    const t = trackRef.current;
    if (!t) return;
    const card = t.querySelector("li");
    const gap = parseFloat(getComputedStyle(t).columnGap) || 0;
    const cardWidth = card?.getBoundingClientRect().width ?? 0;
    const distance = cardWidth > 0 ? cardWidth + gap : t.clientWidth * 0.8;
    t.scrollBy({ left: dir * distance, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  /** Nearest card's resting scroll position (matches the CSS scroll-snap points). */
  function nearestCardLeft(t: HTMLUListElement, from: number) {
    const inset = parseFloat(getComputedStyle(t).scrollPaddingInlineStart) || 0;
    const max = t.scrollWidth - t.clientWidth;
    let best = from;
    let bestDist = Infinity;
    for (const li of t.querySelectorAll<HTMLElement>(":scope > li")) {
      const left = Math.min(max, Math.max(0, li.offsetLeft - inset));
      const d = Math.abs(left - from);
      if (d < bestDist) [best, bestDist] = [left, d];
    }
    return best;
  }

  /** Glides to the nearest card on the spring, then hands back to scroll-snap. */
  function settle(t: HTMLUListElement) {
    const from = t.scrollLeft;
    const to = nearestCardLeft(t, from);
    const start = performance.now();
    stopMotion.current?.();
    stopMotion.current = onTick((now) => {
      const p = Math.min(1, (now - start) / DUR.content);
      t.scrollLeft = from + (to - from) * springAt(p);
      if (p < 1) return true;
      stopMotion.current = null;
      setDragging(false); // scroll-snap returns, already aligned
      return false;
    });
  }

  /** Momentum after a fling: speed decays with friction, then settle. */
  function fling(t: HTMLUListElement, speed: number) {
    let v = speed; // px per ms, positive scrolls right
    stopMotion.current?.();
    stopMotion.current = onTick((_now, dt) => {
      const max = t.scrollWidth - t.clientWidth;
      const next = t.scrollLeft + v * dt;
      t.scrollLeft = Math.min(max, Math.max(0, next));
      v *= Math.pow(FRICTION, dt / 16.7);
      if (Math.abs(v) > MIN_SPEED && next > 0 && next < max) return true;
      stopMotion.current = null;
      settle(t);
      return false;
    });
  }

  useEffect(() => () => stopMotion.current?.(), []);

  // Drag to scroll with a mouse (touch and trackpads already scroll natively),
  // with momentum on release and a rubber band past either end.
  function onPointerDown(e: PointerEvent<HTMLUListElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    stopMotion.current?.();
    stopMotion.current = null;
    drag.current = {
      x: e.clientX,
      left: e.currentTarget.scrollLeft,
      moved: false,
      samples: [{ t: performance.now(), x: e.clientX }],
    };
  }

  function onPointerMove(e: PointerEvent<HTMLUListElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    const t = e.currentTarget;
    if (!d.moved) {
      d.moved = true;
      setDragging(true); // turns off scroll-snap while dragging
      t.setPointerCapture(e.pointerId);
    }
    const now = performance.now();
    d.samples.push({ t: now, x: e.clientX });
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();

    const max = t.scrollWidth - t.clientWidth;
    const target = d.left - dx;
    t.scrollLeft = Math.min(max, Math.max(0, target));
    // Past an end: show a fraction of the overshoot, like a rubber band.
    const over = target < 0 ? -target : target > max ? max - target : 0;
    t.style.translate = over ? `${over * EDGE_RESISTANCE}px 0` : "";
  }

  function endDrag(e: PointerEvent<HTMLUListElement>) {
    const d = drag.current;
    if (!d) return;
    const t = e.currentTarget;
    if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
    // Keep the flag one tick so the click that ends a drag is swallowed.
    setTimeout(() => {
      drag.current = null;
    }, 0);
    if (!d.moved) return;

    // Spring back from the rubber band.
    if (t.style.translate) {
      const shift = t.style.translate;
      t.style.translate = "";
      if (!prefersReducedMotion() && t.animate) {
        t.animate([{ translate: shift }, { translate: "0 0" }], { duration: DUR.ui, easing: springEasing() });
      }
    }
    if (prefersReducedMotion()) {
      setDragging(false); // scroll-snap settles instantly
      return;
    }
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const speed = last.t > first.t ? -(last.x - first.x) / (last.t - first.t) : 0;
    if (Math.abs(speed) > MIN_SPEED) fling(t, speed);
    else settle(t);
  }

  // Keyboard: arrows move one card, Home and End jump to the ends.
  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const t = e.currentTarget;
    if (e.target !== t) return; // links inside cards keep their own keys
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Home") t.scrollTo({ left: 0, behavior });
    else if (e.key === "End") t.scrollTo({ left: t.scrollWidth, behavior });
    else return;
    e.preventDefault();
  }

  return (
    <section className="section destinations" aria-labelledby="dest-title">
      <div className="container">
        <SectionHead
          className="destinations__head"
          eyebrow="Your journey"
          id="dest-title"
          title={
            <>
              Meet travellers on <span className="serif">your dates</span>
            </>
          }
          aside={
            <div className="destinations__nav">
              <button
                type="button"
                className="circle-btn"
                aria-label="Previous destinations"
                aria-controls="dest-track"
                disabled={atStart}
                onClick={() => step(-1)}
              >
                <ArrowLeftIcon size={20} />
              </button>
              <button
                type="button"
                className="circle-btn"
                aria-label="Next destinations"
                aria-controls="dest-track"
                disabled={atEnd}
                onClick={() => step(1)}
              >
                <ArrowRightIcon size={20} />
              </button>
            </div>
          }
        />
      </div>

      <ul
        id="dest-track"
        ref={trackRef}
        className={`dest-track${dragging ? " is-dragging" : ""}`}
        aria-label="Destinations"
        tabIndex={0}
        onScroll={update}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDragStart={(e) => e.preventDefault()}
        data-near-root
      >
        {DESTINATIONS.map((d, i) => (
          <Reveal as="li" key={d.slot} delay={i} className="dest-card" data-simulated-scope data-tilt>
            <div className="dest-card__media" data-glare>
              <Photo slot={d.slot} alt={d.alt} sizes="(min-width: 900px) 340px, 78vw" />
              <span className="dest-card__country">{d.country}</span>
            </div>
            <div className="dest-card__body">
              <h3>
                <Link href="/demo" className="dest-card__link">
                  {d.title}
                </Link>
              </h3>
              <p className="dest-card__line">{d.line}</p>
              <div className="dest-card__foot">
                <p className="small">
                  <span className="mono" data-simulated>
                    {d.travellers}
                  </span>{" "}
                  travellers this week
                </p>
                <Badge className="badge--tiny">Simulated data</Badge>
                <ArrowRightIcon size={18} className="dest-card__arrow" />
              </div>
            </div>
          </Reveal>
        ))}
      </ul>
      <div className="container">
        <div className="dest-progress" aria-hidden="true">
          <span ref={barRef} />
        </div>
      </div>
    </section>
  );
}
