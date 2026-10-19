import { describe, expect, it } from "vitest";
import { RARITY_ORDER, sortRarities } from "../utils/rarityOrder";

describe("rarityOrder", () => {
  it("matches Johnathan's canonical order exactly", () => {
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

  it("sorts known rarities into canonical sequence", () => {
    expect(sortRarities(["Special", "Common", "Rare", "Epic"])).toEqual([
      "Common",
      "Rare",
      "Epic",
      "Special",
    ]);
  });

  it("appends unknown rarities after known ones in alphabetical order", () => {
    expect(sortRarities(["Rare", "Mythic", "Common", "Zeta", "Alpha"])).toEqual([
      "Common",
      "Rare",
      "Alpha",
      "Mythic",
      "Zeta",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(sortRarities([])).toEqual([]);
  });
});
