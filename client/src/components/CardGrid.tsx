import type { Card } from "../types";

interface CardGridProps {
  cards: Card[];
  onSelect: (card: Card) => void;
  ownedCardIds?: Set<string>;
  ownedQuantities?: Map<string, { quantity: number; foilQuantity: number }>;
}

const COLOR_CLASSES: Record<string, string> = {
  Amber: "border-lorcana-amber",
  Amethyst: "border-lorcana-amethyst",
  Emerald: "border-lorcana-emerald",
  Ruby: "border-lorcana-ruby",
  Sapphire: "border-lorcana-sapphire",
  Steel: "border-lorcana-steel",
};

export default function CardGrid({
  cards,
  onSelect,
  ownedCardIds,
  ownedQuantities,
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
            </div>
          </button>
        );
      })}
    </div>
  );
}
