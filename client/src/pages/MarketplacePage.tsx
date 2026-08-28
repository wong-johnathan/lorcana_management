import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import type { InventoryVariant, MarketplaceListParams, MarketplaceListResponse } from "../types";
import MarketplaceCardResult from "../components/marketplace/MarketplaceCardResult";

const variants: Array<{ value: "" | InventoryVariant; label: string }> = [
  { value: "", label: "Any variant" },
  { value: "normal", label: "Normal" },
  { value: "foil", label: "Foil" },
  { value: "holofoil", label: "Holofoil" },
];

function paramsFromSearch(searchParams: URLSearchParams): MarketplaceListParams {
  const params: MarketplaceListParams = { availableOnly: "true" };
  ["search", "set", "rarity", "color", "variant"].forEach((key) => {
    const value = searchParams.get(key);
    if (value) (params as Record<string, string>)[key] = value;
  });
  return params;
}

export default function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<MarketplaceListParams>(() => paramsFromSearch(searchParams));
  const [data, setData] = useState<MarketplaceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextFilters = paramsFromSearch(searchParams);
    setFilters(nextFilters);
    setLoading(true);
    setError(null);
    marketplaceApi
      .list(nextFilters)
      .then(setData)
      .catch((err: any) => setError(err?.message || "Failed to load marketplace"))
      .finally(() => setLoading(false));
  }, [searchParams]);

  const updateFilter = (key: keyof MarketplaceListParams, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    setSearchParams(params);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-gray-100">Marketplace</h2>
        <p className="mt-1 text-sm text-gray-400">Search exact Lorcana printings and compare globally published extras.</p>
      </div>

      <form onSubmit={submitSearch} className="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label htmlFor="marketplace-search" className="mb-1 block text-sm text-gray-300">Search marketplace</label>
          <input
            id="marketplace-search"
            value={filters.search ?? ""}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Card name, subtitle, collector number"
            className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
          />
        </div>
        <div>
          <label htmlFor="marketplace-variant" className="mb-1 block text-sm text-gray-300">Variant</label>
          <select id="marketplace-variant" value={filters.variant ?? ""} onChange={(event) => updateFilter("variant", event.target.value)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100">
            {variants.map((variant) => <option key={variant.value} value={variant.value}>{variant.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="w-full rounded bg-amber-500 px-4 py-2 font-semibold text-gray-950 hover:bg-amber-400">Search</button>
        </div>
      </form>

      {loading && <div className="py-12 text-center text-gray-400">Loading marketplace...</div>}
      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      {!loading && !error && data?.results.length === 0 && <div className="py-12 text-center text-gray-500">No marketplace offers found.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.results.map((result) => <MarketplaceCardResult key={`${result.card.id}-${result.variant}`} result={result} />)}
      </div>
    </div>
  );
}
