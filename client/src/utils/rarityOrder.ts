/**
 * Canonical rarity hierarchy (REQ-POL-7). Mirrored on the server
 * (`server/src/utils/rarityOrder.ts`) and the client; both copies must match
 * Johnathan's exact order. This is intentionally NOT cross-imported from
 * `MasterSetPage.tsx`, which carries a divergent page-local list for the
 * master-set estimate (a different concern, excluded by PRD §7).
 */
export const RARITY_ORDER: readonly string[] = [
  "Common",
  "Uncommon",
  "Rare",
  "Super Rare",
  "Legendary",
  "Epic",
  "Enchanted",
  "Iconic",
  "Special",
] as const;

const RARITY_INDEX = new Map<string, number>(
  RARITY_ORDER.map((rarity, index) => [rarity, index])
);

/**
 * Sorts rarities by canonical hierarchy: known values in RARITY_ORDER sequence
 * first, then any unrecognized value appended after in alphabetical order
 * (stable), so a future unknown rarity never breaks ordering or drops an option.
 */
export function sortRarities(rarities: string[]): string[] {
  const known = rarities.filter((rarity) => RARITY_INDEX.has(rarity));
  const unknown = rarities
    .filter((rarity) => !RARITY_INDEX.has(rarity))
    .sort((a, b) => a.localeCompare(b));

  const ordered = [...known].sort(
    (a, b) => (RARITY_INDEX.get(a) ?? Number.MAX_SAFE_INTEGER) - (RARITY_INDEX.get(b) ?? Number.MAX_SAFE_INTEGER)
  );
  return [...ordered, ...unknown];
}
