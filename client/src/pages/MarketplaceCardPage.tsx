import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import type { MarketplaceCardOffersResponse } from "../types";
import MarketplaceListingCard from "../components/marketplace/MarketplaceListingCard";
import { cardIdentifier, cardTitle } from "../components/marketplace/marketplaceDisplay";

export default function MarketplaceCardPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<MarketplaceCardOffersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cardId) return;
    setLoading(true);
    setError(null);
    marketplaceApi
      .cardOffers(cardId)
      .then(setData)
      .catch((err: any) => setError(err?.message || "Failed to load marketplace offers"))
      .finally(() => setLoading(false));
  }, [cardId]);

  const startChat = async (listingId: string) => {
    setOpeningId(listingId);
    setError(null);
    try {
      const response = await marketplaceApi.createEnquiry(listingId, {});
      navigate(`/marketplace/enquiries/${response.enquiry.id}`);
    } catch (err: any) {
      if (err?.status === 409 && err?.body?.enquiryId) {
        navigate(`/marketplace/enquiries/${err.body.enquiryId}`);
        return;
      }
      setError(err?.message || "Failed to start chat");
    } finally {
      setOpeningId(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-gray-400">Loading marketplace offers...</div>;
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="py-12 text-center text-gray-500">Card offers not found.</div>;
  }

  const primaryVariant = data.offers[0]?.variant ?? "normal";

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-4">
      <Link to="/marketplace" className="text-sm text-amber-300 hover:text-amber-200">← Back to marketplace</Link>
      <div className="grid gap-6 md:grid-cols-[200px,1fr]">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <img src={data.card.imageUrl} alt={cardTitle(data.card)} className="w-full rounded-lg bg-gray-800" />
        </div>
        <div className="space-y-2 self-center">
          <h2 className="text-2xl font-semibold text-gray-100">{cardTitle(data.card)}</h2>
          <p className="text-gray-400">{cardIdentifier(data.card, primaryVariant)}</p>
          <p className="text-sm text-gray-500">Prices are in the seller's currency. Chat to arrange meetup or delivery.</p>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}

      {data.offers.length === 0 ? (
        <div className="py-12 text-center text-gray-500">No active listings for this card.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.offers.map((offer) => (
            <MarketplaceListingCard
              key={offer.listingId}
              card={data.card}
              offer={offer}
              saving={openingId === offer.listingId}
              onChat={startChat}
            />
          ))}
        </div>
      )}
    </div>
  );
}
