import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { MarketplaceEnquiryDetailResponse, MarketplaceMoney } from "../types";
import { cardTitle, formatMarketplaceMoney, variantLabel } from "../components/marketplace/marketplaceDisplay";

function dollarsToMinor(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function websocketUrl() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/marketplace/ws?token=${encodeURIComponent(token)}`;
}

function timeOf(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
}

type TimelineItem =
  | { kind: "message"; id: string; at: string; senderId: string; senderName: string; text: string }
  | { kind: "offer"; id: string; at: string; senderId: string; senderName: string; quantity: number; unitPrice: MarketplaceMoney };

export default function MarketplaceEnquiryPage() {
  const { enquiryId } = useParams<{ enquiryId: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<MarketplaceEnquiryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerQty, setOfferQty] = useState("1");
  const [offerPrice, setOfferPrice] = useState("");

  const loadEnquiry = useCallback(async (showLoader = false) => {
    if (!enquiryId) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const response = await marketplaceApi.getEnquiry(enquiryId);
      if (response) setData(response);
    } catch (err: any) {
      setError(err?.message || "Failed to load enquiry");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [enquiryId]);

  useEffect(() => {
    loadEnquiry(true);
  }, [loadEnquiry]);

  useEffect(() => {
    if (!enquiryId || typeof WebSocket === "undefined") return;
    const url = websocketUrl();
    if (!url) return;
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "subscribe", enquiryId }));
    });
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.enquiryId === enquiryId) void loadEnquiry(false);
      } catch {
        // Ignore malformed websocket payloads; HTTP refetch remains the fallback.
      }
    });
    return () => socket.close();
  }, [enquiryId, loadEnquiry]);

  const enquiry = data?.enquiry;
  const isBuyer = Boolean(user && enquiry?.buyer.id === user.id);
  const isSeller = Boolean(user && enquiry?.seller.id === user.id);
  const counterparty = isSeller ? enquiry?.buyer : enquiry?.seller;
  const isObo = enquiry?.pricingMode === "ACCEPTS_OFFERS";
  const terminalStatuses = ["DECLINED", "WITHDRAWN", "CANCELLED", "EXPIRED", "COMPLETED", "DISPUTED"];
  const canAct = Boolean(enquiry && (isBuyer || isSeller) && !terminalStatuses.includes(enquiry.status));
  const latestOffer = enquiry?.offers.at(-1) ?? null;
  const canAcceptFixed = Boolean(enquiry && !isObo && isSeller && enquiry.status === "PENDING_SELLER");
  const canAcceptObo = Boolean(enquiry && isObo && latestOffer && latestOffer.proposedBy.id !== user?.id && (enquiry.status === "PENDING_SELLER" || enquiry.status === "AWAITING_BUYER"));
  const canSendOffer = Boolean(canAct && isObo && (enquiry.status === "PENDING_SELLER" || enquiry.status === "AWAITING_BUYER"));

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!enquiry) return [];
    const messages: TimelineItem[] = enquiry.messages.map((m) => ({
      kind: "message", id: m.id, at: m.createdAt, senderId: m.sender.id, senderName: m.sender.username, text: m.message,
    }));
    const offers: TimelineItem[] = enquiry.offers.map((o) => ({
      kind: "offer", id: o.id, at: o.createdAt, senderId: o.proposedBy.id, senderName: o.proposedBy.username, quantity: o.quantity, unitPrice: o.unitPrice,
    }));
    return [...messages, ...offers].sort((a, b) => a.at.localeCompare(b.at));
  }, [enquiry]);

  const openOffer = () => {
    if (!enquiry) return;
    const base = latestOffer?.unitPrice ?? enquiry.askingPrice;
    setOfferQty(String(latestOffer?.quantity ?? enquiry.quantity ?? 1));
    setOfferPrice(base ? String((base.amountMinor / 100).toFixed(2)) : "");
    setOfferOpen(true);
  };

  const runAction = async (fn: () => Promise<unknown>) => {
    if (!enquiryId) return;
    setSaving(true);
    setError(null);
    try {
      await fn();
      await loadEnquiry(false);
    } catch (err: any) {
      setError(err?.message || "Marketplace action failed");
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = () => runAction(async () => {
    if (!enquiryId || !message.trim()) return;
    await marketplaceApi.sendMessage(enquiryId, message.trim());
    setMessage("");
  });

  const sendOffer = () => runAction(async () => {
    if (!enquiryId) return;
    const parsedQuantity = Number(offerQty);
    const unitPriceMinor = dollarsToMinor(offerPrice);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) throw new Error("Enter a valid quantity");
    if (unitPriceMinor === null) throw new Error("Enter a valid unit price");
    await marketplaceApi.createOffer(enquiryId, { quantity: parsedQuantity, unitPriceMinor });
    setOfferOpen(false);
  });

  const acceptEnquiry = () => runAction(() => marketplaceApi.acceptEnquiry(enquiryId!));
  const declineEnquiry = () => runAction(() => marketplaceApi.declineEnquiry(enquiryId!));
  const withdrawEnquiry = () => runAction(() => marketplaceApi.withdrawEnquiry(enquiryId!));

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-gray-400">Loading chat...</div>;
  if (error && !enquiry) return <div className="mx-auto max-w-3xl p-4"><div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div></div>;
  if (!enquiry || !counterparty) return <div className="py-12 text-center text-gray-500">Chat not found.</div>;

  return (
    <div data-testid="marketplace-enquiry-chat" className="flex min-h-0 flex-1 flex-col bg-gray-950">
      <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-3 py-2.5">
        <Link to="/marketplace/enquiries" className="px-1 text-xl leading-none text-amber-300 hover:text-amber-200" aria-label="Back to messages">←</Link>
        <img src={enquiry.card.imageUrl} alt={cardTitle(enquiry.card)} className="h-11 w-8 rounded object-cover bg-gray-800" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-100">{counterparty.username}</p>
          <p className="truncate text-xs text-gray-400">{cardTitle(enquiry.card)} · {variantLabel(enquiry.variant)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-amber-300">{enquiry.askingPrice ? formatMarketplaceMoney(enquiry.askingPrice) : "—"}</p>
          <span className="text-[10px] uppercase tracking-wide text-gray-500">{enquiry.status.replace(/_/g, " ")}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-950">
        <div className="mx-auto w-full max-w-3xl space-y-3 p-4">
        {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{error}</div>}

        {timeline.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Say hi to {counterparty.username}. Meetup, delivery, and payment are arranged here.
          </p>
        ) : timeline.map((item) => {
          const mine = item.senderId === user?.id;
          if (item.kind === "offer") {
            return (
              <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl border px-4 py-2.5 ${mine ? "border-amber-800 bg-amber-950/40" : "border-gray-700 bg-gray-900"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Offer · {item.senderName}</p>
                  <p className="text-sm text-gray-100">{item.quantity} × {formatMarketplaceMoney(item.unitPrice)}</p>
                  <p className="text-right text-[10px] text-gray-500">{timeOf(item.at)}</p>
                </div>
              </div>
            );
          }
          return (
            <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${mine ? "rounded-br-md bg-amber-500 text-gray-950" : "rounded-bl-md bg-gray-800 text-gray-100"}`}>
                {!mine && <p className="mb-0.5 text-[10px] font-semibold text-gray-400">{item.senderName}</p>}
                <p className="whitespace-pre-wrap break-words">{item.text}</p>
                <p className={`text-right text-[10px] ${mine ? "text-gray-800" : "text-gray-500"}`}>{timeOf(item.at)}</p>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <div className="border-t border-gray-800 bg-gray-900 px-3 py-2.5">
        <div className="mx-auto w-full max-w-3xl space-y-2">
        {enquiry.reservation?.status === "RESERVED" && (
          <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
            Reserved — {enquiry.reservation.quantity} × {formatMarketplaceMoney({ amountMinor: enquiry.reservation.unitPriceMinor, currency: enquiry.reservation.currency })} until {timeOf(enquiry.reservation.expiresAt)}
          </div>
        )}

        {offerOpen && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-700 bg-gray-950 p-2">
            <label className="text-xs text-gray-400">
              Qty
              <input type="number" min={1} value={offerQty} onChange={(e) => setOfferQty(e.target.value)} className="ml-1 w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-100" />
            </label>
            <label className="text-xs text-gray-400">
              Unit price
              <input type="number" min={0} step="0.01" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} className="ml-1 w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-100" />
            </label>
            <button type="button" onClick={sendOffer} disabled={saving} className="rounded bg-amber-500 px-3 py-1.5 text-xs font-bold text-gray-950 disabled:opacity-60">Send offer</button>
            <button type="button" onClick={() => setOfferOpen(false)} disabled={saving} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300">Cancel</button>
          </div>
        )}

        {canAct && (
          <div className="flex flex-wrap gap-2">
            {canAcceptFixed && <button type="button" onClick={acceptEnquiry} disabled={saving} className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-gray-950 disabled:opacity-60">Accept &amp; reserve</button>}
            {canAcceptObo && <button type="button" onClick={acceptEnquiry} disabled={saving} className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-gray-950 disabled:opacity-60">Accept offer</button>}
            {canSendOffer && <button type="button" onClick={openOffer} disabled={saving} className="rounded-md border border-amber-700 px-3 py-1.5 text-xs font-semibold text-amber-300 disabled:opacity-60">Make offer</button>}
            {isSeller && <button type="button" onClick={declineEnquiry} disabled={saving} className="rounded-md border border-red-800 px-3 py-1.5 text-xs font-semibold text-red-300 disabled:opacity-60">Decline</button>}
            {isBuyer && <button type="button" onClick={withdrawEnquiry} disabled={saving} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 disabled:opacity-60">Withdraw</button>}
          </div>
        )}

        {canAct && (
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void sendMessage(); }}
              placeholder={`Message ${counterparty.username}…`}
              className="flex-1 rounded-full border border-gray-700 bg-gray-950 px-4 py-2 text-sm text-gray-100"
            />
            <button type="button" onClick={sendMessage} disabled={saving || !message.trim()} className="rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-gray-950 disabled:opacity-60">Send</button>
          </div>
        )}

        {!canAct && <p className="text-center text-xs text-gray-500">This chat is {enquiry.status.toLowerCase().replace(/_/g, " ")}.</p>}
        </div>
      </div>
    </div>
  );
}
