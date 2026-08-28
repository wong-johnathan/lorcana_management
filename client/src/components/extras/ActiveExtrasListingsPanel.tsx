import { useState } from "react";
import type { ExtraForSaleListing, ListingCurrency, MarketplaceCondition, MarketplacePricingMode } from "../../types";
import ExtrasFilterBar from "./ExtrasFilterBar";
import { cardMatchesFilters, deriveExtrasFilterOptions, EMPTY_EXTRAS_FILTERS, ExtrasFilters, VARIANT_LABELS, formatReferencePrice, formatCustomPrice, LISTING_CURRENCIES } from "./extrasUi";

interface ListingEdit {
  note: string | null;
  customPrice: number | null;
  customPriceCurrency: ListingCurrency;
  marketplaceVisible: boolean;
  pricingMode: MarketplacePricingMode;
  askingPriceMinor: number | null;
  currency: ListingCurrency | null;
  condition: MarketplaceCondition | null;
  cardLanguage: string | null;
  originCountryCode: string | null;
  publicLocality: string | null;
  allowsMeetup: boolean;
  shipsDomestically: boolean;
  shipsInternationally: boolean;
  shipsWorldwide: boolean;
  destinationCountries: string[];
}

interface EditState {
  note: string;
  customPrice: string;
  customPriceCurrency: ListingCurrency;
  marketplaceVisible: boolean;
  pricingMode: MarketplacePricingMode;
  marketplacePrice: string;
  marketplaceCurrency: ListingCurrency;
  condition: MarketplaceCondition;
  cardLanguage: string;
  originCountryCode: string;
  publicLocality: string;
  allowsMeetup: boolean;
  shipsDomestically: boolean;
  shipsInternationally: boolean;
  shipsWorldwide: boolean;
  destinationCountries: string;
}

interface ActiveExtrasListingsPanelProps {
  listings: ExtraForSaleListing[];
  onStatusChange: (id: string, status: "active" | "paused") => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
  onEdit: (id: string, data: ListingEdit) => Promise<void> | void;
}

const CONDITIONS: Array<{ value: MarketplaceCondition; label: string }> = [
  { value: "MINT", label: "Mint" },
  { value: "NEAR_MINT", label: "Near Mint" },
  { value: "LIGHTLY_PLAYED", label: "Lightly Played" },
  { value: "MODERATELY_PLAYED", label: "Moderately Played" },
  { value: "HEAVILY_PLAYED", label: "Heavily Played" },
  { value: "DAMAGED", label: "Damaged" },
];

const PRICING_MODES: Array<{ value: MarketplacePricingMode; label: string }> = [
  { value: "FIXED", label: "Fixed price" },
  { value: "ACCEPTS_OFFERS", label: "Accepts offers" },
];

function amountMinorToDisplay(amountMinor: number | null | undefined): string {
  if (amountMinor == null) return "";
  return (amountMinor / 100).toFixed(2).replace(/\.00$/, "");
}

function parseMarketplacePrice(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Math.round(Number(trimmed) * 100);
}

function destinationCodesFromListing(listing: ExtraForSaleListing): string[] {
  return listing.destinationCountries ?? listing.fulfilment?.destinationCountryCodes ?? [];
}

function editStateFromListing(listing: ExtraForSaleListing): EditState {
  return {
    note: listing.note ?? "",
    customPrice: listing.customPrice != null ? String(listing.customPrice) : "",
    customPriceCurrency: listing.customPriceCurrency ?? "SGD",
    marketplaceVisible: listing.marketplaceVisible ?? false,
    pricingMode: listing.pricingMode ?? "FIXED",
    marketplacePrice: amountMinorToDisplay(listing.askingPriceMinor),
    marketplaceCurrency: listing.currency ?? listing.customPriceCurrency ?? "SGD",
    condition: listing.condition ?? "NEAR_MINT",
    cardLanguage: listing.cardLanguage ?? "EN",
    originCountryCode: listing.originCountryCode ?? "SG",
    publicLocality: listing.publicLocality ?? "",
    allowsMeetup: listing.allowsMeetup ?? listing.fulfilment?.allowsMeetup ?? false,
    shipsDomestically: listing.shipsDomestically ?? listing.fulfilment?.shipsDomestically ?? false,
    shipsInternationally: listing.shipsInternationally ?? listing.fulfilment?.shipsInternationally ?? false,
    shipsWorldwide: listing.shipsWorldwide ?? listing.fulfilment?.shipsWorldwide ?? false,
    destinationCountries: destinationCodesFromListing(listing).join(", "),
  };
}

function parseDestinationCountries(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

export default function ActiveExtrasListingsPanel({ listings, onStatusChange, onRemove, onEdit }: ActiveExtrasListingsPanelProps) {
  const [filters, setFilters] = useState<ExtrasFilters>(EMPTY_EXTRAS_FILTERS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const filteredListings = listings.filter((listing) => cardMatchesFilters(listing.card, filters));
  const filterOptions = deriveExtrasFilterOptions(listings.map((listing) => listing.card));

  const startEdit = (listing: ExtraForSaleListing) => {
    setEditingId(listing.id);
    setEditState(editStateFromListing(listing));
  };

  const updateEditState = <K extends keyof EditState>(key: K, value: EditState[K]) => {
    setEditState((current) => current ? { ...current, [key]: value } : current);
  };

  const saveEdit = (listing: ExtraForSaleListing) => {
    if (!editState) return;
    const data: ListingEdit | Pick<ListingEdit, "note" | "customPrice" | "customPriceCurrency"> = {
      note: editState.note.trim() || null,
      customPrice: editState.customPrice.trim() === "" ? null : Number(editState.customPrice),
      customPriceCurrency: editState.customPriceCurrency,
    };

    if (listing.marketplaceVisible || editState.marketplaceVisible) {
      Object.assign(data, {
        marketplaceVisible: editState.marketplaceVisible,
        pricingMode: editState.pricingMode,
        askingPriceMinor: parseMarketplacePrice(editState.marketplacePrice),
        currency: editState.marketplaceCurrency,
        condition: editState.condition,
        cardLanguage: editState.cardLanguage.trim().toUpperCase() || null,
        originCountryCode: editState.originCountryCode.trim().toUpperCase() || null,
        publicLocality: editState.publicLocality.trim() || null,
        allowsMeetup: editState.allowsMeetup,
        shipsDomestically: editState.shipsDomestically,
        shipsInternationally: editState.shipsInternationally,
        shipsWorldwide: editState.shipsWorldwide,
        destinationCountries: parseDestinationCountries(editState.destinationCountries),
      });
    }

    onEdit(listing.id, data as ListingEdit);
    setEditingId(null);
    setEditState(null);
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
      ) : filteredListings.map((listing) => {
        const isEditing = editingId === listing.id && editState;
        return (
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
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs ${listing.status === "active" ? "bg-emerald-900/50 text-emerald-300" : "bg-gray-800 text-gray-300"}`}>
                    {listing.status}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-xs ${listing.marketplaceVisible ? "bg-sky-900/50 text-sky-300" : "bg-gray-800 text-gray-300"}`}>
                    {listing.marketplaceVisible ? "marketplace" : "not marketplace"}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-gray-300 sm:grid-cols-3">
                <div>Desired qty: <span className="font-semibold text-gray-100">{listing.desiredQuantity}</span></div>
                <div>Currently public: <span className="font-semibold text-gray-100">{listing.publicQuantity}</span></div>
                <div>{listing.publicQuantity === 0 ? "Hidden: no current extra inventory" : "Visible on public collection"}</div>
              </div>
              <div className="mt-2 space-y-1 text-sm text-gray-300">
                <div>TCG reference (USD): {formatReferencePrice(listing.referencePrice)}</div>
                {listing.customPrice != null && (
                  <div>Asking price: {formatCustomPrice(listing.customPrice, listing.customPriceCurrency ?? "SGD")}</div>
                )}
                {listing.marketplaceVisible && listing.askingPriceMinor != null && listing.currency && (
                  <div>Marketplace price: {formatCustomPrice(listing.askingPriceMinor / 100, listing.currency)}</div>
                )}
              </div>
              {listing.note && <p className="mt-2 text-sm text-gray-400">Note: {listing.note}</p>}

              {isEditing ? (
                <div className="mt-3 rounded border border-gray-700 bg-gray-950 p-3 space-y-3">
                  <label className="block text-sm text-gray-300">
                    Listing note
                    <input
                      value={editState.note}
                      onChange={(event) => updateEditState("note", event.target.value)}
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
                        value={editState.customPrice}
                        onChange={(event) => updateEditState("customPrice", event.target.value)}
                        className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1"
                        placeholder="Optional"
                      />
                    </label>
                    <label className="block text-sm text-gray-300">
                      Currency
                      <select
                        value={editState.customPriceCurrency}
                        onChange={(event) => updateEditState("customPriceCurrency", event.target.value as ListingCurrency)}
                        className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1"
                      >
                        {LISTING_CURRENCIES.map((currency) => (
                          <option key={currency} value={currency}>{currency}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="rounded border border-gray-800 bg-gray-900/70 p-3 space-y-3">
                    <label className="flex items-center gap-2 text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={editState.marketplaceVisible}
                        onChange={(event) => updateEditState("marketplaceVisible", event.target.checked)}
                      />
                      Publish to marketplace
                    </label>
                    {editState.marketplaceVisible && (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500">Marketplace listings require verified email, price, condition, language, seller country, fulfilment, and current extra inventory.</p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="block text-sm text-gray-300">
                            Marketplace price
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={editState.marketplacePrice}
                              onChange={(event) => updateEditState("marketplacePrice", event.target.value)}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1"
                            />
                          </label>
                          <label className="block text-sm text-gray-300">
                            Marketplace currency
                            <select
                              value={editState.marketplaceCurrency}
                              onChange={(event) => updateEditState("marketplaceCurrency", event.target.value as ListingCurrency)}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1"
                            >
                              {LISTING_CURRENCIES.map((currency) => (
                                <option key={currency} value={currency}>{currency}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm text-gray-300">
                            Pricing mode
                            <select
                              value={editState.pricingMode}
                              onChange={(event) => updateEditState("pricingMode", event.target.value as MarketplacePricingMode)}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1"
                            >
                              {PRICING_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                            </select>
                          </label>
                          <label className="block text-sm text-gray-300">
                            Condition
                            <select
                              value={editState.condition}
                              onChange={(event) => updateEditState("condition", event.target.value as MarketplaceCondition)}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1"
                            >
                              {CONDITIONS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
                            </select>
                          </label>
                          <label className="block text-sm text-gray-300">
                            Card language
                            <input
                              value={editState.cardLanguage}
                              onChange={(event) => updateEditState("cardLanguage", event.target.value.toUpperCase())}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1"
                              placeholder="EN"
                            />
                          </label>
                          <label className="block text-sm text-gray-300">
                            Seller country
                            <input
                              value={editState.originCountryCode}
                              onChange={(event) => updateEditState("originCountryCode", event.target.value.toUpperCase())}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1"
                              placeholder="SG"
                            />
                          </label>
                          <label className="block text-sm text-gray-300">
                            Public locality
                            <input
                              value={editState.publicLocality}
                              onChange={(event) => updateEditState("publicLocality", event.target.value)}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1"
                              placeholder="Optional"
                            />
                          </label>
                          <label className="block text-sm text-gray-300 sm:col-span-2">
                            Destination countries
                            <input
                              value={editState.destinationCountries}
                              onChange={(event) => updateEditState("destinationCountries", event.target.value.toUpperCase())}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1"
                              placeholder="MY, ID, AU"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-300">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={editState.allowsMeetup} onChange={(event) => updateEditState("allowsMeetup", event.target.checked)} />Meetup</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={editState.shipsDomestically} onChange={(event) => updateEditState("shipsDomestically", event.target.checked)} />Domestic shipping</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={editState.shipsInternationally} onChange={(event) => updateEditState("shipsInternationally", event.target.checked)} />International shipping</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={editState.shipsWorldwide} onChange={(event) => updateEditState("shipsWorldwide", event.target.checked)} />Worldwide shipping</label>
                        </div>
                      </div>
                    )}
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
                      onClick={() => { setEditingId(null); setEditState(null); }}
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
        );
      })}
    </div>
  );
}
