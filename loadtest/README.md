# Load test

Scripts and published reports for the 50,000-connection WebSocket test. Plan: `docs/repo-cicd-loadtest.md` section 6. Scripts arrive in M11, and they run only during the one paid Workers month with a spending limit set.

- `k6/ws-chat.js`: 50,000 virtual users in 25,000 pairs, latency measured on one clock per pair
- `k6/api-mixed.js`: the core's real limit on the e2-micro
- `reports/`: Markdown and JSON results, charts, Cloudflare screenshots, cost of the run
