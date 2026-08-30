import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marketplace as marketplaceApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { MarketplaceEnquiryDetailResponse, MarketplaceFulfilmentMethod, ListingCurrency } from "../types";
import { cardTitle, formatMarketplaceMoney, variantLabel } from "../components/marketplace/marketplaceDisplay";

function dollarsToMinor(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
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
  const [shippingPrice, setShippingPrice] = useState("0");
  const [currency, setCurrency] = useState<ListingCurrency>("SGD");
  const [fulfilmentMethod, setFulfilmentMethod] = useState<MarketplaceFulfilmentMethod>("MEETUP");
  const [buyerCountryCode, setBuyerCountryCode] = useState("SG");

  useEffect(() => {
    if (!enquiryId) return;
    setLoading(true);
    setError(null);
    marketplaceApi
      .getEnquiry(enquiryId)
      .then((response) => {
        setData(response);
        const latest = response.enquiry.latestOffer;
        if (latest) {
          setQuantity(String(latest.quantity));
          setUnitPrice(String((latest.unitPrice.amountMinor / 100).toFixed(2)));
          setShippingPrice(String(((latest.shippingPrice?.amountMinor ?? 0) / 100).toFixed(2)));
          setCurrency(latest.unitPrice.currency);
          setFulfilmentMethod(latest.fulfilmentMethod);
        }
      })
      .catch((err: any) => setError(err?.message || "Failed to load enquiry"))
      .finally(() => setLoading(false));
  }, [enquiryId]);

  const enquiry = data?.enquiry;
  const isBuyer = Boolean(user && enquiry?.buyer.id === user.id);
  const isSeller = Boolean(user && enquiry?.seller.id === user.id);
  const canAct = Boolean(enquiry && (isBuyer || isSeller) && !["DECLINED", "WITHDRAWN", "CANCELLED", "EXPIRED", "COMPLETED", "DISPUTED"].includes(enquiry.status));

  const actionLabel = useMemo(() => {
    if (!enquiry) return "Send counteroffer";
    if (isSeller && enquiry.status === "PENDING_SELLER") return "Send counteroffer";
    if (isBuyer && enquiry.status === "AWAITING_BUYER") return "Send counteroffer";
    return "Send counteroffer";
  }, [enquiry, isBuyer, isSeller]);

  const runAction = async (fn: () => Promise<unknown>, messageText: string) => {
    if (!enquiryId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      setSuccess(messageText);
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
    const unitPriceMinor = dollarsToMinor(unitPrice);
    const shippingPriceMinor = dollarsToMinor(shippingPrice);
    if (unitPriceMinor === null || shippingPriceMinor === null) throw new Error("Enter valid offer prices");
    await marketplaceApi.createOffer(enquiryId, {
      quantity: Number(quantity),
      unitPriceMinor,
      shippingPriceMinor,
      currency,
      fulfilmentMethod,
      buyerCountryCode: buyerCountryCode.trim().toUpperCase(),
    });
  }, "Counteroffer sent");

  const acceptOffer = () => runAction(async () => {
    if (!enquiryId) return;
    await marketplaceApi.acceptEnquiry(enquiryId);
  }, "Offer accepted and reservation created");

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
            <p className="text-sm text-gray-400">{variantLabel(enquiry.variant)} × {enquiry.quantity} · {enquiry.status}</p>
            <p className="text-sm text-gray-500">Buyer {enquiry.buyer.username} · Seller {enquiry.seller.username}</p>
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
        <h3 className="text-lg font-semibold text-gray-100">Messages</h3>
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
        <h3 className="text-lg font-semibold text-gray-100">Offers</h3>
        {enquiry.offers.length === 0 ? <p className="text-sm text-gray-500">No structured offers yet.</p> : enquiry.offers.map((offer) => (
          <div key={offer.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-300">
            Offer from {offer.proposedBy.username}: {offer.quantity} × {formatMarketplaceMoney(offer.unitPrice)}
            {offer.shippingPrice && <span> · Shipping {formatMarketplaceMoney(offer.shippingPrice)}</span>}
          </div>
        ))}
        {canAct && (
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <label className="block text-sm text-gray-300" htmlFor="quantity">Quantity</label>
              <input id="quantity" type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100" />
            </div>
            <div>
              <label className="block text-sm text-gray-300" htmlFor="unitPrice">Unit price</label>
              <input id="unitPrice" type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100" />
            </div>
            <div>
              <label className="block text-sm text-gray-300" htmlFor="shippingPrice">Shipping</label>
              <input id="shippingPrice" type="number" min="0" step="0.01" value={shippingPrice} onChange={(event) => setShippingPrice(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100" />
            </div>
            <div>
              <label className="block text-sm text-gray-300" htmlFor="currency">Currency</label>
              <select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value as ListingCurrency)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100">
                {(["SGD", "USD", "MYR", "EUR", "GBP", "AUD", "CAD", "JPY"] as ListingCurrency[]).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300" htmlFor="buyerCountryCode">Buyer country</label>
              <input id="buyerCountryCode" value={buyerCountryCode} onChange={(event) => setBuyerCountryCode(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100" />
            </div>
            <div className="md:col-span-5 flex flex-wrap gap-2">
              <select aria-label="Fulfilment method" value={fulfilmentMethod} onChange={(event) => setFulfilmentMethod(event.target.value as MarketplaceFulfilmentMethod)} className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100">
                <option value="MEETUP">Meetup</option>
                <option value="DOMESTIC_SHIPPING">Domestic shipping</option>
                <option value="INTERNATIONAL_SHIPPING">International shipping</option>
              </select>
              <button type="button" onClick={sendOffer} disabled={saving} className="rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-100 disabled:opacity-60">{actionLabel}</button>
              <button type="button" onClick={acceptOffer} disabled={saving} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-60">Accept offer and reserve</button>
              {isSeller && <button type="button" onClick={() => runAction(() => marketplaceApi.declineEnquiry(enquiry.id), "Enquiry declined")} disabled={saving} className="rounded border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-60">Decline</button>}
              {isBuyer && <button type="button" onClick={() => runAction(() => marketplaceApi.withdrawEnquiry(enquiry.id), "Enquiry withdrawn")} disabled={saving} className="rounded border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 disabled:opacity-60">Withdraw</button>}
              {enquiry.reservation?.status === "RESERVED" && <button type="button" onClick={() => runAction(() => marketplaceApi.cancelReservation(enquiry.reservation!.id), "Reservation cancelled")} disabled={saving} className="rounded border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 disabled:opacity-60">Cancel reservation</button>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
