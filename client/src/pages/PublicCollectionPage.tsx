import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicCollection as publicApi, cards as cardsApi } from "../services/api";
import type { Card, InventoryStats, User } from "../types";
import CardDetail from "../components/CardDetail";
import InventoryTabs from "../components/inventory/InventoryTabs";
import CollectionStatsPanel from "../components/inventory/CollectionStatsPanel";
import InventoryCollectionView, {
  type InventoryCollectionCapabilities,
  type InventoryCollectionEntry,
} from "../components/inventory/InventoryCollectionView";
import { type InventoryCounts } from "../utils/cardVariants";
import { parseInventoryTab, type InventoryTab } from "../utils/inventoryTabs";

interface PublicEntry extends InventoryCollectionEntry {
  card: Card;
  quantity: number;
  foilQuantity: number;
  holofoilQuantity: number;
}

const publicCapabilities: InventoryCollectionCapabilities = {
  canEditQuantities: false,
  canRemoveCards: false,
  canWipeInventory: false,
  canExportCsv: false,
  canSwitchViewMode: false,
};

export default function PublicCollectionPage() {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cardId = searchParams.get("card");
  const activeTab = parseInventoryTab(searchParams.get("tab"));

  const ownedQuantities = new Map<string, InventoryCounts>(
    entries.map((entry) => [
      entry.card.id,
      {
        quantity: entry.quantity,
        foilQuantity: entry.foilQuantity,
        holofoilQuantity: entry.holofoilQuantity,
      },
    ])
  );

  useEffect(() => {
    if (cardId) {
      cardsApi.get(cardId).then(setDetailCard).catch(() => setDetailCard(null));
    } else {
      setDetailCard(null);
    }
  }, [cardId]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await publicApi.get(userId, filters);
      setUser(data.user);
      setEntries(data.cards);
      setStats(data.stats);
    } catch (err: any) {
      setError(err?.message || "Collection not found");
    } finally {
      setLoading(false);
    }
  }, [userId, filters]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-red-400 text-lg">Collection not found</p>
          <p className="text-gray-500 text-sm">
            This collection is private or doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

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
          title={`${user?.username ?? "Shared"}'s Collection`}
          subtitle="Shared read-only collection"
          entries={entries}
          filters={filters}
          onFiltersChange={setFilters}
          loading={loading}
          emptyMessage="No cards in this collection yet."
          viewMode="grid"
          capabilities={publicCapabilities}
          onSelectCard={handleSelectCard}
        />
      )}

      {activeTab === "collection" && detailCard && (
        <CardDetail
          card={detailCard}
          onClose={handleCloseDetail}
          currentQuantity={ownedQuantities.get(detailCard.id)}
        />
      )}
    </div>
  );
}
