import { useState } from "react";
import type { InventoryExtrasCard, InventoryVariant } from "../../types";
import { VARIANT_LABELS, formatReferencePrice, variantQuantity } from "./extrasUi";

const variants: InventoryVariant[] = ["normal", "foil", "holofoil"];

interface SuggestedExtrasPanelProps {
  cards: InventoryExtrasCard[];
  autoSuggestExtras: boolean;
  onList: (card: InventoryExtrasCard, variant: InventoryVariant, desiredQuantity: number, note: string) => Promise<void> | void;
  onOverride: (card: InventoryExtrasCard, keep: { keepNormalQuantity: number; keepFoilQuantity: number; keepHolofoilQuantity: number }) => Promise<void> | void;
}

export default function SuggestedExtrasPanel({ cards, autoSuggestExtras, onList, onOverride }: SuggestedExtrasPanelProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [overrideCardId, setOverrideCardId] = useState<string | null>(null);
  const activeOverride = cards.find((item) => item.card.id === overrideCardId);

  if (!autoSuggestExtras) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
        Auto-suggest is off. Turn it on in Settings to show calculated Suggested Extras.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cards.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
          No suggested extras based on your current keep rules.
        </div>
      ) : cards.map((item) => (
        <div key={item.card.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex gap-4">
            <img src={item.card.imageUrl} alt={item.card.name} className="h-28 w-20 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-100">{item.card.name}</h3>
                  {item.card.subtitle && <p className="text-sm text-gray-400">{item.card.subtitle}</p>}
                  <p className="text-xs text-gray-500">{item.card.cardNumber}</p>
                </div>
                <button type="button" onClick={() => setOverrideCardId(item.card.id)} className="text-sm text-amber-400 hover:text-amber-300">
                  Set keep override
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {variants.map((variant) => {
                  const available = variantQuantity(item.availableToList, variant);
                  if (available <= 0) return null;
                  const key = `${item.card.id}:${variant}`;
                  const desired = quantities[key] ?? available;
                  return (
                    <div key={variant} className="rounded border border-gray-800 bg-gray-950 p-3 text-sm">
                      <div className="font-medium text-gray-200">{VARIANT_LABELS[variant]}</div>
                      <div className="mt-1 text-gray-400">Owned {variantQuantity(item.owned, variant)} · Keep {variantQuantity(item.keep, variant)} · Extra {variantQuantity(item.extras, variant)}</div>
                      <div className="mt-1 text-gray-400">Reference price: {formatReferencePrice(item.referencePrices[variant])}</div>
                      <label className="mt-2 block text-gray-300">
                        Qty
                        <input
                          type="number"
                          min={1}
                          max={available}
                          value={desired}
                          onChange={(event) => setQuantities((current) => ({ ...current, [key]: Number(event.target.value) }))}
                          className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1"
                        />
                      </label>
                      <label className="mt-2 block text-gray-300">
                        Note
                        <input
                          value={notes[key] ?? ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
                          className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1"
                          placeholder="Optional"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onList(item, variant, Math.min(Math.max(1, desired), available), notes[key] ?? "")}
                        className="mt-3 w-full rounded bg-amber-500 px-3 py-2 font-semibold text-gray-950 hover:bg-amber-400"
                      >
                        List {Math.min(Math.max(1, desired), available)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ))}

      {activeOverride && (
        <RetentionOverrideDialog
          card={activeOverride}
          onClose={() => setOverrideCardId(null)}
          onSave={async (keep) => {
            await onOverride(activeOverride, keep);
            setOverrideCardId(null);
          }}
        />
      )}
    </div>
  );
}

function RetentionOverrideDialog({
  card,
  onClose,
  onSave,
}: {
  card: InventoryExtrasCard;
  onClose: () => void;
  onSave: (keep: { keepNormalQuantity: number; keepFoilQuantity: number; keepHolofoilQuantity: number }) => Promise<void> | void;
}) {
  const [keep, setKeep] = useState({
    keepNormalQuantity: card.keep.quantity,
    keepFoilQuantity: card.keep.foilQuantity,
    keepHolofoilQuantity: card.keep.holofoilQuantity,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-4 shadow-xl">
        <h3 className="text-lg font-semibold">Keep override: {card.card.name}</h3>
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
                value={keep[key as keyof typeof keep]}
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
