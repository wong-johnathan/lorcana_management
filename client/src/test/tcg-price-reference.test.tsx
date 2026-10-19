import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TcgPriceReference from "../components/marketplace/TcgPriceReference";
import type { CardPrice } from "../types";

function price(overrides: Partial<CardPrice> = {}): CardPrice {
  return {
    variant: "Normal",
    lowPrice: 1.5,
    midPrice: 2.0,
    highPrice: 3.5,
    marketPrice: 2.75,
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("TcgPriceReference", () => {
  it("formats the market/low/high figures for the normal variant", () => {
    render(<TcgPriceReference prices={[price()]} variant="normal" />);
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent(
      "TCG market $2.75 (low $1.50 · high $3.50) (USD)"
    );
  });

  it("matches the foil variant via the Cold Foil alias", () => {
    render(
      <TcgPriceReference
        prices={[price({ variant: "Cold Foil", marketPrice: 9.99 })]}
        variant="foil"
      />
    );
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent("TCG market $9.99");
  });

  it("matches the holofoil variant via the Foil alias (case-insensitive)", () => {
    render(
      <TcgPriceReference
        prices={[price({ variant: "foil", marketPrice: 8.5 })]}
        variant="holofoil"
      />
    );
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent("TCG market $8.50");
  });

  it("renders null price fields as em dashes", () => {
    render(
      <TcgPriceReference
        prices={[price({ lowPrice: null, highPrice: null })]}
        variant="normal"
      />
    );
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent(
      "TCG market $2.75 (low — · high —) (USD)"
    );
  });

  it("shows 'No TCG price available' when no entry matches the variant", () => {
    render(<TcgPriceReference prices={[price({ variant: "Foil" })]} variant="normal" />);
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent(
      "No TCG price available"
    );
  });

  it("shows 'No TCG price available' when all fields are null", () => {
    render(
      <TcgPriceReference
        prices={[price({ lowPrice: null, midPrice: null, highPrice: null, marketPrice: null })]}
        variant="normal"
      />
    );
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent(
      "No TCG price available"
    );
  });
});
