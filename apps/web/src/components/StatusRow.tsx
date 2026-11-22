import { useEffect, useRef, useState } from "react";
import { useInView } from "../motion";
import { SERVICES } from "../services";
import "./StatusRow.css";

/** Live checks run only on the real site, never on localhost, previews or tests. */
export const LIVE_HOST = "roaamm.plinthwell.com";
export const CHECK_TIMEOUT_MS = 3000;

type State =
  | { kind: "idle" } // not on the live site: nothing is requested
  | { kind: "checking" }
  | { kind: "up"; ms: number }
  | { kind: "down" };

const url = (name: string) => SERVICES.find((s) => s.name === name)!.url;

const CHECKS = [
  // The edge sends CORS for the web origin, so its JSON can be read and verified.
  { name: "edge", label: "Real-time edge", url: url("edge"), cors: true },
  // The status page is another origin without CORS: an opaque "no-cors" request
  // still proves it answered, without a console error.
  { name: "status", label: "System page", url: url("status"), cors: false },
  // The core's Worker proxy sends CORS for the web origin only, so its JSON is verified too.
  { name: "api", label: "Core API", url: url("api"), cors: true },
] as const;

/** Timed requests after the warm-up; the median is shown. */
export const SAMPLES = 3;

export function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * One request with a 3 s timeout. Resolves to the time it took in ms, or null
 * on any failure (network, timeout, bad status or unexpected body). Never throws.
 */
async function probe(target: string, cors: boolean): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = performance.now();
  try {
    const res = await fetch(target, {
      mode: cors ? "cors" : "no-cors",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    const ms = performance.now() - start;
    if (cors) {
      if (!res.ok) return null;
      const body = (await res.json()) as { status?: string };
      if (body.status !== "ok") return null;
    }
    return ms;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Measures a service from the browser. The first request also pays for DNS,
 * TLS and connection setup, so it is a warm-up and is not counted; then
 * SAMPLES requests run one after another and the median is reported.
 */
export async function checkService(target: string, cors: boolean): Promise<State> {
  if ((await probe(target, cors)) === null) return { kind: "down" };
  const times: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const ms = await probe(target, cors);
    if (ms === null) return { kind: "down" };
    times.push(ms);
  }
  return { kind: "up", ms: Math.round(median(times)) };
}

function label(state: State) {
  switch (state.kind) {
    case "idle":
      return "Checked on the live site";
    case "checking":
      return "Checking";
    case "up":
      return `Up · ${state.ms} ms`;
    case "down":
      return "Unreachable";
  }
}

type StatusRowProps = {
  /** For tests; defaults to the real hostname. */
  host?: string;
};

/** Edge, System page and Core API, measured from this browser on the live site. */
export function StatusRow({ host = window.location.hostname }: StatusRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { margin: "200px", once: true });
  const live = host === LIVE_HOST;
  const [states, setStates] = useState<Record<string, State>>(() =>
    Object.fromEntries(CHECKS.map((c) => [c.name, { kind: live ? "checking" : "idle" } as State])),
  );

  useEffect(() => {
    if (!live || !near) return;
    let cancelled = false;
    for (const c of CHECKS) {
      checkService(c.url, c.cors).then((s) => {
        if (!cancelled) setStates((prev) => ({ ...prev, [c.name]: s }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [live, near]);

  const rows = CHECKS.map((c) => ({
    name: c.name,
    label: c.label,
    host: new URL(c.url).host,
    state: states[c.name],
  }));

  return (
    <div ref={ref} className="status-row" role="group" aria-label="Live system status">
      {rows.map((r) => (
        <div key={r.name} className="status-row__item" data-state={r.state.kind}>
          <span className="status-row__dot" aria-hidden="true" />
          <span className="status-row__name">{r.label}</span>
          <code className="status-row__host">{r.host}</code>
          <span className="status-row__value mono" aria-live="polite">
            {label(r.state)}
          </span>
        </div>
      ))}
      <p className="status-row__note small">
        {live
          ? `Median of ${SAMPLES} requests after a warm-up, measured from your browser.`
          : `Response times are measured from your browser on ${LIVE_HOST}.`}
      </p>
    </div>
  );
}
