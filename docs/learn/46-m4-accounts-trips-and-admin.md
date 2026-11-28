# M4: Trips, guide applications and the admin console

This note covers all of M4 in one place. M4 shipped in five pull requests:
M4a ([#26](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/26),
the API and database), M4b
([#27](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/27), the
admin console), M4b.1
([#28](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/28)) and
M4b.2 ([#29](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/29),
two polish passes and the design system checks), and M4c (the traveller and
guide apps). Each one also has its own note:
[47 (M4a)](47-m4a-trips-guides-core.md), [48 (M4b)](48-m4b-admin-console.md),
[43 (M4b.1)](43-m4b-1-admin-polish.md), [44 (M4b.2)](44-m4b-2-admin-polish.md)
and [45 (M4c)](45-m4c-traveller-and-guide-ui.md).

## What we built

- **Trips.** A traveller (or guide) keeps their own trips: a title, a place,
  start and end dates, a status (planned, ongoing, completed, cancelled) and
  private notes. Up to 20 per account. The demo traveller has three sample
  trips whose dates move with today, so one is always in the past and two are
  always upcoming.
- **Guide applications.** A verified traveller can apply to become a local
  guide: a headline, a short bio, languages and cities. An admin reviews it
  and approves or rejects it (a rejection always has a reason). Approving a
  real application makes that person a guide.
- **The admin console** at `/app/admin`: an overview with key numbers, a
  verification queue, a board of guide applications, users, trips (read-only,
  never notes) and the audit log. Admins can decide up to 25 rows at once.
- **The traveller app** at `/app/traveller`: an overview, the trips list,
  a form to add or edit a trip, a trip page, and "Become a guide" with the
  application's status.
- **The guide app** at `/app/guide`: an overview, the guide's profile, and
  Availability and Bookings pages that say what will arrive in M9.
- **A design system with checks.** One tokens file for colours and sizes,
  and three CI checks that keep every screen on it.

All data in the demo is simulated. The demo accounts are shared by every
visitor, so in the app they are read-only.

## How it works

One request, from a click in the traveller app to the database and back:

```text
 Browser (roaamm.plinthwell.com)
 ┌──────────────────────────────────────────────────────────────┐
 │ App.tsx router                                               │
 │   /app/admin/*      -> AdminApp     ┐                        │
 │   /app/traveller/*  -> TravellerApp ├─> AppShell             │
 │   /app/guide/*      -> GuideApp     ┘   (session check,      │
 │                                          role guard, sidebar,│
 │                                          top bar, palette)   │
 │   screen -> api/member.ts or api/admin.ts                    │
 │             (30 s read cache, cleared by every write)        │
 └──────────────────────────────┬───────────────────────────────┘
                                │ fetch, cookie + X-Roaamm-Csrf on writes
                                v
 roaamm-api Worker (proxy, edge-api-proxy/)
                                │
                                v
 Java core on Cloud Run (services/core)
   CsrfFilter (Origin + CSRF header)  -> rate limits per IP
   -> ReadOnlyDemoInterceptor (the demo admin cannot write)
   -> TripController / GuideApplicationController / AdminController
   -> Access.member(...) or Access.admin(...)  (role check)
   -> Service: validation (PlainText), ownership, one open application
   -> Repository: SQL that always filters by user_id (members)
                  or by is_demo (admins)
                                │
                                v
 Postgres (Neon): users, trips, guide_applications,
                  verification_requests, admin_audit_log
```

- **Members** only ever reach their own rows: every member query has
  `WHERE user_id = :me`. Another user's trip id answers 404.
- **Admins** only ever reach their own scope: the demo admin sees demo rows,
  a real admin sees real rows (`WHERE is_demo = :scope`).
- **Every admin decision** writes a row to the append-only audit log, and
  the console builds its timelines from that log.
- **The web app** loads each signed-in area as a lazy chunk, so the landing
  page never downloads it.

## Key decisions and why

- **Guide applications, the role change and bulk decisions
  ([ADR 0008](../adr/0008-guide-applications.md)).** Only verified
  travellers may apply; one open application per real user; approving a real
  application changes the role in the same transaction; each row of a bulk
  decision has its own transaction and audit row. Why: a reviewed path to
  "guide", and one bad row must not undo the others.
- **The shared demo users never change for everyone.** The role update is
  `WHERE NOT is_demo AND role = 'traveller'`. Demo rows are capped and
  cleaned up after a day instead of being blocked, so one visitor cannot lock
  the demo for the next.
- **One tokens file, enforced by checks
  ([ADR 0009](../adr/0009-one-tokens-file.md)).** Colours and sizes live only
  in `styles/tokens.css`; a lint, a contrast check and a rendered check keep
  every screen on it. Why: values had drifted one screen at a time.
- **One app shell for every signed-in area** (M4c). The traveller and guide
  apps reuse the admin console's shell and building blocks instead of copying
  them. Not an ADR: it is a code structure choice inside the web app, but it
  is why the three areas look and behave the same.
- **Numbers, not percentages, on the Overview.** "+3 in 30 days, vs 2 prior
  30 days" says more than "+50%" on small counts, and the API reports no
  change at all when there is nothing to compare with.
- **Read-only demo, visible controls.** The demo shows every action, disabled,
  with the reason ("Demo is read-only"), so visitors see the whole product
  without changing it for others.

## Security and privacy rules

- **Owner only.** A trip and a guide application are visible to their owner
  only. Any other id is a 404 (not 403), so ids cannot be probed.
- **Trip notes are private.** The API sends notes to the owner only; the
  admin trip list and every admin view leave them out. A core test creates a
  trip with notes and checks that the admin response never contains them.
- **Roles are checked on the server.** Members cannot call admin endpoints
  (403); admins have no trips (403). The web app's role guard only decides
  which page to show; it is not the security boundary.
- **Every write** needs the session cookie, the right `Origin` and the
  `X-Roaamm-Csrf` header. The demo admin's writes are refused twice: by an
  interceptor for every write, and again inside each admin service method.
- **Scopes never mix.** Demo and real rows are separated by `is_demo` on
  every table, and a test checks both directions for every admin list.
- **Validation on the server.** Lengths, dates (two years back to three
  ahead), place names (letters, spaces, `. ' -`), language codes from a fixed
  list, and no `<` or `>` anywhere. The browser repeats these checks only to
  give faster messages.
- **No personal data.** There is no email or phone number to show. ID
  verification is simulated: only a document type is sent.
- **Rate limits** per IP: 300 reads per 10 minutes, 30 trip writes per 10
  minutes, 5 guide applications per hour, 60 admin writes per 10 minutes.

## How we tested it

- **Core (Java):** 88 tests in `./gradlew check`, all against a throwaway
  Postgres in Docker (Testcontainers). They cover trip ownership for every
  verb, the list filters, every field limit, the 20-trip cap, sample trips,
  one open application and reapplying after a rejection, the real and demo
  role change, bulk decisions with per-row results, scope isolation, members
  and admins kept apart, and the rate limits. The native image runs a smoke
  test of the M4 endpoints in CI (`scripts/ci/m4-smoke.mjs`).
- **Web (Vitest):** 213 tests: the admin screens, the shell and role guard,
  the trip and application forms (inline errors, focus, saving, toasts), the
  confirm dialog, edit and resubmit, the demo's disabled controls, and the
  validators.
- **In a real browser (headless Chrome, CI):**
  - `check-ui-tokens.mjs`: 328 screen states (admin, traveller and guide;
    demo, real, empty, error, forms, dialogs) at 390, 768 and 1440 px in
    both themes: no overflow, no clipped text, tap targets at least 44 px on
    phones, layout shift at most 0.01, exactly one h1, every size on the
    token scale, table headers that never move, and nothing fixed at the
    bottom centre of the screen;
  - `check-console.mjs`: no console warning or error on 25 routes;
  - `check-contrast.mjs`: every colour pair meets its minimum in both themes;
  - Lighthouse on the landing page: performance at least 90, accessibility
    at least 95;
  - a bundle budget: at most 100 kB of JavaScript on a first visit, and at
    most 150 kB for every chunk together.

## Glossary

- **App shell:** the frame around every page of a signed-in area: sidebar,
  top bar and menu. Only the middle changes between pages.
- **Audit log:** an append-only table of every admin decision: who did what
  to whom, and when.
- **Bulk decision:** approving or rejecting up to 25 rows in one request,
  each still decided and logged on its own.
- **Confirm dialog:** a small window that asks "are you sure?" before a
  change that is hard to undo.
- **CSRF header:** `X-Roaamm-Csrf: 1`, sent on every write. Another site
  cannot add it, so it cannot make your browser write for you.
- **Design token:** a named value (a colour, a size) defined once and used
  everywhere, like `--sp-4` for 16 px of space.
- **Guide application:** a traveller's request to become a guide: headline,
  bio, languages and cities.
- **IDOR (insecure direct object reference):** reading someone else's data
  by changing an id in a URL. Owner-only queries and 404s prevent it.
- **Layout shift (CLS):** content jumping while a page loads. Kept at or
  below 0.01.
- **Open application:** one that is submitted or in review. Each real user
  may have at most one.
- **Partial unique index:** a database rule that is unique only for rows
  that match a condition, here "open applications of real users".
- **Role guard:** a check that lets only one role into an area and shows a
  clear "No access" page to everyone else.
- **Sample row:** a fixed simulated row for the demo, marked `is_sample`. It
  cannot be changed and is never cleaned up.
- **Scope (`is_demo`):** whether a row belongs to the demo or to real
  accounts. Admins only ever see their own scope.
- **Viewing as:** an admin opening the traveller app read-only, to see what a
  traveller sees.

## What is next

- **M5, real-time transport:** the Rust edge for chat (WebSockets, rooms,
  delivery receipts), with a web chat UI.
- **M8, safety** and **M9, guides and booking:** the Availability and
  Bookings pages that the guide app already lists turn into real features,
  with test-mode checkout.
- **Not built in M4:** the original M4 line in
  [docs/milestones.md](../milestones.md) also listed overlap matching,
  discovery with filters, connection requests and edge-cached discovery
  ("two demo users find each other by dates"). None of these were built in
  M4a to M4c; they are still open, and where they land is still to be
  decided.
- **An open question from the M4b.2 review:** a small pill at the bottom
  centre of the admin screens. A browser scan of the page found nothing that
  draws it (see note 45); its source is not verified.
