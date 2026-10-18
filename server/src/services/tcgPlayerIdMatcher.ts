// Fallback TCGPlayer-ID matcher for cards that LorcanaJSON has not yet mapped
// (currently the Hyperia City set). Pure, self-contained: it declares its own
// structural input types and does not import from priceSync.ts (one-directional
// dependency priceSync -> matcher).

export interface TcgcsvProduct {
  productId: number;
  name: string;
  groupId: number;
  extendedData: { name: string; value: string }[];
  presaleInfo?: { isPresale?: boolean };
}

export interface FallbackCard {
  id: string;
  tcgPlayerId: number | null;
  setName: string;
  cardNumber: string;
  name: string;
  subtitle: string;
  rarity: string;
  foilTypes: string[];
}

export type FallbackSkipReason = "excluded" | "ambiguous";

export interface TcgcsvPriceRow {
  productId: number;
  subTypeName: string;
}

export interface FallbackMatchResult {
  resolved: { cardId: string; productId: number }[];
  skipped: { cardId: string; reason: FallbackSkipReason }[];
}

interface FallbackPrismaClient {
  card: {
    findMany(args: {
      where: { setName: string; tcgPlayerId: null };
    }): Promise<FallbackCard[]>;
    updateMany(args: {
      where: { id: string; tcgPlayerId: null };
      data: { tcgPlayerId: number };
    }): Promise<{ count: number }>;
  };
}

const FALLBACK_MATCH_SET_NAMES = ["Hyperia City"];

const ALLOWED_RARITIES = new Set([
  "Common",
  "Uncommon",
  "Rare",
  "Super Rare",
  "Legendary",
  "Epic",
  "Enchanted",
  "Iconic",
]);

// Premium foil treatments that map to the TCGCSV "Holofoil" price variant.
// Mirrors client/src/utils/cardVariants.ts HOLOFOIL_FOIL_TYPES, plus "Tinsel"
// (used by the Hyperia City Enchanted cards per the approved design mapping).
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
  "Tinsel",
  "VerticalWave",
]);

export function normalizeToken(input: string): string {
  return input
    .normalize("NFC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCardName(name: string, subtitle: string | null): string {
  return normalizeToken(`${name} ${subtitle ?? ""}`);
}

export function normalizeProductName(raw: string): string {
  return normalizeToken(raw.replace(/\s*\((Epic|Enchanted|Iconic)\)\s*$/i, ""));
}

export function parseCollectorNumber(
  value: string
): { number: number; denominator: string } | null {
  const match = value.match(/^\s*(\d+)\s*\/\s*([A-Za-z0-9]+)/);
  if (!match) return null;
  return { number: Number(match[1]), denominator: match[2] };
}

export function canonicalRarity(label: string | null): string | null {
  if (label == null) return null;
  const trimmed = label.trim();
  return ALLOWED_RARITIES.has(trimmed) ? trimmed : null;
}

// Soft, non-gating consistency check (see design "Variant mapping"): the
// card's available variants (derived from foilTypes) must be a subset of the
// product's price subTypeNames. A mismatch is a WARN-level signal only; it never
// blocks a match, because name+number+rarity evidence is stronger than variant drift.
export function areVariantsConsistent(foilTypes: string[], subTypeNames: string[]): boolean {
  const expected = new Set<string>();
  if (foilTypes.length === 0 || foilTypes.includes("None")) expected.add("Normal");
  if (foilTypes.includes("Silver")) expected.add("Cold Foil");
  if (foilTypes.some((type) => HOLOFOIL_FOIL_TYPES.has(type))) expected.add("Holofoil");

  const available = new Set(subTypeNames);
  for (const name of expected) {
    if (!available.has(name)) return false;
  }
  return true;
}

export interface FallbackVariantMismatch {
  cardId: string;
  productId: number;
  cardFoilTypes: string[];
  productSubTypes: string[];
}

// Soft, non-gating check over already-resolved matches (see design "Variant
// mapping"): returns the resolved cards whose available variants (from
// foilTypes) are NOT a subset of the product's price subTypeNames. Used only
// for WARN logging + run-result surfacing; it never affects resolution.
export function findVariantMismatches(
  resolved: { cardId: string; productId: number }[],
  cardsById: Map<string, FallbackCard>,
  subTypeNamesByProduct: Map<number, string[]>
): FallbackVariantMismatch[] {
  const mismatches: FallbackVariantMismatch[] = [];
  for (const match of resolved) {
    const card = cardsById.get(match.cardId);
    if (!card) continue;
    const subTypes = subTypeNamesByProduct.get(match.productId) ?? [];
    if (!areVariantsConsistent(card.foilTypes, subTypes)) {
      mismatches.push({
        cardId: match.cardId,
        productId: match.productId,
        cardFoilTypes: card.foilTypes,
        productSubTypes: subTypes,
      });
    }
  }
  return mismatches;
}

function parseCardNumber(
  cardNumber: string
): { number: number; denominator: string } | null {
  const firstSegment = cardNumber.split("•")[0] ?? "";
  return parseCollectorNumber(firstSegment);
}

function productExtendedData(
  product: TcgcsvProduct,
  field: string
): string | null {
  const entries = product.extendedData ?? [];
  const entry = entries.find((e) => e.name === field);
  return entry?.value ?? null;
}

export function buildProductIndex(products: TcgcsvProduct[]): Map<string, number[]> {
  const index = new Map<string, number[]>();

  for (const product of products) {
    if (product.presaleInfo?.isPresale === true) continue;

    const numberValue = productExtendedData(product, "Number");
    const rarityValue = productExtendedData(product, "Rarity");
    if (numberValue == null || rarityValue == null) continue;

    const parsed = parseCollectorNumber(numberValue);
    if (!parsed) continue;

    const rarity = canonicalRarity(rarityValue);
    if (rarity == null) continue;

    const normalizedName = normalizeProductName(product.name);
    if (normalizedName === "") continue;

    const key = `${parsed.number}|${parsed.denominator}|${rarity}|${normalizedName}`;
    const list = index.get(key) ?? [];
    list.push(product.productId);
    index.set(key, list);
  }

  return index;
}

export function matchFallbackCards(
  cards: FallbackCard[],
  products: TcgcsvProduct[]
): FallbackMatchResult {
  const index = buildProductIndex(products);

  interface EligibleCard {
    cardId: string;
    key: string;
    productIds: number[];
  }

  const eligible: EligibleCard[] = [];
  const skipped: { cardId: string; reason: FallbackSkipReason }[] = [];
  const keyCount = new Map<string, number>();

  for (const card of cards) {
    if (card.tcgPlayerId != null) {
      skipped.push({ cardId: card.id, reason: "excluded" });
      continue;
    }
    if (!FALLBACK_MATCH_SET_NAMES.includes(card.setName)) {
      skipped.push({ cardId: card.id, reason: "excluded" });
      continue;
    }
    const parsed = parseCardNumber(card.cardNumber);
    if (!parsed || parsed.denominator !== "204") {
      skipped.push({ cardId: card.id, reason: "excluded" });
      continue;
    }
    const rarity = canonicalRarity(card.rarity);
    if (rarity == null) {
      skipped.push({ cardId: card.id, reason: "excluded" });
      continue;
    }
    const normalizedName = normalizeCardName(card.name, card.subtitle);
    if (normalizedName === "") {
      skipped.push({ cardId: card.id, reason: "excluded" });
      continue;
    }

    const key = `${parsed.number}|${parsed.denominator}|${rarity}|${normalizedName}`;
    eligible.push({ cardId: card.id, key, productIds: index.get(key) ?? [] });
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
  }

  // Injective 1:1 resolution: a card resolves only when its key is unique among
  // cards, maps to exactly one product, and that productId is claimed by no
  // other card.
  const candidateProductId = new Map<string, number>();
  const productClaimers = new Map<number, number>();

  for (const candidate of eligible) {
    if (keyCount.get(candidate.key) === 1 && candidate.productIds.length === 1) {
      const productId = candidate.productIds[0];
      candidateProductId.set(candidate.cardId, productId);
      productClaimers.set(productId, (productClaimers.get(productId) ?? 0) + 1);
    }
  }

  const resolved: { cardId: string; productId: number }[] = [];
  for (const candidate of eligible) {
    const productId = candidateProductId.get(candidate.cardId);
    if (productId != null && productClaimers.get(productId) === 1) {
      resolved.push({ cardId: candidate.cardId, productId });
    } else {
      skipped.push({ cardId: candidate.cardId, reason: "ambiguous" });
    }
  }

  return { resolved, skipped };
}

export async function resolveFallbackTcgPlayerIds(
  prisma: FallbackPrismaClient,
  groupName: string,
  products: TcgcsvProduct[],
  prices: TcgcsvPriceRow[] = []
): Promise<{ resolved: number; skipped: number; variantMismatches: number }> {
  if (!FALLBACK_MATCH_SET_NAMES.includes(groupName)) {
    return { resolved: 0, skipped: 0, variantMismatches: 0 };
  }

  const cards = await prisma.card.findMany({
    where: { setName: groupName, tcgPlayerId: null },
  });

  const result = matchFallbackCards(cards, products);

  // Soft, non-gating variant-consistency check (design "Variant mapping"):
  // a resolved card whose available variants (from foilTypes) are not a subset
  // of the product's price subTypeNames is WARN-logged and counted so it is
  // surfaced in the run result, but the match is never blocked.
  const subTypeNamesByProduct = new Map<number, string[]>();
  for (const price of prices) {
    const list = subTypeNamesByProduct.get(price.productId) ?? [];
    if (!list.includes(price.subTypeName)) list.push(price.subTypeName);
    subTypeNamesByProduct.set(price.productId, list);
  }
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const mismatches = findVariantMismatches(result.resolved, cardsById, subTypeNamesByProduct);
  for (const mismatch of mismatches) {
    console.warn(
      `[fallback-matcher] variant mismatch for card ${mismatch.cardId} -> product ${mismatch.productId}: ` +
        `foilTypes [${mismatch.cardFoilTypes.join(", ")}] not a subset of price subTypes [${mismatch.productSubTypes.join(", ")}]`
    );
  }

  for (const match of result.resolved) {
    await prisma.card.updateMany({
      where: { id: match.cardId, tcgPlayerId: null },
      data: { tcgPlayerId: match.productId },
    });
  }

  return {
    resolved: result.resolved.length,
    skipped: result.skipped.length,
    variantMismatches: mismatches.length,
  };
}
