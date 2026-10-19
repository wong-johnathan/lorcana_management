import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StarRating from "../components/marketplace/StarRating";

describe("StarRating", () => {
  it("renders an accessible radiogroup with five labelled options (a11y)", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1 star" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "2 stars" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "3 stars" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "4 stars" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 stars" })).toBeInTheDocument();
  });

  it("reflects the selected value and disables the control when disabled", () => {
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} disabled />);

    expect(screen.getByRole("radio", { name: "5 stars" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "1 star" })).toBeDisabled();
  });

  it("changes the value on ArrowRight (keyboard-operable)", async () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);

    screen.getByRole("radio", { name: "3 stars" }).focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("changes the value on ArrowLeft (keyboard-operable)", async () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);

    screen.getByRole("radio", { name: "3 stars" }).focus();
    await userEvent.keyboard("{ArrowLeft}");

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("ignores non-arrow keys", async () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);

    screen.getByRole("radio", { name: "3 stars" }).focus();
    await userEvent.keyboard("a");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("selects a value when the radio is clicked", async () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));

    expect(onChange).toHaveBeenCalledWith(5);
  });
});
