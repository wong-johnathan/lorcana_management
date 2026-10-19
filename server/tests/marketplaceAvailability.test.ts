import { beforeEach, describe, expect, it } from "vitest";
import {
  availableCount,
  listedElsewhereCount,
  lockInventoryEntry,
  ownedCount,
  reservedCount,
} from "../src/services/marketplaceAvailability.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

const tx = prismaMock as any;

describe("marketplaceAvailability — ownedCount (variant→column mapping)", () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it("reads the matching InventoryEntry column per variant", async () => {
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({
      quantity: 5,
      foilQuantity: 3,
      holofoilQuantity: 2,
    });

    expect(await ownedCount(tx, "seller1", "card1", "normal")).toBe(5);
    expect(await ownedCount(tx, "seller1", "card1", "foil")).toBe(3);
    expect(await ownedCount(tx, "seller1", "card1", "holofoil")).toBe(2);

    expect(prismaMock.inventoryEntry.findFirst).toHaveBeenCalledWith({
      where: { userId: "seller1", cardId: "card1" },
      select: { quantity: true, foilQuantity: true, holofoilQuantity: true },
    });
  });

  it("returns 0 when the seller has no InventoryEntry for the card", async () => {
    prismaMock.inventoryEntry.findFirst.mockResolvedValue(null);
    expect(await ownedCount(tx, "seller1", "card1", "normal")).toBe(0);
  });

  it("rejects an unknown variant via variantColumn", async () => {
    await expect(ownedCount(tx, "seller1", "card1", "chrome")).rejects.toThrow();
  });
});

describe("marketplaceAvailability — reservedCount", () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it("sums quantity over PENDING_CONFIRMATION transactions", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([
      { quantity: 2 },
      { quantity: 3 },
    ]);

    expect(await reservedCount(tx, "seller1", "card1", "normal")).toBe(5);

    expect(prismaMock.marketplaceTransaction.findMany).toHaveBeenCalledWith({
      where: { sellerId: "seller1", cardId: "card1", variant: "normal", status: "PENDING_CONFIRMATION" },
      select: { quantity: true },
    });
  });

  it("returns 0 when nothing is reserved", async () => {
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([]);
    expect(await reservedCount(tx, "seller1", "card1", "normal")).toBe(0);
  });
});

describe("marketplaceAvailability — listedElsewhereCount", () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it("sums quantity over the seller's other non-hidden listings", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValue([
      { quantity: 1 },
      { quantity: 2 },
    ]);

    expect(await listedElsewhereCount(tx, "seller1", "card1", "normal", "thisListing")).toBe(3);

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith({
      where: {
        sellerId: "seller1",
        cardId: "card1",
        variant: "normal",
        hiddenAt: null,
        id: { not: "thisListing" },
      },
      select: { quantity: true },
    });
  });

  it("omits the exclusion clause when no listing is excluded", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    await listedElsewhereCount(tx, "seller1", "card1", "normal");

    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith({
      where: { sellerId: "seller1", cardId: "card1", variant: "normal", hiddenAt: null },
      select: { quantity: true },
    });
  });
});

describe("marketplaceAvailability — availableCount (AC-4.3 / AC-4.4)", () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it("AC-4.3: owned=5, listed-elsewhere=3 → available 2", async () => {
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([{ quantity: 3 }]);

    expect(await availableCount(tx, "seller1", "card1", "normal")).toBe(2);
  });

  it("AC-4.4: owned=5, reserved=1, listed-elsewhere=0 → available 4", async () => {
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ quantity: 1 }]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);

    expect(await availableCount(tx, "seller1", "card1", "normal")).toBe(4);
  });

  it("never dips below zero signalling (math is plain subtraction)", async () => {
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 2, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ quantity: 1 }]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([{ quantity: 2 }]);

    expect(await availableCount(tx, "seller1", "card1", "normal")).toBe(-1);
  });
});

describe("marketplaceAvailability — lockInventoryEntry (design §6.1)", () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it("issues SELECT … FOR UPDATE on the seller's InventoryEntry row", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);

    const rows = await lockInventoryEntry(tx, "seller1", "card1");

    expect(rows).toEqual([{ id: "entry1" }]);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);

    // Tagged-template call: (strings, userId, cardId).
    const [strings, userId, cardId] = prismaMock.$queryRaw.mock.calls[0];
    const sql = strings.join("?");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain('"InventoryEntry"');
    expect(userId).toBe("seller1");
    expect(cardId).toBe("card1");
  });
});
