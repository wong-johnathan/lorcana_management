import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CardGrid from "../components/CardGrid";
import CardDetail from "../components/CardDetail";
import CardPriceTable from "../components/CardPriceTable";
import MarketplaceLink from "../components/MarketplaceLink";
import type { Card } from "../types";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: 12345,
    cardTraderUrl: "https://cardtrader.example/card",
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
    cardNumber: "1/204 • EN • 1",
    foilTypes: ["None", "Silver", "Lava"],
    imageUrl: "https://img.example/card.jpg",
    prices: [
      { variant: "Cold Foil", lowPrice: 5, midPrice: 6, highPrice: 7, marketPrice: 8, updatedAt: "2026-01-01T00:00:00Z" },
      { variant: "Normal", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4, updatedAt: "2026-01-02T00:00:00Z" },
    ],
    ...overrides,
  };
}

describe("presentational components", () => {
  it("renders empty card grids and card metadata/price badges", () => {
    render(<CardGrid cards={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No cards found.")).toBeInTheDocument();

    render(<CardGrid cards={[makeCard()]} onSelect={vi.fn()} ownedCardIds={new Set(["card_1"])} ownedQuantities={new Map([["card_1", { quantity: 1, foilQuantity: 2, holofoilQuantity: 3 }]])} />);
    expect(screen.getAllByText("Mickey Mouse")[0]).toBeInTheDocument();
    expect(screen.getByText("6x")).toBeInTheDocument();
    expect(screen.getByText("$4.00")).toBeInTheDocument();
  });

  it("renders context-specific price labels and quantity steppers without triggering card selection", async () => {
    const onSelect = vi.fn();
    const onQuantityChange = vi.fn();
    const card = makeCard({ prices: [{ variant: "Cold Foil", lowPrice: 5, midPrice: 6, highPrice: 7, marketPrice: null, updatedAt: "2026-01-01T00:00:00Z" }] });

    render(
      <CardGrid
        cards={[card]}
        onSelect={onSelect}
        ownedQuantities={new Map([["card_1", { quantity: 0, foilQuantity: 1, holofoilQuantity: 0 }]])}
        onQuantityChange={onQuantityChange}
        updatingQuantityKeys={new Set(["card_1:foil"])}
        priceContext={{ variant: "Foil", priceField: "marketPrice", status: "missing" }}
      />
    );

    expect(screen.getByText("Missing Foil")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /add normal card/i }));
    expect(onQuantityChange).toHaveBeenCalledWith(card, "normal", 1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /add foil card/i })).toBeDisabled();

    await userEvent.click(screen.getByText("Mickey Mouse"));
    expect(onSelect).toHaveBeenCalledWith(card);
  });



  it("covers quantity row decreases and priced context rendering", async () => {
    const onQuantityChange = vi.fn();
    const card = makeCard({ imageUrl: "", subtitle: "", prices: [{ variant: "Cold Foil", lowPrice: 5, midPrice: 6, highPrice: 7, marketPrice: 8, updatedAt: "2026-01-01T00:00:00Z" }] });
    render(
      <CardGrid
        cards={[card]}
        onSelect={vi.fn()}
        ownedQuantities={new Map([["card_1", { quantity: 1, foilQuantity: 2, holofoilQuantity: 3 }]])}
        onQuantityChange={onQuantityChange}
        priceContext={{ variant: "Foil", priceField: "marketPrice", status: "priced" }}
      />
    );

    expect(screen.getAllByText("Mickey Mouse")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Foil")[0]).toBeInTheDocument();
    expect(screen.getByText("$8.00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove normal card/i }));
    await userEvent.click(screen.getByRole("button", { name: /remove foil card/i }));
    await userEvent.click(screen.getByRole("button", { name: /add foil card/i }));
    await userEvent.click(screen.getByRole("button", { name: /remove holofoil card/i }));
    await userEvent.click(screen.getByRole("button", { name: /add holofoil card/i }));
    expect(onQuantityChange).toHaveBeenCalledWith(card, "normal", -1);
    expect(onQuantityChange).toHaveBeenCalledWith(card, "foil", -1);
    expect(onQuantityChange).toHaveBeenCalledWith(card, "foil", 1);
    expect(onQuantityChange).toHaveBeenCalledWith(card, "holofoil", -1);
    expect(onQuantityChange).toHaveBeenCalledWith(card, "holofoil", 1);
  });



  it("covers fallback visual branches for cards and prices", () => {
    const onSelect = vi.fn();
    const fallbackCard = makeCard({
      id: "card_fallback",
      color: "Unknown",
      imageUrl: "",
      prices: [{ variant: "Cold Foil", lowPrice: 1, midPrice: null, highPrice: null, marketPrice: 9, updatedAt: "2026-01-01T00:00:00Z" }],
    });
    render(<CardGrid cards={[fallbackCard]} onSelect={onSelect} />);
    expect(screen.getByText("$9.00")).toBeInTheDocument();
    expect(screen.queryByText(/x$/)).not.toBeInTheDocument();

    render(<CardPriceTable prices={[
      { variant: "Enchanted", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4, updatedAt: "" },
      { variant: "Cold Foil", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4, updatedAt: "" },
    ]} />);
    expect(screen.getAllByText("$4.00").length).toBeGreaterThan(0);
  });

  it("renders marketplace links as links or unavailable buttons", () => {
    const { rerender } = render(<MarketplaceLink href="https://example.com" label="Shop" colorClass="tone" />);
    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute("href", "https://example.com");
    rerender(<MarketplaceLink href={null} label="Shop" colorClass="tone" />);
    expect(screen.getByRole("button", { name: /shop unavailable/i })).toBeDisabled();
  });

  it("renders price tables sorted with Normal first and empty tables as null", () => {
    const { container, rerender } = render(<CardPriceTable prices={makeCard().prices} compact />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText("$4.00")).toBeInTheDocument();
    rerender(<CardPriceTable prices={[{ variant: "Normal", lowPrice: null, midPrice: null, highPrice: null, marketPrice: null, updatedAt: "" }]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    rerender(<CardPriceTable prices={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders CardDetail links, collection counts, add form, and navigation action", async () => {
    const onClose = vi.fn();
    const onAdd = vi.fn();
    render(
      <MemoryRouter>
        <CardDetail card={makeCard()} onClose={onClose} onAdd={onAdd} currentQuantity={{ quantity: 1, foilQuantity: 0, holofoilQuantity: 2 }} />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Mickey Mouse" })).toBeInTheDocument();
    expect(screen.getByText("In your collection:")).toBeInTheDocument();
    expect(screen.getByText("1 normal, 2 holofoil")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sold/i })).toHaveAttribute("href", expect.stringContaining("1%2F204"));
    expect(screen.getByRole("link", { name: /tcgplayer/i })).toHaveAttribute("href", "https://www.tcgplayer.com/product/12345");
    expect(screen.getByRole("link", { name: /cardtrader/i })).toHaveAttribute("href", "https://cardtrader.example/card");
    expect(screen.getByRole("button", { name: /cardmarket unavailable/i })).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/normal qty/i));
    await userEvent.type(screen.getByLabelText(/normal qty/i), "2");
    await userEvent.click(screen.getByRole("button", { name: "Add to Inventory" }));
    expect(onAdd).toHaveBeenCalledWith("card_1", 2, 0, 0);
    expect(screen.getByRole("button", { name: "Added!" })).toBeInTheDocument();

    await userEvent.click(screen.getByText("×"));
    expect(onClose).toHaveBeenCalled();
  });



  it("normalizes CardDetail numeric fields on blur and navigates to detail", async () => {
    const onClose = vi.fn();
    const onAdd = vi.fn();
    render(
      <MemoryRouter>
        <CardDetail card={makeCard()} onClose={onClose} onAdd={onAdd} />
      </MemoryRouter>
    );
    await userEvent.clear(screen.getByLabelText("Foil qty"));
    await userEvent.tab();
    expect(screen.getByLabelText("Foil qty")).toHaveValue(0);
    await userEvent.clear(screen.getByLabelText("Holofoil qty"));
    await userEvent.type(screen.getByLabelText("Holofoil qty"), "5");
    await userEvent.tab();
    expect(screen.getByLabelText("Holofoil qty")).toHaveValue(5);
    await userEvent.click(screen.getByRole("button", { name: /view more/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("defaults CardDetail add quantities to first available variant and blocks zero-count adds", async () => {
    const onAdd = vi.fn();
    render(
      <MemoryRouter>
        <CardDetail card={makeCard({ foilTypes: ["Lava"], imageUrl: "", prices: [] })} onClose={vi.fn()} onAdd={onAdd} />
      </MemoryRouter>
    );

    expect(screen.queryByLabelText(/normal qty/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Foil qty")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/holofoil qty/i)).toHaveValue(1);
    await userEvent.clear(screen.getByLabelText(/holofoil qty/i));
    await userEvent.type(screen.getByLabelText(/holofoil qty/i), "0");
    expect(screen.getByRole("button", { name: "Add to Inventory" })).toBeDisabled();
  });
});
