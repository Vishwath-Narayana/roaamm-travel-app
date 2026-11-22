// roaamm-api-proxy: the public face of the Java core.
//
// roaamm-api.plinthwell.com -> this Worker -> ORIGIN (Cloud Run). Cloud Run
// routes on the Host header, so the request is re-addressed to the origin's
// own hostname rather than passed through with the public one.
//
// Nothing here logs: no request bodies, no headers, no auth.

export interface Env {
  /** Cloud Run base URL, e.g. https://roaamm-core-…run.app */
  ORIGIN: string;
  /** Milliseconds to wait for the origin before answering 502. */
  ORIGIN_TIMEOUT_MS?: string;
}

/** The only web origin allowed to read API responses from a browser. */
export const WEB_ORIGIN = "https://roaamm.plinthwell.com";

const DEFAULT_TIMEOUT_MS = 20_000;
const ALLOWED_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, Idempotency-Key";

/**
 * Request headers that describe the hop into Cloudflare, not the client's
 * intent. They are not passed on to the origin.
 */
const STRIPPED_REQUEST_HEADERS = [
  "host",
  "cdn-loop",
  "x-real-ip",
  "x-forwarded-host",
  "x-forwarded-proto",
];

/** `Access-Control-Allow-Origin` value for an `Origin` header, or null. */
export function corsAllowOrigin(origin: string | null): string | null {
  return origin === WEB_ORIGIN ? WEB_ORIGIN : null;
}

function json(status: number, body: unknown, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

/** Adds this proxy's CORS rule; any CORS headers from the origin are dropped. */
function applyCors(headers: Headers, origin: string | null): void {
  for (const name of [...headers.keys()]) {
    if (name.startsWith("access-control-")) headers.delete(name);
  }
  const allowed = corsAllowOrigin(origin);
  if (allowed) headers.set("access-control-allow-origin", allowed);
  // Responses differ by Origin, so caches must key on it.
  const vary = headers.get("vary");
  if (!vary || !/(^|,)\s*origin\s*(,|$)/i.test(vary)) {
    headers.set("vary", vary ? `${vary}, Origin` : "Origin");
  }
}

function preflight(req: Request): Response {
  const origin = req.headers.get("origin");
  const allowed = corsAllowOrigin(origin);
  if (!allowed) {
    return new Response(null, { status: 403, headers: { vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": allowed,
      "access-control-allow-methods": ALLOWED_METHODS,
      "access-control-allow-headers": ALLOWED_HEADERS,
      "access-control-max-age": "600",
      "cache-control": "no-store",
      vary: "Origin",
    },
  });
}

export function buildOriginRequest(req: Request, env: Env, signal?: AbortSignal): Request {
  const incoming = new URL(req.url);
  const target = new URL(incoming.pathname + incoming.search, env.ORIGIN);

  const headers = new Headers();
  for (const [name, value] of req.headers) {
    if (name.startsWith("cf-") || STRIPPED_REQUEST_HEADERS.includes(name)) continue;
    headers.set(name, value);
  }
  // Host comes from `target` (the Cloud Run hostname); the public name goes here.
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(/:$/, ""));

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : null,
    redirect: "manual",
    signal,
    // Required by the fetch spec for streamed bodies.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin");

    if (req.method === "OPTIONS" && req.headers.has("access-control-request-method")) {
      return preflight(req);
    }

    const timeoutMs = Number(env.ORIGIN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    let upstream: Response;
    try {
      upstream = await fetch(buildOriginRequest(req, env, AbortSignal.timeout(timeoutMs)));
    } catch {
      // Network error, DNS failure or timeout. Never expose the cause.
      const res = json(502, { error: "bad_gateway", message: "The API is unavailable." });
      applyCors(res.headers, origin);
      return res;
    }

    const res = new Response(upstream.body, upstream);
    if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store");
    applyCors(res.headers, origin);
    return res;
  },
};
