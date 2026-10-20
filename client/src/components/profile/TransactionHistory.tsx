import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { marketplace } from "../../services/api";
import type { MarketplaceTransaction } from "../../types";
import { formatPriceMinor, marketplaceVariantLabel } from "../../utils/marketplaceParams";
import { formatTimeAgo } from "../../utils/format";
import ReviewSummary from "../marketplace/ReviewSummary";

const PAGE_SIZE = 5;

function statusLabel(transaction: MarketplaceTransaction): string {
  if (transaction.status === "PENDING_CONFIRMATION") return "Pending confirmation";
  if (transaction.status === "COMPLETED") {
    return transaction.completedCause === "AUTO_TRANSFER" ? "Completed · Auto-transferred" : "Completed";
  }
  return "Cancelled";
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Read-only transaction history on the account page (REQ-REV-4, REQ-ACC-1,
 * REQ-PAG-1). Sources ALL statuses newest-first from
 * `GET /marketplace/transactions` (no status filter, single fetch) and renders
 * each entry with card/variant/qty/unit+line price/status/date, a counterpart
 * profile link, and read-only review comments (only when present).
 *
 * The section is a disclosure (collapsed by default, no persistence) whose
 * panel is always mounted and toggled with `hidden`; the header chip summarises
 * the load. The body is paginated client-side, 5 entries per page, over the
 * single response. No action controls — confirm/cancel/adjust/review live on
 * the thread/list.
 */
export default function TransactionHistory() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<MarketplaceTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  const buttonId = useId();
  const panelId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);

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

  const items = transactions ?? [];
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const effectivePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageItems = items.slice(effectivePage * PAGE_SIZE, (effectivePage + 1) * PAGE_SIZE);
  const showPager = !loading && !error && items.length > PAGE_SIZE;

  const chipText = loading
    ? "Loading…"
    : error
      ? "Couldn’t load"
      : items.length === 0
        ? "No transactions yet"
        : items.length === 1
          ? "1 transaction"
          : `${items.length} transactions`;

  const goToPage = (nextPage: number, activated: "previous" | "next") => {
    setPage(nextPage);
    listRef.current?.scrollIntoView({
      block: "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });

    const activatedBoundBecomesDisabled =
      activated === "next" ? nextPage >= totalPages - 1 : nextPage <= 0;
    if (activatedBoundBecomesDisabled) {
      requestAnimationFrame(() => {
        const sibling = activated === "next" ? previousButtonRef.current : nextButtonRef.current;
        sibling?.focus();
      });
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-4">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 rounded-md text-left font-medium text-gray-100 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          <span
            aria-hidden="true"
            className={`transform text-xs text-gray-500 motion-safe:transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          <span>Transaction history</span>
          <span className="ml-auto rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-300">
            {chipText}
          </span>
        </button>
      </h3>

      <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} className="space-y-3">
        <p className="text-sm text-gray-400">Your marketplace trades, newest first.</p>

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
          <div ref={listRef} className="scroll-mt-4 space-y-2">
            {pageItems.map((transaction) => {
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

            {showPager && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  ref={previousButtonRef}
                  aria-label="Previous page"
                  disabled={effectivePage === 0}
                  onClick={() => goToPage(effectivePage - 1, "previous")}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:border-amber-500/60 hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-700 disabled:hover:text-gray-200"
                >
                  Previous
                </button>
                <span aria-live="polite" className="text-sm text-gray-400">
                  Page {effectivePage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  ref={nextButtonRef}
                  aria-label="Next page"
                  disabled={effectivePage >= totalPages - 1}
                  onClick={() => goToPage(effectivePage + 1, "next")}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:border-amber-500/60 hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-700 disabled:hover:text-gray-200"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
