import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Card, MarketplaceCardOffersResponse, MarketplaceListResponse, MarketplaceEnquiriesResponse, MarketplaceEnquiryDetailResponse } from "../types";

const apiMocks = vi.hoisted(() => ({
  marketplaceList: vi.fn(),
  marketplaceCardOffers: vi.fn(),
  marketplaceCreateEnquiry: vi.fn(),
  marketplaceListEnquiries: vi.fn(),
  marketplaceGetEnquiry: vi.fn(),
  marketplaceSendMessage: vi.fn(),
  marketplaceCreateOffer: vi.fn(),
  marketplaceAcceptEnquiry: vi.fn(),
  marketplaceDeclineEnquiry: vi.fn(),
  marketplaceWithdrawEnquiry: vi.fn(),
  marketplaceCancelReservation: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    list: apiMocks.marketplaceList,
    cardOffers: apiMocks.marketplaceCardOffers,
    createEnquiry: apiMocks.marketplaceCreateEnquiry,
    listEnquiries: apiMocks.marketplaceListEnquiries,
    getEnquiry: apiMocks.marketplaceGetEnquiry,
    sendMessage: apiMocks.marketplaceSendMessage,
    createOffer: apiMocks.marketplaceCreateOffer,
    acceptEnquiry: apiMocks.marketplaceAcceptEnquiry,
    declineEnquiry: apiMocks.marketplaceDeclineEnquiry,
    withdrawEnquiry: apiMocks.marketplaceWithdrawEnquiry,
    cancelReservation: apiMocks.marketplaceCancelReservation,
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: authMocks.useAuth,
}));

import MarketplacePage from "../pages/MarketplacePage";
import MarketplaceCardPage from "../pages/MarketplaceCardPage";
import MarketplaceEnquiriesPage from "../pages/MarketplaceEnquiriesPage";
import MarketplaceEnquiryPage from "../pages/MarketplaceEnquiryPage";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_elsa",
    externalId: 1,
    tcgPlayerId: 123,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Elsa",
    subtitle: "Spirit of Winter",
    character: "Elsa",
    types: ["Queen"],
    cardType: "Character",
    color: "Amethyst",
    setCode: "TFC",
    setName: "The First Chapter",
    rarity: "Enchanted",
    inkCost: 8,
    strength: 4,
    willpower: 6,
    lore: 3,
    abilities: "Shift",
    cardNumber: "207/204 • EN • 1",
    foilTypes: ["Lava"],
    imageUrl: "https://img.example/elsa.jpg",
    prices: [],
    ...overrides,
  };
}

const listResponse: MarketplaceListResponse = {
  results: [
    {
      card: makeCard(),
      variant: "holofoil",
      offersCount: 3,
      availableQuantity: 4,
      lowestPrice: { amountMinor: 18000, currency: "SGD" },
      approximateConvertedPrice: { amountMinor: 13320, currency: "USD", rateSource: "mock", fetchedAt: "2026-08-27T00:00:00Z" },
      canFulfilToViewer: true,
    },
  ],
  pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
};

const offersResponse: MarketplaceCardOffersResponse = {
  card: makeCard(),
  offers: [
    {
      listingId: "listing_1",
      seller: { id: "seller_1", username: "anna", emailVerifiedAt: "2026-01-01T00:00:00Z" },
      sellerVerified: true,
      variant: "holofoil",
      availableQuantity: 2,
      pricingMode: "ACCEPTS_OFFERS",
      askingPrice: { amountMinor: 18000, currency: "SGD" },
      approximateConvertedPrice: { amountMinor: 13320, currency: "USD", rateSource: "mock", fetchedAt: "2026-08-27T00:00:00Z" },
      condition: "NEAR_MINT",
      cardLanguage: "EN",
      note: "Meetup preferred",
      referencePrice: 175,
      referencePriceCurrency: "USD",
      originCountryCode: "SG",
      publicLocality: "Singapore",
      fulfilment: {
        allowsMeetup: true,
        shipsDomestically: true,
        shipsInternationally: false,
        shipsWorldwide: false,
        destinationCountryCodes: ["SG"],
      },
      reputation: {
        userId: "seller_1",
        role: "seller",
        ratingAverage: 4.8,
        reviewCount: 37,
        completedDeals: 52,
        uniqueCounterparties: 31,
        memberSince: "2025-03-01T00:00:00Z",
        emailVerified: true,
      },
    },
  ],
};

const enquiriesResponse: MarketplaceEnquiriesResponse = {
  enquiries: [
    {
      id: "enquiry_1",
      status: "PENDING_SELLER",
      listingId: "listing_1",
      buyer: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" },
      seller: { id: "seller_1", username: "anna", emailVerifiedAt: "2026-01-01T00:00:00Z" },
      card: makeCard(),
      variant: "holofoil",
      quantity: 1,
      pricingMode: "ACCEPTS_OFFERS",
      askingPrice: { amountMinor: 18000, currency: "SGD" },
      lastActivityAt: "2026-08-27T00:00:00Z",
      unreadCount: 2,
      latestOffer: { quantity: 1, unitPrice: { amountMinor: 18000, currency: "SGD" } },
    },
    {
      id: "enquiry_2",
      status: "AWAITING_BUYER",
      listingId: "listing_2",
      buyer: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" },
      seller: { id: "seller_2", username: "elsa", emailVerifiedAt: "2026-01-01T00:00:00Z" },
      card: makeCard({ id: "card_mickey", name: "Mickey Mouse", subtitle: "Brave Little Tailor" }),
      variant: "normal",
      quantity: 1,
      pricingMode: "ACCEPTS_OFFERS",
      askingPrice: { amountMinor: 18000, currency: "SGD" },
      lastActivityAt: "2026-08-27T01:00:00Z",
      unreadCount: 0,
    },
  ],
};

const enquiryDetailResponse: MarketplaceEnquiryDetailResponse = {
  enquiry: {
    ...enquiriesResponse.enquiries[1],
    reservation: null,
    messages: [
      {
        id: "message_1",
        enquiryId: "enquiry_2",
        sender: { id: "seller_2", username: "elsa" },
        message: "I can do S$170.",
        createdAt: "2026-08-27T01:10:00Z",
      },
    ],
    offers: [
      {
        id: "offer_1",
        enquiryId: "enquiry_2",
        proposedBy: { id: "seller_2", username: "elsa" },
        quantity: 1,
        unitPrice: { amountMinor: 17000, currency: "SGD" },
        createdAt: "2026-08-27T01:05:00Z",
      },
    ],
    latestOffer: { quantity: 1, unitPrice: { amountMinor: 17000, currency: "SGD" } },
  },
};

beforeEach(() => {
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  authMocks.useAuth.mockReturnValue({ user: null } as any);
});

describe("marketplace discovery pages", () => {
  it("loads public card-centric marketplace results and debounces search filters", async () => {
    apiMocks.marketplaceList.mockResolvedValue(listResponse);

    render(
      <MemoryRouter initialEntries={["/marketplace?availableOnly=true&variant=normal"]}>
        <MarketplacePage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Marketplace" })).toBeInTheDocument();
    expect(await screen.findByText("Elsa - Spirit of Winter")).toBeInTheDocument();
    expect(screen.getByText("207/204 • Enchanted • Holofoil")).toBeInTheDocument();
    expect(screen.getByText("3 available sellers • From S$180.00")).toBeInTheDocument();
    expect(screen.getByText("≈ US$133.20")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /compare offers/i })).toHaveAttribute("href", "/marketplace/card/card_elsa");
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    expect(apiMocks.marketplaceList).toHaveBeenCalledWith(expect.objectContaining({ availableOnly: "true", variant: "normal" }));

    fireEvent.change(screen.getByLabelText("Variant"), { target: { value: "holofoil" } });
    await waitFor(() => expect(apiMocks.marketplaceList).toHaveBeenLastCalledWith(expect.objectContaining({ availableOnly: "true", variant: "holofoil" })));

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Search marketplace"), { target: { value: "mickey" } });
    expect(apiMocks.marketplaceList).not.toHaveBeenLastCalledWith(expect.objectContaining({ search: "mickey" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(apiMocks.marketplaceList).not.toHaveBeenLastCalledWith(expect.objectContaining({ search: "mickey" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    vi.useRealTimers();
    await waitFor(() => expect(apiMocks.marketplaceList).toHaveBeenLastCalledWith(expect.objectContaining({ search: "mickey", variant: "holofoil" })));

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    await waitFor(() => expect(apiMocks.marketplaceList).toHaveBeenLastCalledWith({ availableOnly: "true" }));
    expect(screen.getByLabelText("Search marketplace")).toHaveValue("");
    expect(screen.getByLabelText("Variant")).toHaveValue("");
  });

  it("shows card offer comparison with the same fields used by Extras for Sale listings", async () => {
    apiMocks.marketplaceCardOffers.mockResolvedValue(offersResponse);

    render(
      <MemoryRouter initialEntries={["/marketplace/card/card_elsa"]}>
        <Routes><Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Elsa - Spirit of Winter" })).toBeInTheDocument();
    expect(screen.getByText("S$180.00")).toBeInTheDocument();
    expect(screen.getByText("≈ US$133.20" )).toBeInTheDocument();
    expect(screen.getByText("Holofoil × 2")).toBeInTheDocument();
    expect(screen.getByText("TCG reference (USD): $175.00")).toBeInTheDocument();
    expect(screen.getByText("Note: Meetup preferred")).toBeInTheDocument();
    expect(screen.getByText("Email verified")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in to send enquiry" })).toHaveAttribute("href", "/login");
  });

  it("lets verified buyers create a listing-bound enquiry with a message and blocks unverified buyers", async () => {
    apiMocks.marketplaceCardOffers.mockResolvedValue(offersResponse);
    apiMocks.marketplaceCreateEnquiry.mockResolvedValue({ enquiry: { id: "enquiry_1" } });
    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" } } as any);

    const { rerender } = render(
      <MemoryRouter initialEntries={["/marketplace/card/card_elsa"]}>
        <Routes><Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} /></Routes>
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByLabelText("Quantity wanted"), "2");
    await userEvent.type(screen.getByLabelText("Message (optional)"), "Is this available?");
    await userEvent.type(screen.getByLabelText("Offer unit price (optional)"), "170");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(apiMocks.marketplaceCreateEnquiry).toHaveBeenCalledWith("listing_1", { quantity: 2, message: "Is this available?", unitPriceMinor: 17000 });
    expect(await screen.findByText("Enquiry sent" )).toBeInTheDocument();

    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: null } } as any);
    rerender(
      <MemoryRouter initialEntries={["/marketplace/card/card_elsa"]}>
        <Routes><Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("Verify email to send enquiries")).toBeInTheDocument();
  });

  it("sends an enquiry without a message when the buyer leaves it blank", async () => {
    apiMocks.marketplaceCardOffers.mockResolvedValue(offersResponse);
    apiMocks.marketplaceCreateEnquiry.mockResolvedValue({ enquiry: { id: "enquiry_1" } });
    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" } } as any);

    render(
      <MemoryRouter initialEntries={["/marketplace/card/card_elsa"]}>
        <Routes><Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} /></Routes>
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByLabelText("Quantity wanted"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(apiMocks.marketplaceCreateEnquiry).toHaveBeenCalledWith("listing_1", { quantity: 1 });
  });

  it("groups authenticated buyer enquiries by status with dashboard links", async () => {
    apiMocks.marketplaceListEnquiries.mockResolvedValue(enquiriesResponse);

    render(
      <MemoryRouter initialEntries={["/marketplace/enquiries"]}>
        <MarketplaceEnquiriesPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Marketplace enquiries" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Awaiting seller" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Awaiting buyer" })).toBeInTheDocument();
    expect(screen.getByText("2 unread")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Elsa - Spirit of Winter/i })).toHaveAttribute("href", "/marketplace/enquiries/enquiry_1");
    expect(screen.getByRole("link", { name: /Mickey Mouse - Brave Little Tailor/i })).toHaveAttribute("href", "/marketplace/enquiries/enquiry_2");
  });

  it("renders an actionable enquiry thread with messages, offers, accept, counter, and reservation controls", async () => {
    apiMocks.marketplaceGetEnquiry.mockResolvedValue(enquiryDetailResponse);
    apiMocks.marketplaceSendMessage.mockResolvedValue({ message: { id: "message_2" } });
    apiMocks.marketplaceCreateOffer.mockResolvedValue({ offer: { id: "offer_2" } });
    apiMocks.marketplaceAcceptEnquiry.mockResolvedValue({ reservation: { id: "reservation_1", status: "RESERVED" } });
    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" } } as any);

    render(
      <MemoryRouter initialEntries={["/marketplace/enquiries/enquiry_2"]}>
        <Routes><Route path="/marketplace/enquiries/:enquiryId" element={<MarketplaceEnquiryPage />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Mickey Mouse - Brave Little Tailor" })).toBeInTheDocument();
    expect(screen.getByText("I can do S$170.")).toBeInTheDocument();
    expect(screen.getByText("Offer from elsa: 1 × S$170.00" )).toBeInTheDocument();
    expect(screen.queryByText(/Shipping price|Fulfilment|Buyer country/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Message"), "Sounds good");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(apiMocks.marketplaceSendMessage).toHaveBeenCalledWith("enquiry_2", "Sounds good");

    await userEvent.clear(screen.getByLabelText("Unit price"));
    await userEvent.type(screen.getByLabelText("Unit price"), "165");
    await userEvent.click(screen.getByRole("button", { name: "Send counteroffer" }));
    expect(apiMocks.marketplaceCreateOffer).toHaveBeenCalledWith("enquiry_2", expect.objectContaining({ unitPriceMinor: 16500 }));

    await userEvent.click(screen.getByRole("button", { name: "Accept and reserve" }));
    expect(apiMocks.marketplaceAcceptEnquiry).toHaveBeenCalledWith("enquiry_2");
  });
});
