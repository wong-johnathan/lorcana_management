import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { marketplace } from "../../services/api";
import type { MarketplaceTransaction } from "../../types";
import { formatPriceMinor, marketplaceVariantLabel } from "../../utils/marketplaceParams";
import { formatTimeAgo } from "../../utils/format";
import ReviewSummary from "../marketplace/ReviewSummary";

function statusLabel(transaction: MarketplaceTransaction): string {
  if (transaction.status === "PENDING_CONFIRMATION") return "Pending confirmation";
  if (transaction.status === "COMPLETED") {
    return transaction.completedCause === "AUTO_TRANSFER" ? "Completed · Auto-transferred" : "Completed";
  }
  return "Cancelled";
}

/**
 * Read-only transaction history on the account page (REQ-REV-4). Sources ALL
 * statuses newest-first from `GET /marketplace/transactions` (no status filter)
 * and renders each entry with card/variant/qty/unit+line price/status/date, a
 * counterpart profile link, and read-only review comments (only when present).
 * No action controls — confirm/cancel/adjust/review live on the thread/list.
 */
export default function TransactionHistory() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<MarketplaceTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError(null);
    marketplace
      .getTransactions()
      .then((response) => {
        if (active) setTransactions(response.transactions);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load transactions");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-4">
      <div>
        <h3 className="font-medium">Transaction history</h3>
        <p className="mt-1 text-sm text-gray-400">Your marketplace trades, newest first.</p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-6 text-center text-sm text-gray-400">
          Loading transactions…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : !transactions || transactions.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-6 text-center text-sm text-gray-400">
          No transactions yet.
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((transaction) => {
            const isBuyer = transaction.buyerId === user!.id;
            const isSeller = transaction.sellerId === user!.id;
            const counterpart = isBuyer ? transaction.seller : isSeller ? transaction.buyer : null;
            const counterpartRole = isBuyer ? "seller" : "buyer";
            const counterpartLabel = counterpartRole === "seller" ? "Seller's review" : "Buyer's review";
            const hasReviews = transaction.myReview != null || transaction.counterpartReview != null;

            return (
              <div key={transaction.id} data-testid="transaction-history-entry" className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold text-gray-100">
                      {transaction.card?.name ?? "Card"}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {marketplaceVariantLabel(transaction.variant)} · Qty {transaction.quantity} ·{" "}
                      {formatPriceMinor(transaction.priceMinor, transaction.currency)} each ·{" "}
                      {formatPriceMinor(transaction.priceMinor * transaction.quantity, transaction.currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-300">
                      {statusLabel(transaction)}
                    </span>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatTimeAgo(transaction.soldAt)}
                    </p>
                  </div>
                </div>

                {counterpart && (
                  <p className="mt-1 text-xs text-gray-400">
                    <Link
                      to={`/marketplace/seller/${counterpart.id}`}
                      className="text-gray-200 hover:text-amber-300"
                    >
                      {isBuyer ? "Sold by" : "Bought by"} {counterpart.username}
                    </Link>
                  </p>
                )}

                {hasReviews && (
                  <div className="mt-3 border-t border-gray-800 pt-3">
                    <ReviewSummary label="Your review" review={transaction.myReview ?? null} />
                    <ReviewSummary label={counterpartLabel} review={transaction.counterpartReview ?? null} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
