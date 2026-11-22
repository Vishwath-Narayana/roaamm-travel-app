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
Documented here, **not applied yet**. Cloud Run answers on its own
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
