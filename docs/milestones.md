# ROAAMM: Build Milestones

> Doc 7 of 8. Each milestone ends with: a merged pull request (`ci-ok` green), a deploy to production, the docs updated, and a short demo note. Build in order. Durations are rough estimates for one developer working with Claude.

**Definition of done (every milestone):** the milestone PR adds or updates its study note in [docs/learn/](learn/README.md), with every section the folder README lists, and adds any new ADR to [docs/learn/decisions-in-plain-words.md](learn/decisions-in-plain-words.md). A milestone PR without its note is not done.

| # | Milestone | Delivers | Done when |
|---|---|---|---|
| **M0** | Foundation | Public repo, monorepo skeleton (web, edge, crates, core, packages), CI with `ci-ok`, Cloudflare/Google Cloud/Neon accounts, a "hello" app deployed on **all 4 subdomains**, core on Cloud Run behind the `roaamm-api` Worker proxy, Sentry | `roaamm.`, `roaamm-rt.`, `roaamm-api.` and `roaamm-status.plinthwell.com` all return 200 over TLS from CI deploys |
| **M1** | Design system + shell | Tokens, Tailwind theme, core components (button, card, input, glass nav, toasts), app shell + landing page (from WEB-* designs), ROAAMM wordmark, dark mode, motion rules, accessibility checks | Lighthouse ≥ 90; landing matches the design |
| **M2** | Accounts | M2a: database, opaque cookie sessions, **Try demo** (ADR 0004). M2b: passkey sign-up and login, recovery codes, account page (ADR 0005) | New user can sign up with a passkey; demo login works; auth tests pass |
| **M3** | Verification + admin | Simulated ID verification (a document type and a server-made sample reference, **no real ID collected**), scoped admin queue, append-only audit log, first-admin runbook (ADR 0006) | Admin approves a user and the status shows; demo and real data never mix; demo admin is read-only |
| **M4** | Trips + discovery | Trips CRUD, overlap matching, discovery with filters, connection requests, edge-cached discovery | Two demo users find each other by dates. **Done 2026-11-28** for trips, guide applications and the admin, traveller and guide apps; discovery is still open (see below) |
| **M5** | Real-time transport | Rust edge: auth, rate limits, Session/Room DOs, hibernating WebSockets, send/ack/deliver/receipts/typing/presence, resume from cursor, metrics; web chat UI | Two browsers chat (still test ciphertext); a reconnect loses nothing |
| **M6** | **E2EE chat (MLS)** | `roaamm-crypto` (OpenMLS) in WebAssembly + Web Worker, KeyPackage DO, device credentials (core = Authentication Service), 1:1 + groups, encrypted attachments, safety numbers, key backup | **Plaintext-leak test passes**; adding and removing members works; new device flow works |
| **M7** | Calls | WebRTC 1:1 audio and video, MLS-encrypted call setup, TURN credentials, SFrame encryption (with "encrypted in transit" fallback label), call UI | Call connects in two browsers; relay path tested; SFrame verified |
| **M8** | Safety | SOS (encrypted to the contacts room + consented email), live location sharing on MapLibre (end-to-end encrypted), check-in timer with escalation, emergency contacts | SOS end-to-end works in the demo (email to a test inbox) |
| **M9** | Guides + booking | Guide profiles (GD-* designs), slots, booking flow, Razorpay **test** checkout + webhook, booking chat | Test payment completes; booking appears for both sides |
| **M10** | Observability + System page | OpenTelemetry → Grafana, Analytics Engine latency metrics, `roaamm-status` page (architecture, live p50/p95, connections, security summary, links) | Live latency visible publicly |
| **M11** | **50k load test** | k6 scripts, runner matrix, Workers Paid month + spending limit, run, report, README headline | Report published; pass criteria met (or honest results with an analysis) |
| **M12** | Hardening + polish | Security headers/CSP/Trusted Types, ZAP scan fixes, permission tests, "verify this build" page, nightly demo reset, performance tuning, README case study, short demo video | Security checklist complete; the site is ready to send to recruiters |

## Progress

- **M4: done on 2026-11-28**, in five pull requests: M4a (#26, the trips and
  guide application API), M4b (#27, the admin console), M4b.1 (#28) and
  M4b.2 (#29, the design system and its checks), and M4c (#33, the traveller and
  guide apps). Study notes: [docs/learn/46](learn/46-m4-accounts-trips-and-admin.md)
  and the per-PR notes it links.
  - **Delivered beyond the original line:** guide applications with admin
    review and the guide role change (ADR 0008), and the admin console.
  - **Not delivered from the original line:** overlap matching, discovery
    with filters, connection requests and edge-cached discovery. The "two demo
    users find each other by dates" check has not been met. Which milestone
    takes them is still to be decided.

## Resume bullet (to fill in with real numbers after M11)
> **ROAAMM**: end-to-end encrypted, real-time travel platform (live at roaamm.plinthwell.com).
> - Designed and load-tested an edge real-time architecture (Rust/WebAssembly on Cloudflare Workers + Durable Objects) sustaining **50,000 concurrent WebSocket users** with **p95 message delivery of N ms**.
> - Built MLS (RFC 9420) group E2EE and SFrame-encrypted WebRTC calls with a shared Rust crypto core compiled to WebAssembly.
> - Java 25 / Spring Boot 4 core (GraalVM native) with passkey auth, on Google Cloud Run (scales to zero) behind a Cloudflare Worker; runs entirely on free tiers.
