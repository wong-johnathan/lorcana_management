import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceChatThreadPage from "../pages/marketplace/MarketplaceChatThreadPage";

const { getEnquiryMock, postMessageMock, markSoldMock } = vi.hoisted(() => ({
  getEnquiryMock: vi.fn(),
  postMessageMock: vi.fn(),
  markSoldMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    getEnquiry: getEnquiryMock,
    postMessage: postMessageMock,
    markSold: markSoldMock,
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

function renderThread(currentUserId: string, messages: unknown[]) {
  getEnquiryMock.mockResolvedValue({ enquiry: enquiryFixture(), messages });
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
