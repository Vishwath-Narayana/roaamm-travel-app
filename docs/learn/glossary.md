# Glossary

Every technical term used in this project so far, in one or two lines.
Grouped by area, then alphabetical. "Planned" means the project will use it
later but does not yet.

## Web and browser

- **a11y (accessibility):** making the site usable by everyone, including
  people who use screen readers or only a keyboard.
- **AA contrast:** the WCAG level for text contrast. Normal text needs a
  contrast ratio of at least 4.5 to 1 against its background.
- **`aria-disabled`:** marks a control as unavailable but keeps it
  focusable, so it can still explain itself in a tooltip. Plain `disabled`
  takes it out of the keyboard order.
- **AVIF / WebP:** modern image formats that are much smaller than JPEG at
  the same quality.
- **Bottom sheet:** a panel that slides up from the bottom of a phone
  screen, with a drag handle. The admin drawer becomes one below 768 px.
- **Bundle / chunk:** the JavaScript files the build produces. A **lazy
  chunk** is downloaded only when a page needs it.
- **CDP (Chrome DevTools Protocol):** the remote-control interface for
  Chrome. Puppeteer and Lighthouse use it.
- **CLS (Cumulative Layout Shift):** a score for how much visible content
  jumps while a page loads. ROAAMM keeps it at or below 0.01.
- **Console warning / error:** a message the browser writes to the
  developer console. CI fails if any appear.
- **CORS (Cross-Origin Resource Sharing):** browser rules for when a page
  on one host may call another host. The server answers with
  `Access-Control-Allow-*` headers.
- **CORS preflight:** an automatic `OPTIONS` request the browser sends
  before a "non-simple" cross-origin request, to ask if it is allowed.
- **CSP (Content Security Policy):** a response header that tells the
  browser which scripts, hosts and connections a page may use.
- **CSP hash:** a SHA-256 of an inline script's exact text, listed in the
  CSP so that only that script may run.
- **CSRF (Cross-Site Request Forgery):** another site tricking your
  browser into sending a request with your cookies. ROAAMM blocks it with
  an exact `Origin` check plus a custom header.
- **Column template (`table-layout: fixed`, `<colgroup>`):** a table whose
  column widths come from a fixed list (one `<col>` per column), not from the
  text in its cells. Changing the rows can then never move a column.
- **Cookie:** a small value the browser stores and sends back to a host.
  - **HttpOnly:** page scripts cannot read it.
  - **Secure:** only sent over HTTPS.
  - **SameSite=Lax:** not sent on most cross-site sub-requests.
  - **`__Host-` prefix:** the browser forces Secure, `Path=/` and no
    Domain, so the cookie stays on one exact host.
- **Design tokens:** named values (colours, spacing, font sizes, motion
  timings) that all components share, defined once.
- **Discoverable credential:** a passkey that the device can find by
  itself, so sign-in needs no username.
- **Edge fade (`mask-image`):** a gradient mask that fades the edge of a row
  that scrolls sideways, as a hint that there is more. The admin shows it
  only on the side that has more.
- **ESLint:** a tool that checks JavaScript and TypeScript for mistakes and
  style problems.
- **History API:** browser functions (`pushState`, `popstate`) that change
  the URL without loading a new page.
- **Ratchet (lint):** a check that tolerates existing problems but fails if
  their count grows, so the number can only go down.
- **SPA (single-page app):** one HTML page; JavaScript draws
  each "page" by reading the URL. ROAAMM is an SPA with no server rendering.
- **Metric-matched fallback font (`size-adjust`):** a local font (here
  Arial) scaled to the web font's widths, so text shown before the web font
  loads takes the same space, and the swap does not shift the page.
- **LCP (Largest Contentful Paint):** the time until the biggest thing on
  screen (here, the hero photo) is drawn. A key speed measure.
- **Lighthouse:** Google's tool that scores a page for performance,
  accessibility, best practices and SEO. CI requires performance 0.9 or more.
- **`localStorage`:** a small key-value store in the browser, kept between
  visits.
- **Passkey:** a login key pair stored on your device or synced by your
  password manager. The site keeps only the public key. No password exists.
- **Preload (`<link rel="preload">`):** a hint telling the browser to fetch
  a file early because the page will need it soon.
- **Puppeteer:** a Node library that drives Chrome from a script.
- **React:** the UI library used for the web app. Components are functions
  that return what to show.
- **Reduced motion (`prefers-reduced-motion`):** an operating system setting
  asking sites to avoid animation. ROAAMM also has its own switch.
- **Router:** code that decides which page to show for a URL. ROAAMM's is a
  small custom one in `apps/web/src/router.tsx`.
- **"Simulated data" badge:** a label on every screen that shows
  made-up data, so no one mistakes it for real.
- **Spring animation / `linear()`:** motion that eases like a physical
  spring. `linear()` is a CSS timing function that can draw that curve.
- **Tabular numbers:** digits that all have the same width (`font-variant-
  numeric: tabular-nums`), so numbers in a column line up.
- **Tap target:** the area a finger can hit to use a control: at least 44 x
  44 px on phones. A smaller icon gets an invisible larger hit area.
- **Token scale:** the short list of allowed values for one kind of design
  token, for example spacing 4, 8, 12, 16, 20, 24, 32, 40, 48 and 64 px.
  Anything else fails CI.
- **Translucent tint:** a colour at low opacity (14% here), so it takes on
  the surface beneath it instead of covering it.
- **Trusted Types:** a browser feature that blocks unsafe ways of turning
  strings into HTML or script. Planned with the strict CSP in M12.
- **TypeScript:** JavaScript with types, checked before the code runs.
- **View Transitions:** a browser API that cross-fades between two states of
  a page.
- **Vite:** the build tool and dev server for the web app.
- **Vitest:** the test runner for the web app and the proxy.
- **Visually hidden:** content kept for screen readers but not drawn
  (a 1 px clipped box, not `display: none`, which would hide it from screen
  readers too). The admin's page lead below 640 px is one.
- **WAI-ARIA:** attributes like `role` and `aria-selected` that describe
  widgets to assistive technology.
- **WebAuthn:** the browser and server standard behind passkeys.
- **WebSocket:** a long-lived two-way connection between browser and
  server. Planned for chat (M5).

## Cloudflare

- **Cloudflare edge:** Cloudflare's global network of data centres. Code and
  files run close to the user.
- **Custom domain (Worker):** a Worker attached directly to a hostname;
  Cloudflare creates the DNS record and TLS certificate.
- **Durable Object (DO):** a Cloudflare object with its own storage that
  runs in one place at a time, so its work happens in strict order. Planned
  for chat rooms and user sessions (M5). Not used yet.
- **Hibernation API:** lets a Durable Object keep WebSockets open while it
  sleeps, so idle connections cost nothing. Planned.
- **`_headers` file:** a file in the web app's `public/` folder that sets
  response headers per path for static assets.
- **R2:** Cloudflare's file storage. Planned for attachments.
- **Worker:** a small program that runs on Cloudflare's edge for each
  request. ROAAMM has three today: web assets, the API proxy and the Rust
  health Worker.
- **Worker static assets:** a Worker that serves built files; with
  `single-page-application` it returns `index.html` for unknown paths.
- **wrangler:** Cloudflare's command-line tool to build and deploy Workers.
- **`workers-rs` / `worker-build`:** the Rust library and build tool for
  writing Workers in Rust.

## Rust and WebAssembly

- **Cargo:** Rust's build tool and package manager.
- **cargo-deny:** checks Rust dependencies for bad licences and known
  security advisories.
- **Clippy / rustfmt:** Rust's linter and code formatter.
- **Crate:** a Rust library or program. ROAAMM has `roaamm-crypto` and
  `roaamm-protocol`.
- **Rust:** a fast, memory-safe systems language.
- **WebAssembly (WASM):** a compact binary format that browsers and
  Cloudflare Workers can run. Rust compiles to it
  (`wasm32-unknown-unknown`).

## Java core

- **AOT (ahead-of-time) processing:** Spring Boot's build step that works out
  the app's wiring before it runs, which a native image needs.
- **Distroless image:** a container image with only the program and the
  bare minimum to run it; no shell or package manager.
- **DTO (data transfer object):** a small class (here, Java `record`) that
  describes JSON going in or out.
- **Flyway:** runs numbered SQL files (`V1__...sql`, `V2__...sql`) against
  the database in order, once each, and records which ran.
- **GraalVM native image:** compiles a Java app ahead of time into one
  machine-code binary. It starts in well under a second and uses less
  memory, but reflection and resources need extra setup.
- **Gradle / Gradle wrapper:** the Java build tool. The wrapper (`gradlew`)
  downloads the right Gradle version for you.
- **HikariCP:** the database connection pool. ROAAMM allows at most 3
  connections per instance.
- **Interceptor / filter:** code that runs before a controller. ROAAMM uses
  them for CSRF and the read-only demo admin.
- **Jackson:** the JSON library Spring uses.
- **JdbcClient:** Spring's small API for running SQL.
- **MockMvc:** a Spring test tool that calls controllers without a real
  network.
- **Reflection hints / `RuntimeHints`:** a list telling the native image
  which classes to keep for reflection.
- **Spring Boot:** a Java framework that wires up a web server, JSON and
  database access with little setup.
- **Testcontainers:** starts a real Postgres in Docker for tests.
- **Virtual threads:** lightweight Java threads; turned on in
  `application.yml`.
- **webauthn4j:** the Java library that checks passkey responses.

## Database

- **Advisory lock:** a named lock in Postgres. Flyway takes one so two
  instances do not migrate at once.
- **Append-only table:** a table where rows can be added but never changed
  or deleted. ROAAMM enforces it with database triggers.
- **Migration:** a versioned SQL file that changes the database schema.
- **Neon:** a hosted, serverless Postgres that suspends when idle.
- **PgBouncer:** a connection pooler in front of Postgres; Neon's pooled
  endpoint uses it.
- **Postgres:** the relational database.
- **Trigger:** a database function that runs on insert, update or delete,
  and can refuse the change.
- **Unique index:** stops two rows having the same value; used to allow
  only one pending verification request per real user.

## Google Cloud

- **Artifact Registry:** Google's store for container images.
- **Cloud Run:** runs a container on demand and scales to zero when idle.
- **Cold start:** the extra time for the first request after scale to zero.
- **Min / max instances:** Cloud Run limits. ROAAMM uses 0 and 2.
- **Secret Manager:** Google's store for secrets such as the database URL.
  Cloud Run mounts it as an environment variable at start.
- **Service account:** an identity for a program, not a person.
- **Workload Identity Federation (WIF):** lets an outside identity (a
  GitHub Actions job) get short-lived Google credentials without a stored
  key.

## GitHub and CI/CD

- **actionlint:** checks GitHub Actions workflow files for mistakes.
- **ADR (Architecture Decision Record):** a short document that records one
  decision, the options and why. In `docs/adr/`.
- **Branch protection / required check:** GitHub refuses to merge a pull
  request until named checks pass. ROAAMM requires only `ci-ok`.
- **CI/CD:** continuous integration (test every change) and continuous
  delivery (deploy automatically).
- **`ci-ok`:** the one required job; it fails if any other job failed or was
  cancelled.
- **CodeQL:** GitHub's code scanner that looks for security bugs.
- **Concurrency group / cancel-in-progress:** GitHub Actions setting that
  cancels an older run when a newer one starts for the same branch.
- **Dependabot:** GitHub bot that opens PRs to update dependencies.
- **gitleaks:** scans commits for leaked secrets.
- **GitHub Actions:** GitHub's automation that runs workflows on events
  like push or pull request.
- **Monorepo:** one repository holding several apps and libraries.
- **OIDC (OpenID Connect) token:** a short-lived signed identity token.
  GitHub gives one to a job that asks for `id-token: write`.
- **Path filter:** runs a CI job only when files in certain folders change.
- **Pinning an action to a SHA:** referring to a GitHub Action by its full
  commit hash, so it cannot change under you.
- **pnpm / workspace:** the Node package manager; a workspace links the
  monorepo's packages together.
- **Repository variable:** a non-secret setting for workflows, such as
  `DEPLOY_ENABLED`.
- **Smoke test:** a quick check after deploy that the main endpoints answer.
- **Squash merge:** merges a PR as one commit on `main`.

## Security and crypto

- **Attestation:** proof of which device made a passkey. ROAAMM asks for
  none.
- **Base64url:** a text encoding of bytes that is safe in URLs.
- **Challenge:** a random value the server sends; the passkey signs it to
  prove it is present now.
- **E2EE (end-to-end encryption):** only the people talking can read
  messages, not the server. Planned (M6).
- **Fresh check (reauth):** asking for a passkey again within 5 minutes
  before a risky action.
- **MLS (Messaging Layer Security, RFC 9420):** a standard for group
  end-to-end encryption. Planned with OpenMLS (M6).
- **Rate limit:** a cap on how many requests one IP can make in a time
  window.
- **Recovery code:** a one-time code to sign in if you lose your passkey.
- **rpId (relying party ID):** the domain a passkey belongs to:
  `roaamm.plinthwell.com`.
- **SFrame:** a standard for encrypting call media. Planned (M7).
- **SHA-256:** a hash function. ROAAMM stores hashes of session tokens and
  recovery codes, never the raw values.
- **Sign count:** a counter some authenticators raise on each use; a drop
  can mean a cloned key.
- **User enumeration:** finding out which accounts exist from error
  messages. ROAAMM's errors are generic to prevent it.
- **User verification (UV):** the device checked you (PIN, fingerprint,
  face) before using the passkey.

## Project words

- **Demo user:** one of three shared sandbox accounts (traveller, guide,
  admin). Every visitor of a role shares it.
- **Real user:** an account made with a passkey on `/signup`.
- **Sample person / seed row:** simulated people and requests added by
  migration V5 so the demo admin queue is never empty.
- **Scope (`is_demo`):** every verification row is demo or real; each admin
  sees only its own scope.
- **Simulated verification:** a request holds only a document type and a
  made-up `SAMPLE-` reference. No real ID is ever collected.
