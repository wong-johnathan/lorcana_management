import type { FilterOptions, InventoryEntry, InventoryPolicy } from "../types";
import { totalInventoryCount } from "./cardVariants";
import { sortRarities } from "./rarityOrder";

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
 * Release order for a set code: leading digits ascending, non-numeric codes
 * sort last (REQ-POL-6). Mirrors the server's `numericSetCode` semantics.
 */
export function numericSetCode(setCode: string): number {
  const match = setCode.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
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
  const costs = splitFilter(filters.cost)
    .map((token) => parseInt(token, 10))
    .filter((n) => Number.isInteger(n));
  const inkable = filters.inkable ?? "";
  const cardTypes = splitFilter(filters.cardType);
  const subtypes = splitFilter(filters.subtype);

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

    if (costs.length > 0 && !costs.includes(card.inkCost)) return false;

    if (inkable === "inkable" && !card.inkable) return false;
    if (inkable === "non-inkable" && card.inkable) return false;

    if (cardTypes.length > 0) {
      const matchesType = cardTypes.includes(card.cardType);
      const matchesSong =
        cardTypes.includes("Song") &&
        card.cardType === "Action" &&
        (card.types ?? []).includes("Song");
      if (!matchesType && !matchesSong) return false;
    }

    if (subtypes.length > 0) {
      const cardTypeList = card.types ?? [];
      if (!subtypes.some((subtype) => cardTypeList.includes(subtype))) return false;
    }

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
  const costs = new Set<number>();
  const setCodeByName = new Map<string, string>();
  let hasSong = false;

  for (const entry of entries) {
    if (!isOwnedEntry(entry)) continue;
    const card = entry.card;
    if (card.color) colors.add(card.color);
    if (card.setName) {
      sets.add(card.setName);
      if (!setCodeByName.has(card.setName)) setCodeByName.set(card.setName, card.setCode);
    }
    if (card.rarity) rarities.add(card.rarity);
    if (card.cardType) cardTypes.add(card.cardType);
    costs.add(card.inkCost);
    for (const type of card.types ?? []) {
      if (type) types.add(type);
    }
    if (card.cardType === "Action" && (card.types ?? []).includes("Song")) {
      hasSong = true;
    }
  }

  const sortedCardTypes = [...cardTypes].sort();
  if (hasSong && !sortedCardTypes.includes("Song")) {
    sortedCardTypes.push("Song");
  }

  return {
    colors: [...colors].sort(),
    sets: [...sets].sort(
      (a, b) =>
        numericSetCode(setCodeByName.get(a) ?? "") -
        numericSetCode(setCodeByName.get(b) ?? "")
    ),
    rarities: sortRarities([...rarities]),
    cardTypes: sortedCardTypes,
    types: [...types].sort(),
    costs: [...costs].sort((a, b) => a - b),
    inkable: ["inkable", "non-inkable"],
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
