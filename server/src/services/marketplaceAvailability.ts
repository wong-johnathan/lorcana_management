/**
 * Lorcana Marketplace (Lean V2) — availability maths and the row-lock primitive.
 *
 * Implements design §5 (availability invariant) and §6.1 (locking primitive).
 * Every quantity-mutating operation in `marketplaceTransitions.ts` funnels
 * through `lockInventoryEntry` to serialize writers on the seller's unique
 * `InventoryEntry` row, then recomputes `owned` / `reserved` / `listedElsewhere`
 * inside the same transaction so the reservation invariant can never drift.
 *
 * `reserved` and `listedElsewhere` are always derived (never denormalized):
 *
 *   owned(v)          = seller's `InventoryEntry` column for v
 *   reserved(v)       = Σ quantity over PENDING_CONFIRMATION transactions
 *   listedElsewhere(v)= Σ quantity over the seller's other non-hidden listings
 *   available(v)      = owned − reserved − listedElsewhere
 */

import type { Prisma } from "@prisma/client";
import { variantColumn } from "./marketplace.js";

/**
 * The interactive-transaction client type. Passed in by callers so these
 * helpers always run against the transaction that holds the row lock.
 */
export type MarketplaceTx = Prisma.TransactionClient;

/** Count of the seller's owned copies for a card+variant (design §5). */
export async function ownedCount(
  tx: MarketplaceTx,
  sellerId: string,
  cardId: string,
  variant: string
): Promise<number> {
  const column = variantColumn(variant);
  const entry = await tx.inventoryEntry.findFirst({
    where: { userId: sellerId, cardId },
    select: { quantity: true, foilQuantity: true, holofoilQuantity: true },
  });
  return entry ? entry[column] : 0;
}

/** Σ quantity reserved by PENDING_CONFIRMATION transactions (design §5). */
export async function reservedCount(
  tx: MarketplaceTx,
  sellerId: string,
  cardId: string,
  variant: string
): Promise<number> {
  const rows = await tx.marketplaceTransaction.findMany({
    where: { sellerId, cardId, variant, status: "PENDING_CONFIRMATION" },
    select: { quantity: true },
  });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

/**
 * Σ quantity offered in the seller's other non-hidden listings for the same
 * card+variant. A `CLOSED` listing has quantity 0 (it only closes at 0), so
 * filtering on `hiddenAt = null` is sufficient and matches design D5/§5.
 */
export async function listedElsewhereCount(
  tx: MarketplaceTx,
  sellerId: string,
  cardId: string,
  variant: string,
  excludeListingId?: string
): Promise<number> {
  const rows = await tx.marketplaceListing.findMany({
    where: {
      sellerId,
      cardId,
      variant,
      hiddenAt: null,
      ...(excludeListingId ? { id: { not: excludeListingId } } : {}),
    },
    select: { quantity: true },
  });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

/** available = owned − reserved − listedElsewhere (design §5). */
export async function availableCount(
  tx: MarketplaceTx,
  sellerId: string,
  cardId: string,
  variant: string,
  excludeListingId?: string
): Promise<number> {
  const owned = await ownedCount(tx, sellerId, cardId, variant);
  const reserved = await reservedCount(tx, sellerId, cardId, variant);
  const listedElsewhere = await listedElsewhereCount(
    tx,
    sellerId,
    cardId,
    variant,
    excludeListingId
  );
  return owned - reserved - listedElsewhere;
}

/**
 * Serializes quantity mutations for a (seller, card) on the seller's unique
 * `InventoryEntry` row (design §6.1). Read-committed isolation is sufficient
 * because the `FOR UPDATE` lock serializes writers. Returns the locked row ids.
 */
export async function lockInventoryEntry(
  tx: MarketplaceTx,
  userId: string,
  cardId: string
): Promise<{ id: string }[]> {
  return tx.$queryRaw<{ id: string }[]>`SELECT id FROM "InventoryEntry" WHERE "userId" = ${userId} AND "cardId" = ${cardId} FOR UPDATE`;
}
