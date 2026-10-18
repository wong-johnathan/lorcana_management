import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TransactionCard from "../components/marketplace/TransactionCard";
import type { MarketplaceTransaction } from "../types";

const { getTransactionMock, confirmMock, cancelMock, adjustQuantityMock, postReviewMock } =
  vi.hoisted(() => ({
    getTransactionMock: vi.fn(),
    confirmMock: vi.fn(),
    cancelMock: vi.fn(),
    adjustQuantityMock: vi.fn(),
    postReviewMock: vi.fn(),
  }));

vi.mock("../services/api", () => ({
  marketplace: {
    getTransaction: getTransactionMock,
    confirm: confirmMock,
    cancel: cancelMock,
    adjustQuantity: adjustQuantityMock,
    postReview: postReviewMock,
  },
}));

const baseTransaction: MarketplaceTransaction = {
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

function renderCard(currentUserId: string, transaction: MarketplaceTransaction) {
  getTransactionMock.mockResolvedValue(transaction);
  return render(
    <TransactionCard transactionId="tx_1" currentUserId={currentUserId} onChanged={vi.fn()} />
  );
}

describe("TransactionCard", () => {
  beforeEach(() => {
    getTransactionMock.mockReset();
    confirmMock.mockReset();
    cancelMock.mockReset();
    adjustQuantityMock.mockReset();
    postReviewMock.mockReset();
  });

  it("shows the buyer a confirm receipt action while pending (REQ-16)", async () => {
    renderCard("buyer_1", baseTransaction);
    expect(
      await screen.findByRole("button", { name: "Confirm receipt" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("confirms the transaction when the buyer confirms receipt (REQ-16)", async () => {
    confirmMock.mockResolvedValue({ transactionId: "tx_1", alreadyCompleted: false });
    renderCard("buyer_1", baseTransaction);
    await userEvent.click(await screen.findByRole("button", { name: "Confirm receipt" }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith("tx_1"));
  });

  it("adjusts the agreed quantity (AC-14.5)", async () => {
    adjustQuantityMock.mockResolvedValue({ transactionId: "tx_1", quantity: 3 });
    renderCard("seller_1", baseTransaction);

    fireEvent.change(await screen.findByLabelText("Quantity"), { target: { value: "3" } });
    await userEvent.click(screen.getByRole("button", { name: "Adjust" }));

    await waitFor(() => expect(adjustQuantityMock).toHaveBeenCalledWith("tx_1", 3));
  });

  it("cancels a pending transaction (REQ-18)", async () => {
    cancelMock.mockResolvedValue({ transactionId: "tx_1", alreadyCancelled: false });
    renderCard("seller_1", baseTransaction);

    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith("tx_1"));
  });

  it("badges an auto-transferred completion (REQ-17)", async () => {
    renderCard("buyer_1", {
      ...baseTransaction,
      status: "COMPLETED",
      completedCause: "AUTO_TRANSFER",
      confirmedAt: "2026-10-31T00:00:00.000Z",
    });

    expect(await screen.findByTestId("auto-transfer-badge")).toHaveTextContent(
      "Auto-transferred"
    );
    expect(screen.queryByRole("button", { name: "Confirm receipt" })).not.toBeInTheDocument();
  });

  it("submits a review on a completed transaction (REQ-19)", async () => {
    postReviewMock.mockResolvedValue({
      id: "rev_1",
      transactionId: "tx_1",
      reviewerId: "buyer_1",
      revieweeId: "seller_1",
      rating: 4,
      comment: "great",
      createdAt: "2026-10-31T00:00:00.000Z",
      reviewer: { id: "buyer_1", username: "bob" },
    });
    renderCard("buyer_1", {
      ...baseTransaction,
      status: "COMPLETED",
      completedCause: "BUYER_CONFIRM",
      confirmedAt: "2026-10-31T00:00:00.000Z",
    });

    await userEvent.selectOptions(await screen.findByLabelText("Rating"), "4");
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "great" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Submit review" }));

    await waitFor(() => expect(postReviewMock).toHaveBeenCalledWith("tx_1", 4, "great"));
  });
});
