import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi } from "../../test/webauthn";
import { VerificationCard } from "./VerificationCard";

describe("VerificationCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says plainly that no real ID is collected, and sends only a document type", async () => {
    const { calls } = mockApi({
      "/v1/verification/me": [[200, { status: "none", simulated: true }]],
      "/v1/verification/requests": [
        [
          200,
          {
            status: "pending",
            docType: "driving_licence",
            sampleRef: "SAMPLE-ABCD2345",
            createdAt: "2026-11-23T10:00:00Z",
            simulated: true,
          },
        ],
      ],
    });
    render(<VerificationCard onSignedOut={() => {}} />);
    expect(screen.getByText("Simulated: no real ID is collected.")).toBeInTheDocument();
    expect(await screen.findByText(/not verified yet/)).toBeInTheDocument();
    expect(screen.getByText("Not verified")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start verification" }));
    expect(
      screen.getByRole("group", { name: "Which document would you show?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Driving licence" }));
    await userEvent.click(screen.getByRole("button", { name: "Use sample ID" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/SAMPLE-ABCD2345/)).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    const post = calls.find((c) => c.path === "/v1/verification/requests")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ docType: "driving_licence" });
    expect(new Headers(post.init!.headers).get("X-Roaamm-Csrf")).toBe("1");
  });

  it("shows a rejection with its reason and lets the user try again", async () => {
    mockApi({
      "/v1/verification/me": [
        [
          200,
          {
            status: "rejected",
            docType: "passport",
            sampleRef: "SAMPLE-ZZZZ2222",
            reason: "Sample was blurred.",
            decidedAt: "2026-11-23T10:00:00Z",
          },
        ],
      ],
    });
    render(<VerificationCard onSignedOut={() => {}} />);
    expect(await screen.findByText("Sample was blurred.")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains a rate limit and an existing pending request", async () => {
    mockApi({
      "/v1/verification/me": [[200, { status: "none" }]],
      "/v1/verification/requests": [
        [429, { error: "rate_limited" }, { "retry-after": "600" }],
        [409, { error: "already_pending" }],
      ],
    });
    render(<VerificationCard onSignedOut={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Start verification" }));
    await userEvent.click(screen.getByRole("button", { name: "Use sample ID" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Try again in 10 minutes/);
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(
      await screen.findByText(/already have a verification request waiting/),
    ).toBeInTheDocument();
  });

  it("handles the API being down, and an expired session", async () => {
    mockApi({ "/v1/verification/me": [[502, { error: "bad_gateway" }]] });
    const { unmount } = render(<VerificationCard onSignedOut={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/API is not answering/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    unmount();
    vi.restoreAllMocks();

    mockApi({ "/v1/verification/me": [[401, { error: "unauthenticated" }]] });
    const signedOut = vi.fn();
    render(<VerificationCard onSignedOut={signedOut} />);
    await vi.waitFor(() => expect(signedOut).toHaveBeenCalled());
  });
});
