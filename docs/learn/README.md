# Learn ROAAMM

This folder is for studying the project, not for running it. It explains what
was built, how each part works and what went wrong along the way. It is
written for someone who knows basic programming but is new to most of the
tools used here.

## How to use this folder

1. Read one note at a time. Each one takes about 15 minutes.
2. Open the files listed under "Key files to open" while you read. The code
   is the real source of truth; the notes only point the way.
3. Do the "Try it yourself" steps. They are safe: they read things or work
   with simulated demo data only.
4. Answer "Test yourself" before you look at the answers at the bottom.
5. When a word is new, look it up in the [glossary](glossary.md).

Where a note says **not verified**, the fact could not be confirmed from the
repository, its pull requests or its CI runs. Treat it as unknown.

## Reading order

| Order | Note | What it covers |
|---|---|---|
| 1 | [00-big-picture.md](00-big-picture.md) | The whole system today, and one request from click to dashboard |
| 2 | [glossary.md](glossary.md) | Every technical term, in one or two lines |
| 3 | [decisions-in-plain-words.md](decisions-in-plain-words.md) | Each architecture decision (ADR) in a few plain lines |
| 4 | [10-m0-foundation.md](10-m0-foundation.md) | M0: monorepo, CI/CD, hello deploys |
| 5 | [20-m1-design-system.md](20-m1-design-system.md) | M1: design tokens, components, router, landing page |
| 6 | [21-m1-5-landing-redesign.md](21-m1-5-landing-redesign.md) | M1.5: photos, image pipeline, the first console fix |
| 7 | [22-m1-6-motion-and-previews.md](22-m1-6-motion-and-previews.md) | M1.6: motion system, live previews, status row |
| 8 | [23-m1-7-ui-polish.md](23-m1-7-ui-polish.md) | M1.7: polish and accessibility fixes |
| 9 | [24-m1-8-motion-pass.md](24-m1-8-motion-pass.md) | M1.8: motion tokens, springs, frame benchmark |
| 10 | [25-m1-9-live-core-status.md](25-m1-9-live-core-status.md) | M1.9: the landing page measures the live Java core |
| 11 | [30-m2-prep-cloud-run.md](30-m2-prep-cloud-run.md) | M2-prep: Java core on Cloud Run, keyless deploys, the API proxy |
| 12 | [31-m2a-database-demo-login.md](31-m2a-database-demo-login.md) | M2a: Postgres, Flyway, cookie sessions, one-click demo |
| 13 | [32-m2b-passkeys.md](32-m2b-passkeys.md) | M2b: passkey accounts and recovery codes |
| 14 | [40-m3-verification-admin.md](40-m3-verification-admin.md) | M3: simulated ID verification, admin queue, audit log |

M1.9 was merged after M2-prep, because it needed the API proxy. It is still
listed with the other M1 notes because it is a landing page change.

## The rule: every milestone PR adds its own note

Every pull request that finishes a milestone must add or update its note in
this folder, before it is merged. The same rule is in
[docs/milestones.md](../milestones.md) and in the repository's
[CLAUDE.md](../../CLAUDE.md).

A note uses the same file name pattern (`<number>-<milestone>-<topic>.md`)
and these sections, in this order:

1. What we built and why (5 lines max)
2. How it works (a small diagram or a step list)
3. Key files to open (real paths in this repo)
4. New terms (also added to [glossary.md](glossary.md))
5. Mistakes and fixes (real ones, with the PR, commit or CI run)
6. Try it yourself (2 or 3 safe things to run or click)
7. Test yourself (3 to 5 questions, answers at the bottom)

If the milestone made an architecture decision, also add its ADR to
[decisions-in-plain-words.md](decisions-in-plain-words.md).

**No secrets, ever.** No tokens, passwords, connection strings, API keys or
personal data go in these notes, in any example or screenshot.
