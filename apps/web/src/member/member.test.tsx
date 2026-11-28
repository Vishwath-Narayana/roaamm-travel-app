import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearAdminCache } from "../api/admin";
import { mockApi } from "../test/webauthn";
import { GuideApp } from "./GuideApp";
import { checkApplication, checkTrip } from "./parts";
import { TravellerApp } from "./TravellerApp";

const DEMO_T = { role: "traveller", displayName: "Demo traveller", isDemo: true };
const REAL_T = { role: "traveller", displayName: "Sample traveller Ines", isDemo: false };
const DEMO_G = { role: "guide", displayName: "Demo guide", isDemo: true };
const ADMIN = { role: "admin", displayName: "Demo admin", isDemo: true };

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const ID = "00000000-0000-4000-8000-000000000601";
const trip = (over: Record<string, unknown> = {}) => ({
  id: ID,
  title: "Coast road with friends",
  destination: "Porto, Portugal",
  startDate: iso(10),
  endDate: iso(14),
  status: "planned",
  notes: "Simulated note.",
  sample: false,
  createdAt: "2026-11-01T08:00:00Z",
  updatedAt: "2026-11-01T08:00:00Z",
  ...over,
});
const list = (items: unknown[]) => ({
  items,
  page: 0,
  size: 10,
  hasMore: false,
  total: items.length,
  counts: { total: items.length, planned: items.length, ongoing: 0, completed: 0, cancelled: 0 },
  max: 20,
});

function travellerAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<TravellerApp path={path.split("?")[0]!} />);
}

describe("trip and application validation (the API's limits)", () => {
  const ok = { title: "Temples", destination: "Kyoto, Japan", startDate: iso(5), endDate: iso(9), notes: "" };

  it("accepts a valid trip and names every problem in plain words", () => {
    expect(checkTrip(ok)).toEqual({});
    expect(checkTrip({ ...ok, title: " ", destination: "" })).toMatchObject({
      title: "Give the trip a title.",
      destination: "Say where you are going.",
    });
    expect(checkTrip({ ...ok, endDate: iso(4) }).endDate).toBe("The trip cannot end before it starts.");
    expect(checkTrip({ ...ok, title: "x".repeat(81) }).title).toBe("Use at most 80 characters.");
    expect(checkTrip({ ...ok, notes: "n".repeat(501) }).notes).toBe("Use at most 500 characters.");
    expect(checkTrip({ ...ok, destination: "Kyoto <b>" }).destination).toMatch(/letters, spaces/);
    expect(checkTrip({ ...ok, endDate: iso(5 * 365) }).endDate).toBe("Pick a date within the next three years.");
  });

  it("needs a headline, a bio, 1 to 5 languages and 1 to 5 plain city names", () => {
    const app = { headline: "Walks", bio: "Slow walks.", languages: ["en"], cities: ["Porto"] };
    expect(checkApplication(app)).toEqual({});
    expect(checkApplication({ ...app, languages: [], cities: [] })).toMatchObject({
      languages: "Add at least one language.",
      cities: "Add at least one city.",
    });
    expect(checkApplication({ ...app, languages: ["en", "pt", "es", "fr", "de", "it"] }).languages).toMatch(/at most 5/);
    expect(checkApplication({ ...app, cities: ["Porto, Portugal"] }).cities).toMatch(/no commas/);
  });
});

describe("TravellerApp", () => {
  beforeEach(() => clearAdminCache());
  afterEach(() => vi.restoreAllMocks());

  it("shows the demo traveller's sample trips with a Sample chip; New trip is disabled with the reason", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      "/v1/me": [[200, DEMO_T]],
      "/v1/trips": [[200, list([trip({ id: "00000000-0000-4000-8000-000000000402", title: "Temples in autumn", sample: true })])]],
    });
    travellerAt("/app/traveller/trips");
    expect(await screen.findByText("Temples in autumn")).toBeInTheDocument();
    expect(screen.getByText("Sample")).toHaveClass("adm-chip--sample");
    expect(screen.getByRole("note")).toHaveTextContent("Demo, read-only.");
    const create = screen.getByRole("button", { name: "New trip" });
    expect(create).toHaveAttribute("aria-disabled", "true");
    expect(create).toHaveAccessibleDescription("Demo is read-only");
    await user.click(create);
    expect(window.location.pathname).toBe("/app/traveller/trips");
    expect(calls.some((c) => c.init?.method && c.init.method !== "GET")).toBe(false);
  });

  it("filters by status and search through the API", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ "/v1/me": [[200, REAL_T]], "/v1/trips": [[200, list([trip()])]] });
    travellerAt("/app/traveller/trips");
    await screen.findByText("Coast road with friends");
    await user.click(screen.getByRole("button", { name: "Cancelled" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("status=cancelled"))).toBe(true));
    await user.type(screen.getByRole("searchbox"), "porto");
    await waitFor(() => expect(calls.some((c) => c.url.includes("q=porto"))).toBe(true));
  });

  it("validates the new-trip form, focuses the first invalid field, then creates the trip", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      "/v1/me": [[200, REAL_T]],
      "/v1/trips": [[201, trip()]],
    });
    travellerAt("/app/traveller/trips/new");
    const submit = await screen.findByRole("button", { name: "Create trip" });
    await user.click(submit);
    const title = screen.getByLabelText("Title");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription("Give the trip a title.");
    await waitFor(() => expect(title).toHaveFocus());
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(0);

    await user.type(title, "Coast road with friends");
    await user.type(screen.getByLabelText("Destination"), "Porto, Portugal");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: iso(10) } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: iso(8) } });
    expect(screen.getByLabelText("End date")).toHaveAccessibleDescription("The trip cannot end before it starts.");
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: iso(14) } });
    await user.type(screen.getByLabelText("Notes (optional)"), "Bring a jacket.");
    await user.click(submit);
    await waitFor(() => expect(window.location.pathname).toBe(`/app/traveller/trips/${ID}`));
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({
      title: "Coast road with friends",
      destination: "Porto, Portugal",
      startDate: iso(10),
      endDate: iso(14),
      notes: "Bring a jacket.",
    });
    expect((post.init!.headers as Record<string, string>)["X-Roaamm-Csrf"]).toBe("1");
    expect(await screen.findByText("Trip created.")).toBeInTheDocument();
  });

  it("puts an API field error under its field", async () => {
    const user = userEvent.setup();
    mockApi({ "/v1/me": [[200, REAL_T]], "/v1/trips": [[400, { error: "invalid_destination" }]] });
    travellerAt("/app/traveller/trips/new");
    await user.type(await screen.findByLabelText("Title"), "Trip");
    await user.type(screen.getByLabelText("Destination"), "Kyoto");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: iso(10) } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: iso(12) } });
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Destination")).toHaveAccessibleDescription(
        expect.stringContaining("Use letters, spaces") as unknown as string,
      ),
    );
    expect(screen.getByRole("button", { name: "Create trip" })).not.toBeDisabled();
  });

  it("says notes are private, and cancels a trip only after a confirm", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      "/v1/me": [[200, REAL_T]],
      [`/v1/trips/${ID}`]: [
        [200, trip()],
        [200, trip({ status: "cancelled" })],
        [200, trip({ status: "cancelled" })],
      ],
    });
    travellerAt(`/app/traveller/trips/${ID}`);
    expect(await screen.findByText("Simulated note.")).toBeInTheDocument();
    expect(screen.getByText(/Admins never see them/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel trip" }));
    const dialog = screen.getByRole("alertdialog", { name: "Cancel this trip?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep trip" }));
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Cancel trip" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel trip" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(JSON.parse(String(patch.init!.body))).toEqual({ status: "cancelled" });
    expect(await screen.findByText("Trip cancelled.")).toBeInTheDocument();
  });

  it("shows a rejection's reason and resubmits an edited application", async () => {
    const user = userEvent.setup();
    const rejected = {
      id: "g1",
      status: "rejected",
      headline: "Old-town walks",
      bio: "Slow walks.",
      languages: ["en"],
      cities: ["Porto"],
      decisionNote: "Describe a typical tour (simulated).",
      createdAt: "2026-11-20T08:00:00Z",
      reviewedAt: "2026-11-21T08:00:00Z",
      decidedAt: "2026-11-22T08:00:00Z",
    };
    const { calls } = mockApi({
      "/v1/me": [[200, REAL_T]],
      "/v1/guide/application": [
        [200, { status: "rejected", canApply: true, application: rejected }],
        [201, { ...rejected, status: "submitted" }],
        [200, { status: "submitted", canApply: false, reason: "already_open", application: { ...rejected, status: "submitted" } }],
      ],
    });
    travellerAt("/app/traveller/become-a-guide");
    expect((await screen.findByText(/Why it was not approved:/)).parentElement).toHaveTextContent("Describe a typical tour (simulated).");
    expect(screen.getByRole("list", { name: "Application timeline" })).toHaveTextContent("Rejected");
    await user.click(screen.getByRole("button", { name: "Edit and resubmit" }));
    const headline = screen.getByLabelText("Headline");
    expect(headline).toHaveValue("Old-town walks");
    await user.type(headline, ", three hours");
    await user.click(screen.getByRole("button", { name: "Resubmit application" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "POST")).toBe(true));
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toMatchObject({ headline: "Old-town walks, three hours", languages: ["en"], cities: ["Porto"] });
    expect(await screen.findByText("Application resubmitted.")).toBeInTheDocument();
  });

  it("keeps the application form visible but unsendable in the demo", async () => {
    mockApi({ "/v1/me": [[200, DEMO_T]], "/v1/guide/application": [[200, { status: "none", canApply: true }]] });
    travellerAt("/app/traveller/become-a-guide");
    const send = await screen.findByRole("button", { name: "Send application" });
    expect(send).toHaveAttribute("aria-disabled", "true");
    expect(send).toHaveAccessibleDescription("Demo is read-only");
    expect(screen.getByLabelText("Headline")).toBeEnabled();
  });

  it("shows a guide a no-access page with the way home", async () => {
    mockApi({ "/v1/me": [[200, DEMO_G]] });
    travellerAt("/app/traveller/trips");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You are signed in as the demo guide. This area is for travellers.");
    expect(within(alert).getByRole("link", { name: "Go to your home" })).toHaveAttribute("href", "/app/guide");
  });

  it("lets an admin look in read-only, without asking the API for trips", async () => {
    const { calls } = mockApi({ "/v1/me": [[200, ADMIN]] });
    travellerAt("/app/traveller/trips");
    expect(await screen.findByText("No trips yet. Plan your first one with New trip.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Viewing as a traveller.");
    expect(calls.map((c) => c.path)).toEqual(["/v1/me"]);
  });

  it("starts a simulated ID check that sends only a document type", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      "/v1/me": [[200, REAL_T]],
      "/v1/trips": [[200, list([])]],
      "/v1/guide/application": [[200, { status: "none", canApply: false, reason: "not_verified" }]],
      "/v1/verification/me": [[200, { status: "none" }], [200, { status: "pending", docType: "national_id", sampleRef: "SAMPLE-X", createdAt: "2026-11-26T08:00:00Z" }]],
      "/v1/verification/requests": [[201, { status: "pending" }]],
    });
    travellerAt("/app/traveller");
    expect(await screen.findByText(/no real ID is collected/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Sample document type"), "national_id");
    await user.click(screen.getByRole("button", { name: "Use a sample ID" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/v1/verification/requests")).toBe(true));
    const sent = calls.find((c) => c.path === "/v1/verification/requests")!;
    expect(JSON.parse(String(sent.init!.body))).toEqual({ docType: "national_id" });
    expect(await screen.findByText(/waiting for an admin/)).toBeInTheDocument();
  });

  it("sends a visitor without a session to the demo page", async () => {
    mockApi({ "/v1/me": [[401, { error: "unauthenticated" }]] });
    travellerAt("/app/traveller");
    await waitFor(() => expect(window.location.pathname).toBe("/demo"));
  });
});

describe("GuideApp", () => {
  beforeEach(() => clearAdminCache());
  afterEach(() => vi.restoreAllMocks());

  it("shows the demo guide a labelled sample profile and M9 placeholders, and no-access to travellers", async () => {
    mockApi({
      "/v1/me": [[200, DEMO_G]],
      "/v1/guide/application": [[200, { status: "none", canApply: false, reason: "already_guide" }]],
    });
    window.history.replaceState(null, "", "/app/guide");
    const { unmount } = render(<GuideApp path="/app/guide" />);
    expect(await screen.findByText(/Approved on/)).toBeInTheDocument();
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(screen.getAllByText("Coming in M9")).toHaveLength(2);
    unmount();
    vi.restoreAllMocks();

    mockApi({ "/v1/me": [[200, REAL_T]] });
    window.history.replaceState(null, "", "/app/guide/profile");
    render(<GuideApp path="/app/guide/profile" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This area is for guides.");
  });
});
