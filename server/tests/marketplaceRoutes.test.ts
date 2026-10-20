import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/services/objectStorage.js", () => ({
  LOCAL_UPLOAD_ROOT: "/tmp/lorcana-marketplace-test-uploads",
  ALLOWED_IMAGE_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"],
  MAX_PROFILE_IMAGE_BYTES: 5 * 1024 * 1024,
  MAX_LISTING_PHOTO_COUNT: 15,
  MAX_LISTING_PHOTO_BYTES: 5 * 1024 * 1024,
  uploadProfileImage: vi.fn(),
  deleteProfileImage: vi.fn(),
  uploadListingPhoto: vi.fn(),
  deleteListingPhoto: vi.fn(),
  cardImageExists: vi.fn(),
  cardImagePublicUrl: vi.fn((key: string) => `/api/profile-images/${key}`),
  makeCardImageObjectKey: vi.fn(),
  uploadCardImage: vi.fn(),
}));

// Isolate the route under test from the B2 transition services (which are
// covered by marketplaceTransitions.test.ts). importOriginal keeps the REAL
// `MarketplaceError` class so the route's instanceof/error mapping still works.
vi.mock("../src/services/marketplaceTransitions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/marketplaceTransitions.js")>();
  return {
    ...actual,
    markSold: vi.fn(),
    adjustQuantity: vi.fn(),
    confirmTransfer: vi.fn(),
    cancelTransaction: vi.fn(),
  };
});

import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";
import {
  adjustQuantity,
  cancelTransaction,
  confirmTransfer,
  markSold,
} from "../src/services/marketplaceTransitions.js";
import {
  deleteListingPhoto,
  uploadListingPhoto,
} from "../src/services/objectStorage.js";

const app = createApp();
const sellerToken = signToken({ userId: "seller1", username: "seller" });
const buyerToken = signToken({ userId: "buyer1", username: "buyer" });
const otherToken = signToken({ userId: "other1", username: "other" });

function auth(req: request.Test, value = buyerToken) {
  return req.set("Authorization", `Bearer ${value}`);
}

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing1",
    sellerId: "seller1",
    cardId: "card1",
    variant: "normal",
    quantity: 3,
    priceMinor: 1200,
    currency: "USD",
    condition: "NM",
    location: "",
    note: null,
    status: "ACTIVE",
    hiddenAt: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    card: null,
    seller: null,
    photos: [],
    ...overrides,
  };
}

function enquiry(overrides: Record<string, unknown> = {}) {
  return {
    id: "enq1",
    listingId: "listing1",
    buyerId: "buyer1",
    sellerId: "seller1",
    requestedQuantity: 2,
    status: "ACTIVE",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

function tx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx1",
    enquiryId: "enq1",
    listingId: "listing1",
    buyerId: "buyer1",
    sellerId: "seller1",
    cardId: "card1",
    variant: "normal",
    quantity: 2,
    priceMinor: 1200,
    currency: "USD",
    status: "PENDING_CONFIRMATION",
    soldAt: new Date("2026-10-01T00:00:00Z"),
    buyer: null,
    seller: null,
    reviews: [],
    ...overrides,
  };
}

const tinyPng = "data:image/png;base64," + Buffer.from("tiny-image").toString("base64");

beforeEach(() => {
  resetPrismaMock();
  prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.mocked(markSold).mockReset();
  vi.mocked(adjustQuantity).mockReset();
  vi.mocked(confirmTransfer).mockReset();
  vi.mocked(cancelTransaction).mockReset();
  vi.mocked(uploadListingPhoto).mockReset();
  vi.mocked(deleteListingPhoto).mockReset();
});

describe("marketplace public browse/detail/seller (REQ-1)", () => {
  it("browses listings anonymously and applies search/filters (AC-1.1/1.2)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([listing()]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(1);

    const res = await request(app)
      .get("/api/marketplace/listings")
      .query({ q: "Mickey", variant: "foil", condition: "NM", priceMin: "100", priceMax: "500", currency: "USD" })
      .expect(200);

    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          hiddenAt: null,
          quantity: { gt: 0 },
          variant: "foil",
          condition: "NM",
          currency: "USD",
          priceMinor: { gte: 100, lte: 500 },
          card: {
            AND: [
              {
                OR: [
                  { name: { contains: "Mickey", mode: "insensitive" } },
                  { setName: { contains: "Mickey", mode: "insensitive" } },
                ],
              },
            ],
          },
        }),
      })
    );
  });

  it("excludes a logged-in seller's own listings from the feed (REQ-10)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await auth(request(app).get("/api/marketplace/listings"), sellerToken).expect(200);
    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sellerId: { not: "seller1" } }) })
    );
  });

  it("returns listing detail and 410 for a hidden listing", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ hiddenAt: new Date() }));
    await request(app).get("/api/marketplace/listings/listing1").expect(410, { error: "Listing is no longer available" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing());
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([]);
    const res = await request(app).get("/api/marketplace/listings/listing1").expect(200);
    expect(res.body.id).toBe("listing1");
    expect(res.body.pendingQuantity).toBe(0);
  });

  it("returns a seller profile with active listings, reviews, and reference badges", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "seller1", username: "seller", profile: null });
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([listing()]);
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([{ id: "r1", revieweeId: "seller1", rating: 5 }]);
    prismaMock.userReference.findMany.mockResolvedValueOnce([
      { id: "ref1", authorId: "buyer1", subjectId: "seller1", comment: "great", author: { id: "buyer1", username: "buyer" } },
    ]);
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([
      { buyerId: "seller1", sellerId: "buyer1" },
    ]);

    const res = await request(app).get("/api/marketplace/sellers/seller1").expect(200);
    expect(res.body.user.id).toBe("seller1");
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.references[0].hasCompletedDeal).toBe(true);
  });
});

describe("marketplace enhanced listing filters (REQ-FILT-17/18)", () => {
  it("filters by costs as inkCost IN (AC-FILT-18.1)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ costs: "0,2,12" }).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ card: { AND: [{ inkCost: { in: [0, 2, 12] } }] } }),
      })
    );
  });

  it.each([
    ["inkable", true],
    ["non-inkable", false],
  ])("filters by inkable=%s (AC-FILT-18.4)", async (param, expected) => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ inkable: param }).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ card: { AND: [{ inkable: expected }] } }),
      })
    );
  });

  it.each([
    ["Character", { cardType: { in: ["Character"] } }],
    ["Song", { cardType: "Action", types: { hasSome: ["Song"] } }],
    [
      "Character,Song",
      {
        OR: [
          { cardType: { in: ["Character"] } },
          { cardType: "Action", types: { hasSome: ["Song"] } },
        ],
      },
    ],
  ])("builds the cardTypes predicate for %s (AC-FILT-18.3)", async (param, predicate) => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ cardTypes: param }).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ card: { AND: [predicate] } }),
      })
    );
  });

  it("filters by subtypes with hasSome (AC-FILT-18.5)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ subtypes: "Hero,Alien" }).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ card: { AND: [{ types: { hasSome: ["Hero", "Alien"] } }] } }),
      })
    );
  });

  it("ignores invalid/unknown filter values without erroring (AC-FILT-17.2)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    const res = await request(app)
      .get("/api/marketplace/listings")
      .query({ costs: "abc,-1,1.5", inkable: "bogus", cardTypes: "NotARealType", subtypes: "NotASubtype" })
      .expect(200);

    expect(res.body.pagination.total).toBe(0);
    // Invalid costs/inkable produce no constraint; unknown cardTypes/subtypes
    // become free-text predicates that simply match nothing (never a 500).
    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          card: {
            AND: [
              { types: { hasSome: ["NotASubtype"] } },
              { cardType: { in: ["NotARealType"] } },
            ],
          },
        }),
      })
    );
  });

  it("AND-combines q with the enhanced filters (AC-FILT-18.2)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app)
      .get("/api/marketplace/listings")
      .query({ q: "Mickey", costs: "1,2", inkable: "inkable", cardTypes: "Character", subtypes: "Hero" })
      .expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          card: {
            AND: [
              {
                OR: [
                  { name: { contains: "Mickey", mode: "insensitive" } },
                  { setName: { contains: "Mickey", mode: "insensitive" } },
                ],
              },
              { inkCost: { in: [1, 2] } },
              { inkable: true },
              { types: { hasSome: ["Hero"] } },
              { cardType: { in: ["Character"] } },
            ],
          },
        }),
      })
    );
  });

  it("keeps own-listing exclusion alongside enhanced filters (REQ-10)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await auth(request(app).get("/api/marketplace/listings").query({ costs: "1" }), sellerToken).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sellerId: { not: "seller1" },
          card: { AND: [{ inkCost: { in: [1] } }] },
        }),
      })
    );
  });

  it("computes count over the fully filtered set (AC-FILT-18.6)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([listing()]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(7);

    const res = await request(app).get("/api/marketplace/listings").query({ costs: "3,4" }).expect(200);

    expect(res.body.pagination.total).toBe(7);
    expect(prismaMock.marketplaceListing.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ card: { AND: [{ inkCost: { in: [3, 4] } }] } }),
      })
    );
  });

  it("omits where.card entirely when no card filter params are present (AC-FILT-17.3)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ variant: "foil" }).expect(200);

    const call = prismaMock.marketplaceListing.findMany.mock.calls[0][0] as any;
    expect(call.where.card).toBeUndefined();
    expect(call.where.variant).toBe("foil");
  });
});

describe("marketplace browse color/set/rarity filters (REQ-POL-4/5)", () => {
  it("parses colors as a color IN predicate (AC-POL-4.1/4.2)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ colors: "Amber, Ruby" }).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ card: { AND: [{ color: { in: ["Amber", "Ruby"] } }] } }),
      })
    );
  });

  it("parses sets as a setName IN predicate carrying setName values (AC-POL-4.2)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app)
      .get("/api/marketplace/listings")
      .query({ sets: "The First Chapter, Into the Inklands" })
      .expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          card: { AND: [{ setName: { in: ["The First Chapter", "Into the Inklands"] } }] },
        }),
      })
    );
  });

  it("parses rarities as a rarity IN predicate (AC-POL-4.2)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ rarities: "Legendary,Enchanted" }).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ card: { AND: [{ rarity: { in: ["Legendary", "Enchanted"] } }] } }),
      })
    );
  });

  it("AND-combines color/set/rarity with existing card predicates (AC-POL-5.1/5.3)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app)
      .get("/api/marketplace/listings")
      .query({ colors: "Amber", rarities: "Legendary", costs: "5" })
      .expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          card: {
            AND: [
              { inkCost: { in: [5] } },
              { color: { in: ["Amber"] } },
              { rarity: { in: ["Legendary"] } },
            ],
          },
        }),
      })
    );
  });

  it("count uses the same filtered where (AC-POL-5.2)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([listing()]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(3);

    const res = await request(app).get("/api/marketplace/listings").query({ colors: "Steel" }).expect(200);

    expect(res.body.pagination.total).toBe(3);
    expect(prismaMock.marketplaceListing.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ card: { AND: [{ color: { in: ["Steel"] } }] } }),
      })
    );
  });

  it("omitting all three keeps where.card absent (AC-POL-4.4)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ variant: "foil" }).expect(200);

    const call = prismaMock.marketplaceListing.findMany.mock.calls[0][0] as any;
    expect(call.where.card).toBeUndefined();
  });
});

describe("marketplace write authorization (REQ-2)", () => {
  it("rejects anonymous writes with 401", async () => {
    await request(app).post("/api/marketplace/listings").send({}).expect(401);
    await request(app).post("/api/marketplace/listings/listing1/enquire").send({}).expect(401);
    await request(app).post("/api/marketplace/transactions/tx1/confirm").expect(401);
    await request(app).post("/api/marketplace/reports").send({}).expect(401);
    await request(app).get("/api/marketplace/enquiries").expect(401);
    await request(app).get("/api/marketplace/transactions").expect(401);
    await request(app).get("/api/marketplace/listings/mine").expect(401);
  });
});

describe("marketplace create listing (REQ-3/4)", () => {
  it("validates create-listing input", async () => {
    await auth(request(app).post("/api/marketplace/listings").send({}), buyerToken).expect(400);
    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "chrome", quantity: 1, priceMinor: 100, currency: "USD" }),
      buyerToken
    ).expect(400);
    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "normal", quantity: 0, priceMinor: 100, currency: "USD" }),
      buyerToken
    ).expect(400);
    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "normal", quantity: 1, priceMinor: 100, currency: "XYZ" }),
      buyerToken
    ).expect(400);

    prismaMock.card.findUnique.mockResolvedValueOnce(null);
    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "missing", variant: "normal", quantity: 1, priceMinor: 100, currency: "USD" }),
      buyerToken
    ).expect(404, { error: "Card not found" });
  });

  it("creates a listing when quantity is available", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce({ id: "card1" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.create.mockResolvedValueOnce(listing({ id: "new1", quantity: 3 }));

    const res = await auth(
      request(app)
        .post("/api/marketplace/listings")
        .send({ cardId: "card1", variant: "normal", quantity: 3, priceMinor: 1200, currency: "USD", condition: "NM", location: "London", note: "hi" }),
      sellerToken
    ).expect(201);

    expect(res.body.id).toBe("new1");
  });

  it("rejects a listing over the available quantity (AC-4.1)", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce({ id: "card1" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 2, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);

    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "normal", quantity: 5, priceMinor: 100, currency: "USD" }),
      sellerToken
    ).expect(409, { error: "Quantity exceeds available inventory" });
  });
});

describe("marketplace edit listing (REQ-7/8)", () => {
  it("rejects edits by non-sellers and locks price/currency/quantity while pending", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "someoneElse" }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ note: "x" }), sellerToken).expect(403);

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1", status: "ACTIVE" }));
    prismaMock.marketplaceTransaction.findFirst.mockResolvedValueOnce({ id: "tx1", status: "PENDING_CONFIRMATION" });
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ priceMinor: 999 }), sellerToken).expect(409);

    // note stays editable while a transaction is pending (AC-8.2)
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1", status: "ACTIVE" }));
    prismaMock.marketplaceListing.update.mockResolvedValueOnce(listing({ note: "updated" }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ note: "updated" }), sellerToken).expect(200);
  });

  it("re-validates quantity edits against available inventory", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(
      listing({ sellerId: "seller1", status: "ACTIVE", cardId: "card1", variant: "normal" })
    );
    prismaMock.marketplaceTransaction.findFirst.mockResolvedValueOnce(null);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 3, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);

    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ quantity: 5 }), sellerToken).expect(409);
  });
});

describe("marketplace delete listing (D9)", () => {
  it("rejects delete when transaction history exists and allows a clean delete", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    prismaMock.marketplaceTransaction.count.mockResolvedValueOnce(1);
    await auth(request(app).delete("/api/marketplace/listings/listing1"), sellerToken).expect(409);

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    prismaMock.marketplaceTransaction.count.mockResolvedValueOnce(0);
    prismaMock.marketplaceListing.delete.mockResolvedValueOnce({});
    await auth(request(app).delete("/api/marketplace/listings/listing1"), sellerToken).expect(204);
  });
});

describe("marketplace enquiry (REQ-11/12)", () => {
  it("reuses one thread per (buyer, listing) (AC-11.1/11.2)", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1", quantity: 3, status: "ACTIVE" }));
    prismaMock.marketplaceEnquiry.upsert.mockResolvedValueOnce({ id: "enq1" });

    const res = await auth(
      request(app).post("/api/marketplace/listings/listing1/enquire").send({ requestedQuantity: 2 }),
      buyerToken
    ).expect(201);

    expect(res.body).toEqual({ enquiryId: "enq1" });
    expect(prismaMock.marketplaceEnquiry.upsert).toHaveBeenCalledWith({
      where: { buyerId_listingId: { buyerId: "buyer1", listingId: "listing1" } },
      create: { listingId: "listing1", buyerId: "buyer1", sellerId: "seller1", requestedQuantity: 2, status: "ACTIVE" },
      update: { requestedQuantity: 2, status: "ACTIVE" },
    });
  });

  it("rejects an enquiry quantity above the listing quantity", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ quantity: 2, status: "ACTIVE" }));
    await auth(
      request(app).post("/api/marketplace/listings/listing1/enquire").send({ requestedQuantity: 5 }),
      buyerToken
    ).expect(400);
  });
});

describe("marketplace mark-sold (REQ-14, AC-14.1)", () => {
  it("requires an existing enquiry and seller role", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/enquiries/missing/mark-sold").send({}), sellerToken)
      .expect(404, { error: "Enquiry not found" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ sellerId: "seller1" }));
    await auth(request(app).post("/api/marketplace/enquiries/enq1/mark-sold").send({}), buyerToken).expect(403);
  });

  it("defaults quantity to the enquiry's requestedQuantity", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ sellerId: "seller1", requestedQuantity: 2 }));
    vi.mocked(markSold).mockResolvedValueOnce({
      transactionId: "tx1",
      quantity: 2,
      status: "PENDING_CONFIRMATION",
      listingQuantity: 1,
      listingStatus: "ACTIVE",
    });

    const res = await auth(request(app).post("/api/marketplace/enquiries/enq1/mark-sold").send({}), sellerToken).expect(201);
    expect(markSold).toHaveBeenCalledWith("seller1", "enq1", 2);
    expect(res.body.transactionId).toBe("tx1");
  });
});

describe("marketplace transaction routes (REQ-16/18, AC-14.5)", () => {
  it("confirm is buyer-only and routes BUYER_CONFIRM", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    await auth(request(app).post("/api/marketplace/transactions/tx1/confirm"), sellerToken).expect(403);

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    vi.mocked(confirmTransfer).mockResolvedValueOnce({ transactionId: "tx1", alreadyCompleted: false, status: "COMPLETED" });
    await auth(request(app).post("/api/marketplace/transactions/tx1/confirm"), buyerToken).expect(200);
    expect(confirmTransfer).toHaveBeenCalledWith("tx1", "BUYER_CONFIRM");
  });

  it("cancel maps the actor from the caller's party role", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    vi.mocked(cancelTransaction).mockResolvedValueOnce({ transactionId: "tx1", alreadyCancelled: false, status: "CANCELLED" });
    await auth(request(app).post("/api/marketplace/transactions/tx1/cancel"), sellerToken).expect(200);
    expect(cancelTransaction).toHaveBeenCalledWith("tx1", "SELLER");

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    await auth(request(app).post("/api/marketplace/transactions/tx1/cancel"), otherToken).expect(403);
  });

  it("adjust quantity validates and routes to the service", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    vi.mocked(adjustQuantity).mockResolvedValueOnce({ transactionId: "tx1", quantity: 3 });
    await auth(request(app).patch("/api/marketplace/transactions/tx1/quantity").send({ quantity: 3 }), buyerToken).expect(200);
    expect(adjustQuantity).toHaveBeenCalledWith("tx1", 3);

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    await auth(request(app).patch("/api/marketplace/transactions/tx1/quantity").send({ quantity: 0 }), buyerToken).expect(400);
  });

  it("computes the seller's pending-sale breakdown from pending tx (AC-15.3)", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([
      tx({ id: "tx1", cardId: "card1", variant: "normal", quantity: 2, buyer: { username: "buyer" } }),
    ]);
    const res = await auth(request(app).get("/api/marketplace/me/pending"), sellerToken).expect(200);
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({ cardId: "card1", variant: "normal", quantity: 2, transactionId: "tx1", buyerUsername: "buyer" })
    );
  });
});

describe("marketplace reviews (REQ-19)", () => {
  it("allows review only on COMPLETED transactions and rejects duplicates", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx({ status: "PENDING_CONFIRMATION" }));
    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 5 }), buyerToken).expect(409);

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx({ status: "COMPLETED" }));
    prismaMock.marketplaceReview.findUnique.mockResolvedValueOnce({ id: "r1" });
    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 5 }), buyerToken).expect(409);

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx({ status: "COMPLETED" }));
    prismaMock.marketplaceReview.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReview.create.mockResolvedValueOnce({ id: "r2", rating: 5, revieweeId: "seller1" });
    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 5, comment: "good" }), buyerToken).expect(201);
  });

  it("reviews the other party and validates the rating", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx({ status: "COMPLETED" }));
    prismaMock.marketplaceReview.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReview.create.mockResolvedValueOnce({});
    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 4 }), sellerToken).expect(201);
    expect(prismaMock.marketplaceReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerId: "seller1", revieweeId: "buyer1", rating: 4 }),
      })
    );

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx({ status: "COMPLETED" }));
    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 6 }), buyerToken).expect(400);
  });
});

describe("marketplace references / vouches (REQ-20/21)", () => {
  it("upserts one vouch per (author, subject) (AC-20.2)", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "seller1" });
    prismaMock.userReference.upsert.mockResolvedValueOnce({ id: "ref1", comment: "updated" });
    await auth(request(app).post("/api/marketplace/users/seller1/references").send({ comment: "updated" }), buyerToken).expect(200);
    expect(prismaMock.userReference.upsert).toHaveBeenCalledWith({
      where: { authorId_subjectId: { authorId: "buyer1", subjectId: "seller1" } },
      create: { authorId: "buyer1", subjectId: "seller1", comment: "updated" },
      update: { comment: "updated" },
    });
  });

  it("rejects self-vouching", async () => {
    await auth(request(app).post("/api/marketplace/users/buyer1/references").send({ comment: "me" }), buyerToken).expect(400);
  });

  it("computes the completed-deal badge from a COMPLETED tx in either direction (AC-21.2)", async () => {
    prismaMock.userReference.findMany.mockResolvedValueOnce([
      { id: "ref1", authorId: "buyer1", subjectId: "seller1", comment: "great", author: { id: "buyer1", username: "buyer" } },
      { id: "ref2", authorId: "other1", subjectId: "seller1", comment: "ok", author: { id: "other1", username: "other" } },
    ]);
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([
      { buyerId: "seller1", sellerId: "buyer1" },
    ]);

    const res = await request(app).get("/api/marketplace/users/seller1/references").expect(200);
    expect(res.body.references[0].hasCompletedDeal).toBe(true);
    expect(res.body.references[1].hasCompletedDeal).toBe(false);
  });
});

describe("marketplace photos (REQ-23)", () => {
  it("rejects count/size/MIME before any storage write (AC-23.2)", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(
      request(app)
        .post("/api/marketplace/listings/listing1/photos")
        .send({ dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAP", contentType: "image/gif" }),
      sellerToken
    ).expect(400, { error: "Unsupported image type" });
    expect(uploadListingPhoto).not.toHaveBeenCalled();

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1).toString("base64");
    await auth(
      request(app)
        .post("/api/marketplace/listings/listing1/photos")
        .send({ dataUrl: `data:image/png;base64,${big}`, contentType: "image/png" }),
      sellerToken
    ).expect(400, { error: "Image is too large" });
    expect(uploadListingPhoto).not.toHaveBeenCalled();

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    prismaMock.marketplaceListingPhoto.count.mockResolvedValueOnce(15);
    await auth(
      request(app).post("/api/marketplace/listings/listing1/photos").send({ dataUrl: tinyPng, contentType: "image/png" }),
      sellerToken
    ).expect(400, { error: "Maximum of 15 photos per listing" });
    expect(uploadListingPhoto).not.toHaveBeenCalled();
  });

  it("uploads a photo and creates the photo row when valid", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    prismaMock.marketplaceListingPhoto.count.mockResolvedValueOnce(0);
    vi.mocked(uploadListingPhoto).mockResolvedValueOnce({
      objectKey: "listing-photos/listing1/key.png",
      publicUrl: "/api/profile-images/listing-photos/listing1/key.png",
    });
    prismaMock.marketplaceListingPhoto.create.mockResolvedValueOnce({ id: "photo1", url: "/api/profile-images/listing-photos/listing1/key.png" });

    await auth(
      request(app).post("/api/marketplace/listings/listing1/photos").send({ dataUrl: tinyPng, contentType: "image/png" }),
      sellerToken
    ).expect(201);

    expect(uploadListingPhoto).toHaveBeenCalled();
    expect(prismaMock.marketplaceListingPhoto.create).toHaveBeenCalledWith({
      data: {
        listingId: "listing1",
        objectKey: "listing-photos/listing1/key.png",
        url: "/api/profile-images/listing-photos/listing1/key.png",
        sortOrder: 0,
        label: null,
      },
    });
  });

  it("persists a canonical label and drops an invalid one (AC-POL-15.5)", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    prismaMock.marketplaceListingPhoto.count.mockResolvedValueOnce(0);
    vi.mocked(uploadListingPhoto).mockResolvedValueOnce({
      objectKey: "listing-photos/listing1/key.png",
      publicUrl: "/api/profile-images/listing-photos/listing1/key.png",
    });
    prismaMock.marketplaceListingPhoto.create.mockResolvedValueOnce({ id: "photo1" });

    await auth(
      request(app)
        .post("/api/marketplace/listings/listing1/photos")
        .send({ dataUrl: tinyPng, contentType: "image/png", label: "Front Top Left" }),
      sellerToken
    ).expect(201);
    expect(prismaMock.marketplaceListingPhoto.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: "Front Top Left" }) })
    );

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    prismaMock.marketplaceListingPhoto.count.mockResolvedValueOnce(0);
    vi.mocked(uploadListingPhoto).mockResolvedValueOnce({
      objectKey: "listing-photos/listing1/key2.png",
      publicUrl: "/api/profile-images/listing-photos/listing1/key2.png",
    });
    prismaMock.marketplaceListingPhoto.create.mockResolvedValueOnce({ id: "photo2" });

    await auth(
      request(app)
        .post("/api/marketplace/listings/listing1/photos")
        .send({ dataUrl: tinyPng, contentType: "image/png", label: "Not A Label" }),
      sellerToken
    ).expect(201);
    expect(prismaMock.marketplaceListingPhoto.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: null }) })
    );
  });
});

describe("marketplace photo label relabeling (REQ-POL-15, PATCH)", () => {
  it("returns 404 / 403 for missing or foreign photos", async () => {
    prismaMock.marketplaceListingPhoto.findUnique.mockResolvedValueOnce(null);
    await auth(
      request(app).patch("/api/marketplace/listings/listing1/photos/photo1").send({ label: "Front" }),
      sellerToken
    ).expect(404, { error: "Photo not found" });

    prismaMock.marketplaceListingPhoto.findUnique.mockResolvedValueOnce({
      id: "photo1",
      listing: { sellerId: "someoneElse" },
    });
    await auth(
      request(app).patch("/api/marketplace/listings/listing1/photos/photo1").send({ label: "Front" }),
      sellerToken
    ).expect(403, { error: "Only the seller can manage this listing" });
  });

  it("relabels a photo with a canonical label and returns the wire shape", async () => {
    prismaMock.marketplaceListingPhoto.findUnique.mockResolvedValueOnce({
      id: "photo1",
      listing: { sellerId: "seller1" },
    });
    prismaMock.marketplaceListingPhoto.update.mockResolvedValueOnce({
      id: "photo1",
      url: "/api/profile-images/listing-photos/listing1/key.png",
      sortOrder: 2,
      label: "Back",
    });

    const res = await auth(
      request(app).patch("/api/marketplace/listings/listing1/photos/photo1").send({ label: "Back" }),
      sellerToken
    ).expect(200);

    expect(prismaMock.marketplaceListingPhoto.update).toHaveBeenCalledWith({
      where: { id: "photo1" },
      data: { label: "Back" },
    });
    expect(res.body).toEqual({
      id: "photo1",
      url: "/api/profile-images/listing-photos/listing1/key.png",
      sortOrder: 2,
      label: "Back",
    });
  });

  it("leniently normalizes an invalid/absent label to null", async () => {
    prismaMock.marketplaceListingPhoto.findUnique.mockResolvedValueOnce({
      id: "photo1",
      listing: { sellerId: "seller1" },
    });
    prismaMock.marketplaceListingPhoto.update.mockResolvedValueOnce({
      id: "photo1",
      url: "/api/profile-images/listing-photos/listing1/key.png",
      sortOrder: 0,
      label: null,
    });

    await auth(
      request(app).patch("/api/marketplace/listings/listing1/photos/photo1").send({ label: "Nope" }),
      sellerToken
    ).expect(200);

    expect(prismaMock.marketplaceListingPhoto.update).toHaveBeenCalledWith({
      where: { id: "photo1" },
      data: { label: null },
    });
  });
});

describe("marketplace reports (REQ-22)", () => {
  it("validates and persists a report", async () => {
    await auth(request(app).post("/api/marketplace/reports").send({}), buyerToken).expect(400);

    prismaMock.marketplaceReport.create.mockResolvedValueOnce({
      id: "report1",
      targetType: "LISTING",
      targetId: "listing1",
      reason: "fake",
      status: "OPEN",
    });
    await auth(
      request(app).post("/api/marketplace/reports").send({ targetType: "LISTING", targetId: "listing1", reason: "fake" }),
      buyerToken
    ).expect(201);
    expect(prismaMock.marketplaceReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reporterId: "buyer1", targetType: "LISTING", targetId: "listing1", reason: "fake", status: "OPEN" }),
      })
    );
  });
});

describe("marketplace transaction list (D1)", () => {
  it("lists the caller's transactions newest-first, buyer OR seller", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([
      tx({
        id: "tx2",
        buyer: { id: "buyer1", username: "buyer" },
        seller: { id: "seller1", username: "seller" },
        card: { id: "card1", name: "Mickey Mouse", setName: "Set 1" },
      }),
    ]);

    const res = await auth(request(app).get("/api/marketplace/transactions"), buyerToken).expect(200);

    expect(prismaMock.marketplaceTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ buyerId: "buyer1" }, { sellerId: "buyer1" }] },
        orderBy: { createdAt: "desc" },
        include: {
          buyer: { select: { id: true, username: true } },
          seller: { select: { id: true, username: true } },
          card: { select: { id: true, name: true, setName: true } },
          reviews: { select: { reviewerId: true, rating: true, comment: true } },
        },
      })
    );
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].id).toBe("tx2");
    expect(res.body.transactions[0].buyer.username).toBe("buyer");
  });

  it("serializes caller-relative myReview/counterpartReview and strips raw reviews (REQ-REV-4)", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([
      tx({
        id: "tx2",
        buyer: { id: "buyer1", username: "buyer" },
        seller: { id: "seller1", username: "seller" },
        card: { id: "card1", name: "Mickey Mouse", setName: "Set 1" },
        reviews: [
          { reviewerId: "buyer1", rating: 5, comment: "great" },
          { reviewerId: "seller1", rating: 4, comment: "ok" },
        ],
      }),
    ]);

    const res = await auth(request(app).get("/api/marketplace/transactions"), buyerToken).expect(200);

    expect(res.body.transactions[0].myReview).toEqual({ rating: 5, comment: "great" });
    expect(res.body.transactions[0].counterpartReview).toEqual({ rating: 4, comment: "ok" });
    expect(res.body.transactions[0].reviews).toBeUndefined();
  });

  it("splits caller-relatively for the seller (REQ-REV-4)", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([
      tx({
        buyer: { id: "buyer1", username: "buyer" },
        seller: { id: "seller1", username: "seller" },
        card: { id: "card1", name: "Mickey Mouse", setName: "Set 1" },
        reviews: [
          { reviewerId: "buyer1", rating: 5, comment: "great" },
          { reviewerId: "seller1", rating: 4, comment: "ok" },
        ],
      }),
    ]);

    const res = await auth(request(app).get("/api/marketplace/transactions"), sellerToken).expect(200);

    expect(res.body.transactions[0].myReview).toEqual({ rating: 4, comment: "ok" });
    expect(res.body.transactions[0].counterpartReview).toEqual({ rating: 5, comment: "great" });
  });

  it("returns null reviews when a transaction has none (REQ-REV-4)", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([
      tx({
        buyer: { id: "buyer1", username: "buyer" },
        seller: { id: "seller1", username: "seller" },
        card: { id: "card1", name: "Mickey Mouse", setName: "Set 1" },
      }),
    ]);

    const res = await auth(request(app).get("/api/marketplace/transactions"), buyerToken).expect(200);

    expect(res.body.transactions[0].myReview).toBeNull();
    expect(res.body.transactions[0].counterpartReview).toBeNull();
  });

  it("filters by a valid status and rejects an invalid status", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([]);
    await auth(request(app).get("/api/marketplace/transactions").query({ status: "COMPLETED" }), buyerToken).expect(200);
    expect(prismaMock.marketplaceTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "COMPLETED", OR: [{ buyerId: "buyer1" }, { sellerId: "buyer1" }] }),
      })
    );

    await auth(request(app).get("/api/marketplace/transactions").query({ status: "BOGUS" }), buyerToken).expect(400, {
      error: "Invalid transaction status",
    });
    expect(prismaMock.marketplaceTransaction.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("marketplace my listings (D2)", () => {
  it("lists the seller's own listings including CLOSED and hidden", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([
      listing({ status: "CLOSED", quantity: 0, hiddenAt: new Date("2026-10-02T00:00:00Z"), sellerId: "seller1" }),
    ]);

    const res = await auth(request(app).get("/api/marketplace/listings/mine"), sellerToken).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId: "seller1" },
        orderBy: { createdAt: "desc" },
      })
    );
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.listings[0].status).toBe("CLOSED");
    expect(res.body.listings[0].hiddenAt).not.toBeNull();
  });

  it("is not shadowed by /listings/:id (mine is treated as a route, not an id)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([listing()]);

    const res = await auth(request(app).get("/api/marketplace/listings/mine"), sellerToken).expect(200);

    expect(prismaMock.marketplaceListing.findUnique).not.toHaveBeenCalled();
    expect(res.body.listings).toHaveLength(1);
  });

  it("includes nested card.prices on /mine (AC-POL-11.6)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([listing()]);

    await auth(request(app).get("/api/marketplace/listings/mine"), sellerToken).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          card: { include: { prices: true } },
        }),
      })
    );
  });
});

describe("marketplace enquiry thread authz (AC-11.3 / T1)", () => {
  it("rejects a non-participant reading an enquiry thread", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiry({ buyerId: "buyer1", sellerId: "seller1" })
    );
    await auth(request(app).get("/api/marketplace/enquiries/enq1"), otherToken).expect(403, {
      error: "You are not a participant in this enquiry",
    });
  });

  it("rejects a non-participant posting a message to an enquiry thread", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiry({ buyerId: "buyer1", sellerId: "seller1", status: "ACTIVE" })
    );
    await auth(request(app).post("/api/marketplace/enquiries/enq1/messages").send({ body: "hi" }), otherToken).expect(403, {
      error: "You are not a participant in this enquiry",
    });
  });

  it("creates a message as a participant and stores it as plain text", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiry({ buyerId: "buyer1", sellerId: "seller1", status: "ACTIVE" })
    );
    prismaMock.enquiryMessage.create.mockResolvedValueOnce({
      id: "msg1",
      enquiryId: "enq1",
      senderId: "buyer1",
      body: "hello",
    });

    const res = await auth(
      request(app).post("/api/marketplace/enquiries/enq1/messages").send({ body: "hello" }),
      buyerToken
    ).expect(201);

    expect(prismaMock.enquiryMessage.create).toHaveBeenCalledWith({
      data: { enquiryId: "enq1", senderId: "buyer1", body: "hello" },
    });
    expect(res.body.id).toBe("msg1");
  });

  it("rejects a message on an archived thread with 409", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiry({ buyerId: "buyer1", sellerId: "seller1", status: "ARCHIVED" })
    );
    await auth(request(app).post("/api/marketplace/enquiries/enq1/messages").send({ body: "hello" }), buyerToken).expect(409, {
      error: "Enquiry is not active",
    });
  });
});

describe("marketplace sendError maps unexpected failures to 500", () => {
  it("returns 500 for a non-MarketplaceError", async () => {
    prismaMock.marketplaceListing.findMany.mockRejectedValueOnce(new Error("db down"));
    await request(app).get("/api/marketplace/listings").expect(500, { error: "Internal server error" });
  });
});

describe("marketplace browse pagination and seller filter", () => {
  it("falls back to page=1/limit=20 for non-numeric query params", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    const res = await request(app)
      .get("/api/marketplace/listings")
      .query({ page: "abc", limit: "xyz" })
      .expect(200);

    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it("filters by an explicit sellerId query param", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.count.mockResolvedValueOnce(0);

    await request(app).get("/api/marketplace/listings").query({ sellerId: "seller2" }).expect(200);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sellerId: "seller2" }) })
    );
  });
});

describe("marketplace detail / seller-profile not-found", () => {
  it("returns 404 for a missing listing", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(null);
    await request(app).get("/api/marketplace/listings/missing").expect(404, { error: "Listing not found" });
  });

  it("sums the pending quantity from pending transactions", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing());
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([{ quantity: 2 }, { quantity: 3 }]);

    const res = await request(app).get("/api/marketplace/listings/listing1").expect(200);
    expect(res.body.pendingQuantity).toBe(5);
  });

  it("returns 404 for a missing seller", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await request(app).get("/api/marketplace/sellers/missing").expect(404, { error: "Seller not found" });
  });
});

describe("marketplace serializeListing — populated seller and empty photos", () => {
  it("serializes a populated seller and treats missing photos as empty", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([
      listing({
        seller: { id: "seller1", username: "seller", profile: null },
        photos: undefined,
        card: { id: "card1" },
      }),
    ]);

    const res = await auth(request(app).get("/api/marketplace/listings/mine"), sellerToken).expect(200);

    expect(res.body.listings[0].seller.id).toBe("seller1");
    expect(res.body.listings[0].seller.username).toBe("seller");
    expect(res.body.listings[0].photos).toEqual([]);
  });

  it("emits { id, url, sortOrder, label } for every photo (AC-POL-15.5)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([
      listing({
        seller: null,
        photos: [
          { id: "photo1", url: "/img/1.png", sortOrder: 0, label: "Front" },
          { id: "photo2", url: "/img/2.png", sortOrder: 1, label: null },
        ],
      }),
    ]);

    const res = await auth(request(app).get("/api/marketplace/listings/mine"), sellerToken).expect(200);

    expect(res.body.listings[0].photos).toEqual([
      { id: "photo1", url: "/img/1.png", sortOrder: 0, label: "Front" },
      { id: "photo2", url: "/img/2.png", sortOrder: 1, label: null },
    ]);
  });
});

describe("marketplace create-listing validation edges", () => {
  it("rejects a negative priceMinor", async () => {
    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "normal", quantity: 1, priceMinor: -5, currency: "USD" }),
      buyerToken
    ).expect(400);
  });

  it("rejects an invalid condition / location / note", async () => {
    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "normal", quantity: 1, priceMinor: 100, currency: "USD", condition: "BAD" }),
      buyerToken
    ).expect(400, { error: "Invalid condition" });

    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "normal", quantity: 1, priceMinor: 100, currency: "USD", location: 123 }),
      buyerToken
    ).expect(400, { error: "Invalid location" });

    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "normal", quantity: 1, priceMinor: 100, currency: "USD", note: 123 }),
      buyerToken
    ).expect(400, { error: "Invalid note" });
  });

  it("normalizes absent condition/location/note to null/empty/null", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce({ id: "card1" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.create.mockResolvedValueOnce(listing({ id: "min1", quantity: 1 }));

    await auth(
      request(app).post("/api/marketplace/listings").send({ cardId: "card1", variant: "normal", quantity: 1, priceMinor: 100, currency: "USD" }),
      sellerToken
    ).expect(201);

    expect(prismaMock.marketplaceListing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ condition: null, location: "", note: null }),
      })
    );
  });
});

describe("marketplace edit-listing edges", () => {
  it("returns 404 / 410 for missing or hidden listings", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ note: "x" }), sellerToken).expect(404, { error: "Listing not found" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ hiddenAt: new Date() }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ note: "x" }), sellerToken).expect(410, { error: "Listing is no longer available" });
  });

  it("validates currency / condition / location / note on edit", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ currency: "XYZ" }), sellerToken).expect(400, { error: "Invalid currency" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ condition: "BAD" }), sellerToken).expect(400, { error: "Invalid condition" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ location: 123 }), sellerToken).expect(400, { error: "Invalid location" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ note: 123 }), sellerToken).expect(400, { error: "Invalid note" });
  });

  it("accepts null condition and note, and a valid currency", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1", status: "ACTIVE" }));
    prismaMock.marketplaceListing.update.mockResolvedValueOnce(listing({ condition: null }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ condition: null }), sellerToken).expect(200);

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1", status: "ACTIVE" }));
    prismaMock.marketplaceListing.update.mockResolvedValueOnce(listing({ note: null }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ note: null }), sellerToken).expect(200);

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1", status: "ACTIVE" }));
    prismaMock.marketplaceTransaction.findFirst.mockResolvedValueOnce(null);
    prismaMock.marketplaceListing.update.mockResolvedValueOnce(listing({ currency: "EUR" }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ currency: "EUR" }), sellerToken).expect(200);
  });

  it("rejects locked-field edits on a non-ACTIVE listing", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1", status: "CLOSED" }));
    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ quantity: 2 }), sellerToken).expect(409, { error: "Listing is not active" });
  });

  it("returns the current listing unchanged for an empty edit body", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    const res = await auth(request(app).patch("/api/marketplace/listings/listing1").send({}), sellerToken).expect(200);
    expect(res.body.id).toBe("listing1");
  });

  it("applies a quantity edit within available inventory", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(
      listing({ sellerId: "seller1", status: "ACTIVE", cardId: "card1", variant: "normal" })
    );
    prismaMock.marketplaceTransaction.findFirst.mockResolvedValueOnce(null);
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValueOnce([]);
    prismaMock.marketplaceListing.update.mockResolvedValueOnce(listing({ quantity: 2 }));

    await auth(request(app).patch("/api/marketplace/listings/listing1").send({ quantity: 2 }), sellerToken).expect(200);
  });
});

describe("marketplace delete-listing edges", () => {
  it("returns 404 / 403 for missing or foreign listings", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).delete("/api/marketplace/listings/listing1"), sellerToken).expect(404, { error: "Listing not found" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "someoneElse" }));
    await auth(request(app).delete("/api/marketplace/listings/listing1"), sellerToken).expect(403, { error: "Only the seller can delete this listing" });
  });
});

describe("marketplace photo edges", () => {
  it("returns 404 / 403 for missing or foreign listings", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(null);
    await auth(
      request(app).post("/api/marketplace/listings/listing1/photos").send({ dataUrl: tinyPng, contentType: "image/png" }),
      sellerToken
    ).expect(404, { error: "Listing not found" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "someoneElse" }));
    await auth(
      request(app).post("/api/marketplace/listings/listing1/photos").send({ dataUrl: tinyPng, contentType: "image/png" }),
      sellerToken
    ).expect(403, { error: "Only the seller can manage this listing" });
  });

  it("validates the payload shape (missing / malformed / mismatched / empty)", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(
      request(app).post("/api/marketplace/listings/listing1/photos").send({ dataUrl: 123, contentType: "image/png" }),
      sellerToken
    ).expect(400, { error: "dataUrl and contentType are required" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(
      request(app).post("/api/marketplace/listings/listing1/photos").send({ dataUrl: "not-a-data-url", contentType: "image/png" }),
      sellerToken
    ).expect(400, { error: "Invalid image payload" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(
      request(app).post("/api/marketplace/listings/listing1/photos").send({ dataUrl: "data:image/jpeg;base64,xxxx", contentType: "image/png" }),
      sellerToken
    ).expect(400, { error: "Image content type mismatch" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1" }));
    await auth(
      request(app).post("/api/marketplace/listings/listing1/photos").send({ dataUrl: "data:image/png;base64,", contentType: "image/png" }),
      sellerToken
    ).expect(400, { error: "Invalid image payload" });
  });

  it("deletes a photo and its stored object", async () => {
    prismaMock.marketplaceListingPhoto.findUnique.mockResolvedValueOnce(null);
    await auth(
      request(app).delete("/api/marketplace/listings/listing1/photos/photo1"),
      sellerToken
    ).expect(404, { error: "Photo not found" });

    prismaMock.marketplaceListingPhoto.findUnique.mockResolvedValueOnce({ id: "photo1", objectKey: "key", listing: { sellerId: "someoneElse" } });
    await auth(
      request(app).delete("/api/marketplace/listings/listing1/photos/photo1"),
      sellerToken
    ).expect(403, { error: "Only the seller can manage this listing" });

    prismaMock.marketplaceListingPhoto.findUnique.mockResolvedValueOnce({ id: "photo1", objectKey: "key", listing: { sellerId: "seller1" } });
    prismaMock.marketplaceListingPhoto.delete.mockResolvedValueOnce({});
    await auth(
      request(app).delete("/api/marketplace/listings/listing1/photos/photo1"),
      sellerToken
    ).expect(204);
    expect(deleteListingPhoto).toHaveBeenCalledWith("key");
  });
});

describe("marketplace enquire edges", () => {
  it("returns 404 / 410 / 409 for missing, hidden, or inactive listings", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/listings/listing1/enquire").send({ requestedQuantity: 1 }), buyerToken).expect(404, { error: "Listing not found" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ hiddenAt: new Date() }));
    await auth(request(app).post("/api/marketplace/listings/listing1/enquire").send({ requestedQuantity: 1 }), buyerToken).expect(410, { error: "Listing is no longer available" });

    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ status: "CLOSED" }));
    await auth(request(app).post("/api/marketplace/listings/listing1/enquire").send({ requestedQuantity: 1 }), buyerToken).expect(409, { error: "Listing is not active" });
  });
});

describe("marketplace public reviews list", () => {
  it("lists a user's reviews", async () => {
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([
      { id: "r1", revieweeId: "seller1", rating: 5, reviewer: { id: "buyer1", username: "buyer" } },
    ]);

    const res = await request(app).get("/api/marketplace/users/seller1/reviews").expect(200);
    expect(res.body.reviews).toHaveLength(1);
  });
});

describe("marketplace enquiries list (REQ-12)", () => {
  it("returns an empty list when the caller has no enquiries", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([]);

    const res = await auth(request(app).get("/api/marketplace/enquiries"), buyerToken).expect(200);
    expect(res.body.enquiries).toEqual([]);
  });

  it("sorts by lastMessageAt and falls back to updatedAt/createdAt", async () => {
    const d = (s: string) => new Date(s);
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([
      { id: "enq1", listingId: "listing1", buyerId: "buyer1", sellerId: "seller1", requestedQuantity: 2, status: "ACTIVE", createdAt: d("2026-10-01"), updatedAt: d("2026-10-01"), listing: {}, buyer: {}, seller: {} },
      { id: "enq2", listingId: "listing2", buyerId: "buyer1", sellerId: "seller2", requestedQuantity: 1, status: "ACTIVE", createdAt: d("2026-10-02"), updatedAt: d("2026-10-02"), listing: {}, buyer: {}, seller: {} },
      { id: "enq3", listingId: "listing3", buyerId: "buyer1", sellerId: "seller3", requestedQuantity: 1, status: "ACTIVE", createdAt: d("2026-10-03"), updatedAt: undefined, listing: {}, buyer: {}, seller: {} },
    ]);
    prismaMock.enquiryReadState.findMany.mockResolvedValueOnce([]);
    prismaMock.enquiryMessage.findMany.mockResolvedValueOnce([
      { enquiryId: "enq1", createdAt: d("2026-10-05") },
      { enquiryId: "enq1", createdAt: d("2026-10-04") },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries"), buyerToken).expect(200);

    expect(res.body.enquiries).toHaveLength(3);
    expect(res.body.enquiries.find((e: any) => e.id === "enq1").lastMessageAt).toBe(d("2026-10-05").toISOString());
    expect(res.body.enquiries.find((e: any) => e.id === "enq2").lastMessageAt).toBe(d("2026-10-02").toISOString());
    expect(res.body.enquiries.find((e: any) => e.id === "enq3").lastMessageAt).toBe(d("2026-10-03").toISOString());
  });
});

describe("marketplace enquiry detail (REQ-12)", () => {
  it("returns the full thread for a participant", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      requestedQuantity: 2,
      status: "ACTIVE",
      createdAt: new Date("2026-10-01"),
      updatedAt: new Date("2026-10-01"),
      listing: { id: "listing1", card: { id: "card1" }, photos: [] },
      buyer: { id: "buyer1", username: "buyer" },
      seller: { id: "seller1", username: "seller" },
      messages: [{ id: "msg1", enquiryId: "enq1", senderId: "buyer1", body: "hello", createdAt: new Date("2026-10-01") }],
      transactions: [],
    });

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);
    expect(res.body.enquiry.id).toBe("enq1");
    expect(res.body.messages).toHaveLength(1);
  });

  it("returns 404 for a missing enquiry", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).get("/api/marketplace/enquiries/missing"), buyerToken).expect(404, { error: "Enquiry not found" });
  });
});

describe("marketplace enquiry detail myReview (REQ-TX-4)", () => {
  const transaction = (overrides: Record<string, unknown> = {}) => ({
    id: "tx1",
    status: "COMPLETED",
    quantity: 2,
    soldAt: new Date("2026-10-02T00:00:00Z"),
    confirmedAt: new Date("2026-10-03T00:00:00Z"),
    ...overrides,
  });

  const enquiryWithTransactions = (transactions: unknown[]) => ({
    id: "enq1",
    listingId: "listing1",
    buyerId: "buyer1",
    sellerId: "seller1",
    requestedQuantity: 2,
    status: "ACTIVE",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    listing: { id: "listing1", card: { id: "card1" }, photos: [] },
    buyer: { id: "buyer1", username: "buyer" },
    seller: { id: "seller1", username: "seller" },
    messages: [],
    transactions,
  });

  it("returns myReview: null per embedded transaction and batches the review query", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiryWithTransactions([transaction(), transaction({ id: "tx2" })])
    );
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);

    expect(prismaMock.marketplaceReview.findMany).toHaveBeenCalledWith({
      where: { transactionId: { in: ["tx1", "tx2"] } },
    });

    expect(res.body.transactions).toHaveLength(2);
    expect(res.body.transactions[0]).toEqual({
      id: "tx1",
      status: "COMPLETED",
      quantity: 2,
      soldAt: "2026-10-02T00:00:00.000Z",
      confirmedAt: "2026-10-03T00:00:00.000Z",
      myReview: null,
      counterpartReview: null,
    });
    expect(res.body.transactions[1].myReview).toBeNull();
    expect(res.body.transactions[1].counterpartReview).toBeNull();
  });

  it("returns myReview: { rating, comment } when the caller already reviewed", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiryWithTransactions([transaction()])
    );
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([
      { transactionId: "tx1", reviewerId: "buyer1", rating: 5, comment: "great" },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);

    expect(res.body.transactions[0].myReview).toEqual({ rating: 5, comment: "great" });
  });

  it("returns myReview with a null comment when the caller left no comment", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiryWithTransactions([transaction()])
    );
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([
      { transactionId: "tx1", reviewerId: "buyer1", rating: 4, comment: null },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);

    expect(res.body.transactions[0].myReview).toEqual({ rating: 4, comment: null });
  });

  it("splits buyer vs counterpart reviews caller-relatively (buyer caller) (REQ-REV-2)", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiryWithTransactions([transaction()])
    );
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([
      { transactionId: "tx1", reviewerId: "buyer1", rating: 5, comment: "great" },
      { transactionId: "tx1", reviewerId: "seller1", rating: 4, comment: "ok" },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);

    expect(res.body.transactions[0].myReview).toEqual({ rating: 5, comment: "great" });
    expect(res.body.transactions[0].counterpartReview).toEqual({ rating: 4, comment: "ok" });
  });

  it("splits caller-relatively for the seller caller (REQ-REV-2)", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiryWithTransactions([transaction()])
    );
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([
      { transactionId: "tx1", reviewerId: "buyer1", rating: 5, comment: "great" },
      { transactionId: "tx1", reviewerId: "seller1", rating: 4, comment: "ok" },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), sellerToken).expect(200);

    expect(res.body.transactions[0].myReview).toEqual({ rating: 4, comment: "ok" });
    expect(res.body.transactions[0].counterpartReview).toEqual({ rating: 5, comment: "great" });
  });

  it("returns counterpartReview null when only the caller's own review is present (REQ-REV-2)", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiryWithTransactions([transaction()])
    );
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([
      { transactionId: "tx1", reviewerId: "buyer1", rating: 5, comment: "great" },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);

    expect(res.body.transactions[0].myReview).toEqual({ rating: 5, comment: "great" });
    expect(res.body.transactions[0].counterpartReview).toBeNull();
  });

  it("returns myReview null when only the counterpart's review is present (REQ-REV-2)", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiryWithTransactions([transaction()])
    );
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([
      { transactionId: "tx1", reviewerId: "seller1", rating: 4, comment: "ok" },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);

    expect(res.body.transactions[0].myReview).toBeNull();
    expect(res.body.transactions[0].counterpartReview).toEqual({ rating: 4, comment: "ok" });
  });

  it("skips the review query when there are zero transactions", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiryWithTransactions([])
    );

    const res = await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);

    expect(res.body.transactions).toEqual([]);
    expect(prismaMock.marketplaceReview.findMany).not.toHaveBeenCalled();
  });
});

describe("marketplace message validation edges", () => {
  it("returns 404 for a missing enquiry", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/enquiries/enq1/messages").send({ body: "hi" }), buyerToken).expect(404, { error: "Enquiry not found" });
  });

  it("rejects an empty message body", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(enquiry({ buyerId: "buyer1", sellerId: "seller1", status: "ACTIVE" }));
    await auth(request(app).post("/api/marketplace/enquiries/enq1/messages").send({ body: "" }), buyerToken).expect(400, { error: "Message body is required" });
  });
});

describe("marketplace transaction route edges", () => {
  it("adjust quantity: 404 / 403 and seller-side success", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).patch("/api/marketplace/transactions/tx1/quantity").send({ quantity: 2 }), buyerToken).expect(404, { error: "Transaction not found" });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    await auth(request(app).patch("/api/marketplace/transactions/tx1/quantity").send({ quantity: 2 }), otherToken).expect(403, { error: "You are not a party to this transaction" });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    vi.mocked(adjustQuantity).mockResolvedValueOnce({ transactionId: "tx1", quantity: 2 });
    await auth(request(app).patch("/api/marketplace/transactions/tx1/quantity").send({ quantity: 2 }), sellerToken).expect(200);
  });

  it("confirm: 404 for a missing transaction", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/transactions/tx1/confirm"), buyerToken).expect(404, { error: "Transaction not found" });
  });

  it("cancel: 404 for a missing transaction and BUYER actor for the buyer", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/transactions/tx1/cancel"), buyerToken).expect(404, { error: "Transaction not found" });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    vi.mocked(cancelTransaction).mockResolvedValueOnce({ transactionId: "tx1", alreadyCancelled: false, status: "CANCELLED" });
    await auth(request(app).post("/api/marketplace/transactions/tx1/cancel"), buyerToken).expect(200);
    expect(cancelTransaction).toHaveBeenCalledWith("tx1", "BUYER");
  });

  it("transaction detail: 404 / 403 / success", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).get("/api/marketplace/transactions/tx1"), buyerToken).expect(404, { error: "Transaction not found" });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx());
    await auth(request(app).get("/api/marketplace/transactions/tx1"), otherToken).expect(403, { error: "You are not a party to this transaction" });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(
      tx({ buyer: { id: "buyer1", username: "buyer" }, seller: { id: "seller1", username: "seller" }, card: { id: "card1", name: "Mickey", setName: "Set 1" } })
    );
    const res = await auth(request(app).get("/api/marketplace/transactions/tx1"), buyerToken).expect(200);
    expect(res.body.id).toBe("tx1");
  });

  it("transaction detail serializes caller-relative review state (REQ-REV-4)", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(
      tx({
        status: "COMPLETED",
        buyer: { id: "buyer1", username: "buyer" },
        seller: { id: "seller1", username: "seller" },
        card: { id: "card1", name: "Mickey", setName: "Set 1" },
        reviews: [
          { reviewerId: "buyer1", rating: 5, comment: "great" },
          { reviewerId: "seller1", rating: 4, comment: "ok" },
        ],
      })
    );

    const res = await auth(request(app).get("/api/marketplace/transactions/tx1"), buyerToken).expect(200);
    expect(res.body.myReview).toEqual({ rating: 5, comment: "great" });
    expect(res.body.counterpartReview).toEqual({ rating: 4, comment: "ok" });
    expect(res.body.reviews).toBeUndefined();
  });

  it("transaction detail reports a null review when the caller has not reviewed", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(
      tx({
        status: "COMPLETED",
        buyer: { id: "buyer1", username: "buyer" },
        seller: { id: "seller1", username: "seller" },
        card: { id: "card1", name: "Mickey", setName: "Set 1" },
      })
    );

    const res = await auth(request(app).get("/api/marketplace/transactions/tx1"), buyerToken).expect(200);
    expect(res.body.myReview).toBeNull();
    expect(res.body.counterpartReview).toBeNull();
  });
});

describe("marketplace me/pending buyer fallback", () => {
  it("serializes a null buyer username as null", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([tx({ buyer: null })]);
    const res = await auth(request(app).get("/api/marketplace/me/pending"), sellerToken).expect(200);
    expect(res.body.items[0].buyerUsername).toBeNull();
  });
});

describe("marketplace review edges", () => {
  it("returns 404 for a missing transaction", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 5 }), buyerToken).expect(404, { error: "Transaction not found" });
  });

  it("rejects a review by a non-party", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx({ status: "COMPLETED" }));
    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 5 }), otherToken).expect(403, { error: "You are not a party to this transaction" });
  });

  it("rejects a non-string comment", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx({ status: "COMPLETED" }));
    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 5, comment: 123 }), buyerToken).expect(400, { error: "Invalid comment" });
  });

  it("maps a P2002 unique violation to 409", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(tx({ status: "COMPLETED" }));
    prismaMock.marketplaceReview.findUnique.mockResolvedValueOnce(null);
    prismaMock.marketplaceReview.create.mockRejectedValueOnce({ code: "P2002" });

    await auth(request(app).post("/api/marketplace/transactions/tx1/review").send({ rating: 5 }), buyerToken).expect(409, { error: "You have already reviewed this transaction" });
  });
});

describe("marketplace references / reports edges", () => {
  it("computes the badge via the seller-side branch of the deal check", async () => {
    prismaMock.userReference.findMany.mockResolvedValueOnce([
      { id: "ref1", authorId: "buyer2", subjectId: "seller1", comment: "great", author: { id: "buyer2", username: "buyer2" } },
    ]);
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([
      { buyerId: "buyer2", sellerId: "seller1" },
    ]);

    const res = await request(app).get("/api/marketplace/users/seller1/references").expect(200);
    expect(res.body.references[0].hasCompletedDeal).toBe(true);
  });

  it("rejects a blank vouch comment and a missing subject", async () => {
    await auth(request(app).post("/api/marketplace/users/seller1/references").send({ comment: "   " }), buyerToken).expect(400, { error: "Comment is required" });

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/marketplace/users/missing/references").send({ comment: "nice" }), buyerToken).expect(404, { error: "User not found" });
  });

  it("rejects a report missing targetId or reason", async () => {
    await auth(request(app).post("/api/marketplace/reports").send({ targetType: "LISTING", reason: "fake" }), buyerToken).expect(400, { error: "targetId is required" });
    await auth(request(app).post("/api/marketplace/reports").send({ targetType: "LISTING", targetId: "listing1" }), buyerToken).expect(400, { error: "reason is required" });
  });
});

describe("marketplace unread-count (REQ-NOTIF-5)", () => {
  const d = (s: string) => new Date(s);

  it("returns 401 when unauthenticated (AC-NOTIF-5.2)", async () => {
    await request(app).get("/api/marketplace/enquiries/unread-count").expect(401);
  });

  it("returns { count: 0 } with no threads", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([]);
    const res = await auth(request(app).get("/api/marketplace/enquiries/unread-count"), buyerToken).expect(200);
    expect(res.body).toEqual({ count: 0 });
  });

  it("counts a fresh zero-message enquiry as unread for the seller (AC-NOTIF-4.2)", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([
      { id: "enq1", buyerId: "buyer1", sellerId: "seller1", createdAt: d("2026-10-01"), updatedAt: d("2026-10-01") },
    ]);
    prismaMock.enquiryReadState.findMany.mockResolvedValueOnce([]);
    prismaMock.enquiryMessage.findMany.mockResolvedValueOnce([]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/unread-count"), sellerToken).expect(200);
    expect(res.body).toEqual({ count: 1 });
  });

  it("does NOT count the buyer's own thread (AC-NOTIF-3.4)", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([
      { id: "enq1", buyerId: "buyer1", sellerId: "seller1", createdAt: d("2026-10-01"), updatedAt: d("2026-10-01") },
    ]);
    prismaMock.enquiryReadState.findMany.mockResolvedValueOnce([]);
    prismaMock.enquiryMessage.findMany.mockResolvedValueOnce([]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/unread-count"), buyerToken).expect(200);
    expect(res.body).toEqual({ count: 0 });
  });

  it("counts a seller reply as unread for the buyer", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([
      { id: "enq1", buyerId: "buyer1", sellerId: "seller1", createdAt: d("2026-10-01"), updatedAt: d("2026-10-01") },
    ]);
    prismaMock.enquiryReadState.findMany.mockResolvedValueOnce([]);
    prismaMock.enquiryMessage.findMany.mockResolvedValueOnce([
      { enquiryId: "enq1", senderId: "seller1", createdAt: d("2026-10-02") },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/unread-count"), buyerToken).expect(200);
    expect(res.body).toEqual({ count: 1 });
  });

  it("respects lastReadAt (a thread read after its last activity is not counted)", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([
      { id: "enq1", buyerId: "buyer1", sellerId: "seller1", createdAt: d("2026-10-01"), updatedAt: d("2026-10-01") },
    ]);
    prismaMock.enquiryReadState.findMany.mockResolvedValueOnce([
      { enquiryId: "enq1", lastReadAt: d("2026-10-03") },
    ]);
    prismaMock.enquiryMessage.findMany.mockResolvedValueOnce([
      { enquiryId: "enq1", senderId: "seller1", createdAt: d("2026-10-02") },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries/unread-count"), buyerToken).expect(200);
    expect(res.body).toEqual({ count: 0 });
  });

  it("is not shadowed by /enquiries/:id (literal segment wins)", async () => {
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([]);
    const res = await auth(request(app).get("/api/marketplace/enquiries/unread-count"), buyerToken).expect(200);
    expect(res.body).toEqual({ count: 0 });
    expect(prismaMock.marketplaceEnquiry.findUnique).not.toHaveBeenCalled();
  });
});

describe("marketplace unread metadata on GET /enquiries (REQ-NOTIF-4)", () => {
  it("returns unread/unreadCount per item and keeps newest-first ordering", async () => {
    const d = (s: string) => new Date(s);
    prismaMock.marketplaceEnquiry.findMany.mockResolvedValueOnce([
      { id: "enq1", listingId: "l1", buyerId: "buyer1", sellerId: "seller1", requestedQuantity: 2, status: "ACTIVE", createdAt: d("2026-10-01"), updatedAt: d("2026-10-01"), listing: {}, buyer: {}, seller: {} },
      { id: "enq2", listingId: "l2", buyerId: "buyer1", sellerId: "seller2", requestedQuantity: 1, status: "ACTIVE", createdAt: d("2026-10-02"), updatedAt: d("2026-10-02"), listing: {}, buyer: {}, seller: {} },
    ]);
    prismaMock.enquiryReadState.findMany.mockResolvedValueOnce([
      { enquiryId: "enq2", lastReadAt: d("2026-10-05") },
    ]);
    prismaMock.enquiryMessage.findMany.mockResolvedValueOnce([
      { enquiryId: "enq1", senderId: "seller1", createdAt: d("2026-10-04") },
      { enquiryId: "enq2", senderId: "seller2", createdAt: d("2026-10-03") },
    ]);

    const res = await auth(request(app).get("/api/marketplace/enquiries"), buyerToken).expect(200);

    expect(prismaMock.enquiryMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { enquiryId: true, senderId: true, createdAt: true } })
    );

    const items = res.body.enquiries;
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("enq1");
    expect(items[0].unread).toBe(true);
    expect(items[0].unreadCount).toBe(1);
    expect(items[1].id).toBe("enq2");
    expect(items[1].unread).toBe(false);
    expect(items[1].unreadCount).toBe(0);
  });
});

describe("marketplace mark-read side effects (REQ-NOTIF-3)", () => {
  it("GET /enquiries/:id upserts the viewer's read state after the participant check", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      requestedQuantity: 2,
      status: "ACTIVE",
      createdAt: new Date("2026-10-01"),
      updatedAt: new Date("2026-10-01"),
      listing: { id: "listing1", card: { id: "card1" }, photos: [] },
      buyer: { id: "buyer1", username: "buyer" },
      seller: { id: "seller1", username: "seller" },
      messages: [],
      transactions: [],
    });

    await auth(request(app).get("/api/marketplace/enquiries/enq1"), buyerToken).expect(200);

    expect(prismaMock.enquiryReadState.upsert).toHaveBeenCalledWith({
      where: { enquiryId_userId: { enquiryId: "enq1", userId: "buyer1" } },
      create: { enquiryId: "enq1", userId: "buyer1" },
      update: { lastReadAt: expect.any(Date) },
    });
  });

  it("GET /enquiries/:id does NOT touch read state for a non-participant (403)", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiry({ buyerId: "buyer1", sellerId: "seller1" })
    );
    await auth(request(app).get("/api/marketplace/enquiries/enq1"), otherToken).expect(403);
    expect(prismaMock.enquiryReadState.upsert).not.toHaveBeenCalled();
  });

  it("POST /listings/:id/enquire upserts the buyer's read state in a transaction", async () => {
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(listing({ sellerId: "seller1", quantity: 3, status: "ACTIVE" }));
    prismaMock.marketplaceEnquiry.upsert.mockResolvedValueOnce({ id: "enq1" });

    await auth(
      request(app).post("/api/marketplace/listings/listing1/enquire").send({ requestedQuantity: 2 }),
      buyerToken
    ).expect(201);

    expect(prismaMock.enquiryReadState.upsert).toHaveBeenCalledWith({
      where: { enquiryId_userId: { enquiryId: "enq1", userId: "buyer1" } },
      create: { enquiryId: "enq1", userId: "buyer1" },
      update: { lastReadAt: expect.any(Date) },
    });
  });

  it("POST /enquiries/:id/messages creates the message and upserts the sender's read state", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce(
      enquiry({ buyerId: "buyer1", sellerId: "seller1", status: "ACTIVE" })
    );
    prismaMock.enquiryMessage.create.mockResolvedValueOnce({
      id: "msg1",
      enquiryId: "enq1",
      senderId: "buyer1",
      body: "hello",
    });

    const res = await auth(
      request(app).post("/api/marketplace/enquiries/enq1/messages").send({ body: "hello" }),
      buyerToken
    ).expect(201);

    expect(res.body.id).toBe("msg1");
    expect(prismaMock.enquiryMessage.create).toHaveBeenCalledWith({
      data: { enquiryId: "enq1", senderId: "buyer1", body: "hello" },
    });
    expect(prismaMock.enquiryReadState.upsert).toHaveBeenCalledWith({
      where: { enquiryId_userId: { enquiryId: "enq1", userId: "buyer1" } },
      create: { enquiryId: "enq1", userId: "buyer1" },
      update: { lastReadAt: expect.any(Date) },
    });
  });
});
