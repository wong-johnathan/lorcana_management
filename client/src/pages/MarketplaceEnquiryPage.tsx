import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { MarketplaceEnquiryDetailResponse } from "../types";
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

export default function MarketplaceEnquiryPage() {
  const { enquiryId } = useParams<{ enquiryId: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<MarketplaceEnquiryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  const loadEnquiry = useCallback(async (showLoader = false) => {
    if (!enquiryId) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const response = await marketplaceApi.getEnquiry(enquiryId);
      if (response) {
        setData(response);
        const latest = response.enquiry.latestOffer;
        setQuantity(String(latest?.quantity ?? response.enquiry.quantity));
        setUnitPrice(latest ? String((latest.unitPrice.amountMinor / 100).toFixed(2)) : "");
      }
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
  const isObo = enquiry?.pricingMode === "ACCEPTS_OFFERS";
  const terminalStatuses = ["DECLINED", "WITHDRAWN", "CANCELLED", "EXPIRED", "COMPLETED", "DISPUTED"];
  const canAct = Boolean(enquiry && (isBuyer || isSeller) && !terminalStatuses.includes(enquiry.status));
  const latestOffer = enquiry?.offers.at(-1) ?? null;
  const canAcceptFixed = Boolean(enquiry && !isObo && isSeller && enquiry.status === "PENDING_SELLER");
  const canAcceptObo = Boolean(enquiry && isObo && latestOffer && latestOffer.proposedBy.id !== user?.id && (enquiry.status === "PENDING_SELLER" || enquiry.status === "AWAITING_BUYER"));
  const canSendOffer = Boolean(canAct && isObo && (enquiry.status === "PENDING_SELLER" || enquiry.status === "AWAITING_BUYER"));

  const actionLabel = useMemo(() => {
    if (isBuyer && enquiry?.offers.length === 0) return "Make offer";
    return "Send counteroffer";
  }, [enquiry, isBuyer]);

  const runAction = async (fn: () => Promise<unknown>, messageText: string) => {
    if (!enquiryId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      setSuccess(messageText);
      await loadEnquiry(false);
    } catch (err: any) {
      setError(err?.message || "Marketplace action failed");
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = () => runAction(async () => {
    if (!enquiryId) return;
    await marketplaceApi.sendMessage(enquiryId, message.trim());
    setMessage("");
  }, "Message sent");

  const sendOffer = () => runAction(async () => {
    if (!enquiryId) return;
    const parsedQuantity = Number(quantity);
    const unitPriceMinor = dollarsToMinor(unitPrice);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) throw new Error("Enter a valid quantity");
    if (unitPriceMinor === null) throw new Error("Enter a valid unit price");
    await marketplaceApi.createOffer(enquiryId, { quantity: parsedQuantity, unitPriceMinor });
  }, "Offer sent");

  const acceptEnquiry = () => runAction(async () => {
    if (!enquiryId) return;
    await marketplaceApi.acceptEnquiry(enquiryId);
  }, "Accepted and reserved");

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-gray-400">Loading enquiry...</div>;
  if (error && !data) return <div className="mx-auto max-w-4xl p-4"><div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div></div>;
  if (!enquiry) return <div className="py-12 text-center text-gray-500">Enquiry not found.</div>;

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-4">
      <Link to="/marketplace/enquiries" className="text-sm text-amber-300 hover:text-amber-200">← Back to enquiries</Link>
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-100">{cardTitle(enquiry.card)}</h2>
            <p className="text-sm text-gray-400">{variantLabel(enquiry.variant)} · Requested qty {enquiry.quantity} · {enquiry.status}</p>
            <p className="text-sm text-gray-500">Buyer {enquiry.buyer.username} · Seller {enquiry.seller.username}</p>
            <p className="text-sm text-gray-500">{isObo ? "Open to offers" : `Fixed price ${formatMarketplaceMoney(enquiry.askingPrice)}`}</p>
          </div>
          {enquiry.reservation && (
            <span className="rounded-full border border-amber-800 bg-amber-950/40 px-3 py-1 text-sm text-amber-200">
              Reservation {enquiry.reservation.status}
            </span>
          )}
        </div>
        {enquiry.latestOffer && (
          <p className="text-sm text-amber-300">Latest offer: {enquiry.latestOffer.quantity} × {formatMarketplaceMoney(enquiry.latestOffer.unitPrice)}</p>
        )}
      </section>

      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{success}</div>}

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h3 className="text-lg font-semibold text-gray-100">Chat</h3>
        <p className="text-xs text-gray-500">Use chat for meetup, delivery, payment, and logistics. Structured shipping fields are intentionally hidden for V1.</p>
        {enquiry.messages.length === 0 ? <p className="text-sm text-gray-500">No messages yet.</p> : enquiry.messages.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
            <p className="text-sm font-medium text-gray-100">{item.sender.username}</p>
            <p className="text-sm text-gray-300">{item.message}</p>
          </div>
        ))}
        {canAct && (
          <div className="space-y-2">
            <label className="block text-sm text-gray-300" htmlFor="message">Message</label>
            <textarea id="message" value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100" />
            <button type="button" onClick={sendMessage} disabled={saving || !message.trim()} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-60">Send message</button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h3 className="text-lg font-semibold text-gray-100">Deal terms</h3>
        {!isObo ? (
          <p className="text-sm text-gray-300">Fixed-price listing. Seller can accept the requested quantity at the listed price, or continue in chat / decline.</p>
        ) : enquiry.offers.length === 0 ? (
          <p className="text-sm text-gray-500">No offers yet.</p>
        ) : enquiry.offers.map((offer) => (
          <div key={offer.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-300">
            Offer from {offer.proposedBy.username}: {offer.quantity} × {formatMarketplaceMoney(offer.unitPrice)}
          </div>
        ))}
        {canSendOffer && (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm text-gray-300" htmlFor="quantity">Quantity</label>
              <input id="quantity" type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100" />
            </div>
            <div>
              <label className="block text-sm text-gray-300" htmlFor="unitPrice">Unit price</label>
              <input id="unitPrice" type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100" />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={sendOffer} disabled={saving} className="rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-100 disabled:opacity-60">{actionLabel}</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {(canAcceptFixed || canAcceptObo) && <button type="button" onClick={acceptEnquiry} disabled={saving} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-60">Accept and reserve</button>}
          {isSeller && canAct && <button type="button" onClick={() => runAction(() => marketplaceApi.declineEnquiry(enquiry.id), "Enquiry declined")} disabled={saving} className="rounded border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-60">Decline</button>}
          {isBuyer && canAct && <button type="button" onClick={() => runAction(() => marketplaceApi.withdrawEnquiry(enquiry.id), "Enquiry withdrawn")} disabled={saving} className="rounded border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 disabled:opacity-60">Withdraw</button>}
          {enquiry.reservation?.status === "RESERVED" && <button type="button" onClick={() => runAction(() => marketplaceApi.cancelReservation(enquiry.reservation!.id), "Reservation cancelled")} disabled={saving} className="rounded border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 disabled:opacity-60">Cancel reservation</button>}
        </div>
      </section>
    </div>
  );
}
