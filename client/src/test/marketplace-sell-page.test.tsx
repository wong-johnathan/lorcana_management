import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceSellPage from "../pages/marketplace/MarketplaceSellPage";
import type { MarketplaceListing } from "../types";

const {
  inventoryListMock,
  getPolicyMock,
  getMyListingsMock,
  getTransactionsMock,
} = vi.hoisted(() => ({
  inventoryListMock: vi.fn(),
  getPolicyMock: vi.fn(),
  getMyListingsMock: vi.fn(),
  getTransactionsMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  inventory: {
    list: inventoryListMock,
    getPolicy: getPolicyMock,
  },
  marketplace: {
    getMyListings: getMyListingsMock,
    getTransactions: getTransactionsMock,
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const card = {
  id: "card_1",
  externalId: 1,
  tcgPlayerId: null,
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
  cardNumber: "1/204",
  foilTypes: ["None", "Silver"],
  imageUrl: "",
  prices: [],
};

const closedListing: MarketplaceListing = {
  id: "listing_1",
  sellerId: "seller_1",
  cardId: "card_1",
  variant: "normal",
  quantity: 0,
  priceMinor: 2500,
  currency: "USD",
  condition: "NM",
  location: "London",
  note: null,
  status: "CLOSED",
  hiddenAt: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  card,
  seller: { id: "seller_1", username: "alice", profile: {} },
  photos: [],
};

const activeListing: MarketplaceListing = {
  ...closedListing,
  status: "ACTIVE",
  quantity: 2,
};

const pendingTransaction = {
  id: "tx_1",
  enquiryId: "enq_1",
  listingId: "listing_1",
  buyerId: "buyer_1",
  sellerId: "seller_1",
  cardId: "card_1",
  variant: "normal",
  quantity: 2,
  priceMinor: 2500,
  currency: "USD",
  status: "PENDING_CONFIRMATION",
  completedCause: null,
  cancelledBy: null,
  soldAt: "2026-10-18T00:00:00.000Z",
  confirmedAt: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  buyer: { id: "buyer_1", username: "bob" },
  seller: { id: "seller_1", username: "alice" },
  card: { id: "card_1", name: "Elsa, Snow Queen", setName: "The First Chapter" },
};

function renderSellPage() {
  return render(
    <MemoryRouter>
      <MarketplaceSellPage />
    </MemoryRouter>
  );
}

function signIn() {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
}

beforeEach(() => {
  inventoryListMock.mockReset();
  getPolicyMock.mockReset();
  getMyListingsMock.mockReset();
  getTransactionsMock.mockReset();
});

describe("MarketplaceSellPage", () => {
  it("renders a Transactions link to /marketplace/transactions (AC-NOTIF-2.2)", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderSellPage();

    expect(await screen.findByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/marketplace/transactions"
    );
  });

  it("always renders Create listing as a link to /marketplace/sell/new (AC-LC-1.2/1.4)", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [activeListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderSellPage();

    await screen.findByText("Elsa, Snow Queen");
    expect(screen.getByRole("link", { name: "Create listing" })).toHaveAttribute(
      "href",
      "/marketplace/sell/new"
    );
    // The flow is no longer inline on this page (AC-LC-1.3).
    expect(screen.queryByText("Choose a card to list")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Variant")).not.toBeInTheDocument();
  });

  it("renders Create listing even in the empty state", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderSellPage();

    expect(
      await screen.findByText("You have no listings yet. Create one to start selling.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create listing" })).toHaveAttribute(
      "href",
      "/marketplace/sell/new"
    );
  });

  it("lists a CLOSED (sold-out) listing with a Closed badge, lock label, and Edit link (D2)", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [closedListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderSellPage();

    expect(await screen.findByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Sold out — price/quantity locked")).toBeInTheDocument();

    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit listing: Elsa, Snow Queen, Normal" })
    ).toHaveAttribute("href", "/marketplace/sell/listing_1/edit");
  });

  it("renders tiles with the card image, set, and collector number (REQ-POL-8)", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [activeListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderSellPage();

    expect(await screen.findByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("The First Chapter · 1/204")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen" })).toBeInTheDocument();
  });

  it("renders a non-triggerable placeholder for a no-art, no-photo listing (AC-LB-3.3)", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [activeListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderSellPage();

    expect(await screen.findByRole("img", { name: "Elsa, Snow Queen" })).toHaveAttribute(
      "src",
      "/lorcana-logo.png"
    );
    // Non-triggerable: no "View …" button wrapper, and clicking opens no dialog.
    expect(screen.queryByRole("button", { name: "View Elsa, Snow Queen" })).not.toBeInTheDocument();
  });

  it("keeps the pending-sale lock label on an ACTIVE listing with a PENDING_CONFIRMATION transaction (REQ-8)", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [activeListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [pendingTransaction] });

    renderSellPage();

    expect(await screen.findByText("Pending sale — price/quantity locked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit listing: Elsa, Snow Queen, Normal" })).toBeInTheDocument();
  });

  it("does not fetch inventory or keep policy on mount (AC-LC-8.1)", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [activeListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderSellPage();

    await screen.findByText("Elsa, Snow Queen");
    expect(getMyListingsMock).toHaveBeenCalledTimes(1);
    expect(getTransactionsMock).toHaveBeenCalledWith("PENDING_CONFIRMATION");
    expect(inventoryListMock).not.toHaveBeenCalled();
    expect(getPolicyMock).not.toHaveBeenCalled();
  });
});
