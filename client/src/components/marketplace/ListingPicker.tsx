import { useMemo } from "react";
import type { Card, InventoryEntry, InventoryPolicy } from "../../types";
import CardGrid from "../CardGrid";
import FilterBar from "../FilterBar";
import { totalInventoryCount, type InventoryCounts } from "../../utils/cardVariants";
import {
  filterOwnedInventory,
  ownedFilterOptions,
  surplusByCardId,
} from "../../utils/listingPicker";

interface ListingPickerProps {
  /** Full inventory already held by the sell page (owned-only is derived here). */
  inventory: InventoryEntry[];
  policy: InventoryPolicy | null;
  loading: boolean;
  /** Controlled filter state, lifted to the page so it survives Back/forward. */
  filters: Record<string, string>;
  onFiltersChange: (filters: Record<string, string>) => void;
  onSelectCard: (card: Card) => void;
  onCancel: () => void;
}

/**
 * Step 1 of the two-step create flow (REQ-UX-1..4): a visual owned-card grid
 * driven by the shared FilterBar (search + set/rarity/color) with client-side
 * filtering only — no new network request (AC-UX-2.3).
 */
export default function ListingPicker({
  inventory,
  policy,
  loading,
  filters,
  onFiltersChange,
  onSelectCard,
  onCancel,
}: ListingPickerProps) {
  const ownedEntries = useMemo(
    () => filterOwnedInventory(inventory, filters),
    [inventory, filters]
  );

  const cards = useMemo(() => ownedEntries.map((entry) => entry.card), [ownedEntries]);

  const ownedCardIds = useMemo(
    () => new Set(ownedEntries.map((entry) => entry.cardId)),
    [ownedEntries]
  );

  const ownedQuantities = useMemo(() => {
    const map = new Map<string, InventoryCounts>();
    for (const entry of ownedEntries) {
      map.set(entry.cardId, {
        quantity: entry.quantity,
        foilQuantity: entry.foilQuantity,
        holofoilQuantity: entry.holofoilQuantity,
      });
    }
    return map;
  }, [ownedEntries]);

  const surplus = useMemo(() => surplusByCardId(ownedEntries, policy), [ownedEntries, policy]);

  const options = useMemo(() => ownedFilterOptions(inventory), [inventory]);

  const hasOwnedCards = useMemo(
    () => inventory.some((entry) => totalInventoryCount(entry) > 0),
    [inventory]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-100">Choose a card to list</h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500"
        >
          Cancel
        </button>
      </div>

      <FilterBar
        mode="picker"
        optionSource={options}
        filters={filters}
        onChange={onFiltersChange}
      />

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          Loading your collection…
        </div>
      ) : !hasOwnedCards ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          You have no cards in your collection. Add cards to your collection to list them for sale.
        </div>
      ) : (
        <CardGrid
          cards={cards}
          onSelect={onSelectCard}
          ownedCardIds={ownedCardIds}
          ownedQuantities={ownedQuantities}
          showSetName
          surplusByCardId={surplus}
        />
      )}
    </div>
  );
}
