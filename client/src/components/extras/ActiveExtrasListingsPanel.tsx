import { useState } from "react";
import type { ExtraForSaleListing } from "../../types";
import ExtrasFilterBar from "./ExtrasFilterBar";
import { cardMatchesFilters, deriveExtrasFilterOptions, EMPTY_EXTRAS_FILTERS, ExtrasFilters, VARIANT_LABELS, formatReferencePrice } from "./extrasUi";

interface ActiveExtrasListingsPanelProps {
  listings: ExtraForSaleListing[];
  onStatusChange: (id: string, status: "active" | "paused") => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
}

export default function ActiveExtrasListingsPanel({ listings, onStatusChange, onRemove }: ActiveExtrasListingsPanelProps) {
  const [filters, setFilters] = useState<ExtrasFilters>(EMPTY_EXTRAS_FILTERS);
  const filteredListings = listings.filter((listing) => cardMatchesFilters(listing.card, filters));
  const filterOptions = deriveExtrasFilterOptions(listings.map((listing) => listing.card));

  if (listings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
        No Extras for Sale listings yet. List cards from Suggested Extras.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ExtrasFilterBar filters={filters} onChange={setFilters} options={filterOptions} searchPlaceholder="Search listings..." />
      {filteredListings.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
          No listings match your search or filters.
        </div>
      ) : filteredListings.map((listing) => (
        <div key={listing.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex gap-4">
            <img src={listing.card.imageUrl} alt={listing.card.name} className="h-24 w-16 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-100">{listing.card.name}</h3>
                  {listing.card.subtitle && <p className="text-sm text-gray-400">{listing.card.subtitle}</p>}
                  <p className="text-xs text-gray-500">{VARIANT_LABELS[listing.variant]} · Reference price: {formatReferencePrice(listing.referencePrice)}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${listing.status === "active" ? "bg-emerald-900/50 text-emerald-300" : "bg-gray-800 text-gray-300"}`}>
                  {listing.status}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-gray-300 sm:grid-cols-3">
                <div>Desired qty: <span className="font-semibold text-gray-100">{listing.desiredQuantity}</span></div>
                <div>Currently public: <span className="font-semibold text-gray-100">{listing.publicQuantity}</span></div>
                <div>{listing.publicQuantity === 0 ? "Hidden: no current extra inventory" : "Visible publicly"}</div>
              </div>
              {listing.note && <p className="mt-2 text-sm text-gray-400">Note: {listing.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onStatusChange(listing.id, listing.status === "active" ? "paused" : "active")}
                  className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                >
                  {listing.status === "active" ? "Pause" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(listing.id)}
                  className="rounded border border-red-900 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
