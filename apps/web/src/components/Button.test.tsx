import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a button with variant and size classes", () => {
    render(
      <Button variant="secondary" size="lg">
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).toHaveClass("btn", "btn--secondary", "btn--lg");
  });

  it("defaults to primary md", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass("btn--primary", "btn--md");
  });

  it("calls onClick and respects disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Tap</Button>);
    await user.click(screen.getByRole("button", { name: "Tap" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Tap
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Tap" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an <a> when href is given", () => {
    render(
      <Button href="#how-it-works" variant="ghost">
        How it works
      </Button>,
    );
    const link = screen.getByRole("link", { name: "How it works" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "#how-it-works");
    expect(link).toHaveClass("btn--ghost");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("routes same-origin paths without a full page load", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/");
    render(<Button href="/demo">Try demo</Button>);
    await user.click(screen.getByRole("link", { name: "Try demo" }));
    expect(window.location.pathname).toBe("/demo");
  });
});
