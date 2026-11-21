import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, navigate, useRoute } from "./router";

function Probe() {
  return <p data-testid="path">{useRoute()}</p>;
}

// Records whether the router prevented a click, then cancels it so jsdom does
// not try (and fail) to perform a real page navigation.
let routerPrevented: boolean | null = null;
function recordAndCancel(e: Event) {
  routerPrevented = e.defaultPrevented;
  e.preventDefault();
}

describe("router", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    routerPrevented = null;
    window.addEventListener("click", recordAndCancel);
  });
  afterEach(() => window.removeEventListener("click", recordAndCancel));

  it("useRoute follows navigate() and popstate", async () => {
    render(<Probe />);
    expect(screen.getByTestId("path")).toHaveTextContent("/");
    act(() => navigate("/demo"));
    expect(screen.getByTestId("path")).toHaveTextContent("/demo");

    await act(async () => {
      window.history.back();
      await new Promise((r) => window.addEventListener("popstate", r, { once: true }));
    });
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("navigate({ replace }) does not add a history entry", () => {
    const before = window.history.length;
    navigate("/demo", { replace: true });
    expect(window.location.pathname).toBe("/demo");
    expect(window.history.length).toBe(before);
  });

  it("Link intercepts plain clicks but not modified clicks", () => {
    render(
      <>
        <Link href="/demo">Demo</Link>
        <Probe />
      </>,
    );
    const link = screen.getByRole("link", { name: "Demo" });

    // Cmd/Ctrl-click must open a new tab: the router leaves it alone.
    fireEvent.click(link, { metaKey: true });
    expect(routerPrevented).toBe(false);
    expect(window.location.pathname).toBe("/");

    fireEvent.click(link);
    expect(routerPrevented).toBe(true); // routed in-page
    expect(screen.getByTestId("path")).toHaveTextContent("/demo");
  });

  it("Link leaves same-page #hash links to the browser", () => {
    render(<Link href="/#features">Features</Link>);
    fireEvent.click(screen.getByRole("link", { name: "Features" }));
    expect(routerPrevented).toBe(false);
  });
});
