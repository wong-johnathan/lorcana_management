import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/** `count` transactions in server order (newest first), uniquely named Card 1..N. */
function makeTransactions(count: number): MarketplaceTransaction[] {
  return Array.from({ length: count }, (_, index) =>
    makeTransaction({
      id: `tx_${index + 1}`,
      card: { id: `card_${index + 1}`, name: `Card ${index + 1}`, setName: "The First Chapter" },
    })
  );
}

function pageTree(currentUserId: string) {
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

  return (
    <MemoryRouter initialEntries={["/profile"]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

function renderHistory(currentUserId = "buyer_1") {
  settingsGetMock.mockResolvedValue({ publicEnabled: false, publicUrl: "/collection/buyer_1" });
  profileGetMock.mockResolvedValue(PROFILE);
  getPolicyMock.mockResolvedValue({ keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1 });

  return render(pageTree(currentUserId));
}

/**
 * The history panel is always mounted and toggled with the `hidden` attribute,
 * so DOM queries (`*ByTestId`, `*ByText`) still match collapsed content while
 * accessibility-tree queries (`*ByRole`) do not. Entry-content assertions must
 * expand the section first.
 */
async function expandHistory(): Promise<HTMLElement> {
  const toggle = await screen.findByRole("button", { name: /transaction history/i });
  fireEvent.click(toggle);
  return toggle;
}

function historyPanel(): HTMLElement {
  return screen.getByRole("region", { name: /transaction history/i });
}

function entryCardNames(): (string | null)[] {
  return within(historyPanel())
    .getAllByRole("heading", { level: 4 })
    .map((heading) => heading.textContent);
}

describe("SettingsPage transaction history", () => {
  beforeEach(() => {
    settingsGetMock.mockReset();
    profileGetMock.mockReset();
    getPolicyMock.mockReset();
    getTransactionsMock.mockReset();
  });

  describe("section disclosure (REQ-ACC-1)", () => {
    it("renders a collapsed toggle with aria-expanded/aria-controls and no accessible entries (AC-ACC-1.1/1.3)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: [makeTransaction()] });

      renderHistory("buyer_1");

      const toggle = await screen.findByRole("button", { name: /transaction history/i });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await screen.findByText("1 transaction");
      expect(toggle).toHaveAttribute("aria-controls");
      expect(toggle).toHaveTextContent("Transaction history");
      expect(toggle.className).toContain("focus-visible:ring");

      const panel = document.getElementById(toggle.getAttribute("aria-controls")!) as HTMLElement;
      expect(panel).toHaveAttribute("role", "region");
      expect(panel).toHaveAttribute("aria-labelledby", toggle.id);
      expect(panel).not.toBeVisible();
      expect(screen.queryByRole("heading", { level: 4 })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Sold by|Bought by/ })).not.toBeInTheDocument();
    });

    it("flips aria-expanded and reveals the always-mounted panel without refetching (AC-ACC-1.2/1.5)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(3) });

      renderHistory("buyer_1");

      const toggle = await expandHistory();
      expect(toggle).toHaveAttribute("aria-expanded", "true");

      const panel = historyPanel();
      expect(panel).toBeVisible();
      expect(screen.getByText("Your marketplace trades, newest first.")).toBeVisible();
      expect(await screen.findAllByTestId("transaction-history-entry")).toHaveLength(3);

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
      expect(document.getElementById(toggle.getAttribute("aria-controls")!)).not.toBeVisible();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(getTransactionsMock).toHaveBeenCalledTimes(1);
    });

    it("is keyboard operable (AC-ACC-1.2)", async () => {
      const user = userEvent.setup();
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(2) });

      renderHistory("buyer_1");

      const toggle = await screen.findByRole("button", { name: /transaction history/i });
      toggle.focus();
      expect(toggle).toHaveFocus();
      await user.keyboard("{Enter}");

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(historyPanel()).toBeVisible();
    });

    it("also toggles with the Space key, both ways (AC-ACC-1.2)", async () => {
      const user = userEvent.setup();
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(2) });

      renderHistory("buyer_1");

      const toggle = await screen.findByRole("button", { name: /transaction history/i });
      const panel = document.getElementById(toggle.getAttribute("aria-controls")!) as HTMLElement;
      toggle.focus();
      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(panel).not.toBeVisible();

      await user.keyboard(" ");

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(panel).not.toHaveAttribute("hidden");
      expect(panel).toBeVisible();
      expect(screen.getByText("Your marketplace trades, newest first.")).toBeVisible();

      await user.keyboard(" ");

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(panel).toHaveAttribute("hidden");
      expect(panel).not.toBeVisible();
      expect(screen.queryByRole("region", { name: /transaction history/i })).not.toBeInTheDocument();
    });

    it("shows the loading chip while collapsed (AC-ACC-1.4/1.6)", async () => {
      getTransactionsMock.mockReturnValue(new Promise(() => {}));

      renderHistory("buyer_1");

      expect(await screen.findByText("Loading…")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /transaction history/i })).toHaveAttribute("aria-expanded", "false");

      await expandHistory();
      expect(screen.getByText("Loading transactions…")).toBeVisible();
    });

    it("shows a singular/plural transaction count chip (AC-ACC-1.4)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(1) });

      renderHistory("buyer_1");

      expect(await screen.findByText("1 transaction")).toBeInTheDocument();
      expect(screen.queryByText("1 transactions")).not.toBeInTheDocument();
      expect(getTransactionsMock).toHaveBeenCalledTimes(1);
    });

    it("shows an n transactions chip for multiple entries (AC-ACC-1.4)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(3) });

      renderHistory("buyer_1");

      expect(await screen.findByText("3 transactions")).toBeInTheDocument();
    });

    it("shows the empty chip and preserves the empty body state (AC-ACC-1.4/1.6/1.7)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: [] });

      renderHistory("buyer_1");

      expect(await screen.findByText("No transactions yet")).toBeInTheDocument();
      await expandHistory();
      expect(screen.getByText("No transactions yet.")).toBeVisible();
    });

    it("surfaces the load error in the chip and the body (AC-ACC-1.4/1.6)", async () => {
      getTransactionsMock.mockRejectedValue(new Error("Failed to load transactions"));

      renderHistory("buyer_1");

      expect(await screen.findByText("Couldn’t load")).toBeInTheDocument();
      await expandHistory();
      expect(screen.getByText("Failed to load transactions")).toBeVisible();
    });

    it("renders the event with no user and the loading chip (AC-ACC-1.3)", async () => {
      vi.mocked(useAuth).mockReturnValue({ user: null } as never);

      render(
        <MemoryRouter>
          <TransactionHistory />
        </MemoryRouter>
      );

      expect(await screen.findByText("Loading…")).toBeInTheDocument();
      expect(getTransactionsMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /transaction history/i })).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("entry content (REQ-REV-4, unchanged)", () => {
    it("lists all statuses newest first with no status filter (AC-REV-4.1/4.2)", async () => {
      getTransactionsMock.mockResolvedValue({
        transactions: [
          makeTransaction({ id: "tx_1", status: "PENDING_CONFIRMATION", card: { id: "card_1", name: "Elsa, Snow Queen", setName: "The First Chapter" } }),
          makeTransaction({ id: "tx_2", card: { id: "card_2", name: "Mickey Mouse", setName: "The First Chapter" } }),
          makeTransaction({ id: "tx_3", status: "CANCELLED", cancelledBy: "buyer", card: { id: "card_3", name: "Scar", setName: "The First Chapter" } }),
        ],
      });

      renderHistory("buyer_1");
      await expandHistory();

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
      await expandHistory();

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
      await expandHistory();

      const entry = (await screen.findAllByTestId("transaction-history-entry"))[0];
      const link = within(entry).getByRole("link", { name: "Sold by alice" });
      expect(link).toHaveAttribute("href", "/marketplace/seller/seller_1");
    });

    it("links the buyer counterpart to /marketplace/seller/<id> for a seller caller (AC-REV-4.4)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: [makeTransaction()] });

      renderHistory("seller_1");
      await expandHistory();

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
      await expandHistory();

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
      await expandHistory();

      const entries = await screen.findAllByTestId("transaction-history-entry");
      for (const entry of entries) {
        expect(within(entry).queryByRole("button")).not.toBeInTheDocument();
        expect(within(entry).queryByRole("textbox")).not.toBeInTheDocument();
        expect(within(entry).queryByText("Review the seller")).not.toBeInTheDocument();
        expect(within(entry).queryByText("Review the buyer")).not.toBeInTheDocument();
      }
    });

    it("shows 'no review yet' for the caller when only the counterpart reviewed", async () => {
      getTransactionsMock.mockResolvedValue({
        transactions: [makeTransaction({ counterpartReview: { rating: 4, comment: "ok" } })],
      });

      renderHistory("buyer_1");
      await expandHistory();

      const entry = (await screen.findAllByTestId("transaction-history-entry"))[0];
      expect(within(entry).getByText("Your review")).toBeInTheDocument();
      expect(within(entry).getByText("no review yet")).toBeInTheDocument();
      expect(within(entry).getByText("Seller's review")).toBeInTheDocument();
      expect(within(entry).getByText("ok")).toBeInTheDocument();
    });

    it("falls back to a generic message for non-Error rejections", async () => {
      getTransactionsMock.mockRejectedValue("boom");

      renderHistory("buyer_1");
      await expandHistory();

      expect(await screen.findByText("Failed to load transactions")).toBeVisible();
    });
  });

  describe("client-side pagination (REQ-PAG-1)", () => {
    it("renders only 5 entries newest-first with a page control (AC-PAG-1.1/1.2/1.3)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(12) });

      renderHistory("buyer_1");
      await expandHistory();

      const panel = historyPanel();
      const entries = await within(panel).findAllByTestId("transaction-history-entry");
      expect(entries).toHaveLength(5);
      expect(entryCardNames()).toEqual(["Card 1", "Card 2", "Card 3", "Card 4", "Card 5"]);
      expect(within(panel).getByText("Page 1 of 3")).toBeInTheDocument();
      expect(await within(panel).findByRole("button", { name: "Previous page" })).toBeDisabled();
      expect(within(panel).getByRole("button", { name: "Next page" })).toBeEnabled();
      expect(within(panel).getByText("Page 1 of 3")).toHaveAttribute("aria-live", "polite");
    });

    it("pages forward and back keeping server order (AC-PAG-1.2/1.4)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(12) });

      renderHistory("buyer_1");
      await expandHistory();

      fireEvent.click(await screen.findByRole("button", { name: "Next page" }));

      expect(entryCardNames()).toEqual(["Card 6", "Card 7", "Card 8", "Card 9", "Card 10"]);
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Next page" }));

      expect(entryCardNames()).toEqual(["Card 11", "Card 12"]);
      expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
      expect(entryCardNames()).toEqual(["Card 6", "Card 7", "Card 8", "Card 9", "Card 10"]);
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });

    it("moves focus to the sibling button when the activated bound becomes disabled (AC-PAG-1.4)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(12) });

      renderHistory("buyer_1");
      await expandHistory();

      const next = await screen.findByRole("button", { name: "Next page" });
      const previous = screen.getByRole("button", { name: "Previous page" });

      fireEvent.click(next);
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));

      await waitFor(() => expect(previous).toHaveFocus());

      fireEvent.click(previous);
      fireEvent.click(previous);

      await waitFor(() => expect(next).toHaveFocus());
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });

    it("scrolls the list into view on page change, honouring reduced motion (D6)", async () => {
      const scrollIntoView = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
      scrollIntoView.mockClear();
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(12) });

      renderHistory("buyer_1");
      await expandHistory();

      const next = await screen.findByRole("button", { name: "Next page" });
      fireEvent.click(next);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });

      const matchMedia = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
      Object.defineProperty(window, "matchMedia", { value: matchMedia, writable: true, configurable: true });
      try {
        fireEvent.click(next);
        expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
        expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start", behavior: "auto" });
      } finally {
        delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      }
      expect(historyPanel().querySelector(".scroll-mt-4")).not.toBeNull();
    });

    it("still changes page and scrolls smoothly when matchMedia is unavailable (D6)", async () => {
      const scrollIntoView = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
      const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(12) });

      renderHistory("buyer_1");
      await expandHistory();
      scrollIntoView.mockClear();

      Reflect.deleteProperty(window as unknown as Record<string, unknown>, "matchMedia");
      try {
        expect(typeof (window as unknown as { matchMedia?: unknown }).matchMedia).toBe("undefined");

        const next = await screen.findByRole("button", { name: "Next page" });
        expect(() => fireEvent.click(next)).not.toThrow();

        expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
        expect(entryCardNames()).toEqual(["Card 6", "Card 7", "Card 8", "Card 9", "Card 10"]);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
      } finally {
        // Put the environment back exactly as it was found.
        if (originalMatchMedia) {
          Object.defineProperty(window, "matchMedia", originalMatchMedia);
        } else {
          Reflect.deleteProperty(window as unknown as Record<string, unknown>, "matchMedia");
        }
      }
    });

    it("renders no page control for 5 or fewer entries (AC-PAG-1.5)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(5) });

      renderHistory("buyer_1");
      await expandHistory();

      expect(await screen.findAllByTestId("transaction-history-entry")).toHaveLength(5);
      expect(screen.queryByLabelText("Previous page")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Next page")).not.toBeInTheDocument();
      expect(screen.queryByText(/Page 1 of 1/)).not.toBeInTheDocument();
    });

    it("does not refetch on page change (AC-PAG-1.6)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(12) });

      renderHistory("buyer_1");
      await expandHistory();

      fireEvent.click(await screen.findByRole("button", { name: "Next page" }));
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));

      expect(getTransactionsMock).toHaveBeenCalledTimes(1);
    });

    it("renders the empty state with no page control for 0 entries (AC-PAG-1.7)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: [] });

      renderHistory("buyer_1");
      await expandHistory();

      expect(screen.getByText("No transactions yet.")).toBeVisible();
      expect(screen.queryByTestId("transaction-history-entry")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Next page")).not.toBeInTheDocument();
    });

    it("clamps to the last valid page when the list shrinks (AC-PAG-1.8)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(12) });

      const view = renderHistory("buyer_1");
      await expandHistory();

      fireEvent.click(await screen.findByRole("button", { name: "Next page" }));
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(6) });
      view.rerender(pageTree("buyer_2"));

      await waitFor(() => expect(screen.getByText("Page 2 of 2")).toBeInTheDocument());
      expect(entryCardNames()).toEqual(["Card 6"]);
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    });

    it("resets the page to 1 on remount and never writes it to the URL (AC-PAG-1.9)", async () => {
      getTransactionsMock.mockResolvedValue({ transactions: makeTransactions(12) });

      const first = renderHistory("buyer_1");
      await expandHistory();
      fireEvent.click(await screen.findByRole("button", { name: "Next page" }));
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

      expect(window.location.href).toBe("http://localhost/");
      expect(window.location.search).toBe("");

      first.unmount();

      renderHistory("buyer_1");
      await expandHistory();

      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
      expect(entryCardNames()).toEqual(["Card 1", "Card 2", "Card 3", "Card 4", "Card 5"]);
    });
  });
});
