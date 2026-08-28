import type { Card, InventoryVariant, MarketplaceMoney } from "../../types";

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

export function cardTitle(card: Card): string {
  return card.subtitle ? `${card.name} - ${card.subtitle}` : card.name;
}

export function shortCardNumber(card: Card): string {
  return card.cardNumber.split("•")[0]?.trim() || card.cardNumber;
}

export function cardIdentifier(card: Card, variant: InventoryVariant): string {
  return `${shortCardNumber(card)} • ${card.rarity} • ${variantLabel(variant)}`;
}
