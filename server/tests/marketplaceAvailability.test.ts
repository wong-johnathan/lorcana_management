import { beforeEach, describe, expect, it } from "vitest";
import {
  availableCount,
  createListingLocked,
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

describe("marketplaceAvailability — createListingLocked (design §4.4, REQ-BULK-9)", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
  });

  const input = {
    sellerId: "seller1",
    cardId: "card1",
    variant: "normal",
    quantity: 2,
    priceMinor: 1200,
    currency: "USD",
    condition: null,
    location: "",
    note: null,
  };

  it("locks, checks availability, and returns { kind: 'created', listing }", async () => {
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.create.mockResolvedValue({ id: "new1", quantity: 2 });

    const result = await createListingLocked(tx, input);

    expect(result).toEqual({ kind: "created", listing: { id: "new1", quantity: 2 } });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    // No skip predicate when the flag is absent/false (single flow unchanged).
    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.marketplaceListing.create).toHaveBeenCalledWith({
      data: {
        sellerId: "seller1",
        cardId: "card1",
        variant: "normal",
        quantity: 2,
        priceMinor: 1200,
        currency: "USD",
        condition: null,
        location: "",
        note: null,
        status: "ACTIVE",
      },
      include: { card: true, photos: true },
    });
  });

  it("returns { kind: 'skipped' } without computing availability or writing", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValue([{ quantity: 3 }]);

    const result = await createListingLocked(tx, { ...input, skipIfAlreadyListed: true });

    expect(result).toEqual({ kind: "skipped" });
    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.inventoryEntry.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.marketplaceTransaction.findMany).not.toHaveBeenCalled();
    expect(prismaMock.marketplaceListing.create).not.toHaveBeenCalled();
  });

  it("returns { kind: 'exceeds-available' } without writing (AC-BULK-9.1)", async () => {
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 2, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([]);

    const result = await createListingLocked(tx, { ...input, quantity: 5 });

    expect(result).toEqual({ kind: "exceeds-available" });
    expect(prismaMock.marketplaceListing.create).not.toHaveBeenCalled();
  });

  it("checks the skip predicate before availability when the flag is true (PI-1 order)", async () => {
    // Nothing listed → 2 findMany calls (skip predicate, then availableCount).
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.create.mockResolvedValue({ id: "new2", quantity: 2 });

    const result = await createListingLocked(tx, { ...input, skipIfAlreadyListed: true });

    expect(result.kind).toBe("created");
    expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledTimes(2);
    // Both reads are the same hiddenAt-keyed predicate; neither filters status.
    for (const call of prismaMock.marketplaceListing.findMany.mock.calls) {
      expect(call[0].where).toEqual({ sellerId: "seller1", cardId: "card1", variant: "normal", hiddenAt: null });
    }
  });
});
