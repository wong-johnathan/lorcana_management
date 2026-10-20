import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceChatThreadPage from "../pages/marketplace/MarketplaceChatThreadPage";

const { getEnquiryMock, postMessageMock, markSoldMock, confirmMock, postReviewMock } = vi.hoisted(() => ({
  getEnquiryMock: vi.fn(),
  postMessageMock: vi.fn(),
  markSoldMock: vi.fn(),
  confirmMock: vi.fn(),
  postReviewMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    getEnquiry: getEnquiryMock,
    postMessage: postMessageMock,
    markSold: markSoldMock,
    confirm: confirmMock,
    postReview: postReviewMock,
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

function enquiryFixture(status = "ACTIVE") {
  return {
    id: "enq_1",
    listingId: "listing_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    requestedQuantity: 2,
    status,
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    listing: {
      id: "listing_1",
      sellerId: "seller_1",
      cardId: "card_1",
      variant: "normal",
      quantity: 3,
      priceMinor: 1000,
      currency: "USD",
      condition: "NM",
      location: "London",
      note: null,
      status: "ACTIVE",
      hiddenAt: null,
      createdAt: "2026-10-18T00:00:00.000Z",
      updatedAt: "2026-10-18T00:00:00.000Z",
      card,
      photos: [],
    },
    buyer: { id: "buyer_1", username: "bob" },
    seller: { id: "seller_1", username: "alice" },
  };
}

function completedTransaction(myReview: unknown = null, counterpartReview: unknown = null) {
  return {
    id: "tx1",
    status: "COMPLETED",
    quantity: 2,
    soldAt: "2026-10-18T00:00:00.000Z",
    confirmedAt: "2026-10-18T00:01:00.000Z",
    myReview,
    counterpartReview,
  };
}

function renderThread(currentUserId: string, messages: unknown[], transactions: unknown[] = []) {
  getEnquiryMock.mockResolvedValue({ enquiry: enquiryFixture(), messages, transactions });
  return render(
    <MemoryRouter initialEntries={["/marketplace/chat/enq_1"]}>
      <Routes>
        <Route path="/marketplace/chat/:id" element={<MarketplaceChatThreadPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MarketplaceChatThreadPage", () => {
  beforeEach(() => {
    getEnquiryMock.mockReset();
    postMessageMock.mockReset();
    markSoldMock.mockReset();
    confirmMock.mockReset();
    postReviewMock.mockReset();
  });

  it("renders plain-text messages in chronological order (AC-13.2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [
      { id: "m1", enquiryId: "enq_1", senderId: "buyer_1", body: "Hi, is this available?", createdAt: "2026-10-18T00:00:00.000Z" },
      { id: "m2", enquiryId: "enq_1", senderId: "seller_1", body: "Yes! $10 each.", createdAt: "2026-10-18T00:01:00.000Z" },
    ]);

    const bubbles = await screen.findAllByTestId("chat-bubble");
    expect(bubbles.map((bubble) => bubble.textContent)).toEqual([
      "Hi, is this available?",
      "Yes! $10 each.",
    ]);
  });

  it("renders message bodies as plain text, escaping markup (AC-13.1)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    const { container } = renderThread("buyer_1", [
      { id: "m1", enquiryId: "enq_1", senderId: "buyer_1", body: "<b>bold</b> & <script>alert(1)</script>", createdAt: "2026-10-18T00:00:00.000Z" },
    ]);

    expect(
      await screen.findByText("<b>bold</b> & <script>alert(1)</script>")
    ).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("gives the seller a mark-sold dialog defaulted to the requested quantity (REQ-14)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    renderThread("seller_1", []);

    await userEvent.click(await screen.findByRole("button", { name: "Mark as sold" }));

    expect(screen.getByRole("dialog", { name: "Mark as sold" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toHaveValue(2);
  });

  it("renders SYSTEM messages as inline events, not bubbles", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [
      { id: "m1", enquiryId: "enq_1", senderId: "seller_1", kind: "SYSTEM", body: "Seller marked 2 as sold — awaiting buyer confirmation.", createdAt: "2026-10-18T00:00:00.000Z" },
    ]);

    expect(await screen.findByTestId("system-message")).toHaveTextContent(
      "Seller marked 2 as sold — awaiting buyer confirmation."
    );
    expect(screen.queryByTestId("chat-bubble")).not.toBeInTheDocument();
  });

  it("shows the buyer a confirm-receipt card for a pending transaction", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [
      { id: "tx1", status: "PENDING_CONFIRMATION", quantity: 2, soldAt: "2026-10-18T00:00:00.000Z", confirmedAt: null },
    ]);

    expect(await screen.findByText("Seller marked 2 as sold")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm receipt" })).toBeInTheDocument();
  });

  it("hides the mark-sold button for the seller once a transaction is open", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    renderThread("seller_1", [], [
      { id: "tx1", status: "PENDING_CONFIRMATION", quantity: 2, soldAt: "2026-10-18T00:00:00.000Z", confirmedAt: null },
    ]);

    expect(await screen.findByText("Awaiting buyer confirmation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as sold" })).not.toBeInTheDocument();
  });

  it("confirms receipt from the chat and reloads the thread", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    confirmMock.mockResolvedValue({});
    renderThread("buyer_1", [], [
      { id: "tx1", status: "PENDING_CONFIRMATION", quantity: 2, soldAt: "2026-10-18T00:00:00.000Z", confirmedAt: null },
    ]);

    await userEvent.click(await screen.findByRole("button", { name: "Confirm receipt" }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith("tx1"));
  });

  it("marks an archived thread read-only (D3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    getEnquiryMock.mockResolvedValue({ enquiry: enquiryFixture("ARCHIVED"), messages: [] });
    render(
      <MemoryRouter initialEntries={["/marketplace/chat/enq_1"]}>
        <Routes>
          <Route path="/marketplace/chat/:id" element={<MarketplaceChatThreadPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findByText("This conversation is archived and read-only.")
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Type a message…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as sold" })).not.toBeInTheDocument();
  });

  it("sends a message on an active thread (REQ-13)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    postMessageMock.mockResolvedValue({
      id: "m2",
      enquiryId: "enq_1",
      senderId: "buyer_1",
      body: "Sounds good",
      createdAt: "2026-10-18T00:02:00.000Z",
    });
    renderThread("buyer_1", []);

    const input = await screen.findByPlaceholderText("Type a message…");
    await userEvent.type(input, "Sounds good");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(postMessageMock).toHaveBeenCalledWith("enq_1", "Sounds good"));
    expect(await screen.findByText("Sounds good")).toBeInTheDocument();
  });

  it("dispatches unread:refresh after the thread loads (AC-NOTIF-7.1)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    const listener = vi.fn();
    window.addEventListener("unread:refresh", listener);

    renderThread("buyer_1", []);

    await screen.findByText("Elsa, Snow Queen");
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    window.removeEventListener("unread:refresh", listener);
  });

  it("dispatches unread:refresh after sending a message (AC-NOTIF-7.2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    postMessageMock.mockResolvedValue({
      id: "m2",
      enquiryId: "enq_1",
      senderId: "buyer_1",
      body: "hello",
      createdAt: "2026-10-18T00:02:00.000Z",
    });
    const listener = vi.fn();
    window.addEventListener("unread:refresh", listener);

    renderThread("buyer_1", []);
    await screen.findByText("Elsa, Snow Queen");

    const input = await screen.findByPlaceholderText("Type a message…");
    await userEvent.type(input, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    window.removeEventListener("unread:refresh", listener);
  });

  it("links the post-mark-sold 'View transactions' to the list (AC-REV-3.1)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    markSoldMock.mockResolvedValue({
      transactionId: "tx1",
      quantity: 2,
      status: "PENDING_CONFIRMATION",
      listingQuantity: 1,
      listingStatus: "ACTIVE",
    });
    renderThread("seller_1", []);

    await userEvent.click(await screen.findByRole("button", { name: "Mark as sold" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const link = await screen.findByRole("link", { name: "View transactions" });
    expect(link).toHaveAttribute("href", "/marketplace/transactions");
  });

  it("links the pending-card seller 'View transactions' to the list (AC-REV-3.2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    renderThread("seller_1", [], [
      { id: "tx1", status: "PENDING_CONFIRMATION", quantity: 2, soldAt: "2026-10-18T00:00:00.000Z", confirmedAt: null, myReview: null, counterpartReview: null },
    ]);

    const link = await screen.findByRole("link", { name: "View transactions" });
    expect(link).toHaveAttribute("href", "/marketplace/transactions");
  });

  it("renders no 'View transaction' link in the completed block, only the accordion (AC-REV-2.1)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    const { container } = renderThread("buyer_1", [], [completedTransaction()]);

    expect(await screen.findByRole("button", { name: "View reviews" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View transaction" })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/marketplace/transactions/tx1"]')).toBeNull();
  });

  it("renders the accordion collapsed with aria-expanded/aria-controls (AC-REV-2.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    const { container } = renderThread("buyer_1", [], [completedTransaction()]);

    const button = await screen.findByRole("button", { name: "View reviews" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    const panel = container.querySelector('[role="region"]');
    expect(panel).not.toBeNull();
    expect(button.getAttribute("aria-controls")).toBe(panel!.id);
    expect(panel).toHaveAttribute("hidden");
  });

  it("toggles the review panel inline without navigation (AC-REV-2.2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    const { container } = renderThread("buyer_1", [], [completedTransaction()]);

    const button = await screen.findByRole("button", { name: "View reviews" });
    const panel = container.querySelector('[role="region"]');

    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");
  });

  it("shows 'Your review' and 'Seller's review' with rating+comment for a buyer caller (AC-REV-2.4)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [
      completedTransaction({ rating: 5, comment: "great" }, { rating: 4, comment: "ok" }),
    ]);

    await userEvent.click(await screen.findByRole("button", { name: "View reviews" }));

    expect(screen.getByText("Your review")).toBeInTheDocument();
    expect(screen.getByText("Seller's review")).toBeInTheDocument();
    expect(screen.getByLabelText("5 out of 5")).toBeInTheDocument();
    expect(screen.getByLabelText("4 out of 5")).toBeInTheDocument();
    expect(screen.getByText("great")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("labels the counterpart review 'Buyer's review' for a seller caller (AC-REV-2.4)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    renderThread("seller_1", [], [
      completedTransaction({ rating: 5, comment: null }, { rating: 3, comment: "nice" }),
    ]);

    await userEvent.click(await screen.findByRole("button", { name: "View reviews" }));

    expect(screen.getByText("Buyer's review")).toBeInTheDocument();
    expect(screen.queryByText("Seller's review")).not.toBeInTheDocument();
  });

  it("shows 'no review yet' for absent reviews while the prompt remains (AC-REV-2.5)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [completedTransaction(null, null)]);

    await userEvent.click(await screen.findByRole("button", { name: "View reviews" }));

    expect(screen.getAllByText("no review yet")).toHaveLength(2);
    expect(screen.getByText("Review the seller")).toBeInTheDocument();
  });

  it("toggles the accordion with the Enter key (AC-REV-2.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [completedTransaction()]);

    const button = await screen.findByRole("button", { name: "View reviews" });
    button.focus();
    await userEvent.keyboard("{Enter}");

    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles the accordion with the Space key (AC-REV-2.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [completedTransaction()]);

    const button = await screen.findByRole("button", { name: "View reviews" });
    button.focus();
    await userEvent.keyboard(" ");

    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the inline review prompt for the buyer labelled 'Review the seller' (AC-TX-3.1/3.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [completedTransaction()]);

    expect(await screen.findByText("Review the seller")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeInTheDocument();
  });

  it("renders the inline review prompt for the seller labelled 'Review the buyer' (AC-TX-3.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "seller_1", username: "alice" } } as never);
    renderThread("seller_1", [], [completedTransaction()]);

    expect(await screen.findByText("Review the buyer")).toBeInTheDocument();
  });

  it("renders no review prompt for a pending transaction (AC-TX-3.4)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [
      { id: "tx1", status: "PENDING_CONFIRMATION", quantity: 2, soldAt: "2026-10-18T00:00:00.000Z", confirmedAt: null, myReview: null },
    ]);

    await screen.findByText("Seller marked 2 as sold");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("renders 'review submitted' (with rating) instead of the prompt when myReview is set (AC-TX-4.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [completedTransaction({ rating: 5, comment: null })]);

    expect(await screen.findByText("Review submitted.")).toBeInTheDocument();
    expect(screen.getByText("5 stars")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit review" })).not.toBeInTheDocument();
  });

  it("shows the singular '1 star' label for a submitted rating of 1 (AC-TX-4.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    renderThread("buyer_1", [], [completedTransaction({ rating: 1, comment: null })]);

    expect(await screen.findByText("Review submitted.")).toBeInTheDocument();
    expect(screen.getByText("1 star")).toBeInTheDocument();
  });

  it("submits the inline review via postReview(txId, rating, comment) (AC-TX-5.1)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    postReviewMock.mockResolvedValue({
      id: "r1",
      transactionId: "tx1",
      reviewerId: "buyer_1",
      revieweeId: "seller_1",
      rating: 5,
      comment: "great",
      createdAt: "2026-10-18T00:02:00.000Z",
      reviewer: { id: "buyer_1", username: "bob" },
    });
    renderThread("buyer_1", [], [completedTransaction()]);

    await screen.findByText("Review the seller");
    await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    await userEvent.type(screen.getByPlaceholderText("How was the trade?"), "great");
    await userEvent.click(screen.getByRole("button", { name: "Submit review" }));

    await waitFor(() => expect(postReviewMock).toHaveBeenCalledWith("tx1", 5, "great"));
  });

  it("shows the submitted state on a successful inline review (AC-TX-5.2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    postReviewMock.mockResolvedValue({
      id: "r1",
      transactionId: "tx1",
      reviewerId: "buyer_1",
      revieweeId: "seller_1",
      rating: 5,
      comment: null,
      createdAt: "2026-10-18T00:02:00.000Z",
      reviewer: { id: "buyer_1", username: "bob" },
    });
    renderThread("buyer_1", [], [completedTransaction()]);

    await screen.findByText("Review the seller");
    await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit review" }));

    expect(await screen.findByText("Review submitted.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("treats a 409 as already-reviewed and shows the submitted state (AC-TX-5.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    postReviewMock.mockRejectedValue(Object.assign(new Error("Already reviewed"), { status: 409 }));
    renderThread("buyer_1", [], [completedTransaction()]);

    await screen.findByText("Review the seller");
    await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit review" }));

    expect(await screen.findByText("Review submitted.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByText("Already reviewed")).not.toBeInTheDocument();
  });

  it("shows an inline error and keeps the prompt on other failures (AC-TX-5.4)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    postReviewMock.mockRejectedValue(new Error("Network error"));
    renderThread("buyer_1", [], [completedTransaction()]);

    await screen.findByText("Review the seller");
    await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit review" }));

    expect(await screen.findByText("Network error")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeInTheDocument();
  });

  it("falls back to a generic message when the rejection is not an Error", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    postReviewMock.mockRejectedValue("boom");
    renderThread("buyer_1", [], [completedTransaction()]);

    await screen.findByText("Review the seller");
    await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit review" }));

    expect(await screen.findByText("Failed to submit review")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it("prompts anonymous visitors to sign in (REQ-2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);
    render(
      <MemoryRouter initialEntries={["/marketplace/chat/enq_1"]}>
        <Routes>
          <Route path="/marketplace/chat/:id" element={<MarketplaceChatThreadPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Sign in required")).toBeInTheDocument();
  });
});
