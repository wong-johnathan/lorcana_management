import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  areVariantsConsistent,
  buildProductIndex,
  canonicalRarity,
  matchFallbackCards,
  normalizeCardName,
  normalizeProductName,
  normalizeToken,
  parseCollectorNumber,
  resolveFallbackTcgPlayerIds,
  type FallbackCard,
  type FallbackMatchResult,
  type TcgcsvProduct,
} from "../src/services/tcgPlayerIdMatcher.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

// Fixtures extracted read-only from the approved-design evidence:
//   upstream_set14.json              <- 257 cards of setCode "14" from
//                                      evidence/upstream_allCards.json
//   tcgcsv_group24740_products.json  <- 265 products of group 24740 from
//                                      evidence/hc_products.json
import upstreamSet14 from "./fixtures/hyperiaCity/upstream_set14.json";
import groupProductsFixture from "./fixtures/hyperiaCity/tcgcsv_group24740_products.json";

const ALLOWLISTED_SET = "Hyperia City";

function card(overrides: Partial<FallbackCard> & { id: string }): FallbackCard {
  return {
    tcgPlayerId: null,
    setName: ALLOWLISTED_SET,
    cardNumber: "1/204 • EN • 14",
    name: "Fru Fru",
    subtitle: "VIP Guest",
    rarity: "Common",
    foilTypes: ["None", "Silver"],
    ...overrides,
  };
}

function product(
  overrides: Partial<TcgcsvProduct> & { productId: number }
): TcgcsvProduct {
  return {
    groupId: 24740,
    name: "Fru Fru - VIP Guest",
    extendedData: [
      { name: "Number", value: "1/204" },
      { name: "Rarity", value: "Common" },
    ],
    ...overrides,
  };
}

// Maps a raw LorcanaJSON set-14 card (from the fixture) into the structural
// shape the matcher reads from persisted Card records.
function toFallbackCard(raw: any): FallbackCard {
  return {
    id: String(raw.id),
    tcgPlayerId: raw.externalLinks?.tcgPlayerId ?? null,
    setName: ALLOWLISTED_SET,
    cardNumber: raw.fullIdentifier ?? "",
    name: raw.name ?? "",
    subtitle: raw.version ?? "",
    rarity: raw.rarity ?? "",
    foilTypes: raw.foilTypes ?? [],
  };
}

describe("normalization", () => {
  it("folds case, diacritics, punctuation and whitespace", () => {
    expect(normalizeToken("Héctor Rivera")).toBe("hector rivera");
    expect(normalizeToken("  HÉCTOR   RIVERA  ")).toBe("hector rivera");
    expect(normalizeToken("Mamá Coco")).toBe("mama coco");
  });

  it("folds apostrophes and hyphens into single spaces", () => {
    expect(normalizeToken("Thomas O'Malley")).toBe("thomas o malley");
    expect(normalizeToken("Mim's Malice")).toBe("mim s malice");
    expect(normalizeToken("Magnificent, Marvelous")).toBe("magnificent marvelous");
  });

  it("degrades null/empty subtitle to the bare name (no trailing space token)", () => {
    expect(normalizeCardName("Fru Fru", "VIP Guest")).toBe("fru fru vip guest");
    expect(normalizeCardName("Fru Fru", "")).toBe("fru fru");
    expect(normalizeCardName("Fru Fru", null)).toBe("fru fru");
  });

  it("strips only (Epic)/(Enchanted)/(Iconic) suffixes, not arbitrary parentheses", () => {
    expect(normalizeProductName("Nick Wilde - Providing Backup (Epic)")).toBe(
      "nick wilde providing backup"
    );
    expect(normalizeProductName("Aurora - Delightful Musician (Enchanted)")).toBe(
      "aurora delightful musician"
    );
    expect(normalizeProductName("Mickey Mouse - Best in Town (Iconic)")).toBe(
      "mickey mouse best in town"
    );
    expect(normalizeProductName("Mickey Mouse - Best in Town (Foil)")).toBe(
      "mickey mouse best in town foil"
    );
  });

  it("parses collector numbers with denominators and rejects malformed values", () => {
    expect(parseCollectorNumber("1/204")).toEqual({ number: 1, denominator: "204" });
    expect(parseCollectorNumber("205/204")).toEqual({ number: 205, denominator: "204" });
    expect(parseCollectorNumber("5/RPH")).toEqual({ number: 5, denominator: "RPH" });
    expect(parseCollectorNumber("")).toBeNull();
    expect(parseCollectorNumber("1")).toBeNull();
    expect(parseCollectorNumber("abc")).toBeNull();
  });

  it("maps only the 8 allowed rarity labels through, rejecting Special and None", () => {
    for (const label of [
      "Common",
      "Uncommon",
      "Rare",
      "Super Rare",
      "Legendary",
      "Epic",
      "Enchanted",
      "Iconic",
    ]) {
      expect(canonicalRarity(label)).toBe(label);
    }
    expect(canonicalRarity("  Common  ")).toBe("Common");
    expect(canonicalRarity("Special")).toBeNull();
    expect(canonicalRarity("None")).toBeNull();
    expect(canonicalRarity(null)).toBeNull();
  });
});

describe("variant consistency", () => {
  it("treats foilTypes as a subset of the product's price subTypeNames", () => {
    expect(areVariantsConsistent(["None", "Silver"], ["Normal", "Cold Foil"])).toBe(true);
    expect(areVariantsConsistent(["Satin"], ["Normal"])).toBe(false);
    expect(areVariantsConsistent([], ["Normal"])).toBe(true);
    expect(areVariantsConsistent(["None"], [])).toBe(false);
    expect(areVariantsConsistent(["Lava"], ["Holofoil"])).toBe(true);
    expect(areVariantsConsistent(["Satin", "Silver"], ["Holofoil", "Cold Foil"])).toBe(true);
  });
});

describe("matching ambiguity and false-match prevention", () => {
  it("leaves a card null when the key maps to more than one product", () => {
    const products = [
      product({ productId: 100, name: "Fru Fru - VIP Guest" }),
      product({ productId: 200, name: "Fru Fru - VIP Guest" }),
    ];
    const result = matchFallbackCards([card({ id: "a" })], products);
    expect(result.resolved).toEqual([]);
    expect(result.skipped).toEqual([{ cardId: "a", reason: "ambiguous" }]);
  });

  it("leaves both cards null when two cards share the same key", () => {
    const products = [product({ productId: 100 })];
    const cards = [card({ id: "a" }), card({ id: "b" })];
    const result = matchFallbackCards(cards, products);
    expect(result.resolved).toEqual([]);
    expect(result.skipped).toEqual([
      { cardId: "a", reason: "ambiguous" },
      { cardId: "b", reason: "ambiguous" },
    ]);
  });

  it("leaves a card null when there is no product for its key", () => {
    const result = matchFallbackCards([card({ id: "a" })], []);
    expect(result.resolved).toEqual([]);
    expect(result.skipped).toEqual([{ cardId: "a", reason: "ambiguous" }]);
  });

  it("leaves both cards null when the same productId is claimed twice (injectivity)", () => {
    // Two products share a productId under different keys; two cards resolve to it.
    const products = [
      product({
        productId: 100,
        name: "Alpha",
        extendedData: [
          { name: "Number", value: "1/204" },
          { name: "Rarity", value: "Common" },
        ],
      }),
      product({
        productId: 100,
        name: "Beta",
        extendedData: [
          { name: "Number", value: "2/204" },
          { name: "Rarity", value: "Common" },
        ],
      }),
    ];
    const cards = [
      card({ id: "a", name: "Alpha", subtitle: "", cardNumber: "1/204 • EN • 14" }),
      card({ id: "b", name: "Beta", subtitle: "", cardNumber: "2/204 • EN • 14" }),
    ];
    const result = matchFallbackCards(cards, products);
    expect(result.resolved).toEqual([]);
    expect(result.skipped).toEqual([
      { cardId: "a", reason: "ambiguous" },
      { cardId: "b", reason: "ambiguous" },
    ]);
  });

  it("does not match a card from a non-allowlisted set (set scoping)", () => {
    const products = [product({ productId: 100 })];
    const otherSetCard = card({ id: "a", setName: "The First Chapter" });
    const result = matchFallbackCards([otherSetCard], products);
    expect(result.resolved).toEqual([]);
    expect(result.skipped).toEqual([{ cardId: "a", reason: "excluded" }]);
  });

  it("excludes cards with a non-204 denominator, non-allowlisted rarity, or malformed number", () => {
    const products = [product({ productId: 100 })];
    const rph = card({ id: "rph", cardNumber: "5/RPH • EN • 14", rarity: "Special" });
    const special = card({ id: "special", rarity: "Special" });
    const badNumber = card({ id: "bad", cardNumber: "no-number" });
    const emptyName = card({ id: "empty-name", name: "", subtitle: "" });
    const result = matchFallbackCards([rph, special, badNumber, emptyName], products);
    expect(result.resolved).toEqual([]);
    expect(result.skipped).toEqual([
      { cardId: "rph", reason: "excluded" },
      { cardId: "special", reason: "excluded" },
      { cardId: "bad", reason: "excluded" },
      { cardId: "empty-name", reason: "excluded" },
    ]);
  });

  it("builds a product index keyed on number|denominator|rarity|name, skipping ineligible products", () => {
    const index = buildProductIndex([
      product({ productId: 100 }),
      product({
        productId: 200,
        name: "Sealed Box",
        extendedData: [],
        presaleInfo: { isPresale: true },
      }),
      product({
        productId: 300,
        name: "Insert",
        extendedData: [{ name: "Rarity", value: "None" }],
      }),
      product({
        productId: 400,
        name: "No Number",
        extendedData: [{ name: "Rarity", value: "Common" }],
      }),
      product({
        productId: 500,
        name: "Bad Number",
        extendedData: [
          { name: "Number", value: "abc" },
          { name: "Rarity", value: "Common" },
        ],
      }),
      product({
        productId: 600,
        name: "",
        extendedData: [
          { name: "Number", value: "9/204" },
          { name: "Rarity", value: "Common" },
        ],
      }),
    ]);
    expect(index.size).toBe(1);
    expect(index.get("1|204|Common|fru fru vip guest")).toEqual([100]);
  });
});

describe("integration over Hyperia City fixtures", () => {
  const cards = upstreamSet14.map(toFallbackCard);
  const products = groupProductsFixture as TcgcsvProduct[];
  const result: FallbackMatchResult = matchFallbackCards(cards, products);

  it("resolves exactly 242 cards and excludes exactly the 15 Special cards", () => {
    expect(cards).toHaveLength(257);
    expect(products).toHaveLength(265);
    expect(result.resolved).toHaveLength(242);
    expect(result.skipped).toHaveLength(15);
    expect(result.skipped.every((s) => s.reason === "excluded")).toBe(true);

    const excludedCardIds = new Set(result.skipped.map((s) => s.cardId));
    for (const raw of upstreamSet14) {
      const isSpecial = raw.rarity === "Special";
      expect(excludedCardIds.has(String(raw.id))).toBe(isSpecial);
    }
  });

  it("assigns every resolved productId at most once (injectivity)", () => {
    const seen = new Set<number>();
    for (const match of result.resolved) {
      expect(seen.has(match.productId)).toBe(false);
      seen.add(match.productId);
    }
  });

  it("leaves no product double-claimed by two cards (reverse-claim check)", () => {
    const claims = new Map<number, string[]>();
    for (const match of result.resolved) {
      const list = claims.get(match.productId) ?? [];
      list.push(match.cardId);
      claims.set(match.productId, list);
    }
    for (const [, cardIds] of claims) {
      expect(cardIds).toHaveLength(1);
    }
  });

  it("spot-checks Fru Fru, Héctor Rivera - Street Musician, and Aurora - Delightful Musician", () => {
    const resolved = new Map(result.resolved.map((m) => [m.cardId, m.productId]));
    expect(resolved.get("3266")).toBe(722351); // Fru Fru - VIP Guest, 1/204 Common
    expect(resolved.get("3480")).toBe(722565); // Héctor Rivera - Street Musician (Epic) 215/204
    expect(resolved.get("3488")).toBe(722573); // Aurora - Delightful Musician (Enchanted) 223/204
  });
});

describe("resolveFallbackTcgPlayerIds (DB wrapper)", () => {
  beforeEach(() => {
    resetPrismaMock();
    (prismaMock.card as any).updateMany = vi.fn();
  });

  it("no-ops when the group name is not allowlisted (no card.findMany call)", async () => {
    const result = await resolveFallbackTcgPlayerIds(prismaMock as any, "Other Set", []);
    expect(result).toEqual({ resolved: 0, skipped: 0 });
    expect(prismaMock.card.findMany).not.toHaveBeenCalled();
    expect((prismaMock.card as any).updateMany).not.toHaveBeenCalled();
  });

  it("writes each resolved card via updateMany with a null-guard and returns counts", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce([
      card({ id: "a" }),
      card({ id: "b", name: "Abuelita", subtitle: "Loving Grandmother", cardNumber: "2/204 • EN • 14" }),
    ]);
    (prismaMock.card as any).updateMany.mockResolvedValue({ count: 1 });

    const products = [
      product({ productId: 722351 }),
      product({
        productId: 722352,
        name: "Abuelita - Loving Grandmother",
        extendedData: [
          { name: "Number", value: "2/204" },
          { name: "Rarity", value: "Common" },
        ],
      }),
    ];

    const result = await resolveFallbackTcgPlayerIds(prismaMock as any, ALLOWLISTED_SET, products);

    expect(prismaMock.card.findMany).toHaveBeenCalledWith({
      where: { setName: ALLOWLISTED_SET, tcgPlayerId: null },
    });
    expect((prismaMock.card as any).updateMany).toHaveBeenCalledTimes(2);
    expect((prismaMock.card as any).updateMany).toHaveBeenCalledWith({
      where: { id: "a", tcgPlayerId: null },
      data: { tcgPlayerId: 722351 },
    });
    expect((prismaMock.card as any).updateMany).toHaveBeenCalledWith({
      where: { id: "b", tcgPlayerId: null },
      data: { tcgPlayerId: 722352 },
    });
    expect(result).toEqual({ resolved: 2, skipped: 0 });
  });

  it("skips cards that already have a non-null tcgPlayerId (canonical-wins)", async () => {
    const alreadyMapped = card({ id: "a", tcgPlayerId: 999 });
    const result = matchFallbackCards([alreadyMapped], [product({ productId: 100 })]);
    expect(result.resolved).toEqual([]);
    expect(result.skipped).toEqual([{ cardId: "a", reason: "excluded" }]);
  });
});
