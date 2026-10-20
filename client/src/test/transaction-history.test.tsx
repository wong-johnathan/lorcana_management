import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import SettingsPage from "../pages/SettingsPage";
import TransactionHistory from "../components/profile/TransactionHistory";
import type { MarketplaceTransaction } from "../types";

const {
  settingsGetMock,
  profileGetMock,
  getPolicyMock,
  getTransactionsMock,
} = vi.hoisted(() => ({
  settingsGetMock: vi.fn(),
  profileGetMock: vi.fn(),
  getPolicyMock: vi.fn(),
  getTransactionsMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  settings: { get: settingsGetMock, update: vi.fn() },
  profile: {
    get: profileGetMock,
    update: vi.fn(),
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
  },
  inventory: { getPolicy: getPolicyMock, updatePolicy: vi.fn() },
  marketplace: { getTransactions: getTransactionsMock },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const PROFILE = {
  displayName: null,
  profileImageUrl: null,
  profileImageObjectKey: null,
  countryOfResidence: null,
  instagram: null,
  instagramVisible: false,
  telegram: null,
  telegramVisible: false,
  facebook: null,
  facebookVisible: false,
  email: null,
  emailVisible: false,
  phoneNumber: null,
  phoneNumberVisible: false,
};

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
    priceMinor: 1000,
    currency: "USD",
    status: "COMPLETED",
    completedCause: null,
    cancelledBy: null,
    soldAt: "2026-10-18T00:00:00.000Z",
    confirmedAt: "2026-10-18T00:01:00.000Z",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:01:00.000Z",
    buyer: { id: "buyer_1", username: "bob" },
    seller: { id: "seller_1", username: "alice" },
    card: { id: "card_1", name: "Elsa, Snow Queen", setName: "The First Chapter" },
    ...overrides,
  };
}

function renderHistory(currentUserId = "buyer_1") {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: currentUserId,
      username: "bob",
      email: "bob@example.com",
      emailVerifiedAt: "2026-08-28T00:00:00.000Z",
      authProvider: "LOCAL",
      googleLinked: false,
    },
    googleClientId: null,
    linkGoogleAccount: vi.fn(),
    deleteAccount: vi.fn(),
  } as never);

  settingsGetMock.mockResolvedValue({ publicEnabled: false, publicUrl: "/collection/buyer_1" });
  profileGetMock.mockResolvedValue(PROFILE);
  getPolicyMock.mockResolvedValue({ keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1 });

  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe("SettingsPage transaction history", () => {
  beforeEach(() => {
    settingsGetMock.mockReset();
    profileGetMock.mockReset();
    getPolicyMock.mockReset();
    getTransactionsMock.mockReset();
  });

  it("lists all statuses newest first with no status filter (AC-REV-4.1/4.2)", async () => {
    getTransactionsMock.mockResolvedValue({
      transactions: [
        makeTransaction({ id: "tx_1", status: "PENDING_CONFIRMATION", card: { id: "card_1", name: "Elsa, Snow Queen", setName: "The First Chapter" } }),
        makeTransaction({ id: "tx_2", card: { id: "card_2", name: "Mickey Mouse", setName: "The First Chapter" } }),
        makeTransaction({ id: "tx_3", status: "CANCELLED", cancelledBy: "buyer", card: { id: "card_3", name: "Scar", setName: "The First Chapter" } }),
      ],
    });

    renderHistory("buyer_1");

    const entries = await screen.findAllByTestId("transaction-history-entry");
    expect(getTransactionsMock).toHaveBeenCalledWith();
    expect(entries.map((entry) => within(entry).getByRole("heading", { level: 4 }).textContent)).toEqual([
      "Elsa, Snow Queen",
      "Mickey Mouse",
      "Scar",
    ]);
    expect(within(entries[0]).getByText("Pending confirmation")).toBeInTheDocument();
    expect(within(entries[1]).getByText("Completed")).toBeInTheDocument();
    expect(within(entries[2]).getByText("Cancelled")).toBeInTheDocument();
  });

  it("shows card name, variant, qty, unit/line price, status and date per entry (AC-REV-4.3)", async () => {
    getTransactionsMock.mockResolvedValue({
      transactions: [
        makeTransaction({
          status: "COMPLETED",
          completedCause: "AUTO_TRANSFER",
          quantity: 2,
          priceMinor: 1000,
          soldAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }),
      ],
    });

    renderHistory("buyer_1");

    const entry = (await screen.findAllByTestId("transaction-history-entry"))[0];
    expect(within(entry).getByRole("heading", { level: 4 })).toHaveTextContent("Elsa, Snow Queen");
    expect(entry).toHaveTextContent("Normal · Qty 2");
    expect(entry).toHaveTextContent("$10.00 each");
    expect(entry).toHaveTextContent("$20.00");
    expect(entry).toHaveTextContent("Completed · Auto-transferred");
    expect(entry).toHaveTextContent("1h ago");
  });

  it("links the seller counterpart to /marketplace/seller/<id> for a buyer caller (AC-REV-4.4)", async () => {
    getTransactionsMock.mockResolvedValue({ transactions: [makeTransaction()] });

    renderHistory("buyer_1");

    const entry = (await screen.findAllByTestId("transaction-history-entry"))[0];
    const link = within(entry).getByRole("link", { name: "Sold by alice" });
    expect(link).toHaveAttribute("href", "/marketplace/seller/seller_1");
  });

  it("links the buyer counterpart to /marketplace/seller/<id> for a seller caller (AC-REV-4.4)", async () => {
    getTransactionsMock.mockResolvedValue({ transactions: [makeTransaction()] });

    renderHistory("seller_1");

    const entry = (await screen.findAllByTestId("transaction-history-entry"))[0];
    const link = within(entry).getByRole("link", { name: "Bought by bob" });
    expect(link).toHaveAttribute("href", "/marketplace/seller/buyer_1");
  });

  it("renders read-only review comments only when present (OC)", async () => {
    getTransactionsMock.mockResolvedValue({
      transactions: [
        makeTransaction({
          id: "tx_reviewed",
          myReview: { rating: 5, comment: "great" },
          counterpartReview: { rating: 4, comment: "ok" },
        }),
        makeTransaction({ id: "tx_unreviewed", status: "PENDING_CONFIRMATION" }),
      ],
    });

    renderHistory("buyer_1");

    const entries = await screen.findAllByTestId("transaction-history-entry");
    const reviewed = entries[0];
    const unreviewed = entries[1];

    expect(within(reviewed).getByText("Your review")).toBeInTheDocument();
    expect(within(reviewed).getByText("Seller's review")).toBeInTheDocument();
    expect(within(reviewed).getByLabelText("5 out of 5")).toBeInTheDocument();
    expect(within(reviewed).getByLabelText("4 out of 5")).toBeInTheDocument();
    expect(within(reviewed).getByText("great")).toBeInTheDocument();
    expect(within(reviewed).getByText("ok")).toBeInTheDocument();

    expect(within(unreviewed).queryByText("Your review")).not.toBeInTheDocument();
    expect(within(unreviewed).queryByText("Seller's review")).not.toBeInTheDocument();
  });

  it("renders no action controls (read-only) (OB)", async () => {
    getTransactionsMock.mockResolvedValue({
      transactions: [
        makeTransaction({ myReview: { rating: 5, comment: null } }),
        makeTransaction({ id: "tx_pending", status: "PENDING_CONFIRMATION" }),
      ],
    });

    renderHistory("buyer_1");

    const entries = await screen.findAllByTestId("transaction-history-entry");
    for (const entry of entries) {
      expect(within(entry).queryByRole("button")).not.toBeInTheDocument();
      expect(within(entry).queryByRole("textbox")).not.toBeInTheDocument();
      expect(within(entry).queryByText("Review the seller")).not.toBeInTheDocument();
      expect(within(entry).queryByText("Review the buyer")).not.toBeInTheDocument();
    }
  });

  it("shows an empty state when there are no transactions", async () => {
    getTransactionsMock.mockResolvedValue({ transactions: [] });

    renderHistory("buyer_1");

    expect(await screen.findByText("No transactions yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("transaction-history-entry")).not.toBeInTheDocument();
  });

  it("surfaces a load error in the history section", async () => {
    getTransactionsMock.mockRejectedValue(new Error("Failed to load transactions"));

    renderHistory("buyer_1");

    expect(await screen.findByText("Failed to load transactions")).toBeInTheDocument();
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    getTransactionsMock.mockRejectedValue("boom");

    renderHistory("buyer_1");

    expect(await screen.findByText("Failed to load transactions")).toBeInTheDocument();
  });

  it("shows 'no review yet' for the caller when only the counterpart reviewed", async () => {
    getTransactionsMock.mockResolvedValue({
      transactions: [makeTransaction({ counterpartReview: { rating: 4, comment: "ok" } })],
    });

    renderHistory("buyer_1");

    const entry = (await screen.findAllByTestId("transaction-history-entry"))[0];
    expect(within(entry).getByText("Your review")).toBeInTheDocument();
    expect(within(entry).getByText("no review yet")).toBeInTheDocument();
    expect(within(entry).getByText("Seller's review")).toBeInTheDocument();
    expect(within(entry).getByText("ok")).toBeInTheDocument();
  });

  it("does not fetch transactions when there is no user", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);

    render(
      <MemoryRouter>
        <TransactionHistory />
      </MemoryRouter>
    );

    expect(await screen.findByText("Loading transactions…")).toBeInTheDocument();
    expect(getTransactionsMock).not.toHaveBeenCalled();
  });

  it("shows a loading state while transactions load", async () => {
    getTransactionsMock.mockReturnValue(new Promise(() => {}));

    renderHistory("buyer_1");

    expect(await screen.findByText("Loading transactions…")).toBeInTheDocument();
  });
});
