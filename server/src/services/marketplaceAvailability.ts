import type { InventoryVariant } from "./extrasForSale.js";

export const MARKETPLACE_CURRENCIES = ["USD", "SGD", "MYR", "EUR", "GBP", "AUD", "CAD", "JPY"] as const;
export const MARKETPLACE_CONDITIONS = [
  "MINT",
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "HEAVILY_PLAYED",
  "DAMAGED",
] as const;
export const MARKETPLACE_PRICING_MODES = ["FIXED", "ACCEPTS_OFFERS"] as const;

export type MarketplaceCurrency = typeof MARKETPLACE_CURRENCIES[number];
export type MarketplaceCondition = typeof MARKETPLACE_CONDITIONS[number];
export type MarketplacePricingMode = typeof MARKETPLACE_PRICING_MODES[number];

export interface MarketplaceAvailabilityInput {
  ownedQuantity: number;
  keepQuantity: number;
  desiredQuantity: number;
  reservedQuantity?: number;
}

export interface MarketplaceAvailability {
  physicalExtra: number;
  listableQuantity: number;
  availableQuantity: number;
}

export interface ReservationLike {
  quantity: number;
  status: string;
  expiresAt: Date | string;
}

export interface MarketplaceListingEligibilityLike {
  marketplaceVisible?: boolean | null;
  status?: string | null;
  askingPriceMinor?: number | null;
  currency?: string | null;
  condition?: string | null;
  cardLanguage?: string | null;
  originCountryCode?: string | null;
  allowsMeetup?: boolean | null;
  shipsDomestically?: boolean | null;
  shipsInternationally?: boolean | null;
  shipsWorldwide?: boolean | null;
  destinationCountries?: string[] | null;
  variant?: InventoryVariant | string;
}

export interface MarketplaceSellerEligibilityLike {
  emailVerifiedAt?: Date | string | null;
}

export function calculateMarketplaceAvailability(input: MarketplaceAvailabilityInput): MarketplaceAvailability {
  const physicalExtra = Math.max(0, input.ownedQuantity - input.keepQuantity);
  const listableQuantity = Math.max(0, Math.min(input.desiredQuantity, physicalExtra));
  const availableQuantity = Math.max(0, listableQuantity - Math.max(0, input.reservedQuantity ?? 0));
  return { physicalExtra, listableQuantity, availableQuantity };
}

export function sumActiveReservedQuantity(reservations: ReservationLike[], now = new Date()): number {
  return reservations.reduce((total, reservation) => {
    const expiresAt = reservation.expiresAt instanceof Date ? reservation.expiresAt : new Date(reservation.expiresAt);
    if (reservation.status === "RESERVED" && expiresAt > now) {
      return total + Math.max(0, reservation.quantity);
    }
    return total;
  }, 0);
}

function hasFulfilmentCoverage(listing: MarketplaceListingEligibilityLike): boolean {
  if (listing.allowsMeetup || listing.shipsDomestically || listing.shipsWorldwide) return true;
  if (listing.shipsInternationally && (listing.destinationCountries?.length ?? 0) > 0) return true;
  return false;
}

export function evaluateMarketplaceEligibility(input: {
  listing: MarketplaceListingEligibilityLike;
  seller: MarketplaceSellerEligibilityLike;
  availableQuantity: number;
}): { eligible: boolean; reasons: string[] } {
  const { listing, seller, availableQuantity } = input;
  const reasons: string[] = [];

  if (!seller.emailVerifiedAt) reasons.push("seller email is not verified");
  if (!listing.marketplaceVisible) reasons.push("marketplace publication is disabled");
  if (listing.status !== "active") reasons.push("listing is not active");
  if (listing.askingPriceMinor === null || listing.askingPriceMinor === undefined) reasons.push("asking price is required");
  if (typeof listing.askingPriceMinor === "number" && (!Number.isInteger(listing.askingPriceMinor) || listing.askingPriceMinor < 0)) reasons.push("asking price must be a non-negative integer minor-unit amount");
  if (!listing.currency || !(MARKETPLACE_CURRENCIES as readonly string[]).includes(listing.currency)) reasons.push("valid currency is required");
  if (!listing.condition || !(MARKETPLACE_CONDITIONS as readonly string[]).includes(listing.condition)) reasons.push("condition is required");
  if (!listing.cardLanguage) reasons.push("card language is required");
  if (!listing.originCountryCode) reasons.push("origin country is required");
  if (!hasFulfilmentCoverage(listing)) reasons.push("fulfilment coverage is required");
  if (availableQuantity <= 0) reasons.push("available quantity must be greater than zero");

  return { eligible: reasons.length === 0, reasons };
}
