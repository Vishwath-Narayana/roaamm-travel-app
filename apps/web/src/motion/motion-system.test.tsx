import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionToggle } from "../components/MotionToggle";
import { TopNav } from "../components/TopNav";
import { Landing } from "../pages/Landing";
import { Guides } from "../pages/landing/Guides";
import { installIntersectionObserver, mockReducedMotion, restoreMatchMedia } from "../test/mocks";
import { Reveal, type RevealVariant } from ".";
import { readMotionPreference, setMotionReduced } from "./preference";

const VARIANTS: RevealVariant[] = ["fade-up", "fade", "scale", "line", "mask-line", "slide-left", "slide-right", "blur-in"];

/** The text a screen reader can reach: everything except aria-hidden parts. */
function accessibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

beforeAll(() => installIntersectionObserver());
afterEach(() => {
  restoreMatchMedia();
  delete document.documentElement.dataset.motion;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("Reveal variants show their final state when motion is reduced", () => {
  it.each(VARIANTS)("%s, under the OS setting", (variant) => {
    mockReducedMotion(true);
    render(
      <Reveal variant={variant} data-testid="r">
        Hello
      </Reveal>,
    );
    const el = screen.getByTestId("r");
    expect(el).toHaveClass("reveal", `reveal--${variant}`, "is-visible");
    expect(el).toHaveTextContent("Hello");
  });

  it.each(VARIANTS)("%s, under the footer switch (data-motion)", (variant) => {
    mockReducedMotion(false);
    document.documentElement.dataset.motion = "reduced";
    render(
      <Reveal variant={variant} data-testid="r">
        Hello
      </Reveal>,
    );
    expect(screen.getByTestId("r")).toHaveClass("is-visible");
  });

  it("keeps a mask-line heading's real text in the DOM, in one piece", () => {
    mockReducedMotion(false);
    render(
      <Reveal as="h2" variant="mask-line">
        Meet travellers on <span className="serif">your dates</span>
      </Reveal>,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Meet travellers on your dates");
  });
});

describe("Reduce motion switch", () => {
  it("applies data-motion and persists the choice", async () => {
    mockReducedMotion(false);
    const user = userEvent.setup();
    render(<MotionToggle />);
    const sw = screen.getByRole("switch", { name: "Reduce motion" });
    expect(sw).toHaveAttribute("aria-checked", "false");

    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.motion).toBe("reduced");
    expect(readMotionPreference()).toBe(true);

    await user.click(sw);
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(readMotionPreference()).toBe(false);
  });

  it("still applies when localStorage throws", () => {
    mockReducedMotion(false);
    const proto = Object.getPrototypeOf(window.localStorage);
    vi.spyOn(proto, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => act(() => setMotionReduced(true))).not.toThrow();
    expect(document.documentElement.dataset.motion).toBe("reduced");
  });

  it("can only reduce: with the OS setting on it shows on and is locked", () => {
    mockReducedMotion(true);
    render(<MotionToggle />);
    const sw = screen.getByRole("switch", { name: "Reduce motion" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw).toBeDisabled();
    expect(sw).toHaveAccessibleDescription("On in your system settings");
  });
});

describe("TopNav hide and show on scroll", () => {
  afterEach(() => vi.useRealTimers());

  function scrollTo(y: number) {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(20); // one animation frame
    });
  }

  it("hides on the way down, returns on the way up, never near the top or with focus inside", () => {
    mockReducedMotion(false);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout"] });
    scrollTo(0);
    const { container } = render(<TopNav />);
    const header = container.querySelector("header")!;

    scrollTo(400);
    expect(header).toHaveClass("topnav--hidden");
    scrollTo(300);
    expect(header).not.toHaveClass("topnav--hidden");
    scrollTo(600);
    expect(header).toHaveClass("topnav--hidden");
    scrollTo(60); // near the top
    expect(header).not.toHaveClass("topnav--hidden");

    scrollTo(500);
    act(() => screen.getByRole("link", { name: "ROAAMM home" }).focus());
    scrollTo(900);
    expect(header).not.toHaveClass("topnav--hidden");
  });
});

describe("Destination carousel keyboard", () => {
  it("arrow keys move one card; Home and End jump to the ends", () => {
    mockReducedMotion(false);
    render(<Landing />);
    const track = screen.getByRole("list", { name: "Destinations" });
    const scrollBy = vi.fn();
    const scrollTo = vi.fn();
    Object.assign(track, { scrollBy, scrollTo });
    Object.defineProperty(track, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(track, "scrollWidth", { value: 1800, configurable: true });
    track.focus();

    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0);
    fireEvent.keyDown(track, { key: "Home" });
    expect(scrollTo.mock.calls[0][0]).toMatchObject({ left: 0 });
    fireEvent.keyDown(track, { key: "End" });
    expect(scrollTo.mock.calls[1][0]).toMatchObject({ left: 1800 });
  });
});

describe("Guide price odometer", () => {
  it("gives assistive tech the exact total once, as it changes", async () => {
    mockReducedMotion(false);
    const user = userEvent.setup();
    render(<Guides />);
    const sofia = screen.getByRole("listitem", { name: "Sofia Marques" });
    const total = within(sofia).getByTestId("total-0");
    expect(accessibleText(total)).toBe("2 hours · Total EUR 56");
    await user.click(within(sofia).getByRole("button", { name: "More hours" }));
    expect(accessibleText(total)).toBe("3 hours · Total EUR 84");
  });
});

describe("Text never waits for animation", () => {
  it("every section's text is in the DOM before any reveal has run", () => {
    mockReducedMotion(false); // motion on, and nothing has scrolled into view yet
    render(<Landing />);
    const text = document.body.textContent ?? "";
    for (const s of [
      "Travel solo.",
      "Never alone.",
      "Meet travellers on your dates",
      "Private, verified, yours",
      "Built for travelling alone",
      "Guides by the hour",
      "Notes from the road",
      "ROAAMM in numbers",
      "Three steps to your first trip",
      "Good questions",
      "Engineering you can check",
      "212k",
      "1,326",
    ]) {
      expect(text).toContain(s);
    }
    // Reveals are hidden only by CSS (opacity/translate), never removed from the DOM.
    const hidden = document.querySelectorAll('[data-reveal="hidden"]');
    expect(hidden.length).toBeGreaterThan(10);
    // Each one carries its content: text, or an accessible name (icon buttons, photos).
    hidden.forEach((el) => {
      const names = [...el.querySelectorAll("[aria-label], img[alt]")]
        .map((n) => n.getAttribute("aria-label") ?? n.getAttribute("alt") ?? "")
        .join("");
      expect((el.textContent ?? "").trim() + names).not.toBe("");
    });
  });
});
