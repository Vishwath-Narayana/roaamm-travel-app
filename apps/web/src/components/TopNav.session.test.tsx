import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lastRole, sessionStore } from "../api/session";
import { mockApi } from "../test/webauthn";
import { TopNav } from "./TopNav";

describe("TopNav session", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    sessionStore.set({ kind: "unknown" });
    lastRole.set(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("never calls the API on a first visit and shows Try demo", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<TopNav />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getAllByRole("link", { name: "Try demo" })[0]).toHaveAttribute("href", "/demo");
  });

  it("shows the name, dashboard, account and sign out for a real user", async () => {
    lastRole.set("guide");
    mockApi({
      "/v1/me": [
        [200, { role: "guide", displayName: "Asha Rao", isDemo: false, needsNewPasskey: false }],
      ],
    });
    render(<TopNav />);
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Try demo" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" })[0]).toHaveAttribute(
      "href",
      "/app/guide",
    );
    expect(screen.getAllByRole("link", { name: "Account" })[0]).toHaveAttribute("href", "/account");
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
  });

  it("names a demo session and has no account link", () => {
    act(() =>
      sessionStore.set({
        kind: "signed-in",
        me: { role: "admin", displayName: "Demo admin", isDemo: true },
      }),
    );
    render(<TopNav />);
    expect(screen.getByText("Demo admin")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" })[0]).toHaveAttribute(
      "href",
      "/app/admin",
    );
  });

  it("signs out and goes back to the demo page", async () => {
    lastRole.set("traveller");
    act(() =>
      sessionStore.set({
        kind: "signed-in",
        me: { role: "traveller", displayName: "Demo traveller", isDemo: true },
      }),
    );
    const { calls } = mockApi({ "/v1/logout": [[204, null]] });
    render(<TopNav />);
    await userEvent.click(screen.getAllByRole("button", { name: "Sign out" })[0]!);
    await vi.waitFor(() => expect(window.location.search).toBe("?session=signed-out"));
    expect(calls[0]!.path).toBe("/v1/logout");
    expect(lastRole.get()).toBeNull();
    expect(await screen.findAllByRole("link", { name: "Try demo" })).not.toHaveLength(0);
  });

  it("falls back to Try demo when the stored session has expired", async () => {
    lastRole.set("traveller");
    mockApi({ "/v1/me": [[401, { error: "unauthenticated" }]] });
    render(<TopNav />);
    await vi.waitFor(() => expect(sessionStore.get().kind).toBe("none"));
    expect(screen.getAllByRole("link", { name: "Try demo" })[0]).toBeInTheDocument();
  });
});
