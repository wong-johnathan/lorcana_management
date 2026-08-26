import type { Card, MasterSetPriceField } from "../types";
import {
  availableInventoryVariants,
  type InventoryCounts,
  type InventoryVariant,
  totalInventoryCount,
} from "../utils/cardVariants";

interface CardGridPriceContext {
  variant: string;
  priceField: MasterSetPriceField;
  status?: string;
}

interface CardGridProps {
  cards: Card[];
  onSelect: (card: Card) => void;
  ownedCardIds?: Set<string>;
  ownedQuantities?: Map<string, InventoryCounts>;
  onQuantityChange?: (card: Card, variant: InventoryVariant, delta: 1 | -1) => void;
  updatingQuantityKeys?: Set<string>;
  priceContext?: CardGridPriceContext;
}

const COLOR_CLASSES: Record<string, string> = {
  Amber: "border-lorcana-amber",
  Amethyst: "border-lorcana-amethyst",
  Emerald: "border-lorcana-emerald",
  Ruby: "border-lorcana-ruby",
  Sapphire: "border-lorcana-sapphire",
  Steel: "border-lorcana-steel",
};

const VARIANT_ALIASES: Record<string, string[]> = {
  Foil: ["Foil", "Cold Foil", "Holofoil"],
};

function priceForContext(card: Card, context?: CardGridPriceContext): number | null {
  if (!context) {
    return card.prices?.find((p) => p.variant === "Normal")?.marketPrice
      ?? card.prices?.[0]?.marketPrice
      ?? null;
  }

  const variants = VARIANT_ALIASES[context.variant] ?? [context.variant];
  const price = variants
    .map((variant) => card.prices?.find((p) => p.variant.toLowerCase() === variant.toLowerCase()))
    .find((p): p is NonNullable<typeof p> => Boolean(p));
  return price?.[context.priceField] ?? null;
}

function priceContextLabel(context: CardGridPriceContext): string {
  const variant = context.variant;
  const status = context.status === "missing" ? "Missing" : context.status === "priced" ? "Priced" : "Price";
  return `${status} ${variant}`;
}

export function cardIndexLabel(card: Pick<Card, "cardNumber">): string {
  return card.cardNumber.trim() || "—";
}

export function QuantityRow({
  label,
  count,
  onDecrease,
  onIncrease,
  disabled,
  disableIncrease,
}: {
  label: string;
  count: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disabled?: boolean;
  disableIncrease?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-400">{label}:</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDecrease}
          disabled={disabled || count <= 0}
          className="h-6 w-6 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Remove ${label.toLowerCase()} card`}
        >
          −
        </button>
        <span className="min-w-5 text-center font-semibold text-gray-100">{count}</span>
        <button
          type="button"
          onClick={onIncrease}
          disabled={disabled || disableIncrease}
          className="h-6 w-6 rounded bg-amber-600 text-black font-bold hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Add ${label.toLowerCase()} card`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function CardGrid({
  cards,
  onSelect,
  ownedCardIds,
  ownedQuantities,
  onQuantityChange,
  updatingQuantityKeys,
  priceContext,
}: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">No cards found.</div>
    );
  }

  return (
    <div className="grid grid-cols-2 items-stretch gap-3 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {cards.map((card) => {
        const borderClass = COLOR_CLASSES[card.color] || "border-gray-700";
        const isOwned = ownedCardIds?.has(card.id);
        const qty = ownedQuantities?.get(card.id) ?? { quantity: 0, foilQuantity: 0, holofoilQuantity: 0 };
        const variants = availableInventoryVariants(card);
        const marketPrice = priceForContext(card, priceContext);
        const normalKey = `${card.id}:normal`;
        const foilKey = `${card.id}:foil`;
        const holofoilKey = `${card.id}:holofoil`;
        const normalUpdating = updatingQuantityKeys?.has(normalKey);
        const foilUpdating = updatingQuantityKeys?.has(foilKey);
        const holofoilUpdating = updatingQuantityKeys?.has(holofoilKey);

        return (
          <div
            key={card.id}
            className={`relative flex h-full flex-col rounded-lg border-2 ${borderClass} bg-gray-900 overflow-hidden text-left transition-transform hover:scale-105`}
          >
            <button
              type="button"
              onClick={() => onSelect(card)}
              className="flex w-full flex-1 flex-col text-left"
            >
              <div className="relative">
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={`${card.name} - ${card.subtitle}`}
                    className="w-full aspect-[2/3] object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center text-gray-500 text-xs text-center p-2">
                    {card.name}
                    <br />
                    {card.subtitle}
                  </div>
                )}

                {isOwned && (
                  <div className="absolute top-1 right-1 bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded">
                    {totalInventoryCount(qty)}x
                  </div>
                )}

                {marketPrice != null && (
                  <div className="absolute bottom-1 right-1 bg-emerald-600 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                    ${marketPrice.toFixed(2)}
                  </div>
                )}

                {priceContext && marketPrice == null && (
                  <div className="absolute bottom-1 right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded max-w-[90%] truncate">
                    {priceContextLabel(priceContext)}
                  </div>
                )}

                {priceContext && marketPrice != null && (
                  <div className="absolute bottom-7 right-1 bg-sky-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {priceContext.variant}
                  </div>
                )}
              </div>

              <div className="p-2 space-y-1.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{card.name}</p>
                  {card.subtitle && (
                    <p className="text-xs text-gray-400 truncate">
                      {card.subtitle}
                    </p>
                  )}
                </div>
                <div className="mt-1">
                  <span className="inline-flex max-w-full rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 truncate">
                    {cardIndexLabel(card)}
                  </span>
                </div>
              </div>
            </button>

            {ownedQuantities && onQuantityChange && (
              <div className="mt-auto space-y-1 border-t border-gray-800 bg-black/20 p-2">
                {variants.includes("normal") && (
                  <QuantityRow
                    label="Normal"
                    count={qty.quantity}
                    disabled={normalUpdating}
                    onDecrease={() => onQuantityChange(card, "normal", -1)}
                    onIncrease={() => onQuantityChange(card, "normal", 1)}
                  />
                )}
                {variants.includes("foil") && (
                  <QuantityRow
                    label="Foil"
                    count={qty.foilQuantity}
                    disabled={foilUpdating}
                    onDecrease={() => onQuantityChange(card, "foil", -1)}
                    onIncrease={() => onQuantityChange(card, "foil", 1)}
                  />
                )}
                {variants.includes("holofoil") && (
                  <QuantityRow
                    label="Holofoil"
                    count={qty.holofoilQuantity}
                    disabled={holofoilUpdating}
                    onDecrease={() => onQuantityChange(card, "holofoil", -1)}
                    onIncrease={() => onQuantityChange(card, "holofoil", 1)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
