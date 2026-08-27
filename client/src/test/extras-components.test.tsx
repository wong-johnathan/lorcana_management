import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ExtrasSettingsPanel from "../components/extras/ExtrasSettingsPanel";
import SuggestedExtrasPanel from "../components/extras/SuggestedExtrasPanel";
import ActiveExtrasListingsPanel from "../components/extras/ActiveExtrasListingsPanel";
import PublicExtrasForSalePanel from "../components/extras/PublicExtrasForSalePanel";
import { cardMatchesQuery, formatReferencePrice, variantQuantity } from "../components/extras/extrasUi";
import type { Card, ExtraForSaleListing, InventoryExtrasCard, InventoryPolicy, PublicExtraForSaleListing } from "../types";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: 123,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Mickey Mouse",
    subtitle: "Brave Little Tailor",
    character: "Mickey Mouse",
    types: ["Hero"],
    cardType: "Character",
    color: "Amber",
    setCode: "TFC",
    setName: "The First Chapter",
    rarity: "Legendary",
    inkCost: 8,
    strength: 5,
    willpower: 5,
    lore: 4,
    abilities: "Evasive",
    cardNumber: "1/204 • EN • 1",
    foilTypes: ["None", "Silver"],
    imageUrl: "https://img.example/mickey.jpg",
    prices: [],
    ...overrides,
  };
}

const policy: InventoryPolicy = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
  autoSuggestExtras: true,
};

const extrasCard: InventoryExtrasCard = {
  card: makeCard(),
  owned: { quantity: 10, foilQuantity: 2, holofoilQuantity: 0 },
  keep: { quantity: 4, foilQuantity: 1, holofoilQuantity: 1 },
  extras: { quantity: 6, foilQuantity: 1, holofoilQuantity: 0 },
  activeListings: { quantity: 1, foilQuantity: 0, holofoilQuantity: 0 },
  availableToList: { quantity: 5, foilQuantity: 1, holofoilQuantity: 0 },
  referencePrices: { normal: 4, foil: 8, holofoil: null },
};

const listing: ExtraForSaleListing = {
  id: "listing_1",
  cardId: "card_1",
  card: makeCard(),
  variant: "normal",
  desiredQuantity: 5,
  publicQuantity: 3,
  referencePrice: 4,
  note: "Meet near MRT",
  status: "active",
};

describe("extras for sale components", () => {
  it("saves extras settings, shows public warning, and exposes manage link", async () => {
    const onSave = vi.fn();
    render(
      <MemoryRouter>
        <ExtrasSettingsPanel policy={policy} publicEnabled={false} showManageLink onSave={onSave} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Enable Public Collection/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Extras for Sale" })).toHaveAttribute("href", "/extras-for-sale");
    await userEvent.clear(screen.getByLabelText("Keep normal"));
    await userEvent.type(screen.getByLabelText("Keep normal"), "8");
    await userEvent.click(screen.getByLabelText(/Auto-suggest/i));
    await userEvent.click(screen.getByRole("button", { name: "Save extras settings" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ keepNormalQuantity: 8, autoSuggestExtras: false }));
  });

  it("lists suggested extras and saves per-card keep overrides", async () => {
    const onList = vi.fn();
    const onOverride = vi.fn();
    render(<SuggestedExtrasPanel cards={[extrasCard]} autoSuggestExtras onList={onList} onOverride={onOverride} />);

    await userEvent.clear(screen.getAllByLabelText("Qty")[0]);
    await userEvent.type(screen.getAllByLabelText("Qty")[0], "2");
    await userEvent.type(screen.getAllByLabelText("Note")[0], "cash only");
    await userEvent.click(screen.getByRole("button", { name: "List 2" }));
    expect(onList).toHaveBeenCalledWith(extrasCard, "normal", 2, "cash only");

    await userEvent.click(screen.getByRole("button", { name: "Set keep override" }));
    await userEvent.clear(screen.getByLabelText("Keep normal"));
    await userEvent.type(screen.getByLabelText("Keep normal"), "8");
    await userEvent.click(screen.getByRole("button", { name: "Save override" }));
    expect(onOverride).toHaveBeenCalledWith(extrasCard, expect.objectContaining({ keepNormalQuantity: 8 }));
  });

  it("renders disabled/empty suggested states", () => {
    const { rerender } = render(<SuggestedExtrasPanel cards={[extrasCard]} autoSuggestExtras={false} onList={vi.fn()} onOverride={vi.fn()} />);
    expect(screen.getByText(/Auto-suggest is off/i)).toBeInTheDocument();

    rerender(<SuggestedExtrasPanel cards={[]} autoSuggestExtras onList={vi.fn()} onOverride={vi.fn()} />);
    expect(screen.getByText(/No suggested extras/i)).toBeInTheDocument();
  });

  it("renders active listings with capped public quantity and owner actions", async () => {
    const onStatusChange = vi.fn();
    const onRemove = vi.fn();
    render(<ActiveExtrasListingsPanel listings={[listing]} onStatusChange={onStatusChange} onRemove={onRemove} />);

    expect(screen.getByText(/Desired qty:/i)).toBeInTheDocument();
    expect(screen.getByText(/Currently public:/i)).toBeInTheDocument();
    expect(screen.getByText(/Reference price:/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onStatusChange).toHaveBeenCalledWith("listing_1", "paused");
    expect(onRemove).toHaveBeenCalledWith("listing_1");
  });

  it("renders empty and paused listing branches", async () => {
    const onStatusChange = vi.fn();
    const onRemove = vi.fn();
    const { rerender } = render(<ActiveExtrasListingsPanel listings={[]} onStatusChange={onStatusChange} onRemove={onRemove} />);
    expect(screen.getByText(/No Extras for Sale listings yet/i)).toBeInTheDocument();

    rerender(<ActiveExtrasListingsPanel listings={[{
      ...listing,
      status: "paused",
      publicQuantity: 0,
      referencePrice: null,
      note: null,
      card: makeCard({ subtitle: "" }),
    }]} onStatusChange={onStatusChange} onRemove={onRemove} />);
    expect(screen.getByText("Hidden: no current extra inventory")).toBeInTheDocument();
    expect(screen.queryByText(/Note:/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(onStatusChange).toHaveBeenCalledWith("listing_1", "active");
  });

  it("renders public extras and empty state with contact action", async () => {
    const onContactClick = vi.fn();
    const publicListing: PublicExtraForSaleListing = {
      id: "public_1",
      card: makeCard(),
      variant: "foil",
      quantity: 1,
      referencePrice: 8,
      note: null,
    };
    const { rerender } = render(<PublicExtrasForSalePanel listings={[publicListing]} profile={{ telegram: "john" }} username="jw" onContactClick={onContactClick} />);
    expect(screen.getByText("Foil × 1")).toBeInTheDocument();
    expect(screen.getByText("Reference price: $8.00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Contact seller" }));
    expect(onContactClick).toHaveBeenCalled();

    rerender(<PublicExtrasForSalePanel listings={[]} profile={null} username="jw" onContactClick={onContactClick} />);
    expect(screen.getByText("No extras are currently listed for sale.")).toBeInTheDocument();
  });

  it("renders public extras without contact fields as view-profile CTA", async () => {
    const onContactClick = vi.fn();
    render(<PublicExtrasForSalePanel listings={[{
      id: "public_2",
      card: makeCard({ subtitle: "" }),
      variant: "holofoil",
      quantity: 2,
      referencePrice: null,
      note: "cash only",
    }]} profile={{}} username="jw" onContactClick={onContactClick} />);

    expect(screen.getByText("Holofoil × 2")).toBeInTheDocument();
    expect(screen.getByText("Reference price: —")).toBeInTheDocument();
    expect(screen.getByText("Note: cash only")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View profile" }));
    expect(onContactClick).toHaveBeenCalled();
  });

  it("formats extras helper values", () => {
    expect(formatReferencePrice(null)).toBe("—");
    expect(formatReferencePrice(1.5)).toBe("$1.50");
    expect(variantQuantity({ quantity: 1, foilQuantity: 2, holofoilQuantity: 3 }, "holofoil")).toBe(3);
  });

  it("matches cards by name, subtitle, and card number", () => {
    const card = makeCard();
    expect(cardMatchesQuery(card, "")).toBe(true);
    expect(cardMatchesQuery(card, "  ")).toBe(true);
    expect(cardMatchesQuery(card, "mickey")).toBe(true);
    expect(cardMatchesQuery(card, "TAILOR")).toBe(true);
    expect(cardMatchesQuery(card, "1/204")).toBe(true);
    expect(cardMatchesQuery(card, "elsa")).toBe(false);
    expect(cardMatchesQuery(makeCard({ subtitle: "" }), "tailor")).toBe(false);
  });

  it("filters suggested extras by search query and shows no-match state", async () => {
    const cards: InventoryExtrasCard[] = [
      extrasCard,
      { ...extrasCard, card: makeCard({ id: "card_2", name: "Elsa", subtitle: "Snow Queen", cardNumber: "2/204 • EN • 2" }) },
    ];
    render(<SuggestedExtrasPanel cards={cards} autoSuggestExtras onList={vi.fn()} onOverride={vi.fn()} />);

    expect(screen.getByText("Mickey Mouse")).toBeInTheDocument();
    expect(screen.getByText("Elsa")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox"), "elsa");
    expect(screen.queryByText("Mickey Mouse")).not.toBeInTheDocument();
    expect(screen.getByText("Elsa")).toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText(/No suggested extras match/i)).toBeInTheDocument();
  });

  it("filters active listings by search query and shows no-match state", async () => {
    const listings: ExtraForSaleListing[] = [
      listing,
      { ...listing, id: "listing_2", card: makeCard({ id: "card_2", name: "Elsa", subtitle: "Snow Queen" }) },
    ];
    render(<ActiveExtrasListingsPanel listings={listings} onStatusChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText("Mickey Mouse")).toBeInTheDocument();
    expect(screen.getByText("Elsa")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox"), "snow queen");
    expect(screen.queryByText("Mickey Mouse")).not.toBeInTheDocument();
    expect(screen.getByText("Elsa")).toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "nope");
    expect(screen.getByText(/No listings match/i)).toBeInTheDocument();
  });
});
