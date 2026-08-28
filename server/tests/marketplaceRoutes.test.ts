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
    marketplaceVisible: true,
    pricingMode: "FIXED",
    askingPriceMinor: 18000,
    currency: "SGD",
    condition: "NEAR_MINT",
    cardLanguage: "EN",
    originCountryCode: "SG",
    publicLocality: "Tampines",
    allowsMeetup: true,
    shipsDomestically: true,
    shipsInternationally: true,
    shipsWorldwide: false,
    card: card(),
    user: {
      id: "seller_1",
      username: "seller",
      emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    destinationCountries: [{ countryCode: "MY" }],
    ...overrides,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    status: "COMPLETED",
    completedAt: new Date("2026-08-01T00:00:00.000Z"),
    reviewWindowEndsAt: new Date("2026-08-31T00:00:00.000Z"),
    disputedAt: null,
    reviews: [],
    ...overrides,
  };
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "review_1",
    transactionId: "tx_1",
    reviewerId: "buyer_1",
    revieweeId: "seller_1",
    reviewerRole: "BUYER",
    rating: 5,
    comment: "Smooth deal",
    status: "SEALED",
    moderationStatus: "VISIBLE",
    submittedAt: new Date("2026-08-15T00:00:00.000Z"),
    revealedAt: null,
    tags: [{ tag: "FAST_RESPONSE" }],
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
          fulfilment: expect.objectContaining({ destinationCountryCodes: ["MY"] }),
          reputation: expect.objectContaining({ role: "seller", completedDeals: 0 }),
          condition: "NEAR_MINT",
          destinationCountries: ["MY"],
        }));
        expect(prismaMock.extraForSaleListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.not.objectContaining({ marketplaceVisible: true }),
        }));
        expect(res.body.results[0].offers[0].seller).not.toHaveProperty("email");
      });
  });

  it("shows active Extras for Sale listings in marketplace without a separate publish step", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      marketplaceListing({
        marketplaceVisible: false,
        askingPriceMinor: null,
        currency: null,
        condition: null,
        cardLanguage: null,
        originCountryCode: null,
        publicLocality: null,
        allowsMeetup: false,
        shipsDomestically: false,
        shipsInternationally: false,
        shipsWorldwide: false,
        destinationCountries: [],
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
          condition: null,
          cardLanguage: null,
          originCountryCode: null,
        }));
      });
  });

  it("uses reference prices when listed extras have no custom price and keeps price-less listings visible", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      marketplaceListing({
        id: "listing_reference_price",
        cardId: "card_reference_price",
        customPrice: null,
        askingPriceMinor: null,
        currency: null,
        card: card({ id: "card_reference_price", prices: [{ variant: "Holofoil", marketPrice: 12.34 }] }),
      }),
      marketplaceListing({
        id: "listing_no_price",
        cardId: "card_no_price",
        customPrice: null,
        askingPriceMinor: null,
        currency: null,
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
          currency: null,
        }));
        expect(byCardId.get("card_no_price").offers[0].askingPrice).toBeNull();
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

  it("filters fulfilment destinations and chooses the lowest price within the listing currency", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      marketplaceListing({ id: "worldwide", shipsWorldwide: true, askingPriceMinor: 2100, currency: "USD" }),
      marketplaceListing({ id: "domestic", originCountryCode: "SG", shipsDomestically: true, shipsInternationally: false, destinationCountries: [], askingPriceMinor: 1900, currency: "USD" }),
      marketplaceListing({ id: "blocked", shipsWorldwide: false, shipsDomestically: false, shipsInternationally: false, allowsMeetup: false, destinationCountries: [] }),
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

    await request(app).get("/api/marketplace?destinationCountry=SG&set=TFC&rarity=Enchanted&color=Amethyst&condition=near_mint&language=en&sellerCountry=sg&variant=holofoil&fulfilmentMethod=DOMESTIC_SHIPPING")
      .expect(200)
      .expect((res) => {
        const offerIds = res.body.results.flatMap((result: any) => result.offers.map((offer: any) => offer.listingId));
        expect(offerIds).toEqual(["worldwide", "domestic"]);
        expect(res.body.results[0].fromPriceMinor).toBe(1900);
      });
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

    expect(prismaMock.marketplaceEnquiry.create).not.toHaveBeenCalled();
  });

  it("creates default-message shipping enquiries and rejects unavailable quantity", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing({ allowsMeetup: false, shipsDomestically: true }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 1 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 3 }))
      .expect(400, { error: "Listing is not currently available" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing({ allowsMeetup: false, shipsDomestically: true }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceEnquiry.create.mockResolvedValueOnce({ id: "enquiry_default" });

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1, buyerCountryCode: "SG" }))
      .expect(201)
      .expect((res) => expect(res.body.enquiry.id).toBe("enquiry_default"));

    expect(prismaMock.enquiryMessage.create).toHaveBeenCalledWith({ data: { enquiryId: "enquiry_default", senderId: "buyer_1", message: "Marketplace enquiry started." } });
    expect(prismaMock.enquiryOffer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fulfilmentMethod: "SHIPPING", buyerCountryCode: "SG" }),
    }));
  });

  it("creates meetup enquiries with custom messages and null buyer country", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "buyer_1", username: "buyer", emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(marketplaceListing({ allowsMeetup: true, shipsDomestically: false }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 0, foilQuantity: 0, holofoilQuantity: 3 });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceEnquiry.create.mockResolvedValueOnce({ id: "enquiry_meetup" });

    await auth(request(app).post("/api/marketplace/listings/listing_1/enquiries").send({ quantity: 1, message: "  Can meet tomorrow?  " }))
      .expect(201)
      .expect((res) => expect(res.body.enquiry.id).toBe("enquiry_meetup"));

    expect(prismaMock.enquiryMessage.create).toHaveBeenCalledWith({ data: { enquiryId: "enquiry_meetup", senderId: "buyer_1", message: "Can meet tomorrow?" } });
    expect(prismaMock.enquiryOffer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fulfilmentMethod: "MEETUP", buyerCountryCode: null }),
    }));
  });

  it("skips invalid variants, zero inventory, and destination mismatches during browsing", async () => {
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      marketplaceListing({ id: "invalid", variant: "etched" }),
      marketplaceListing({ id: "empty", shipsWorldwide: true }),
      marketplaceListing({ id: "destination_miss", originCountryCode: "SG", allowsMeetup: true, shipsDomestically: false, shipsInternationally: false, shipsWorldwide: false, destinationCountries: [] }),
    ]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([]);

    await request(app).get("/api/marketplace?shipsTo=MY&fulfilmentMethod=MEETUP")
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

describe("marketplace trust routes", () => {
  it("requires authentication for review submission", async () => {
    await request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 5 }).expect(401, { error: "Authentication required" });
  });

  it("creates a sealed buyer review only for completed marketplace deals", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(transaction({ status: "DISPUTED" }));
    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 5, tags: ["FAST_RESPONSE"] }))
      .expect(400, { error: "Only completed marketplace deals can be reviewed" });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(transaction());
    prismaMock.marketplaceReview.create.mockResolvedValueOnce(review());

    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 5, comment: " Smooth deal ", tags: ["FAST_RESPONSE"] }))
      .expect(201)
      .expect((res) => {
        expect(res.body.review).toEqual(expect.objectContaining({ status: "SEALED", rating: 5, publicContextLabel: "Completed marketplace deal" }));
        expect(JSON.stringify(res.body)).not.toMatch(/Verified Purchase|Payment Verified/i);
      });

    expect(prismaMock.marketplaceReview.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ transactionId: "tx_1", reviewerId: "buyer_1", revieweeId: "seller_1", reviewerRole: "BUYER", status: "SEALED" }),
    }));
  });

  it("reveals both sealed reviews immediately when the counterpart submits", async () => {
    const buyerReview = review({ id: "buyer_review" });
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(transaction({ reviews: [buyerReview] }));
    prismaMock.marketplaceReview.create.mockResolvedValueOnce(review({ id: "seller_review", reviewerId: "seller_1", revieweeId: "buyer_1", reviewerRole: "SELLER", status: "REVEALED" }));
    prismaMock.marketplaceReview.updateMany.mockResolvedValueOnce({ count: 1 });

    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 4, tags: ["FAST_PAYMENT"] }), sellerToken)
      .expect(201)
      .expect((res) => expect(res.body.review.status).toBe("REVEALED"));

    expect(prismaMock.marketplaceReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["buyer_review"] } },
      data: expect.objectContaining({ status: "REVEALED" }),
    }));
  });

  it("returns separate buyer and seller reputation aggregates", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "seller_1", createdAt: new Date("2026-01-01T00:00:00.000Z"), emailVerifiedAt: new Date("2026-01-02T00:00:00.000Z") });
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([review({ status: "REVEALED", revealedAt: new Date("2026-08-02T00:00:00.000Z") })]);
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([transaction()]);

    await request(app).get("/api/marketplace/users/seller_1/reputation")
      .expect(200)
      .expect((res) => {
        expect(res.body.seller.reviewCount).toBe(1);
        expect(res.body.seller.completedDealCount).toBe(1);
        expect(res.body.buyer.reviewCount).toBe(0);
        expect(res.body.publicContextLabel).toBe("Completed marketplace deal");
      });
  });

  it("reports reviews and moves moderation status under review", async () => {
    prismaMock.marketplaceReview.findUnique.mockResolvedValueOnce(review({ id: "review_1", reviewerId: "seller_1" }));
    prismaMock.marketplaceReport.create.mockResolvedValueOnce({ id: "report_1", status: "PENDING" });
    prismaMock.marketplaceReview.update.mockResolvedValueOnce(review({ id: "review_1", moderationStatus: "UNDER_REVIEW" }));

    await auth(request(app).post("/api/marketplace/reviews/review_1/report").send({ reason: "abusive", details: "bad language" }))
      .expect(201)
      .expect((res) => expect(res.body.report).toEqual({ id: "report_1", status: "PENDING" }));

    expect(prismaMock.marketplaceReport.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reporterId: "buyer_1", targetType: "MARKETPLACE_REVIEW", targetId: "review_1", reason: "abusive" }),
    }));
    expect(prismaMock.marketplaceReview.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "review_1" },
      data: { moderationStatus: "UNDER_REVIEW" },
    }));
  });

  it("updates sealed reviews, handles missing trust records, and reports route errors", async () => {
    const sealed = review({ id: "existing_review", reviewerId: "buyer_1", status: "SEALED" });
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(transaction({ reviews: [sealed] }));
    prismaMock.marketplaceReviewTag.deleteMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.marketplaceReview.update.mockResolvedValueOnce(review({ ...sealed, rating: 4, comment: "Updated" }));

    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 4, comment: "Updated", tags: [] }))
      .expect(200)
      .expect((res) => expect(res.body.review.rating).toBe(4));

    expect(prismaMock.marketplaceReviewTag.deleteMany).toHaveBeenCalledWith({ where: { reviewId: "existing_review" } });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/transactions/missing/reviews").send({ rating: 5 }))
      .expect(404, { error: "Transaction not found" });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(transaction({ reviews: undefined }));
    prismaMock.marketplaceReview.create.mockResolvedValueOnce(review({ id: "review_no_loaded_reviews" }));
    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 5 }))
      .expect(201)
      .expect((res) => expect(res.body.review.id).toBe("review_no_loaded_reviews"));

    prismaMock.marketplaceTransaction.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 5 }))
      .expect(500, { error: "Internal server error" });

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await request(app).get("/api/marketplace/users/missing/reputation")
      .expect(404, { error: "User not found" });

    prismaMock.user.findUnique.mockRejectedValueOnce(new Error("db down"));
    await request(app).get("/api/marketplace/users/seller_1/reputation")
      .expect(500, { error: "Internal server error" });

    prismaMock.marketplaceReview.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/reviews/missing/report").send({ reason: "spam" }))
      .expect(404, { error: "Review not found" });

    prismaMock.marketplaceReview.findUnique.mockResolvedValueOnce(review());
    await auth(request(app).post("/api/marketplace/reviews/review_1/report").send({ reason: "" }))
      .expect(400, { error: "reason is required" });

    prismaMock.marketplaceReview.findUnique.mockRejectedValueOnce(new Error("db down"));
    await auth(request(app).post("/api/marketplace/reviews/review_1/report").send({ reason: "spam" }))
      .expect(500, { error: "Internal server error" });
  });
});
