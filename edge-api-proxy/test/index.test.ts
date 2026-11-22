import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { corsAllowOrigin, WEB_ORIGIN, type Env } from "../src/index";

const ORIGIN = "https://roaamm-core-563817708822.us-central1.run.app";
const env: Env = { ORIGIN, ORIGIN_TIMEOUT_MS: "50" };
const PUBLIC = "https://roaamm-api.plinthwell.com";

/** Stubs global fetch; returns the list of requests the Worker sent upstream. */
function stubOrigin(respond: (req: Request) => Response | Promise<Response>): Request[] {
  const seen: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      seen.push(input);
      return respond(input);
    }),
  );
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forwarding", () => {
  it("forwards method, path, query and body to ORIGIN", async () => {
    const seen = stubOrigin(async (req) =>
      Response.json({ echoed: await req.text() }, { status: 201 }),
    );
    const res = await worker.fetch(
      new Request(`${PUBLIC}/v1/trips?limit=5&sort=asc`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer t" },
        body: JSON.stringify({ name: "Goa" }),
      }),
      env,
    );

    expect(seen).toHaveLength(1);
    const sent = seen[0]!;
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe(`${ORIGIN}/v1/trips?limit=5&sort=asc`);
    expect(sent.headers.get("content-type")).toBe("application/json");
    expect(sent.headers.get("authorization")).toBe("Bearer t");
    expect(sent.redirect).toBe("manual");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ echoed: '{"name":"Goa"}' });
  });

  it("rewrites Host to the origin host and adds X-Forwarded-*", async () => {
    const seen = stubOrigin(() => new Response("ok"));
    await worker.fetch(
      new Request(`${PUBLIC}/health`, { headers: { host: "roaamm-api.plinthwell.com" } }),
      env,
    );
    const sent = seen[0]!;
    expect(new URL(sent.url).host).toBe(new URL(ORIGIN).host);
    // Host is derived from the URL; the public name must not leak through.
    expect(sent.headers.get("host")).toBeNull();
    expect(sent.headers.get("x-forwarded-host")).toBe("roaamm-api.plinthwell.com");
    expect(sent.headers.get("x-forwarded-proto")).toBe("https");
  });

  it("strips Cloudflare-internal request headers", async () => {
    const seen = stubOrigin(() => new Response("ok"));
    await worker.fetch(
      new Request(`${PUBLIC}/health`, {
        headers: {
          "cf-connecting-ip": "203.0.113.9",
          "cf-ray": "abc",
          "cf-ipcountry": "IN",
          "cdn-loop": "cloudflare",
          "x-forwarded-host": "spoofed.example",
          accept: "application/json",
        },
      }),
      env,
    );
    const sent = seen[0]!;
    for (const h of ["cf-connecting-ip", "cf-ray", "cf-ipcountry", "cdn-loop"]) {
      expect(sent.headers.get(h), h).toBeNull();
    }
    expect(sent.headers.get("x-forwarded-host")).toBe("roaamm-api.plinthwell.com");
    expect(sent.headers.get("accept")).toBe("application/json");
    // Cloudflare's client IP is passed on under our own header name.
    expect(sent.headers.get("x-roaamm-client-ip")).toBe("203.0.113.9");
  });

  it("never lets a client choose its own client-IP header", async () => {
    const seen = stubOrigin(() => new Response("ok"));
    await worker.fetch(
      new Request(`${PUBLIC}/health`, { headers: { "x-roaamm-client-ip": "1.2.3.4" } }),
      env,
    );
    expect(seen[0]!.headers.get("x-roaamm-client-ip")).toBeNull();
    await worker.fetch(
      new Request(`${PUBLIC}/health`, {
        headers: { "x-roaamm-client-ip": "1.2.3.4", "cf-connecting-ip": "198.51.100.2" },
      }),
      env,
    );
    expect(seen[1]!.headers.get("x-roaamm-client-ip")).toBe("198.51.100.2");
  });

  it("passes Set-Cookie through and never lets it be cached", async () => {
    const cookie =
      "__Host-roaamm_session=abc; Path=/; Max-Age=28800; Secure; HttpOnly; SameSite=Lax";
    stubOrigin(
      () =>
        new Response('{"role":"traveller"}', {
          headers: { "set-cookie": cookie, "cache-control": "public, max-age=600" },
        }),
    );
    const res = await worker.fetch(
      new Request(`${PUBLIC}/v1/demo/session`, { method: "POST", headers: { origin: WEB_ORIGIN } }),
      env,
    );
    expect(res.headers.get("set-cookie")).toBe(cookie);
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });

  it("passes the response through and adds Cache-Control: no-store when absent", async () => {
    stubOrigin(
      () =>
        new Response('{"status":"ok"}', {
          status: 200,
          headers: { "content-type": "application/json", "x-request-id": "r1" },
        }),
    );
    const res = await worker.fetch(new Request(`${PUBLIC}/health`), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"status":"ok"}');
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-request-id")).toBe("r1");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps the origin's own Cache-Control and error statuses", async () => {
    stubOrigin(
      () => new Response("nope", { status: 503, headers: { "cache-control": "max-age=60" } }),
    );
    const res = await worker.fetch(new Request(`${PUBLIC}/v1/x`), env);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("max-age=60");
  });
});

describe("CORS", () => {
  it("cors_allows_only_the_web_origin", () => {
    expect(corsAllowOrigin("https://roaamm.plinthwell.com")).toBe(WEB_ORIGIN);
    for (const other of [
      "http://roaamm.plinthwell.com",
      "https://roaamm.plinthwell.com.evil.example",
      "https://evil.example",
      "https://roaamm-status.plinthwell.com",
      "null",
      "",
    ]) {
      expect(corsAllowOrigin(other), other).toBeNull();
    }
    expect(corsAllowOrigin(null)).toBeNull();
  });

  it("sets Access-Control-Allow-Origin for the web origin only", async () => {
    stubOrigin(
      () =>
        new Response("ok", {
          // An origin-set wildcard must not survive the proxy.
          headers: { "access-control-allow-origin": "*", vary: "Accept-Encoding" },
        }),
    );
    const allowed = await worker.fetch(
      new Request(`${PUBLIC}/health`, { headers: { origin: WEB_ORIGIN } }),
      env,
    );
    expect(allowed.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("vary")).toBe("Accept-Encoding, Origin");

    const denied = await worker.fetch(
      new Request(`${PUBLIC}/health`, { headers: { origin: "https://evil.example" } }),
      env,
    );
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(denied.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("answers an allowed preflight without calling the origin", async () => {
    const seen = stubOrigin(() => new Response("should not be called"));
    const res = await worker.fetch(
      new Request(`${PUBLIC}/v1/trips`, {
        method: "OPTIONS",
        headers: {
          origin: WEB_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
      env,
    );
    expect(seen).toHaveLength(0);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toContain("Content-Type");
    expect(res.headers.get("access-control-allow-headers")).toContain("X-Roaamm-Csrf");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("refuses a preflight from any other origin", async () => {
    const seen = stubOrigin(() => new Response("should not be called"));
    const res = await worker.fetch(
      new Request(`${PUBLIC}/v1/trips`, {
        method: "OPTIONS",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      }),
      env,
    );
    expect(seen).toHaveLength(0);
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("origin failure", () => {
  it("returns 502 JSON when the origin cannot be reached", async () => {
    stubOrigin(() => {
      throw new TypeError("fetch failed: getaddrinfo ENOTFOUND secret-internal-detail");
    });
    const res = await worker.fetch(
      new Request(`${PUBLIC}/health`, { headers: { origin: WEB_ORIGIN } }),
      env,
    );
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    // The web app can still read the error.
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "bad_gateway", message: "The API is unavailable." });
    expect(text).not.toContain("ENOTFOUND");
  });

  it("returns 502 when the origin times out", async () => {
    stubOrigin(
      (req) =>
        new Promise<Response>((_, reject) => {
          req.signal.addEventListener("abort", () => reject(req.signal.reason));
        }),
    );
    const res = await worker.fetch(new Request(`${PUBLIC}/health`), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "bad_gateway" });
  });
});
