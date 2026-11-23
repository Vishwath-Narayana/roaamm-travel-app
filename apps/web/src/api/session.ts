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

export type Me = {
  role: Role;
  displayName: string;
  isDemo: boolean;
  /** Real users only: signed in with a recovery code and must add a passkey. */
  needsNewPasskey?: boolean;
};

/** Why an API call failed, in terms the UI can explain honestly. */
export type ApiError =
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "unavailable" } // network error, timeout, 502/503 from the proxy or core
  | { kind: "signups_paused" }
  | { kind: "rejected"; code: string } // a 4xx with a known error code from the core
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

export async function call(path: string, init: RequestInit = {}): Promise<Response> {
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
  const code = await errorCode(res);
  if (res.status === 401 && (code === null || code === "unauthenticated")) {
    throw new ApiFailure({ kind: "unauthenticated" });
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    throw new ApiFailure({
      kind: "rate_limited",
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : null,
    });
  }
  if (res.status === 503 && code === "signups_paused")
    throw new ApiFailure({ kind: "signups_paused" });
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new ApiFailure({ kind: "unavailable" });
  }
  if (res.status >= 400 && res.status < 500 && code)
    throw new ApiFailure({ kind: "rejected", code });
  throw new ApiFailure({ kind: "unexpected", status: res.status });
}

/** The core's `{"error":"<code>"}`, or null. Only snake_case codes are trusted. */
async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" && /^[a-z_]{1,40}$/.test(body.error) ? body.error : null;
  } catch {
    return null;
  }
}

/** A state-changing call: the core needs the CSRF header on every one. */
export function write(path: string, body?: unknown, method = "POST"): Promise<Response> {
  return call(path, {
    method,
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
    case "signups_paused":
      return "Signups are paused for now. Try the demo instead.";
    case "rejected":
      return REJECTED[error.code] ?? `That didn't work (${error.code}). Try again.`;
    case "unexpected":
      return `Something went wrong on our side (error ${error.status}). Try again, or come back later.`;
  }
}

/** Plain words for the core's error codes. Generic on purpose: no account details leak. */
const REJECTED: Record<string, string> = {
  passkey_not_accepted:
    "That passkey wasn't accepted. If you created your account on another device, sign in there or use a recovery code.",
  challenge_expired: "That took too long and the request expired. Please try again.",
  recovery_code_not_accepted:
    "That recovery code didn't work. Each code works once; check for typos.",
  invalid_display_name: 'Use 1 to 40 characters, without < > & " or `.',
  invalid_role: "Choose Traveller or Guide.",
  invalid_label: 'Use 1 to 40 characters, without < > & " or `.',
  reauth_required: "Confirm it's you with your passkey first.",
  last_passkey:
    "You can't remove your only passkey without recovery codes. Add another passkey or regenerate codes first.",
  not_for_demo: "Demo accounts don't have passkeys. Create an account to use this.",
  no_passkey: "Add a passkey first.",
  not_found: "That passkey no longer exists.",
};

/** Dashboard route for a role. */
export const dashboardPath = (role: Role) => `/app/${role}`;
