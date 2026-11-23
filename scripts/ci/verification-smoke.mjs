#!/usr/bin/env node
// Simulated ID verification against a running core (docs/adr/0006).
//   node scripts/ci/verification-smoke.mjs http://localhost:9090
// Demo traveller submits; demo admin lists it but cannot decide; a traveller
// on an admin endpoint is refused. Demo sessions only, no secrets.

const BASE = process.argv[2] ?? "http://localhost:9090";
const WEB = "https://roaamm.plinthwell.com";

async function call(method, path, cookie, body) {
  const headers = { Origin: WEB, "X-Roaamm-Csrf": "1", "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  const m = set && /^__Host-roaamm_session=([^;]+)/.exec(set);
  const text = await res.text();
  return {
    status: res.status,
    json: text ? JSON.parse(text) : null,
    cookie: m ? `__Host-roaamm_session=${m[1]}` : null,
  };
}

function expect(cond, what) {
  if (!cond) {
    console.error(`verification smoke FAILED: ${what}`);
    process.exit(1);
  }
}

const traveller = (await call("POST", "/v1/demo/session", null, { role: "traveller" })).cookie;
const admin = (await call("POST", "/v1/demo/session", null, { role: "admin" })).cookie;
expect(traveller && admin, "demo sessions");

const submitted = await call("POST", "/v1/verification/requests", traveller, {
  docType: "passport",
  documentNumber: "must-be-ignored",
});
expect(
  submitted.status === 200 && submitted.json.status === "pending",
  `submit ${submitted.status}`,
);
expect(/^SAMPLE-[A-Z0-9]{8}$/.test(submitted.json.sampleRef), "server-made sample reference");
expect(!JSON.stringify(submitted.json).includes("must-be-ignored"), "extra fields ignored");

const me = await call("GET", "/v1/verification/me", traveller);
expect(me.status === 200 && me.json.status === "pending", "status for the traveller");

const queue = await call("GET", "/v1/admin/verification?status=pending", admin);
expect(queue.status === 200, `demo admin queue ${queue.status}`);
const mine = queue.json.items.find((r) => r.sampleRef === submitted.json.sampleRef);
expect(mine, "demo admin sees the demo request");
expect(
  queue.json.items.some((r) => r.userDisplayName === "Sample traveller Ana"),
  "seeded sample rows",
);

const decision = await call("POST", `/v1/admin/verification/${mine.id}/decision`, admin, {
  decision: "approve",
});
expect(
  decision.status === 403 && decision.json.error === "read_only_demo",
  "demo admin cannot decide",
);

const audit = await call("GET", "/v1/admin/audit", admin);
expect(audit.status === 200 && audit.json.items.length > 0, "demo audit log");

for (const path of ["/v1/admin/verification?status=pending", "/v1/admin/audit"]) {
  const r = await call("GET", path, traveller);
  expect(r.status === 403, `traveller on ${path}: ${r.status}`);
}
const forged = await call("POST", `/v1/admin/verification/${mine.id}/decision`, traveller, {
  decision: "approve",
});
expect(forged.status === 403, "traveller cannot decide");

console.log(
  "verification smoke ok: demo submit, demo admin list, demo admin read-only, traveller refused",
);
