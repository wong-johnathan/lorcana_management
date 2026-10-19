import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CardGrid from "../components/CardGrid";
import type { Card } from "../types";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: 12345,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Mickey Mouse",
    subtitle: "Brave Little Tailor",
    character: "Mickey Mouse",
    types: ["Hero"],
    cardType: "Character",
    color: "Amber",
    setCode: "SET1",
    setName: "The First Chapter",
    rarity: "Legendary",
    inkCost: 8,
    strength: 5,
    willpower: 5,
    lore: 4,
    abilities: "Evasive",
    cardNumber: "1/204",
    foilTypes: ["None", "Silver"],
    imageUrl: "https://img.example/card.jpg",
    prices: [],
    ...overrides,
  };
}

describe("CardGrid listing-picker props", () => {
  it("renders the set name when showSetName is set", () => {
    render(<CardGrid cards={[makeCard()]} onSelect={vi.fn()} showSetName />);
    expect(screen.getByText("The First Chapter")).toBeInTheDocument();
  });

  it("does not render the set name by default", () => {
    render(<CardGrid cards={[makeCard()]} onSelect={vi.fn()} />);
    expect(screen.queryByText("The First Chapter")).not.toBeInTheDocument();
  });

  it("renders a surplus badge when the card has surplus > 0", () => {
    render(
      <CardGrid
        cards={[makeCard()]}
        onSelect={vi.fn()}
        surplusByCardId={new Map([["card_1", 3]])}
      />
    );
    expect(screen.getByText("3 surplus")).toBeInTheDocument();
  });

  it("omits the surplus badge when surplus is 0 or absent", () => {
    const { rerender } = render(
      <CardGrid
        cards={[makeCard()]}
        onSelect={vi.fn()}
        surplusByCardId={new Map([["card_1", 0]])}
      />
    );
    expect(screen.queryByText(/surplus/)).not.toBeInTheDocument();

    rerender(<CardGrid cards={[makeCard()]} onSelect={vi.fn()} />);
    expect(screen.queryByText(/surplus/)).not.toBeInTheDocument();
  });

  it("keeps default tile rendering unchanged with no new props", () => {
    render(
      <CardGrid
        cards={[makeCard()]}
        onSelect={vi.fn()}
        ownedCardIds={new Set(["card_1"])}
        ownedQuantities={new Map([["card_1", { quantity: 1, foilQuantity: 2, holofoilQuantity: 0 }]])}
      />
    );
    expect(screen.getByText("Mickey Mouse")).toBeInTheDocument();
    expect(screen.getByText("3x")).toBeInTheDocument();
    expect(screen.getByText("1/204")).toBeInTheDocument();
    expect(screen.queryByText("The First Chapter")).not.toBeInTheDocument();
    expect(screen.queryByText(/surplus/)).not.toBeInTheDocument();
  });
});
