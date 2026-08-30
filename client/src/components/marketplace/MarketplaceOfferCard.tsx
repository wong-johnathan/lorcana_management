import { useState } from "react";
import { Link } from "react-router-dom";
import type { User, MarketplaceCardOffer } from "../../types";
import { formatMarketplaceMoney, variantLabel } from "./marketplaceDisplay";
import { formatReferencePrice } from "../extras/extrasUi";

interface MarketplaceOfferCardProps {
  offer: MarketplaceCardOffer;
  user: User | null;
  saving?: boolean;
  onEnquire: (listingId: string, message?: string) => void;
}

export default function MarketplaceOfferCard({ offer, user, saving = false, onEnquire }: MarketplaceOfferCardProps) {
  const verifiedBuyer = Boolean(user?.emailVerifiedAt);
  const [message, setMessage] = useState("");
  const messageId = `enquiry-message-${offer.listingId}`;

  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{offer.seller.username}</h3>
          <p className="mt-1 text-sm text-gray-400">
            {variantLabel(offer.variant)} × {offer.availableQuantity}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-amber-300">{formatMarketplaceMoney(offer.askingPrice)}</p>
          {offer.approximateConvertedPrice && (
            <p className="text-sm text-gray-400">≈ {formatMarketplaceMoney(offer.approximateConvertedPrice)}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
          {offer.availableQuantity} available
        </span>
        {offer.sellerVerified && (
          <span className="rounded-full border border-emerald-900 bg-emerald-950/40 px-2 py-1 text-emerald-300">Email verified</span>
        )}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-300">
        <p>TCG reference (USD): {formatReferencePrice(offer.referencePrice)}</p>
        {offer.note && <p className="mt-1">Note: {offer.note}</p>}
      </div>

      {!user ? (
        <Link to="/login" className="inline-flex rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400">
          Log in to send enquiry
        </Link>
      ) : verifiedBuyer ? (
        <div className="space-y-2">
          <label htmlFor={messageId} className="block text-sm text-gray-300">Message (optional)</label>
          <textarea
            id={messageId}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Add a message for the seller"
            rows={2}
            className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
          />
          <button
            type="button"
            onClick={() => onEnquire(offer.listingId, message.trim())}
            disabled={saving}
            className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {saving ? "Sending..." : "Send enquiry"}
          </button>
        </div>
      ) : (
        <p className="rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">Verify email to send enquiries</p>
      )}
    </article>
  );
}
