import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "../types";

const apiMocks = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  settingsUpdate: vi.fn(),
  profileGet: vi.fn(),
  profileUpdate: vi.fn(),
  profileUploadPhoto: vi.fn(),
  profileDeletePhoto: vi.fn(),
  profileCreateReference: vi.fn(),
  profileUpdateReference: vi.fn(),
  profileDeleteReference: vi.fn(),
  inventoryGetPolicy: vi.fn(),
  inventoryUpdatePolicy: vi.fn(),
  inventoryGetExtras: vi.fn(),
  inventoryListRetentionOverrides: vi.fn(),
  inventoryUpdateRetentionOverride: vi.fn(),
  inventoryDeleteRetentionOverride: vi.fn(),
  extrasList: vi.fn(),
  extrasListAll: vi.fn(),
  extrasCreate: vi.fn(),
  extrasUpdate: vi.fn(),
  extrasRemove: vi.fn(),
  publicGet: vi.fn(),
  publicExtras: vi.fn(),
  cardsGet: vi.fn(),
}));

vi.mock("../services/api", () => ({
  settings: { get: apiMocks.settingsGet, update: apiMocks.settingsUpdate },
  profile: {
    get: apiMocks.profileGet,
    update: apiMocks.profileUpdate,
    uploadPhoto: apiMocks.profileUploadPhoto,
    deletePhoto: apiMocks.profileDeletePhoto,
    createReference: apiMocks.profileCreateReference,
    updateReference: apiMocks.profileUpdateReference,
    deleteReference: apiMocks.profileDeleteReference,
  },
  inventory: {
    getPolicy: apiMocks.inventoryGetPolicy,
    updatePolicy: apiMocks.inventoryUpdatePolicy,
    getExtras: apiMocks.inventoryGetExtras,
    listRetentionOverrides: apiMocks.inventoryListRetentionOverrides,
    updateRetentionOverride: apiMocks.inventoryUpdateRetentionOverride,
    deleteRetentionOverride: apiMocks.inventoryDeleteRetentionOverride,
  },
  extrasForSale: {
    list: apiMocks.extrasList,
    listAll: apiMocks.extrasListAll,
    create: apiMocks.extrasCreate,
    update: apiMocks.extrasUpdate,
    remove: apiMocks.extrasRemove,
  },
  publicCollection: { get: apiMocks.publicGet, extras: apiMocks.publicExtras },
  cards: { get: apiMocks.cardsGet },
}));

vi.mock("../components/profile/ProfileForm", () => ({
  default: ({ onSubmit }: { onSubmit: (data: any) => void }) => <button type="button" onClick={() => onSubmit({ displayName: "jw" })}>Save profile form</button>,
}));
vi.mock("../components/profile/ProfileImageUploader", () => ({
  default: () => <div>Profile image uploader</div>,
}));
vi.mock("../components/profile/UserReferencesEditor", () => ({
  default: () => <div>User references editor</div>,
}));
vi.mock("../components/inventory/InventoryCollectionView", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("../components/CardDetail", () => ({
  default: () => <div>Card detail</div>,
}));

import SettingsPage from "../pages/SettingsPage";
import ExtrasForSalePage from "../pages/ExtrasForSalePage";
import PublicCollectionPage from "../pages/PublicCollectionPage";

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

const policy = { keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true };
const profile = {
  displayName: "John",
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
  references: [],
};

beforeEach(() => {
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  apiMocks.inventoryListRetentionOverrides.mockResolvedValue({ overrides: [] });
});

describe("extras for sale pages", () => {
  it("loads Extras for Sale settings on profile and saves policy changes", async () => {
    apiMocks.settingsGet.mockResolvedValue({ publicEnabled: false, publicUrl: "/collection/user_1" });
    apiMocks.profileGet.mockResolvedValue(profile);
    apiMocks.inventoryGetPolicy.mockResolvedValue(policy);
    apiMocks.inventoryUpdatePolicy.mockResolvedValue({ ...policy, keepNormalQuantity: 8 });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Extras for Sale")).toBeInTheDocument();
    expect(screen.getByText(/Enable Public Collection/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Keep normal"), { target: { value: "8" } });
    await userEvent.click(screen.getByRole("button", { name: "Save extras settings" }));
    expect(apiMocks.inventoryUpdatePolicy).toHaveBeenCalledWith(expect.objectContaining({ keepNormalQuantity: 8 }));
    expect(await screen.findByText("Extras for Sale settings saved")).toBeInTheDocument();
  });

  it("loads owner Extras for Sale page and creates a listing from suggestions", async () => {
    apiMocks.inventoryGetExtras.mockResolvedValue({
      policy,
      cards: [{
        card: makeCard(),
        owned: { quantity: 8, foilQuantity: 1, holofoilQuantity: 0 },
        keep: { quantity: 4, foilQuantity: 1, holofoilQuantity: 1 },
        extras: { quantity: 4, foilQuantity: 0, holofoilQuantity: 0 },
        activeListings: { quantity: 0, foilQuantity: 0, holofoilQuantity: 0 },
        availableToList: { quantity: 4, foilQuantity: 0, holofoilQuantity: 0 },
        referencePrices: { normal: 4, foil: null, holofoil: null },
      }],
    });
    apiMocks.extrasList.mockResolvedValue({ listings: [] });
    apiMocks.extrasCreate.mockResolvedValue({ listing: {} });

    render(
      <MemoryRouter>
        <ExtrasForSalePage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Extras for Sale" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Custom price"), "12");
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "SGD");
    await userEvent.click(await screen.findByRole("button", { name: "List 4" }));
    expect(apiMocks.extrasCreate).toHaveBeenCalledWith({ cardId: "card_1", variant: "normal", desiredQuantity: 4, note: null, customPrice: 12, customPriceCurrency: "SGD" });
    expect(await screen.findByText("Extra listed for sale")).toBeInTheDocument();
  });

  it("updates listing notes and custom prices from the owner listings tab", async () => {
    apiMocks.inventoryGetExtras.mockResolvedValue({ policy, cards: [] });
    apiMocks.extrasList
      .mockResolvedValueOnce({ listings: [{
        id: "listing_1",
        cardId: "card_1",
        card: makeCard(),
        variant: "normal",
        desiredQuantity: 2,
        publicQuantity: 2,
        referencePrice: 4,
        referencePriceCurrency: "USD",
        customPrice: null,
        customPriceCurrency: "SGD",
        note: null,
        status: "active",
      }] })
      .mockResolvedValue({ listings: [] });
    apiMocks.extrasUpdate.mockResolvedValue({ listing: {} });

    render(
      <MemoryRouter>
        <ExtrasForSalePage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Extras for Sale" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Extras for Sale" }));
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText("Listing note"), "cash only");
    await userEvent.type(screen.getByLabelText("Custom price"), "15");
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "SGD");
    await userEvent.click(screen.getByRole("button", { name: "Save listing" }));

    expect(apiMocks.extrasUpdate).toHaveBeenCalledWith("listing_1", { note: "cash only", customPrice: 15, customPriceCurrency: "SGD" });
    expect(await screen.findByText("Listing updated")).toBeInTheDocument();
  });

  it("lists all extras in bulk and lands on the listings tab", async () => {
    apiMocks.inventoryGetExtras.mockResolvedValue({ policy, cards: [] });
    apiMocks.extrasList.mockResolvedValue({ listings: [] });
    apiMocks.extrasListAll.mockResolvedValue({ created: 3, skipped: 1 });

    render(
      <MemoryRouter>
        <ExtrasForSalePage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Extras for Sale" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "List all extras" }));
    expect(apiMocks.extrasListAll).toHaveBeenCalled();
    expect(await screen.findByText("Listed 3 extras for sale (1 already listed)")).toBeInTheDocument();
    expect(await screen.findByText("No Extras for Sale listings yet. List cards from Suggested Extras.")).toBeInTheDocument();
  });

  it("surfaces list-all failures", async () => {
    apiMocks.inventoryGetExtras.mockResolvedValue({ policy, cards: [] });
    apiMocks.extrasList.mockResolvedValue({ listings: [] });
    apiMocks.extrasListAll.mockRejectedValue(new Error("boom"));

    render(
      <MemoryRouter>
        <ExtrasForSalePage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Extras for Sale" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "List all extras" }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("shows manual overrides and removes one from the overrides tab", async () => {
    apiMocks.inventoryGetExtras.mockResolvedValue({ policy, cards: [] });
    apiMocks.extrasList.mockResolvedValue({ listings: [] });
    apiMocks.inventoryListRetentionOverrides.mockResolvedValue({
      overrides: [{ cardId: "card_1", card: makeCard(), keepNormalQuantity: 8, keepFoilQuantity: 1, keepHolofoilQuantity: 0 }],
    });
    apiMocks.inventoryDeleteRetentionOverride.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ExtrasForSalePage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Extras for Sale" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Manual Overrides" }));
    expect(await screen.findByText("Mickey Mouse")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(apiMocks.inventoryDeleteRetentionOverride).toHaveBeenCalledWith("card_1");
  });

  it("shows public Extras for Sale tab only when listings exist and direct extras links show empty state", async () => {
    apiMocks.publicGet.mockResolvedValue({
      user: { id: "user_1", username: "jw" },
      profile: { telegram: "john" },
      cards: [],
      stats: { totalUnique: 0, totalCards: 0, setBreakdown: [] },
    });
    apiMocks.publicExtras.mockResolvedValueOnce({ user: { id: "user_1", username: "jw" }, profile: {}, listings: [] });

    const { unmount } = render(
      <MemoryRouter initialEntries={["/collection/user_1?tab=extras"]}>
        <Routes><Route path="/collection/:userId" element={<PublicCollectionPage />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("tab", { name: "Extras for Sale" })).toBeInTheDocument();
    expect(await screen.findByText("No extras are currently listed for sale.")).toBeInTheDocument();
    unmount();

    apiMocks.publicGet.mockResolvedValue({
      user: { id: "user_1", username: "jw" },
      profile: { telegram: "john" },
      cards: [],
      stats: { totalUnique: 0, totalCards: 0, setBreakdown: [] },
    });
    apiMocks.publicExtras.mockResolvedValueOnce({
      user: { id: "user_1", username: "jw" },
      profile: { telegram: "john" },
      listings: [{ id: "listing_1", card: makeCard(), variant: "normal", quantity: 2, referencePrice: 4, note: null }],
    });

    render(
      <MemoryRouter initialEntries={["/collection/user_1"]}>
        <Routes><Route path="/collection/:userId" element={<PublicCollectionPage />} /></Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole("tab", { name: "Extras for Sale" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: "Extras for Sale" }));
    expect(await screen.findByText("Normal × 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Contact seller" }));
    expect(await screen.findByRole("heading", { name: "jw" })).toBeInTheDocument();
  });
});
