import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { MarketplaceCardOffersResponse } from "../types";
import MarketplaceOfferCard from "../components/marketplace/MarketplaceOfferCard";
import { cardIdentifier, cardTitle } from "../components/marketplace/marketplaceDisplay";

export default function MarketplaceCardPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<MarketplaceCardOffersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const sendEnquiry = async (listingId: string, input: { quantity: number; message?: string; unitPriceMinor?: number }) => {
    setSavingListingId(listingId);
    setError(null);
    setSuccess(null);
    try {
      const response = await marketplaceApi.createEnquiry(listingId, input);
      navigate(`/marketplace/enquiries/${response.enquiry.id}`);
    } catch (err: any) {
      if (err?.status === 409 && err?.body?.enquiryId) {
        navigate(`/marketplace/enquiries/${err.body.enquiryId}`);
        return;
      }
      setError(err?.message || "Failed to send enquiry");
    } finally {
      setSavingListingId(null);
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
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <Link to="/marketplace" className="text-sm text-amber-300 hover:text-amber-200">← Back to marketplace</Link>
      <div className="grid gap-6 md:grid-cols-[260px,1fr]">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <img src={data.card.imageUrl} alt={cardTitle(data.card)} className="w-full rounded-lg bg-gray-800" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-gray-100">{cardTitle(data.card)}</h2>
          <p className="text-gray-400">{cardIdentifier(data.card, primaryVariant)}</p>
          <p className="text-sm text-gray-500">Original seller currency remains authoritative. Converted prices are approximate.</p>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{success}</div>}

      {data.offers.length === 0 ? (
        <div className="py-12 text-center text-gray-500">No active marketplace offers for this card.</div>
      ) : (
        <div className="grid gap-4">
          {data.offers.map((offer) => (
            <MarketplaceOfferCard
              key={offer.listingId}
              offer={offer}
              user={user}
              saving={savingListingId === offer.listingId}
              onEnquire={sendEnquiry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
