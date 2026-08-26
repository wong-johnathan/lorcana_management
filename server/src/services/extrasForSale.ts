export type InventoryVariant = "normal" | "foil" | "holofoil";

export interface InventoryPolicyLike {
  keepNormalQuantity: number;
  keepFoilQuantity: number;
  keepHolofoilQuantity: number;
  autoSuggestExtras?: boolean;
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

export interface CardFinishInfo {
  foilTypes: string[];
}

export interface PriceInfo {
  variant: string;
  marketPrice: number | null;
}

export const DEFAULT_INVENTORY_POLICY: InventoryPolicyLike = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
  autoSuggestExtras: true,
};

const HOLOFOIL_FOIL_TYPES = new Set([
  "CalendarWave",
  "FreeForm1",
  "FreeForm2",
  "Glitter",
  "Lava",
  "Lore",
  "Magma",
  "RainbowPillars",
  "Satin",
  "SeaWave",
  "Tempest",
  "VerticalWave",
]);

const REFERENCE_PRICE_VARIANTS: Record<InventoryVariant, string[]> = {
  normal: ["Normal"],
  foil: ["Foil", "Cold Foil"],
  holofoil: ["Holofoil", "Cold Foil", "Foil"],
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

export function publicQuantityForListing(
  desiredQuantity: number,
  currentExtraQuantity: number
): number {
  return Math.max(0, Math.min(desiredQuantity, currentExtraQuantity));
}

export function referencePriceForVariant(
  prices: PriceInfo[],
  variant: InventoryVariant
): number | null {
  const aliases = REFERENCE_PRICE_VARIANTS[variant];
  const price = aliases
    .map((alias) => prices.find((candidate) => candidate.variant.toLowerCase() === alias.toLowerCase()))
    .find((candidate): candidate is PriceInfo => Boolean(candidate));
  return price?.marketPrice ?? null;
}

export function availableInventoryVariants(card: CardFinishInfo): Set<InventoryVariant> {
  const foilTypes = card.foilTypes ?? [];
  const variants = new Set<InventoryVariant>();

  if (foilTypes.length === 0 || foilTypes.includes("None")) variants.add("normal");
  if (foilTypes.includes("Silver")) variants.add("foil");
  if (foilTypes.some((type) => HOLOFOIL_FOIL_TYPES.has(type))) variants.add("holofoil");

  return variants;
}

export function isInventoryVariantAvailable(
  card: CardFinishInfo,
  variant: InventoryVariant
): boolean {
  return availableInventoryVariants(card).has(variant);
}
