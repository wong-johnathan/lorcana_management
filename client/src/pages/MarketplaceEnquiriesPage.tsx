import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import type { MarketplaceEnquiriesResponse, MarketplaceEnquiryStatus, MarketplaceEnquirySummary } from "../types";
import { cardTitle, formatMarketplaceMoney, variantLabel } from "../components/marketplace/marketplaceDisplay";

const statusGroups: Array<{ statuses: MarketplaceEnquiryStatus[]; title: string }> = [
  { statuses: ["PENDING_SELLER"], title: "Awaiting seller" },
  { statuses: ["AWAITING_BUYER"], title: "Awaiting buyer" },
  { statuses: ["RESERVED"], title: "Reserved" },
  { statuses: ["AWAITING_BUYER_CONFIRMATION"], title: "Awaiting completion confirmation" },
  { statuses: ["COMPLETED"], title: "Completed" },
  { statuses: ["DECLINED", "WITHDRAWN", "CANCELLED", "EXPIRED", "DISPUTED"], title: "Closed or disputed" },
];

function EnquiryRow({ enquiry }: { enquiry: MarketplaceEnquirySummary }) {
  return (
    <Link
      to={`/marketplace/enquiries/${enquiry.id}`}
      className="block rounded-lg border border-gray-800 bg-gray-950 p-3 hover:border-amber-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-100">{cardTitle(enquiry.card)}</p>
          <p className="text-sm text-gray-400">{variantLabel(enquiry.variant)} × {enquiry.quantity} · Seller {enquiry.seller.username}</p>
          {enquiry.latestOffer && (
            <p className="mt-1 text-sm text-amber-300">
              Latest offer: {enquiry.latestOffer.quantity} × {formatMarketplaceMoney(enquiry.latestOffer.unitPrice)}
            </p>
          )}
        </div>
        {enquiry.unreadCount > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-1 text-xs font-semibold text-gray-950">{enquiry.unreadCount} unread</span>
        )}
      </div>
    </Link>
  );
}

export default function MarketplaceEnquiriesPage() {
  const [data, setData] = useState<MarketplaceEnquiriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    marketplaceApi
      .listEnquiries()
      .then(setData)
      .catch((err: any) => setError(err?.message || "Failed to load marketplace enquiries"))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<MarketplaceEnquiryStatus, MarketplaceEnquirySummary[]>();
    data?.enquiries.forEach((enquiry) => {
      map.set(enquiry.status, [...(map.get(enquiry.status) ?? []), enquiry]);
    });
    return map;
  }, [data]);

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-gray-100">Marketplace enquiries</h2>
        <p className="mt-1 text-sm text-gray-400">Buyer dashboard scaffold for listing-bound enquiries and structured offers.</p>
      </div>

      {loading && <div className="py-12 text-center text-gray-400">Loading enquiries...</div>}
      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      {!loading && !error && data?.enquiries.length === 0 && <div className="py-12 text-center text-gray-500">No marketplace enquiries yet.</div>}

      {statusGroups.map((group) => {
        const enquiries = group.statuses.flatMap((status) => grouped.get(status) ?? []);
        if (!enquiries.length) return null;
        return (
          <section key={group.title} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold text-gray-100">{group.title}</h3>
            <div className="grid gap-3">
              {enquiries.map((enquiry) => <EnquiryRow key={enquiry.id} enquiry={enquiry} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
