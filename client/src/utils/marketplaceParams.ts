import type { MarketplaceCondition, MarketplaceVariant } from "../types";
import { INVENTORY_VARIANT_LABELS, type InventoryVariant } from "./cardVariants";

/**
 * Option metadata and URL (de)serialisation for the public marketplace browse
 * view, mirroring the priceMoverParams.ts pattern: the URL is the single source
 * of truth so a filtered view can be reloaded, bookmarked, or shared.
 *
 * Price range inputs are expressed in MAJOR units (e.g. "10" or "10.50") for a
 * human-readable URL; `priceMinorFromMajor` converts to the integer minor units
 * the server contract expects (`priceMin`/`priceMax`). The ×100 conversion
 * assumes the 2-decimal minor-unit convention shared by the common listing
 * currencies; the design (§16) accepts price-range filters being approximate
 * across currencies by design.
 */

export const MARKETPLACE_VARIANT_OPTIONS: Array<{ value: MarketplaceVariant; label: string }> = [
  { value: "normal", label: INVENTORY_VARIANT_LABELS.normal },
  { value: "foil", label: INVENTORY_VARIANT_LABELS.foil },
  { value: "holofoil", label: INVENTORY_VARIANT_LABELS.holofoil },
];

export const MARKETPLACE_CONDITION_OPTIONS: Array<{ value: MarketplaceCondition; label: string }> = [
  { value: "NM", label: "Near Mint (NM)" },
  { value: "LP", label: "Lightly Played (LP)" },
  { value: "MP", label: "Moderately Played (MP)" },
  { value: "HP", label: "Heavily Played (HP)" },
];

/** ISO-4217 uppercase codes accepted by the server's currency allowlist (design §4/D8). */
export const MARKETPLACE_CURRENCY_OPTIONS: string[] = [
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

export interface MarketplaceControls {
  q: string;
  variant: string; // "" = all variants
  condition: string; // "" = all conditions
  priceMin: string; // major units, "" = no lower bound
  priceMax: string; // major units, "" = no upper bound
  currency: string; // "" = all currencies
  page: number; // 1-based
}

export const MARKETPLACE_DEFAULTS: MarketplaceControls = {
  q: "",
  variant: "",
  condition: "",
  priceMin: "",
  priceMax: "",
  currency: "",
  page: 1,
};

/** Allows in-progress input like "1." and "10.5"; rejects negatives and junk. */
const PRICE_PATTERN = /^\d*\.?\d*$/;

const VARIANT_VALUES = new Set<string>(MARKETPLACE_VARIANT_OPTIONS.map((option) => option.value));
const CONDITION_VALUES = new Set<string>(MARKETPLACE_CONDITION_OPTIONS.map((option) => option.value));
const CURRENCY_VALUES = new Set<string>(MARKETPLACE_CURRENCY_OPTIONS);

function pick(raw: string | null, allowed: Set<string>): string {
  return raw != null && allowed.has(raw) ? raw : "";
}

function pickText(raw: string | null): string {
  return (raw ?? "").trim();
}

function pickPrice(raw: string | null): string {
  const trimmed = (raw ?? "").trim();
  return PRICE_PATTERN.test(trimmed) ? trimmed : "";
}

function pickPage(raw: string | null): number {
  const parsed = parseInt(raw ?? "1", 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/** Unknown or out-of-range params degrade to defaults rather than breaking the view. */
export function marketplaceControlsFromParams(params: URLSearchParams): MarketplaceControls {
  return {
    q: pickText(params.get("q")),
    variant: pick(params.get("variant"), VARIANT_VALUES),
    condition: pick(params.get("condition"), CONDITION_VALUES),
    priceMin: pickPrice(params.get("priceMin")),
    priceMax: pickPrice(params.get("priceMax")),
    currency: pick(params.get("currency"), CURRENCY_VALUES),
    page: pickPage(params.get("page")),
  };
}

export function marketplaceParamsFromControls(controls: MarketplaceControls): URLSearchParams {
  const params = new URLSearchParams();
  if (controls.q) params.set("q", controls.q);
  if (controls.variant) params.set("variant", controls.variant);
  if (controls.condition) params.set("condition", controls.condition);
  if (controls.currency) params.set("currency", controls.currency);
  if (controls.priceMin) params.set("priceMin", controls.priceMin);
  if (controls.priceMax) params.set("priceMax", controls.priceMax);
  if (controls.page !== MARKETPLACE_DEFAULTS.page) params.set("page", String(controls.page));
  return params;
}

/** Converts a major-unit price string to integer minor units, or undefined when empty/invalid. */
export function priceMinorFromMajor(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

/** Formats an integer minor-unit price with its ISO currency code. */
export function formatPriceMinor(priceMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(priceMinor / 100);
  } catch {
    return `${currency} ${(priceMinor / 100).toFixed(2)}`;
  }
}

/** Display label for a wire variant, falling back to the raw value. */
export function marketplaceVariantLabel(variant: string): string {
  return INVENTORY_VARIANT_LABELS[variant as InventoryVariant] ?? variant;
}
