# ROAAMM: Addendum v2 (scope changes after the first docs)

These changes extend `product-brief.md` and `milestones.md`. Where they conflict, this file wins.

## Added scope

| Feature | Decision |
|---|---|
| **AI assistant** (for example "who is free in Goa this weekend?") | In scope. Runs on Cloudflare Workers AI (free daily quota) with tool calling. The language model only turns the question into a structured filter. Code resolves dates such as "this weekend", runs SQL over trips and availability, and the model words the answer. If the quota runs out, a rule-based parser answers instead. The assistant reads discovery data only, never encrypted chats. |
| **Voice notes in chat** | In scope. Recorded with `MediaRecorder`, encrypted in the browser with AES-256-GCM, uploaded to R2, key sent inside an MLS message (same path as image attachments). Part of M6. |
| **Hourly guide booking** | In scope. `guides.hourly_rate`, an hours picker, price = rate x hours, Razorpay test mode. Part of M9. |
| **Stories** (trip blog posts, guide posts, guide reviews with photos) | In scope. Public content, so not end-to-end encrypted. Markdown sanitised on input and output. Photos resized in the browser, uploaded to R2 through presigned URLs. Reviews only from completed bookings. Guides can reply. Reports go to the admin queue. New milestone M9.7. |
| **Three dashboards** | Traveller, guide and admin, from the existing WEB, GD and ADM designs. |
| **Large dummy data set** | About 2,000 travellers, 150 guides, 5,000 trips in 40 cities, 800 bookings, 300 posts, 600 reviews. All labelled "simulated data" in the UI and the README. New milestone M4.5. |
| **Recruiter demo** | Try demo offers three role buttons (traveller, guide, admin). Each visitor gets a private sandbox account cloned from a template, reset nightly. |

## Claims

- Say "low-latency calls", never "no lag" or "zero lag".
- The real-time engine is real. The users and content are simulated, and the product says so.

## Updated milestone order

M0, M1, M2, M3, M4, **M4.5 seed data**, M5, M6 (with voice notes), M7, M8, M9 (with hourly booking), **M9.7 Stories**, **M9.5 AI assistant**, M10, M11, M12.

If time gets tight, cut group calls and the soak test first. Stories and the AI assistant stay.

## Risks recorded

1. Workers AI free quota can run out during a recruiter spike. The rule-based fallback and a UI banner handle it.
2. Image upload abuse: Turnstile, rate limits, verified users only, magic-byte type checks, 5 photos of at most 5 MB per post.
3. Seed photos must come from licence-free sources (Unsplash, Pexels) with credit.
4. Shared demo identity and end-to-end encryption: use per-visitor sandbox accounts cloned from a template.
5. The repository is `Vishwath-Narayana/roaamm-travel-app`, not `roaamm` as the first docs say. Keep the name `roaamm-travel-app`.
