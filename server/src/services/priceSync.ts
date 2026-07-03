import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LORCANA_CATEGORY_ID = 71;

// tcgcsv.com blocks requests without a specific, non-generic User-Agent (see /docs#usage-guidelines).
const TCGCSV_HEADERS = { "User-Agent": "LorcanaInventory/1.0.0" };

export interface TcgcsvGroup {
  groupId: number;
  name: string;
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

export async function syncGroupPrices(
  groups: TcgcsvGroup[],
  onProgress?: PriceSyncProgressCallback
): Promise<PriceSyncResult> {
  let matched = 0;
  let unmatched = 0;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    try {
      const pricesRes = await fetch(
        `https://tcgcsv.com/tcgplayer/${LORCANA_CATEGORY_ID}/${group.groupId}/prices`,
        { headers: TCGCSV_HEADERS }
      );
      if (pricesRes.ok) {
        const { results: prices } = (await pricesRes.json()) as {
          results: TcgcsvPrice[];
        };

        const pricesByProduct = new Map<number, TcgcsvPrice[]>();
        for (const p of prices) {
          const list = pricesByProduct.get(p.productId) ?? [];
          list.push(p);
          pricesByProduct.set(p.productId, list);
        }

        for (const [productId, variantPrices] of pricesByProduct) {
          const matchingCards = await prisma.card.findMany({
            where: { tcgPlayerId: productId },
          });
          if (matchingCards.length === 0) {
            unmatched++;
            continue;
          }

          for (const card of matchingCards) {
            for (const vp of variantPrices) {
              await prisma.cardPrice.upsert({
                where: { cardId_variant: { cardId: card.id, variant: vp.subTypeName } },
                create: {
                  cardId: card.id,
                  variant: vp.subTypeName,
                  lowPrice: vp.lowPrice,
                  midPrice: vp.midPrice,
                  highPrice: vp.highPrice,
                  marketPrice: vp.marketPrice,
                },
                update: {
                  lowPrice: vp.lowPrice,
                  midPrice: vp.midPrice,
                  highPrice: vp.highPrice,
                  marketPrice: vp.marketPrice,
                },
              });
            }
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
