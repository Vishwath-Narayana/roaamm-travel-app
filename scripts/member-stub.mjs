// A stand-in for the core's member API (trips, guide application, ID check)
// for the traveller and guide apps (M4c). Used by scripts/ui-harness.mjs and
// scripts/check-console.mjs. Every name and row here is an obviously
// fictional sample; the demo traveller's trips match the V6 seed.
//
// Modes (the signed-in user and their data):
//   traveller          the demo traveller: 3 sample trips, verified, no application
//   traveller-real     a real traveller: 2 trips (one with notes), verified, no application
//   traveller-empty    a real traveller with no trips
//   traveller-error    a real traveller; trips and application reads fail with 503
//   app-unverified     a real traveller who is not verified yet
//   app-submitted, app-in_review, app-rejected   a real traveller's application in that state
//   app-approved       the demo traveller with an approved (demo) application
//   guide              the demo guide: no application (the app shows a labelled sample)
//   guide-real         a real guide with an approved application
//   admin-viewas       the demo admin opening the traveller app

const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const date = (n) => day(n).slice(0, 10);

export const MEMBER_MODES = new Set([
  "traveller",
  "traveller-real",
  "traveller-empty",
  "traveller-error",
  "app-unverified",
  "app-submitted",
  "app-in_review",
  "app-rejected",
  "app-approved",
  "guide",
  "guide-real",
  "admin-viewas",
]);

export function memberMe(mode) {
  if (mode === "guide") return { role: "guide", displayName: "Demo guide", isDemo: true };
  if (mode === "guide-real") return { role: "guide", displayName: "Sample guide Juno", isDemo: false };
  if (mode === "admin-viewas") return { role: "admin", displayName: "Demo admin", isDemo: true };
  if (mode === "traveller" || mode === "app-approved") return { role: "traveller", displayName: "Demo traveller", isDemo: true };
  return { role: "traveller", displayName: "Sample traveller Ines", isDemo: false };
}

const trip = (id, title, destination, s, e, status, sample, notes) => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  title,
  destination,
  startDate: date(s),
  endDate: date(e),
  status,
  ...(notes && { notes }),
  sample,
  createdAt: day(s - 30),
  updatedAt: day(s - 30),
});

export const SAMPLE_TRIPS = [
  trip(402, "Temples in autumn", "Kyoto, Japan", 21, 28, "planned", true, "Sample trip (simulated)."),
  trip(403, "Trekking in the south", "El Chalten, Argentina", 95, 106, "planned", true, "Sample trip (simulated)."),
  trip(401, "Food weekend by the river", "Lisbon, Portugal", -60, -57, "completed", true, "Sample trip (simulated)."),
];

export const REAL_TRIPS = [
  trip(601, "Coast road with friends", "Porto, Portugal", 12, 19, "planned", false, "Simulated note: book the river cruise on day two.\nBring the rain jacket."),
  trip(602, "Spring in the old town", "Prague, Czechia", -40, -36, "completed", false),
];

const application = (status) => ({
  id: "00000000-0000-4000-8000-000000000701",
  status,
  headline: "Old-town walks and river views",
  bio: "Simulated applicant. Slow walks through the old town with time for coffee and a river view at the end.",
  languages: ["en", "pt"],
  cities: ["Porto", "Lisbon"],
  createdAt: day(-6),
  ...(status !== "submitted" && { reviewedAt: day(-5) }),
  ...((status === "approved" || status === "rejected") && { decidedAt: day(-4) }),
  ...(status === "approved" && { decisionNote: "Clear plan and strong local knowledge (simulated)." }),
  ...(status === "rejected" && { decisionNote: "Please describe a typical tour and how long it lasts (simulated)." }),
});

function tripsFor(mode) {
  if (mode === "traveller" || mode === "app-approved") return SAMPLE_TRIPS;
  if (mode === "traveller-empty" || mode.startsWith("guide") || mode === "admin-viewas") return [];
  return REAL_TRIPS;
}

function counts(list) {
  const c = { total: list.length, planned: 0, ongoing: 0, completed: 0, cancelled: 0 };
  for (const t of list) c[t.status]++;
  return c;
}

/** [status, body] for a member endpoint in `mode`, or null when the path is not one. */
export function memberStub(path, params, mode) {
  if (path === "/v1/verification/me") {
    if (mode === "app-unverified") return [200, { status: "none" }];
    if (mode.startsWith("guide")) return [200, { status: "none" }];
    return [200, { status: "verified", docType: "passport", sampleRef: "SAMPLE-INES0001", createdAt: day(-30), decidedAt: day(-29) }];
  }
  if (path === "/v1/guide/application") {
    if (mode === "traveller-error") return [503, { error: "unavailable" }];
    if (mode === "guide-real") return [200, { status: "approved", canApply: false, reason: "already_guide", application: application("approved") }];
    if (mode === "guide") return [200, { status: "none", canApply: false, reason: "already_guide" }];
    if (mode === "app-unverified") return [200, { status: "none", canApply: false, reason: "not_verified" }];
    const m = /^app-(submitted|in_review|rejected|approved)$/.exec(mode);
    if (m) {
      const open = m[1] === "submitted" || m[1] === "in_review";
      return [200, { status: m[1], canApply: !open, ...(open && { reason: "already_open" }), application: application(m[1]) }];
    }
    return [200, { status: "none", canApply: true }];
  }
  if (path === "/v1/trips") {
    if (mode === "traveller-error") return [503, { error: "unavailable" }];
    const all = tripsFor(mode);
    const today = date(0);
    let list = all;
    if (params.get("when") === "upcoming") list = list.filter((t) => t.endDate >= today && (t.status === "planned" || t.status === "ongoing"));
    if (params.get("status")) list = list.filter((t) => t.status === params.get("status"));
    const q = (params.get("q") ?? "").toLowerCase();
    if (q) list = list.filter((t) => `${t.title} ${t.destination}`.toLowerCase().includes(q));
    const size = Number(params.get("size") ?? 20);
    const page = Number(params.get("page") ?? 0);
    const items = list.slice(page * size, page * size + size);
    return [200, { items, page, size, hasMore: list.length > (page + 1) * size, total: list.length, counts: counts(all), max: 20 }];
  }
  const one = /^\/v1\/trips\/([0-9a-f-]{36})$/.exec(path);
  if (one) {
    const t = tripsFor(mode).find((x) => x.id === one[1]);
    return t ? [200, t] : [404, { error: "not_found" }];
  }
  return null;
}
