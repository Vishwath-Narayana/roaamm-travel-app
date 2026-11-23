import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearAdminCache } from "../api/admin";
import { mockApi } from "../test/webauthn";
import { AdminApp } from "./AdminApp";

const DEMO_ME = { role: "admin", displayName: "Demo admin", isDemo: true };
const REAL_ME = { role: "admin", displayName: "Sample owner Ada", isDemo: false };

const kpi = (value: number, change: number | null) => ({
  value,
  last30: 2,
  prev30: change === null ? 0 : 1,
  change,
});
const OVERVIEW = {
  scope: "demo",
  users: kpi(12, 50),
  pendingVerifications: kpi(3, null),
  pendingGuideApplications: kpi(2, -25),
  trips: kpi(3, 0),
  tripsByStatus: { planned: 2, ongoing: 0, completed: 1, cancelled: 0 },
  generatedAt: "2026-11-23T00:00:00Z",
};

const req = (id: string, name: string, status = "pending") => ({
  id,
  userDisplayName: name,
  userRole: "traveller",
  docType: "passport",
  sampleRef: "SAMPLE-ABCD1234",
  status,
  createdAt: "2026-11-20T08:00:00Z",
});
const QUEUE = {
  items: [req("a1", "Sample traveller Ana"), req("a2", "Sample guide Kofi")],
  page: 0,
  hasMore: false,
  counts: { pending: 2, verified: 5, rejected: 1 },
};
const AUDIT = [
  {
    id: "e1",
    admin: "Demo admin",
    action: "verification.approve",
    targetType: "verification",
    targetId: "a9",
    target: "Sample traveller Mei",
    createdAt: "2026-11-21T08:00:00Z",
  },
];
const EMPTY_APPS = {
  items: [],
  page: 0,
  size: 5,
  hasMore: false,
  total: 0,
  counts: { submitted: 0, in_review: 0, approved: 0, rejected: 0, total: 0 },
};

function at(path: string) {
  window.history.replaceState(null, "", path);
  return render(<AdminApp path={path.split("?")[0]!} />);
}

describe("AdminApp", () => {
  beforeEach(() => clearAdminCache());
  afterEach(() => vi.restoreAllMocks());

  it("shows the shell, the scope chip, absolute KPI changes and recent activity", async () => {
    mockApi({
      "/v1/me": [[200, DEMO_ME]],
      "/v1/admin/overview": [
        [200, { ...OVERVIEW, trips: { value: 3, last30: 0, prev30: 1, change: -100 } }],
      ],
      "/v1/admin/verification": [[200, QUEUE]],
      "/v1/admin/guide-applications": [[200, EMPTY_APPS]],
      "/v1/admin/audit": [[200, { items: AUDIT, page: 0, hasMore: false }]],
    });
    at("/app/admin");
    // The shell is there from the first frame; the scope chip appears once the session is known.
    expect(screen.getByRole("link", { name: "ROAAMM Admin, overview" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking your session…");
    expect(await screen.findByText("Demo (simulated)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Overview$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Coming soon items are labelled and are not links.
    expect(screen.getByText("M8")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Safety/ })).toBeNull();

    const kpis = await screen.findByRole("list", { name: "Key numbers" });
    await waitFor(() => expect(within(kpis).getByText("12")).toBeInTheDocument());
    const cards = within(kpis).getAllByRole("listitem");
    // Absolute counts, never percentages; growth is green, queues stay neutral.
    expect(cards[0]!.querySelector(".adm-delta")).toHaveTextContent("+2 in 30 days");
    expect(cards[0]!.querySelector(".adm-delta")).toHaveClass("adm-delta--good");
    expect(cards[1]!.querySelector(".adm-delta")).toHaveTextContent("+2 in 30 days");
    expect(cards[1]!.querySelector(".adm-delta")).toHaveClass("adm-delta--neutral");
    expect(cards[3]!.querySelector(".adm-delta")).toHaveTextContent("None new in 30 days");
    expect(kpis).not.toHaveTextContent("%");
    expect(cards[1]).toHaveTextContent("vs 0 in the previous 30 days");
    expect(await screen.findByText("No open applications.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sample traveller Ana/ })).toHaveAttribute(
      "href",
      "/app/admin/verification?id=a1",
    );
    // Recent activity: the latest audit entries, each opening its subject's drawer.
    const recent = screen.getByRole("region", { name: "Recent activity" });
    const entry = await within(recent).findByRole("link", { name: /Approved verification/ });
    expect(entry).toHaveAttribute("href", "/app/admin/verification?id=a9");
    expect(entry).toHaveTextContent("Sample traveller Mei");
  });

  it("the demo admin can read everything; actions stay visible but unavailable, with one page-level note", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      "/v1/me": [[200, DEMO_ME]],
      "/v1/admin/verification": [[200, QUEUE]],
      "/v1/admin/verification/a1": [[200, { ...req("a1", "Sample traveller Ana"), history: [] }]],
    });
    at("/app/admin/verification?id=a1");
    expect(await screen.findByRole("note")).toHaveTextContent("Demo, read-only.");
    await screen.findByText("Sample guide Kofi");
    // One indicator for the page, not one per row.
    expect(screen.queryAllByText("Demo is read-only")).toHaveLength(0);
    // The selection column is there (same alignment as a real admin's), but disabled.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBe(3);
    for (const b of boxes) {
      expect(b).toHaveAttribute("aria-disabled", "true");
      expect(b).toHaveAccessibleDescription("Demo is read-only");
    }
    await user.click(boxes[1]!);
    expect(boxes[1]).not.toBeChecked();
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();

    const dialog = await screen.findByRole("dialog", { name: "Sample traveller Ana" });
    const approve = await within(dialog).findByRole("button", { name: "Approve" });
    expect(approve).toHaveAttribute("aria-disabled", "true");
    expect(approve).toHaveAccessibleDescription("Demo is read-only");
    await user.click(approve);
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
    expect(within(dialog).getByRole("button", { name: "Reject…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("a real admin bulk-approves selected rows and sees every row's result", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      "/v1/me": [[200, REAL_ME]],
      "/v1/admin/verification": [[200, QUEUE]],
      "/v1/admin/verification/bulk-decision": [
        [
          200,
          {
            decision: "approve",
            succeeded: 1,
            failed: 1,
            results: [
              { id: "a1", ok: true, changed: true, status: "verified", error: null },
              { id: "a2", ok: false, changed: false, status: null, error: "already_decided" },
            ],
          },
        ],
      ],
    });
    at("/app/admin/verification");
    expect(await screen.findByText("Real accounts")).toBeInTheDocument();
    await user.click(
      await screen.findByRole("checkbox", { name: "Select every row on this page" }),
    );
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(bar).toHaveTextContent("2 selected");
    await user.click(within(bar).getByRole("button", { name: "Approve 2" }));
    const results = await screen.findByRole("region", { name: "Bulk action results" });
    expect(results).toHaveTextContent("1 done, 1 failed");
    expect(results).toHaveTextContent("Sample traveller Ana");
    expect(results).toHaveTextContent("Failed: Already decided the other way");
    const bulk = calls.find((c) => c.path.endsWith("/bulk-decision"))!;
    expect(JSON.parse(String(bulk.init?.body))).toEqual({ ids: ["a1", "a2"], decision: "approve" });
    // The list is refetched after the change (the cache was cleared).
    expect(calls.filter((c) => c.path === "/v1/admin/verification").length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("shows the board with four labelled columns and moves a card from the keyboard", async () => {
    const user = userEvent.setup();
    const app = {
      id: "g1",
      applicantId: "u1",
      applicant: "Real applicant Bo",
      applicantRole: "traveller",
      applicantVerified: true,
      status: "submitted",
      headline: "Night food walks",
      bio: "Simulated.",
      languages: ["en"],
      cities: ["Lisbon", "Porto"],
      createdAt: "2026-11-20T08:00:00Z",
      sample: false,
    };
    const counts = { submitted: 1, in_review: 0, approved: 0, rejected: 0, total: 1 };
    const list = (items: unknown[]) => ({
      items,
      page: 0,
      size: 50,
      hasMore: false,
      total: items.length,
      counts,
    });
    const { calls } = mockApi({
      "/v1/me": [[200, REAL_ME]],
      "/v1/admin/guide-applications": [
        [200, list([app])],
        [200, list([])],
        [200, list([])],
        [200, list([])],
        [200, list([])],
      ],
      "/v1/admin/guide-applications/g1/review": [[200, { ...app, status: "in_review" }]],
    });
    at("/app/admin/guide-applications");
    for (const name of ["Submitted", "In review", "Approved", "Rejected"]) {
      expect(await screen.findByRole("region", { name })).toBeInTheDocument();
    }
    const card = await screen.findByRole("article", { name: "Night food walks" });
    expect(within(card).getByText("Lisbon")).toBeInTheDocument();
    within(card)
      .getByRole("button", { name: /Move to…/ })
      .focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByText("Real applicant Bo: moved to In review.")).toBeInTheDocument();
    expect(
      calls.some(
        (c) => c.path === "/v1/admin/guide-applications/g1/review" && c.init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("caches each list for 30 seconds across screens", async () => {
    const { calls } = mockApi({
      "/v1/me": [[200, REAL_ME]],
      "/v1/admin/audit": [[200, { items: [], page: 0, hasMore: false }]],
    });
    const first = at("/app/admin/audit");
    expect(await screen.findByText("No admin actions yet.")).toBeInTheDocument();
    first.unmount();
    at("/app/admin/audit");
    expect(await screen.findByText("No admin actions yet.")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/v1/admin/audit")).toHaveLength(1);
  });

  it("maps 403 and 429 to plain words with a retry, and shows loading skeletons first", async () => {
    const user = userEvent.setup();
    mockApi({
      "/v1/me": [[200, REAL_ME]],
      "/v1/admin/users": [
        [403, { error: "forbidden" }],
        [429, { error: "rate_limited" }, { "retry-after": "30" }],
        [200, { items: [], page: 0, size: 20, hasMore: false, total: 0 }],
      ],
    });
    at("/app/admin/users");
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Slow down, try again in a moment.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No users with these filters.")).toBeInTheDocument();
  });

  it("renders skeleton rows while a table loads", async () => {
    mockApi({ "/v1/me": [[200, REAL_ME]] });
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      if (String(input).endsWith("/v1/me"))
        return new Response(JSON.stringify(REAL_ME), { status: 200 });
      return new Promise<Response>(() => {});
    });
    const { container } = at("/app/admin/trips");
    await screen.findByRole("heading", { level: 1, name: "Trips" });
    expect(container.querySelectorAll(".adm-skeleton-row").length).toBeGreaterThan(0);
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  });

  it("sends a 401 to the sign-in page and other roles to their dashboard", async () => {
    mockApi({ "/v1/me": [[401, { error: "unauthenticated" }]] });
    at("/app/admin");
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    vi.restoreAllMocks();

    mockApi({
      "/v1/me": [[200, { role: "traveller", displayName: "Demo traveller", isDemo: true }]],
    });
    at("/app/admin/users");
    await waitFor(() => expect(window.location.pathname).toBe("/app/traveller"));
  });

  it("shows a not-found page inside the shell for an unknown section", async () => {
    mockApi({ "/v1/me": [[200, REAL_ME]] });
    at("/app/admin/payments");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("opens the command palette with Ctrl+K", async () => {
    const user = userEvent.setup();
    mockApi({
      "/v1/me": [[200, REAL_ME]],
      "/v1/admin/audit": [[200, { items: [], page: 0, hasMore: false }]],
    });
    at("/app/admin/audit");
    await screen.findByText("No admin actions yet.");
    await user.keyboard("{Control>}k{/Control}");
    expect(
      await screen.findByRole("dialog", { name: "Go to a page or find a user" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
