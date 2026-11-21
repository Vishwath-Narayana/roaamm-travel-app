import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../../components/Badge";
import { ArrowLeftIcon, ArrowRightIcon } from "../../components/icons";
import { Photo } from "../../components/Photo";
import { Link } from "../../router";
import { prefersReducedMotion, useReveal } from "../../motion";
import { DESTINATIONS } from "./data";
import "./Destinations.css";

export function Destinations() {
  const trackRef = useRef<HTMLUListElement>(null);
  const headRef = useReveal<HTMLDivElement>();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    setAtStart(t.scrollLeft <= 4);
    setAtEnd(t.scrollLeft + t.clientWidth >= t.scrollWidth - 4);
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

  return (
    <section className="section destinations" aria-labelledby="dest-title">
      <div className="container">
        <div className="destinations__head" ref={headRef}>
          <div className="section-head">
            <p className="eyebrow">Your journey</p>
            <h2 id="dest-title">
              Meet travellers on <span className="serif">your dates</span>
            </h2>
          </div>
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
        </div>
      </div>

      <ul
        id="dest-track"
        ref={trackRef}
        className="dest-track"
        aria-label="Destinations"
        tabIndex={0}
        onScroll={update}
      >
        {DESTINATIONS.map((d) => (
          <li key={d.slot} className="dest-card" data-simulated-scope>
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
          </li>
        ))}
      </ul>
    </section>
  );
}
