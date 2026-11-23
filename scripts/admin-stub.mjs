// A stand-in for the core's admin API, signed in as the demo admin, with the
// same simulated sample data the V6 seed creates. Used by check-console.mjs
// (and for screenshots) so the admin console renders without a live core.
// Every name here is an obviously fictional sample.

const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const date = (n) => day(n).slice(0, 10);
const ADMIN = "Demo admin";

const VERIFICATIONS = [
  ["00000000-0000-4000-8000-000000000201", "Sample traveller Ana", "traveller", "passport", "SAMPLE-ANA00001", "pending", -0.1],
  ["00000000-0000-4000-8000-000000000202", "Sample guide Kofi", "guide", "driving_licence", "SAMPLE-KOFI0002", "pending", -0.04],
  ["00000000-0000-4000-8000-000000000301", "Sample traveller Ivo", "traveller", "national_id", "SAMPLE-IVO00031", "pending", -1.2],
  ["00000000-0000-4000-8000-000000000203", "Sample traveller Mei", "traveller", "national_id", "SAMPLE-MEI00003", "verified", -3],
  ["00000000-0000-4000-8000-000000000205", "Demo traveller", "traveller", "passport", "SAMPLE-DEMOTRV1", "verified", -30],
  ["00000000-0000-4000-8000-000000000204", "Sample guide Lucas", "guide", "passport", "SAMPLE-LUCAS004", "rejected", -4],
].map(([id, name, role, doc, ref, status, d]) => ({
  id,
  userDisplayName: name,
  userRole: role,
  docType: doc,
  sampleRef: ref,
  status,
  createdAt: day(d),
  ...(status !== "pending" && { decidedAt: day(d + 1), decidedBy: ADMIN }),
  ...(status === "rejected" && { reason: "Sample image was blurred (simulated)." }),
}));

const APPS = [
  ["00000000-0000-4000-8000-000000000501", "Rook", "submitted", "Sample: old-town walks and night markets", ["Lisbon", "Porto"], ["en", "pt"], -1],
  ["00000000-0000-4000-8000-000000000505", "Sol", "submitted", "Sample: coastal cycling and village cafes", ["Nice", "Genoa"], ["en", "fr", "it"], -0.2],
  ["00000000-0000-4000-8000-000000000502", "Wren", "in_review", "Sample: mountain day hikes for first-timers", ["Cusco"], ["en", "es"], -3],
  ["00000000-0000-4000-8000-000000000503", "Moss", "approved", "Sample: temple mornings and tea houses", ["Kyoto", "Nara"], ["en", "ja"], -10],
  ["00000000-0000-4000-8000-000000000504", "Pip", "rejected", "Sample: city tours", ["Berlin"], ["en"], -12],
].map(([id, who, status, headline, cities, languages, d]) => ({
  id,
  applicantId: id.replace("0005", "0001"),
  applicant: `Sample applicant ${who}`,
  applicantRole: "traveller",
  applicantVerified: true,
  status,
  headline,
  bio: "Simulated applicant. Plans relaxed tours with plenty of breaks.",
  languages,
  cities,
  createdAt: day(d),
  sample: true,
  ...(status !== "submitted" && { reviewer: ADMIN, reviewedAt: day(d + 1) }),
  ...((status === "approved" || status === "rejected") && { decidedAt: day(d + 2) }),
  ...(status === "approved" && { decisionNote: "Sample: clear plan and strong local knowledge (simulated)." }),
  ...(status === "rejected" && { decisionNote: "Sample: please describe your tours in more detail (simulated)." }),
}));

const USERS = [
  ["Demo traveller", "traveller", true, false, -60],
  ["Demo guide", "guide", false, false, -60],
  [ADMIN, "admin", false, false, -60],
  ["Sample traveller Ana", "traveller", false, true, -40],
  ["Sample guide Kofi", "guide", false, true, -38],
  ["Sample traveller Mei", "traveller", true, true, -35],
  ["Sample guide Lucas", "guide", false, true, -33],
  ["Sample applicant Rook", "traveller", true, true, -20],
  ["Sample applicant Wren", "traveller", true, true, -25],
  ["Sample applicant Moss", "traveller", true, true, -40],
  ["Sample applicant Pip", "traveller", true, true, -45],
  ["Sample applicant Sol", "traveller", true, true, -8],
].map(([displayName, role, verified, sample, d], i) => {
  const id = `00000000-0000-4000-8000-${String(900 + i).padStart(12, "0")}`;
  return { id, shortId: id.replace(/-/g, "").slice(-8), displayName, role, verified, demo: true, sample, createdAt: day(d) };
});

const TRIPS = [
  ["00000000-0000-4000-8000-000000000401", "Food weekend by the river", "Lisbon, Portugal", -60, -57, "completed"],
  ["00000000-0000-4000-8000-000000000402", "Temples in autumn", "Kyoto, Japan", 21, 28, "planned"],
  ["00000000-0000-4000-8000-000000000403", "Trekking in the south", "El Chalten, Argentina", 95, 106, "planned"],
].map(([id, title, destination, s, e, status]) => ({
  id,
  title,
  destination,
  startDate: date(s),
  endDate: date(e),
  status,
  owner: "Demo traveller",
  sample: true,
  createdAt: day(-20),
}));

const HISTORY = {
  "00000000-0000-4000-8000-000000000502": [{ action: "guide_application.review", admin: ADMIN, at: day(-2) }],
  "00000000-0000-4000-8000-000000000503": [
    { action: "guide_application.review", admin: ADMIN, at: day(-9) },
    { action: "guide_application.approve", admin: ADMIN, at: day(-8) },
  ],
  "00000000-0000-4000-8000-000000000504": [
    { action: "guide_application.review", admin: ADMIN, at: day(-11) },
    { action: "guide_application.reject", admin: ADMIN, at: day(-10) },
  ],
};

const AUDIT = [
  ["verification.approve", "verification", "00000000-0000-4000-8000-000000000203", "Sample traveller Mei", -2],
  ["guide_application.review", "guide_application", "00000000-0000-4000-8000-000000000502", "Sample applicant Wren", -2],
  ["verification.reject", "verification", "00000000-0000-4000-8000-000000000204", "Sample guide Lucas", -3],
  ["guide_application.approve", "guide_application", "00000000-0000-4000-8000-000000000503", "Sample applicant Moss", -8],
  ["guide_application.reject", "guide_application", "00000000-0000-4000-8000-000000000504", "Sample applicant Pip", -10],
].map(([action, targetType, targetId, target, d], i) => ({
  id: `00000000-0000-4000-8000-${String(700 + i).padStart(12, "0")}`,
  admin: ADMIN,
  action,
  targetType,
  targetId,
  target,
  createdAt: day(d),
}));

const kpi = (value, last30, prev30) => ({
  value,
  last30,
  prev30,
  change: prev30 > 0 ? Math.round(((last30 - prev30) * 1000) / prev30) / 10 : null,
});

function count(list, key) {
  const c = {};
  for (const x of list) c[x[key]] = (c[x[key]] ?? 0) + 1;
  return c;
}

function paged(items, params, extra = {}) {
  const size = Math.min(50, Number(params.get("size") ?? 20));
  const page = Number(params.get("page") ?? 0);
  const slice = items.slice(page * size, page * size + size);
  return { items: slice, page, size, hasMore: items.length > (page + 1) * size, total: items.length, ...extra };
}

const match = (q, ...fields) => !q || fields.some((f) => f.toLowerCase().includes(q.toLowerCase()));

/** The JSON the core would answer the demo admin, or null for an unknown path. */
export function adminStub(path, params) {
  if (path === "/v1/admin/overview") {
    return {
      scope: "demo",
      users: kpi(USERS.length, 6, 4),
      pendingVerifications: kpi(3, 3, 0),
      pendingGuideApplications: kpi(3, 5, 2),
      trips: kpi(3, 1, 1),
      tripsByStatus: { planned: 2, ongoing: 0, completed: 1, cancelled: 0 },
      generatedAt: day(0),
    };
  }
  if (path === "/v1/admin/verification") {
    const status = params.get("status") ?? "pending";
    const q = params.get("q");
    const items = VERIFICATIONS.filter((v) => v.status === status && match(q, v.userDisplayName));
    return { items, page: 0, hasMore: false, counts: { pending: 0, verified: 0, rejected: 0, ...count(VERIFICATIONS, "status") } };
  }
  const vDetail = /^\/v1\/admin\/verification\/([\w-]+)$/.exec(path);
  if (vDetail) {
    const v = VERIFICATIONS.find((x) => x.id === vDetail[1]) ?? VERIFICATIONS[0];
    const history = v.status === "pending" ? [] : [{ action: `verification.${v.status === "verified" ? "approve" : "reject"}`, admin: ADMIN, at: v.decidedAt }];
    return { ...v, history };
  }
  if (path === "/v1/admin/guide-applications") {
    const status = params.get("status");
    const items = APPS.filter((a) => !status || a.status === status);
    const counts = { submitted: 0, in_review: 0, approved: 0, rejected: 0, ...count(APPS, "status"), total: APPS.length };
    return paged(items, params, { counts });
  }
  const aDetail = /^\/v1\/admin\/guide-applications\/([\w-]+)$/.exec(path);
  if (aDetail) {
    const a = APPS.find((x) => x.id === aDetail[1]) ?? APPS[0];
    return { ...a, history: HISTORY[a.id] ?? [] };
  }
  if (path === "/v1/admin/users") {
    const q = params.get("q");
    const role = params.get("role");
    const verified = params.get("verified");
    const items = USERS.filter(
      (u) => match(q, u.displayName) && (!role || u.role === role) && (!verified || String(u.verified) === verified),
    );
    return paged(items, params);
  }
  if (path === "/v1/admin/trips") {
    const q = params.get("q");
    const status = params.get("status");
    return paged(TRIPS.filter((t) => match(q, t.title, t.destination, t.owner) && (!status || t.status === status)), params);
  }
  if (path === "/v1/admin/audit") return { items: AUDIT, page: 0, hasMore: false };
  return null;
}
