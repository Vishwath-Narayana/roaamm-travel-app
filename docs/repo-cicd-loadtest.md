# ROAAMM: Repo Layout, CI/CD and Load-Test Plan

> Doc 6 of 8.

## 1. Repo: `github.com/Vishwath-Narayana/roaamm` (public)
```
roaamm/
├── apps/
│   └── web/                    # React 19 + Vite + TS → roaamm.plinthwell.com
│       └── src/{routes,features,components,lib/{rt,crypto,api},styles}
├── edge/                       # Rust Workers (workers-rs) → roaamm-rt.plinthwell.com
│   ├── src/{lib.rs,router.rs,auth.rs,ratelimit.rs,session_do.rs,room_do.rs,keypackage_do.rs,turn.rs,metrics.rs}
│   └── wrangler.toml
├── status/                     # Small static site + Worker → roaamm-status.plinthwell.com
├── crates/
│   ├── roaamm-crypto/          # OpenMLS wrapper, SFrame keys, attachment crypto (WASM for web + edge)
│   └── roaamm-protocol/        # WebSocket frame types (serde) → TS types via ts-rs/specta
├── services/
│   └── core/                   # Java 25, Spring Boot 4, Gradle, GraalVM native → roaamm-api
│       └── src/main/java/com/plinthwell/roaamm/{auth,users,verification,trips,guides,bookings,payments,safety,admin,common}
├── packages/
│   ├── design-tokens/          # monochrome tokens → CSS vars + TS
│   └── api-client/             # generated from core OpenAPI
├── loadtest/
│   ├── k6/{ws-chat.js,api-mixed.js,lib/}
│   └── reports/                # published results (md + json)
├── infra/
│   ├── server/{setup.sh,docker-compose.yml,cloudflared.yml}
│   └── cloudflare/README.md    # dashboard settings that aren't in code
├── docs/
│   ├── product-brief.md  system-design.md  security.md  tech-stack.md
│   ├── free-services.md  milestones.md
│   └── adr/                    # Architecture Decision Records (0001-edge-realtime.md, 0002-mls.md, ...)
├── .github/{workflows/,dependabot.yml,CODEOWNERS}
├── Cargo.toml  pnpm-workspace.yaml  package.json  README.md  SECURITY.md  LICENSE (MIT)
```
The README is the recruiter's landing page:
- One-paragraph pitch, **live demo link**, a screenshot or GIF.
- The architecture diagram.
- The load-test headline numbers.
- Security summary, tech stack, how to run it locally, links to the docs.

## 2. Local development
- `pnpm dev` runs Vite (web), `wrangler dev` (edge, with local Durable Objects) and the core in Docker Compose (Postgres + core in JVM mode for fast reloads) together.
- Seed script: demo users, trips, guides, a few encrypted conversations (created by a headless client so they're real MLS).

## 3. Branching and pull requests
- `main` is protected: pull request required, `ci-ok` must pass, squash merge, no force pushes.
- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Conventional commit messages.
- Every pull request gets a preview: Workers preview URL + a Neon branch.

## 4. CI (`.github/workflows/ci.yml`)
Jobs run only when their paths change. A final **`ci-ok`** job collects all results and is the single required check.
| Job | Steps |
|---|---|
| `lint-workflows` | actionlint |
| `secrets` | gitleaks |
| `web` | pnpm install (frozen lockfile), lint, typecheck, Vitest, build, bundle-size budget, Lighthouse CI (on preview) |
| `rust` | fmt, clippy `-D warnings`, `cargo test`, `wasm-pack test --headless --chrome` (crypto), cargo-deny, build edge (`worker-build`) |
| `core` | Gradle `check` (JUnit + Testcontainers + ArchUnit), OpenAPI spec generated and compared against the committed `packages/api-client` (fails if it's out of date), native image build (on `main` only) |
| `e2e` | Playwright against the preview: sign up with the demo, two browsers chat, **plaintext-leak test** (send a marker string, then confirm it doesn't appear in any stored data), call setup |
| `security` | CodeQL (JS/TS, Java, Rust), OWASP Dependency-Check, ZAP baseline (against preview, weekly) |

## 5. CD
| Target | Trigger | How |
|---|---|---|
| Edge + web + status | Merge to `main` | `wrangler deploy` (production), smoke test hitting `/health` on every subdomain |
| Core | Merge to `main` touching `services/core` | Native image → `ghcr.io/vishwath-narayana/roaamm-core:<sha>` → SSH through Cloudflare Access → `docker compose pull && up -d` → health check → roll back to the previous tag if it fails |
| Database | Part of the core deploy | Flyway migrations at startup (backward-compatible only: expand, then contract) |
| Releases | Tag `v*` | GitHub release with **web asset SHA-256 hashes** (for the "verify this build" page) |

All actions pinned to commit SHAs. Cloudflare token scoped narrowly. Deploy jobs use a GitHub `production` environment with protection rules.

## 6. Load-test plan (proof of the 50k claim)

### 6.1 When and where
- During the **one paid month of Workers Paid** ($5), with a **spending limit set first**.
- Load generators: **10 parallel GitHub Actions jobs** (matrix), each running k6 with **5,000 WebSocket virtual users**, for **50,000 in total**.
- If a hosted runner can't hold 5,000 sockets, use 20 jobs × 2,500.
- Each job raises its file-descriptor limit and tunes TCP settings first.

### 6.2 Scenario `ws-chat.js`
1. **Setup:** a `loadtest` admin endpoint (behind a secret, active only during the test window) creates 50,000 test users and 25,000 1:1 rooms, and hands out a pre-signed token for each user. Load-test messages use a **test-mode crypto shortcut** that sends random 300-byte ciphertext, so the measurement covers the transport and routing path and not browser crypto. **Say this in the report.**
2. **Pairs:** both users in a pair run in the **same k6 instance**, so delivery latency is measured on **one clock**.
3. **Profile:**
   - Ramp 0 → 50,000 connections over 10 minutes (about 83 new connections per second).
   - **Hold for 15 minutes.** Each user sends a message every 15 seconds (about 3,300 messages/s across the system) plus receipts.
   - A 2-minute burst at 3× the rate.
   - Ramp down.
4. **Measurements (k6 custom metrics):**
   - `ws_connect_time`
   - `msg_ack_latency` (send → ack)
   - `msg_e2e_latency` (send → partner receives)
   - delivery success rate, reconnects, errors
5. **Pass criteria:**
   - ≥ 99.5% of connections succeed.
   - ≥ 99.9% of messages are delivered.
   - `msg_e2e_latency` 95th percentile **under 150 ms** within a region and under 300 ms across regions (runners are mostly in the US, so add one run with the rooms deliberately placed in Asia to measure cross-region latency).
   - Error rate under 0.1%.

### 6.3 Other runs
- `api-mixed.js`: the core's real limit on the e2-micro (requests/s at 95th percentile under 300 ms) for trip search, profile and booking. Published as "single node", together with the scale-out math from doc 2.
- Reconnect storm: drop all connections at once and measure how long it takes for everyone to recover.
- Soak test (stretch goal): 5,000 connections for 2 hours.

### 6.4 Report
- `loadtest/reports/2026-xx-xx-50k.md`: setup, scenario, results table, charts (generated from the k6 JSON), Cloudflare dashboard screenshots, cost of the run, known limitations.
- The headline numbers go into the README and the System page.
