import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceEditListingPage from "../pages/marketplace/MarketplaceEditListingPage";
import type { InventoryEntry, InventoryPolicy, MarketplaceListing } from "../types";

const {
  inventoryListMock,
  getPolicyMock,
  getMyListingsMock,
  getTransactionsMock,
  updateListingMock,
  deleteListingMock,
} = vi.hoisted(() => ({
  inventoryListMock: vi.fn(),
  getPolicyMock: vi.fn(),
  getMyListingsMock: vi.fn(),
  getTransactionsMock: vi.fn(),
  updateListingMock: vi.fn(),
  deleteListingMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  inventory: {
    list: inventoryListMock,
    getPolicy: getPolicyMock,
  },
  marketplace: {
    getMyListings: getMyListingsMock,
    getTransactions: getTransactionsMock,
    updateListing: updateListingMock,
    deleteListing: deleteListingMock,
  },
  cards: {
    filters: vi.fn(),
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
  prices: [
    {
      variant: "Normal",
      lowPrice: 9,
      midPrice: 11,
      highPrice: 15,
      marketPrice: 12.34,
      updatedAt: "2026-10-18T00:00:00.000Z",
    },
  ],
};

const inventoryEntry: InventoryEntry = {
  id: "inv_1",
  userId: "seller_1",
  cardId: "card_1",
  quantity: 3,
  foilQuantity: 0,
  holofoilQuantity: 0,
  card,
};

const policy: InventoryPolicy = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
};

const baseListing: MarketplaceListing = {
  id: "listing_1",
  sellerId: "seller_1",
  cardId: "card_1",
  variant: "normal",
  quantity: 2,
  priceMinor: 1200,
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

const closedListing: MarketplaceListing = {
  ...baseListing,
  status: "CLOSED",
  quantity: 0,
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
  priceMinor: 1200,
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

const seller = { id: "seller_1", username: "alice" };

function renderEditPage() {
  return render(
    <MemoryRouter initialEntries={["/marketplace/sell/listing_1/edit"]}>
      <Routes>
        <Route path="/marketplace/sell/:id/edit" element={<MarketplaceEditListingPage />} />
        <Route path="/marketplace/sell" element={<div>Sell listings page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function signIn() {
  vi.mocked(useAuth).mockReturnValue({ user: seller } as never);
}

beforeEach(() => {
  inventoryListMock.mockReset();
  getPolicyMock.mockReset();
  getMyListingsMock.mockReset();
  getTransactionsMock.mockReset();
  updateListingMock.mockReset();
  deleteListingMock.mockReset();
});

describe("MarketplaceEditListingPage", () => {
  it("gates the form behind Loading listing… then hydrates saved values and the TCG reference", async () => {
    signIn();
    let resolveMine: (value: { listings: MarketplaceListing[] }) => void = () => {};
    getMyListingsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveMine = resolve;
      })
    );
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderEditPage();

    // AC-LC-6.8 — no form/skeleton before the data resolves.
    expect(screen.getByText("Loading listing…")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Quantity/)).not.toBeInTheDocument();

    resolveMine({ listings: [baseListing] });

    expect(await screen.findByLabelText(/Quantity/)).toHaveValue(2);
    expect(screen.getByRole("heading", { level: 1, name: "Edit listing" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Listing details" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading listing…")).not.toBeInTheDocument();

    // Saved values (AC-LC-4.4 direct/refresh-safe mount).
    expect(screen.getByLabelText("Price")).toHaveValue("12.00");
    expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    expect(screen.getByLabelText("Location")).toHaveValue("London");

    // AC-LC-6.3 — TCG reference comes from card.prices via getMyListings.
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent(
      "TCG market $12.34 (low $9.00 · high $15.00) (USD)"
    );

    // TD-3 inventory/policy parity: owned hint is present.
    expect(screen.getByText("You own 3 Normal copies.")).toBeInTheDocument();

    // TD-1/TD-2/TD-3 — one 4-way batch, never marketplace.listing(id).
    expect(getMyListingsMock).toHaveBeenCalledTimes(1);
    expect(inventoryListMock).toHaveBeenCalledTimes(1);
    expect(getPolicyMock).toHaveBeenCalledTimes(1);
    expect(getTransactionsMock).toHaveBeenCalledWith("PENDING_CONFIRMATION");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("locks a CLOSED listing's price/currency/quantity and delete", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [closedListing] });
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderEditPage();

    expect(await screen.findByLabelText(/Quantity/)).toBeDisabled();
    expect(screen.getByLabelText("Currency")).toBeDisabled();
    expect(screen.getByLabelText("Price")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete listing" })).toBeDisabled();
    expect(
      screen.getByText(/Price, currency, and quantity are locked while a sale is pending/)
    ).toBeInTheDocument();
  });

  it("locks an ACTIVE listing with a pending seller transaction", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [baseListing] });
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({ transactions: [pendingTransaction] });

    renderEditPage();

    expect(await screen.findByLabelText(/Quantity/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete listing" })).toBeDisabled();
  });

  it("does not lock an ACTIVE listing whose pending transaction belongs to another seller", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [baseListing] });
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({
      transactions: [{ ...pendingTransaction, sellerId: "seller_2" }],
    });

    renderEditPage();

    expect(await screen.findByLabelText(/Quantity/)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete listing" })).toBeEnabled();
  });

  it("saves via updateListing then navigates to the listings surface", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [baseListing] });
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({ transactions: [] });
    updateListingMock.mockResolvedValue(baseListing);

    renderEditPage();

    await screen.findByLabelText(/Quantity/);
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Paris" } });

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateListingMock).toHaveBeenCalledTimes(1));
    expect(updateListingMock).toHaveBeenCalledWith("listing_1", {
      quantity: 2,
      priceMinor: 2000,
      currency: "USD",
      condition: "NM",
      location: "Paris",
      note: null,
    });
    expect(await screen.findByText("Sell listings page")).toBeInTheDocument();
  });

  it("deletes via deleteListing then navigates to the listings surface", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [baseListing] });
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({ transactions: [] });
    deleteListingMock.mockResolvedValue(undefined);

    renderEditPage();

    await screen.findByLabelText(/Quantity/);
    await userEvent.click(screen.getByRole("button", { name: "Delete listing" }));

    await waitFor(() => expect(deleteListingMock).toHaveBeenCalledWith("listing_1"));
    expect(await screen.findByText("Sell listings page")).toBeInTheDocument();
  });

  it("replace-redirects an unknown listing id without rendering a form", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [] });
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderEditPage();

    expect(await screen.findByText("Sell listings page")).toBeInTheDocument();
    expect(screen.queryByText("Listing details")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Quantity/)).not.toBeInTheDocument();
    expect(screen.queryByText("Loading listing…")).not.toBeInTheDocument();
  });

  it("replace-redirects a hidden listing without rendering a form", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({
      listings: [{ ...baseListing, hiddenAt: "2026-10-19T00:00:00.000Z" }],
    });
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderEditPage();

    expect(await screen.findByText("Sell listings page")).toBeInTheDocument();
    expect(screen.queryByText("Listing details")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Quantity/)).not.toBeInTheDocument();
  });

  it("shows the page error banner (no form) when hydration fails", async () => {
    signIn();
    getMyListingsMock.mockResolvedValue({ listings: [baseListing] });
    inventoryListMock.mockRejectedValue(new Error("Inventory unavailable"));
    getPolicyMock.mockResolvedValue(policy);
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderEditPage();

    expect(await screen.findByText("Inventory unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Listing details")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Quantity/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sell listings page")).not.toBeInTheDocument();
  });

  it("requires sign-in and makes no API calls when signed out", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);

    renderEditPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign in required" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Edit listing" })).not.toBeInTheDocument();
    expect(getMyListingsMock).not.toHaveBeenCalled();
    expect(inventoryListMock).not.toHaveBeenCalled();
  });
});
