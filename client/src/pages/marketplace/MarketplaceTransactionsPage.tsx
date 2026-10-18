import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import TransactionCard from "../../components/marketplace/TransactionCard";
import { marketplace } from "../../services/api";
import type { MarketplacePendingSaleItem } from "../../types";

/**
 * Transactions surface (REQ-15/16/17/18/19). The pending section is sourced
 * from `GET /marketplace/me/pending` (the seller's pending-sale breakdown,
 * AC-15.3); each pending sale renders a full `TransactionCard` (confirm /
 * cancel / adjust / review). The frozen §7 contract has no "my transactions"
 * list endpoint, so buyer-side pending (confirm) and completed/cancelled
 * transactions are not enumerable here — see the F2 discrepancy note.
 */
export default function MarketplaceTransactionsPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<MarketplacePendingSaleItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError(null);
    marketplace
      .getMyPending()
      .then((response) => {
        if (active) setPending(response.items);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load transactions");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, refreshKey]);

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-400">Trades</p>
          <h1 className="text-2xl font-bold text-gray-100">Transactions</h1>
          <p className="mt-1 text-sm text-gray-400">
            Pending sales await buyer confirmation; completed trades move the card.
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
            Loading transactions…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Pending sales
              </h2>
              {!pending || pending.length === 0 ? (
                <p className="mt-2 rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-500">
                  No pending sales.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {pending.map((item) => (
                    <TransactionCard
                      key={item.transactionId}
                      transactionId={item.transactionId}
                      currentUserId={user!.id}
                      onChanged={() => setRefreshKey((key) => key + 1)}
                    />
                  ))}
                </div>
              )}
            </section>

            <p className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 text-xs text-gray-500">
              Buyer-side pending confirmations and completed/cancelled trades are not yet
              listed here — the current API only exposes a seller's pending sales. You can
              also reach a transaction from its conversation.
            </p>
          </>
        )}
      </div>
    </RequireAuth>
  );
}
