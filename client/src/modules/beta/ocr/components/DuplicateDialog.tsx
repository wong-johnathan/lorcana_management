// components/DuplicateDialog.tsx
import { useState } from "react";
import type { ScanEntry } from "../services/types";

interface Props {
  existing: ScanEntry;
  onIncrease: (newQuantity: number) => void;
  onReplace: (newQuantity: number) => void;
  onSkip: () => void;
}

export default function DuplicateDialog({ existing, onIncrease, onReplace, onSkip }: Props) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/80" onClick={onSkip} />

      <div className="relative bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4">
        <div className="text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <h3 className="font-bold text-lg">Already Scanned</h3>
          <p className="text-sm text-gray-400">
            {existing.name}{existing.subtitle ? ` — ${existing.subtitle}` : ""}
          </p>
          <p className="text-sm text-amber-400 mt-1">
            Current quantity: {existing.quantity}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5 text-center">
            Quantity to add
          </label>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-md text-lg"
            >
              −
            </button>
            <span className="w-12 text-center text-lg font-semibold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-md text-lg"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg text-sm transition-colors"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => onReplace(quantity)}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-lg text-sm transition-colors"
          >
            Replace ({quantity})
          </button>
          <button
            type="button"
            onClick={() => onIncrease(existing.quantity + quantity)}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            Add (+{quantity})
          </button>
        </div>
      </div>
    </div>
  );
}
