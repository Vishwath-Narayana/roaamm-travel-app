// Demo sessions against the core (docs/adr/0004-auth-sessions-m2a.md).
// The session lives in an HttpOnly cookie on roaamm-api.plinthwell.com; this
// code never sees the token. Every call sends credentials, and writes add the
// CSRF header the core requires.

export const API_ORIGIN = "https://roaamm-api.plinthwell.com";

export const ROLES = ["traveller", "guide", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export type Me = { role: Role; displayName: string; isDemo: boolean };

/** Why an API call failed, in terms the UI can explain honestly. */
export type ApiError =
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "unavailable" } // network error, timeout, 502/503 from the proxy or core
  | { kind: "unexpected"; status: number };

export class ApiFailure extends Error {
  constructor(readonly error: ApiError) {
    super(error.kind);
  }
}

/** Cloud Run and Neon may both be waking from idle; give them time. */
export const REQUEST_TIMEOUT_MS = 20_000;

const ROLE_KEY = "roaamm:demo-role";

/** The role last signed in on this browser: tells "expired" apart from "never signed in". */
export const lastRole = {
  get(): Role | null {
    try {
      const v = window.localStorage.getItem(ROLE_KEY);
      return v && isRole(v) ? v : null;
    } catch {
      return null;
    }
  },
  set(role: Role | null) {
    try {
      if (role) window.localStorage.setItem(ROLE_KEY, role);
      else window.localStorage.removeItem(ROLE_KEY);
    } catch {
      // Storage blocked: only the "expired" wording is lost.
    }
  },
};

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_ORIGIN + path, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new ApiFailure({ kind: "unavailable" });
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return res;
  if (res.status === 401) throw new ApiFailure({ kind: "unauthenticated" });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    throw new ApiFailure({
      kind: "rate_limited",
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : null,
    });
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new ApiFailure({ kind: "unavailable" });
  }
  throw new ApiFailure({ kind: "unexpected", status: res.status });
}

function write(path: string, body?: unknown): Promise<Response> {
  return call(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Roaamm-Csrf": "1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function startDemoSession(role: Role): Promise<Me> {
  const res = await write("/v1/demo/session", { role });
  const me = (await res.json()) as Me;
  lastRole.set(me.role);
  return me;
}

export async function getMe(): Promise<Me> {
  const res = await call("/v1/me");
  return (await res.json()) as Me;
}

export async function signOut(): Promise<void> {
  try {
    await write("/v1/logout");
  } finally {
    lastRole.set(null);
  }
}

export function errorMessage(error: ApiError): string {
  switch (error.kind) {
    case "rate_limited": {
      const mins = error.retryAfterSeconds
        ? Math.max(1, Math.ceil(error.retryAfterSeconds / 60))
        : null;
      return mins
        ? `Too many demo sign-ins from your network. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`
        : "Too many demo sign-ins from your network. Try again in a few minutes.";
    }
    case "unavailable":
      return "The API is not answering. It scales to zero when idle and may be waking up, so try again in a few seconds.";
    case "unauthenticated":
      return "You are not signed in.";
    case "unexpected":
      return `Something went wrong on our side (error ${error.status}). Try again, or come back later.`;
  }
}

/** Dashboard route for a role. */
export const dashboardPath = (role: Role) => `/app/${role}`;
