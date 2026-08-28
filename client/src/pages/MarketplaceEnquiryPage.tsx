import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import type { MarketplaceEnquiryDetailResponse } from "../types";
import { cardTitle, formatMarketplaceMoney, variantLabel } from "../components/marketplace/marketplaceDisplay";

export default function MarketplaceEnquiryPage() {
  const { enquiryId } = useParams<{ enquiryId: string }>();
  const [data, setData] = useState<MarketplaceEnquiryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enquiryId) return;
    setLoading(true);
    setError(null);
    marketplaceApi
      .getEnquiry(enquiryId)
      .then(setData)
      .catch((err: any) => setError(err?.message || "Failed to load enquiry"))
      .finally(() => setLoading(false));
  }, [enquiryId]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-gray-400">Loading enquiry...</div>;
  if (error) return <div className="mx-auto max-w-4xl p-4"><div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div></div>;
  if (!data) return <div className="py-12 text-center text-gray-500">Enquiry not found.</div>;

  const { enquiry } = data;

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-4">
      <Link to="/marketplace/enquiries" className="text-sm text-amber-300 hover:text-amber-200">← Back to enquiries</Link>
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h2 className="text-2xl font-semibold text-gray-100">{cardTitle(enquiry.card)}</h2>
        <p className="text-sm text-gray-400">{variantLabel(enquiry.variant)} × {enquiry.quantity} · {enquiry.status}</p>
        {enquiry.latestOffer && (
          <p className="text-sm text-amber-300">Latest offer: {enquiry.latestOffer.quantity} × {formatMarketplaceMoney(enquiry.latestOffer.unitPrice)}</p>
        )}
      </section>
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h3 className="text-lg font-semibold text-gray-100">Messages</h3>
        {enquiry.messages.length === 0 ? <p className="text-sm text-gray-500">No messages yet.</p> : enquiry.messages.map((message) => (
          <div key={message.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
            <p className="text-sm font-medium text-gray-100">{message.sender.username}</p>
            <p className="text-sm text-gray-300">{message.message}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
