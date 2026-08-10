import type { Card, MasterSetPriceField } from "../types";

interface CardGridPriceContext {
  variant: string;
  priceField: MasterSetPriceField;
  status?: string;
}

interface CardGridProps {
  cards: Card[];
  onSelect: (card: Card) => void;
  ownedCardIds?: Set<string>;
  ownedQuantities?: Map<string, { quantity: number; foilQuantity: number }>;
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

export default function CardGrid({
  cards,
  onSelect,
  ownedCardIds,
  ownedQuantities,
  priceContext,
}: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">No cards found.</div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-3">
      {cards.map((card) => {
        const borderClass = COLOR_CLASSES[card.color] || "border-gray-700";
        const isOwned = ownedCardIds?.has(card.id);
        const qty = ownedQuantities?.get(card.id);
        const marketPrice = priceForContext(card, priceContext);

        return (
          <button
            key={card.id}
            onClick={() => onSelect(card)}
            className={`relative rounded-lg border-2 ${borderClass} bg-gray-900 overflow-hidden hover:scale-105 transition-transform text-left`}
          >
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

            {isOwned && qty && (
              <div className="absolute top-1 right-1 bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded">
                {qty.quantity + qty.foilQuantity}x
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

            <div className="p-2">
              <p className="text-xs font-semibold truncate">{card.name}</p>
              {card.subtitle && (
                <p className="text-xs text-gray-400 truncate">
                  {card.subtitle}
                </p>
              )}
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-gray-500">{card.rarity}</span>
                <span className="text-xs text-gray-600">·</span>
                <span className="text-xs text-gray-500">{card.inkCost} ink</span>
              </div>
              <p className="text-[10px] text-gray-600 truncate mt-0.5">
                {card.setName} (set {card.setCode})
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
