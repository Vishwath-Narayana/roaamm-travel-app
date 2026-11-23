# Runbook: make the first real admin

Signup can never create an admin (ADR 0005), so the owner promotes their own
account once, by hand. Background: [ADR 0006](../adr/0006-simulated-verification.md).

**A real admin can approve and reject verification requests and every action
is written to the append-only audit log. The demo admin cannot write
anything.** A real admin sees only real requests, never demo ones.

No secrets are needed for this runbook, and none belong in it: you sign in to
the Neon console with your own account.

## 1. Sign up normally
1. Open https://roaamm.plinthwell.com/signup.
2. Choose a display name you will recognise, for example `Owner Vishwath`,
   and either role. Create the passkey and save the recovery codes.
3. Note roughly when you did it (date and time). You need it in step 2.

## 2. Find your account, then promote it (Neon SQL editor)
Open the Neon console → project `roaamm` → **SQL Editor**, on the production
branch.

First look, without changing anything. Real accounts have `is_demo = false`;
newest first:

```sql
SELECT id, display_name, role, created_at
FROM users
WHERE NOT is_demo AND display_name = 'Owner Vishwath'
ORDER BY created_at DESC;
```

Check that **exactly one** row is yours: the display name matches and
`created_at` matches when you signed up (times are UTC). If there are two
rows with the same name, pick by `created_at` and copy that row's `id`.

Then promote it inside a transaction, so nothing is saved until you say so:

```sql
BEGIN;

UPDATE users
SET role = 'admin'
WHERE id = '<paste the id from the SELECT>'
  AND NOT is_demo;

-- Neon shows "UPDATE 1". Anything else: run ROLLBACK; and start again.
SELECT id, display_name, role FROM users WHERE id = '<same id>';
```

- If it says **UPDATE 1** and the row now shows `role = admin`: run
  `COMMIT;`
- Otherwise: run `ROLLBACK;` Nothing changed.

## 3. Use it
Sign out and sign in again with your passkey. Your dashboard is now the admin
dashboard with the verification queue and the audit log.

## Revert
To make the account a normal user again (same checks, same transaction):

```sql
BEGIN;
UPDATE users SET role = 'traveller' WHERE id = '<id>' AND NOT is_demo AND role = 'admin';
-- Expect UPDATE 1, then:
COMMIT;
```

The audit rows that account wrote stay: the log is append-only.

## Notes
- Admin accounts are not deleted by the 90-day inactivity purge.
- Never promote a demo user (`is_demo = true`): the `AND NOT is_demo`
  condition stops it.
