/**
 * Inventory keep-policy maths.
 *
 * Extracted from the removed `extrasForSale` service: the listing/marketplace side is
 * gone, but the "how many copies are surplus beyond my keep policy" calculation is
 * still used by inventory stats, retention overrides and bulk trim.
 */

export type InventoryVariant = "normal" | "foil" | "holofoil";

export interface InventoryPolicyLike {
  keepNormalQuantity: number;
  keepFoilQuantity: number;
  keepHolofoilQuantity: number;
}

export interface RetentionOverrideLike {
  keepNormalQuantity?: number | null;
  keepFoilQuantity?: number | null;
  keepHolofoilQuantity?: number | null;
}

export interface InventoryCounts {
  quantity: number;
  foilQuantity: number;
  holofoilQuantity: number;
}

export const DEFAULT_INVENTORY_POLICY: InventoryPolicyLike = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
};

export function calculateVariantExtra(ownedQuantity: number, keepQuantity: number): number {
  return Math.max(0, ownedQuantity - keepQuantity);
}

export function resolveKeepCounts(
  policy: InventoryPolicyLike,
  override: RetentionOverrideLike | null | undefined
): InventoryCounts {
  return {
    quantity: override?.keepNormalQuantity ?? policy.keepNormalQuantity,
    foilQuantity: override?.keepFoilQuantity ?? policy.keepFoilQuantity,
    holofoilQuantity: override?.keepHolofoilQuantity ?? policy.keepHolofoilQuantity,
  };
}

export function calculateExtras(owned: InventoryCounts, keep: InventoryCounts): InventoryCounts {
  return {
    quantity: calculateVariantExtra(owned.quantity, keep.quantity),
    foilQuantity: calculateVariantExtra(owned.foilQuantity, keep.foilQuantity),
    holofoilQuantity: calculateVariantExtra(owned.holofoilQuantity, keep.holofoilQuantity),
  };
}
