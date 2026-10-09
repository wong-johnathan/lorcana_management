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
  variant: "all",
  rarity: "all",
  field: "marketPrice",
  currency: "USD",
  currentSourceUpdatedAt: "2026-09-30T20:05:42.000Z",
  previousSourceUpdatedAt: "2026-09-29T20:05:42.000Z",
  filters: { minPrevPrice: null, minCurrentPrice: null, minChangePercent: null },
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
    await waitFor(() => expect(priceMoversMock).toHaveBeenCalledWith({ window: "24h", type: "gainers", variant: "all", rarity: "all", field: "marketPrice", limit: 50 }));
    expect(screen.getByText("Mickey Mouse")).toBeInTheDocument();
    expect(screen.getByText("+$5.00 / +100.00%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view mickey mouse/i })).toHaveAttribute("href", "/database/card_gain");

    priceMoversMock.mockResolvedValueOnce({ ...response, variant: "all", rarity: "Enchanted" });
    await userEvent.selectOptions(screen.getByLabelText("Rarity"), "Enchanted");
    await waitFor(() => expect(priceMoversMock).toHaveBeenLastCalledWith({ window: "24h", type: "gainers", variant: "all", rarity: "Enchanted", field: "marketPrice", limit: 50 }));

    priceMoversMock.mockResolvedValueOnce({ ...response, type: "losers", rarity: "Enchanted", items: [] });
    await userEvent.click(screen.getByRole("button", { name: "Top losers" }));
    await waitFor(() => expect(priceMoversMock).toHaveBeenLastCalledWith({ window: "24h", type: "losers", variant: "all", rarity: "Enchanted", field: "marketPrice", limit: 50 }));
    expect(await screen.findByText("No price movers match these filters. Try lowering the minimum price, widening the variant, or using a longer window.")).toBeInTheDocument();
  });

  it("sends minimum price and minimum percent filters", async () => {
    render(<PriceMoversPage />, { wrapper: MemoryRouter });
    await waitFor(() => expect(priceMoversMock).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText("Min previous $"), "5");
    await userEvent.type(screen.getByLabelText("Min current $"), "7.5");
    await userEvent.type(screen.getByLabelText("Min % move"), "25");

    await waitFor(() => expect(priceMoversMock).toHaveBeenLastCalledWith({
      window: "24h", type: "gainers", variant: "all", rarity: "all", field: "marketPrice", limit: 50,
      minPrevPrice: "5", minCurrentPrice: "7.5", minChangePercent: "25",
    }));

    await userEvent.clear(screen.getByLabelText("Min previous $"));
    await waitFor(() => expect(priceMoversMock).toHaveBeenLastCalledWith(expect.not.objectContaining({ minPrevPrice: expect.anything() })));
  });

  it("explains premium rarities and limited history in empty states", async () => {
    priceMoversMock.mockResolvedValue({
      ...response,
      rarity: "Enchanted",
      items: [],
      emptyReason: "NO_MOVERS",
    });
    const { container, unmount } = render(<PriceMoversPage />, { wrapper: MemoryRouter });
    await userEvent.selectOptions(await screen.findByLabelText("Rarity"), "Enchanted");
    await waitFor(() => expect(container.textContent).toContain("Holofoil-only"));
    unmount();

    priceMoversMock.mockResolvedValue({
      ...response,
      window: "30d",
      items: [],
      previousSourceUpdatedAt: null,
      earliestSourceUpdatedAt: "2026-09-30T20:05:12.000Z",
      emptyReason: "NO_COMPARISON_RUN",
    });
    const second = render(<PriceMoversPage />, { wrapper: MemoryRouter });
    await waitFor(() => expect(second.container.textContent).toContain("Price history only goes back to"));
    expect(second.container.textContent).toContain("9/30/2026, 8:05:12 PM");
  });
});
