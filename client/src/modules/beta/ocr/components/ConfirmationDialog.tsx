// components/ConfirmationDialog.tsx
import { useState } from "react";
import type { ScanEntry } from "../services/types";

interface Props {
  entry: ScanEntry;
  onSaveNext: (entry: ScanEntry) => void;
  onRescan: () => void;
}

const FINISHES = ["Normal", "Cold Foil", "Enchanted"];

export default function ConfirmationDialog({ entry, onSaveNext, onRescan }: Props) {
  const [finish, setFinish] = useState(entry.finish);
  const [quantity, setQuantity] = useState(1);

  const handleSave = () => {
    onSaveNext({ ...entry, finish, quantity });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/80" onClick={onRescan} />

      <div className="relative bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        {/* Card image + info */}
        <div className="flex gap-4">
          {entry.imageUrl ? (
            <img src={entry.imageUrl} alt={entry.name} className="w-24 h-36 object-cover rounded-lg" />
          ) : (
            <div className="w-24 h-36 bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-xs">
              No image
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="font-bold text-lg truncate">{entry.name}</h3>
            {entry.subtitle && <p className="text-sm text-gray-400 truncate">{entry.subtitle}</p>}
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="px-2 py-0.5 bg-gray-800 rounded">{entry.color}</span>
              <span className="px-2 py-0.5 bg-gray-800 rounded">Ink: {entry.inkCost}</span>
              {entry.inkCost > 0 && <span className="px-2 py-0.5 bg-gray-800 rounded">Inkable</span>}
              <span className="px-2 py-0.5 bg-gray-800 rounded">{entry.cardType}</span>
              <span className="px-2 py-0.5 bg-gray-800 rounded">{entry.rarity}</span>
            </div>
            <p className="text-xs text-gray-500">{entry.setName} — {entry.cardNumber}</p>
          </div>
        </div>

        {/* Finish selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Finish</label>
          <div className="flex gap-2">
            {FINISHES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFinish(f as ScanEntry["finish"])}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  finish === f
                    ? f === "Enchanted" ? "bg-purple-500 text-white"
                      : f === "Cold Foil" ? "bg-blue-500 text-white"
                      : "bg-amber-500 text-black"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Quantity</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-md text-lg transition-colors"
            >
              −
            </button>
            <span className="w-12 text-center text-lg font-semibold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-md text-lg transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onRescan}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 rounded-lg transition-colors"
          >
            Rescan
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 rounded-lg transition-colors"
          >
            Save & Next
          </button>
        </div>
      </div>
    </div>
  );
}
