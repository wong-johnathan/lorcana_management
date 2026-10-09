import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PriceMoversPage from "../pages/PriceMoversPage";

const { priceMoversMock } = vi.hoisted(() => ({
  priceMoversMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  cards: {
    priceMovers: priceMoversMock,
  },
}));

const card = {
  id: "card_gain",
  externalId: 1,
  tcgPlayerId: 100,
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
  prices: [],
};

const response = {
  window: "24h",
  type: "gainers",
  variant: "Normal",
  rarity: "all",
  field: "marketPrice",
  currency: "USD",
  currentSourceUpdatedAt: "2026-09-30T20:05:42.000Z",
  previousSourceUpdatedAt: "2026-09-29T20:05:42.000Z",
  items: [
    {
      card,
      variant: "Normal",
      currentPrice: 10,
      previousPrice: 5,
      changeAmount: 5,
      changePercent: 100,
    },
  ],
};

describe("PriceMoversPage", () => {
  beforeEach(() => {
    priceMoversMock.mockReset();
    priceMoversMock.mockResolvedValue(response);
  });

  it("renders phase-one global price movers and reloads when controls change", async () => {
    render(<PriceMoversPage />, { wrapper: MemoryRouter });

    expect(await screen.findByRole("heading", { name: "Price Movers" })).toBeInTheDocument();
    await waitFor(() => expect(priceMoversMock).toHaveBeenCalledWith({ window: "24h", type: "gainers", variant: "Normal", rarity: "all", field: "marketPrice", limit: 50 }));
    expect(screen.getByText("Mickey Mouse")).toBeInTheDocument();
    expect(screen.getByText("+$5.00 / +100.00%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view mickey mouse/i })).toHaveAttribute("href", "/database/card_gain");

    priceMoversMock.mockResolvedValueOnce({ ...response, variant: "all", rarity: "Enchanted" });
    await userEvent.selectOptions(screen.getByLabelText("Rarity"), "Enchanted");
    await waitFor(() => expect(priceMoversMock).toHaveBeenLastCalledWith({ window: "24h", type: "gainers", variant: "Normal", rarity: "Enchanted", field: "marketPrice", limit: 50 }));

    priceMoversMock.mockResolvedValueOnce({ ...response, type: "losers", rarity: "Enchanted", items: [] });
    await userEvent.click(screen.getByRole("button", { name: "Top losers" }));
    await waitFor(() => expect(priceMoversMock).toHaveBeenLastCalledWith({ window: "24h", type: "losers", variant: "Normal", rarity: "Enchanted", field: "marketPrice", limit: 50 }));
    expect(await screen.findByText("No price movers found for this selection.")).toBeInTheDocument();
  });
});
