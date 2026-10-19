import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ReportModal from "../../components/marketplace/ReportModal";
import MarketplaceImage from "../../components/marketplace/MarketplaceImage";
import ListingImageCarousel from "../../components/marketplace/ListingImageCarousel";
import { marketplace } from "../../services/api";
import type { MarketplaceListingDetail } from "../../types";
import { cardArtUrl } from "../../utils/cardImages";
import {
  cardArtCaption,
  hasCardArt,
  listingImageItems,
  photoStartIndex,
} from "../../utils/listingImages";
import {
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../../utils/marketplaceParams";

/** REQ-6: high-value printings where condition photos matter most. */
const PREMIUM_RARITIES = ["Enchanted", "Iconic"];

export default function MarketplaceListingPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listing, setListing] = useState<MarketplaceListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enquiring, setEnquiring] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [enquireError, setEnquireError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError(null);
    marketplace
      .listing(id)
      .then((data) => {
        if (active) setListing(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load listing");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          Loading listing…
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          {error ?? "Listing not found"}
        </div>
      </div>
    );
  }

  const card = listing.card;
  const hasArt = hasCardArt(card);
  const images = listingImageItems(card, listing.photos);
  const isPremium = card ? PREMIUM_RARITIES.includes(card.rarity) : false;
  const canEnquire = listing.status === "ACTIVE" && listing.quantity > 0;
  const quantityOptions = Array.from({ length: Math.max(0, listing.quantity) }, (_, i) => i + 1);

  // REQ-11/12: POST /listings/:id/enquire resolves (or re-activates) the one
  // thread per (buyer, listing) and returns the thread id; navigate to it.
  const startEnquiry = async () => {
    setSubmitting(true);
    setEnquireError(null);
    try {
      const { enquiryId } = await marketplace.enquire(listing.id, quantity);
      navigate(`/marketplace/chat/${enquiryId}`);
    } catch (err) {
      setEnquireError(err instanceof Error ? err.message : "Failed to start enquiry");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <Link to="/marketplace" className="text-sm text-gray-400 hover:text-amber-300">
        ← Back to marketplace
      </Link>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Card art (REQ-LB-4) + condition photos */}
        <section>
          {hasArt && card && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Card
              </h2>
              <div className="mt-2">
                <MarketplaceImage
                  src={cardArtUrl(card)}
                  alt={cardArtCaption(card)}
                  hasSource
                  className="aspect-[5/7] w-full rounded-xl border border-gray-800 object-cover"
                  onOpen={() => setCarouselIndex(0)}
                />
              </div>
            </>
          )}

          <h2 className="mt-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Actual condition photos
          </h2>
          {listing.photos.length === 0 ? (
            <div className="mt-2 flex aspect-[5/7] items-center justify-center rounded-xl border border-gray-800 bg-gray-900/60 text-sm text-gray-500">
              No condition photos
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {listing.photos.map((photo) => (
                <MarketplaceImage
                  key={photo.id}
                  src={photo.url}
                  alt={`${card?.name ?? "Card"} — actual condition photo${photo.label ? ` (${photo.label})` : ""}`}
                  hasSource
                  className="aspect-[5/7] w-full rounded-xl border border-gray-800 object-cover"
                  onOpen={
                    images.length > 0
                      ? () => setCarouselIndex(photoStartIndex(card, listing.photos, photo))
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          {isPremium && (
            <p className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-300">
              {listing.photos.length === 0
                ? `${card?.rarity} cards are high-value — ask the seller for actual condition photos before buying.`
                : `${card?.rarity} cards are high-value — condition photos help verify the card's true state.`}
            </p>
          )}
        </section>

        {/* Info */}
        <section className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{card?.name ?? "Card"}</h1>
            {card?.subtitle && <p className="text-sm text-gray-400">{card.subtitle}</p>}
            <p className="mt-1 text-xs text-gray-500">
              {card?.setName}
              {card?.rarity ? ` · ${card.rarity}` : ""}
              {card?.cardNumber ? ` · ${card.cardNumber}` : ""}
            </p>
          </div>

          <dl className="space-y-2 rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Variant</dt>
              <dd className="text-gray-200">{marketplaceVariantLabel(listing.variant)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Condition</dt>
              <dd className="text-gray-200">{listing.condition || "Not specified"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Quantity available</dt>
              <dd className="text-gray-200">{listing.quantity}</dd>
            </div>
            {listing.pendingQuantity > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Pending sale</dt>
                <dd className="text-amber-300">{listing.pendingQuantity}</dd>
              </div>
            )}
            {listing.location && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Location</dt>
                <dd className="text-gray-200">{listing.location}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-800 pt-2">
              <dt className="text-gray-500">Price</dt>
              <dd className="text-lg font-bold text-amber-300">
                {formatPriceMinor(listing.priceMinor, listing.currency)}
              </dd>
            </div>
          </dl>

          {listing.note && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Seller notes</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-300">{listing.note}</p>
            </div>
          )}

          {/* Seller mini-profile */}
          {listing.seller && (
            <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-gray-950 text-lg text-gray-500">
                {listing.seller.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Sold by</p>
                <Link
                  to={`/marketplace/seller/${listing.seller.id}`}
                  className="truncate font-semibold text-gray-100 hover:text-amber-300"
                >
                  {listing.seller.username}
                </Link>
              </div>
            </div>
          )}

          {/* Enquire entry point (REQ-12). F2 wires the actual enquiry write. */}
          <div className="space-y-3">
            {!user ? (
              <Link
                to="/login"
                className="block rounded-lg bg-amber-500 px-4 py-2.5 text-center font-semibold text-gray-950 hover:bg-amber-400"
              >
                Sign in to enquire
              </Link>
            ) : !canEnquire ? (
              <button
                type="button"
                disabled
                className="w-full rounded-lg bg-gray-800 px-4 py-2.5 font-semibold text-gray-500 cursor-not-allowed"
              >
                This listing is no longer available
              </button>
            ) : enquiring ? (
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
                <label className="block text-sm text-gray-300">
                  Quantity
                  <select
                    value={quantity}
                    onChange={(event) => setQuantity(Number(event.target.value))}
                    className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
                  >
                    {quantityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEnquireError(null);
                      setEnquiring(false);
                    }}
                    className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void startEnquiry()}
                    disabled={submitting}
                    className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Starting…" : "Start enquiry"}
                  </button>
                </div>
                {enquireError && (
                  <p className="mt-2 text-sm text-red-300">{enquireError}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEnquiring(true)}
                className="block w-full rounded-lg bg-amber-500 px-4 py-2.5 font-semibold text-gray-950 hover:bg-amber-400"
              >
                Enquire
              </button>
            )}

            <div className="flex justify-end">
              <ReportModal targetType="LISTING" targetId={listing.id} label="Report listing" />
            </div>
          </div>
        </section>
      </div>

      {carouselIndex != null && (
        <ListingImageCarousel
          images={images}
          startIndex={carouselIndex}
          onClose={() => setCarouselIndex(null)}
        />
      )}
    </div>
  );
}
