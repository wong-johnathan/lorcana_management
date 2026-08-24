import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicCollection as publicApi, cards as cardsApi } from "../services/api";
import type { Card, InventoryStats, User } from "../types";
import FilterBar from "../components/FilterBar";
import CardDetail from "../components/CardDetail";
import {
  availableInventoryVariants,
  type InventoryCounts,
  totalInventoryCount,
} from "../utils/cardVariants";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cardId = searchParams.get("card");

  const entryByCardId = useMemo(() => {
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
        <div className="px-3 space-y-2 pb-4">
          {entries.map((entry) => {
            const card = entry.card;
            const isExpanded = expandedId === card.id;
            const variants = availableInventoryVariants(card);
            const showNormal = variants.includes("normal") || entry.quantity > 0;
            const showFoil = variants.includes("foil") || entry.foilQuantity > 0;
            const showHolofoil = variants.includes("holofoil") || entry.holofoilQuantity > 0;

            return (
              <div
                key={card.id}
                className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : card.id)}
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
                          <div className="bg-gray-800 rounded px-3 py-2 text-center font-medium">
                            {entry.quantity}
                          </div>
                        </div>
                      )}
                      {showFoil && (
                        <div className="flex-1 min-w-24">
                          <label className="text-xs text-gray-500">Foil</label>
                          <div className="bg-gray-800 rounded px-3 py-2 text-center font-medium text-amber-400">
                            {entry.foilQuantity}
                          </div>
                        </div>
                      )}
                      {showHolofoil && (
                        <div className="flex-1 min-w-24">
                          <label className="text-xs text-gray-500">Holofoil</label>
                          <div className="bg-gray-800 rounded px-3 py-2 text-center font-medium text-purple-300">
                            {entry.holofoilQuantity}
                          </div>
                        </div>
                      )}
                    </div>
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
    </div>
  );
}
