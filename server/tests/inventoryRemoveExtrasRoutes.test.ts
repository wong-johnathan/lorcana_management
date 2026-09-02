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

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry_1",
    userId: "user_1",
    cardId: "card_1",
    quantity: 10,
    foilQuantity: 2,
    holofoilQuantity: 1,
    ...overrides,
  };
}

const policy = {
  id: "policy_1",
  userId: "user_1",
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
  autoSuggestExtras: true,
};

beforeEach(() => {
  resetPrismaMock();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("inventory remove-extras route", () => {
  it("requires authentication", async () => {
    await request(app).post("/api/inventory/remove-extras").expect(401, { error: "Authentication required" });
  });

  it("trims inventory to keep rules, respects overrides, deletes empty rows, and removes listings", async () => {
    prismaMock.userInventoryPolicy.upsert.mockResolvedValueOnce(policy);
    prismaMock.cardRetentionOverride.findMany.mockResolvedValueOnce([
      { id: "override_1", userId: "user_1", cardId: "card_2", keepNormalQuantity: 0, keepFoilQuantity: null, keepHolofoilQuantity: null },
    ]);
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([
      entry(),
      entry({ id: "entry_2", cardId: "card_2", quantity: 3, foilQuantity: 0, holofoilQuantity: 0 }),
      entry({ id: "entry_3", cardId: "card_3", quantity: 4, foilQuantity: 1, holofoilQuantity: 0 }),
    ]);
    prismaMock.inventoryEntry.update.mockResolvedValueOnce(entry({ quantity: 4, foilQuantity: 1, holofoilQuantity: 1 }));
    prismaMock.inventoryEntry.delete.mockResolvedValueOnce(entry({ id: "entry_2" }));
    prismaMock.extraForSaleListing.updateMany.mockResolvedValueOnce({ count: 3 });

    await auth(request(app).post("/api/inventory/remove-extras"))
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          updatedEntries: 1,
          deletedEntries: 1,
          removedCopies: { quantity: 9, foilQuantity: 1, holofoilQuantity: 0 },
          removedListings: 3,
        });
      });

    expect(prismaMock.inventoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry_1" },
      data: { quantity: 4, foilQuantity: 1, holofoilQuantity: 1 },
    });
    expect(prismaMock.inventoryEntry.delete).toHaveBeenCalledWith({ where: { id: "entry_2" } });
    expect(prismaMock.extraForSaleListing.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", status: { in: ["active", "paused"] } },
      data: { status: "removed" },
    });
  });

  it("blocks trimming extras while active reservations exist", async () => {
    prismaMock.marketplaceReservation.findMany.mockResolvedValueOnce([{ id: "reservation_1" }]);

    await auth(request(app).post("/api/inventory/remove-extras"))
      .expect(409, { error: "Active marketplace reservations must be resolved before changing reserved inventory" });

    expect(prismaMock.inventoryEntry.update).not.toHaveBeenCalled();
    expect(prismaMock.inventoryEntry.delete).not.toHaveBeenCalled();
    expect(prismaMock.extraForSaleListing.updateMany).not.toHaveBeenCalled();
  });

  it("returns persistence failures", async () => {
    prismaMock.userInventoryPolicy.upsert.mockRejectedValueOnce(new Error("db"));

    await auth(request(app).post("/api/inventory/remove-extras"))
      .expect(500, { error: "Internal server error" });
  });
});
