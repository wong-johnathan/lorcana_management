import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceTransactionsPage from "../pages/marketplace/MarketplaceTransactionsPage";
import type { MarketplaceTransaction } from "../types";

const {
  getTransactionsMock,
  getTransactionMock,
  confirmMock,
  cancelMock,
  adjustQuantityMock,
  postReviewMock,
} = vi.hoisted(() => ({
  getTransactionsMock: vi.fn(),
  getTransactionMock: vi.fn(),
  confirmMock: vi.fn(),
  cancelMock: vi.fn(),
  adjustQuantityMock: vi.fn(),
  postReviewMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    getTransactions: getTransactionsMock,
    getTransaction: getTransactionMock,
    confirm: confirmMock,
    cancel: cancelMock,
    adjustQuantity: adjustQuantityMock,
    postReview: postReviewMock,
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const buyerPendingTransaction: MarketplaceTransaction = {
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
  status: "PENDING_CONFIRMATION",
  completedCause: null,
  cancelledBy: null,
  soldAt: "2026-10-01T00:00:00.000Z",
  confirmedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  buyer: { id: "buyer_1", username: "bob" },
  seller: { id: "seller_1", username: "alice" },
  card: { id: "card_1", name: "Elsa, Snow Queen", setName: "The First Chapter" },
};

describe("MarketplaceTransactionsPage", () => {
  beforeEach(() => {
    getTransactionsMock.mockReset();
    getTransactionMock.mockReset();
    confirmMock.mockReset();
    cancelMock.mockReset();
    adjustQuantityMock.mockReset();
    postReviewMock.mockReset();
  });

  it("lists a buyer's pending transaction and shows Confirm receipt (D1)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    getTransactionsMock.mockResolvedValue({ transactions: [buyerPendingTransaction] });
    getTransactionMock.mockResolvedValue(buyerPendingTransaction);

    render(<MarketplaceTransactionsPage />);

    expect(await screen.findByRole("button", { name: "Confirm receipt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls confirm() when the buyer confirms receipt (D1)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    getTransactionsMock.mockResolvedValue({ transactions: [buyerPendingTransaction] });
    getTransactionMock.mockResolvedValue(buyerPendingTransaction);
    confirmMock.mockResolvedValue({ transactionId: "tx_1", alreadyCompleted: false });

    render(<MarketplaceTransactionsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Confirm receipt" }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith("tx_1"));
  });
});
