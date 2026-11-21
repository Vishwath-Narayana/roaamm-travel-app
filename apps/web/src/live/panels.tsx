import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useOptionalToast } from "../components/Toast";
import { CheckIcon, LockIcon, PinIcon, PlayIcon, ShieldIcon } from "../components/icons";
import {
  ASSISTANT_QUESTION,
  ASSISTANT_STEPS,
  CHAT_STEPS,
  SAFETY_STEPS,
  TYPE_MS,
} from "./script";
import { avatarGradient, useTimeline, useTypewriter } from "./useTimeline";
import "./live.css";

// Three simulated previews. Pure client side: no network, no real people.
// Each one is a short script (useTimeline) that ends in a final state, which
// is also what reduced-motion visitors see straight away.

export type PanelProps = {
  /** Script runs only while true (in view, not paused). */
  playing: boolean;
  /** Changing this restarts the script. */
  runKey: number;
  /** Called once when the script reaches its final state. */
  onDone: () => void;
};

function useDone(done: boolean, onDone: () => void) {
  const fired = useRef(false);
  useEffect(() => {
    if (done && !fired.current) {
      fired.current = true;
      onDone();
    }
    if (!done) fired.current = false;
  }, [done, onDone]);
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="live-avatar"
      style={{ background: avatarGradient(name), width: size, height: size }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="typing" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/* ------------------------------------------------------------------ Chat */


export function ChatPanel({ playing, runKey, onDone }: PanelProps) {
  const { step, done } = useTimeline(CHAT_STEPS, playing, runKey);
  useDone(done, onDone);
  const voicePlaying = playing && step === 5;

  return (
    <div className="live-panel" data-final={done}>
      <p className="visually-hidden">
        Simulated preview of an encrypted chat with Inès, a verified traveller in Lisbon. She says
        she lands on the 14th too; you suggest the tram 28 ride on Saturday; she sends a 14 second
        voice note; you agree to meet at the Martim Moniz stop at 10, and she has read it.
      </p>
      <div className="phone" aria-hidden="true">
        <div className="phone__head">
          <Avatar name="Ines Rocha" />
          <div className="phone__who">
            <span className="phone__name">
              Inès <span className="live-verified">
                <CheckIcon size={12} strokeWidth={3} /> Verified
              </span>
            </span>
            <span className="phone__e2ee">
              <LockIcon size={12} strokeWidth={2} /> End-to-end encrypted
            </span>
          </div>
        </div>
        <div className="phone__body" aria-live="off">
          {step >= 1 && step < 2 && (
            <div className="bubble bubble--them bubble--typing">
              <TypingDots />
            </div>
          )}
          {step >= 2 && <div className="bubble bubble--them">Hi! I land in Lisbon on the 14th too.</div>}
          {step >= 3 && (
            <div className="bubble bubble--me">Same! Thinking of the tram 28 ride on Saturday.</div>
          )}
          {step === 4 && (
            <div className="bubble bubble--them bubble--typing">
              <TypingDots />
            </div>
          )}
          {step >= 5 && (
            <div className={`bubble bubble--them voice${voicePlaying ? " is-playing" : ""}`}>
              <span className="voice__play">
                <PlayIcon size={12} />
              </span>
              <span className="voice__wave">
                {Array.from({ length: 22 }, (_, i) => (
                  <span key={i} style={{ "--b": i } as CSSProperties} />
                ))}
              </span>
              <span className="voice__time mono">0:14</span>
            </div>
          )}
          {step >= 6 && (
            <div className="bubble bubble--me">
              Sounds good. Meet at the Martim Moniz stop at 10?
              <span className={`ticks${step >= 7 ? " is-read" : ""}`}>
                <CheckIcon size={12} strokeWidth={2.5} />
                <CheckIcon size={12} strokeWidth={2.5} />
                <span>{step >= 7 ? "Read" : "Delivered"}</span>
              </span>
            </div>
          )}
        </div>
        <div className="phone__foot">
          <span className="chip">
            <ShieldIcon size={14} strokeWidth={2} /> Safety number 48213 90775
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Assistant */


// Not real people: fictional first names, generated avatars.
export const ASSISTANT_RESULTS = [
  { name: "Aiko", country: "Japan", dates: "Fri to Sun", match: 92 },
  { name: "Tomás", country: "Argentina", dates: "Sat to Mon", match: 88 },
  { name: "Lena", country: "Germany", dates: "Sat only", match: 81 },
];


export function AssistantPanel({ playing, runKey, onDone }: PanelProps) {
  const { step, done } = useTimeline(ASSISTANT_STEPS, playing, runKey);
  useDone(done, onDone);
  const typed = useTypewriter(ASSISTANT_QUESTION, step === 1 && playing, step >= 2, TYPE_MS);

  return (
    <div className="live-panel" data-final={done}>
      <p className="visually-hidden">
        Simulated preview of the AI assistant. Question: {ASSISTANT_QUESTION} Answer: three
        ID-verified travellers are free this weekend in Lisbon:{" "}
        {ASSISTANT_RESULTS.map((r) => `${r.name} from ${r.country}, ${r.dates}, ${r.match}% match`).join("; ")}.
      </p>
      <div className="assistant" aria-hidden="true">
        <div className="assistant__ask">
          <span className="assistant__q" aria-live="off">
            {step >= 1 ? typed : ""}
            {step === 1 && <span className="caret" />}
            {step === 0 && <span className="assistant__placeholder">Ask about trips and travellers</span>}
          </span>
        </div>
        {step === 2 && (
          <div className="assistant__thinking">
            <TypingDots /> Checking trips and dates
          </div>
        )}
        {step >= 3 && <p className="assistant__answer">Three verified travellers are free this weekend:</p>}
        <div className="assistant__results">
          {ASSISTANT_RESULTS.map((r, i) =>
            step >= 3 + i ? (
              <div key={r.name} className="result">
                <Avatar name={r.name} size={40} />
                <div className="result__who">
                  <span className="result__name">{r.name}</span>
                  <span className="result__meta">
                    {r.country} · {r.dates}
                  </span>
                  <span className="live-verified">
                    <CheckIcon size={12} strokeWidth={3} /> ID verified
                  </span>
                </div>
                <span className="result__match mono">{r.match}%</span>
              </div>
            ) : null,
          )}
        </div>
        {step >= 6 && (
          <div className="assistant__chips">
            <span className="chip">Only women travellers</span>
            <span className="chip">Add a guide for Sunday</span>
            <span className="chip">Show on a map</span>
          </div>
        )}
      </div>
      <p className="live-caption small">Simulated answers. The real assistant arrives in a later milestone.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Safety */

const ROUTE = "M30 190 C 70 190, 80 140, 120 140 S 170 90, 210 90 S 260 40, 300 40";
const TICKS = 24;

export function SafetyPanel({ playing, runKey, onDone }: PanelProps) {
  const { step, done, reduced } = useTimeline(SAFETY_STEPS, playing, runKey);
  useDone(done, onDone);
  const routeRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGGElement>(null);
  const toast = useOptionalToast();
  const [sent, setSent] = useState(false);

  // Move the live-location dot along the route (transform only).
  useEffect(() => {
    const path = routeRef.current;
    const dot = dotRef.current;
    if (!path || !dot || typeof path.getTotalLength !== "function") return;
    const total = path.getTotalLength();
    const place = (t: number) => {
      const p = path.getPointAtLength(total * t);
      dot.setAttribute("transform", `translate(${p.x} ${p.y})`);
    };
    if (step >= 1 || reduced) {
      place(1);
      return;
    }
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SAFETY_STEPS[0]);
      place(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, playing, reduced, runKey]);

  useEffect(() => setSent(false), [runKey]);

  function sos() {
    setSent(true);
    toast?.show("Your contacts were notified (simulated)");
  }

  const phase = step === 0 ? "walking" : step === 1 ? "counting" : "escalated";

  return (
    <div className="live-panel" data-final={done}>
      <p className="visually-hidden">
        Simulated preview of the safety tools: your live location is shared with chosen contacts
        while you walk; a check-in timer runs out and escalates to your emergency contacts; and an
        SOS button alerts them with your location.
      </p>
      <div className="safety" data-phase={phase} aria-hidden="true">
        <svg className="safety__map" viewBox="0 0 330 230" role="presentation">
          <g className="safety__streets">
            <path d="M0 60 H330 M0 120 H330 M0 175 H330 M60 0 V230 M150 0 V230 M245 0 V230" />
            <path d="M0 20 L330 210 M40 230 L300 0" />
          </g>
          <path ref={routeRef} d={ROUTE} className="safety__route" />
          <circle cx="300" cy="40" r="7" className="safety__dest" />
          <g ref={dotRef} className="safety__dot" transform="translate(30 190)">
            <circle r="14" className="safety__pulse" />
            <circle r="6" />
          </g>
        </svg>
        <div className="safety__side">
          <div className="checkin" data-state={phase}>
            <div className="checkin__ring">
              {Array.from({ length: TICKS }, (_, i) => (
                <span
                  key={i}
                  style={{ "--t": i, transform: `rotate(${(360 / TICKS) * i}deg) translateY(-34px)` } as CSSProperties}
                />
              ))}
              <span className="checkin__label">
                {phase === "walking" ? "On route" : phase === "counting" ? "Check in?" : "Missed"}
              </span>
            </div>
            <p className="checkin__text">
              {phase === "walking" && "Sharing live location with 2 contacts"}
              {phase === "counting" && "Check-in timer running"}
              {phase === "escalated" && "No check-in: alerting your contacts"}
            </p>
          </div>
        </div>
      </div>
      <div className="safety__sos">
        <button type="button" className="sos-btn" onClick={sos}>
          <PinIcon size={18} strokeWidth={2} /> SOS
        </button>
        <p className="small" aria-live="polite">
          {sent ? "Your contacts were notified (simulated)." : "Press to try it. Nothing is sent."}
        </p>
      </div>
    </div>
  );
}
