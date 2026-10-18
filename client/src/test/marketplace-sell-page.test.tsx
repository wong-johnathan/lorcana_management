import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceSellPage from "../pages/marketplace/MarketplaceSellPage";
import type { MarketplaceListing } from "../types";

const { inventoryListMock, getPolicyMock, getMyListingsMock, getTransactionsMock } =
  vi.hoisted(() => ({
    inventoryListMock: vi.fn(),
    getPolicyMock: vi.fn(),
    getMyListingsMock: vi.fn(),
    getTransactionsMock: vi.fn(),
  }));

vi.mock("../services/api", () => ({
  inventory: {
    list: inventoryListMock,
    getPolicy: getPolicyMock,
  },
  marketplace: {
    getMyListings: getMyListingsMock,
    getTransactions: getTransactionsMock,
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const card = {
  id: "card_1",
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
  imageUrl: "",
  prices: [],
};

const closedListing: MarketplaceListing = {
  id: "listing_1",
  sellerId: "seller_1",
  cardId: "card_1",
  variant: "normal",
  quantity: 0,
  priceMinor: 2500,
  currency: "USD",
  condition: "NM",
  location: "London",
  note: null,
  status: "CLOSED",
  hiddenAt: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  card,
  seller: { id: "seller_1", username: "alice", profile: {} },
  photos: [],
};

describe("MarketplaceSellPage", () => {
  beforeEach(() => {
    inventoryListMock.mockReset();
    getPolicyMock.mockReset();
    getMyListingsMock.mockReset();
    getTransactionsMock.mockReset();
  });

  it("lists a CLOSED (sold-out) listing as editable (D2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([]);
    getPolicyMock.mockResolvedValue(null);
    getMyListingsMock.mockResolvedValue({ listings: [closedListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    render(<MarketplaceSellPage />);

    expect(await screen.findByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(await screen.findByText("Sold out — price/quantity locked")).toBeInTheDocument();
  });
});
