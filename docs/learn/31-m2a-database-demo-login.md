# M2a: Database and one-click demo login

PRs [#17](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/17)
(core, proxy, deploy) and [#18](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/18)
(web), merged 2026-11-22. Measurement: [#19](https://github.com/Vishwath-Narayana/roaamm-travel-app/pull/19).
Decision: [ADR 0004](../adr/0004-auth-sessions-m2a.md).

## What we built and why

The core got a Postgres database (Neon) with Flyway migrations, three shared
demo users, and cookie sessions. `/demo` became a role picker: one click
signs you in as the demo traveller, guide or read-only admin. Dashboards at
`/app/<role>` check the session and send you back to `/demo` without one.
This is the front door: visitors can try the app with no sign-up.

## How it works

See the full walk-through in [00-big-picture.md](00-big-picture.md). In short:

1. `POST /v1/demo/session` with `{"role":"traveller"}` and the
   `X-Roaamm-Csrf: 1` header.
2. The core checks the CSRF rules and the rate limit, makes a 32-byte random
   token, stores only its SHA-256 in `sessions`, and sets the
   `__Host-roaamm_session` cookie (HttpOnly, Secure, SameSite=Lax, 8 hours).
3. `GET /v1/me` reads the cookie, hashes it, looks up the session and returns
   who you are.
4. `POST /v1/logout` deletes the row and expires the cookie.

At startup:

- `DATABASE_URL` comes from Secret Manager. A small parser
  (`DatabaseUrl`) turns it into a JDBC URL, user and password at **runtime**,
  not build time, so the native image works.
- Flyway runs `V1` (users, sessions) and `V2` (three demo users) if they have
  not run yet.
- `GET /health` never touches the database. `GET /ready` runs `SELECT 1`.

## Key files to open

- `services/core/src/main/resources/db/migration/V1__users_and_sessions.sql`,
  `V2__demo_users.sql`
- `services/core/src/main/java/com/plinthwell/roaamm/db/DatabaseUrl.java` and its test
- `services/core/src/main/java/com/plinthwell/roaamm/auth/AuthController.java`
- `.../auth/SessionTokens.java`, `.../auth/SessionCookie.java`,
  `.../auth/CsrfFilter.java`, `.../auth/ReadOnlyDemoInterceptor.java`
- `.../common/ReadyController.java`
- `scripts/ci/core-native-smoke.sh`: the native image against a throwaway
  Postgres in CI
- `apps/web/src/api/session.ts`, `apps/web/src/pages/Demo.tsx`,
  `apps/web/src/pages/app/Dashboard.tsx`
- `apps/web/public/_headers`: the CSP `connect-src` line

## New terms

Postgres, Neon, Flyway, migration, JDBC, HikariCP, connection pool, advisory
lock, PgBouncer, Secret Manager, session, cookie flags (`__Host-`, HttpOnly,
Secure, SameSite), CSRF, rate limit, Testcontainers, CSP `connect-src`,
`/ready` vs `/health`. See the [glossary](glossary.md).

## Mistakes and fixes

- **Flyway found no migrations in the native image.** CI run
  [45059800836](https://github.com/Vishwath-Narayana/roaamm-travel-app/actions/runs/45059800836)
  failed in "Native container against Postgres". The log said
  `Unable to scan location: /db/migration (unsupported protocol: resource)`,
  and the demo login returned 500 because the tables did not exist. A native
  image cannot list files inside itself the way a normal Java app can. Fix
  (commit `4a4aa9c`): the Dockerfile copies the SQL files to
  `/app/db/migration` and sets
  `SPRING_FLYWAY_LOCATIONS=filesystem:/app/db/migration`. Tests on a normal
  JVM still read them from the classpath.
- **JSON types hidden from the native build.** Controllers that return
  `ResponseEntity<?>` hide their body type from Spring's AOT step, so the
  native image did not know how to write them as JSON. Fix: register the
  DTO records with `@RegisterReflectionForBinding` (same commit).
- **A cancelled run that looked like a failure.** #17 and #18 were merged
  17 seconds apart. `ci.yml` uses `concurrency: cancel-in-progress: true`
  per branch, so the push of #18 cancelled the `main` run for #17
  ([45062357674](https://github.com/Vishwath-Narayana/roaamm-travel-app/actions/runs/45062357674)).
  `ci-ok` then showed red, because it treats `cancelled` as failed. Nothing
  was broken: the newer run tested both changes and passed. Check the job
  list for "cancelled" before you panic.
- **Cold start was a single sample.** PR #19 recorded the first cold
  `/ready` at 0.84 s and warm at 0.67 s, but ADR 0004 says plainly: one
  sample, sleep state not verified from logs. Repeat with 3 samples before
  quoting it.
- **Known limit, not a bug:** the rate limit lives in memory per instance and
  resets when Cloud Run scales to zero. ADR 0004 calls it "good enough for a
  demo, not a real defence".

## Try it yourself

1. On the live site open `/demo`, click **Open as Traveller**, then open
   DevTools > Application > Cookies for `roaamm-api.plinthwell.com`. See the
   `__Host-roaamm_session` cookie marked HttpOnly and Secure.
2. Run `curl -s https://roaamm-api.plinthwell.com/ready` and compare its
   time with `/health` (`curl -w "%{time_total}\n" -o /dev/null -s <url>`).
3. With Docker running: `cd services/core && ./gradlew test --tests '*DemoAuthTest*'`.
   Testcontainers starts a throwaway Postgres for you.

## Test yourself

1. Why does the database store a hash of the token, not the token?
2. What two things must a write request carry to pass the CSRF check?
3. Why is `/health` kept separate from `/ready`?
4. Why did Flyway work in tests but not in the native image?
5. How can a visitor tell the demo admin cannot change anything?

### Answers

1. If the database leaks, the hashes cannot be used as cookies.
2. An exact `Origin: https://roaamm.plinthwell.com` and the
   `X-Roaamm-Csrf: 1` header.
3. `/health` says the process is up even when the database is asleep;
   `/ready` checks the database too.
4. Tests run on a normal JVM that can scan classpath folders; the native
   image cannot, so the files had to ship on disk.
5. The UI says "(read-only)", and the core's interceptor refuses every
   write with `403 read_only_demo`.
