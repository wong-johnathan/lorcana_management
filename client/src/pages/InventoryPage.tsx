import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { inventory as inventoryApi, cards as cardsApi } from "../services/api";
import type { Card, InventoryEntry, InventoryStats } from "../types";
import CardDetail from "../components/CardDetail";
import InventoryTabs from "../components/inventory/InventoryTabs";
import CollectionStatsPanel from "../components/inventory/CollectionStatsPanel";
import InventoryCollectionView, {
  type InventoryCollectionCapabilities,
  type InventoryViewMode,
} from "../components/inventory/InventoryCollectionView";
import {
  type InventoryCounts,
  type InventoryVariant,
  totalInventoryCount,
} from "../utils/cardVariants";
import { parseInventoryTab, type InventoryTab } from "../utils/inventoryTabs";

type EditableInventoryCounts = InventoryCounts & { entryId: string };

const inventoryCapabilities: InventoryCollectionCapabilities = {
  canEditQuantities: true,
  canRemoveCards: true,
  canWipeInventory: true,
  canExportCsv: true,
  canSwitchViewMode: true,
};

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
  const activeTab = parseInventoryTab(searchParams.get("tab"));

  useEffect(() => {
    if (cardId) {
      cardsApi.get(cardId).then(setDetailCard).catch(() => setDetailCard(null));
    } else {
      setDetailCard(null);
    }
  }, [cardId]);

  const entryByCardId = useMemo(() => {
    const map = new Map<string, EditableInventoryCounts>();
    for (const entry of entries) {
      map.set(entry.cardId, {
        quantity: entry.quantity,
        foilQuantity: entry.foilQuantity,
        holofoilQuantity: entry.holofoilQuantity,
        entryId: entry.id,
      });
    }
    return map;
  }, [entries]);

  useEffect(() => {
    localStorage.setItem("inventoryViewMode", viewMode);
  }, [viewMode]);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await inventoryApi.stats());
    } catch (err) {
      console.error("Failed to refresh inventory stats:", err);
    }
  }, []);

  const replaceEntry = useCallback((updatedEntry: InventoryEntry) => {
    setEntries((currentEntries) =>
      currentEntries.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
    );
  }, []);

  const removeEntryFromState = useCallback((id: string) => {
    setEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== id));
    setExpandedId((currentExpandedId) => (currentExpandedId === id ? null : currentExpandedId));
  }, []);

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
      const updatedEntry = await inventoryApi.update(id, data);
      replaceEntry(updatedEntry);
      void refreshStats();
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
        removeEntryFromState(entry.entryId);
      } else {
        const updatedEntry = await inventoryApi.update(entry.entryId, next);
        replaceEntry(updatedEntry);
      }
      void refreshStats();
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
      removeEntryFromState(id);
      void refreshStats();
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
      await inventoryApi.wipe();
      setWipeConfirmOpen(false);
      setEntries([]);
      setExpandedId(null);
      setStats((currentStats) =>
        currentStats
          ? {
              ...currentStats,
              totalUnique: 0,
              totalCards: 0,
              totalValue: 0,
              missingPriceCount: 0,
              setBreakdown: currentStats.setBreakdown.map((set) => ({ ...set, owned: 0 })),
            }
          : currentStats
      );
      void refreshStats();
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

  const handleTabChange = (tab: InventoryTab) => {
    if (tab === activeTab && !searchParams.has("tab")) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    setSearchParams(params);
  };

  return (
    <div>
      <InventoryTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === "stats" ? (
        stats ? (
          <CollectionStatsPanel stats={stats} />
        ) : (
          <div className="text-center text-gray-500 py-12">Loading...</div>
        )
      ) : (
        <InventoryCollectionView
          title="My Collection"
          entries={entries}
          filters={filters}
          onFiltersChange={setFilters}
          loading={loading}
          emptyMessage="No cards in your inventory yet. Add cards from the database."
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          capabilities={inventoryCapabilities}
          onSelectCard={handleSelectCard}
          onExportCsv={handleExport}
          onWipeInventory={() => setWipeConfirmOpen(true)}
          onQuantityChange={handleGridQuantityChange}
          updatingQuantityKeys={updatingQuantityKeys}
          expandedId={expandedId}
          onExpandedIdChange={setExpandedId}
          onUpdateEntry={handleUpdate}
          onRemoveEntry={handleRemove}
        />
      )}

      {activeTab === "collection" && detailCard && (
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
