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
                <span className="result__score">
                  <span className="result__match mono">{r.match}%</span>
                  <span className="result__bar">
                    <span style={{ "--m": r.match / 100 } as CSSProperties} />
                  </span>
                </span>
              </div>
            ) : null,
          )}
        </div>
        {step >= 6 && (
          <div className="assistant__chips">
            {["Only women travellers", "Add a guide for Sunday", "Show on a map"].map((c, i) => (
              <span key={c} className="chip" style={{ "--i": i } as CSSProperties}>
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="live-caption small">Simulated answers. The real assistant arrives in a later milestone.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Safety */

const ROUTE = "M30 190 C 70 190, 80 140, 120 140 S 170 90, 210 90 S 260 40, 300 40";

export function SafetyPanel({ playing, runKey, onDone }: PanelProps) {
  const { step, done, reduced } = useTimeline(SAFETY_STEPS, playing, runKey);
  useDone(done, onDone);
  const svgRef = useRef<SVGSVGElement>(null);
  const toast = useOptionalToast();
  const [sent, setSent] = useState(false);
  const [ripples, setRipples] = useState(0);
  const walking = step === 0 && !reduced;

  // The dot follows the route with SVG <animateMotion> (no JavaScript frame
  // loop); it pauses whenever the preview pauses or leaves the screen.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof svg.pauseAnimations !== "function") return;
    if (playing) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [playing, walking]);

  useEffect(() => {
    setSent(false);
    setRipples(0);
  }, [runKey]);

  function sos() {
    setSent(true);
    setRipples((n) => n + 1);
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
        {/* Keyed by run so each replay starts the route from the beginning. */}
        <svg key={runKey} ref={svgRef} className="safety__map" viewBox="0 0 330 230" role="presentation">
          <g className="safety__streets">
            <path d="M0 60 H330 M0 120 H330 M0 175 H330 M60 0 V230 M150 0 V230 M245 0 V230" />
            <path d="M0 20 L330 210 M40 230 L300 0" />
          </g>
          <path d={ROUTE} className="safety__route" />
          <circle cx="300" cy="40" r="7" className="safety__dest" />
          {walking ? (
            <g className="safety__dot">
              <circle r="14" className="safety__pulse" />
              <circle r="6" />
              <animateMotion dur={`${SAFETY_STEPS[0]}ms`} path={ROUTE} fill="freeze" calcMode="spline" keySplines="0.4 0 0.6 1" keyTimes="0;1" keyPoints="0;1" />
            </g>
          ) : (
            <g className="safety__dot" transform="translate(300 40)">
              <circle r="14" className="safety__pulse" />
              <circle r="6" />
            </g>
          )}
        </svg>
        <div className="safety__side">
          <div className="checkin" data-state={phase}>
            <div className="checkin__ring">
              {/* Fills with stroke-dashoffset, then flips to the alert colour. */}
              <svg viewBox="0 0 84 84" className="checkin__svg" role="presentation">
                <circle cx="42" cy="42" r="34" className="checkin__track" />
                <circle
                  cx="42"
                  cy="42"
                  r="34"
                  pathLength={100}
                  className="checkin__fill"
                  style={{ animationDuration: `${SAFETY_STEPS[1]}ms` } as CSSProperties}
                />
              </svg>
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
          {ripples > 0 && <span key={ripples} className="sos-btn__ripple" aria-hidden="true" />}
          <PinIcon size={18} strokeWidth={2} /> SOS
        </button>
        <p className="small" aria-live="polite">
          {sent ? "Your contacts were notified (simulated)." : "Press to try it. Nothing is sent."}
        </p>
      </div>
    </div>
  );
}
