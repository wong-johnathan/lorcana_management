import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceListingPage from "../pages/marketplace/MarketplaceListingPage";

const { listingMock, reportMock } = vi.hoisted(() => ({
  listingMock: vi.fn(),
  reportMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: { listing: listingMock, report: reportMock },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const card = {
  id: "card_elsa",
  externalId: 1,
  tcgPlayerId: 100,
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
  rarity: "Enchanted",
  inkCost: 5,
  inkable: true,
  strength: 3,
  willpower: 3,
  lore: 2,
  abilities: "Evasive",
  cardNumber: "1/204 • EN • 1",
  foilTypes: ["None", "Silver"],
  imageUrl: "https://img.example/elsa.jpg",
  prices: [],
};

const listing = {
  id: "listing_1",
  sellerId: "seller_1",
  cardId: card.id,
  variant: "foil",
  quantity: 2,
  priceMinor: 2500,
  currency: "USD",
  condition: "NM",
  location: "London",
  note: null,
  status: "ACTIVE",
  hiddenAt: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  card,
  seller: { id: "seller_1", username: "alice", profile: {} },
  photos: [{ id: "photo_1", url: "https://img.example/condition.jpg", sortOrder: 0, label: null }],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/marketplace/listing/listing_1"]}>
      <Routes>
        <Route path="/marketplace/listing/:id" element={<MarketplaceListingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MarketplaceListingPage", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any);
    listingMock.mockReset();
    reportMock.mockReset();
  });

  it("labels photos as actual condition photos and shows the premium-rarity hint", async () => {
    listingMock.mockResolvedValue({ ...listing, pendingQuantity: 0 });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Actual condition photos" })).toBeInTheDocument();
    expect(screen.getByAltText(/actual condition photo/i)).toBeInTheDocument();
    expect(screen.getByText(/Enchanted cards are high-value/)).toBeInTheDocument();
  });

  it("includes the position label in the photo alt when set (REQ-POL-15)", async () => {
    listingMock.mockResolvedValue({
      ...listing,
      photos: [
        { id: "photo_1", url: "https://img.example/condition.jpg", sortOrder: 0, label: "Back Top Left" },
      ],
      pendingQuantity: 0,
    });
    renderPage();

    expect(
      await screen.findByAltText("Elsa, Snow Queen — actual condition photo (Back Top Left)")
    ).toBeInTheDocument();
  });

  it("does not show the premium-rarity hint for ordinary rarities", async () => {
    listingMock.mockResolvedValue({
      ...listing,
      card: { ...card, rarity: "Legendary" },
      photos: [],
      pendingQuantity: 0,
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Elsa, Snow Queen" })).toBeInTheDocument();
    expect(screen.getByText("No condition photos")).toBeInTheDocument();
    expect(screen.queryByText(/high-value/)).not.toBeInTheDocument();
  });

  it("prompts anonymous visitors to sign in to enquire", async () => {
    listingMock.mockResolvedValue({ ...listing, pendingQuantity: 0 });
    renderPage();

    expect(await screen.findByRole("link", { name: "Sign in to enquire" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("renders the card art and opens the carousel at index 0 (AC-LB-4.1/4.2)", async () => {
    listingMock.mockResolvedValue({ ...listing, pendingQuantity: 0 });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "View Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1",
      })
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute(
      "aria-label",
      "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1"
    );
    expect(
      within(dialog).getByRole("img", {
        name: "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1",
      })
    ).toHaveAttribute("src", "/api/card-images/card_elsa");
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();
  });

  it("opens the carousel at the clicked condition photo's index with the position-label caption (AC-LB-4.2/4.3)", async () => {
    listingMock.mockResolvedValue({
      ...listing,
      photos: [
        { id: "photo_1", url: "https://img.example/condition.jpg", sortOrder: 0, label: "Back Top Left" },
      ],
      pendingQuantity: 0,
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "View Elsa, Snow Queen — actual condition photo (Back Top Left)",
      })
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Back Top Left");
    expect(within(dialog).getByRole("img", { name: "Back Top Left" })).toHaveAttribute(
      "src",
      "https://img.example/condition.jpg"
    );
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();

    // Previous reveals the card-art caption.
    await userEvent.click(within(dialog).getByRole("button", { name: "Previous image" }));
    expect(
      within(dialog).getByRole("img", {
        name: "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1",
      })
    ).toHaveAttribute("src", "/api/card-images/card_elsa");
  });
});
