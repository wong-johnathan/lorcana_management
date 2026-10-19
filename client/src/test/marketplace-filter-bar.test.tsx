import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MarketplaceFilterBar from "../components/marketplace/MarketplaceFilterBar";
import type { MarketplaceControls } from "../utils/marketplaceParams";
import { MARKETPLACE_DEFAULTS } from "../utils/marketplaceParams";

function renderBar(controls: MarketplaceControls = MARKETPLACE_DEFAULTS) {
  const onChange = vi.fn();
  render(<MarketplaceFilterBar controls={controls} onChange={onChange} />);
  return onChange;
}

describe("MarketplaceFilterBar", () => {
  it("emits patches for condition, currency, and max price changes", async () => {
    const onChange = renderBar();

    await userEvent.selectOptions(screen.getByLabelText("Condition"), "NM");
    expect(onChange).toHaveBeenCalledWith({ condition: "NM" });

    await userEvent.selectOptions(screen.getByLabelText("Currency"), "EUR");
    expect(onChange).toHaveBeenCalledWith({ currency: "EUR" });

    fireEvent.change(screen.getByLabelText("Max price"), { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith({ priceMax: "50" });
  });

  it("renders and clears active filters via the Clear all button", async () => {
    const onChange = renderBar({
      ...MARKETPLACE_DEFAULTS,
      q: "elsa",
      variant: "foil",
      condition: "NM",
      priceMin: "10",
      priceMax: "50",
      currency: "USD",
    });

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onChange).toHaveBeenCalledWith({
      q: "",
      variant: "",
      condition: "",
      priceMin: "",
      priceMax: "",
      currency: "",
    });
  });

  it("does not render the Clear all button when no filters are active", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });
});
