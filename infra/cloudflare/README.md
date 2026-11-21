# Cloudflare settings that are not in code

Dashboard configuration for ROAAMM. Keep this list current. The full checklist with exact steps is in `docs/free-services.md` section 3.

| Item | Value |
|---|---|
| Zone | `plinthwell.com` (already on Cloudflare) |
| Custom domains | `roaamm.`, `roaamm-rt.`, `roaamm-status.` (Workers custom domains, created by `wrangler deploy`), `roaamm-api.` (tunnel public hostname to `http://core:8080`) |
| R2 bucket | `roaamm-files` with lifecycle rules (ID documents deleted after 30 days) |
| Turnstile | widget for `roaamm.plinthwell.com` |
| Realtime TURN | one key |
| Analytics Engine | dataset `roaamm_rt` |
| Zero Trust | tunnel `roaamm-core`, Access application for SSH |
| API token | Workers Scripts:Edit, Workers Routes:Edit, DNS:Edit (plinthwell.com), Account Analytics:Read |
| Notifications | alert at 70% of daily Worker, Durable Object and Analytics Engine quotas |
