import { describe, expect, it } from "vitest";
import {
  VARIANTS,
  CONDITIONS,
  CURRENCIES,
  LISTING_STATUSES,
  ENQUIRY_STATUSES,
  TRANSACTION_STATUSES,
  COMPLETED_CAUSES,
  CANCEL_ACTORS,
  REPORT_TARGET_TYPES,
  REPORT_STATUSES,
  variantColumn,
  isValidVariant,
  isValidCondition,
  isValidCurrency,
  isValidRating,
  isValidListingStatus,
  isValidEnquiryStatus,
  isValidTransactionStatus,
  isValidCompletedCause,
  isValidCancelActor,
  isValidReportTargetType,
} from "../src/services/marketplace.js";

describe("marketplace constants", () => {
  it("exposes the exact variant set", () => {
    expect(VARIANTS).toEqual(["normal", "foil", "holofoil"]);
  });

  it("exposes the exact condition set", () => {
    expect(CONDITIONS).toEqual(["NM", "LP", "MP", "HP"]);
  });

  it("exposes an uppercase ISO-4217 currency allowlist including USD/EUR/GBP", () => {
    expect(CURRENCIES.length).toBeGreaterThan(0);
    expect(CURRENCIES).toContain("USD");
    expect(CURRENCIES).toContain("EUR");
    expect(CURRENCIES).toContain("GBP");
    for (const code of CURRENCIES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
    // No duplicates in the allowlist.
    expect(new Set(CURRENCIES).size).toBe(CURRENCIES.length);
  });

  it("exposes the exact listing status set", () => {
    expect(LISTING_STATUSES).toEqual(["ACTIVE", "CLOSED"]);
  });

  it("exposes the exact enquiry status set", () => {
    expect(ENQUIRY_STATUSES).toEqual(["ACTIVE", "ARCHIVED"]);
  });

  it("exposes the exact transaction status set", () => {
    expect(TRANSACTION_STATUSES).toEqual(["PENDING_CONFIRMATION", "COMPLETED", "CANCELLED"]);
  });

  it("exposes the exact completed-cause set", () => {
    expect(COMPLETED_CAUSES).toEqual(["BUYER_CONFIRM", "AUTO_TRANSFER"]);
  });

  it("exposes the exact cancel-actor set", () => {
    expect(CANCEL_ACTORS).toEqual(["BUYER", "SELLER", "SYSTEM"]);
  });

  it("exposes the exact report target-type set", () => {
    expect(REPORT_TARGET_TYPES).toEqual(["LISTING", "USER"]);
  });

  it("exposes the exact report status set", () => {
    expect(REPORT_STATUSES).toEqual(["OPEN", "RESOLVED"]);
  });
});

describe("variantColumn", () => {
  it("maps every variant to its inventory column", () => {
    expect(variantColumn("normal")).toBe("quantity");
    expect(variantColumn("foil")).toBe("foilQuantity");
    expect(variantColumn("holofoil")).toBe("holofoilQuantity");
  });

  it("rejects an unknown variant", () => {
    expect(() => variantColumn("chrome")).toThrow();
    expect(() => variantColumn("")).toThrow();
    expect(() => variantColumn(undefined)).toThrow();
    expect(() => variantColumn(null)).toThrow();
  });
});

describe("isValidRating", () => {
  it("accepts integer ratings 1..5", () => {
    for (let rating = 1; rating <= 5; rating++) {
      expect(isValidRating(rating)).toBe(true);
    }
  });

  it("rejects 0 and 6", () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
  });

  it("rejects non-integers and non-numbers", () => {
    expect(isValidRating(3.5)).toBe(false);
    expect(isValidRating(Number.NaN)).toBe(false);
    expect(isValidRating("3")).toBe(false);
    expect(isValidRating(null)).toBe(false);
    expect(isValidRating(undefined)).toBe(false);
  });
});

describe("validation helpers", () => {
  it("isValidVariant accepts every variant and rejects others", () => {
    for (const variant of VARIANTS) expect(isValidVariant(variant)).toBe(true);
    expect(isValidVariant("chrome")).toBe(false);
    expect(isValidVariant("Normal")).toBe(false);
    expect(isValidVariant("")).toBe(false);
    expect(isValidVariant(undefined)).toBe(false);
  });

  it("isValidCondition accepts every condition and rejects others", () => {
    for (const condition of CONDITIONS) expect(isValidCondition(condition)).toBe(true);
    expect(isValidCondition("NM/M")).toBe(false);
    expect(isValidCondition("nm")).toBe(false);
    expect(isValidCondition(null)).toBe(false);
  });

  it("isValidCurrency accepts allowlisted codes only", () => {
    for (const code of CURRENCIES) expect(isValidCurrency(code)).toBe(true);
    expect(isValidCurrency("usd")).toBe(false);
    expect(isValidCurrency("XYZ")).toBe(false);
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency(undefined)).toBe(false);
  });

  it("isValidListingStatus accepts every status and rejects others", () => {
    for (const status of LISTING_STATUSES) expect(isValidListingStatus(status)).toBe(true);
    expect(isValidListingStatus("SOLD")).toBe(false);
    expect(isValidListingStatus("")).toBe(false);
    expect(isValidListingStatus(undefined)).toBe(false);
  });

  it("isValidEnquiryStatus accepts every status and rejects others", () => {
    for (const status of ENQUIRY_STATUSES) expect(isValidEnquiryStatus(status)).toBe(true);
    expect(isValidEnquiryStatus("CLOSED")).toBe(false);
    expect(isValidEnquiryStatus(null)).toBe(false);
  });

  it("isValidTransactionStatus accepts every status and rejects others", () => {
    for (const status of TRANSACTION_STATUSES) expect(isValidTransactionStatus(status)).toBe(true);
    expect(isValidTransactionStatus("PENDING")).toBe(false);
    expect(isValidTransactionStatus("")).toBe(false);
    expect(isValidTransactionStatus(undefined)).toBe(false);
  });

  it("isValidCompletedCause accepts every cause and rejects others", () => {
    for (const cause of COMPLETED_CAUSES) expect(isValidCompletedCause(cause)).toBe(true);
    expect(isValidCompletedCause("MANUAL")).toBe(false);
    expect(isValidCompletedCause(null)).toBe(false);
  });

  it("isValidCancelActor accepts every actor and rejects others", () => {
    for (const actor of CANCEL_ACTORS) expect(isValidCancelActor(actor)).toBe(true);
    expect(isValidCancelActor("ADMIN")).toBe(false);
    expect(isValidCancelActor(undefined)).toBe(false);
  });

  it("isValidReportTargetType accepts every type and rejects others", () => {
    for (const type of REPORT_TARGET_TYPES) expect(isValidReportTargetType(type)).toBe(true);
    expect(isValidReportTargetType("LISTING_PHOTO")).toBe(false);
    expect(isValidReportTargetType("")).toBe(false);
    expect(isValidReportTargetType(undefined)).toBe(false);
  });
});
