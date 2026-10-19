import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TriStateToggle from "../components/TriStateToggle";

describe("TriStateToggle", () => {
  it("renders All/Inkable/Non-inkable and reflects the empty value", () => {
    render(<TriStateToggle value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Inkable" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Non-inkable" })).toHaveAttribute("aria-pressed", "false");
  });

  it("emits the selected value and clears back to empty on All", async () => {
    const onChange = vi.fn();
    render(<TriStateToggle value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Inkable" }));
    expect(onChange).toHaveBeenCalledWith("inkable");

    await userEvent.click(screen.getByRole("button", { name: "Non-inkable" }));
    expect(onChange).toHaveBeenCalledWith("non-inkable");

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("marks the active option pressed", () => {
    render(<TriStateToggle value="non-inkable" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Non-inkable" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Inkable" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });
});
