import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

const app = createApp();
const token = signToken({ userId: "user_1", username: "jw1005" });

function auth(req: request.Test) {
  return req.set("Authorization", `Bearer ${token}`);
}

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: "card_1",
    externalId: 1,
    name: "Mickey Mouse",
    subtitle: "Brave Little Tailor",
    character: "Mickey Mouse",
    types: ["Hero"],
    cardType: "Character",
    color: "Amber",
    setCode: "SET1",
    setNumber: 1,
    setName: "The First Chapter",
    rarity: "Legendary",
    inkCost: 8,
    strength: 5,
    willpower: 5,
    lore: 4,
    abilities: "Evasive",
    cardNumber: "1/204 • EN • 1",
    collectorNumber: 1,
    foilTypes: ["None", "Silver", "Lava"],
    imageUrl: "https://img",
    displayPrice: 4,
    prices: [
      { variant: "Normal", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4 },
      { variant: "Cold Foil", lowPrice: 5, midPrice: 6, highPrice: 7, marketPrice: 8 },
    ],
    ...overrides,
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry_1",
    userId: "user_1",
    cardId: "card_1",
    quantity: 5,
    foilQuantity: 2,
    holofoilQuantity: 1,
    card: card(),
    ...overrides,
  };
}

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing_1",
    userId: "user_1",
    cardId: "card_1",
    variant: "normal",
    desiredQuantity: 2,
    note: "Contact me",
    status: "active",
    card: card(),
    ...overrides,
  };
}

beforeEach(() => {
  resetPrismaMock();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("extras for sale private routes", () => {
  it("requires authentication", async () => {
    await request(app).get("/api/extras-for-sale").expect(401, { error: "Authentication required" });
  });

  it("lists owner listings with public quantity capped by current extras", async () => {
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([entry({ quantity: 5 })]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([listing({ desiredQuantity: 3 })]);

    await auth(request(app).get("/api/extras-for-sale"))
      .expect(200)
      .expect((res) => {
        expect(res.body.listings).toHaveLength(1);
        expect(res.body.listings[0]).toEqual(expect.objectContaining({
          id: "listing_1",
          variant: "normal",
          desiredQuantity: 3,
          publicQuantity: 1,
          referencePrice: 4,
        }));
      });
  });

  it("creates listings only from available extras", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ quantity: 5 }));
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);

    await auth(request(app).post("/api/extras-for-sale").send({ cardId: "card_1", variant: "normal", desiredQuantity: 2 }))
      .expect(400, { error: "Quantity exceeds current extra inventory" });

    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ quantity: 5 }));
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.extraForSaleListing.create.mockResolvedValueOnce(listing({ desiredQuantity: 1 }));

    await auth(request(app).post("/api/extras-for-sale").send({ cardId: "card_1", variant: "normal", desiredQuantity: 1, note: "Contact me" }))
      .expect(201)
      .expect((res) => expect(res.body.listing.publicQuantity).toBe(1));
  });

  it("list-all creates listings for unlisted extras and skips existing variants", async () => {
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ cardId: "card_1", quantity: 6, foilQuantity: 2, holofoilQuantity: 2 }),
      entry({ id: "entry_2", cardId: "card_2", quantity: 5, foilQuantity: 0, holofoilQuantity: 0 }),
    ]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      listing({ cardId: "card_1", variant: "normal", status: "active" }),
      listing({ id: "listing_2", cardId: "card_1", variant: "foil", status: "removed" }),
    ]);
    prismaMock.extraForSaleListing.create.mockResolvedValue(listing());

    await auth(request(app).post("/api/extras-for-sale/list-all"))
      .expect(200)
      .expect((res) => {
        expect(res.body.created).toBe(2);
        expect(res.body.skipped).toBe(2);
      });

    expect(prismaMock.extraForSaleListing.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.extraForSaleListing.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ cardId: "card_1", variant: "holofoil", desiredQuantity: 1, status: "active" }),
    }));
    expect(prismaMock.extraForSaleListing.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ cardId: "card_2", variant: "normal", desiredQuantity: 1, status: "active" }),
    }));
  });

  it("list-all respects per-card keep overrides and returns persistence failures", async () => {
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([
      { id: "override_1", userId: "user_1", cardId: "card_1", keepNormalQuantity: 8, keepFoilQuantity: null, keepHolofoilQuantity: null },
    ]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([entry({ quantity: 10, foilQuantity: 0, holofoilQuantity: 0 })]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([]);
    prismaMock.extraForSaleListing.create.mockResolvedValue(listing());

    await auth(request(app).post("/api/extras-for-sale/list-all"))
      .expect(200)
      .expect((res) => expect(res.body).toEqual({ created: 1, skipped: 0 }));

    expect(prismaMock.extraForSaleListing.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cardId: "card_1", variant: "normal", desiredQuantity: 2 }),
    }));

    prismaMock.userInventoryPolicy.upsert.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).post("/api/extras-for-sale/list-all")).expect(500, { error: "Internal server error" });
  });

  it("updates and removes listings scoped to the owner", async () => {
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(listing());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ quantity: 6 }));
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.extraForSaleListing.update.mockResolvedValueOnce(listing({ desiredQuantity: 2, note: null, status: "paused" }));

    await auth(request(app).patch("/api/extras-for-sale/listing_1").send({ desiredQuantity: 2, note: null, status: "paused" }))
      .expect(200)
      .expect((res) => expect(res.body.listing.status).toBe("paused"));

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(null);
    await auth(request(app).patch("/api/extras-for-sale/missing").send({ desiredQuantity: 1 }))
      .expect(404, { error: "Listing not found" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(listing());
    prismaMock.extraForSaleListing.update.mockResolvedValueOnce(listing({ status: "removed" }));
    await auth(request(app).delete("/api/extras-for-sale/listing_1")).expect(204);
  });

  it("validates listing inputs and returns route persistence failures", async () => {
    prismaMock.userInventoryPolicy.upsert.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/extras-for-sale")).expect(500, { error: "Internal server error" });

    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([entry({ foilQuantity: 2, holofoilQuantity: 2 })]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      listing({ id: "foil_listing", variant: "foil", desiredQuantity: 1 }),
      listing({ id: "holo_listing", variant: "holofoil", desiredQuantity: 1, status: "paused" }),
    ]);
    await auth(request(app).get("/api/extras-for-sale"))
      .expect(200)
      .expect((res) => {
        expect(res.body.listings[0].publicQuantity).toBe(1);
        expect(res.body.listings[1].publicQuantity).toBe(0);
      });

    await auth(request(app).post("/api/extras-for-sale").send({ variant: "normal", desiredQuantity: 1 }))
      .expect(400, { error: "cardId is required" });
    await auth(request(app).post("/api/extras-for-sale").send({ cardId: "card_1", variant: "bad", desiredQuantity: 1 }))
      .expect(400, { error: "variant must be normal, foil, or holofoil" });
    await auth(request(app).post("/api/extras-for-sale").send({ cardId: "card_1", variant: "normal", desiredQuantity: 0 }))
      .expect(400, { error: "desiredQuantity must be a positive integer" });

    prismaMock.card.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/extras-for-sale").send({ cardId: "missing", variant: "normal", desiredQuantity: 1 }))
      .expect(404, { error: "Card not found" });

    prismaMock.card.findUnique.mockResolvedValueOnce(card({ foilTypes: ["None"] }));
    await auth(request(app).post("/api/extras-for-sale").send({ cardId: "card_1", variant: "foil", desiredQuantity: 1 }))
      .expect(400, { error: "Variant is not available for this card" });

    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ quantity: 5 }));
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.extraForSaleListing.create.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).post("/api/extras-for-sale").send({ cardId: "card_1", variant: "normal", desiredQuantity: 1 }))
      .expect(500, { error: "Internal server error" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(listing());
    await auth(request(app).patch("/api/extras-for-sale/listing_1").send({ desiredQuantity: 0 }))
      .expect(400, { error: "desiredQuantity must be a positive integer" });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(listing());
    await auth(request(app).patch("/api/extras-for-sale/listing_1").send({ status: "sold" }))
      .expect(400, { error: "status must be active or paused" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(listing());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ quantity: 5 }));
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).patch("/api/extras-for-sale/listing_1").send({ desiredQuantity: 2 }))
      .expect(400, { error: "Quantity exceeds current extra inventory" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(listing());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ quantity: 6 }));
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.extraForSaleListing.update.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).patch("/api/extras-for-sale/listing_1").send({ desiredQuantity: 2 }))
      .expect(500, { error: "Internal server error" });

    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(null);
    await auth(request(app).delete("/api/extras-for-sale/missing")).expect(404, { error: "Listing not found" });
    prismaMock.extraForSaleListing.findFirst.mockResolvedValueOnce(listing());
    prismaMock.extraForSaleListing.update.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).delete("/api/extras-for-sale/listing_1")).expect(500, { error: "Internal server error" });
  });
});
