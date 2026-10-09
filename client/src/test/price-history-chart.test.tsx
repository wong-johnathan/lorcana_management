import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { priceHistoryMock } = vi.hoisted(() => ({
  priceHistoryMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  cards: {
    priceHistory: priceHistoryMock,
  },
}));

import CardPriceHistoryChart from "../components/CardPriceHistoryChart";

const historyResponse = {
  cardId: "card_1",
  tcgPlayerId: 100,
  variant: "Normal",
  field: "marketPrice",
  currency: "USD" as const,
  rangeDays: 90,
  points: [
    { sourceUpdatedAt: "2026-09-24T00:00:00.000Z", price: 2.75, lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 2.75, directLowPrice: null },
    { sourceUpdatedAt: "2026-09-25T00:00:00.000Z", price: 3.25, lowPrice: 2, midPrice: 3, highPrice: 4, marketPrice: 3.25, directLowPrice: 1.75 },
  ],
  summary: {
    current: 3.25,
    rangeStart: 2.75,
    low: 2.75,
    high: 3.25,
    changeAmount: 0.5,
    changePercent: 18.18,
  },
  earliestSourceUpdatedAt: "2025-09-25T00:00:00.000Z",
  latestSourceUpdatedAt: "2026-09-25T00:00:00.000Z",
  availableDays: 400,
};

beforeEach(() => {
  priceHistoryMock.mockResolvedValue(historyResponse);
});

describe("CardPriceHistoryChart", () => {
  it("loads and renders price history summary and chart for the selected card", async () => {
    render(<CardPriceHistoryChart cardId="card_1" variants={["Normal", "Cold Foil"]} />);

    await waitFor(() => expect(priceHistoryMock).toHaveBeenCalledWith("card_1", { variant: "Normal", field: "marketPrice", days: 90 }));

    expect(await screen.findByText("Price history")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("$3.25")).toBeInTheDocument();
    expect(screen.getByText("+$0.50 / +18.18%")).toBeInTheDocument();
    expect(screen.getByLabelText("Price history chart")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("History variant"), "Cold Foil");
    await waitFor(() => expect(priceHistoryMock).toHaveBeenLastCalledWith("card_1", { variant: "Cold Foil", field: "marketPrice", days: 90 }));

    await userEvent.click(screen.getByRole("button", { name: "30D" }));
    await waitFor(() => expect(priceHistoryMock).toHaveBeenLastCalledWith("card_1", { variant: "Cold Foil", field: "marketPrice", days: 30 }));
  });

  it("shows empty-state guidance from the history API", async () => {
    priceHistoryMock.mockResolvedValueOnce({
      ...historyResponse,
      tcgPlayerId: null,
      points: [],
      summary: { current: null, rangeStart: null, low: null, high: null, changeAmount: null, changePercent: null },
      emptyReason: "NO_TCGPLAYER_ID",
    });

    render(<CardPriceHistoryChart cardId="card_without_tcg" variants={["Normal"]} />);

    expect(await screen.findByText("No TCGPlayer ID yet")).toBeInTheDocument();
    expect(screen.getByText("Price history will appear once LorcanaJSON maps this card to TCGPlayer."))
      .toBeInTheDocument();
  });

  it("handles negative movement, single-point charts, field changes, default variants, and fetch errors", async () => {
    priceHistoryMock.mockResolvedValueOnce({
      ...historyResponse,
      points: [
        { sourceUpdatedAt: "2026-09-24T00:00:00.000Z", price: 10, lowPrice: 9, midPrice: 10, highPrice: 11, marketPrice: 10, directLowPrice: null },
        { sourceUpdatedAt: "2026-09-25T00:00:00.000Z", price: 8, lowPrice: 7, midPrice: 8, highPrice: 9, marketPrice: 8, directLowPrice: null },
      ],
      summary: { current: 8, rangeStart: 10, low: 8, high: 10, changeAmount: -2, changePercent: -20 },
    });

    const { rerender } = render(<CardPriceHistoryChart cardId="card_down" variants={[]} />);

    expect(await screen.findByText("-$2.00 / -20.00%")).toBeInTheDocument();
    expect(priceHistoryMock).toHaveBeenCalledWith("card_down", { variant: "Normal", field: "marketPrice", days: 90 });

    priceHistoryMock.mockResolvedValueOnce({
      ...historyResponse,
      points: [{ sourceUpdatedAt: "2026-09-25T00:00:00.000Z", price: 1.75, lowPrice: null, midPrice: null, highPrice: null, marketPrice: null, directLowPrice: 1.75 }],
      summary: { current: 1.75, rangeStart: null, low: 1.75, high: 1.75, changeAmount: null, changePercent: null },
    });
    await userEvent.selectOptions(screen.getByLabelText("History price field"), "directLowPrice");
    await waitFor(() => expect(priceHistoryMock).toHaveBeenLastCalledWith("card_down", { variant: "Normal", field: "directLowPrice", days: 90 }));
    expect(await screen.findByText("$1.75")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();

    priceHistoryMock.mockRejectedValueOnce(new Error("history offline"));
    rerender(<CardPriceHistoryChart cardId="card_error" variants={["Normal"]} />);
    expect(await screen.findByText("history offline")).toBeInTheDocument();
  });

  it("only offers ranges the card actually has history for", async () => {
    priceHistoryMock.mockResolvedValue({ ...historyResponse, availableDays: 9 });

    render(<CardPriceHistoryChart cardId="card_shallow" variants={["Normal"]} />);

    await waitFor(() => expect(priceHistoryMock).toHaveBeenLastCalledWith("card_shallow", { variant: "Normal", field: "marketPrice", days: 730 }));

    expect(screen.queryByRole("button", { name: "30D" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "90D" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1Y" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByText("Change (All)")).toBeInTheDocument();
  });

  it("adds an All range when history is longer than the standard windows", async () => {
    priceHistoryMock.mockResolvedValue({ ...historyResponse, availableDays: 200 });

    render(<CardPriceHistoryChart cardId="card_deep" variants={["Normal"]} />);

    await waitFor(() => expect(priceHistoryMock).toHaveBeenCalledWith("card_deep", { variant: "Normal", field: "marketPrice", days: 90 }));

    expect(screen.getByRole("button", { name: "30D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1Y" })).not.toBeInTheDocument();
    expect(screen.getByText("Change (90D)")).toBeInTheDocument();
  });
});
