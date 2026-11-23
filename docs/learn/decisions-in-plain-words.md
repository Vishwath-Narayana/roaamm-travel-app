# Decisions in plain words

An **ADR** (Architecture Decision Record) is a short file that records one
important choice: what we picked, what we turned down and why. The real ADRs
are in [docs/adr/](../adr). Here is each one in a few plain lines.

## [ADR 0001: Real-time on Cloudflare Workers and Durable Objects](../adr/0001-edge-realtime.md)

- **Chose:** run chat in Rust, compiled to WebAssembly, on Cloudflare
  Workers, with one Durable Object per user and one per chat room.
- **Why:** a Durable Object runs one thing at a time, so messages in a room
  stay in order without a separate message broker. Sleeping sockets cost
  nothing.
- **Risk noted:** the Rust library might lack some Durable Object features;
  the fallback is a thin TypeScript wrapper.
- **State today:** accepted but **not built yet**. Chat is M5.

## [ADR 0002: MLS for group end-to-end encryption](../adr/0002-mls.md)

- **Chose:** the MLS standard (RFC 9420) through the OpenMLS library,
  compiled to WebAssembly and run in the browser.
- **Why:** a reviewed standard that keeps old and future messages safe if a
  key leaks, and scales to big groups.
- **Limit stated:** in a browser the server delivers the JavaScript, so a
  hostile operator could ship bad code. The security doc says so openly.
- **State today:** accepted but **not built yet**. E2EE chat is M6.

## [ADR 0003: Java core on Google Cloud Run](../adr/0003-core-hosting-cloud-run.md)

- **Chose:** run the Java core on Cloud Run, scaling to zero, at most 2
  instances, with a budget alert. Deploy with keyless GitHub-to-Google auth
  (OIDC and Workload Identity Federation). A Cloudflare Worker gives it the
  public name `roaamm-api.plinthwell.com`.
- **Rejected:** a free e2-micro VM behind Cloudflare Tunnel (a server to patch
  and watch), and Oracle Cloud's free tier (unreliable terms and sign-up).
  Cloud Run's own domain mapping was also rejected (still Preview).
- **Why:** no server to look after, zero cost when idle, and no stored cloud
  keys anywhere.
- **Fallback:** the same container can run on the VM if Cloud Run's free
  tier or cold starts are not good enough.

## [ADR 0004: Auth and sessions for M2a (demo login)](../adr/0004-auth-sessions-m2a.md)

- **Chose:** opaque session cookies. The token is 32 random bytes; the
  database keeps only its SHA-256. The cookie is `__Host-`, HttpOnly,
  Secure, SameSite=Lax, 8 hours. CSRF needs an exact `Origin` and a custom
  header.
- **Rejected for now:** JWT access tokens and refresh cookies (later dropped
  for good in ADR 0005).
- **Why:** simple, easy to revoke (delete the row), and a database leak does
  not reveal usable tokens.
- **Also:** three shared demo users, a read-only demo admin, and in-memory
  rate limits that are "good enough for a demo, not a real defence".

## [ADR 0005: Real accounts with passkeys](../adr/0005-passkeys.md)

- **Chose:** passkeys only (no passwords, email or phone), with 8 single-use
  recovery codes, using the `webauthn4j` library. Same cookie sessions as
  ADR 0004.
- **Rejected:** Yubico's library (adds a second JSON library and more) and
  Spring Security's WebAuthn module (all of Spring Security on top of the
  same verifier). The JWT and email-code plan was dropped.
- **Why:** the smallest dependency that works in the native image, and no
  personal data to store.
- **Safety nets:** generic errors (no user enumeration), a 300-account cap,
  a fresh passkey check before risky actions, and database triggers that
  stop demo users from ever holding a passkey.

## [ADR 0006: Simulated ID verification, admin queue and audit log](../adr/0006-simulated-verification.md)

- **Chose:** a verification request stores only a document type and a
  server-made `SAMPLE-` reference. **No real ID is ever collected.** An admin
  approves or rejects; every decision goes in an append-only audit log.
- **Rejected:** the earlier plan to upload a mock ID image, sealed to the
  admins' key and stored in R2.
- **Why:** with no document there is nothing to leak, encrypt or store.
- **Also:** demo and real rows never mix (`is_demo` on every row), the demo
  admin is read-only, and the first real admin is made by one documented
  SQL update ([runbook](../runbooks/first-admin.md)).

## [ADR 0007: Preload the hero image on the landing page only](../adr/0007-landing-only-hero-preload.md)

- **Chose:** a tiny inline script in `index.html` that adds the hero image
  preload only when the path is `/`. Its CSP hash is recorded in the ADR and
  checked by a test.
- **Rejected:** a `Link:` header for `/` from `_headers` (Lighthouse CI and
  local dev do not apply it, and some browsers might download the photo
  twice), and preloading from the app bundle (too late to help).
- **Why:** every other route was logging "preloaded but not used". The fix
  kept Lighthouse at 91 and LCP unchanged.
