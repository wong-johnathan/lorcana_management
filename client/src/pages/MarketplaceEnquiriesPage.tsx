import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { MarketplaceEnquirySummary, MarketplaceEnquiriesResponse, User } from "../types";
import { cardTitle, formatMarketplaceMoney, variantLabel } from "../components/marketplace/marketplaceDisplay";

function previewFor(enquiry: MarketplaceEnquirySummary, counterparty: User): string {
  if (enquiry.latestOffer) {
    return `Offer: ${enquiry.latestOffer.quantity} × ${formatMarketplaceMoney(enquiry.latestOffer.unitPrice)}`;
  }
  if (enquiry.status === "RESERVED") return "Reserved";
  if (enquiry.status === "PENDING_SELLER") return "Awaiting seller";
  if (enquiry.status === "AWAITING_BUYER") return "Awaiting your reply";
  if (enquiry.status === "COMPLETED") return "Completed";
  return `Chat with ${counterparty.username}`;
}

function timeOf(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

export default function MarketplaceEnquiriesPage() {
  const { user } = useAuth();
  const [data, setData] = useState<MarketplaceEnquiriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    marketplaceApi
      .listEnquiries()
      .then(setData)
      .catch((err: any) => setError(err?.message || "Failed to load messages"))
      .finally(() => setLoading(false));
  }, []);

  const enquiries = data?.enquiries ?? [];

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-gray-100">Messages</h2>
        <p className="mt-1 text-sm text-gray-400">Your conversations with buyers and sellers.</p>
      </div>

      {loading && <div className="py-12 text-center text-gray-400">Loading messages...</div>}
      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      {!loading && !error && enquiries.length === 0 && (
        <div className="py-12 text-center text-gray-500">No messages yet. Browse the marketplace and tap “Chat” on a listing.</div>
      )}

      <div className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        {enquiries.map((enquiry) => {
          const counterparty = enquiry.buyer.id === user?.id ? enquiry.seller : enquiry.buyer;
          return (
            <Link key={enquiry.id} to={`/marketplace/enquiries/${enquiry.id}`} className="flex items-center gap-3 p-3 hover:bg-gray-800/50">
              <img src={enquiry.card.imageUrl} alt={cardTitle(enquiry.card)} className="h-14 w-10 shrink-0 rounded object-cover bg-gray-800" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-100">{counterparty.username}</p>
                  <span className="truncate text-xs text-gray-500">{cardTitle(enquiry.card)} · {variantLabel(enquiry.variant)}</span>
                </div>
                <p className="truncate text-xs text-gray-400">{previewFor(enquiry, counterparty)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] text-gray-500">{timeOf(enquiry.lastActivityAt)}</span>
                {enquiry.unreadCount > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-gray-950">{enquiry.unreadCount}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
