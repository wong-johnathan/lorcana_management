import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { User, MarketplaceCardOffer } from "../../types";
import { formatMarketplaceMoney, variantLabel } from "./marketplaceDisplay";
import { formatReferencePrice } from "../extras/extrasUi";

interface MarketplaceOfferCardProps {
  offer: MarketplaceCardOffer;
  user: User | null;
  saving?: boolean;
  onEnquire: (listingId: string, input: { quantity: number; message?: string; unitPriceMinor?: number }) => void;
}

function dollarsToMinor(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export default function MarketplaceOfferCard({ offer, user, saving = false, onEnquire }: MarketplaceOfferCardProps) {
  const verifiedBuyer = Boolean(user?.emailVerifiedAt);
  const acceptsOffers = offer.pricingMode === "ACCEPTS_OFFERS";
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const quantityId = `enquiry-quantity-${offer.listingId}`;
  const messageId = `enquiry-message-${offer.listingId}`;
  const offerPriceId = `enquiry-offer-${offer.listingId}`;
  const parsedQuantity = useMemo(() => Number(quantity), [quantity]);
  const validQuantity = Number.isInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= offer.availableQuantity;
  const parsedOfferPrice = offerPrice.trim() ? dollarsToMinor(offerPrice) : undefined;
  const validOfferPrice = !offerPrice.trim() || parsedOfferPrice !== null;

  const submit = () => {
    if (!validQuantity || !validOfferPrice) return;
    const trimmedMessage = message.trim();
    onEnquire(offer.listingId, {
      quantity: parsedQuantity,
      ...(trimmedMessage ? { message: trimmedMessage } : {}),
      ...(acceptsOffers && parsedOfferPrice != null ? { unitPriceMinor: parsedOfferPrice } : {}),
    });
  };

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
          <p className="mt-1 text-xs text-gray-400">{acceptsOffers ? "Open to offers" : "Fixed price"}</p>
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
        <div className="space-y-3">
          <label htmlFor={quantityId} className="block text-sm text-gray-300">
            Quantity wanted
            <input
              id={quantityId}
              type="number"
              min={1}
              max={offer.availableQuantity}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Enter quantity"
              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
            />
          </label>
          <label htmlFor={messageId} className="block text-sm text-gray-300">
            Message (optional)
            <textarea
              id={messageId}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask logistics in chat, e.g. meetup or delivery"
              rows={2}
              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
            />
          </label>
          {acceptsOffers && (
            <label htmlFor={offerPriceId} className="block text-sm text-gray-300">
              Offer unit price (optional)
              <input
                id={offerPriceId}
                type="number"
                min={0}
                step="0.01"
                value={offerPrice}
                onChange={(event) => setOfferPrice(event.target.value)}
                placeholder="Leave blank to enquire only"
                className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
              />
            </label>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={saving || !validQuantity || !validOfferPrice}
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
