import type {
  Card,
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
  MarketplaceTransaction,
} from "../types";
import { availableInventoryVariants } from "./cardVariants";
import { filterOwnedInventory } from "./listingPicker";

/**
 * Candidate maths for bulk listing of NORMAL-printing spares (REQ-BULK-3,
 * design AD-5/§5.2). Pure and synchronous: no React, no network.
 *
 * `surplusByCardId` cannot be reused here because it sums across normal + foil
 * + holofoil; bulk listing only ever creates `normal` listings, so a card whose
 * only spares are foil/holofoil must never become a candidate row.
 */

export interface BulkCandidate {
  card: Card;
  entry: InventoryEntry;
  /** max(0, entry.quantity - policy.keepNormalQuantity). */
  normalSpare: number;
  /** owned - reserved - listedElsewhere (normal variant only). */
  availableEstimate: number;
  /** min(normalSpare, availableEstimate), always >= 1 for a candidate. */
  quantity: number;
  /** quantity < normalSpare → the row renders "capped from N spares". */
  capped: boolean;
}

export type BulkSkipReason =
  | "already listed"
  | "no copies available (reserved or listed elsewhere)";

export interface BulkSkip {
  card: Card;
  entry: InventoryEntry;
  reason: BulkSkipReason;
}

export interface BulkCandidateSet {
  /** Cards with a normal spare above the keep policy and a `normal` variant. */
  matches: BulkCandidate[];
  /** Matches that cannot be created (already listed / no copies available). */
  skipped: BulkSkip[];
  /** Filter-matching owned cards whose only spares are foil/holofoil. */
  excludedVariantOnlyCount: number;
}

export type BulkCreateOutcome =
  | { status: "created"; listing: MarketplaceListing }
  | { status: "skipped"; reason: "already listed" }
  | {
      status: "failed";
      error: string;
      /** HTTP status when the failure came from the API (401 stops a run). */
      httpStatus?: number;
    };

/** Wire shape of the server's 200 skip response for the bulk caller (design §4.2). */
export interface BulkSkippedListingResponse {
  skipped: true;
  reason: "already listed";
  listing: null;
}

export interface BulkListingCandidateInput {
  /** Full inventory already held by the sell page. */
  inventory: InventoryEntry[];
  policy: InventoryPolicy | null;
  /** The seller's own listings from `getMyListings()` (includes hidden rows). */
  ownListings: MarketplaceListing[];
  /**
   * Seller-side PENDING_CONFIRMATION transactions. When `sellerId` is supplied
   * these are additionally filtered here; the sell page already filters them.
   */
  pendingTransactions: MarketplaceTransaction[];
  /** Bulk picker filters; the `spares` key is ignored (forced on by design). */
  filters: Record<string, string>;
  sellerId?: string;
}

/** Sum of a seller's non-hidden normal listings for one card (PI-1: any status). */
function listedElsewhereFor(cardId: string, ownListings: MarketplaceListing[]): number {
  return ownListings
    .filter(
      (listing) =>
        listing.cardId === cardId && listing.variant === "normal" && listing.hiddenAt === null
    )
    .reduce((total, listing) => total + listing.quantity, 0);
}

/** Sum of the seller's pending-sale quantities for one card's normal variant. */
function reservedFor(
  cardId: string,
  pendingTransactions: MarketplaceTransaction[],
  sellerId?: string
): number {
  return pendingTransactions
    .filter(
      (transaction) =>
        (sellerId == null || transaction.sellerId === sellerId) &&
        transaction.cardId === cardId &&
        transaction.variant === "normal"
    )
    .reduce((total, transaction) => total + transaction.quantity, 0);
}

export function bulkListingCandidates(input: BulkListingCandidateInput): BulkCandidateSet {
  const { inventory, policy, ownListings, pendingTransactions, filters, sellerId } = input;

  // The `spares` filter is forced on by the bulk flow but its cross-variant
  // meaning does not apply: the normal-only gate is applied explicitly below.
  // Dropping the key reuses `filterOwnedInventory` minus its spares gate.
  const { spares: _spares, ...nonSpareFilters } = filters;

  // One row per card by construction (AC-BULK-9.2).
  const base = new Map<string, InventoryEntry>();
  for (const entry of filterOwnedInventory(inventory, nonSpareFilters)) {
    if (!base.has(entry.cardId)) base.set(entry.cardId, entry);
  }

  const matches: BulkCandidate[] = [];
  const skipped: BulkSkip[] = [];
  let excludedVariantOnlyCount = 0;

  for (const entry of base.values()) {
    // policy === null → no spares (the flow is unreachable without a policy).
    const normalSpare = policy ? Math.max(0, entry.quantity - policy.keepNormalQuantity) : 0;
    const foilSpare = policy ? Math.max(0, entry.foilQuantity - policy.keepFoilQuantity) : 0;
    const holofoilSpare = policy
      ? Math.max(0, entry.holofoilQuantity - policy.keepHolofoilQuantity)
      : 0;

    if (normalSpare === 0) {
      if (foilSpare > 0 || holofoilSpare > 0) excludedVariantOnlyCount += 1;
      continue;
    }
    if (!availableInventoryVariants(entry.card).includes("normal")) continue;

    const listedElsewhere = listedElsewhereFor(entry.cardId, ownListings);
    const reserved = reservedFor(entry.cardId, pendingTransactions, sellerId);
    const availableEstimate = entry.quantity - reserved - listedElsewhere;

    // Order matters: an already-listed card reports "already listed" even when
    // its availability estimate has also collapsed (PI-1 / E8).
    if (listedElsewhere > 0) {
      skipped.push({ card: entry.card, entry, reason: "already listed" });
      continue;
    }
    if (availableEstimate <= 0) {
      skipped.push({
        card: entry.card,
        entry,
        reason: "no copies available (reserved or listed elsewhere)",
      });
      continue;
    }

    const quantity = Math.min(normalSpare, availableEstimate);
    matches.push({
      card: entry.card,
      entry,
      normalSpare,
      availableEstimate,
      quantity,
      capped: quantity < normalSpare,
    });
  }

  return { matches, skipped, excludedVariantOnlyCount };
}
