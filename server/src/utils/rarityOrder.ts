/**
 * Canonical rarity hierarchy (REQ-POL-7, locked by Johnathan's list). Known
 * values sort in this exact sequence; anything unrecognized is appended after
 * in alphabetical order so a future unknown rarity never breaks ordering or
 * drops the option. Mirrored on the client in `client/src/utils/rarityOrder.ts`.
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
];

export function sortRarities(rarities: string[]): string[] {
  const known = RARITY_ORDER.filter((rarity) => rarities.includes(rarity));
  const unknown = rarities
    .filter((rarity) => !RARITY_ORDER.includes(rarity))
    .sort();
  return [...known, ...unknown];
}
