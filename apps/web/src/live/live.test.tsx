import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../components/Toast";
import { mockReducedMotion, restoreMatchMedia } from "../test/mocks";
import { LiveSection } from "./LiveSection";
import { AssistantPanel, ChatPanel, SafetyPanel } from "./panels";
import { ASSISTANT_QUESTION, ASSISTANT_STEPS, CHAT_STEPS, SAFETY_STEPS, total } from "./script";

const noop = () => {};

/** Advances fake time in small steps so effects can schedule the next timer. */
function run(ms: number) {
  for (let t = 0; t < ms; t += 100) act(() => vi.advanceTimersByTime(100));
}

describe("live panels", () => {
  beforeEach(() => {
    mockReducedMotion(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreMatchMedia();
  });

  it("chat reaches its final state: messages, voice note, read receipt", () => {
    const onDone = vi.fn();
    const { container } = render(<ChatPanel playing runKey={0} onDone={onDone} />);
    const panel = container.querySelector(".live-panel")!;
    expect(panel).toHaveAttribute("data-final", "false");
    expect(container.querySelectorAll(".bubble")).toHaveLength(0);

    run(total(CHAT_STEPS) + 200);
    expect(panel).toHaveAttribute("data-final", "true");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".voice")).toBeInTheDocument();
    expect(container.querySelector(".voice__time")).toHaveTextContent("0:14");
    expect(container.querySelector(".ticks")).toHaveTextContent("Read");
    expect(container).toHaveTextContent("End-to-end encrypted");
    expect(container).toHaveTextContent("Safety number");
  });

  it("chat does not advance while paused", () => {
    const { container } = render(<ChatPanel playing={false} runKey={0} onDone={noop} />);
    run(total(CHAT_STEPS) + 200);
    expect(container.querySelector(".live-panel")).toHaveAttribute("data-final", "false");
  });

  it("assistant types the question, then shows three travellers and follow-ups", () => {
    const { container } = render(<AssistantPanel playing runKey={0} onDone={noop} />);
    run(1000);
    const typedSoFar = container.querySelector(".assistant__q")!.textContent!;
    expect(ASSISTANT_QUESTION.startsWith(typedSoFar)).toBe(true);
    expect(typedSoFar.length).toBeLessThan(ASSISTANT_QUESTION.length);

    run(total(ASSISTANT_STEPS) + 200);
    expect(container.querySelector(".assistant__q")).toHaveTextContent(ASSISTANT_QUESTION);
    expect(container.querySelectorAll(".result")).toHaveLength(3);
    expect(container.querySelectorAll(".assistant__chips .chip")).toHaveLength(3);
    expect(screen.getByText(/Simulated answers/)).toBeInTheDocument();
    // The animation is hidden from screen readers; a static summary is not.
    expect(container.querySelector(".assistant")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".visually-hidden")).toHaveTextContent("Aiko from Japan");
  });

  it("safety walks, counts down, then escalates; SOS shows a simulated toast", () => {
    const { container } = render(
      <ToastProvider>
        <SafetyPanel playing runKey={0} onDone={noop} />
      </ToastProvider>,
    );
    const safety = container.querySelector(".safety")!;
    expect(safety).toHaveAttribute("data-phase", "walking");
    run(SAFETY_STEPS[0] + 100);
    expect(safety).toHaveAttribute("data-phase", "counting");
    run(SAFETY_STEPS[1] + 100);
    expect(safety).toHaveAttribute("data-phase", "escalated");

    fireEvent.click(screen.getByRole("button", { name: /SOS/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Your contacts were notified (simulated)");
    expect(screen.getByText("Your contacts were notified (simulated).")).toBeInTheDocument();
  });
});

describe("live panels under reduced motion", () => {
  beforeEach(() => mockReducedMotion(true));
  afterEach(() => restoreMatchMedia());

  it("each panel renders its final state immediately, with no timers", () => {
    const chat = render(<ChatPanel playing runKey={0} onDone={noop} />);
    expect(chat.container.querySelector(".live-panel")).toHaveAttribute("data-final", "true");
    expect(chat.container.querySelector(".ticks")).toHaveTextContent("Read");
    chat.unmount();

    const ai = render(<AssistantPanel playing runKey={0} onDone={noop} />);
    expect(ai.container.querySelector(".assistant__q")).toHaveTextContent(ASSISTANT_QUESTION);
    expect(ai.container.querySelectorAll(".result")).toHaveLength(3);
    ai.unmount();

    const safety = render(<SafetyPanel playing runKey={0} onDone={noop} />);
    expect(safety.container.querySelector(".safety")).toHaveAttribute("data-phase", "escalated");
  });

  it("the section hides play controls (nothing moves)", async () => {
    render(<LiveSection />);
    expect(screen.queryByRole("button", { name: /pause preview/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/48213 90775/)).toBeInTheDocument();
  });
});

describe("LiveSection tabs", () => {
  beforeEach(() => mockReducedMotion(false));
  afterEach(() => restoreMatchMedia());

  it("is a labelled tablist with a simulated badge", async () => {
    render(<LiveSection />);
    const tablist = screen.getByRole("tablist", { name: "Preview" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Encrypted chat", "AI assistant", "Safety tools"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabs[0].id);
    expect(screen.getByText("Simulated preview")).toBeInTheDocument();
    await screen.findByText(/48213 90775/);
  });

  it("supports arrow keys, Home and End with a roving tabindex", async () => {
    const user = userEvent.setup();
    render(<LiveSection />);
    const tabs = screen.getAllByRole("tab");
    await user.click(tabs[0]);

    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("tabindex", "0");
    expect(tabs[0]).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true"); // wraps around

    await user.keyboard("{ArrowLeft}");
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(tabs[2]).toHaveFocus();
    expect(await screen.findByRole("button", { name: /SOS/ })).toBeInTheDocument();
  });

  it("pause stops the preview and replay restarts the panel", async () => {
    const user = userEvent.setup();
    const { container } = render(<LiveSection />);
    const section = container.querySelector("section")!;
    expect(section).toHaveAttribute("data-playing", "true");
    await user.click(screen.getByRole("button", { name: "Pause preview" }));
    expect(section).toHaveAttribute("data-playing", "false");
    expect(screen.getByRole("button", { name: "Play preview" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
  });
});
