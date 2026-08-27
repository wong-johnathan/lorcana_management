import { useState } from "react";

export interface RetentionKeep {
  keepNormalQuantity: number;
  keepFoilQuantity: number;
  keepHolofoilQuantity: number;
}

interface RetentionOverrideDialogProps {
  cardName: string;
  initial: RetentionKeep;
  onClose: () => void;
  onSave: (keep: RetentionKeep) => Promise<void> | void;
}

export default function RetentionOverrideDialog({ cardName, initial, onClose, onSave }: RetentionOverrideDialogProps) {
  const [keep, setKeep] = useState<RetentionKeep>({
    keepNormalQuantity: initial.keepNormalQuantity,
    keepFoilQuantity: initial.keepFoilQuantity,
    keepHolofoilQuantity: initial.keepHolofoilQuantity,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-4 shadow-xl">
        <h3 className="text-lg font-semibold">Keep override: {cardName}</h3>
        <p className="mt-1 text-sm text-gray-400">Set zero if you do not want to keep this card before listing extras.</p>
        <div className="mt-4 grid gap-3">
          {[
            ["keepNormalQuantity", "Keep normal"],
            ["keepFoilQuantity", "Keep foil"],
            ["keepHolofoilQuantity", "Keep holofoil"],
          ].map(([key, label]) => (
            <label key={key} className="text-sm text-gray-300">
              {label}
              <input
                type="number"
                min={0}
                value={keep[key as keyof RetentionKeep]}
                onChange={(event) => setKeep((current) => ({ ...current, [key]: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={() => onSave(keep)} className="rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400">Save override</button>
        </div>
      </div>
    </div>
  );
}
