import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import type { InventoryVariant, MarketplaceListParams, MarketplaceListResponse } from "../types";
import MarketplaceListingCard from "../components/marketplace/MarketplaceListingCard";

const SEARCH_DEBOUNCE_MS = 500;
const DEFAULT_FILTERS: MarketplaceListParams = { availableOnly: "true" };
const queryParamKeys: Array<keyof MarketplaceListParams> = [
  "search",
  "set",
  "rarity",
  "color",
  "variant",
];

const variants: Array<{ value: "" | InventoryVariant; label: string }> = [
  { value: "", label: "Any variant" },
  { value: "normal", label: "Normal" },
  { value: "foil", label: "Foil" },
  { value: "holofoil", label: "Holofoil" },
];

function paramsFromSearch(searchParams: URLSearchParams): MarketplaceListParams {
  const params: MarketplaceListParams = { availableOnly: searchParams.get("availableOnly") || "true" };
  queryParamKeys.forEach((key) => {
    const value = searchParams.get(key);
    if (value) (params as Record<string, string>)[key] = value;
  });
  return params;
}

function searchParamsFromFilters(filters: MarketplaceListParams): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

function hasActiveFilters(filters: MarketplaceListParams): boolean {
  return Object.entries(filters).some(([key, value]) => key !== "availableOnly" && Boolean(value));
}

function filtersEqual(left: MarketplaceListParams, right: MarketplaceListParams): boolean {
  return (["availableOnly", ...queryParamKeys] as Array<keyof MarketplaceListParams>).every(
    (key) => (left[key] || "") === (right[key] || "")
  );
}

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<MarketplaceListParams>(() => paramsFromSearch(searchParams));
  const [data, setData] = useState<MarketplaceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!filtersEqual(filters, paramsFromSearch(searchParams))) {
        setSearchParams(searchParamsFromFilters(filters), { replace: true });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [filters, searchParams, setSearchParams]);

  const updateFilter = (key: keyof MarketplaceListParams, value: string, applyImmediately = false) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    if (applyImmediately) {
      setSearchParams(searchParamsFromFilters(nextFilters), { replace: true });
    }
  };

  const clearSearch = () => {
    const nextParams = searchParamsFromFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setSearchParams(nextParams, { replace: true });
  };

  const activeFilters = hasActiveFilters(filters);

  const listings = useMemo(
    () => (data?.results ?? []).flatMap((group) => group.offers.map((offer) => ({ card: group.card, offer }))),
    [data]
  );

  const startChat = async (listingId: string) => {
    setOpeningId(listingId);
    setError(null);
    try {
      const response = await marketplaceApi.createEnquiry(listingId, {});
      navigate(`/marketplace/enquiries/${response.enquiry.id}`);
    } catch (err: any) {
      if (err?.status === 409 && err?.body?.enquiryId) {
        navigate(`/marketplace/enquiries/${err.body.enquiryId}`);
        return;
      }
      setError(err?.message || "Failed to start chat");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-gray-100">Marketplace</h2>
        <p className="mt-1 text-sm text-gray-400">Browse what other players are selling and chat directly.</p>
      </div>

      <form onSubmit={(event) => event.preventDefault()} className="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label htmlFor="marketplace-search" className="mb-1 block text-sm text-gray-300">Search</label>
          <input
            id="marketplace-search"
            value={filters.search ?? ""}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Card name or subtitle"
            className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
          />
        </div>
        <div>
          <label htmlFor="marketplace-variant" className="mb-1 block text-sm text-gray-300">Variant</label>
          <select id="marketplace-variant" value={filters.variant ?? ""} onChange={(event) => updateFilter("variant", event.target.value, true)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100">
            {variants.map((variant) => <option key={variant.value} value={variant.value}>{variant.label}</option>)}
          </select>
        </div>
        <div>
          <span className="mb-1 hidden text-sm text-transparent md:block" aria-hidden="true">Actions</span>
          <button
            type="button"
            onClick={clearSearch}
            disabled={!activeFilters}
            className="w-full rounded border border-gray-700 px-4 py-2 font-semibold text-gray-200 transition-colors hover:border-amber-500 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear search
          </button>
        </div>
      </form>

      {loading && <div className="py-12 text-center text-gray-400">Loading marketplace...</div>}
      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      {!loading && !error && listings.length === 0 && <div className="py-12 text-center text-gray-500">No listings found.</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        {listings.map(({ card, offer }) => (
          <MarketplaceListingCard
            key={offer.listingId}
            card={card}
            offer={offer}
            saving={openingId === offer.listingId}
            onChat={startChat}
          />
        ))}
      </div>
    </div>
  );
}
