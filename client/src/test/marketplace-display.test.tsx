import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Card, MarketplaceCardOffer, MarketplaceCardResult } from "../types";
import MarketplaceCardResultComponent from "../components/marketplace/MarketplaceCardResult";
import MarketplaceOfferCard from "../components/marketplace/MarketplaceOfferCard";
import {
  cardIdentifier,
  cardTitle,
  conditionLabel,
  formatMarketplaceMoney,
  fulfilmentSummary,
  shortCardNumber,
  variantLabel,
} from "../components/marketplace/marketplaceDisplay";

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: null,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Mickey Mouse",
    subtitle: "",
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
  it("formats money, variants, conditions, titles, identifiers, and fulfilment fallbacks", () => {
    expect(formatMarketplaceMoney(null)).toBe("Price unavailable");
    expect(formatMarketplaceMoney({ amountMinor: 1234, currency: "ZZZ" as any })).toBe("ZZZ 12.34");
    expect(formatMarketplaceMoney({ amountMinor: 1200, currency: "JPY" })).toBe("¥12.00");
    expect(variantLabel("normal")).toBe("Normal");
    expect(variantLabel("foil")).toBe("Foil");
    expect(variantLabel("holofoil")).toBe("Holofoil");
    expect(conditionLabel("HEAVILY_PLAYED")).toBe("Heavily Played");
    expect(cardTitle(card())).toBe("Mickey Mouse");
    expect(cardTitle(card({ subtitle: "Brave Little Tailor" }))).toBe("Mickey Mouse - Brave Little Tailor");
    expect(shortCardNumber(card({ cardNumber: "207/204 • EN • 1" }))).toBe("207/204");
    expect(shortCardNumber(card({ cardNumber: "" }))).toBe("");
    expect(cardIdentifier(card({ rarity: "Enchanted" }), "foil")).toBe("12/204 • Enchanted • Foil");
    expect(fulfilmentSummary({ allowsMeetup: false, shipsDomestically: false, shipsInternationally: false, shipsWorldwide: false, destinationCountryCodes: [] })).toBe("Fulfilment pending · destination not configured");
    expect(fulfilmentSummary({ allowsMeetup: true, shipsDomestically: true, shipsInternationally: true, shipsWorldwide: true, destinationCountryCodes: [] })).toBe("Meetup · Domestic shipping · International shipping · worldwide");
    expect(fulfilmentSummary({ allowsMeetup: false, shipsDomestically: false, shipsInternationally: true, shipsWorldwide: false, destinationCountryCodes: ["SG", "MY"] })).toBe("International shipping · to SG, MY");
  });
});

describe("marketplace branch rendering", () => {
  it("renders singular seller count and destination warning without approximate conversion", () => {
    const result: MarketplaceCardResult = {
      card: card(),
      variant: "normal",
      offersCount: 1,
      availableQuantity: 1,
      lowestPrice: { amountMinor: 1234, currency: "ZZZ" as any },
      approximateConvertedPrice: null,
      canFulfilToViewer: false,
    };

    render(
      <MemoryRouter>
        <MarketplaceCardResultComponent result={result} />
      </MemoryRouter>
    );

    expect(screen.getByText("1 available seller • From ZZZ 12.34")).toBeInTheDocument();
    expect(screen.getByText("Check fulfilment coverage before enquiring")).toBeInTheDocument();
  });

  it("renders unverified new sellers and the disabled saving enquiry button", () => {
    const onEnquire = vi.fn();
    render(
      <MemoryRouter>
        <MarketplaceOfferCard
          offer={offer({ pricingMode: "FIXED" })}
          user={{ id: "buyer_1", username: "buyer", emailVerifiedAt: "2026-08-27T00:00:00Z" } as any}
          saving
          onEnquire={onEnquire}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("seller")).toBeInTheDocument();
    expect(screen.getByText("SG · Normal · Lightly Played · EN")).toBeInTheDocument();
    expect(screen.queryByText("Email verified")).not.toBeInTheDocument();
    expect(screen.getByText("★ New seller rating")).toBeInTheDocument();
    expect(screen.getByText("0 seller reviews · 0 completed marketplace deals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
  });
});
