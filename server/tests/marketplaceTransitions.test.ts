import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adjustQuantity,
  autoTransferDue,
  cancelTransaction,
  confirmTransfer,
  disableUser,
  markSold,
  MarketplaceError,
} from "../src/services/marketplaceTransitions.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

function pendingTx(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function activeListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing1",
    sellerId: "seller1",
    cardId: "card1",
    variant: "normal",
    quantity: 5,
    priceMinor: 1200,
    currency: "USD",
    status: "ACTIVE",
    ...overrides,
  };
}

describe("marketplaceTransitions — markSold", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reserves q, snapshots price/currency, and decrements the listing atomically", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      status: "ACTIVE",
      listing: { cardId: "card1" },
    });
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 5 }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 10, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    prismaMock.marketplaceTransaction.create.mockResolvedValue({ id: "tx1" });
    prismaMock.marketplaceListing.update.mockResolvedValue({});

    const result = await markSold("seller1", "enq1", 3);

    expect(result).toEqual({
      transactionId: "tx1",
      quantity: 3,
      status: "PENDING_CONFIRMATION",
      listingQuantity: 2,
      listingStatus: "ACTIVE",
    });

    // Price/currency snapshot from the listing at mark-sold time (D8).
    expect(prismaMock.marketplaceTransaction.create).toHaveBeenCalledWith({
      data: {
        enquiryId: "enq1",
        listingId: "listing1",
        buyerId: "buyer1",
        sellerId: "seller1",
        cardId: "card1",
        variant: "normal",
        quantity: 3,
        priceMinor: 1200,
        currency: "USD",
        status: "PENDING_CONFIRMATION",
        soldAt: expect.any(Date),
      },
    });
    expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith({
      where: { id: "listing1" },
      data: { quantity: 2, status: "ACTIVE" },
    });

    // Lock (FOR UPDATE) precedes the transaction write.
    const lockOrder = prismaMock.$queryRaw.mock.invocationCallOrder[0];
    const createOrder = prismaMock.marketplaceTransaction.create.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(createOrder);
  });

  it("closes the listing when remaining hits 0", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      status: "ACTIVE",
      listing: { cardId: "card1" },
    });
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 3 }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 10, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    prismaMock.marketplaceTransaction.create.mockResolvedValue({ id: "tx1" });

    const result = await markSold("seller1", "enq1", 3);

    expect(result.listingQuantity).toBe(0);
    expect(result.listingStatus).toBe("CLOSED");
    expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith({
      where: { id: "listing1" },
      data: { quantity: 0, status: "CLOSED" },
    });
  });

  it("rejects q exceeding available inventory with a 409 and writes nothing (AC-14.2)", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      status: "ACTIVE",
      listing: { cardId: "card1" },
    });
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 5 }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ quantity: 1 }]); // reserved 1
    prismaMock.marketplaceListing.findMany.mockResolvedValue([{ quantity: 3 }]); // listed elsewhere 3

    await expect(markSold("seller1", "enq1", 2)).rejects.toMatchObject({
      status: 409,
      message: "Quantity exceeds available inventory",
    });
    expect(prismaMock.marketplaceTransaction.create).not.toHaveBeenCalled();
    expect(prismaMock.marketplaceListing.update).not.toHaveBeenCalled();
  });

  it("rejects q exceeding the remaining listing quantity with a 409", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      status: "ACTIVE",
      listing: { cardId: "card1" },
    });
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 2 }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 10, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);

    await expect(markSold("seller1", "enq1", 3)).rejects.toMatchObject({
      status: 409,
      message: "Quantity exceeds the remaining listing quantity",
    });
  });

  it("rejects q < 1 with a 409", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      status: "ACTIVE",
      listing: { cardId: "card1" },
    });
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing());

    await expect(markSold("seller1", "enq1", 0)).rejects.toMatchObject({
      status: 409,
      message: "Quantity must be at least 1",
    });
  });

  it("re-asserts that only the seller can mark sold (403)", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "someone-else",
      status: "ACTIVE",
      listing: { cardId: "card1" },
    });

    await expect(markSold("seller1", "enq1", 1)).rejects.toMatchObject({
      status: 403,
      message: "Only the seller can mark this enquiry sold",
    });
  });

  it("rejects marking sold on a non-ACTIVE enquiry (409)", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      status: "ARCHIVED",
      listing: { cardId: "card1" },
    });

    await expect(markSold("seller1", "enq1", 1)).rejects.toMatchObject({
      status: 409,
      message: "Enquiry is not active",
    });
  });
});

describe("marketplaceTransitions — adjustQuantity (AC-14.5)", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
  });

  it("re-validates against available and shifts the listing by the delta", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 2 }));
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 3 }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 10, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ quantity: 2 }]); // reserved incl. this
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.update.mockResolvedValue({});
    prismaMock.marketplaceTransaction.update.mockResolvedValue({});

    const result = await adjustQuantity("tx1", 4);

    expect(result).toEqual({ transactionId: "tx1", quantity: 4 });

    // delta = 4 − 2 = 2; listing 3 − 2 = 1 (still ACTIVE).
    expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith({
      where: { id: "listing1" },
      data: { quantity: 1, status: "ACTIVE" },
    });
    // soldAt untouched (A4) — only quantity changes.
    expect(prismaMock.marketplaceTransaction.update).toHaveBeenCalledWith({
      where: { id: "tx1" },
      data: { quantity: 4 },
    });
  });

  it("reopens a CLOSED listing when the quantity rises above 0", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 3 }));
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 0, status: "CLOSED" }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 10, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ quantity: 3 }]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.update.mockResolvedValue({});
    prismaMock.marketplaceTransaction.update.mockResolvedValue({});

    await adjustQuantity("tx1", 1);

    expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith({
      where: { id: "listing1" },
      data: { quantity: 2, status: "ACTIVE" },
    });
  });

  it("rejects q′ exceeding available (owned − reservedExclThis − listedElsewhere)", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 1 }));
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 5 }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 5, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ quantity: 1 }]); // reservedExclThis = 0
    prismaMock.marketplaceListing.findMany.mockResolvedValue([{ quantity: 3 }]); // listed elsewhere 3

    await expect(adjustQuantity("tx1", 3)).rejects.toMatchObject({
      status: 409,
      message: "Quantity adjustment would exceed available inventory",
    });
    expect(prismaMock.marketplaceTransaction.update).not.toHaveBeenCalled();
  });

  it("rejects an adjustment that would underflow the listing quantity", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 1 }));
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 2 }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 10, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ quantity: 1 }]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);

    // qPrime=5 → delta=4 > listing.quantity=2 → underflow.
    await expect(adjustQuantity("tx1", 5)).rejects.toMatchObject({
      status: 409,
      message: "Quantity adjustment would exceed the listing quantity",
    });
  });

  it("rejects adjusting a non-pending transaction", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ status: "COMPLETED" }));

    await expect(adjustQuantity("tx1", 1)).rejects.toMatchObject({
      status: 409,
      message: "Transaction is not pending confirmation",
    });
  });
});

describe("marketplaceTransitions — confirmTransfer (REQ-16/17, CAS)", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("atomically flips COMPLETED, decrements seller, increments buyer (AC-16.1)", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 2 }));
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.upsert.mockResolvedValue({});

    const result = await confirmTransfer("tx1", "BUYER_CONFIRM");

    expect(result).toEqual({ transactionId: "tx1", alreadyCompleted: false, status: "COMPLETED" });

    // CAS on status.
    expect(prismaMock.marketplaceTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: "tx1", status: "PENDING_CONFIRMATION" },
      data: { status: "COMPLETED", confirmedAt: expect.any(Date), completedCause: "BUYER_CONFIRM" },
    });

    // Seller decrement guarded against underflow.
    expect(prismaMock.inventoryEntry.updateMany).toHaveBeenCalledWith({
      where: { userId: "seller1", cardId: "card1", quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } },
    });

    // Buyer increment via upsert.
    expect(prismaMock.inventoryEntry.upsert).toHaveBeenCalledWith({
      where: { userId_cardId: { userId: "buyer1", cardId: "card1" } },
      create: { userId: "buyer1", cardId: "card1", quantity: 2, foilQuantity: 0, holofoilQuantity: 0 },
      update: { quantity: { increment: 2 } },
    });

    // Lock precedes the CAS.
    const lockOrder = prismaMock.$queryRaw.mock.invocationCallOrder[0];
    const casOrder = prismaMock.marketplaceTransaction.updateMany.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(casOrder);
  });

  it("maps a foil variant to the foilQuantity column on both sides", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ variant: "foil", quantity: 2 }));
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.upsert.mockResolvedValue({});

    await confirmTransfer("tx1", "BUYER_CONFIRM");

    expect(prismaMock.inventoryEntry.updateMany).toHaveBeenCalledWith({
      where: { userId: "seller1", cardId: "card1", foilQuantity: { gte: 2 } },
      data: { foilQuantity: { decrement: 2 } },
    });
    expect(prismaMock.inventoryEntry.upsert).toHaveBeenCalledWith({
      where: { userId_cardId: { userId: "buyer1", cardId: "card1" } },
      create: { userId: "buyer1", cardId: "card1", quantity: 0, foilQuantity: 2, holofoilQuantity: 0 },
      update: { foilQuantity: { increment: 2 } },
    });
  });

  it("double-confirm is an idempotent no-op (AC-16.2)", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 2 }));
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 0 });

    const result = await confirmTransfer("tx1", "BUYER_CONFIRM");

    expect(result).toEqual({ transactionId: "tx1", alreadyCompleted: true });
    expect(prismaMock.inventoryEntry.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.inventoryEntry.upsert).not.toHaveBeenCalled();
  });

  it("aborts on seller inventory underflow (defensive drift guard)", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 2 }));
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.updateMany.mockResolvedValue({ count: 0 });

    await expect(confirmTransfer("tx1", "BUYER_CONFIRM")).rejects.toThrow(
      "Seller inventory underflow"
    );
    expect(prismaMock.inventoryEntry.upsert).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("rejects an invalid completion cause", async () => {
    await expect(confirmTransfer("tx1", "MANUAL")).rejects.toMatchObject({
      status: 400,
      message: "Invalid completion cause",
    });
  });
});

describe("marketplaceTransitions — cancelTransaction (REQ-18)", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
  });

  it("releases the reservation and reopens a CLOSED listing (AC-18.2)", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(
      pendingTx({ quantity: 2 })
    );
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(
      activeListing({ quantity: 0, status: "CLOSED" })
    );
    prismaMock.marketplaceListing.update.mockResolvedValue({});

    const result = await cancelTransaction("tx1", "BUYER");

    expect(result).toEqual({ transactionId: "tx1", alreadyCancelled: false, status: "CANCELLED" });

    expect(prismaMock.marketplaceTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: "tx1", status: "PENDING_CONFIRMATION" },
      data: { status: "CANCELLED", cancelledBy: "BUYER" },
    });
    // 0 + 2 = 2 → reopen ACTIVE.
    expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith({
      where: { id: "listing1" },
      data: { quantity: 2, status: "ACTIVE" },
    });
  });

  it("cancelling a COMPLETED transaction is a no-op (AC-18.3)", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ status: "COMPLETED" }));
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 0 });

    const result = await cancelTransaction("tx1", "SELLER");

    expect(result).toEqual({ transactionId: "tx1", alreadyCancelled: true });
    expect(prismaMock.marketplaceListing.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid cancel actor", async () => {
    await expect(cancelTransaction("tx1", "ADMIN")).rejects.toMatchObject({
      status: 400,
      message: "Invalid cancel actor",
    });
  });
});

describe("marketplaceTransitions — autoTransferDue (REQ-17)", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("confirms due rows with AUTO_TRANSFER cause (AC-17.2)", async () => {
    const now = new Date("2026-11-15T00:00:00Z");
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ id: "tx1" }, { id: "tx2" }]);
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 1 }));
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.upsert.mockResolvedValue({});

    const result = await autoTransferDue(now);

    expect(result.due).toBe(2);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);

    // Selects PENDING rows with soldAt <= now − 30d (A4).
    expect(prismaMock.marketplaceTransaction.findMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING_CONFIRMATION",
        soldAt: { lte: new Date("2026-10-16T00:00:00Z") },
      },
      select: { id: true },
      orderBy: { soldAt: "asc" },
      take: 100,
    });

    // Each confirm uses the AUTO_TRANSFER cause.
    expect(prismaMock.marketplaceTransaction.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.marketplaceTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: "tx1", status: "PENDING_CONFIRMATION" },
      data: { status: "COMPLETED", confirmedAt: expect.any(Date), completedCause: "AUTO_TRANSFER" },
    });
  });

  it("is idempotent against an already-completed row", async () => {
    const now = new Date("2026-11-15T00:00:00Z");
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ id: "tx1" }]);
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 1 }));
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 0 });

    const result = await autoTransferDue(now);

    expect(result).toMatchObject({ due: 1, completed: 0, alreadyCompleted: 1, failed: 0 });
  });

  it("logs and continues past a per-item failure", async () => {
    const now = new Date("2026-11-15T00:00:00Z");
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ id: "tx1" }]);
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(null); // confirmTransfer → 404

    const result = await autoTransferDue(now);

    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([{ transactionId: "tx1", error: "Transaction not found" }]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("marketplaceTransitions — disableUser (REQ-24)", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
  });

  it("sets disabledAt and auto-cancels pending tx with SYSTEM actor (AC-24.1)", async () => {
    prismaMock.user.update.mockResolvedValue({ id: "user1" });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([
      { id: "tx1", sellerId: "user1", cardId: "card1" },
      { id: "tx2", sellerId: "seller2", cardId: "card2" }, // user1 is buyer
    ]);
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 1 });
    // Re-reads inside cancelPendingWithTx.
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 2 }));
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 1 }));
    prismaMock.marketplaceListing.update.mockResolvedValue({});

    const result = await disableUser("user1");

    expect(result).toEqual({ userId: "user1", cancelled: 2 });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { disabledAt: expect.any(Date) },
    });
    expect(prismaMock.marketplaceTransaction.findMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING_CONFIRMATION",
        OR: [{ buyerId: "user1" }, { sellerId: "user1" }],
      },
      select: { id: true, sellerId: true, cardId: true },
    });
    // Both cancelled with SYSTEM.
    expect(prismaMock.marketplaceTransaction.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.marketplaceTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: "tx2", status: "PENDING_CONFIRMATION" },
      data: { status: "CANCELLED", cancelledBy: "SYSTEM" },
    });
  });
});

describe("marketplaceTransitions — MarketplaceError", () => {
  it("carries an HTTP status for route mapping", () => {
    const err = new MarketplaceError(409, "Quantity exceeds available inventory");
    expect(err.status).toBe(409);
    expect(err.message).toBe("Quantity exceeds available inventory");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("marketplaceTransitions — remaining guard branches", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "entry1" }]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("markSold: 404 when the enquiry does not exist", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue(null);

    await expect(markSold("seller1", "enq1", 1)).rejects.toMatchObject({
      status: 404,
      message: "Enquiry not found",
    });
  });

  it("markSold: 404 when the listing vanished after the lock", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      status: "ACTIVE",
      listing: { cardId: "card1" },
    });
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(null);

    await expect(markSold("seller1", "enq1", 1)).rejects.toMatchObject({
      status: 404,
      message: "Listing not found",
    });
  });

  it("markSold: 409 when the listing is no longer ACTIVE", async () => {
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValue({
      id: "enq1",
      listingId: "listing1",
      buyerId: "buyer1",
      sellerId: "seller1",
      status: "ACTIVE",
      listing: { cardId: "card1" },
    });
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(
      activeListing({ status: "CLOSED" })
    );

    await expect(markSold("seller1", "enq1", 1)).rejects.toMatchObject({
      status: 409,
      message: "Listing is not active",
    });
  });

  it("adjustQuantity: 409 when q' < 1", async () => {
    await expect(adjustQuantity("tx1", 0)).rejects.toMatchObject({
      status: 409,
      message: "Quantity must be at least 1",
    });
  });

  it("adjustQuantity: 404 when the transaction does not exist", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(null);

    await expect(adjustQuantity("tx1", 2)).rejects.toMatchObject({
      status: 404,
      message: "Transaction not found",
    });
  });

  it("adjustQuantity: 404 when the listing does not exist", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 2 }));
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(null);

    await expect(adjustQuantity("tx1", 2)).rejects.toMatchObject({
      status: 404,
      message: "Listing not found",
    });
  });

  it("adjustQuantity: closes the listing when the adjustment drains it to 0", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ quantity: 2 }));
    prismaMock.marketplaceListing.findUnique.mockResolvedValue(activeListing({ quantity: 3 }));
    prismaMock.inventoryEntry.findFirst.mockResolvedValue({ quantity: 10, foilQuantity: 0, holofoilQuantity: 0 });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ quantity: 2 }]);
    prismaMock.marketplaceListing.findMany.mockResolvedValue([]);
    prismaMock.marketplaceListing.update.mockResolvedValue({});
    prismaMock.marketplaceTransaction.update.mockResolvedValue({});

    // delta = 5 − 2 = 3; listing 3 − 3 = 0 → CLOSED.
    await adjustQuantity("tx1", 5);

    expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith({
      where: { id: "listing1" },
      data: { quantity: 0, status: "CLOSED" },
    });
  });

  it("confirmTransfer: maps a holofoil variant to the holofoilQuantity column", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(pendingTx({ variant: "holofoil", quantity: 2 }));
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inventoryEntry.upsert.mockResolvedValue({});

    await confirmTransfer("tx1", "BUYER_CONFIRM");

    expect(prismaMock.inventoryEntry.updateMany).toHaveBeenCalledWith({
      where: { userId: "seller1", cardId: "card1", holofoilQuantity: { gte: 2 } },
      data: { holofoilQuantity: { decrement: 2 } },
    });
    expect(prismaMock.inventoryEntry.upsert).toHaveBeenCalledWith({
      where: { userId_cardId: { userId: "buyer1", cardId: "card1" } },
      create: { userId: "buyer1", cardId: "card1", quantity: 0, foilQuantity: 0, holofoilQuantity: 2 },
      update: { holofoilQuantity: { increment: 2 } },
    });
  });

  it("cancelTransaction: 404 when the transaction does not exist", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValue(null);

    await expect(cancelTransaction("tx1", "BUYER")).rejects.toMatchObject({
      status: 404,
      message: "Transaction not found",
    });
  });

  it("autoTransferDue: stringifies non-Error failures", async () => {
    const now = new Date("2026-11-15T00:00:00Z");
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([{ id: "tx1" }]);
    prismaMock.marketplaceTransaction.findUnique.mockRejectedValue("boom");

    const result = await autoTransferDue(now);

    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([{ transactionId: "tx1", error: "boom" }]);
  });

  it("disableUser: does not double-count an already-cancelled pending transaction", async () => {
    prismaMock.user.update.mockResolvedValue({ id: "user1" });
    prismaMock.marketplaceTransaction.findMany.mockResolvedValue([
      { id: "tx1", sellerId: "user1", cardId: "card1" },
    ]);
    // The CAS finds the row already CANCELLED, so no release is needed.
    prismaMock.marketplaceTransaction.updateMany.mockResolvedValue({ count: 0 });

    const result = await disableUser("user1");

    expect(result).toEqual({ userId: "user1", cancelled: 0 });
    expect(prismaMock.marketplaceListing.update).not.toHaveBeenCalled();
  });
});
