import { useEffect, useState } from "react";
import { extrasForSale as extrasApi, inventory as inventoryApi } from "../services/api";
import type { CardRetentionOverrideListItem, ExtraForSaleListing, InventoryExtrasCard, InventoryPolicy, InventoryVariant, ListingCurrency } from "../types";
import SuggestedExtrasPanel from "../components/extras/SuggestedExtrasPanel";
import ActiveExtrasListingsPanel from "../components/extras/ActiveExtrasListingsPanel";
import ManualOverridesPanel from "../components/extras/ManualOverridesPanel";
import ExtrasSettingsPanel from "../components/extras/ExtrasSettingsPanel";
import { useAuth } from "../context/AuthContext";

const defaultPolicy: InventoryPolicy = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
  autoSuggestExtras: true,
};

type ExtrasTab = "suggested" | "listings" | "overrides" | "settings";

export default function ExtrasForSalePage() {
  const { user } = useAuth();
  const canListExtras = Boolean(user?.emailVerifiedAt);
  const [tab, setTab] = useState<ExtrasTab>("suggested");
  const [policy, setPolicy] = useState<InventoryPolicy>(defaultPolicy);
  const [extras, setExtras] = useState<InventoryExtrasCard[]>([]);
  const [listings, setListings] = useState<ExtraForSaleListing[]>([]);
  const [overrides, setOverrides] = useState<CardRetentionOverrideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [extrasData, listingsData, overridesData] = await Promise.all([
        inventoryApi.getExtras(),
        extrasApi.list(),
        inventoryApi.listRetentionOverrides(),
      ]);
      setPolicy(extrasData.policy);
      setExtras(extrasData.cards);
      setListings(listingsData.listings);
      setOverrides(overridesData.overrides);
    } catch (err: any) {
      setError(err?.message || "Failed to load Extras for Sale");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const savePolicy = async (nextPolicy: InventoryPolicy) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      setPolicy(await inventoryApi.updatePolicy(nextPolicy));
      setSuccess("Extras settings saved");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save extras settings");
    } finally {
      setSaving(false);
    }
  };

  const createListing = async (item: InventoryExtrasCard, variant: InventoryVariant, desiredQuantity: number, note: string, customPrice: number | null, customPriceCurrency: ListingCurrency) => {
    if (!canListExtras) {
      setError("Verify your Google email before listing extras for sale.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await extrasApi.create({ cardId: item.card.id, variant, desiredQuantity, note: note || null, customPrice, customPriceCurrency });
      setSuccess("Extra listed for sale");
      setTab("listings");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to list extra");
    } finally {
      setSaving(false);
    }
  };

  const updateListing = async (id: string, data: { note: string | null; customPrice: number | null; customPriceCurrency: ListingCurrency }) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await extrasApi.update(id, data);
      setSuccess("Listing updated");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update listing");
    } finally {
      setSaving(false);
    }
  };

  const saveOverride = async (item: InventoryExtrasCard, keep: { keepNormalQuantity: number; keepFoilQuantity: number; keepHolofoilQuantity: number }) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await inventoryApi.updateRetentionOverride(item.card.id, keep);
      setSuccess("Keep override saved");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save keep override");
    } finally {
      setSaving(false);
    }
  };

  const updateOverride = async (cardId: string, keep: { keepNormalQuantity: number; keepFoilQuantity: number; keepHolofoilQuantity: number }) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await inventoryApi.updateRetentionOverride(cardId, keep);
      setSuccess("Keep override saved");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save keep override");
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async (cardId: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await inventoryApi.deleteRetentionOverride(cardId);
      setSuccess("Keep override removed");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to remove keep override");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: "active" | "paused") => {
    setSaving(true);
    setError(null);
    try {
      await extrasApi.update(id, { status });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update listing");
    } finally {
      setSaving(false);
    }
  };

  const removeListing = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await extrasApi.remove(id);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to remove listing");
    } finally {
      setSaving(false);
    }
  };

  const listAll = async () => {
    if (!canListExtras) {
      setError("Verify your Google email before listing extras for sale.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await extrasApi.listAll();
      const summary = `Listed ${result.created} extra${result.created === 1 ? "" : "s"} for sale`;
      setSuccess(result.skipped ? `${summary} (${result.skipped} already listed)` : summary);
      setTab("listings");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to list all extras");
    } finally {
      setSaving(false);
    }
  };

  const tabButton = (value: ExtrasTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === value ? "border-amber-400 text-amber-300" : "border-transparent text-gray-400 hover:text-gray-200"}`}
    >
      {label}
    </button>
  );

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Extras for Sale</h2>
          <p className="mt-1 text-sm text-gray-400">Suggested Extras stay private. Only explicit listings can appear publicly.</p>
        </div>
        <button
          type="button"
          onClick={listAll}
          disabled={saving || !canListExtras}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {saving ? "Listing..." : canListExtras ? "List all extras" : "Verify email to list"}
        </button>
      </div>
      {!canListExtras && (
        <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
          Verify your Google email before selling, buying, contacting others, or listing your profile.
        </div>
      )}
      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{success}</div>}
      {saving && <div className="text-sm text-gray-400">Saving...</div>}

      <div className="border-b border-gray-800">
        {tabButton("suggested", "Suggested Extras")}
        {tabButton("listings", "Extras for Sale")}
        {tabButton("overrides", "Manual Overrides")}
        {tabButton("settings", "Settings")}
      </div>

      {tab === "suggested" ? (
        <SuggestedExtrasPanel cards={extras} autoSuggestExtras={policy.autoSuggestExtras} canList={canListExtras} onList={createListing} onOverride={saveOverride} />
      ) : tab === "listings" ? (
        <ActiveExtrasListingsPanel listings={listings} onStatusChange={updateStatus} onRemove={removeListing} onEdit={updateListing} />
      ) : tab === "overrides" ? (
        <ManualOverridesPanel overrides={overrides} policy={policy} onSave={updateOverride} onRemove={removeOverride} />
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <ExtrasSettingsPanel policy={policy} saving={saving} onSave={savePolicy} />
        </div>
      )}
    </div>
  );
}
