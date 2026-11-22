# ROAAMM: Free Services and Setup

> Doc 5 of 8. Rule: **only free tiers that don't expire and don't sleep in ways that hurt the demo.** The one planned payment is **$5 for one month of Cloudflare Workers Paid**, used to run the 50k load test (then go back to the free plan). Limits below were checked in **November 2026**. Free tiers change, so **re-check each one at sign-up** and update this doc.

## 1. Services used

| # | Service | Used for | Free limit (Nov 2026) | Watch out for |
|---|---|---|---|---|
| 1 | **Cloudflare DNS** (`plinthwell.com`, already set up) | Subdomains, Universal SSL | Free | Use first-level subdomains only (`roaamm-api.`, not `api.roaamm.`), because the free certificate covers `*.plinthwell.com` only |
| 2 | **Cloudflare Workers** | Rust edge Worker, static web assets, `roaamm-api` proxy to the core (one invocation per API request) | 100,000 requests/day, 10 ms CPU per request. Static asset requests are free and unlimited | Going over the limit returns error 1027 until 00:00 UTC |
| 3 | **Cloudflare Durable Objects** (SQLite) | Session, Room and KeyPackage DOs, WebSockets | 100,000 requests/day, 5 GB storage per account | When a daily limit is hit, further operations fail. Use hibernation. Check how incoming WebSocket messages are counted in the pricing docs |
| 4 | **Cloudflare R2** | Encrypted attachments, sealed ID documents | ~10 GB storage, generous operations allowance, no egress fees | Use presigned URLs. Set lifecycle rules (e.g. delete ID documents after 30 days) |
| 5 | **Cloudflare Realtime (TURN/SFU)** | Call relay fallback, group calls (stretch goal) | First 1,000 GB/month free (shared by TURN and SFU). STUN `stun.cloudflare.com` is free | Short-lived TURN credentials only |
| 6 | **Cloudflare Turnstile** | Bot protection on sign-up and email codes | Free | |
| 7 | **Cloudflare Tunnel + Zero Trust (Access)** | Expose the Java core with no open ports; SSH through Access | Free (Zero Trust free plan, up to 50 users) | |
| 8 | **Workers Analytics Engine** | Latency and throughput metrics for the System page | Free daily allowance (~100k data points written/day, 10k read queries/day) | Sample metrics (e.g. 10%) to stay within the free allowance |
| 9 | **Google Cloud Compute Engine e2-micro** (always-free tier) | **Fallback only.** The core now runs on Cloud Run ([ADR 0003](adr/0003-core-hosting-cloud-run.md)); this VM plan applies if Cloud Run fails measurement | 1 e2-micro instance per month, free indefinitely (Google says limits may change). As far as known: US regions only (e.g. `us-west1`, `us-central1`, `us-east1`), 1 GB RAM, 30 GB standard disk, limited free network egress | **Check region, disk and egress limits at sign-up.** Needs a card. Set a **budget alert at $1**. Use a GraalVM native image (~100 MB RAM) |
| 10 | **Neon Postgres** | Core database, a branch per pull request | Free: 100 projects, 1 GB storage per project, 100 compute hours per project per month, autoscaling up to 2 CU | **Suspends after 5 minutes idle, and this can't be turned off on Free.** The first query after that takes ~0.5 s. Writes fail above 1 GB, so keep demo data small |
| 11 | **Resend** | Login codes, SOS and check-in emails | Free tier (about 3,000 emails/month, 100/day; **check**) | Verify a sending subdomain (`mail.plinthwell.com`) with SPF and DKIM through Cloudflare DNS |
| 12 | **Sentry** | Errors (browser, Worker, Java) | Developer plan (free, 1 user; **check** event quota) | Sample performance traces |
| 13 | **Grafana Cloud** | Logs, metrics, traces (OpenTelemetry) | Free tier (**check** current limits) | Keep log volume low; sample |
| 14 | **GitHub** (public repo) | Code, Actions CI, Container Registry, releases | Free Actions minutes for public repos; GitHub Container Registry free for public images | Load-test runners use the standard hosted runners |
| 15 | **Razorpay** (test mode) | Guide booking payments | Free (test mode only) | **Never** enable live mode. Label payments "TEST MODE" in the UI |
| 16 | **OpenFreeMap** (or another free OSM tile source) | Map tiles for live location and SOS | Free, no key (**check** fair-use policy) | Credit OpenStreetMap as required |

**Paid once:** Cloudflare **Workers Paid, $5/month** → upgrade for one month → run the 50k load test → downgrade. Before the test, **set a Workers spending limit** and billing notifications.

## 2. Rejected (don't use)
| Service | Reason |
|---|---|
| Oracle Cloud Always Free | Founder had a bad experience. Free Arm allowance halved for free-tier accounts in June 2026. Risk of idle servers being reclaimed. |
| Koyeb free | Scales to zero after 1 hour idle (can't turn it off), then a 1–5 s cold start |
| Render free | Web services sleep after ~15 min idle; the free Postgres expires |
| Supabase free | Projects pause after about a week idle |
| Railway, Fly.io, Heroku | No real free tier for an always-on app |

## 3. Setup order (one-time)
1. **GitHub:** create the public repo `Vishwath-Narayana/roaamm`. Turn on Dependabot, CodeQL, secret scanning, and branch protection on `main` (requires the `ci-ok` check). Branch protection is free on public repos, so it's actually enforced here.
2. **Cloudflare:**
   - Create an API token scoped to *Workers Scripts:Edit, Workers Routes:Edit, DNS:Edit (plinthwell.com), Account Analytics:Read*, and store it in GitHub secrets as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Create the R2 bucket `roaamm-files` with lifecycle rules.
   - Create a Turnstile widget for `roaamm.plinthwell.com`.
   - Create a Realtime TURN key.
   - Create an Analytics Engine dataset `roaamm_rt`.
   - In Zero Trust: create the tunnel `roaamm-core`, and an Access application for SSH.
   - Custom domains: `roaamm.` (web), `roaamm-rt.` (edge), `roaamm-status.` (status), `roaamm-api.` (Worker `roaamm-api-proxy` in `edge-api-proxy/` → core on Cloud Run, see [ADR 0003](adr/0003-core-hosting-cloud-run.md)). All four are Worker custom domains: `wrangler deploy` creates the DNS record and certificate, nothing is added by hand.
3. **Google Cloud:** new project `roaamm`, billing account plus a budget alert at $1. Create an e2-micro in a free-tier US region with a Debian/Ubuntu LTS image and a 30 GB standard disk. **No public firewall rules except SSH**, and close that too once the Cloudflare Access SSH path works. Install Docker and `cloudflared` (run as a service with the tunnel token). Turn on unattended-upgrades.
4. **Neon:** project `roaamm`, database `roaamm`, role `roaamm_app` (least privilege), pooled connection string in the server's environment. GitHub integration for a branch per pull request.
5. **Resend:** add the domain `mail.plinthwell.com`, add the DNS records through Cloudflare, create an API key.
6. **Sentry:** three projects (web, edge, core). **Grafana Cloud:** stack + OTLP endpoint and token.
7. **Razorpay:** test-mode key and secret, webhook secret, webhook URL `https://roaamm-api.plinthwell.com/v1/payments/razorpay/webhook`.
8. **Secrets:** store them in GitHub Actions, as Wrangler secrets (`wrangler secret put`) and in the server's `/etc/roaamm/core.env` (mode 600). **Never commit secrets.**

## 4. Staying inside free limits (demo operations)
- Demo traffic is low (recruiters browsing), far below 100k requests a day.
- **Alerts at 70%** of the daily Worker, Durable Object and Analytics Engine quotas (Cloudflare notifications), and a $1 budget alert on Google Cloud.
- Nightly cron Worker: reset demo data, purge messages older than 7 days (via Durable Object alarms), clean up R2.
- When a quota error happens, the UI shows a friendly banner ("Demo limit reached for today, resets at 05:30 IST") instead of failing silently.
- **Load tests run only during the paid month**, never on the free plan.
