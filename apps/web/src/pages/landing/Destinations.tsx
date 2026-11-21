import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Badge } from "../../components/Badge";
import { ArrowLeftIcon, ArrowRightIcon } from "../../components/icons";
import { Photo } from "../../components/Photo";
import { Link } from "../../router";
import { prefersReducedMotion, Reveal } from "../../motion";
import { DESTINATIONS } from "./data";
import { SectionHead } from "./SectionHead";
import "./Destinations.css";

/** Pixels a press must move before it counts as a drag (and not a click). */
const DRAG_THRESHOLD = 6;

export function Destinations() {
  const trackRef = useRef<HTMLUListElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
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

  // Drag to scroll with a mouse. Touch and trackpads already scroll natively.
  function onPointerDown(e: PointerEvent<HTMLUListElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
  }

  function onPointerMove(e: PointerEvent<HTMLUListElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true); // turns off scroll-snap while dragging
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.currentTarget.scrollLeft = d.left - dx;
  }

  function endDrag(e: PointerEvent<HTMLUListElement>) {
    if (!drag.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // Keep the flag one tick so the click that ends a drag is swallowed.
    const moved = drag.current.moved;
    setTimeout(() => {
      drag.current = null;
    }, 0);
    if (moved) setDragging(false); // scroll-snap returns and settles on a card
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
          <Reveal as="li" key={d.slot} delay={i} className="dest-card" data-simulated-scope>
            <div className="dest-card__media">
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
