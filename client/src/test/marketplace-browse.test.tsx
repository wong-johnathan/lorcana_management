import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketplaceListingCard from "../components/marketplace/MarketplaceListingCard";
import MarketplacePage from "../pages/marketplace/MarketplacePage";
import { marketplace } from "../services/api";

const { listingsMock } = vi.hoisted(() => ({
  listingsMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: { listings: listingsMock },
}));

const card = {
  id: "card_elsa",
  externalId: 1,
  tcgPlayerId: 100,
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
  cardNumber: "1/204 • EN • 1",
  foilTypes: ["None", "Silver"],
  imageUrl: "https://img.example/elsa.jpg",
  prices: [],
};

const listing = {
  id: "listing_1",
  sellerId: "seller_1",
  cardId: card.id,
  variant: "foil",
  quantity: 2,
  priceMinor: 2500,
  currency: "USD",
  condition: "NM",
  location: "London",
  note: null,
  status: "ACTIVE",
  hiddenAt: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  card,
  seller: { id: "seller_1", username: "alice", profile: {} },
  photos: [],
};

const response = {
  listings: [listing],
  pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
};

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.search}</span>;
}

function renderPage(initialEntry = "/marketplace") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MarketplacePage />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("MarketplaceListingCard", () => {
  it("renders name, price, variant, condition, location and seller", () => {
    render(
      <MemoryRouter>
        <MarketplaceListingCard listing={listing} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Elsa, Snow Queen" })).toHaveAttribute(
      "href",
      "/marketplace/listing/listing_1"
    );
    expect(screen.getByText("$25.00")).toBeInTheDocument();
    expect(screen.getByText("Foil")).toBeInTheDocument();
    expect(screen.getByText("NM")).toBeInTheDocument();
    expect(screen.getByText("London")).toBeInTheDocument();
    expect(screen.getByText(/Sold by alice/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sold by alice/ })).toHaveAttribute(
      "href",
      "/marketplace/seller/seller_1"
    );
  });
});

describe("MarketplacePage", () => {
  beforeEach(() => {
    listingsMock.mockReset();
    listingsMock.mockResolvedValue(response);
  });

  it("hydrates filters from the url and converts price ranges to minor units", async () => {
    renderPage("/marketplace?q=mickey&variant=foil&condition=NM&currency=USD&priceMin=10&priceMax=50");

    await waitFor(() =>
      expect(listingsMock).toHaveBeenCalledWith({
        q: "mickey",
        variant: "foil",
        condition: "NM",
        currency: "USD",
        priceMin: "1000",
        priceMax: "5000",
        page: 1,
        limit: 24,
      })
    );
    expect(screen.getByDisplayValue("mickey")).toBeInTheDocument();
    expect(screen.getByLabelText("Variant")).toHaveValue("foil");
    expect(screen.getByLabelText("Condition")).toHaveValue("NM");
  });

  it("writes filter changes back to the url and sends the converted price", async () => {
    const { getByTestId } = renderPage();
    await waitFor(() => expect(listingsMock).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByPlaceholderText("Search by name or set..."), "elsa");
    await userEvent.selectOptions(screen.getByLabelText("Variant"), "normal");
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await userEvent.type(screen.getByLabelText("Min price"), "10");

    await waitFor(() =>
      expect(listingsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: "elsa",
          variant: "normal",
          currency: "EUR",
          priceMin: "1000",
        })
      )
    );
    expect(getByTestId("location").textContent).toBe(
      "?q=elsa&variant=normal&currency=EUR&priceMin=10"
    );
  });

  it("renders the listings grid from the api response", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Marketplace" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Elsa, Snow Queen" })).toBeInTheDocument();
  });
});
