import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceCreateListingPage from "../pages/marketplace/MarketplaceCreateListingPage";
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

const seller = { id: "seller_1", username: "alice" };

/** card_2 with a normal copy, so both fixtures can appear in the picker. */
const secondNormalEntry: InventoryEntry = {
  ...secondInventoryEntry,
  quantity: 2,
  holofoilQuantity: 0,
};

const listedCardOne: MarketplaceListing = {
  id: "listing_1",
  sellerId: "seller_1",
  cardId: "card_1",
  variant: "normal",
  quantity: 1,
  priceMinor: 1000,
  currency: "SGD",
  condition: "NM",
  location: "Singapore",
  note: null,
  status: "ACTIVE",
  hiddenAt: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  card: null,
  seller: null,
  photos: [],
};

function renderCreatePage() {
  return render(
    <MemoryRouter initialEntries={["/marketplace/sell/new"]}>
      <Routes>
        <Route path="/marketplace/sell/new" element={<MarketplaceCreateListingPage />} />
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
  createListingMock.mockReset();
  // Own listings drive the default "Unlisted only" filter; default to none.
  getMyListingsMock.mockResolvedValue({ listings: [] });
});

describe("MarketplaceCreateListingPage", () => {
  it("loads inventory, keep policy and own listings on mount (failures tolerated)", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockRejectedValue(new Error("policy down"));
    getMyListingsMock.mockRejectedValue(new Error("listings down"));

    renderCreatePage();

    // AC-LC-4.2 — a signed-in direct mount opens on step 1.
    expect(await screen.findByText("Choose a card to list")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Create a listing" })).toBeInTheDocument();

    // The collection plus the seller's own listings; no transactions.
    expect(inventoryListMock).toHaveBeenCalledTimes(1);
    expect(getPolicyMock).toHaveBeenCalledTimes(1);
    expect(getMyListingsMock).toHaveBeenCalledTimes(1);
    expect(getTransactionsMock).not.toHaveBeenCalled();

    // AC-LC-2.4 — a null policy disables Spares only with the explanation.
    expect(screen.getByRole("button", { name: "Spares only" })).toBeDisabled();
    expect(
      screen.getByText("Spares only is unavailable — your keep policy couldn't be loaded.")
    ).toBeInTheDocument();

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("defaults to unlisted cards and includes the listed ones when unticked", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([inventoryEntry, secondNormalEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [listedCardOne] });

    renderCreatePage();

    expect(await screen.findByText("Choose a card to list")).toBeInTheDocument();

    // card_1 already has a live listing → hidden by default.
    expect(screen.queryByRole("button", { name: /Elsa, Snow Queen/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mickey Mouse/ })).toBeInTheDocument();
    expect(screen.getByText("1 hidden — already listed")).toBeInTheDocument();

    const unlistedOnly = screen.getByRole("checkbox", { name: "Unlisted only" });
    expect(unlistedOnly).toBeChecked();

    await userEvent.click(unlistedOnly);

    expect(unlistedOnly).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Elsa, Snow Queen/ })).toBeInTheDocument();
    expect(screen.queryByText("1 hidden — already listed")).not.toBeInTheDocument();
  });

  it("explains when every matching card is already listed", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [listedCardOne] });

    renderCreatePage();

    expect(
      await screen.findByText(/The only matching card is already listed/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Untick “Unlisted only” to add another listing/)).toBeInTheDocument();
  });

  it("walks both steps, keeps filters across Back, and creates the listing once", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);
    createListingMock.mockResolvedValue({ id: "listing_new" });

    renderCreatePage();

    await screen.findByText("Choose a card to list");

    // Step 1 — filter, then pick a card.
    await userEvent.type(screen.getByPlaceholderText("Search by name..."), "elsa");
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Listing details" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Variant")).toHaveValue("normal");

    // Back clears the card but preserves the picker filters (AC-LC-3.2).
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Choose a card to list")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name...")).toHaveValue("elsa");

    // Pick again and fill the form.
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));
    await screen.findByLabelText("Variant");

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });
    await userEvent.selectOptions(screen.getByLabelText("Condition"), "NM");
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "London" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Great condition" } });

    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    await waitFor(() => expect(createListingMock).toHaveBeenCalledTimes(1));
    expect(createListingMock).toHaveBeenCalledWith({
      cardId: "card_1",
      variant: "normal",
      quantity: 2,
      priceMinor: 1000,
      currency: "USD",
      condition: "NM",
      location: "London",
      note: "Great condition",
    });

    // AC-LC-7.3 — save navigates to the listings surface.
    expect(await screen.findByText("Sell listings page")).toBeInTheDocument();
  });

  it("re-derives identity and default variant after Back to a different card (REQ-UX-9 / AC-LC-3.1)", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([inventoryEntry, secondInventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);

    renderCreatePage();

    await screen.findByText("Choose a card to list");

    // Pick Elsa (normal default variant); the card identity is read-only.
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));
    expect(await screen.findByLabelText("Variant")).toHaveValue("normal");
    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("The First Chapter")).toBeInTheDocument();
    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();

    // Back, then pick a DIFFERENT, holofoil-only card (REQ-UX-9).
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Choose a card to list")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Mickey Mouse, Brave Little Tailor/ })
    );

    // The new card's identity + default variant replace the old ones.
    expect(await screen.findByLabelText("Variant")).toHaveValue("holofoil");
    expect(screen.getByText("Mickey Mouse, Brave Little Tailor")).toBeInTheDocument();
    expect(screen.getByText("Rise of the Floodborn")).toBeInTheDocument();
    expect(screen.queryByText("Elsa, Snow Queen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
    expect(screen.getByText("You own 2 Holofoil copies.")).toBeInTheDocument();

    // The owned cap follows the new variant: 3 > 2 holofoil copies.
    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    expect(
      await screen.findByText("You can only list up to 2 Holofoil copies you own")
    ).toBeInTheDocument();
    expect(createListingMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Variant")).toHaveValue("holofoil");
  });

  it("shows the no-cards message when the collection holds no owned cards", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([]);
    getPolicyMock.mockResolvedValue(policy);

    renderCreatePage();

    expect(
      await screen.findByText(
        "You have no cards in your collection. Add cards to your collection to list them for sale."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Elsa, Snow Queen/ })).not.toBeInTheDocument();
  });

  it("shows the no-spares message when Spares only has no matches", async () => {
    signIn();
    // Owned 1 normal, keep 4 → no surplus.
    inventoryListMock.mockResolvedValue([{ ...inventoryEntry, quantity: 1 }]);
    getPolicyMock.mockResolvedValue(policy);

    renderCreatePage();

    await screen.findByText("Choose a card to list");
    await userEvent.click(screen.getByRole("button", { name: "Spares only" }));

    expect(
      await screen.findByText(
        "No spare cards found — you don't hold more copies than your keep policy for any matching card."
      )
    ).toBeInTheDocument();
  });

  it("shows the collection error banner with no picker, form, or Cancel", async () => {
    signIn();
    inventoryListMock.mockRejectedValue(new Error("network down"));
    getPolicyMock.mockResolvedValue(policy);

    renderCreatePage();

    expect(await screen.findByText("Couldn't load your collection.")).toBeInTheDocument();
    expect(screen.queryByText("Choose a card to list")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Variant")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("requires sign-in and makes no API calls when signed out", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);

    renderCreatePage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign in required" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Create a listing" })).not.toBeInTheDocument();
    expect(inventoryListMock).not.toHaveBeenCalled();
    expect(getPolicyMock).not.toHaveBeenCalled();
  });

  it("resets to step 1 with empty filters on remount", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);

    const first = renderCreatePage();
    await screen.findByText("Choose a card to list");
    await userEvent.type(screen.getByPlaceholderText("Search by name..."), "elsa");
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));
    await screen.findByLabelText("Variant");

    first.unmount();

    renderCreatePage();

    expect(await screen.findByText("Choose a card to list")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name...")).toHaveValue("");
    expect(screen.queryByLabelText("Variant")).not.toBeInTheDocument();
  });

  it("navigates to the listings surface from Cancel on step 1", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);

    renderCreatePage();

    await screen.findByText("Choose a card to list");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Sell listings page")).toBeInTheDocument();
  });

  it("navigates to the listings surface from Cancel on step 2", async () => {
    signIn();
    inventoryListMock.mockResolvedValue([inventoryEntry]);
    getPolicyMock.mockResolvedValue(policy);

    renderCreatePage();

    await screen.findByText("Choose a card to list");
    await userEvent.click(screen.getByRole("button", { name: /Elsa, Snow Queen/ }));
    await screen.findByLabelText("Variant");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Sell listings page")).toBeInTheDocument();
    expect(screen.queryByLabelText("Variant")).not.toBeInTheDocument();
  });
});
