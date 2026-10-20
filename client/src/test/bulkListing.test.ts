import { describe, expect, it } from "vitest";
import type {
  Card,
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
  MarketplaceTransaction,
} from "../types";
import { bulkListingCandidates } from "../utils/bulkListing";

/**
 * Candidate maths for bulk listing of normal-printing spares (design §11.1).
 * Every case is pure-helper only: no React, no network.
 */

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: null,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Elsa",
    subtitle: "Snow Queen",
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
    cardNumber: "42",
    foilTypes: ["None", "Silver"],
    imageUrl: "",
    prices: [],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  const card = overrides.card ?? makeCard();
  return {
    id: `inv_${card.id}`,
    userId: "seller_1",
    cardId: card.id,
    quantity: 5,
    foilQuantity: 0,
    holofoilQuantity: 0,
    ...overrides,
    card,
  };
}

function makePolicy(overrides: Partial<InventoryPolicy> = {}): InventoryPolicy {
  return {
    keepNormalQuantity: 2,
    keepFoilQuantity: 1,
    keepHolofoilQuantity: 1,
    ...overrides,
  };
}

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    id: "listing_1",
    sellerId: "seller_1",
    cardId: "card_1",
    variant: "normal",
    quantity: 1,
    priceMinor: 300,
    currency: "SGD",
    condition: null,
    location: "",
    note: null,
    status: "ACTIVE",
    hiddenAt: null,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    card: null,
    seller: null,
    photos: [],
    ...overrides,
  };
}

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
    priceMinor: 300,
    currency: "SGD",
    status: "PENDING_CONFIRMATION",
    completedCause: null,
    cancelledBy: null,
    soldAt: "2026-10-20T00:00:00.000Z",
    confirmedAt: null,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    buyer: { id: "buyer_1", username: "bob" },
    seller: { id: "seller_1", username: "alice" },
    card: { id: "card_1", name: "Elsa", setName: "The First Chapter" },
    ...overrides,
  };
}

function candidates(
  overrides: Partial<Parameters<typeof bulkListingCandidates>[0]> = {}
) {
  return bulkListingCandidates({
    inventory: [],
    policy: makePolicy(),
    ownListings: [],
    pendingTransactions: [],
    filters: { spares: "1" },
    ...overrides,
  });
}

describe("bulkListingCandidates", () => {
  it("computes normal-only spares and never counts foil/holofoil copies", () => {
    const result = candidates({
      inventory: [makeEntry({ quantity: 5, foilQuantity: 4, holofoilQuantity: 3 })],
    });

    expect(result.matches).toHaveLength(1);
    const [candidate] = result.matches;
    expect(candidate.normalSpare).toBe(3);
    expect(candidate.availableEstimate).toBe(5);
    expect(candidate.quantity).toBe(3);
    expect(candidate.capped).toBe(false);
    expect(result.skipped).toHaveLength(0);
  });

  it("skips a card that already has an ACTIVE non-hidden normal listing", () => {
    const result = candidates({
      inventory: [makeEntry()],
      ownListings: [makeListing({ status: "ACTIVE", hiddenAt: null })],
    });

    expect(result.matches).toHaveLength(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({ reason: "already listed" }),
    ]);
  });

  it("skips a card whose only normal listing is CLOSED but still visible (PI-1)", () => {
    const result = candidates({
      inventory: [makeEntry()],
      ownListings: [makeListing({ status: "CLOSED", hiddenAt: null })],
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("already listed");
  });

  it("ignores hidden listings and listings of other variants", () => {
    const result = candidates({
      inventory: [makeEntry()],
      ownListings: [
        makeListing({ id: "hidden", hiddenAt: "2026-10-20T00:00:00.000Z" }),
        makeListing({ id: "foil", variant: "foil" }),
      ],
    });

    expect(result.skipped).toHaveLength(0);
    expect(result.matches).toHaveLength(1);
  });

  it("skips a card when every copy is reserved by a pending sale", () => {
    const result = candidates({
      inventory: [makeEntry({ quantity: 4 })],
      pendingTransactions: [makeTransaction({ quantity: 4 })],
    });

    expect(result.matches).toHaveLength(0);
    expect(result.skipped[0].reason).toBe(
      "no copies available (reserved or listed elsewhere)"
    );
  });

  it("skips a card when reserved copies use up the owned count", () => {
    const result = candidates({
      inventory: [makeEntry({ quantity: 3 })],
      pendingTransactions: [makeTransaction({ quantity: 3 })],
    });

    expect(result.skipped[0].reason).toBe(
      "no copies available (reserved or listed elsewhere)"
    );
  });

  it("prefers 'already listed' when both skip reasons apply", () => {
    const result = candidates({
      inventory: [makeEntry({ quantity: 3 })],
      pendingTransactions: [makeTransaction({ quantity: 5 })],
      ownListings: [makeListing({ hiddenAt: null })],
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("already listed");
  });

  it("never matches a card without a normal variant (AC-BULK-3.5)", () => {
    const card = makeCard({ foilTypes: ["Silver"], rarity: "Legendary" });
    const result = candidates({ inventory: [makeEntry({ card })] });

    expect(result.matches).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.excludedVariantOnlyCount).toBe(0);
  });

  it("counts foil/holofoil-only cards as excluded, and reports the zero case", () => {
    const foilOnly = makeCard({ id: "card_foil", foilTypes: ["None", "Silver"] });
    const excluded = candidates({
      inventory: [
        makeEntry({ card: foilOnly, quantity: 1, foilQuantity: 4, holofoilQuantity: 0 }),
        makeEntry(),
      ],
    });
    expect(excluded.excludedVariantOnlyCount).toBe(1);
    expect(excluded.matches).toHaveLength(1);
    expect(excluded.matches[0].card.id).toBe("card_1");

    const none = candidates({ inventory: [makeEntry()] });
    expect(none.excludedVariantOnlyCount).toBe(0);
  });

  it("caps the quantity at the availability estimate and flags it (RV-9)", () => {
    const result = candidates({
      inventory: [makeEntry({ quantity: 5 })],
      policy: makePolicy({ keepNormalQuantity: 2 }),
      // 3 reserved of 5 owned → availableEstimate 2 < normalSpare 3.
      pendingTransactions: [makeTransaction({ quantity: 3 })],
    });

    expect(result.matches[0].normalSpare).toBe(3);
    expect(result.matches[0].availableEstimate).toBe(2);
    expect(result.matches[0].quantity).toBe(2);
    expect(result.matches[0].capped).toBe(true);
  });

  it("returns no spares when the keep policy is null (defensive)", () => {
    const result = candidates({
      inventory: [makeEntry({ quantity: 9, foilQuantity: 9 })],
      policy: null,
    });

    expect(result.matches).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.excludedVariantOnlyCount).toBe(0);
  });

  it("emits at most one candidate per card, even with duplicate inventory rows", () => {
    const result = candidates({
      inventory: [makeEntry({ id: "inv_a" }), makeEntry({ id: "inv_b" })],
    });

    expect(result.matches).toHaveLength(1);
    const ids = result.matches.map((candidate) => candidate.card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("applies the picker filters but always ignores the spares key", () => {
    const elsa = makeEntry();
    const mickey = makeEntry({
      card: makeCard({ id: "card_2", name: "Mickey Mouse", rarity: "Common", color: "Amber" }),
      quantity: 4,
    });

    const filtered = candidates({
      inventory: [elsa, mickey],
      filters: { spares: "1", rarity: "Common" },
    });
    expect(filtered.matches.map((candidate) => candidate.card.id)).toEqual(["card_2"]);

    const sparesKeyIgnored = candidates({
      inventory: [elsa, mickey],
      filters: { spares: "1" },
    });
    expect(sparesKeyIgnored.matches).toHaveLength(2);
  });

  it("filters reserved quantities by sellerId when one is supplied", () => {
    const otherSeller = makeTransaction({ id: "tx_other", sellerId: "seller_2", quantity: 5 });

    const withoutSeller = candidates({
      inventory: [makeEntry()],
      pendingTransactions: [otherSeller],
    });
    expect(withoutSeller.matches).toHaveLength(0);

    const withSeller = candidates({
      inventory: [makeEntry()],
      pendingTransactions: [otherSeller],
      sellerId: "seller_1",
    });
    expect(withSeller.matches).toHaveLength(1);
    expect(withSeller.matches[0].availableEstimate).toBe(5);
  });

  it("does not mutate its inputs", () => {
    const inventory = [makeEntry()];
    const ownListings = [makeListing({ hiddenAt: null })];
    const snapshot = JSON.stringify({ inventory, ownListings });

    candidates({ inventory, ownListings });

    expect(JSON.stringify({ inventory, ownListings })).toBe(snapshot);
  });
});
