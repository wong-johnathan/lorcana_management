import { useState } from "react";
import type { Card } from "../types";

interface CardDetailProps {
  card: Card;
  onClose: () => void;
  onAdd?: (cardId: string, quantity: number, foilQuantity: number) => void;
  currentQuantity?: { quantity: number; foilQuantity: number };
}

export default function CardDetail({
  card,
  onClose,
  onAdd,
  currentQuantity,
}: CardDetailProps) {
  const [quantity, setQuantity] = useState("1");
  const [foilQuantity, setFoilQuantity] = useState("0");
  const [added, setAdded] = useState(false);

  const qtyNum = parseInt(quantity) || 0;
  const foilNum = parseInt(foilQuantity) || 0;

  const handleAdd = () => {
    if (onAdd && (qtyNum > 0 || foilNum > 0)) {
      onAdd(card.id, qtyNum, foilNum);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start p-4 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-bold">{card.name}</h2>
            {card.subtitle && (
              <p className="text-gray-400">{card.subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 flex flex-col md:flex-row gap-4">
          <div className="md:w-1/2">
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={card.name}
                className="w-full rounded-lg"
              />
            ) : (
              <div className="w-full aspect-[2/3] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
                No image
              </div>
            )}
          </div>

          <div className="md:w-1/2 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Color</span>
                <p className="font-medium">{card.color}</p>
              </div>
              <div>
                <span className="text-gray-500">Set</span>
                <p className="font-medium">{card.setName}</p>
              </div>
              <div>
                <span className="text-gray-500">Rarity</span>
                <p className="font-medium">{card.rarity}</p>
              </div>
              <div>
                <span className="text-gray-500">Ink Cost</span>
                <p className="font-medium">{card.inkCost}</p>
              </div>
              <div>
                <span className="text-gray-500">Strength</span>
                <p className="font-medium">{card.strength}</p>
              </div>
              <div>
                <span className="text-gray-500">Willpower</span>
                <p className="font-medium">{card.willpower}</p>
              </div>
              {card.lore > 0 && (
                <div>
                  <span className="text-gray-500">Lore</span>
                  <p className="font-medium">{card.lore}</p>
                </div>
              )}
              <div>
                <span className="text-gray-500">Card #</span>
                <p className="font-medium">{card.cardNumber}</p>
              </div>
            </div>

            {card.types.length > 0 && (
              <div>
                <span className="text-gray-500 text-sm">Types</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {card.types.map((t) => (
                    <span
                      key={t}
                      className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {card.cardType && (
              <div>
                <span className="text-gray-500 text-sm">Card Type</span>
                <p className="text-sm font-medium">{card.cardType}</p>
              </div>
            )}

            {card.abilities && (
              <div>
                <span className="text-gray-500 text-sm">Abilities</span>
                <p className="text-sm mt-1 whitespace-pre-wrap">
                  {card.abilities}
                </p>
              </div>
            )}

            {currentQuantity && (
              <div className="bg-gray-800 rounded-md p-2 text-sm">
                <span className="text-gray-400">In your collection: </span>
                <span className="font-medium">
                  {currentQuantity.quantity} normal
                  {currentQuantity.foilQuantity > 0 &&
                    `, ${currentQuantity.foilQuantity} foil`}
                </span>
              </div>
            )}

            {onAdd && (
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">
                      Normal qty
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      onBlur={() => setQuantity(String(qtyNum))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">
                      Foil qty
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={foilQuantity}
                      onChange={(e) => setFoilQuantity(e.target.value)}
                      onBlur={() => setFoilQuantity(String(foilNum))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAdd}
                  disabled={qtyNum === 0 && foilNum === 0}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold py-2 rounded-md transition-colors"
                >
                  {added ? "Added!" : "Add to Inventory"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
