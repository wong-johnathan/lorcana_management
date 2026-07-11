import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { cards as cardsApi, inventory as inventoryApi, sync as syncApi, analysis as analysisApi } from "../services/api";
import { formatTimeAgo } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import type { Card, InventoryEntry, SyncStatus } from "../types";
import FilterBar from "../components/FilterBar";
import CardGrid from "../components/CardGrid";
import CardDetail from "../components/CardDetail";

function filtersFromParams(params: URLSearchParams): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const key of ["search", "color", "set", "rarity", "type", "cardType", "ownership", "analyzed", "sort"]) {
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
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const [inventoryMap, setInventoryMap] = useState<
    Map<string, { quantity: number; foilQuantity: number; entryId: string }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cardSyncStatus, setCardSyncStatus] = useState<SyncStatus | null>(null);
  const [priceSyncStatus, setPriceSyncStatus] = useState<SyncStatus | null>(null);
  const cardSyncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceSyncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [batchStatus, setBatchStatus] = useState<{
    status: string; total: number; completed: number; failed: number; currentCard: string | null;
  } | null>(null);
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const cardId = searchParams.get("card");

  // Load card detail when card param changes
  useEffect(() => {
    if (cardId) {
      cardsApi.get(cardId).then(setDetailCard).catch(() => setDetailCard(null));
    } else {
      setDetailCard(null);
    }
  }, [cardId]);

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

  const pollCardSync = useCallback(() => {
    if (cardSyncPollRef.current) return;
    cardSyncPollRef.current = setInterval(async () => {
      try {
        const s = await syncApi.refreshStatus();
        setCardSyncStatus(s);
        if (s.status !== "running") {
          clearInterval(cardSyncPollRef.current!);
          cardSyncPollRef.current = null;
          if (s.status === "completed" || s.status === "error") {
            setPage(1);
            loadCards(1, false);
          }
        }
      } catch {
        clearInterval(cardSyncPollRef.current!);
        cardSyncPollRef.current = null;
      }
    }, 3000);
  }, [loadCards]);

  const pollPriceSync = useCallback(() => {
    if (priceSyncPollRef.current) return;
    priceSyncPollRef.current = setInterval(async () => {
      try {
        const s = await syncApi.pricesStatus();
        setPriceSyncStatus(s);
        if (s.status !== "running") {
          clearInterval(priceSyncPollRef.current!);
          priceSyncPollRef.current = null;
          if (s.status === "completed" || s.status === "error") {
            setPage(1);
            loadCards(1, false);
          }
        }
      } catch {
        clearInterval(priceSyncPollRef.current!);
        priceSyncPollRef.current = null;
      }
    }, 3000);
  }, [loadCards]);

  useEffect(() => {
    if (!user) return;
    syncApi.refreshStatus().then((s) => {
      setCardSyncStatus(s);
      if (s.status === "running") pollCardSync();
    }).catch(() => {});
    syncApi.pricesStatus().then((s) => {
      setPriceSyncStatus(s);
      if (s.status === "running") pollPriceSync();
    }).catch(() => {});
    return () => {
      if (cardSyncPollRef.current) clearInterval(cardSyncPollRef.current);
      if (priceSyncPollRef.current) clearInterval(priceSyncPollRef.current);
    };
  }, [user, pollCardSync, pollPriceSync]);

  const handleSync = async () => {
    try {
      const res = await syncApi.refresh();
      setCardSyncStatus({
        status: "running",
        total: res.total,
        completed: 0,
        failed: 0,
        currentItem: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
      pollCardSync();
    } catch (err) {
      console.error("Sync error:", err);
    }
  };

  const handleSyncPrices = async () => {
    try {
      const res = await syncApi.prices();
      setPriceSyncStatus({
        status: "running",
        total: res.total,
        completed: 0,
        failed: 0,
        currentItem: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
      pollPriceSync();
    } catch (err) {
      console.error("Price sync error:", err);
    }
  };

  const pollBatchStatus = useCallback(() => {
    if (batchPollRef.current) return;
    batchPollRef.current = setInterval(async () => {
      try {
        const s = await analysisApi.batchStatus();
        setBatchStatus(s);
        if (s.status !== "running") {
          clearInterval(batchPollRef.current!);
          batchPollRef.current = null;
        }
      } catch {
        clearInterval(batchPollRef.current!);
        batchPollRef.current = null;
      }
    }, 3000);
  }, []);

  useEffect(() => {
    if (user?.username === "jw1005") {
      analysisApi.batchStatus().then((s) => {
        setBatchStatus(s);
        if (s.status === "running") pollBatchStatus();
      }).catch(() => {});
    }
    return () => { if (batchPollRef.current) clearInterval(batchPollRef.current); };
  }, [user, pollBatchStatus]);

  const handleBatchAnalyze = async () => {
    try {
      const res = await analysisApi.batchAnalyze();
      setBatchStatus({ status: res.status, total: res.total, completed: 0, failed: 0, currentCard: null });
      pollBatchStatus();
    } catch (err) {
      console.error("Batch analyze error:", err);
    }
  };

  const syncToUrl = useCallback((f: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(f)) {
      if (val) params.set(key, val);
    }
    // Preserve card param
    const c = searchParams.get("card");
    if (c) params.set("card", c);
    setSearchParams(params, { replace: true });
  }, [setSearchParams, searchParams]);

  const handleFilterChange = (newFilters: Record<string, string>) => {
    setFilters(newFilters);
    setPage(1);
    syncToUrl(newFilters);
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
            <div className="flex items-center gap-2">
              {user.username === "jw1005" && (
                <button
                  onClick={handleBatchAnalyze}
                  disabled={batchStatus?.status === "running"}
                  className="flex items-center gap-1.5 bg-purple-900/50 hover:bg-purple-800/50 border border-purple-700/50 disabled:opacity-50 text-sm px-3 py-1.5 rounded-md transition-colors text-purple-300"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.591.659H9.061a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
                  </svg>
                  {batchStatus?.status === "running" ? "Analyzing..." : "Batch AI Analysis"}
                </button>
              )}
              <button
                onClick={handleSync}
                disabled={cardSyncStatus?.status === "running"}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm px-3 py-1.5 rounded-md transition-colors"
              >
                <svg
                  className={`w-4 h-4 ${cardSyncStatus?.status === "running" ? "animate-spin" : ""}`}
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
                {cardSyncStatus?.status === "running" ? "Syncing..." : "Sync Cards"}
              </button>
              <button
                onClick={handleSyncPrices}
                disabled={priceSyncStatus?.status === "running"}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm px-3 py-1.5 rounded-md transition-colors"
              >
                <svg
                  className={`w-4 h-4 ${priceSyncStatus?.status === "running" ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {priceSyncStatus?.status === "running" ? "Syncing..." : "Sync Prices"}
              </button>
            </div>
          )}
        </div>
        {cardSyncStatus?.status === "running" && (
          <div className="mb-1 text-xs text-gray-500 flex items-center gap-1.5">
            <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Cards syncing
            {cardSyncStatus.completedAt && <span>· last synced {formatTimeAgo(cardSyncStatus.completedAt)}</span>}
          </div>
        )}
        {priceSyncStatus?.status === "running" && (
          <div className="mb-1 text-xs text-gray-500 flex items-center gap-1.5">
            <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Prices syncing
            {priceSyncStatus.completedAt && <span>· last synced {formatTimeAgo(priceSyncStatus.completedAt)}</span>}
          </div>
        )}
        {batchStatus && batchStatus.status !== "idle" && user?.username === "jw1005" && (
          <div className="mb-2 text-sm bg-purple-900/20 border border-purple-700/30 px-3 py-2 rounded">
            <div className="flex items-center justify-between mb-1">
              <span className="text-purple-300 font-medium">
                {batchStatus.status === "running" ? "Batch Analysis Running" : batchStatus.status === "completed" ? "Batch Analysis Complete" : "Batch Analysis Error"}
              </span>
              <span className="text-gray-400">
                {batchStatus.completed + batchStatus.failed}/{batchStatus.total}
              </span>
            </div>
            {batchStatus.total > 0 && (
              <div className="w-full bg-gray-700 rounded-full h-2 mb-1">
                <div
                  className={`h-2 rounded-full transition-all ${batchStatus.status === "completed" ? "bg-green-500" : batchStatus.status === "error" ? "bg-red-500" : "bg-purple-500"}`}
                  style={{ width: `${((batchStatus.completed + batchStatus.failed) / batchStatus.total) * 100}%` }}
                />
              </div>
            )}
            {batchStatus.currentCard && (
              <div className="text-xs text-gray-400 truncate">Analyzing: {batchStatus.currentCard}</div>
            )}
            {batchStatus.failed > 0 && (
              <div className="text-xs text-red-400">{batchStatus.failed} failed</div>
            )}
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
            onSelect={handleSelectCard}
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

      {detailCard && (
        <CardDetail
          card={detailCard}
          onClose={handleCloseDetail}
          onAdd={user ? handleAdd : undefined}
          currentQuantity={
            user && inventoryMap.has(detailCard.id)
              ? inventoryMap.get(detailCard.id)
              : undefined
          }
        />
      )}
    </div>
  );
}
