import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVENTORY_POLICY,
  calculateExtras,
  calculateVariantExtra,
  resolveKeepCounts,
} from "../src/services/inventoryPolicy.js";

describe("inventory keep policy", () => {
  it("exposes sensible defaults", () => {
    expect(DEFAULT_INVENTORY_POLICY).toEqual({
      keepNormalQuantity: 4,
      keepFoilQuantity: 1,
      keepHolofoilQuantity: 1,
    });
  });

  it("falls back to the policy when a card has no override", () => {
    const policy = { keepNormalQuantity: 4, keepFoilQuantity: 2, keepHolofoilQuantity: 3 };

    expect(resolveKeepCounts(policy, null)).toEqual({
      quantity: 4,
      foilQuantity: 2,
      holofoilQuantity: 3,
    });
    expect(resolveKeepCounts(policy, undefined)).toEqual({
      quantity: 4,
      foilQuantity: 2,
      holofoilQuantity: 3,
    });
    expect(resolveKeepCounts(policy, {})).toEqual({
      quantity: 4,
      foilQuantity: 2,
      holofoilQuantity: 3,
    });
  });

  it("prefers per-card overrides, including an explicit keep-zero", () => {
    const policy = { keepNormalQuantity: 4, keepFoilQuantity: 2, keepHolofoilQuantity: 3 };

    expect(resolveKeepCounts(policy, { keepNormalQuantity: 0, keepFoilQuantity: 1 })).toEqual({
      quantity: 0,
      foilQuantity: 1,
      holofoilQuantity: 3,
    });
  });

  it("never reports a negative surplus", () => {
    expect(calculateVariantExtra(5, 2)).toBe(3);
    expect(calculateVariantExtra(2, 2)).toBe(0);
    expect(calculateVariantExtra(1, 4)).toBe(0);
  });

  it("computes surplus per variant", () => {
    expect(
      calculateExtras(
        { quantity: 6, foilQuantity: 1, holofoilQuantity: 0 },
        { quantity: 4, foilQuantity: 2, holofoilQuantity: 1 }
      )
    ).toEqual({ quantity: 2, foilQuantity: 0, holofoilQuantity: 0 });
  });
});
