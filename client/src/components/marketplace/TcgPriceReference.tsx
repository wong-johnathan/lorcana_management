import type { CardPrice, MarketplaceVariant } from "../../types";

interface TcgPriceReferenceProps {
  /** The selected card's TCGPlayer price rows (variant + low/mid/high/market). */
  prices: CardPrice[];
  /** The SELECTED listing variant the reference is matched against. */
  variant: MarketplaceVariant;
}

/** Accepted price-entry variants per listing variant (case-insensitive). */
const VARIANT_ALIASES: Record<MarketplaceVariant, string[]> = {
  normal: ["Normal"],
  foil: ["Foil", "Cold Foil"],
  holofoil: ["Holofoil", "Cold Foil", "Foil"],
};

function fmt(value: number | null): string {
  return value != null ? `$${value.toFixed(2)}` : "—";
}

/**
 * Compact display-only TCGPlayer reference (REQ-POL-11): matched to the
 * SELECTED variant, always USD, never prefills/validates the Price input.
 * No entry (or all-null prices) renders exactly "No TCG price available".
 */
export default function TcgPriceReference({ prices, variant }: TcgPriceReferenceProps) {
  const aliases = VARIANT_ALIASES[variant].map((alias) => alias.toLowerCase());
  const entry = prices.find((price) => aliases.includes(price.variant.toLowerCase()));

  if (
    !entry ||
    (entry.marketPrice == null && entry.lowPrice == null && entry.highPrice == null)
  ) {
    return (
      <p className="text-xs text-gray-500" data-testid="tcg-price-reference">
        No TCG price available
      </p>
    );
  }

  return (
    <p className="text-xs text-gray-500" data-testid="tcg-price-reference">
      TCG market {fmt(entry.marketPrice)} (low {fmt(entry.lowPrice)} · high{" "}
      {fmt(entry.highPrice)}) (USD)
    </p>
  );
}
