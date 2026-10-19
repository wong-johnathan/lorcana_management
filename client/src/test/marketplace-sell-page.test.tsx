import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceSellPage from "../pages/marketplace/MarketplaceSellPage";
import type { InventoryEntry, InventoryPolicy, MarketplaceListing } from "../types";

const {
  inventoryListMock,
  getPolicyMock,
  getMyListingsMock,
  getTransactionsMock,
  createListingMock,
} = vi.hoisted(() => ({
  inventoryListMock: vi.fn(),
  getPolicyMock: vi.fn(),
  getMyListingsMock: vi.fn(),
  getTransactionsMock: vi.fn(),
  createListingMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  inventory: {
    list: inventoryListMock,
    getPolicy: getPolicyMock,
  },
  marketplace: {
    getMyListings: getMyListingsMock,
    getTransactions: getTransactionsMock,
    createListing: createListingMock,
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
  prices: [],
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

const secondCard = {
  ...card,
  id: "card_2",
  name: "Mickey Mouse, Brave Little Tailor",
  subtitle: "Brave Little Tailor",
  setCode: "ROTF",
  setName: "Rise of the Floodborn",
  foilTypes: ["Lava"],
};

const secondInventoryEntry: InventoryEntry = {
  id: "inv_2",
  userId: "seller_1",
  cardId: "card_2",
  quantity: 0,
  foilQuantity: 0,
  holofoilQuantity: 2,
  card: secondCard,
};

describe("MarketplaceSellPage", () => {
  beforeEach(() => {
    inventoryListMock.mockReset();
    getPolicyMock.mockReset();
    getMyListingsMock.mockReset();
    getTransactionsMock.mockReset();
    createListingMock.mockReset();
  });

  it("lists a CLOSED (sold-out) listing as editable (D2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([]);
    getPolicyMock.mockResolvedValue(null);
    getMyListingsMock.mockResolvedValue({ listings: [closedListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    render(<MarketplaceSellPage />);

    expect(await screen.findByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(await screen.findByText("Sold out — price/quantity locked")).toBeInTheDocument();
  });

  it("renders tiles with the card image, set, and collector number (REQ-POL-8)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([]);
    getPolicyMock.mockResolvedValue(null);
    getMyListingsMock.mockResolvedValue({ listings: [activeListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    render(<MarketplaceSellPage />);

    expect(await screen.findByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("The First Chapter · 1/204")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen" })).toBeInTheDocument();
  });

  it("renders a non-triggerable placeholder for a no-art, no-photo listing (AC-LB-3.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([]);
    getPolicyMock.mockResolvedValue(null);
    getMyListingsMock.mockResolvedValue({ listings: [activeListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    render(<MarketplaceSellPage />);

    expect(await screen.findByRole("img", { name: "Elsa, Snow Queen" })).toHaveAttribute(
      "src",
      "/lorcana-logo.png"
    );
    // Non-triggerable: no "View …" button wrapper, and clicking opens no dialog.
    expect(screen.queryByRole("button", { name: "View Elsa, Snow Queen" })).not.toBeInTheDocument();
  });

  it("opens the carousel at index 0 with the full set for a tile with art + photos (AC-LB-6.1)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([]);
    getPolicyMock.mockResolvedValue(null);
    getMyListingsMock.mockResolvedValue({
      listings: [
        {
          ...activeListing,
          card: { ...card, imageUrl: "https://img.example/elsa.jpg" },
          photos: [{ id: "photo_1", url: "https://img.example/cond.jpg", sortOrder: 1, label: null }],
        },
      ],
    });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    render(<MarketplaceSellPage />);

    await userEvent.click(await screen.findByRole("button", { name: "View Elsa, Snow Queen" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Elsa, Snow Queen · The First Chapter · 1/204");
    expect(
      within(dialog).getByRole("img", { name: "Elsa, Snow Queen · The First Chapter · 1/204" })
    ).toHaveAttribute("src", "/api/card-images/card_1");
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Next image" }));
    expect(within(dialog).getByRole("img", { name: "condition photo" })).toHaveAttribute(
      "src",
      "https://img.example/cond.jpg"
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("walks the two-step create flow with Back preserving filters and Cancel returning to the list", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    render(<MarketplaceSellPage />);

    // Wait for initial load, then enter the create flow.
    await screen.findByText("You have no listings yet. Create one to start selling.");
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    // Step 1 — picker.
    expect(await screen.findByText("Choose a card to list")).toBeInTheDocument();
    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();

    // Type a search so we can assert it is preserved across Back.
    await userEvent.type(screen.getByPlaceholderText("Search by name..."), "elsa");

    // Step 2 — locked form.
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));
    expect(await screen.findByLabelText("Variant")).toBeInTheDocument();
    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();

    // Back returns to the picker with the search text preserved.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Choose a card to list")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name...")).toHaveValue("elsa");

    // Cancel returns to the listings list and discards the flow.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Create listing" })).toBeInTheDocument();
    expect(screen.queryByText("Choose a card to list")).not.toBeInTheDocument();
  });

  it("submits the locked form, closes it, and refreshes listings", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });
    createListingMock.mockResolvedValue({ ...closedListing, status: "ACTIVE", quantity: 1 });

    render(<MarketplaceSellPage />);

    await screen.findByText("You have no listings yet. Create one to start selling.");
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));
    await screen.findByText("Choose a card to list");
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    await waitFor(() => expect(createListingMock).toHaveBeenCalledTimes(1));
    expect(createListingMock).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: "card_1", variant: "normal", quantity: 1, priceMinor: 1000 })
    );

    // The form closes (create button returns) and listings reload.
    expect(await screen.findByRole("button", { name: "Create listing" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Variant")).not.toBeInTheDocument();
  });

  it("locks an ACTIVE listing with a PENDING_CONFIRMATION transaction (REQ-8)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [activeListing] });
    getTransactionsMock.mockResolvedValue({ transactions: [pendingTransaction] });

    render(<MarketplaceSellPage />);

    expect(await screen.findByText("Pending sale — price/quantity locked")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByLabelText(/Quantity/)).toBeDisabled();
    expect(screen.getByLabelText("Currency")).toBeDisabled();
    expect(screen.getByLabelText("Price")).toBeDisabled();
  });

  it("cancels from the Step 2 form back to the listings list", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    render(<MarketplaceSellPage />);

    await screen.findByText("You have no listings yet. Create one to start selling.");
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));
    await screen.findByText("Choose a card to list");
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));
    expect(await screen.findByLabelText("Variant")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Create listing" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Variant")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose a card to list")).not.toBeInTheDocument();
  });

  it("locks the newly-picked card's name/set and default variant after Back (REQ-UX-9)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    inventoryListMock.mockResolvedValue([inventoryEntry, secondInventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    render(<MarketplaceSellPage />);

    await screen.findByText("You have no listings yet. Create one to start selling.");
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));
    await screen.findByText("Choose a card to list");

    // Pick Elsa (normal default variant).
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));
    expect(await screen.findByLabelText("Variant")).toBeInTheDocument();
    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByLabelText("Variant")).toHaveValue("normal");

    // Back, then pick a DIFFERENT card (holofoil-only → default variant holofoil).
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Choose a card to list");
    await userEvent.click(screen.getByRole("button", { name: /Mickey Mouse, Brave Little Tailor/ }));

    expect(await screen.findByLabelText("Variant")).toBeInTheDocument();
    expect(screen.getByText("Mickey Mouse, Brave Little Tailor")).toBeInTheDocument();
    expect(screen.getByText("Rise of the Floodborn")).toBeInTheDocument();
    expect(screen.getByLabelText("Variant")).toHaveValue("holofoil");
  });
});
