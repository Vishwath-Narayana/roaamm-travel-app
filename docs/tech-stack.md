# ROAAMM: Tech Stack

> Doc 4 of 8. Three languages, each used where it's strongest: **TypeScript** (UI), **Rust** (real-time edge and cryptography, compiled to WebAssembly), **Java** (business core). Exact versions are pinned when the project is scaffolded. Use the latest stable releases, and keep Java on an LTS release.

## 1. Frontend: `apps/web` → `roaamm.plinthwell.com`
| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | |
| Framework | **React 19 + Vite** | A single-page app behind a login. Builds to static files that Cloudflare serves for free, with no server rendering to run. (Next.js was considered; Vite is simpler and faster on Cloudflare for this app.) |
| Routing / data | TanStack Router (type-safe routes) + TanStack Query (caching, retries) | |
| Forms / validation | React Hook Form + Zod | The same schemas check API responses |
| UI | Tailwind CSS + Radix UI primitives (shadcn-style components we own) | Accessible, fully custom look |
| Motion | Motion (formerly Framer Motion) | Spring animations. Never fade or animate glass blur. Respects reduced motion. |
| Design tokens | `packages/design-tokens` (monochrome, carried over from Plinthwell), turned into CSS variables | |
| Maps | MapLibre GL JS + free OpenStreetMap-based tiles (e.g. OpenFreeMap) | No API key, no bill |
| Real-time | Native WebSocket client (reconnects with jitter, resumes from cursors), WebRTC + Encoded Transform (SFrame) | |
| Crypto | `crates/roaamm-crypto` compiled with `wasm-bindgen` and run in a **Web Worker** | Keeps heavy crypto off the UI thread |
| Local storage | IndexedDB (via `idb`), WebCrypto non-extractable wrapping key | |
| Testing | Vitest + Testing Library, Playwright (end-to-end, including a two-browser chat test) | |
| Quality | ESLint, Prettier, `tsc --noEmit`, Lighthouse CI | |

## 2. Edge: `edge/` → `roaamm-rt.plinthwell.com`
| Concern | Choice | Why |
|---|---|---|
| Language | **Rust** (stable) → `wasm32-unknown-unknown` | Fast startup and low CPU per request (the free plan allows 10 ms of CPU per request), memory-safe, shares code with the browser crypto |
| Framework | `workers-rs` (`worker` crate) | Rust support for Cloudflare Workers and Durable Objects |
| Stateful parts | **Durable Objects**, SQLite-backed: `SessionDO` (per user), `RoomDO` (per conversation), `KeyPackageDO` (per user) | Strict ordering per room, durable storage, global placement |
| WebSockets | **Hibernation API** (`accept_web_socket`) | Idle connections cost nothing |
| Rate limiting | Workers Rate Limiting binding | |
| Session check | Decided in M5. Sessions are opaque cookies in Postgres (ADR 0004); there are no JWTs | |
| Metrics | Workers Analytics Engine | Feeds the System page |
| Serialization | `serde` + JSON (CBOR later) | |
| Testing | `cargo test`, Miniflare / `wrangler dev` integration tests | |
| Tooling | `wrangler`, `worker-build` | |

> **Risk note:** if `workers-rs` is missing a Durable Object or hibernation API we need, write that one Durable Object class as a **thin TypeScript wrapper** that calls the Rust WebAssembly logic. Document the choice in an ADR (architecture decision record).

## 3. Crypto: `crates/roaamm-crypto` (shared by the browser and edge)
| Concern | Choice |
|---|---|
| Group E2EE | **OpenMLS** (RFC 9420) with a RustCrypto provider (WebAssembly compatible) |
| Primitives | RustCrypto: `x25519-dalek`, `ed25519-dalek`, `aes-gcm`, `chacha20poly1305`, `hkdf`, `sha2`, `argon2` |
| Calls | SFrame (RFC 9605) key derivation from the MLS exporter. The frame transform runs in a JavaScript worker using WebCrypto AES-GCM, or is ported to the Rust WebAssembly module if profiling shows it's faster. |
| Bindings | `wasm-bindgen` + `serde-wasm-bindgen`; TypeScript types generated |
| Testing | `cargo test` (property tests with `proptest`), `wasm-bindgen-test` in a headless browser |

## 4. Core: `services/core` → `roaamm-api.plinthwell.com`
| Concern | Choice | Why |
|---|---|---|
| Language | **Java 25 (LTS)** | |
| Framework | **Spring Boot 4**, Spring MVC on **virtual threads** | Simple blocking-style code that still handles many requests at once |
| Security | Passkeys with `webauthn4j-core` (ADR 0005), recovery codes, opaque cookie sessions (ADR 0004). No Spring Security, no email codes | Fewest dependencies; works in the native image |
| Data | Postgres (**Neon**), **Spring Data JDBC or jOOQ**, **Flyway** migrations, HikariCP | Explicit SQL, no ORM surprises |
| API contract | OpenAPI 3 (springdoc) → `packages/api-client` generated with `openapi-typescript` + `openapi-fetch` | The frontend can't drift from the backend |
| Payments | Razorpay **test mode** SDK + webhook signature check | |
| Email | Resend (HTTP API) | |
| Files | Cloudflare R2 through its S3-compatible API (AWS SDK v2), presigned URLs | |
| Observability | Micrometer + OpenTelemetry Java agent → Grafana Cloud; Sentry | |
| Build | Gradle (Kotlin DSL), **GraalVM native image** (Spring AOT), Docker multi-stage, distroless or minimal base image | Small memory use (~100 MB), fits the free server |
| Testing | JUnit 5, AssertJ, **Testcontainers (Postgres)**, Spring Boot test slices, ArchUnit (layering rules) | |
| Hosting | **Google Cloud Run** (us-central1, scales to zero, max 2 instances) behind the `roaamm-api` Cloudflare Worker proxy | [ADR 0003](adr/0003-core-hosting-cloud-run.md); e2-micro VM is the fallback |

## 5. Shared packages
- `packages/design-tokens`: colours, type scale, radii, spacing, motion springs. Outputs CSS variables and a TypeScript object.
- `packages/api-client`: TypeScript client generated from the core's OpenAPI spec.
- `packages/protocol`: WebSocket frame types, written once in Rust (`crates/roaamm-protocol`) and exported to TypeScript with `ts-rs` or `specta`.

## 6. Load testing and quality
| Concern | Choice |
|---|---|
| Load test | **k6** (open source) with its WebSocket and HTTP modules, run from parallel GitHub Actions runners |
| Results | k6 JSON summary turned into a Markdown/HTML report, committed to `loadtest/reports/`, shown on the System page |
| Security scans | CodeQL, gitleaks, cargo-deny, OWASP Dependency-Check, OWASP ZAP baseline |
| Performance | Lighthouse CI, bundle size budget |

## 7. DevOps
| Concern | Choice |
|---|---|
| Repo | Public GitHub monorepo `github.com/Vishwath-Narayana/roaamm` |
| Package managers | pnpm workspaces (JS), Cargo workspace (Rust), Gradle (Java) |
| CI/CD | GitHub Actions. Actions pinned to commit SHAs. One required `ci-ok` check. |
| Edge deploy | `wrangler deploy` from CI, using a Cloudflare API token scoped to Workers and DNS |
| Web deploy | Static assets through Workers static assets / Pages |
| Core deploy | CI builds the native image → pushes to GitHub Container Registry → SSH through Cloudflare Access → `docker compose pull && up -d` on the server |
| Environments | `preview` (per pull request: Workers preview URLs, a Neon branch) and `production` |
| Dependency updates | Dependabot, grouped weekly |

## 8. Why these choices (interview answers)
- **Why the edge for real-time?** Users connect to the nearest of hundreds of locations. Durable Objects give per-room ordering and storage without running a message broker. Hibernating WebSockets make idle connections free.
- **Why Rust at the edge?** Low CPU per request, fast startup, memory safety, and the same crypto code in the browser and on the server.
- **Why Java for the core?** Mature tooling for transactions and security. Virtual threads give high throughput with simple code. GraalVM native image makes it small and quick to start.
- **Why MLS instead of the Signal protocol?** It's an IETF standard designed for groups, gives the same security properties, and has an audited Rust implementation. Group membership changes cost log(n) instead of n.
- **Why Neon?** Serverless Postgres with branching for preview environments. A free tier that doesn't expire.
