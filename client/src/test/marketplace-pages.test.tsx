import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Card, MarketplaceCardOffer, MarketplaceCardOffersResponse, MarketplaceListResponse, MarketplaceEnquiriesResponse, MarketplaceEnquiryDetailResponse } from "../types";

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
  notifications: {
    list: vi.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
    unreadCount: vi.fn().mockResolvedValue({ unreadCount: 0 }),
    markRead: vi.fn().mockResolvedValue({ updated: 1, readAt: "2026-09-02T00:00:00.000Z" }),
    markAllRead: vi.fn().mockResolvedValue({ updated: 0 }),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: authMocks.useAuth,
}));

import MarketplacePage from "../pages/MarketplacePage";
import MarketplaceCardPage from "../pages/MarketplaceCardPage";
import MarketplaceEnquiriesPage from "../pages/MarketplaceEnquiriesPage";
import MarketplaceEnquiryPage from "../pages/MarketplaceEnquiryPage";
import Layout from "../components/Layout";

function EnquiryProbe() {
  const { enquiryId } = useParams<{ enquiryId: string }>();
  return <div>Enquiry: {enquiryId}</div>;
}

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

function makeOffer(overrides: Partial<MarketplaceCardOffer> = {}): MarketplaceCardOffer {
  return {
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
    ...overrides,
  };
}

const listResponse: MarketplaceListResponse = {
  results: [
    {
      card: makeCard(),
      variant: "holofoil",
      offersCount: 1,
      availableQuantity: 2,
      lowestPrice: { amountMinor: 18000, currency: "SGD" },
      approximateConvertedPrice: { amountMinor: 13320, currency: "USD", rateSource: "mock", fetchedAt: "2026-08-27T00:00:00Z" },
      canFulfilToViewer: true,
      offers: [makeOffer()],
    },
  ],
  pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
};

const offersResponse: MarketplaceCardOffersResponse = {
  card: makeCard(),
  offers: [makeOffer()],
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
  it("loads a listing feed and debounces search filters", async () => {
    apiMocks.marketplaceList.mockResolvedValue(listResponse);

    render(
      <MemoryRouter initialEntries={["/marketplace?availableOnly=true&variant=normal"]}>
        <MarketplacePage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Marketplace" })).toBeInTheDocument();
    expect(await screen.findByText("Elsa - Spirit of Winter")).toBeInTheDocument();
    expect(screen.getByText("Holofoil · Enchanted")).toBeInTheDocument();
    expect(screen.getByText("S$180.00")).toBeInTheDocument();
    expect(screen.getByText("2 available ·")).toBeInTheDocument();
    expect(screen.getByText("Open to offers")).toBeInTheDocument();
    expect(screen.getByText("@anna")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in to chat" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    expect(apiMocks.marketplaceList).toHaveBeenCalledWith(expect.objectContaining({ availableOnly: "true", variant: "normal" }));

    fireEvent.change(screen.getByLabelText("Variant"), { target: { value: "holofoil" } });
    await waitFor(() => expect(apiMocks.marketplaceList).toHaveBeenLastCalledWith(expect.objectContaining({ availableOnly: "true", variant: "holofoil" })));

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "mickey" } });
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
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(screen.getByLabelText("Variant")).toHaveValue("");
  });

  it("shows a card's listings with a chat CTA and no enquiry form", async () => {
    apiMocks.marketplaceCardOffers.mockResolvedValue(offersResponse);

    render(
      <MemoryRouter initialEntries={["/marketplace/card/card_elsa"]}>
        <Routes><Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} /></Routes>
      </MemoryRouter>
    );

    expect((await screen.findAllByText("Elsa - Spirit of Winter")).length).toBeGreaterThan(0);
    expect(screen.getByText("S$180.00")).toBeInTheDocument();
    expect(screen.getByText("Open to offers")).toBeInTheDocument();
    expect(screen.getByText("@anna")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in to chat" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Quantity wanted")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send enquiry" })).not.toBeInTheDocument();
  });

  it("lets a verified buyer start a chat with one tap", async () => {
    apiMocks.marketplaceCardOffers.mockResolvedValue(offersResponse);
    apiMocks.marketplaceCreateEnquiry.mockResolvedValue({ enquiry: { id: "enquiry_1" } });
    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" } } as any);

    render(
      <MemoryRouter initialEntries={["/marketplace/card/card_elsa"]}>
        <Routes>
          <Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} />
          <Route path="/marketplace/enquiries/:enquiryId" element={<div>Enquiry thread</div>} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Chat" }));
    expect(apiMocks.marketplaceCreateEnquiry).toHaveBeenCalledWith("listing_1", {});
    expect(await screen.findByText("Enquiry thread")).toBeInTheDocument();
  });

  it("prompts unverified buyers to verify email instead of chatting", async () => {
    apiMocks.marketplaceCardOffers.mockResolvedValue(offersResponse);
    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: null } } as any);

    render(
      <MemoryRouter initialEntries={["/marketplace/card/card_elsa"]}>
        <Routes><Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Verify email to chat")).toBeInTheDocument();
    expect(apiMocks.marketplaceCreateEnquiry).not.toHaveBeenCalled();
  });

  it("redirects to the existing chat when a duplicate enquiry is sent", async () => {
    apiMocks.marketplaceCardOffers.mockResolvedValue(offersResponse);
    const conflict = Object.assign(new Error("An active enquiry already exists for this listing"), {
      status: 409,
      body: { error: "An active enquiry already exists for this listing", enquiryId: "enquiry_existing" },
    });
    apiMocks.marketplaceCreateEnquiry.mockRejectedValue(conflict);
    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" } } as any);

    render(
      <MemoryRouter initialEntries={["/marketplace/card/card_elsa"]}>
        <Routes>
          <Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} />
          <Route path="/marketplace/enquiries/:enquiryId" element={<EnquiryProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Chat" }));
    expect(await screen.findByText("Enquiry: enquiry_existing")).toBeInTheDocument();
  });

  it("lists messages with counterparty, preview, and unread badge", async () => {
    apiMocks.marketplaceListEnquiries.mockResolvedValue(enquiriesResponse);
    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" } } as any);

    render(
      <MemoryRouter initialEntries={["/marketplace/enquiries"]}>
        <MarketplaceEnquiriesPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Messages" })).toBeInTheDocument();
    expect(screen.getByText("anna")).toBeInTheDocument();
    expect(screen.getByText("elsa")).toBeInTheDocument();
    expect(screen.getByText("Offer: 1 × S$180.00")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /anna/i })).toHaveAttribute("href", "/marketplace/enquiries/enquiry_1");
    expect(screen.getByRole("link", { name: /Mickey Mouse/i })).toHaveAttribute("href", "/marketplace/enquiries/enquiry_2");
  });

  it("keeps the app navigation visible around the chat thread", async () => {
    apiMocks.marketplaceGetEnquiry.mockResolvedValue(enquiryDetailResponse);
    authMocks.useAuth.mockReturnValue({ user: { id: "buyer_1", username: "jw", emailVerifiedAt: "2026-01-01T00:00:00Z" } } as any);

    render(
      <MemoryRouter initialEntries={["/marketplace/enquiries/enquiry_2"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/marketplace/enquiries/:enquiryId" element={<MarketplaceEnquiryPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Mickey Mouse - Brave Little Tailor · Normal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lorcana Inventory" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Messages/i }).length).toBeGreaterThan(0);
    const chat = screen.getByTestId("marketplace-enquiry-chat");
    expect(chat).not.toHaveClass("fixed");
    expect(chat).not.toHaveClass("inset-0");
    expect(chat).not.toHaveClass("z-50");
  });

  it("renders a chat thread with messages, offers, and deal actions", async () => {
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

    expect(await screen.findByText("Mickey Mouse - Brave Little Tailor · Normal")).toBeInTheDocument();
    expect(screen.getByText("I can do S$170.")).toBeInTheDocument();
    expect(screen.getByText("Offer · elsa")).toBeInTheDocument();
    expect(screen.getByText("1 × S$170.00")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Message elsa…"), "Sounds good");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(apiMocks.marketplaceSendMessage).toHaveBeenCalledWith("enquiry_2", "Sounds good");

    await userEvent.click(screen.getByRole("button", { name: "Make offer" }));
    await userEvent.clear(screen.getByLabelText("Unit price"));
    await userEvent.type(screen.getByLabelText("Unit price"), "165");
    await userEvent.click(screen.getByRole("button", { name: "Send offer" }));
    expect(apiMocks.marketplaceCreateOffer).toHaveBeenCalledWith("enquiry_2", expect.objectContaining({ unitPriceMinor: 16500 }));

    await userEvent.click(screen.getByRole("button", { name: "Accept offer" }));
    expect(apiMocks.marketplaceAcceptEnquiry).toHaveBeenCalledWith("enquiry_2");
  });
});
