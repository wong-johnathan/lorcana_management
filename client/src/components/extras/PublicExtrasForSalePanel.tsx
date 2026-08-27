import { useState } from "react";
import type { PublicExtraForSaleListing, PublicUserProfile } from "../../types";
import ExtrasSearchInput from "./ExtrasSearchInput";
import { cardMatchesQuery, VARIANT_LABELS, formatReferencePrice } from "./extrasUi";

interface PublicExtrasForSalePanelProps {
  listings: PublicExtraForSaleListing[];
  profile: PublicUserProfile | null;
  username: string;
  onContactClick: () => void;
}

function hasContact(profile: PublicUserProfile | null): boolean {
  if (!profile) return false;
  return Boolean(profile.instagram || profile.telegram || profile.facebook || profile.email || profile.phoneNumber || (profile.references?.length ?? 0) > 0);
}

export default function PublicExtrasForSalePanel({ listings, profile, username, onContactClick }: PublicExtrasForSalePanelProps) {
  const [query, setQuery] = useState("");
  const filteredListings = listings.filter((listing) => cardMatchesQuery(listing.card, query));

  if (listings.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-100">Extras for Sale</h2>
        <p className="mt-2 text-gray-400">No extras are currently listed for sale.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-100">Extras for Sale</h2>
        <p className="mt-1 text-sm text-gray-400">Contact {username} using their public profile fields. Prices shown are reference prices only.</p>
      </div>
      <ExtrasSearchInput value={query} onChange={setQuery} placeholder="Search listings..." />
      {filteredListings.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
          No listings match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredListings.map((listing) => (
            <div key={listing.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <div className="flex gap-4">
                <img src={listing.card.imageUrl} alt={listing.card.name} className="h-32 w-24 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-100">{listing.card.name}</h3>
                  {listing.card.subtitle && <p className="text-sm text-gray-400">{listing.card.subtitle}</p>}
                  <p className="mt-1 text-xs text-gray-500">{listing.card.cardNumber}</p>
                  <div className="mt-3 space-y-1 text-sm text-gray-300">
                    <div>{VARIANT_LABELS[listing.variant]} × {listing.quantity}</div>
                    <div>Reference price: {formatReferencePrice(listing.referencePrice)}</div>
                    {listing.note && <div>Note: {listing.note}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={onContactClick}
                    className="mt-3 rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400"
                  >
                    {hasContact(profile) ? "Contact seller" : "View profile"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
