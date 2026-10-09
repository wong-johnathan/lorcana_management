import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CardDetailPage from "../pages/CardDetailPage";

const { cardsGetMock, priceHistoryMock, analysisGetMock, analysisAnalyzeMock } = vi.hoisted(() => ({
  cardsGetMock: vi.fn(),
  priceHistoryMock: vi.fn(),
  analysisGetMock: vi.fn(),
  analysisAnalyzeMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  cards: {
    get: cardsGetMock,
    priceHistory: priceHistoryMock,
  },
  analysis: {
    get: analysisGetMock,
    analyze: analysisAnalyzeMock,
  },
}));

const card = {
  id: "cmqs1hkhi00bom53mnquju3cs",
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
  foilTypes: ["None", "Silver"],
  imageUrl: "https://img.example/card.jpg",
  prices: [
    { variant: "Normal", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4, updatedAt: "2026-01-02T00:00:00Z" },
    { variant: "Cold Foil", lowPrice: 5, midPrice: 6, highPrice: 7, marketPrice: 8, updatedAt: "2026-01-02T00:00:00Z" },
  ],
};

const historyResponse = {
  cardId: card.id,
  tcgPlayerId: 12345,
  variant: "Normal",
  field: "marketPrice",
  currency: "USD",
  rangeDays: 90,
  points: [
    { sourceUpdatedAt: "2026-01-01T00:00:00.000Z", price: 3.5, lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 3.5, directLowPrice: null },
    { sourceUpdatedAt: "2026-01-02T00:00:00.000Z", price: 4, lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4, directLowPrice: null },
  ],
  summary: { current: 4, previous: 3.5, low: 3.5, high: 4, changeAmount: 0.5, changePercent: 14.2857142857 },
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/database/${card.id}`]}>
      <Routes>
        <Route path="/database/:cardId" element={<CardDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CardDetailPage", () => {
  beforeEach(() => {
    cardsGetMock.mockReset();
    priceHistoryMock.mockReset();
    analysisGetMock.mockReset();
    analysisAnalyzeMock.mockReset();
    cardsGetMock.mockResolvedValue(card);
    priceHistoryMock.mockResolvedValue(historyResponse);
    analysisGetMock.mockRejectedValue(new Error("No analysis"));
  });

  it("renders the price-history chart on the actual database card page", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Mickey Mouse" })).toBeInTheDocument();
    expect(await screen.findByText("Price history")).toBeInTheDocument();
    await waitFor(() => expect(priceHistoryMock).toHaveBeenCalledWith(card.id, { variant: "Normal", field: "marketPrice", days: 90 }));
    expect(screen.getByLabelText("Price history chart")).toBeInTheDocument();
  });
});
