import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceChatPage from "../pages/marketplace/MarketplaceChatPage";

const { getEnquiriesMock } = vi.hoisted(() => ({
  getEnquiriesMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    getEnquiries: getEnquiriesMock,
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const cardElsa = { id: "card_1", name: "Elsa, Snow Queen" };
const cardMickey = { id: "card_2", name: "Mickey Mouse, Brave Little Tailor" };

function enquiryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "enq_1",
    listingId: "listing_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    requestedQuantity: 2,
    status: "ACTIVE",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    listing: {
      id: "listing_1",
      cardId: "card_1",
      variant: "normal",
      quantity: 3,
      priceMinor: 1000,
      currency: "USD",
      status: "ACTIVE",
      card: cardElsa,
    },
    buyer: { id: "buyer_1", username: "bob" },
    seller: { id: "seller_1", username: "alice" },
    lastMessageAt: "2026-10-18T00:00:00.000Z",
    unread: false,
    unreadCount: 0,
    ...overrides,
  };
}

function renderChatPage() {
  return render(
    <MemoryRouter initialEntries={["/marketplace/chat"]}>
      <MarketplaceChatPage />
    </MemoryRouter>
  );
}

describe("MarketplaceChatPage — inbox highlighting + Transactions link (REQ-NOTIF-2, REQ-NOTIF-6)", () => {
  beforeEach(() => {
    getEnquiriesMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
  });

  it("highlights an unread thread (bold + amber count badge) and keeps a read thread styled (AC-NOTIF-6.1/6.2)", async () => {
    getEnquiriesMock.mockResolvedValue({
      enquiries: [
        enquiryFixture({ id: "enq_1", unread: true, unreadCount: 4 }),
        enquiryFixture({
          id: "enq_2",
          listing: {
            id: "listing_2",
            cardId: "card_2",
            variant: "normal",
            quantity: 1,
            priceMinor: 2000,
            currency: "USD",
            status: "ACTIVE",
            card: cardMickey,
          },
        }),
      ],
    });

    renderChatPage();

    // Unread thread: bold title + accent indicator showing the count.
    const unreadTitle = await screen.findByText("Elsa, Snow Queen");
    expect(unreadTitle).toHaveClass("font-bold");
    expect(unreadTitle).not.toHaveClass("font-semibold");

    const indicator = screen.getByTestId("unread-indicator");
    expect(indicator).toHaveAttribute("aria-label", "4 unread messages");
    expect(indicator).toHaveTextContent("4");

    // Read thread: keeps the existing non-bold styling and no indicator.
    const readTitle = screen.getByText("Mickey Mouse, Brave Little Tailor");
    expect(readTitle).toHaveClass("font-semibold");
    expect(readTitle).not.toHaveClass("font-bold");

    const readRow = readTitle.closest("li") as HTMLElement;
    expect(within(readRow).queryByTestId("unread-indicator")).not.toBeInTheDocument();
  });

  it("renders threads in server order without client-side re-sorting (AC-NOTIF-6.3)", async () => {
    getEnquiriesMock.mockResolvedValue({
      enquiries: [
        enquiryFixture({ id: "enq_1", unread: false, lastMessageAt: "2026-10-18T00:05:00.000Z" }),
        enquiryFixture({
          id: "enq_2",
          unread: true,
          unreadCount: 1,
          lastMessageAt: "2026-10-18T00:01:00.000Z",
          listing: {
            id: "listing_2",
            cardId: "card_2",
            variant: "normal",
            quantity: 1,
            priceMinor: 2000,
            currency: "USD",
            status: "ACTIVE",
            card: cardMickey,
          },
        }),
      ],
    });

    renderChatPage();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(within(items[1]).getByText("Mickey Mouse, Brave Little Tailor")).toBeInTheDocument();
  });

  it("renders a Transactions link to /marketplace/transactions (AC-NOTIF-2.2)", async () => {
    getEnquiriesMock.mockResolvedValue({ enquiries: [] });

    renderChatPage();

    expect(await screen.findByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/marketplace/transactions"
    );
  });
});
