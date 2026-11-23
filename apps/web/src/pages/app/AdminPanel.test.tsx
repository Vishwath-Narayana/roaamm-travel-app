import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi } from "../../test/webauthn";
import { AdminPanel } from "./AdminPanel";

const ANA = {
  id: "00000000-0000-4000-8000-000000000201",
  userDisplayName: "Sample traveller Ana",
  userRole: "traveller",
  docType: "passport",
  sampleRef: "SAMPLE-ANA00001",
  status: "pending",
  createdAt: "2026-11-23T08:00:00Z",
};
const page = (items: unknown[], hasMore = false) => ({ items, page: 0, hasMore });

describe("AdminPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists the queue as a table and filters by status", async () => {
    const { calls } = mockApi({
      "/v1/admin/verification": [
        [200, page([ANA])],
        [200, page([])],
      ],
    });
    render(<AdminPanel readOnly={false} onSignedOut={() => {}} />);
    const table = await screen.findByRole("table", { name: /Pending verification requests/ });
    expect(
      within(table).getByRole("rowheader", { name: "Sample traveller Ana" }),
    ).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Document" })).toBeInTheDocument();

    const verified = screen.getByRole("button", { name: "Verified" });
    expect(screen.getByRole("button", { name: "Pending" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(verified);
    expect(verified).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("No verified requests.")).toBeInTheDocument();
    expect(calls[0]!.url).toContain("status=pending&page=0");
    expect(calls.at(-1)!.url).toContain("status=verified&page=0");
  });

  it("says when the queue is empty", async () => {
    mockApi({ "/v1/admin/verification": [[200, page([])]] });
    render(<AdminPanel readOnly={false} onSignedOut={() => {}} />);
    expect(await screen.findByText(/queue is empty/)).toBeInTheDocument();
  });

  it("opens a detail view, needs a reason to reject, and approves", async () => {
    const { calls } = mockApi({
      "/v1/admin/verification": [[200, page([ANA])]],
      [`/v1/admin/verification/${ANA.id}/decision`]: [
        [
          200,
          { ...ANA, status: "verified", decidedAt: "2026-11-23T09:00:00Z", decidedBy: "Owner" },
        ],
      ],
    });
    render(<AdminPanel readOnly={false} onSignedOut={() => {}} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Review Sample traveller Ana" }),
    );
    const heading = screen.getByRole("heading", { level: 3, name: "Sample traveller Ana" });
    expect(heading).toHaveFocus();
    expect(screen.getByText("SAMPLE-ANA00001", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/no real ID is collected/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Give a reason/);
    expect(calls.some((c) => c.path.endsWith("/decision"))).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    const decision = await vi.waitFor(() => {
      const c = calls.find((x) => x.path.endsWith("/decision"));
      if (!c) throw new Error("no decision yet");
      return c;
    });
    expect(JSON.parse(String(decision.init!.body))).toEqual({ decision: "approve" });
    expect(await screen.findByText("Verified", { selector: "dd" })).toBeInTheDocument();
  });

  it("sends the reason when rejecting", async () => {
    const { calls } = mockApi({
      "/v1/admin/verification": [[200, page([ANA])]],
      [`/v1/admin/verification/${ANA.id}/decision`]: [
        [200, { ...ANA, status: "rejected", reason: "Blurred sample" }],
      ],
    });
    render(<AdminPanel readOnly={false} onSignedOut={() => {}} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Review Sample traveller Ana" }),
    );
    await userEvent.type(screen.getByLabelText(/Reason/), "Blurred sample");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await vi.waitFor(() => expect(calls.some((c) => c.path.endsWith("/decision"))).toBe(true));
    const decision = calls.find((c) => c.path.endsWith("/decision"))!;
    expect(JSON.parse(String(decision.init!.body))).toEqual({
      decision: "reject",
      reason: "Blurred sample",
    });
  });

  it("is read-only for the demo admin", async () => {
    mockApi({ "/v1/admin/verification": [[200, page([ANA])]] });
    render(<AdminPanel readOnly onSignedOut={() => {}} />);
    expect(screen.getByRole("note")).toHaveTextContent(/Read-only demo/);
    await userEvent.click(
      await screen.findByRole("button", { name: "Review Sample traveller Ana" }),
    );
    for (const name of ["Approve", "Reject"]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription("Read-only demo: decisions are disabled.");
    }
    expect(screen.getByLabelText(/Reason/)).toBeDisabled();
  });

  it("switches to the audit log with the keyboard", async () => {
    mockApi({
      "/v1/admin/verification": [[200, page([ANA])]],
      "/v1/admin/audit": [
        [
          200,
          page([
            {
              id: "a1",
              admin: "Demo admin",
              action: "verification.approve",
              targetId: ANA.id,
              target: "Sample traveller Ana",
              createdAt: "2026-11-22T08:00:00Z",
            },
            {
              id: "a2",
              admin: "Demo admin",
              action: "verification.reject",
              targetId: "8f3a2c1e-0000-4000-8000-00000000beef",
              target: null,
              createdAt: "2026-11-21T08:00:00Z",
            },
          ]),
        ],
      ],
    });
    render(<AdminPanel readOnly onSignedOut={() => {}} />);
    const queueTab = screen.getByRole("tab", { name: "Verification queue" });
    expect(queueTab).toHaveAttribute("aria-selected", "true");
    queueTab.focus();
    await userEvent.keyboard("{ArrowRight}");
    const auditTab = screen.getByRole("tab", { name: "Audit log" });
    expect(auditTab).toHaveFocus();
    expect(auditTab).toHaveAttribute("aria-selected", "true");
    const table = await screen.findByRole("table", { name: /Admin actions/ });
    expect(within(table).getByText("Approved verification")).toBeInTheDocument();
    const [, first, second] = within(table).getAllByRole("row");
    expect(first).toHaveTextContent("Sample traveller Ana 00000201");
    expect(second).toHaveTextContent("Deleted request 0000beef");
    expect(table).not.toHaveTextContent("00000000");
  });

  it("says the read-only queue holds simulated people and demo visitors", async () => {
    mockApi({ "/v1/admin/verification": [[200, page([])]] });
    render(<AdminPanel readOnly onSignedOut={() => {}} />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "The queue shows simulated people and demo visitors only.",
    );
    expect(await screen.findByText(/queue is empty/)).toBeInTheDocument();
  });

  it("shows honest errors: forbidden, API down, and an expired session", async () => {
    mockApi({ "/v1/admin/verification": [[403, { error: "forbidden" }]] });
    const { unmount } = render(<AdminPanel readOnly={false} onSignedOut={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have access to that.");
    unmount();
    vi.restoreAllMocks();

    mockApi({ "/v1/admin/verification": [[503, { error: "database_unavailable" }]] });
    const second = render(<AdminPanel readOnly={false} onSignedOut={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/API is not answering/);
    second.unmount();
    vi.restoreAllMocks();

    mockApi({ "/v1/admin/verification": [[401, { error: "unauthenticated" }]] });
    const signedOut = vi.fn();
    render(<AdminPanel readOnly={false} onSignedOut={signedOut} />);
    await vi.waitFor(() => expect(signedOut).toHaveBeenCalled());
  });
});
