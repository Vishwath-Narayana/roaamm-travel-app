#!/usr/bin/env node
// Trips, guide applications and the admin console against a running core
// (docs/adr/0008-guide-applications.md). Proves the new JSON types work in the
// native image. Demo sessions only, no secrets:
//   node scripts/ci/m4-smoke.mjs http://localhost:9090

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
    console.error(`m4 smoke FAILED: ${what}`);
    process.exit(1);
  }
}

const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const traveller = (await call("POST", "/v1/demo/session", null, { role: "traveller" })).cookie;
const guide = (await call("POST", "/v1/demo/session", null, { role: "guide" })).cookie;
const admin = (await call("POST", "/v1/demo/session", null, { role: "admin" })).cookie;
expect(traveller && guide && admin, "demo sessions");

// Trips: sample rows, create, update, delete, owner-only.
const list = await call("GET", "/v1/trips?when=upcoming", traveller);
expect(list.status === 200 && list.json.items.filter((t) => t.sample).length === 2, "sample trips");
const created = await call("POST", "/v1/trips", traveller, {
  title: "Smoke trip",
  destination: "Kyoto, Japan",
  startDate: day(10),
  endDate: day(12),
});
expect(
  created.status === 201 && created.json.status === "planned",
  `create trip ${created.status}`,
);
const id = created.json.id;
const patched = await call("PATCH", `/v1/trips/${id}`, traveller, { status: "cancelled" });
expect(patched.status === 200 && patched.json.status === "cancelled", "update trip");
expect((await call("GET", `/v1/trips/${id}`, guide)).status === 404, "another user's trip is 404");
const sample = list.json.items.find((t) => t.sample);
expect(
  (await call("DELETE", `/v1/trips/${sample.id}`, traveller)).status === 403,
  "sample read-only",
);
expect((await call("DELETE", `/v1/trips/${id}`, traveller)).status === 204, "delete trip");
const bad = await call("POST", "/v1/trips", traveller, { title: "x", destination: "Kyoto 9" });
expect(bad.status === 400 && bad.json.error === "invalid_destination", "trip validation");

// Guide applications: the demo traveller is a simulated verified traveller.
const before = await call("GET", "/v1/guide/application", traveller);
expect(before.status === 200 && before.json.canApply === true, "demo traveller may apply");
const applied = await call("POST", "/v1/guide/application", traveller, {
  headline: "Smoke tours",
  bio: "Simulated bio.",
  languages: ["en", "ja"],
  cities: ["Kyoto"],
});
expect(applied.status === 201 && applied.json.status === "submitted", `apply ${applied.status}`);
expect(applied.json.languages.join() === "en,ja", "languages round trip");
const guideApply = await call("POST", "/v1/guide/application", guide, {
  headline: "x",
  bio: "y",
  languages: ["en"],
  cities: ["Lima"],
});
expect(
  guideApply.status === 409 && guideApply.json.error === "already_guide",
  "guide cannot apply",
);

// Admin console: scoped reads work for the demo admin; every write is refused.
const overview = await call("GET", "/v1/admin/overview", admin);
expect(overview.status === 200 && overview.json.scope === "demo", "overview");
expect(overview.json.users.value >= 12 && "change" in overview.json.users, "overview kpis");
const users = await call("GET", "/v1/admin/users?q=applicant&sort=name_asc", admin);
expect(
  users.status === 200 && users.json.total === 5 && users.json.items[0].shortId.length === 8,
  "users",
);
const trips = await call("GET", "/v1/admin/trips?size=5", admin);
expect(trips.status === 200 && trips.json.items.length > 0, "admin trips");
const apps = await call("GET", "/v1/admin/guide-applications?status=submitted", admin);
expect(apps.status === 200 && apps.json.counts.approved >= 1, "admin applications");
const mineApp = apps.json.items.find((a) => a.headline === "Smoke tours");
expect(mineApp && !mineApp.sample, "demo visitor application listed");
const detail = await call(
  "GET",
  "/v1/admin/guide-applications/00000000-0000-4000-8000-000000000503",
  admin,
);
expect(detail.status === 200 && detail.json.history.length === 2, "application history");
for (const [path, body] of [
  [`/v1/admin/guide-applications/${mineApp.id}/review`, undefined],
  [`/v1/admin/guide-applications/${mineApp.id}/decision`, { decision: "approve" }],
  ["/v1/admin/guide-applications/bulk-decision", { ids: [mineApp.id], decision: "approve" }],
  ["/v1/admin/verification/bulk-decision", { ids: [mineApp.id], decision: "approve" }],
]) {
  const r = await call("POST", path, admin, body);
  expect(
    r.status === 403 && r.json.error === "read_only_demo",
    `demo admin write ${path}: ${r.status}`,
  );
}
const memberOnAdmin = await call("GET", "/v1/admin/overview", traveller);
expect(memberOnAdmin.status === 403, "member on admin overview");

console.log(
  "m4 smoke ok: trips, sample trips, guide application, admin overview/users/trips, demo read-only",
);
