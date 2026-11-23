import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { API_ORIGIN, lastRole } from "../../api/session";
import { mockApi } from "../../test/webauthn";
import { Dashboard } from "./Dashboard";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Dashboard", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/traveller");
    lastRole.set(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows a loading state while the session is checked", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));
    render(<Dashboard role="traveller" />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking your demo session…");
  });

  it("renders the shell for the signed-in role with a Simulated data label", async () => {
    const { spy: fetchSpy } = mockApi({
      "/v1/me": [[200, { role: "traveller", displayName: "Demo traveller", isDemo: true }]],
      "/v1/verification/me": [[200, { status: "none", simulated: true }]],
    });
    render(<Dashboard role="traveller" />);
    expect(await screen.findByText("Signed in as demo traveller")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Traveller dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Simulated data")).toBeInTheDocument();
    // The verification card plus three placeholder panels.
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_ORIGIN}/v1/me`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("names a real user without saying demo, and links to the account page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ role: "traveller", displayName: "Asha Rao", isDemo: false, needsNewPasskey: false }),
    );
    render(<Dashboard role="traveller" />);
    expect(await screen.findByText("Signed in as Asha Rao")).toBeInTheDocument();
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
    expect(screen.getByText("Simulated data")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  });

  it("sends a recovery-code sign-in to add a passkey first", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ role: "guide", displayName: "Asha", isDemo: false, needsNewPasskey: true }),
    );
    render(<Dashboard role="guide" />);
    await waitFor(() => expect(window.location.pathname).toBe("/account"));
  });

  it("marks the admin demo as read-only", async () => {
    window.history.replaceState(null, "", "/app/admin");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ role: "admin", displayName: "Demo admin", isDemo: true }),
    );
    render(<Dashboard role="admin" />);
    expect(await screen.findByText("Signed in as demo admin (read-only)")).toBeInTheDocument();
  });

  it("redirects to /demo without a session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "unauthenticated" }, 401));
    render(<Dashboard role="traveller" />);
    await waitFor(() => expect(window.location.pathname).toBe("/demo"));
    expect(window.location.search).toBe("");
  });

  it("redirects with an expired notice when this browser had a session", async () => {
    lastRole.set("traveller");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "unauthenticated" }, 401));
    render(<Dashboard role="traveller" />);
    await waitFor(() => expect(window.location.search).toBe("?session=expired"));
    expect(window.location.pathname).toBe("/demo");
    expect(lastRole.get()).toBeNull();
  });

  it("goes to the right dashboard when signed in as another role", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ role: "guide", displayName: "Demo guide", isDemo: true }),
    );
    render(<Dashboard role="traveller" />);
    await waitFor(() => expect(window.location.pathname).toBe("/app/guide"));
  });

  it("shows an honest error with a retry when the API is down", async () => {
    const { calls } = mockApi({
      "/v1/me": [
        [502, { error: "bad_gateway" }],
        [200, { role: "traveller", displayName: "Demo traveller", isDemo: true }],
      ],
      "/v1/verification/me": [[200, { status: "none", simulated: true }]],
    });
    render(<Dashboard role="traveller" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/API is not answering/);
    expect(window.location.pathname).toBe("/app/traveller");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Signed in as demo traveller")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/v1/me")).toHaveLength(2);
  });

  it("signs out: deletes the session and returns to /demo", async () => {
    const { calls } = mockApi({
      "/v1/me": [[200, { role: "traveller", displayName: "Demo traveller", isDemo: true }]],
      "/v1/verification/me": [[200, { status: "none", simulated: true }]],
      "/v1/logout": [[204, null]],
    });
    lastRole.set("traveller");
    render(<Dashboard role="traveller" />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(window.location.search).toBe("?session=signed-out"));
    const logout = calls.find((c) => c.path === "/v1/logout")!;
    const init = logout.init;
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(new Headers(init!.headers).get("X-Roaamm-Csrf")).toBe("1");
    expect(lastRole.get()).toBeNull();
  });
});
