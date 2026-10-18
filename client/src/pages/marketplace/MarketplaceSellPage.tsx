import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import ListingForm from "../../components/marketplace/ListingForm";
import { inventory as inventoryApi, marketplace } from "../../services/api";
import type {
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
  MarketplaceListingDetail,
} from "../../types";
import {
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../../utils/marketplaceParams";

/**
 * Sell surface (REQ-3/4/5/6/7/8): my listings plus the create/edit form.
 * "My listings" is sourced from the browse endpoint filtered by `sellerId`
 * (the frozen §7 contract has no dedicated "my listings" endpoint, so CLOSED /
 * sold-out listings are not enumerable here — see the F2 discrepancy note).
 * Each listing's `pendingQuantity` (from its detail view) drives the
 * locked-fields state (REQ-8).
 */
export default function MarketplaceSellPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [policy, setPolicy] = useState<InventoryPolicy | null>(null);
  const [listings, setListings] = useState<MarketplaceListingDetail[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [inv, pol, mine] = await Promise.all([
        inventoryApi.list(),
        inventoryApi.getPolicy().catch(() => null),
        (async () => {
          const { listings } = await marketplace.listings({ sellerId: user.id, limit: 100 });
          return Promise.all(listings.map((listing) => marketplace.listing(listing.id)));
        })(),
      ]);
      setInventory(inv);
      setPolicy(pol);
      setListings(mine);
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

  const editingListing = editingId ? listings?.find((l) => l.id === editingId) ?? null : null;

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400">Sell</p>
            <h1 className="text-2xl font-bold text-gray-100">Your listings</h1>
          </div>
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

        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {creating && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <h2 className="text-lg font-semibold text-gray-100">Create a listing</h2>
            <div className="mt-4">
              <ListingForm
                mode="create"
                inventory={inventory}
                policy={policy}
                onSaved={() => {
                  setCreating(false);
                  void load();
                }}
                onCancel={() => setCreating(false)}
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
                locked={editingListing.pendingQuantity > 0}
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
            You have no active listings. Create one to start selling.
          </div>
        ) : (
          <ul className="space-y-2">
            {listings.map((listing) => {
              const locked = listing.pendingQuantity > 0;
              return (
                <li
                  key={listing.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-gray-100">
                        {listing.card?.name ?? "Card"}
                      </span>
                      {listing.status === "CLOSED" && (
                        <span className="shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400">
                          Closed
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-400">
                      {marketplaceVariantLabel(listing.variant)} · Qty {listing.quantity} ·{" "}
                      {formatPriceMinor(listing.priceMinor, listing.currency)}
                    </p>
                    {locked && (
                      <p className="mt-0.5 text-xs text-amber-300">
                        {listing.pendingQuantity} pending sale — price/quantity locked
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setEditingId(listing.id);
                    }}
                    className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500"
                  >
                    Edit
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </RequireAuth>
  );
}
