# ADR 0004: Auth and sessions for M2a (demo login)

Status: accepted (M2a). Real passkey sign-up is M2b and gets its own ADR.

## Context
M2a puts a database behind the Java core and makes **demo login** the front
door: one click, no sign-up, three sandbox roles (traveller, guide, admin).
The web app is `https://roaamm.plinthwell.com`; the API is
`https://roaamm-api.plinthwell.com` (Worker proxy → Cloud Run core, ADR 0003).
Both are on the same site (`plinthwell.com`), so a `SameSite=Lax` cookie on
the API host is sent with credentialed `fetch` calls from the web app.

`docs/system-design.md` §5 and `docs/security.md` describe the long-term plan
(Ed25519 JWT access tokens checked at the edge, rotating refresh cookie with
`SameSite=Strict`). **For M2a this ADR takes precedence**: there is no JWT yet.
How the two plans join is decided with passkeys in M2b.

## Decision

### Sessions
- A session token is **32 random bytes** from `SecureRandom`, encoded
  **base64url** (43 characters). It exists only in the browser cookie.
- Postgres stores the **SHA-256 of the token** (`sessions.token_hash`, 32
  bytes, unique), with `created_at`, `expires_at` and `last_seen_at`. A
  database leak does not reveal usable tokens.
- **No JWT.** Every authenticated request looks the hash up in Postgres. At
  demo traffic that is one indexed query.
- Lifetime: **8 hours**, fixed (no sliding renewal).
- Expired sessions are deleted whenever a demo session is created and every
  15 minutes while an instance is running (Cloud Run scales to zero, so the
  first path is the one that always runs).

### Cookie
`__Host-roaamm_session=<token>; Path=/; Max-Age=28800; Secure; HttpOnly; SameSite=Lax`

- `__Host-` prefix: the browser enforces Secure, `Path=/` and **no Domain**,
  so the cookie is host-only on `roaamm-api.plinthwell.com` and never reaches
  the web host or other subdomains.
- `HttpOnly`: page scripts cannot read it.
- `SameSite=Lax`: sent from the web app (same site), not on cross-site
  subrequests.
- Logout deletes the row and sends the same cookie with `Max-Age=0`.

### CSRF
State-changing `/v1` requests (anything but GET, HEAD, OPTIONS) must carry
**both** an exact `Origin: https://roaamm.plinthwell.com` and the custom
header `X-Roaamm-Csrf: 1`, or they get `403 {"error":"csrf_rejected"}`. A
cross-site form cannot set a custom header, and a cross-origin script cannot
send one without passing the proxy's CORS preflight, which only allows the web
origin. The proxy answers with `Access-Control-Allow-Credentials: true` for
that origin only.

### Demo accounts
- Three fixed users, one per role, seeded by migration `V2__demo_users.sql`
  (`is_demo = true`). Every visitor of a role shares that user: it is a
  **shared sandbox**.
- **No real data, ever.** Everything a demo user sees is simulated.
- The sandbox is **reset on a schedule**. In M2a there is no demo data to reset
  beyond sessions; the reset job arrives with the first data a demo user can
  change.
- The **admin demo is read-only**: an interceptor rejects every write under
  `/v1` for it (`403 {"error":"read_only_demo"}`), except signing in and out.
  New write endpoints are covered without extra code.

### Abuse limits
- Demo session creation: **10 per client IP per 10 minutes**, fixed window,
  **in memory per instance**. It resets on restart or scale-to-zero, and two
  instances count separately. Good enough for a demo, not a real defence.
- The client IP comes from `X-Roaamm-Client-Ip`, which the proxy Worker sets
  from Cloudflare's `cf-connecting-ip` and never accepts from a client.
  Requests sent straight to the `run.app` URL can still set it themselves;
  closing that (shared header between Worker and core, or ingress limits) is
  future work.
- At most **500 live sessions per demo user**; creating one more drops the
  oldest.

### Errors and logs
Errors are small JSON (`{"error":"<code>"}`), never stack traces or exception
messages. Tokens, cookies and the database URL are never logged. Flyway's INFO
logging (which prints the JDBC URL with the host) is turned off. Database
errors are logged by exception class only.

### Database connection
`DATABASE_URL` (Secret Manager `neon-database-url`, mounted by
`gcloud run deploy --set-secrets`) is a libpq URI. A small, tested parser turns
it into a JDBC URL plus user and password at startup (runtime, not AOT, so it
works in the native image). HikariCP: at most **3** connections per instance,
0 idle, 5 s connection timeout (Cloud Run max 2 instances, Neon free tier).
Flyway uses a transaction-scoped advisory lock, which is safe through Neon's
pooled (PgBouncer) endpoint. Migrations run at startup, so a revision that
cannot reach the database fails to start and Cloud Run keeps the previous one.

### Native image
The core stays a GraalVM native image (no JRE fallback needed). Flyway, the
Postgres driver, HikariCP and `JdbcClient` work in it, proven in CI by
`scripts/ci/core-native-smoke.sh` (native binary + throwaway Postgres). Two
native-only fixes were needed:
- Flyway cannot scan classpath resources in a native image ("unsupported
  protocol: resource"). The image ships the SQL files at `/app/db/migration`
  and sets `SPRING_FLYWAY_LOCATIONS=filesystem:/app/db/migration`; JVM tests
  still read them from the classpath.
- Controllers returning `ResponseEntity<?>` hide their body types from Spring
  AOT, so the DTO records are registered with `@RegisterReflectionForBinding`.

Measured in that CI-style smoke (local Postgres, no network): process start to
first `/health`, migrations included, about 0.7 s. This is **not** the Cloud
Run + Neon cold start below.

`GET /health` never touches the database. `GET /ready` runs `SELECT 1` and
returns `{"status":"ok"}` or `503`.

## Later decisions (not made here)
- **Moving sessions to the Rust edge (Session DO)** so the edge can check them
  without a round trip to the core. That is a later decision with its own ADR.
- Passkeys, real accounts, and the JWT/refresh-token design: M2b.

## Not measured yet
- **Neon wake-up time** after its idle suspend: **UNMEASURED.**
- **Time to first byte on a cold Cloud Run start with the database**
  (instance start + Flyway + Neon wake, through the proxy): **UNMEASURED.**

Neither can be measured from CI without the Neon secret, which CI must not
have. Measure both from a workstation after deploy (first request after at
least 10 minutes idle, at least 20 samples, p50 and p95) and record them here.
