import { StrictMode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { navigate } from "./router";
import { SERVICES } from "./services";

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

describe("App routing", () => {
  it("renders the landing page at /", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Travel solo. Never alone.",
    );
    expect(document.title).toBe("ROAAMM");
  });

  it("does not steal focus on the first render, even in StrictMode", () => {
    window.history.replaceState(null, "", "/");
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
  });

  it("navigates to /demo, moves focus to the h1, and goes back", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const hero = screen.getByRole("region", { name: "Travel solo. Never alone." });
    await user.click(within(hero).getByRole("link", { name: "Try demo" }));

    expect(window.location.pathname).toBe("/demo");
    // /demo is lazy: focus moves to its h1 once it has rendered.
    const h1 = await screen.findByRole("heading", { level: 1, name: "Try the demo" });
    await waitFor(() => expect(h1).toHaveFocus());
    expect(document.title).toBe("Try the demo · ROAAMM");

    await act(async () => {
      window.history.back();
      await new Promise((r) => window.addEventListener("popstate", r, { once: true }));
    });
    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Travel solo.");
  });

  it("points the canonical link and og:url at the current page", async () => {
    document.head.innerHTML =
      '<link rel="canonical" href="https://roaamm.plinthwell.com/"><meta property="og:url" content="https://roaamm.plinthwell.com/">';
    renderAt("/demo");
    await screen.findByRole("heading", { level: 1, name: "Try the demo" });
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://roaamm.plinthwell.com/demo",
    );
    expect(document.querySelector('meta[property="og:url"]')).toHaveAttribute(
      "content",
      "https://roaamm.plinthwell.com/demo",
    );
  });

  it("navigate() renders the matching page and ignores a trailing slash", async () => {
    renderAt("/");
    act(() => navigate("/demo/"));
    expect(await screen.findByRole("heading", { level: 1, name: "Try the demo" })).toBeInTheDocument();
  });

  it("shows a 404 with a link home for unknown paths", async () => {
    const user = userEvent.setup();
    renderAt("/no/such/page");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
    expect(screen.getByText("/no/such/page")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to home" }));
    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Travel solo.");
  });

  it("routes /app/<role> to that role's dashboard, protected by the session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 }),
    );
    renderAt("/app/guide");
    // No session: sent to the demo page.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Try the demo" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/demo");
    vi.restoreAllMocks();
  });

  it("loads the signup, sign-in and account pages on demand", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));
    const { unmount } = renderAt("/signup");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Create an account" }),
    ).toBeInTheDocument();
    unmount();
    renderAt("/login");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("keeps the demo as the main action and adds account links on the landing page", () => {
    renderAt("/");
    expect(screen.getAllByRole("link", { name: /Try demo/ })[0]).toHaveAttribute("href", "/demo");
    expect(screen.getAllByRole("link", { name: /create an account/i })[0]).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/login");
  });

  it("shows a 404 for an unknown dashboard role", () => {
    renderAt("/app/root");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
  });

  it("has a skip link to the main landmark", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("lists every deployed service in the footer", () => {
    renderAt("/");
    const system = screen.getByRole("region", { name: "System" });
    expect(within(system).getAllByRole("listitem")).toHaveLength(SERVICES.length);
    for (const s of SERVICES) {
      expect(within(system).getByText(new URL(s.url).host)).toBeInTheDocument();
    }
  });

  it("copy never says 'in the app' or names Plinthwell as a brand", () => {
    for (const path of ["/", "/demo", "/missing"]) {
      const { unmount } = renderAt(path);
      const text = document.body.textContent ?? "";
      expect(text, path).not.toMatch(/in the app|download the app/i);
      // Hostnames are lowercase (roaamm.plinthwell.com); the brand never appears.
      expect(text, path).not.toMatch(/Plinthwell/);
      unmount();
    }
  });

  it("credits the photo source in the footer", () => {
    renderAt("/");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Unsplash" })).toHaveAttribute(
      "href",
      expect.stringContaining("CREDITS.md"),
    );
  });

  it("uses first-level plinthwell.com subdomains only", () => {
    for (const s of SERVICES) {
      expect(new URL(s.url).host).toMatch(/^roaamm(-[a-z]+)?\.plinthwell\.com$/);
    }
  });
});
