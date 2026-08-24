import type { Card } from "../types";

export type InventoryVariant = "normal" | "foil" | "holofoil";

export interface InventoryCounts {
  quantity: number;
  foilQuantity: number;
  holofoilQuantity: number;
}

export const INVENTORY_VARIANT_LABELS: Record<InventoryVariant, string> = {
  normal: "Normal",
  foil: "Foil",
  holofoil: "Holofoil",
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

export function availableInventoryVariants(card: Pick<Card, "foilTypes">): InventoryVariant[] {
  const foilTypes = card.foilTypes ?? [];
  const variants: InventoryVariant[] = [];

  if (foilTypes.length === 0 || foilTypes.includes("None")) variants.push("normal");
  if (foilTypes.includes("Silver")) variants.push("foil");
  if (foilTypes.some((type) => HOLOFOIL_FOIL_TYPES.has(type))) variants.push("holofoil");

  return variants;
}

export function isInventoryVariantAvailable(
  card: Pick<Card, "foilTypes">,
  variant: InventoryVariant
): boolean {
  return availableInventoryVariants(card).includes(variant);
}

export function totalInventoryCount(counts: Partial<InventoryCounts>): number {
  return (counts.quantity ?? 0) + (counts.foilQuantity ?? 0) + (counts.holofoilQuantity ?? 0);
}
