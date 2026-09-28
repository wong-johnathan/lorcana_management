import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

const app = createApp();
const buyerToken = signToken({ userId: "buyer_1", username: "buyer" });
const sellerToken = signToken({ userId: "seller_1", username: "seller" });

function auth(req: request.Test, token = buyerToken) {
  return req.set("Authorization", `Bearer ${token}`);
}

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: "card_1",
    externalId: 1,
    name: "Elsa",
    subtitle: "Spirit of Winter",
    character: "Elsa",
    types: ["Storyborn", "Queen"],
    cardType: "Character",
    color: "Amethyst",
    setCode: "TFC",
    setNumber: 1,
    setName: "The First Chapter",
    rarity: "Enchanted",
    inkCost: 8,
    strength: 4,
    willpower: 6,
    lore: 3,
    abilities: "Shift",
    cardNumber: "207/204 • EN • 1",
    collectorNumber: 207,
    foilTypes: ["Lava"],
    imageUrl: "https://img",
    displayPrice: 180,
    prices: [],
    ...overrides,
  };
}

function marketplaceListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing_1",
    userId: "seller_1",
    cardId: "card_1",
    variant: "holofoil",
    desiredQuantity: 2,
    note: "Meetup preferred",
    customPrice: 180,
    customPriceCurrency: "SGD",
    status: "active",
    pricingMode: "FIXED",
    currency: "SGD",
    card: card(),
    user: {
      id: "seller_1",
      username: "seller",
      emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    ...overrides,
  };
}


function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "reservation_1",
    listingId: "listing_1",
    enquiryId: "enquiry_1",
    acceptedOfferId: "offer_1",
    quantity: 1,
    unitPriceMinor: 18000,
    currency: "SGD",
    status: "RESERVED",
    expiresAt: new Date("2026-08-29T00:00:00.000Z"),
    createdAt: new Date("2026-08-27T00:00:00.000Z"),
    updatedAt: new Date("2026-08-27T00:00:00.000Z"),
    ...overrides,
  };
}

function enquiry(overrides: Record<string, unknown> = {}) {
  return {
    id: "enquiry_1",
    listingId: "listing_1",
    buyerId: "buyer_1",
    quantity: 1,
    status: "PENDING_SELLER",
    lastActivityAt: new Date("2026-08-27T00:00:00.000Z"),
    createdAt: new Date("2026-08-27T00:00:00.000Z"),
    updatedAt: new Date("2026-08-27T00:00:00.000Z"),
    listing: marketplaceListing(),
    buyer: { id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") },
    messages: [],
    offers: [offer()],
    reservation: null,
    ...overrides,
  };
}

function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: "offer_1",
    enquiryId: "enquiry_1",
    proposedByUserId: "buyer_1",
    quantity: 1,
    unitPriceMinor: 18000,
    currency: "SGD",
    createdAt: new Date("2026-08-27T00:00:00.000Z"),
    proposedByUser: { id: "buyer_1", username: "buyer" },
    ...overrides,
  };
}

beforeEach(() => {
  resetPrismaMock();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("marketplace public routes", () => {
  it("allows anonymous browsing of globally eligible marketplace listings", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([marketplaceListing()]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce({ keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await request(app).get("/api/marketplace?search=Elsa&destinationCountry=MY")
      .expect(200)
      .expect((res) => {
        expect(res.body.results).toHaveLength(1);
        expect(res.body.results[0]).toEqual(expect.objectContaining({
          cardId: "card_1",
          variant: "holofoil",
          availableQuantity: 2,
          sellerCount: 1,
          offersCount: 1,
          fromPriceMinor: 18000,
          currency: "SGD",
          lowestPrice: { amountMinor: 18000, currency: "SGD" },
          canFulfilToViewer: true,
        }));
        expect(res.body.results[0].offers[0]).toEqual(expect.objectContaining({
          listingId: "listing_1",
          seller: expect.objectContaining({ id: "seller_1", username: "seller", emailVerified: true, emailVerifiedAt: expect.any(String) }),
          sellerVerified: true,
          askingPrice: { amountMinor: 18000, currency: "SGD" },
        }));
        expect(prismaMock.extraForSaleListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ status: "active" }),
        }));
        expect(res.body.results[0].offers[0].seller).not.toHaveProperty("email");
      });
  });

  it("excludes the current user's own listings when browsing marketplace while logged in", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([marketplaceListing({ userId: "seller_1" })]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await auth(request(app).get("/api/marketplace?search=Elsa"))
      .expect(200)
      .expect((res) => {
        expect(res.body.results).toHaveLength(1);
        expect(prismaMock.extraForSaleListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ userId: { not: "buyer_1" } }),
        }));
      });
  });

  it("excludes the current user's own offers from card-specific marketplace comparison", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([marketplaceListing({ userId: "seller_1" })]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await auth(request(app).get("/api/marketplace/cards/card_1/offers"))
      .expect(200)
      .expect((res) => {
        expect(res.body.offers).toHaveLength(1);
        expect(prismaMock.extraForSaleListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ userId: { not: "buyer_1" } }),
        }));
      });
  });

  it("shows active Extras for Sale listings in marketplace without a separate publish step", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      marketplaceListing({
      }),
    ]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await request(app).get("/api/marketplace?search=Elsa")
      .expect(200)
      .expect((res) => {
        expect(res.body.results).toHaveLength(1);
        expect(res.body.results[0]).toEqual(expect.objectContaining({
          cardId: "card_1",
          variant: "holofoil",
          availableQuantity: 2,
          lowestPrice: { amountMinor: 18000, currency: "SGD" },
        }));
        expect(res.body.results[0].offers[0]).toEqual(expect.objectContaining({
          listingId: "listing_1",
          askingPrice: { amountMinor: 18000, currency: "SGD" },
        }));
      });
  });

  it("uses reference prices when listed extras have no custom price and keeps price-less listings visible", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      marketplaceListing({
        id: "listing_reference_price",
        cardId: "card_reference_price",
        customPrice: null,
        card: card({ id: "card_reference_price", prices: [{ variant: "Holofoil", marketPrice: 12.34 }] }),
      }),
      marketplaceListing({
        id: "listing_no_price",
        cardId: "card_no_price",
        customPrice: null,
        card: card({ id: "card_no_price", prices: [] }),
      }),
    ]);
    prismaMock.inventoryEntry.findFirst
      .mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 })
      .mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await request(app).get("/api/marketplace")
      .expect(200)
      .expect((res) => {
        expect(res.body.results).toHaveLength(2);
        const byCardId = new Map<string, any>(res.body.results.map((result: any) => [result.cardId, result]));
        expect(byCardId.get("card_reference_price")).toEqual(expect.objectContaining({
          lowestPrice: { amountMinor: 1234, currency: "USD" },
        }));
        expect(byCardId.get("card_reference_price").offers[0].askingPrice).toEqual({ amountMinor: 1234, currency: "USD" });
        expect(byCardId.get("card_no_price")).toEqual(expect.objectContaining({
          lowestPrice: null,
          fromPriceMinor: null,
        }));
        expect(byCardId.get("card_no_price").offers[0].askingPrice).toBeNull();
      });
  });

  it("filters and serializes normal and foil marketplace offers with fallback fields", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      marketplaceListing({
        id: "normal_listing",
        variant: "normal",
        user: { id: "seller_1", username: "seller", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") },
        card: card({ prices: undefined }),
      }),
      marketplaceListing({ id: "foil_listing", variant: "foil" }),
    ]);
    prismaMock.inventoryEntry.findFirst
      .mockResolvedValueOnce({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 })
      .mockResolvedValueOnce({ quantity: 0, foilQuantity: 2, holofoilQuantity: 0 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValue(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValue(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValue([]);

    await request(app).get("/api/marketplace")
      .expect(200)
      .expect((res) => {
        expect(res.body.results).toHaveLength(2);
        expect(res.body.results.flatMap((result: any) => result.offers.map((item: any) => item.listingId))).toEqual(["normal_listing", "foil_listing"]);
        expect(prismaMock.extraForSaleListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ status: "active" }),
        }));
      });
  });

  it("blocks enquiries from users without verified email", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "buyer_1", username: "buyer", emailVerifiedAt: null });

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ message: "Still available?", quantity: 1 }))
      .expect(403, { error: "Verified email required to enquire" });

    expect(prismaMock.marketplaceEnquiry.create).not.toHaveBeenCalled();
  });

  it("lists card-specific offers for one exact printing", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([marketplaceListing()]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce({ keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await request(app).get("/api/marketplace/cards/card_1/offers")
      .expect(200)
      .expect((res) => {
        expect(res.body.card.id).toBe("card_1");
        expect(res.body.offers).toHaveLength(1);
        expect(res.body.offers[0]).toEqual(expect.objectContaining({ listingId: "listing_1", availableQuantity: 2 }));
      });
  });

  it("returns the card with no offers and 404s unknown card ids", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([]);
    prismaMock.card.findUnique.mockResolvedValueOnce(card({ id: "card_empty" }));

    await request(app).get("/api/marketplace/cards/card_empty/offers")
      .expect(200)
      .expect((res) => {
        expect(res.body.card.id).toBe("card_empty");
        expect(res.body.offers).toEqual([]);
      });

    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([]);
    prismaMock.card.findUnique.mockResolvedValueOnce(null);

    await request(app).get("/api/marketplace/cards/missing/offers")
      .expect(404, { error: "Card not found" });
  });


  it("validates enquiry creation branches before creating messages and offers", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 0 }))
      .expect(400, { error: "quantity must be a positive integer" });
    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1.5 }))
      .expect(400, { error: "quantity must be a positive integer" });
    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1, message: "x".repeat(2001) }))
      .expect(400, { error: "message must be 2000 characters or fewer" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/listings/missing/enquiries").send({ quantity: 1 }))
      .expect(404, { error: "Marketplace listing not found" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing({ userId: "buyer_1" }));
    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1 }))
      .expect(400, { error: "Cannot enquire on your own listing" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing());
    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1, currency: "SGD" }))
      .expect(400, { error: "currency is inherited from the listing" });


    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing({ pricingMode: "FIXED" }));
    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1, unitPriceMinor: 16000 }))
      .expect(400, { error: "Fixed-price listings do not accept counteroffers" });

    expect(prismaMock.marketplaceEnquiry.create).not.toHaveBeenCalled();
  });

  it("creates an initial buyer offer only for OBO enquiries", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing({ pricingMode: "ACCEPTS_OFFERS", currency: "SGD" }));
    prismaMock.marketplaceEnquiry.findFirst.mockResolvedValueOnce(null);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceEnquiry.create.mockResolvedValueOnce({ id: "enquiry_offer" });
    prismaMock.enquiryOffer.create.mockResolvedValueOnce(offer({ id: "initial_offer", currency: "SGD" }));

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 2, unitPriceMinor: 16000, message: "" }))
      .expect(201)
      .expect((res) => expect(res.body.enquiry.id).toBe("enquiry_offer"));

    expect(prismaMock.enquiryMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.enquiryOffer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ enquiryId: "enquiry_offer", proposedByUserId: "buyer_1", quantity: 2, unitPriceMinor: 16000, currency: "SGD" }) });
  });

  it("allows enquiries on active Extras listings without a separate marketplace visibility flag", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing());
    prismaMock.marketplaceEnquiry.findFirst.mockResolvedValueOnce(null);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceEnquiry.create.mockResolvedValueOnce({ id: "enquiry_visible" });

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1 }))
      .expect(201)
      .expect((res) => expect(res.body.enquiry.id).toBe("enquiry_visible"));

    expect(prismaMock.extraForSaleListing.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "listing_1", status: "active" },
    }));
  });

  it("creates bare enquiries without fabricated messages or offers and rejects unavailable quantity", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 1 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 3 }))
      .expect(400, { error: "Listing is not currently available" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceEnquiry.create.mockResolvedValueOnce({ id: "enquiry_default" });

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1 }))
      .expect(201)
      .expect((res) => expect(res.body.enquiry.id).toBe("enquiry_default"));

    expect(prismaMock.enquiryMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.enquiryOffer.create).not.toHaveBeenCalled();
    expect(prismaMock.marketplaceEnquiry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ listingId: "listing_1", buyerId: "buyer_1", quantity: 1, status: "PENDING_SELLER" }),
    }));
  });

  it("creates a chat-first enquiry without a quantity", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceEnquiry.create.mockResolvedValueOnce({ id: "enquiry_chat" });

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({}))
      .expect(201)
      .expect((res) => expect(res.body.enquiry.id).toBe("enquiry_chat"));

    expect(prismaMock.marketplaceEnquiry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ listingId: "listing_1", buyerId: "buyer_1", quantity: null, status: "PENDING_SELLER" }),
    }));
    expect(prismaMock.enquiryMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.enquiryOffer.create).not.toHaveBeenCalled();
  });

  it("creates enquiries carrying only the buyer's message and no fabricated offer", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceEnquiry.create.mockResolvedValueOnce({ id: "enquiry_meetup" });

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1, message: "  Can meet tomorrow?  " }))
      .expect(201)
      .expect((res) => expect(res.body.enquiry.id).toBe("enquiry_meetup"));

    expect(prismaMock.enquiryMessage.create).toHaveBeenCalledWith({ data: { enquiryId: "enquiry_meetup", senderId: "buyer_1", message: "Can meet tomorrow?" } });
    expect(prismaMock.enquiryOffer.create).not.toHaveBeenCalled();
  });

  it("skips invalid variants, zero inventory, and destination mismatches during browsing", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      marketplaceListing({ id: "invalid", variant: "etched" }),
    ]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await request(app).get("/api/marketplace")
      .expect(200)
      .expect((res) => expect(res.body.results).toEqual([]));
  });

  it("returns 500 for unexpected browse, card-offer, and enquiry failures", async () => {
    prismaMock.extraForSaleListing.findMany.mockRejectedValueOnce(new Error("db down"));
    await request(app).get("/api/marketplace").expect(500, { error: "Internal server error" });

    prismaMock.extraForSaleListing.findMany.mockRejectedValueOnce(new Error("db down"));
    await request(app).get("/api/marketplace/cards/card_1/offers").expect(500, { error: "Internal server error" });

    prismaMock.user.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1 }))
      .expect(500, { error: "Internal server error" });
  });
});

describe("marketplace enquiry and reservation routes", () => {
  it("lists buyer and seller enquiry dashboards for the current participant", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([
      enquiry({ id: "buyer_thread" }),
      enquiry({ id: "seller_thread", buyerId: "other_buyer", buyer: { id: "other_buyer", username: "other" } }),
    ]);

    await auth(request(app).get("/api/marketplace/enquiries"), sellerToken)
      .expect(200)
      .expect((res) => {
        expect(res.body.enquiries).toHaveLength(2);
        expect(res.body.enquiries[0]).toEqual(expect.objectContaining({
          id: "buyer_thread",
          seller: expect.objectContaining({ id: "seller_1", username: "seller" }),
          latestOffer: expect.objectContaining({ quantity: 1, unitPrice: { amountMinor: 18000, currency: "SGD" } }),
        }));
        expect(prismaMock.marketplaceEnquiry.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: { OR: [{ buyerId: "seller_1" }, { listing: { userId: "seller_1" } }] },
        }));
      });
  });

  it("returns enquiry detail only to the buyer or seller", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).get("/api/marketplace/enquiries/enquiry_1"))
      .expect(200)
      .expect((res) => {
        expect(res.body.enquiry.messages).toEqual([]);
        expect(res.body.enquiry.offers[0]).toEqual(expect.objectContaining({ id: "offer_1" }));
      });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).get("/api/marketplace/enquiries/enquiry_1"), signToken({ userId: "stranger", username: "stranger" }))
      .expect(403, { error: "Not allowed to access this enquiry" });
  });

  it("enforces one active enquiry per buyer/listing", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing());
    prismaMock.marketplaceEnquiry.findFirst.mockResolvedValueOnce(enquiry({ id: "existing_enquiry" }));

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1 }))
      .expect(409, { error: "An active enquiry already exists for this listing", enquiryId: "existing_enquiry" });

    expect(prismaMock.marketplaceEnquiry.create).not.toHaveBeenCalled();
  });

  it("adds participant messages and notifies the counterparty", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    prismaMock.enquiryMessage.create.mockResolvedValueOnce({ id: "message_1", enquiryId: "enquiry_1", senderId: "buyer_1", message: "Can meet today?", createdAt: new Date("2026-08-27T01:00:00.000Z") });
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce({});
    prismaMock.notification.create.mockResolvedValueOnce({});

    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/messages").send({ message: "  Can meet today?  " }))
      .expect(201)
      .expect((res) => expect(res.body.message.id).toBe("message_1"));

    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "seller_1", type: "MARKETPLACE_MESSAGE_CREATED" }),
    }));
  });

  it("creates seller counteroffers and moves the thread to awaiting buyer", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    prismaMock.enquiryOffer.create.mockResolvedValueOnce(offer({ id: "seller_counter", proposedByUserId: "seller_1", unitPriceMinor: 17000 }));
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce({});
    prismaMock.notification.create.mockResolvedValueOnce({});

    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 17000,
    }), sellerToken)
      .expect(201)
      .expect((res) => expect(res.body.offer.id).toBe("seller_counter"));

    expect(prismaMock.marketplaceEnquiry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "enquiry_1" },
      data: expect.objectContaining({ status: "AWAITING_BUYER" }),
    }));
  });

  it("lets the buyer post their first offer from a pending enquiry", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ offers: [], listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    prismaMock.enquiryOffer.create.mockResolvedValueOnce(offer({ id: "buyer_first", proposedByUserId: "buyer_1", unitPriceMinor: 16000 }));
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce({});
    prismaMock.notification.create.mockResolvedValueOnce({});

    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 16000,
    }))
      .expect(201)
      .expect((res) => expect(res.body.offer.id).toBe("buyer_first"));

    expect(prismaMock.enquiryOffer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ enquiryId: "enquiry_1", proposedByUserId: "buyer_1", unitPriceMinor: 16000 }),
    }));
    expect(prismaMock.marketplaceEnquiry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "enquiry_1" },
      data: expect.objectContaining({ status: "PENDING_SELLER" }),
    }));
  });

  it("accepts the latest valid offer into a 48-hour reservation with stock validation", async () => {
    const latestOffer = offer({ id: "buyer_offer", proposedByUserId: "buyer_1", quantity: 1 });
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ offers: [latestOffer], listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceReservation.create.mockResolvedValueOnce(reservation({ acceptedOfferId: "buyer_offer" }));
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce({});
    prismaMock.notification.create.mockResolvedValueOnce({});

    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"), sellerToken)
      .expect(201)
      .expect((res) => {
        expect(res.body.reservation).toEqual(expect.objectContaining({ id: "reservation_1", status: "RESERVED" }));
      });

    expect(prismaMock.marketplaceReservation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ enquiryId: "enquiry_1", acceptedOfferId: "buyer_offer", quantity: 1, status: "RESERVED" }),
    }));
  });

  it("accepts fixed-price enquiries directly at listing price and requested quantity", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({
      offers: [],
      quantity: 2,
    }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 4 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceReservation.create.mockResolvedValueOnce(reservation({ acceptedOfferId: null, quantity: 2 }));
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce({});
    prismaMock.notification.create.mockResolvedValueOnce({});

    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"), sellerToken)
      .expect(201)
      .expect((res) => expect(res.body.reservation).toEqual(expect.objectContaining({ status: "RESERVED", quantity: 2 })));

    expect(prismaMock.marketplaceReservation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        enquiryId: "enquiry_1",
        acceptedOfferId: null,
        quantity: 2,
        unitPriceMinor: 18000,
        currency: "SGD",
        status: "RESERVED",
      }),
    }));
  });

  it("cancels and expires active reservations without deleting the enquiry thread", async () => {
    prismaMock.marketplaceReservation.findUnique.mockResolvedValueOnce({ ...reservation(), enquiry: enquiry() });
    prismaMock.marketplaceReservation.update.mockResolvedValueOnce(reservation({ status: "CANCELLED" }));
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce({});
    prismaMock.notification.create.mockResolvedValueOnce({});

    await auth(request(app).post("/api/marketplace/reservations/reservation_1/cancel"))
      .expect(200)
      .expect((res) => expect(res.body.reservation.status).toBe("CANCELLED"));

    prismaMock.marketplaceReservation.updateMany.mockResolvedValueOnce({ count: 2 });
    await auth(request(app).post("/api/marketplace/reservations/expire-due"), sellerToken)
      .expect(200, { expired: 2 });

    prismaMock.marketplaceReservation.updateMany.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/reservations/expire-due"), sellerToken)
      .expect(500, { error: "Internal server error" });
  });

  it("validates enquiry and reservation action edge cases", async () => {
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/messages").send({ message: "hi" }))
      .expect(404, { error: "Enquiry not found" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/messages").send({ message: "" }))
      .expect(400, { error: "message is required" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/messages").send({ message: "x".repeat(2001) }))
      .expect(400, { error: "message must be 2000 characters or fewer" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ offers: [] }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 18000,
    }), sellerToken).expect(400, { error: "Fixed-price listings do not accept counteroffers" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 18000,
      currency: "BAD",
    }), sellerToken).expect(400);

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ status: "RESERVED", listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 18000,
    }), sellerToken).expect(400, { error: "Cannot apply SELLER_COUNTER from RESERVED" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ offers: [], listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"), sellerToken)
      .expect(400, { error: "OBO enquiries need an offer before acceptance" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ status: "PENDING_SELLER", offers: [offer({ proposedByUserId: "seller_1" })], listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"))
      .expect(400, { error: "Cannot apply BUYER_ACCEPT from PENDING_SELLER" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ status: "AWAITING_BUYER", listing: marketplaceListing({ pricingMode: "FIXED" }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"))
      .expect(400, { error: "Only the seller can accept fixed-price enquiries" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ status: "PENDING_SELLER", listing: marketplaceListing({ pricingMode: "FIXED", customPrice: null, card: card({ prices: [] }) }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"), sellerToken)
      .expect(400, { error: "Fixed-price listing needs a price before acceptance" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ offers: [offer({ proposedByUserId: "seller_1" })], listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"), sellerToken)
      .expect(400, { error: "Cannot accept your own offer" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ status: "RESERVED" }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/decline"), sellerToken)
      .expect(400);

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/decline"))
      .expect(400, { error: "seller action requires seller actor: SELLER_DECLINE" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/withdraw"), sellerToken)
      .expect(400, { error: "buyer action requires buyer actor: BUYER_WITHDRAW" });

    prismaMock.marketplaceReservation.findUnique.mockResolvedValueOnce({ ...reservation({ status: "COMPLETED" }), enquiry: enquiry() });
    await auth(request(app).post("/api/marketplace/reservations/reservation_1/cancel"))
      .expect(400);
  });

  it("covers buyer counteroffers and defaulted enquiry serialization", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce(undefined);
    await auth(request(app).get("/api/marketplace/enquiries"))
      .expect(200, { enquiries: [] });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({
      buyer: { id: "buyer_1", username: "buyer", emailVerifiedAt: null, createdAt: undefined },
      listing: marketplaceListing({
        user: { id: "seller_1", username: "seller", emailVerifiedAt: null, createdAt: undefined },
      }),
      messages: undefined,
      offers: undefined,
      reservation: undefined,
    }));
    await auth(request(app).get("/api/marketplace/enquiries/enquiry_1"))
      .expect(200)
      .expect((res) => {
        expect(res.body.enquiry.latestOffer).toBeNull();
        expect(res.body.enquiry.quantity).toBe(1);
        expect(res.body.enquiry.messages).toEqual([]);
        expect(res.body.enquiry.offers).toEqual([]);
        expect(res.body.enquiry.reservation).toBeNull();
      });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({
      status: "AWAITING_BUYER",
      listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }),
    }));
    prismaMock.enquiryOffer.create.mockResolvedValueOnce(offer({ id: "buyer_counter", proposedByUserId: "buyer_1", proposedByUser: undefined }));
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce({});
    prismaMock.notification.create.mockResolvedValueOnce({});
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 16000,
    }))
      .expect(201)
      .expect((res) => {
        expect(res.body.offer.proposedByUser).toBeUndefined();
      });
  });

  it("covers buyer acceptance plus decline, withdraw, authorization, and missing reservation paths", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({
      status: "AWAITING_BUYER",
      listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }),
      offers: [offer({ proposedByUserId: "seller_1" })],
    }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceReservation.create.mockResolvedValueOnce(reservation());
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce({});
    prismaMock.notification.create.mockResolvedValueOnce({});
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"))
      .expect(201)
      .expect((res) => expect(res.body.reservation.status).toBe("RESERVED"));

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce(enquiry({ status: "DECLINED" }));
    prismaMock.notification.create.mockResolvedValueOnce({});
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/decline"), sellerToken)
      .expect(200)
      .expect((res) => expect(res.body.enquiry.status).toBe("DECLINED"));

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ status: "AWAITING_BUYER" }));
    prismaMock.marketplaceEnquiry.update.mockResolvedValueOnce(enquiry({ status: "WITHDRAWN" }));
    prismaMock.notification.create.mockResolvedValueOnce({});
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/withdraw"))
      .expect(200)
      .expect((res) => expect(res.body.enquiry.status).toBe("WITHDRAWN"));

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).get("/api/marketplace/enquiries/enquiry_1"), signToken({ userId: "stranger", username: "stranger" }))
      .expect(403, { error: "Not allowed to access this enquiry" });

    prismaMock.marketplaceReservation.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/reservations/missing/cancel"))
      .expect(404, { error: "Reservation not found" });
  });

  it("covers malformed offer inputs and unavailable acceptance branches", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1.5,
      unitPriceMinor: 18000,
    }), sellerToken).expect(400, { error: "quantity must be a positive integer" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }) }));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: -1,
    }), sellerToken).expect(400, { error: "unitPriceMinor must be a non-negative integer minor-unit amount" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ status: "AWAITING_BUYER", listing: marketplaceListing({ pricingMode: "ACCEPTS_OFFERS" }), offers: [offer({ proposedByUserId: "seller_1" })] }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"))
      .expect(409, { error: "Listing is no longer available for that quantity" });
  });

  it("covers participant guards and missing enquiry branches across action routes", async () => {
    const strangerToken = signToken({ userId: "stranger", username: "stranger" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/messages").send({ message: "hi" }), strangerToken)
      .expect(403, { error: "Not allowed to access this enquiry" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 16000,
      currency: "SGD",
    }))
      .expect(404, { error: "Enquiry not found" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 16000,
      currency: "SGD",
    }), strangerToken)
      .expect(403, { error: "Not allowed to access this enquiry" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"))
      .expect(404, { error: "Enquiry not found" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"), strangerToken)
      .expect(403, { error: "Not allowed to access this enquiry" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/decline"), sellerToken)
      .expect(404, { error: "Enquiry not found" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/decline"), strangerToken)
      .expect(403, { error: "Not allowed to access this enquiry" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/withdraw"))
      .expect(404, { error: "Enquiry not found" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry());
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/withdraw"), strangerToken)
      .expect(403, { error: "Not allowed to access this enquiry" });

    prismaMock.marketplaceReservation.findUnique.mockResolvedValueOnce({ ...reservation(), enquiry: enquiry() });
    await auth(request(app).post("/api/marketplace/reservations/reservation_1/cancel"), strangerToken)
      .expect(403, { error: "Not allowed to access this enquiry" });
  });

  it("covers unexpected failures in enquiry and reservation action routes", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).get("/api/marketplace/enquiries"))
      .expect(500, { error: "Internal server error" });

    prismaMock.marketplaceEnquiry.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).get("/api/marketplace/enquiries/enquiry_1"))
      .expect(500, { error: "Internal server error" });

    prismaMock.marketplaceEnquiry.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/messages").send({ message: "hi" }))
      .expect(500, { error: "Internal server error" });

    prismaMock.marketplaceEnquiry.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/offers").send({
      quantity: 1,
      unitPriceMinor: 16000,
      currency: "SGD",
    }))
      .expect(500, { error: "Internal server error" });

    prismaMock.$transaction.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/accept"))
      .expect(500, { error: "Internal server error" });

    prismaMock.marketplaceEnquiry.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/decline"), sellerToken)
      .expect(500, { error: "Internal server error" });

    prismaMock.marketplaceEnquiry.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/enquiries/enquiry_1/withdraw"))
      .expect(500, { error: "Internal server error" });

    prismaMock.marketplaceReservation.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/reservations/reservation_1/cancel"))
      .expect(500, { error: "Internal server error" });
  });
});

