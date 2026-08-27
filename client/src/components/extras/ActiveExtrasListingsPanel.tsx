import { useState } from "react";
import type { ExtraForSaleListing, ListingCurrency } from "../../types";
import ExtrasFilterBar from "./ExtrasFilterBar";
import { cardMatchesFilters, deriveExtrasFilterOptions, EMPTY_EXTRAS_FILTERS, ExtrasFilters, VARIANT_LABELS, formatReferencePrice, formatCustomPrice, LISTING_CURRENCIES } from "./extrasUi";

interface ListingEdit {
  note: string | null;
  customPrice: number | null;
  customPriceCurrency: ListingCurrency;
}

interface ActiveExtrasListingsPanelProps {
  listings: ExtraForSaleListing[];
  onStatusChange: (id: string, status: "active" | "paused") => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
  onEdit: (id: string, data: ListingEdit) => Promise<void> | void;
}

export default function ActiveExtrasListingsPanel({ listings, onStatusChange, onRemove, onEdit }: ActiveExtrasListingsPanelProps) {
  const [filters, setFilters] = useState<ExtrasFilters>(EMPTY_EXTRAS_FILTERS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCurrency, setEditCurrency] = useState<ListingCurrency>("SGD");
  const filteredListings = listings.filter((listing) => cardMatchesFilters(listing.card, filters));
  const filterOptions = deriveExtrasFilterOptions(listings.map((listing) => listing.card));

  const startEdit = (listing: ExtraForSaleListing) => {
    setEditingId(listing.id);
    setEditNote(listing.note ?? "");
    setEditPrice(listing.customPrice != null ? String(listing.customPrice) : "");
    setEditCurrency(listing.customPriceCurrency ?? "SGD");
  };

  const saveEdit = (listing: ExtraForSaleListing) => {
    onEdit(listing.id, {
      note: editNote.trim() || null,
      customPrice: editPrice.trim() === "" ? null : Number(editPrice),
      customPriceCurrency: editCurrency,
    });
    setEditingId(null);
  };

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
                  <p className="text-xs text-gray-500">{VARIANT_LABELS[listing.variant]}</p>
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
              <div className="mt-2 space-y-1 text-sm text-gray-300">
                <div>TCG reference (USD): {formatReferencePrice(listing.referencePrice)}</div>
                {listing.customPrice != null && (
                  <div>Asking price: {formatCustomPrice(listing.customPrice, listing.customPriceCurrency ?? "SGD")}</div>
                )}
              </div>
              {listing.note && <p className="mt-2 text-sm text-gray-400">Note: {listing.note}</p>}

              {editingId === listing.id ? (
                <div className="mt-3 rounded border border-gray-700 bg-gray-950 p-3 space-y-2">
                  <label className="block text-sm text-gray-300">
                    Listing note
                    <input
                      value={editNote}
                      onChange={(event) => setEditNote(event.target.value)}
                      className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1"
                      placeholder="Optional"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <label className="block text-sm text-gray-300">
                      Custom price
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editPrice}
                        onChange={(event) => setEditPrice(event.target.value)}
                        className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1"
                        placeholder="Optional"
                      />
                    </label>
                    <label className="block text-sm text-gray-300">
                      Currency
                      <select
                        value={editCurrency}
                        onChange={(event) => setEditCurrency(event.target.value as ListingCurrency)}
                        className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1"
                      >
                        {LISTING_CURRENCIES.map((currency) => (
                          <option key={currency} value={currency}>{currency}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(listing)}
                      className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-gray-950 hover:bg-amber-400"
                    >
                      Save listing
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(listing)}
                    className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                  >
                    Edit
                  </button>
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
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
