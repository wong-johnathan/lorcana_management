import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { Card, MarketplaceCardOffer } from "../../types";
import { cardTitle, formatMarketplaceMoney, variantLabel } from "./marketplaceDisplay";

interface MarketplaceListingCardProps {
  card: Card;
  offer: MarketplaceCardOffer;
  onChat: (listingId: string) => void;
  saving?: boolean;
}

export default function MarketplaceListingCard({ card, offer, onChat, saving = false }: MarketplaceListingCardProps) {
  const { user } = useAuth();
  const verified = Boolean(user?.emailVerifiedAt);
  const acceptsOffers = offer.pricingMode === "ACCEPTS_OFFERS";

  return (
    <article className="flex gap-3 rounded-xl border border-gray-800 bg-gray-900 p-3">
      <Link to={`/marketplace/card/${card.id}`} className="shrink-0" aria-label={`View ${cardTitle(card)} listings`}>
        <img
          src={card.imageUrl}
          alt={cardTitle(card)}
          className="h-32 w-[88px] rounded-lg object-cover bg-gray-800"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/marketplace/card/${card.id}`} className="truncate text-sm font-semibold text-gray-100 hover:text-amber-300">{cardTitle(card)}</Link>
        <p className="text-xs text-gray-400">{variantLabel(offer.variant)}{card.rarity ? ` · ${card.rarity}` : ""}</p>

        <p className="mt-1.5 text-lg font-bold text-amber-300">{formatMarketplaceMoney(offer.askingPrice)}</p>
        <p className="text-xs text-gray-500">
          {offer.availableQuantity} available ·{" "}
          <span className={acceptsOffers ? "text-emerald-300" : "text-gray-400"}>
            {acceptsOffers ? "Open to offers" : "Fixed price"}
          </span>
        </p>

        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
          <span className="truncate">@{offer.seller.username}</span>
          {offer.sellerVerified && (
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-emerald-950">✓</span>
          )}
        </div>

        {!user ? (
          <Link to="/login" className="mt-auto self-start rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-gray-950 hover:bg-amber-400">
            Log in to chat
          </Link>
        ) : !verified ? (
          <span className="mt-auto self-start rounded-md border border-amber-900 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-300">
            Verify email to chat
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onChat(offer.listingId)}
            disabled={saving}
            className="mt-auto self-start rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-gray-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {saving ? "Opening…" : "Chat"}
          </button>
        )}
      </div>
    </article>
  );
}
