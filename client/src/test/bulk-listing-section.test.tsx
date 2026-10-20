import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BulkListingSection from "../components/marketplace/BulkListingSection";
import MarketplaceSellPage from "../pages/marketplace/MarketplaceSellPage";
import { useAuth } from "../context/AuthContext";
import type {
  Card,
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
  MarketplaceTransaction,
} from "../types";

const {
  bulkCreateListingMock,
  inventoryListMock,
  getPolicyMock,
  getMyListingsMock,
  getTransactionsMock,
} = vi.hoisted(() => ({
  bulkCreateListingMock: vi.fn(),
  inventoryListMock: vi.fn(),
  getPolicyMock: vi.fn(),
  getMyListingsMock: vi.fn(),
  getTransactionsMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    bulkCreateListing: bulkCreateListingMock,
    getMyListings: getMyListingsMock,
    getTransactions: getTransactionsMock,
    createListing: vi.fn(),
    updateListing: vi.fn(),
    deleteListing: vi.fn(),
  },
  inventory: { list: inventoryListMock, getPolicy: getPolicyMock },
  cards: { filters: vi.fn() },
}));

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));

// ── fixtures ────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: null,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Elsa",
    subtitle: "Snow Queen",
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
    cardNumber: "42",
    foilTypes: ["None", "Silver"],
    imageUrl: "",
    prices: [],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  const card = overrides.card ?? makeCard();
  return {
    id: `inv_${card.id}`,
    userId: "seller_1",
    cardId: card.id,
    quantity: 4,
    foilQuantity: 0,
    holofoilQuantity: 0,
    ...overrides,
    card,
  };
}

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    id: "listing_1",
    sellerId: "seller_1",
    cardId: "card_1",
    variant: "normal",
    quantity: 2,
    priceMinor: 50,
    currency: "SGD",
    condition: null,
    location: "",
    note: null,
    status: "ACTIVE",
    hiddenAt: null,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    card: null,
    seller: null,
    photos: [],
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<MarketplaceTransaction> = {}): MarketplaceTransaction {
  return {
    id: "tx_1",
    enquiryId: "enq_1",
    listingId: "listing_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    cardId: "card_1",
    variant: "normal",
    quantity: 2,
    priceMinor: 50,
    currency: "SGD",
    status: "PENDING_CONFIRMATION",
    completedCause: null,
    cancelledBy: null,
    soldAt: "2026-10-20T00:00:00.000Z",
    confirmedAt: null,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    buyer: { id: "buyer_1", username: "bob" },
    seller: { id: "seller_1", username: "alice" },
    card: { id: "card_1", name: "Elsa", setName: "The First Chapter" },
    ...overrides,
  };
}

const policy: InventoryPolicy = {
  keepNormalQuantity: 2,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
};

const elsa = makeCard();
const mickey = makeCard({
  id: "card_2",
  name: "Mickey Mouse",
  subtitle: "Brave Little Tailor",
  character: "Mickey Mouse",
  color: "Amber",
  rarity: "Common",
  cardNumber: "111",
});

function renderSection(overrides: Partial<ComponentProps<typeof BulkListingSection>> = {}) {
  const props = {
    inventory: [makeEntry(), makeEntry({ card: mickey })],
    policy,
    ownListings: [] as MarketplaceListing[],
    pendingTransactions: [] as MarketplaceTransaction[],
    onCancel: vi.fn(),
    onDone: vi.fn(),
    onRefresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const utils = render(
    <MemoryRouter>
      <BulkListingSection {...props} />
    </MemoryRouter>
  );
  return { ...utils, props };
}

async function selectAndReview() {
  await userEvent.click(screen.getByRole("button", { name: /Select all matching \(/ }));
  await userEvent.click(screen.getByRole("button", { name: "Review and price →" }));
}

function setPrice(value: string) {
  fireEvent.change(screen.getByLabelText("Unit price (per copy)"), { target: { value } });
}

function confirmButton() {
  return screen.getByRole("button", { name: /Create \d+ listings|Nothing to create/ });
}

describe("BulkListingSection — step 1 (choose cards)", () => {
  beforeEach(() => {
    bulkCreateListingMock.mockReset();
    bulkCreateListingMock.mockResolvedValue({ status: "created", listing: makeListing() });
  });

  it("shows the scope note, locked spares control, match line and skip note", () => {
    renderSection({
      inventory: [
        makeEntry(),
        makeEntry({ card: mickey }),
        makeEntry({ card: makeCard({ id: "card_3", name: "Stitch", cardNumber: "55" }) }),
      ],
      ownListings: [makeListing({ cardId: "card_3" })],
    });

    expect(
      screen.getByText(
        "Bulk listing covers normal-printing spares only. Foil and holofoil spares stay as they are."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("3 cards match these filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all matching (2)" })).toBeEnabled();
    expect(
      screen.getByText("1 of these are already listed and will be skipped.")
    ).toBeInTheDocument();

    const lockedSpares = screen.getByRole("button", { name: /Spares only/ });
    expect(lockedSpares).toBeDisabled();
    expect(lockedSpares).toHaveAttribute("aria-pressed", "true");
    expect(lockedSpares).toHaveAttribute("aria-describedby", "bulk-spares-lock-note");
    expect(screen.getByText("Always on for bulk listing")).toBeInTheDocument();
  });

  it("renders informational tiles with no selectable button (DD-2/UD-16)", () => {
    renderSection();

    expect(screen.queryByRole("button", { name: /^Elsa/ })).not.toBeInTheDocument();
    expect(screen.getByText("Elsa")).toBeInTheDocument();
    expect(screen.getAllByTestId("card-tile")).toHaveLength(2);
  });

  it("shows the no-owned-cards empty state", () => {
    renderSection({ inventory: [] });

    expect(
      screen.getByText(
        "You have no cards in your collection. Add cards to your collection to list them for sale."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Select all matching/ })).not.toBeInTheDocument();
  });

  it("shows the no-match empty state and clears filters", async () => {
    renderSection({ inventory: [makeEntry({ quantity: 1 })] });

    expect(screen.getByText("No spare cards match these filters")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("No spare cards match these filters")).toBeInTheDocument();
  });

  it("clears the search when Clear filters is used", async () => {
    renderSection();

    await userEvent.type(screen.getByPlaceholderText("Search by name..."), "zzz");
    expect(screen.getByText("No spare cards match these filters")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByText("2 cards match these filters").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Search by name...")).toHaveValue("");
  });

  it("reports foil/holofoil-only surplus in the scope note instead of a no-spares message", () => {
    renderSection({
      inventory: [makeEntry({ card: makeCard({ id: "card_f", name: "Foil Only" }), quantity: 1, foilQuantity: 4 })],
    });

    expect(screen.getAllByText(/have only foil or holofoil spares/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("No spare cards match these filters")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("reports all-skipped filters honestly (UX-BULK-21)", () => {
    renderSection({
      inventory: [makeEntry(), makeEntry({ card: mickey })],
      ownListings: [
        makeListing({ id: "l1", cardId: elsa.id }),
        makeListing({ id: "l2", cardId: mickey.id }),
      ],
    });

    expect(screen.getByText("2 cards match these filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all matching (0)" })).toBeDisabled();
    expect(
      screen.getByText("Nothing in these filters can be listed right now")
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 of these are already listed and will be skipped.")
    ).toBeInTheDocument();
    expect(screen.queryByText("No spare cards match these filters")).not.toBeInTheDocument();
  });

  it("selects all matching and announces the selection", async () => {
    renderSection();

    await userEvent.click(screen.getByRole("button", { name: "Select all matching (2)" }));

    expect(screen.getByTestId("bulk-selection-count")).toHaveTextContent(
      "2 cards selected · 2 listings to create"
    );
    expect(
      screen.getByText("Changing any filter reselects all matching cards.")
    ).toBeInTheDocument();
    expect(within(document.getElementById("bulk-live-selection")!).getByText(
      "2 cards selected, 2 listings to create"
    )).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByText("Changing any filter reselects all matching cards.")).not.toBeInTheDocument();
  });

  it("announces row deselect and reselect through the selection region (RV-8)", async () => {
    renderSection();
    await selectAndReview();

    // The region is throttled to ≤ 1 / 500 ms; the select-all announcement
    // just landed, so let the window pass before asserting row transitions.
    await new Promise((resolve) => setTimeout(resolve, 550));

    await userEvent.click(screen.getByRole("checkbox", { name: /Include Elsa/ }));
    expect(
      within(document.getElementById("bulk-live-selection")!).getByText(
        "1 cards selected, 1 listings to create"
      )
    ).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 550));

    await userEvent.click(screen.getByRole("checkbox", { name: /Include Elsa/ }));
    expect(
      within(document.getElementById("bulk-live-selection")!).getByText(
        "2 cards selected, 2 listings to create"
      )
    ).toBeInTheDocument();
  });

  // 101 real rows is a legitimately heavy jsdom render; the assertion stays
  // exact, only the time budget is raised above Vitest's 5 s default.
  it(
    "keeps the review step reachable over the 100-listing limit but blocks confirm",
    async () => {
      const inventory = Array.from({ length: 101 }, (_, index) =>
        makeEntry({
          card: makeCard({ id: `card_${index}`, name: `Card ${index}`, cardNumber: String(index) }),
          quantity: 1,
        })
      );
      renderSection({ inventory, policy: { ...policy, keepNormalQuantity: 0 } });

      expect(screen.getByText("101 cards match these filters")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Select all matching (101)" }));

      expect(screen.getByTestId("bulk-selection-count")).toHaveTextContent(
        "101 cards selected · over the 100-listing limit. Narrow your filters to continue."
      );
      expect(within(document.getElementById("bulk-live-selection")!).getByText(
        "Over the 100-listing limit"
      )).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Review and price →" }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "101 listings is over the 100-listing limit. Remove 1 cards below or narrow your filters."
      );
      const confirm = screen.getByRole("button", { name: "Create 101 listings" });
      expect(confirm).toBeDisabled();
      expect(confirm).toHaveAttribute("aria-describedby", "bulk-overcap");
    },
    20000
  );
});

describe("BulkListingSection — step 2 (review and price)", () => {
  beforeEach(() => {
    bulkCreateListingMock.mockReset();
    bulkCreateListingMock.mockResolvedValue({ status: "created", listing: makeListing() });
  });

  it("previews every candidate with reasons from precomputed data and writes nothing", async () => {
    renderSection({
      inventory: [
        makeEntry(),
        makeEntry({ card: mickey }),
        makeEntry({ card: makeCard({ id: "card_3", name: "Stitch", cardNumber: "55" }) }),
      ],
      ownListings: [makeListing({ cardId: "card_3" })],
    });

    await selectAndReview();

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Include Elsa · The First Chapter · 42 in this batch" })
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Include Mickey Mouse/ })).toBeChecked();
    expect(screen.getByText("Not included (1)")).toBeInTheDocument();
    expect(screen.getByText("already listed")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-totals")).toHaveTextContent("2 listings");

    setPrice("0.50");
    await userEvent.click(screen.getByRole("checkbox", { name: /Include Mickey Mouse/ }));

    expect(bulkCreateListingMock).not.toHaveBeenCalled();
    expect(confirmButton()).toHaveTextContent("Create 1 listings");
  });

  it("shows em dashes for money until a valid price is typed", async () => {
    renderSection();
    await selectAndReview();

    expect(screen.getByTestId("bulk-totals")).toHaveTextContent("2 listings · Batch total —");

    setPrice("0");
    expect(screen.getByTestId("bulk-totals").textContent).toContain("Batch total");
    expect(screen.getByTestId("bulk-totals").textContent).not.toContain("—");
    expect(confirmButton()).toBeEnabled();
  });

  it("disables confirm for an empty or invalid price and explains why", async () => {
    renderSection();
    await selectAndReview();

    const confirm = confirmButton();
    expect(confirm).toBeDisabled();

    setPrice("abc");
    fireEvent.blur(screen.getByLabelText("Unit price (per copy)"));
    expect(screen.getByText("Enter a unit price to continue.")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveAttribute("aria-describedby", "bulk-price-error");

    setPrice("0.5");
    expect(screen.queryByText("Enter a unit price to continue.")).not.toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
    expect(bulkCreateListingMock).not.toHaveBeenCalled();
  });

  it("labels the confirm 'Nothing to create' when every row is removed", async () => {
    renderSection();
    await selectAndReview();
    setPrice("1.00");

    await userEvent.click(screen.getByRole("checkbox", { name: /Include Elsa/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Include Mickey Mouse/ }));

    expect(screen.getAllByText("Removed from this batch")).toHaveLength(2);
    expect(confirmButton()).toHaveTextContent("Nothing to create");
    expect(confirmButton()).toBeDisabled();
    expect(
      screen.getByText("You removed every card from this batch — go back to add more.")
    ).toBeInTheDocument();
    // C-10/C-20 E-e: the explanation REPLACES the totals line …
    expect(screen.queryByTestId("bulk-totals")).not.toBeInTheDocument();
    expect(screen.queryByText(/^0 listings/)).not.toBeInTheDocument();
    // … while the table stays so the seller can re-tick a row (RV-8).
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("keeps a deselected row in the table with the removed chip (DD-13)", async () => {
    renderSection();
    await selectAndReview();

    await userEvent.click(screen.getByRole("checkbox", { name: /Include Elsa/ }));

    expect(screen.getByRole("checkbox", { name: /Include Elsa/ })).not.toBeChecked();
    expect(screen.getByTestId("bulk-totals")).toHaveTextContent("1 listings");
    expect(screen.queryByText("Not included (1)")).not.toBeInTheDocument();
  });

  it("resets deselections when a filter changes (PI-2)", async () => {
    renderSection();
    await selectAndReview();

    await userEvent.click(screen.getByRole("checkbox", { name: /Include Elsa/ }));
    expect(confirmButton()).toHaveTextContent("Create 1 listings");

    await userEvent.click(screen.getByRole("button", { name: "Back to filters" }));
    await userEvent.click(screen.getByRole("button", { name: "All Sets" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "The First Chapter" }));

    await userEvent.click(screen.getByRole("button", { name: "Review and price →" }));
    expect(screen.getByRole("checkbox", { name: /Include Elsa/ })).toBeChecked();
    expect(confirmButton()).toHaveTextContent("Create 2 listings");
  });

  it("moves focus to the confirm on Enter instead of submitting (RV-17)", async () => {
    renderSection();
    await selectAndReview();
    setPrice("0.50");

    fireEvent.keyDown(screen.getByLabelText("Unit price (per copy)"), { key: "Enter" });

    expect(confirmButton()).toHaveFocus();
    expect(bulkCreateListingMock).not.toHaveBeenCalled();
  });

  it("sends the selected currency with every item in the run", async () => {
    bulkCreateListingMock.mockResolvedValue({ status: "created", listing: makeListing() });
    renderSection();
    await selectAndReview();
    setPrice("0.50");

    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "USD" } });
    await userEvent.click(confirmButton());

    await screen.findByTestId("bulk-results-summary");
    expect(bulkCreateListingMock).toHaveBeenCalledTimes(2);
    for (const call of bulkCreateListingMock.mock.calls) {
      expect(call[0]).toMatchObject({ priceMinor: 50, currency: "USD" });
    }
  });

  it("returns focus to the Review and price control on Back (UX-A11Y-4)", async () => {
    renderSection();
    await selectAndReview();

    await userEvent.click(screen.getByRole("button", { name: "Back to filters" }));

    expect(screen.getByRole("button", { name: "Review and price →" })).toHaveFocus();
    expect(screen.getByTestId("bulk-selection-count")).toHaveTextContent(
      "2 cards selected · 2 listings to create"
    );
  });

  it("treats Escape in step 2 as Back, never Cancel or a write (RV-18/DD-11)", async () => {
    const { props } = renderSection();
    await selectAndReview();
    setPrice("0.50");

    fireEvent.keyDown(screen.getByLabelText("Unit price (per copy)"), { key: "Escape" });

    expect(await screen.findByRole("button", { name: "Review and price →" })).toHaveFocus();
    expect(screen.queryByRole("heading", { name: "Bulk list spares" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Unit price (per copy)")).not.toBeInTheDocument();
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(bulkCreateListingMock).not.toHaveBeenCalled();
  });
});

describe("BulkListingSection — running and results", () => {
  beforeEach(() => {
    bulkCreateListingMock.mockReset();
  });

  it("runs the batch sequentially and refreshes the page afterwards", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    bulkCreateListingMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { status: "created", listing: makeListing() };
    });

    const { props } = renderSection();
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    const summary = await screen.findByTestId("bulk-results-summary");
    expect(summary).toHaveTextContent("2 listings created");

    expect(bulkCreateListingMock).toHaveBeenCalledTimes(2);
    expect(bulkCreateListingMock.mock.calls.map((call) => call[0].cardId)).toEqual([
      "card_1",
      "card_2",
    ]);
    expect(bulkCreateListingMock).toHaveBeenCalledWith({
      cardId: "card_1",
      quantity: 2,
      priceMinor: 50,
      currency: "SGD",
    });
    expect(maxInFlight).toBe(1);
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(
      within(document.getElementById("bulk-live-run")!).getByText("2 listings created")
    ).toBeInTheDocument();
  });

  it("shows determinate progress and a last-item line while running", async () => {
    // Unique card ids so no other test's in-flight call can match this branch.
    const progressA = makeCard({ id: "prog_1", name: "Progress A" });
    const progressB = makeCard({ id: "prog_2", name: "Progress B", cardNumber: "7" });
    const pending = new Map<string, (outcome: unknown) => void>();
    bulkCreateListingMock.mockImplementation(
      (body: { cardId: string }) =>
        new Promise((resolve) => {
          pending.set(body.cardId, resolve);
        })
    );

    renderSection({
      inventory: [makeEntry({ card: progressA }), makeEntry({ card: progressB })],
    });
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "2");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuetext", "Creating 0 of 2 listings");
    expect(screen.getByText("Creating 0 of 2 listings…")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Keep this tab open until it finishes. Leaving stops the remaining cards; anything already created stays in Your listings."
      )
    ).toBeInTheDocument();
    // No second activation path exists while running (RN-1 / AC-BULK-7.2).
    expect(screen.queryByRole("button", { name: /Create \d+ listings/ })).not.toBeInTheDocument();

    await waitFor(() => expect(pending.has("prog_1")).toBe(true));
    pending.get("prog_1")!({ status: "created", listing: makeListing() });

    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1")
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Creating 1 of 2 listings"
    );
    expect(screen.getByText("Last: Progress A · The First Chapter · 42 — created")).toBeInTheDocument();

    // Release the second item so the loop can finish and show results.
    await waitFor(() => expect(pending.has("prog_2")).toBe(true));
    pending.get("prog_2")!({ status: "created", listing: makeListing() });
    await screen.findByTestId("bulk-results-summary");
  });

  it("ignores Escape while the run is in flight (no stop control, DD-10)", async () => {
    const resolvers: Array<(outcome: unknown) => void> = [];
    bulkCreateListingMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    renderSection();
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    const bar = await screen.findByRole("progressbar");
    fireEvent.keyDown(bar, { key: "Escape" });

    // Still running: Escape is inert and there is no Cancel to press.
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    await waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers[0]({ status: "created", listing: makeListing() });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]({ status: "created", listing: makeListing() });
    await screen.findByTestId("bulk-results-summary");
  });

  it("continues after a per-item failure and surfaces the verbatim server message", async () => {
    bulkCreateListingMock
      .mockResolvedValueOnce({
        status: "failed",
        error: "Quantity exceeds available inventory",
        httpStatus: 409,
      })
      .mockResolvedValueOnce({ status: "created", listing: makeListing() });

    renderSection();
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    const summary = await screen.findByTestId("bulk-results-summary");
    expect(summary).toHaveTextContent("1 listings created · 1 failed");
    expect(screen.getByText("Quantity exceeds available inventory")).toBeInTheDocument();
    expect(bulkCreateListingMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText(
        "These cards were not listed. You can retry them, or list them one at a time with Create listing."
      )
    ).toBeInTheDocument();
  });

  it("stops the loop on a 401 and blocks retry until sign-in", async () => {
    bulkCreateListingMock.mockResolvedValueOnce({
      status: "failed",
      error: "Invalid or expired token",
      httpStatus: 401,
    });

    renderSection();
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    const summary = await screen.findByTestId("bulk-results-summary");
    expect(summary).toHaveTextContent("0 listings created · 2 failed");
    expect(bulkCreateListingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your session expired. Sign in again to retry the failed cards."
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("button", { name: "Retry failed (2)" })).toBeDisabled();
  });

  it("retries only the failed items with the same price and currency", async () => {
    bulkCreateListingMock
      .mockResolvedValueOnce({ status: "created", listing: makeListing() })
      .mockResolvedValueOnce({
        status: "failed",
        error: "Quantity exceeds available inventory",
        httpStatus: 409,
      })
      .mockResolvedValueOnce({ status: "created", listing: makeListing({ cardId: "card_2" }) });

    renderSection();
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    await screen.findByTestId("bulk-results-summary");
    await userEvent.click(screen.getByRole("button", { name: "Retry failed (1)" }));

    await waitFor(() =>
      expect(screen.getByTestId("bulk-results-summary")).toHaveTextContent("2 listings created")
    );
    expect(bulkCreateListingMock).toHaveBeenCalledTimes(3);
    expect(bulkCreateListingMock.mock.calls[2][0]).toEqual({
      cardId: "card_2",
      quantity: 2,
      priceMinor: 50,
      currency: "SGD",
    });
    expect(screen.queryByRole("button", { name: /Retry failed/ })).not.toBeInTheDocument();
  });

  it("keeps the results panel when the post-run refresh fails (S24)", async () => {
    bulkCreateListingMock.mockResolvedValue({ status: "created", listing: makeListing() });
    const onRefresh = vi.fn().mockRejectedValue(new Error("refresh failed"));

    renderSection({ onRefresh });
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    expect(await screen.findByTestId("bulk-results-summary")).toHaveTextContent(
      "2 listings created"
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("counts server-side skips and repeats the preview skip list", async () => {
    bulkCreateListingMock
      .mockResolvedValueOnce({ status: "skipped", reason: "already listed" })
      .mockResolvedValueOnce({ status: "created", listing: makeListing() });

    renderSection({
      inventory: [
        makeEntry(),
        makeEntry({ card: mickey }),
        makeEntry({ card: makeCard({ id: "card_3", name: "Stitch", cardNumber: "55" }) }),
      ],
      ownListings: [makeListing({ cardId: "card_3" })],
    });
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    const summary = await screen.findByTestId("bulk-results-summary");
    expect(summary).toHaveTextContent("1 listings created · 2 skipped");
    expect(screen.getByText("Not included (1)")).toBeInTheDocument();
  });

  it("closes through Done and returns focus to the page heading", async () => {
    bulkCreateListingMock.mockResolvedValue({ status: "created", listing: makeListing() });

    const onDone = vi.fn();
    renderSection({ onDone });
    await selectAndReview();
    setPrice("0.50");
    await userEvent.click(confirmButton());

    await screen.findByTestId("bulk-results-summary");
    await userEvent.click(screen.getByRole("button", { name: "Done — view your listings" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the step heading on entry and on results", async () => {
    bulkCreateListingMock.mockResolvedValue({ status: "created", listing: makeListing() });

    renderSection();
    const heading = screen.getByRole("heading", { name: "Bulk list spares" });
    expect(document.activeElement).toBe(heading);

    await selectAndReview();
    expect(document.activeElement).toBe(heading);

    setPrice("0.50");
    await userEvent.click(confirmButton());
    await screen.findByTestId("bulk-results-summary");
    expect(document.activeElement).toBe(heading);
  });

  it("cancels before confirm without writing anything", async () => {
    const { props } = renderSection();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(bulkCreateListingMock).not.toHaveBeenCalled();
  });
});

describe("MarketplaceSellPage — bulk entry and mutual exclusion", () => {
  beforeEach(() => {
    bulkCreateListingMock.mockReset();
    inventoryListMock.mockReset();
    getPolicyMock.mockReset();
    getMyListingsMock.mockReset();
    getTransactionsMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "seller_1", username: "alice" },
    } as never);
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <MarketplaceSellPage />
      </MemoryRouter>
    );
  }

  it("disables the entry while the page is loading", async () => {
    let resolveInventory: (value: InventoryEntry[]) => void = () => undefined;
    inventoryListMock.mockImplementation(
      () => new Promise<InventoryEntry[]>((resolve) => {
        resolveInventory = resolve;
      })
    );
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderPage();

    const entry = screen.getByRole("button", { name: "Bulk list spares" });
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute("aria-describedby", "bulk-entry-reason");
    expect(screen.getByText("Loading your collection…")).toBeInTheDocument();

    resolveInventory([makeEntry()]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Bulk list spares" })).toBeEnabled());
  });

  it("disables the entry when the keep policy failed to load", async () => {
    inventoryListMock.mockResolvedValue([makeEntry()]);
    getPolicyMock.mockResolvedValue(null);
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderPage();

    await screen.findByText(
      "Bulk listing needs your keep policy — it defines what counts as a spare"
    );
    expect(screen.getByRole("button", { name: "Bulk list spares" })).toBeDisabled();
  });

  it("disables the entry and points at the banner when the page load fails", async () => {
    inventoryListMock.mockRejectedValue(new Error("Network down"));
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderPage();

    expect(await screen.findByText("Network down")).toBeInTheDocument();
    const entry = screen.getByRole("button", { name: "Bulk list spares" });
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute("aria-describedby", "sell-error-banner");
  });

  it("keeps bulk as the only in-page overlay; create/edit stay routed links (AC-BULK-1.2)", async () => {
    inventoryListMock.mockResolvedValue([makeEntry()]);
    getPolicyMock.mockResolvedValue(policy);
    getMyListingsMock.mockResolvedValue({ listings: [] });
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderPage();
    await screen.findByText("You have no listings yet. Create one to start selling.");

    // Create/edit were extracted to dedicated routes by the listing-creation work,
    // so no inline form competes with the bulk section on this page.
    expect(screen.getByRole("link", { name: "Create listing" })).toHaveAttribute(
      "href",
      "/marketplace/sell/new"
    );
    expect(screen.queryByText("Choose a card to list")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Bulk list spares" }));
    expect(await screen.findByRole("heading", { name: "Bulk list spares" })).toBeInTheDocument();
    // The listings grid and the bulk entry both yield while the flow is open.
    expect(
      screen.queryByText("You have no listings yet. Create one to start selling.")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bulk list spares" })).not.toBeInTheDocument();
  });

  // Full page + section + run under coverage instrumentation: keep the exact
  // assertions, raise only the time budget.
  it(
    "refreshes the page after a run and shows the created listings behind the results",
    async () => {
      inventoryListMock.mockResolvedValue([makeEntry()]);
      getPolicyMock.mockResolvedValue(policy);
      getMyListingsMock
        .mockResolvedValueOnce({ listings: [] })
        .mockResolvedValue({ listings: [makeListing({ card: elsa })] });
      getTransactionsMock.mockResolvedValue({ transactions: [] });
      bulkCreateListingMock.mockResolvedValue({ status: "created", listing: makeListing() });

      renderPage();
      await screen.findByText("You have no listings yet. Create one to start selling.");

      await userEvent.click(screen.getByRole("button", { name: "Bulk list spares" }));
      await screen.findByRole("heading", { name: "Bulk list spares" });
      await userEvent.click(screen.getByRole("button", { name: "Select all matching (1)" }));
      await userEvent.click(screen.getByRole("button", { name: "Review and price →" }));
      setPrice("0.50");
      await userEvent.click(confirmButton());

      expect(await screen.findByTestId("bulk-results-summary")).toHaveTextContent(
        "1 listings created"
      );
      await waitFor(() => expect(getMyListingsMock).toHaveBeenCalledTimes(2));

      // Results phase: the page's listings grid is visible again below the panel (IA-5).
      // Create/edit are now routed links, so the tile's Edit is a link, not a button.
      expect(
        await screen.findByRole("link", { name: "Edit listing: Elsa, Normal" })
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Done — view your listings" }));
      expect(screen.queryByRole("heading", { name: "Bulk list spares" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Your listings" })).toBeInTheDocument();

      // AC-BULK-9.4: re-opening after the refresh shows nothing left to create.
      await userEvent.click(screen.getByRole("button", { name: "Bulk list spares" }));
      expect(
        await screen.findByRole("button", { name: "Select all matching (0)" })
      ).toBeDisabled();
      expect(
        screen.getByText("1 of these are already listed and will be skipped.")
      ).toBeInTheDocument();
    },
    20000
  );
});
