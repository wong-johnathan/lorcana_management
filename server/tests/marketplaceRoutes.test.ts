import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

const app = createApp();
const buyerToken = signToken({ userId: "buyer_1", username: "buyer" });

function auth(req: request.Test) {
  return req.set("Authorization", `Bearer ${buyerToken}`);
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
          fromPriceMinor: 18000,
          currency: "SGD",
        }));
        expect(res.body.results[0].offers[0]).toEqual(expect.objectContaining({
          listingId: "listing_1",
          seller: expect.objectContaining({ id: "seller_1", username: "seller", emailVerified: true }),
          condition: "NEAR_MINT",
          destinationCountries: ["MY"],
        }));
        expect(res.body.results[0].offers[0].seller).not.toHaveProperty("email");
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
});
