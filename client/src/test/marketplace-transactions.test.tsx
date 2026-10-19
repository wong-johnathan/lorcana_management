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

  it("renders the loading state while the transaction is fetched", () => {
    getTransactionMock.mockReturnValue(new Promise(() => undefined));
    render(
      <TransactionCard transactionId="tx_1" currentUserId="buyer_1" />
    );
    expect(screen.getByText(/Loading transaction/)).toBeInTheDocument();
  });

  it("renders a fallback error when the transaction fails to load", async () => {
    getTransactionMock.mockRejectedValue(new Error("boom"));
    render(<TransactionCard transactionId="tx_1" currentUserId="buyer_1" />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("renders a not-found fallback when no transaction is returned", async () => {
    getTransactionMock.mockResolvedValue(false as never);
    render(<TransactionCard transactionId="tx_1" currentUserId="buyer_1" />);
    expect(await screen.findByText("Transaction not found")).toBeInTheDocument();
  });

  it("shows the seller a completed-deal review form (review the buyer)", async () => {
    renderCard("seller_1", {
      ...baseTransaction,
      status: "COMPLETED",
      completedCause: "BUYER_CONFIRM",
      confirmedAt: "2026-10-31T00:00:00.000Z",
    });
    expect(await screen.findByText(/Review the buyer/)).toBeInTheDocument();
    expect(screen.getByText(/Bought by/)).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("renders a cancelled status with the cancelling party", async () => {
    renderCard("buyer_1", {
      ...baseTransaction,
      status: "CANCELLED",
      cancelledBy: "seller",
    });
    expect(await screen.findByText(/Cancelled by seller/)).toBeInTheDocument();
  });

  it("renders a cancelled status without a cancelling party", async () => {
    renderCard("buyer_1", { ...baseTransaction, status: "CANCELLED", cancelledBy: null });
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });

  it("renders a completed card with no counterpart role (neither buyer nor seller)", async () => {
    renderCard("bystander", {
      ...baseTransaction,
      status: "COMPLETED",
      completedCause: "AUTO_TRANSFER",
      confirmedAt: "2026-10-31T00:00:00.000Z",
    });
    expect(await screen.findByText(/Auto-transferred/)).toBeInTheDocument();
    expect(screen.queryByText(/Sold by/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bought by/)).not.toBeInTheDocument();
  });

  it("rejects a non-positive or fractional adjustment quantity locally", async () => {
    renderCard("seller_1", baseTransaction);
    const quantity = await screen.findByLabelText("Quantity");

    fireEvent.change(quantity, { target: { value: "0" } });
    await userEvent.click(screen.getByRole("button", { name: "Adjust" }));
    expect(await screen.findByText(/whole number of at least 1/)).toBeInTheDocument();

    fireEvent.change(quantity, { target: { value: "1.5" } });
    await userEvent.click(screen.getByRole("button", { name: "Adjust" }));
    expect(screen.getByText(/whole number of at least 1/)).toBeInTheDocument();
    expect(adjustQuantityMock).not.toHaveBeenCalled();
  });

  it("surfaces action errors from a failed confirm", async () => {
    confirmMock.mockRejectedValue(new Error("Already confirmed"));
    renderCard("buyer_1", baseTransaction);
    await userEvent.click(await screen.findByRole("button", { name: "Confirm receipt" }));
    expect(await screen.findByText("Already confirmed")).toBeInTheDocument();
  });
});
