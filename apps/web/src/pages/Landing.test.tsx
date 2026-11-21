import { render, screen, within } from "@testing-library/react";
import { Landing } from "./Landing";

describe("Landing", () => {
  beforeEach(() => render(<Landing />));

  it("has exactly one h1", () => {
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Travel solo. Never alone.");
  });

  it("labels the stats as simulated data", () => {
    const stats = screen.getByRole("region", { name: "ROAAMM in numbers" });
    expect(within(stats).getByText("Simulated data")).toBeInTheDocument();
    for (const n of ["212k", "1,326", "41"]) expect(within(stats).getByText(n)).toBeInTheDocument();
  });

  it("links the hero actions to the demo and the how-it-works section", () => {
    const hero = screen.getByRole("region", { name: "Travel solo. Never alone." });
    expect(within(hero).getByRole("link", { name: "Try demo" })).toHaveAttribute("href", "/demo");
    expect(within(hero).getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
    expect(document.getElementById("how-it-works")).toBeInTheDocument();
    expect(within(hero).getByRole("img", { name: /photo placeholder/i })).toBeInTheDocument();
  });

  it("shows the four features and three steps", () => {
    for (const t of [
      "Meet on your dates",
      "Licensed local guides",
      "Real local prices",
      "Safety built in",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: t })).toBeInTheDocument();
    }
    const how = screen.getByRole("region", { name: "How it works" });
    expect(within(how).getAllByRole("listitem")).toHaveLength(3);
  });

  it("has targets for every nav anchor", () => {
    for (const id of ["features", "safety", "guides"]) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
  });
});
