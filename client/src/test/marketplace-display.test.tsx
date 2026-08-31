import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Card, MarketplaceCardOffer } from "../types";
import MarketplaceListingCard from "../components/marketplace/MarketplaceListingCard";
import {
  cardIdentifier,
  cardTitle,
  formatMarketplaceMoney,
  shortCardNumber,
  variantLabel,
} from "../components/marketplace/marketplaceDisplay";

const useAuthMock = vi.hoisted(() => vi.fn());
vi.mock("../context/AuthContext", () => ({
  useAuth: useAuthMock,
}));

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: null,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Mickey Mouse",
    subtitle: "Brave Little Tailor",
    character: "Mickey",
    types: ["Hero"],
    cardType: "Character",
    color: "Amber",
    setCode: "TFC",
    setName: "The First Chapter",
    rarity: "Rare",
    inkCost: 4,
    strength: 3,
    willpower: 4,
    lore: 2,
    abilities: "",
    cardNumber: "12/204",
    foilTypes: ["None", "Silver"],
    imageUrl: "https://img.example/mickey.jpg",
    prices: [],
    ...overrides,
  };
}

function offer(overrides: Partial<MarketplaceCardOffer> = {}): MarketplaceCardOffer {
  return {
    listingId: "listing_1",
    seller: { id: "seller_1", username: "seller", emailVerifiedAt: null },
    sellerVerified: false,
    variant: "normal",
    availableQuantity: 1,
    pricingMode: "FIXED",
    askingPrice: { amountMinor: 1234, currency: "ZZZ" as any },
    approximateConvertedPrice: null,
    note: "Meet near MRT",
    referencePrice: 12,
    referencePriceCurrency: "USD",
    condition: "LIGHTLY_PLAYED",
    cardLanguage: "EN",
    originCountryCode: "SG",
    publicLocality: null,
    fulfilment: {
      allowsMeetup: false,
      shipsDomestically: false,
      shipsInternationally: false,
      shipsWorldwide: false,
      destinationCountryCodes: [],
    },
    reputation: {
      userId: "seller_1",
      role: "seller",
      ratingAverage: null,
      reviewCount: 0,
      completedDeals: 0,
      uniqueCounterparties: 0,
      memberSince: "2026-01-01T00:00:00Z",
      emailVerified: false,
    },
    ...overrides,
  };
}

describe("marketplace display helpers", () => {
  it("formats money, variants, titles, and identifiers", () => {
    expect(formatMarketplaceMoney(null)).toBe("Price unavailable");
    expect(formatMarketplaceMoney({ amountMinor: 1234, currency: "ZZZ" as any })).toBe("ZZZ 12.34");
    expect(formatMarketplaceMoney({ amountMinor: 1200, currency: "JPY" })).toBe("¥12.00");
    expect(variantLabel("normal")).toBe("Normal");
    expect(variantLabel("foil")).toBe("Foil");
    expect(variantLabel("holofoil")).toBe("Holofoil");
    expect(cardTitle(card())).toBe("Mickey Mouse - Brave Little Tailor");
    expect(cardTitle(card({ subtitle: "" }))).toBe("Mickey Mouse");
    expect(shortCardNumber(card({ cardNumber: "207/204 • EN • 1" }))).toBe("207/204");
    expect(shortCardNumber(card({ cardNumber: "" }))).toBe("");
    expect(cardIdentifier(card({ rarity: "Enchanted" }), "foil")).toBe("12/204 • Enchanted • Foil");
  });
});

describe("marketplace listing card", () => {
  it("renders price, variant, availability, and pricing-mode badge", () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer_1", username: "buyer", emailVerifiedAt: "2026-01-01T00:00:00Z" } });

    render(
      <MemoryRouter>
        <MarketplaceListingCard card={card()} offer={offer({ sellerVerified: true, pricingMode: "ACCEPTS_OFFERS", availableQuantity: 3 })} onChat={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText("Mickey Mouse - Brave Little Tailor")).toBeInTheDocument();
    expect(screen.getByText("Normal · Rare")).toBeInTheDocument();
    expect(screen.getByText("ZZZ 12.34")).toBeInTheDocument();
    expect(screen.getByText("3 available ·")).toBeInTheDocument();
    expect(screen.getByText("Open to offers")).toBeInTheDocument();
    expect(screen.getByText("@seller")).toBeInTheDocument();
  });

  it("shows log-in link for anonymous users", () => {
    useAuthMock.mockReturnValue({ user: null });
    render(
      <MemoryRouter>
        <MarketplaceListingCard card={card()} offer={offer()} onChat={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Log in to chat" })).toHaveAttribute("href", "/login");
  });

  it("prompts unverified users to verify email", () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer_1", username: "buyer", emailVerifiedAt: null } });
    render(
      <MemoryRouter>
        <MarketplaceListingCard card={card()} offer={offer()} onChat={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText("Verify email to chat")).toBeInTheDocument();
  });

  it("fires onChat for verified buyers", () => {
    const onChat = vi.fn();
    useAuthMock.mockReturnValue({ user: { id: "buyer_1", username: "buyer", emailVerifiedAt: "2026-01-01T00:00:00Z" } });
    render(
      <MemoryRouter>
        <MarketplaceListingCard card={card()} offer={offer()} onChat={onChat} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(onChat).toHaveBeenCalledWith("listing_1");
  });

  it("shows a saving state and renders cards without a rarity", () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer_1", username: "buyer", emailVerifiedAt: "2026-01-01T00:00:00Z" } });
    render(
      <MemoryRouter>
        <MarketplaceListingCard card={card({ rarity: "" })} offer={offer({ pricingMode: "FIXED" })} onChat={vi.fn()} saving />
      </MemoryRouter>
    );
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText("Fixed price")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opening…" })).toBeDisabled();
  });
});
