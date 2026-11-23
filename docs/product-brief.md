# ROAAMM: Product Brief

> Doc 1 of 8 in the ROAAMM documentation package. Read together with `02-system-design.md` … `08-handoff-prompt.md`.

## What it is
**ROAAMM** (written **ROAAMM** in the logo, **Roaamm** in running text) is a web app for **solo travellers**. Every traveller is ID-verified. They can find other verified travellers on the same dates, chat and call each other with end-to-end encryption, book licensed local guides, and stay safe with SOS, live location sharing and timed check-ins.

It's a focused, web-only version of **Plinthwell**, the larger travel-safety startup idea (mobile apps, AI assistant, subscriptions) that its founder, Vishwath, designed earlier. Plinthwell is the company and owns the domain (`plinthwell.com`). ROAAMM is the product shown here.

## Why it exists
ROAAMM is a **portfolio project for job applications**. It has to prove three things to a hiring engineer within minutes of opening it:

1. **System design at scale.** The architecture is designed for **50,000 concurrent users** and **50,000 simultaneous chats** with very low latency worldwide, and that claim is **backed by a published load test**, not just stated.
2. **Real-time engineering.** Chat over WebSockets on a global edge network, plus voice and video calls over WebRTC.
3. **Security.** Chat and calls are end-to-end encrypted with a modern standard (MLS, RFC 9420). It comes with a written threat model, passkey login and a hardened web front end.

It also has to look like a real product, with polished, consistent UI (monochrome, glassy, smooth motion).

## Who uses it
| Visitor | What they do |
|---|---|
| **Recruiter / hiring engineer** (the real audience) | Opens `roaamm.plinthwell.com`, clicks **Try demo**, explores as a sample traveller, reads the **System** page (architecture, live latency, load-test report) and the public GitHub repo. |
| Traveller (demo persona) | Signs up, gets verified, finds travellers, chats, calls, uses safety features, books a guide. |
| Guide (demo persona) | Has a profile and receives bookings. |
| Admin (demo persona) | Approves ID verifications and guides, handles reports. |

## Honest claims (only claim what's measured)
| Claim | How it's proven |
|---|---|
| "Designed for 50k concurrent users / 50k concurrent chats" | Capacity math in `02-system-design.md`, plus a k6 load test with 50,000 real WebSocket connections on Cloudflare's network. The report is published on the System page and in the repo. |
| "Low latency worldwide" | Targets: message delivery under 150 ms within a region and under 300 ms across continents, 95% of the time. Live numbers from real traffic are shown on the System page. |
| "Zero-lag calls" | Never claim "zero". Calls are peer-to-peer WebRTC with a relay fallback; one-way delay is typically 100–200 ms. Say "low-latency calls". |
| "End-to-end encrypted" | Chat with MLS, calls with SFrame. Threat model in `03-security-e2ee.md`, including the honest limitation that on the web the server delivers the JavaScript. |

Never claim "0 latency" or "unhackable". Measured numbers and a stated threat model are more credible.

## Features (scope)
1. **Accounts and verification.** Sign-up with passkeys, with single-use recovery codes instead of email (ADR 0005). Mock ID verification: upload a sample ID, encrypted to the admins' key, which an admin approves. A "Verified" badge.
2. **Trips and discovery.** Create trips (city and dates), find verified travellers whose dates overlap, send connection requests.
3. **End-to-end encrypted chat.** 1:1 and group (up to 256 members). Delivery and read receipts, typing indicators, online status, encrypted image attachments.
4. **End-to-end encrypted calls.** 1:1 voice and video calls (WebRTC + SFrame). Group calls are a stretch goal.
5. **Safety.** SOS button (alerts emergency contacts with your location), live location sharing to chosen contacts (end-to-end encrypted, on a map), check-in timer that escalates if you miss it.
6. **Guides and booking.** Guide profiles and booking with payment in **Razorpay test mode** (no real money).
7. **Admin.** Verification queue, guide approval, reports, simple metrics.
8. **System page** (`roaamm-status.plinthwell.com`). Architecture diagram, live latency and throughput, load-test report, security summary, links to the repo and docs.

**Recruiter flow:** a **Try demo** button logs the visitor in as a seeded traveller, with existing trips, chats and a guide booking. Demo data resets every night.

**Out of scope:** mobile apps, AI assistant, subscriptions and paywall, points and referrals, real payments, real ID checks.

## Design
- Reuse the Plinthwell **web design canvas** (Claude Design canvas, slug `17d1690e-2648-4fad-ab49-601c182c0581`: WEB-01..49 public and traveller pages, GD-01..31 guide pages, ADM-01..39 admin pages), rebranded to ROAAMM.
- Design language: **monochrome** (black ink is the accent, no blue), translucent glass surfaces on the floating layer only, at most 2 glass surfaces on screen, SOS is always solid red and never glass.
- Smooth spring-based motion. Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- Accessibility: WCAG 2.2 AA, full keyboard navigation, visible focus.
- Logo: no logo exists yet. Make a simple wordmark "ROAAMM" in a geometric sans font, with an optional compass or route-line mark. Monochrome.

## Success criteria
- The live site loads fast worldwide (Lighthouse at least 90 on all four categories).
- The demo works end to end without any setup.
- The load-test report shows 50,000 concurrent WebSocket connections, with message latency within the targets.
- The repo has a clear README, architecture docs, the threat model and green CI.
- Everything runs on free tiers. The only payment is about $5 for one month of Cloudflare Workers Paid, used to run the 50k load test.
