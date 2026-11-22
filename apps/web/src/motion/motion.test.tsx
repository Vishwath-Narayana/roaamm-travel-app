import { act, render, screen } from "@testing-library/react";
import { Reveal } from ".";
import { CountUp } from "../pages/landing/Stats";
import {
  installIntersectionObserver,
  intersect,
  isObserved,
  mockReducedMotion,
  restoreMatchMedia,
} from "../test/mocks";

describe("Reveal and useReveal", () => {
  beforeAll(() => installIntersectionObserver());
  afterEach(() => restoreMatchMedia());

  it("stays hidden until it scrolls into view, then reveals once", () => {
    mockReducedMotion(false);
    render(
      <Reveal variant="scale" delay={2} data-testid="r">
        Hello
      </Reveal>,
    );
    const el = screen.getByTestId("r");
    expect(el).toHaveClass("reveal", "reveal--scale");
    expect(el).not.toHaveClass("is-visible");
    expect(el).toHaveAttribute("data-reveal", "hidden");
    expect(el.style.getPropertyValue("--i")).toBe("2");

    act(() => intersect(el));
    expect(el).toHaveClass("is-visible");
    expect(el).toHaveAttribute("data-reveal", "shown");
    // "once": no longer observed after the first reveal.
    expect(isObserved(el)).toBe(false);
  });

  it("ignores entries that are not intersecting", () => {
    mockReducedMotion(false);
    render(<Reveal data-testid="r">Hi</Reveal>);
    const el = screen.getByTestId("r");
    act(() => intersect(el, false));
    expect(el).not.toHaveClass("is-visible");
  });

  it("shows the final state straight away under reduced motion", () => {
    mockReducedMotion(true);
    render(
      <Reveal as="li" data-testid="r">
        Hi
      </Reveal>,
    );
    const el = screen.getByTestId("r");
    expect(el.tagName).toBe("LI");
    expect(el).toHaveClass("is-visible");
    expect(isObserved(el)).toBe(false);
  });
});

describe("CountUp", () => {
  beforeAll(() => installIntersectionObserver());
  afterEach(() => {
    vi.useRealTimers();
    restoreMatchMedia();
  });

  it("counts up once visible and ends on the exact number", () => {
    mockReducedMotion(false);
    vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { container } = render(<CountUp value="1,326" />);
    const anim = screen.getByTestId("count-anim");
    // The real number is always in the DOM for screen readers and tests.
    expect(screen.getByText("1,326", { selector: ".visually-hidden" })).toBeInTheDocument();
    expect(anim).toHaveTextContent("0");

    act(() => intersect(container.querySelector(".count-up")!));
    act(() => vi.advanceTimersByTime(500));
    const mid = Number(anim.textContent!.replace(/,/g, ""));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1326);

    act(() => vi.advanceTimersByTime(1000));
    expect(anim).toHaveTextContent(/^1,326$/);
  });

  it("keeps a suffix and shows the final value at once under reduced motion", () => {
    mockReducedMotion(true);
    render(<CountUp value="212k" />);
    expect(screen.getByTestId("count-anim")).toHaveTextContent(/^212k$/);
  });
});

/** The text a screen reader can reach: everything except aria-hidden parts. */
function accessibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("CountUp accessibility", () => {
  beforeAll(() => installIntersectionObserver());
  afterEach(() => restoreMatchMedia());

  it("exposes only the final value, never the animated digits", () => {
    mockReducedMotion(false);
    const { container } = render(<CountUp value="212k" />);
    const root = container.querySelector(".count-up")!;
    // Before it animates, the visible digits say 0k...
    expect(screen.getByTestId("count-anim")).toHaveTextContent("0k");
    expect(screen.getByTestId("count-anim")).toHaveAttribute("aria-hidden", "true");
    // ...but assistive tech only ever gets the real number, once.
    expect(accessibleText(root)).toBe("212k");
    expect(root.getAttribute("aria-label")).toBeNull();
  });

  it("stats rows read as label and final value only", async () => {
    mockReducedMotion(false);
    const { Stats } = await import("../pages/landing/Stats");
    render(<Stats />);
    const values = [...document.querySelectorAll("dd")].map(accessibleText);
    expect(values).toEqual(["212k", "1,326", "41", "58k"]);
    document.querySelectorAll("dd").forEach((dd) => expect(dd.getAttribute("aria-label")).toBeNull());
  });
});
