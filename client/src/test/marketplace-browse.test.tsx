import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketplaceListingCard from "../components/marketplace/MarketplaceListingCard";
import MarketplacePage from "../pages/marketplace/MarketplacePage";
import { useAuth } from "../context/AuthContext";
import { marketplace } from "../services/api";

const { listingsMock, cardsFiltersMock } = vi.hoisted(() => ({
  listingsMock: vi.fn(),
  cardsFiltersMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: { listings: listingsMock },
  cards: { filters: cardsFiltersMock },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
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
  inkable: true,
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

  it("falls back to the card image when no condition photo is present", () => {
    render(
      <MemoryRouter>
        <MarketplaceListingCard listing={{ ...listing, photos: [] }} />
      </MemoryRouter>
    );
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen" })).toHaveAttribute(
      "src",
      "/api/card-images/card_elsa"
    );
  });

  it("renders the condition photo as the primary image", () => {
    const withPhoto = {
      ...listing,
      photos: [{ id: "photo_1", url: "https://img.example/cond.jpg", sortOrder: 1, label: null }],
    };
    render(
      <MemoryRouter>
        <MarketplaceListingCard listing={withPhoto} />
      </MemoryRouter>
    );
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen — condition photo" })).toHaveAttribute(
      "src",
      "https://img.example/cond.jpg"
    );
  });

  it("opens a lightbox from the card image button and closes it with Escape (AC-POL-13.3)", async () => {
    render(
      <MemoryRouter>
        <MarketplaceListingCard listing={listing} />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: "View Elsa, Snow Queen" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("img", { name: "Elsa, Snow Queen" })).toHaveAttribute(
      "src",
      "/api/card-images/card_elsa"
    );

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens a lightbox from the condition photo button and closes it with the × button (AC-POL-13.3)", async () => {
    const withPhoto = {
      ...listing,
      photos: [{ id: "photo_1", url: "https://img.example/cond.jpg", sortOrder: 1, label: null }],
    };
    render(
      <MemoryRouter>
        <MarketplaceListingCard listing={withPhoto} />
      </MemoryRouter>
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View Elsa, Snow Queen — condition photo" })
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("img", { name: "Elsa, Snow Queen — condition photo" })
    ).toHaveAttribute("src", "https://img.example/cond.jpg");

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renders the static fallback when the card and photo are absent", () => {
    render(
      <MemoryRouter>
        <MarketplaceListingCard
          listing={{ ...listing, photos: [], card: null, seller: null, condition: null, location: "" }}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("img", { name: "Unknown card" })).toHaveAttribute(
      "src",
      "/lorcana-logo.png"
    );
    expect(screen.getByText("Unknown card")).toBeInTheDocument();
    expect(screen.queryByText(/Sold by/)).not.toBeInTheDocument();
  });

  it("omits optional subtitle, rarity, condition, location and seller", () => {
    render(
      <MemoryRouter>
        <MarketplaceListingCard
          listing={{
            ...listing,
            card: { ...card, subtitle: null as never, rarity: "" },
            condition: null,
            location: "",
            seller: null,
          }}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText("Ice Queen")).not.toBeInTheDocument();
    expect(screen.queryByText("NM")).not.toBeInTheDocument();
    expect(screen.queryByText("London")).not.toBeInTheDocument();
  });
});

const filterOptions = {
  colors: ["Amethyst"],
  sets: ["The First Chapter"],
  rarities: ["Legendary"],
  cardTypes: ["Character", "Action"],
  types: ["Hero"],
  costs: [0, 5],
  inkable: ["inkable", "non-inkable"],
};

describe("MarketplacePage", () => {
  beforeEach(() => {
    listingsMock.mockReset();
    listingsMock.mockResolvedValue(response);
    cardsFiltersMock.mockReset();
    cardsFiltersMock.mockResolvedValue(filterOptions);
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);
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

  it("hides the Sell / List a card link for signed-out users", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Marketplace" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sell / List a card" })).not.toBeInTheDocument();
  });

  it("shows the Sell / List a card link for signed-in users", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "seller_1", username: "alice" },
    } as never);
    renderPage();

    expect(await screen.findByRole("link", { name: "Sell / List a card" })).toHaveAttribute(
      "href",
      "/marketplace/sell"
    );
  });

  it("loads filter options from the API and appends Song to the Type options", async () => {
    renderPage();

    await waitFor(() => expect(cardsFiltersMock).toHaveBeenCalled());

    // The Type multi-select becomes available once options resolve.
    const typeButton = await screen.findByRole("button", { name: "All Types" });
    await userEvent.click(typeButton);
    expect(screen.getByLabelText("Character")).toBeInTheDocument();
    expect(screen.getByLabelText("Action")).toBeInTheDocument();
    expect(screen.getByLabelText("Song")).toBeInTheDocument();
  });

  it("forwards the enhanced filter params to the listings endpoint", async () => {
    renderPage("/marketplace?costs=0,5&inkable=inkable&cardTypes=Action&subtypes=Hero");

    await waitFor(() =>
      expect(listingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          costs: "0,5",
          inkable: "inkable",
          cardTypes: "Action",
          subtypes: "Hero",
        })
      )
    );
  });

  it("forwards the color/set/rarity filters to the listings endpoint (REQ-POL-3)", async () => {
    renderPage(
      "/marketplace?colors=Amber&sets=The%20First%20Chapter&rarities=Legendary"
    );

    await waitFor(() =>
      expect(listingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: "Amber",
          sets: "The First Chapter",
          rarities: "Legendary",
        })
      )
    );
  });
});
