import { describe, expect, it } from "vitest";
import {
  calculateMarketplaceAvailability,
  sumActiveReservedQuantity,
} from "../src/services/marketplaceAvailability.js";
import {
  assertEnquiryTransition,
  assertReservationTransition,
  MarketplaceTransitionError,
} from "../src/services/marketplaceTransitions.js";

describe("marketplace availability foundation", () => {
  it("calculates physical, listable, and available quantities from extras and reservations", () => {
    expect(calculateMarketplaceAvailability({
      ownedQuantity: 7,
      keepQuantity: 4,
      desiredQuantity: 5,
      reservedQuantity: 2,
    })).toEqual({
      physicalExtra: 3,
      listableQuantity: 3,
      availableQuantity: 1,
    });
  });

  it("clamps marketplace availability when extras, desired quantity, or reservations are missing", () => {
    expect(calculateMarketplaceAvailability({
      ownedQuantity: 1,
      keepQuantity: 3,
      desiredQuantity: 5,
    })).toEqual({
      physicalExtra: 0,
      listableQuantity: 0,
      availableQuantity: 0,
    });

    expect(calculateMarketplaceAvailability({
      ownedQuantity: 6,
      keepQuantity: 1,
      desiredQuantity: 2,
      reservedQuantity: -4,
    })).toEqual({
      physicalExtra: 5,
      listableQuantity: 2,
      availableQuantity: 2,
    });
  });

  it("counts only non-expired active reservations against availability", () => {
    const now = new Date("2026-08-27T12:00:00.000Z");

    expect(sumActiveReservedQuantity([
      { quantity: 2, status: "RESERVED", expiresAt: new Date("2026-08-27T13:00:00.000Z") },
      { quantity: 1, status: "RESERVED", expiresAt: "2026-08-27T13:00:00.000Z" },
      { quantity: -2, status: "RESERVED", expiresAt: "2026-08-27T13:00:00.000Z" },
      { quantity: 5, status: "RESERVED", expiresAt: new Date("2026-08-27T11:00:00.000Z") },
      { quantity: 7, status: "CANCELLED", expiresAt: new Date("2026-08-27T13:00:00.000Z") },
    ], now)).toBe(3);
  });

});

describe("marketplace state transition guards", () => {
  it("allows explicit valid enquiry transitions and rejects arbitrary jumps", () => {
    expect(assertEnquiryTransition({ currentStatus: "PENDING_SELLER", action: "SELLER_COUNTER", actorRole: "SELLER" })).toBe("AWAITING_BUYER");
    expect(assertEnquiryTransition({ currentStatus: "AWAITING_BUYER", action: "BUYER_ACCEPT", actorRole: "BUYER" })).toBe("RESERVED");

    expect(() => assertEnquiryTransition({ currentStatus: "PENDING_SELLER", action: "BUYER_ACCEPT", actorRole: "BUYER" })).toThrow(MarketplaceTransitionError);
    expect(() => assertEnquiryTransition({ currentStatus: "PENDING_SELLER", action: "SELLER_ACCEPT", actorRole: "BUYER" })).toThrow("seller action requires seller actor");
  });

  it("guards reservation sold/cancel/expiry transitions", () => {
    expect(assertReservationTransition({ currentStatus: "RESERVED", action: "SELLER_MARK_SOLD", actorRole: "SELLER" })).toBe("AWAITING_BUYER_CONFIRMATION");
    expect(assertReservationTransition({ currentStatus: "RESERVED", action: "EXPIRE", actorRole: "SYSTEM" })).toBe("EXPIRED");
    expect(assertReservationTransition({ currentStatus: "AWAITING_BUYER_CONFIRMATION", action: "BUYER_CONFIRM", actorRole: "BUYER" })).toBe("COMPLETED");

    expect(() => assertReservationTransition({ currentStatus: "COMPLETED", action: "CANCEL", actorRole: "SELLER" })).toThrow(MarketplaceTransitionError);
  });

  it("covers every valid enquiry and reservation transition branch", () => {
    expect(assertEnquiryTransition({ currentStatus: "PENDING_SELLER", action: "SELLER_ACCEPT", actorRole: "SELLER" })).toBe("RESERVED");
    expect(assertEnquiryTransition({ currentStatus: "PENDING_SELLER", action: "SELLER_DECLINE", actorRole: "SELLER" })).toBe("DECLINED");
    expect(assertEnquiryTransition({ currentStatus: "PENDING_SELLER", action: "BUYER_WITHDRAW", actorRole: "BUYER" })).toBe("WITHDRAWN");
    expect(assertEnquiryTransition({ currentStatus: "PENDING_SELLER", action: "BUYER_OFFER", actorRole: "BUYER" })).toBe("PENDING_SELLER");
    expect(assertEnquiryTransition({ currentStatus: "AWAITING_BUYER", action: "BUYER_COUNTER", actorRole: "BUYER" })).toBe("PENDING_SELLER");
    expect(assertEnquiryTransition({ currentStatus: "AWAITING_BUYER", action: "BUYER_WITHDRAW", actorRole: "BUYER" })).toBe("WITHDRAWN");

    expect(assertReservationTransition({ currentStatus: "RESERVED", action: "CANCEL", actorRole: "BUYER" })).toBe("CANCELLED");
    expect(assertReservationTransition({ currentStatus: "AWAITING_BUYER_CONFIRMATION", action: "BUYER_DISPUTE", actorRole: "BUYER" })).toBe("DISPUTED");
    expect(() => assertReservationTransition({ currentStatus: "RESERVED", action: "BUYER_CONFIRM", actorRole: "SELLER" })).toThrow("buyer action requires buyer actor");
    expect(() => assertReservationTransition({ currentStatus: "RESERVED", action: "EXPIRE", actorRole: "SELLER" })).toThrow("system action requires system actor");
  });
});
