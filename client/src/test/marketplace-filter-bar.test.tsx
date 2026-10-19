import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MarketplaceFilterBar from "../components/marketplace/MarketplaceFilterBar";
import type { FilterOptions } from "../types";
import type { MarketplaceControls } from "../utils/marketplaceParams";
import { MARKETPLACE_DEFAULTS } from "../utils/marketplaceParams";

const optionSource: FilterOptions = {
  colors: [],
  sets: [],
  rarities: [],
  cardTypes: ["Character", "Action", "Song"],
  types: ["Hero", "Princess", "Song"],
  costs: [0, 1, 5],
  inkable: ["inkable", "non-inkable"],
};

function renderBar(controls: MarketplaceControls = MARKETPLACE_DEFAULTS) {
  const onChange = vi.fn();
  render(<MarketplaceFilterBar controls={controls} onChange={onChange} optionSource={optionSource} />);
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

  it("renders the four enhanced controls when an optionSource is present", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "All Costs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Types" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Classifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inkable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Non-inkable" })).toBeInTheDocument();
  });

  it("emits cost, type, and classification multi-select patches", async () => {
    const onChange = renderBar();

    await userEvent.click(screen.getByRole("button", { name: "All Costs" }));
    await userEvent.click(screen.getByLabelText("5"));
    expect(onChange).toHaveBeenLastCalledWith({ costs: "5" });

    await userEvent.click(screen.getByRole("button", { name: "All Types" }));
    await userEvent.click(screen.getByLabelText("Action"));
    expect(onChange).toHaveBeenLastCalledWith({ cardTypes: "Action" });

    await userEvent.click(screen.getByRole("button", { name: "All Classifications" }));
    await userEvent.click(screen.getByLabelText("Hero"));
    expect(onChange).toHaveBeenLastCalledWith({ subtypes: "Hero" });
  });

  it("emits an inkable tri-state patch", async () => {
    const onChange = renderBar();
    await userEvent.click(screen.getByRole("button", { name: "Inkable" }));
    expect(onChange).toHaveBeenCalledWith({ inkable: "inkable" });

    await userEvent.click(screen.getByRole("button", { name: "Non-inkable" }));
    expect(onChange).toHaveBeenLastCalledWith({ inkable: "non-inkable" });

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith({ inkable: "" });
  });

  it("search clear-x clears only the query", async () => {
    const onChange = renderBar({ ...MARKETPLACE_DEFAULTS, q: "elsa", variant: "foil" });
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith({ q: "" });
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
      costs: "0,5",
      inkable: "inkable",
      cardTypes: "Action",
      subtypes: "Hero",
    });

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onChange).toHaveBeenCalledWith({
      q: "",
      variant: "",
      condition: "",
      priceMin: "",
      priceMax: "",
      currency: "",
      costs: "",
      inkable: "",
      cardTypes: "",
      subtypes: "",
    });
  });

  it("does not render the Clear all button when no filters are active", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });
});
