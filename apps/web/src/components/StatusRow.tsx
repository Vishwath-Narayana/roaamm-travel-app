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
  | { kind: "down" }
  | { kind: "not-deployed" };

const url = (name: string) => SERVICES.find((s) => s.name === name)!.url;

const CHECKS = [
  // The edge sends CORS for the web origin, so its JSON can be read and verified.
  { name: "edge", label: "Real-time edge", url: url("edge"), cors: true },
  // The status page is another origin without CORS: an opaque "no-cors" request
  // still proves it answered, without a console error.
  { name: "status", label: "System page", url: url("status"), cors: false },
] as const;

/**
 * Times one request in the browser. Never throws: any failure, timeout or
 * unexpected body counts as unreachable.
 */
export async function checkService(target: string, cors: boolean): Promise<State> {
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
    const ms = Math.round(performance.now() - start);
    if (cors) {
      if (!res.ok) return { kind: "down" };
      const body = (await res.json()) as { status?: string };
      if (body.status !== "ok") return { kind: "down" };
    }
    return { kind: "up", ms };
  } catch {
    return { kind: "down" };
  } finally {
    clearTimeout(timer);
  }
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
    case "not-deployed":
      return "Not deployed yet";
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

  const rows: { name: string; label: string; host: string; state: State }[] = [
    ...CHECKS.map((c) => ({ name: c.name, label: c.label, host: new URL(c.url).host, state: states[c.name] })),
    {
      name: "api",
      label: "Core API",
      host: new URL(url("api")).host,
      state: { kind: "not-deployed" },
    },
  ];

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
      {!live && (
        <p className="status-row__note small">
          Response times are measured from your browser on {LIVE_HOST}.
        </p>
      )}
    </div>
  );
}
