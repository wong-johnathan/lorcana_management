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

describe("filterOwnedInventory spares gate (REQ-SPARE-2/3)", () => {
  const spare = makeCard({ id: "spare", name: "Spare Card", color: "Amber" });
  const exact = makeCard({ id: "exact", name: "Exact Card", color: "Amber" });
  const below = makeCard({ id: "below", name: "Below Card", color: "Amber" });

  const entries = [
    makeEntry(spare, { quantity: 6 }), // surplus 2 under 4/1/1
    makeEntry(exact, { quantity: 4 }), // surplus 0
    makeEntry(below, { quantity: 2 }), // surplus 0
  ];

  it("returns only entries with surplus > 0 when spares is ON", () => {
    const surplus = new Map<string, number>([
      ["spare", 2],
      ["exact", 0],
      ["below", 0],
    ]);
    const result = filterOwnedInventory(entries, { spares: "1" }, surplus);
    expect(result.map((e) => e.card.id)).toEqual(["spare"]);
  });

  it("hides an entry whose surplus is exactly 0", () => {
    const surplus = new Map<string, number>([["exact", 0]]);
    expect(filterOwnedInventory([makeEntry(exact)], { spares: "1" }, surplus)).toHaveLength(0);
  });

  it("honours the PASSED map rather than recomputing surplus", () => {
    // spare has quantity 6 (surplus 2 under the policy), but the passed map
    // deliberately says 0 → hidden, proving the gate never recomputes.
    const surplus = new Map<string, number>([["spare", 0]]);
    expect(
      filterOwnedInventory([makeEntry(spare, { quantity: 6 })], { spares: "1" }, surplus)
    ).toHaveLength(0);
  });

  it("hides an entry whose cardId is absent from the surplus map", () => {
    const surplus = new Map<string, number>([["some_other_card", 5]]);
    expect(filterOwnedInventory([makeEntry(spare)], { spares: "1" }, surplus)).toHaveLength(0);
  });

  it("ANDs spares with other active filters", () => {
    const amethystSpare = makeCard({ id: "amethyst", name: "Amethyst Spare", color: "Amethyst" });
    const surplus = new Map<string, number>([
      ["spare", 2],
      ["amethyst", 3],
    ]);
    const result = filterOwnedInventory(
      [makeEntry(spare), makeEntry(amethystSpare, { quantity: 5 })],
      { spares: "1", color: "Amethyst", search: "amethyst" },
      surplus
    );
    expect(result.map((e) => e.card.id)).toEqual(["amethyst"]);
  });

  it("returns [] for a combination that matches no surplus card", () => {
    const surplus = new Map<string, number>([["spare", 2]]);
    expect(filterOwnedInventory(entries, { spares: "1", search: "nonexistent" }, surplus)).toHaveLength(0);
  });

  it("leaves OFF behavior unchanged for absent/empty/other spares values and 2-arg calls", () => {
    expect(filterOwnedInventory(entries, {})).toHaveLength(3);
    expect(filterOwnedInventory(entries, { color: "Amber" }).map((e) => e.card.id)).toEqual([
      "spare",
      "exact",
      "below",
    ]);
    expect(filterOwnedInventory(entries, { spares: "" })).toHaveLength(3);
    expect(filterOwnedInventory(entries, { spares: "0" })).toHaveLength(3);
  });

  it("defensively hides all when spares is ON but no surplus map is passed", () => {
    expect(filterOwnedInventory(entries, { spares: "1" })).toHaveLength(0);
  });
});

describe("ownedFilterOptions", () => {
  it("derives unique, sorted options from owned cards only", () => {
    const entries = [
      makeEntry(makeCard({ id: "a", color: "Ruby", setCode: "2", setName: "Set B", rarity: "Legendary", cardType: "Action", types: ["X", "Y"] })),
      makeEntry(makeCard({ id: "b", color: "Amber", setCode: "1", setName: "Set A", rarity: "Common", cardType: "Character", types: ["Y", "Z"] })),
      makeEntry(makeCard({ id: "c", color: "Ruby", setCode: "2", setName: "Set B", rarity: "Legendary", cardType: "Action", types: ["X"] }), {
        quantity: 0,
        foilQuantity: 0,
        holofoilQuantity: 0,
      }),
    ];

    const options = ownedFilterOptions(entries);
    expect(options.colors).toEqual(["Amber", "Ruby"]);
    expect(options.sets).toEqual(["Set A", "Set B"]);
    expect(options.rarities).toEqual(["Common", "Legendary"]);
    expect(options.cardTypes).toEqual(["Action", "Character"]);
    expect(options.types).toEqual(["X", "Y", "Z"]);
  });

  it("orders sets by numeric release order, not alphabetically (REQ-POL-6)", () => {
    const entries = [
      makeEntry(makeCard({ id: "a", setCode: "2", setName: "Rise of the Floodborn" })),
      makeEntry(makeCard({ id: "b", setCode: "1", setName: "The First Chapter" })),
      makeEntry(makeCard({ id: "c", setCode: "13", setName: "Attack of the Vine!" })),
      makeEntry(makeCard({ id: "d", setCode: "Q1", setName: "Illumineer's Quest" })),
    ];

    const options = ownedFilterOptions(entries);
    expect(options.sets[0]).toBe("The First Chapter");
    // Numeric setCode order (Q1 → 1 sorts early, matching the server rule);
    // alphabetical order would put "Attack of the Vine!" first.
    expect(options.sets).toEqual([
      "The First Chapter",
      "Illumineer's Quest",
      "Rise of the Floodborn",
      "Attack of the Vine!",
    ]);
  });

  it("orders rarities by canonical hierarchy with unknowns appended (REQ-POL-7)", () => {
    const entries = [
      makeEntry(makeCard({ id: "a", rarity: "Special" })),
      makeEntry(makeCard({ id: "b", rarity: "Legendary" })),
      makeEntry(makeCard({ id: "c", rarity: "Common" })),
      makeEntry(makeCard({ id: "d", rarity: "Enchanted" })),
    ];

    const options = ownedFilterOptions(entries);
    expect(options.rarities[0]).toBe("Common");
    expect(options.rarities[options.rarities.length - 1]).toBe("Special");
    expect(options.rarities).toEqual(["Common", "Legendary", "Enchanted", "Special"]);
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
