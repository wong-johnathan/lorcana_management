import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import CardGrid from "../components/CardGrid";
import CardDetail from "../components/CardDetail";
import CardPriceTable from "../components/CardPriceTable";
import MarketplaceLink from "../components/MarketplaceLink";
import InventoryTabs from "../components/inventory/InventoryTabs";
import CollectionStatsPanel from "../components/inventory/CollectionStatsPanel";
import InventoryCollectionView, {
  type InventoryCollectionCapabilities,
} from "../components/inventory/InventoryCollectionView";
import { parseInventoryTab } from "../utils/inventoryTabs";
import type { Card, InventoryEntry, InventoryStats } from "../types";

vi.mock("../components/FilterBar", () => ({
  default: ({ onChange }: { filters: Record<string, string>; onChange: (filters: Record<string, string>) => void }) => (
    <button type="button" onClick={() => onChange({ search: "mickey" })}>
      Mock filters
    </button>
  ),
}));

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

function makeInventoryEntry(overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  const card = overrides.card ?? makeCard();
  return {
    id: "entry_1",
    userId: "user_1",
    cardId: card.id,
    card,
    quantity: 1,
    foilQuantity: 2,
    holofoilQuantity: 0,
    ...overrides,
  };
}

const editableCapabilities: InventoryCollectionCapabilities = {
  canEditQuantities: true,
  canRemoveCards: true,
  canWipeInventory: true,
  canExportCsv: true,
  canSwitchViewMode: true,
};

const readOnlyCapabilities: InventoryCollectionCapabilities = {
  canEditQuantities: false,
  canRemoveCards: false,
  canWipeInventory: false,
  canExportCsv: false,
  canSwitchViewMode: false,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ colors: [], sets: [], rarities: [], cardTypes: [], types: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("presentational components", () => {
  it("parses inventory tab query values and renders controlled tab buttons", async () => {
    const onTabChange = vi.fn();

    expect(parseInventoryTab(null)).toBe("collection");
    expect(parseInventoryTab("bad-tab")).toBe("collection");
    expect(parseInventoryTab("stats")).toBe("stats");

    const { rerender } = render(<InventoryTabs activeTab="collection" onTabChange={onTabChange} />);
    expect(screen.getByRole("tab", { name: "Collection" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Stats" })).toHaveAttribute("aria-selected", "false");

    await userEvent.click(screen.getByRole("tab", { name: "Stats" }));
    expect(onTabChange).toHaveBeenCalledWith("stats");

    expect(parseInventoryTab("profile")).toBe("profile");
    rerender(<InventoryTabs activeTab="profile" onTabChange={onTabChange} showProfile />);
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Collection" }));
    expect(onTabChange).toHaveBeenCalledWith("collection");

    rerender(<InventoryTabs activeTab="stats" onTabChange={onTabChange} collectionLabel="Cards" statsLabel="Numbers" />);
    await userEvent.click(screen.getByRole("tab", { name: "Cards" }));
    expect(onTabChange).toHaveBeenCalledWith("collection");
  });

  it("renders collection stats and set breakdown including missing price warning", () => {
    const stats: InventoryStats = {
      totalUnique: 3,
      totalCards: 7,
      totalValue: 12.5,
      missingPriceCount: 2,
      setBreakdown: [
        { setName: "The First Chapter", owned: 2, total: 204 },
        { setName: "Rise of the Floodborn", owned: 1, total: 204 },
      ],
    };

    render(<CollectionStatsPanel stats={stats} />);

    expect(screen.getByText("Unique Cards")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Total Cards")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText(/Excludes 2 cards missing market price/i)).toBeInTheDocument();
    expect(screen.getByText("The First Chapter")).toBeInTheDocument();
    expect(screen.getByText("2/204")).toBeInTheDocument();
  });

  it("renders authenticated collection controls from capabilities", async () => {
    const onViewModeChange = vi.fn();
    const onExportCsv = vi.fn();
    const onWipeInventory = vi.fn();
    render(
      <InventoryCollectionView
        title="My Collection"
        entries={[makeInventoryEntry()]}
        filters={{}}
        onFiltersChange={vi.fn()}
        loading={false}
        emptyMessage="No cards"
        viewMode="grid"
        onViewModeChange={onViewModeChange}
        capabilities={editableCapabilities}
        onSelectCard={vi.fn()}
        onExportCsv={onExportCsv}
        onWipeInventory={onWipeInventory}
        onQuantityChange={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "My Collection" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rows" }));
    await userEvent.click(screen.getByRole("button", { name: "CSV" }));
    await userEvent.click(screen.getByRole("button", { name: "Wipe" }));
    expect(onViewModeChange).toHaveBeenCalledWith("rows");
    expect(onExportCsv).toHaveBeenCalled();
    expect(onWipeInventory).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /add normal card/i })).toBeInTheDocument();
  });

  it("renders public collection read-only with no authenticated inventory controls", () => {
    render(
      <InventoryCollectionView
        title="Alice's Collection"
        subtitle="Shared read-only collection"
        entries={[makeInventoryEntry()]}
        filters={{}}
        onFiltersChange={vi.fn()}
        loading={false}
        emptyMessage="No cards"
        viewMode="grid"
        capabilities={readOnlyCapabilities}
        onSelectCard={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Alice's Collection" })).toBeInTheDocument();
    expect(screen.getByText("Shared read-only collection")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rows" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wipe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add normal card/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Remove from collection")).not.toBeInTheDocument();
  });

  it("renders inventory collection loading, empty, and editable rows states", async () => {
    const onExpandedIdChange = vi.fn();
    const onUpdateEntry = vi.fn();
    const onRemoveEntry = vi.fn();
    const onSelectCard = vi.fn();
    const entry = makeInventoryEntry({ holofoilQuantity: 1 });
    const { rerender } = render(
      <InventoryCollectionView
        title="My Collection"
        entries={[]}
        filters={{}}
        onFiltersChange={vi.fn()}
        loading={true}
        emptyMessage="No cards"
        viewMode="rows"
        onViewModeChange={vi.fn()}
        capabilities={editableCapabilities}
        onSelectCard={onSelectCard}
      />
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    rerender(
      <InventoryCollectionView
        title="My Collection"
        entries={[]}
        filters={{}}
        onFiltersChange={vi.fn()}
        loading={false}
        emptyMessage="No cards"
        viewMode="rows"
        onViewModeChange={vi.fn()}
        capabilities={editableCapabilities}
        onSelectCard={onSelectCard}
      />
    );
    expect(screen.getByText("No cards")).toBeInTheDocument();

    rerender(
      <InventoryCollectionView
        title="My Collection"
        entries={[entry]}
        filters={{}}
        onFiltersChange={vi.fn()}
        loading={false}
        emptyMessage="No cards"
        viewMode="rows"
        onViewModeChange={vi.fn()}
        capabilities={editableCapabilities}
        onSelectCard={onSelectCard}
        expandedId="entry_1"
        onExpandedIdChange={onExpandedIdChange}
        onUpdateEntry={onUpdateEntry}
        onRemoveEntry={onRemoveEntry}
      />
    );

    await userEvent.click(screen.getByAltText("Mickey Mouse"));
    expect(onSelectCard).toHaveBeenCalledWith(entry.card);
    await userEvent.click(screen.getByRole("button", { name: /Mickey Mouse/i }));
    expect(onExpandedIdChange).toHaveBeenCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: "Grid" }));

    const removeNormal = screen.getByRole("button", { name: /remove normal card/i });
    const addNormal = screen.getByRole("button", { name: /add normal card/i });
    const removeFoil = screen.getByRole("button", { name: /remove foil card/i });
    const addFoil = screen.getByRole("button", { name: /add foil card/i });
    const removeHolofoil = screen.getByRole("button", { name: /remove holofoil card/i });
    const addHolofoil = screen.getByRole("button", { name: /add holofoil card/i });
    expect(screen.queryByText("Index")).not.toBeInTheDocument();
    expect(screen.getByText("1/204 • EN • 1")).toBeInTheDocument();
    expect(screen.queryByText("Hero")).not.toBeInTheDocument();
    expect(screen.queryByText("STR")).not.toBeInTheDocument();
    await userEvent.click(removeNormal);
    await userEvent.click(addNormal);
    await userEvent.click(removeFoil);
    await userEvent.click(addFoil);
    await userEvent.click(removeHolofoil);
    await userEvent.click(addHolofoil);
    await userEvent.click(screen.getByRole("button", { name: "Remove from collection" }));

    expect(onUpdateEntry).toHaveBeenCalledWith("entry_1", { quantity: 0 });
    expect(onUpdateEntry).toHaveBeenCalledWith("entry_1", { quantity: 2 });
    expect(onUpdateEntry).toHaveBeenCalledWith("entry_1", { foilQuantity: 1 });
    expect(onUpdateEntry).toHaveBeenCalledWith("entry_1", { foilQuantity: 3 });
    expect(onUpdateEntry).toHaveBeenCalledWith("entry_1", { holofoilQuantity: 0 });
    expect(onUpdateEntry).toHaveBeenCalledWith("entry_1", { holofoilQuantity: 2 });
    expect(onRemoveEntry).toHaveBeenCalledWith("entry_1");
  });

  it("renders no stats breakdown for empty set data and no missing-price warning at zero", () => {
    render(<CollectionStatsPanel stats={{ totalUnique: 0, totalCards: 0, setBreakdown: [] }} />);
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.queryByText("Set Breakdown")).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be included/i)).not.toBeInTheDocument();

    render(<CollectionStatsPanel stats={{ totalUnique: 1, totalCards: 1, totalValue: 2, missingPriceCount: 1, setBreakdown: [{ setName: "Zero Set", owned: 1, total: 0 }] }} />);
    expect(screen.getByText(/Excludes 1 card missing market price/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Zero Set completion 0%")).toBeInTheDocument();
  });

  it("renders empty card grids and card metadata/price badges", () => {
    render(<CardGrid cards={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No cards found.")).toBeInTheDocument();

    render(<CardGrid cards={[makeCard()]} onSelect={vi.fn()} ownedCardIds={new Set(["card_1"])} ownedQuantities={new Map([["card_1", { quantity: 1, foilQuantity: 2, holofoilQuantity: 3 }]])} />);
    expect(screen.getAllByText("Mickey Mouse")[0]).toBeInTheDocument();
    expect(screen.getByText("6x")).toBeInTheDocument();
    expect(screen.getByText("$4.00")).toBeInTheDocument();
    expect(screen.queryByText("Index")).not.toBeInTheDocument();
    expect(screen.getByText("1/204 • EN • 1")).toBeInTheDocument();
    expect(screen.queryByText("8 ink")).not.toBeInTheDocument();
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
    expect(screen.queryByText("6x")).not.toBeInTheDocument();

    render(
      <CardGrid
        cards={[makeCard({ id: "empty_price", cardNumber: "", prices: [] })]}
        onSelect={onSelect}
        priceContext={{ variant: "Normal", priceField: "marketPrice" }}
      />
    );
    expect(screen.getByText("Price Normal")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();

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
