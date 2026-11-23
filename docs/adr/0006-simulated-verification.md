# ADR 0006: Simulated ID verification, admin queue and audit log (M3)

Status: accepted (M3). Replaces the earlier M3 plan of uploading a mock ID
image sealed to the admins' key and stored in R2.

## Context
Travellers and guides get a "Verified" status after an admin review. This is
a portfolio demo: **all data is simulated**, and the project must never hold
anything that looks like a real identity document. Demo accounts are shared
by every visitor (ADR 0004). Real accounts are travellers and guides with
passkeys (ADR 0005).

## Decision

### Nothing real is collected
- **No real ID document, document number, photo or name is ever collected or
  stored.** A verification request records only a **document type**
  (`passport`, `national_id` or `driving_licence`) and a **server-generated
  sample reference** (`SAMPLE-` plus 8 random characters).
- The submit endpoint accepts `{docType}` and **ignores every other field**,
  so even a modified client cannot send ID data in. The table has no column
  that could hold one (tested).
- The web UI says it plainly: **"Simulated: no real ID is collected."** The
  user picks a type, clicks "Use sample ID" and confirms.

### Requests and status
- `verification_requests`: id, user, doc type, sample ref, status
  (`pending`, `verified`, `rejected`), reason (rejections only, 1 to 200
  characters, required), created/decided times, decided by, `is_demo`, and
  `is_seed` for the fixed demo rows.
- A member's status comes from their **latest** request: `none`, `pending`,
  `verified` or `rejected`. After a rejection they may submit again.
  `verified` is final.
- **Real users: at most one pending request** (unique index). Shared demo
  users cannot be held to that, because many visitors use them, so their
  visitor-made requests are capped at **50 per demo user** (oldest dropped).
- Submissions are rate limited per IP (**10 per hour**, in memory as in
  ADR 0004). Admins cannot submit (403).

### Admin model
- `/v1/admin/*` needs the **admin** role; travellers and guides get 403,
  signed-out callers 401.
- **Real admins** are never created by signup (API and ADR 0005). The owner
  promotes their own passkey account with one documented SQL update:
  [runbooks/first-admin.md](../runbooks/first-admin.md). Migration V5 relaxes
  the M2b check so that update is possible; signup still refuses `admin`.
- Real admins are **exempt from the 90-day inactivity purge**, so the owner's
  admin account does not vanish while they are away.
- **A real admin can write** (approve, reject). **The demo admin cannot**: the
  read-only guard from ADR 0004 refuses every write with
  `403 {"error":"read_only_demo"}`, while every read works.
- Decisions are **idempotent**: repeating the same decision returns the
  request unchanged and writes no second audit row; the opposite decision on a
  decided request is `409 already_decided`.

### Demo and real data never mix
- Every request and audit row has `is_demo`, copied from the user or admin.
- **The demo admin sees only `is_demo = true` rows; a real admin sees only
  `is_demo = false` rows**, in the queue, the detail view, decisions and the
  audit log. A row from the other scope is `404`, never shown. Both
  directions are tested.
- The demo queue is never empty: migration V5 seeds four **simulated sample
  people** (`users.is_sample`, demo scope only, cannot sign in) with two
  pending, one verified and one rejected request, plus two audit rows. The
  seed is idempotent and every row is marked as simulated.

### Audit log
`admin_audit_log` (id, admin user id, action, target id, time, `is_demo`) is
**append-only**: the API has no update or delete, and database triggers
refuse `UPDATE`, `DELETE` and `TRUNCATE`. `admin_user_id` has no foreign key,
so deleting an account never rewrites history. Actions:
`verification.approve`, `verification.reject`.

### Cleanup
Runs every 15 minutes while an instance is up, and the account purge also
runs on each signup:
- **Rejected** requests are deleted **30 days** after the decision.
- **Demo visitors' requests** are deleted after **24 hours**. Seed rows stay.
- The **90-day inactive real-account purge** (ADR 0005) deletes the user's
  requests too (cascade). Audit rows stay.

## Consequences
- There is no document to leak, so there is nothing to encrypt, seal or
  store in R2. The "Verified" badge means "an admin approved a simulated
  request", and the UI says so.
- Admin abuse is visible in an append-only log, but a database owner can
  still change data directly. That is accepted for a demo with one owner.
