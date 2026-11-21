import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";

describe("Input", () => {
  it("wires the label to the input", async () => {
    const user = userEvent.setup();
    render(<Input label="Email" />);
    const input = screen.getByLabelText("Email");
    await user.type(input, "a@b.co");
    expect(input).toHaveValue("a@b.co");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("describes the input with its hint", () => {
    render(<Input label="City" hint="Where you are going" id="city" />);
    const input = screen.getByLabelText("City");
    expect(input).toHaveAttribute("id", "city");
    expect(input).toHaveAccessibleDescription("Where you are going");
  });

  it("marks the input invalid and describes it with hint and error", () => {
    render(<Input label="Dates" hint="Start and end" error="End is before start" />);
    const input = screen.getByLabelText("Dates");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Start and end End is before start");
  });

  it("gives two inputs distinct ids", () => {
    render(
      <>
        <Input label="A" />
        <Input label="B" />
      </>,
    );
    expect(screen.getByLabelText("A").id).not.toBe(screen.getByLabelText("B").id);
  });
});
