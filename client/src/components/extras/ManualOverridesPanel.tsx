import { useState } from "react";
import type { CardRetentionOverrideListItem, InventoryPolicy } from "../../types";
import ExtrasFilterBar from "./ExtrasFilterBar";
import RetentionOverrideDialog, { RetentionKeep } from "./RetentionOverrideDialog";
import { cardMatchesFilters, deriveExtrasFilterOptions, EMPTY_EXTRAS_FILTERS, ExtrasFilters } from "./extrasUi";

interface ManualOverridesPanelProps {
  overrides: CardRetentionOverrideListItem[];
  policy: InventoryPolicy;
  onSave: (cardId: string, keep: RetentionKeep) => Promise<void> | void;
  onRemove: (cardId: string) => Promise<void> | void;
}

function keepLabel(value: number | null, fallback: number): string {
  return value == null ? `default (${fallback})` : String(value);
}

export default function ManualOverridesPanel({ overrides, policy, onSave, onRemove }: ManualOverridesPanelProps) {
  const [filters, setFilters] = useState<ExtrasFilters>(EMPTY_EXTRAS_FILTERS);
  const [editing, setEditing] = useState<CardRetentionOverrideListItem | null>(null);

  const filtered = overrides.filter((o) => cardMatchesFilters(o.card, filters));
  const filterOptions = deriveExtrasFilterOptions(overrides.map((o) => o.card));

  if (overrides.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
        No manual keep overrides yet. Set one from Suggested Extras.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ExtrasFilterBar filters={filters} onChange={setFilters} options={filterOptions} searchPlaceholder="Search overrides..." />
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
          No overrides match your search or filters.
        </div>
      ) : filtered.map((override) => (
        <div key={override.cardId} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex gap-4">
            <img src={override.card.imageUrl} alt={override.card.name} className="h-24 w-16 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-100">{override.card.name}</h3>
                  {override.card.subtitle && <p className="text-sm text-gray-400">{override.card.subtitle}</p>}
                  <p className="text-xs text-gray-500">{override.card.cardNumber}</p>
                </div>
                <div className="text-right text-sm text-gray-400">
                  <div>Normal: <span className="text-gray-200">{keepLabel(override.keepNormalQuantity, policy.keepNormalQuantity)}</span></div>
                  <div>Foil: <span className="text-gray-200">{keepLabel(override.keepFoilQuantity, policy.keepFoilQuantity)}</span></div>
                  <div>Holofoil: <span className="text-gray-200">{keepLabel(override.keepHolofoilQuantity, policy.keepHolofoilQuantity)}</span></div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(override)}
                  className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(override.cardId)}
                  className="rounded border border-red-900 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {editing && (
        <RetentionOverrideDialog
          cardName={editing.card.name}
          initial={{
            keepNormalQuantity: editing.keepNormalQuantity ?? policy.keepNormalQuantity,
            keepFoilQuantity: editing.keepFoilQuantity ?? policy.keepFoilQuantity,
            keepHolofoilQuantity: editing.keepHolofoilQuantity ?? policy.keepHolofoilQuantity,
          }}
          onClose={() => setEditing(null)}
          onSave={async (keep) => {
            await onSave(editing.cardId, keep);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
