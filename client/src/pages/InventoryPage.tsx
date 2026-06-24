import { useState, useEffect, useCallback } from "react";
import { inventory as inventoryApi } from "../services/api";
import type { InventoryEntry, InventoryStats } from "../types";
import FilterBar from "../components/FilterBar";

export default function InventoryPage() {
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    data: { quantity?: number; foilQuantity?: number }
  ) => {
    try {
      await inventoryApi.update(id, data);
      await load();
    } catch (err) {
      console.error("Failed to update:", err);
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
        <h2 className="text-lg font-semibold mb-2">My Collection</h2>
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No cards in your inventory yet. Go scan some cards!
        </div>
      ) : (
        <div className="px-3 space-y-2 pb-4">
          {entries.map((entry) => {
            const card = entry.card;
            const isExpanded = expandedId === entry.id;

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
                      className="w-12 h-16 object-cover rounded"
                      loading="lazy"
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
                      {entry.quantity}x
                    </p>
                    {entry.foilQuantity > 0 && (
                      <p className="text-xs text-amber-400">
                        {entry.foilQuantity}x foil
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

                    <div className="flex items-center gap-3">
                      <div className="flex-1">
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
                            className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center hover:bg-gray-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="flex-1">
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
                            className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center hover:bg-gray-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
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
    </div>
  );
}
