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
  directLowPrice?: number | null;
}

export interface PriceSyncResult {
  groups: number;
  matched: number;
  unmatched: number;
  rowCount?: number;
  skipped?: boolean;
  status?: "COMPLETED" | "PARTIAL" | "FAILED";
}

export type PriceSyncProgressCallback = (info: {
  groupName: string;
  groupIndex: number;
  totalGroups: number;
}) => void;

export function parseTcgcsvTimestamp(value: string): Date {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid tcgcsv last-updated timestamp: ${value}`);
  }
  return parsed;
}

export async function fetchPriceSourceUpdatedAt(): Promise<Date> {
  const res = await fetch("https://tcgcsv.com/last-updated.txt", { headers: TCGCSV_HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch tcgcsv last-updated timestamp: ${res.status}`);
  }
  return parseTcgcsvTimestamp(await res.text());
}

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

export async function getLatestPriceSnapshotRun() {
  return prisma.tcgcsvPriceSnapshotRun.findFirst({
    orderBy: { sourceUpdatedAt: "desc" },
  });
}

function hasAnyPrice(price: TcgcsvPrice): boolean {
  return [price.lowPrice, price.midPrice, price.highPrice, price.marketPrice].some((value) => value != null);
}

function displayPriceFromCurrentPrices(prices: TcgcsvPrice[]): number | null {
  return prices.find((p) => p.subTypeName === "Normal")?.marketPrice
    ?? prices.find((p) => p.marketPrice != null)?.marketPrice
    ?? null;
}

async function replaceCardPrices(db: any, cardId: string, currentPrices: TcgcsvPrice[]) {
  await db.cardPrice.deleteMany({ where: { cardId } });

  if (currentPrices.length > 0) {
    await db.cardPrice.createMany({
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

  await db.card.update({
    where: { id: cardId },
    data: { displayPrice: displayPriceFromCurrentPrices(currentPrices) },
  });
}

async function fetchGroupProducts(groupId: number): Promise<TcgcsvProduct[]> {
  const productsRes = await fetch(
    `https://tcgcsv.com/tcgplayer/${LORCANA_CATEGORY_ID}/${groupId}/products`,
    { headers: TCGCSV_HEADERS }
  );
  if (!productsRes.ok) {
    throw new Error(`Failed to fetch products for group ${groupId}: ${productsRes.status}`);
  }
  const { results: products } = (await productsRes.json()) as { results: TcgcsvProduct[] };
  return products;
}

async function fetchGroupPrices(groupId: number): Promise<TcgcsvPrice[]> {
  const pricesRes = await fetch(
    `https://tcgcsv.com/tcgplayer/${LORCANA_CATEGORY_ID}/${groupId}/prices`,
    { headers: TCGCSV_HEADERS }
  );
  if (!pricesRes.ok) {
    throw new Error(`Failed to fetch prices for group ${groupId}: ${pricesRes.status}`);
  }
  const { results: prices } = (await pricesRes.json()) as { results: TcgcsvPrice[] };
  return prices;
}

function pricesByProduct(prices: TcgcsvPrice[]): Map<number, TcgcsvPrice[]> {
  const grouped = new Map<number, TcgcsvPrice[]>();
  for (const price of prices) {
    const list = grouped.get(price.productId) ?? [];
    list.push(price);
    grouped.set(price.productId, list);
  }
  return grouped;
}

async function persistGroupSnapshotAndCurrentPrices(
  runId: number,
  groupId: number,
  products: TcgcsvProduct[],
  prices: TcgcsvPrice[]
): Promise<{ matched: number; unmatched: number; rowCount: number }> {
  return prisma.$transaction(async (tx: any) => {
    await tx.tcgcsvPriceSnapshot.deleteMany({ where: { runId, groupId } });

    if (prices.length > 0) {
      await tx.tcgcsvPriceSnapshot.createMany({
        data: prices.map((price) => ({
          runId,
          groupId,
          productId: price.productId,
          variant: price.subTypeName,
          lowPrice: price.lowPrice,
          midPrice: price.midPrice,
          highPrice: price.highPrice,
          marketPrice: price.marketPrice,
          directLowPrice: price.directLowPrice ?? null,
        })),
        skipDuplicates: true,
      });
    }

    let matched = 0;
    let unmatched = 0;
    const groupedPrices = pricesByProduct(prices);
    const currentProductIds = new Set<number>(products.map((product) => product.productId));
    for (const productId of groupedPrices.keys()) currentProductIds.add(productId);

    for (const productId of currentProductIds) {
      const matchingCards = await tx.card.findMany({ where: { tcgPlayerId: productId } });
      if (matchingCards.length === 0) {
        unmatched++;
        continue;
      }

      const currentPrices = (groupedPrices.get(productId) ?? []).filter(hasAnyPrice);
      for (const card of matchingCards) {
        await replaceCardPrices(tx, card.id, currentPrices);
      }
      matched += matchingCards.length;
    }

    return { matched, unmatched, rowCount: prices.length };
  });
}

function finalStatus(successfulGroups: number, failedGroups: number): "COMPLETED" | "PARTIAL" | "FAILED" {
  if (successfulGroups === 0 && failedGroups > 0) return "FAILED";
  return failedGroups > 0 ? "PARTIAL" : "COMPLETED";
}

async function updateRun(
  runId: number,
  data: {
    status: "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
    groupCount?: number;
    successfulGroups?: number;
    failedGroups?: number;
    rowCount?: number;
    completedAt?: Date | null;
    errorSummary?: { groupId: number; name: string; error: string }[];
  }
) {
  await prisma.tcgcsvPriceSnapshotRun.update({
    where: { id: runId },
    data: {
      ...data,
      errorSummary: data.errorSummary ?? undefined,
    },
  });
}

export async function syncGroupPrices(
  groups: TcgcsvGroup[],
  onProgress?: PriceSyncProgressCallback
): Promise<PriceSyncResult> {
  const sourceUpdatedAt = await fetchPriceSourceUpdatedAt();
  const existingRun = await prisma.tcgcsvPriceSnapshotRun.findUnique({
    where: { categoryId_sourceUpdatedAt: { categoryId: LORCANA_CATEGORY_ID, sourceUpdatedAt } },
  });

  if (existingRun?.status === "COMPLETED") {
    return {
      groups: groups.length,
      matched: 0,
      unmatched: 0,
      rowCount: existingRun.rowCount,
      skipped: true,
      status: "COMPLETED",
    };
  }

  const run = existingRun
    ? await prisma.tcgcsvPriceSnapshotRun.update({
        where: { id: existingRun.id },
        data: {
          status: "RUNNING",
          groupCount: groups.length,
          successfulGroups: 0,
          failedGroups: 0,
          rowCount: 0,
          completedAt: null,
          errorSummary: undefined,
        },
      })
    : await prisma.tcgcsvPriceSnapshotRun.create({
        data: {
          categoryId: LORCANA_CATEGORY_ID,
          sourceUpdatedAt,
          status: "RUNNING",
          groupCount: groups.length,
        },
      });

  let matched = 0;
  let unmatched = 0;
  let rowCount = 0;
  let successfulGroups = 0;
  let failedGroups = 0;
  const errors: { groupId: number; name: string; error: string }[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    try {
      const products = await fetchGroupProducts(group.groupId);
      const prices = await fetchGroupPrices(group.groupId);
      const result = await persistGroupSnapshotAndCurrentPrices(run.id, group.groupId, products, prices);
      matched += result.matched;
      unmatched += result.unmatched;
      rowCount += result.rowCount;
      successfulGroups++;
    } catch (err) {
      failedGroups++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ groupId: group.groupId, name: group.name, error: message });
      console.error("Price sync failed for group", group.groupId, err);
    }

    onProgress?.({ groupName: group.name, groupIndex: i + 1, totalGroups: groups.length });
    await updateRun(run.id, {
      status: "RUNNING",
      groupCount: groups.length,
      successfulGroups,
      failedGroups,
      rowCount,
      errorSummary: errors,
    });
    await new Promise((r) => setTimeout(r, 300));
  }

  const status = finalStatus(successfulGroups, failedGroups);
  await updateRun(run.id, {
    status,
    groupCount: groups.length,
    successfulGroups,
    failedGroups,
    rowCount,
    completedAt: new Date(),
    errorSummary: errors,
  });

  return { groups: groups.length, matched, unmatched, rowCount, skipped: false, status };
}
