import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { inventory as inventoryApi, cards as cardsApi } from "../services/api";
import type { Card, InventoryEntry, InventoryStats } from "../types";
import FilterBar from "../components/FilterBar";
import CardGrid from "../components/CardGrid";
import CardDetail from "../components/CardDetail";
import {
  availableInventoryVariants,
  type InventoryCounts,
  type InventoryVariant,
  totalInventoryCount,
} from "../utils/cardVariants";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type InventoryViewMode = "grid" | "rows";

function getInitialViewMode(): InventoryViewMode {
  if (typeof window === "undefined") return "rows";
  return localStorage.getItem("inventoryViewMode") === "grid" ? "grid" : "rows";
}

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const [viewMode, setViewMode] = useState<InventoryViewMode>(getInitialViewMode);
  const [updatingQuantityKeys, setUpdatingQuantityKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);

  const cardId = searchParams.get("card");

  useEffect(() => {
    if (cardId) {
      cardsApi.get(cardId).then(setDetailCard).catch(() => setDetailCard(null));
    } else {
      setDetailCard(null);
    }
  }, [cardId]);

  const entryByCardId = useMemo(() => {
    const map = new Map<string, InventoryCounts & { entryId: string }>();
    for (const e of entries) {
      map.set(e.cardId, {
        quantity: e.quantity,
        foilQuantity: e.foilQuantity,
        holofoilQuantity: e.holofoilQuantity,
        entryId: e.id,
      });
    }
    return map;
  }, [entries]);

  const cardList = useMemo(() => entries.map((entry) => entry.card), [entries]);

  const ownedCardIds = useMemo(
    () => new Set(entries.map((entry) => entry.cardId)),
    [entries]
  );

  useEffect(() => {
    localStorage.setItem("inventoryViewMode", viewMode);
  }, [viewMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { ...filters };
      const [entriesData, statsData] = await Promise.all([
        inventoryApi.list(params),
        inventoryApi.stats(),
      ]);
      setEntries(entriesData);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to load inventory:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdate = async (
    id: string,
    data: { quantity?: number; foilQuantity?: number; holofoilQuantity?: number }
  ) => {
    try {
      await inventoryApi.update(id, data);
      await load();
    } catch (err) {
      console.error("Failed to update:", err);
    }
  };

  const handleGridQuantityChange = async (
    card: Card,
    variant: InventoryVariant,
    delta: 1 | -1
  ) => {
    const entry = entryByCardId.get(card.id);
    if (!entry) return;

    const key = `${card.id}:${variant}`;
    setUpdatingQuantityKeys((prev) => new Set(prev).add(key));

    const next = {
      quantity: entry.quantity,
      foilQuantity: entry.foilQuantity,
      holofoilQuantity: entry.holofoilQuantity,
    };

    if (variant === "normal") next.quantity = Math.max(0, next.quantity + delta);
    if (variant === "foil") next.foilQuantity = Math.max(0, next.foilQuantity + delta);
    if (variant === "holofoil") next.holofoilQuantity = Math.max(0, next.holofoilQuantity + delta);

    try {
      if (totalInventoryCount(next) === 0) {
        await inventoryApi.remove(entry.entryId);
      } else {
        await inventoryApi.update(entry.entryId, next);
      }
      await load();
    } catch (err) {
      console.error("Failed to update grid quantity:", err);
    } finally {
      setUpdatingQuantityKeys((prev) => {
        const updated = new Set(prev);
        updated.delete(key);
        return updated;
      });
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await inventoryApi.remove(id);
      await load();
    } catch (err) {
      console.error("Failed to remove:", err);
    }
  };

  const handleExport = () => {
    const token = localStorage.getItem("token");
    const url = "/api/inventory/export/csv";
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "lorcana_collection.csv";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error("Export failed:", err));
  };

  const handleWipe = async () => {
    try {
      const result = await inventoryApi.wipe();
      setWipeConfirmOpen(false);
      await load();
    } catch (err) {
      console.error("Failed to wipe inventory:", err);
    }
  };

  const handleSelectCard = (card: Card) => {
    const params = new URLSearchParams(searchParams);
    params.set("card", card.id);
    setSearchParams(params);
  };

  const handleCloseDetail = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("card");
    setSearchParams(params, { replace: true });
  };

  return (
    <div>
      {stats && (
        <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-900 rounded-lg p-3">
            <p className="text-xs text-gray-500">Unique Cards</p>
            <p className="text-2xl font-bold text-amber-400">
              {stats.totalUnique}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <p className="text-xs text-gray-500">Total Cards</p>
            <p className="text-2xl font-bold text-amber-400">
              {stats.totalCards}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <p className="text-xs text-gray-500">Total Value</p>
            <p className="text-2xl font-bold text-emerald-400">
              {currencyFormatter.format(stats.totalValue ?? 0)}
            </p>
            {(stats.missingPriceCount ?? 0) > 0 && (
              <p className="text-[10px] text-gray-500 mt-1">
                Excludes {stats.missingPriceCount} card{stats.missingPriceCount === 1 ? "" : "s"} missing market price
              </p>
            )}
          </div>
          {stats.setBreakdown.map((s) => (
            <div key={s.setName} className="bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500 truncate">{s.setName}</p>
              <p className="text-lg font-semibold">
                {s.owned}
                <span className="text-gray-500 text-sm">/{s.total}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-lg font-semibold">My Collection</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-gray-700 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
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
                onClick={() => setViewMode("rows")}
                className={`px-3 py-1.5 border-l border-gray-700 transition-colors ${
                  viewMode === "rows"
                    ? "bg-amber-600 text-black font-semibold"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                Rows
              </button>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-sm px-3 py-1.5 rounded-md transition-colors text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV
            </button>
            <button
              onClick={() => setWipeConfirmOpen(true)}
              className="flex items-center gap-1.5 bg-red-900/30 hover:bg-red-900/50 text-sm px-3 py-1.5 rounded-md transition-colors text-red-400 border border-red-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Wipe
            </button>
          </div>
        </div>
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No cards in your inventory yet. Add cards from the database.
        </div>
      ) : viewMode === "grid" ? (
        <CardGrid
          cards={cardList}
          onSelect={handleSelectCard}
          ownedCardIds={ownedCardIds}
          ownedQuantities={entryByCardId}
          onQuantityChange={handleGridQuantityChange}
          updatingQuantityKeys={updatingQuantityKeys}
        />
      ) : (
        <div className="px-3 space-y-2 pb-4">
          {entries.map((entry) => {
            const card = entry.card;
            const isExpanded = expandedId === entry.id;
            const variants = availableInventoryVariants(card);
            const showNormal = variants.includes("normal") || entry.quantity > 0;
            const showFoil = variants.includes("foil") || entry.foilQuantity > 0;
            const showHolofoil = variants.includes("holofoil") || entry.holofoilQuantity > 0;

            return (
              <div
                key={entry.id}
                className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : entry.id)
                  }
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
                        handleSelectCard(card);
                      }}
                    />
                  ) : (
                    <div className="w-12 h-16 bg-gray-800 rounded flex items-center justify-center text-xs text-gray-500">
                      ?
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{card.name}</p>
                    {card.subtitle && (
                      <p className="text-sm text-gray-400 truncate">
                        {card.subtitle}
                      </p>
                    )}
                    <div className="flex gap-2 text-xs text-gray-500 mt-1">
                      <span>{card.color}</span>
                      <span>·</span>
                      <span>{card.setName}</span>
                      <span>·</span>
                      <span>{card.rarity}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {totalInventoryCount(entry)}x
                    </p>
                    {entry.quantity > 0 && (
                      <p className="text-xs text-gray-400">
                        {entry.quantity}x normal
                      </p>
                    )}
                    {entry.foilQuantity > 0 && (
                      <p className="text-xs text-amber-400">
                        {entry.foilQuantity}x foil
                      </p>
                    )}
                    {entry.holofoilQuantity > 0 && (
                      <p className="text-xs text-purple-300">
                        {entry.holofoilQuantity}x holofoil
                      </p>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-800 p-3 space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {card.types.map((t) => (
                        <span
                          key={t}
                          className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm text-center">
                      <div>
                        <span className="text-gray-500 text-xs block">Ink</span>
                        {card.inkCost}
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs block">STR</span>
                        {card.strength}
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs block">WIL</span>
                        {card.willpower}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {showNormal && (
                      <div className="flex-1 min-w-24">
                        <label className="text-xs text-gray-500">Normal</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleUpdate(entry.id, {
                                quantity: Math.max(0, entry.quantity - 1),
                              })
                            }
                            className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center hover:bg-gray-700"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-medium">
                            {entry.quantity}
                          </span>
                          <button
                            onClick={() =>
                              handleUpdate(entry.id, {
                                quantity: entry.quantity + 1,
                              })
                            }
                            disabled={!variants.includes("normal")}
                            className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      )}
                      {showFoil && (
                      <div className="flex-1 min-w-24">
                        <label className="text-xs text-gray-500">Foil</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleUpdate(entry.id, {
                                foilQuantity: Math.max(
                                  0,
                                  entry.foilQuantity - 1
                                ),
                              })
                            }
                            className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center hover:bg-gray-700"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-medium">
                            {entry.foilQuantity}
                          </span>
                          <button
                            onClick={() =>
                              handleUpdate(entry.id, {
                                foilQuantity: entry.foilQuantity + 1,
                              })
                            }
                            disabled={!variants.includes("foil")}
                            className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      )}
                      {showHolofoil && (
                      <div className="flex-1 min-w-24">
                        <label className="text-xs text-gray-500">Holofoil</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleUpdate(entry.id, {
                                holofoilQuantity: Math.max(
                                  0,
                                  entry.holofoilQuantity - 1
                                ),
                              })
                            }
                            className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center hover:bg-gray-700"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-medium">
                            {entry.holofoilQuantity}
                          </span>
                          <button
                            onClick={() =>
                              handleUpdate(entry.id, {
                                holofoilQuantity: entry.holofoilQuantity + 1,
                              })
                            }
                            disabled={!variants.includes("holofoil")}
                            className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleRemove(entry.id)}
                      className="text-red-400 hover:text-red-300 text-sm transition-colors"
                    >
                      Remove from collection
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {detailCard && (
        <CardDetail
          card={detailCard}
          onClose={handleCloseDetail}
          currentQuantity={entryByCardId.get(detailCard.id)}
        />
      )}

      {wipeConfirmOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Wipe entire collection?</h3>
            <p className="text-gray-400 text-sm mb-6">
              This will permanently delete all {entries.length} cards from your inventory. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setWipeConfirmOpen(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWipe}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-md text-sm font-medium transition-colors"
              >
                Wipe everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
