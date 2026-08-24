import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicCollection as publicApi, cards as cardsApi } from "../services/api";
import type { Card, InventoryStats, User } from "../types";
import FilterBar from "../components/FilterBar";
import CardGrid from "../components/CardGrid";
import CardDetail from "../components/CardDetail";
import { type InventoryCounts } from "../utils/cardVariants";

interface PublicEntry {
  card: Card;
  quantity: number;
  foilQuantity: number;
  holofoilQuantity: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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

  const cardList = useMemo(() => entries.map((entry) => entry.card), [entries]);

  const ownedCardIds = useMemo(
    () => new Set(entries.map((entry) => entry.card.id)),
    [entries]
  );

  const ownedQuantities = useMemo(() => {
    const map = new Map<string, InventoryCounts>();
    for (const e of entries) {
      map.set(e.card.id, {
        quantity: e.quantity,
        foilQuantity: e.foilQuantity,
        holofoilQuantity: e.holofoilQuantity,
      });
    }
    return map;
  }, [entries]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-red-400 text-lg">Collection not found</p>
          <p className="text-gray-500 text-sm">
            This collection is private or doesn't exist.
          </p>
        </div>
      </div>
    );
  }

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
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold">
              {user?.username}&rsquo;s Collection
            </h2>
            <p className="text-xs text-gray-500">Shared read-only collection</p>
          </div>
        </div>
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {entries.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No cards in this collection yet.
        </div>
      ) : (
        <CardGrid
          cards={cardList}
          onSelect={handleSelectCard}
          ownedCardIds={ownedCardIds}
          ownedQuantities={ownedQuantities}
        />
      )}

      {detailCard && (
        <CardDetail
          card={detailCard}
          onClose={handleCloseDetail}
          currentQuantity={ownedQuantities.get(detailCard.id)}
        />
      )}
    </div>
  );
}
