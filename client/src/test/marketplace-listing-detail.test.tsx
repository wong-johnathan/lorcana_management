import { render, screen, within } from "@testing-library/react";
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

const CARD_ART_SRC = "/api/card-images/card_elsa";
const CARD_ART_CAPTION = "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1";

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

const photos = [
  { id: "photo_1", url: "https://img.example/front.jpg", sortOrder: 0, label: "Front" },
  { id: "photo_2", url: "https://img.example/back.jpg", sortOrder: 1, label: "Back" },
];

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
  photos,
  pendingQuantity: 0,
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

async function thumbnailButtons(): Promise<HTMLElement[]> {
  return within(await screen.findByRole("group", { name: "Image thumbnails" })).getAllByRole(
    "button"
  );
}

function primaryTrigger(): HTMLElement {
  return screen.getByRole("button", { name: /^View / });
}

describe("MarketplaceListingPage", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);
    listingMock.mockReset();
    reportMock.mockReset();
  });

  it("renders one merged gallery with the card art as primary and every image as a thumbnail (AC-GAL-1.1, 2.2, 9.1)", async () => {
    listingMock.mockResolvedValue(listing);
    renderPage();

    const thumbs = await thumbnailButtons();
    expect(thumbs).toHaveLength(3);
    expect(thumbs.map((thumb) => thumb.querySelector("img")?.getAttribute("src"))).toEqual([
      CARD_ART_SRC,
      photos[0].url,
      photos[1].url,
    ]);
    expect(thumbs[0]).toHaveAttribute("aria-pressed", "true");

    const primary = primaryTrigger();
    expect(primary).toHaveAccessibleName(`View ${CARD_ART_CAPTION}`);
    expect(within(primary).getByRole("img")).toHaveAttribute("src", CARD_ART_SRC);
    expect(screen.getByText(CARD_ART_CAPTION)).toBeInTheDocument();

    // The superseded headings are gone.
    expect(screen.queryByRole("heading", { name: "Actual condition photos" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Card" })).toBeNull();

    // The premium-rarity hint is still present, unchanged, below the gallery.
    expect(screen.getByText(/Enchanted cards are high-value — condition photos help verify/)).toBeInTheDocument();
  });

  it("promotes a clicked thumbnail to the primary image with its caption and pressed state (AC-GAL-3.3, 3.4, 5.2, 9.1)", async () => {
    const user = userEvent.setup();
    listingMock.mockResolvedValue(listing);
    renderPage();

    const thumbs = await thumbnailButtons();
    await user.click(thumbs[1]);

    const primary = primaryTrigger();
    expect(primary).toHaveAccessibleName("View Front");
    expect(within(primary).getByRole("img")).toHaveAttribute("src", photos[0].url);
    expect(screen.getByText("Front")).toBeInTheDocument();

    expect(thumbs[1]).toHaveAttribute("aria-pressed", "true");
    expect(thumbs[0]).toHaveAttribute("aria-pressed", "false");
    expect(thumbs[2]).toHaveAttribute("aria-pressed", "false");
    // Selecting a thumbnail never opens the lightbox.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the lightbox at the selected index with the right N / M (AC-GAL-6.2, 9.1)", async () => {
    const user = userEvent.setup();
    listingMock.mockResolvedValue(listing);
    renderPage();

    const thumbs = await thumbnailButtons();
    await user.click(thumbs[1]);
    await user.click(primaryTrigger());

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Front");
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: "Front" })).toHaveAttribute(
      "src",
      photos[0].url
    );
  });

  it("renders photos only, without a card-art thumbnail, when the card has no art (AC-GAL-2.4, 9.1)", async () => {
    listingMock.mockResolvedValue({ ...listing, card: { ...card, imageUrl: "" } });
    renderPage();

    const thumbs = await thumbnailButtons();
    expect(thumbs).toHaveLength(2);
    expect(thumbs.map((thumb) => thumb.querySelector("img")?.getAttribute("src"))).toEqual([
      photos[0].url,
      photos[1].url,
    ]);
    expect(primaryTrigger()).toHaveAccessibleName("View Front");
    expect(screen.queryByText(CARD_ART_CAPTION)).toBeNull();
  });

  it("renders a non-triggerable placeholder when the listing has no art and no photos (AC-GAL-7.1, 9.1)", async () => {
    listingMock.mockResolvedValue({ ...listing, card: { ...card, imageUrl: "" }, photos: [] });
    renderPage();

    expect(await screen.findByText("No condition photos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^View / })).toBeNull();
    expect(screen.queryByRole("group", { name: "Image thumbnails" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Premium hint keeps its no-photos copy (AC-GAL-7.2).
    expect(
      screen.getByText(/Enchanted cards are high-value — ask the seller for actual condition photos/)
    ).toBeInTheDocument();
  });

  it("does not show the premium-rarity hint for ordinary rarities", async () => {
    listingMock.mockResolvedValue({
      ...listing,
      card: { ...card, rarity: "Legendary" },
      photos: [],
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Elsa, Snow Queen" })).toBeInTheDocument();
    // Card art only → a single-image gallery (no strip) and no premium hint.
    expect(screen.queryByRole("group", { name: "Image thumbnails" })).toBeNull();
    expect(primaryTrigger()).toHaveAccessibleName(`View ${CARD_ART_CAPTION}`);
    expect(screen.queryByText(/high-value/)).toBeNull();
  });

  it("prompts anonymous visitors to sign in to enquire", async () => {
    listingMock.mockResolvedValue(listing);
    renderPage();

    expect(await screen.findByRole("link", { name: "Sign in to enquire" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("keeps the signed-in Enquire entry point and the report modal", async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    listingMock.mockResolvedValue(listing);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Enquire" }));
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start enquiry" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Report listing" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // Gallery and enquiries remain independent surfaces.
    expect(screen.queryByRole("group", { name: "Image thumbnails" })).toBeInTheDocument();
  });
});
