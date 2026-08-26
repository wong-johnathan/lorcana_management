import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventoryPage from "../pages/InventoryPage";
import { inventory } from "../services/api";
import type { Card, InventoryEntry, InventoryStats } from "../types";

vi.mock("../components/FilterBar", () => ({
  default: ({ onChange }: { filters: Record<string, string>; onChange: (filters: Record<string, string>) => void }) => (
    <button type="button" onClick={() => onChange({ search: "mickey" })}>
      Mock filters
    </button>
  ),
}));

vi.mock("../services/api", () => ({
  inventory: {
    list: vi.fn(),
    stats: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    wipe: vi.fn(),
  },
  cards: { get: vi.fn() },
}));

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
    cardNumber: "1/204 • EN • 1",
    foilTypes: ["None", "Silver"],
    imageUrl: "https://img.example/card.jpg",
    prices: [{ variant: "Normal", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4, updatedAt: "2026-01-01T00:00:00Z" }],
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

const stats: InventoryStats = {
  totalUnique: 1,
  totalCards: 3,
  totalValue: 12,
  missingPriceCount: 0,
  setBreakdown: [{ setName: "The First Chapter", owned: 1, total: 204 }],
};

describe("InventoryPage", () => {
  beforeEach(() => {
    localStorage.setItem("inventoryViewMode", "rows");
    vi.mocked(inventory.list).mockReset();
    vi.mocked(inventory.stats).mockReset();
    vi.mocked(inventory.update).mockReset();
    vi.mocked(inventory.remove).mockReset();
    vi.mocked(inventory.wipe).mockReset();
  });

  it("updates edited row state from the API response without reloading the inventory list", async () => {
    const originalEntry = makeInventoryEntry();
    const updatedEntry = makeInventoryEntry({ quantity: 2 });
    vi.mocked(inventory.list).mockResolvedValue([originalEntry]);
    vi.mocked(inventory.stats).mockResolvedValue(stats);
    vi.mocked(inventory.update).mockResolvedValue(updatedEntry);

    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    );

    await screen.findByRole("button", { name: /Mickey Mouse/i });
    await waitFor(() => expect(inventory.list).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: /Mickey Mouse/i }));
    expect(screen.getByText("Remove from collection")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /add normal card/i }));

    await waitFor(() => expect(screen.getByText("2x normal")).toBeInTheDocument());
    expect(screen.getByText("4x")).toBeInTheDocument();
    expect(screen.getByText("Remove from collection")).toBeInTheDocument();
    expect(inventory.update).toHaveBeenCalledWith("entry_1", { quantity: 2 });
    expect(inventory.list).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
