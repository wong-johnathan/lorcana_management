import type { Card, InventoryVariant, MarketplaceCondition, MarketplaceFulfilmentCoverage, MarketplaceMoney } from "../../types";

const currencySymbols: Record<string, string> = {
  SGD: "S$",
  USD: "US$",
  MYR: "RM",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  JPY: "¥",
};

export function formatMarketplaceMoney(money: MarketplaceMoney | null | undefined): string {
  if (!money) return "Price unavailable";
  const symbol = currencySymbols[money.currency] ?? `${money.currency} `;
  const amount = money.amountMinor / 100;
  return `${symbol}${amount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function variantLabel(variant: InventoryVariant): string {
  if (variant === "holofoil") return "Holofoil";
  if (variant === "foil") return "Foil";
  return "Normal";
}

export function conditionLabel(condition: MarketplaceCondition | null | undefined): string {
  if (!condition) return "Condition not set";
  return condition
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function cardTitle(card: Card): string {
  return card.subtitle ? `${card.name} - ${card.subtitle}` : card.name;
}

export function shortCardNumber(card: Card): string {
  return card.cardNumber.split("•")[0]?.trim() || card.cardNumber;
}

export function cardIdentifier(card: Card, variant: InventoryVariant): string {
  return `${shortCardNumber(card)} • ${card.rarity} • ${variantLabel(variant)}`;
}

export function fulfilmentSummary(fulfilment: MarketplaceFulfilmentCoverage | null | undefined): string {
  if (!fulfilment) return "Fulfilment pending";
  const methods = [
    fulfilment.allowsMeetup ? "Meetup" : null,
    fulfilment.shipsDomestically ? "Domestic shipping" : null,
    fulfilment.shipsInternationally ? "International shipping" : null,
  ].filter(Boolean);
  const destinations = fulfilment.shipsWorldwide
    ? "worldwide"
    : fulfilment.destinationCountryCodes.length
      ? `to ${fulfilment.destinationCountryCodes.join(", ")}`
      : "destination not configured";
  return `${methods.join(" · ") || "Fulfilment pending"} · ${destinations}`;
}
