# ADR 0005: Real accounts with passkeys (M2b)

Status: accepted (M2b). Builds on ADR 0004 (opaque cookie sessions, CSRF,
demo login). Demo login stays the front door and is unchanged.

## Context
M2a shipped one-click demo accounts. M2b adds real accounts without
passwords, email or phone numbers. The web app is
`https://roaamm.plinthwell.com`; the API is `https://roaamm-api.plinthwell.com`,
a different subdomain, behind the proxy Worker and on Cloud Run as a GraalVM
native image.

The earlier plan in `docs/security.md` (Ed25519 JWT access tokens, rotating
refresh cookie, email one-time codes) is **dropped**. Sessions stay the opaque
cookie sessions of ADR 0004 for real users too.

## Decision

### Library: webauthn4j-core 0.32
| Candidate | Extra runtime dependencies | Native image |
|---|---|---|
| **webauthn4j-core 0.32** | `jackson-dataformat-cbor` only (Jackson 3, same as Spring Boot 4; BouncyCastle optional) | Works with reflection hints (below), proven in CI |
| Yubico java-webauthn-server 2.x | Jackson 2 (a second Jackson), Guava, a CBOR library, httpclient5 | Not tried: more to register, two Jacksons |
| Spring Security WebAuthn | All of Spring Security (filter chain) **plus** webauthn4j | Not tried: same verifier underneath, much more framework |

webauthn4j ships no native-image metadata. `WebAuthnRuntimeHints` registers
every `com.webauthn4j` type for reflection at AOT build time, so Jackson can
read client data, CBOR attestation objects and COSE keys in the native
binary. CI proves it: `scripts/ci/core-native-smoke.sh` runs the native image
next to a throwaway Postgres and `scripts/ci/passkey-smoke.mjs` does a full
register, login, logout and recovery round trip with a software
authenticator, plus an admin-signup refusal and a wrong-origin refusal.

### Passkeys only
- **Discoverable credentials** (`residentKey: required`), **user verification
  required**, **attestation `none`**. Algorithms: ES256, EdDSA, RS256.
- **rpId** `roaamm.plinthwell.com`. **Expected origin** exactly
  `https://roaamm.plinthwell.com`, checked against `clientDataJSON`. The API
  host is never an accepted origin.
- Responses without the UV flag are refused.
- **Sign count:** a count of 0 is fine (synced passkeys always report 0), and
  an unchanged count is fine. A sign-in fails only when the count goes **down**
  from a stored value above 0.
- The server cannot verify that a credential is really discoverable; it asks
  for one and relies on the browser. Sign-in uses discoverable credentials
  with no `allowCredentials`, so a non-discoverable key simply cannot sign in.

### Challenges
32 random bytes, stored server side with a purpose (`register`, `login`,
`add`, `reauth`), **5 minute** expiry, **single use**. A challenge is deleted
when it is checked, **before** any account transaction, so a failed check
still uses it up. `add` and `reauth` challenges are bound to the session
that asked for them. Expired challenges are purged every 15 minutes and on
each signup.

### What is stored
- **users** (real): display name (1 to 40 characters, trimmed, whitespace
  collapsed, no `< > & " \``, no control or format characters), role
  (**traveller or guide only**), a random **64-byte user handle**,
  `last_active_at`.
- **webauthn_credentials:** credential id, COSE public key, AAGUID, sign
  count, transports, backup-eligible and backup-state flags, created and last
  used times, optional label.
- **recovery_codes:** SHA-256 hashes only.
- **No email, phone number or IP address.** A database constraint refuses a
  real user with the admin role: **admin can never be created through
  signup.** *Update (M3, ADR 0006):* migration V5 relaxes that constraint so
  the owner can promote their own account with the documented runbook; the
  API still refuses `admin` at signup.

### Recovery codes
8 codes at signup, 16 characters each from `23456789ABCDEFGHJKMNPQRSTWXYZ`
(no 0/O, 1/I/L, U/V), shown as `XXXX-XXXX-XXXX-XXXX` **once**. Stored as
SHA-256 (each code has about 78 bits of entropy, so a slow hash adds
nothing). Single use. A code signs the user in with `needsNewPasskey: true`;
the web then makes them add a passkey, which clears the flag.
Regenerating replaces all codes.

### No user enumeration
Sign-in has no username step. Errors are generic: `passkey_not_accepted`
for any failed passkey check, `recovery_code_not_accepted` for any failed
code, `challenge_expired` for a missing, used, expired or wrong-purpose
challenge.

### Limits
- Per client IP (in memory, per instance, resets on restart as in ADR 0004):
  **30** passkey calls per 10 minutes; **5** recovery attempts per hour.
- **Global cap on real accounts**, default **300**
  (`roaamm.passkey.max-real-accounts`). At the cap, signup returns
  `503 {"error":"signups_paused"}` and the web says signups are paused and
  points to the demo.
- At most 20 live sessions per real user.

### Sessions and CSRF
Real users get the same `__Host-roaamm_session` cookie and CSRF rules as
ADR 0004. A passkey sign-in or signup marks the session **fresh**; a
recovery-code sign-in does not. **Deleting a passkey and regenerating
recovery codes need a passkey check within the last 5 minutes**
(`/v1/me/reauth/options` and `/verify`). The last passkey can be deleted
only while unused recovery codes exist.

Real users can write. The demo admin stays read-only. `/v1/auth/*` is open to
a demo session (it creates or signs into a different account and replaces
the demo session); `/v1/me/credentials` and the other account endpoints
refuse demo users with 403. As a second line of defence, migration V4 adds
database triggers that refuse any passkey or recovery code whose owner is a
demo user, so the shared demo accounts can never hold one.

### Cleanup
Real accounts with no sign-in for **90 days** are deleted, with their
passkeys, codes and sessions. Demo users are never touched. The web privacy
note says so.

## API
All under `/v1`, JSON, generic errors, no stack traces. Challenges,
credentials, recovery codes and tokens are never logged.

| Method and path | Purpose |
|---|---|
| `POST /auth/register/options` `{displayName, role}` | Creation options and a `challengeId` |
| `POST /auth/register/verify` `{challengeId, credential}` | Creates the account and session; returns `recoveryCodes` once |
| `POST /auth/login/options` | Request options for a discoverable passkey |
| `POST /auth/login/verify` `{challengeId, credential}` | Session cookie |
| `POST /auth/recovery` `{code}` | Session cookie, `needsNewPasskey: true` |
| `GET /me` | `isDemo: false` and `needsNewPasskey` for real users; demo response unchanged |
| `GET /me/credentials` | Passkeys and the number of unused recovery codes |
| `POST /me/credentials/options`, `/verify` `{challengeId, credential, label?}` | Add a passkey |
| `DELETE /me/credentials/{id}` | Needs a fresh check; never the last one without codes |
| `POST /me/reauth/options`, `/verify` | The fresh passkey check |
| `POST /me/recovery-codes/regenerate` | Needs a fresh check |

## Not decided here
- How the Rust edge checks a signed-in user for WebSockets (M5). ADR 0004
  already leaves moving sessions to the edge for later; there are no JWTs to
  check.
- Admin accounts for real operators. There is no way to create one; that
  arrives with the admin features, with its own ADR.
