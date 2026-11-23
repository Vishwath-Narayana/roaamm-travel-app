# M1.9: Live Core API status and stale copy

PR [#16](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/16),
merged 2026-11-22, after M2-prep (it needed the API proxy from PR #15).

## What we built and why

Once the Java core was live behind `roaamm-api.plinthwell.com`, the landing
page still said "Not deployed yet". This change made the status row measure
the Core API like the other services, updated the "Java core" card to say it
runs on Cloud Run behind a Worker, and replaced old "Cloudflare Tunnel" text
in the docs. Small, but it kept the site honest.

## How it works

1. `apps/web/src/services.ts` lists four health URLs, now including
   `https://roaamm-api.plinthwell.com/health`.
2. The status row sends one warm-up and then 3 timed CORS requests to each,
   and checks the `{"status":"ok"}` body.
3. The API proxy Worker allows CORS from the web origin, so the browser can
   read the answer.
4. A 502 from the proxy shows as "Down", with no console error.

## Key files to open

- `apps/web/src/services.ts`
- `apps/web/src/components/StatusRow.tsx`
- `apps/web/src/pages/landing/Build.tsx`: the "How it's built" cards
- `edge-api-proxy/src/index.ts`: the CORS rules
- `docs/free-services.md`, `docs/tech-stack.md`: the updated text

## New terms

Health check, 502 Bad Gateway, stale copy. See the [glossary](glossary.md).

## Mistakes and fixes

- **The site said the core was not deployed when it was.** The status
  probe had a hard-coded `not-deployed` state. Fix: a real probe, with tests
  for Checking, Up and Down.
- **Docs still described the old plan.** Several docs mentioned Cloudflare
  Tunnel for the core after ADR 0003 chose Cloud Run. Fix: those references
  were updated; ADRs 0001 and 0002 were left as they were, because ADRs
  record history.

## Try it yourself

1. Run `curl -s https://roaamm-api.plinthwell.com/health`.
2. On the live landing page, watch the Core API time in the status row. If
   the core was asleep, the first visit can show a slower time.
3. Read the Core API status tests: run
   `grep -n "Core API" apps/web/src/pages/landing/sections.test.tsx` and open
   the lines it finds.

## Test yourself

1. Why did this change wait for M2-prep-2?
2. What does the status row check besides the time?
3. Why were ADRs 0001 and 0002 not edited?

### Answers

1. The browser could only reach the core through
   `roaamm-api.plinthwell.com`, which the proxy Worker from PR #15 created,
   along with its CORS rules.
2. That the body is `{"status":"ok"}`.
3. ADRs are a record of past decisions; you add new ADRs instead of
   rewriting old ones.
