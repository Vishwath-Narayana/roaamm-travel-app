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
  markSignedIn(me);
  return me;
}

/** Remember a fresh sign-in: the role hint for later visits, and the header's session. */
export function markSignedIn(me: Me): void {
  lastRole.set(me.role);
  sessionStore.set({
    kind: "signed-in",
    me: {
      role: me.role,
      displayName: me.displayName,
      isDemo: me.isDemo,
      needsNewPasskey: me.needsNewPasskey,
    },
  });
}

export async function getMe(): Promise<Me> {
  try {
    const res = await call("/v1/me");
    const me = (await res.json()) as Me;
    sessionStore.set({ kind: "signed-in", me });
    return me;
  } catch (e) {
    if (e instanceof ApiFailure && e.error.kind === "unauthenticated")
      sessionStore.set({ kind: "none" });
    throw e;
  }
}

// ---- who is signed in, for the header

export type SessionState = { kind: "unknown" } | { kind: "none" } | { kind: "signed-in"; me: Me };

let session: SessionState = { kind: "unknown" };
const listeners = new Set<() => void>();

export const sessionStore = {
  get: (): SessionState => session,
  set(next: SessionState) {
    session = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * Asks the API who is signed in, but only when this browser has signed in
 * before. A first visit never calls the API, so it never sees a 401.
 */
export async function refreshSession(): Promise<void> {
  if (session.kind !== "unknown") return;
  if (lastRole.get() === null) {
    sessionStore.set({ kind: "none" });
    return;
  }
  try {
    await getMe();
  } catch {
    // Expired or API down: the header just shows "Try demo".
    if (sessionStore.get().kind === "unknown") sessionStore.set({ kind: "none" });
  }
}

export async function signOut(): Promise<void> {
  try {
    await write("/v1/logout");
  } finally {
    lastRole.set(null);
    sessionStore.set({ kind: "none" });
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
  forbidden: "You don't have access to that.",
  read_only_demo: "The demo admin is read-only: decisions are disabled.",
  already_pending: "You already have a verification request waiting for review.",
  already_verified: "You're already verified.",
  already_decided: "Someone already decided this request. Reload to see the result.",
  reason_required: "Give a reason (up to 200 characters) when rejecting.",
  invalid_doc_type: "Choose a document type.",
  invalid_status: "That filter isn't available.",
  not_found: "That passkey no longer exists.",
};

/** Dashboard route for a role. */
export const dashboardPath = (role: Role) => `/app/${role}`;
