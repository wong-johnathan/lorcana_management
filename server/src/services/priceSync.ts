import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LORCANA_CATEGORY_ID = 71;

// tcgcsv.com blocks requests without a specific, non-generic User-Agent (see /docs#usage-guidelines).
const TCGCSV_HEADERS = { "User-Agent": "LorcanaInventory/1.0.0" };

export interface TcgcsvGroup {
  groupId: number;
  name: string;
}

interface TcgcsvProduct {
  productId: number;
}

interface TcgcsvPrice {
  productId: number;
  subTypeName: string;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
}

export interface PriceSyncResult {
  groups: number;
  matched: number;
  unmatched: number;
}

export type PriceSyncProgressCallback = (info: {
  groupName: string;
  groupIndex: number;
  totalGroups: number;
}) => void;

export async function fetchPriceGroups(): Promise<TcgcsvGroup[]> {
  const groupsRes = await fetch(
    `https://tcgcsv.com/tcgplayer/${LORCANA_CATEGORY_ID}/groups`,
    { headers: TCGCSV_HEADERS }
  );
  if (!groupsRes.ok) {
    throw new Error(`Failed to fetch groups: ${groupsRes.status}`);
  }
  const { results: groups } = (await groupsRes.json()) as {
    results: TcgcsvGroup[];
  };
  return groups;
}

function hasAnyPrice(price: TcgcsvPrice): boolean {
  return [price.lowPrice, price.midPrice, price.highPrice, price.marketPrice].some((value) => value != null);
}

function displayPriceFromCurrentPrices(prices: TcgcsvPrice[]): number | null {
  return prices.find((p) => p.subTypeName === "Normal")?.marketPrice
    ?? prices.find((p) => p.marketPrice != null)?.marketPrice
    ?? null;
}

async function replaceCardPrices(cardId: string, currentPrices: TcgcsvPrice[]) {
  await prisma.cardPrice.deleteMany({ where: { cardId } });

  if (currentPrices.length > 0) {
    await prisma.cardPrice.createMany({
      data: currentPrices.map((vp) => ({
        cardId,
        variant: vp.subTypeName,
        lowPrice: vp.lowPrice,
        midPrice: vp.midPrice,
        highPrice: vp.highPrice,
        marketPrice: vp.marketPrice,
      })),
    });
  }

  await prisma.card.update({
    where: { id: cardId },
    data: { displayPrice: displayPriceFromCurrentPrices(currentPrices) },
  });
}

export async function syncGroupPrices(
  groups: TcgcsvGroup[],
  onProgress?: PriceSyncProgressCallback
): Promise<PriceSyncResult> {
  let matched = 0;
  let unmatched = 0;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    try {
      const productsRes = await fetch(
        `https://tcgcsv.com/tcgplayer/${LORCANA_CATEGORY_ID}/${group.groupId}/products`,
        { headers: TCGCSV_HEADERS }
      );
      if (!productsRes.ok) {
        if (productsRes.status !== 404) {
          throw new Error(`Failed to fetch products for group ${group.groupId}: ${productsRes.status}`);
        }
      } else {
        const { results: products } = (await productsRes.json()) as {
          results: TcgcsvProduct[];
        };

        const pricesRes = await fetch(
          `https://tcgcsv.com/tcgplayer/${LORCANA_CATEGORY_ID}/${group.groupId}/prices`,
          { headers: TCGCSV_HEADERS }
        );
        if (!pricesRes.ok && pricesRes.status !== 404) {
          throw new Error(`Failed to fetch prices for group ${group.groupId}: ${pricesRes.status}`);
        }

        const { results: prices } = pricesRes.ok
          ? (await pricesRes.json()) as { results: TcgcsvPrice[] }
          : { results: [] as TcgcsvPrice[] };

        const pricesByProduct = new Map<number, TcgcsvPrice[]>();
        for (const p of prices) {
          const list = pricesByProduct.get(p.productId) ?? [];
          list.push(p);
          pricesByProduct.set(p.productId, list);
        }

        const currentProductIds = new Set<number>(products.map((product) => product.productId));
        for (const productId of pricesByProduct.keys()) currentProductIds.add(productId);

        for (const productId of currentProductIds) {
          const matchingCards = await prisma.card.findMany({
            where: { tcgPlayerId: productId },
          });
          if (matchingCards.length === 0) {
            unmatched++;
            continue;
          }

          const currentPrices = (pricesByProduct.get(productId) ?? []).filter(hasAnyPrice);
          for (const card of matchingCards) {
            await replaceCardPrices(card.id, currentPrices);
          }
          matched += matchingCards.length;
        }
      }
    } catch (err) {
      console.error("Price sync failed for group", group.groupId, err);
    }

    onProgress?.({ groupName: group.name, groupIndex: i + 1, totalGroups: groups.length });
    await new Promise((r) => setTimeout(r, 300));
  }

  return { groups: groups.length, matched, unmatched };
}
