import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState("1");
  const [foilQuantity, setFoilQuantity] = useState("0");
  const [added, setAdded] = useState(false);

  const shortNumber = card.cardNumber.split("•")[0]?.trim() || card.cardNumber;

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
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
            {/* Market links */}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <a
                  href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}&LH_Sold=1&LH_Complete=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs bg-green-700/30 hover:bg-green-700/50 text-green-400 border border-green-700/50 rounded-md px-2 py-1.5 transition-colors"
                >
                  💰 Sold
                </a>
                <a
                  href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs bg-blue-700/30 hover:bg-blue-700/50 text-blue-400 border border-blue-700/50 rounded-md px-2 py-1.5 transition-colors"
                >
                  🛒 Active
                </a>
                <a
                  href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}&_sacat=0&_from=R40&rt=nc&LH_Auction=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs bg-amber-700/30 hover:bg-amber-700/50 text-amber-400 border border-amber-700/50 rounded-md px-2 py-1.5 transition-colors"
                >
                  🔨 Auction
                </a>
              </div>
              <a
                href={`https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(`${card.name} - ${card.subtitle}`)}&view=grid`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs bg-purple-700/30 hover:bg-purple-700/50 text-purple-300 border border-purple-700/50 rounded-md px-3 py-1.5 transition-colors"
              >
                📊 TCGPlayer
              </a>
              <a
                href={`https://www.facebook.com/search/top?q=${encodeURIComponent(`${card.name} - ${card.subtitle}`)}&filters=${encodeURIComponent(btoa(JSON.stringify({"recent_posts:0": JSON.stringify({ name: "recent_posts", args: "" })})))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs bg-sky-700/30 hover:bg-sky-700/50 text-sky-400 border border-sky-700/50 rounded-md px-3 py-1.5 transition-colors"
              >
                📘 Facebook
              </a>
            </div>

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
              <div className="space-y-2">
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

            <button
              onClick={() => { onClose(); navigate(`/database/${card.id}`); }}
              className="w-full text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-md px-3 py-2 transition-colors"
            >
              View more →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
