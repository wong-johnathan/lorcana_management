import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVENTORY_POLICY,
  calculateVariantExtra,
  isInventoryVariantAvailable,
  publicQuantityForListing,
  referencePriceForVariant,
  resolveKeepCounts,
} from "../src/services/extrasForSale.js";

describe("extras for sale service", () => {
  it("calculates extras from the default keep policy", () => {
    const keep = resolveKeepCounts(DEFAULT_INVENTORY_POLICY, null);

    expect(keep).toEqual({ quantity: 4, foilQuantity: 1, holofoilQuantity: 1 });
    expect(calculateVariantExtra(7, keep.quantity)).toBe(3);
    expect(calculateVariantExtra(1, keep.foilQuantity)).toBe(0);
    expect(calculateVariantExtra(0, keep.holofoilQuantity)).toBe(0);
  });

  it("allows individual card overrides above defaults and at zero", () => {
    expect(resolveKeepCounts(DEFAULT_INVENTORY_POLICY, { keepNormalQuantity: 8 })).toEqual({
      quantity: 8,
      foilQuantity: 1,
      holofoilQuantity: 1,
    });
    expect(calculateVariantExtra(10, 8)).toBe(2);

    expect(resolveKeepCounts(DEFAULT_INVENTORY_POLICY, {
      keepNormalQuantity: 0,
      keepFoilQuantity: 0,
      keepHolofoilQuantity: 0,
    })).toEqual({ quantity: 0, foilQuantity: 0, holofoilQuantity: 0 });
    expect(calculateVariantExtra(3, 0)).toBe(3);
  });

  it("caps public listing quantities to current extra inventory", () => {
    expect(publicQuantityForListing(5, 2)).toBe(2);
    expect(publicQuantityForListing(2, 5)).toBe(2);
    expect(publicQuantityForListing(2, 0)).toBe(0);
    expect(publicQuantityForListing(0, 5)).toBe(0);
  });

  it("returns reference prices using Lorcana foil aliases", () => {
    const prices = [
      { variant: "Normal", marketPrice: 4 },
      { variant: "Cold Foil", marketPrice: 8 },
      { variant: "Holofoil", marketPrice: null },
    ];

    expect(referencePriceForVariant(prices, "normal")).toBe(4);
    expect(referencePriceForVariant(prices, "foil")).toBe(8);
    expect(referencePriceForVariant(prices, "holofoil")).toBeNull();
    expect(referencePriceForVariant([], "normal")).toBeNull();
  });

  it("checks variant availability from foilTypes", () => {
    expect(isInventoryVariantAvailable({ foilTypes: ["None"] }, "normal")).toBe(true);
    expect(isInventoryVariantAvailable({ foilTypes: ["None"] }, "foil")).toBe(false);
    expect(isInventoryVariantAvailable({ foilTypes: ["Silver"] }, "foil")).toBe(true);
    expect(isInventoryVariantAvailable({ foilTypes: ["Lava"] }, "holofoil")).toBe(true);
    expect(isInventoryVariantAvailable({ foilTypes: ["None", "Silver", "Magma"] }, "holofoil")).toBe(true);
  });
});
