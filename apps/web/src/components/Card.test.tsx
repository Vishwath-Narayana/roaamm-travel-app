import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders children in a div by default", () => {
    render(<Card data-testid="c">Hello</Card>);
    const card = screen.getByTestId("c");
    expect(card.tagName).toBe("DIV");
    expect(card).toHaveClass("card");
    expect(card).not.toHaveClass("card--elevated");
    expect(card).toHaveTextContent("Hello");
  });

  it("supports a semantic element and the elevated style", () => {
    render(
      <Card as="article" elevated aria-label="Feature">
        Body
      </Card>,
    );
    const card = screen.getByRole("article", { name: "Feature" });
    expect(card).toHaveClass("card", "card--elevated");
  });
});
