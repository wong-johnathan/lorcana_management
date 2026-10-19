import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MarketplaceFilterBar from "../../components/marketplace/MarketplaceFilterBar";
import MarketplaceListingCard from "../../components/marketplace/MarketplaceListingCard";
import { useAuth } from "../../context/AuthContext";
import { cards, marketplace } from "../../services/api";
import type { FilterOptions, MarketplaceListingsResponse } from "../../types";
import {
  marketplaceControlsFromParams,
  marketplaceParamsFromControls,
  priceMinorFromMajor,
  type MarketplaceControls,
} from "../../utils/marketplaceParams";

const PAGE_SIZE = 24;

export default function MarketplacePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const controls = useMemo(() => marketplaceControlsFromParams(searchParams), [searchParams]);
  const [data, setData] = useState<MarketplaceListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  // Catalog-stable option source (REQ-FILT-19): loaded once, with the synthetic
  // "Song" card type appended client-side (never written to the server).
  useEffect(() => {
    let active = true;
    cards
      .filters()
      .then((options) => {
        if (!active) return;
        setFilterOptions({
          ...options,
          cardTypes: options.cardTypes.includes("Song")
            ? options.cardTypes
            : [...options.cardTypes, "Song"],
        });
      })
      .catch((err) => console.error(err));
    return () => {
      active = false;
    };
  }, []);

  const updateControls = useCallback(
    (patch: Partial<MarketplaceControls>) => {
      // Any non-page change resets pagination so a new filter starts at page 1.
      const resetsPage = Object.keys(patch).some((key) => key !== "page");
      const next: MarketplaceControls = {
        ...controls,
        ...patch,
        ...(resetsPage ? { page: 1 } : {}),
      };
      setSearchParams(marketplaceParamsFromControls(next), { replace: true });
    },
    [controls, setSearchParams]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const priceMin = priceMinorFromMajor(controls.priceMin);
    const priceMax = priceMinorFromMajor(controls.priceMax);
    marketplace
      .listings({
        q: controls.q || undefined,
        variant: controls.variant || undefined,
        condition: controls.condition || undefined,
        currency: controls.currency || undefined,
        priceMin: priceMin != null ? String(priceMin) : undefined,
        priceMax: priceMax != null ? String(priceMax) : undefined,
        costs: controls.costs || undefined,
        inkable: controls.inkable || undefined,
        cardTypes: controls.cardTypes || undefined,
        subtypes: controls.subtypes || undefined,
        page: controls.page,
        limit: PAGE_SIZE,
      })
      .then((response) => {
        if (active) setData(response);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load listings");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    controls.q,
    controls.variant,
    controls.condition,
    controls.currency,
    controls.priceMin,
    controls.priceMax,
    controls.costs,
    controls.inkable,
    controls.cardTypes,
    controls.subtypes,
    controls.page,
  ]);

  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-400">Community marketplace</p>
          <h1 className="text-2xl font-bold text-gray-100">Marketplace</h1>
          <p className="mt-1 text-sm text-gray-400">
            Browse cards other collectors are selling. Payment and shipping are arranged between
            traders.
          </p>
        </div>
        {user && (
          <Link
            to="/marketplace/sell"
            className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400"
          >
            Sell / List a card
          </Link>
        )}
      </div>

      <MarketplaceFilterBar controls={controls} onChange={updateControls} optionSource={filterOptions} />

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          Loading listings…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : !data || data.listings.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          No listings match these filters.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {data.listings.map((listing) => (
              <MarketplaceListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 text-sm text-gray-400">
            <button
              type="button"
              disabled={controls.page <= 1}
              onClick={() => updateControls({ page: controls.page - 1 })}
              className="rounded-md border border-gray-700 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 hover:border-gray-500"
            >
              Previous
            </button>
            <span>
              Page {controls.page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={controls.page >= totalPages}
              onClick={() => updateControls({ page: controls.page + 1 })}
              className="rounded-md border border-gray-700 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 hover:border-gray-500"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
