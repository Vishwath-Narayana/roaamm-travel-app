import { useEffect, useRef, useState, type FocusEvent } from "react";
import { Button } from "../../components/Button";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from "../../components/icons";
import { Photo } from "../../components/Photo";
import { prefersReducedMotion as reducedMotionNow, useInView, usePrefersReducedMotion } from "../../motion";
import { HERO_SLIDES } from "./data";
import "./Hero.css";

export const SLIDE_MS = 7000;
const INTRO_KEY = "roaamm-hero-intro";
const TAGS = ["ID verified", "Licensed guides", "Safety built in"];

export function Hero() {
  const count = HERO_SLIDES.length;
  const reducedMotion = usePrefersReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  // Pause the slideshow (and the slow zoom) while the hero is off screen.
  const onScreen = useInView(frameRef);
  const [index, setIndex] = useState(0);
  // The slide that is leaving (it fades and shrinks while the new one wipes in).
  const [previous, setPrevious] = useState<number | null>(null);
  // The first-load intro plays once per browser session, never under reduced motion.
  const [intro] = useState(() => {
    if (reducedMotionNow()) return false;
    try {
      if (window.sessionStorage.getItem(INTRO_KEY)) return false;
      window.sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Storage unavailable: play the intro.
    }
    return true;
  });
  const [paused, setPaused] = useState(false); // pause button
  const [hovering, setHovering] = useState(false); // pointer over the frame
  const [focused, setFocused] = useState(false); // keyboard focus inside the frame
  // Slides 2 and 3 load only after the page has finished loading,
  // so they never compete with the first photo.
  const [restReady, setRestReady] = useState(false);

  useEffect(() => {
    if (document.readyState === "complete") {
      setRestReady(true);
      return;
    }
    const onLoad = () => setRestReady(true);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  const autoplay = !reducedMotion && !paused;
  const playing = autoplay && !hovering && !focused && onScreen;

  function go(delta: number) {
    setRestReady(true);
    setIndex((i) => {
      setPrevious(i);
      return (i + delta + count) % count;
    });
  }

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  }

  const slide = HERO_SLIDES[index];

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div
        ref={frameRef}
        className={`hero__frame${intro ? " hero--intro" : ""}`}
        data-onscreen={onScreen}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setFocused(true)}
        onBlur={onBlur}
      >
        <div className="hero__slides">
          {HERO_SLIDES.map((s, i) =>
            i === 0 || restReady ? (
              <div
                key={s.slot}
                className={[
                  "hero__slide",
                  i === index && "is-active",
                  i === previous && i !== index && "is-leaving",
                  // Only slides that arrive later wipe in; the first one is simply there.
                  previous !== null && i === index && "is-entering",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden={i !== index}
              >
                <Photo
                  slot={s.slot}
                  alt={s.alt}
                  sizes="100vw"
                  priority={i === 0}
                  className="hero__photo"
                />
              </div>
            ) : null,
          )}
        </div>
        <div className="hero__overlay" aria-hidden="true" />

        <div className="hero__content">
          <p className="eyebrow eyebrow--glass">
            <span className="hero__dot" aria-hidden="true" />
            ID-verified travellers only
          </p>
          <h1 id="hero-title" className="display">
            {/* Each line rises out of a mask on first load (see .line-mask). */}
            <span className="display__line line-mask">
              <span className="line-mask__inner">Travel solo.</span>
            </span>{" "}
            <span className="display__line line-mask serif">
              <span className="line-mask__inner" style={{ animationDelay: "90ms" }}>
                Never alone.
              </span>
            </span>
          </h1>
          <p className="hero__lead">
            Meet ID-verified travellers on your dates, book licensed local guides by the hour, and
            keep safety tools close for the whole trip.
          </p>
          <div className="hero__actions">
            <Button href="/demo" variant="inverse" size="lg" arrow>
              Try demo
            </Button>
            <Button href="#how-it-works" variant="glass" size="lg">
              How it works
            </Button>
          </div>
        </div>

        <div className="hero__bottom">
          <ul className="hero__tags" aria-label="What ROAAMM offers">
            {TAGS.map((t) => (
              <li key={t} className="glass-pill">
                {t}
              </li>
            ))}
          </ul>

          <div
            className="hero__carousel"
            role="group"
            aria-roledescription="carousel"
            aria-label="Hero photos"
            data-playing={playing}
          >
            <div className="hero__buttons">
              <button type="button" className="hero__btn" aria-label="Previous photo" onClick={() => go(-1)}>
                <ArrowLeftIcon size={18} />
              </button>
              <p className="hero__count mono" aria-live={playing ? "off" : "polite"} aria-atomic="true">
                <span className="visually-hidden">Photo </span>
                <span key={index} className="hero__count-num">
                  {index + 1}
                </span>
                <span aria-hidden="true">/</span>
                <span className="visually-hidden"> of </span>
                {count}
              </p>
              <button type="button" className="hero__btn" aria-label="Next photo" onClick={() => go(1)}>
                <ArrowRightIcon size={18} />
              </button>
              {!reducedMotion && (
                <button
                  type="button"
                  className="hero__btn"
                  aria-label={paused ? "Play slideshow" : "Pause slideshow"}
                  onClick={() => setPaused((p) => !p)}
                >
                  <span className="icon-swap" aria-hidden="true">
                    <PlayIcon size={16} data-on={paused} />
                    <PauseIcon size={16} data-on={!paused} />
                  </span>
                </button>
              )}
            </div>
            <div className="hero__progress" aria-hidden="true">
              <span
                key={index}
                className={autoplay ? "is-timed" : undefined}
                style={{
                  animationDuration: `${SLIDE_MS}ms`,
                  animationPlayState: playing ? "running" : "paused",
                  // Without autoplay the bar simply shows how far through the set we are.
                  transform: autoplay ? undefined : `scaleX(${(index + 1) / count})`,
                }}
                data-testid="hero-progress"
                onAnimationEnd={() => go(1)}
              />
            </div>
            <p className="hero__credit">
              Photo: {slide.credit} / Unsplash
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
