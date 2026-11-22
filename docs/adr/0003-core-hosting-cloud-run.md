# ADR 0003: Java core on Google Cloud Run

Status: accepted (deploy switched off until the first measured run)

## Context
The steady path (accounts, trips, bookings, admin) is a Java 25 / Spring Boot 4
service, compiled to a GraalVM native image. It needs a public HTTPS endpoint
at `roaamm-api.plinthwell.com`, must cost nothing at demo traffic, and should
need as little server care as possible. The earlier plan was one always-free
e2-micro VM reached through Cloudflare Tunnel.

## Decision
- Run the core on **Google Cloud Run**, region **us-central1**, scaling to
  zero when idle (`--min-instances 0`).
- Cap it at **`--max-instances 2`** so a traffic spike or a loop cannot run up
  a bill, and set a **monthly budget alert in Cloud Billing** for the project
  (`roaamm-515508`) before the first deploy.
- **Keyless deploy:** GitHub Actions gets a short-lived OIDC token and swaps it
  for Google credentials through **Workload Identity Federation**
  (`google-github-actions/auth`). No service account keys exist, in GitHub or
  anywhere else. The pool, provider and deployer service account are given to
  the workflow as repository variables (`GCP_WIF_PROVIDER`,
  `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_IMAGE_REPO`).
- **Image:** `us-central1-docker.pkg.dev/roaamm-515508/roaamm/core:<git sha>`
  in Artifact Registry, built from `services/core/Dockerfile` (native image,
  distroless runtime, non-root user, listens on `$PORT`).
- The deploy job in `.github/workflows/deploy.yml` runs only when the
  repository variable `CORE_DEPLOY_ENABLED` is `true`. It is not set yet, so
  nothing deploys.

### Public URL: `roaamm-api.plinthwell.com` through Cloudflare
Applied on 2026-11-22; see **Applied** below for how it works now. Cloud Run answers on its own
`https://roaamm-core-<hash>-uc.a.run.app` URL and checks the `Host` header, so a
plain proxied CNAME to `run.app` does not work unless the Host header is
rewritten. A Worker route does that on the free plan:

1. In Cloudflare DNS add `roaamm-api` as a proxied record (an `AAAA` to `100::`
   is enough; the Worker answers before any origin is used).
2. Deploy a tiny Worker with the route `roaamm-api.plinthwell.com/*` that
   forwards each request to the Cloud Run URL, keeping method, path, query,
   headers and body, and returns the response unchanged:
   ```js
   export default {
     fetch(req, env) {
       const url = new URL(req.url);
       url.hostname = env.CORE_HOST; // roaamm-core-<hash>-uc.a.run.app
       return fetch(new Request(url, req));
     },
   };
   ```
3. Keep `--allow-unauthenticated` for now (the public `/health` and, later,
   public pages need it). Once the Worker is the only caller, the core can
   check a shared header from the Worker, or Cloud Run ingress can be tightened.

Each request then costs one Worker invocation (free plan: 100,000 a day),
which is well above demo traffic.

## Applied (2026-11-22)
`roaamm-api.plinthwell.com` is now served by the Worker **`roaamm-api-proxy`**
(`edge-api-proxy/`), deployed by the `api-proxy` job in
`.github/workflows/deploy.yml`, which finishes before `smoke`.

- **Route:** a Worker custom domain (`[[routes]]` with `custom_domain = true`).
  Cloudflare creates the DNS record and the edge certificate itself, so the
  manual `AAAA 100::` record from step 1 above is not needed.
- **Origin:** `ORIGIN` is a plain wrangler var
  (`https://roaamm-core-563817708822.us-central1.run.app`); it is public, not a
  secret.
- **Forwarding:** method, path, query and body go to `ORIGIN`. The request is
  re-addressed to the `run.app` hostname, so Cloud Run sees its own `Host`;
  the public name goes in `X-Forwarded-Host`, plus `X-Forwarded-Proto`.
  `cf-*`, `cdn-loop` and `x-real-ip` are not forwarded. Redirects are passed
  back, not followed.
- **Response:** passed through as is. `Cache-Control: no-store` is added only
  when the origin set none.
- **CORS** is owned by the proxy: only `https://roaamm.plinthwell.com` is
  allowed (same rule as the edge `/health`), preflights are answered without
  calling the core, and any `Access-Control-*` header from the core is dropped.
- **Failure:** if the core cannot be reached or does not answer within 20 s
  (`ORIGIN_TIMEOUT_MS`), the proxy returns `502` with
  `{"error":"bad_gateway","message":"The API is unavailable."}`, never the
  underlying error.
- **No logging** of bodies or headers.
- Written in TypeScript, not Rust like `edge/`: it is ~100 lines of header
  handling, wrangler bundles it with no build step (no `worker-build`, no
  Rust toolchain in the deploy job), and it tests with plain Vitest.
- **Cold start through the proxy: UNMEASURED.** The proxy adds one Worker hop
  in front of the Cloud Run cold start described under "Not measured yet".
  Neither the hop nor the combined first-request latency has been measured.

Cloud Run's own domain mappings were not used. They are listed for
us-central1 but are still Preview and not recommended for production by
Google (latency issues), need domain verification, and do not work behind a
proxied (orange-cloud) Cloudflare record without extra care.

## Rejected
- **e2-micro VM + Cloudflare Tunnel.** Always on, so it is our job to patch
  the OS, restart Docker, rotate SSH access and watch the disk. More moving
  parts (cloudflared, Access, SSH keys in CI) for a service that is idle most
  of the day.
- **Oracle Cloud free tier.** The free tier terms have changed, idle
  instances can be reclaimed, and sign-up often fails. Not reliable enough to
  build on.

## Fallback
If measurement shows Cloud Run's free tier does not cover the demo, or cold
starts are too slow for the UI, move to the **e2-micro VM** plan (Docker +
cloudflared). The same image runs there unchanged, because it only needs
`$PORT`. That switch gets its own ADR.

## Not measured yet
- **Cold-start latency** of the native image on Cloud Run: **UNMEASURED.**
  A native image should start in well under a second, but this has not been
  measured on Cloud Run. Measure the first request after scale-to-zero, p50
  and p95 over at least 20 cold starts, before turning the deploy on for the
  demo.
- **Neon wake-up time** after its idle suspend: **UNMEASURED.** A cold Cloud
  Run instance talking to a suspended Neon database stacks both delays.
  Measure them separately and together.

## Consequences
- No server to patch; Google handles TLS on `run.app` and restarts.
- Idle cost is zero; the first request after idle pays a cold start (see
  above).
- Two instances at most: enough for the demo, and the scale-out plan in
  `docs/system-design.md` (§5.3) now means raising `--max-instances`.
- Nothing in the repo holds a cloud credential or a database connection
  string. When the database arrives, its URL goes into Secret Manager and is
  mounted into the service, never into Git.
