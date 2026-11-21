import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { Badge } from "../components/Badge";
import { PauseIcon, PlayIcon } from "../components/icons";
import { Reveal, useInView, usePrefersReducedMotion } from "../motion";
import { ASSISTANT_STEPS, CHAT_STEPS, SAFETY_STEPS, total } from "./script";
import "./LiveSection.css";

// The panels are their own chunk: loaded only when this section nears the
// screen, so the first page load does not pay for them.
const ChatPanel = lazy(() => import("./panels").then((m) => ({ default: m.ChatPanel })));
const AssistantPanel = lazy(() => import("./panels").then((m) => ({ default: m.AssistantPanel })));
const SafetyPanel = lazy(() => import("./panels").then((m) => ({ default: m.SafetyPanel })));

export const LIVE_TABS = [
  {
    id: "chat",
    label: "Encrypted chat",
    Panel: ChatPanel,
    ms: total(CHAT_STEPS),
    title: "Chat that only you can read",
    body: "Messages and voice notes are encrypted on your device with MLS (RFC 9420). The server only ever stores ciphertext.",
    points: ["Delivered and read receipts", "Voice notes, encrypted too", "Safety numbers to verify a contact"],
  },
  {
    id: "assistant",
    label: "AI assistant",
    Panel: AssistantPanel,
    ms: total(ASSISTANT_STEPS),
    title: "Ask in plain words",
    body: "The assistant turns a question into a search over trips and dates. It reads discovery data only, never your chats.",
    points: ["Understands \"this weekend\"", "Only ID-verified travellers", "Suggests the next question"],
  },
  {
    id: "safety",
    label: "Safety tools",
    Panel: SafetyPanel,
    ms: total(SAFETY_STEPS),
    title: "A safety net that is always on",
    body: "Share your live location with people you choose, set a check-in timer, and press SOS when you need help.",
    points: ["Live location, end-to-end encrypted", "Missed check-ins escalate", "SOS alerts your contacts"],
  },
] as const;

/** Time the final state of a panel stays up before the next tab plays. */
export const HOLD_MS = 2600;

type LiveSectionProps = {
  /** Heading level and copy differ between the landing page and /demo. */
  headingLevel?: "h2" | "h3";
  id?: string;
  className?: string;
};

export function LiveSection({ headingLevel = "h2", id = "live", className }: LiveSectionProps) {
  const uid = useId();
  const rootRef = useRef<HTMLElement>(null);
  const near = useInView(rootRef, { margin: "400px", once: true });
  const visible = useInView(rootRef, { margin: "-15% 0px" });
  const reduced = usePrefersReducedMotion();

  const [active, setActive] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false); // hover or focus: no auto-advance
  const [done, setDone] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const playing = visible && !paused && !reduced;

  const select = useCallback((i: number) => {
    setActive(i);
    setDone(false);
    setRunKey((k) => k + 1);
  }, []);

  // When a panel finishes, hold its final state, then move to the next tab.
  useEffect(() => {
    if (!done || !playing || holding) return;
    const t = window.setTimeout(() => select((active + 1) % LIVE_TABS.length), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [done, playing, holding, active, select]);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = LIVE_TABS.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  }

  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHolding(false);
  }

  const onDone = useCallback(() => setDone(true), []);
  const Heading = headingLevel;
  const { Panel, title, body, points } = LIVE_TABS[active];

  return (
    <section
      ref={rootRef}
      id={id}
      className={["live", className].filter(Boolean).join(" ")}
      aria-labelledby={`${uid}-title`}
      data-simulated-scope
      data-playing={playing}
      onMouseEnter={() => setHolding(true)}
      onMouseLeave={() => setHolding(false)}
      onFocus={() => setHolding(true)}
      onBlur={onBlur}
    >
      <div className="live__head">
        <div className="section-head">
          <Reveal as="p" variant="fade" className="eyebrow">
            See it live
          </Reveal>
          <Reveal as={Heading} id={`${uid}-title`} delay={1}>
            The product, <span className="serif">in motion</span>
          </Reveal>
        </div>
        <Badge>Simulated preview</Badge>
      </div>

      <div className="live__bar">
        <div className="live__tabs" role="tablist" aria-label="Preview">
          {LIVE_TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={i === active}
              aria-controls={`${uid}-panel`}
              tabIndex={i === active ? 0 : -1}
              className="live__tab"
              onClick={() => select(i)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
              {i === active && !done && !reduced && (
                <span
                  key={runKey}
                  className="live__tab-progress"
                  style={{ animationDuration: `${t.ms}ms` }}
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
        {!reduced && (
          <div className="live__controls">
            <button
              type="button"
              className="circle-btn circle-btn--sm"
              aria-label={paused ? "Play preview" : "Pause preview"}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
            </button>
            <button type="button" className="live__replay" onClick={() => select(active)}>
              Replay
            </button>
          </div>
        )}
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${LIVE_TABS[active].id}`}
        className="live__stage"
        data-paused={!playing}
      >
        <div className="live__about">
          <h3>{title}</h3>
          <p>{body}</p>
          <ul>
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="live__preview">
          {near ? (
            <Suspense fallback={<div className="live__loading">Loading preview</div>}>
              <Panel key={`${active}-${runKey}`} playing={playing} runKey={runKey} onDone={onDone} />
            </Suspense>
          ) : (
            <div className="live__loading" />
          )}
        </div>
      </div>
    </section>
  );
}
