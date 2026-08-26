import type { Card, InventoryVariant } from "../../types";

export const VARIANT_LABELS: Record<InventoryVariant, string> = {
  normal: "Normal",
  foil: "Foil",
  holofoil: "Holofoil",
};

export function cardMatchesQuery(card: Pick<Card, "name" | "subtitle" | "cardNumber">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [card.name, card.subtitle, card.cardNumber].some((field) => (field ?? "").toLowerCase().includes(q));
}

export function formatReferencePrice(value: number | null | undefined): string {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}

export function variantQuantity<T extends { quantity: number; foilQuantity: number; holofoilQuantity: number }>(counts: T, variant: InventoryVariant): number {
  if (variant === "normal") return counts.quantity;
  if (variant === "foil") return counts.foilQuantity;
  return counts.holofoilQuantity;
}
