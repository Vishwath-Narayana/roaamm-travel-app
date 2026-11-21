import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders the default badge without an icon", () => {
    render(<Badge>Simulated data</Badge>);
    const badge = screen.getByText("Simulated data");
    expect(badge).toHaveClass("badge", "badge--default");
    expect(screen.queryByTestId("badge-check")).not.toBeInTheDocument();
  });

  it("renders the verified badge with a decorative check icon", () => {
    render(<Badge variant="verified">Verified</Badge>);
    const badge = screen.getByText("Verified");
    expect(badge).toHaveClass("badge--verified");
    const icon = screen.getByTestId("badge-check");
    expect(badge).toContainElement(icon);
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
