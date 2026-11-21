import { render, screen } from "@testing-library/react";
import { Demo } from "./Demo";

describe("Demo", () => {
  it("shows three roles with disabled buttons and an M2 badge", () => {
    render(<Demo />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const role of ["Traveller", "Guide", "Admin"]) {
      expect(screen.getByRole("heading", { level: 2, name: role })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Open as ${role}` })).toBeDisabled();
    }
    expect(screen.getAllByText("Opens in M2")).toHaveLength(3);
    expect(screen.getByText(/Sandbox accounts arrive in the next milestone/)).toBeInTheDocument();
  });
});
