import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { cards as cardsApi, inventory as inventoryApi, sync as syncApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { Card, InventoryEntry } from "../types";
import FilterBar from "../components/FilterBar";
import CardGrid from "../components/CardGrid";
import CardDetail from "../components/CardDetail";

function filtersFromParams(params: URLSearchParams): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const key of ["search", "color", "set", "rarity", "cardType", "ownership"]) {
    const val = params.get(key);
    if (val) filters[key] = val;
  }
  return filters;
}

export default function DatabasePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cardList, setCardList] = useState<Card[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>(() => filtersFromParams(searchParams));
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [inventoryMap, setInventoryMap] = useState<
    Map<string, { quantity: number; foilQuantity: number; entryId: string }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadInventory = useCallback(async () => {
    if (!user) return;
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
  }, [user]);

  const loadCards = useCallback(async (pageNum: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params: Record<string, string> = {
        ...filters,
        page: String(pageNum),
        limit: "40",
      };

      const res = await cardsApi.list(params);
      setCardList((prev) => append ? [...prev, ...res.cards] : res.cards);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      console.error("Failed to load cards:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    setPage(1);
    loadCards(1, false);
  }, [loadCards]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && page < totalPages) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadCards(nextPage, true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [page, totalPages, loading, loadingMore, loadCards]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await syncApi.refresh();
      setSyncMessage(res.message);
      setTimeout(() => setSyncMessage(""), 5000);
      setPage(1);
      loadCards(1, false);
    } catch (err) {
      setSyncMessage("Sync failed. Please try again.");
      setTimeout(() => setSyncMessage(""), 5000);
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }
  };

  const syncToUrl = useCallback((f: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(f)) {
      if (val) params.set(key, val);
    }
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const handleFilterChange = (newFilters: Record<string, string>) => {
    setFilters(newFilters);
    setPage(1);
    syncToUrl(newFilters);
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
          {user && (
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
          )}
        </div>
        {syncMessage && (
          <div className="mb-2 text-sm text-green-400 bg-green-400/10 px-3 py-1.5 rounded">
            {syncMessage}
          </div>
        )}
        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          showOwnership={!!user}
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading cards...</div>
      ) : (
        <>
          <CardGrid
            cards={cardList}
            onSelect={setSelectedCard}
            ownedCardIds={user ? ownedCardIds : undefined}
            ownedQuantities={user ? ownedQuantities : undefined}
          />

          <div ref={sentinelRef} className="h-1" />

          {loadingMore && (
            <div className="text-center text-gray-500 py-4">Loading more...</div>
          )}

          {page >= totalPages && cardList.length > 0 && (
            <div className="text-center text-gray-600 text-sm py-4">
              Showing all {cardList.length} cards
            </div>
          )}
        </>
      )}

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onAdd={user ? handleAdd : undefined}
          currentQuantity={
            user && inventoryMap.has(selectedCard.id)
              ? inventoryMap.get(selectedCard.id)
              : undefined
          }
        />
      )}
    </div>
  );
}
