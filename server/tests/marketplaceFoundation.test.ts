import { describe, expect, it } from "vitest";
import {
  calculateMarketplaceAvailability,
  evaluateMarketplaceEligibility,
  sumActiveReservedQuantity,
} from "../src/services/marketplaceAvailability.js";
import {
  assertEnquiryTransition,
  assertReservationTransition,
  MarketplaceTransitionError,
} from "../src/services/marketplaceTransitions.js";
import {
  createHashedToken,
  createVerificationToken,
  isTokenExpired,
  normalizeEmail,
  verifyTokenHash,
} from "../src/services/emailVerification.js";

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

  it("counts only non-expired active reservations against availability", () => {
    const now = new Date("2026-08-27T12:00:00.000Z");

    expect(sumActiveReservedQuantity([
      { quantity: 2, status: "RESERVED", expiresAt: new Date("2026-08-27T13:00:00.000Z") },
      { quantity: 5, status: "RESERVED", expiresAt: new Date("2026-08-27T11:00:00.000Z") },
      { quantity: 7, status: "CANCELLED", expiresAt: new Date("2026-08-27T13:00:00.000Z") },
    ], now)).toBe(2);
  });

  it("keeps existing listings out of global marketplace unless fully eligible", () => {
    const baseListing = {
      marketplaceVisible: false,
      status: "active",
      askingPriceMinor: null,
      currency: null,
      condition: null,
      cardLanguage: null,
      originCountryCode: null,
      allowsMeetup: false,
      shipsDomestically: false,
      shipsInternationally: false,
      shipsWorldwide: false,
      destinationCountries: [],
    };

    const ineligible = evaluateMarketplaceEligibility({
      listing: baseListing,
      seller: { emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") },
      availableQuantity: 1,
    });

    expect(ineligible.eligible).toBe(false);
    expect(ineligible.reasons).toContain("marketplace publication is disabled");
    expect(ineligible.reasons).toContain("asking price is required");

    const eligible = evaluateMarketplaceEligibility({
      listing: {
        ...baseListing,
        marketplaceVisible: true,
        askingPriceMinor: 1200,
        currency: "SGD",
        condition: "NEAR_MINT",
        cardLanguage: "EN",
        originCountryCode: "SG",
        shipsInternationally: true,
        destinationCountries: ["MY"],
      },
      seller: { emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z") },
      availableQuantity: 1,
    });

    expect(eligible).toEqual({ eligible: true, reasons: [] });
  });

  it("surfaces every marketplace eligibility blocker and fulfils via meetup/domestic/worldwide", () => {
    const blocked = evaluateMarketplaceEligibility({
      listing: {
        marketplaceVisible: true,
        status: "paused",
        askingPriceMinor: -1,
        currency: "ZZZ",
        condition: "UNKNOWN",
        cardLanguage: "",
        originCountryCode: "",
        allowsMeetup: false,
        shipsDomestically: false,
        shipsInternationally: true,
        shipsWorldwide: false,
        destinationCountries: [],
      },
      seller: { emailVerifiedAt: null },
      availableQuantity: 0,
    });

    expect(blocked.eligible).toBe(false);
    expect(blocked.reasons).toEqual(expect.arrayContaining([
      "seller email is not verified",
      "listing is not active",
      "asking price must be a non-negative integer minor-unit amount",
      "valid currency is required",
      "condition is required",
      "card language is required",
      "origin country is required",
      "fulfilment coverage is required",
      "available quantity must be greater than zero",
    ]));

    const common = {
      marketplaceVisible: true,
      status: "active",
      askingPriceMinor: 0,
      currency: "USD",
      condition: "MINT",
      cardLanguage: "EN",
      originCountryCode: "US",
      shipsInternationally: false,
      destinationCountries: [],
    };
    const seller = { emailVerifiedAt: "2026-08-27T00:00:00.000Z" };

    expect(evaluateMarketplaceEligibility({ listing: { ...common, allowsMeetup: true }, seller, availableQuantity: 1 }).eligible).toBe(true);
    expect(evaluateMarketplaceEligibility({ listing: { ...common, shipsDomestically: true }, seller, availableQuantity: 1 }).eligible).toBe(true);
    expect(evaluateMarketplaceEligibility({ listing: { ...common, shipsWorldwide: true }, seller, availableQuantity: 1 }).eligible).toBe(true);
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

describe("email verification helpers", () => {
  it("normalizes case and whitespace for unique email comparisons", () => {
    expect(normalizeEmail("  Johnathan.Wong+lorcana@GMAIL.COM  ")).toBe("johnathan.wong+lorcana@gmail.com");
  });

  it("stores only token hashes and verifies candidate tokens", () => {
    const token = "plain-token-from-email";
    const hash = createHashedToken(token);

    expect(hash).not.toBe(token);
    expect(verifyTokenHash(token, hash)).toBe(true);
    expect(verifyTokenHash("wrong", hash)).toBe(false);
  });

  it("detects expired verification tokens", () => {
    const now = new Date("2026-08-27T12:00:00.000Z");
    expect(isTokenExpired(new Date("2026-08-27T11:59:59.000Z"), now)).toBe(true);
    expect(isTokenExpired(new Date("2026-08-27T12:00:01.000Z"), now)).toBe(false);
  });

  it("creates expiring opaque verification tokens without exposing the hash input", () => {
    const now = new Date("2026-08-27T12:00:00.000Z");
    const generated = createVerificationToken(60_000, now);

    expect(generated.token).toEqual(expect.any(String));
    expect(generated.tokenHash).toHaveLength(64);
    expect(generated.tokenHash).not.toBe(generated.token);
    expect(generated.expiresAt.toISOString()).toBe("2026-08-27T12:01:00.000Z");
    expect(verifyTokenHash(generated.token, generated.tokenHash)).toBe(true);
  });
});
