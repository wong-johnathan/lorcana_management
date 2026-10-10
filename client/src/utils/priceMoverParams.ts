import type { PriceMoverField, PriceMoverType, PriceMoverWindow } from "../types";

/**
 * Option metadata and URL (de)serialisation for the Price Movers view.
 *
 * The URL is the single source of truth for the page's controls so a view can be
 * reloaded, bookmarked, or shared. Only values that differ from the defaults are
 * written, which keeps the default view a bare `/market-movers` URL.
 */

export const MOVER_WINDOW_OPTIONS: Array<{ value: PriceMoverWindow; label: string }> = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

export const MOVER_TYPE_OPTIONS: Array<{ value: PriceMoverType; label: string; helper: string }> = [
  { value: "gainers", label: "Top gainers", helper: "Highest positive % move" },
  { value: "losers", label: "Top losers", helper: "Largest negative % move" },
  { value: "volatile", label: "Most volatile", helper: "Biggest move either way" },
  { value: "dollars", label: "Biggest $ moves", helper: "Largest absolute dollar change" },
];

export const MOVER_FIELD_OPTIONS: Array<{ value: PriceMoverField; label: string }> = [
  { value: "marketPrice", label: "Market" },
  { value: "lowPrice", label: "Low" },
  { value: "midPrice", label: "Mid" },
  { value: "highPrice", label: "High" },
  { value: "directLowPrice", label: "Direct Low" },
];

export const MOVER_VARIANT_OPTIONS: string[] = ["all", "Normal", "Cold Foil", "Holofoil"];

export const MOVER_RARITY_OPTIONS: string[] = [
  "all",
  "Common",
  "Uncommon",
  "Rare",
  "Super Rare",
  "Legendary",
  "Enchanted",
  "Epic",
  "Iconic",
  "Promo",
  "Special",
];

/** Enchanted/Epic/Iconic only ever exist as premium foil printings in TCGCSV. */
export const MOVER_PREMIUM_RARITIES: string[] = ["Enchanted", "Epic", "Iconic"];

export interface MoverControls {
  windowRange: PriceMoverWindow;
  type: PriceMoverType;
  variant: string;
  rarity: string;
  field: PriceMoverField;
  minPrevPrice: string;
  minCurrentPrice: string;
  minChangePercent: string;
}

export const MOVER_DEFAULTS: MoverControls = {
  windowRange: "24h",
  type: "gainers",
  variant: "all",
  rarity: "all",
  field: "marketPrice",
  minPrevPrice: "",
  minCurrentPrice: "",
  minChangePercent: "",
};

/** Allows in-progress input like "1." and "0.5"; rejects negatives and junk. */
const MIN_VALUE_PATTERN = /^\d*\.?\d*$/;

function allowedSet(values: string[]): Set<string> {
  return new Set(values);
}

const WINDOW_VALUES = allowedSet(MOVER_WINDOW_OPTIONS.map((option) => option.value));
const TYPE_VALUES = allowedSet(MOVER_TYPE_OPTIONS.map((option) => option.value));
const FIELD_VALUES = allowedSet(MOVER_FIELD_OPTIONS.map((option) => option.value));
const VARIANT_VALUES = allowedSet(MOVER_VARIANT_OPTIONS);
const RARITY_VALUES = allowedSet(MOVER_RARITY_OPTIONS);

function pick<T extends string>(raw: string | null, allowed: Set<string>, fallback: T): T {
  return raw != null && allowed.has(raw) ? (raw as T) : fallback;
}

function pickMin(raw: string | null): string {
  const trimmed = (raw ?? "").trim();
  return MIN_VALUE_PATTERN.test(trimmed) ? trimmed : "";
}

/** Unknown or out-of-range params degrade to defaults rather than breaking the view. */
export function moverControlsFromParams(params: URLSearchParams): MoverControls {
  return {
    windowRange: pick(params.get("window"), WINDOW_VALUES, MOVER_DEFAULTS.windowRange),
    type: pick(params.get("type"), TYPE_VALUES, MOVER_DEFAULTS.type),
    variant: pick(params.get("variant"), VARIANT_VALUES, MOVER_DEFAULTS.variant),
    rarity: pick(params.get("rarity"), RARITY_VALUES, MOVER_DEFAULTS.rarity),
    field: pick(params.get("field"), FIELD_VALUES, MOVER_DEFAULTS.field),
    minPrevPrice: pickMin(params.get("minPrevPrice")),
    minCurrentPrice: pickMin(params.get("minCurrentPrice")),
    minChangePercent: pickMin(params.get("minChangePercent")),
  };
}

export function moverParamsFromControls(controls: MoverControls): URLSearchParams {
  const params = new URLSearchParams();
  if (controls.windowRange !== MOVER_DEFAULTS.windowRange) params.set("window", controls.windowRange);
  if (controls.type !== MOVER_DEFAULTS.type) params.set("type", controls.type);
  if (controls.variant !== MOVER_DEFAULTS.variant) params.set("variant", controls.variant);
  if (controls.rarity !== MOVER_DEFAULTS.rarity) params.set("rarity", controls.rarity);
  if (controls.field !== MOVER_DEFAULTS.field) params.set("field", controls.field);
  if (controls.minPrevPrice) params.set("minPrevPrice", controls.minPrevPrice);
  if (controls.minCurrentPrice) params.set("minCurrentPrice", controls.minCurrentPrice);
  if (controls.minChangePercent) params.set("minChangePercent", controls.minChangePercent);
  return params;
}
