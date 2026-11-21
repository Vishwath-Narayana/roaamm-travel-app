import { render, screen } from "@testing-library/react";
import { App } from "./App";
import { SERVICES } from "./services";

describe("App", () => {
  it("renders the wordmark", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "ROAAMM" })).toBeInTheDocument();
  });

  it("lists every deployed service", () => {
    render(<App />);
    expect(screen.getAllByRole("listitem")).toHaveLength(SERVICES.length);
  });

  it("uses first-level plinthwell.com subdomains only", () => {
    for (const s of SERVICES) {
      expect(new URL(s.url).host).toMatch(/^roaamm(-[a-z]+)?\.plinthwell\.com$/);
    }
  });
});
