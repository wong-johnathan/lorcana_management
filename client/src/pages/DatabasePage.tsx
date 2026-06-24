import { useState, useEffect, useCallback } from "react";
import { cards as cardsApi, inventory as inventoryApi, sync as syncApi } from "../services/api";
import type { Card, InventoryEntry } from "../types";
import FilterBar from "../components/FilterBar";
import CardGrid from "../components/CardGrid";
import CardDetail from "../components/CardDetail";

export default function DatabasePage() {
  const [cardList, setCardList] = useState<Card[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [inventoryMap, setInventoryMap] = useState<
    Map<string, { quantity: number; foilQuantity: number; entryId: string }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const loadInventory = useCallback(async () => {
    try {
      const entries: InventoryEntry[] = await inventoryApi.list();
      const map = new Map<
        string,
        { quantity: number; foilQuantity: number; entryId: string }
      >();
      for (const e of entries) {
        map.set(e.cardId, {
          quantity: e.quantity,
          foilQuantity: e.foilQuantity,
          entryId: e.id,
        });
      }
      setInventoryMap(map);
    } catch (err) {
      console.error("Failed to load inventory:", err);
    }
  }, []);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        ...filters,
        page: String(page),
        limit: "40",
      };
      delete params.ownership;

      const res = await cardsApi.list(params);
      let filtered = res.cards;

      if (filters.ownership === "owned") {
        filtered = filtered.filter((c) => inventoryMap.has(c.id));
      } else if (filters.ownership === "not_owned") {
        filtered = filtered.filter((c) => !inventoryMap.has(c.id));
      }

      setCardList(filtered);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      console.error("Failed to load cards:", err);
    } finally {
      setLoading(false);
    }
  }, [filters, page, inventoryMap]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await syncApi.refresh();
      setSyncMessage(res.message);
      setTimeout(() => setSyncMessage(""), 5000);
      setPage(1);
      await loadCards();
    } catch (err) {
      setSyncMessage("Sync failed. Please try again.");
      setTimeout(() => setSyncMessage(""), 5000);
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleFilterChange = (newFilters: Record<string, string>) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleAdd = async (
    cardId: string,
    quantity: number,
    foilQuantity: number
  ) => {
    try {
      await inventoryApi.add(cardId, quantity, foilQuantity);
      await loadInventory();
    } catch (err) {
      console.error("Failed to add:", err);
    }
  };

  const ownedCardIds = new Set(inventoryMap.keys());
  const ownedQuantities = new Map(
    Array.from(inventoryMap.entries()).map(([id, data]) => [
      id,
      { quantity: data.quantity, foilQuantity: data.foilQuantity },
    ])
  );

  return (
    <div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Card Database</h2>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm px-3 py-1.5 rounded-md transition-colors"
          >
            <svg
              className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {syncing ? "Syncing..." : "Sync Cards"}
          </button>
        </div>
        {syncMessage && (
          <div className="mb-2 text-sm text-green-400 bg-green-400/10 px-3 py-1.5 rounded">
            {syncMessage}
          </div>
        )}
        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          showOwnership
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading cards...</div>
      ) : (
        <>
          <CardGrid
            cards={cardList}
            onSelect={setSelectedCard}
            ownedCardIds={ownedCardIds}
            ownedQuantities={ownedQuantities}
          />

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 py-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-800 rounded disabled:opacity-50 text-sm"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-gray-800 rounded disabled:opacity-50 text-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onAdd={handleAdd}
          currentQuantity={
            inventoryMap.has(selectedCard.id)
              ? inventoryMap.get(selectedCard.id)
              : undefined
          }
        />
      )}
    </div>
  );
}
