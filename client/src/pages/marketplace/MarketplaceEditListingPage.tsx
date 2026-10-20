import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import ListingForm from "../../components/marketplace/ListingForm";
import { inventory as inventoryApi, marketplace } from "../../services/api";
import type {
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
} from "../../types";

/**
 * Dedicated edit-listing page (REQ-LC-6, AC-LC-6): hydrates the seller's own
 * listing from `getMyListings()` so `card.prices` is available for the TCG
 * reference (TD-1) — `marketplace.listing(id)` is deliberately never called.
 * Inventory + keep policy are loaded for `ListingForm` parity (TD-3) and pending
 * seller transactions for the lock rule (TD-2), all in one batch so the form
 * never mounts with partial data (TD-4). Unknown/foreign/hidden ids replace-
 * redirect to the listings surface with no form and no flash (TD-6).
 */
export default function MarketplaceEditListingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [policy, setPolicy] = useState<InventoryPolicy | null>(null);
  const [pendingListingIds, setPendingListingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [mine, inv, pol, pendingTransactions] = await Promise.all([
        marketplace.getMyListings(),
        inventoryApi.list(),
        inventoryApi.getPolicy().catch(() => null),
        marketplace.getTransactions("PENDING_CONFIRMATION"),
      ]);
      setListing(mine.listings.find((item) => item.id === id) ?? null);
      setInventory(inv);
      setPolicy(pol);
      setPendingListingIds(
        new Set(
          pendingTransactions.transactions
            .filter((transaction) => transaction.sellerId === user.id)
            .map((transaction) => transaction.listingId)
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // A hidden row is returned by /mine but is not editable (UX §13.10 / S22).
  const found =
    listing && listing.hiddenAt == null && listing.id === id ? listing : null;
  const notFound = !loading && !error && !found;

  useEffect(() => {
    if (notFound && user) {
      navigate("/marketplace/sell", { replace: true });
    }
  }, [notFound, user, navigate]);

  const locked = found ? found.status !== "ACTIVE" || pendingListingIds.has(found.id) : false;

  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400">Sell</p>
            <h1 className="text-2xl font-bold text-gray-100">Edit listing</h1>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
            Loading listing…
          </div>
        ) : found ? (
          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <h2 className="text-lg font-semibold text-gray-100">Listing details</h2>
            <div className="mt-4">
              <ListingForm
                mode="edit"
                listing={found}
                locked={locked}
                inventory={inventory}
                policy={policy}
                onSaved={() => navigate("/marketplace/sell")}
                onDeleted={() => navigate("/marketplace/sell")}
                onCancel={() => navigate("/marketplace/sell")}
              />
            </div>
          </section>
        ) : null}
      </div>
    </RequireAuth>
  );
}
