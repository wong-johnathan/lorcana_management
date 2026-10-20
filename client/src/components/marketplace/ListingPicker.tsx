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
  /**
   * Card ids the seller already has on the market. Cards in this set are hidden
   * while "Unlisted only" is ticked, which is the default.
   */
  listedCardIds?: Set<string>;
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
 *
 * Cards the seller already has listed are hidden by default ("Unlisted only"),
 * so the picker leads with something to do; unticking it includes them.
 */
export default function ListingPicker({
  inventory,
  policy,
  loading,
  listedCardIds,
  filters,
  onFiltersChange,
  onSelectCard,
  onCancel,
}: ListingPickerProps) {
  const surplus = useMemo(() => surplusByCardId(inventory, policy), [inventory, policy]);

  const ownedEntries = useMemo(
    () => filterOwnedInventory(inventory, filters, surplus),
    [inventory, filters, surplus]
  );

  const includeListed = filters.includeListed === "1";

  const visibleEntries = useMemo(() => {
    if (includeListed || !listedCardIds) return ownedEntries;
    return ownedEntries.filter((entry) => !listedCardIds.has(entry.cardId));
  }, [ownedEntries, includeListed, listedCardIds]);

  const hiddenListedCount = ownedEntries.length - visibleEntries.length;

  const cards = useMemo(() => visibleEntries.map((entry) => entry.card), [visibleEntries]);

  const ownedCardIds = useMemo(
    () => new Set(visibleEntries.map((entry) => entry.cardId)),
    [visibleEntries]
  );

  const ownedQuantities = useMemo(() => {
    const map = new Map<string, InventoryCounts>();
    for (const entry of visibleEntries) {
      map.set(entry.cardId, {
        quantity: entry.quantity,
        foilQuantity: entry.foilQuantity,
        holofoilQuantity: entry.holofoilQuantity,
      });
    }
    return map;
  }, [visibleEntries]);

  const options = useMemo(() => ownedFilterOptions(inventory), [inventory]);

  const hasOwnedCards = useMemo(
    () => inventory.some((entry) => totalInventoryCount(entry) > 0),
    [inventory]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-100">Choose a card to list</h2>
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
        sparesDisabled={policy === null}
        showListedToggle={listedCardIds !== undefined}
        listedHiddenCount={hiddenListedCount}
      />

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          Loading your collection…
        </div>
      ) : !hasOwnedCards ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          You have no cards in your collection. Add cards to your collection to list them for sale.
        </div>
      ) : filters.spares === "1" && cards.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          No spare cards found — you don't hold more copies than your keep policy for any matching card.
        </div>
      ) : cards.length === 0 && hiddenListedCount > 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          {hiddenListedCount === 1
            ? "The only matching card is already listed."
            : `All ${hiddenListedCount} matching cards are already listed.`}{" "}
          Untick “Unlisted only” to add another listing for the same card.
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
