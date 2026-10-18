import { Link } from "react-router-dom";
import type { MarketplaceListing } from "../../types";
import { cardImageUrl } from "../../utils/cardImages";
import {
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../../utils/marketplaceParams";

interface MarketplaceListingCardProps {
  listing: MarketplaceListing;
}

/**
 * A single card in the public marketplace grid: primary photo (a condition
 * photo when available, otherwise the card's image), name/set, variant,
 * condition, price+currency, coarse location, and the seller.
 */
export default function MarketplaceListingCard({ listing }: MarketplaceListingCardProps) {
  const photo = listing.photos[0];
  const image = photo
    ? photo.url
    : listing.card
      ? cardImageUrl(listing.card)
      : "";
  const name = listing.card?.name ?? "Unknown card";

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 transition-colors hover:border-gray-700">
      <Link
        to={`/marketplace/listing/${listing.id}`}
        aria-label={`View listing for ${name}`}
        className="relative block aspect-[5/7] w-full overflow-hidden bg-gray-800"
      >
        {image ? (
          <img
            src={image}
            alt={photo ? `${name} — condition photo` : name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-600">
            No photo
          </div>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <Link
          to={`/marketplace/listing/${listing.id}`}
          className="truncate font-semibold text-gray-100 hover:text-amber-300"
        >
          {name}
        </Link>
        {listing.card?.subtitle && (
          <p className="truncate text-sm text-gray-400">{listing.card.subtitle}</p>
        )}
        <p className="truncate text-xs text-gray-500">
          {listing.card?.setName}
          {listing.card?.rarity ? ` · ${listing.card.rarity}` : ""}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-base font-bold text-amber-300">
            {formatPriceMinor(listing.priceMinor, listing.currency)}
          </span>
          <span className="text-xs text-gray-500">
            {listing.quantity} available
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
          <span>{marketplaceVariantLabel(listing.variant)}</span>
          {listing.condition && (
            <>
              <span aria-hidden="true" className="text-gray-600">·</span>
              <span>{listing.condition}</span>
            </>
          )}
          {listing.location && (
            <>
              <span aria-hidden="true" className="text-gray-600">·</span>
              <span className="truncate">{listing.location}</span>
            </>
          )}
        </div>

        {listing.seller && (
          <Link
            to={`/marketplace/seller/${listing.seller.id}`}
            className="mt-2 truncate text-xs text-gray-500 hover:text-amber-300"
          >
            Sold by {listing.seller.username}
          </Link>
        )}
      </div>
    </article>
  );
}
