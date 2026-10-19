import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import ListingForm from "../../components/marketplace/ListingForm";
import ListingPicker from "../../components/marketplace/ListingPicker";
import MarketplaceImage from "../../components/marketplace/MarketplaceImage";
import ListingImageCarousel from "../../components/marketplace/ListingImageCarousel";
import { inventory as inventoryApi, marketplace } from "../../services/api";
import type {
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
} from "../../types";
import { cardArtUrl } from "../../utils/cardImages";
import { listingImageItems } from "../../utils/listingImages";
import {
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../../utils/marketplaceParams";

/**
 * Sell surface (REQ-3/4/5/6/7/8): my listings plus the create/edit form.
 * "My listings" is sourced from `GET /marketplace/listings/mine`, which lists
 * the seller's own listings including CLOSED / sold-out rows that the public
 * browse feed excludes (D2). Locked fields (REQ-8) are driven by the listing's
 * status (a CLOSED listing can no longer be re-priced/re-quantified) plus any
 * PENDING_CONFIRMATION transaction on the listing (from `GET /transactions`).
 */
export default function MarketplaceSellPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [policy, setPolicy] = useState<InventoryPolicy | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);
  const [pendingListingIds, setPendingListingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pickerFilters, setPickerFilters] = useState<Record<string, string>>({});
  const [carousel, setCarousel] = useState<{
    listing: MarketplaceListing;
    startIndex: number;
  } | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [inv, pol, mine, pendingTransactions] = await Promise.all([
        inventoryApi.list(),
        inventoryApi.getPolicy().catch(() => null),
        marketplace.getMyListings(),
        marketplace.getTransactions("PENDING_CONFIRMATION"),
      ]);
      setInventory(inv);
      setPolicy(pol);
      setListings(mine.listings);
      setPendingListingIds(
        new Set(
          pendingTransactions.transactions
            .filter((transaction) => transaction.sellerId === user.id)
            .map((transaction) => transaction.listingId)
        )
      );
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

  const editingListing = editingId ? listings?.find((l) => l.id === editingId) ?? null : null;

  const cancelCreate = () => {
    setCreating(false);
    setSelectedCardId(null);
    setPickerFilters({});
  };

  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400">Sell</p>
            <h1 className="text-2xl font-bold text-gray-100">Your listings</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/marketplace/transactions"
              className="text-sm text-amber-400 hover:text-amber-300"
            >
              Transactions
            </Link>
            {!creating && !editingId && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400"
              >
                Create listing
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {creating && !selectedCardId && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <h2 className="text-lg font-semibold text-gray-100">Create a listing</h2>
            <div className="mt-4">
              <ListingPicker
                inventory={inventory}
                policy={policy}
                loading={loading}
                filters={pickerFilters}
                onFiltersChange={setPickerFilters}
                onSelectCard={(card) => setSelectedCardId(card.id)}
                onCancel={cancelCreate}
              />
            </div>
          </section>
        )}

        {creating && selectedCardId && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <h2 className="text-lg font-semibold text-gray-100">Create a listing</h2>
            <div className="mt-4">
              <ListingForm
                mode="create"
                preselectedCardId={selectedCardId}
                inventory={inventory}
                policy={policy}
                onBack={() => setSelectedCardId(null)}
                onSaved={() => {
                  setCreating(false);
                  setSelectedCardId(null);
                  setPickerFilters({});
                  void load();
                }}
                onCancel={cancelCreate}
              />
            </div>
          </section>
        )}

        {editingListing && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <h2 className="text-lg font-semibold text-gray-100">Edit listing</h2>
            <div className="mt-4">
              <ListingForm
                mode="edit"
                listing={editingListing}
                locked={isLocked(editingListing)}
                inventory={inventory}
                policy={policy}
                onSaved={() => {
                  setEditingId(null);
                  void load();
                }}
                onDeleted={() => {
                  setEditingId(null);
                  void load();
                }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          </section>
        )}

        {loading ? (
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
              const images = listingImageItems(card, listing.photos);
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
                      onOpen={
                        images.length > 0
                          ? () => setCarousel({ listing, startIndex: 0 })
                          : undefined
                      }
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
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setEditingId(listing.id);
                      }}
                      className="mt-2 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {carousel && (
        <ListingImageCarousel
          images={listingImageItems(carousel.listing.card, carousel.listing.photos)}
          startIndex={carousel.startIndex}
          onClose={() => setCarousel(null)}
        />
      )}
    </RequireAuth>
  );
}
