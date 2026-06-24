import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { publicCollection as publicApi } from "../services/api";
import type { Card, InventoryStats, User } from "../types";
import FilterBar from "../components/FilterBar";
import CardDetail from "../components/CardDetail";

interface PublicEntry {
  card: Card;
  quantity: number;
  foilQuantity: number;
}

export default function PublicCollectionPage() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <h2 className="text-lg font-semibold mb-1">
          {user?.username}&rsquo;s Collection
        </h2>
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {entries.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No cards in this collection yet.
        </div>
      ) : (
        <div className="px-3 space-y-2 pb-4">
          {entries.map((entry, i) => {
            const card = entry.card;
            return (
              <div
                key={`${card.id}-${i}`}
                className="bg-gray-900 rounded-lg border border-gray-800 p-3 flex items-center gap-3"
              >
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="w-12 h-16 object-cover rounded cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all flex-shrink-0"
                    loading="lazy"
                    onClick={() => setSelectedCard(card)}
                  />
                ) : (
                  <div className="w-12 h-16 bg-gray-800 rounded flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
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
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium">{entry.quantity}x</p>
                  {entry.foilQuantity > 0 && (
                    <p className="text-xs text-amber-400">
                      {entry.foilQuantity}x foil
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          currentQuantity={undefined}
        />
      )}
    </div>
  );
}
