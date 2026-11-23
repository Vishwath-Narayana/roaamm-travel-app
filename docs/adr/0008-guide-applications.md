# ADR 0008: Guide applications, the guide role change and bulk decisions (M4a)

Status: accepted (M4a). Builds on ADR 0004 (sessions, read-only demo admin),
ADR 0005 (passkeys, no admin by signup) and ADR 0006 (simulated verification,
scoped admin queue, append-only audit log).

## Context
M4 adds trips, a real admin console and a way to become a guide. Until now a
user's role was fixed at signup (traveller or guide) and only the owner's
runbook could change one (to admin). A traveller now needs a reviewed path to
become a guide. The demo must show that path too, but the shared demo
accounts must never change for everyone. Admins also need to decide many
requests at once.

## Decision

### Who may apply
- Only a **verified traveller** may apply: role `traveller` and at least one
  `verified` verification request. A guide gets `409 already_guide`, an
  admin `403`, an unverified traveller `403 not_verified`.
- **Verified is final for everyone**, including the shared demo users: a
  user with a verified request gets `409 already_verified` on a new
  submission. (Before M4a the demo users had no such check.)
- **The demo traveller is a simulated verified traveller** (seed row
  `SAMPLE-DEMOTRV1`), so "Open as Traveller" can show the guide application
  flow. The demo guide stays unverified, so the verification flow can still
  be tried as the demo guide.

### Applications
- `guide_applications`: headline (1 to 80), bio (1 to 600, line breaks
  kept), languages (1 to 5 codes from a fixed list of 24 ISO 639-1 codes),
  cities (1 to 5, each 1 to 40 letters, spaces, `-`, `'` or `.`), status,
  reviewer, decision note (1 to 300), created, reviewed and decided times,
  `is_demo`, `is_sample`. No contact details, no documents.
- Status flow: `submitted → in_review → approved | rejected`. An admin may
  also decide straight from `submitted`. A rejection needs a note; an
  approval note is optional.
- **One open application per real user** (`submitted` or `in_review`),
  enforced by a partial unique index. A rejected user may apply again.
- **Shared demo users are capped, not blocked** (as in ADR 0006): their
  visitor-made applications are trimmed to the newest 20, and are deleted
  after 24 hours. Blocking them would let one visitor lock the demo for
  everyone.
- Repeating a decision returns the application unchanged and writes no
  audit row; the opposite decision is `409 already_decided`. Review after a
  decision is `409`.

### The role change
- **Approving a real application sets `users.role = 'guide'`** in the same
  transaction, and writes a second audit row, `user.role_to_guide`, with the
  user as the target.
- The update is `WHERE id = :id AND NOT is_demo AND role = 'traveller'`.
  **A demo or sample user's role can never change**, even if a future bug
  let a demo row reach that code. Approving a demo or sample application only
  changes the application's status. Today the demo admin is read-only and a
  real admin cannot see demo rows, so no API path reaches it; a test calls the
  decision logic directly to prove the rule anyway.
- Sessions read the user's role on every request, so the new guide sees the
  guide role on their next call, with no new sign-in.

### Bulk decisions
- `POST /v1/admin/verification/bulk-decision` and
  `POST /v1/admin/guide-applications/bulk-decision`:
  `{ids, decision, note}`, **1 to 25 ids**, duplicates dropped, one shared
  note.
- **Each row is decided in its own transaction** and writes its own audit
  row, exactly like a single decision. One failing row never undoes the
  others. The response lists every row: `ok`, `changed`, the new `status`,
  or a fixed `error` code (`not_found`, `already_decided`).
- There is **no bulk delete**, and no delete for applications or
  verification requests at all.

### Admin console reads
- `GET /v1/admin/overview`: users, pending verifications, open guide
  applications and trips (with counts by status), in the admin's scope. Each
  KPI also gives the rows created in the last 30 days and the 30 days before;
  `change` is the percent change, or **null when the earlier period had
  none** (no division by zero, no invented trend).
- `GET /v1/admin/users`: filter by role and verified, search by display name
  (escaped `ILIKE`), sort, paginate. Shows display name, a short id (last 8 hex
  digits), role, verified, real or demo, created. There is no email to show.
- `GET /v1/admin/trips`: read-only, paginated, without trip notes.
- Detail views of verification requests and applications include their
  **history** from the audit log, for the admin timeline.
- Every list: at most 50 rows per page, page at most 1000, no per-row
  queries from Java. V6 adds an index for every scope filter, status filter,
  date sort and "is verified" check. The users name search (`ILIKE`) and name
  sort are not indexed: they scan one scope of the users table, which the
  300-account cap keeps to a few hundred rows.

### Limits
- Per IP, in memory, per instance (like ADR 0004): reads on `/v1/trips`,
  `/v1/guide` and `/v1/admin` 300 per 10 minutes; trip writes 30 per 10
  minutes; guide applications 5 per hour; admin writes 60 per 10 minutes (a
  bulk call counts once).
- Per user: 20 trips (real users get `409 trip_limit_reached`; demo users
  keep their newest rows), one open application.

### Trips
- Owner-only: every query filters on the signed-in user; any other trip id
  answers **404, never 403**. Admins cannot use `/v1/trips`.
- Title 1 to 80, destination 1 to 80 (city and country as letters only, up to
  three comma-separated parts), dates with end on or after start, both within
  2 years back and 3 years ahead, status `planned | ongoing | completed |
  cancelled`, notes up to 500.
- Three **sample trips** for the demo traveller cannot be changed or deleted
  (`403 sample_read_only`). The core moves their dates every 15 minutes (and
  at startup) so one stays in the past and two stay upcoming.

## Rejected
- **Letting the demo admin approve demo applications** to show the flow end
  to end: it would make the shared demo state depend on the last visitor, and
  it breaks the "demo admin is read-only" rule from ADR 0004.
- **Changing the demo traveller's role on approval:** every visitor shares that
  account, so one approval would turn "Open as Traveller" into a guide for
  everyone.
- **One transaction for a whole bulk call:** one bad row would roll back the
  good ones, and a long transaction holds one of only three pool connections.
- **Postgres array parameters from Java** for languages and cities: the values
  travel as `|`-joined text through `string_to_array`, so the native image
  needs no extra driver reflection. `|` can never pass validation.

## Consequences
- A role can now change through the API, so every approval is audited twice
  (the decision and the role change).
- The demo shows the application form and the admin queue with sample data,
  but no visitor can approve anything in the demo.
- The overview's `change` can be null; the UI must show no delta then.
