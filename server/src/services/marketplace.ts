/**
 * Lorcana Marketplace (Lean V2) — shared types and allowed-value constants.
 *
 * Design D2: every enum-ish column is stored as a `String` in Prisma and
 * validated here at the application layer. This module is pure — it imports
 * nothing from `@prisma/client` and is safe to use from routes, services, and
 * tests without a database.
 *
 * The single source of truth is `server/prisma/schema.prisma` (models) and the
 * approved design (`design.md` §4). Keep the constants below in lockstep with
 * those documents.
 */

export const VARIANTS = ["normal", "foil", "holofoil"] as const;
export type MarketplaceVariant = (typeof VARIANTS)[number];

export const CONDITIONS = ["NM", "LP", "MP", "HP"] as const;
export type MarketplaceCondition = (typeof CONDITIONS)[number];

/**
 * ISO-4217 uppercase currency codes accepted for a listing's `currency`.
 * Curated allowlist (not the full ISO register) so the accepted surface stays
 * deliberate and auditable; the PRD requires USD/EUR/GBP at minimum. Extend
 * here as new markets are added.
 */
export const CURRENCIES: readonly string[] = [
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
  "JPY",
  "CNY",
  "HKD",
  "SGD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "MXN",
  "BRL",
  "INR",
  "KRW",
  "TRY",
  "ZAR",
  "AED",
  "ILS",
];

export const LISTING_STATUSES = ["ACTIVE", "CLOSED"] as const;
export const ENQUIRY_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export const TRANSACTION_STATUSES = [
  "PENDING_CONFIRMATION",
  "COMPLETED",
  "CANCELLED",
] as const;
export const COMPLETED_CAUSES = ["BUYER_CONFIRM", "AUTO_TRANSFER"] as const;
export const CANCEL_ACTORS = ["BUYER", "SELLER", "SYSTEM"] as const;
export const REPORT_TARGET_TYPES = ["LISTING", "USER"] as const;
export const REPORT_STATUSES = ["OPEN", "RESOLVED"] as const;

/**
 * Maps a wire variant to the matching `InventoryEntry`/`MarketplaceListing`
 * quantity column (design D1). Throws on any unknown value so callers never
 * silently read/write the wrong column.
 */
export function variantColumn(
  v: unknown
): "quantity" | "foilQuantity" | "holofoilQuantity" {
  switch (v) {
    case "normal":
      return "quantity";
    case "foil":
      return "foilQuantity";
    case "holofoil":
      return "holofoilQuantity";
    default:
      throw new Error(`Unknown variant: ${String(v)}`);
  }
}

function isInAllowlist(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function isValidVariant(value: unknown): value is MarketplaceVariant {
  return isInAllowlist(value, VARIANTS);
}

export function isValidCondition(value: unknown): value is MarketplaceCondition {
  return isInAllowlist(value, CONDITIONS);
}

export function isValidCurrency(value: unknown): boolean {
  return isInAllowlist(value, CURRENCIES);
}

export function isValidRating(value: unknown): boolean {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
  );
}

export function isValidListingStatus(value: unknown): boolean {
  return isInAllowlist(value, LISTING_STATUSES);
}

export function isValidEnquiryStatus(value: unknown): boolean {
  return isInAllowlist(value, ENQUIRY_STATUSES);
}

export function isValidTransactionStatus(value: unknown): boolean {
  return isInAllowlist(value, TRANSACTION_STATUSES);
}

export function isValidCompletedCause(value: unknown): boolean {
  return isInAllowlist(value, COMPLETED_CAUSES);
}

export function isValidCancelActor(value: unknown): boolean {
  return isInAllowlist(value, CANCEL_ACTORS);
}

export function isValidReportTargetType(value: unknown): boolean {
  return isInAllowlist(value, REPORT_TARGET_TYPES);
}
