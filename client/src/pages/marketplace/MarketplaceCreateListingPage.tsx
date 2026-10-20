import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import ListingForm from "../../components/marketplace/ListingForm";
import ListingPicker from "../../components/marketplace/ListingPicker";
import { inventory as inventoryApi, marketplace } from "../../services/api";
import { listedCardIdSet } from "../../utils/listingPicker";
import type { InventoryEntry, InventoryPolicy } from "../../types";

/**
 * Dedicated create-listing page (REQ-LC-1..4, AC-LC-2/3): the two-step flow
 * that used to be inlined on the sell page. Step 1 picks an owned card, step 2
 * is the unchanged create-mode `ListingForm`. It fetches the collection
 * (inventory + keep policy) plus the seller's own listings, which drive the
 * picker's default "Unlisted only" filter — a failed listings fetch degrades to
 * "nothing is listed". Step 2's card and the picker filters are page-local, so
 * a remount always returns to step 1 (AC-LC-4.3).
 */
export default function MarketplaceCreateListingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [policy, setPolicy] = useState<InventoryPolicy | null>(null);
  const [listedCardIds, setListedCardIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pickerFilters, setPickerFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // TD-4 — one parallel batch; a failed keep policy or listings fetch is tolerated.
      const [inv, pol, mine] = await Promise.all([
        inventoryApi.list(),
        inventoryApi.getPolicy().catch(() => null),
        marketplace.getMyListings().catch(() => null),
      ]);
      setInventory(inv);
      setPolicy(pol);
      setListedCardIds(listedCardIdSet(mine?.listings ?? []));
    } catch {
      setError("Couldn't load your collection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const cancel = () => navigate("/marketplace/sell");

  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400">Sell</p>
            <h1 className="text-2xl font-bold text-gray-100">Create a listing</h1>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : selectedCardId ? (
          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <h2 className="text-lg font-semibold text-gray-100">Listing details</h2>
            <div className="mt-4">
              <ListingForm
                mode="create"
                preselectedCardId={selectedCardId}
                inventory={inventory}
                policy={policy}
                onBack={() => setSelectedCardId(null)}
                onSaved={cancel}
                onCancel={cancel}
              />
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <ListingPicker
              inventory={inventory}
              policy={policy}
              loading={loading}
              listedCardIds={listedCardIds}
              filters={pickerFilters}
              onFiltersChange={setPickerFilters}
              onSelectCard={(card) => setSelectedCardId(card.id)}
              onCancel={cancel}
            />
          </section>
        )}
      </div>
    </RequireAuth>
  );
}
