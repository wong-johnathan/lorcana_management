import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
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

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.search}</span>;
}

function renderPage(initialEntry = "/market-movers") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PriceMoversPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

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

  it("hydrates the whole view from a shared url", async () => {
    renderPage("/market-movers?window=7d&type=losers&variant=Holofoil&rarity=Enchanted&field=lowPrice&minPrevPrice=5&minCurrentPrice=7.5&minChangePercent=25");

    await waitFor(() => expect(priceMoversMock).toHaveBeenCalledWith({
      window: "7d",
      type: "losers",
      variant: "Holofoil",
      rarity: "Enchanted",
      field: "lowPrice",
      limit: 50,
      minPrevPrice: "5",
      minCurrentPrice: "7.5",
      minChangePercent: "25",
    }));

    expect(screen.getByLabelText("Window")).toHaveValue("7d");
    expect(screen.getByLabelText("Variant")).toHaveValue("Holofoil");
    expect(screen.getByLabelText("Rarity")).toHaveValue("Enchanted");
    expect(screen.getByLabelText("Price field")).toHaveValue("lowPrice");
    expect(screen.getByLabelText("Min previous $")).toHaveValue(5);
    expect(screen.getByLabelText("Min current $")).toHaveValue(7.5);
    expect(screen.getByLabelText("Min % move")).toHaveValue(25);
    expect(screen.getByRole("button", { name: "Top losers" })).toHaveClass("bg-amber-500");
  });

  it("writes control changes back to the url and drops defaults again", async () => {
    const { getByTestId } = renderPage();
    await waitFor(() => expect(priceMoversMock).toHaveBeenCalledTimes(1));
    expect(getByTestId("location").textContent).toBe("");

    await userEvent.selectOptions(screen.getByLabelText("Window"), "30d");
    await waitFor(() => expect(getByTestId("location").textContent).toBe("?window=30d"));

    await userEvent.click(screen.getByRole("button", { name: "Most volatile" }));
    await waitFor(() => expect(getByTestId("location").textContent).toBe("?window=30d&type=volatile"));

    await userEvent.type(screen.getByLabelText("Min previous $"), "5");
    await waitFor(() => expect(getByTestId("location").textContent).toBe("?window=30d&type=volatile&minPrevPrice=5"));

    await userEvent.selectOptions(screen.getByLabelText("Window"), "24h");
    await waitFor(() => expect(getByTestId("location").textContent).toBe("?type=volatile&minPrevPrice=5"));

    await userEvent.clear(screen.getByLabelText("Min previous $"));
    await waitFor(() => expect(getByTestId("location").textContent).toBe("?type=volatile"));
  });

  it("ignores junk url values and loads the default view", async () => {
    renderPage("/market-movers?window=999d&type=sideways&rarity=Bogus&field=nope&minPrevPrice=abc");

    await waitFor(() => expect(priceMoversMock).toHaveBeenCalledWith({
      window: "24h",
      type: "gainers",
      variant: "all",
      rarity: "all",
      field: "marketPrice",
      limit: 50,
    }));
    expect(screen.getByLabelText("Window")).toHaveValue("24h");
    expect(screen.getByLabelText("Min previous $")).toHaveValue(null);
  });

  it("explains how many comparable cards moved and stayed unchanged", async () => {
    priceMoversMock.mockResolvedValue({ ...response, comparedCount: 10, unchangedCount: 6, movedCount: 4 });
    renderPage();

    expect(await screen.findByText("4 of 10 comparable cards moved · 6 unchanged")).toBeInTheDocument();
  });

  it("says so when every comparable card was unchanged", async () => {
    priceMoversMock.mockResolvedValue({
      ...response,
      items: [],
      emptyReason: "NO_MOVERS",
      comparedCount: 10,
      unchangedCount: 10,
      movedCount: 0,
    });
    const { container } = renderPage();

    await waitFor(() => expect(container.textContent).toContain("All 10 comparable cards were unchanged in this window."));
  });

  it("says so when cards moved but none in this direction", async () => {
    priceMoversMock.mockResolvedValue({
      ...response,
      items: [],
      emptyReason: "NO_MOVERS",
      comparedCount: 10,
      unchangedCount: 6,
      movedCount: 4,
    });
    const { container } = renderPage();

    await waitFor(() => expect(container.textContent).toContain("4 comparable cards moved in this window, but none match this mode."));
  });
});
