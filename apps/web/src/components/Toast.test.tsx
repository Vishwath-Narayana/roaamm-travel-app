import { act, render, screen } from "@testing-library/react";
import { ToastProvider, useToast, DEFAULT_TOAST_MS } from "./Toast";

function Trigger({ duration }: { duration?: number }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show("Saved", { duration })}>
      Notify
    </button>
  );
}

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces in a polite live region and auto-dismisses", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");

    act(() => screen.getByRole("button", { name: "Notify" }).click());
    expect(region).toHaveTextContent("Saved");

    act(() => vi.advanceTimersByTime(DEFAULT_TOAST_MS - 1));
    expect(region).toHaveTextContent("Saved");
    act(() => vi.advanceTimersByTime(1));
    expect(region).not.toHaveTextContent("Saved");
  });

  it("honours a custom duration and can be dismissed early", () => {
    render(
      <ToastProvider>
        <Trigger duration={60_000} />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "Notify" }).click());
    act(() => vi.advanceTimersByTime(DEFAULT_TOAST_MS));
    expect(screen.getByText("Saved")).toBeInTheDocument();

    act(() => screen.getByRole("button", { name: "Dismiss notification" }).click());
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("throws a clear error outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/inside <ToastProvider>/);
  });
});
