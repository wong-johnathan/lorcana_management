import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import InlineReviewForm from "../../components/marketplace/InlineReviewForm";
import ReviewAccordion from "../../components/marketplace/ReviewAccordion";
import { marketplace } from "../../services/api";
import type {
  MarketplaceEnquiryDetail,
  EnquiryMessage,
  EnquiryTransaction,
} from "../../types";
import {
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../../utils/marketplaceParams";

/**
 * A single enquiry thread (REQ-11/13/14): plain-text chronological bubbles
 * (React default escaping — no markdown/HTML), a message composer, and the
 * seller's mark-sold dialog (q defaulted to the requested quantity). System
 * events (mark-sold, buyer-confirm) render inline as centered grey text, and
 * the pending transaction renders a status card with the buyer's confirm action.
 */
export default function MarketplaceChatThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [enquiry, setEnquiry] = useState<MarketplaceEnquiryDetail | null>(null);
  const [messages, setMessages] = useState<EnquiryMessage[]>([]);
  const [transactions, setTransactions] = useState<EnquiryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [markSoldOpen, setMarkSoldOpen] = useState(false);
  const [soldQuantity, setSoldQuantity] = useState(1);
  const [soldResult, setSoldResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await marketplace.getEnquiry(id);
      setEnquiry(response.enquiry);
      setMessages(response.messages);
      setTransactions(response.transactions ?? []);
      setSoldQuantity(response.enquiry.requestedQuantity);
      window.dispatchEvent(new CustomEvent("unread:refresh"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  if (!user) {
    return <RequireAuth>{null}</RequireAuth>;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          Loading conversation…
        </div>
      </div>
    );
  }

  if (error || !enquiry) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          {error ?? "Conversation not found"}
        </div>
      </div>
    );
  }

  const isSeller = enquiry.sellerId === user.id;
  const isBuyer = enquiry.buyerId === user.id;
  const otherUsername = isBuyer ? enquiry.seller.username : enquiry.buyer.username;
  const archived = enquiry.status === "ARCHIVED";
  const listing = enquiry.listing;
  const card = listing.card;

  const pendingTransaction = transactions.find((t) => t.status === "PENDING_CONFIRMATION");
  const completedTransaction = transactions.find((t) => t.status === "COMPLETED");
  const hasOpenTransaction = pendingTransaction != null || completedTransaction != null;

  const send = async () => {
    if (!body.trim() || sending || archived) return;
    setSending(true);
    setActionError(null);
    try {
      const message = await marketplace.postMessage(enquiry.id, body.trim());
      setMessages((prev) => [...prev, message]);
      setBody("");
      window.dispatchEvent(new CustomEvent("unread:refresh"));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const confirmMarkSold = async () => {
    setActionError(null);
    try {
      const result = await marketplace.markSold(enquiry.id, soldQuantity);
      setMarkSoldOpen(false);
      setSoldResult(`Marked ${result.quantity} as sold — a pending transaction was created.`);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to mark as sold");
    }
  };

  const confirmReceipt = async (transactionId: string) => {
    setActionError(null);
    setConfirming(true);
    try {
      await marketplace.confirm(transactionId);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to confirm receipt");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/marketplace/chat" className="text-sm text-gray-400 hover:text-amber-300">
          ← All conversations
        </Link>
        {archived ? (
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400">
            Archived
          </span>
        ) : (
          <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-300">
            Active
          </span>
        )}
      </div>

      {/* Listing context */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-gray-100">{card?.name ?? "Card"}</h1>
            <p className="text-xs text-gray-500">
              {card?.setName} · {marketplaceVariantLabel(listing.variant)} ·{" "}
              {formatPriceMinor(listing.priceMinor, listing.currency)}
            </p>
          </div>
          <Link
            to={`/marketplace/listing/${listing.id}`}
            className="shrink-0 text-sm text-amber-400 hover:text-amber-300"
          >
            View listing
          </Link>
        </div>
        <p className="mt-2 text-sm text-gray-400">
          {isSeller ? "Buyer" : "Seller"}:{" "}
          <Link
            to={`/marketplace/seller/${isSeller ? enquiry.buyer.id : enquiry.seller.id}`}
            className="text-gray-200 hover:text-amber-300"
          >
            {otherUsername}
          </Link>{" "}
          · requested quantity {enquiry.requestedQuantity}
        </p>
      </div>

      {soldResult && (
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/40 p-4 text-sm text-emerald-200">
          {soldResult}{" "}
          <Link
            to="/marketplace/transactions"
            className="underline hover:text-emerald-100"
          >
            View transactions
          </Link>
        </div>
      )}

      {/* Pending transaction status card (buyer confirms, seller awaits) */}
      {pendingTransaction && (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/40 p-4">
          {isBuyer ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-200">
                  Seller marked {pendingTransaction.quantity} as sold
                </p>
                <p className="text-xs text-gray-400">
                  Confirm receipt to complete the transfer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void confirmReceipt(pendingTransaction.id)}
                disabled={confirming}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirming ? "Confirming…" : "Confirm receipt"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-200">Awaiting buyer confirmation</p>
                <p className="text-xs text-gray-400">
                  You marked {pendingTransaction.quantity} as sold.
                </p>
              </div>
              <Link
                to="/marketplace/transactions"
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                View transactions
              </Link>
            </div>
          )}
        </div>
      )}

      {!pendingTransaction && completedTransaction && (
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/40 p-4 text-sm text-emerald-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Sale complete — {completedTransaction.quantity} transferred to the buyer.</span>
          </div>
          <ReviewAccordion
            myReview={completedTransaction.myReview ?? null}
            counterpartReview={completedTransaction.counterpartReview ?? null}
            counterpartRole={isBuyer ? "seller" : "buyer"}
          />
          {completedTransaction.status === "COMPLETED" && (
            <InlineReviewForm
              transactionId={completedTransaction.id}
              revieweeRole={isBuyer ? "seller" : "buyer"}
              myReview={completedTransaction.myReview ?? null}
            />
          )}
        </div>
      )}

      {/* Messages */}
      <div className="space-y-2">
        {messages.length === 0 && (
          <p className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-500">
            No messages yet. Say hello and agree on the details.
          </p>
        )}
        {messages.map((message) => {
          if (message.kind === "SYSTEM") {
            return (
              <div key={message.id} className="flex justify-center">
                <span
                  data-testid="system-message"
                  className="rounded-full bg-gray-900/60 px-3 py-1 text-center text-xs text-gray-400"
                >
                  {message.body}
                </span>
              </div>
            );
          }
          const mine = message.senderId === user.id;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                data-testid="chat-bubble"
                className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "rounded-br-sm bg-amber-500 text-gray-950"
                    : "rounded-bl-sm bg-gray-800 text-gray-100"
                }`}
              >
                {message.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {actionError && <p className="text-sm text-red-300">{actionError}</p>}

      {/* Composer + seller actions */}
      {archived ? (
        <p className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-center text-sm text-gray-500">
          This conversation is archived and read-only.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={body}
              placeholder="Type a message…"
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void send();
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!body.trim() || sending}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>

          {isSeller && !hasOpenTransaction && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSoldQuantity(enquiry.requestedQuantity);
                  setMarkSoldOpen(true);
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Mark as sold
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mark-sold dialog */}
      {markSoldOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setMarkSoldOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mark as sold"
            className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-100">Mark as sold</h2>
            <p className="mt-2 text-sm text-gray-400">
              This creates a pending transaction for the agreed quantity. The buyer then
              confirms receipt to complete the transfer.
            </p>
            <label className="mt-4 block text-sm text-gray-300">
              Quantity
              <input
                type="number"
                min={1}
                max={listing.quantity}
                value={soldQuantity}
                onChange={(event) => setSoldQuantity(Number(event.target.value))}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
              />
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Remaining on listing: {listing.quantity}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMarkSoldOpen(false)}
                className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmMarkSold()}
                disabled={soldQuantity < 1 || soldQuantity > listing.quantity}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
