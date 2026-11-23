# ROAAMM: Security and End-to-End Encryption Design

> Doc 3 of 8. Principle: **the server routes and stores ciphertext, but can never read chats, call media, call setup data or shared live location.** Everything else is protected with standard, well-built web security. The limitations are written down honestly.

## 1. Goals
1. **Confidentiality of content.** Chat messages, attachments, call setup data, call media and live location can be decrypted only by the participants' devices.
2. **Integrity and authenticity.** Every message is signed by the sending device. Tampering or impersonation is detected.
3. **Forward secrecy and post-compromise security.** If a key leaks today, past messages stay safe (forward secrecy). After the group's next key update, future messages are safe again (post-compromise security).
4. **Strong accounts.** Passkeys first, no passwords stored.
5. **A hardened web client**, which limits the "the server sends the JavaScript" problem of encryption in the browser.
6. **Minimal metadata.** Note what is still visible.

Not goals: anonymity (the server knows who talks to whom), hiding traffic patterns, resisting a hostile operator who ships malicious JavaScript (partly mitigated, see §7).

## 2. Chat encryption: MLS (RFC 9420) via OpenMLS
**Why MLS:** an IETF standard (RFC 9420) built for groups that change members, efficient (TreeKEM key updates take log(n) work), gives forward secrecy and post-compromise security, and **OpenMLS** is a maintained Rust implementation that compiles to WebAssembly. Using a standard and a reviewed library is safer than writing our own Signal-style Double Ratchet. It is also stronger to defend in an interview.

**Cipher suite:** `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (suite 0x0001). Fallback: the ChaCha20-Poly1305 variant (0x0003) if needed.

**Roles (mapped to MLS terms):**
| MLS role | ROAAMM component |
|---|---|
| Client | Each browser device. Rust `roaamm-crypto` compiled to WebAssembly, running in a Web Worker. |
| **Authentication Service (AS)** | Java core. It signs a **device credential**: (user_id, device_id, Ed25519 signing key, expiry) after a passkey login. Other clients check the AS signature. |
| **Delivery Service (DS)** | Room DO. Orders and stores MLS messages, fans them out, and **can't decrypt them**. One-at-a-time execution means commits are never ordered differently for different members. |
| KeyPackage directory | KeyPackage DO (one per user). Holds each device's KeyPackages, which can each be used only once (the client keeps about 50 in stock and tops up). |

**Flows:**
- **New device:** generate an Ed25519 signing key and KeyPackages on the device → log in with a passkey → the AS signs the credential → upload the KeyPackages.
- **Start a 1:1 or group chat:** the creator fetches members' KeyPackages → creates the MLS group → Commit + Welcome go out through the Room DO.
- **Add or remove a member, or rotate keys:** a Commit goes through the Room DO, giving a new epoch with new keys. Clients send a key update at least every 24 hours or every 100 messages (post-compromise security).
- **Messages:** an MLS PrivateMessage (encrypted with a key that changes per message within the epoch). The application payload is CBOR `{type: text|image|receipt|location|call, body, client_ts}`.
- **Attachments:** encrypt the file in the browser with a random AES-256-GCM key → upload the ciphertext to R2 through a presigned URL → send `{r2_key, file_key, sha256, mime, size}` inside an MLS message.

**Multiple devices:** each device is its own MLS member (its own leaf in the tree). A user's devices are all added to their rooms.

**Key storage on the device:**
- The MLS state and keys live in **IndexedDB**, encrypted with a wrapping key held as a **non-extractable WebCrypto key**.
- **Backup:** an optional passphrase-protected backup of the device identity and group state: Argon2id (in WebAssembly) → AES-256-GCM, uploaded as an opaque blob to the core. Without the passphrase, a new device can only join new messages after an existing device or a group admin adds it.

**Checking identity (safety numbers):** each pair of users can compare a code made from both identity keys: a 60-digit number plus a QR code. A "Verified ✓" mark is shown after comparing. If a contact's identity key changes, show a warning.

## 3. Call encryption
- WebRTC already encrypts each network hop (DTLS-SRTP).
- **End-to-end:** **SFrame** (RFC 9605) applied with `RTCRtpScriptTransform` (the browser's Encoded Transform API). The key comes from the MLS exporter: `MLS-Exporter("roaamm-sframe", call_id, 32)` for the current epoch. If membership changes during a call, the epoch changes and the key rotates.
- Call setup data (offer, answer, network candidates) is sent as MLS messages, so the server can't see it.
- **TURN credentials:** issued by the Worker for each call, short-lived (10 minutes), only to members of that room.
- **Browser support:** Encoded Transform works in Chromium, Firefox and Safari. If it's unavailable, the call still has DTLS-SRTP between peers, and the UI shows "encrypted in transit" instead of "end-to-end encrypted". Never pretend.

## 4. Live location and SOS
- **Live location sharing:** coordinates are sent as MLS messages to the chosen contacts' room. The server can't see them.
- **SOS** must work even if no contact is online. **This is a deliberate trade-off, shown to the user when SOS is set up:**
  1. Location goes end-to-end encrypted to the emergency-contact room, as above.
  2. An SOS email is also sent through the core (Resend) with a **link to an SOS page**. Location data reaches the server **only during an active SOS, and only if the user agreed** when setting SOS up. It's deleted 72 hours after the SOS is resolved.
- **Check-in timer:** if a check-in is missed, the core escalates in steps: in-app reminder, then a notice to the contacts room, then the SOS email.

## 5. Accounts and sessions
Details and reasons: [ADR 0004](adr/0004-auth-sessions-m2a.md) (sessions, demo login) and [ADR 0005](adr/0005-passkeys.md) (passkeys).
- **Passkeys (WebAuthn)** are the only login for real accounts: discoverable credentials, user verification required, attestation `none`, rpId `roaamm.plinthwell.com`, origin checked against `https://roaamm.plinthwell.com` only. Challenges are single use and expire after 5 minutes.
- **Recovery codes** instead of email: 8 codes at signup, shown once, stored only as SHA-256 hashes, single use, strictly rate-limited. A recovery sign-in makes the user add a new passkey.
- **No email, phone number or IP address is stored.** Real accounts idle for 90 days are deleted.
- **Sessions:** opaque 32-byte random tokens, stored only as SHA-256 hashes in Postgres, 8 hours, in a `__Host-roaamm_session` cookie (`HttpOnly; Secure; SameSite=Lax`, host-only on `roaamm-api`). **No JWTs.** How the edge checks sessions is decided in M5.
- **Fresh check:** deleting a passkey or regenerating recovery codes needs a passkey check within the last 5 minutes. The last passkey can't be deleted without unused recovery codes.
- **Demo login** ("Try demo"): one click, a shared sandbox user per role, simulated data only. The demo admin is read-only.
- **Admin:** signup can never create an admin (refused by the API). The owner promotes their own passkey account once with a documented SQL update ([runbook](runbooks/first-admin.md)). Every admin decision is written to the append-only `admin_audit_log` (database triggers refuse update, delete and truncate). Real admins can write; the demo admin is read-only.
- **Guide role** ([ADR 0008](adr/0008-guide-applications.md)): the only way a real user's role changes in the API. A verified traveller applies; a real admin approves; the role change is its own audit row (`user.role_to_guide`). The update refuses demo users in SQL (`WHERE NOT is_demo`), so a shared demo account's role can never change, whatever the caller.
- **Trips are owner-only:** every trip query filters on the signed-in user; another user's trip id answers 404, never 403, so ids cannot be probed. Admins can list trips (title, place, dates, status) but never see trip notes, and have no trip write endpoint.

## 6. Web and API hardening (target: OWASP ASVS level 2)
- **TLS 1.3** only, HSTS with preload, all subdomains on Cloudflare.
- **CSP (strict):** `default-src 'self'`; scripts from self only, using `'wasm-unsafe-eval'` for WebAssembly; no inline scripts except the one hash-pinned landing-page preload snippet ([ADR 0007](adr/0007-landing-only-hero-preload.md)); `connect-src` limited to `roaamm-api`, `roaamm-rt` (wss), R2 and TURN; `frame-ancestors 'none'`; `require-trusted-types-for 'script'`.
- **Subresource Integrity** on all built assets. Plus `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that allows only camera, mic and geolocation on the app origin, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`.
- **CSRF:** the session cookie is SameSite=Lax, and every state-changing API request needs an exact `Origin: https://roaamm.plinthwell.com` plus the `X-Roaamm-Csrf: 1` header (ADR 0004).
- **Input:** schema validation on both sides (Zod in the browser, Bean Validation in Java). Size limits everywhere. SQL only through parameterised queries.
- **Rate limits:** per IP in the core today (demo login, passkey endpoints, a strict one for recovery codes; in memory, see ADR 0005), separate read and write budgets on `/v1/trips`, `/v1/guide` and `/v1/admin` (ADR 0008), and a global cap on real accounts. Per-user caps: 20 trips, one open guide application. Later: the Worker Rate Limiting binding on sending messages and creating rooms, and Cloudflare Turnstile on sign-up.
- **Secrets:** Wrangler secrets, GitHub Actions encrypted secrets, server environment from a root-only file. Nothing in the repo (gitleaks in CI).
- **Supply chain:** pinned dependencies, Dependabot, CodeQL, cargo-deny, OWASP Dependency-Check, actions pinned to commit SHAs.
- **Server:** the core runs on Google Cloud Run, so there is no VM, OS or SSH of ours to patch or expose. Public traffic arrives through the `roaamm-api` Cloudflare Worker, which allows CORS only from the web origin. Deploys use keyless Workload Identity Federation. Runs as a non-root user in a distroless image.
- **ID verification is simulated** ([ADR 0006](adr/0006-simulated-verification.md)): no real ID document, number or photo is ever collected or stored, only a document type and a server-made sample reference. The submit endpoint ignores any other field. Rejected requests are deleted after 30 days.

## 7. Threat model (STRIDE summary)
| Threat | Example | Mitigation | What remains |
|---|---|---|---|
| **S**poofing | Pretending to be a user or device | Passkeys, AS-signed device credentials, MLS signatures, safety numbers | Users who never compare safety numbers depend on the AS being honest |
| **T**ampering | Changing ciphertext or reordering it | MLS authenticated encryption and signatures, strict per-room order in the DS | None for content |
| **R**epudiation | Admin abuse | Append-only `admin_audit_log` (triggers block update, delete, truncate), admin passkeys | The database owner can still change rows directly |
| **I**nformation disclosure | Breach of server or database | Server holds only ciphertext and metadata, no ID documents at all (verification is simulated), TLS everywhere | **Metadata**: who talks to whom and when, room membership, IP addresses (shown only in Cloudflare logs) |
| **D**enial of service | Floods, connection storms | Cloudflare's network, rate limits, Turnstile, frame limits, jittered reconnects | Free-tier quotas can run out (shown in the UI) |
| **E**levation of privilege | Normal user reaching admin endpoints; signup creating an admin; the shared demo admin changing data; an admin of one scope reading the other; a user reading another user's trip (IDOR); a guide application turning a shared demo account into a guide | Role checks on every `/v1/admin` endpoint (403), signup refuses `admin`, demo admin read-only guard (interceptor and a second check in each admin write), **scoping**: every admin query filters on `is_demo` (demo admin sees only demo rows, real admin only real rows; other scope is 404), owner-only trip queries (404 for anyone else), the guide role update refuses demo users in SQL, tests for each role and both scope directions | A real admin is promoted by hand in the database ([runbook](runbooks/first-admin.md)) |
| **Malicious JavaScript (web E2EE limit)** | An attacker with access to the deployment ships JavaScript that leaks keys | Strict CSP, SRI, reproducible builds, **asset hashes published in GitHub releases**, a "verify this build" page comparing live asset hashes with the release, deploys only from CI with protected branches | **A hostile operator can still ship bad code.** This applies to all browser-based E2EE and is stated openly. |

## 8. Security testing
- Unit tests for the crypto wrapper (encrypt and decrypt, epoch changes, adding and removing members, rejecting messages replayed or from an old epoch).
- Automated end-to-end tests that check **the server never stores plaintext**: send a known marker string and scan Room DO storage and Postgres for it.
- An OWASP ZAP baseline scan in CI against a preview deployment.
- Authorisation tests: for each endpoint, a matrix of roles (anonymous, traveller, guide, admin, demo) and the expected outcome.
- A `SECURITY.md` with how to report vulnerabilities, and a "Security" section on the System page.
