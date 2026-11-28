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

## [ADR 0008: Guide applications, the guide role change and bulk decisions](../adr/0008-guide-applications.md)

- **Chose:** only a verified traveller may apply; one open application per
  real user (a partial unique index); approving a **real** application makes
  the user a guide in the same transaction and writes a second audit row.
  Bulk decisions take 1 to 25 ids, and each row is decided in its own
  transaction with its own audit row. There is no bulk delete.
- **Rejected:** letting anyone pick "guide" at signup without review, and one
  transaction for a whole bulk decision (one bad row would undo the rest).
- **Why:** becoming a guide needs a reviewed path, and the shared demo users
  must never change for everyone: the role update is
  `WHERE NOT is_demo AND role = 'traveller'`, so a demo or sample user's role
  can never change.
- **Also:** shared demo users are capped, not blocked (newest 20 rows, gone
  after 24 h); the demo traveller is a simulated verified traveller so the
  demo can show the flow. Added to this page in M4c (it was missing).

## [ADR 0009: One CSS tokens file, enforced by checks](../adr/0009-one-tokens-file.md)

- **Chose:** `apps/web/src/styles/tokens.css` is the only place raw colours
  and sizes live. Three CI checks enforce it: a static lint of the admin CSS,
  a contrast check of every token pair in both themes, and a rendered check of
  every admin screen at three widths.
- **Rejected:** generating the CSS from the TypeScript tokens at build time,
  and adopting a CSS framework.
- **Why:** the console's spacing and colours had drifted value by value; a
  check that names the file and line stops that, without a new dependency or
  build step.
- **Also:** the marketing pages are ratcheted: their raw values can only go
  down.
