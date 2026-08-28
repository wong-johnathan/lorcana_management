import { Link } from "react-router-dom";
import type { User, MarketplaceCardOffer } from "../../types";
import { conditionLabel, formatMarketplaceMoney, fulfilmentSummary, variantLabel } from "./marketplaceDisplay";

interface MarketplaceOfferCardProps {
  offer: MarketplaceCardOffer;
  user: User | null;
  saving?: boolean;
  onEnquire: (listingId: string) => void;
}

export default function MarketplaceOfferCard({ offer, user, saving = false, onEnquire }: MarketplaceOfferCardProps) {
  const verifiedBuyer = Boolean(user?.emailVerifiedAt);

  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{offer.seller.username}</h3>
          <p className="mt-1 text-sm text-gray-400">
            {offer.publicLocality ? `${offer.publicLocality}, ` : ""}{offer.originCountryCode} · {variantLabel(offer.variant)} · {conditionLabel(offer.condition)} · {offer.cardLanguage}
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
          {offer.pricingMode === "FIXED" ? "Fixed price" : "Accepts offers"}
        </span>
        <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
          {offer.availableQuantity} available
        </span>
        {offer.sellerVerified && (
          <span className="rounded-full border border-emerald-900 bg-emerald-950/40 px-2 py-1 text-emerald-300">Email verified</span>
        )}
      </div>

      <p className="rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
        Condition reported by seller; no physical photos provided.
      </p>

      <div className="text-sm text-gray-300">
        <p>{fulfilmentSummary(offer.fulfilment)}</p>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-300">
        <p className="font-medium text-gray-100">★ {offer.reputation.ratingAverage?.toFixed(1) ?? "New"} seller rating</p>
        <p>{offer.reputation.reviewCount} seller reviews · {offer.reputation.completedDeals} completed marketplace deals</p>
        <p>{offer.reputation.uniqueCounterparties} unique counterparties · Member since {new Date(offer.reputation.memberSince).getFullYear()}</p>
      </div>

      {!user ? (
        <Link to="/login" className="inline-flex rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400">
          Log in to send enquiry
        </Link>
      ) : verifiedBuyer ? (
        <button
          type="button"
          onClick={() => onEnquire(offer.listingId)}
          disabled={saving}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {saving ? "Sending..." : "Send enquiry"}
        </button>
      ) : (
        <p className="rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">Verify email to send enquiries</p>
      )}
    </article>
  );
}
