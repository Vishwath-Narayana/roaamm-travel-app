import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { API_ORIGIN, lastRole } from "../api/session";
import { Demo } from "./Demo";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Demo role picker", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/demo");
    lastRole.set(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("offers three enabled roles, each with one line of what you will see", () => {
    render(<Demo />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const role of ["Traveller", "Guide", "Admin"]) {
      expect(screen.getByRole("heading", { level: 3, name: role })).toBeInTheDocument();
      const button = screen.getByRole("button", { name: `Open as ${role}` });
      expect(button).toBeEnabled();
      // The description is announced with the button.
      expect(button).toHaveAccessibleDescription(/.+/);
    }
    expect(screen.queryByText("Opens in M2")).not.toBeInTheDocument();
  });

  it("one click starts a demo session and opens that role's dashboard", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({ role: "guide", displayName: "Demo guide", isDemo: true }));
    render(<Demo />);
    await userEvent.click(screen.getByRole("button", { name: "Open as Guide" }));

    await waitFor(() => expect(window.location.pathname).toBe("/app/guide"));
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${API_ORIGIN}/v1/demo/session`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(new Headers(init!.headers).get("X-Roaamm-Csrf")).toBe("1");
    expect(JSON.parse(String(init!.body))).toEqual({ role: "guide" });
    expect(lastRole.get()).toBe("guide");
  });

  it("disables every role while one is opening", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));
    render(<Demo />);
    await userEvent.click(screen.getByRole("button", { name: "Open as Traveller" }));
    const busy = screen.getByRole("button", { name: "Opening Traveller…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    for (const role of ["Guide", "Admin"]) {
      expect(screen.getByRole("button", { name: `Open as ${role}` })).toBeDisabled();
    }
  });

  it("says so honestly when the API is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Demo />);
    await userEvent.click(screen.getByRole("button", { name: "Open as Traveller" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/API is not answering/);
    expect(window.location.pathname).toBe("/demo");
    // The buttons work again.
    expect(screen.getByRole("button", { name: "Open as Traveller" })).toBeEnabled();
  });

  it("explains the rate limit with the wait time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "240" } }),
    );
    render(<Demo />);
    await userEvent.click(screen.getByRole("button", { name: "Open as Admin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many demo sign-ins from your network. Try again in 4 minutes.",
    );
  });

  it("explains an expired session when sent back from a dashboard", () => {
    window.history.replaceState(null, "", "/demo?session=expired");
    render(<Demo />);
    expect(screen.getByRole("status")).toHaveTextContent(/demo session ended/);
  });
});
