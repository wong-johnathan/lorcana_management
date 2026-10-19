import { describe, expect, it } from "vitest";
import type { Card, InventoryEntry, InventoryPolicy } from "../types";
import {
  filterOwnedInventory,
  isOwnedEntry,
  ownedFilterOptions,
  surplusByCardId,
} from "../utils/listingPicker";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
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
    ...overrides,
  };
}

function makeEntry(
  card: Card,
  overrides: Partial<InventoryEntry> = {}
): InventoryEntry {
  return {
    id: `inv_${card.id}`,
    userId: "u1",
    cardId: card.id,
    quantity: 1,
    foilQuantity: 0,
    holofoilQuantity: 0,
    card,
    ...overrides,
  };
}

const policy: InventoryPolicy = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
};

describe("isOwnedEntry", () => {
  it("treats any non-zero total across variants as owned", () => {
    expect(isOwnedEntry(makeEntry(makeCard({ id: "a" }), { quantity: 1 }))).toBe(true);
    expect(
      isOwnedEntry(makeEntry(makeCard({ id: "b" }), { quantity: 0, foilQuantity: 1 }))
    ).toBe(true);
    expect(
      isOwnedEntry(makeEntry(makeCard({ id: "c" }), { quantity: 0, holofoilQuantity: 1 }))
    ).toBe(true);
  });

  it("treats a zero total as unowned", () => {
    expect(
      isOwnedEntry(makeEntry(makeCard({ id: "d" }), { quantity: 0, foilQuantity: 0, holofoilQuantity: 0 }))
    ).toBe(false);
  });
});

describe("filterOwnedInventory", () => {
  const elsa = makeCard({ id: "elsa", name: "Elsa, Snow Queen", subtitle: "Ice Queen", color: "Amethyst", setName: "The First Chapter", rarity: "Legendary" });
  const mickey = makeCard({ id: "mickey", name: "Mickey Mouse", subtitle: "Brave Little Tailor", color: "Amber", setName: "Rise of the Floodborn", rarity: "Common" });
  const ariel = makeCard({ id: "ariel", name: "Ariel", subtitle: "Whoseit Collector", color: "Sapphire", setName: "The First Chapter", rarity: "Rare" });

  const entries = [
    makeEntry(elsa, { quantity: 3 }),
    makeEntry(mickey, { quantity: 2 }),
    makeEntry(ariel, { quantity: 1 }),
    // Zero-count entry must never surface, regardless of filters.
    makeEntry(makeCard({ id: "zero", name: "Zero Count", subtitle: "", color: "Amber", setName: "The First Chapter", rarity: "Common" }), {
      quantity: 0,
      foilQuantity: 0,
      holofoilQuantity: 0,
    }),
  ];

  it("returns all owned entries for an empty filter", () => {
    expect(filterOwnedInventory(entries, {})).toHaveLength(3);
  });

  it("hides zero-count entries even when they match the filter", () => {
    const result = filterOwnedInventory(entries, { color: "Amber" });
    expect(result.map((e) => e.card.id)).toEqual(["mickey"]);
  });

  it("matches search against name case-insensitively", () => {
    expect(filterOwnedInventory(entries, { search: "ELSA" }).map((e) => e.card.id)).toEqual(["elsa"]);
  });

  it("matches search against subtitle case-insensitively", () => {
    expect(filterOwnedInventory(entries, { search: "tailor" }).map((e) => e.card.id)).toEqual(["mickey"]);
  });

  it("matches color multi-select", () => {
    const result = filterOwnedInventory(entries, { color: "Amber,Sapphire" });
    expect(result.map((e) => e.card.id).sort()).toEqual(["ariel", "mickey"]);
  });

  it("matches set multi-select", () => {
    const result = filterOwnedInventory(entries, { set: "The First Chapter" });
    expect(result.map((e) => e.card.id).sort()).toEqual(["ariel", "elsa"]);
  });

  it("matches rarity multi-select", () => {
    const result = filterOwnedInventory(entries, { rarity: "Legendary,Rare" });
    expect(result.map((e) => e.card.id).sort()).toEqual(["ariel", "elsa"]);
  });

  it("combines search + color + set + rarity with AND semantics", () => {
    const result = filterOwnedInventory(entries, {
      search: "snow",
      color: "Amethyst",
      set: "The First Chapter",
      rarity: "Legendary",
    });
    expect(result.map((e) => e.card.id)).toEqual(["elsa"]);

    // A conflicting rarity yields nothing.
    expect(
      filterOwnedInventory(entries, { search: "snow", color: "Amethyst", rarity: "Common" })
    ).toHaveLength(0);
  });

  it("ignores unknown filter keys", () => {
    expect(filterOwnedInventory(entries, { sort: "price_asc" })).toHaveLength(3);
  });

  it("filters by cost with OR-within semantics", () => {
    const cards = [
      makeEntry(makeCard({ id: "c0", inkCost: 0 })),
      makeEntry(makeCard({ id: "c5", inkCost: 5 })),
      makeEntry(makeCard({ id: "c12", inkCost: 12 })),
    ];
    expect(filterOwnedInventory(cards, { cost: "0,5" }).map((e) => e.card.id).sort()).toEqual(["c0", "c5"]);
    expect(filterOwnedInventory(cards, { cost: "12" }).map((e) => e.card.id)).toEqual(["c12"]);
    expect(filterOwnedInventory(cards, { cost: "bogus,-1" })).toHaveLength(0);
    expect(filterOwnedInventory(cards, { cost: "" })).toHaveLength(3);
  });

  it("filters by inkable tri-state", () => {
    const cards = [
      makeEntry(makeCard({ id: "ink", inkable: true })),
      makeEntry(makeCard({ id: "nonink", inkable: false })),
    ];
    expect(filterOwnedInventory(cards, { inkable: "inkable" }).map((e) => e.card.id)).toEqual(["ink"]);
    expect(filterOwnedInventory(cards, { inkable: "non-inkable" }).map((e) => e.card.id)).toEqual(["nonink"]);
    expect(filterOwnedInventory(cards, { inkable: "" })).toHaveLength(2);
    expect(filterOwnedInventory(cards, { inkable: "bogus" })).toHaveLength(2);
  });

  it("filters by card type including the synthetic Song type", () => {
    const cards = [
      makeEntry(makeCard({ id: "song", cardType: "Action", types: ["Song"] })),
      makeEntry(makeCard({ id: "action", cardType: "Action", types: ["Hero"] })),
      makeEntry(makeCard({ id: "char", cardType: "Character", types: ["Hero"] })),
    ];
    expect(filterOwnedInventory(cards, { cardType: "Action" }).map((e) => e.card.id).sort()).toEqual(["action", "song"]);
    expect(filterOwnedInventory(cards, { cardType: "Song" }).map((e) => e.card.id)).toEqual(["song"]);
    expect(filterOwnedInventory(cards, { cardType: "Character" }).map((e) => e.card.id)).toEqual(["char"]);
    // Song matches Action + Song subtype only — not a non-Song Action, not a Character.
    const songMatches = filterOwnedInventory(cards, { cardType: "Song" });
    expect(songMatches.every((e) => e.card.cardType === "Action" && e.card.types.includes("Song"))).toBe(true);
  });

  it("filters by classification with OR-within semantics", () => {
    const cards = [
      makeEntry(makeCard({ id: "a", types: ["Hero", "Song"] })),
      makeEntry(makeCard({ id: "b", types: ["Villain"] })),
      makeEntry(makeCard({ id: "c", types: ["Hero", "Princess"] })),
    ];
    expect(filterOwnedInventory(cards, { subtype: "Hero" }).map((e) => e.card.id).sort()).toEqual(["a", "c"]);
    expect(filterOwnedInventory(cards, { subtype: "Villain,Song" }).map((e) => e.card.id).sort()).toEqual(["a", "b"]);
  });

  it("combines new filters with AND across filters", () => {
    const cards = [
      makeEntry(makeCard({ id: "hit", inkCost: 5, inkable: true, cardType: "Action", types: ["Song"] })),
      makeEntry(makeCard({ id: "wrongCost", inkCost: 6, inkable: true, cardType: "Action", types: ["Song"] })),
      makeEntry(makeCard({ id: "wrongInkable", inkCost: 5, inkable: false, cardType: "Action", types: ["Song"] })),
      makeEntry(makeCard({ id: "wrongType", inkCost: 5, inkable: true, cardType: "Character", types: ["Song"] })),
    ];
    const result = filterOwnedInventory(cards, {
      cost: "5",
      inkable: "inkable",
      cardType: "Song",
      subtype: "Song",
    });
    expect(result.map((e) => e.card.id)).toEqual(["hit"]);
  });
});

describe("ownedFilterOptions", () => {
  it("derives unique, sorted options from owned cards only", () => {
    const entries = [
      makeEntry(makeCard({ id: "a", color: "Ruby", setName: "Set B", rarity: "Rare", cardType: "Action", types: ["X", "Y"] })),
      makeEntry(makeCard({ id: "b", color: "Amber", setName: "Set A", rarity: "Common", cardType: "Character", types: ["Y", "Z"] })),
      makeEntry(makeCard({ id: "c", color: "Ruby", setName: "Set B", rarity: "Rare", cardType: "Action", types: ["X"] }), {
        quantity: 0,
        foilQuantity: 0,
        holofoilQuantity: 0,
      }),
    ];

    const options = ownedFilterOptions(entries);
    expect(options.colors).toEqual(["Amber", "Ruby"]);
    expect(options.sets).toEqual(["Set A", "Set B"]);
    expect(options.rarities).toEqual(["Common", "Rare"]);
    expect(options.cardTypes).toEqual(["Action", "Character"]);
    expect(options.types).toEqual(["X", "Y", "Z"]);
  });

  it("returns empty arrays for an empty collection", () => {
    expect(ownedFilterOptions([])).toEqual({
      colors: [],
      sets: [],
      rarities: [],
      cardTypes: [],
      types: [],
      costs: [],
      inkable: ["inkable", "non-inkable"],
    });
  });

  it("skips empty/undefined optional fields and types", () => {
    const entries = [
      makeEntry(
        makeCard({
          id: "a",
          color: "",
          setName: "",
          rarity: "",
          cardType: "",
          types: undefined as unknown as string[],
        })
      ),
    ];
    const options = ownedFilterOptions(entries);
    expect(options.colors).toEqual([]);
    expect(options.sets).toEqual([]);
    expect(options.rarities).toEqual([]);
    expect(options.cardTypes).toEqual([]);
    expect(options.types).toEqual([]);
  });

  it("derives distinct ascending cost options from owned cards only", () => {
    const entries = [
      makeEntry(makeCard({ id: "a", inkCost: 5 })),
      makeEntry(makeCard({ id: "b", inkCost: 0 })),
      makeEntry(makeCard({ id: "c", inkCost: 5 })),
      makeEntry(makeCard({ id: "d", inkCost: 12 }), {
        quantity: 0,
        foilQuantity: 0,
        holofoilQuantity: 0,
      }),
    ];
    const options = ownedFilterOptions(entries);
    expect(options.costs).toEqual([0, 5]);
    expect(options.inkable).toEqual(["inkable", "non-inkable"]);
  });

  it("appends Song to card type options only when an owned Action card carries Song", () => {
    const entries = [
      makeEntry(makeCard({ id: "a", cardType: "Character", types: ["Hero"] })),
      makeEntry(makeCard({ id: "b", cardType: "Action", types: ["Song"] })),
    ];
    expect(ownedFilterOptions(entries).cardTypes).toEqual(["Action", "Character", "Song"]);

    const noSong = ownedFilterOptions([
      makeEntry(makeCard({ id: "c", cardType: "Action", types: ["Hero"] })),
    ]);
    expect(noSong.cardTypes).toEqual(["Action"]);
  });
});

describe("surplusByCardId", () => {
  it("sums surplus across all three variants", () => {
    const entry = makeEntry(makeCard({ id: "card_1" }), {
      quantity: 6, // 6 - 4 = 2
      foilQuantity: 3, // 3 - 1 = 2
      holofoilQuantity: 2, // 2 - 1 = 1
    });
    const map = surplusByCardId([entry], policy);
    expect(map.get("card_1")).toBe(5);
  });

  it("caps each variant at its keep policy (no negative contribution)", () => {
    const entry = makeEntry(makeCard({ id: "card_1" }), {
      quantity: 1,
      foilQuantity: 0,
      holofoilQuantity: 5,
    });
    const map = surplusByCardId([entry], policy);
    // normal: max(0, 1-4)=0, foil: max(0, 0-1)=0, holofoil: max(0, 5-1)=4
    expect(map.get("card_1")).toBe(4);
  });

  it("returns 0 when owned equals keep (boundary)", () => {
    const entry = makeEntry(makeCard({ id: "card_1" }), {
      quantity: 4,
      foilQuantity: 1,
      holofoilQuantity: 1,
    });
    const map = surplusByCardId([entry], policy);
    expect(map.get("card_1")).toBe(0);
  });

  it("returns 0 for every card when policy is null", () => {
    const entry = makeEntry(makeCard({ id: "card_1" }), { quantity: 99, foilQuantity: 99, holofoilQuantity: 99 });
    const map = surplusByCardId([entry], null);
    expect(map.get("card_1")).toBe(0);
  });

  it("skips unowned entries entirely", () => {
    const owned = makeEntry(makeCard({ id: "owned" }), { quantity: 10 });
    const unowned = makeEntry(makeCard({ id: "unowned" }), {
      quantity: 0,
      foilQuantity: 0,
      holofoilQuantity: 0,
    });
    const map = surplusByCardId([owned, unowned], policy);
    expect(map.has("owned")).toBe(true);
    expect(map.has("unowned")).toBe(false);
  });
});
