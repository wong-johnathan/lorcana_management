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

/** Inputs for the shared lock → availability → create core (design §4.4). */
export interface CreateListingLockedInput {
  sellerId: string;
  cardId: string;
  variant: string;
  quantity: number;
  priceMinor: number;
  currency: string;
  condition?: string | null;
  location?: string;
  note?: string | null;
  /**
   * Bulk-listing backstop (REQ-BULK-9, AC-BULK-9.4). When true the seller's
   * existing non-hidden listing for (card, variant) makes this a no-op skip.
   * Defaults to false, which keeps the single flow byte-identical.
   */
  skipIfAlreadyListed?: boolean;
}

/** A created listing with the relations `serializeListing` reads. */
export type CreatedListing = Prisma.MarketplaceListingGetPayload<{
  include: { card: true; photos: true };
}>;

/** Discriminated outcome of {@link createListingLocked}. */
export type CreateListingLockedResult =
  | { kind: "created"; listing: CreatedListing }
  | { kind: "skipped" }
  | { kind: "exceeds-available" };

/**
 * Design §4.4: the single source of truth for the listing-creation invariant.
 * Must be called inside a transaction so the `FOR UPDATE` lock holds.
 *
 * Order is binding (design §4.2 / PI-1): lock → (optional) already-listed skip
 * → availableCount check → create. The skip predicate keys on `hiddenAt: null`
 * only, never on `status`.
 */
export async function createListingLocked(
  tx: MarketplaceTx,
  input: CreateListingLockedInput
): Promise<CreateListingLockedResult> {
  const { sellerId, cardId, variant, quantity } = input;

  await lockInventoryEntry(tx, sellerId, cardId);

  if (input.skipIfAlreadyListed) {
    const alreadyListed = (await listedElsewhereCount(tx, sellerId, cardId, variant)) > 0;
    if (alreadyListed) return { kind: "skipped" };
  }

  const available = await availableCount(tx, sellerId, cardId, variant);
  if (quantity > available) return { kind: "exceeds-available" };

  const listing = await tx.marketplaceListing.create({
    data: {
      sellerId,
      cardId,
      variant,
      quantity,
      priceMinor: input.priceMinor,
      currency: input.currency,
      condition: input.condition ?? null,
      location: input.location ?? "",
      note: input.note ?? null,
      status: "ACTIVE",
    },
    include: { card: true, photos: true },
  });
  return { kind: "created", listing };
}
