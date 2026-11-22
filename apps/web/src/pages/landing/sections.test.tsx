import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CHECK_TIMEOUT_MS, LIVE_HOST, SAMPLES, StatusRow, median } from "../../components/StatusRow";
import { SERVICES } from "../../services";
import { Faq } from "./Faq";
import { GUIDES, Guides, money } from "./Guides";

describe("Guides stepper", () => {
  it("updates the total live and stays between 1 and 4 hours", async () => {
    const user = userEvent.setup();
    render(<Guides />);
    const sofia = screen.getByRole("listitem", { name: "Sofia Marques" });
    const total = within(sofia).getByTestId("total-0");
    expect(total).toHaveTextContent("2 hours · Total EUR 56");

    const more = within(sofia).getByRole("button", { name: "More hours" });
    const fewer = within(sofia).getByRole("button", { name: "Fewer hours" });
    await user.click(more);
    expect(total).toHaveTextContent("3 hours · Total EUR 84");
    await user.click(more);
    expect(total).toHaveTextContent("4 hours · Total EUR 112");
    expect(more).toBeDisabled();

    await user.click(fewer);
    await user.click(fewer);
    await user.click(fewer);
    expect(total).toHaveTextContent("1 hour · Total EUR 28");
    expect(fewer).toBeDisabled();
  });

  it("formats big local currencies and keeps Book disabled with an honest note", () => {
    render(<Guides />);
    expect(money("VND", 350000 * 2)).toBe("VND 700,000");
    const linh = screen.getByRole("listitem", { name: "Linh Tran" });
    expect(within(linh).getByText("VND 350,000")).toBeInTheDocument();
    for (const g of GUIDES) {
      const card = screen.getByRole("listitem", { name: g.name });
      expect(within(card).getByText("Licence checked")).toBeInTheDocument();
      const book = within(card).getByRole("button", { name: "Book" });
      expect(book).toBeDisabled();
      expect(book).toHaveAccessibleDescription("Booking opens in a later milestone.");
    }
    // One shared caption instead of a note under every card.
    expect(screen.getAllByText("Booking opens in a later milestone.")).toHaveLength(1);
    expect(screen.queryByText("Opens in a later milestone")).not.toBeInTheDocument();
    expect(screen.getByText("Simulated profiles")).toBeInTheDocument();
  });
});

describe("FAQ", () => {
  afterEach(() => vi.useRealTimers());

  it("has six questions, including an honest one, and opens and closes", () => {
    vi.useFakeTimers();
    render(<Faq />);
    const items = document.querySelectorAll("details");
    expect(items).toHaveLength(6);
    const real = [...items].find((d) => d.textContent!.includes("Is this a real product?"))!;
    expect(real).toHaveTextContent("ROAAMM is a portfolio project");

    const summary = real.querySelector("summary")!;
    fireEvent.click(summary);
    expect(real.open).toBe(true);
    expect(real).toHaveAttribute("data-expanded", "true");

    fireEvent.click(summary);
    expect(real).toHaveAttribute("data-expanded", "false");
    expect(real.open).toBe(true); // stays open while it animates shut
    act(() => vi.advanceTimersByTime(400));
    expect(real.open).toBe(false);
  });

  it("links to the source code", () => {
    render(<Faq />);
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      expect.stringContaining("github.com/Vishwath-Narayana/roaamm-travel-app"),
    );
  });
});

describe("StatusRow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("makes no request unless the hostname is the live site", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const host of ["localhost", "127.0.0.1", "roaamm-status.plinthwell.com", "evil.example"]) {
      const { unmount } = render(<StatusRow host={host} />);
      unmount();
    }
    render(<StatusRow host="localhost" />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getAllByText("Checked on the live site")).toHaveLength(2);
    expect(screen.getByText("Not deployed yet")).toBeInTheDocument();
  });

  it("on the live site, times the edge and status page but never the Core API", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        String(input).includes("roaamm-rt")
          ? new Response(JSON.stringify({ status: "ok" }), { status: 200 })
          : new Response(null, { status: 200 }),
      );
    render(<StatusRow host={LIVE_HOST} />);
    await waitFor(() => expect(screen.getAllByText(/^Up · \d+ ms$/)).toHaveLength(2));

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    const url = (name: string) => SERVICES.find((s) => s.name === name)!.url;
    // One warm-up plus SAMPLES timed requests per service; never the Core API.
    expect(urls.filter((u) => u === url("edge"))).toHaveLength(1 + SAMPLES);
    expect(urls.filter((u) => u === url("status"))).toHaveLength(1 + SAMPLES);
    expect(urls).not.toContain(url("api"));
    for (const [input, init] of fetchSpy.mock.calls) {
      expect(init).toMatchObject({ mode: String(input) === url("edge") ? "cors" : "no-cors" });
    }
    expect(screen.getByText("Not deployed yet")).toBeInTheDocument();
    expect(screen.getByText(/measured from your browser/)).toBeInTheDocument();
  });

  it("reports the median of the timed samples", () => {
    expect(median([396, 116, 104])).toBe(116);
    expect(median([575, 104])).toBe(340);
    expect(median([42])).toBe(42);
  });

  it("shows failures and timeouts as unreachable, silently", async () => {
    vi.spyOn(console, "error");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          // Never answers: only the 3 s abort ends it.
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<StatusRow host={LIVE_HOST} />);
    expect(screen.getAllByText("Checking")).toHaveLength(2);
    await act(async () => {
      vi.advanceTimersByTime(CHECK_TIMEOUT_MS + 10);
    });
    await waitFor(() => expect(screen.getAllByText("Unreachable")).toHaveLength(2));
    expect(console.error).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
