import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseCsvParam,
  priceForVariant,
  pricePresenceCondition,
  toPriceField,
  variantsFor,
} from "../src/routes/cards.js";
import {
  availableInventoryVariants,
  marketPriceForVariant,
  parseCount,
  validateRequestedCounts,
} from "../src/routes/inventory.js";
import { compareNullableNumber, marketPriceForVariant as publicMarketPriceForVariant } from "../src/routes/public.js";
import {
  buildPriceSection,
  extractPricesFromSnippet,
  isCardPromo,
  isDifferentVariant,
  parseSearxNGResults,
  stripHtml,
} from "../src/services/analysis.js";
import {
  parseCollectorNumber,
  parseData,
  parseSetNumber,
  upsertCards,
  type LorcanaData,
} from "../src/services/cardSync.js";
import { fetchPriceGroups, syncGroupPrices } from "../src/services/priceSync.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

const fetchMock = vi.fn();

describe("server pure helpers", () => {
  it("parses CSV query params defensively", () => {
    expect(parseCsvParam(" Amber, Ruby ,, Steel ")).toEqual(["Amber", "Ruby", "Steel"]);
    expect(parseCsvParam(123)).toEqual([]);
    expect(parseCsvParam(undefined)).toEqual([]);
  });

  it("normalizes supported and unsupported price fields", () => {
    expect(toPriceField("lowPrice")).toBe("lowPrice");
    expect(toPriceField("marketPrice")).toBe("marketPrice");
    expect(toPriceField("displayPrice")).toBe("marketPrice");
  });

  it("aliases foil price variants consistently for master-set calculations", () => {
    expect(variantsFor("Foil")).toEqual(["Foil", "Cold Foil", "Holofoil"]);
    expect(variantsFor("Normal")).toEqual(["Normal"]);
    expect(pricePresenceCondition("Foil", "midPrice")).toEqual({
      variant: { in: ["Foil", "Cold Foil", "Holofoil"] },
      midPrice: { not: null },
    });
  });

  it("finds variant prices using aliases and reports null reasons", () => {
    const prices = [
      { variant: "Normal", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4 },
      { variant: "Cold Foil", lowPrice: 10, midPrice: 20, highPrice: 30, marketPrice: null },
    ];

    expect(priceForVariant(prices, "Foil", "lowPrice")).toEqual({ value: 10, matchedVariant: "Cold Foil" });
    expect(priceForVariant(prices, "Foil", "marketPrice")).toEqual({ value: null, matchedVariant: "Cold Foil", reason: "null_price" });
    expect(priceForVariant(prices, "Holofoil", "marketPrice")).toEqual({ value: null, reason: "no_price_for_variant" });
  });

  it("derives inventory variants from LorcanaJSON foilTypes", () => {
    expect([...availableInventoryVariants({ foilTypes: [] })]).toEqual(["normal"]);
    expect([...availableInventoryVariants({ foilTypes: ["None", "Silver"] })]).toEqual(["normal", "foil"]);
    expect([...availableInventoryVariants({ foilTypes: ["Lava"] })]).toEqual(["holofoil"]);
    expect([...availableInventoryVariants({ foilTypes: ["None", "Silver", "Magma"] })]).toEqual(["normal", "foil", "holofoil"]);
  });

  it("validates inventory counts and rejects unavailable variants", () => {
    expect(parseCount(undefined, 7)).toBe(7);
    expect(parseCount(0)).toBe(0);
    expect(() => parseCount(-1)).toThrow("Quantities must be non-negative integers");
    expect(() => parseCount(1.5)).toThrow("Quantities must be non-negative integers");
    expect(() => parseCount("1")).toThrow("Quantities must be non-negative integers");

    expect(validateRequestedCounts({ foilTypes: ["None"] }, { quantity: 1 })).toBeNull();
    expect(validateRequestedCounts({ foilTypes: ["None"] }, { foilQuantity: 1 })).toBe("Foil is not available for this card");
    expect(validateRequestedCounts({ foilTypes: ["Silver"] }, { quantity: 1 })).toBe("Normal is not available for this card");
    expect(validateRequestedCounts({ foilTypes: ["Silver"] }, { holofoilQuantity: 1 })).toBe("Holofoil is not available for this card");
  });

  it("calculates inventory/public market prices and null-last sorting", () => {
    const prices = [{ variant: "normal", marketPrice: 1.25 }, { variant: "Cold Foil", marketPrice: 9.5 }];
    expect(marketPriceForVariant(prices, ["Normal"])).toBe(1.25);
    expect(marketPriceForVariant(prices, ["Foil", "Cold Foil"])).toBe(9.5);
    expect(marketPriceForVariant(prices, ["Holofoil"])).toBeNull();
    expect(publicMarketPriceForVariant(prices, ["cold foil"])).toBe(9.5);
    expect(compareNullableNumber(null, 1)).toBe(1);
    expect(compareNullableNumber(1, null)).toBe(-1);
    expect(compareNullableNumber(null, null)).toBe(0);
    expect(compareNullableNumber(2, 5)).toBe(-3);
  });

  it("parses and cleans SearXNG result HTML with fallback patterns", () => {
    const html = `
      <article class="result"><h3><a href="https://example.com/a" class="url_header">Elsa &amp; Snow Queen</a></h3><p class="content">Sold for &lt;$12.00&gt; &nbsp; today</p></article>
      <article class="result"><h3><a href="https://example.com/b">Mickey</a></h3><span class="snippet">Range $3-$5</span></article>`;
    expect(parseSearxNGResults(html)).toEqual([
      { title: "Elsa & Snow Queen", url: "https://example.com/a", content: "Sold for <$12.00>   today" },
      { title: "Mickey", url: "https://example.com/b", content: "Range $3-$5" },
    ]);

    const fallback = `<h2><a href="https://example.com/f">Fallback &#39;Title&#39;</a></h2><h2><a href="/search">SearXNG</a></h2>`;
    expect(parseSearxNGResults(fallback)).toEqual([{ title: "Fallback 'Title'", url: "https://example.com/f", content: "" }]);
    expect(stripHtml("<b>A&amp;B</b>&nbsp;&quot;x&quot;")).toBe('A&B "x"');
  });

  it("extracts unique snippet prices and disambiguates promo variants", () => {
    expect(extractPricesFromSnippet("$1.00 $1.00 $2 - $3 $4.50 to $6.75 $1,234.00")).toEqual([
      "$1.00",
      "$2 - $3",
      "$4.50 to $6.75",
      "$1,234.00",
    ]);
    expect(isCardPromo("6/C2 • EN • P1", "Promo Set")).toBe(true);
    expect(isCardPromo("69/204 • EN • 1", "The First Chapter")).toBe(false);
    expect(isDifferentVariant("challenge promo sold", "Elsa", "69/204 • EN • 1", false)).toBe(true);
    expect(isDifferentVariant("exact 69/204 sold", "Elsa", "69/204 • EN • 1", false)).toBe(false);
    expect(isDifferentVariant("challenge promo sold", "Elsa", "6/C2 • EN • P1", true)).toBe(false);
  });

  it("builds compact prompt price sections", () => {
    expect(buildPriceSection([null])).toBe("No price data found from any source.");
    expect(buildPriceSection([{ source: "eBay", url: "https://e", prices: ["$1", "$2"], rawSnippet: "x".repeat(350) }]))
      .toContain("Prices found in search snippets: $1, $2");
    expect(buildPriceSection([{ source: "TCGPlayer", url: "", prices: [], rawSnippet: "none" }]))
      .toContain("No specific prices found in search snippets.");
  });

  it("parses LorcanaJSON data and card numbers", () => {
    expect(parseData('{"cards":[],"sets":{}}')).toEqual({ cards: [], sets: {} });
    expect(() => parseData("not-json")).toThrow();
    expect(parseSetNumber("SET12")).toBe(12);
    expect(parseSetNumber("PROMO")).toBeNull();
    expect(parseCollectorNumber({ id: 1, name: "A", number: 42 })).toBe(42);
    expect(parseCollectorNumber({ id: 1, name: "A", fullIdentifier: "221/204 • EN • 7" })).toBe(221);
    expect(parseCollectorNumber({ id: 1, name: "A" })).toBeNull();
  });
});

describe("card and price sync services", () => {
  beforeEach(() => {
    resetPrismaMock();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(global, "setTimeout").mockImplementation((handler: TimerHandler) => {
      if (typeof handler === "function") handler();
      return 0 as any;
    });
  });

  it("upserts LorcanaJSON cards, reports progress, and counts skipped/failed rows", async () => {
    prismaMock.card.upsert
      .mockResolvedValueOnce({ id: "db_1" })
      .mockRejectedValueOnce(new Error("db down"));
    const progress = vi.fn();
    const data: LorcanaData = {
      sets: { SET1: { name: "The First Chapter" } },
      cards: [
        {
          id: 100,
          name: "Mickey Mouse",
          version: "Brave Little Tailor",
          subtypes: ["Hero"],
          type: "Character",
          color: "Amber",
          setCode: "SET1",
          rarity: "Legendary",
          cost: 8,
          strength: 5,
          willpower: 5,
          lore: 4,
          abilities: [{ fullText: "Evasive" }],
          fullIdentifier: "1/204 • EN • 1",
          foilTypes: ["None", "Silver"],
          images: { full: "https://img" },
          externalLinks: { tcgPlayerId: 123, cardTraderUrl: "https://ct", cardmarketUrl: "https://cm" },
        },
        { id: 0, name: "Skip" },
        { id: 101, name: "Broken", setCode: "XYZ" },
      ],
    };

    await expect(upsertCards(data, progress)).resolves.toEqual({ seeded: 1, failed: 1 });
    expect(prismaMock.card.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.card.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { externalId: 100 },
      create: expect.objectContaining({ setName: "The First Chapter", setNumber: 1, collectorNumber: 1, tcgPlayerId: 123, abilities: "Evasive" }),
      update: expect.objectContaining({ name: "Mickey Mouse", foilTypes: ["None", "Silver"] }),
    }));
    expect(progress).toHaveBeenCalledTimes(3);
  });

  it("fetches tcgcsv groups with the required User-Agent and rejects bad responses", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ groupId: 7, name: "Set 7" }] }) });
    await expect(fetchPriceGroups()).resolves.toEqual([{ groupId: 7, name: "Set 7" }]);
    expect(fetchMock).toHaveBeenCalledWith("https://tcgcsv.com/tcgplayer/71/groups", { headers: { "User-Agent": "LorcanaInventory/1.0.0" } });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchPriceGroups()).rejects.toThrow("Failed to fetch groups: 503");
  });

  it("syncs tcgcsv prices, replaces stale rows, clears missing product prices, skips unavailable groups, and counts unmatched products", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [
        { productId: 1, name: "Mickey" },
        { productId: 2, name: "Unmatched" },
        { productId: 3, name: "No current price" },
        { productId: 4, name: "All null price" },
      ] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [
        { productId: 1, subTypeName: "Normal", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4 },
        { productId: 1, subTypeName: "Cold Foil", lowPrice: 5, midPrice: 6, highPrice: 7, marketPrice: 8 },
        { productId: 4, subTypeName: "Normal", lowPrice: null, midPrice: null, highPrice: null, marketPrice: null },
      ] }) })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    prismaMock.card.findMany
      .mockResolvedValueOnce([{ id: "card_1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "card_no_price" }])
      .mockResolvedValueOnce([{ id: "card_all_null" }]);
    prismaMock.cardPrice.deleteMany.mockResolvedValue({});
    prismaMock.cardPrice.createMany.mockResolvedValue({});
    prismaMock.card.update.mockResolvedValue({});
    const progress = vi.fn();

    await expect(syncGroupPrices([{ groupId: 10, name: "A" }, { groupId: 11, name: "B" }], progress))
      .resolves.toEqual({ groups: 2, matched: 3, unmatched: 1 });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://tcgcsv.com/tcgplayer/71/10/products", { headers: { "User-Agent": "LorcanaInventory/1.0.0" } });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://tcgcsv.com/tcgplayer/71/10/prices", { headers: { "User-Agent": "LorcanaInventory/1.0.0" } });
    expect(prismaMock.cardPrice.deleteMany).toHaveBeenCalledWith({ where: { cardId: "card_1" } });
    expect(prismaMock.cardPrice.createMany).toHaveBeenCalledWith({ data: [
      { cardId: "card_1", variant: "Normal", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4 },
      { cardId: "card_1", variant: "Cold Foil", lowPrice: 5, midPrice: 6, highPrice: 7, marketPrice: 8 },
    ] });
    expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: "card_1" }, data: { displayPrice: 4 } });
    expect(prismaMock.cardPrice.deleteMany).toHaveBeenCalledWith({ where: { cardId: "card_no_price" } });
    expect(prismaMock.cardPrice.createMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ cardId: "card_no_price" })]),
    }));
    expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: "card_no_price" }, data: { displayPrice: null } });
    expect(prismaMock.cardPrice.deleteMany).toHaveBeenCalledWith({ where: { cardId: "card_all_null" } });
    expect(prismaMock.card.update).toHaveBeenCalledWith({ where: { id: "card_all_null" }, data: { displayPrice: null } });
    expect(progress).toHaveBeenLastCalledWith({ groupName: "B", groupIndex: 2, totalGroups: 2 });
  });
});
