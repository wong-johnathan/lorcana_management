import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Card, MarketplaceCardOffer, MarketplaceCardResult } from "../types";
import MarketplaceCardResultComponent from "../components/marketplace/MarketplaceCardResult";
import MarketplaceOfferCard from "../components/marketplace/MarketplaceOfferCard";
import {
  cardIdentifier,
  cardTitle,
  formatMarketplaceMoney,
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
    expect(cardTitle(card())).toBe("Mickey Mouse");
    expect(cardTitle(card({ subtitle: "Brave Little Tailor" }))).toBe("Mickey Mouse - Brave Little Tailor");
    expect(shortCardNumber(card({ cardNumber: "207/204 • EN • 1" }))).toBe("207/204");
    expect(shortCardNumber(card({ cardNumber: "" }))).toBe("");
    expect(cardIdentifier(card({ rarity: "Enchanted" }), "foil")).toBe("12/204 • Enchanted • Foil");
  });
});

describe("marketplace branch rendering", () => {
  it("renders singular seller count without approximate conversion", () => {
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
    expect(screen.queryByText(/fulfilment/i)).not.toBeInTheDocument();
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
    expect(screen.getByText("Normal × 1")).toBeInTheDocument();
    expect(screen.getByText("TCG reference (USD): $12.00")).toBeInTheDocument();
    expect(screen.getByText("Note: Meet near MRT")).toBeInTheDocument();
    expect(screen.queryByText("Email verified")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
  });

  it("requires buyer quantity and passes message plus optional OBO offer through", () => {
    const onEnquire = vi.fn();
    render(
      <MemoryRouter>
        <MarketplaceOfferCard
          offer={offer({ pricingMode: "ACCEPTS_OFFERS", availableQuantity: 3 })}
          user={{ id: "buyer_1", username: "buyer", emailVerifiedAt: "2026-08-27T00:00:00Z" } as any}
          onEnquire={onEnquire}
        />
      </MemoryRouter>
    );

    const button = screen.getByRole("button", { name: "Send enquiry" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Open to offers")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity wanted"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Message (optional)"), { target: { value: "  Is this still available?  " } });
    fireEvent.change(screen.getByLabelText("Offer unit price (optional)"), { target: { value: "10.50" } });
    fireEvent.click(button);

    expect(onEnquire).toHaveBeenCalledWith("listing_1", { quantity: 2, message: "Is this still available?", unitPriceMinor: 1050 });
  });

  it("sends no message and shows no offer input for fixed listings", () => {
    const onEnquire = vi.fn();
    render(
      <MemoryRouter>
        <MarketplaceOfferCard
          offer={offer({ pricingMode: "FIXED" })}
          user={{ id: "buyer_1", username: "buyer", emailVerifiedAt: "2026-08-27T00:00:00Z" } as any}
          onEnquire={onEnquire}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Quantity wanted"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(screen.queryByLabelText("Offer unit price (optional)")).not.toBeInTheDocument();
    expect(screen.getByText("Fixed price")).toBeInTheDocument();
    expect(onEnquire).toHaveBeenCalledWith("listing_1", { quantity: 1 });
  });
});
