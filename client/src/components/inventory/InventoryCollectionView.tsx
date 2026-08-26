import { useMemo } from "react";
import type { Card } from "../../types";
import CardGrid, { QuantityRow, cardIndexLabel } from "../CardGrid";
import FilterBar from "../FilterBar";
import {
  availableInventoryVariants,
  type InventoryCounts,
  type InventoryVariant,
  totalInventoryCount,
} from "../../utils/cardVariants";

export type InventoryViewMode = "grid" | "rows";

export interface InventoryCollectionCapabilities {
  canEditQuantities: boolean;
  canRemoveCards: boolean;
  canWipeInventory: boolean;
  canExportCsv: boolean;
  canSwitchViewMode: boolean;
}

export interface InventoryCollectionEntry extends InventoryCounts {
  id?: string;
  userId?: string;
  cardId?: string;
  card: Card;
}

interface InventoryCollectionViewProps {
  title: string;
  subtitle?: string;
  entries: InventoryCollectionEntry[];
  filters: Record<string, string>;
  onFiltersChange: (filters: Record<string, string>) => void;
  loading: boolean;
  emptyMessage: string;
  viewMode: InventoryViewMode;
  onViewModeChange?: (mode: InventoryViewMode) => void;
  capabilities: InventoryCollectionCapabilities;
  onSelectCard: (card: Card) => void;
  onExportCsv?: () => void;
  onWipeInventory?: () => void;
  onQuantityChange?: (card: Card, variant: InventoryVariant, delta: 1 | -1) => void;
  updatingQuantityKeys?: Set<string>;
  expandedId?: string | null;
  onExpandedIdChange?: (id: string | null) => void;
  onUpdateEntry?: (id: string, data: { quantity?: number; foilQuantity?: number; holofoilQuantity?: number }) => void;
  onRemoveEntry?: (id: string) => void;
}

export default function InventoryCollectionView({
  title,
  subtitle,
  entries,
  filters,
  onFiltersChange,
  loading,
  emptyMessage,
  viewMode,
  onViewModeChange,
  capabilities,
  onSelectCard,
  onExportCsv,
  onWipeInventory,
  onQuantityChange,
  updatingQuantityKeys,
  expandedId,
  onExpandedIdChange,
  onUpdateEntry,
  onRemoveEntry,
}: InventoryCollectionViewProps) {
  const cardList = useMemo(() => entries.map((entry) => entry.card), [entries]);

  const ownedCardIds = useMemo(
    () => new Set(entries.map((entry) => entry.cardId ?? entry.card.id)),
    [entries]
  );

  const ownedQuantities = useMemo(() => {
    const map = new Map<string, InventoryCounts>();
    for (const entry of entries) {
      map.set(entry.cardId ?? entry.card.id, {
        quantity: entry.quantity,
        foilQuantity: entry.foilQuantity,
        holofoilQuantity: entry.holofoilQuantity,
      });
    }
    return map;
  }, [entries]);

  const shouldUseRows = capabilities.canSwitchViewMode && viewMode === "rows";
  const canUseGridSteppers = capabilities.canEditQuantities && Boolean(onQuantityChange);

  return (
    <>
      <div className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {capabilities.canSwitchViewMode && onViewModeChange && (
              <div className="flex rounded-md border border-gray-700 overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => onViewModeChange("grid")}
                  className={`px-3 py-1.5 transition-colors ${
                    viewMode === "grid"
                      ? "bg-amber-600 text-black font-semibold"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange("rows")}
                  className={`px-3 py-1.5 border-l border-gray-700 transition-colors ${
                    viewMode === "rows"
                      ? "bg-amber-600 text-black font-semibold"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  Rows
                </button>
              </div>
            )}
            {capabilities.canExportCsv && onExportCsv && (
              <button
                type="button"
                onClick={onExportCsv}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-sm px-3 py-1.5 rounded-md transition-colors text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 6.414V19a2 2 0 01-2 2z" />
                </svg>
                CSV
              </button>
            )}
            {capabilities.canWipeInventory && onWipeInventory && (
              <button
                type="button"
                onClick={onWipeInventory}
                className="flex items-center gap-1.5 bg-red-900/30 hover:bg-red-900/50 text-sm px-3 py-1.5 rounded-md transition-colors text-red-400 border border-red-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Wipe
              </button>
            )}
          </div>
        </div>
        <FilterBar filters={filters} onChange={onFiltersChange} />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center text-gray-500 py-12">{emptyMessage}</div>
      ) : shouldUseRows ? (
        <div className="px-3 space-y-2 pb-4">
          {entries.map((entry) => {
            const card = entry.card;
            const entryId = entry.id ?? entry.cardId ?? card.id;
            const isExpanded = expandedId === entryId;
            const variants = availableInventoryVariants(card);
            const showNormal = variants.includes("normal") || entry.quantity > 0;
            const showFoil = variants.includes("foil") || entry.foilQuantity > 0;
            const showHolofoil = variants.includes("holofoil") || entry.holofoilQuantity > 0;
            const canEditRows = capabilities.canEditQuantities && Boolean(entry.id) && Boolean(onUpdateEntry);

            return (
              <div key={entryId} className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => onExpandedIdChange?.(isExpanded ? null : entryId)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-12 h-16 object-cover rounded cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all"
                      loading="lazy"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCard(card);
                      }}
                    />
                  ) : (
                    <div className="w-12 h-16 bg-gray-800 rounded flex items-center justify-center text-xs text-gray-500">?</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{card.name}</p>
                    {card.subtitle && <p className="text-sm text-gray-400 truncate">{card.subtitle}</p>}
                    <div className="flex gap-2 text-xs text-gray-500 mt-1">
                      <span>{card.color}</span>
                      <span>·</span>
                      <span>{card.setName}</span>
                      <span>·</span>
                      <span>{card.rarity}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{totalInventoryCount(entry)}x</p>
                    {entry.quantity > 0 && <p className="text-xs text-gray-400">{entry.quantity}x normal</p>}
                    {entry.foilQuantity > 0 && <p className="text-xs text-amber-400">{entry.foilQuantity}x foil</p>}
                    {entry.holofoilQuantity > 0 && <p className="text-xs text-purple-300">{entry.holofoilQuantity}x holofoil</p>}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-800 p-3 space-y-3">
                    <div className="flex items-center justify-between rounded-md bg-gray-950/60 border border-gray-800 px-3 py-2">
                      <span className="text-xs uppercase tracking-wide text-gray-500">Index</span>
                      <span className="text-sm font-semibold text-amber-300">{cardIndexLabel(card)}</span>
                    </div>

                    {canEditRows && entry.id && (
                      <div className="max-w-sm space-y-1 rounded-md border border-gray-800 bg-black/20 p-2">
                        {showNormal && (
                          <QuantityRow
                            label="Normal"
                            count={entry.quantity}
                            disableIncrease={!variants.includes("normal")}
                            onDecrease={() => onUpdateEntry?.(entry.id!, { quantity: Math.max(0, entry.quantity - 1) })}
                            onIncrease={() => onUpdateEntry?.(entry.id!, { quantity: entry.quantity + 1 })}
                          />
                        )}
                        {showFoil && (
                          <QuantityRow
                            label="Foil"
                            count={entry.foilQuantity}
                            disableIncrease={!variants.includes("foil")}
                            onDecrease={() => onUpdateEntry?.(entry.id!, { foilQuantity: Math.max(0, entry.foilQuantity - 1) })}
                            onIncrease={() => onUpdateEntry?.(entry.id!, { foilQuantity: entry.foilQuantity + 1 })}
                          />
                        )}
                        {showHolofoil && (
                          <QuantityRow
                            label="Holofoil"
                            count={entry.holofoilQuantity}
                            disableIncrease={!variants.includes("holofoil")}
                            onDecrease={() => onUpdateEntry?.(entry.id!, { holofoilQuantity: Math.max(0, entry.holofoilQuantity - 1) })}
                            onIncrease={() => onUpdateEntry?.(entry.id!, { holofoilQuantity: entry.holofoilQuantity + 1 })}
                          />
                        )}
                      </div>
                    )}

                    {capabilities.canRemoveCards && entry.id && onRemoveEntry && (
                      <button
                        type="button"
                        onClick={() => onRemoveEntry(entry.id!)}
                        className="text-red-400 hover:text-red-300 text-sm transition-colors"
                      >
                        Remove from collection
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <CardGrid
          cards={cardList}
          onSelect={onSelectCard}
          ownedCardIds={ownedCardIds}
          ownedQuantities={ownedQuantities}
          onQuantityChange={canUseGridSteppers ? onQuantityChange : undefined}
          updatingQuantityKeys={updatingQuantityKeys}
        />
      )}
    </>
  );
}
