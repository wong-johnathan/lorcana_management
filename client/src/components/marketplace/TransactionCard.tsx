import { useEffect, useState } from "react";
import { marketplace } from "../../services/api";
import type { MarketplaceTransaction } from "../../types";
import {
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../../utils/marketplaceParams";

interface TransactionCardProps {
  transactionId: string;
  currentUserId: string;
  /** Called after any successful action (confirm/cancel/adjust/review). */
  onChanged?: () => void;
}

/**
 * A single transaction with role-aware actions (REQ-16/17/18/19). Fetches
 * `GET /marketplace/transactions/:id` and renders confirm (buyer),
 * cancel/adjust (either party, PENDING only), and the review form (COMPLETED).
 */
export default function TransactionCard({
  transactionId,
  currentUserId,
  onChanged,
}: TransactionCardProps) {
  const [transaction, setTransaction] = useState<MarketplaceTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await marketplace.getTransaction(transactionId);
      setTransaction(result);
      setAdjustQuantity(String(result.quantity));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transaction");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
        Loading transaction…
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
        {error ?? "Transaction not found"}
      </div>
    );
  }

  const isBuyer = transaction.buyerId === currentUserId;
  const isSeller = transaction.sellerId === currentUserId;
  const isPending = transaction.status === "PENDING_CONFIRMATION";
  const isCompleted = transaction.status === "COMPLETED";
  const counterpart = isBuyer ? transaction.seller : isSeller ? transaction.buyer : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (() => {
    if (isPending) {
      return (
        <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-300">
          Pending confirmation
        </span>
      );
    }
    if (isCompleted) {
      const auto = transaction.completedCause === "AUTO_TRANSFER";
      return (
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-300">
            Completed
          </span>
          {auto && (
            <span
              data-testid="auto-transfer-badge"
              className="rounded-full bg-sky-900/50 px-2 py-0.5 text-xs font-medium text-sky-300"
              title="Transferred automatically after 30 days without buyer confirmation"
            >
              Auto-transferred
            </span>
          )}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400">
        Cancelled{transaction.cancelledBy ? ` by ${transaction.cancelledBy}` : ""}
      </span>
    );
  })();

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-gray-100">
            {transaction.card?.name ?? "Card"}
          </h3>
          <p className="text-xs text-gray-500">
            {marketplaceVariantLabel(transaction.variant)} · Qty {transaction.quantity} ·{" "}
            {formatPriceMinor(transaction.priceMinor * transaction.quantity, transaction.currency)}
          </p>
        </div>
        {statusBadge}
      </div>

      {counterpart && (
        <p className="mt-1 text-xs text-gray-400">
          {isBuyer ? "Sold by" : "Bought by"}{" "}
          <span className="text-gray-200">{counterpart.username}</span>
        </p>
      )}

      {actionError && <p className="mt-2 text-sm text-red-300">{actionError}</p>}

      {isPending && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isBuyer && (
            <button
              type="button"
              onClick={() => void run(() => marketplace.confirm(transaction.id))}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Working…" : "Confirm receipt"}
            </button>
          )}

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              Quantity
              <input
                type="number"
                min={1}
                value={adjustQuantity}
                disabled={busy}
                onChange={(event) => setAdjustQuantity(event.target.value)}
                className="w-20 rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const qty = Number(adjustQuantity);
                if (!Number.isInteger(qty) || qty < 1) {
                  setActionError("Quantity must be a whole number of at least 1");
                  return;
                }
                void run(() => marketplace.adjustQuantity(transaction.id, qty));
              }}
              disabled={busy}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 disabled:opacity-50"
            >
              Adjust
            </button>
          </div>

          <button
            type="button"
            onClick={() => void run(() => marketplace.cancel(transaction.id))}
            disabled={busy}
            className="rounded-lg border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:border-red-600 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {isCompleted && (isBuyer || isSeller) && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          {transaction.myReview ? (
            <div>
              <p className="text-sm font-medium text-emerald-300">Review submitted.</p>
              <p className="mt-1 text-xs text-emerald-200/80">
                {transaction.myReview.rating}{" "}
                {transaction.myReview.rating === 1 ? "star" : "stars"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Review {isBuyer ? "the seller" : "the buyer"}
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  Rating
                  <select
                    value={rating}
                    onChange={(event) => setRating(event.target.value)}
                    disabled={busy}
                    className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value} {value === 1 ? "star" : "stars"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm text-gray-300">
                Comment (optional)
                <textarea
                  value={comment}
                  rows={2}
                  placeholder="How was the trade?"
                  onChange={(event) => setComment(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  void run(() =>
                    marketplace.postReview(transaction.id, Number(rating), comment.trim() || undefined)
                  )
                }
                disabled={busy}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Submit review"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
