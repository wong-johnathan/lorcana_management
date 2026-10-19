/**
 * Lorcana Marketplace (Lean V2) — state transitions that hold the availability
 * invariant (design §6.3–§6.7).
 *
 * Every quantity-mutating function runs inside `prisma.$transaction` and
 * serializes on `lockInventoryEntry` (design §6.1). The reservation invariant
 * (§5) is enforced by recomputing `owned` / `reserved` / `listedElsewhere`
 * under the lock, and the double-confirm / double-auto-transfer race is guarded
 * by an `updateMany` compare-and-swap on the transaction status (design §6.1).
 *
 * Errors use `MarketplaceError` (carries an HTTP status) so the thin routes in
 * B3 can map them directly; a 409 means the guard failed and nothing was
 * written (AC-14.4 atomicity).
 */

import { PrismaClient } from "@prisma/client";
import {
  listedElsewhereCount,
  lockInventoryEntry,
  ownedCount,
  reservedCount,
  type MarketplaceTx,
} from "./marketplaceAvailability.js";
import {
  isValidCancelActor,
  isValidCompletedCause,
  variantColumn,
} from "./marketplace.js";

const prisma = new PrismaClient();

/** 30-day auto-transfer window (A4), measured from `soldAt`. */
const AUTO_TRANSFER_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Auto-transfer sweep processes at most this many due rows per tick. */
const AUTO_TRANSFER_BATCH_SIZE = 100;

export class MarketplaceError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "MarketplaceError";
  }
}

type QuantityColumn = "quantity" | "foilQuantity" | "holofoilQuantity";

/** Builds the typed `{ column: { increment | decrement: q } }` mutation object. */
function columnMutation(
  column: QuantityColumn,
  kind: "increment" | "decrement",
  q: number
) {
  const op = kind === "increment" ? { increment: q } : { decrement: q };
  switch (column) {
    case "quantity":
      return { quantity: op };
    case "foilQuantity":
      return { foilQuantity: op };
    case "holofoilQuantity":
      return { holofoilQuantity: op };
  }
}

/** Builds the typed `{ column: { gte: q } }` filter for the underflow guard. */
function columnGteFilter(column: QuantityColumn, q: number) {
  switch (column) {
    case "quantity":
      return { quantity: { gte: q } };
    case "foilQuantity":
      return { foilQuantity: { gte: q } };
    case "holofoilQuantity":
      return { holofoilQuantity: { gte: q } };
  }
}

export interface MarkSoldResult {
  transactionId: string;
  quantity: number;
  status: string;
  listingQuantity: number;
  listingStatus: string;
}

export interface ConfirmTransferResult {
  transactionId: string;
  alreadyCompleted: boolean;
  status?: string;
}

export interface CancelTransactionResult {
  transactionId: string;
  alreadyCancelled: boolean;
  status?: string;
}

export interface AutoTransferResult {
  due: number;
  completed: number;
  alreadyCompleted: number;
  failed: number;
  failures: { transactionId: string; error: string }[];
}

export interface DisableUserResult {
  userId: string;
  cancelled: number;
}

/** Shared outcome for a cancellation CAS (also used by `disableUser`). */
interface CancelOutcome {
  transactionId: string;
  alreadyCancelled: boolean;
  status?: string;
}

/**
 * markSold (REQ-14): the seller reserves `q` copies from a listing, creating a
 * PENDING_CONFIRMATION transaction. Nothing is written when a guard fails.
 *
 * The route enforces caller == seller, but we re-assert identity here because
 * the invariant depends on it (design §6.3 step 1).
 */
export async function markSold(
  callerId: string,
  enquiryId: string,
  q: number
): Promise<MarkSoldResult> {
  if (!Number.isInteger(q) || q < 1) {
    throw new MarketplaceError(409, "Quantity must be at least 1");
  }
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.marketplaceEnquiry.findUnique({
      where: { id: enquiryId },
      include: { listing: true },
    });
    if (!enquiry) throw new MarketplaceError(404, "Enquiry not found");
    if (enquiry.sellerId !== callerId) {
      throw new MarketplaceError(403, "Only the seller can mark this enquiry sold");
    }
    if (enquiry.status !== "ACTIVE") {
      throw new MarketplaceError(409, "Enquiry is not active");
    }

    // Idempotency: an enquiry can be marked sold at most once. A second call
    // would otherwise mint duplicate PENDING_CONFIRMATION rows and keep
    // decrementing the listing.
    const existingPending = await tx.marketplaceTransaction.findFirst({
      where: { enquiryId, status: "PENDING_CONFIRMATION" },
    });
    if (existingPending) {
      throw new MarketplaceError(409, "This enquiry has already been marked sold");
    }

    const sellerId = enquiry.sellerId;
    const cardId = enquiry.listing.cardId;

    await lockInventoryEntry(tx, sellerId, cardId);

    // Fresh read under the lock: concurrent writers are serialized, so the
    // remaining quantity and status here are authoritative (design §11).
    const listing = await tx.marketplaceListing.findUnique({
      where: { id: enquiry.listingId },
    });
    if (!listing) throw new MarketplaceError(404, "Listing not found");
    if (listing.status !== "ACTIVE") {
      throw new MarketplaceError(409, "Listing is not active");
    }

    const owned = await ownedCount(tx, sellerId, cardId, listing.variant);
    const reserved = await reservedCount(tx, sellerId, cardId, listing.variant);
    const listedElsewhere = await listedElsewhereCount(
      tx,
      sellerId,
      cardId,
      listing.variant,
      listing.id
    );
    const available = owned - reserved - listedElsewhere;

    if (q > listing.quantity) {
      throw new MarketplaceError(409, "Quantity exceeds the remaining listing quantity");
    }
    if (q > available) {
      throw new MarketplaceError(409, "Quantity exceeds available inventory");
    }

    const transaction = await tx.marketplaceTransaction.create({
      data: {
        enquiryId,
        listingId: listing.id,
        buyerId: enquiry.buyerId,
        sellerId,
        cardId,
        variant: listing.variant,
        quantity: q,
        priceMinor: listing.priceMinor,
        currency: listing.currency,
        status: "PENDING_CONFIRMATION",
        soldAt: new Date(),
      },
    });

    const remaining = listing.quantity - q;
    const listingStatus = remaining === 0 ? "CLOSED" : "ACTIVE";
    await tx.marketplaceListing.update({
      where: { id: listing.id },
      data: { quantity: remaining, status: listingStatus },
    });

    // Inline system event so the buyer sees the seller accepted (and their
    // Messages badge lights up — the message is attributed to the seller).
    await tx.enquiryMessage.create({
      data: {
        enquiryId,
        senderId: callerId,
        kind: "SYSTEM",
        body: `Seller marked ${q} as sold — awaiting buyer confirmation.`,
      },
    });

    return {
      transactionId: transaction.id,
      quantity: q,
      status: "PENDING_CONFIRMATION",
      listingQuantity: remaining,
      listingStatus,
    };
  });
}

/**
 * adjustQuantity (AC-14.5): re-validate a pending transaction's quantity
 * against available-without-this-transaction, then shift the listing quantity
 * by the delta. `soldAt` is NOT reset (A4).
 */
export async function adjustQuantity(
  transactionId: string,
  qPrime: number
): Promise<{ transactionId: string; quantity: number }> {
  if (!Number.isInteger(qPrime) || qPrime < 1) {
    throw new MarketplaceError(409, "Quantity must be at least 1");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!existing) throw new MarketplaceError(404, "Transaction not found");
    if (existing.status !== "PENDING_CONFIRMATION") {
      throw new MarketplaceError(409, "Transaction is not pending confirmation");
    }

    await lockInventoryEntry(tx, existing.sellerId, existing.cardId);

    const listing = await tx.marketplaceListing.findUnique({
      where: { id: existing.listingId },
    });
    if (!listing) throw new MarketplaceError(404, "Listing not found");

    const owned = await ownedCount(tx, existing.sellerId, existing.cardId, existing.variant);
    const reserved = await reservedCount(tx, existing.sellerId, existing.cardId, existing.variant);
    const reservedExclThis = reserved - existing.quantity;
    const listedElsewhere = await listedElsewhereCount(
      tx,
      existing.sellerId,
      existing.cardId,
      existing.variant,
      listing.id
    );

    const maxAvailable = owned - reservedExclThis - listedElsewhere;
    if (qPrime > maxAvailable) {
      throw new MarketplaceError(409, "Quantity adjustment would exceed available inventory");
    }

    const delta = qPrime - existing.quantity;
    const nextListingQuantity = listing.quantity - delta;
    if (nextListingQuantity < 0) {
      throw new MarketplaceError(409, "Quantity adjustment would exceed the listing quantity");
    }

    const listingStatus = nextListingQuantity === 0 ? "CLOSED" : "ACTIVE";
    await tx.marketplaceListing.update({
      where: { id: listing.id },
      data: { quantity: nextListingQuantity, status: listingStatus },
    });

    await tx.marketplaceTransaction.update({
      where: { id: transactionId },
      data: { quantity: qPrime },
    });

    return { transactionId, quantity: qPrime };
  });
}

/**
 * confirmTransfer (REQ-16/17): the ONLY event that moves a card between
 * collections (AC-16.1). A CAS flips PENDING_CONFIRMATION → COMPLETED; exactly
 * one worker wins and performs the atomic seller-decrement / buyer-increment.
 */
export async function confirmTransfer(
  transactionId: string,
  cause: string
): Promise<ConfirmTransferResult> {
  if (!isValidCompletedCause(cause)) {
    throw new MarketplaceError(400, "Invalid completion cause");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!existing) throw new MarketplaceError(404, "Transaction not found");

    await lockInventoryEntry(tx, existing.sellerId, existing.cardId);

    const flipped = await tx.marketplaceTransaction.updateMany({
      where: { id: transactionId, status: "PENDING_CONFIRMATION" },
      data: { status: "COMPLETED", confirmedAt: new Date(), completedCause: cause },
    });
    if (flipped.count === 0) {
      // AC-16.2: second confirm / racing auto-transfer is an idempotent no-op.
      return { transactionId, alreadyCompleted: true };
    }

    const column = variantColumn(existing.variant);

    // Seller decrement, guarded against underflow (defensive against drift;
    // abort + log otherwise — design §6.5 step 3, §11).
    const sellerMove = await tx.inventoryEntry.updateMany({
      where: {
        userId: existing.sellerId,
        cardId: existing.cardId,
        ...columnGteFilter(column, existing.quantity),
      },
      data: columnMutation(column, "decrement", existing.quantity),
    });
    if (sellerMove.count === 0) {
      console.error(
        `confirmTransfer: seller inventory underflow for transaction ${transactionId} ` +
          `(variant ${existing.variant}, qty ${existing.quantity}); aborting`
      );
      throw new Error("Seller inventory underflow");
    }

    // Buyer increment via upsert (only ever incremented here; the CAS makes it
    // happen at most once — design §6.5 step 4).
    await tx.inventoryEntry.upsert({
      where: {
        userId_cardId: { userId: existing.buyerId, cardId: existing.cardId },
      },
      create: {
        userId: existing.buyerId,
        cardId: existing.cardId,
        quantity: column === "quantity" ? existing.quantity : 0,
        foilQuantity: column === "foilQuantity" ? existing.quantity : 0,
        holofoilQuantity: column === "holofoilQuantity" ? existing.quantity : 0,
      },
      update: columnMutation(column, "increment", existing.quantity),
    });

    // Inline system event so the seller sees the buyer confirmed.
    await tx.enquiryMessage.create({
      data: {
        enquiryId: existing.enquiryId,
        senderId: existing.buyerId,
        kind: "SYSTEM",
        body: "Buyer confirmed receipt — sale complete.",
      },
    });

    return { transactionId, alreadyCompleted: false, status: "COMPLETED" };
  });
}

/**
 * Shared cancellation: CAS PENDING_CONFIRMATION → CANCELLED, then release the
 * reservation back into the listing (reopening CLOSED → ACTIVE if it rose above
 * 0). Callers must already hold the seller's row lock.
 */
async function cancelPendingWithTx(
  tx: MarketplaceTx,
  transactionId: string,
  actor: string
): Promise<CancelOutcome> {
  const flipped = await tx.marketplaceTransaction.updateMany({
    where: { id: transactionId, status: "PENDING_CONFIRMATION" },
    data: { status: "CANCELLED", cancelledBy: actor },
  });
  if (flipped.count === 0) {
    // AC-18.3: cancelling a COMPLETED (or already CANCELLED) tx is a no-op.
    return { transactionId, alreadyCancelled: true };
  }

  const current = await tx.marketplaceTransaction.findUnique({
    where: { id: transactionId },
  });
  const listing = await tx.marketplaceListing.findUnique({
    where: { id: current!.listingId },
  });
  const nextQuantity = listing!.quantity + current!.quantity;
  await tx.marketplaceListing.update({
    where: { id: current!.listingId },
    data: {
      quantity: nextQuantity,
      status: nextQuantity > 0 ? "ACTIVE" : listing!.status,
    },
  });

  return { transactionId, alreadyCancelled: false, status: "CANCELLED" };
}

/**
 * cancelTransaction (REQ-18): release a reservation and restore listing
 * quantity. `actor` encodes the caller role (route enforces caller-is-a-party).
 */
export async function cancelTransaction(
  transactionId: string,
  actor: string
): Promise<CancelTransactionResult> {
  if (!isValidCancelActor(actor)) {
    throw new MarketplaceError(400, "Invalid cancel actor");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!existing) throw new MarketplaceError(404, "Transaction not found");

    await lockInventoryEntry(tx, existing.sellerId, existing.cardId);

    const outcome = await cancelPendingWithTx(tx, transactionId, actor);
    return {
      transactionId: outcome.transactionId,
      alreadyCancelled: outcome.alreadyCancelled,
      status: outcome.status,
    };
  });
}

/**
 * autoTransferDue (REQ-17): sweep PENDING_CONFIRMATION transactions whose
 * `soldAt` is at least 30 days old (A4), confirming each with
 * `cause = AUTO_TRANSFER`. Idempotent (CAS), bounded to one batch per tick, and
 * logs per-item failures so the next tick can retry.
 */
export async function autoTransferDue(
  now: Date = new Date()
): Promise<AutoTransferResult> {
  const cutoff = new Date(now.getTime() - AUTO_TRANSFER_AGE_MS);
  const due = await prisma.marketplaceTransaction.findMany({
    where: { status: "PENDING_CONFIRMATION", soldAt: { lte: cutoff } },
    select: { id: true },
    orderBy: { soldAt: "asc" },
    take: AUTO_TRANSFER_BATCH_SIZE,
  });

  let completed = 0;
  let alreadyCompleted = 0;
  let failed = 0;
  const failures: { transactionId: string; error: string }[] = [];

  for (const row of due) {
    try {
      const result = await confirmTransfer(row.id, "AUTO_TRANSFER");
      if (result.alreadyCompleted) {
        alreadyCompleted += 1;
      } else {
        completed += 1;
      }
    } catch (error) {
      failed += 1;
      failures.push({
        transactionId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`autoTransferDue: confirmTransfer failed for ${row.id}:`, error);
    }
  }

  console.log(
    `autoTransferDue: due=${due.length} completed=${completed} ` +
      `alreadyCompleted=${alreadyCompleted} failed=${failed}`
  );
  return { due: due.length, completed, alreadyCompleted, failed, failures };
}

/**
 * disableUser (REQ-24): set `disabledAt` and auto-cancel every PENDING_CONFIRMATION
 * transaction where the user is buyer OR seller, with actor SYSTEM (AC-24.1).
 * Wrapped in one transaction.
 */
export async function disableUser(userId: string): Promise<DisableUserResult> {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { disabledAt: new Date() },
    });

    const pending = await tx.marketplaceTransaction.findMany({
      where: {
        status: "PENDING_CONFIRMATION",
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      select: { id: true, sellerId: true, cardId: true },
    });

    let cancelled = 0;
    for (const row of pending) {
      await lockInventoryEntry(tx, row.sellerId, row.cardId);
      const outcome = await cancelPendingWithTx(tx, row.id, "SYSTEM");
      if (!outcome.alreadyCancelled) cancelled += 1;
    }

    return { userId, cancelled };
  });
}
