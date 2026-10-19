import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketplace } from "../services/api";

describe("marketplace API namespace", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    localStorage.removeItem("token");
  });

  it("covers every public/read endpoint and the report/vouch writes", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

    await marketplace.listings();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/marketplace/listings", expect.any(Object));

    await marketplace.listings({});
    await marketplace.listings({
      q: "elsa",
      variant: "foil",
      condition: "NM",
      priceMin: "1000",
      priceMax: "5000",
      currency: "USD",
      sellerId: "seller_1",
      page: 2,
      limit: 24,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/listings?q=elsa&variant=foil&condition=NM&priceMin=1000&priceMax=5000&currency=USD&sellerId=seller_1&page=2&limit=24",
      expect.any(Object)
    );

    // null and empty-string params are dropped from the query (leaving a bare "?").
    await marketplace.listings({ q: "", variant: undefined, condition: null as never, page: undefined });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/marketplace/listings?", expect.any(Object));

    await marketplace.listing("listing_1");
    await marketplace.seller("seller_1");
    await marketplace.reviews("user_1");
    await marketplace.references("user_1");
    await marketplace.vouch("user_1", "great trader");
    await marketplace.report({ targetType: "LISTING", targetId: "listing_1", reason: "fake" });
    await marketplace.report({ targetType: "USER", targetId: "user_1", reason: "spam" });

    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/listings/listing_1", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/sellers/seller_1", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/users/user_1/reviews", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/users/user_1/references", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/users/user_1/references",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ comment: "great trader" }) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/reports",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ targetType: "USER", targetId: "user_1", reason: "spam" }) })
    );
  });

  it("covers the F2 authed/transactional write and read endpoints", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

    await marketplace.enquire("listing_1", 2);
    await marketplace.getEnquiries();
    await marketplace.getEnquiry("enq_1");
    await marketplace.postMessage("enq_1", "hello");
    await marketplace.markSold("enq_1");
    await marketplace.markSold("enq_1", 3);
    await marketplace.adjustQuantity("tx_1", 2);
    await marketplace.confirm("tx_1");
    await marketplace.cancel("tx_1");
    await marketplace.getTransaction("tx_1");
    await marketplace.getTransactions();
    await marketplace.getTransactions("PENDING_CONFIRMATION");
    await marketplace.getMyListings();
    await marketplace.getMyPending();
    await marketplace.postReview("tx_1", 4);
    await marketplace.postReview("tx_1", 5, "great");
    await marketplace.uploadPhoto("listing_1", { dataUrl: "data:image/png;base64,AAAA", contentType: "image/png" });
    await marketplace.deletePhoto("listing_1", "photo_1");
    await marketplace.createListing({
      cardId: "card_1",
      variant: "normal",
      quantity: 1,
      priceMinor: 1000,
      currency: "USD",
      condition: "NM",
      location: "London",
      note: "hi",
    });
    await marketplace.updateListing("listing_1", { quantity: 2, note: null });
    await marketplace.deleteListing("listing_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/listings/listing_1/enquire",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ requestedQuantity: 2 }) })
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/enquiries", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/enquiries/enq_1", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/enquiries/enq_1/messages",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "hello" }) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/enquiries/enq_1/mark-sold",
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/enquiries/enq_1/mark-sold",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ quantity: 3 }) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/transactions/tx_1/quantity",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ quantity: 2 }) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/transactions/tx_1/confirm",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/transactions/tx_1/cancel",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/transactions/tx_1", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/transactions", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/transactions?status=PENDING_CONFIRMATION",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/listings/mine", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/me/pending", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/transactions/tx_1/review",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ rating: 4 }) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/transactions/tx_1/review",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ rating: 5, comment: "great" }) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/listings/listing_1/photos",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ dataUrl: "data:image/png;base64,AAAA", contentType: "image/png" }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/listings/listing_1/photos/photo_1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/listings",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("card_1") })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/listings/listing_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ quantity: 2, note: null }) })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/listings/listing_1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("surfaces a non-json error body without crashing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error("bad json"); } });
    await expect(marketplace.getEnquiries()).rejects.toThrow("Request failed: 500");
  });
});
