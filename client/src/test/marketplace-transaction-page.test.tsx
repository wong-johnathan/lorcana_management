import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceTransactionPage from "../pages/marketplace/MarketplaceTransactionPage";
import type { MarketplaceTransaction } from "../types";

const {
  getTransactionMock,
  confirmMock,
  cancelMock,
  adjustQuantityMock,
  postReviewMock,
} = vi.hoisted(() => ({
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

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const pendingTransaction: MarketplaceTransaction = {
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

const completedTransaction: MarketplaceTransaction = {
  ...pendingTransaction,
  status: "COMPLETED",
  confirmedAt: "2026-10-01T01:00:00.000Z",
};

function renderPage(transactionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/marketplace/transactions/${transactionId}`]}>
      <Routes>
        <Route path="/marketplace/transactions/:id" element={<MarketplaceTransactionPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MarketplaceTransactionPage", () => {
  beforeEach(() => {
    getTransactionMock.mockReset();
    confirmMock.mockReset();
    cancelMock.mockReset();
    adjustQuantityMock.mockReset();
    postReviewMock.mockReset();
  });

  it("renders the single transaction via TransactionCard (card, counterpart, status) (AC-TX-2.1/2.2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    getTransactionMock.mockResolvedValue(pendingTransaction);

    renderPage("tx_1");

    expect(await screen.findByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText(/Sold by/)).toHaveTextContent("alice");
    expect(screen.getByText("Pending confirmation")).toBeInTheDocument();
    // back link to the list
    expect(screen.getByRole("link", { name: "← All transactions" })).toHaveAttribute(
      "href",
      "/marketplace/transactions"
    );
  });

  it("renders role-aware actions for a pending buyer transaction (AC-TX-2.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    getTransactionMock.mockResolvedValue(pendingTransaction);

    renderPage("tx_1");

    expect(await screen.findByRole("button", { name: "Confirm receipt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adjust" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders the review form for a completed transaction (AC-TX-2.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    getTransactionMock.mockResolvedValue(completedTransaction);

    renderPage("tx_1");

    expect(await screen.findByText("Review the seller")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeInTheDocument();
  });

  it("surfaces the server error for a missing transaction (404) (AC-TX-2.4)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    getTransactionMock.mockRejectedValue(new Error("Transaction not found"));

    renderPage("missing");

    expect(await screen.findByText("Transaction not found")).toBeInTheDocument();
  });

  it("surfaces the server error for a non-party caller (403) (AC-TX-2.4)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "outsider_1", username: "eve" } } as never);
    getTransactionMock.mockRejectedValue(new Error("Forbidden"));

    renderPage("tx_1");

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });

  it("prompts anonymous visitors to sign in (REQ-2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);
    renderPage("tx_1");

    expect(await screen.findByText("Sign in required")).toBeInTheDocument();
  });

  it("calls confirm() from the singular view for a pending buyer transaction", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    getTransactionMock.mockResolvedValue(pendingTransaction);
    confirmMock.mockResolvedValue({ transactionId: "tx_1", alreadyCompleted: false });

    renderPage("tx_1");

    await userEvent.click(await screen.findByRole("button", { name: "Confirm receipt" }));

    await vi.waitFor(() => expect(confirmMock).toHaveBeenCalledWith("tx_1"));
  });
});
