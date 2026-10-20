import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import MarketplaceImage from "../../components/marketplace/MarketplaceImage";
import BulkListingSection, {
  type BulkPhase,
} from "../../components/marketplace/BulkListingSection";
import { inventory as inventoryApi, marketplace } from "../../services/api";
import type {
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
  MarketplaceTransaction,
} from "../../types";
import { cardArtUrl } from "../../utils/cardImages";
import {
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../../utils/marketplaceParams";

/**
 * Sell surface (REQ-LC-8): the seller's own listings grid plus the in-page
 * bulk-listing flow (REQ-BULK-1). Creating and editing live on their own routed
 * pages (`/marketplace/sell/new`, `/marketplace/sell/:id/edit`), linked from the
 * header and from each tile.
 *
 * "My listings" is sourced from `GET /marketplace/listings/mine`, which lists
 * the seller's own listings including CLOSED / sold-out rows that the public
 * browse feed excludes (D2). Locked tiles (REQ-8) are driven by the listing's
 * status (a CLOSED listing can no longer be re-priced/re-quantified) plus any
 * PENDING_CONFIRMATION transaction on the listing (from `GET /transactions`).
 */
export default function MarketplaceSellPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [policy, setPolicy] = useState<InventoryPolicy | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);
  const [pendingListingIds, setPendingListingIds] = useState<Set<string>>(new Set());
  /**
   * Raw seller-side pending transactions, kept for the bulk candidate maths
   * (design §7.1): `reserved` needs cardId/variant/quantity, not just ids.
   */
  const [pendingTransactions, setPendingTransactions] = useState<MarketplaceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPhase, setBulkPhase] = useState<BulkPhase>("choose");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bulkEntryRef = useRef<HTMLButtonElement>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [inv, pol, mine, pending] = await Promise.all([
        inventoryApi.list(),
        inventoryApi.getPolicy().catch(() => null),
        marketplace.getMyListings(),
        marketplace.getTransactions("PENDING_CONFIRMATION"),
      ]);
      const sellerPending = pending.transactions.filter(
        (transaction) => transaction.sellerId === user.id
      );
      setInventory(inv);
      setPolicy(pol);
      setListings(mine.listings);
      setPendingTransactions(sellerPending);
      setPendingListingIds(new Set(sellerPending.map((transaction) => transaction.listingId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your listings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const isLocked = (listing: MarketplaceListing) =>
    listing.status !== "ACTIVE" || pendingListingIds.has(listing.id);

  // AC-BULK-10.1/10.5: the entry is disabled until the page's data is usable,
  // and the reason is always visible text (never a title/tooltip only).
  const bulkDisabledReason = loading
    ? "Loading your collection…"
    : error
      ? null
      : policy === null
        ? "Bulk listing needs your keep policy — it defines what counts as a spare"
        : null;
  const bulkEntryDisabled = loading || Boolean(error) || policy === null;

  const openBulk = () => {
    setBulkOpen(true);
  };

  const closeBulk = () => {
    setBulkOpen(false);
    setBulkPhase("choose");
  };

  const bulkHidesListings = bulkOpen && bulkPhase !== "results";

  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400">Sell</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-bold text-gray-100 focus:outline-none"
            >
              Your listings
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              <Link
                to="/marketplace/transactions"
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                Transactions
              </Link>
              {!bulkOpen && (
                <button
                  ref={bulkEntryRef}
                  type="button"
                  onClick={openBulk}
                  disabled={bulkEntryDisabled}
                  aria-describedby={
                    bulkEntryDisabled ? (error ? "sell-error-banner" : "bulk-entry-reason") : undefined
                  }
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-400 disabled:hover:border-gray-800"
                >
                  Bulk list spares
                </button>
              )}
              <Link
                to="/marketplace/sell/new"
                className="inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400"
              >
                Create listing
              </Link>
            </div>
            {bulkDisabledReason ? (
              <p id="bulk-entry-reason" className="max-w-[34ch] text-right text-xs text-gray-400">
                {bulkDisabledReason}
              </p>
            ) : null}
          </div>
        </div>

        {error && (
          <div
            id="sell-error-banner"
            className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {bulkOpen && (
          <BulkListingSection
            inventory={inventory}
            policy={policy}
            ownListings={listings ?? []}
            pendingTransactions={pendingTransactions}
            onCancel={() => {
              closeBulk();
              bulkEntryRef.current?.focus();
            }}
            onDone={() => {
              closeBulk();
              headingRef.current?.focus();
            }}
            onRefresh={load}
            onPhaseChange={setBulkPhase}
          />
        )}

        {bulkHidesListings ? null : loading ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
            Loading your listings…
          </div>
        ) : !listings || listings.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
            You have no listings yet. Create one to start selling.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing) => {
              const locked = isLocked(listing);
              const card = listing.card;
              const artSrc = card ? cardArtUrl(card) : "";
              const hasSource = !!card?.imageUrl;
              const name = card?.name ?? "Card";
              return (
                <div
                  key={listing.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60"
                >
                  <div className="relative aspect-[5/7] w-full overflow-hidden bg-gray-800">
                    <MarketplaceImage
                      src={artSrc}
                      alt={name}
                      hasSource={hasSource}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col gap-1 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-gray-100">{name}</span>
                      {listing.status === "CLOSED" && (
                        <span className="shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400">
                          Closed
                        </span>
                      )}
                    </div>
                    {card?.setName && (
                      <p className="truncate text-xs text-gray-400">
                        {card.setName}
                        {card.cardNumber ? ` · ${card.cardNumber}` : ""}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      {marketplaceVariantLabel(listing.variant)} · Qty {listing.quantity} ·{" "}
                      {formatPriceMinor(listing.priceMinor, listing.currency)}
                    </p>
                    {locked && (
                      <p className="text-xs text-amber-300">
                        {listing.status === "CLOSED"
                          ? "Sold out — price/quantity locked"
                          : "Pending sale — price/quantity locked"}
                      </p>
                    )}
                    <Link
                      to={`/marketplace/sell/${listing.id}/edit`}
                      aria-label={`Edit listing: ${name}, ${marketplaceVariantLabel(listing.variant)}`}
                      className="mt-2 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 text-center"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
