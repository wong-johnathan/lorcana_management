import { describe, expect, it } from "vitest";
import { RARITY_ORDER, sortRarities } from "../src/utils/rarityOrder.js";

describe("RARITY_ORDER (REQ-POL-7)", () => {
  it("matches Johnathan's canonical hierarchy exactly", () => {
    expect(RARITY_ORDER).toEqual([
      "Common",
      "Uncommon",
      "Rare",
      "Super Rare",
      "Legendary",
      "Epic",
      "Enchanted",
      "Iconic",
      "Special",
    ]);
  });
});

describe("sortRarities", () => {
  it("orders known values by the canonical hierarchy, ignoring input order", () => {
    expect(
      sortRarities(["Special", "Common", "Legendary", "Epic", "Super Rare"])
    ).toEqual([
      "Common",
      "Super Rare",
      "Legendary",
      "Epic",
      "Special",
    ]);
  });

  it("appends unknown values after known ones in alphabetical order", () => {
    expect(sortRarities(["Mythic", "Common", "Ancient"])).toEqual([
      "Common",
      "Ancient",
      "Mythic",
    ]);
  });

  it("returns only unknown values alphabetically when nothing is known", () => {
    expect(sortRarities(["Zeta", "Alpha", "Beta"])).toEqual([
      "Alpha",
      "Beta",
      "Zeta",
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(sortRarities([])).toEqual([]);
  });
});
