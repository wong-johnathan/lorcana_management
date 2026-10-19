import type { FilterOptions, InventoryEntry, InventoryPolicy } from "../types";
import { totalInventoryCount } from "./cardVariants";

/**
 * Pure helpers for the two-step listing picker (REQ-UX-2..4). All filtering is
 * client-side over the inventory array already held by the sell page — no
 * network call per keystroke/filter (AC-UX-2.3 / AC-UX-4.4).
 */

function splitFilter(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

/** A card is "owned" when its total count across variants is > 0 (AC-UX-2.1). */
export function isOwnedEntry(entry: InventoryEntry): boolean {
  return totalInventoryCount(entry) > 0;
}

/**
 * Owned-only entries filtered by search (name OR subtitle, case-insensitive)
 * plus color/set/rarity multi-selects, combined with AND semantics. An empty
 * filter object returns every owned entry.
 */
export function filterOwnedInventory(
  entries: InventoryEntry[],
  filters: Record<string, string>
): InventoryEntry[] {
  const search = (filters.search ?? "").trim().toLowerCase();
  const colors = splitFilter(filters.color);
  const sets = splitFilter(filters.set);
  const rarities = splitFilter(filters.rarity);

  return entries.filter((entry) => {
    if (!isOwnedEntry(entry)) return false;
    const card = entry.card;

    if (search) {
      const nameMatch = card.name.toLowerCase().includes(search);
      const subtitleMatch = card.subtitle.toLowerCase().includes(search);
      if (!nameMatch && !subtitleMatch) return false;
    }
    if (colors.length > 0 && !colors.includes(card.color)) return false;
    if (sets.length > 0 && !sets.includes(card.setName)) return false;
    if (rarities.length > 0 && !rarities.includes(card.rarity)) return false;

    return true;
  });
}

/**
 * Filter options constrained to the values present on OWNED cards only
 * (design OQ-1 / A4), each sorted for stable rendering.
 */
export function ownedFilterOptions(entries: InventoryEntry[]): FilterOptions {
  const colors = new Set<string>();
  const sets = new Set<string>();
  const rarities = new Set<string>();
  const cardTypes = new Set<string>();
  const types = new Set<string>();

  for (const entry of entries) {
    if (!isOwnedEntry(entry)) continue;
    const card = entry.card;
    if (card.color) colors.add(card.color);
    if (card.setName) sets.add(card.setName);
    if (card.rarity) rarities.add(card.rarity);
    if (card.cardType) cardTypes.add(card.cardType);
    for (const type of card.types ?? []) {
      if (type) types.add(type);
    }
  }

  return {
    colors: [...colors].sort(),
    sets: [...sets].sort(),
    rarities: [...rarities].sort(),
    cardTypes: [...cardTypes].sort(),
    types: [...types].sort(),
  };
}

/**
 * Total surplus per card across variants using the BASE keep policy only
 * (design OQ-3 / A2): Σ max(0, owned_variant − keep_variant). A null policy
 * yields 0 surplus for every card (no badge).
 */
export function surplusByCardId(
  entries: InventoryEntry[],
  policy: InventoryPolicy | null
): Map<string, number> {
  const map = new Map<string, number>();

  for (const entry of entries) {
    if (!isOwnedEntry(entry)) continue;
    if (!policy) {
      map.set(entry.cardId, 0);
      continue;
    }
    const normal = Math.max(0, entry.quantity - policy.keepNormalQuantity);
    const foil = Math.max(0, entry.foilQuantity - policy.keepFoilQuantity);
    const holofoil = Math.max(0, entry.holofoilQuantity - policy.keepHolofoilQuantity);
    map.set(entry.cardId, normal + foil + holofoil);
  }

  return map;
}
