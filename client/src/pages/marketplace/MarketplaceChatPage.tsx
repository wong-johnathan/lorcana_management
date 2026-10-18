import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import { marketplace } from "../../services/api";
import type { MarketplaceEnquirySummary } from "../../types";
import {
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../../utils/marketplaceParams";
import { formatTimeAgo } from "../../utils/format";

/**
 * Conversation inbox (REQ-11): one thread per (buyer, listing), listed for both
 * the buyer and the seller, newest-first. ACTIVE threads are negotiable;
 * ARCHIVED threads are read-only (D3).
 */
export default function MarketplaceChatPage() {
  const { user } = useAuth();
  const [enquiries, setEnquiries] = useState<MarketplaceEnquirySummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError(null);
    marketplace
      .getEnquiries()
      .then((response) => {
        if (active) setEnquiries(response.enquiries);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load conversations");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-400">Messages</p>
          <h1 className="text-2xl font-bold text-gray-100">Conversations</h1>
        </div>

        {loading ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
            Loading conversations…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : !enquiries || enquiries.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
            No conversations yet. Enquire on a listing to start one.
          </div>
        ) : (
          <ul className="space-y-2">
            {enquiries.map((enquiry) => {
              const isBuyer = enquiry.buyerId === user?.id;
              const other = isBuyer ? enquiry.seller : enquiry.buyer;
              const card = enquiry.listing.card;
              const archived = enquiry.status === "ARCHIVED";
              return (
                <li key={enquiry.id}>
                  <Link
                    to={`/marketplace/chat/${enquiry.id}`}
                    className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3 transition-colors hover:border-gray-700"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-gray-100">
                          {card?.name ?? "Card"}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500">
                          {formatTimeAgo(enquiry.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-gray-400">
                        {isBuyer ? "You're buying" : "You're selling"} · with{" "}
                        <span className="text-gray-300">{other.username}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {marketplaceVariantLabel(enquiry.listing.variant)} ·{" "}
                        {formatPriceMinor(enquiry.listing.priceMinor, enquiry.listing.currency)} ·{" "}
                        requested {enquiry.requestedQuantity}
                      </p>
                    </div>
                    {archived && (
                      <span className="shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400">
                        Archived
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </RequireAuth>
  );
}
