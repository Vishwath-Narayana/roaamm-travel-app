import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Landing } from "./Landing";
import { DESTINATIONS } from "./landing/data";

/** Installs a matchMedia stub; `reduce` controls prefers-reduced-motion. */
function mockMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

describe("Landing", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    mockMotion(false);
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("has exactly one h1, with the serif phrase inside it", () => {
    render(<Landing />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Travel solo. Never alone.");
    expect(within(h1s[0]).getByText("Never alone.").closest(".serif")).not.toBeNull();
  });

  it("hero buttons go to the demo and to the how-it-works section", () => {
    render(<Landing />);
    const hero = screen.getByRole("region", { name: "Travel solo. Never alone." });
    expect(within(hero).getByRole("link", { name: "Try demo" })).toHaveAttribute("href", "/demo");
    expect(within(hero).getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
    expect(document.getElementById("how-it-works")).toBeInTheDocument();
  });

  it("every image has alt text and explicit width and height", () => {
    render(<Landing />);
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBeGreaterThan(5);
    imgs.forEach((img) => {
      expect(img.hasAttribute("alt")).toBe(true);
      expect(Number(img.getAttribute("width"))).toBeGreaterThan(0);
      expect(Number(img.getAttribute("height"))).toBeGreaterThan(0);
    });
    // Only the first hero photo is eager and high priority.
    const eager = [...imgs].filter((i) => i.getAttribute("loading") === "eager");
    expect(eager).toHaveLength(1);
    expect(eager[0]).toHaveAttribute("fetchpriority", "high");
  });

  it("every simulated number sits next to a 'Simulated data' label", () => {
    render(<Landing />);
    const numbers = document.querySelectorAll("[data-simulated]");
    // 6 destination counts + 3 meters + 4 stats
    expect(numbers).toHaveLength(DESTINATIONS.length + 3 + 4);
    // The guides section anchors the nav's Guides link.
    expect(document.getElementById("guides")).toHaveAttribute("aria-labelledby", "guides-title");
    numbers.forEach((n) => {
      const scope = n.closest("[data-simulated-scope]");
      expect(scope, `no scope for ${n.textContent}`).not.toBeNull();
      expect(within(scope as HTMLElement).getByText("Simulated data")).toBeInTheDocument();
    });
    const stats = screen.getByRole("region", { name: "ROAAMM in numbers" });
    for (const v of ["212k", "1,326", "41", "58k"])
      expect(within(stats).getByText(v)).toBeInTheDocument();
  });

  it("every simulated block carries a 'Simulated' label", () => {
    render(<Landing />);
    const scopes = document.querySelectorAll("[data-simulated-scope]");
    // destinations (6), community health, live preview, guides, stories, stats
    expect(scopes.length).toBeGreaterThanOrEqual(11);
    scopes.forEach((scope) => {
      expect(within(scope as HTMLElement).getAllByText(/^Simulated/).length).toBeGreaterThan(0);
    });
  });

  it("claims scale honestly", () => {
    render(<Landing />);
    expect(
      screen.getByText(/Designed for 50,000 concurrent users; load test planned \(M11\)/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/50,000 (users|travellers) (use|trust)/i);
  });

  it("keeps the nav targets and the four features", () => {
    render(<Landing />);
    for (const id of ["features", "safety", "guides", "live", "build", "how-it-works"]) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
    const features = screen.getByRole("region", { name: "Built for travelling alone" });
    for (const t of [
      "Meet on your dates",
      "Licensed local guides",
      "Real local prices",
      "Safety built in",
    ]) {
      expect(
        within(features).getAllByRole("heading", { level: 3, name: t }).length,
      ).toBeGreaterThan(0);
    }
    const how = screen.getByRole("region", { name: "Three steps to your first trip" });
    expect(within(how).getAllByRole("listitem")).toHaveLength(3);
  });

  it("the preview search only opens the demo, and says so", async () => {
    const user = userEvent.setup();
    render(<Landing />);
    const search = screen.getByRole("search", { name: /preview/i });
    const submit = within(search).getByRole("button", { name: "Search" });
    expect(submit).toHaveAccessibleDescription(
      /opens the demo, search arrives in a later milestone/i,
    );
    await user.click(submit);
    expect(window.location.pathname).toBe("/demo");
  });
});

describe("Hero carousel", () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const counter = () => screen.getByText(/of/, { selector: ".hero__count *" }).parentElement!;

  it("next and previous move between the three photos and wrap", async () => {
    mockMotion(false);
    const user = userEvent.setup();
    render(<Landing />);
    expect(counter()).toHaveTextContent("Photo 1/ of 3");
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    expect(counter()).toHaveTextContent("Photo 2/ of 3");
    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(counter()).toHaveTextContent("Photo 3/ of 3");
  });

  it("autoplays when motion is allowed, and the pause button stops it", async () => {
    mockMotion(false);
    const user = userEvent.setup();
    render(<Landing />);
    const carousel = screen.getByRole("group", { name: "Hero photos" });
    expect(carousel).toHaveAttribute("data-playing", "true");

    // The progress bar's animation ending is what advances the slide.
    act(() => fireEvent.animationEnd(screen.getByTestId("hero-progress")));
    expect(counter()).toHaveTextContent("Photo 2/ of 3");

    await user.click(screen.getByRole("button", { name: "Pause slideshow" }));
    expect(carousel).toHaveAttribute("data-playing", "false");
    expect(screen.getByTestId("hero-progress")).not.toHaveClass("is-timed");
  });

  it("does not autoplay under prefers-reduced-motion", () => {
    mockMotion(true);
    render(<Landing />);
    const carousel = screen.getByRole("group", { name: "Hero photos" });
    expect(carousel).toHaveAttribute("data-playing", "false");
    expect(screen.getByTestId("hero-progress")).not.toHaveClass("is-timed");
    expect(screen.queryByRole("button", { name: /pause slideshow/i })).not.toBeInTheDocument();
    // Manual controls still work.
    expect(screen.getByRole("button", { name: "Next photo" })).toBeEnabled();
  });
});

describe("Destinations carousel", () => {
  beforeEach(() => mockMotion(false));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("shows six cards and scrolls with the prev and next buttons", () => {
    render(<Landing />);
    const track = screen.getByRole("list", { name: "Destinations" });
    expect(within(track).getAllByRole("listitem")).toHaveLength(6);
    expect(track).toHaveAttribute("tabindex", "0"); // keyboard scrollable

    // jsdom has no layout: give the track a size and record scroll calls.
    const scrollBy = vi.fn();
    Object.assign(track, { scrollBy });
    Object.defineProperty(track, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(track, "scrollWidth", { value: 1800, configurable: true });
    track.scrollLeft = 0;
    fireEvent.scroll(track);

    const prev = screen.getByRole("button", { name: "Previous destinations" });
    const next = screen.getByRole("button", { name: "Next destinations" });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);

    track.scrollLeft = 1500;
    fireEvent.scroll(track);
    expect(next).toBeDisabled();
    expect(prev).toBeEnabled();
    fireEvent.click(prev);
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0);
  });

  it("each card links to the demo and labels its count as simulated", () => {
    render(<Landing />);
    for (const d of DESTINATIONS) {
      const link = screen.getByRole("link", { name: d.title });
      expect(link).toHaveAttribute("href", "/demo");
      const card = link.closest("li")!;
      expect(within(card).getByText(d.country)).toBeInTheDocument();
      expect(within(card).getByText("Simulated data")).toBeInTheDocument();
    }
  });
});
