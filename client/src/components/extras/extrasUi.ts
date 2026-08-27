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

export interface ExtrasFilters {
  query: string;
  sets: string[];
  rarities: string[];
  colors: string[];
}

export const EMPTY_EXTRAS_FILTERS: ExtrasFilters = {
  query: "",
  sets: [],
  rarities: [],
  colors: [],
};

type FilterableCard = Pick<Card, "name" | "subtitle" | "cardNumber" | "setName" | "rarity" | "color">;

export function cardMatchesFilters(card: FilterableCard, filters: ExtrasFilters): boolean {
  if (!cardMatchesQuery(card, filters.query)) return false;
  if (filters.sets.length > 0 && !filters.sets.includes(card.setName)) return false;
  if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;
  if (filters.colors.length > 0 && !filters.colors.includes(card.color)) return false;
  return true;
}

export interface ExtrasFilterOptions {
  sets: string[];
  rarities: string[];
  colors: string[];
}

const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Super Rare", "Legendary", "Enchanted"];

export function deriveExtrasFilterOptions(cards: Array<Pick<Card, "setName" | "rarity" | "color">>): ExtrasFilterOptions {
  const sets = Array.from(new Set(cards.map((c) => c.setName))).sort();
  const colors = Array.from(new Set(cards.map((c) => c.color))).sort();
  const rarities = Array.from(new Set(cards.map((c) => c.rarity))).sort((a, b) => {
    const ia = RARITY_ORDER.indexOf(a);
    const ib = RARITY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return { sets, rarities, colors };
}

export function formatReferencePrice(value: number | null | undefined): string {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}

export const LISTING_CURRENCIES = ["USD", "SGD", "MYR", "EUR", "GBP", "AUD", "CAD", "JPY"] as const;
export type ListingCurrency = (typeof LISTING_CURRENCIES)[number];

export function formatCustomPrice(value: number | null | undefined, currency: string): string {
  if (value == null) return "—";
  if (currency === "USD") return `$${value.toFixed(2)}`;
  return `${currency} ${value.toFixed(2)}`;
}

export function variantQuantity<T extends { quantity: number; foilQuantity: number; holofoilQuantity: number }>(counts: T, variant: InventoryVariant): number {
  if (variant === "normal") return counts.quantity;
  if (variant === "foil") return counts.foilQuantity;
  return counts.holofoilQuantity;
}
