import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BULK_MAX, bulkDecide, clearAdminCache, type Application } from "../api/admin";
import { mockApi } from "../test/webauthn";
import { BulkBar } from "./BulkBar";
import { AdminContext } from "./context";
import { MoveMenu, moveTargets } from "./MoveMenu";
import { Palette } from "./Palette";
import { applicationSteps } from "./screens/Guides";
import { Chip, Empty, ErrorState, Pill, Timeline } from "./ui";

const app = (over: Partial<Application> = {}): Application => ({
  id: "g1",
  applicantId: "u1",
  applicant: "Sample applicant Rook",
  applicantRole: "traveller",
  applicantVerified: true,
  status: "submitted",
  headline: "Old-town walks",
  bio: "Simulated.",
  languages: ["en"],
  cities: ["Lisbon"],
  createdAt: "2026-11-20T08:00:00Z",
  sample: true,
  ...over,
});

describe("pills and chips", () => {
  it("always carry text, never colour alone", () => {
    render(
      <>
        <Pill status="in_review" />
        <Pill status="rejected" />
        <Chip tone="sample">Sample</Chip>
      </>,
    );
    expect(screen.getByText("In review")).toHaveClass("adm-pill--in_review");
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Sample")).toHaveClass("adm-chip--sample");
  });
});

describe("empty and error states", () => {
  it("empty has a line of text; error has a retry button", async () => {
    const retry = vi.fn();
    render(
      <>
        <Empty>Nothing here.</Empty>
        <ErrorState message="Not allowed." onRetry={retry} />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Nothing here.");
    expect(screen.getByRole("alert")).toHaveTextContent("Not allowed.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("BulkBar", () => {
  it("hides with nothing selected and approves the selection", async () => {
    const onDecide = vi.fn();
    const { rerender } = render(<BulkBar count={0} readOnly={false} busy={false} onDecide={onDecide} onClear={() => {}} />);
    expect(screen.queryByRole("region")).toBeNull();
    rerender(<BulkBar count={3} readOnly={false} busy={false} onDecide={onDecide} onClear={() => {}} />);
    expect(screen.getByRole("region", { name: "Bulk actions" })).toHaveTextContent("3 selected");
    await userEvent.click(screen.getByRole("button", { name: "Approve 3" }));
    expect(onDecide).toHaveBeenCalledWith("approve");
  });

  it("needs a note and a confirm step to reject", async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn();
    render(<BulkBar count={2} readOnly={false} busy={false} onDecide={onDecide} onClear={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Reject…" }));
    await user.click(screen.getByRole("button", { name: "Confirm: reject 2" }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("A note is required to reject.");
    await user.type(screen.getByLabelText(/Note for all 2/), "  Blurry sample (simulated)  ");
    await user.click(screen.getByRole("button", { name: "Confirm: reject 2" }));
    expect(onDecide).toHaveBeenCalledWith("reject", "Blurry sample (simulated)");
  });

  it(`caps a request at ${BULK_MAX} rows and is disabled for the demo admin`, () => {
    const { rerender } = render(<BulkBar count={26} readOnly={false} busy={false} onDecide={() => {}} onClear={() => {}} />);
    expect(screen.getByText(/at most 25 per action/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve 26" })).toBeDisabled();
    rerender(<BulkBar count={2} readOnly busy={false} onDecide={() => {}} onClear={() => {}} />);
    expect(screen.getByRole("button", { name: "Approve 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject…" })).toBeDisabled();
    expect(screen.getByText("Demo is read-only")).toBeInTheDocument();
  });

  it("the API client refuses more than 25 ids before sending anything", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(() => bulkDecide("verification", Array.from({ length: 26 }, (_, i) => `id${i}`), "approve")).toThrow(RangeError);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("MoveMenu", () => {
  it("offers only allowed moves; decided applications are final", () => {
    expect(moveTargets("submitted")).toEqual(["in_review", "approved", "rejected"]);
    expect(moveTargets("in_review")).toEqual(["approved", "rejected"]);
    expect(moveTargets("approved")).toEqual([]);
    render(<MoveMenu status="approved" label="Done" readOnly={false} onMove={() => {}} />);
    expect(screen.getByRole("button", { name: /Decided/ })).toBeDisabled();
  });

  it("works from the keyboard: arrows, Enter and Escape", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<MoveMenu status="submitted" label="Old-town walks" readOnly={false} onMove={onMove} />);
    const button = screen.getByRole("button", { name: /Move to…/ });
    button.focus();
    await user.keyboard("{ArrowDown}");
    const menu = screen.getByRole("menu", { name: "Move Old-town walks to" });
    expect(within(menu).getByRole("menuitem", { name: "In review" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(within(menu).getByRole("menuitem", { name: "Approved" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(onMove).toHaveBeenCalledWith("rejected");
  });

  it("is disabled and says so for the demo admin", () => {
    render(<MoveMenu status="submitted" label="x" readOnly onMove={() => {}} />);
    expect(screen.getByRole("button", { name: /Demo is read-only/ })).toBeDisabled();
  });
});

describe("application timeline", () => {
  it("shows a skipped review when decided straight from Submitted", () => {
    const steps = applicationSteps(
      app({ status: "approved", decidedAt: "2026-11-21T08:00:00Z", reviewedAt: "2026-11-21T08:00:00Z", reviewer: "Ada", history: [{ action: "guide_application.approve", admin: "Ada", at: "2026-11-21T08:00:00Z" }] }),
    );
    expect(steps.map((s) => [s.label, s.state])).toEqual([
      ["Submitted", "done"],
      ["In review", "skipped"],
      ["Approved", "current"],
    ]);
    render(<Timeline label="t" steps={steps} />);
    expect(screen.getByText("Skipped: decided directly from Submitted.")).toBeInTheDocument();
    expect(screen.getByText("(skipped)", { exact: false })).toBeInTheDocument();
  });

  it("marks the current step and the role change after a real approval", () => {
    expect(applicationSteps(app()).map((s) => s.state)).toEqual(["current", "todo", "todo"]);
    expect(applicationSteps(app({ status: "in_review", history: [{ action: "guide_application.review", admin: "Ada", at: "2026-11-20T09:00:00Z" }] })).map((s) => s.state)).toEqual(["done", "current", "todo"]);
    const approved = applicationSteps(
      app({
        status: "approved",
        sample: false,
        decidedAt: "2026-11-22T08:00:00Z",
        history: [
          { action: "guide_application.review", admin: "Ada", at: "2026-11-21T08:00:00Z" },
          { action: "guide_application.approve", admin: "Ada", at: "2026-11-22T08:00:00Z" },
          { action: "user.role_to_guide", admin: "Ada", at: "2026-11-22T08:00:00Z" },
        ],
      }),
    );
    expect(approved.map((s) => [s.label, s.state])).toEqual([
      ["Submitted", "done"],
      ["In review", "done"],
      ["Approved", "done"],
      ["Role changed to guide", "current"],
    ]);
  });
});

describe("Palette", () => {
  beforeEach(() => clearAdminCache());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderPalette(onClose = vi.fn()) {
    render(
      <AdminContext.Provider value={{ me: { role: "admin", displayName: "Ada", isDemo: false }, readOnly: false, onSignedOut: () => {} }}>
        <Palette onClose={onClose} />
      </AdminContext.Provider>,
    );
    return onClose;
  }

  it("is a labelled dialog with a combobox; arrows move, Enter opens, Escape closes", async () => {
    window.history.replaceState(null, "", "/app/admin");
    const user = userEvent.setup();
    const onClose = renderPalette();
    expect(screen.getByRole("dialog", { name: "Go to a page or find a user" })).toBeInTheDocument();
    const input = screen.getByRole("combobox");
    expect(input).toHaveFocus();
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1]!.id);
    await user.type(input, "aud");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Audit logPage"]);
    await user.keyboard("{Enter}");
    expect(window.location.pathname).toBe("/app/admin/audit");
    expect(onClose).toHaveBeenCalled();
  });

  it("searches users once, 300 ms after typing stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { calls } = mockApi({
      "/v1/admin/users": [[200, { items: [{ id: "u1", shortId: "0000000u", displayName: "Sample applicant Rook", role: "traveller", verified: true, demo: true, sample: true, createdAt: "2026-11-01T00:00:00Z" }], page: 0, size: 6, hasMore: false, total: 1 }]],
    });
    renderPalette();
    await user.type(screen.getByRole("combobox"), "Rook");
    expect(calls).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(await screen.findByRole("option", { name: /Sample applicant Rook/ })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("q=Rook");
  });

  it("Escape closes it", async () => {
    const onClose = renderPalette();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
