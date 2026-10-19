import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import MarketplaceListingPage from "../pages/marketplace/MarketplaceListingPage";

const { listingMock, enquireMock, reportMock } = vi.hoisted(() => ({
  listingMock: vi.fn(),
  enquireMock: vi.fn(),
  reportMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: { listing: listingMock, enquire: enquireMock, report: reportMock },
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

function listingFixture(quantity: number) {
  return {
    id: "listing_1",
    sellerId: "seller_1",
    cardId: card.id,
    variant: "normal",
    quantity,
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
    seller: { id: "seller_1", username: "alice", profile: {} },
    photos: [],
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/marketplace/listing/listing_1"]}>
      <Routes>
        <Route path="/marketplace/listing/:id" element={<MarketplaceListingPage />} />
        <Route path="/marketplace/chat/:id" element={<div>Chat thread page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MarketplaceListingPage enquiry", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "buyer_1", username: "bob" } } as never);
    listingMock.mockReset();
    enquireMock.mockReset();
    reportMock.mockReset();
  });

  it("offers the enquiry quantity dropdown from 1 through the listing quantity (AC-12.1)", async () => {
    listingMock.mockResolvedValue({ ...listingFixture(4), pendingQuantity: 0 });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Elsa, Snow Queen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enquire" }));

    expect(screen.getByRole("option", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "4" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "5" })).not.toBeInTheDocument();
  });

  it("enquires with the selected quantity and navigates to the thread (REQ-11/12)", async () => {
    listingMock.mockResolvedValue({ ...listingFixture(2), pendingQuantity: 0 });
    enquireMock.mockResolvedValue({ enquiryId: "enq_1" });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Elsa, Snow Queen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enquire" }));
    await userEvent.selectOptions(screen.getByLabelText("Quantity"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Start enquiry" }));

    expect(await screen.findByText("Chat thread page")).toBeInTheDocument();
    expect(enquireMock).toHaveBeenCalledWith("listing_1", 2);
  });
});
