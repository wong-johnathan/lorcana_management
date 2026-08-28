import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const googleMocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(function OAuth2Client() {
    return { verifyIdToken: googleMocks.verifyIdToken };
  }),
}));

vi.mock("../src/services/analysis.js", () => ({
  analyzeCardMarket: vi.fn().mockResolvedValue('{"summary":"ok","fullAnalysis":"ok"}'),
}));

vi.mock("../src/services/cardSync.js", () => ({
  fetchAndSaveRemote: vi.fn(),
  seedFromLocal: vi.fn(),
  upsertCards: vi.fn(),
}));

vi.mock("../src/services/priceSync.js", () => ({
  fetchPriceGroups: vi.fn(),
  syncGroupPrices: vi.fn(),
}));

import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";
import { analyzeCardMarket } from "../src/services/analysis.js";
import { fetchAndSaveRemote, seedFromLocal, upsertCards } from "../src/services/cardSync.js";
import { fetchPriceGroups, syncGroupPrices } from "../src/services/priceSync.js";
import { resetSyncStatuses } from "../src/routes/sync.js";
import { compareInventoryEntryByCardIndex, compareNullableNumber } from "../src/routes/inventory.js";

const app = createApp();
const token = signToken({ userId: "user_1", username: "jw1005" });
const otherToken = signToken({ userId: "other", username: "alice" });

function auth(req: request.Test, value = token) {
  return req.set("Authorization", `Bearer ${value}`);
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
    tcgPlayerId: 100,
    cardTraderUrl: null,
    cardmarketUrl: null,
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
    quantity: 1,
    foilQuantity: 2,
    holofoilQuantity: 3,
    card: card(),
    ...overrides,
  };
}

beforeEach(() => {
  resetPrismaMock();
  resetSyncStatuses();
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  googleMocks.verifyIdToken.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(global, "setTimeout").mockImplementation((handler: TimerHandler) => {
    if (typeof handler === "function") handler();
    return 0 as any;
  });
});

describe("health and auth routes", () => {
  it("returns health status", async () => {
    await request(app).get("/api/health").expect(200, { status: "ok" });
  });

  it("reports registration config from REGISTER env", async () => {
    const old = process.env.REGISTER;
    const oldGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.REGISTER = "false";
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    await request(app).get("/api/auth/config").expect(200, { registrationEnabled: false, googleClientId: "google-client-id" });

    delete process.env.GOOGLE_CLIENT_ID;
    await request(app).get("/api/auth/config").expect(200, { registrationEnabled: false, googleClientId: null });

    process.env.REGISTER = old;
    process.env.GOOGLE_CLIENT_ID = oldGoogleClientId;
  });

  it("registers users, lowercases usernames, and rejects invalid registration states", async () => {
    let old = process.env.REGISTER;
    process.env.REGISTER = "false";
    await request(app).post("/api/auth/register").send({ username: "JW", password: "secret1" }).expect(403, { error: "Registration is disabled" });
    process.env.REGISTER = old;

    await request(app).post("/api/auth/register").send({ username: "JW" }).expect(400, { error: "Username and password required" });
    await request(app).post("/api/auth/register").send({ username: "JW", password: "123" }).expect(400, { error: "Password must be at least 6 characters" });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "existing" });
    await request(app).post("/api/auth/register").send({ username: "JW", password: "secret1" }).expect(409, { error: "Username already taken" });

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValueOnce({ id: "user_1", username: "jw" });
    const res = await request(app).post("/api/auth/register").send({ username: "JW", password: "secret1" }).expect(201);
    expect(res.body.user).toEqual({ id: "user_1", username: "jw", email: null, emailVerifiedAt: null, authProvider: "LOCAL" });
    expect(res.body.token).toEqual(expect.any(String));
    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: { username: "jw", passwordHash: expect.any(String) } });
  });

  it("logs in with valid credentials and rejects missing, unknown, and bad-password users", async () => {
    await request(app).post("/api/auth/login").send({ username: "jw" }).expect(400, { error: "Username and password required" });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await request(app).post("/api/auth/login").send({ username: "jw", password: "secret1" }).expect(401, { error: "Invalid username or password" });

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u", username: "jw", passwordHash: "$2a$12$badbadbadbadbadbadbadeJdRNxHQSlgbdCJMo73BRRm2YU0OBK" });
    await request(app).post("/api/auth/login").send({ username: "jw", password: "wrong" }).expect(401, { error: "Invalid username or password" });

    const bcrypt = await import("bcryptjs");
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "google_user", username: "google", passwordHash: null });
    await request(app).post("/api/auth/login").send({ username: "google", password: "secret1" }).expect(401, { error: "Invalid username or password" });

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u", username: "jw", passwordHash: await bcrypt.hash("secret1", 4) });
    const res = await request(app).post("/api/auth/login").send({ username: "JW", password: "secret1" }).expect(200);
    expect(res.body.user).toEqual({ id: "u", username: "jw", email: null, emailVerifiedAt: null, authProvider: "LOCAL" });
    expect(res.body.token).toEqual(expect.any(String));

    prismaMock.user.findUnique.mockRejectedValueOnce(new Error("db"));
    await request(app).post("/api/auth/login").send({ username: "jw", password: "secret1" }).expect(500, { error: "Internal server error" });
  });

  it("logs in with Google, links existing email users, and creates verified users", async () => {
    googleMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub", email: "JW@Example.com", email_verified: true, name: "John Wong" }),
    });

    await request(app).post("/api/auth/google").send({}).expect(400, { error: "Google credential is required" });

    const oldGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    await request(app).post("/api/auth/google").send({ credential: "id-token" }).expect(503, { error: "Google login is not configured" });
    process.env.GOOGLE_CLIENT_ID = oldGoogleClientId;

    googleMocks.verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: "google-sub", email: "jw@example.com", email_verified: false }),
    });
    await request(app).post("/api/auth/google").send({ credential: "id-token" }).expect(403, { error: "Google email is not verified" });

    googleMocks.verifyIdToken.mockRejectedValueOnce(new Error("bad token"));
    await request(app).post("/api/auth/google").send({ credential: "bad-token" }).expect(401, { error: "Invalid Google credential" });

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u1", username: "jw", email: "jw@example.com", emailNormalized: "jw@example.com", emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z"), authProvider: "GOOGLE" });
    const existingRes = await request(app).post("/api/auth/google").send({ credential: "id-token" }).expect(200);
    expect(existingRes.body.user).toEqual(expect.objectContaining({ id: "u1", username: "jw", email: "jw@example.com", authProvider: "GOOGLE" }));
    expect(googleMocks.verifyIdToken).toHaveBeenLastCalledWith({ idToken: "id-token", audience: "google-client-id" });

    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u2", username: "legacy", email: "jw@example.com", emailNormalized: "jw@example.com", emailVerifiedAt: null, authProvider: "LOCAL" });
    prismaMock.user.update.mockResolvedValueOnce({ id: "u2", username: "legacy", email: "JW@Example.com", emailNormalized: "jw@example.com", emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z"), authProvider: "GOOGLE" });
    const linkedRes = await request(app).post("/api/auth/google").send({ credential: "id-token" }).expect(200);
    expect(linkedRes.body.user).toEqual(expect.objectContaining({ id: "u2", username: "legacy", email: "JW@Example.com", authProvider: "GOOGLE" }));
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "u2" },
      data: expect.objectContaining({ googleSub: "google-sub", emailVerifiedAt: expect.any(Date), authProvider: "GOOGLE" }),
    }));

    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "collision" })
      .mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValueOnce({ id: "u3", username: "jw1", email: "JW@Example.com", emailNormalized: "jw@example.com", emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z"), authProvider: "GOOGLE" });
    const createdRes = await request(app).post("/api/auth/google").send({ credential: "id-token" }).expect(201);
    expect(createdRes.body.user).toEqual(expect.objectContaining({ id: "u3", username: "jw1", email: "JW@Example.com", authProvider: "GOOGLE" }));
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ username: "jw1", googleSub: "google-sub", emailNormalized: "jw@example.com", emailVerifiedAt: expect.any(Date), passwordHash: null }),
    }));

    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "collision" });
    prismaMock.user.create.mockResolvedValueOnce({ id: "u4", username: "jw-fallback", email: "JW@Example.com", emailNormalized: "jw@example.com", emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z"), authProvider: "GOOGLE" });
    await request(app).post("/api/auth/google").send({ credential: "id-token" }).expect(201);
    expect(prismaMock.user.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ username: expect.stringMatching(/^jw\d+$/) }),
    }));
  });
});

describe("cards routes", () => {
  it("lists cards with filters, pagination, price filter, and ownership filter", async () => {
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([{ cardId: "card_1" }]);
    prismaMock.card.findMany.mockResolvedValueOnce([card()]);
    prismaMock.card.count.mockResolvedValueOnce(1);

    const res = await auth(request(app).get("/api/cards")
      .query({ search: "Mickey", color: "Amber,Ruby", set: "The First Chapter", rarity: "Legendary", type: "Hero", character: "Mickey", cardType: "Character", ownership: "owned", analyzed: "yes", sort: "price_desc", priceVariant: "Foil", priceStatus: "priced", priceField: "lowPrice", page: "2", limit: "20" }))
      .expect(200);

    expect(res.body.pagination).toEqual({ page: 2, limit: 20, total: 1, totalPages: 1 });
    expect(prismaMock.card.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      where: expect.objectContaining({
        color: { in: ["Amber", "Ruby"] },
        setName: { in: ["The First Chapter"] },
        rarity: { in: ["Legendary"] },
        types: { hasSome: ["Hero"] },
        character: { contains: "Mickey", mode: "insensitive" },
        cardType: "Character",
        analysis: { status: "completed" },
        id: { in: ["card_1"] },
      }),
    }));
  });

  it("handles alternate card list filters and database failures", async () => {
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([{ cardId: "owned" }]);
    prismaMock.card.findMany.mockResolvedValueOnce([]);
    prismaMock.card.count.mockResolvedValueOnce(0);
    await auth(request(app).get("/api/cards").query({ ownership: "not_owned", analyzed: "no", priceVariant: "Foil", priceStatus: "missing", page: "0", limit: "999" }))
      .expect(200)
      .expect((res) => expect(res.body.pagination.limit).toBe(100));

    prismaMock.card.findMany.mockResolvedValueOnce([]);
    prismaMock.card.count.mockResolvedValueOnce(0);
    await request(app).get("/api/cards").set("Authorization", "Bearer bad-token").query({ ownership: "owned" }).expect(200);

    prismaMock.card.findMany.mockRejectedValueOnce(new Error("db"));
    await request(app).get("/api/cards").expect(500, { error: "Internal server error" });
  });

  it("returns filters sorted by set code and deduped subtypes", async () => {
    prismaMock.card.findMany
      .mockResolvedValueOnce([{ color: "Amber" }, { color: "Ruby" }])
      .mockResolvedValueOnce([{ setName: "Second", setCode: "SET2" }, { setName: "First", setCode: "SET1" }])
      .mockResolvedValueOnce([{ rarity: "Common" }])
      .mockResolvedValueOnce([{ cardType: "Character" }])
      .mockResolvedValueOnce([{ types: ["Hero", "Dreamborn"] }, { types: ["Hero"] }]);

    const res = await request(app).get("/api/cards/filters").expect(200);
    expect(res.body).toEqual({
      colors: ["Amber", "Ruby"],
      sets: ["First", "Second"],
      rarities: ["Common"],
      cardTypes: ["Character"],
      types: ["Dreamborn", "Hero"],
    });
  });

  it("returns filter failures as 500", async () => {
    prismaMock.card.findMany.mockRejectedValueOnce(new Error("db"));
    await request(app).get("/api/cards/filters").expect(500, { error: "Internal server error" });
  });

  it("calculates master-set estimates and missing price reasons", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce([
      card({ id: "normal", prices: [{ variant: "Normal", lowPrice: 1, midPrice: 2, highPrice: 3, marketPrice: 4 }] }),
      card({ id: "foil", rarity: "Common", prices: [{ variant: "Cold Foil", lowPrice: 5, midPrice: 6, highPrice: 7, marketPrice: 8 }] }),
      card({ id: "missing", tcgPlayerId: null, prices: [] }),
    ]);

    const res = await request(app).get("/api/cards/master-set/estimate").query({ setName: "The First Chapter", rarities: "Common,Legendary", variants: "Normal,Foil", priceField: "marketPrice" }).expect(200);
    expect(res.body.total).toBe(12);
    expect(res.body.pricedVariantCount).toBe(2);
    expect(res.body.missingVariantCount).toBeGreaterThan(0);
    expect(res.body.missing.some((m: any) => m.reason === "no_tcgplayer_id")).toBe(true);
  });

  it("covers master-set no-result and database failure paths", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce([]);
    await request(app).get("/api/cards/master-set/estimate").query({ setCode: "SET1" }).expect(404, { error: "No cards found for selected filters" });

    prismaMock.card.findMany.mockRejectedValueOnce(new Error("db"));
    await request(app).get("/api/cards/master-set/estimate").query({ setName: "The First Chapter" }).expect(500, { error: "Internal server error" });
  });

  it("rejects invalid master-set requests and returns card details/404", async () => {
    await request(app).get("/api/cards/master-set/estimate").expect(400, { error: "setName or setCode is required" });
    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    await request(app).get("/api/cards/card_1").expect(200).expect((res) => expect(res.body.id).toBe("card_1"));
    prismaMock.card.findUnique.mockResolvedValueOnce(null);
    await request(app).get("/api/cards/missing").expect(404, { error: "Card not found" });
  });

  it("serves analysis states and handles legacy markdown", async () => {
    prismaMock.cardAnalysis.findUnique.mockResolvedValueOnce(null);
    await request(app).get("/api/cards/card_1/analysis").expect(404, { error: "No analysis found" });

    prismaMock.cardAnalysis.findUnique.mockResolvedValueOnce({ status: "pending", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), analysis: "{}" });
    await request(app).get("/api/cards/card_1/analysis").expect(200).expect((res) => expect(res.body.status).toBe("pending"));

    prismaMock.cardAnalysis.findUnique.mockResolvedValueOnce({ status: "completed", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), analysis: "raw markdown" });
    await request(app).get("/api/cards/card_1/analysis").expect(200).expect((res) => expect(res.body.fullAnalysis).toBe("raw markdown"));
  });

  it("requires auth for analysis triggers and restricts batch analysis to admin", async () => {
    await request(app).post("/api/cards/card_1/analyze").expect(401);
    prismaMock.card.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/cards/missing/analyze")).expect(404, { error: "Card not found" });
    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.cardAnalysis.upsert.mockResolvedValueOnce({});
    await auth(request(app).post("/api/cards/card_1/analyze")).expect(200).expect((res) => expect(res.body.status).toBe("pending"));

    await auth(request(app).post("/api/cards/analyze-batch"), otherToken).expect(403, { error: "Forbidden" });
  });

  it("handles analysis pending, batch status, admin batch, and failures", async () => {
    await request(app).get("/api/cards/analyze-batch/status").expect(200).expect((res) => expect(res.body.status).toBe("idle"));

    prismaMock.card.findMany.mockResolvedValueOnce([]);
    await auth(request(app).post("/api/cards/analyze-batch")).expect(200, { status: "completed", message: "All cards already analyzed", total: 0 });

    prismaMock.card.findMany.mockResolvedValueOnce([card()]);
    prismaMock.cardAnalysis.upsert.mockResolvedValue({});
    prismaMock.cardAnalysis.update.mockResolvedValue({});
    await auth(request(app).post("/api/cards/analyze-batch")).expect(200).expect((res) => expect(res.body.total).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(analyzeCardMarket).toHaveBeenCalled();

    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.cardAnalysis.findUnique.mockResolvedValueOnce({ status: "pending" });
    await auth(request(app).post("/api/cards/card_1/analyze")).expect(409, { error: "Analysis already in progress" });

    prismaMock.cardAnalysis.findUnique.mockRejectedValueOnce(new Error("db"));
    await request(app).get("/api/cards/card_1/analysis").expect(500, { error: "Internal server error" });
  });
});

describe("inventory routes", () => {
  it("requires auth for inventory routes", async () => {
    await request(app).get("/api/inventory").expect(401, { error: "Authentication required" });
  });

  it("sorts inventory comparator fallback cases", () => {
    expect(compareNullableNumber(null, null)).toBe(0);
    expect(compareNullableNumber(null, 1)).toBe(1);
    expect(compareNullableNumber(1, null)).toBe(-1);
    expect(compareNullableNumber(1, 2)).toBe(-1);

    const first = entry({ card: card({ id: "first", setNumber: 1, collectorNumber: 1, cardNumber: "1/204", name: "Alpha" }) });
    const second = entry({ card: card({ id: "second", setNumber: 1, collectorNumber: 1, cardNumber: "2/204", name: "Beta" }) });
    const alpha = entry({ card: card({ id: "alpha", setNumber: 1, collectorNumber: 1, cardNumber: "1/204", name: "Alpha" }) });
    const beta = entry({ card: card({ id: "beta", setNumber: 1, collectorNumber: 1, cardNumber: "1/204", name: "Beta" }) });

    expect(compareInventoryEntryByCardIndex(first, second)).toBeLessThan(0);
    expect(compareInventoryEntryByCardIndex(alpha, beta)).toBeLessThan(0);
  });

  it("lists filtered inventory entries sorted by set and collector index", async () => {
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ id: "entry_b", card: card({ id: "b", setNumber: 2, collectorNumber: 1, cardNumber: "1/204", name: "Beta" }) }),
      entry({ id: "entry_a", card: card({ id: "a", setNumber: 1, collectorNumber: 2, cardNumber: "2/204", name: "Alpha" }) }),
    ]);
    const res = await auth(request(app).get("/api/inventory").query({ search: "Mickey", color: "Amber", set: "The First Chapter", rarity: "Legendary", type: "Hero", character: "Mickey" })).expect(200);
    expect(res.body.map((item: any) => item.card.id)).toEqual(["a", "b"]);
    expect(prismaMock.inventoryEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user_1", card: expect.any(Object) }),
      include: { card: { include: { prices: true } } },
    }));
  });

  it("adds inventory with validation and variant availability checks", async () => {
    await auth(request(app).post("/api/inventory").send({})).expect(400, { error: "cardId is required" });
    await auth(request(app).post("/api/inventory").send({ cardId: "card_1", quantity: -1 })).expect(400, { error: "Quantities must be non-negative integers" });
    prismaMock.card.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).post("/api/inventory").send({ cardId: "missing" })).expect(404, { error: "Card not found" });
    prismaMock.card.findUnique.mockResolvedValueOnce(card({ foilTypes: ["Lava"] }));
    await auth(request(app).post("/api/inventory").send({ cardId: "card_1", quantity: 1 })).expect(400, { error: "Normal is not available for this card" });

    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.inventoryEntry.upsert.mockResolvedValueOnce(entry());
    await auth(request(app).post("/api/inventory").send({ cardId: "card_1", quantity: 1, foilQuantity: 2, holofoilQuantity: 3 })).expect(201).expect((res) => expect(res.body.id).toBe("entry_1"));
  });

  it("grows active extras listing quantities when newly added inventory becomes extra", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ quantity: 6, foilQuantity: 1, holofoilQuantity: 1 }));
    prismaMock.inventoryEntry.upsert.mockResolvedValueOnce(entry({ quantity: 7, foilQuantity: 1, holofoilQuantity: 1 }));
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      { id: "listing_1", userId: "user_1", cardId: "card_1", variant: "normal", desiredQuantity: 2, status: "active" },
    ]);
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.extraForSaleListing.update.mockResolvedValueOnce({});

    await auth(request(app).post("/api/inventory").send({ cardId: "card_1", quantity: 1, foilQuantity: 0, holofoilQuantity: 0 }))
      .expect(201)
      .expect((res) => expect(res.body.quantity).toBe(7));

    expect(prismaMock.extraForSaleListing.update).toHaveBeenCalledWith({
      where: { id: "listing_1" },
      data: { desiredQuantity: { increment: 1 } },
    });
  });

  it("grows foil and holofoil listings on inventory updates and ignores invalid listing variants", async () => {
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ quantity: 4, foilQuantity: 1, holofoilQuantity: 1 }));
    prismaMock.inventoryEntry.update.mockResolvedValueOnce(entry({ quantity: 4, foilQuantity: 2, holofoilQuantity: 2 }));
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      { id: "foil_listing", userId: "user_1", cardId: "card_1", variant: "foil", desiredQuantity: 1, status: "active" },
      { id: "holo_listing", userId: "user_1", cardId: "card_1", variant: "holofoil", desiredQuantity: 1, status: "active" },
      { id: "bad_listing", userId: "user_1", cardId: "card_1", variant: "misprint", desiredQuantity: 1, status: "active" },
    ]);
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    prismaMock.extraForSaleListing.update.mockResolvedValue({});

    await auth(request(app).patch("/api/inventory/entry_1").send({ foilQuantity: 2, holofoilQuantity: 2 }))
      .expect(200)
      .expect((res) => expect(res.body.foilQuantity).toBe(2));

    expect(prismaMock.extraForSaleListing.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.extraForSaleListing.update).toHaveBeenNthCalledWith(1, {
      where: { id: "foil_listing" },
      data: { desiredQuantity: { increment: 1 } },
    });
    expect(prismaMock.extraForSaleListing.update).toHaveBeenNthCalledWith(2, {
      where: { id: "holo_listing" },
      data: { desiredQuantity: { increment: 1 } },
    });
  });

  it("updates and deletes inventory entries with ownership checks", async () => {
    await auth(request(app).patch("/api/inventory/entry_1").send({ quantity: "1" })).expect(400, { error: "Quantities must be non-negative integers" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(null);
    await auth(request(app).patch("/api/inventory/missing").send({ quantity: 1 })).expect(404, { error: "Inventory entry not found" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry({ card: card({ foilTypes: ["None"] }) }));
    await auth(request(app).patch("/api/inventory/entry_1").send({ foilQuantity: 1 })).expect(400, { error: "Foil is not available for this card" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry());
    prismaMock.inventoryEntry.update.mockResolvedValueOnce(entry({ quantity: 5 }));
    await auth(request(app).patch("/api/inventory/entry_1").send({ quantity: 5 })).expect(200).expect((res) => expect(res.body.quantity).toBe(5));

    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(null);
    await auth(request(app).delete("/api/inventory/missing")).expect(404, { error: "Inventory entry not found" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry());
    prismaMock.inventoryEntry.delete.mockResolvedValueOnce({});
    await auth(request(app).delete("/api/inventory/entry_1")).expect(204);
  });

  it("calculates inventory stats, wipe, CSV, and decklist outputs", async () => {
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ quantity: 1, foilQuantity: 1, holofoilQuantity: 1, card: { setName: "Set A", prices: [{ variant: "Normal", marketPrice: 2 }, { variant: "Cold Foil", marketPrice: 3 }, { variant: "Holofoil", marketPrice: 4 }] } }),
      entry({ id: "entry_2", quantity: 2, foilQuantity: 0, holofoilQuantity: 0, card: { setName: "Set B", prices: [] } }),
    ]);
    prismaMock.card.groupBy.mockResolvedValueOnce([{ setName: "Set A", _count: 10 }, { setName: "Set B", _count: 20 }]);
    const stats = await auth(request(app).get("/api/inventory/stats")).expect(200);
    expect(stats.body).toEqual({ totalUnique: 2, totalCards: 5, totalValue: 9, missingPriceCount: 2, setBreakdown: [{ setName: "Set A", owned: 1, total: 10 }, { setName: "Set B", owned: 1, total: 20 }] });

    prismaMock.inventoryEntry.deleteMany.mockResolvedValueOnce({ count: 2 });
    await auth(request(app).delete("/api/inventory")).expect(200, { deleted: 2 });

    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([entry()]);
    await auth(request(app).get("/api/inventory/export/csv")).expect(200).expect("Content-Type", /text\/csv/).expect((res) => {
      expect(res.text).toContain("SET1,1,normal,1");
      expect(res.text).toContain("SET1,1,foil,2");
      expect(res.text).toContain("SET1,1,holofoil,3");
    });

    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([entry()]);
    await auth(request(app).get("/api/inventory/export/decklist")).expect(200).expect("Content-Type", /text\/plain/).expect((res) => expect(res.text).toContain("6 Mickey Mouse - Brave Little Tailor"));
  });

  it("gets and updates extras keep policy with safe defaults", async () => {
    prismaMock.userInventoryPolicy.upsert
      .mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true })
      .mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 8, keepFoilQuantity: 2, keepHolofoilQuantity: 0, autoSuggestExtras: false });

    await auth(request(app).get("/api/inventory/policy"))
      .expect(200)
      .expect((res) => expect(res.body).toEqual({ keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true }));

    await auth(request(app).patch("/api/inventory/policy").send({ keepNormalQuantity: 8, keepFoilQuantity: 2, keepHolofoilQuantity: 0, autoSuggestExtras: false }))
      .expect(200)
      .expect((res) => expect(res.body.keepNormalQuantity).toBe(8));

    await auth(request(app).patch("/api/inventory/policy").send({ keepNormalQuantity: -1 }))
      .expect(400, { error: "Keep quantities must be non-negative integers" });
  });

  it("manages per-card retention overrides scoped to the owner", async () => {
    prismaMock.cardRetentionOverride.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).get("/api/inventory/retention/card_1"))
      .expect(200, { override: null });

    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.cardRetentionOverride.upsert.mockResolvedValueOnce({
      id: "override_1",
      userId: "user_1",
      cardId: "card_1",
      keepNormalQuantity: 8,
      keepFoilQuantity: 1,
      keepHolofoilQuantity: 0,
    });
    await auth(request(app).put("/api/inventory/retention/card_1").send({ keepNormalQuantity: 8, keepFoilQuantity: 1, keepHolofoilQuantity: 0 }))
      .expect(200)
      .expect((res) => expect(res.body.override.keepNormalQuantity).toBe(8));

    await auth(request(app).put("/api/inventory/retention/card_1").send({ keepNormalQuantity: "8" }))
      .expect(400, { error: "Keep quantities must be non-negative integers or null" });

    prismaMock.cardRetentionOverride.deleteMany.mockResolvedValueOnce({ count: 1 });
    await auth(request(app).delete("/api/inventory/retention/card_1")).expect(204);
  });

  it("lists per-card retention overrides with card details", async () => {
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([
      { id: "ro_1", userId: "user_1", cardId: "card_1", card: card(), keepNormalQuantity: 8, keepFoilQuantity: null, keepHolofoilQuantity: 0 },
    ]);
    await auth(request(app).get("/api/inventory/retention"))
      .expect(200)
      .expect((res) => {
        expect(res.body.overrides).toHaveLength(1);
        expect(res.body.overrides[0].cardId).toBe("card_1");
        expect(res.body.overrides[0].card.name).toBe("Mickey Mouse");
        expect(res.body.overrides[0].keepNormalQuantity).toBe(8);
        expect(res.body.overrides[0].keepFoilQuantity).toBeNull();
        expect(res.body.overrides[0].keepHolofoilQuantity).toBe(0);
      });
  });

  it("returns 500 when listing retention overrides fails", async () => {
    prismaMock.cardRetentionOverride.findMany.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/inventory/retention")).expect(500, { error: "Internal server error" });
  });

  it("returns computed private extras with per-card overrides, listings, and reference prices", async () => {
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([
      { id: "override_1", userId: "user_1", cardId: "card_1", keepNormalQuantity: 8, keepFoilQuantity: null, keepHolofoilQuantity: 0 },
    ]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      { id: "listing_1", userId: "user_1", cardId: "card_1", variant: "normal", desiredQuantity: 1, status: "active" },
    ]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ quantity: 10, foilQuantity: 2, holofoilQuantity: 1 }),
    ]);

    await auth(request(app).get("/api/inventory/extras"))
      .expect(200)
      .expect((res) => {
        expect(res.body.policy).toEqual({ keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
        expect(res.body.cards).toHaveLength(1);
        expect(res.body.cards[0]).toEqual(expect.objectContaining({
          card: expect.objectContaining({ id: "card_1" }),
          owned: { quantity: 10, foilQuantity: 2, holofoilQuantity: 1 },
          keep: { quantity: 8, foilQuantity: 1, holofoilQuantity: 0 },
          extras: { quantity: 2, foilQuantity: 1, holofoilQuantity: 1 },
          activeListings: { quantity: 2, foilQuantity: 0, holofoilQuantity: 0 },
          availableToList: { quantity: 0, foilQuantity: 1, holofoilQuantity: 1 },
          referencePrices: { normal: 4, foil: 8, holofoil: 8 },
        }));
      });
  });

  it("does not suggest cards when every extra variant is already listed", async () => {
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      { id: "listing_1", userId: "user_1", cardId: "card_1", variant: "normal", desiredQuantity: 2, status: "active" },
    ]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ quantity: 7, foilQuantity: 1, holofoilQuantity: 1 }),
    ]);

    await auth(request(app).get("/api/inventory/extras"))
      .expect(200)
      .expect((res) => expect(res.body.cards).toEqual([]));
  });

  it("sorts suggested extras by card index", async () => {
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ id: "entry_late", cardId: "card_late", quantity: 5, card: card({ id: "card_late", setNumber: 2, collectorNumber: 1, cardNumber: "1/204", name: "Late" }) }),
      entry({ id: "entry_early", cardId: "card_early", quantity: 5, card: card({ id: "card_early", setNumber: 1, collectorNumber: 2, cardNumber: "2/204", name: "Early" }) }),
    ]);

    await auth(request(app).get("/api/inventory/extras"))
      .expect(200)
      .expect((res) => expect(res.body.cards.map((item: { card: { id: string } }) => item.card.id)).toEqual(["card_early", "card_late"]));
  });

  it("covers extras policy, retention, and computed extras error/edge cases", async () => {
    prismaMock.userInventoryPolicy.upsert.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/inventory/policy")).expect(500, { error: "Internal server error" });

    await auth(request(app).patch("/api/inventory/policy").send({ autoSuggestExtras: "yes" }))
      .expect(400, { error: "autoSuggestExtras must be a boolean" });

    prismaMock.userInventoryPolicy.upsert.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).patch("/api/inventory/policy").send({ keepFoilQuantity: 2 }))
      .expect(500, { error: "Internal server error" });

    prismaMock.cardRetentionOverride.findUnique.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/inventory/retention/card_1")).expect(500, { error: "Internal server error" });

    prismaMock.card.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).put("/api/inventory/retention/missing").send({ keepNormalQuantity: null }))
      .expect(404, { error: "Card not found" });

    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.cardRetentionOverride.upsert.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).put("/api/inventory/retention/card_1").send({ keepNormalQuantity: 1 }))
      .expect(500, { error: "Internal server error" });

    prismaMock.cardRetentionOverride.deleteMany.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).delete("/api/inventory/retention/card_1")).expect(500, { error: "Internal server error" });

    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/inventory/extras")).expect(500, { error: "Internal server error" });

    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      { id: "listing_foil", userId: "user_1", cardId: "card_1", variant: "foil", desiredQuantity: 1, status: "active" },
      { id: "listing_holo", userId: "user_1", cardId: "card_1", variant: "holofoil", desiredQuantity: 1, status: "active" },
    ]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ quantity: 4, foilQuantity: 1, holofoilQuantity: 1 }),
    ]);
    await auth(request(app).get("/api/inventory/extras"))
      .expect(200)
      .expect((res) => expect(res.body.cards).toEqual([]));
  });

  it("returns 500 for inventory route persistence failures", async () => {
    prismaMock.inventoryEntry.findMany.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/inventory")).expect(500, { error: "Internal server error" });
    prismaMock.inventoryEntry.findMany.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/inventory/stats")).expect(500, { error: "Internal server error" });
    prismaMock.inventoryEntry.deleteMany.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).delete("/api/inventory")).expect(500, { error: "Internal server error" });
    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    prismaMock.inventoryEntry.upsert.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).post("/api/inventory").send({ cardId: "card_1" })).expect(500, { error: "Internal server error" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry());
    prismaMock.inventoryEntry.update.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).patch("/api/inventory/entry_1").send({ quantity: 1 })).expect(500, { error: "Internal server error" });
    prismaMock.inventoryEntry.findFirst.mockResolvedValueOnce(entry());
    prismaMock.inventoryEntry.delete.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).delete("/api/inventory/entry_1")).expect(500, { error: "Internal server error" });
  });
});

describe("settings, public collection, and sync routes", () => {
  it("gets and updates public collection settings", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", publicEnabled: true });
    const getRes = await auth(request(app).get("/api/settings/profile")).expect(200);
    expect(getRes.body.publicEnabled).toBe(true);
    expect(getRes.body.publicUrl).toContain("/collection/user_1");

    prismaMock.user.update.mockResolvedValueOnce({ id: "user_1", publicEnabled: false });
    await auth(request(app).patch("/api/settings/profile").send({ publicEnabled: false })).expect(200).expect((res) => expect(res.body.publicEnabled).toBe(false));
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", emailVerifiedAt: null });
    await auth(request(app).patch("/api/settings/profile").send({ publicEnabled: true })).expect(403, { error: "Verified email required" });
    await auth(request(app).patch("/api/settings/profile").send({ publicEnabled: "yes" })).expect(400, { error: "publicEnabled (boolean) is required" });

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).get("/api/settings/profile")).expect(404, { error: "User not found" });
    prismaMock.user.findUnique.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/settings/profile")).expect(500, { error: "Internal server error" });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z") });
    prismaMock.user.update.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).patch("/api/settings/profile").send({ publicEnabled: true })).expect(500, { error: "Internal server error" });
  });

  it("returns 404 for private collections and public read-only collection stats when enabled", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", username: "jw", publicEnabled: false });
    await request(app).get("/api/public/collection/user_1").expect(404, { error: "Collection not found" });

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", username: "jw", publicEnabled: true });
    prismaMock.inventoryEntry.findMany
      .mockResolvedValueOnce([
        entry({ quantity: 1, foilQuantity: 0, holofoilQuantity: 0, card: card({ id: "b", setNumber: 2, collectorNumber: 1, prices: [{ variant: "Normal", marketPrice: 2 }] }) }),
        entry({ id: "entry_2", quantity: 1, foilQuantity: 1, holofoilQuantity: 0, card: card({ id: "a", setNumber: 1, collectorNumber: 2, prices: [{ variant: "Normal", marketPrice: 3 }, { variant: "Cold Foil", marketPrice: 4 }] }) }),
      ])
      .mockResolvedValueOnce([
        entry({ quantity: 1, foilQuantity: 0, holofoilQuantity: 0, card: card({ id: "b", setName: "Filtered Set", setNumber: 2, collectorNumber: 1, prices: [{ variant: "Normal", marketPrice: 2 }] }) }),
        entry({ id: "entry_2", quantity: 1, foilQuantity: 1, holofoilQuantity: 0, card: card({ id: "a", setName: "Filtered Set", setNumber: 1, collectorNumber: 2, prices: [{ variant: "Normal", marketPrice: 3 }, { variant: "Cold Foil", marketPrice: 4 }] }) }),
        entry({ id: "entry_3", quantity: 4, foilQuantity: 0, holofoilQuantity: 0, card: card({ id: "c", setName: "Unfiltered Set", setNumber: 3, collectorNumber: 1, prices: [{ variant: "Normal", marketPrice: 10 }] }) }),
      ]);
    prismaMock.card.groupBy.mockResolvedValueOnce([
      { setName: "Filtered Set", setNumber: 1, _count: 2 },
      { setName: "Unfiltered Set", setNumber: 3, _count: 1 },
    ]);
    const res = await request(app).get("/api/public/collection/user_1").query({ search: "Mickey", color: "Amber", set: "The First Chapter", rarity: "Legendary", type: "Hero", character: "Mickey" }).expect(200);
    expect(res.body.user).toEqual({ id: "user_1", username: "jw" });
    expect(res.body.cards.map((c: any) => c.card.id)).toEqual(["a", "b"]);
    expect(res.body.stats.totalValue).toBe(49);
    expect(res.body.stats.totalCards).toBe(7);
    expect(res.body.stats.setBreakdown).toEqual([
      { setName: "Filtered Set", owned: 2, total: 2 },
      { setName: "Unfiltered Set", owned: 1, total: 1 },
    ]);
    expect(prismaMock.inventoryEntry.findMany).toHaveBeenNthCalledWith(2, {
      where: { userId: "user_1" },
      include: { card: { include: { prices: true } } },
    });

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", username: "jw", publicEnabled: true });
    prismaMock.inventoryEntry.findMany.mockRejectedValueOnce(new Error("db"));
    await request(app).get("/api/public/collection/user_1").expect(500, { error: "Internal server error" });
  });



  it("sorts public cards by fallback keys and counts missing variant prices", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", username: "jw", publicEnabled: true });
    const publicEntries = [
      entry({ id: "e1", quantity: 1, foilQuantity: 1, holofoilQuantity: 1, card: card({ id: "z", setNumber: 1, collectorNumber: 1, cardNumber: "2/204", name: "Zed", prices: [] }) }),
      entry({ id: "e2", quantity: 1, foilQuantity: 0, holofoilQuantity: 0, card: card({ id: "a", setNumber: 1, collectorNumber: 1, cardNumber: "1/204", name: "Alpha", prices: [{ variant: "Normal", marketPrice: 1 }] }) }),
      entry({ id: "e3", quantity: 1, foilQuantity: 0, holofoilQuantity: 0, card: card({ id: "b", setNumber: 1, collectorNumber: 1, cardNumber: "1/204", name: "Beta", prices: [{ variant: "Normal", marketPrice: 2 }] }) }),
    ];
    prismaMock.inventoryEntry.findMany
      .mockResolvedValueOnce(publicEntries)
      .mockResolvedValueOnce(publicEntries);
    prismaMock.card.groupBy.mockResolvedValueOnce([{ setName: "The First Chapter", setNumber: 1, _count: 3 }]);
    const res = await request(app).get("/api/public/collection/user_1").expect(200);
    expect(res.body.cards.map((c: any) => c.card.id)).toEqual(["a", "b", "z"]);
    expect(res.body.stats.missingPriceCount).toBe(3);
    expect(res.body.stats.totalValue).toBe(3);
  });

  it("returns public extras for sale only when collection is public and listing remains extra", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", username: "jw", publicEnabled: false });
    await request(app).get("/api/public/collection/user_1/extras").expect(404, { error: "Collection not found" });

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user_1",
      username: "jw",
      publicEnabled: true,
      profile: { telegram: "john", telegramVisible: true, email: "private@example.com", emailVisible: false },
      references: [{ id: "ref_1", name: "Alice", description: "Trade ref", contactInfo: "@alice", visible: true }],
    });
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([{ id: "override_1", userId: "user_1", cardId: "card_1", keepNormalQuantity: 0, keepFoilQuantity: null, keepHolofoilQuantity: null }]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ quantity: 2, foilQuantity: 1, holofoilQuantity: 0 }),
    ]);
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      { id: "listing_1", userId: "user_1", cardId: "card_1", variant: "normal", desiredQuantity: 5, note: "Meet near MRT", customPrice: 18, customPriceCurrency: "SGD", status: "active", card: card() },
      { id: "listing_2", userId: "user_1", cardId: "card_1", variant: "foil", desiredQuantity: 1, note: null, status: "active", card: card() },
    ]);

    await request(app).get("/api/public/collection/user_1/extras")
      .expect(200)
      .expect((res) => {
        expect(res.body.user).toEqual({ id: "user_1", username: "jw" });
        expect(res.body.profile).toEqual({ telegram: "john", references: [{ id: "ref_1", name: "Alice", description: "Trade ref", contactInfo: "@alice" }] });
        expect(res.body.listings).toHaveLength(1);
        expect(res.body.listings[0]).toEqual(expect.objectContaining({
          id: "listing_1",
          variant: "normal",
          quantity: 2,
          referencePrice: 4,
          referencePriceCurrency: "USD",
          customPrice: 18,
          customPriceCurrency: "SGD",
          note: "Meet near MRT",
        }));
      });
  });

  it("sorts public extras for sale by card index", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", username: "jw", publicEnabled: true, profile: null, references: [] });
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      { id: "listing_late", userId: "user_1", cardId: "card_late", variant: "normal", desiredQuantity: 1, note: null, status: "active", card: card({ id: "card_late", setNumber: 2, collectorNumber: 1, cardNumber: "1/204", name: "Late" }) },
      { id: "listing_early", userId: "user_1", cardId: "card_early", variant: "normal", desiredQuantity: 1, note: null, status: "active", card: card({ id: "card_early", setNumber: 1, collectorNumber: 2, cardNumber: "2/204", name: "Early" }) },
    ]);
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce({ id: "policy_1", userId: "user_1", keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true });
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry({ id: "entry_late", cardId: "card_late", quantity: 5 }),
      entry({ id: "entry_early", cardId: "card_early", quantity: 5 }),
    ]);

    await request(app).get("/api/public/collection/user_1/extras")
      .expect(200)
      .expect((res) => expect(res.body.listings.map((item: { id: string }) => item.id)).toEqual(["listing_early", "listing_late"]));
  });

  it("hides public extras with invalid variants/no current extras and returns persistence errors", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user_1",
      username: "jw",
      publicEnabled: true,
      profile: null,
      references: [],
    });
    prismaMock.extraForSaleListing.findMany.mockResolvedValueOnce([
      { id: "listing_bad", userId: "user_1", cardId: "card_1", variant: "misprint", desiredQuantity: 1, note: null, status: "active", card: card() },
      { id: "listing_empty", userId: "user_1", cardId: "card_2", variant: "holofoil", desiredQuantity: 1, note: null, status: "active", card: card({ id: "card_2", prices: [{ variant: "Holofoil", marketPrice: 10 }] }) },
    ]);
    prismaMock.userInventoryPolicy.findUnique.mockResolvedValueOnce(null);
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([]);

    await request(app).get("/api/public/collection/user_1/extras")
      .expect(200)
      .expect((res) => expect(res.body.listings).toEqual([]));

    prismaMock.user.findUnique.mockRejectedValueOnce(new Error("db down"));
    await request(app).get("/api/public/collection/user_1/extras").expect(500, { error: "Internal server error" });
  });

  it("exposes sync status and starts refresh/price sync with auth", async () => {
    await request(app).get("/api/sync/refresh/status").expect(401);
    await auth(request(app).get("/api/sync/refresh/status")).expect(200).expect((res) => expect(res.body.status).toMatch(/idle|running|completed|error/));
    vi.mocked(fetchAndSaveRemote).mockResolvedValueOnce({ cards: [card() as any], sets: {} });
    vi.mocked(upsertCards).mockResolvedValueOnce({ seeded: 1, failed: 0 });
    await auth(request(app).post("/api/sync/refresh")).expect(200).expect((res) => expect(res.body.total).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    vi.mocked(seedFromLocal).mockResolvedValueOnce({ seeded: 2, failed: 1 });
    await auth(request(app).post("/api/sync/seed")).expect(200).expect((res) => expect(res.body.seeded).toBe(2));

    vi.mocked(fetchPriceGroups).mockResolvedValueOnce([{ groupId: 7, name: "Set 7" }]);
    vi.mocked(syncGroupPrices).mockResolvedValueOnce({ groups: 1, matched: 1, unmatched: 0 });
    await auth(request(app).post("/api/sync/prices")).expect(200).expect((res) => expect(res.body.total).toBe(1));
    await auth(request(app).get("/api/sync/prices/status")).expect(200);
  });

  it("returns sync conflicts and fetch errors", async () => {
    vi.mocked(fetchAndSaveRemote).mockResolvedValueOnce({ cards: [card() as any], sets: {} });
    vi.mocked(upsertCards).mockImplementationOnce(() => new Promise(() => undefined));
    await auth(request(app).post("/api/sync/refresh")).expect(200);
    await auth(request(app).post("/api/sync/refresh")).expect(409);

    resetSyncStatuses();
    vi.mocked(fetchAndSaveRemote).mockRejectedValueOnce(new Error("remote"));
    await auth(request(app).post("/api/sync/refresh")).expect(500, { error: "Failed to fetch card database" });
    vi.mocked(seedFromLocal).mockRejectedValueOnce(new Error("disk"));
    await auth(request(app).post("/api/sync/seed")).expect(500, { error: "Failed to seed card database" });

    vi.mocked(fetchPriceGroups).mockRejectedValueOnce(new Error("remote"));
    await auth(request(app).post("/api/sync/prices")).expect(500, { error: "Failed to fetch price groups" });
  });
});
