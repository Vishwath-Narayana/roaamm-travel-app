import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../motion";

/**
 * A tiny scripted state machine: advances `step` from 0 to durations.length,
 * waiting durations[i] ms at step i, only while `playing`. A new `runKey`
 * restarts it. Under reduced motion it jumps straight to the final step.
 */
export function useTimeline(durations: readonly number[], playing: boolean, runKey: number) {
  const reduced = usePrefersReducedMotion();
  const last = durations.length;
  const [step, setStep] = useState(reduced ? last : 0);

  useEffect(() => {
    setStep(reduced ? last : 0);
  }, [runKey, reduced, last]);

  useEffect(() => {
    if (!playing || reduced || step >= last) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), durations[step]);
    return () => window.clearTimeout(t);
  }, [playing, reduced, step, last, durations]);

  return { step, done: step >= last, reduced };
}

/** Types `text` out one character every `speed` ms while `active`. */
export function useTypewriter(text: string, active: boolean, finished: boolean, speed = 40) {
  const [count, setCount] = useState(finished ? text.length : 0);
  useEffect(() => {
    if (finished) {
      setCount(text.length);
      return;
    }
    if (!active) {
      setCount(0);
      return;
    }
    const t = window.setInterval(() => {
      setCount((c) => {
        if (c >= text.length) window.clearInterval(t);
        return Math.min(text.length, c + 1);
      });
    }, speed);
    return () => window.clearInterval(t);
  }, [text, active, finished, speed]);
  return text.slice(0, count);
}

/** Gradient avatar with initials: obviously generated, never a real face. */
export function avatarGradient(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  // Dark enough that white initials pass WCAG AA for every hue.
  return `linear-gradient(135deg, hsl(${h} 65% 30%), hsl(${(h + 50) % 360} 70% 22%))`;
}
