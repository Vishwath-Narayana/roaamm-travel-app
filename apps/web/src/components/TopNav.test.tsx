import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "./TopNav";

describe("TopNav", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the wordmark, the three links and Try demo", () => {
    render(<TopNav />);
    expect(screen.getByRole("link", { name: "ROAAMM home" })).toHaveAttribute("href", "/");
    const primary = screen.getByRole("navigation", { name: "Primary" });
    for (const name of ["Features", "Safety", "Guides"]) {
      expect(within(primary).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link", { name: "Try demo" })[0]).toHaveAttribute("href", "/demo");
  });

  it("theme toggle sets data-theme and remembers it", async () => {
    const user = userEvent.setup();
    render(<TopNav />);
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("roaamm-theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("theme toggle still works when localStorage throws", async () => {
    const user = userEvent.setup();
    vi.spyOn(Object.getPrototypeOf(window.localStorage), "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Object.getPrototypeOf(window.localStorage), "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<TopNav />);
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("mobile menu toggles aria-expanded and closes on Escape with focus returned", async () => {
    const user = userEvent.setup();
    render(<TopNav />);
    const btn = screen.getByRole("button", { name: "Open menu" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile" })).not.toBeInTheDocument();

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("navigation", { name: "Mobile" });
    expect(btn).toHaveAttribute("aria-controls", menu.id);
    expect(within(menu).getByRole("link", { name: "Safety" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile" })).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });

  it("mobile menu closes when a link is chosen", async () => {
    const user = userEvent.setup();
    render(<TopNav />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = screen.getByRole("navigation", { name: "Mobile" });
    await user.click(within(menu).getByRole("link", { name: "Guides" }));
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
