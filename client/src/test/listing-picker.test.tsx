import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ListingPicker from "../components/marketplace/ListingPicker";
import { cards } from "../services/api";
import type { Card, InventoryEntry, InventoryPolicy } from "../types";

vi.mock("../services/api", () => ({
  cards: { filters: vi.fn() },
}));

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_elsa",
    externalId: 1,
    tcgPlayerId: null,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Elsa, Snow Queen",
    subtitle: "Ice Queen",
    character: "Elsa",
    types: ["Hero"],
    cardType: "Character",
    color: "Amethyst",
    setCode: "TFC",
    setName: "The First Chapter",
    rarity: "Legendary",
    inkCost: 5,
    strength: 3,
    willpower: 3,
    lore: 2,
    abilities: "Evasive",
    cardNumber: "1/204",
    foilTypes: ["None", "Silver"],
    imageUrl: "https://img.example/elsa.jpg",
    prices: [],
    ...overrides,
  };
}

function makeEntry(card: Card, overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id: `inv_${card.id}`,
    userId: "u1",
    cardId: card.id,
    quantity: 1,
    foilQuantity: 0,
    holofoilQuantity: 0,
    card,
    ...overrides,
  };
}

const policy: InventoryPolicy = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
};

const elsa = makeCard();
const mickey = makeCard({
  id: "card_mickey",
  name: "Mickey Mouse",
  subtitle: "Brave Little Tailor",
  color: "Amber",
  setName: "Rise of the Floodborn",
  rarity: "Common",
  imageUrl: "",
});

beforeEach(() => {
  vi.mocked(cards.filters).mockReset();
});

describe("ListingPicker", () => {
  it("renders only owned cards (zero-count entries hidden) without fetching filters", () => {
    const zeroCard = makeCard({ id: "card_zero", name: "Zero Count", imageUrl: "" });
    const inventory = [
      makeEntry(elsa, { quantity: 6 }),
      makeEntry(zeroCard, { quantity: 0, foilQuantity: 0, holofoilQuantity: 0 }),
    ];

    render(
      <ListingPicker
        inventory={inventory}
        policy={policy}
        loading={false}
        filters={{}}
        onFiltersChange={vi.fn()}
        onSelectCard={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.queryByText("Zero Count")).not.toBeInTheDocument();
    expect(cards.filters).not.toHaveBeenCalled();
  });

  it("shows art, name, set, owned count, and a surplus badge only when surplus > 0", () => {
    const inventory = [makeEntry(elsa, { quantity: 6 })];

    render(
      <ListingPicker
        inventory={inventory}
        policy={policy}
        loading={false}
        filters={{}}
        onFiltersChange={vi.fn()}
        onSelectCard={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByAltText("Elsa, Snow Queen - Ice Queen")).toBeInTheDocument();
    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("The First Chapter")).toBeInTheDocument();
    expect(screen.getByText("6x")).toBeInTheDocument();
    expect(screen.getByText("2 surplus")).toBeInTheDocument();
  });

  it("omits the surplus badge when surplus is 0", () => {
    const inventory = [makeEntry(elsa, { quantity: 2 })];

    render(
      <ListingPicker
        inventory={inventory}
        policy={policy}
        loading={false}
        filters={{}}
        onFiltersChange={vi.fn()}
        onSelectCard={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("2x")).toBeInTheDocument();
    expect(screen.queryByText(/surplus/)).not.toBeInTheDocument();
  });

  it("filters client-side by search and set/rarity/color without any cardsApi.filters call", () => {
    const inventory = [makeEntry(elsa, { quantity: 3 }), makeEntry(mickey, { quantity: 3 })];

    const props = {
      inventory,
      policy,
      loading: false,
      onFiltersChange: vi.fn(),
      onSelectCard: vi.fn(),
      onCancel: vi.fn(),
    };

    const { rerender } = render(<ListingPicker {...props} filters={{ search: "mickey" }} />);
    expect(screen.getByText("Mickey Mouse")).toBeInTheDocument();
    expect(screen.queryByText("Elsa, Snow Queen")).not.toBeInTheDocument();

    rerender(<ListingPicker {...props} filters={{ color: "Amethyst" }} />);
    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.queryByText("Mickey Mouse")).not.toBeInTheDocument();

    rerender(<ListingPicker {...props} filters={{ set: "Rise of the Floodborn" }} />);
    expect(screen.getByText("Mickey Mouse")).toBeInTheDocument();
    expect(screen.queryByText("Elsa, Snow Queen")).not.toBeInTheDocument();

    rerender(<ListingPicker {...props} filters={{ rarity: "Legendary" }} />);
    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.queryByText("Mickey Mouse")).not.toBeInTheDocument();

    expect(cards.filters).not.toHaveBeenCalled();
  });

  it("calls onSelectCard with the clicked card", async () => {
    const onSelectCard = vi.fn();
    render(
      <ListingPicker
        inventory={[makeEntry(elsa, { quantity: 1 })]}
        policy={policy}
        loading={false}
        filters={{}}
        onFiltersChange={vi.fn()}
        onSelectCard={onSelectCard}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));
    expect(onSelectCard).toHaveBeenCalledWith(elsa);
  });

  it("calls onCancel from the Cancel button", async () => {
    const onCancel = vi.fn();
    render(
      <ListingPicker
        inventory={[makeEntry(elsa, { quantity: 1 })]}
        policy={policy}
        loading={false}
        filters={{}}
        onFiltersChange={vi.fn()}
        onSelectCard={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows a loading indicator while inventory is loading", () => {
    render(
      <ListingPicker
        inventory={[]}
        policy={policy}
        loading
        filters={{}}
        onFiltersChange={vi.fn()}
        onSelectCard={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Loading your collection…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Elsa/ })).not.toBeInTheDocument();
  });

  it("shows an empty-collection message when the user owns no cards", () => {
    render(
      <ListingPicker
        inventory={[]}
        policy={policy}
        loading={false}
        filters={{}}
        onFiltersChange={vi.fn()}
        onSelectCard={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/add cards to your collection/i)).toBeInTheDocument();
    expect(screen.queryByText("No cards found.")).not.toBeInTheDocument();
  });

  it("shows the no-match state when filters exclude every owned card", () => {
    render(
      <ListingPicker
        inventory={[makeEntry(elsa, { quantity: 1 })]}
        policy={policy}
        loading={false}
        filters={{ search: "nonexistent" }}
        onFiltersChange={vi.fn()}
        onSelectCard={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("No cards found.")).toBeInTheDocument();
  });
});
